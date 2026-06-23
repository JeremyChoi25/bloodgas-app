"use client";
import { useRef, useState } from "react";
import { interpretBloodGas, AcidBaseResult, Unit, AcuteChronic } from "@/lib/acidBase";

function tryParseExtraction(raw: string): any | null {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [pH, setPH] = useState("");
  const [pCO2, setPCO2] = useState("");
  const [pCO2Unit, setPCO2Unit] = useState<Unit>("mmHg");
  const [HCO3, setHCO3] = useState("");
  const [Na, setNa] = useState("");
  const [Cl, setCl] = useState("");
  const [duration, setDuration] = useState<AcuteChronic>("acute");

  const [interpretation, setInterpretation] = useState<AcidBaseResult | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageSrc(URL.createObjectURL(file));
    setLoading(true);
    setParseError(null);
    setInterpretation(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
        });
        const data = await res.json();
        if (!res.ok) {
          setParseError(data.error ?? "Extraction failed");
        } else {
          const parsed = tryParseExtraction(data.raw);
          if (!parsed) {
            setParseError("Could not parse extracted values — check raw output below.");
          } else {
            setPH(parsed.pH != null ? String(parsed.pH) : "");
            setPCO2(parsed.pCO2 != null ? String(parsed.pCO2) : "");
            setPCO2Unit(parsed.pCO2_unit === "kPa" ? "kPa" : "mmHg");
            setHCO3(parsed.HCO3 != null ? String(parsed.HCO3) : "");
            setNa(parsed.Na != null ? String(parsed.Na) : "");
            setCl(parsed.Cl != null ? String(parsed.Cl) : "");
          }
        }
      } catch (err: any) {
        setParseError(`Request failed: ${err.message}`);
      }
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleInterpret = () => {
    const parsedPH = parseFloat(pH);
    const parsedPCO2 = parseFloat(pCO2);
    const parsedHCO3 = parseFloat(HCO3);
    if (isNaN(parsedPH) || isNaN(parsedPCO2) || isNaN(parsedHCO3)) {
      setParseError("pH, pCO2, and HCO3 are required and must be numbers.");
      return;
    }
    const result = interpretBloodGas({
      pH: parsedPH,
      pCO2: parsedPCO2,
      pCO2Unit,
      HCO3: parsedHCO3,
      Na: Na ? parseFloat(Na) : undefined,
      Cl: Cl ? parseFloat(Cl) : undefined,
      respiratoryDuration: duration,
    });
    setInterpretation(result);
  };

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1>Blood Gas Reader</h1>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <button onClick={() => fileInputRef.current?.click()}>📷 Take Photo of Printout</button>
      {imageSrc && <img src={imageSrc} alt="captured" style={{ maxWidth: "100%", marginTop: 16 }} />}
      {loading && <p>Reading values…</p>}
      {parseError && <p style={{ color: "crimson" }}>{parseError}</p>}

      <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
        <label>pH <input value={pH} onChange={(e) => setPH(e.target.value)} /></label>
        <label>
          pCO2 <input value={pCO2} onChange={(e) => setPCO2(e.target.value)} />
          <select value={pCO2Unit} onChange={(e) => setPCO2Unit(e.target.value as Unit)}>
            <option value="mmHg">mmHg</option>
            <option value="kPa">kPa</option>
          </select>
        </label>
        <label>HCO3 <input value={HCO3} onChange={(e) => setHCO3(e.target.value)} /></label>
        <label>Na (optional, for anion gap) <input value={Na} onChange={(e) => setNa(e.target.value)} /></label>
        <label>Cl (optional, for anion gap) <input value={Cl} onChange={(e) => setCl(e.target.value)} /></label>
        <label>
          If respiratory disorder: duration
          <select value={duration} onChange={(e) => setDuration(e.target.value as AcuteChronic)}>
            <option value="acute">Acute</option>
            <option value="chronic">Chronic</option>
          </select>
        </label>
        <button onClick={handleInterpret}>Interpret</button>
      </div>

      {interpretation && (
        <div style={{ marginTop: 20, padding: 16, background: "#f4f4f4", borderRadius: 8 }}>
          <p><strong>pH status:</strong> {interpretation.phStatus}</p>
          <p><strong>Primary disorder:</strong> {interpretation.primaryDisorder}</p>
          {interpretation.compensation.verdict !== "not assessed" && (
            <>
              <p><strong>Compensation:</strong> {interpretation.compensation.verdict}</p>
              <p style={{ fontSize: 13, color: "#555" }}>
                {interpretation.compensation.formulaUsed} — expected{" "}
                {interpretation.compensation.expected.toFixed(1)} (range{" "}
                {interpretation.compensation.expectedRange[0].toFixed(1)}–
                {interpretation.compensation.expectedRange[1].toFixed(1)}), actual{" "}
                {interpretation.compensation.actual.toFixed(1)}
              </p>
            </>
          )}
          {interpretation.anionGap && (
            <p><strong>Anion gap:</strong> {interpretation.anionGap.value} ({interpretation.anionGap.category})</p>
          )}
          {interpretation.caveat && (
            <p style={{ color: "#a66800", fontSize: 13 }}>⚠️ {interpretation.caveat}</p>
          )}
        </div>
      )}
    </main>
  );
}