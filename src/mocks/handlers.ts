// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26, YAP-01..10) backend'de; buradan kaldırıldı.
// Yalnız diğer sahte paketlerin kullandığı ortak alan ve araç önbelleği kaldı (aşağıda).
// Güvenlik ve devriye (40–46: kapılar, ön davet, sakin onayı, plaka/ihlal, kargo yetkilisi, nöbet defteri,
// devriye) ve park yerleri (K30) backend'de — sahte uçları silindi (25.10.2026).
//
// Rezervasyon 59–61 (alanlar ve kurallar, sakin/sakin adına rezervasyon, bekleme listesi, kod/QR ile giriş,
// no-show, kullanım raporu; K11 borçlu bölüm kısıtı) backend'de — sahte uçları silindi (27.10.2026).
// Genel kurul 75–77 (hazırlık ve çağrı, hazirun/vekâlet/nisap/salonda oylama, tutanak ve karar
// defteri) backend'de — sahte uçları silindi (27.10.2026).
//
// Backend'e geçti, handler'ı kaldırıldı: Satın alma 62–67 (tedarikçi kartı, ayar ve bütçe, talep/
// teklif/tedarikçi linki/onay, sipariş ve kabul, tedarikçi faturası ve üçlü eşleşme, ödenecekler).
// İletişim ve acil durum 71–74 (okuma onayı ve raporu, zamanlanmış
// duyuru, bildirim/duyuru şablonları, acil durum modu ve pano, toplanma yoklaması, acil bilgi kartı) — P12;
// 71'in sessiz saat ayarı (`communication-settings`; P16c kimlik ve bildirim gönderimi ile — SMS hesabı,
// teslim kayıtları, planlı raporlar). Raporlar ve KVKK 79–81 (rapor kataloğu, talep/SLA raporu, KVKK başvurusu, aydınlatma
// metni sürümleri, saklama politikası, denetim paketi). İnsan kaynakları 35–39 (sicil no ve açık işler, vardiya planı,
// izinler, puantaj, puantaj aktarımı; K29 personel hesabı ve giriş-çıkış dahil); Finans Mod P 27–34
// (dönem kapanışı ve kilit, kasa gün sonu, borç takibi, ödeme planı, dönem dışı ücretler, muhasebe
// aktarımı, finans parametreleri, tahakkuk fark raporu). Finans motoru P03b (otomatik tahakkuk 04, finans
// parametreleri 33, fark raporu 34; aidat kuralları, tahakkuk taslak/onay ve satır düzeltme, yıllık bütçe)
// baştan gerçek uçlarla bağlandı — burada sahte karşılığı yok.
// Platform destek 82–84 (destek talepleri, bilgi bankası, müşteri onaylı destek oturumu) backend'de —
// sahte uçları silindi (P15, 27.10.2026).
import { bypass, http, HttpResponse, type RequestHandler } from "msw";

const API = "/api/v1/sites/:slug";
const VALIDATION = "Formda düzeltilmesi gereken alanlar var.";

const err = (status: number, code: string, message: string, fields: Record<string, string> | null = null) =>
  HttpResponse.json({ error: { code, message, fields } }, { status });

/** Gerçek backend'e aynı oturum başlığıyla istek — sahte uç gerçek veriye dayansın. */
async function real<T>(request: Request, path: string, init?: { method?: string; body?: unknown; idem?: string }) {
  const headers = new Headers({ Authorization: request.headers.get("Authorization") ?? "", Accept: "application/json" });
  if (init?.body !== undefined) headers.set("Content-Type", "application/json");
  if (init?.idem) headers.set("Idempotency-Key", init.idem);
  const res = await fetch(bypass(new Request(new URL(path, request.url), { method: init?.method ?? "GET", headers, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined })));
  return { status: res.status, body: (await res.json().catch(() => null)) as T | null };
}

