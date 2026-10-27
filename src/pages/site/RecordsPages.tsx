import { useState } from "react";
import { AlertTriangle, ArrowUpDown, BarChart3, BookOpen, CheckCircle2, Clock, Download, File, FileSignature, FileText, Flame, Inbox, Info, Landmark, Layers, ListChecks, Package, Plus, Umbrella, Upload } from "lucide-react";
import { Link } from "react-router";
import { download } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, IconChip, Kpi, Loading, Money, PageHead, Pager, Segmented, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { P, useSite } from "../../site/SiteContext";

/** Belge (backend `DocumentOut`, servis isteği 78). */
export type DocRow = Schemas["DocumentOut"];
/** Raporlar, KVKK ve denetim paketi (servis istekleri 79–81) — backend şemaları. */
type CatalogItem = Schemas["CatalogReportOut"];
type SlaReportData = Schemas["SlaReportOut"];
type PReq = Schemas["PrivacyRequestOut"];
type Notice = Schemas["PrivacyNoticeOut"];
type Pkg = Schemas["AuditPackageOut"];
type RetentionData = Schemas["RetentionOut"];
type RetentionRow = Schemas["RetentionCategoryOut"];
type RetentionRun = Schemas["RetentionRunOut"];
type InventoryRow = Schemas["InventoryRowOut"];

