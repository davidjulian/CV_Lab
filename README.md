# Cardiovascular Lab

[Open the live app](https://davidjulian.github.io/CV_Lab/)

Published with GitHub Pages from the root of the main branch. Pushing updates to main automatically republishes the site.

Standalone browser teaching prototype. Open index.html directly in a modern browser; no installation, account, or other app is required.

## Using the app

Adjust controls or select a preset. The P–V loop and Wiggers diagram show the same settled beat. Pause and use the cycle slider or click the Wiggers diagram to inspect a moment. The two annotation buttons show volume measurements and P–V relationships. The normal overlay and reset remain available.

## Restored original model

The original three state model is restored: left ventricular volume, left atrial volume, and arterial pressure. All experimental blood inertia, proximal arterial compartments, delayed aortic valve opening and closure, and notch generation have been removed. Normal aortic conductance is again 100 mL/s/mmHg, with a control range of 5–150.

Pressure is in mmHg, volume in mL, and time in seconds.

- LV pressure = 0.3 × stiffness × [exp(0.03 × (V − 10)) − 1] + contractility × activation(t) × (V − 10).
- Atrial pressure = [0.12 + 0.2 × atrial activation(t)] × (atrial volume − 10).
- Activation is a squared sine pulse, with atrial contraction preceding ventricular contraction.
- Valve flow = pressure difference × forward conductance for positive gradients, or leakage conductance for negative gradients.
- dV_LV/dt = mitral flow − aortic flow.
- dV_LA/dt = reservoir inflow − mitral flow.
- C × dP_arterial/dt = aortic flow − systemic runoff.
- Reservoir inflow = (filling pressure − atrial pressure) / 0.08.
- Systemic runoff = (arterial pressure − 5) / systemic resistance.

RK4 integration uses a maximum step of 0.5 ms. Settling requires a maximum state difference below 0.0001 between beats, with a 100 beat cap and visible nonconvergence notice. There are no pressure or volume clamps. Playback shows the settled beat, not the transition after a control change.

Stroke volume is maximum minus minimum LV volume, EF is stroke volume divided by maximum volume, cardiac output uses net integrated aortic flow, and stroke work is −∮P dV converted to joules. ESPVR is the model peak activation envelope; EDPVR is the passive curve. The arterial elastance line joins (EDV, 0) to the end of forward ejection and is an illustrative estimate with regurgitation.

## Scope and references

Illustrative left heart and two element Windkessel with fixed upstream and downstream reservoirs. Not a closed circulation or calibrated patient model. ECG is schematic. A dicrotic notch, detailed valve motion, spatial wave propagation, right heart, reflexes, heart sounds, and all atrial pressure waves are not modeled.

- Closed-loop real-time simulation model of hemodynamics and oxygen transport in the cardiovascular system: https://doi.org/10.1186/1475-925X-12-69
- Modeling the Instantaneous Pressure–Volume Relation of the Left Ventricle: A Comparison of Six Models: https://pmc.ncbi.nlm.nih.gov/articles/PMC3233835/

This is a simplified implementation, not a reproduction of either paper.

## Verification

Run node model.test.js. Checks cover baseline values, physiological directions, leakage, volume conservation, 52 control range and stability cases, integration step agreement, and reference relationships. Regression checks confirm restoration of the original baseline pressure and loop work. These are numerical and qualitative checks, not clinical validation.

## Schematic notch on the displayed aortic trace

The solver remains unchanged. display.js applies a smooth downward pulse of at most 3 mmHg during the first 32 ms after the end of forward aortic ejection (shortened at fast rates). It rejoins the original trace exactly, with no repeated oscillations. The normal overlay uses the same display treatment. Leakage attenuates the pulse illustratively. All metrics, P–V curves, ventricular pressure, and model samples remain untouched. No label is placed on the notch. Run node display.test.js to verify separation from the model.

