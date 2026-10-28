import { useId, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { download } from "../api/client";
import { useSiteMutation } from "../api/hooks";
import type { Schemas } from "../api/types";
import { useSite } from "../site/SiteContext";
import { useToast } from "./toast";
import { FormError, fieldError } from "./ui";
import { formatDate } from "../lib/format";

type LinkedDoc = Schemas["LinkedDocumentOut"];
export type SubjectType = "insurance_policies" | "insurance_claims" | "technical_assets";

/** Belge arşivindeki dosyayı (son sürüm) yetkili istekle indirir. */
export function useLinkedDownload() {
  const { site } = useSite();
  const toast = useToast();
  return (id: string, title: string) => download(`/sites/${site.slug}/subject-documents/${id}/download`, undefined, title).catch(() => toast("Belge indirilemedi.", "danger"));
}

/**
 * Kayda bağlı belgeler (poliçe, hasar dosyası, teknik varlık): liste + indirme + ekleme.
 * Dosya belge arşivine "yalnız yönetim" gizliliğiyle yazılır (`POST /subject-documents`).
 */
export function LinkedDocuments({ subjectType, subjectId, docs, canManage, compact }: { subjectType: SubjectType; subjectId: string; docs: LinkedDoc[]; canManage: boolean; compact?: boolean }) {
  const id = useId();
  const dl = useLinkedDownload();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const m = useSiteMutation<FormData, LinkedDoc>("POST", "/subject-documents", { form: true, onSuccess: () => { setOpen(false); setTitle(""); setFile(null); } });
  function pick(fl: File | undefined) {
    setFileErr(null); setFile(null);
    if (!fl) return;
    if (fl.size > 10 * 1024 * 1024) { setFileErr("Dosya en fazla 10 MB."); return; }
    setFile(fl);
  }
  function submit() {
    if (!file) { setFileErr("Dosya seçin."); return; }
    const fd = new FormData();
    fd.set("subject_type", subjectType); fd.set("subject_id", subjectId);
    if (title.trim()) fd.set("title", title.trim());
    fd.set("file", file, file.name);
    m.mutate(fd);
  }
  return (
    <div className="stack" style={{ gap: "var(--s-1)" }}>
      {docs.map((d) => (
        <div key={d.id} className="row small" style={{ gap: "var(--s-2)", alignItems: "center" }}>
          <FileText aria-hidden="true" size={14} />
          <button type="button" className="btn btn--ghost btn--sm" style={{ paddingLeft: 0 }} onClick={() => dl(d.id, d.title)}>{d.title}</button>
          {!compact && <span className="xs muted">{d.version > 1 ? `${d.version}. sürüm · ` : ""}{formatDate(d.updated_at ?? d.created_at)}</span>}
        </div>
      ))}
      {canManage && (open ? (
        <div className="stack" style={{ gap: "var(--s-2)" }}>
          <FormError error={m.error} />
          <div className="field"><label className="field__label" htmlFor={`${id}-t`}>Belge adı</label><input id={`${id}-t`} className="field__input" maxLength={80} placeholder="boş: dosya adı" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-f`}>Dosya (PDF, PNG, JPEG, WebP · ≤ 10 MB) *</label>
            <input id={`${id}-f`} className="field__input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
            {(fileErr || fieldError(m.error, "file")) && <span className="field__error" role="alert">{fileErr ?? fieldError(m.error, "file")}</span>}
          </div>
          <div className="row" style={{ gap: "var(--s-2)" }}>
            <button type="button" className="btn btn--sm btn--primary" disabled={m.isPending} onClick={submit}>Yükle</button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(false)}>Vazgeç</button>
          </div>
        </div>
      ) : <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}><Paperclip aria-hidden="true" /> Belge ekle</button></div>)}
    </div>
  );
}
