import { useId, useState } from "react";
import { Camera, X } from "lucide-react";

/**
 * Fotoğraf kanıtı (sayaç, denetim, görev). Telefonda kamerayı açar; seçilen görsel tarayıcıda küçültülür
 * (en uzun kenar 480 px, JPEG) ve veri adresi olarak döner. Kalıcı dosya deposu belge modülüyle gelecek
 * (servis gelince yükleme ucu kullanılır); sahte serviste küçük önizleme saklanır.
 */
export function PhotoInput({ label = "Fotoğraf", required, value, onChange, error }: { label?: string; required?: boolean; value: string | null; onChange: (v: string | null) => void; error?: string }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const img = await createImageBitmap(file);
      const k = Math.min(1, 480 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      onChange(c.toDataURL("image/jpeg", 0.6));
    } finally { setBusy(false); }
  }
  return (
    <div className="field">
      <span className="field__label" id={`${id}-l`}>{label}{required && " *"}</span>
      {value ? (
        <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}>
          <img src={value} alt="Eklenen fotoğraf" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(null)}><X aria-hidden="true" /> Kaldır</button>
        </div>
      ) : (
        <label className="btn btn--sm" style={{ width: "fit-content", cursor: "pointer" }} aria-labelledby={`${id}-l`}>
          <Camera aria-hidden="true" /> {busy ? "Hazırlanıyor…" : "Fotoğraf ekle"}
          <input type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      )}
      {error && <span className="field__error" role="alert">{error}</span>}
    </div>
  );
}
