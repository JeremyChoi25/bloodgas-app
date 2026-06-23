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

const PH_MIN = 6.9;
const PH_MAX = 7.8;
const pctOf = (v: number) => Math.min(100, Math.max(0, ((v - PH_MIN) / (PH_MAX - PH_MIN)) * 100));
const ACID_END = pctOf(7.35);
const NORMAL_END = pctOf(7.45);

function statusTag(status: AcidBaseResult["phStatus"]) {
  if (status === "acidemia") return { label: "ACIDEMIA", color: "var(--crimson)" };
  if (status === "alkalemia") return { label: "ALKALEMIA", color: "var(--azure)" };
  return { label: "NORMAL pH", color: "var(--teal)" };
}

export default function Home() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [pH, setPH] = useState("");
  const [pCO2, setPCO2] = useState("");
  const [pCO2Unit, setPCO2Unit] = useState<Unit>("mmHg");
  const [HCO3, setHCO3] = useState("");
  const [Na, setNa] = useState("");
  const [Cl, setCl] = useState("");
  const [K, setK] = useState("");
  const [lactate, setLactate] = useState("");
  const [glucose, setGlucose] = useState("");
  const [duration, setDuration] = useState<AcuteChronic>("acute");

  const [interpretation, setInterpretation] = useState<AcidBaseResult | null>(null);

  const processFile = async (file: File) => {
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
            setK(parsed.K != null ? String(parsed.K) : "");
            setLactate(parsed.lactate != null ? String(parsed.lactate) : "");
            setGlucose(parsed.glucose != null ? String(parsed.glucose) : "");
          }
        }
      } catch (err: any) {
        setParseError(`Request failed: ${err.message}`);
      }
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
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
      K: K ? parseFloat(K) : undefined,
      lactate: lactate ? parseFloat(lactate) : undefined,
      glucose: glucose ? parseFloat(glucose) : undefined,
      respiratoryDuration: duration,
    });
    setInterpretation(result);
  };

  const tag = interpretation ? statusTag(interpretation.phStatus) : null;
  const markerPct = pH && !isNaN(parseFloat(pH)) ? pctOf(parseFloat(pH)) : null;

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">ACID–BASE READER</p>
        <h1 className="headline">Blood Gas Reader</h1>
        <p className="sub">Photograph or upload a printout, confirm the values, get an interpretation.</p>
      </header>

      <section className="card">
        <p className="cardEyebrow">SPECIMEN</p>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
          style={{ display: "none" }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          style={{ display: "none" }}
        />
        <div className="btnRow">
          <button className="btn btnPrimary" onClick={() => cameraInputRef.current?.click()}>
            Take Photo
          </button>
          <button className="btn btnSecondary" onClick={() => uploadInputRef.current?.click()}>
            Upload Existing Photo
          </button>
        </div>

        {imageSrc && (
          <div className="specimenPreview">
            <img src={imageSrc} alt="captured printout" />
          </div>
        )}
        {loading && <p className="statusText">Reading values…</p>}
        {parseError && <p className="errorText">{parseError}</p>}
      </section>

      <section className="card">
        <p className="cardEyebrow">CONFIRM VALUES</p>
        <p className="cardNote">Verify against the printout before interpreting.</p>

        <div className="fieldGroupLabel">REQUIRED</div>
        <div className="fieldGrid">
          <label className="field">
            <span className="fieldLabel">pH</span>
            <input className="input mono" value={pH} onChange={(e) => setPH(e.target.value)} placeholder="7.40" />
          </label>
          <label className="field">
            <span className="fieldLabel">pCO2</span>
            <div className="inputWithUnit">
              <input className="input mono" value={pCO2} onChange={(e) => setPCO2(e.target.value)} placeholder="40" />
              <select className="select" value={pCO2Unit} onChange={(e) => setPCO2Unit(e.target.value as Unit)}>
                <option value="mmHg">mmHg</option>
                <option value="kPa">kPa</option>
              </select>
            </div>
          </label>
          <label className="field">
            <span className="fieldLabel">HCO3</span>
            <input className="input mono" value={HCO3} onChange={(e) => setHCO3(e.target.value)} placeholder="24" />
          </label>
        </div>

        <div className="fieldGroupLabel">OPTIONAL — REFINES DIFFERENTIAL</div>
        <div className="fieldGrid">
          <label className="field">
            <span className="fieldLabel">Na</span>
            <input className="input mono" value={Na} onChange={(e) => setNa(e.target.value)} placeholder="140" />
          </label>
          <label className="field">
            <span className="fieldLabel">Cl</span>
            <input className="input mono" value={Cl} onChange={(e) => setCl(e.target.value)} placeholder="100" />
          </label>
          <label className="field">
            <span className="fieldLabel">K</span>
            <input className="input mono" value={K} onChange={(e) => setK(e.target.value)} placeholder="4.0" />
          </label>
          <label className="field">
            <span className="fieldLabel">Lactate</span>
            <input className="input mono" value={lactate} onChange={(e) => setLactate(e.target.value)} placeholder="1.0" />
          </label>
          <label className="field">
            <span className="fieldLabel">Glucose</span>
            <input className="input mono" value={glucose} onChange={(e) => setGlucose(e.target.value)} placeholder="100" />
          </label>
          <label className="field">
            <span className="fieldLabel">If respiratory: duration</span>
            <select className="select selectFull" value={duration} onChange={(e) => setDuration(e.target.value as AcuteChronic)}>
              <option value="acute">Acute</option>
              <option value="chronic">Chronic</option>
            </select>
          </label>
        </div>

        <button className="btn btnPrimary interpretBtn" onClick={handleInterpret}>
          Interpret
        </button>
      </section>

      {interpretation && tag && (
        <section className="panel">
          <p className="panelEyebrow">READING</p>

          <div className="gaugeWrap">
            <div className="gaugeTrack">
              <div className="gaugeZone" style={{ width: `${ACID_END}%`, background: "var(--crimson)" }} />
              <div
                className="gaugeZone"
                style={{ width: `${NORMAL_END - ACID_END}%`, background: "var(--teal)" }}
              />
              <div
                className="gaugeZone"
                style={{ width: `${100 - NORMAL_END}%`, background: "var(--azure)" }}
              />
              {markerPct !== null && (
                <div className="gaugeMarker" style={{ left: `${markerPct}%` }} />
              )}
            </div>
            <div className="gaugeLabels">
              <span>6.9</span>
              <span>7.35</span>
              <span>7.45</span>
              <span>7.8</span>
            </div>
          </div>

          <div className="resultHeader">
            <span className="statusBadge" style={{ background: tag.color }}>
              {tag.label}
            </span>
          </div>
          <h2 className="resultHeadline">{interpretation.primaryDisorder}</h2>

          {interpretation.compensation.verdict !== "not assessed" && (
            <div className="row">
              <span className="rowLabel">Compensation</span>
              <span className="rowValue mono">{interpretation.compensation.verdict}</span>
              <span className="rowDetail">
                {interpretation.compensation.formulaUsed} — expected{" "}
                {interpretation.compensation.expected.toFixed(1)} (range{" "}
                {interpretation.compensation.expectedRange[0].toFixed(1)}–
                {interpretation.compensation.expectedRange[1].toFixed(1)}), actual{" "}
                {interpretation.compensation.actual.toFixed(1)}
              </span>
            </div>
          )}

          {interpretation.anionGap && (
            <div className="row">
              <span className="rowLabel">Anion gap</span>
              <span className="rowValue mono">
                {interpretation.anionGap.value} ({interpretation.anionGap.category})
              </span>
            </div>
          )}

          {interpretation.deltaDelta && (
            <div className="row">
              <span className="rowLabel">Delta-delta</span>
              <span className="rowValue mono">{interpretation.deltaDelta.ratio}</span>
              <span className="rowDetail">{interpretation.deltaDelta.interpretation}</span>
            </div>
          )}

          {interpretation.caveat && <div className="caveat">⚠ {interpretation.caveat}</div>}

          {interpretation.differentials.length > 0 && (
            <div className="diffSection">
              <p className="panelEyebrow">DIFFERENTIAL DIAGNOSES</p>
              {interpretation.differentials.map((group, i) => (
                <div className="diffGroup" key={i}>
                  <p className="diffTitle">{group.title}</p>
                  <ul className="diffList">
                    {group.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                  {group.note && <p className="diffNote">→ {group.note}</p>}
                </div>
              ))}
            </div>
          )}

          <p className="disclaimer">Decision support only — confirm against clinical context.</p>
        </section>
      )}
      
      <footer className="footer">
        © 2026 Jeremy Choi
      </footer>

      <style jsx>{`
        .page {
          max-width: 560px;
          margin: 0 auto;
          padding: 32px 20px 64px;
        }
        .header {
          text-align: center;
          margin-bottom: 28px;
        }
        .eyebrow {
          font-family: var(--font-display);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: var(--ink-soft);
          margin: 0 0 8px;
        }
        .headline {
          font-family: var(--font-display);
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 8px;
          letter-spacing: -0.01em;
        }
        .sub {
          color: var(--ink-soft);
          font-size: 14px;
          margin: 0;
        }
        .card {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .cardEyebrow {
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: var(--ink-soft);
          margin: 0 0 12px;
        }
        .cardNote {
          font-size: 13px;
          color: var(--ink-soft);
          margin: -6px 0 14px;
        }
        .btnRow {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn {
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 600;
          padding: 11px 18px;
          border-radius: 9px;
          cursor: pointer;
          border: 1.5px solid transparent;
          transition: transform 0.12s ease, opacity 0.12s ease;
        }
        .btn:hover {
          opacity: 0.9;
        }
        .btn:active {
          transform: scale(0.98);
        }
        .btnPrimary {
          background: var(--teal);
          color: #fff;
        }
        .btnSecondary {
          background: transparent;
          border-color: var(--line);
          color: var(--ink);
        }
        .interpretBtn {
          width: 100%;
          margin-top: 18px;
          padding: 13px;
        }
        .specimenPreview {
          margin-top: 16px;
          border: 1px solid var(--line);
          border-radius: 10px;
          overflow: hidden;
        }
        .specimenPreview img {
          display: block;
          width: 100%;
        }
        .statusText {
          color: var(--ink-soft);
          font-size: 13px;
        }
        .errorText {
          color: var(--crimson);
          font-size: 13px;
        }
        .fieldGroupLabel {
          font-family: var(--font-display);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: var(--ink-soft);
          margin: 18px 0 10px;
        }
        .fieldGrid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .fieldLabel {
          font-size: 12px;
          color: var(--ink-soft);
          font-weight: 500;
        }
        .input,
        .select {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 9px 10px;
          font-size: 14px;
          background: var(--paper);
          color: var(--ink);
        }
        .input.mono {
          font-family: var(--font-mono);
        }
        .inputWithUnit {
          display: flex;
          gap: 6px;
        }
        .inputWithUnit .input {
          flex: 1;
        }
        .inputWithUnit .select {
          width: 78px;
        }
        .selectFull {
          width: 100%;
        }
        .panel {
          background: var(--panel-dark);
          color: var(--panel-text);
          border-radius: 14px;
          padding: 24px 20px;
          animation: fadeInUp 0.35s ease;
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .panelEyebrow {
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: #8fa39a;
          margin: 0 0 16px;
        }
        .gaugeWrap {
          margin-bottom: 22px;
        }
        .gaugeTrack {
          position: relative;
          display: flex;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
        }
        .gaugeZone {
          height: 100%;
          opacity: 0.85;
        }
        .gaugeMarker {
          position: absolute;
          top: -4px;
          width: 3px;
          height: 16px;
          background: #fff;
          border-radius: 2px;
          box-shadow: 0 0 6px rgba(255, 255, 255, 0.7);
          transform: translateX(-1.5px);
        }
        .gaugeLabels {
          display: flex;
          justify-content: space-between;
          font-family: var(--font-mono);
          font-size: 11px;
          color: #6f7d77;
          margin-top: 6px;
        }
        .resultHeader {
          margin-bottom: 6px;
        }
        .statusBadge {
          display: inline-block;
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: #fff;
          padding: 4px 10px;
          border-radius: 100px;
        }
        .resultHeadline {
          font-family: var(--font-display);
          font-size: 24px;
          font-weight: 700;
          margin: 6px 0 18px;
          text-transform: capitalize;
        }
        .row {
          border-top: 1px solid var(--panel-line);
          padding: 12px 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .rowLabel {
          font-size: 11px;
          letter-spacing: 0.06em;
          color: #8fa39a;
          text-transform: uppercase;
        }
        .rowValue {
          font-size: 15px;
        }
        .rowDetail {
          font-size: 12px;
          color: #8a958f;
          line-height: 1.5;
        }
        .caveat {
          margin-top: 14px;
          background: rgba(184, 118, 43, 0.15);
          border: 1px solid var(--amber);
          color: #e0b074;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          line-height: 1.5;
        }
        .diffSection {
          margin-top: 22px;
          border-top: 1px solid var(--panel-line);
          padding-top: 18px;
        }
        .diffGroup {
          margin-bottom: 16px;
        }
        .diffTitle {
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 6px;
        }
        .diffList {
          margin: 0;
          padding-left: 18px;
          font-size: 13.5px;
          line-height: 1.7;
          color: #cfd9d3;
        }
        .diffNote {
          font-size: 12.5px;
          color: #7fae9c;
          margin: 8px 0 0;
          line-height: 1.5;
        }
        .disclaimer {
          margin-top: 22px;
          font-size: 11px;
          color: #5e6b64;
          text-align: center;
        }
        .footer {
          margin-top: auto;
          padding-top: 24px;
          text-align: center;
          font-size: 12px;
          color: var(--ink-soft);
        }
        @media (max-width: 420px) {
          .fieldGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}