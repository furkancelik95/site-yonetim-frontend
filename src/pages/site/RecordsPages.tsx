import { useState } from "react";
import { Download, FileText, Info, Plus, Upload } from "lucide-react";
import { Link } from "react-router";
import { api } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Badge, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { requestCategory } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 78–81'deki şekiller. */
export interface DocRow { id: string; title: string; kind: string; scope: string; scope_name: string | null; confidentiality: string; valid_until: string | null; days_left: number | null; warning: string | null; version: number; file_name: string; size: number; sha256?: string; uploaded_by?: string; updated_at: string; versions?: { v: number; file_name: string; size: number; sha256: string; uploaded_by: string; at: string }[] }
interface CatalogItem { key: string; name: string; group: string; link: string; metrics: { name: string; definition: string }[] }
interface SlaLine { total: number; open: number; closed: number; sla_rate: number | null; avg_hours: number | null; satisfaction: number | null; rated: number }
interface PReq { id: string; kind: string; detail: string; name: string; units: string[]; status: string; created_at: string; due_on: string; days_left: number; response: string | null; outcome: string | null; retained: string | null; answered_by: string | null; answered_at: string | null }
interface Notice { version: number; text: string; summary: string; published_at: string; published_by: string }
interface Pkg { id: string; title: string; from: string; to: string; created_by: string; created_at: string; decisions: { no: number; item_title: string; decision: string; date: string }[]; document_ids: string[]; status: string; report_document_id: string | null; reviewed_by: string | null; reviewed_at: string | null; note: string | null }