// Sahte servis verisi sekme kapanana kadar saklanır (sessionStorage): sayfa yenilenince kaybolmasın.
const STORE_KEY = "sy-mock-state";
const stores = new Map<string, Map<string, unknown>>();
function loadMap<K extends string, V>(name: string): Map<K, V> {
  let saved: Record<string, [K, V][]> = {};
  try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "{}"); } catch { /* bozuk ya da erişilemez */ }
  const m = new Map<K, V>(saved[name] ?? []);
  stores.set(name, m as Map<string, unknown>);
  return m;
}
/** Her sahte yanıttan sonra çağrılır (mocks/browser.ts). */
export function saveMockState() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries([...stores].map(([k, m]) => [k, [...m]])))); } catch { /* kota / gizli sekme */ }
}
function listOf<T>(m: Map<string, T[]>, slug: string): T[] {
  if (!m.has(slug)) m.set(slug, []);
  return m.get(slug)!;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
/** ISO zaman damgasının YEREL günü (UTC'de .slice(0, 10) gece yarısından sonra bir önceki günü verir). */
const dayOf = (ts: string) => iso(new Date(ts));

async function me(request: Request) {
  const r = await real<{ full_name: string; user_id: string }>(request, "/api/v1/me");
  return { name: r.body?.full_name ?? "—", id: r.body?.user_id ?? "" };
}
interface Paged<T> { items: T[]; total: number; page: number; page_size: number }
/** Gerçek sayfalı listeyi sonuna kadar okur (yerel demo veri küçük; servis gelince gerekmez). */
async function allPages<T>(request: Request, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let p = 1; p <= 25; p++) {
    const r = await real<Paged<T>>(request, `${path}${path.includes("?") ? "&" : "?"}page=${p}&page_size=200`);
    if (!r.body) break;
    out.push(...r.body.items);
    if (out.length >= r.body.total || r.body.items.length === 0) break;
  }
  return out;
}

// ============================================================================================
// Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26) backend'de. Diğer sahte paketlerin
// kullandığı ortak alanlar ve araçlar gerçek uçlardan okunup buraya önbelleğe alınır
// (kapı/plaka sahte uçları bu listeye bakar).
// ============================================================================================
interface CommonArea { id: string; name: string; kind: string; block_id: string | null; block_name: string | null; is_reservable: boolean; is_active: boolean; note: string | null }
interface Vehicle { id: string; plate: string; plate_display: string; unit_id: string; unit_name: string; owner_name: string | null; kind: "permanent" | "guest"; valid_until: string | null; status: "active" | "pending" | "inactive" }
const commonAreas = loadMap<string, CommonArea[]>("commonAreas");
const vehicles = loadMap<string, Vehicle[]>("vehicles");

/** Kapı sahte uçlarından önce gerçek ortak alan ve araç listesini önbelleğe alır. */
async function syncShared(request: Request, slug: string) {
  const areas = await real<CommonArea[]>(request, `/api/v1/sites/${slug}/common-areas`);
  if (areas.status === 200 && areas.body) commonAreas.set(slug, areas.body);
  // Güvenlik rolü araç listesini okuyamaz (units.read yok): önbellekteki son liste kalır
  const probe = await real<Paged<Vehicle>>(request, `/api/v1/sites/${slug}/vehicles?status=active&page_size=1`);
  if (probe.status === 200) vehicles.set(slug, await allPages<Vehicle>(request, `/api/v1/sites/${slug}/vehicles?status=active`));
}
const SYNC_PATHS = /\/(plates\/lookup|gate-logs|parking-violations)(\/|$|\?)/;

const ortakOnbellek: RequestHandler[] = [
  http.all(`${API}/*`, async ({ request, params }) => {
    if (SYNC_PATHS.test(new URL(request.url).pathname)) await syncShared(request, String(params.slug));
    return undefined; // sonraki sahte uca ya da gerçek backend'e geçer
  }),
];

// ============================================================================================
// Ortak yardımcılar — Finans Mod P (27–34) ve rezervasyon (59–61) gerçek backend'e geçti.
// ============================================================================================
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const tl = (c: number) => (c / 100).toFixed(2);
const addMonths = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last)); return iso(x); };

// Hizmetler paketi (servis istekleri 47–52) backend'de; aşağıdaki sahte uçlar (69 hizmet karnesi,
// talep raporları) gerçek talep satırındaki `sla` ve `feedback` alanlarını kullanır.
interface ReqRow { id: string; category: string; status: string; created_at: string; resolved_at: string | null; sla: { state: string } | null; feedback: { solved: boolean; score: number | null } | null }

