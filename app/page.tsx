"use client";
import { useRef, useState } from "react";

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImageSrc(URL.createObjectURL(file));
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
      <button onClick={() => fileInputRef.current?.click()}>
        📷 Take Photo of Printout
      </button>
      {imageSrc && (
        <div style={{ marginTop: 20 }}>
          <img src={imageSrc} alt="captured" style={{ maxWidth: "100%" }} />
        </div>
      )}
    </main>
  );
}