(function (root) {
  'use strict';
  const defaults = { hr: 72, contractility: 2.6, preload: 13, resistance: 1.1, compliance: 1.5, mitral: 100, aortic: 100, mitralLeak: 0, aorticLeak: 0, stiffness: 1 };
  function pulse(t, start, duration) {
    const x = (t - start) / duration;
    return x > 0 && x < 1 ? Math.sin(Math.PI * x) ** 2 : 0;
  }
  function observe(t, y, p) {
    const T = 60 / p.hr, phase = ((t % T) + T) % T;
    const activation = pulse(phase, .12 * T, .34 * (T / (60 / 72)) ** .3);
    const atrial = pulse(phase, 0, .14 * T);
    const plv = .3 * p.stiffness * Math.expm1(.03 * (y[0] - 10)) + p.contractility * activation * (y[0] - 10);
    const pla = (.12 + .2 * atrial) * (y[1] - 10);
    const valve = (dp, forward, leak) => dp * (dp >= 0 ? forward : leak);
    const qm = valve(pla - plv, p.mitral, p.mitralLeak);
    const qa = valve(plv - y[2], p.aortic, p.aorticLeak);
    const qin = (p.preload - pla) / .08;
    const qout = (y[2] - 5) / p.resistance;
    return { t: phase, v: y[0], va: y[1], plv, pla, pa: y[2], qm, qa, qin, qout, activation };
  }
  function derivative(t, y, p) {
    const s = observe(t, y, p);
    return [s.qm - s.qa, s.qin - s.qm, (s.qa - s.qout) / p.compliance];
  }
  function step(t, y, h, p) {
    const add = (a, k) => y.map((v, i) => v + a * k[i]);
    const a = derivative(t, y, p), b = derivative(t + h / 2, add(h / 2, a), p);
    const c = derivative(t + h / 2, add(h / 2, b), p), d = derivative(t + h, add(h, c), p);
    return y.map((v, i) => v + h / 6 * (a[i] + 2 * b[i] + 2 * c[i] + d[i]));
  }
  function simulate(overrides = {}, maxStep = .0005) {
    const p = { ...defaults, ...overrides }, T = 60 / p.hr;
    const n = Math.ceil(T / maxStep), h = T / n;
    let y = [120, 75, 85], residual = Infinity, beats = 0;
    for (; beats < 100; beats++) {
      const initial = y.slice();
      for (let i = 0; i < n; i++) y = step(i * h, y, h, p);
      residual = Math.max(...y.map((v, i) => Math.abs(v - initial[i])));
      if (!y.every(Number.isFinite)) throw new Error('The model did not produce finite values. Reset the controls.');
      if (beats > 8 && residual < .0001) break;
    }
    const samples = [], stride = Math.max(1, Math.round(n / 500));
    let net = 0, forward = 0, reverse = 0, work = 0;
    for (let i = 0; i < n; i++) {
      const s = observe(i * h, y, p), next = step(i * h, y, h, p);
      const sn = observe((i + 1) * h, next, p);
      if (i % stride === 0) samples.push({ ...s, t: i * h });
      net += (s.qa + sn.qa) / 2 * h;
      forward += (Math.max(0, s.qa) + Math.max(0, sn.qa)) / 2 * h;
      reverse += (Math.max(0, -s.qa) + Math.max(0, -sn.qa)) / 2 * h;
      work -= (s.plv + sn.plv) / 2 * (next[0] - y[0]);
      y = next;
    }
    samples.push({ ...observe(T, y, p), t: T });
    const vals = key => samples.map(s => s[key]);
    const edv = Math.max(...vals('v')), esv = Math.min(...vals('v'));
    return { p, T, samples, residual, beats: beats + 1, metrics: { edv, esv, sv: edv - esv, ef: 100 * (edv - esv) / edv, co: net * p.hr / 1000, net, forward, reverse, work: work * .000133322, systolic: Math.max(...vals('pa')), diastolic: Math.min(...vals('pa')) } };
  }
  function relationships(result) {
    const { p, samples, metrics } = result;
    const passive = v => .3 * p.stiffness * Math.expm1(.03 * (v - 10));
    const systolic = v => passive(v) + p.contractility * (v - 10);
    // End of forward aortic ejection; interpolate the zero pressure gradient.
    let end = null;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      if (a.qa > 0 && b.qa <= 0) {
        const da = a.plv - a.pa, db = b.plv - b.pa, f = da / (da - db);
        end = { v: a.v + f * (b.v - a.v), p: a.plv + f * (b.plv - a.plv) };
      }
    }
    const width = end ? metrics.edv - end.v : 0;
    return { passive, systolic, end, ea: width > .01 ? end.p / width : null };
  }
  const api = { defaults, simulate, observe, derivative, relationships };
  if (typeof module !== 'undefined') module.exports = api;
  root.CardioModel = api;
})(globalThis);