// Satın alma paketi (servis istekleri 62–67) backend'de; sahte uçları silindi. Sözleşme
// performansı (68–70) tedarikçi kartını gerçek `/vendors` ucundan okur.
type RealVendor = { id: string; name: string; rating_avg: string | null; rating_count: number };
async function realVendor(request: Request, slug: string, id: string) {
  const r = await real<Paged<RealVendor>>(request, `/api/v1/sites/${slug}/vendors?page_size=200`);
  return (r.body?.items ?? []).find((v) => v.id === id) ?? null;
}

// ============================================================================================
// SÖZLEŞME PERFORMANSI (Yazılım Dokümanı SAT-06, 15.3) — servis istekleri 68–70
// ============================================================================================
interface CKpi { id: string; name: string; source: "inspection" | "patrol" | "tasks" | "sla" | "manual"; target: number; weight: number; request_category: string | null }
interface CPenalty { id: string; kpi_id: string; below_percent: number; cut_kind: "percent" | "fixed"; cut_value: string }
interface CEscalation { kind: "none" | "tufe" | "ufe" | "avg" | "fixed"; fixed_rate: number | null; period: "yearly" | "semiannual"; cap: number | null }
interface CEscRecord { date: string; old_amount: string; new_amount: string; rate: number; decision: "approve" | "reject"; note: string | null; by: string; at: string }
interface ContractExt { vendor_id: string | null; kpis: CKpi[]; penalties: CPenalty[]; escalation: CEscalation; escalations: CEscRecord[] }
interface ScoreRow { kpi_id: string; name: string; source: CKpi["source"]; target: number; weight: number; actual: number | null; score: number | null; detail: string | null }
interface Scorecard {
  id: string; contract_id: string; period: string; rows: ScoreRow[]; total: number | null; comment: string | null; status: "draft" | "finalized";
  penalty: { amount: string; reasons: string[]; status: "none" | "pending" | "approved" | "rejected"; decided_by: string | null; note: string | null } | null;
  monthly_amount: string | null; finalized_by: string | null; finalized_by_id: string | null; finalized_at: string | null;
}
interface IndexValue { period: string; tufe: number; ufe: number; entered_by: string; entered_at: string }
const contractExt = loadMap<string, Record<string, ContractExt>>("contractExt");
const scorecards = loadMap<string, Scorecard[]>("scorecards");
const indexValues = loadMap<string, IndexValue[]>("indexValues"); // "platform" → değerler (tüm tesisler ortak)
const extOf = (slug: string, id: string) => { if (!contractExt.has(slug)) contractExt.set(slug, {}); const m = contractExt.get(slug)!; if (!m[id]) m[id] = { vendor_id: null, kpis: [], penalties: [], escalation: { kind: "none", fixed_rate: null, period: "yearly", cap: null }, escalations: [] }; return m[id]!; };
type RealContract = { id: string; vendor: string; subject: string; category: string; start_date: string; end_date: string; amount: string | null; period: "monthly" | "yearly" | "once" | null };
const monthlyOf = (c: RealContract) => (!c.amount ? null : c.period === "yearly" ? Math.round(cents(c.amount) / 12) : c.period === "monthly" ? cents(c.amount) : null);
const inMonth = (iso: string, period: string) => dayOf(iso).slice(0, 7) === period;
const daysOfMonth = (period: string) => { const [y, m] = period.split("-").map(Number); const n = new Date(y!, m!, 0).getDate(); return Array.from({ length: n }, (_, i) => `${period}-${String(i + 1).padStart(2, "0")}`); };

