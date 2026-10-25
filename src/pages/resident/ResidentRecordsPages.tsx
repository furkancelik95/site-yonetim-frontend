import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { download } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Badge, Empty, Field, FormError, Loading, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { useSite } from "../../site/SiteContext";
import type { Page, Schemas } from "../../api/types";
import { PRIV_KIND } from "../site/RecordsPages";

/** Belgeler (RAP-03, sakin; backend `…/resident/documents`): sakinlere açık ve kendi bölümüne özel belgeler. */
export function ResidentDocumentsPage() {
  useDocumentTitle("Belgeler");
  const { site } = useSite();
  const q = useSiteGet<Page<Schemas["ResidentDocumentOut"]>>("/resident/documents", { page_size: 200 });
  const [err, setErr] = useState<unknown>(null);
  async function dl(id: string, name: string) { setErr(null); try { await download(`/sites/${site.slug}/resident/documents/${id}/download`, undefined, name); } catch (e) { setErr(e); } }
  return (
    <>
      <div className="section-title">Belgeler</div>
      <FormError error={err} />
      {q.isPending ? <Loading /> : !q.data || q.data.items.length === 0 ? <Empty title="Belge yok" icon={<FileText aria-hidden="true" />} /> : q.data.items.map((d) => (
        <div key={d.id} className="r-item"><div style={{ flex: 1, minWidth: 0 }}>
          <div className="r-item__title">{d.title} {d.confidentiality === "unit" && <Badge tone="info">Bölümünüze özel</Badge>}</div>
          <div className="r-item__meta">{d.kind_label} · sürüm {d.version} · {formatDate(d.updated_at)}{d.valid_until && ` · geçerlilik ${formatDate(d.valid_until)}`}</div>
        </div><button className="btn btn--sm" type="button" onClick={() => dl(d.id, d.file_name)}><Download aria-hidden="true" /> İndir</button></div>
      ))}
    </>
  );
}

interface MyReq { id: string; kind: string; detail: string; status: string; created_at: string; due_on: string; response: string | null; outcome: string | null; retained: string | null; answered_at: string | null }

/** Kişisel verilerim (RAP-04, sakin): KVKK ilgili kişi başvurusu ve yanıtları. */
export function ResidentPrivacyPage() {
  useDocumentTitle("Kişisel verilerim");
  const q = useSiteGet<MyReq[]>("/resident/privacy-requests");
  const [f, setF] = useState({ kind: "access", detail: "" });
  const m = useSiteMutation<typeof f, unknown>("POST", "/resident/privacy-requests", { onSuccess: () => setF({ kind: "access", detail: "" }) });
  return (
    <>
      <div className="section-title">Kişisel verilerim</div>
      <p className="small muted">KVKK kapsamında verilerinize erişim, düzeltme, silme ya da işlemeye itiraz başvurusu yapabilirsiniz; yönetim 30 gün içinde yanıtlar. <a href="/aydinlatma" target="_blank" rel="noopener noreferrer">Aydınlatma metni</a></p>
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(f); }}>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={m.error} />
          <Field label="Başvuru türü" error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{Object.entries(PRIV_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          <Field label="Açıklama" hint={f.kind === "access" ? "İsteğe bağlı" : "Neyin düzeltilmesini / silinmesini istediğinizi yazın"} error={fieldError(m.error, "detail")}>{(p) => <textarea {...p} className="field__input" rows={3} maxLength={1000} value={f.detail} onChange={(e) => setF((x) => ({ ...x, detail: e.target.value }))} />}</Field>
          {f.kind === "erase" && <p className="xs muted mb-0">Aidat, tahsilat gibi finansal kayıtlar yasal saklama süresince silinemez; yanıtta gerekçesi belirtilir.</p>}
          <SubmitButton busy={m.isPending}>Başvur</SubmitButton>
        </div>
      </form>
      {(q.data ?? []).map((r) => (
        <div key={r.id} className="r-item"><div style={{ flex: 1, minWidth: 0 }}>
          <div className="r-item__title">{PRIV_KIND[r.kind]} {r.status === "open" ? <Badge tone="warn">Yanıt bekleniyor</Badge> : <Badge tone="ok">Yanıtlandı</Badge>}</div>
          <div className="r-item__meta">{formatDateTime(r.created_at)} · son gün {formatDate(r.due_on)}</div>
          {r.response && <div className="r-item__body">{r.response}{r.retained && <div className="small">Saklanan: {r.retained}</div>}</div>}
        </div></div>
      ))}
    </>
  );
}