export const DOC_KIND: Record<string, string> = { plan: "Yönetim planı", rules: "Site kuralları", insurance: "Sigorta poliçesi", fire_report: "Yangın raporu", elevator: "Asansör etiketi / muayene", contract: "Sözleşme", minutes: "Tutanak", financial: "Mali tablo", other: "Diğer" };
export const CONF: Record<string, [string, "ok" | "info" | "warn" | "danger"]> = { public: ["Sakinlere açık", "ok"], unit: ["Bölüme özel", "info"], management: ["Yönetim", "warn"], secret: ["Gizli", "danger"] };
export const PRIV_KIND: Record<string, string> = { access: "Verilerime erişim", rectify: "Düzeltme", erase: "Silme", object: "İtiraz" };
const OUTCOME: Record<string, string> = { fulfilled: "Yerine getirildi", partial: "Kısmen", rejected: "Reddedildi" };
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`);
const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="row" role="tablist" aria-label={label} style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className={`btn btn--sm${v === k ? " btn--primary" : ""}`} onClick={() => set(k)}>{l}</button>)}</div>
);

/** Veri adresini dosya olarak indirir (sunucu dosya ucu gelince doğrudan bağlantı olur). */
export function saveDataUrl(fileName: string, dataUrl: string) {
  const [meta, b64] = dataUrl.split(",");
  const bin = atob(b64 ?? ""); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: meta?.slice(5).split(";")[0] }));
  const a = document.createElement("a"); a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function saveJson(fileName: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ===================================================================== 78 Belge arşivi
/** Belgeler (RAP-03): kapsam, gizlilik, sürüm, özet (SHA-256), geçerlilik uyarısı; gizli belge açılışı kayda geçer. */
export function DocumentsPage() {
  const { can, site } = useSite();
  const [s, set] = useUrlState({ q: "", tur: "", suresi: "" });
  const q = useSiteGet<DocRow[]>("/documents", { q: s.q || undefined, kind: s.tur || undefined, expiring: s.suresi || undefined });
  const [adding, setAdding] = useState(false);
  const warn = (q.data ?? []).filter((d) => d.warning);
  return (
    <div className="stack">
      <PageHead title="Belgeler" subtitle="Yönetim planı, poliçe, yangın raporu, asansör etiketi, sözleşme ve tutanaklar tek arşivde; aynı adla yüklenen dosya yeni sürüm olur." actions={can(P.announcementsPublish) && <button className="btn btn--primary" type="button" onClick={() => setAdding((v) => !v)}><Upload aria-hidden="true" /> Belge yükle</button>} />
      {adding && <DocForm onDone={() => setAdding(false)} />}
      {warn.length > 0 && <Alert tone="warn" title="Geçerliliği biten / yaklaşan belge">{warn.map((d) => `${d.title} (${d.warning === "expired" ? "süresi doldu" : `${d.days_left} gün`})`).join(", ")}</Alert>}
      <div className="filters">
        <div className="field"><label className="field__label" htmlFor="dc-q">Ara</label><input id="dc-q" className="field__input" type="search" value={s.q} onChange={(e) => set({ q: e.target.value })} /></div>
        <div className="field"><label className="field__label" htmlFor="dc-k">Tür</label><select id="dc-k" className="field__input" value={s.tur} onChange={(e) => set({ tur: e.target.value })}><option value="">Tümü</option>{Object.entries(DOC_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <label className="check" style={{ alignSelf: "flex-end" }}><input type="checkbox" checked={!!s.suresi} onChange={(e) => set({ suresi: e.target.checked ? "1" : "" })} /><span>Yalnız süresi yaklaşan</span></label>
      </div>
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Belge yok" icon={<FileText aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Belgeler</caption>
            <thead><tr><th scope="col">Belge</th><th scope="col">Kapsam / gizlilik</th><th scope="col">Geçerlilik</th><th scope="col">Sürüm</th><th scope="col"><span className="visually-hidden">İndir</span></th></tr></thead>
            <tbody>{q.data.map((d) => <DocRowView key={d.id} d={d} slug={site.slug} />)}</tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}

function DocRowView({ d, slug }: { d: DocRow; slug: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const log = useSiteGet<{ by: string; at: string; v: number }[]>(`/documents/${d.id}/access-log`, undefined, { enabled: open && d.confidentiality === "secret" });
  async function dl(v: number) {
    setErr(null);
    try { const r = await api<{ file_name: string; data_url: string }>("GET", `/sites/${slug}/documents/${d.id}/versions/${v}/download`); saveDataUrl(r.file_name, r.data_url); } catch (e) { setErr(e); }
  }
  return (
    <>
      <tr>
        <td><div className="cell-main">{d.title}</div><div className="cell-sub">{DOC_KIND[d.kind]} · {d.file_name} · {kb(d.size)}</div></td>
        <td className="small">{d.scope === "site" ? "Tüm site" : d.scope_name}<div><Badge tone={CONF[d.confidentiality]![1]}>{CONF[d.confidentiality]![0]}</Badge></div></td>
        <td className="small nowrap">{d.valid_until ? <>{formatDate(d.valid_until)}{d.warning && <div><Badge tone={d.warning === "expired" ? "danger" : "warn"}>{d.warning === "expired" ? "Süresi doldu" : `${d.days_left} gün kaldı`}</Badge></div>}</> : "—"}</td>
        <td className="small"><button className="btn btn--ghost btn--sm" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>v{d.version}{(d.versions?.length ?? 1) > 1 ? ` · ${d.versions!.length} sürüm` : ""}</button></td>
        <td className="right"><button className="btn btn--sm" type="button" onClick={() => dl(d.version)}><Download aria-hidden="true" /> İndir</button></td>
      </tr>
      {(open || err != null) && <tr><td colSpan={5}>
        <FormError error={err} />
        {open && <div className="stack" style={{ gap: 4 }}>
          {(d.versions ?? []).slice().reverse().map((v) => <div key={v.v} className="small row" style={{ gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}><strong>v{v.v}</strong> {v.file_name} · {kb(v.size)} · {v.uploaded_by}, {formatDateTime(v.at)} · <span className="mono xs" title="SHA-256">{v.sha256.slice(0, 16)}…</span><button className="btn btn--ghost btn--sm" type="button" onClick={() => dl(v.v)}>İndir</button></div>)}
          {d.confidentiality === "secret" && <div className="xs muted">Açılış kaydı: {(log.data ?? []).length ? log.data!.map((x) => `${x.by} (v${x.v}, ${formatDateTime(x.at)})`).join("; ") : "henüz açılmadı"}</div>}
        </div>}
      </td></tr>}
    </>
  );
}

function DocForm({ onDone }: { onDone: () => void }) {
  const blocks = useSiteGet<Page<{ id: string; name: string }>>("/blocks", { page_size: 200 });
  const [f, setF] = useState({ title: "", kind: "plan", scope: "site", block_id: "", confidentiality: "public", valid_until: "" });
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [file, setFile] = useState<{ name: string; data: string; size: number } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const m = useSiteMutation<Record<string, unknown>, DocRow>("POST", "/documents", { onSuccess: onDone });
  function pick(fl: File | undefined) {
    setFileErr(null); if (!fl) return;
    if (fl.size > 2 * 1024 * 1024) { setFileErr("Dosya en fazla 2 MB (şimdilik)."); return; }
    const r = new FileReader(); r.onload = () => setFile({ name: fl.name, data: String(r.result), size: fl.size }); r.readAsDataURL(fl);
  }
  const block = (blocks.data?.items ?? []).find((b) => b.id === f.block_id);
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ title: f.title, kind: f.kind, scope: f.scope, scope_id: f.scope === "block" ? f.block_id : f.scope === "unit" ? unit?.id : null, scope_name: f.scope === "block" ? block?.name : f.scope === "unit" ? unit?.name : null, confidentiality: f.confidentiality, valid_until: f.valid_until || null, file_name: file?.name, data_url: file?.data }); }}>
      <div className="card__head"><span className="card__title">Belge yükle</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Belge adı" required hint="Aynı ad ve kapsamla yüklenen dosya yeni sürüm olur" error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
          <Field label="Tür" error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{Object.entries(DOC_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          <Field label="Kapsam" error={fieldError(m.error, "scope")}>{(p) => <select {...p} className="field__input" value={f.scope} onChange={(e) => setF((x) => ({ ...x, scope: e.target.value, confidentiality: e.target.value !== "unit" && x.confidentiality === "unit" ? "public" : x.confidentiality }))}><option value="site">Tüm site</option><option value="block">Blok</option><option value="unit">Bölüm</option></select>}</Field>
          {f.scope === "block" && <Field label="Blok">{(p) => <select {...p} className="field__input" value={f.block_id} onChange={(e) => setF((x) => ({ ...x, block_id: e.target.value }))}><option value="">Seçin</option>{(blocks.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</Field>}
          {f.scope === "unit" && <UnitPicker label="Bölüm" value={unit} onChange={setUnit} />}
          <Field label="Gizlilik" error={fieldError(m.error, "confidentiality")}>{(p) => <select {...p} className="field__input" value={f.confidentiality} onChange={(e) => setF((x) => ({ ...x, confidentiality: e.target.value }))}>{Object.entries(CONF).filter(([k]) => k !== "unit" || f.scope === "unit").map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          <Field label="Geçerlilik bitişi" hint="Poliçe, yangın raporu, asansör etiketi gibi süreli belgelerde; 60/30 gün kala uyarı" error={fieldError(m.error, "valid_until")}>{(p) => <input {...p} className="field__input" type="date" value={f.valid_until} onChange={(e) => setF((x) => ({ ...x, valid_until: e.target.value }))} />}</Field>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="dc-file">Dosya (PDF, PNG, JPEG)</label>
          <input id="dc-file" className="field__input" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => pick(e.target.files?.[0])} />
          {file && <span className="xs muted">{file.name} · {kb(file.size)}</span>}
          {(fileErr || fieldError(m.error, "file")) && <span className="field__error" role="alert">{fileErr ?? fieldError(m.error, "file")}</span>}
        </div>
        {f.confidentiality === "secret" && <p className="xs muted mb-0">Gizli belgeyi yalnız denetim ve kullanıcı yönetimi yetkisi olanlar açar; her açılış kayda geçer.</p>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!file}>Yükle</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

// ===================================================================== 79 Rapor kataloğu
/** Rapor kataloğu (RAP-01): yalnız yetkili olunan raporlar; her metriğin tek tanımı. */
export function ReportCatalogPage() {
  const { site } = useSite();
  const [s, set] = useUrlState({ rapor: "", q: "" });
  const q = useSiteGet<CatalogItem[]>("/reports/catalog");
  const list = (q.data ?? []).filter((r) => !s.q || `${r.name} ${r.group}`.toLocaleLowerCase("tr-TR").includes(s.q.toLocaleLowerCase("tr-TR")));
  const groups = [...new Set(list.map((r) => r.group))];
  return (
    <div className="stack">
      <PageHead title="Rapor kataloğu" subtitle="Yalnız yetkili olduğunuz raporlar görünür. Her metriğin nasıl hesaplandığı yanında yazar." />
      {s.rapor === "requests_sla" && <SlaReport onClose={() => set({ rapor: "" })} />}
      <div className="field" style={{ maxWidth: "20rem" }}><label className="field__label" htmlFor="rc-q">Ara</label><input id="rc-q" className="field__input" type="search" value={s.q} onChange={(e) => set({ q: e.target.value })} /></div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : groups.map((g) => (
        <div key={g} className="stack" style={{ gap: "var(--s-2)" }}>
          <div className="section-title">{g}</div>
          <div className="grid grid--2">{list.filter((r) => r.group === g).map((r) => (
            <div key={r.key} className="card"><div className="card__head"><span className="card__title">{r.name}</span><Link className="btn btn--sm ml-auto" to={`/s/${site.slug}/${r.link}`}>Aç</Link></div>
              <div className="card__body stack" style={{ gap: 4 }}>{r.metrics.map((x) => <div key={x.name} className="small"><Info aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: "-2px", color: "var(--fg-muted)" }} /> <strong>{x.name}:</strong> {x.definition}</div>)}</div>
            </div>
          ))}</div>
        </div>
      ))}
      <p className="xs muted">Dışa aktarma kayda geçer (PDF/Excel). Planlı rapor e-postası SMS/e-posta sağlayıcısı seçilince (K5).</p>
    </div>
  );
}

function SlaReport({ onClose }: { onClose: () => void }) {
  const [to, setTo] = useState(new Date().toLocaleDateString("sv-SE"));
  const q = useSiteGet<{ from: string; to: string; total: SlaLine; rows: (SlaLine & { category: string })[] }>("/reports/requests-sla", { to });
  const cell = (v: number | null, pct = false) => (v == null ? "—" : pct ? `%${v.toLocaleString("tr-TR")}` : v.toLocaleString("tr-TR"));
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Talep ve SLA raporu</span><span className="card__meta">{q.data ? `${formatDate(q.data.from)} – ${formatDate(q.data.to)}` : ""}</span><button className="btn btn--ghost btn--sm ml-auto" type="button" onClick={onClose}>Kapat</button></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <div className="field" style={{ maxWidth: "12rem" }}><label className="field__label" htmlFor="sla-to">Bitiş (son 30 gün)</label><input id="sla-to" className="field__input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : <>
          <div className="grid grid--kpi"><Kpi label="Talep" value={q.data.total.total} /><Kpi label="SLA uyumu" value={cell(q.data.total.sla_rate, true)} tone={q.data.total.sla_rate != null && q.data.total.sla_rate < 80 ? "warn" : undefined} /><Kpi label="Ort. çözüm (saat)" value={cell(q.data.total.avg_hours)} /><Kpi label="Memnuniyet" value={cell(q.data.total.satisfaction)} note={`${q.data.total.rated} puan`} /></div>
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Kategoriye göre</caption>
            <thead><tr><th scope="col">Kategori</th><th scope="col" className="right">Talep</th><th scope="col" className="right">Açık</th><th scope="col" className="right">SLA</th><th scope="col" className="right">Ort. saat</th><th scope="col" className="right">Puan</th></tr></thead>
            <tbody>{q.data.rows.map((r) => <tr key={r.category}><td>{requestCategory(r.category)}</td><td className="right num">{r.total}</td><td className="right num">{r.open}</td><td className="right num">{cell(r.sla_rate, true)}</td><td className="right num">{cell(r.avg_hours)}</td><td className="right num">{cell(r.satisfaction)}</td></tr>)}</tbody>
          </table></div>
        </>}
      </div>
    </div>
  );
}

// ===================================================================== 80 KVKK
/** KVKK (RAP-04): ilgili kişi başvuruları ve 30 gün sayacı; aydınlatma metni sürümleri. */
export function PrivacyPage() {
  const [s, set] = useUrlState({ sekme: "basvuru" });
  return (
    <div className="stack">
      <PageHead title="KVKK" subtitle="İlgili kişi başvuruları 30 gün içinde yanıtlanır. Finansal kayıtlar yasal saklama süresince silinmez; gerekçesi yanıtta yazılır." />
      {tabs([["basvuru", "Başvurular"], ["metin", "Aydınlatma metni"]], s.sekme, (k) => set({ sekme: k }), "KVKK")}
      {s.sekme === "metin" ? <Notices /> : <Requests />}
    </div>
  );
}

function Requests() {
  const { site } = useSite();
  const q = useSiteGet<PReq[]>("/privacy-requests");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <Empty title="Başvuru yok" />;
  return <div className="stack">{q.data.map((r) => <ReqCard key={r.id} r={r} slug={site.slug} />)}</div>;
}
function ReqCard({ r, slug }: { r: PReq; slug: string }) {
  const [f, setF] = useState({ response: "", outcome: "fulfilled", retained: "" });
  const [err, setErr] = useState<unknown>(null);
  const m = useSiteMutation<Record<string, unknown>, PReq>("POST", `/privacy-requests/${r.id}/answer`);
  async function pkg() { setErr(null); try { saveJson(`kisisel-veri-${r.name.replace(/\s+/g, "-")}.json`, await api<unknown>("GET", `/sites/${slug}/privacy-requests/${r.id}/data-package`)); } catch (e) { setErr(e); } }
  return (
    <div className="card" style={{ borderColor: r.status === "open" && r.days_left <= 7 ? "var(--danger-line)" : undefined }}>
      <div className="card__head"><span className="card__title">{PRIV_KIND[r.kind]} · {r.name}</span><span className="card__meta">{r.units.join(", ")}</span><span className="ml-auto">{r.status === "open" ? <Badge tone={r.days_left <= 7 ? "danger" : "warn"}>{r.days_left >= 0 ? `${r.days_left} gün kaldı` : `${-r.days_left} gün gecikti`}</Badge> : <Badge tone="ok">Yanıtlandı</Badge>}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div className="small">{formatDateTime(r.created_at)} · son gün {formatDate(r.due_on)}{r.detail && ` · "${r.detail}"`}</div>
        <FormError error={err ?? m.error} />
        {r.kind === "access" && <div><button className="btn btn--sm" type="button" onClick={pkg}><Download aria-hidden="true" /> Kişisel veri paketi (JSON)</button></div>}
        {r.status === "answered" ? <div className="small"><strong>{OUTCOME[r.outcome ?? ""]}</strong> — {r.response}{r.retained && <div>Saklanan: {r.retained}</div>}<div className="muted">{r.answered_by}, {formatDateTime(r.answered_at)}</div></div> : (
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            <Field label="Sonuç">{(p) => <select {...p} className="field__input" style={{ maxWidth: "14rem" }} value={f.outcome} onChange={(e) => setF((x) => ({ ...x, outcome: e.target.value }))}>{Object.entries(OUTCOME).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
            {r.kind === "erase" && f.outcome !== "fulfilled" && <Field label="Saklanan kayıtlar ve dayanağı" error={fieldError(m.error, "retained")}>{(p) => <input {...p} className="field__input" placeholder="ör. Tahakkuk ve tahsilat kayıtları — yasal saklama süresi" value={f.retained} onChange={(e) => setF((x) => ({ ...x, retained: e.target.value }))} />}</Field>}
            <Field label="Gerekçeli yanıt" required error={fieldError(m.error, "response")}>{(p) => <textarea {...p} className="field__input" rows={3} maxLength={2000} value={f.response} onChange={(e) => setF((x) => ({ ...x, response: e.target.value }))} />}</Field>
            <div><button className="btn btn--primary btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate(f)}>Yanıtla</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Notices() {
  const { can } = useSite();
  const q = useSiteGet<Notice[]>("/privacy-notices");
  const [f, setF] = useState({ text: "", summary: "" });
  const m = useSiteMutation<typeof f, Notice>("POST", "/privacy-notices", { onSuccess: () => setF({ text: "", summary: "" }) });
  return (
    <div className="stack">
      {can(P.membersManage) && <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(f); }}>
        <div className="card__head"><span className="card__title">Yeni sürüm yayınla</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={m.error} />
          <Field label="Aydınlatma metni (Türkçe, bağlayıcı)" error={fieldError(m.error, "text")}>{(p) => <textarea {...p} className="field__input" rows={8} value={f.text} onChange={(e) => setF((x) => ({ ...x, text: e.target.value }))} />}</Field>
          <Field label="Değişiklik özeti" error={fieldError(m.error, "summary")}>{(p) => <input {...p} className="field__input" maxLength={200} value={f.summary} onChange={(e) => setF((x) => ({ ...x, summary: e.target.value }))} />}</Field>
          <p className="xs muted mb-0">Metin avukat onaylı olmalı. Aydınlatma bilgilendirmedir; onay kutusu ve "yeniden onay" zorunluluğu kurgusu hukuki teyide bağlı (ortaklara soru 2.1).</p>
        </div>
        <div className="card__foot"><SubmitButton busy={m.isPending}><Plus aria-hidden="true" /> Yayınla</SubmitButton></div>
      </form>}
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty title="Sürüm yok">Şu an herkese açık /aydinlatma sayfasındaki taslak metin kullanılıyor.</Empty> : q.data.map((n) => (
        <details key={n.version} className="card"><summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Sürüm {n.version}</span><span className="card__meta">{n.published_by}, {formatDateTime(n.published_at)} · {n.summary}</span></summary><div className="card__body"><p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>{n.text}</p></div></details>
      ))}
    </div>
  );
}

// ===================================================================== 81 Denetim kurulu paketi
/** Denetim kurulu paketi (RAP-05): dönem raporları, karar defteri özeti, belgeler; denetçi raporunu ekler. */
export function AuditPackagesPage() {
  const { can, site } = useSite();
  const q = useSiteGet<Pkg[]>("/audit-packages");
  const docs = useSiteGet<DocRow[]>("/documents");
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack">
      <PageHead title="Denetim kurulu paketi" subtitle="Dönem sonu finansal raporlar, bütçe–gerçekleşme, karar defteri özeti ve belgeler tek pakette; denetçi salt okunur inceler ve raporunu ekler." actions={can(P.chargePost) && <button className="btn btn--primary" type="button" onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Paket hazırla</button>} />
      {adding && <PkgForm docs={docs.data ?? []} onDone={() => setAdding(false)} />}
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.length === 0 ? <Empty title="Paket yok" /> : q.data.map((p) => <PkgCard key={p.id} p={p} docs={docs.data ?? []} slug={site.slug} canReview={can(P.auditRead)} />)}
    </div>
  );
}
function PkgForm({ docs, onDone }: { docs: DocRow[]; onDone: () => void }) {
  const y = new Date().getFullYear();
  const [f, setF] = useState({ title: `${y} yılı denetim dosyası`, from: `${y}-01-01`, to: new Date().toLocaleDateString("sv-SE") });
  const [ids, setIds] = useState<string[]>([]);
  const m = useSiteMutation<Record<string, unknown>, Pkg>("POST", "/audit-packages", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, document_ids: ids }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Paket adı" error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
          <Field label="Dönem başı" error={fieldError(m.error, "from")}>{(p) => <input {...p} className="field__input" type="date" value={f.from} onChange={(e) => setF((x) => ({ ...x, from: e.target.value }))} />}</Field>
          <Field label="Dönem sonu" error={fieldError(m.error, "to")}>{(p) => <input {...p} className="field__input" type="date" value={f.to} onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))} />}</Field>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Eklenecek belgeler</legend>{docs.length === 0 ? <p className="small muted mb-0">Arşivde belge yok.</p> : <div className="stack" style={{ gap: 2 }}>{docs.map((d) => <label key={d.id} className="check"><input type="checkbox" checked={ids.includes(d.id)} onChange={() => setIds((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} /><span>{d.title} <span className="xs muted">({DOC_KIND[d.kind]})</span></span></label>)}</div>}</fieldset>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Paketi hazırla</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
function PkgCard({ p, docs, slug, canReview }: { p: Pkg; docs: DocRow[]; slug: string; canReview: boolean }) {
  const [docId, setDocId] = useState("");
  const [note, setNote] = useState("");
  const m = useSiteMutation<Record<string, unknown>, Pkg>("POST", `/audit-packages/${p.id}/report`);
  const base = `/s/${slug}`;
  const rep = docs.find((d) => d.id === p.report_document_id);
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">{p.title}</span><span className="card__meta">{formatDate(p.from)} – {formatDate(p.to)}</span><span className="ml-auto">{p.status === "reviewed" ? <Badge tone="ok">Denetlendi</Badge> : <Badge tone="warn">Denetim bekliyor</Badge>}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <Link className="btn btn--sm" to={`${base}/raporlar?year=${p.to.slice(0, 4)}`}>Gelir–gider</Link>
          <Link className="btn btn--sm" to={`${base}/isletme-projesi`}>Bütçe–gerçekleşme</Link>
          <Link className="btn btn--sm" to={`${base}/kasa`}>Kasa ve banka</Link>
          <Link className="btn btn--sm" to={`${base}/karar-defteri`}>Karar defteri</Link>
        </div>
        <div className="small"><strong>Kararlar ({p.decisions.length}):</strong> {p.decisions.length ? p.decisions.map((d) => `No ${d.no} ${d.item_title}`).join(" · ") : "dönemde karar yok"}</div>
        <div className="small"><strong>Belgeler ({p.document_ids.length}):</strong> {p.document_ids.map((id) => docs.find((d) => d.id === id)?.title ?? "—").join(" · ") || "—"}</div>
        <div className="xs muted">{p.created_by}, {formatDateTime(p.created_at)}</div>
        {p.status === "reviewed" ? <div className="small">Denetim raporu: <strong>{rep?.title ?? "—"}</strong> · {p.reviewed_by}, {formatDateTime(p.reviewed_at)}{p.note && ` · ${p.note}`}</div> : canReview && (
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            <FormError error={m.error} />
            <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
              <Field label="Denetim raporu (Belgeler'den)" error={fieldError(m.error, "document_id")}>{(pp) => <select {...pp} className="field__input" value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">Seçin</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}</Field>
              <Field label="Not">{(pp) => <input {...pp} className="field__input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
              <button className="btn btn--primary btn--sm" type="button" disabled={!docId || m.isPending} onClick={() => m.mutate({ document_id: docId, note })}>Raporu ekle</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
