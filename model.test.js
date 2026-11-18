const assert = require('node:assert/strict');
const { simulate, defaults, exercisePreset, derivative, observe, relationships } = require('./model.js');
const base = simulate();
const exercise = simulate(exercisePreset);
assert(exercise.metrics.co > base.metrics.co * 1.5);
assert(exercise.metrics.sv > base.metrics.sv);
assert(exercise.metrics.ef > base.metrics.ef);
assert(exercise.metrics.esv < base.metrics.esv);
assert(exercise.metrics.systolic > base.metrics.systolic);
assert(exercise.residual < .0001);
assert.equal(exercise.metrics.reverse, 0);
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
  const y=[s.v,s.va,s.reservoirPressure], dy=derivative(s.t,y,leak.p), o=observe(s.t,y,leak.p);
  assert(Math.abs(dy[0]+dy[1]+leak.p.compliance*dy[2]-(o.qin-o.qout)) < 1e-8, 'Volume conservation including external reservoirs');
  const conductance = s.qa >= 0 ? leak.p.aortic : leak.p.aorticLeak;
  assert(Math.abs(s.qa - conductance * (s.plv - s.pa)) < 1e-8, 'Valve flow follows the local LV-to-aorta pressure difference');
}
const ranges={hr:[40,140],contractility:[.6,4],preload:[6,20],resistance:[.5,2.2],compliance:[.5,3],mitral:[5,150],aortic:[5,150],mitralLeak:[0,3],aorticLeak:[0,3],stiffness:[.5,2],relaxation:[10,60]};
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

assert(base.metrics.sv > 65 && base.metrics.sv < 80, 'Plausible resting stroke volume');

function valveCrossing(result, gradient, opens) {
  for (let i = 1; i < result.samples.length; i++) {
    const a = result.samples[i - 1], b = result.samples[i];
    const da = gradient(a), db = gradient(b);
    if ((da > 0) !== (db > 0) && (db > 0) === opens) {
      return a.t + (b.t - a.t) * da / (da - db);
    }
  }
  assert.fail('Expected a valve event within the beat');
}

function aorticTiming(result) {
  const aorticGradient = s => s.plv - s.pa;
  const aorticOpen = valveCrossing(result, aorticGradient, true);
  const aorticClose = valveCrossing(result, aorticGradient, false);
  assert(aorticOpen < aorticClose);
  return { aorticOpen, aorticClose };
}

function valveTiming(result) {
  const mitralGradient = s => s.pla - s.plv;
  const mitralClose = valveCrossing(result, mitralGradient, false);
  const { aorticOpen, aorticClose } = aorticTiming(result);
  const mitralOpen = valveCrossing(result, mitralGradient, true);
  assert(mitralClose < aorticOpen && aorticClose < mitralOpen);
  return { aorticOpen, aorticClose, mitralOpen, ivrt: mitralOpen - aorticClose };
}

const fast = simulate({relaxation:10});
const slow = simulate({relaxation:60});
const restTiming = valveTiming(base);
const ejectionMs = 1000 * (restTiming.aorticClose - restTiming.aorticOpen);
const peakFlow = Math.max(...base.samples.map(s => s.qa));
const pressurePeak = base.samples.reduce((peak, s) => s.plv > peak.plv ? s : peak);
const peakPosition = (pressurePeak.t - restTiming.aorticOpen) / (restTiming.aorticClose - restTiming.aorticOpen);
const ejectedAfterPeak = (pressurePeak.v - base.metrics.esv) / base.metrics.sv;
assert(ejectionMs >= 248 && ejectionMs <= 336, 'Resting LV ejection time aligns with the Copenhagen reference interval');
assert(peakFlow >= 300 && peakFlow <= 500, 'Resting peak aortic flow near the 4D MRI reference');
assert(peakPosition > .35 && peakPosition < .7, 'LV pressure peaks around mid ejection');
assert(ejectedAfterPeak > .2 && ejectedAfterPeak < .55, 'Substantial forward ejection after peak LV pressure');
assert(valveTiming(exercise).aorticClose - valveTiming(exercise).aorticOpen < ejectionMs / 1000);
const fastTiming = valveTiming(fast);
const slowTiming = valveTiming(slow);
assert(fastTiming.ivrt < restTiming.ivrt && restTiming.ivrt < slowTiming.ivrt);
assert(Math.abs(fastTiming.aorticOpen - slowTiming.aorticOpen) < .005);
assert(Math.abs(fastTiming.aorticClose - slowTiming.aorticClose) < .005);
assert(slow.metrics.edv < fast.metrics.edv);
assert.equal(relationships(slow).passive(120), relationships(fast).passive(120));
assert.equal(relationships(slow).systolic(60), relationships(fast).systolic(60));

const exerciseAtRestTau = simulate({...exercisePreset, relaxation:defaults.relaxation});
assert(valveTiming(exercise).ivrt < valveTiming(exerciseAtRestTau).ivrt);
assert(exercise.metrics.sv > exerciseAtRestTau.metrics.sv);
assert(Math.abs(exercise.metrics.edv - base.metrics.edv) < 6);
console.log('PASS: calibrated resting ejection duration, flow, and pressure peak, plus valve timing and exercise.');

const mitralRegurgitation = simulate({mitralLeak:1.2});
assert(mitralRegurgitation.samples.some(s => s.qm < 0));
assert(mitralRegurgitation.metrics.sv > base.metrics.sv && mitralRegurgitation.metrics.net < base.metrics.net);
assert(leak.metrics.reverse > 0 && leak.metrics.forward > base.metrics.forward && leak.metrics.net < base.metrics.net);

// Regression for the reported plateau in these presets. Measure the rise
// over 25 ms windows, leaving room for short shoulders in the waveform.
for (const [name, result] of [
  ['Exercise', exercise], ['Stiffer arteries', stiff],
  ['Mitral regurgitation', mitralRegurgitation], ['Aortic regurgitation', leak]
]) {
  const { aorticOpen, aorticClose } = aorticTiming(result);
  const earlyEnd = aorticOpen + .35 * (aorticClose - aorticOpen);
  let checkedWindows = 0;
  for (const start of result.samples) {
    if (start.t < aorticOpen + .012) continue;
    if (start.t + .025 > earlyEnd) break;
    const end = result.samples.find(s => s.t >= start.t + .025);
    if (!end || end.t > earlyEnd) break;
    assert(start.qa > 0 && end.qa > 0, `${name}: forward flow during early ejection`);
    assert(end.plv - start.plv > 3, `${name}: no prolonged LV pressure plateau`);
    assert(end.pa - start.pa > 3, `${name}: no prolonged aortic pressure plateau`);
    checkedWindows++;
  }
  assert(checkedWindows > 0, `${name}: at least one early ejection window checked`);
}
console.log('PASS: early ejection pressure rise in exercise, stiffer arteries, and both regurgitation presets.');
