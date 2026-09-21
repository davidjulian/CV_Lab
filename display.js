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
  const api={aorticTrace};
  if(typeof module!=='undefined') module.exports=api;
  root.CardioDisplay=api;
})(globalThis);
