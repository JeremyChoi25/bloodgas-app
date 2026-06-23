export type Unit = "mmHg" | "kPa";
export type AcuteChronic = "acute" | "chronic";

export interface BloodGasInput {
  pH: number;
  pCO2: number;
  pCO2Unit: Unit;
  HCO3: number;
  Na?: number;
  Cl?: number;
  K?: number;
  lactate?: number;
  glucose?: number;
  respiratoryDuration?: AcuteChronic;
}

export interface CompensationCheck {
  formulaUsed: string;
  expected: number;
  expectedRange: [number, number];
  actual: number;
  verdict:
    | "appropriate compensation"
    | "additional respiratory alkalosis (mixed)"
    | "additional respiratory acidosis (mixed)"
    | "additional metabolic acidosis (mixed)"
    | "additional metabolic alkalosis (mixed)"
    | "not assessed";
}

export interface AnionGapResult {
  value: number;
  category: "high" | "normal" | "low";
}

export interface DeltaDeltaResult {
  ratio: number;
  deltaAG: number;
  deltaHCO3: number;
  interpretation: string;
}

export interface DifferentialGroup {
  title: string;
  items: string[];
  note?: string;
}

export interface AcidBaseResult {
  phStatus: "acidemia" | "alkalemia" | "normal pH";
  primaryDisorder: string;
  compensation: CompensationCheck;
  anionGap?: AnionGapResult;
  deltaDelta?: DeltaDeltaResult;
  differentials: DifferentialGroup[];
  caveat?: string;
  summary: string;
}

const toMmHg = (value: number, unit: Unit) =>
  unit === "kPa" ? value * 7.50062 : value;

function getDifferentials(
  primaryDisorder: string,
  anionGap: AnionGapResult | undefined,
  duration: AcuteChronic,
  input: BloodGasInput
): DifferentialGroup[] {
  const groups: DifferentialGroup[] = [];

  if (primaryDisorder.includes("respiratory acidosis")) {
    groups.push({
      title: `Respiratory acidosis (${duration})`,
      items:
        duration === "acute"
          ? [
              "Opioid or sedative overdose",
              "Acute severe asthma or COPD exacerbation",
              "Airway obstruction",
              "Neuromuscular failure (Guillain-Barré, myasthenic crisis)",
              "Chest wall trauma / flail chest",
              "Iatrogenic under-ventilation",
            ]
          : [
              "COPD",
              "Obesity hypoventilation syndrome",
              "Chronic neuromuscular disease (e.g. ALS, muscular dystrophy)",
              "Severe kyphoscoliosis",
              "Central sleep apnea",
            ],
    });
  }

  if (primaryDisorder.includes("respiratory alkalosis")) {
    groups.push({
      title: `Respiratory alkalosis (${duration})`,
      items:
        duration === "acute"
          ? [
              "Anxiety / pain / hyperventilation",
              "Pulmonary embolism",
              "Early sepsis",
              "Hypoxemia-driven hyperventilation",
              "Salicylate toxicity (early phase)",
              "CNS lesion or stroke",
            ]
          : [
              "Chronic liver disease",
              "Pregnancy",
              "Chronic high altitude exposure",
              "Chronic hypoxemia",
              "CNS tumor",
            ],
    });
  }

  if (primaryDisorder.includes("metabolic acidosis")) {
    if (anionGap?.category === "high") {
      const items = [
        "Lactic acidosis (sepsis, shock, tissue ischemia, metformin)",
        "Diabetic ketoacidosis",
        "Alcoholic ketoacidosis / starvation ketosis",
        "Toxic alcohol ingestion (methanol, ethylene glycol)",
        "Salicylate toxicity",
        "Uremia (renal failure)",
        "Iron or isoniazid overdose",
      ];
      let note: string | undefined;
      if (input.lactate !== undefined && input.lactate > 2) {
        note = "Elevated lactate raises suspicion for lactic acidosis (sepsis/shock/ischemia) as the leading cause.";
      } else if (input.glucose !== undefined && input.glucose > 250) {
        note = "Elevated glucose raises suspicion for diabetic ketoacidosis — correlate with ketones if available.";
      }
      groups.push({ title: "High anion gap metabolic acidosis", items, note });
    } else if (anionGap?.category === "normal") {
      const items = [
        "GI bicarbonate loss (diarrhea, ileostomy, fistula)",
        "Renal tubular acidosis (types 1, 2, 4)",
        "Early/mild renal failure",
        "Carbonic anhydrase inhibitor use (e.g. acetazolamide)",
        "Dilutional acidosis (large volume saline)",
        "Ureteral diversion",
      ];
      let note: string | undefined;
      if (input.K !== undefined) {
        note =
          input.K < 3.5
            ? "Low potassium favors diarrhea, RTA type 1 (distal), or RTA type 2 (proximal)."
            : input.K > 5.0
            ? "High potassium favors RTA type 4 (hyperkalemic distal RTA) or early renal failure."
            : undefined;
      }
      groups.push({ title: "Normal anion gap metabolic acidosis", items, note });
    } else if (anionGap?.category === "low") {
      groups.push({
        title: "Low anion gap metabolic acidosis",
        items: ["Hypoalbuminemia", "Multiple myeloma / paraproteinemia", "Lithium toxicity", "Severe hyponatremia"],
      });
    }
  }

  if (primaryDisorder.includes("metabolic alkalosis")) {
    groups.push({
      title: "Metabolic alkalosis",
      items: [
        "Chloride-responsive: vomiting / NG suction, diuretic use, post-hypercapnia, contraction alkalosis",
        "Chloride-resistant: primary/secondary hyperaldosteronism, Cushing's syndrome, Bartter/Gitelman syndrome, severe hypokalemia, exogenous alkali administration, licorice ingestion",
      ],
      note: "Distinguishing chloride-responsive vs. resistant causes requires a urine chloride, which this tool doesn't currently capture.",
    });
  }

  return groups;
}

