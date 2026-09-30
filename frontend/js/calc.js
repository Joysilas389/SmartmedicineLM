/*
 * Worked calculations with fresh numbers every time: the arithmetic the exams expect you to
 * do by hand. Each generator returns a problem, the correct answer, an acceptable tolerance
 * and a step-by-step worked solution. Pure functions (pass a random source for tests).
 */

const round = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const pick = (rand, lo, hi, d = 0) => round(lo + rand() * (hi - lo), d);

export const CALCS = {
  aniongap: {
    title: 'Anion gap',
    topic: 'Anion gap',
    make(rand) {
      const na = pick(rand, 128, 146);
      const cl = pick(rand, 92, 110);
      const hco3 = pick(rand, 8, 28);
      const ag = na - (cl + hco3);
      return {
        prompt: `Na⁺ ${na} mEq/L, Cl⁻ ${cl} mEq/L, HCO₃⁻ ${hco3} mEq/L. What is the anion gap (mEq/L)?`,
        answer: ag,
        tolerance: 0.5,
        unit: 'mEq/L',
        steps: [
          'Anion gap = Na⁺ − (Cl⁻ + HCO₃⁻): the measured cation minus the measured anions.',
          `= ${na} − (${cl} + ${hco3}) = ${na} − ${cl + hco3} = ${ag}`,
          ag > 12 ? `${ag} is raised (normal about 8–12): unmeasured anions such as lactate, ketoacids, toxins or uremic acids are present.` : `${ag} is within the usual 8–12 range${hco3 < 22 ? ', so a low bicarbonate here points to a normal-gap (hyperchloremic) acidosis, e.g. diarrhea or renal tubular acidosis' : ''}.`,
        ],
      };
    },
  },
  winters: {
    title: "Winter's formula (expected PaCO₂)",
    topic: 'Acid-base disorders',
    make(rand) {
      const hco3 = pick(rand, 8, 20);
      const expected = 1.5 * hco3 + 8;
      const paco2 = pick(rand, expected - 8, expected + 8);
      const verdict = paco2 > expected + 2 ? 'higher than expected: a coexisting respiratory acidosis' : paco2 < expected - 2 ? 'lower than expected: a coexisting respiratory alkalosis' : 'within the expected range: appropriate respiratory compensation';
      return {
        prompt: `Metabolic acidosis with HCO₃⁻ ${hco3} mEq/L. What PaCO₂ (mm Hg) do you expect with full respiratory compensation? (Measured PaCO₂ is ${paco2}.)`,
        answer: round(expected, 1),
        tolerance: 2,
        unit: 'mm Hg',
        steps: [
          "Winter's formula: expected PaCO₂ = 1.5 × HCO₃⁻ + 8 (± 2).",
          `= 1.5 × ${hco3} + 8 = ${round(1.5 * hco3, 1)} + 8 = ${round(expected, 1)} (range ${round(expected - 2, 1)}–${round(expected + 2, 1)})`,
          `The measured PaCO₂ of ${paco2} is ${verdict}.`,
        ],
      };
    },
  },
  aagradient: {
    title: 'A–a gradient',
    topic: 'Gas exchange',
    make(rand) {
      const age = pick(rand, 20, 80);
      const paco2 = pick(rand, 30, 55);
      const pao2 = pick(rand, 55, 95);
      const PAO2 = 0.21 * (760 - 47) - paco2 / 0.8;
      const grad = PAO2 - pao2;
      const normal = age / 4 + 4;
      return {
        prompt: `A ${age}-year-old at sea level on room air: PaO₂ ${pao2} mm Hg, PaCO₂ ${paco2} mm Hg. What is the A–a gradient (mm Hg)?`,
        answer: round(grad, 0),
        tolerance: 3,
        unit: 'mm Hg',
        steps: [
          'Alveolar O₂: PAO₂ = FiO₂ × (Patm − PH₂O) − PaCO₂ / 0.8.',
          `= 0.21 × (760 − 47) − ${paco2} / 0.8 = ${round(0.21 * 713, 1)} − ${round(paco2 / 0.8, 1)} = ${round(PAO2, 1)}`,
          `A–a gradient = PAO₂ − PaO₂ = ${round(PAO2, 1)} − ${pao2} = ${round(grad, 0)}`,
          `Expected for age ≈ age/4 + 4 = ${round(normal, 0)}. ${grad > normal + 5 ? 'Raised: the problem is in gas exchange (V/Q mismatch, shunt or diffusion).' : 'Normal: hypoxemia, if present, comes from hypoventilation or low inspired oxygen.'}`,
        ],
      };
    },
  },
  calcium: {
    title: 'Albumin-corrected calcium',
    topic: 'Calcium and PTH regulation',
    make(rand) {
      const ca = pick(rand, 6.8, 9.6, 1);
      const alb = pick(rand, 1.6, 4.0, 1);
      const corrected = ca + 0.8 * (4 - alb);
      return {
        prompt: `Total calcium ${ca} mg/dL, albumin ${alb} g/dL. What is the corrected calcium (mg/dL)?`,
        answer: round(corrected, 1),
        tolerance: 0.15,
        unit: 'mg/dL',
        steps: [
          'Corrected Ca = measured Ca + 0.8 × (4 − albumin): each 1 g/dL fall in albumin lowers total calcium by about 0.8 mg/dL without changing the ionised fraction.',
          `= ${ca} + 0.8 × (4 − ${alb}) = ${ca} + ${round(0.8 * (4 - alb), 2)} = ${round(corrected, 1)}`,
          corrected < 8.5 ? 'Still low: true hypocalcemia (confirm with ionised calcium).' : 'Normal once corrected: the low total calcium was mostly low albumin.',
        ],
      };
    },
  },
  osmolality: {
    title: 'Serum osmolality and osmolal gap',
    topic: 'Diffusion and osmosis',
    make(rand) {
      const na = pick(rand, 128, 148);
      const glucose = pick(rand, 80, 600);
      const bun = pick(rand, 8, 60);
      const calc = 2 * na + glucose / 18 + bun / 2.8;
      return {
        prompt: `Na⁺ ${na} mEq/L, glucose ${glucose} mg/dL, BUN ${bun} mg/dL. What is the calculated serum osmolality (mOsm/kg)?`,
        answer: round(calc, 0),
        tolerance: 2,
        unit: 'mOsm/kg',
        steps: [
          'Calculated osmolality = 2 × Na⁺ + glucose / 18 + BUN / 2.8 (sodium counts twice for its accompanying anions).',
          `= 2 × ${na} + ${glucose} / 18 + ${bun} / 2.8 = ${2 * na} + ${round(glucose / 18, 1)} + ${round(bun / 2.8, 1)} = ${round(calc, 0)}`,
          'If measured osmolality exceeds this by more than about 10, an unmeasured osmole (such as methanol or ethylene glycol) is present.',
        ],
      };
    },
  },
  clearance: {
    title: 'Creatinine clearance',
    topic: 'Glomerular filtration',
    make(rand) {
      const ucr = pick(rand, 40, 160);
      const pcr = pick(rand, 0.8, 3, 1);
      const v = pick(rand, 0.6, 1.4, 1);
      const c = (ucr * v) / pcr;
      return {
        prompt: `Urine creatinine ${ucr} mg/dL, urine flow ${v} mL/min, plasma creatinine ${pcr} mg/dL. What is the creatinine clearance (mL/min)?`,
        answer: round(c, 0),
        tolerance: 2,
        unit: 'mL/min',
        steps: [
          'Clearance = (U × V) / P: the volume of plasma completely cleared of creatinine per minute, which approximates GFR.',
          `= (${ucr} × ${v}) / ${pcr} = ${round(ucr * v, 1)} / ${pcr} = ${round(c, 0)}`,
          'Creatinine is slightly secreted, so this overestimates true GFR a little.',
        ],
      };
    },
  },
  twobytwo: {
    title: 'Sensitivity, specificity and predictive values',
    topic: 'Sensitivity and specificity',
    make(rand) {
      const tp = pick(rand, 40, 95);
      const fn = pick(rand, 3, 30);
      const fp = pick(rand, 5, 60);
      const tn = pick(rand, 100, 400);
      const which = ['sensitivity', 'specificity', 'PPV', 'NPV'][Math.floor(rand() * 4)];
      const vals = { sensitivity: tp / (tp + fn), specificity: tn / (tn + fp), PPV: tp / (tp + fp), NPV: tn / (tn + fn) };
      const formula = { sensitivity: 'TP / (TP + FN)', specificity: 'TN / (TN + FP)', PPV: 'TP / (TP + FP)', NPV: 'TN / (TN + FN)' }[which];
      const nums = { sensitivity: [tp, tp + fn], specificity: [tn, tn + fp], PPV: [tp, tp + fp], NPV: [tn, tn + fn] }[which];
      return {
        prompt: `A test on 2 × 2: true positives ${tp}, false negatives ${fn}, false positives ${fp}, true negatives ${tn}. What is the ${which} (%)?`,
        answer: round(vals[which] * 100, 1),
        tolerance: 0.6,
        unit: '%',
        steps: [
          `${which} = ${formula}.`,
          `= ${nums[0]} / ${nums[1]} = ${round(vals[which] * 100, 1)}%`,
          which === 'sensitivity' || which === 'specificity'
            ? 'Sensitivity and specificity are properties of the test and do not change with prevalence.'
            : 'Predictive values depend on prevalence: the rarer the disease, the lower the PPV and the higher the NPV.',
        ],
      };
    },
  },
  nnt: {
    title: 'Number needed to treat',
    topic: 'Risk measures',
    make(rand) {
      const control = pick(rand, 10, 40);
      const treated = pick(rand, 2, control - 2);
      const arr = (control - treated) / 100;
      return {
        prompt: `Events occurred in ${control}% of the control group and ${treated}% of the treated group. What is the NNT (round up to a whole patient)?`,
        answer: Math.ceil(1 / arr),
        tolerance: 0,
        unit: 'patients',
        steps: [
          'Absolute risk reduction (ARR) = control event rate − treated event rate.',
          `ARR = ${control}% − ${treated}% = ${control - treated}% = ${round(arr, 3)}`,
          `NNT = 1 / ARR = 1 / ${round(arr, 3)} = ${round(1 / arr, 2)}, rounded up to ${Math.ceil(1 / arr)}.`,
          `Relative risk = ${treated}/${control} = ${round(treated / control, 2)}; relative risk reduction = ${round((1 - treated / control) * 100, 0)}%. The NNT is the number that means something to a patient.`,
        ],
      };
    },
  },
};

export function makeProblem(key, rand = Math.random) {
  const c = CALCS[key];
  return { key, title: c.title, topic: c.topic, ...c.make(rand) };
}

/** Checks a typed answer against the problem, allowing the stated tolerance. */
export function checkAnswer(problem, input) {
  const m = String(input).replace(',', '.').match(/-?\d+(\.\d+)?|-?\.\d+/);
  if (!m) return { valid: false }; // no number typed at all
  const v = Number(m[0]);
  if (!Number.isFinite(v)) return { valid: false };
  return { valid: true, correct: Math.abs(v - problem.answer) <= problem.tolerance + 1e-9, value: v };
}
