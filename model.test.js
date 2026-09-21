const assert = require('node:assert/strict');
const { simulate, defaults, derivative, observe } = require('./model.js');
const base = simulate();
assert(base.metrics.systolic > 115 && base.metrics.systolic < 125);
assert(Math.max(...base.samples.map(s=>s.plv)) < 130, 'Preserve smooth baseline systolic contour without excessive proximal overshoot');
assert(base.metrics.diastolic > 70 && base.metrics.diastolic < 90);
assert(base.metrics.co > 4.5 && base.metrics.co < 6);
assert(base.metrics.ef > 55 && base.metrics.ef < 70);
assert(Math.abs(base.metrics.net - base.metrics.sv) < .02);
assert.equal(base.metrics.reverse, 0);
assert(simulate({contractility: .9}).metrics.ef < base.metrics.ef);
assert(simulate({contractility: 4}).metrics.esv < base.metrics.esv);
assert(simulate({preload: 18}).metrics.sv > base.metrics.sv);
assert(simulate({resistance: 2}).metrics.esv > base.metrics.esv);
const stiff = simulate({compliance: .6});
assert(stiff.metrics.systolic-stiff.metrics.diastolic > base.metrics.systolic-base.metrics.diastolic);
assert(simulate({mitral:5}).metrics.sv < base.metrics.sv);
const stenosis = simulate({aortic:5});
assert(Math.max(...stenosis.samples.map(s=>s.plv-s.pa)) > Math.max(...base.samples.map(s=>s.plv-s.pa)));
const leak = simulate({aorticLeak:1.2});
assert(leak.metrics.reverse > 0);
assert(leak.metrics.net < leak.metrics.sv);
for(const s of leak.samples){
  const y=[s.v,s.va,s.pa], dy=derivative(s.t,y,leak.p), o=observe(s.t,y,leak.p);
  assert(Math.abs(dy[0]+dy[1]+leak.p.compliance*dy[2]-(o.qin-o.qout)) < 1e-8, 'Volume conservation including external reservoirs');
}
const ranges={hr:[40,140],contractility:[.6,4],preload:[6,20],resistance:[.5,2.2],compliance:[.5,3],mitral:[5,150],aortic:[5,150],mitralLeak:[0,3],aorticLeak:[0,3],stiffness:[.5,2]};
let checked=0;
function check(p){const r=simulate(p);assert(r.residual<.0001,'Periodic convergence');for(const s of r.samples){assert(Object.values(s).every(Number.isFinite));assert(s.v>0&&s.va>0,'Positive chamber volumes');}checked++;return r;}
for(const [key,values] of Object.entries(ranges))for(const value of values)check({[key]:value});
let seed=421;
for(let i=0;i<30;i++){const p={};for(const [k,[low,high]] of Object.entries(ranges)){seed=(1664525*seed+1013904223)>>>0;p[k]=low+(high-low)*seed/4294967296;}check(p);}
for(const p of [{},{aorticLeak:3,mitralLeak:3,hr:140,compliance:.5,contractility:4}]){
  const a=check(p),b=simulate(p,.00025);
  for(const key of ['sv','co','systolic','diastolic'])assert(Math.abs(a.metrics[key]-b.metrics[key])<.05,`Step-size agreement: ${key}`);
}
console.log(`PASS: baseline, physiological directions, valve leakage, volume conservation, ${checked} range/stability cases, and half-step agreement.`);
console.log('Baseline:',base.metrics);
const { relationships } = require('./model.js');
for (const settings of [{}, {contractility:.9}, {stiffness:2}, {aorticLeak:3}, {mitralLeak:3}, {aortic:5}]) {
  const r = simulate(settings), ref = relationships(r);
  assert(ref.end && ref.ea > 0 && Number.isFinite(ref.ea));
  assert(Math.abs(ref.ea * (r.metrics.edv - ref.end.v) - ref.end.p) < 1e-8);
  assert.equal(ref.passive(10), 0);
  assert.equal(ref.systolic(10), 0);
  for (const v of [50,100,150]) {
    assert(ref.systolic(v) > ref.passive(v));
    assert(Math.abs(ref.systolic(v) - ref.passive(v) - r.p.contractility*(v-10)) < 1e-8);
  }
}
assert.equal(relationships(simulate({aortic:0})).ea,null);
console.log('PASS: reference curves, arterial elastance endpoints, leakage scenarios, and absent ejection.');

assert(Math.abs(base.metrics.systolic - 120.14745658609581) < 1e-8, 'Original baseline systolic pressure restored');
assert(Math.abs(base.metrics.work - 1.014731451192344) < 1e-8, 'Original baseline loop work restored');
