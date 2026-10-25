import { useState } from "react";
import { Download, Plus, Printer, Siren, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page } from "../../api/types";
import { PhotoInput } from "../../components/PhotoInput";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { downloadCsv } from "../../lib/csv";
import { formatDate, formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { audience } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 71–74'teki şekiller. */
interface ReadReport { id: string; title: string; audience: string; published_at: string | null; generated_at: string; recipient_count: number; read_count: number; requires_ack: boolean; ack_deadline: string | null; acks: { name: string; units: string[]; at: string; channel: string }[]; not_acked: number | null; sms_fallback: { due: boolean; count: number | null; sent: boolean; note: string } | null }
interface Tpl { code: string; name: string; channel: string; variables: string[]; required: string[]; variants: { lang: string; subject: string | null; body: string }[]; version: number; history: { version: number; at: string; by: string }[]; customized: boolean; sms: { lang: string; encoding: string; chars: number; segments: number }[] | null }
interface MusterPoint { id: string; name: string; directions: string; map: string | null }
export interface InfoCard { muster_points: MusterPoint[]; phones: { label: string; number: string }[]; instructions: Record<string, string>; block_notes: { block_id: string; block_name: string; note: string }[]; version: number; updated_at: string | null; updated_by: string | null }
interface BoardRow { unit_id: string; unit_name: string; block_id: string; block_name: string; status: string; note: string | null; muster_point: string | null; by: string | null; at: string | null }
interface Active { id: string; kind: string; scope: string; block_ids: string[]; message: string; started_by: string; started_at: string; rows: BoardRow[]; totals: { total: number; safe: number; muster: number; help: number; none: number }; audit: { at: string; by: string; action: string }[] }
interface PastEm { id: string; kind: string; message: string; started_by: string; started_at: string; ended_at: string | null; ended_by: string | null; summary: { total: number; safe: number; muster: number; help: number; none: number } | null; purge_on: string | null }

export const EM_KIND: Record<string, string> = { earthquake: "Deprem", fire: "Yangın", flood: "Su baskını", gas: "Gaz kaçağı", other: "Diğer" };
export const INSTR: [string, string][] = [["earthquake", "Deprem"], ["fire", "Yangın"], ["flood", "Su baskını"], ["gas", "Gaz kaçağı"]];
const ST: Record<string, [string, "ok" | "info" | "danger" | "muted"]> = { safe: ["Güvende", "ok"], muster: ["Toplanma alanında", "info"], help: ["Yardım istiyor", "danger"], none: ["Yanıt yok", "muted"] };
const tabs = (items: [string, string][], v: string, set: (k: string) => void, label: string) => (
  <div className="row" role="tablist" aria-label={label} style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={v === k} className={`btn btn--sm${v === k ? " btn--primary" : ""}`} onClick={() => set(k)}>{l}</button>)}</div>
);

