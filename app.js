(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const normal = CardioModel.simulate();
  const normalAorticTrace = CardioDisplay.aorticTrace(normal);
  let params = { ...CardioModel.defaults }, result = normal, position = 0, playing = true, last = 0, timer;
  const groups = [
    ['Heart & filling', [
      ['hr', 'Heart rate', 40, 140, 1, 'bpm', 'Controls cycle duration'],
      ['contractility', 'Contractility', .6, 4, .1, 'mmHg/mL', 'Peak active elastance'],
      ['preload', 'Filling pressure', 6, 20, .5, 'mmHg', 'Pulmonary venous reservoir'],
      ['stiffness', 'Diastolic stiffness', .5, 2, .1, '×', 'Passive ventricular stiffness']]],
    ['Arterial load', [
      ['resistance', 'Peripheral resistance', .5, 2.2, .05, 'mmHg·s/mL', 'Resistance to systemic runoff'],
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
  for (const id of ['volume-labels', 'pv-relations']) {
    $(id).addEventListener('click', () => {
      $(id).setAttribute('aria-pressed', String($(id).getAttribute('aria-pressed') !== 'true'));
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
    const labels = $('volume-labels').getAttribute('aria-pressed') === 'true';
    const relations = $('pv-relations').getAttribute('aria-pressed') === 'true';
    $('volume-labels').textContent = `${labels ? 'Hide' : 'Show'} EDV · ESV · SV · EF`;
    $('pv-relations').textContent = `${relations ? 'Hide' : 'Show'} P–V Curves`;
    const refs = CardioModel.relationships(result);
    const annotation = (x,y,t,anchor='start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="annotation">${t}</text>`;
    const arrows = id => `<defs><marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 10 5 L 0 0 L 0 10 Z" fill="#345e65"/></marker></defs>`;
    const doubleArrow = (x1,y1,x2,y2,id) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="measure" marker-start="url(#${id})" marker-end="url(#${id})"/>`;
    const svText = `SV = EDV − ESV = ${m.edv.toFixed(1)} − ${m.esv.toFixed(1)} = ${m.sv.toFixed(1)} mL`;
    const efText = `EF = SV / EDV × 100 = ${m.ef.toFixed(1)}%`;
    $('pv').setAttribute('viewBox', `0 0 500 ${labels ? 505 : 400}`);
    $('wiggers').setAttribute('viewBox', `0 0 600 ${labels ? 550 : 480}`);
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
    const tx = f => 58 + f * 522; timeX = tx;
    const yp = p => 222 - p/pmax*184, yv = v => 358-v/vmax*98;
    let w = arrows('w-arrow') + text(58,19,'Pressure (mmHg)');
    for(let i=0;i<=4;i++){const p=i*pmax/4;w+=line(58,yp(p),580,yp(p))+text(48,yp(p)+4,Math.round(p),'end');}
    for(let i=0;i<=2;i++){const v=i*vmax/2;w+=line(58,yv(v),580,yv(v))+text(48,yv(v)+4,Math.round(v),'end');}
    for(let i=0;i<=4;i++){const x=tx(i/4);w+=line(x,35,x,435)+text(x,457,Math.round(i/4*result.T*1000),'middle');}
    w += text(58,247,'Ventricular volume (mL)') + text(58,386,'ECG · schematic') + text(319,478,'Time (ms)','middle');
    if(overlay){for(const k of ['plv','pa','pla'])w+=path(normal.samples,d=>tx(d.t/normal.T),d=>yp(k==='pa'?normalAorticTrace(d):d[k]),'base');w+=path(normal.samples,d=>tx(d.t/normal.T),d=>yv(d.v),'base');}
    for(const k of ['plv','pa','pla']) w+=path(s,d=>tx(d.t/result.T),d=>yp(k==='pa'?aorticTrace(d):d[k]),'trace',colors[k]);
    w+=path(s,d=>tx(d.t/result.T),d=>yv(d.v),'trace',colors.v);
    const gauss=(x,mu,sd)=>Math.exp(-.5*((x-mu)/sd)**2);
    w+=path(s,d=>tx(d.t/result.T),d=>{const f=d.t/result.T;return 424-18*(.22*gauss(f,.025,.015)-.17*gauss(f,.091,.004)+1.1*gauss(f,.104,.004)-.3*gauss(f,.117,.005)+.38*gauss(f,.39,.045));},'trace',colors.ecg);
    w+='<line id="w-cursor" y1="30" y2="438" class="cursor"/>';
    if(labels) {
      const ed = s.reduce((a,b)=>b.v>a.v?b:a), es=s.reduce((a,b)=>b.v<a.v?b:a);
      for(const [point,label] of [[ed,'EDV'],[es,'ESV']]) {
        const y=yv(point.v);
        w+=line(58,y,570,y,'measure-guide') + `<circle cx="${tx(point.t/result.T)}" cy="${y}" r="4" fill="#427d9b"/>`;
        w+=annotation(568,y-6,`${label} ${point.v.toFixed(1)} mL`,'end');
      }
      w+=doubleArrow(578,yv(m.edv),578,yv(m.esv),'w-arrow');
      w+=annotation(319,510,svText,'middle')+annotation(319,535,efText,'middle');
    }
    $('wiggers').innerHTML=w; cursor();
  }
  function cursor() {
    const s=result.samples[Math.min(result.samples.length-1,Math.round(position*(result.samples.length-1)))];
    $('time').value = Math.round(position*1000); $('time-label').textContent = `${Math.round(s.t*1000)} ms`;
    $('pv-dot').setAttribute('cx',pvX(s.v));$('pv-dot').setAttribute('cy',pvY(s.plv));
    $('w-cursor').setAttribute('x1',timeX(position));$('w-cursor').setAttribute('x2',timeX(position));
    const mitral = s.pla>s.plv, aortic=s.plv>s.pa;
    let phase=aortic?'Ventricular ejection':mitral?(s.t/result.T<.14?'Atrial contraction & filling':'Ventricular filling'):(s.activation>.4?'Isovolumetric contraction':'Isovolumetric relaxation');
    if(!mitral&&!aortic){const rising=s.t < .12*result.T+.17*(result.T/(60/72))**.3;phase=rising?'Isovolumetric contraction':'Isovolumetric relaxation';if(params.mitralLeak||params.aorticLeak)phase=rising?'Contraction with valve leakage':'Relaxation with valve leakage';}
    $('phase').textContent=phase;
    const aorticState = aortic ? 'forward flow' : result.p.aorticLeak ? 'reverse leakage' : 'closed';
    $('instant').innerHTML=`LV <b>${s.plv.toFixed(1)} mmHg</b> · Volume <b>${s.v.toFixed(1)} mL</b><br>Mitral: ${mitral?'forward flow':params.mitralLeak?'reverse leakage':'closed'} · Aortic: ${aorticState}<br>EDV ${result.metrics.edv.toFixed(0)} mL · ESV ${result.metrics.esv.toFixed(0)} mL · Stroke work ${result.metrics.work.toFixed(2)} J`;
  }
  function animate(now){if(last && playing){position=(position+Math.min(now-last,100)/1000/result.T*.5)%1;cursor();}last=now;requestAnimationFrame(animate);}
  sync();recalculate();requestAnimationFrame(animate);
})();
