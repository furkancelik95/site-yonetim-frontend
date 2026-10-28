import { useState } from "react";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { download } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { ResidentHead } from "../../components/ResidentHead";
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
      <ResidentHead icon={<FileText />} tone="violet" title="Belgeler" sub="Yönetimin sakinlerle paylaştığı belgeler ve yalnız bölümünüze özel olanlar. Her belgenin son sürümü indirilir."
        stats={q.data && [
          { label: "Belge", value: q.data.total },
          { label: "Bölümünüze özel", value: q.data.items.filter((d) => d.confidentiality === "unit").length },
        ]} />
      <div className="r-wide stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={err} />
        {q.isPending ? <Loading /> : !q.data || q.data.items.length === 0 ? <Empty title="Belge yok" icon={<FileText aria-hidden="true" />}>Yönetim bir belge paylaştığında burada görünür.</Empty> : (
          <div className="r-list">
            {q.data.items.map((d) => (
              <div key={d.id} className="r-item"><div style={{ flex: 1, minWidth: 0 }}>
                <div className="r-item__title">{d.title} {d.confidentiality === "unit" && <Badge tone="info">Bölümünüze özel</Badge>}</div>
                <div className="r-item__meta">{d.kind_label} · sürüm {d.version} · {formatDate(d.updated_at)}{d.valid_until && ` · geçerlilik ${formatDate(d.valid_until)}`}</div>
              </div><button className="btn btn--sm" type="button" onClick={() => dl(d.id, d.file_name)}><Download aria-hidden="true" /> İndir</button></div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

type MyReq = Schemas["MyPrivacyRequestOut"];
type MyPrivacy = Schemas["MyPrivacyOut"];

/** Kişisel verilerim (RAP-04, sakin): KVKK ilgili kişi başvurusu ve yanıtları; aydınlatma metni
 * onayları; isteğe bağlı açık rıza (ver / geri çek); "verilerimi indir". */
export function ResidentPrivacyPage() {
  useDocumentTitle("Kişisel verilerim");
  const { site } = useSite();
  const q = useSiteGet<Page<MyReq>>("/resident/privacy-requests", { page_size: 50 });
  const mine = useSiteGet<MyPrivacy>("/my-privacy");
  const [f, setF] = useState({ kind: "access", detail: "" });
  const [err, setErr] = useState<unknown>(null);
  const m = useSiteMutation<typeof f, unknown>("POST", "/resident/privacy-requests", { onSuccess: () => setF({ kind: "access", detail: "" }) });
  const consent = useSiteMutation<{ purpose: string; granted: boolean }, MyPrivacy>("PUT", (v) => `/my-privacy/explicit-consents/${v.purpose}`);
  async function exportMine() { setErr(null); try { await download(`/sites/${site.slug}/my-privacy/data-export`, undefined, `kisisel-verilerim-${site.slug}.json`); } catch (e) { setErr(e); } }
  const openReqs = (q.data?.items ?? []).filter((r) => r.status === "open").length;
  return (
    <>
      <ResidentHead icon={<ShieldCheck />} tone="violet" title="Kişisel verilerim"
        sub={<>KVKK kapsamında verilerinize erişim, düzeltme, silme ya da işlemeye itiraz başvurusu yapabilirsiniz; yönetim 30 gün içinde yanıtlar. <a href={`/aydinlatma?site=${encodeURIComponent(site.slug)}`} target="_blank" rel="noopener noreferrer">Aydınlatma metni</a></>}
        stats={q.data && [
          { label: "Yanıt bekleyen", value: openReqs, tone: openReqs ? "warn" : undefined },
          { label: "Yanıtlanan", value: q.data.items.length - openReqs },
        ]} />
      <div className="r-split">
      <div className="r-split__col">
      <div className="section-title">Onaylar ve verileriniz</div>
      <div className="card">
        <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
          <FormError error={err ?? consent.error} />
          {mine.data && <>
            <div className="small">{mine.data.notice ? <>Aydınlatma metni sürüm {mine.data.notice.version}{mine.data.accepted[0] ? ` · onayladınız: ${formatDateTime(mine.data.accepted[0].accepted_at)}` : ""}</> : "Site henüz aydınlatma metni yayınlamadı."}</div>
            {mine.data.explicit.map((x) => (
              <label key={x.purpose} className="check check--rich">
                <input type="checkbox" checked={x.granted} disabled={consent.isPending} onChange={(e) => consent.mutate({ purpose: x.purpose, granted: e.target.checked })} />
                <span><span className="strong">Açık rıza (isteğe bağlı)</span><br /><span className="small muted">{x.label}. İstediğiniz zaman geri çekebilirsiniz; hizmetler etkilenmez.{x.changed_at ? ` Son değişiklik: ${formatDateTime(x.changed_at)}.` : ""}</span></span>
              </label>
            ))}
          </>}
          <div><button className="btn btn--sm" type="button" onClick={exportMine}><Download aria-hidden="true" /> Verilerimi indir (JSON)</button></div>
        </div>
      </div>
      <div className="section-title">Yeni başvuru</div>
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(f); }}>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={m.error} />
          <Field label="Başvuru türü" error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{Object.entries(PRIV_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          <Field label="Açıklama" hint={f.kind === "access" ? "İsteğe bağlı" : "Neyin düzeltilmesini / silinmesini istediğinizi yazın"} error={fieldError(m.error, "detail")}>{(p) => <textarea {...p} className="field__input" rows={3} maxLength={1000} value={f.detail} onChange={(e) => setF((x) => ({ ...x, detail: e.target.value }))} />}</Field>
          {f.kind === "erase" && <p className="xs muted mb-0">Aidat, tahsilat gibi finansal kayıtlar yasal saklama süresince silinemez; yanıtta gerekçesi belirtilir.</p>}
          <SubmitButton busy={m.isPending}>Başvur</SubmitButton>
        </div>
      </form>
      </div>
      <div className="r-split__col">
      <div className="section-title">Başvurularım</div>
      {q.isPending ? <Loading /> : (q.data?.items.length ?? 0) === 0 && <Empty title="Başvurunuz yok" icon={<ShieldCheck aria-hidden="true" />}>KVKK başvurularınız ve yönetimin yanıtları burada görünür.</Empty>}
      {(q.data?.items ?? []).map((r) => (
        <div key={r.id} className="r-item"><div style={{ flex: 1, minWidth: 0 }}>
          <div className="r-item__title">{r.kind_label} {r.status === "open" ? <Badge tone="warn">Yanıt bekleniyor</Badge> : <Badge tone="ok">{r.outcome_label ?? "Yanıtlandı"}</Badge>}</div>
          <div className="r-item__meta">{formatDateTime(r.created_at)} · son gün {formatDate(r.due_on)}</div>
          {r.response && <div className="r-item__body">{r.response}{r.retained && <div className="small">Saklanan: {r.retained}</div>}</div>}
        </div></div>
      ))}
      </div>
      </div>
    </>
  );
}