// ===================================================================== 71 Okuma raporu
/** Okuma onayı raporu (ILT-01, 16.3): zaman damgalı, yazdırılabilir; genel kurul çağrısında ispat belgesi. */
export function ReadReportPage() {
  const { annId = "" } = useParams();
  const { site } = useSite();
  const q = useSiteGet<ReadReport>(`/announcements/${annId}/read-report`);
  useDocumentTitle("Okuma raporu");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const r = q.data;
  return (
    <div className="stack">
      <PageHead title={`Okuma raporu · ${r.title}`} subtitle={<><Link className="print-hide" to={`/s/${site.slug}/duyurular`}>Duyurular</Link> · {site.name} · rapor zamanı {formatDateTime(r.generated_at)}</>} actions={<button className="btn print-hide" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Yazdır / PDF</button>} />
      <div className="grid grid--kpi">
        <Kpi label="Alıcı" value={r.recipient_count} />
        <Kpi label="Okuyan" value={r.read_count} />
        {r.requires_ack && <Kpi label="Onaylayan" value={r.acks.length} tone="ok" />}
        {r.requires_ack && <Kpi label="Onaylamayan" value={r.not_acked ?? 0} tone={r.not_acked ? "warn" : undefined} />}
      </div>
      <div className="card"><div className="card__body stack" style={{ gap: "var(--s-1)" }}>
        <div className="kv"><span className="kv__k">Yayın</span><span className="kv__v">{formatDateTime(r.published_at)}</span></div>
        <div className="kv"><span className="kv__k">Hedef</span><span className="kv__v">{audience(r.audience)}</span></div>
        {r.requires_ack && <div className="kv"><span className="kv__k">Son onay</span><span className="kv__v">{formatDateTime(r.ack_deadline)}</span></div>}
        {r.sms_fallback && <div className="kv"><span className="kv__k">SMS yedeği</span><span className="kv__v">{r.sms_fallback.due ? `${r.sms_fallback.count} kişiye bir kez` : "süre dolunca onaylamayanlara bir kez"} · {r.sms_fallback.note}</span></div>}
      </div></div>
      {r.requires_ack ? (
        <div className="card"><div className="card__head"><span className="card__title">Onaylayanlar</span></div><div className="card__body card__body--flush">
          {r.acks.length === 0 ? <Empty title="Henüz onay yok" /> : (
            <div className="table-wrap"><table className="data"><caption className="visually-hidden">Okuma onayları</caption>
              <thead><tr><th scope="col">Kişi</th><th scope="col">Bölüm</th><th scope="col">Onay zamanı</th><th scope="col">Kanal</th></tr></thead>
              <tbody>{r.acks.map((a, i) => <tr key={i}><td className="cell-main">{a.name}</td><td className="small">{a.units.join(", ")}</td><td className="small num">{formatDateTime(a.at)}</td><td className="small">Uygulama</td></tr>)}</tbody>
            </table></div>
          )}
        </div></div>
      ) : <Alert tone="info" title="Okuma onayı istenmedi">Bu duyuruda yalnız okunma sayısı tutulur.</Alert>}
      <p className="xs muted">Teslim ve açılma zamanları kişi bazında backend'den gelecek (istek 71). Hane üyesi onayı bölüm adına sayılmaz, ayrıca gösterilir. Rapor PDF'i belge arşivine kaydedilir (belge modülü).</p>
    </div>
  );
}

// ===================================================================== 72 Şablonlar
/** Bildirim ve duyuru şablonları (ILT-02): dil varyantları, değişkenler, SMS karakter/parça hesabı, sürüm. */
export function NotificationTemplatesPage() {
  const q = useSiteGet<Tpl[]>("/notification-templates");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHead title="Bildirim şablonları" subtitle="Sistem bildirimlerinin metnini sitenize göre düzenleyin. Zorunlu değişkenler silinemez; SMS'te Türkçe karakter 70, diğerleri 160 karakterde bir parça sayılır." />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.map((t) => (
        <div key={t.code} className="card">
          <div className="card__head"><span className="card__title">{t.name}</span><span className="card__meta">{t.channel === "sms" ? "SMS" : t.channel === "email" ? "E-posta" : "Uygulama bildirimi"} · sürüm {t.version}</span><span className="ml-auto">{t.customized ? <Badge tone="info">Özelleştirildi</Badge> : <Badge tone="muted">Sistem</Badge>}</span></div>
          {open === t.code ? <TplForm t={t} onDone={() => setOpen(null)} /> : (
            <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
              {t.variants.map((v) => <div key={v.lang} className="small"><strong>{v.lang.toUpperCase()}</strong> · {v.body}{t.sms && <span className="xs muted"> ({t.sms.find((x) => x.lang === v.lang)?.chars} karakter, {t.sms.find((x) => x.lang === v.lang)?.segments} SMS)</span>}</div>)}
              <div><button className="btn btn--sm" type="button" onClick={() => setOpen(t.code)}>Düzenle</button></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
function smsInfo(text: string) { const gsm = GSM7.test(text); const n = text.length; return { gsm, n, seg: n === 0 ? 0 : n <= (gsm ? 160 : 70) ? 1 : Math.ceil(n / (gsm ? 153 : 67)) }; }
const SAMPLE: Record<string, string> = { "sakin.ad": "Ayşe Yılmaz", bolum: "A-4", tutar: "1.250,00 ₺", vade: "10.11.2026", "site.ad": "Aksu Konakları", "makbuz.no": "MK-2026-0412", "talep.no": "118", "talep.konu": "Asansör arızası", durum: "Çözüldü", "ziyaretci.ad": "Mehmet Kaya", kapi: "Ana", firma: "Yurtiçi", "teslim.kodu": "482913", "duyuru.baslik": "Su kesintisi", link: "https://…/d/abc", tur: "Deprem", mesaj: "Binayı terk edip toplanma alanına gidin." };

function TplForm({ t, onDone }: { t: Tpl; onDone: () => void }) {
  const [vs, setVs] = useState(t.variants.map((v) => ({ ...v })));
  const m = useSiteMutation<{ variants: typeof vs }, Tpl>("PUT", `/notification-templates/${t.code}`, { onSuccess: onDone });
  const reset = useSiteMutation<Record<string, never>, Tpl>("POST", `/notification-templates/${t.code}/reset`, { onSuccess: onDone });
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ variants: vs }); }}>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="small">Değişkenler: {t.variables.map((x) => <code key={x} style={{ marginRight: 6 }}>{`{{${x}}}`}{t.required.includes(x) && "*"}</code>)} <span className="xs muted">(* zorunlu)</span></div>
        {vs.map((v, i) => {
          const info = smsInfo(v.body);
          const preview = v.body.replace(/\{\{\s*([a-z.]+)\s*\}\}/g, (_, k: string) => SAMPLE[k] ?? `{{${k}}}`);
          return (
            <div key={v.lang} className="stack" style={{ gap: "var(--s-1)" }}>
              <Field label={v.lang === "tr" ? "Türkçe" : "İngilizce"} error={fieldError(m.error, `variants.${v.lang}`)}>{(p) => <textarea {...p} className="field__input" rows={3} maxLength={600} value={v.body} onChange={(e) => setVs((x) => x.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))} />}</Field>
              {t.channel === "sms" && <div className={`xs ${info.seg > 3 ? "" : "muted"}`}>{info.n} karakter · {info.gsm ? "standart" : "Türkçe/özel karakter (70'lik parça)"} · <strong>{info.seg} SMS</strong>{info.seg > 3 && " — en fazla 3 parça"}</div>}
              <div className="xs muted">Önizleme: {preview}</div>
            </div>
          );
        })}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
        <SubmitButton busy={m.isPending}>Kaydet (yeni sürüm)</SubmitButton>
        {t.customized && <button className="btn btn--ghost" type="button" disabled={reset.isPending} onClick={() => reset.mutate({})}>Sistem metnine dön</button>}
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
        <span className="xs muted ml-auto">Sürüm geçmişi: {t.history.map((h) => `v${h.version} ${h.by}`).join(" · ")}</span>
      </div>
    </form>
  );
}

