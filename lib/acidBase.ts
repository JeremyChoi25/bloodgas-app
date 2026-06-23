export type Unit = "mmHg" | "kPa";
export type AcuteChronic = "acute" | "chronic";

export interface BloodGasInput {
  pH: number;
  pCO2: number;
  pCO2Unit: Unit;
  HCO3: number;
  Na?: number;
  Cl?: number;
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

export interface AcidBaseResult {
  phStatus: "acidemia" | "alkalemia" | "normal pH";
  primaryDisorder: string;
  compensation: CompensationCheck;
  anionGap?: AnionGapResult;
  caveat?: string;
  summary: string;
}

const toMmHg = (value: number, unit: Unit) =>
  unit === "kPa" ? value * 7.50062 : value;

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

  const summary = `${phStatus}, primary process: ${primaryDisorder}.${
    compensation.verdict !== "not assessed" ? ` ${compensation.verdict}.` : ""
  }${anionGap ? ` Anion gap ${anionGap.value} (${anionGap.category}).` : ""}`;

  return { phStatus, primaryDisorder, compensation, anionGap, caveat, summary };
}