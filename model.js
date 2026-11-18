(function (root) {
  'use strict';
  const defaults = { hr: 72, contractility: 2.5, preload: 13.5, resistance: 1.1, compliance: 1.7, mitral: 100, aortic: 100, mitralLeak: 0, aorticLeak: 0, stiffness: 1, relaxation: 20 };
  const exercisePreset = Object.freeze({ hr: 110, contractility: 4, preload: 20, resistance: .7, relaxation: 15 });

  const proximalResistance = .06; // Characteristic impedance, mmHg·s/mL.
  const restPeriod = 60 / 72;
  const restTimeToPeak = .3172;
  const systolicStretch = period => Math.sqrt(period / restPeriod);

  function ventricularPeakTime(period) {
    return .12 * period + restTimeToPeak * systolicStretch(period);
  }

  // Time from LV activation onset at 72 bpm and fraction of peak active elastance.
  // Start from a reference beat with a broad aortic flow pulse. Use a gradual
  // onset so beats that eject earlier also sample a smooth rise in activation.
  const activationCurve = [
    [0, 0], [.0156, .040], [.0312, .115], [.0520, .199], [.0780, .283], [.1248, .409],
    [.1768, .582], [.2288, .785], [.2756, .940], [restTimeToPeak, 1], [.3432, .972], [.3744, .5]
  ];
  const slopes = activationCurve.slice(1).map(([time, activation], i) => {
    const [previousTime, previousActivation] = activationCurve[i];
    return (activation - previousActivation) / (time - previousTime);
  });
  // Shape preserving cubic interpolation with zero slope at the peak.
  const tangents = activationCurve.map((_, i) => {
    if (i === 0) return 0;
    const left = slopes[i - 1], right = slopes[i];
    if (right === undefined) return left;
    return left * right > 0 ? 2 * left * right / (left + right) : 0;
  });
  const [tailStart, tailAmplitude] = activationCurve.at(-1);

  function ventricularActivation(phase, period, relaxation) {
    const stretch = systolicStretch(period);
    const time = ((phase + .88 * period) % period) / stretch;
    const tau = relaxation / 1000;
    const transition = .008;
    const joinRate = -tangents.at(-1) / (tailAmplitude * stretch);
    function tail(elapsed) {
      // Blend the slope at the join into the chosen exponential decay rate.
      const blend = -transition * Math.expm1(-elapsed / transition);
      return tailAmplitude * Math.exp(-elapsed / tau + (1 / tau - joinRate) * blend);
    }

    if (time >= tailStart) return tail((time - tailStart) * stretch);

    let i = 0;
    while (time > activationCurve[i + 1][0]) i++;
    const [start, from] = activationCurve[i], [end, to] = activationCurve[i + 1];
    const duration = end - start;
    const f = (time - start) / duration;
    const activation = from + f * f * (3 - 2 * f) * (to - from)
      + duration * f * (1 - f) * ((1 - f) * tangents[i] - f * tangents[i + 1]);
    if (time >= restTimeToPeak) return activation;

    // Residual activation carries into the next beat at fast rates.
    return activation + (1 - activation) * tail(period + (time - tailStart) * stretch);
  }
  function pulse(t, start, duration) {
    const x = (t - start) / duration;
    return x > 0 && x < 1 ? Math.sin(Math.PI * x) ** 2 : 0;
  }
  function observe(t, y, p) {
    const T = 60 / p.hr, phase = ((t % T) + T) % T;
    const activation = ventricularActivation(phase, T, p.relaxation ?? defaults.relaxation);
    const atrial = pulse(phase, 0, .14 * T);
    const plv = .3 * p.stiffness * Math.expm1(.03 * (y[0] - 10)) + p.contractility * activation * (y[0] - 10);
    const pla = (.12 + .2 * atrial) * (y[1] - 10);
    const valve = (dp, forward, leak) => dp * (dp >= 0 ? forward : leak);
    const qm = valve(pla - plv, p.mitral, p.mitralLeak);
    const reservoirPressure = y[2];
    const gradientToReservoir = plv - reservoirPressure;
    const conductance = gradientToReservoir >= 0 ? p.aortic : p.aorticLeak;
    // Solve the valve and proximal resistor in series. Valve flow still follows
    // the LV-to-aorta gradient, with aortic pressure measured before the resistor.
    const qa = conductance * gradientToReservoir / (1 + conductance * proximalResistance);
    const pa = reservoirPressure + proximalResistance * qa;
    const qin = (p.preload - pla) / .08;
    const qout = (reservoirPressure - 5) / (p.resistance - proximalResistance);
    return { t: phase, v: y[0], va: y[1], plv, pla, pa, reservoirPressure, qm, qa, qin, qout, activation };
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
    let systolic = -Infinity, diastolic = Infinity;
    for (let i = 0; i < n; i++) {
      const s = observe(i * h, y, p), next = step(i * h, y, h, p);
      const sn = observe((i + 1) * h, next, p);
      if (i % stride === 0) samples.push({ ...s, t: i * h });
      // Measure pressure extrema on the integration grid, before chart downsampling.
      systolic = Math.max(systolic, s.pa, sn.pa);
      diastolic = Math.min(diastolic, s.pa, sn.pa);
      net += (s.qa + sn.qa) / 2 * h;
      forward += (Math.max(0, s.qa) + Math.max(0, sn.qa)) / 2 * h;
      reverse += (Math.max(0, -s.qa) + Math.max(0, -sn.qa)) / 2 * h;
      work -= (s.plv + sn.plv) / 2 * (next[0] - y[0]);
      y = next;
    }
    samples.push({ ...observe(T, y, p), t: T });
    const vals = key => samples.map(s => s[key]);
    const edv = Math.max(...vals('v')), esv = Math.min(...vals('v'));
    return { p, T, samples, residual, beats: beats + 1, metrics: { edv, esv, sv: edv - esv, ef: 100 * (edv - esv) / edv, co: net * p.hr / 1000, net, forward, reverse, work: work * .000133322, systolic, diastolic } };
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
  const api = { defaults, exercisePreset, simulate, observe, derivative, relationships, ventricularPeakTime };
  if (typeof module !== 'undefined') module.exports = api;
  root.CardioModel = api;
})(globalThis);