// ===================================================================== 73–74 Acil durum
/** Acil durum (ILT-04, ILT-06): mod başlatma, blok/bölüm panosu, toplanma alanı yoklaması, bilgi kartı. */
export function EmergencyPage() {
  const { can } = useSite();
  const start = can(P.announcementsPublish) || can(P.securityIncidents);
  const [s, set] = useUrlState({ sekme: "durum" });
  const q = useSiteGet<Active | null>("/emergencies/active", undefined, { refetchInterval: 10000 });
  return (
    <div className="stack">
      <PageHead title="Acil durum" subtitle="Acil durumda herkese anında ulaşın, kimin güvende kimin yardım beklediğini görün. Başlatma onay gerektirmez, kayda geçer." />
      {tabs([["durum", q.data ? "Aktif acil durum" : "Acil durum"], ["kart", "Acil bilgi kartı"], ["gecmis", "Geçmiş"]], s.sekme, (k) => set({ sekme: k }), "Acil durum")}
      {s.sekme === "kart" ? <InfoCardEditor manage={can(P.announcementsPublish)} /> : s.sekme === "gecmis" ? <History /> : q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data ? <Board e={q.data} canEnd={start} /> : start ? <StartForm /> : <Empty title="Aktif acil durum yok" icon={<Siren aria-hidden="true" />} />}
    </div>
  );
}