export const DOC_KIND: Record<string, string> = { plan: "Yönetim planı", rules: "Site kuralları", insurance: "Sigorta poliçesi", fire_report: "Yangın raporu", elevator: "Asansör etiketi / muayene", contract: "Sözleşme", minutes: "Tutanak", financial: "Mali tablo", other: "Diğer" };
export const CONF: Record<string, [string, "ok" | "info" | "warn" | "danger"]> = { public: ["Sakinlere açık", "ok"], unit: ["Bölüme özel", "info"], management: ["Yönetim", "warn"], secret: ["Gizli", "danger"] };
export const PRIV_KIND: Record<string, string> = { access: "Verilerime erişim", rectify: "Düzeltme", erase: "Silme", object: "İtiraz" };
const OUTCOME: Record<string, string> = { fulfilled: "Yerine getirildi", partial: "Kısmen yerine getirildi", rejected: "Reddedildi" };
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`);
const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <Segmented label={label} value={v} onChange={set} options={items.map(([k, l]) => ({ value: k, label: l }))} />
);
/** Belge türü → ikon (dekoratif; tür adı satırda yazılır) */
function KindIcon({ kind }: { kind: string }) {
  const I = kind === "plan" ? BookOpen : kind === "rules" ? ListChecks : kind === "insurance" ? Umbrella : kind === "fire_report" ? Flame : kind === "elevator" ? ArrowUpDown : kind === "contract" ? FileSignature : kind === "minutes" ? FileText : kind === "financial" ? Landmark : File;
  return <I />;
}

// ===================================================================== 78 Belge arşivi
/** Belgeler (RAP-03, backend `…/documents`): kapsam, gizlilik, sürüm, özet (SHA-256), geçerlilik
 * uyarısı, saklama süresi (K8, bilgi amaçlı); gizli belge açılışı kayda geçer. */
export function DocumentsPage() {
  const { can, site } = useSite();
  const [s, set] = useUrlState({ q: "", tur: "", suresi: "", sayfa: "" });
  const q = useSiteGet<Page<DocRow>>("/documents", { q: s.q || undefined, kind: s.tur || undefined, expiring: s.suresi ? "true" : undefined, page: s.sayfa || undefined });
  const expiring = useSiteGet<Page<DocRow>>("/documents", { expiring: "true", page_size: 50 });
  const [adding, setAdding] = useState(false);
  const warn = expiring.data?.items ?? [];
  const expired = warn.filter((d) => d.warning === "expired").length;
  return (
    <div className="stack">
      <PageHead title="Belgeler" subtitle="Yönetim planı, poliçe, yangın raporu, asansör etiketi, sözleşme ve tutanaklar tek arşivde; aynı adla yüklenen dosya yeni sürüm olur." actions={can(P.documentsManage) && <button className="btn btn--primary" type="button" onClick={() => setAdding((v) => !v)}><Upload aria-hidden="true" /> Belge yükle</button>} />
      <div className="grid grid--kpi rise">
        <Kpi label="Belge" icon={<FileText aria-hidden="true" />} value={q.data ? q.data.total : "—"} note={s.q || s.tur || s.suresi ? "süzgece uyan" : "arşivdeki toplam"} />
        <Kpi label="Geçerliliği yaklaşan" tone={warn.length - expired > 0 ? "warn" : undefined} icon={<Clock aria-hidden="true" />} value={expiring.data ? warn.length - expired : "—"} note="60 / 30 gün kala uyarı" />
        <Kpi label="Süresi dolan" tone={expired > 0 ? "danger" : undefined} icon={<AlertTriangle aria-hidden="true" />} value={expiring.data ? expired : "—"} note="yenilenmesi gereken belge" />
      </div>
      {adding && <DocForm onDone={() => setAdding(false)} />}
      {warn.length > 0 && <Alert tone="warn" title="Geçerliliği biten / yaklaşan belge">{warn.map((d) => `${d.title} (${d.warning === "expired" ? "süresi doldu" : `${d.days_left} gün`})`).join(", ")}</Alert>}
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><FileText aria-hidden="true" /></span>
          <div>
            <div className="card__title">Belge arşivi</div>
            {q.data && <div className="card__meta">{q.data.total} belge</div>}
          </div>
          <div className="card__tools">
            <div className="field"><label className="field__label" htmlFor="dc-q">Ara</label><input id="dc-q" className="field__input" type="search" value={s.q} onChange={(e) => set({ q: e.target.value, sayfa: "" })} /></div>
            <div className="field"><label className="field__label" htmlFor="dc-k">Tür</label><select id="dc-k" className="field__input" value={s.tur} onChange={(e) => set({ tur: e.target.value, sayfa: "" })}><option value="">Tümü</option>{Object.entries(DOC_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <label className="check" style={{ alignSelf: "flex-end", minHeight: 38 }}><input type="checkbox" checked={!!s.suresi} onChange={(e) => set({ suresi: e.target.checked ? "1" : "", sayfa: "" })} /><span>Yalnız süresi yaklaşan</span></label>
          </div>
        </div>
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Belge yok" icon={<FileText aria-hidden="true" />} /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Belgeler</caption>
              <thead><tr><th scope="col">Belge</th><th scope="col">Kapsam / gizlilik</th><th scope="col">Geçerlilik</th><th scope="col">Sürüm</th><th scope="col"><span className="visually-hidden">İndir</span></th></tr></thead>
              <tbody>{q.data.items.map((d) => <DocRowView key={d.id} d={d} slug={site.slug} />)}</tbody>
            </table></div>
          )}
        </div>
        {q.data && q.data.total > q.data.page_size && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ sayfa: String(p) })} /></div>}
      </div>
    </div>
  );
}

function DocRowView({ d, slug }: { d: DocRow; slug: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const log = useSiteGet<Page<Schemas["DocumentAccessOut"]>>(`/documents/${d.id}/access-log`, { page_size: 50 }, { enabled: open && d.confidentiality === "secret" });
  async function dl(v: number, name: string) {
    setErr(null);
    try { await download(`/sites/${slug}/documents/${d.id}/versions/${v}/download`, undefined, name); } catch (e) { setErr(e); }
  }
  return (
    <>
      <tr>
        <td><div className="cell-person"><IconChip tone={d.warning === "expired" ? "danger" : d.warning ? "warn" : undefined}><KindIcon kind={d.kind} /></IconChip><div><div className="cell-main">{d.title}</div><div className="cell-sub">{d.kind_label} · {d.file_name} · {kb(d.size)}{d.retention_years != null && ` · saklama ${d.retention_years} yıl`}</div></div></div></td>
        <td className="small">{d.scope === "site" ? "Tüm site" : d.scope_name}<div><Badge tone={CONF[d.confidentiality]![1]}>{CONF[d.confidentiality]![0]}</Badge></div></td>
        <td className="small nowrap">{d.valid_until ? <>{formatDate(d.valid_until)}{d.warning && <div><Badge tone={d.warning === "expired" ? "danger" : "warn"}>{d.warning === "expired" ? "Süresi doldu" : `${d.days_left} gün kaldı`}</Badge></div>}</> : "—"}</td>
        <td className="small"><button className="btn btn--ghost btn--sm" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>v{d.version}{d.versions.length > 1 ? ` · ${d.versions.length} sürüm` : ""}</button></td>
        <td className="right"><button className="btn btn--sm" type="button" onClick={() => dl(d.version, d.file_name)}><Download aria-hidden="true" /> İndir</button></td>
      </tr>
      {(open || err != null) && <tr><td colSpan={5}>
        <FormError error={err} />
        {open && <div className="stack" style={{ gap: 4 }}>
          {d.versions.slice().reverse().map((v) => <div key={v.v} className="small row" style={{ gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}><strong>v{v.v}</strong> {v.file_name} · {kb(v.size)} · {v.uploaded_by}, {formatDateTime(v.at)} · <span className="mono xs" title={`SHA-256: ${v.sha256}`}>{v.sha256.slice(0, 16)}…</span><button className="btn btn--ghost btn--sm" type="button" onClick={() => dl(v.v, v.file_name)}>İndir</button></div>)}
          {d.confidentiality === "secret" && <div className="xs muted">Açılış kaydı: {(log.data?.items ?? []).length ? log.data!.items.map((x) => `${x.by} (v${x.v}, ${formatDateTime(x.at)})`).join("; ") : "henüz açılmadı"}</div>}
        </div>}
      </td></tr>}
    </>
  );
}

function DocForm({ onDone }: { onDone: () => void }) {
  const { can } = useSite();
  const blocks = useSiteGet<Page<{ id: string; name: string }>>("/blocks", { page_size: 200 });
  const [f, setF] = useState({ title: "", kind: "plan", scope: "site", block_id: "", confidentiality: "public", valid_until: "", retention_years: "" });
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const m = useSiteMutation<FormData, DocRow>("POST", "/documents", { form: true, onSuccess: onDone });
  function pick(fl: File | undefined) {
    setFileErr(null); setFile(null); if (!fl) return;
    if (fl.size > 10 * 1024 * 1024) { setFileErr("Dosya en fazla 10 MB."); return; }
    setFile(fl);
  }
  function submit() {
    const fd = new FormData();
    fd.set("title", f.title); fd.set("kind", f.kind); fd.set("scope", f.scope); fd.set("confidentiality", f.confidentiality);
    const target = f.scope === "block" ? f.block_id : f.scope === "unit" ? unit?.id : "";
    if (target) fd.set("scope_id", target);
    if (f.valid_until) fd.set("valid_until", f.valid_until);
    if (f.retention_years) fd.set("retention_years", f.retention_years);
    if (file) fd.set("file", file, file.name);
    m.mutate(fd);
  }
  const levels = Object.entries(CONF).filter(([k]) => (k !== "unit" || f.scope === "unit") && (k !== "secret" || can(P.documentsConfidential)));
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="card__head"><span className="card__title">Belge yükle</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Belge adı" required hint="Aynı ad ve kapsamla yüklenen dosya yeni sürüm olur" error={fieldError(m.error, "title")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />}</Field>
          <Field label="Tür" error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{Object.entries(DOC_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          <Field label="Kapsam" error={fieldError(m.error, "scope")}>{(p) => <select {...p} className="field__input" value={f.scope} onChange={(e) => setF((x) => ({ ...x, scope: e.target.value, confidentiality: e.target.value !== "unit" && x.confidentiality === "unit" ? "public" : x.confidentiality }))}><option value="site">Tüm site</option><option value="block">Blok</option><option value="unit">Bölüm</option></select>}</Field>
          {f.scope === "block" && <Field label="Blok">{(p) => <select {...p} className="field__input" value={f.block_id} onChange={(e) => setF((x) => ({ ...x, block_id: e.target.value }))}><option value="">Seçin</option>{(blocks.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</Field>}
          {f.scope === "unit" && <UnitPicker label="Bölüm" value={unit} onChange={setUnit} />}
          <Field label="Gizlilik" error={fieldError(m.error, "confidentiality")}>{(p) => <select {...p} className="field__input" value={f.confidentiality} onChange={(e) => setF((x) => ({ ...x, confidentiality: e.target.value }))}>{levels.map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          <Field label="Geçerlilik bitişi" hint="Poliçe, yangın raporu, asansör etiketi gibi süreli belgelerde; 60/30 gün kala bildirim" error={fieldError(m.error, "valid_until")}>{(p) => <input {...p} className="field__input" type="date" value={f.valid_until} onChange={(e) => setF((x) => ({ ...x, valid_until: e.target.value }))} />}</Field>
          <Field label="Saklama süresi (yıl)" hint="İsteğe bağlı; boşsa kanuni süre. Bilgi amaçlıdır, belge kendiliğinden silinmez" error={fieldError(m.error, "retention_years")}>{(p) => <input {...p} className="field__input" type="number" min={1} max={100} inputMode="numeric" value={f.retention_years} onChange={(e) => setF((x) => ({ ...x, retention_years: e.target.value }))} />}</Field>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="dc-file">Dosya (PDF, PNG, JPEG, WebP · en fazla 10 MB)</label>
          <input id="dc-file" className="field__input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
          {file && <span className="xs muted">{file.name} · {kb(file.size)}</span>}
          {(fileErr || fieldError(m.error, "file")) && <span className="field__error" role="alert">{fileErr ?? fieldError(m.error, "file")}</span>}
        </div>
        {f.confidentiality === "secret" && <p className="xs muted mb-0">Gizli belgeyi yalnız gizli belge yetkisi olanlar (Yönetici, Denetçi) görür ve açar; her açılış kayda geçer.</p>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!file}>Yükle</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

// ===================================================================== 79 Rapor kataloğu
/** Rapor kataloğu (RAP-01): yalnız yetkili olunan ve modülü açık raporlar; her metriğin tek tanımı
 * (metrik sözlüğü backend'de). Üreticisi olan rapor Excel'e aktarılır (dışa aktarma kayda geçer). */
export function ReportCatalogPage() {
  const { site } = useSite();
  const [s, set] = useUrlState({ rapor: "", q: "" });
  const q = useSiteGet<CatalogItem[]>("/reports/catalog");
  const list = (q.data ?? []).filter((r) => !s.q || `${r.name} ${r.group}`.toLocaleLowerCase("tr-TR").includes(s.q.toLocaleLowerCase("tr-TR")));
  const groups = [...new Set(list.map((r) => r.group))];
  const [err, setErr] = useState<unknown>(null);
  async function xlsx(key: string) {
    setErr(null);
    try { await download(`/sites/${site.slug}/reports/${key}/export.xlsx`, undefined, `rapor-${key}.xlsx`); } catch (e) { setErr(e); }
  }
  return (
    <div className="stack">
      <PageHead title="Rapor kataloğu" subtitle="Yalnız yetkili olduğunuz raporlar görünür. Her metriğin nasıl hesaplandığı yanında yazar." />
      {q.isError ? null : !q.data ? (
        <div className="grid grid--kpi">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : (
        <div className="grid grid--kpi rise">
          <Kpi label="Rapor" tone="accent" icon={<BarChart3 aria-hidden="true" />} value={q.data.length} note="yetkinize açık" />
          <Kpi label="Rapor grubu" icon={<Layers aria-hidden="true" />} value={new Set(q.data.map((r) => r.group)).size} note={[...new Set(q.data.map((r) => r.group))].slice(0, 3).join(", ")} />
          <Kpi label="Tanımlı metrik" icon={<Info aria-hidden="true" />} value={q.data.reduce((a, r) => a + r.metrics.length, 0)} note="her birinin tek tanımı var" />
        </div>
      )}
      {s.rapor === "requests_sla" && <SlaReport onClose={() => set({ rapor: "" })} />}
      <FormError error={err} />
      <div className="filters" style={{ maxWidth: "24rem" }}><div className="field"><label className="field__label" htmlFor="rc-q">Ara</label><input id="rc-q" className="field__input" type="search" value={s.q} onChange={(e) => set({ q: e.target.value })} /></div></div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : groups.length === 0 ? <Empty title="Rapor yok" icon={<BarChart3 aria-hidden="true" />}>Yetkinize açık rapor bulunmuyor.</Empty> : groups.map((g) => (
        <div key={g} className="stack" style={{ gap: "var(--s-2)" }}>
          <div className="section-title">{g}</div>
          <div className="grid grid--2">{list.filter((r) => r.group === g).map((r) => (
            <div key={r.key} className="card"><div className="card__head"><span className="card__icon card__icon--accent"><BarChart3 aria-hidden="true" /></span><span className="card__title">{r.name}</span>
              <span className="ml-auto row" style={{ gap: "var(--s-1)" }}>
                {r.exportable && <button className="btn btn--ghost btn--sm" type="button" onClick={() => xlsx(r.key)} aria-label={`${r.name} — Excel'e aktar`}><Download aria-hidden="true" /> Excel</button>}
                <Link className="btn btn--sm" to={`/s/${site.slug}/${r.link}`}>Aç</Link>
              </span></div>
              <div className="card__body stack" style={{ gap: 4 }}>{r.metrics.map((x) => <div key={x.key} className="small"><Info aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: "-2px", color: "var(--fg-muted)" }} /> <strong>{x.name}:</strong> {x.definition}</div>)}</div>
            </div>
          ))}</div>
        </div>
      ))}
      <p className="xs muted">Excel dışa aktarma son 30 günü kapsar ve kayda geçer. Planlı rapor gönderimi aynı rapor içeriğini kullanır.</p>
    </div>
  );
}

