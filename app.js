(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const aboutDialog = $('about-dialog');
  $('about-open').addEventListener('click', () => aboutDialog.showModal());
  const normal = CardioModel.simulate();
  const normalAorticTrace = CardioDisplay.aorticTrace(normal);
  let params = { ...CardioModel.defaults }, result = normal, position = 0, playing = true, last = 0, timer;
  const groups = [
    ['Heart & filling', [
      ['hr', 'Heart rate', 40, 140, 1, 'bpm', 'Controls cycle duration'],
      ['contractility', 'Contractility', .6, 4, .1, 'mmHg/mL', 'Peak active elastance'],
      ['relaxation', 'Ventricular relaxation (τ)', 10, 60, 1, 'ms', 'Higher τ = slower active relaxation'],
      ['preload', 'Filling pressure', 6, 20, .5, 'mmHg', 'Pulmonary venous reservoir'],
      ['stiffness', 'Diastolic stiffness', .5, 2, .1, '×', 'Passive ventricular stiffness']]],
    ['Arterial load', [
      ['resistance', 'Systemic resistance', .5, 2.2, .05, 'mmHg·s/mL', 'Changes peripheral runoff with a fixed proximal impedance'],
      ['compliance', 'Arterial compliance', .5, 3, .1, 'mL/mmHg', 'Lower compliance = stiffer arteries']]],
    ['Valve conductance', [
      ['mitral', 'Mitral forward', 5, 150, 5, 'mL/s/mmHg', 'Lower conductance = greater obstruction'],
      ['aortic', 'Aortic forward', 5, 150, 5, 'mL/s/mmHg', 'Lower conductance = greater obstruction'],
      ['mitralLeak', 'Mitral leakage', 0, 3, .1, 'mL/s/mmHg', 'Reverse conductance; 0 = competent'],
      ['aorticLeak', 'Aortic leakage', 0, 3, .1, 'mL/s/mmHg', 'Reverse conductance; 0 = competent']]]
  ];
  const configs = groups.flatMap(g => g[1]);
  $('controls').innerHTML = groups.map(([title, rows]) => `<div class="control-group"><div class="group-title">${title}</div>${rows.map(([id, label, min, max, step, unit, hint]) => `<div class="control"><label for="${id}">${label}<output id="${id}-out"></output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${params[id]}" aria-describedby="${id}-hint"><small id="${id}-hint">${hint} · ${unit}</small></div>`).join('')}</div>`).join('');
  function sync() { configs.forEach(([id]) => { $(id).value = params[id]; $(id + '-out').textContent = Number(params[id].toFixed(2)); }); }
  const presets = { normal: {}, exercise: CardioModel.exercisePreset, weak: { contractility: .9 }, stiff: { compliance: .6 }, as: { aortic: 5 }, ar: { aorticLeak: 1.2 }, ms: { mitral: 5 }, mr: { mitralLeak: 1.2 } };
  function recalculate() {
    try {
      result = CardioModel.simulate(params); render();
      $('status').textContent = result.residual < .0001 ? 'Settled repeating beat · playback at half speed' : 'This setting has not fully settled. Interpret this beat with caution.';
    } catch (e) { $('status').textContent = e.message; }
  }
  configs.forEach(([id]) => $(id).addEventListener('input', () => {
    params[id] = Number($(id).value); sync(); $('preset').value = 'custom';
    clearTimeout(timer); timer = setTimeout(recalculate, 80);
  }));
  $('preset').addEventListener('change', () => { clearTimeout(timer); params = { ...CardioModel.defaults, ...presets[$('preset').value] }; sync(); recalculate(); });
  $('reset').addEventListener('click', () => { clearTimeout(timer); params = { ...CardioModel.defaults }; $('preset').value = 'normal'; $('baseline').checked = true; position = 0; sync(); recalculate(); });
  $('baseline').addEventListener('change', render);
  const flowPlots = [
    { id: 'mitral-flow', key: 'qm', label: 'Mitral Flow', title: 'Mitral flow (mL/s) · positive into LV', color: '#4453a0' },
    { id: 'aortic-flow', key: 'qa', label: 'Aortic Flow', title: 'Aortic flow (mL/s) · positive into aorta', color: '#cc7750' }
  ];
  const isShown = id => $(id).getAttribute('aria-pressed') === 'true';
  for (const id of ['volume-labels', 'pv-relations', ...flowPlots.map(plot => plot.id)]) {
    $(id).addEventListener('click', () => {
      $(id).setAttribute('aria-pressed', String(!isShown(id)));
      render();
    });
  }
  function setPlaying(value) { playing = value; $('play').textContent = playing ? 'Pause' : 'Play'; }
  $('play').addEventListener('click', () => setPlaying(!playing));
  $('time').addEventListener('input', () => { setPlaying(false); position = Number($('time').value) / 1000; cursor(); });
  $('wiggers').addEventListener('pointerdown', event => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform($('wiggers').getScreenCTM().inverse());
    position = Math.max(0, Math.min(1, (point.x - 58) / 522)); setPlaying(false); cursor();
  });
  const colors = { plv: '#177f77', pa: '#cc7750', pla: '#8b70ad', v: '#427d9b', ecg: '#6e8790' };
  const line = (x1,y1,x2,y2,cls='grid') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  const text = (x,y,t,anchor='start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="axis">${t}</text>`;
  const path = (samples, x, y, cls, color) => `<path class="${cls}" ${color ? `stroke="${color}"` : ''} d="${samples.map((s,i) => `${i ? 'L' : 'M'}${x(s).toFixed(2)},${y(s).toFixed(2)}`).join(' ')}"/>`;
  const nice = (value, step) => Math.ceil(value / step) * step;
  let pvX, pvY, timeX;
  function render() {
    const m = result.metrics;
    $('exercise-note').hidden = $('preset').value !== 'exercise';
    const aorticTrace = CardioDisplay.aorticTrace(result);
    const labels = isShown('volume-labels');
    const relations = isShown('pv-relations');
    const visibleFlows = flowPlots.filter(({ id }) => isShown(id));
    const flowRowHeight = 120;
    const flowHeight = visibleFlows.length * flowRowHeight;
    $('volume-labels').textContent = `${labels ? 'Hide' : 'Show'} EDV · ESV · SV · EF`;
    $('pv-relations').textContent = `${relations ? 'Hide' : 'Show'} P–V Curves`;
    for (const { id, label } of flowPlots) {
      $(id).textContent = `${isShown(id) ? 'Hide' : 'Show'} ${label}`;
    }
    const refs = CardioModel.relationships(result);
    const annotation = (x,y,t,anchor='start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="annotation">${t}</text>`;
    const arrows = id => `<defs><marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 10 5 L 0 0 L 0 10 Z" fill="#345e65"/></marker></defs>`;
    const doubleArrow = (x1,y1,x2,y2,id) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="measure" marker-start="url(#${id})" marker-end="url(#${id})"/>`;
    const svText = `SV = EDV − ESV = ${m.edv.toFixed(1)} − ${m.esv.toFixed(1)} = ${m.sv.toFixed(1)} mL`;
    const efText = `EF = SV / EDV × 100 = ${m.ef.toFixed(1)}%`;
    $('pv').setAttribute('viewBox', `0 0 500 ${labels ? 505 : 400}`);
    $('wiggers').setAttribute('viewBox', `0 0 600 ${(labels ? 550 : 480) + flowHeight}`);
    const wiggers = $('wiggers');
    const traceNames = ['pressure', 'ventricular volume', 'schematic ECG', ...visibleFlows.map(({ label }) => label.toLowerCase())];
    wiggers.setAttribute('aria-label', `Synchronized ${traceNames.join(', ')} over one cardiac cycle`);
    wiggers.classList.toggle('has-valve-flow', visibleFlows.length > 0);
    $('relation-key').hidden = !relations;
    $('relation-values').textContent = `Ea = ${refs.ea === null ? 'unavailable (no forward ejection)' : refs.ea.toFixed(2) + ' mmHg/mL'}. ESPVR shows the model’s peak activation envelope, including passive pressure; EDPVR shows passive pressure alone. Ea joins (EDV, 0) to the end of forward aortic ejection. With valve leakage, that volume may differ from minimum volume (ESV), so Ea is an illustrative load estimate.`;
    $('metrics').innerHTML = [['Stroke volume', m.sv.toFixed(0), 'mL'], ['Ejection fraction', m.ef.toFixed(0), '%'], ['Cardiac output', m.co.toFixed(1), 'L/min'], ['Aortic pressure', `${m.systolic.toFixed(0)}/${m.diastolic.toFixed(0)}`, 'mmHg']].map(([label,value,unit]) => `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`).join('');
    const overlay = $('baseline').checked, s = result.samples, all = overlay ? s.concat(normal.samples) : s;
    const pmax = nice(Math.max(140, ...all.map(d => Math.max(d.plv,d.pa,d.pla))) * 1.06, 20);
    const vmax = nice(Math.max(150, ...all.map(d => d.v)) * 1.08, 25);
    pvX = v => 60 + v / vmax * 415; pvY = p => 344 - p / pmax * 310;
    let pv = arrows('pv-arrow') + '<defs><clipPath id="pv-clip"><rect x="60" y="34" width="415" height="310"/></clipPath></defs>';
    for (let i=0;i<=5;i++) { const p=i*pmax/5,v=i*vmax/5; pv += line(60,pvY(p),475,pvY(p)) + text(49,pvY(p)+4,Math.round(p),'end') + line(pvX(v),34,pvX(v),344) + text(pvX(v),365,Math.round(v),'middle'); }
    pv += text(60,18,'Pressure (mmHg)') + text(270,393,'Ventricular volume (mL)','middle');
    if (overlay) pv += path(normal.samples,d=>pvX(d.v),d=>pvY(d.plv),'base');
    if (relations) {
      const volumes = Array.from({length:301},(_,i)=>10+(vmax-10)*i/300);
      pv += '<g clip-path="url(#pv-clip)">';
      pv += path(volumes,v=>pvX(v),v=>pvY(refs.systolic(v)),'reference espvr','#9965ac');
      pv += path(volumes,v=>pvX(v),v=>pvY(refs.passive(v)),'reference edpvr','#b48420');
      if(refs.ea !== null) pv += path([{v:m.edv,p:0},refs.end],d=>pvX(d.v),d=>pvY(d.p),'reference ea','#477ac1');
      pv += '</g>';
    }
    pv += path(s,d=>pvX(d.v),d=>pvY(d.plv),'trace',colors.plv) + '<circle id="pv-dot" r="6" class="dot"/>';
    if(labels) {
      pv += line(pvX(m.esv),34,pvX(m.esv),434,'measure-guide') + line(pvX(m.edv),34,pvX(m.edv),434,'measure-guide');
      pv += annotation(Math.max(90,pvX(m.esv)-4),418,`ESV ${m.esv.toFixed(1)} mL`,'end') + annotation(Math.min(415,pvX(m.edv)+4),418,`EDV ${m.edv.toFixed(1)} mL`);
      pv += doubleArrow(pvX(m.esv),439,pvX(m.edv),439,'pv-arrow');
      pv += annotation(267,466,svText,'middle') + annotation(267,490,efText,'middle');
    }
    $('pv').innerHTML = pv;
    const tx = seconds => 58 + seconds / result.T * 522;
    timeX = tx;
    const yp = p => 222 - p/pmax*184, yv = v => 358-v/vmax*98;
    const baselinePath = y => `<g clip-path="url(#w-time-window)">${path(normal.samples,d=>tx(d.t),y,'base')}</g>`;
    let w = arrows('w-arrow') + `<defs><clipPath id="w-time-window"><rect x="58" y="30" width="522" height="${408 + flowHeight}"/></clipPath></defs>` + text(58,19,'Pressure (mmHg)');
    for(let i=0;i<=4;i++){const p=i*pmax/4;w+=line(58,yp(p),580,yp(p))+text(48,yp(p)+4,Math.round(p),'end');}
    for(let i=0;i<=2;i++){const v=i*vmax/2;w+=line(58,yv(v),580,yv(v))+text(48,yv(v)+4,Math.round(v),'end');}
    for(let i=0;i<=4;i++){const t=i/4*result.T,x=tx(t);w+=line(x,35,x,435+flowHeight)+text(x,457+flowHeight,Math.round(t*1000),'middle');}
    w += text(58,247,'Ventricular volume (mL)') + text(58,386,'ECG · schematic') + text(319,478+flowHeight,'Time (ms)','middle');
    if (overlay) {
      for (const k of ['plv','pa','pla']) w += baselinePath(d=>yp(k==='pa'?normalAorticTrace(d):d[k]));
      w += baselinePath(d=>yv(d.v));
    }
    for(const k of ['plv','pa','pla']) w+=path(s,d=>tx(d.t),d=>yp(k==='pa'?aorticTrace(d):d[k]),'trace',colors[k]);
    w+=path(s,d=>tx(d.t),d=>yv(d.v),'trace',colors.v);
    const gauss=(x,mu,sd)=>Math.exp(-.5*((x-mu)/sd)**2);
    w+=path(s,d=>tx(d.t),d=>{const f=d.t/result.T;return 424-18*(.22*gauss(f,.025,.015)-.17*gauss(f,.091,.004)+1.1*gauss(f,.104,.004)-.3*gauss(f,.117,.005)+.38*gauss(f,.39,.045));},'trace',colors.ecg);
    visibleFlows.forEach(({ key, title, color }, index) => {
      const top = 456 + index * flowRowHeight;
      const flows = all.map(sample => sample[key]);
      const tick = nice(Math.max(100, ...flows.map(Math.abs)) / 4, 25);
      const maxFlow = nice(Math.max(tick, ...flows), tick);
      const minFlow = -nice(Math.max(0, -Math.min(...flows)), tick);
      const flowY = value => top + 99 - 87 * (value - minFlow) / (maxFlow - minFlow);
      w += text(58,top,title);
      for (let value = minFlow; value <= maxFlow; value += tick) {
        const y = flowY(value);
        w += line(58,y,580,y,value === 0 ? 'measure-guide' : 'grid') + text(48,y+4,value || 0,'end');
      }
      if (overlay) w += baselinePath(d=>flowY(d[key]));
      w += path(s,d=>tx(d.t),d=>flowY(d[key]),'trace',color);
    });
    w += `<line id="w-cursor" y1="30" y2="${438+flowHeight}" class="cursor"/>`;
    if(labels) {
      const ed = s.reduce((a,b)=>b.v>a.v?b:a), es=s.reduce((a,b)=>b.v<a.v?b:a);
      for(const [point,label] of [[ed,'EDV'],[es,'ESV']]) {
        const y=yv(point.v);
        w+=line(58,y,570,y,'measure-guide') + `<circle cx="${tx(point.t)}" cy="${y}" r="4" fill="#427d9b"/>`;
        w+=annotation(568,y-6,`${label} ${point.v.toFixed(1)} mL`,'end');
      }
      w+=doubleArrow(578,yv(m.edv),578,yv(m.esv),'w-arrow');
      w+=annotation(319,510+flowHeight,svText,'middle')+annotation(319,535+flowHeight,efText,'middle');
    }
    wiggers.innerHTML=w; cursor();
  }
  function sampleAtTime(samples, time) {
    let lo = 0, hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (samples[mid].t <= time) lo = mid;
      else hi = mid;
    }
    const a = samples[lo], b = samples[hi];
    const fraction = (time - a.t) / (b.t - a.t);
    const interpolate = key => a[key] + (b[key] - a[key]) * fraction;
    return { plv: interpolate('plv'), pla: interpolate('pla'), pa: interpolate('pa'),
      v: interpolate('v'), qm: interpolate('qm'), qa: interpolate('qa') };
  }
  function cursor() {
    const time = position * result.T;
    const timeLabel = `${Math.round(time * 1000)} ms`;
    const s = sampleAtTime(result.samples, time);
    $('time').value = Math.round(position*1000);
    $('time-label').textContent = timeLabel;
    $('pv-dot').setAttribute('cx',pvX(s.v));$('pv-dot').setAttribute('cy',pvY(s.plv));
    $('w-cursor').setAttribute('x1',timeX(time));$('w-cursor').setAttribute('x2',timeX(time));
    const mitral = s.pla>s.plv, aortic=s.plv>s.pa;
    let phase;
    if (aortic) phase = 'Ventricular ejection';
    else if (mitral) phase = position < .14 ? 'Atrial contraction & filling' : 'Ventricular filling';
    else {
      const rising = time < CardioModel.ventricularPeakTime(result.T);
      if (result.p.mitralLeak || result.p.aorticLeak) phase = rising ? 'Contraction with valve leakage' : 'Relaxation with valve leakage';
      else phase = rising ? 'Isovolumetric contraction' : 'Isovolumetric relaxation';
    }
    $('phase').textContent=phase;
    const aorticState = aortic ? 'forward flow' : result.p.aorticLeak ? 'reverse leakage' : 'closed';
    const mitralState = mitral ? 'forward flow' : result.p.mitralLeak ? 'reverse leakage' : 'closed';
    const flowValue = (id, value) => isShown(id) ? ` (${value.toFixed(1)} mL/s)` : '';
    $('instant').innerHTML=`Time <b>${timeLabel}</b> · LV <b>${s.plv.toFixed(1)} mmHg</b> · Volume <b>${s.v.toFixed(1)} mL</b><br>Mitral: ${mitralState}${flowValue('mitral-flow', s.qm)} · Aortic: ${aorticState}${flowValue('aortic-flow', s.qa)}<br>EDV ${result.metrics.edv.toFixed(0)} mL · ESV ${result.metrics.esv.toFixed(0)} mL · Stroke work ${result.metrics.work.toFixed(2)} J`;
  }
  function animate(now){if(last && playing){position=(position+Math.min(now-last,100)/1000/result.T*.5)%1;cursor();}last=now;requestAnimationFrame(animate);}
  sync();recalculate();requestAnimationFrame(animate);
})();
