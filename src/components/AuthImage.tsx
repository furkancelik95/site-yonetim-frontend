import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { blobUrl } from "../api/client";

/**
 * Yetki isteyen görsel (saha fotoğrafı). `<img src>` oturum başlığı taşımadığı için görsel yetkili
 * istekle alınır, geçici adresle gösterilir ve bileşen kapanınca adres bırakılır.
 * `path` API köküne göre: `/sites/{slug}/operation-photos/{id}`.
 */
export function AuthImage({ path, alt, size = 40 }: { path: string; alt: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null); setFailed(false);
    blobUrl(path)
      .then((u) => { made = u; if (alive) setUrl(u); else URL.revokeObjectURL(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  const box = { width: size, height: size, borderRadius: 4, verticalAlign: "middle" as const };
  if (failed) return <span title="Fotoğraf yüklenemedi" role="img" aria-label={`${alt} yüklenemedi`} style={{ ...box, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)" }}><ImageOff aria-hidden="true" size={16} /></span>;
  if (!url) return <span role="img" aria-label={`${alt} yükleniyor`} style={{ ...box, display: "inline-block", background: "var(--bg-sunken)" }} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Büyüt">
      <img src={url} alt={alt} style={{ ...box, objectFit: "cover" }} />
    </a>
  );
}