const num = (v: string | null, pct = false) => (v == null ? "—" : `${pct ? "%" : ""}${Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`);

function SlaReport({ onClose }: { onClose: () => void }) {
  const { site } = useSite();
  const [to, setTo] = useState(new Date().toLocaleDateString("sv-SE"));
  const [err, setErr] = useState<unknown>(null);
  const q = useSiteGet<SlaReportData>("/reports/requests-sla", { to });
  async function xlsx() {
    setErr(null);
    try { await download(`/sites/${site.slug}/reports/requests_sla/export.xlsx`, { to }, "talep-sla.xlsx"); } catch (e) { setErr(e); }
  }
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Talep ve SLA raporu</span><span className="card__meta">{q.data ? `${formatDate(q.data.from)} – ${formatDate(q.data.to)}` : ""}</span>
        <span className="ml-auto row" style={{ gap: "var(--s-1)" }}><button className="btn btn--ghost btn--sm" type="button" onClick={xlsx}><Download aria-hidden="true" /> Excel</button><button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>Kapat</button></span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={err} />
        <div className="field" style={{ maxWidth: "12rem" }}><label className="field__label" htmlFor="sla-to">Bitiş (son 30 gün)</label><input id="sla-to" className="field__input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : <>
          <div className="grid grid--kpi"><Kpi label="Açılan talep" value={q.data.total.total} note={`${q.data.total.open} hâlâ açık`} /><Kpi label="SLA uyumu" value={num(q.data.total.sla_rate, true)} tone={q.data.total.sla_rate != null && Number(q.data.total.sla_rate) < 80 ? "warn" : undefined} note={`${q.data.total.closed} çözülen`} /><Kpi label="Ort. çözüm (saat)" value={num(q.data.total.avg_hours)} /><Kpi label="Memnuniyet" value={num(q.data.total.satisfaction)} note={`${q.data.total.rated} puan`} /></div>
          {q.data.rows.length === 0 ? <Empty title="Dönemde talep yok" /> : <div className="table-wrap"><table className="data"><caption className="visually-hidden">Kategoriye göre</caption>
            <thead><tr><th scope="col">Kategori</th><th scope="col" className="right">Açılan</th><th scope="col" className="right">Açık</th><th scope="col" className="right">Çözülen</th><th scope="col" className="right">SLA</th><th scope="col" className="right">Ort. saat</th><th scope="col" className="right">Puan</th></tr></thead>
            <tbody>{q.data.rows.map((r) => <tr key={r.category}><td>{r.category_name}</td><td className="right num">{r.total}</td><td className="right num">{r.open}</td><td className="right num">{r.closed}</td><td className="right num">{num(r.sla_rate, true)}</td><td className="right num">{num(r.avg_hours)}</td><td className="right num">{num(r.satisfaction)}</td></tr>)}</tbody>
          </table></div>}
          <p className="xs muted mb-0">Açılan/açık: dönemde açılan talepler. SLA, süre ve puan: dönemde çözülen talepler; çözüm zamanı açılıştan önce görünen bozuk kayıtlar ortalamaya girmez.</p>
        </>}
      </div>
    </div>
  );
}

