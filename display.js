(function (root) {
  'use strict';
  // Presentation only: never mutate simulation samples or feed this into the solver.
  function aorticTrace(result) {
    const { samples, metrics, p, T } = result;
    let closure = null;
    for (let i=1;i<samples.length;i++) {
      const a=samples[i-1], b=samples[i];
      if(a.qa>0 && b.qa<=0) {
        const da=a.plv-a.pa, db=b.plv-b.pa;
        closure=a.t+(b.t-a.t)*da/(da-db);
      }
    }
    const duration=Math.min(.032,.06*T);
    // Illustrative attenuation with leakage, not a quantitative disease prediction.
    const amplitude=Math.min(3,.08*(metrics.systolic-metrics.diastolic))*Math.exp(-p.aorticLeak/.5);
    return sample => {
      if(closure===null) return sample.pa;
      const elapsed=sample.t-closure;
      if(elapsed<=0 || elapsed>=duration) return sample.pa;
      return sample.pa-amplitude*Math.sin(Math.PI*elapsed/duration)**2;
    };
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
    return { t: time, plv: interpolate('plv'), pla: interpolate('pla'), pa: interpolate('pa'),
      v: interpolate('v'), qm: interpolate('qm'), qa: interpolate('qa') };
  }

  const aorticGradient = sample => sample.plv - sample.pa;
  const mitralGradient = sample => sample.pla - sample.plv;

  function cardiacPhases(result) {
    const { samples, p, T } = result;
    const atrialEnd = .14 * T;
    const peak = samples.reduce((highest, sample) => sample.plv > highest.plv ? sample : highest);
    const times = new Set([0, atrialEnd, peak.t, T]);
    const gradients = [];
    if (p.aortic > 0 || p.aorticLeak > 0) gradients.push(aorticGradient);
    if (p.mitral > 0) gradients.push(mitralGradient);
    // Forward valve events occur at zero pressure gradient, including with leakage.
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      for (const gradient of gradients) {
        const from = gradient(a), to = gradient(b);
        if ((from > 0) !== (to > 0)) times.add(a.t + (b.t - a.t) * from / (from - to));
      }
    }
    const boundaries = [...times].filter(time => time >= 0 && time <= T).sort((a, b) => a - b);
    const intervals = boundaries.slice(1).map((end, index) => {
      const start = boundaries[index];
      const sample = sampleAtTime(samples, (start + end) / 2);
      return { start, end, ejection: p.aortic > 0 && aorticGradient(sample) > 0,
        mitralFilling: p.mitral > 0 && mitralGradient(sample) > 0,
        aorticLeakage: p.aorticLeak > 0 && aorticGradient(sample) < 0 };
    });
    const systolicEnd = intervals.findLast(interval => interval.ejection)?.end ?? peak.t;
    const diastolicFilling = intervals.find(interval => interval.start >= systolicEnd && interval.mitralFilling)?.start ?? T;
    const firstMitralFilling = intervals.find(interval => interval.mitralFilling)?.start ?? T;
    // Regurgitant aortic inflow can sustain filling past earlier mitral opening and across the beat boundary.
    const fillingAtStart = diastolicFilling < T && firstMitralFilling < atrialEnd ? firstMitralFilling : 0;
    const phases = [];
    for (const { start, end, ejection, mitralFilling, aorticLeakage } of intervals) {
      let phase;
      if (ejection) phase = 'ejection';
      else if (mitralFilling) phase = p.atrialContractility > 0 && start < atrialEnd ? 'atrial' : 'filling';
      else if (aorticLeakage && (start >= diastolicFilling || end <= fillingAtStart)) phase = 'filling';
      else phase = start < systolicEnd ? 'contraction' : 'relaxation';
      const previous = phases.at(-1);
      if (previous?.phase === phase) previous.end = end;
      else phases.push({ phase, start, end });
    }
    return phases;
  }

  const api={aorticTrace,sampleAtTime,cardiacPhases};
  if(typeof module!=='undefined') module.exports=api;
  root.CardioDisplay=api;
})(globalThis);