function StartForm() {
  const blocks = useSiteGet<Page<{ id: string; name: string }>>("/blocks", { page_size: 200 });
  const [f, setF] = useState({ kind: "earthquake", scope: "all", message: "" });
  const [ids, setIds] = useState<string[]>([]);
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", "/emergencies");
  return (
    <div className="card" style={{ borderColor: "var(--danger-line)" }}>
      <div className="card__head"><span className="card__icon" style={{ color: "var(--danger-fg)" }}><Siren aria-hidden="true" /></span><span className="card__title">Acil durumu başlat</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--2">
          <Field label="Tür" error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{Object.entries(EM_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
          <Field label="Kapsam">{(p) => <select {...p} className="field__input" value={f.scope} onChange={(e) => setF((x) => ({ ...x, scope: e.target.value }))}><option value="all">Tüm tesis</option><option value="blocks">Seçili bloklar</option></select>}</Field>
        </div>
        {f.scope === "blocks" && <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Bloklar</legend><div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>{(blocks.data?.items ?? []).map((b) => <label key={b.id} className="check"><input type="checkbox" checked={ids.includes(b.id)} onChange={() => setIds((x) => (x.includes(b.id) ? x.filter((y) => y !== b.id) : [...x, b.id]))} /><span>{b.name}</span></label>)}</div>{fieldError(m.error, "block_ids") && <span className="field__error" role="alert">{fieldError(m.error, "block_ids")}</span>}</fieldset>}
        <Field label="Mesaj" required hint="Sakinlerin uygulamasında ve SMS'te görünür" error={fieldError(m.error, "message")}>{(p) => <textarea {...p} className="field__input" rows={2} maxLength={300} value={f.message} onChange={(e) => setF((x) => ({ ...x, message: e.target.value }))} />}</Field>
        <ConfirmButton className="btn btn--danger" title="Acil durumu başlat" confirmLabel="Başlat" danger
          body={<p className="mb-0">Kapsamdaki herkese sessiz saat ve bildirim tercihlerini aşan bildirim gider; sakinin uygulamasında acil durum ekranı açılır. İşlem kayda geçer.</p>}
          onConfirm={() => m.mutateAsync({ ...f, block_ids: f.scope === "blocks" ? ids : [] })}><Siren aria-hidden="true" /> Acil durumu başlat</ConfirmButton>
      </div>
    </div>
  );
}

function Board({ e, canEnd }: { e: Active; canEnd: boolean }) {
  const card = useSiteGet<InfoCard>("/emergency-info-card");
  const [filter, setFilter] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [point, setPoint] = useState("");
  const muster = useSiteMutation<{ unit_ids: string[]; muster_point: string }, unknown>("POST", `/emergencies/${e.id}/muster-checks`, { onSuccess: () => setSel([]) });
  const end = useSiteMutation<Record<string, never>, unknown>("POST", `/emergencies/${e.id}/end`);
  const points = card.data?.muster_points.map((m) => m.name) ?? [];
  const mp = point || points[0] || "";
  const help = e.rows.filter((r) => r.status === "help");
  const blocks = [...new Map(e.rows.map((r) => [r.block_id, r.block_name])).entries()];
  const rows = e.rows.filter((r) => !filter || r.status === filter);
  const exportNone = () => downloadCsv(`yanit-yok-${formatDate(new Date().toISOString())}.csv`, [["Blok", "Bölüm"], ...e.rows.filter((r) => r.status === "none").map((r) => [r.block_name, r.unit_name])]);
  return (
    <div className="stack">
      <Alert tone="danger" title={`${EM_KIND[e.kind]} — acil durum aktif`}>{e.message} <span className="small">· {e.started_by}, {formatDateTime(e.started_at)}</span></Alert>
      <div className="grid grid--kpi">
        <Kpi label="Güvende" value={e.totals.safe} tone="ok" />
        <Kpi label="Toplanma alanında" value={e.totals.muster} />
        <Kpi label="Yardım istiyor" value={e.totals.help} tone={e.totals.help ? "danger" : undefined} />
        <Kpi label="Yanıt yok" value={`${e.totals.none}/${e.totals.total}`} tone={e.totals.none ? "warn" : undefined} />
      </div>
      {help.length > 0 && <div className="card" style={{ borderColor: "var(--danger-line)" }}><div className="card__head"><span className="card__title">Yardım isteyenler</span></div><div className="card__body stack" style={{ gap: "var(--s-1)" }}>{help.map((r) => <div key={r.unit_id} className="small"><strong>{r.block_name} · {r.unit_name}</strong> — {r.by}, {formatDateTime(r.at)}{r.note && ` · "${r.note}"`}</div>)}</div></div>}
      <div className="card">
        <div className="card__head"><span className="card__title">Bölüm durumu</span><span className="ml-auto row" style={{ gap: "var(--s-2)" }}><select className="field__input" style={{ minHeight: 36 }} aria-label="Duruma göre süz" value={filter} onChange={(x) => setFilter(x.target.value)}><option value="">Tümü</option>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select><button className="btn btn--sm" type="button" onClick={exportNone}><Download aria-hidden="true" /> Yanıt yok listesi</button></span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          {blocks.map(([bid, bname]) => { const br = rows.filter((r) => r.block_id === bid); if (!br.length) return null; return (
            <div key={bid}><div className="small strong" style={{ marginBottom: 4 }}>{bname} · {e.rows.filter((r) => r.block_id === bid && r.status !== "none").length}/{e.rows.filter((r) => r.block_id === bid).length} yanıt</div>
              <div className="em-grid">{br.map((r) => (
                <label key={r.unit_id} className={`em-cell em-cell--${r.status}`} title={r.note ?? undefined}>
                  <input type="checkbox" className="visually-hidden" checked={sel.includes(r.unit_id)} disabled={r.status === "help"} onChange={() => setSel((x) => (x.includes(r.unit_id) ? x.filter((y) => y !== r.unit_id) : [...x, r.unit_id]))} />
                  <span className="em-cell__name">{r.unit_name}</span><span className="em-cell__st">{sel.includes(r.unit_id) ? "✓ seçildi" : ST[r.status]![0]}</span>
                </label>
              ))}</div>
            </div>
          ); })}
        </div>
        <div className="card__foot stack" style={{ gap: "var(--s-2)" }}>
          <FormError error={muster.error} />
          <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field"><label className="field__label" htmlFor="em-mp">Toplanma alanı</label><select id="em-mp" className="field__input" value={mp} onChange={(x) => setPoint(x.target.value)}>{points.length === 0 && <option value="">— bilgi kartında alan yok —</option>}{points.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
            <button className="btn btn--primary" type="button" disabled={!sel.length || !mp || muster.isPending} onClick={() => muster.mutate({ unit_ids: sel, muster_point: mp })}>Seçili {sel.length} bölümü toplanma alanında işaretle</button>
          </div>
          <p className="xs muted mb-0">Yoklama: bölüm kutularına dokunup seçin. Sakinler uygulamadan "Güvendeyim", "Yardım lazım" ya da "Toplanma alanındayım" diyebilir. QR/NFC ile yoklama ve çevrimdışı toplama mobil uygulamayla gelecek.</p>
        </div>
      </div>
      {canEnd && <div><ConfirmButton className="btn" title="Acil durumu bitir" confirmLabel="Bitir" body={<p className="mb-0">Özet rapor üretilir; "güvendeyim" ve yoklama verileri 30 gün sonra silinir.</p>} onConfirm={() => end.mutateAsync({})}>Acil durumu bitir</ConfirmButton></div>}
    </div>
  );
}

function History() {
  const q = useSiteGet<PastEm[]>("/emergencies");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const past = q.data.filter((e) => e.ended_at);
  if (!past.length) return <Empty title="Geçmiş acil durum yok" />;
  return <div className="stack">{past.map((e) => <div key={e.id} className="card"><div className="card__body stack" style={{ gap: 4 }}><div className="strong">{EM_KIND[e.kind]} · {formatDateTime(e.started_at)} – {formatDateTime(e.ended_at)}</div><div className="small">{e.message}</div>{e.summary && <div className="small">{e.summary.safe} güvende · {e.summary.muster} toplanma alanında · {e.summary.help} yardım · {e.summary.none} yanıt yok (toplam {e.summary.total})</div>}<div className="xs muted">{e.started_by} başlattı, {e.ended_by} bitirdi · ayrıntılı veri {formatDate(e.purge_on)} tarihinde silinir</div></div></div>)}</div>;
}

function InfoCardEditor({ manage }: { manage: boolean }) {
  const q = useSiteGet<InfoCard>("/emergency-info-card");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return <InfoCardForm key={q.data.version} c={q.data} manage={manage} />;
}
function InfoCardForm({ c, manage }: { c: InfoCard; manage: boolean }) {
  const blocks = useSiteGet<Page<{ id: string; name: string }>>("/blocks", { page_size: 200 });
  const [mps, setMps] = useState(c.muster_points);
  const [phones, setPhones] = useState(c.phones);
  const [ins, setIns] = useState(c.instructions);
  const [notes, setNotes] = useState<Record<string, string>>(Object.fromEntries(c.block_notes.map((n) => [n.block_id, n.note])));
  const m = useSiteMutation<Record<string, unknown>, InfoCard>("PUT", "/emergency-info-card");
  function save() {
    m.mutate({ muster_points: mps, phones, instructions: ins, block_notes: (blocks.data?.items ?? []).map((b) => ({ block_id: b.id, block_name: b.name, note: notes[b.id] ?? "" })) });
  }
  return (
    <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
      <FormError error={m.error} />
      <p className="small muted mb-0">Sakin uygulaması kartı cihaza kaydeder; internet yokken de açılır. {c.updated_at ? `Son yayın: sürüm ${c.version}, ${c.updated_by}, ${formatDateTime(c.updated_at)}.` : "Henüz yayınlanmadı."}</p>
      <div className="card"><div className="card__head"><span className="card__title">Toplanma alanları</span></div><div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {fieldError(m.error, "muster_points") && <span className="field__error" role="alert">{fieldError(m.error, "muster_points")}</span>}
        {mps.map((p, i) => (
          <div key={p.id || i} className="stack" style={{ gap: "var(--s-2)", borderTop: i ? "1px solid var(--line)" : undefined, paddingTop: i ? "var(--s-2)" : undefined }}>
            <div className="grid grid--2">
              <Field label={`${i + 1}. alan adı`} error={fieldError(m.error, `muster_points.${i}.name`)}>{(pp) => <input {...pp} className="field__input" maxLength={60} disabled={!manage} value={p.name} onChange={(e) => setMps((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />}</Field>
              <Field label="Tarif">{(pp) => <input {...pp} className="field__input" maxLength={200} disabled={!manage} placeholder="ör. Site girişi, otoparkın karşısı" value={p.directions} onChange={(e) => setMps((x) => x.map((y, j) => (j === i ? { ...y, directions: e.target.value } : y)))} />}</Field>
            </div>
            <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end" }}>
              {manage && <PhotoInput label="Kroki" value={p.map} onChange={(v) => setMps((x) => x.map((y, j) => (j === i ? { ...y, map: v } : y)))} />}
              {!manage && p.map && <img src={p.map} alt={`${p.name} krokisi`} style={{ width: 120, borderRadius: 8 }} />}
              {manage && <button type="button" className="btn btn--ghost btn--sm" aria-label={`${i + 1}. alanı kaldır`} onClick={() => setMps((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>}
            </div>
          </div>
        ))}
        {manage && <div><button type="button" className="btn btn--sm" onClick={() => setMps((x) => [...x, { id: "", name: "", directions: "", map: null }])}><Plus aria-hidden="true" /> Toplanma alanı</button></div>}
      </div></div>
      <div className="card"><div className="card__head"><span className="card__title">Acil telefonlar</span></div><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        {phones.map((p, i) => (
          <div key={i} className="grid grid--kpi" style={{ alignItems: "end" }}>
            <Field label="Ad" error={fieldError(m.error, `phones.${i}.label`)}>{(pp) => <input {...pp} className="field__input" maxLength={40} disabled={!manage} value={p.label} onChange={(e) => setPhones((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />}</Field>
            <Field label="Numara" error={fieldError(m.error, `phones.${i}.number`)}>{(pp) => <input {...pp} className="field__input" type="tel" inputMode="tel" disabled={!manage} value={p.number} onChange={(e) => setPhones((x) => x.map((y, j) => (j === i ? { ...y, number: e.target.value } : y)))} />}</Field>
            {manage && <div><button type="button" className="btn btn--ghost btn--sm" aria-label={`${p.label || i + 1} numarasını kaldır`} onClick={() => setPhones((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button></div>}
          </div>
        ))}
        {manage && <div><button type="button" className="btn btn--sm" onClick={() => setPhones((x) => [...x, { label: "", number: "" }])}><Plus aria-hidden="true" /> Numara</button></div>}
      </div></div>
      <div className="card"><div className="card__head"><span className="card__title">Kısa talimatlar</span></div><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        {INSTR.map(([k, l]) => <Field key={k} label={l}>{(pp) => <textarea {...pp} className="field__input" rows={2} maxLength={400} disabled={!manage} value={ins[k] ?? ""} onChange={(e) => setIns((x) => ({ ...x, [k]: e.target.value }))} />}</Field>)}
      </div></div>
      <div className="card"><div className="card__head"><span className="card__title">Blok tahliye notları</span></div><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        {(blocks.data?.items ?? []).map((b) => <Field key={b.id} label={b.name}>{(pp) => <input {...pp} className="field__input" maxLength={200} disabled={!manage} placeholder="ör. B kapısından çıkın, merdiven 2 kullanılmaz" value={notes[b.id] ?? ""} onChange={(e) => setNotes((x) => ({ ...x, [b.id]: e.target.value }))} />}</Field>)}
      </div></div>
      {manage && <div><SubmitButton busy={m.isPending}>Kartı yayınla</SubmitButton></div>}
    </form>
  );
}