// ===================================================================== 80 KVKK
/** KVKK (RAP-04): ilgili kişi başvuruları ve 30 gün sayacı; aydınlatma metni sürümleri (yeni
 * sürüm herkesten yeniden onay ister — P6); saklama politikası (K8); VERBİS veri envanteri. */
export function PrivacyPage() {
  const [s, set] = useUrlState({ sekme: "basvuru" });
  return (
    <div className="stack">
      <PageHead title="KVKK" subtitle="İlgili kişi başvuruları 30 gün içinde yanıtlanır. Finansal kayıtlar yasal saklama süresince silinmez; gerekçesi yanıtta yazılır." />
      <PrivacyKpis />
      {tabs([["basvuru", "Başvurular"], ["metin", "Aydınlatma metni"], ["saklama", "Saklama politikası"], ["envanter", "Veri envanteri"]], s.sekme, (k) => set({ sekme: k }), "KVKK")}
      {s.sekme === "metin" ? <Notices /> : s.sekme === "saklama" ? <RetentionPolicy /> : s.sekme === "envanter" ? <DataInventory /> : <Requests />}
    </div>
  );
}

/** Bant altı göstergeler: başvuruların durumu ve 30 gün sayacı. */
function PrivacyKpis() {
  const q = useSiteGet<Page<PReq>>("/privacy-requests", { page_size: 200 });
  const n = useSiteGet<Page<Notice>>("/privacy-notices", { page_size: 1 });
  if (q.isError) return null;
  if (!q.data) return <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>;
  const open = q.data.items.filter((r) => r.status === "open");
  const late = open.filter((r) => r.days_left < 0).length;
  const near = open.filter((r) => r.days_left >= 0 && r.days_left <= 7).length;
  const latest = n.data?.items[0];
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Açık başvuru" tone={open.length > 0 ? "accent" : undefined} icon={<Inbox aria-hidden="true" />} value={open.length} note={`${q.data.total} başvurudan`} />
      <Kpi label="Süresi yaklaşan" tone={near > 0 ? "warn" : undefined} icon={<Clock aria-hidden="true" />} value={near} note="7 gün ya da daha az kaldı" />
      <Kpi label="Geciken" tone={late > 0 ? "danger" : undefined} icon={<AlertTriangle aria-hidden="true" />} value={late} note="30 günlük süre aşıldı" />
      <Kpi label="Aydınlatma metni" icon={<FileText aria-hidden="true" />} value={latest ? `Sürüm ${latest.version}` : "Yayında değil"} small note={latest ? formatDate(latest.published_at) : "onay istenmiyor"} />
    </div>
  );
}