export function interpretBloodGas(input: BloodGasInput): AcidBaseResult {
  const pCO2 = toMmHg(input.pCO2, input.pCO2Unit);
  const { pH, HCO3 } = input;
  const duration = input.respiratoryDuration ?? "acute";

  const phStatus: AcidBaseResult["phStatus"] =
    pH < 7.35 ? "acidemia" : pH > 7.45 ? "alkalemia" : "normal pH";

  const HCO3low = HCO3 < 22;
  const HCO3high = HCO3 > 26;
  const pCO2low = pCO2 < 35;
  const pCO2high = pCO2 > 45;

  let primaryDisorder = "indeterminate";
  let caveat: string | undefined;
  let compensation: CompensationCheck = {
    formulaUsed: "n/a",
    expected: NaN,
    expectedRange: [NaN, NaN],
    actual: NaN,
    verdict: "not assessed",
  };

  const winterCheck = (): CompensationCheck => {
    const expected = 1.5 * HCO3 + 8;
    const range: [number, number] = [expected - 2, expected + 2];
    const verdict =
      pCO2 < range[0]
        ? "additional respiratory alkalosis (mixed)"
        : pCO2 > range[1]
        ? "additional respiratory acidosis (mixed)"
        : "appropriate compensation";
    return {
      formulaUsed: "Winter's formula: expected pCO2 = 1.5 × HCO3 + 8 (±2)",
      expected,
      expectedRange: range,
      actual: pCO2,
      verdict,
    };
  };

  const metAlkCheck = (): CompensationCheck => {
    const expected = 0.7 * HCO3 + 20;
    const range: [number, number] = [expected - 1.5, expected + 1.5];
    const verdict =
      pCO2 < range[0]
        ? "additional respiratory alkalosis (mixed)"
        : pCO2 > range[1]
        ? "additional respiratory acidosis (mixed)"
        : "appropriate compensation";
    return {
      formulaUsed: "Expected pCO2 = 0.7 × HCO3 + 20 (±1.5)",
      expected,
      expectedRange: range,
      actual: pCO2,
      verdict,
    };
  };

  const respAcidosisCheck = (): CompensationCheck => {
    const deltaPCO2 = pCO2 - 40;
    const perTen = duration === "acute" ? 1 : 3.75;
    const expected = 24 + (deltaPCO2 / 10) * perTen;
    const margin = duration === "acute" ? 2 : 3;
    const range: [number, number] = [expected - margin, expected + margin];
    const verdict =
      HCO3 < range[0]
        ? "additional metabolic acidosis (mixed)"
        : HCO3 > range[1]
        ? "additional metabolic alkalosis (mixed)"
        : "appropriate compensation";
    return {
      formulaUsed: `${duration === "acute" ? "Acute" : "Chronic"} respiratory acidosis: expected HCO3 rise ≈ ${
        duration === "acute" ? "1" : "3.5–4"
      } per 10 mmHg pCO2 rise above 40`,
      expected,
      expectedRange: range,
      actual: HCO3,
      verdict,
    };
  };

  const respAlkalosisCheck = (): CompensationCheck => {
    const deltaPCO2 = 40 - pCO2;
    const perTen = duration === "acute" ? 2 : 5;
    const expected = 24 - (deltaPCO2 / 10) * perTen;
    const margin = duration === "acute" ? 2 : 3;
    const range: [number, number] = [expected - margin, expected + margin];
    const verdict =
      HCO3 < range[0]
        ? "additional metabolic acidosis (mixed)"
        : HCO3 > range[1]
        ? "additional metabolic alkalosis (mixed)"
        : "appropriate compensation";
    return {
      formulaUsed: `${duration === "acute" ? "Acute" : "Chronic"} respiratory alkalosis: expected HCO3 fall ≈ ${
        duration === "acute" ? "2" : "5"
      } per 10 mmHg pCO2 fall below 40`,
      expected,
      expectedRange: range,
      actual: HCO3,
      verdict,
    };
  };

  if (HCO3low && pCO2high) {
    primaryDisorder = "mixed respiratory and metabolic acidosis";
  } else if (HCO3high && pCO2low) {
    primaryDisorder = "mixed respiratory and metabolic alkalosis";
  } else if (HCO3low) {
    primaryDisorder = "metabolic acidosis";
    compensation = winterCheck();
    if (pCO2low) {
      caveat =
        "pCO2 and HCO3 are both reduced. This is also consistent with primary chronic respiratory alkalosis with renal compensation — clinical history needed to confirm metabolic acidosis as primary.";
    }
  } else if (HCO3high) {
    primaryDisorder = "metabolic alkalosis";
    compensation = metAlkCheck();
    if (pCO2high) {
      caveat =
        "pCO2 and HCO3 are both elevated. This is also consistent with primary chronic respiratory acidosis with renal compensation — clinical history needed to confirm metabolic alkalosis as primary.";
    }
  } else if (pCO2high) {
    primaryDisorder = "respiratory acidosis";
    compensation = respAcidosisCheck();
  } else if (pCO2low) {
    primaryDisorder = "respiratory alkalosis";
    compensation = respAlkalosisCheck();
  } else {
    primaryDisorder =
      phStatus === "normal pH"
        ? "normal acid-base status"
        : "indeterminate — pH abnormal but pCO2 and HCO3 are both within typical reference range; consider lab error, an unmeasured acid/base process, or correlate clinically";
  }

  let anionGap: AnionGapResult | undefined;
  if (input.Na !== undefined && input.Cl !== undefined) {
    const ag = input.Na - (input.Cl + HCO3);
    const category: AnionGapResult["category"] =
      ag > 16 ? "high" : ag < 8 ? "low" : "normal";
    anionGap = { value: Math.round(ag * 10) / 10, category };
  }

  let deltaDelta: DeltaDeltaResult | undefined;
  if (
    anionGap?.category === "high" &&
    primaryDisorder.includes("metabolic acidosis") &&
    HCO3 < 24
  ) {
    const deltaAG = anionGap.value - 12;
    const deltaHCO3 = 24 - HCO3;
    const ratio = Math.round((deltaAG / deltaHCO3) * 100) / 100;
    let interpretation: string;
    if (ratio < 0.4) {
      interpretation =
        "Ratio < 0.4: a normal-anion-gap (hyperchloremic) process appears to predominate — consider concurrent GI bicarbonate loss or RTA alongside the high-AG process.";
    } else if (ratio < 1) {
      interpretation =
        "Ratio 0.4–1.0: suggests a combined high-anion-gap and normal-anion-gap metabolic acidosis.";
    } else if (ratio <= 2) {
      interpretation =
        "Ratio 1.0–2.0: consistent with a pure high-anion-gap metabolic acidosis, well explained by the anion gap alone.";
    } else {
      interpretation =
        "Ratio > 2.0: HCO3 is higher than the anion gap alone predicts — suggests a concurrent metabolic alkalosis, or a pre-existing elevated baseline HCO3 from compensated chronic respiratory acidosis.";
    }
    deltaDelta = { ratio, deltaAG, deltaHCO3, interpretation };
  }

  const differentials = getDifferentials(primaryDisorder, anionGap, duration, input);

  const summary = `${phStatus}, primary process: ${primaryDisorder}.${
    compensation.verdict !== "not assessed" ? ` ${compensation.verdict}.` : ""
  }${anionGap ? ` Anion gap ${anionGap.value} (${anionGap.category}).` : ""}`;

  return { phStatus, primaryDisorder, compensation, anionGap, deltaDelta, differentials, caveat, summary };
}