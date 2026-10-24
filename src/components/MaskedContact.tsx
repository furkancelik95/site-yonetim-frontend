import { useState } from "react";
import { Eye } from "lucide-react";
import { useSiteMutation } from "../api/hooks";

/** +905321112233 → +90 532 *** ** 33 ; a.b@ornek.com → a***@ornek.com */
export const maskPhone = (p: string) => p.replace(/^(\+90\d{3})\d{5}(\d{2})$/, "$1 *** ** $2");
export const maskEmail = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, "$1***$2");

/**
 * Kişisel veri (telefon, e-posta) maskeli gösterilir; "Göster" tıklaması denetim kaydına yazılır
 * (YAP-03 S2, KVKK veri minimizasyonu). Servis isteği 20: backend yanıtı maskeli dönüp açma ucunu sunar.
 */
export function MaskedContact({ personId, phone, email }: { personId: string; phone: string | null; email: string | null }) {
  const [shown, setShown] = useState(false);
  const view = useSiteMutation<Record<string, never>, undefined>("POST", `/people/${personId}/contact-views`);
  if (!phone && !email) return <span className="muted">—</span>;
  const parts = shown ? [phone, email] : [phone && maskPhone(phone), email && maskEmail(email)];
  return (
    <span className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
      <span className="small">{parts.filter(Boolean).join(" · ")}</span>
      {!shown && (
        <button className="btn btn--ghost btn--sm" type="button" disabled={view.isPending} title="Görüntüleme denetim kaydına yazılır" onClick={() => view.mutate({}, { onSuccess: () => setShown(true) })}>
          <Eye aria-hidden="true" /> Göster
        </button>
      )}
    </span>
  );
}