function Requests() {
  const { site } = useSite();
  const [s, set] = useUrlState({ sayfa: "" });
  const q = useSiteGet<Page<PReq>>("/privacy-requests", { page: s.sayfa || undefined });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.items.length === 0) return <Empty title="Başvuru yok" icon={<Inbox aria-hidden="true" />}>Sakinler başvurusunu "Kişisel verilerim" ekranından yapar.</Empty>;
  return (
    <div className="stack">
      {q.data.items.map((r) => <ReqCard key={r.id} r={r} slug={site.slug} />)}
      {q.data.total > q.data.page_size && <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ sayfa: String(p) })} />}
    </div>
  );
}
function ReqCard({ r, slug }: { r: PReq; slug: string }) {
  const [f, setF] = useState({ response: "", outcome: "fulfilled", retained: "" });
  const [err, setErr] = useState<unknown>(null);
  const m = useSiteMutation<Record<string, unknown>, PReq>("POST", `/privacy-requests/${r.id}/answer`);
  async function pkg() { setErr(null); try { await download(`/sites/${slug}/privacy-requests/${r.id}/data-package`, undefined, `kisisel-veri-${r.name.replace(/\s+/g, "-")}.json`); } catch (e) { setErr(e); } }
  return (
    <div className="card" style={{ borderColor: r.status === "open" && r.days_left <= 7 ? "var(--danger-line)" : undefined }}>
      <div className="card__head"><span className="card__title">{r.kind_label} · {r.name}</span><span className="card__meta">{r.units.join(", ")}</span><span className="ml-auto">{r.status === "open" ? <Badge tone={r.days_left <= 7 ? "danger" : "warn"}>{r.days_left >= 0 ? `${r.days_left} gün kaldı` : `${-r.days_left} gün gecikti`}</Badge> : <Badge tone="ok">Yanıtlandı</Badge>}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <div className="small">{formatDateTime(r.created_at)} · son gün {formatDate(r.due_on)}{r.detail && ` · "${r.detail}"`}</div>
        <FormError error={err ?? m.error} />
        {r.kind === "access" && <div><button className="btn btn--sm" type="button" onClick={pkg}><Download aria-hidden="true" /> Kişisel veri paketi (JSON)</button></div>}
        {r.status === "answered" ? <div className="small"><strong>{r.outcome_label}</strong> — {r.response}{r.retained && <div>Saklanan: {r.retained}</div>}<div className="muted">{r.answered_by}, {formatDateTime(r.answered_at)}</div></div> : (
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            <Field label="Sonuç" error={fieldError(m.error, "outcome")}>{(p) => <select {...p} className="field__input" style={{ maxWidth: "14rem" }} value={f.outcome} onChange={(e) => setF((x) => ({ ...x, outcome: e.target.value }))}>{Object.entries(OUTCOME).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
            {r.kind === "erase" && f.outcome !== "fulfilled" && <Field label="Saklanan kayıtlar ve dayanağı" error={fieldError(m.error, "retained")}>{(p) => <input {...p} className="field__input" placeholder="ör. Tahakkuk ve tahsilat kayıtları — TTK m.82, 10 yıl" value={f.retained} onChange={(e) => setF((x) => ({ ...x, retained: e.target.value }))} />}</Field>}
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
  const q = useSiteGet<Page<Notice>>("/privacy-notices", { page_size: 50 });
  const [f, setF] = useState({ text: "", summary: "" });
  const m = useSiteMutation<typeof f, Notice>("POST", "/privacy-notices", { onSuccess: () => setF({ text: "", summary: "" }) });
  return (
    <div className="stack">
      {can(P.privacyManage) && <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate(f); }}>
        <div className="card__head"><span className="card__title">Yeni sürüm yayınla</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={m.error} />
          <Alert tone="warn" title="Yeni sürüm herkesten yeniden onay ister">Yayından sonra bu siteye erişen her kullanıcı (yönetim, personel, sakin) bir sonraki işleminde yeni metni okuyup onaylamadan devam edemez. Onaylar sürüm ve tarihle saklanır; eski sürümler değişmez.</Alert>
          <Field label="Aydınlatma metni (Türkçe, bağlayıcı)" hint="En az 200 karakter; metin avukat onaylı olmalı" error={fieldError(m.error, "text")}>{(p) => <textarea {...p} className="field__input" rows={8} value={f.text} onChange={(e) => setF((x) => ({ ...x, text: e.target.value }))} />}</Field>
          <Field label="Değişiklik özeti" hint="Onay ekranında kullanıcıya gösterilir" error={fieldError(m.error, "summary")}>{(p) => <input {...p} className="field__input" maxLength={200} value={f.summary} onChange={(e) => setF((x) => ({ ...x, summary: e.target.value }))} />}</Field>
        </div>
        <div className="card__foot"><ConfirmButton className="btn btn--primary" disabled={m.isPending} title="Yeni sürüm yayınlansın mı?" body="Herkes bir sonraki işleminde metni yeniden onaylayacak. Bu işlem geri alınamaz; düzeltme için yeni sürüm yayınlanır." confirmLabel="Yayınla" onConfirm={() => m.mutateAsync(f)}><Plus aria-hidden="true" /> Yayınla</ConfirmButton></div>
      </form>}
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.items.length === 0 ? <Empty title="Sürüm yok">Yayınlanmış metin yokken kullanıcılardan onay istenmez; herkese açık /aydinlatma sayfası taslak metni gösterir.</Empty> : q.data.items.map((n) => (
        <details key={n.version} className="card"><summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Sürüm {n.version}</span><span className="card__meta">{n.published_by}, {formatDateTime(n.published_at)} · {n.summary}</span></summary><div className="card__body"><p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>{n.text}</p></div></details>
      ))}
    </div>
  );
}

/** Saklama politikası (K8): kategori × süre; ziyaretçi süresi güvenlik ayarının kendisidir. */
function RetentionPolicy() {
  const q = useSiteGet<RetentionData>("/settings/retention");
  const runs = useSiteGet<Page<RetentionRun>>("/settings/retention/runs", { page_size: 20 });
  const [draft, setDraft] = useState<Record<string, { value: string; auto_apply: boolean }>>({});
  const m = useSiteMutation<{ items: { key: string; value: number; auto_apply: boolean }[] }, RetentionData>("PUT", "/settings/retention", { onSuccess: () => setDraft({}) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const rows = q.data.categories;
  const val = (c: RetentionRow) => draft[c.key] ?? { value: String(c.value), auto_apply: c.auto_apply };
  const changed = Object.keys(draft).length > 0;
  function save() {
    m.mutate({ items: rows.filter((c) => c.adjustable).map((c) => ({ key: c.key, value: Number(val(c).value), auto_apply: val(c).auto_apply })) });
  }
  return (
    <div className="stack">
      <Alert tone="info" title="Dokümandaki varsayılanlar — kanuni süreler (K8)">Hukuki teyit bekleyen kategorilerde otomatik silme/anonimleştirme varsayılan olarak kapalıdır. Süresi dolan kayıt sayısını buradan izleyip elle uygulayabilir ya da gece işini açabilirsiniz. Finansal kayıtlar yasal süre boyunca saklanır, otomatik silinmez.</Alert>
      <FormError error={m.error} />
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><Clock aria-hidden="true" /></span><span className="card__title">Kategori × süre</span></div>
        <div className="card__body card__body--flush"><div className="table-wrap"><table className="data"><caption className="visually-hidden">Saklama politikası</caption>
          <thead><tr><th scope="col">Kategori</th><th scope="col">Süre</th><th scope="col">Süre dolunca</th><th scope="col">Otomatik</th><th scope="col" className="right">Bekleyen</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
          <tbody>{rows.map((c) => <RetentionRowView key={c.key} c={c} v={val(c)} error={fieldError(m.error, c.key)} onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))} />)}</tbody>
        </table></div></div>
        <div className="card__foot row" style={{ gap: "var(--s-2)" }}><button className="btn btn--primary" type="button" disabled={!changed || m.isPending} onClick={save}>Kaydet</button>{changed && <button className="btn btn--ghost" type="button" onClick={() => setDraft({})}>Vazgeç</button>}</div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__icon"><ListChecks aria-hidden="true" /></span><span className="card__title">Silme ve anonimleştirme raporu</span>{runs.data && <span className="card__meta">{runs.data.total} kayıt</span>}</div>
        <div className="card__body card__body--flush">{runs.isPending ? <Loading /> : runs.isError ? <div className="card__body"><ErrorState error={runs.error} /></div> : runs.data.items.length === 0 ? <Empty title="Henüz uygulama yok" /> : (
          <div className="table-wrap"><table className="data"><caption className="visually-hidden">Silme raporu</caption>
            <thead><tr><th scope="col">Tarih</th><th scope="col">Kategori</th><th scope="col">Kesim</th><th scope="col" className="right">Etkilenen</th><th scope="col">Kim</th></tr></thead>
            <tbody>{runs.data.items.map((r) => <tr key={r.id}><td className="small nowrap">{formatDateTime(r.at)}</td><td className="small">{r.category_label}</td><td className="small nowrap">{formatDate(r.cutoff)} öncesi</td><td className="right num">{r.affected}</td><td className="small">{r.actor} · {r.trigger === "job" ? "gece işi" : "elle"}</td></tr>)}</tbody>
          </table></div>
        )}</div>
      </div>
    </div>
  );
}

function RetentionRowView({ c, v, error, onChange }: { c: RetentionRow; v: { value: string; auto_apply: boolean }; error?: string; onChange: (v: { value: string; auto_apply: boolean }) => void }) {
  const apply = useSiteMutation<undefined, RetentionRun>("POST", `/settings/retention/${c.key}/apply`);
  return (
    <tr>
      <td><div className="cell-main">{c.label}{c.needs_legal_review && <> <Badge tone="warn">Hukuki teyit bekliyor</Badge></>}</div><div className="cell-sub">{c.data}</div><div className="xs muted">{c.legal_basis}</div>{apply.error != null && <FormError error={apply.error} />}</td>
      <td className="nowrap">{c.adjustable ? (
        <div className="row" style={{ gap: 4, alignItems: "center" }}>
          <input className="field__input" style={{ width: "5rem" }} type="number" min={1} max={c.max_value ?? undefined} inputMode="numeric" aria-label={`${c.label} süresi (${c.unit_label})`} aria-invalid={error ? true : undefined} value={v.value} onChange={(e) => onChange({ ...v, value: e.target.value })} />
          <span className="small">{c.unit_label}</span>
        </div>
      ) : <span className="small">{c.value} {c.unit_label}</span>}
        {c.max_value != null && <div className="xs muted">en fazla {c.max_value} {c.unit_label}</div>}
        {error && <div className="field__error" role="alert">{error}</div>}
      </td>
      <td className="small">{c.action_label}</td>
      <td>{c.adjustable ? <label className="check"><input type="checkbox" checked={v.auto_apply} onChange={(e) => onChange({ ...v, auto_apply: e.target.checked })} /><span className="small">Gece işi uygulasın</span></label> : <span className="small muted">—</span>}</td>
      <td className="right num">{c.pending ?? "—"}{c.cutoff && <div className="xs muted">{formatDate(c.cutoff)} öncesi</div>}</td>
      <td className="right">{c.adjustable && <ConfirmButton className="btn btn--sm" disabled={!c.pending || apply.isPending} title={`${c.label}: süresi dolanlar işlensin mi?`} body={`${c.pending ?? 0} kayıt ${c.action === "delete" ? "silinecek" : "anonimleştirilecek"}. Bu işlem geri alınamaz ve silme raporuna yazılır.`} confirmLabel="Şimdi uygula" onConfirm={() => apply.mutateAsync(undefined)}>Şimdi uygula</ConfirmButton>}</td>
    </tr>
  );
}

/** VERBİS için kişisel veri envanteri dökümü (CSV/Excel). */
function DataInventory() {
  const { site } = useSite();
  const q = useSiteGet<InventoryRow[]>("/data-inventory");
  const [err, setErr] = useState<unknown>(null);
  async function dl(format: "xlsx" | "csv") {
    setErr(null);
    try { await download(`/sites/${site.slug}/data-inventory/export`, { format }, `veri-envanteri.${format}`); } catch (e) { setErr(e); }
  }
  return (
    <div className="stack">
      <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}><button className="btn btn--sm" type="button" onClick={() => dl("xlsx")}><Download aria-hidden="true" /> Excel</button><button className="btn btn--sm" type="button" onClick={() => dl("csv")}><Download aria-hidden="true" /> CSV</button></div>
      <FormError error={err} />
      <p className="xs muted mb-0">Amaç ve hukuki sebep metinleri öneridir; VERBİS kaydından önce hukukçu tarafından gözden geçirilmelidir. Özel alanlar KVKK kategorileriyle listeye eklenir.</p>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="card"><div className="card__body card__body--flush"><div className="table-wrap"><table className="data"><caption className="visually-hidden">Veri envanteri</caption>
          <thead><tr><th scope="col">Kategori</th><th scope="col">Veri</th><th scope="col">İlgili kişi</th><th scope="col">Amaç / hukuki sebep</th><th scope="col">Saklama</th><th scope="col" className="right">Kayıt</th></tr></thead>
          <tbody>{q.data.map((r, i) => <tr key={i}><td className="small"><Badge>{r.category_label}</Badge></td><td className="small">{r.data}<div className="xs muted">{r.source}</div></td><td className="small">{r.subjects}</td><td className="small">{r.purpose}<div className="xs muted">{r.legal_basis}</div></td><td className="small">{r.retention}</td><td className="right num">{r.records}</td></tr>)}</tbody>
        </table></div></div></div>
      )}
    </div>
  );
}

