# Cardiovascular Lab

[Open the live app](https://davidjulian.github.io/CV_Lab/)

Published with GitHub Pages from the root of the main branch. Pushing updates to main automatically republishes the site.

Standalone browser teaching prototype. Open index.html directly in a modern browser; no installation, account, or other app is required.

## Using the app

Adjust controls or select a preset. The P–V loop and Wiggers diagram show the same settled beat. Pause and use the cycle slider or click the Wiggers diagram to inspect a moment. **Show Mitral Flow** adds a trace on the Wiggers time axis, in mL/s. Positive flow goes into the LV, and negative flow is regurgitant. The cursor readout shows the signed flow at that point, and the normal overlay adds the corresponding resting trace.

## Hemodynamic model

The three state variables are left ventricular volume, left atrial volume, and pressure in the arterial compliance. A fixed proximal resistance of 0.06 mmHg·s/mL represents characteristic impedance. The systemic resistance slider sets the sum of proximal and peripheral resistance. Normal aortic valve conductance is 100 mL/s/mmHg, with a control range of 5–150.

Pressure is in mmHg, volume in mL, and time in seconds.

- LV pressure = 0.3 × stiffness × [exp(0.03 × (V − 10)) − 1] + contractility × activation(t) × (V − 10).
- Atrial pressure = [0.12 + 0.2 × atrial activation(t)] × (atrial volume − 10).
- Atrial activation is a squared sine pulse. A smooth interpolated ventricular activation curve sets systolic timing and transitions to exponential decay. The curve is based on the elastance implied by a broad reference flow pulse delivering 72 mL over 290 ms. Its timing scales with the square root of beat period. The ventricular relaxation control sets the late activation time constant τ (10–60 ms). Smaller values give faster relaxation. Peak active elastance and the passive pressure–volume curve are set independently. Residual activation can carry into the next beat.
- Valve flow = pressure difference × forward conductance for positive gradients, or leakage conductance for negative gradients.
- dV_LV/dt = mitral flow − aortic flow.
- dV_LA/dt = reservoir inflow − mitral flow.
- C × dP_compliance/dt = aortic flow − systemic runoff.
- Aortic root pressure = compliance pressure + proximal resistance × aortic flow. The aortic valve uses the pressure difference between the LV and aortic root.
- Reservoir inflow = (filling pressure − atrial pressure) / 0.08.
- Systemic runoff = (compliance pressure − 5) / peripheral resistance.

RK4 integration uses a maximum step of 0.5 ms. Settling requires a maximum state difference below 0.0001 between beats, with a 100 beat cap and visible nonconvergence notice. There are no pressure or volume clamps. Playback shows the settled beat, not the transition after a control change.

Stroke volume is maximum minus minimum LV volume, EF is stroke volume divided by maximum volume, cardiac output uses net integrated aortic flow, and stroke work is −∮P dV converted to joules. ESPVR is the model peak activation envelope; EDPVR is the passive curve. The arterial elastance line joins (EDV, 0) to the end of forward ejection and is an illustrative estimate with regurgitation.

## Scope and references

Illustrative left heart and three element Windkessel with fixed upstream and downstream pressure boundaries. The ECG and displayed aortic notch are schematic. The model omits detailed valve motion, spatial wave propagation, right heart, reflexes, heart sounds, and some atrial pressure waves.

At 72 bpm, the resting simulation ejects for about 278 ms and reaches a peak aortic flow of about 397 mL/s. LV pressure peaks near the middle of ejection, with about 32% of stroke volume still to be ejected. The common activation curve was also checked in exercise, stiffer arteries, and mitral and aortic regurgitation. The preset waveforms illustrate the model's response to changes in load and valve conductance. [Human ejection duration](https://pubmed.ncbi.nlm.nih.gov/37522900/), [human aortic flow by MRI, Table 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC5096729/#Tab2)

- Closed-loop real-time simulation model of hemodynamics and oxygen transport in the cardiovascular system: https://doi.org/10.1186/1475-925X-12-69
- Modeling the Instantaneous Pressure–Volume Relation of the Left Ventricle: A Comparison of Six Models: https://pmc.ncbi.nlm.nih.gov/articles/PMC3233835/

This is a simplified implementation, not a reproduction of either paper.

## Verification

Run `node model.test.js`. Checks cover resting ejection duration and peak flow, the timing of the LV pressure peak and subsequent ejection, valve order, early ejection pressure rise across four presets, relaxation and exercise responses, volume conservation, control ranges, integration step agreement, and reference relationships.

## Schematic notch on the displayed aortic trace

`display.js` applies a smooth downward pulse of at most 3 mmHg to the displayed aortic trace during the first 32 ms after the end of forward ejection (shortened at fast rates). It rejoins the modeled trace exactly. The normal overlay uses the same display treatment. Leakage attenuates the pulse illustratively. Run `node display.test.js` to verify that the notch is display only.


## Exercise preset

Exercise (dynamic) sets heart rate to 110 bpm, contractility to 4 mmHg/mL, reservoir filling pressure to 20 mmHg, systemic resistance to 0.7 mmHg·s/mL, and relaxation τ to 15 ms versus 20 ms at rest. The other parameters use the resting values. At these settings, cardiac output is about 9.1 L/min, stroke volume 83 mL, and EF 68%. The preset represents dynamic exercise without targeting a specific workload. Reservoir pressure is a proxy for filling support. Muscle and respiratory pumps are outside the model. [Exercise model reference](https://pubmed.ncbi.nlm.nih.gov/12507317/)


EDV can rise initially during upright exercise and return toward baseline at higher workloads. Faster relaxation and lower ESV can increase stroke volume even when EDV and end diastolic pressure stay similar. In the preset, EDV stays near baseline, while ESV falls from about 54 to 39 mL. Diastolic arterial pressure rises from about 80 to 86 mmHg, which illustrates a limit of the calibration. [Upright exercise study](https://pubmed.ncbi.nlm.nih.gov/3349757/), [supine exercise study](https://pubmed.ncbi.nlm.nih.gov/3408616/)