/** KPI gerçekleşeni: kaynak modülün o ayki verisinden; veri yoksa null (elle girilir). */
async function kpiActual(request: Request, slug: string, k: CKpi, period: string): Promise<{ actual: number | null; detail: string | null }> {
  if (k.source === "inspection") {
    const l = ((await real<{ at: string; score: number }[]>(request, `/api/v1/sites/${slug}/inspections`)).body ?? []).filter((x) => inMonth(x.at, period));
    return l.length ? { actual: Math.round(l.reduce((s, x) => s + x.score, 0) / l.length), detail: `${l.length} denetim ortalaması` } : { actual: null, detail: "Bu ay denetim yok" };
  }
  if (k.source === "patrol") {
    // Devriye backend'de (servis isteği 46): ayın günleri gerçek uçtan okunur
    const days = daysOfMonth(period).filter((d) => d <= today());
    const runs = await Promise.all(days.map((d) => real<{ report: { total_points: number; scanned_points: number } }[]>(request, `/api/v1/sites/${slug}/patrol-runs?date=${d}`)));
    const l = runs.flatMap((r) => (Array.isArray(r.body) ? r.body : [])).map((r) => r.report);
    const tot = l.reduce((s, r) => s + r.total_points, 0), ok = l.reduce((s, r) => s + r.scanned_points, 0);
    return tot ? { actual: Math.round((ok / tot) * 100), detail: `${l.length} tur, ${ok}/${tot} nokta` } : { actual: null, detail: "Bu ay devriye yok" };
  }
  if (k.source === "tasks") {
    const days = daysOfMonth(period).filter((d) => d < today());
    let exp = 0, done = 0;
    for (const d of days) for (const t of (await real<{ status: string }[]>(request, `/api/v1/sites/${slug}/tasks?date=${d}`)).body ?? []) { exp++; if (t.status === "done") done++; }
    return exp ? { actual: Math.round((done / exp) * 100), detail: `${done}/${exp} görev` } : { actual: null, detail: "Bu ay görev yok" };
  }
  if (k.source === "sla") {
    const rows = await allPages<ReqRow>(request, `/api/v1/sites/${slug}/requests`);
    const l = rows.filter((r) => inMonth(r.created_at, period) && (!k.request_category || r.category === k.request_category) && ["resolved", "closed"].includes(r.status));
    const met = l.filter((r) => r.sla?.state === "met").length;
    return l.length ? { actual: Math.round((met / l.length) * 100), detail: `${met}/${l.length} talep SLA içinde` } : { actual: null, detail: "Bu ay kapanan talep yok" };
  }
  return { actual: null, detail: "Elle girilir" };
}
function scoreCard(sc: Scorecard) {
  for (const r of sc.rows) r.score = r.actual == null ? null : Math.min(100, Math.round((r.actual / r.target) * 100));
  const w = sc.rows.reduce((s, r) => s + r.weight, 0);
  sc.total = sc.rows.every((r) => r.score != null) && w ? Math.round(sc.rows.reduce((s, r) => s + r.score! * r.weight, 0) / w) : null;
}
function penaltyOf(ext: ContractExt, sc: Scorecard) {
  const reasons: string[] = []; let amount = 0;
  const monthly = sc.monthly_amount ? cents(sc.monthly_amount) : 0;
  for (const p of ext.penalties) {
    const r = sc.rows.find((x) => x.kpi_id === p.kpi_id);
    if (!r || r.actual == null) continue;
    const limit = r.target * (1 - p.below_percent / 100);
    if (r.actual < limit) {
      const cut = p.cut_kind === "percent" ? Math.round(monthly * Number(p.cut_value) / 100) : cents(p.cut_value);
      amount += cut;
      reasons.push(`${r.name}: gerçekleşen ${r.actual}, hedef ${r.target} (sınır ${(Math.round(limit * 10) / 10).toLocaleString("tr-TR")}) → ${p.cut_kind === "percent" ? `%${Number(p.cut_value).toLocaleString("tr-TR")}` : `${Number(p.cut_value).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`} kesinti`);
    }
  }
  return { amount, reasons };
}
const addMonthsIso = (d: string, n: number) => addMonths(d, n);
function nextEscalationDate(c: RealContract, e: CEscalation) {
  const step = e.period === "yearly" ? 12 : 6;
  let d = addMonthsIso(c.start_date, step);
  for (let i = 0; i < 100 && d <= today(); i++) d = addMonthsIso(d, step);
  return d <= c.end_date ? d : null;
}
function escalationPreview(c: RealContract, ext: ContractExt) {
  const e = ext.escalation;
  if (e.kind === "none" || !c.amount) return { status: "none" as const };
  const date = nextEscalationDate(c, e);
  if (!date) return { status: "none" as const };
  const days = Math.round((new Date(date + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 864e5);
  const done = ext.escalations.find((x) => x.date === date);
  if (done) { const perY = c.period === "monthly" ? 12 : c.period === "yearly" ? 1 : 0; return { status: done.decision === "approve" ? "approved" as const : "rejected" as const, date, days_left: days, index_period: addMonthsIso(date, -1).slice(0, 7), rate: done.rate, capped_rate: done.rate, old_amount: done.old_amount, new_amount: done.new_amount, annual_effect: tl((cents(done.new_amount) - cents(done.old_amount)) * perY), record: done }; }
  const idxPeriod = addMonthsIso(date, -1).slice(0, 7);
  let rate: number | null = e.kind === "fixed" ? e.fixed_rate : null;
  let index: IndexValue | null = null;
  if (e.kind !== "fixed") {
    index = [...listOf(indexValues, "platform")].filter((v) => v.period <= idxPeriod).sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
    if (index && index.period === idxPeriod) rate = e.kind === "tufe" ? index.tufe : e.kind === "ufe" ? index.ufe : Math.round(((index.tufe + index.ufe) / 2) * 100) / 100;
    else index = null;
  }
  const capped = rate != null && e.cap != null ? Math.min(rate, e.cap) : rate;
  const newAmount = capped != null ? Math.round(cents(c.amount) * (1 + capped / 100)) : null;
  const perYear = c.period === "monthly" ? 12 : c.period === "yearly" ? 1 : 0;
  return {
    status: days > 30 ? "not_due" as const : rate == null ? "missing_index" as const : "due" as const,
    date, days_left: days, index_period: idxPeriod, rate, capped_rate: capped, old_amount: c.amount, new_amount: newAmount != null ? tl(newAmount) : null,
    annual_effect: newAmount != null ? tl((newAmount - cents(c.amount)) * perYear) : null, record: done ?? null,
  };
}
async function contractOf(request: Request, slug: string, id: string) {
  const r = await real<RealContract>(request, `/api/v1/sites/${slug}/contracts/${id}`);
  if (r.status === 200 && r.body) return r.body;
  const l = await real<RealContract[]>(request, `/api/v1/sites/${slug}/contracts`);
  return (l.body ?? []).find((c) => c.id === id) ?? null;
}

const sozlesme: RequestHandler[] = [
  // 68 — Sözleşme performans tanımları
  http.get(`${API}/contracts/:id/performance`, async ({ request, params }) => {
    const slug = String(params.slug); const c = await contractOf(request, slug, String(params.id));
    if (!c) return err(404, "not_found", "Sözleşme bulunamadı.");
    const ext = extOf(slug, c.id);
    const v = ext.vendor_id ? await realVendor(request, slug, ext.vendor_id) : null;
    const cards = listOf(scorecards, slug).filter((s) => s.contract_id === c.id).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12);
    return HttpResponse.json({ ...ext, vendor: v ? { id: v.id, name: v.name, rating_avg: v.rating_avg, rating_count: v.rating_count } : null, monthly_amount: monthlyOf(c) != null ? tl(monthlyOf(c)!) : null, escalation_preview: escalationPreview(c, ext), last_scorecards: cards.map((s) => ({ period: s.period, total: s.total, status: s.status, penalty: s.penalty?.status === "approved" ? s.penalty.amount : null })) });
  }),
  http.put(`${API}/contracts/:id/performance`, async ({ request, params }) => {
    const slug = String(params.slug); const c = await contractOf(request, slug, String(params.id));
    if (!c) return err(404, "not_found", "Sözleşme bulunamadı.");
    const b = (await request.json()) as Partial<ContractExt>;
    const f: Record<string, string> = {};
    const kpis = (b.kpis ?? []).map((k) => ({ id: k.id || crypto.randomUUID(), name: (k.name ?? "").trim(), source: k.source, target: Number(k.target), weight: Number(k.weight), request_category: k.request_category || null }));
    kpis.forEach((k, i) => {
      if (k.name.length < 2) f[`kpis.${i}.name`] = "KPI adı yazın.";
      if (!["inspection", "patrol", "tasks", "sla", "manual"].includes(k.source)) f[`kpis.${i}.source`] = "Kaynak seçin.";
      if (!(k.target > 0 && k.target <= 100)) f[`kpis.${i}.target`] = "Hedef 1–100.";
      if (!(k.weight > 0 && k.weight <= 100)) f[`kpis.${i}.weight`] = "Ağırlık 1–100.";
    });
    if (kpis.length && kpis.reduce((s, k) => s + k.weight, 0) !== 100) f.kpis = "Ağırlıkların toplamı 100 olmalı.";
    const ids = new Set(kpis.map((k) => k.id));
    const pens = (b.penalties ?? []).map((p) => ({ id: p.id || crypto.randomUUID(), kpi_id: p.kpi_id, below_percent: Number(p.below_percent), cut_kind: p.cut_kind, cut_value: tl(cents(p.cut_value)) }));
    pens.forEach((p, i) => {
      if (!ids.has(p.kpi_id)) f[`penalties.${i}.kpi_id`] = "KPI seçin.";
      if (!(p.below_percent >= 0 && p.below_percent < 100)) f[`penalties.${i}.below_percent`] = "%0–99.";
      if (!["percent", "fixed"].includes(p.cut_kind)) f[`penalties.${i}.cut_kind`] = "Kesinti tipi seçin.";
      if (!(cents(p.cut_value) > 0) || (p.cut_kind === "percent" && Number(p.cut_value) > 100)) f[`penalties.${i}.cut_value`] = p.cut_kind === "percent" ? "%1–100." : "Tutar > 0.";
    });
    if (pens.some((p) => p.cut_kind === "percent") && monthlyOf(c) == null) f.penalties = "Yüzde kesinti için sözleşmede aylık ya da yıllık bedel olmalı.";
    const e = { ...extOf(slug, c.id).escalation, ...(b.escalation ?? {}) } as CEscalation;
    if (!["none", "tufe", "ufe", "avg", "fixed"].includes(e.kind)) f["escalation.kind"] = "Artış kuralı seçin.";
    if (e.kind === "fixed" && !(Number(e.fixed_rate) > 0 && Number(e.fixed_rate) <= 200)) f["escalation.fixed_rate"] = "Oran %0,01–200.";
    if (e.cap != null && !(Number(e.cap) > 0)) f["escalation.cap"] = "Tavan > 0 ya da boş.";
    if (e.kind !== "none" && !c.amount) f["escalation.kind"] = "Artış için sözleşmede bedel olmalı.";
    let vendorId = b.vendor_id === undefined ? extOf(slug, c.id).vendor_id : b.vendor_id;
    if (vendorId && !(await realVendor(request, slug, vendorId))) f.vendor_id = "Tedarikçi bulunamadı."; if (!vendorId) vendorId = null;
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const ext = extOf(slug, c.id);
    Object.assign(ext, { vendor_id: vendorId, kpis, penalties: pens, escalation: { kind: e.kind, fixed_rate: e.kind === "fixed" ? Number(e.fixed_rate) : null, period: e.period === "semiannual" ? "semiannual" : "yearly", cap: e.cap == null || (e.cap as unknown) === "" ? null : Number(e.cap) } });
    return HttpResponse.json({ data: ext, message: "Sözleşme performans kuralları kaydedildi." });
  }),
  // 69 — Aylık hizmet karnesi ve ceza kesintisi
  http.get(`${API}/contracts/:id/scorecards/:period`, async ({ request, params }) => {
    const slug = String(params.slug); const period = String(params.period);
    if (!/^\d{4}-\d{2}$/.test(period)) return err(422, "validation", VALIDATION, { period: "Dönem seçin." });
    const c = await contractOf(request, slug, String(params.id));
    if (!c) return err(404, "not_found", "Sözleşme bulunamadı.");
    const ext = extOf(slug, c.id);
    let sc = listOf(scorecards, slug).find((s) => s.contract_id === c.id && s.period === period);
    if (!sc) sc = { id: crypto.randomUUID(), contract_id: c.id, period, rows: [], total: null, comment: null, status: "draft", penalty: null, monthly_amount: monthlyOf(c) != null ? tl(monthlyOf(c)!) : null, finalized_by: null, finalized_by_id: null, finalized_at: null };
    if (sc.status === "draft") {
      const prev = sc.rows;
      sc.rows = [];
      for (const k of ext.kpis) {
        const a = await kpiActual(request, slug, k, period);
        const keepManual = prev.find((r) => r.kpi_id === k.id && (k.source === "manual" || a.actual == null));
        sc.rows.push({ kpi_id: k.id, name: k.name, source: k.source, target: k.target, weight: k.weight, actual: a.actual ?? keepManual?.actual ?? null, score: null, detail: a.detail });
      }
      scoreCard(sc);
      const pn = penaltyOf(ext, sc);
      sc.penalty = pn.reasons.length ? { amount: tl(pn.amount), reasons: pn.reasons, status: "none", decided_by: null, note: null } : null;
      if (!listOf(scorecards, slug).includes(sc) && ext.kpis.length) listOf(scorecards, slug).push(sc);
    }
    return HttpResponse.json({ ...sc, expected_invoice: sc.monthly_amount ? tl(cents(sc.monthly_amount) - (sc.penalty?.status === "approved" ? cents(sc.penalty.amount) : 0)) : null });
  }),
  http.patch(`${API}/contracts/:id/scorecards/:period`, async ({ request, params }) => {
    const slug = String(params.slug);
    const sc = listOf(scorecards, slug).find((s) => s.contract_id === params.id && s.period === params.period);
    if (!sc) return err(404, "not_found", "Karne bulunamadı; önce dönemi açın.");
    if (sc.status !== "draft") return err(409, "finalized", "Kesinleşmiş karne değiştirilemez.");
    const b = (await request.json()) as { values?: Record<string, number | null>; comment?: string };
    const f: Record<string, string> = {};
    for (const [kid, v] of Object.entries(b.values ?? {})) {
      const r = sc.rows.find((x) => x.kpi_id === kid);
      if (!r) continue;
      if (v != null && !(Number(v) >= 0 && Number(v) <= 100)) { f[`values.${kid}`] = "0–100."; continue; }
      r.actual = v == null ? null : Number(v);
    }
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    if (b.comment !== undefined) sc.comment = b.comment.trim() || null;
    scoreCard(sc);
    const pn = penaltyOf(extOf(slug, sc.contract_id), sc);
    sc.penalty = pn.reasons.length ? { amount: tl(pn.amount), reasons: pn.reasons, status: "none", decided_by: null, note: null } : null;
    return HttpResponse.json({ data: sc, message: "Karne güncellendi." });
  }),
  http.post(`${API}/contracts/:id/scorecards/:period/finalize`, async ({ request, params }) => {
    const slug = String(params.slug);
    const sc = listOf(scorecards, slug).find((s) => s.contract_id === params.id && s.period === params.period);
    if (!sc) return err(404, "not_found", "Karne bulunamadı.");
    if (sc.status !== "draft") return err(409, "finalized", "Karne zaten kesinleşti.");
    if (sc.period >= today().slice(0, 7)) return err(409, "period_open", "Dönem bitmeden karne kesinleşmez.");
    const missing = sc.rows.filter((r) => r.actual == null).map((r) => r.name);
    if (missing.length) return err(422, "missing_values", `Gerçekleşeni eksik KPI: ${missing.join(", ")}.`);
    const who = await me(request);
    Object.assign(sc, { status: "finalized", finalized_by: who.name, finalized_by_id: who.id, finalized_at: new Date().toISOString() });
    if (sc.penalty) sc.penalty.status = "pending";
    return HttpResponse.json({ data: sc, message: sc.penalty ? `Karne kesinleşti; ${Number(sc.penalty.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ ceza kesintisi onaya düştü.` : "Karne kesinleşti; ceza kuralı tetiklenmedi." });
  }),
  http.post(`${API}/contracts/:id/scorecards/:period/penalty`, async ({ request, params }) => {
    const slug = String(params.slug);
    const sc = listOf(scorecards, slug).find((s) => s.contract_id === params.id && s.period === params.period);
    if (!sc || !sc.penalty) return err(404, "not_found", "Ceza kesintisi bulunamadı.");
    if (sc.penalty.status !== "pending") return err(409, "invalid_status", "Onay bekleyen kesinti yok.");
    const who = await me(request);
    if (sc.finalized_by_id === who.id) return err(403, "self_approval", "Karneyi kesinleştiren kişi kesintiyi onaylayamaz.");
    const b = (await request.json()) as { decision?: string; note?: string };
    if (b.decision === "reject" && (b.note ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { note: "Ret gerekçesi yazın." });
    Object.assign(sc.penalty, { status: b.decision === "approve" ? "approved" : "rejected", decided_by: who.name, note: b.note?.trim() || null });
    return HttpResponse.json({ data: sc, message: b.decision === "approve" ? "Ceza kesintisi onaylandı; dönem faturasının beklenen tutarı düştü, tedarikçiye bildirim taslağı hazır." : "Ceza kesintisi reddedildi." });
  }),
  // 70 — Endeksli artış
  http.post(`${API}/contracts/:id/escalation`, async ({ request, params }) => {
    const slug = String(params.slug); const c = await contractOf(request, slug, String(params.id));
    if (!c) return err(404, "not_found", "Sözleşme bulunamadı.");
    const ext = extOf(slug, c.id); const p = escalationPreview(c, ext);
    if (p.status !== "due") return err(409, "not_due", p.status === "missing_index" ? "Endeks değeri girilmemiş; platform yöneticisine bildirildi." : "Onay bekleyen artış yok (artış tarihinden 30 gün önce açılır).");
    const b = (await request.json()) as { decision?: string; note?: string };
    if (b.decision === "reject" && (b.note ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { note: "Tedarikçiyle görüşme notunu yazın." });
    const who = await me(request);
    if (b.decision === "approve") {
      const r = await real(request, `/api/v1/sites/${slug}/contracts/${c.id}`, { method: "PATCH", body: { amount: p.new_amount } });
      if (r.status >= 300) return err(r.status, "contract_update_failed", "Sözleşme bedeli güncellenemedi.");
    }
    ext.escalations.push({ date: p.date!, old_amount: p.old_amount!, new_amount: b.decision === "approve" ? p.new_amount! : p.old_amount!, rate: p.capped_rate!, decision: b.decision === "approve" ? "approve" : "reject", note: b.note?.trim() || null, by: who.name, at: new Date().toISOString() });
    return HttpResponse.json({ data: escalationPreview(c, ext), message: b.decision === "approve" ? `Yeni bedel ${Number(p.new_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺, ${p.date!.split("-").reverse().join(".")} tarihinden itibaren geçerli.` : "Bedel değişmedi; görüşme notu kaydedildi." });
  }),
  http.get("/api/v1/platform/index-values", () => HttpResponse.json([...listOf(indexValues, "platform")].sort((a, b) => b.period.localeCompare(a.period)))),
  http.put("/api/v1/platform/index-values/:period", async ({ request, params }) => {
    const m = await real<{ is_platform_admin: boolean; full_name: string }>(request, "/api/v1/me");
    if (!m.body?.is_platform_admin) return err(404, "not_found", "Bulunamadı.");
    const period = String(params.period);
    const b = (await request.json()) as { tufe?: number; ufe?: number };
    const f: Record<string, string> = {};
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > today().slice(0, 7)) f.period = "Geçmiş ya da bu ay olmalı.";
    if (!(Number(b.tufe) > -50 && Number(b.tufe) < 500)) f.tufe = "Yıllık TÜFE (%) girin.";
    if (!(Number(b.ufe) > -50 && Number(b.ufe) < 500)) f.ufe = "Yıllık ÜFE (%) girin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const l = listOf(indexValues, "platform");
    const v: IndexValue = { period, tufe: Math.round(Number(b.tufe) * 100) / 100, ufe: Math.round(Number(b.ufe) * 100) / 100, entered_by: m.body.full_name, entered_at: new Date().toISOString() };
    const i = l.findIndex((x) => x.period === period); if (i >= 0) l[i] = v; else l.push(v);
    return HttpResponse.json({ data: v, message: `${period} endeks değerleri kaydedildi; tüm tesislerde artış hesaplarında kullanılır.` });
  }),
];

export const handlers: RequestHandler[] = [...ortakOnbellek, ...sozlesme];