// ===================================================================== 81 Denetim kurulu paketi
/** Denetim kurulu paketi (RAP-05): dönem özeti, karar defteri ve belgeler hazırlandığı anda
 * dondurulur; denetçi raporunu Belgeler'den seçip ekler. */
export function AuditPackagesPage() {
  const { can, site } = useSite();
  const [s, set] = useUrlState({ sayfa: "" });
  const q = useSiteGet<Page<Pkg>>("/audit-packages", { page: s.sayfa || undefined });
  const docs = useSiteGet<Page<DocRow>>("/documents", { page_size: 200 }, { enabled: can(P.documentsRead) });
  const [adding, setAdding] = useState(false);
  const items = q.data?.items ?? [];
  return (
    <div className="stack">
      <PageHead title="Denetim kurulu paketi" subtitle="Dönem sonu finansal özet, bütçe–gerçekleşme, karar defteri ve belgeler tek pakette; denetçi salt okunur inceler ve raporunu ekler." actions={can(P.chargePost) && <button className="btn btn--primary" type="button" onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Paket hazırla</button>} />
      {q.isError ? null : !q.data ? (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : (
        <div className="grid grid--kpi rise">
          <Kpi label="Paket" tone="accent" icon={<Package aria-hidden="true" />} value={q.data.total} note="hazırlanan denetim dosyası" />
          <Kpi label="Denetim bekleyen" tone={items.some((p) => p.status !== "reviewed") ? "warn" : undefined} icon={<Clock aria-hidden="true" />} value={items.filter((p) => p.status !== "reviewed").length} note="denetçi raporu eklenmedi" />
          <Kpi label="Denetlenen" tone="ok" icon={<CheckCircle2 aria-hidden="true" />} value={items.filter((p) => p.status === "reviewed").length} note="raporu ekli" />
          <Kpi label="Arşivdeki belge" icon={<FileText aria-hidden="true" />} value={docs.data ? docs.data.total : "—"} note="pakete eklenebilir" />
        </div>
      )}
      {adding && <PkgForm docs={docs.data?.items ?? []} onDone={() => setAdding(false)} />}
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : items.length === 0 ? <Empty title="Paket yok" icon={<Package aria-hidden="true" />} /> : items.map((p) => <PkgCard key={p.id} p={p} docs={docs.data?.items ?? []} slug={site.slug} canReview={can(P.auditRead)} />)}
      {q.data && q.data.total > q.data.page_size && <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(pg) => set({ sayfa: String(pg) })} />}
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
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Eklenecek belgeler</legend>{docs.length === 0 ? <p className="small muted mb-0">Arşivde belge yok.</p> : <div className="stack" style={{ gap: 2 }}>{docs.map((d) => <label key={d.id} className="check"><input type="checkbox" checked={ids.includes(d.id)} onChange={() => setIds((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} /><span>{d.title} <span className="xs muted">({DOC_KIND[d.kind]})</span></span></label>)}</div>}
          {fieldError(m.error, "document_ids") && <span className="field__error" role="alert">{fieldError(m.error, "document_ids")}</span>}</fieldset>
        <p className="xs muted mb-0">Paket hazırlandığı andaki gelir–gider, bütçe–gerçekleşme, tahsilat ve kasa özetini ve dönemdeki kararları dondurur; sonradan girilen kayıt paketi değiştirmez.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending}>Paketi hazırla</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
function PkgCard({ p, docs, slug, canReview }: { p: Pkg; docs: DocRow[]; slug: string; canReview: boolean }) {
  const [docId, setDocId] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const m = useSiteMutation<Record<string, unknown>, Pkg>("POST", `/audit-packages/${p.id}/report`);
  const base = `/s/${slug}`;
  const snap = p.snapshot as { income?: string; expense?: string; difference?: string; cash_total?: string };
  async function xlsx() { setErr(null); try { await download(`/sites/${slug}/audit-packages/${p.id}/export.xlsx`, undefined, "denetim-paketi.xlsx"); } catch (e) { setErr(e); } }
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">{p.title}</span><span className="card__meta">{formatDate(p.from)} – {formatDate(p.to)}</span><span className="ml-auto row" style={{ gap: "var(--s-1)", alignItems: "center" }}><button className="btn btn--ghost btn--sm" type="button" onClick={xlsx}><Download aria-hidden="true" /> Excel</button>{p.status === "reviewed" ? <Badge tone="ok">Denetlendi</Badge> : <Badge tone="warn">Denetim bekliyor</Badge>}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        <FormError error={err} />
        {snap.income != null && <div className="grid grid--kpi"><Kpi label="Gelir" value={<Money value={snap.income} />} small /><Kpi label="Gider" value={<Money value={snap.expense ?? "0.00"} />} small /><Kpi label="Fark" value={<Money value={snap.difference ?? "0.00"} />} small /><Kpi label="Kasa ve banka" value={<Money value={snap.cash_total ?? "0.00"} />} small note="hazırlandığı an" /></div>}
        <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <Link className="btn btn--sm" to={`${base}/raporlar?year=${p.to.slice(0, 4)}`}>Gelir–gider</Link>
          <Link className="btn btn--sm" to={`${base}/isletme-projesi`}>Bütçe–gerçekleşme</Link>
          <Link className="btn btn--sm" to={`${base}/kasa`}>Kasa ve banka</Link>
          <Link className="btn btn--sm" to={`${base}/karar-defteri`}>Karar defteri</Link>
        </div>
        <div className="small"><strong>Kararlar ({p.decisions.length}):</strong> {p.decisions.length ? p.decisions.map((d) => `${d.no}. ${d.item_title} (${formatDate(d.date)})`).join(" · ") : "dönemde karar yok"}</div>
        <div className="small"><strong>Belgeler ({p.documents.length}):</strong> {p.documents.map((d) => d.title).join(" · ") || "—"}</div>
        <div className="xs muted">{p.created_by}, {formatDateTime(p.created_at)}</div>
        {p.status === "reviewed" ? <div className="small">Denetim raporu: <strong>{p.report_document_title ?? "—"}</strong> · {p.reviewed_by}, {formatDateTime(p.reviewed_at)}{p.note && ` · ${p.note}`}</div> : canReview && (
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            <FormError error={m.error} />
            <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
              <Field label="Denetim raporu (Belgeler'den)" error={fieldError(m.error, "document_id")}>{(pp) => <select {...pp} className="field__input" value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">Seçin</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}</Field>
              <Field label="Not" error={fieldError(m.error, "note")}>{(pp) => <input {...pp} className="field__input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
              <button className="btn btn--primary btn--sm" type="button" disabled={!docId || m.isPending} onClick={() => m.mutate({ document_id: docId, note })}>Raporu ekle</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
