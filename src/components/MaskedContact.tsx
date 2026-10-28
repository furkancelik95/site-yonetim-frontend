import { useState } from "react";
import { Eye } from "lucide-react";
import { useSiteMutation } from "../api/hooks";
import type { Schemas } from "../api/types";

type Contact = Schemas["ContactOut"];

/**
 * Kişisel veri (telefon, e-posta) backend'den **maskeli** gelir (`+90 532 *** ** 33`, `a***@ornek.com`);
 * "Göster" açık değeri ister ve bu görüntüleme denetim kaydına yazılır (YAP-03 S2, KVKK veri
 * minimizasyonu). İletişim izni olmayan rolde alanlar hiç gelmez (null) — "—" görünür.
 */
export function MaskedContact({ personId, phone, email }: { personId: string; phone: string | null; email: string | null }) {
  const [shown, setShown] = useState<Contact | null>(null);
  const view = useSiteMutation<Record<string, never>, Contact>("POST", `/people/${personId}/contact-views`, { onSuccess: (c) => setShown(c) });
  if (!phone && !email) return <span className="muted">—</span>;
  const parts = shown ? [shown.phone, shown.email] : [phone, email];
  return (
    <span className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
      <span className="small">{parts.filter(Boolean).join(" · ")}</span>
      {!shown && (
        <button className="btn btn--ghost btn--sm" type="button" disabled={view.isPending} title="Görüntüleme denetim kaydına yazılır" onClick={() => view.mutate({})}>
          <Eye aria-hidden="true" /> Göster
        </button>
      )}
    </span>
  );
}
