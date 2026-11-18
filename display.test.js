const assert=require('node:assert/strict');
const {simulate,exercisePreset}=require('./model.js');
const {aorticTrace,cardiacPhases,sampleAtTime}=require('./display.js');
const r=simulate(), before=JSON.stringify(r);
r.samples.forEach(Object.freeze);Object.freeze(r.samples);Object.freeze(r.metrics);Object.freeze(r);
const trace=aorticTrace(r);
const changed=r.samples.filter(s=>trace(s)!==s.pa);
assert(changed.length>0);
assert(changed.every(s=>s.qa<=0 && s.pa-trace(s)<=3.000001));
assert(changed.at(-1).t-changed[0].t<.032);
assert.equal(JSON.stringify(r),before,'Display leaves every model value unchanged');
for(const s of r.samples.filter(s=>s.qa>0))assert.equal(trace(s),s.pa,'Ejection unchanged');
const noEjection=simulate({aortic:0});
assert(noEjection.samples.every(s=>aorticTrace(noEjection)(s)===s.pa));
const leaking=simulate({aorticLeak:3}), leakTrace=aorticTrace(leaking);
assert(Math.max(...leaking.samples.map(s=>s.pa-leakTrace(s)))<.01);
console.log('PASS: display-only notch, bounded duration and depth, unchanged model and ejection, absent ejection, and leakage attenuation.');

function phaseSequence(result, expected) {
  const phases = cardiacPhases(result);
  assert.deepEqual(phases.map(span => span.phase), expected);
  assert.equal(phases[0].start, 0);
  assert.equal(phases.at(-1).end, result.T);
  phases.forEach(({ start, end }, index) => {
    assert(end > start);
    if (index > 0) assert.equal(start, phases[index - 1].end);
  });
  return phases;
}
const usualPhases = ['atrial', 'contraction', 'ejection', 'relaxation', 'filling'];
for (const result of [r, simulate(exercisePreset), simulate({mitralLeak:1.2})]) {
  const phases = phaseSequence(result, usualPhases);
  const crossings = [
    [phases[0].end, s => s.pla - s.plv],
    [phases[2].start, s => s.plv - s.pa],
    [phases[2].end, s => s.plv - s.pa],
    [phases[4].start, s => s.pla - s.plv]
  ];
  for (const [time, gradient] of crossings) {
    assert(Math.abs(gradient(sampleAtTime(result.samples, time))) < 1e-8, 'Phase boundary matches a valve event');
  }
}
const aorticRegurgitation = simulate({aorticLeak:1.2});
phaseSequence(aorticRegurgitation, ['filling', ...usualPhases]);
assert(aorticRegurgitation.samples.at(-1).qa < 0 && aorticRegurgitation.samples.at(-1).qm <= 0);
phaseSequence(simulate({atrialContractility:0}), ['filling', 'contraction', 'ejection', 'relaxation', 'filling']);
assert(cardiacPhases(noEjection).every(span => span.phase !== 'ejection'));
console.log('PASS: phase timing follows valve events, including exercise, regurgitation and loss of atrial contraction.');
