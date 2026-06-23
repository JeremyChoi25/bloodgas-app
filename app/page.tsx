"use client";
import { useRef, useState } from "react";

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageSrc(URL.createObjectURL(file));
    setLoading(true);
    setResult(null);

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
      setResult(`Error: ${data.error}`);
    } else {
      setResult(data.raw);
    }
  } catch (err: any) {
    setResult(`Request failed: ${err.message}`);
  }
  setLoading(false);
};
    reader.readAsDataURL(file);
  };

  return (
    <main style={{ padding: 24, textAlign: "center" }}>
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
      {imageSrc && <img src={imageSrc} alt="captured" style={{ maxWidth: "100%", marginTop: 20 }} />}
      {loading && <p>Reading values…</p>}
      {result && (
        <pre style={{ textAlign: "left", background: "#f4f4f4", padding: 12, marginTop: 20 }}>
          {result}
        </pre>
      )}
    </main>
  );
} 