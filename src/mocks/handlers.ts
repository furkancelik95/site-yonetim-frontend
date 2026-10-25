// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26, YAP-01..10) backend'de; buradan kaldırıldı.
// Yalnız diğer sahte paketlerin kullandığı ortak alan ve araç önbelleği kaldı (aşağıda).
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
const monthStart = () => today().slice(0, 7) + "-01";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_RE = /^[A-Za-zÇĞİÖŞÜçğıöşü' -]{2,60}$/u;
const normPhone = (v: string) => { const d = v.replace(/\D/g, "").replace(/^90/, "").replace(/^0/, ""); return d ? `+90${d}` : ""; };

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

// Gerçek yapı şekli (openapi: UnitListItem)
interface UnitRow { id: string; display_name: string; block: { id: string; name: string }; number: string; floor: number | null; unit_type: { id: string; name: string } | null; gross_area: string | null; net_area: string | null; land_share_numerator: number | null; land_share_denominator: number | null; usage: string; is_active: boolean; owner_names: string[]; tenant_names: string[] }

// ============================================================================================
// Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26) backend'de. Diğer sahte paketlerin
// kullandığı ortak alanlar ve araçlar gerçek uçlardan okunup buraya önbelleğe alınır
// (rezervasyon ve kapı/plaka sahte uçları bu listeye bakar).
// ============================================================================================
interface CommonArea { id: string; name: string; kind: string; block_id: string | null; block_name: string | null; is_reservable: boolean; is_active: boolean; note: string | null }
interface Vehicle { id: string; plate: string; plate_display: string; unit_id: string; unit_name: string; owner_name: string | null; kind: "permanent" | "guest"; valid_until: string | null; status: "active" | "pending" | "inactive" }
const commonAreas = loadMap<string, CommonArea[]>("commonAreas");
const vehicles = loadMap<string, Vehicle[]>("vehicles");
const PLATE_RE = /^(0[1-9]|[1-7]\d|8[01])[A-Z]{1,3}\d{2,5}$/;
const normPlate = (v: string) => v.toLocaleUpperCase("en-US").replace(/[^A-Z0-9]/g, "");
const displayPlate = (p: string) => p.replace(/^(\d{2})([A-Z]+)(\d+)$/, "$1 $2 $3");

async function myUnits(request: Request, slug: string) {
  const h = await real<{ units: { unit_id: string; unit_name: string; role: string }[] }>(request, `/api/v1/sites/${slug}/resident/home`);
  return { status: h.status, units: h.body?.units ?? [] };
}

/** Rezervasyon ve kapı sahte uçlarından önce gerçek ortak alan ve araç listesini önbelleğe alır. */
async function syncShared(request: Request, slug: string) {
  const areas = await real<CommonArea[]>(request, `/api/v1/sites/${slug}/common-areas`);
  if (areas.status === 200 && areas.body) commonAreas.set(slug, areas.body);
  // Güvenlik rolü araç listesini okuyamaz (units.read yok): önbellekteki son liste kalır
  const probe = await real<Paged<Vehicle>>(request, `/api/v1/sites/${slug}/vehicles?status=active&page_size=1`);
  if (probe.status === 200) vehicles.set(slug, await allPages<Vehicle>(request, `/api/v1/sites/${slug}/vehicles?status=active`));
}
const SYNC_PATHS = /\/(reservable-areas|reservations|resident\/reservable-areas|resident\/reservations|reservation-waitlist|plates\/lookup|gate-logs|parking-violations)(\/|$|\?)/;

const ortakOnbellek: RequestHandler[] = [
  http.all(`${API}/*`, async ({ request, params }) => {
    if (SYNC_PATHS.test(new URL(request.url).pathname)) await syncShared(request, String(params.slug));
    return undefined; // sonraki sahte uca ya da gerçek backend'e geçer
  }),
];

// ============================================================================================
// FİNANS PAKETİ (Yazılım Dokümanı FIN-05/06/11/12/13/14/16) — servis istekleri 27–34
// ============================================================================================
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const tl = (c: number) => (c / 100).toFixed(2);
const addMonths = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last)); return iso(x); };
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return iso(x); };
const nextMonth = () => addMonths(monthStart(), 1).slice(0, 7);
const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const periodLabel = (p: string) => `${TR_MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
/** Toplamı koruyan eşit bölme: kuruş artığı ilk taksitlere birer kuruş ("en büyük kalan"). */
function splitEven(totalCents: number, n: number) {
  const base = Math.floor(totalCents / n), rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}
interface Entry { id: string; date: string; due_date: string | null; debit: string; credit: string; source: string; description: string }
interface StatementResp { account: { id: string; unit_id: string; unit_name: string; person_name: string | null; reference_code: string; kind: string; balance: string }; entries: Paged<Entry> }
async function statement(request: Request, slug: string, accountId: string, pages = 5) {
  let acc: StatementResp["account"] | null = null; const items: Entry[] = [];
  for (let p = 1; p <= pages; p++) {
    const r = await real<StatementResp>(request, `/api/v1/sites/${slug}/accounts/${accountId}/statement?page=${p}&page_size=200`);
    if (!r.body) return { status: r.status, account: null, entries: [] as Entry[] };
    acc = r.body.account; items.push(...r.body.entries.items);
    if (items.length >= r.body.entries.total) break;
  }
  return { status: 200, account: acc, entries: items };
}

// ---------------------------------------------------------------- 33 Finans parametreleri
interface FinParams { reminder_days: number[]; demand_letter_day: number; proration: "monthly" | "daily"; diff_threshold_percent: number; bank_auto_match: "high" | "high_medium"; plan_tolerance_days: number; plan_suspends_late_fee: boolean; budget_warn_percent: number }
interface ParamVersion { id: string; effective_period: string; values: FinParams; changed: string[]; changed_by: string; created_at: string }
const FIN_DEFAULTS: FinParams = { reminder_days: [3, 10, 30], demand_letter_day: 60, proration: "monthly", diff_threshold_percent: 10, bank_auto_match: "high", plan_tolerance_days: 10, plan_suspends_late_fee: true, budget_warn_percent: 90 };
const FINANCIAL_KEYS: (keyof FinParams)[] = ["proration", "plan_suspends_late_fee"];
const paramVersions = loadMap<string, ParamVersion[]>("finParams");
function paramsAt(slug: string, period = today().slice(0, 7)): FinParams {
  const v = listOf(paramVersions, slug).filter((x) => x.effective_period <= period).sort((a, b) => a.effective_period.localeCompare(b.effective_period) || a.created_at.localeCompare(b.created_at));
  return v.length ? v.at(-1)!.values : FIN_DEFAULTS;
}

// ---------------------------------------------------------------- 28 Kasa günü
interface CashDay { date: string; system_balance: string; counted: string; difference: string; reason: string | null; closed_by: string; closed_at: string }
const cashDays = loadMap<string, CashDay[]>("cashDays"); // cash_account_id → kapanan günler
interface CashMove { id: string; date: string; inflow: string; outflow: string }
interface CashStmt { account: { id: string; kind: string; name: string }; opening: string; closing: string; movements: Paged<CashMove> }

// ---------------------------------------------------------------- 29 Borç takibi
interface CollectionEvent { id: string; account_id: string; kind: "reminder" | "call" | "note" | "demand_letter"; channel: string | null; note: string | null; by: string; at: string; letter?: { id: string; method: "hand" | "registered_mail" | "notary"; sent_on: string; tracking_no: string | null; served_on: string | null; status: "sent" | "served" } }
const collectionEvents = loadMap<string, CollectionEvent[]>("collectionEvents"); // slug → olaylar
interface Debtor { id: string; unit_id: string; unit_name: string; person_name: string | null; reference_code: string; balance: string; overdue_days: number }

// ---------------------------------------------------------------- 30 Ödeme planı
interface Installment { no: number; due_date: string; amount: string; paid: string; status: "paid" | "partial" | "open" | "overdue" }
interface PaymentPlan { id: string; account_id: string; unit_id: string; unit_name: string; person_name: string | null; reference_code: string; total: string; installment_count: number; tolerance_days: number; note: string | null; created_by: string; created_at: string; start_date: string; cancelled_at: string | null; cancel_reason: string | null; installments: Installment[]; status: "active" | "broken" | "completed" | "cancelled"; paid_total: string }
const paymentPlans = loadMap<string, PaymentPlan[]>("paymentPlans");
/** Plan durumu: planın oluştuğu günden sonraki tahsilatlar taksitlere sırayla dağıtılır. */
async function planWithStatus(request: Request, slug: string, p: PaymentPlan): Promise<PaymentPlan> {
  if (p.cancelled_at) return { ...p, status: "cancelled" };
  const st = await statement(request, slug, p.account_id, 3);
  let pool = st.entries.filter((e) => e.date >= p.start_date && cents(e.credit) > 0).reduce((s, e) => s + cents(e.credit), 0);
  const paidTotal = pool;
  let broken = false;
  const inst = p.installments.map((i) => {
    const amt = cents(i.amount); const paid = Math.min(pool, amt); pool -= paid;
    const late = today() > addDays(i.due_date, p.tolerance_days);
    const status: Installment["status"] = paid >= amt ? "paid" : late ? "overdue" : paid > 0 ? "partial" : "open";
    if (status === "overdue") broken = true;
    return { ...i, paid: tl(paid), status };
  });
  const done = inst.every((i) => i.status === "paid");
  return { ...p, installments: inst, paid_total: tl(Math.min(paidTotal, cents(p.total))), status: done ? "completed" : broken ? "broken" : "active" };
}

// ---------------------------------------------------------------- 31 Dönem dışı ücretler
type AdHocSource = "reservation" | "service" | "renovation" | "penalty" | "other";
interface AdHocSettings { sources: Record<AdHocSource, { mode: "immediate" | "next_period"; due_days: number }> }
interface AdHocCharge { id: string; unit_id: string; unit_name: string; account_id: string; account_kind: string; reference_code: string; person_name: string | null; source: AdHocSource; description: string; amount: string; due_date: string; mode: "immediate" | "next_period"; status: "posted" | "waiting_next_run" | "cancelled"; created_by: string; created_at: string; cancel_reason: string | null }
const adHocSettings = loadMap<string, AdHocSettings>("adHocSettings");
const adHocCharges = loadMap<string, AdHocCharge[]>("adHocCharges");
const AD_HOC_SOURCES: AdHocSource[] = ["reservation", "service", "renovation", "penalty", "other"];
const adHocOf = (slug: string) => { if (!adHocSettings.has(slug)) adHocSettings.set(slug, { sources: Object.fromEntries(AD_HOC_SOURCES.map((s) => [s, { mode: "immediate", due_days: 10 }])) as AdHocSettings["sources"] }); return adHocSettings.get(slug)!; };

// ---------------------------------------------------------------- 32 Muhasebe aktarımı
interface Mapping { key: string; label: string; debit_account: string; credit_account: string }
interface Voucher { key: string; source: string; source_id: string; date: string; description: string; debit_account: string; credit_account: string; amount: string }
interface ExportBatch { id: string; period: string; voucher_count: number; total: string; created_by: string; created_at: string; file_name: string; vouchers: Voucher[] }
const MAPPING_DEFAULTS: Mapping[] = [
  { key: "charge", label: "Aidat tahakkuku", debit_account: "120", credit_account: "600" },
  { key: "ad_hoc_charge", label: "Dönem dışı ücret", debit_account: "120", credit_account: "602" },
  { key: "payment_cash", label: "Tahsilat — nakit", debit_account: "100", credit_account: "120" },
  { key: "payment_bank_transfer", label: "Tahsilat — havale/EFT", debit_account: "102", credit_account: "120" },
  { key: "payment_credit_card", label: "Tahsilat — kredi kartı", debit_account: "108", credit_account: "120" },
  { key: "payment_other", label: "Tahsilat — diğer", debit_account: "", credit_account: "120" },
  { key: "expense", label: "Gider ödemesi", debit_account: "770", credit_account: "102" },
];
const mappings = loadMap<string, Mapping[]>("accMappings");
const exportBatches = loadMap<string, ExportBatch[]>("accExports");
const mappingsOf = (slug: string) => { if (!mappings.has(slug)) mappings.set(slug, MAPPING_DEFAULTS.map((m) => ({ ...m }))); return mappings.get(slug)!; };
async function vouchersFor(request: Request, slug: string, period: string) {
  const from = `${period}-01`, to = iso(new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0));
  const map = new Map(mappingsOf(slug).map((m) => [m.key, m]));
  const out: Voucher[] = [];
  const runs = await allPages<{ id: string; period: string; year: number; month: number; status: string; charge_date: string; total_amount: string }>(request, `/api/v1/sites/${slug}/charge-runs`);
  for (const r of runs.filter((x) => x.status === "posted" && x.charge_date >= from && x.charge_date <= to)) {
    const m = map.get("charge")!;
    out.push({ key: `charge:${r.id}`, source: "charge", source_id: r.id, date: r.charge_date, description: `${r.period} aidat tahakkuku`, debit_account: m.debit_account, credit_account: m.credit_account, amount: r.total_amount });
  }
  const pays = await allPages<{ id: string; date: string; amount: string; method: string; status: string; unit_name: string; reference_code: string }>(request, `/api/v1/sites/${slug}/payments?from=${from}&to=${to}`);
  for (const p of pays.filter((x) => x.status !== "reversed")) {
    const m = map.get(`payment_${p.method}`) ?? map.get("payment_other")!;
    out.push({ key: `payment:${p.id}`, source: `payment_${p.method}`, source_id: p.id, date: p.date, description: `Tahsilat ${p.unit_name} ${p.reference_code}`, debit_account: m.debit_account, credit_account: m.credit_account, amount: p.amount });
  }
  const exps = await allPages<{ id: string; description: string; amount: string; paid_on: string | null; is_paid: boolean; is_reversed: boolean; is_reversal: boolean }>(request, `/api/v1/sites/${slug}/expenses?year=${period.slice(0, 4)}`);
  for (const e of exps.filter((x) => x.is_paid && !x.is_reversed && !x.is_reversal && x.paid_on && x.paid_on >= from && x.paid_on <= to)) {
    const m = map.get("expense")!;
    out.push({ key: `expense:${e.id}`, source: "expense", source_id: e.id, date: e.paid_on!, description: e.description, debit_account: m.debit_account, credit_account: m.credit_account, amount: e.amount });
  }
  for (const c of listOf(adHocCharges, slug).filter((x) => x.status === "posted" && dayOf(x.created_at) >= from && dayOf(x.created_at) <= to)) {
    const m = map.get("ad_hoc_charge")!;
    out.push({ key: `ad_hoc:${c.id}`, source: "ad_hoc_charge", source_id: c.id, date: dayOf(c.created_at), description: `${c.unit_name} ${c.description}`, debit_account: m.debit_account, credit_account: m.credit_account, amount: c.amount });
  }
  const exported = new Set(listOf(exportBatches, slug).flatMap((b) => b.vouchers.map((v) => v.key)));
  const pending = out.filter((v) => !exported.has(v.key)).sort((a, b) => a.date.localeCompare(b.date));
  const missing = [...new Set(pending.filter((v) => !v.debit_account || !v.credit_account).map((v) => map.get(v.source)?.label ?? v.source))];
  return { period, vouchers: pending, already_exported: out.length - pending.length, total: tl(pending.reduce((s, v) => s + cents(v.amount), 0)), missing_mappings: missing };
}

// ---------------------------------------------------------------- 27 Dönem kapanışı
interface FiscalPeriod { period: string; status: "open" | "closing" | "locked" | "temp_open"; exceptions: Record<string, string>; closing_started_by: string | null; locked_by: string | null; locked_at: string | null; unlock_until: string | null; history: { at: string; by: string; action: string; note: string | null }[] }
const fiscalPeriods = loadMap<string, FiscalPeriod[]>("fiscalPeriods");
function periodOf(slug: string, period: string): FiscalPeriod {
  const list = listOf(fiscalPeriods, slug);
  let p = list.find((x) => x.period === period);
  if (!p) { p = { period, status: "open", exceptions: {}, closing_started_by: null, locked_by: null, locked_at: null, unlock_until: null, history: [] }; list.push(p); }
  if (p.status === "temp_open" && p.unlock_until && p.unlock_until < new Date().toISOString()) { p.status = "locked"; p.unlock_until = null; p.history.push({ at: new Date().toISOString(), by: "Sistem", action: "relocked", note: "Süreli açma süresi doldu" }); }
  return p;
}
async function closeChecklist(request: Request, slug: string, period: string) {
  const from = `${period}-01`, to = iso(new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0));
  const [runs, approvals, cash, exps, vouchers] = await Promise.all([
    allPages<{ period: string; year: number; month: number; status: string }>(request, `/api/v1/sites/${slug}/charge-runs`),
    real<Paged<{ action_type: string; status: string }>>(request, `/api/v1/sites/${slug}/approvals?tab=pending&page_size=200`),
    real<{ items: { id: string; name: string; kind: string; is_active: boolean }[] }>(request, `/api/v1/sites/${slug}/cash-accounts`),
    allPages<{ date: string; is_paid: boolean; is_reversed: boolean; is_reversal: boolean; description: string }>(request, `/api/v1/sites/${slug}/expenses?year=${period.slice(0, 4)}`),
    vouchersFor(request, slug, period),
  ]);
  const posted = runs.some((r) => r.status === "posted" && `${r.year}-${String(r.month).padStart(2, "0")}` === period);
  const openDays: string[] = [];
  for (const a of (cash.body?.items ?? []).filter((x) => x.kind === "cash" && x.is_active)) {
    const st = await real<CashStmt>(request, `/api/v1/sites/${slug}/cash-accounts/${a.id}/statement?from=${from}&to=${to}&page_size=200`);
    const days = new Set((st.body?.movements.items ?? []).map((m) => m.date));
    const closed = new Set(listOf(cashDays, a.id).map((d) => d.date));
    for (const d of days) if (!closed.has(d)) openDays.push(`${a.name} ${new Date(d).toLocaleDateString("tr-TR")}`);
  }
  const finApprovals = (approvals.body?.items ?? []).filter((x) => x.status === "pending");
  const unpaid = exps.filter((e) => e.date >= from && e.date <= to && !e.is_paid && !e.is_reversed && !e.is_reversal);
  return [
    { key: "charge", label: "Dönem tahakkuku kesinleşti", ok: posted, detail: posted ? "Tahakkuk kaydedildi" : "Bu dönem için tahakkuk kaydı yok", link: "tahakkuk", required: true },
    { key: "cash_days", label: "Kasa günleri kapatıldı", ok: openDays.length === 0, detail: openDays.length ? `${openDays.length} gün açık: ${openDays.slice(0, 4).join(", ")}${openDays.length > 4 ? "…" : ""}` : "Hareketli tüm kasa günleri sayımla kapandı", link: "kasa", required: true },
    { key: "approvals", label: "Bekleyen onay talebi yok", ok: finApprovals.length === 0, detail: finApprovals.length ? `${finApprovals.length} talep onay bekliyor` : "Bekleyen talep yok", link: "onaylar", required: true },
    { key: "expenses", label: "Dönem giderleri ödendi ya da işaretlendi", ok: unpaid.length === 0, detail: unpaid.length ? `${unpaid.length} ödenmemiş gider: ${unpaid.slice(0, 3).map((e) => e.description).join(", ")}` : "Ödenmemiş gider yok", link: "giderler", required: false },
    { key: "bank", label: "Eşleşmeyen banka hareketi yok", ok: true, detail: "Eşleşmeyen hareket kuyruğu henüz yok; banka aktarımında eşleşmeyenler aktarılmıyor", link: "banka-aktarim", required: false },
    { key: "accounting", label: "Muhasebe fişleri aktarıldı", ok: vouchers.vouchers.length === 0, detail: vouchers.vouchers.length ? `${vouchers.vouchers.length} fiş aktarılmadı` : "Aktarılmamış fiş yok", link: "muhasebe-aktarimi", required: true },
  ];
}
function periodOut(p: FiscalPeriod) { return { ...p, label: periodLabel(p.period), is_past: p.period < today().slice(0, 7) }; }

// ---------------------------------------------------------------- 34 Tahakkuk fark raporu
interface ChargeRow { ledger_account_id: string; unit_name: string; person_name: string | null; account_kind: string; amount: string }

const finans: RequestHandler[] = [
  // 33 — Finans parametreleri
  http.get(`${API}/finance-parameters`, ({ params }) => {
    const slug = String(params.slug);
    const versions = [...listOf(paramVersions, slug)].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return HttpResponse.json({ current: paramsAt(slug), current_period: today().slice(0, 7), earliest_financial_period: nextMonth(), defaults: FIN_DEFAULTS, versions, scheduled: versions.filter((v) => v.effective_period > today().slice(0, 7)) });
  }),
  http.post(`${API}/finance-parameters/versions`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { effective_period?: string; values?: Partial<FinParams> };
    const base = paramsAt(slug, b.effective_period ?? today().slice(0, 7));
    const v: FinParams = { ...base, ...(b.values ?? {}) };
    const f: Record<string, string> = {};
    if (!b.effective_period || !/^\d{4}-\d{2}$/.test(b.effective_period)) f.effective_period = "Yürürlük dönemini seçin.";
    const days = v.reminder_days;
    if (!Array.isArray(days) || days.length !== 3 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 120) || !(days[0]! < days[1]! && days[1]! < days[2]!)) f.reminder_days = "Üç kademe günü artan sırada, 1–120 arası olmalı.";
    if (!Number.isInteger(v.demand_letter_day) || v.demand_letter_day <= (days?.[2] ?? 0) || v.demand_letter_day > 365) f.demand_letter_day = "İhtarname günü son hatırlatma kademesinden sonra olmalı (en fazla 365).";
    if (!(v.diff_threshold_percent >= 1 && v.diff_threshold_percent <= 100)) f.diff_threshold_percent = "1–100 arası.";
    if (!(Number.isInteger(v.plan_tolerance_days) && v.plan_tolerance_days >= 0 && v.plan_tolerance_days <= 60)) f.plan_tolerance_days = "0–60 gün.";
    if (!(v.budget_warn_percent >= 50 && v.budget_warn_percent <= 100)) f.budget_warn_percent = "50–100 arası.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const changed = (Object.keys(v) as (keyof FinParams)[]).filter((k) => JSON.stringify(v[k]) !== JSON.stringify(base[k]));
    if (changed.length === 0) return err(422, "no_change", "Değişen bir parametre yok.");
    const financial = changed.filter((k) => FINANCIAL_KEYS.includes(k));
    if (financial.length && b.effective_period! < nextMonth()) return err(422, "period_locked", `Finansal etkili parametreler en erken ${periodLabel(nextMonth())} döneminden geçerli olur.`, { effective_period: `En erken ${periodLabel(nextMonth())}` });
    if (!financial.length && b.effective_period! < today().slice(0, 7)) return err(422, "validation", VALIDATION, { effective_period: "Geçmiş döneme parametre yazılamaz." });
    const ver: ParamVersion = { id: crypto.randomUUID(), effective_period: b.effective_period!, values: v, changed, changed_by: (await me(request)).name, created_at: new Date().toISOString() };
    listOf(paramVersions, slug).push(ver);
    return HttpResponse.json({ data: ver, message: `Finans parametreleri ${periodLabel(ver.effective_period)} döneminden geçerli olacak şekilde kaydedildi; geçmiş dönemler değişmez.` }, { status: 201 });
  }),

  // 28 — Kasa gün sonu sayımı
  http.get(`${API}/cash-accounts/:id/days`, async ({ request, params }) => {
    const slug = String(params.slug);
    const from = addDays(today(), -60);
    const st = await real<CashStmt>(request, `/api/v1/sites/${slug}/cash-accounts/${params.id}/statement?from=${from}&to=${today()}&page_size=200`);
    if (!st.body) return HttpResponse.json(st.body, { status: st.status });
    const closed = listOf(cashDays, String(params.id));
    const closedSet = new Set(closed.map((d) => d.date));
    const open = [...new Set(st.body.movements.items.map((m) => m.date))].filter((d) => !closedSet.has(d)).sort();
    return HttpResponse.json({ kind: st.body.account.kind, open_days: open, closed: [...closed].sort((a, b) => b.date.localeCompare(a.date)) });
  }),
  http.post(`${API}/cash-accounts/:id/days/close`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { date?: string; counted?: string; reason?: string };
    const f: Record<string, string> = {};
    if (!b.date || !DATE_RE.test(b.date)) f.date = "Günü seçin."; else if (b.date > today()) f.date = "Gelecek gün kapatılamaz.";
    if (b.counted == null || b.counted === "" || Number.isNaN(Number(b.counted)) || Number(b.counted) < 0) f.counted = "Sayılan tutarı girin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const st = await real<CashStmt>(request, `/api/v1/sites/${slug}/cash-accounts/${params.id}/statement?to=${b.date}&page_size=1`);
    if (!st.body) return HttpResponse.json(st.body, { status: st.status });
    if (st.body.account.kind !== "cash") return err(409, "not_cash", "Gün sonu sayımı yalnız kasa hesaplarında yapılır; banka hesabı ekstreyle mutabık tutulur.");
    const list = listOf(cashDays, String(params.id));
    if (list.some((d) => d.date === b.date)) return err(409, "day_closed", "Bu gün zaten kapatılmış; hata ertesi gün düzeltme fişiyle giderilir.");
    const diff = cents(b.counted) - cents(st.body.closing);
    if (diff !== 0 && (b.reason ?? "").trim().length < 10) return err(422, "difference_reason", `Sayım sistem bakiyesinden ${(Math.abs(diff) / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ ${diff < 0 ? "eksik" : "fazla"}. Farkın gerekçesini yazın.`, { reason: "Fark varken gerekçe zorunlu (en az 10 karakter)." });
    const day: CashDay = { date: b.date!, system_balance: st.body.closing, counted: tl(cents(b.counted)), difference: tl(diff), reason: (b.reason ?? "").trim() || null, closed_by: (await me(request)).name, closed_at: new Date().toISOString() };
    list.push(day);
    return HttpResponse.json({ data: day, message: diff === 0 ? `${new Date(b.date!).toLocaleDateString("tr-TR")} kasa günü kapandı; sayım sistemle aynı.` : `${new Date(b.date!).toLocaleDateString("tr-TR")} kasa günü ${tl(Math.abs(diff))} ₺ farkla gerekçeli kapandı.` }, { status: 201 });
  }),

  // 29 — Borç takibi
  http.get(`${API}/receivables/aging`, async ({ request, params }) => {
    const slug = String(params.slug);
    const debtors = await allPages<Debtor>(request, `/api/v1/sites/${slug}/debtors`);
    const units = await allPages<UnitRow>(request, `/api/v1/sites/${slug}/units`);
    const blockOf = new Map(units.map((u) => [u.id, u.block.name]));
    const B = [["0_30", "0–30 gün", 0, 30], ["31_60", "31–60 gün", 31, 60], ["61_90", "61–90 gün", 61, 90], ["90_plus", "90+ gün", 91, 1e9]] as const;
    const bucket = (d: number) => B.find(([, , lo, hi]) => d >= lo && d <= hi)![0];
    const buckets = B.map(([key, label]) => ({ key, label, count: 0, amount: 0 }));
    const blocks = new Map<string, Record<string, number>>();
    for (const d of debtors.filter((x) => cents(x.balance) > 0)) {
      const k = bucket(Math.max(0, d.overdue_days)); const b = buckets.find((x) => x.key === k)!;
      b.count++; b.amount += cents(d.balance);
      const bl = blockOf.get(d.unit_id) ?? "—";
      const row = blocks.get(bl) ?? { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
      row[k] = (row[k] ?? 0) + cents(d.balance); blocks.set(bl, row);
    }
    return HttpResponse.json({
      as_of: today(),
      buckets: buckets.map((b) => ({ ...b, amount: tl(b.amount) })),
      by_block: [...blocks].sort(([a], [b]) => a.localeCompare(b, "tr")).map(([block, r]) => ({ block, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, tl(v)])), total: tl(Object.values(r).reduce((s, v) => s + v, 0)) })),
    });
  }),
  http.get(`${API}/collection-status`, async ({ request, params }) => {
    const slug = String(params.slug);
    const ev = listOf(collectionEvents, slug);
    const plans = await Promise.all(listOf(paymentPlans, slug).filter((p) => !p.cancelled_at).map((p) => planWithStatus(request, slug, p)));
    const out: Record<string, { plan_status: string | null; letter_status: string | null; last_action_at: string | null; reminder_count: number }> = {};
    for (const e of ev) {
      const o = (out[e.account_id] ??= { plan_status: null, letter_status: null, last_action_at: null, reminder_count: 0 });
      if (!o.last_action_at || e.at > o.last_action_at) o.last_action_at = e.at;
      if (e.kind === "reminder") o.reminder_count++;
      if (e.letter) o.letter_status = e.letter.status;
    }
    for (const p of plans) { const o = (out[p.account_id] ??= { plan_status: null, letter_status: null, last_action_at: null, reminder_count: 0 }); if (p.status === "active" || p.status === "broken" || !o.plan_status) o.plan_status = p.status; }
    return HttpResponse.json(out);
  }),
  http.get(`${API}/accounts/:id/collection-timeline`, async ({ request, params }) => {
    const slug = String(params.slug);
    const ev = listOf(collectionEvents, slug).filter((e) => e.account_id === params.id);
    const plans = await Promise.all(listOf(paymentPlans, slug).filter((p) => p.account_id === params.id).map((p) => planWithStatus(request, slug, p)));
    const items = [
      ...ev.map((e) => ({ ...e, plan: null })),
      ...plans.map((p) => ({ id: `plan-${p.id}`, account_id: p.account_id, kind: "payment_plan" as const, channel: null, note: `${p.installment_count} taksit, toplam ${Number(p.total).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`, by: p.created_by, at: p.created_at, plan: { id: p.id, status: p.status } })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return HttpResponse.json(items);
  }),
  http.post(`${API}/accounts/:id/collection-actions`, async ({ request, params }) => {
    const b = (await request.json()) as { kind?: string; channel?: string; note?: string };
    if (!["reminder", "call", "note"].includes(b.kind ?? "")) return err(422, "validation", VALIDATION, { kind: "İşlem türünü seçin." });
    if (b.kind === "reminder" && !["app", "sms"].includes(b.channel ?? "")) return err(422, "validation", VALIDATION, { channel: "Kanal seçin." });
    if ((b.kind === "call" || b.kind === "note") && (b.note ?? "").trim().length < 3) return err(422, "validation", VALIDATION, { note: "Kısa bir not yazın." });
    const e: CollectionEvent = { id: crypto.randomUUID(), account_id: String(params.id), kind: b.kind as CollectionEvent["kind"], channel: b.kind === "reminder" ? b.channel! : b.kind === "call" ? "phone" : null, note: b.note?.trim() || null, by: (await me(request)).name, at: new Date().toISOString() };
    listOf(collectionEvents, String(params.slug)).push(e);
    const msg = b.kind === "reminder" ? (b.channel === "sms" ? "Hatırlatma kaydedildi. SMS gönderimi henüz yok (K5); kişiye siz ulaştırın." : "Hatırlatma kaydedildi; uygulama bildirimi gönderimi servisle gelecek.") : b.kind === "call" ? "Arama notu kaydedildi." : "Not kaydedildi.";
    return HttpResponse.json({ data: e, message: msg }, { status: 201 });
  }),
  http.post(`${API}/collection-actions/bulk`, async ({ request, params }) => {
    const b = (await request.json()) as { account_ids?: string[]; channel?: string };
    if (!b.account_ids?.length) return err(422, "validation", "Hesap seçin.", { account_ids: "En az bir hesap seçin." });
    const by = (await me(request)).name, at = new Date().toISOString();
    for (const id of b.account_ids) listOf(collectionEvents, String(params.slug)).push({ id: crypto.randomUUID(), account_id: id, kind: "reminder", channel: b.channel === "sms" ? "sms" : "app", note: "Toplu hatırlatma", by, at });
    return HttpResponse.json({ data: { count: b.account_ids.length }, message: `${b.account_ids.length} hesap için hatırlatma kaydedildi. Gönderim (bildirim/SMS) servisle gelecek (K5).` }, { status: 201 });
  }),
  http.post(`${API}/accounts/:id/demand-letters`, async ({ request, params }) => {
    const b = (await request.json()) as { method?: string; sent_on?: string; tracking_no?: string; note?: string };
    const f: Record<string, string> = {};
    if (!["hand", "registered_mail", "notary"].includes(b.method ?? "")) f.method = "Gönderim yöntemini seçin.";
    if (!b.sent_on || !DATE_RE.test(b.sent_on)) f.sent_on = "Gönderim tarihini girin."; else if (b.sent_on > today()) f.sent_on = "Gelecek tarih olamaz.";
    if ((b.method === "registered_mail" || b.method === "notary") && !(b.tracking_no ?? "").trim()) f.tracking_no = "Takip / yevmiye numarasını girin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const e: CollectionEvent = { id: crypto.randomUUID(), account_id: String(params.id), kind: "demand_letter", channel: b.method!, note: b.note?.trim() || null, by: (await me(request)).name, at: new Date().toISOString(), letter: { id: crypto.randomUUID(), method: b.method as "hand", sent_on: b.sent_on!, tracking_no: b.tracking_no?.trim() || null, served_on: null, status: "sent" } };
    listOf(collectionEvents, String(params.slug)).push(e);
    return HttpResponse.json({ data: e, message: "İhtarname gönderimi kaydedildi. Tebliğ edilince tebliğ tarihini girin." }, { status: 201 });
  }),
  http.patch(`${API}/demand-letters/:lid`, async ({ request, params }) => {
    const e = listOf(collectionEvents, String(params.slug)).find((x) => x.letter?.id === params.lid);
    if (!e?.letter) return err(404, "not_found", "İhtarname bulunamadı.");
    const b = (await request.json()) as { served_on?: string };
    if (!b.served_on || !DATE_RE.test(b.served_on)) return err(422, "validation", VALIDATION, { served_on: "Tebliğ tarihini girin." });
    if (b.served_on < e.letter.sent_on) return err(422, "validation", VALIDATION, { served_on: "Tebliğ, gönderimden önce olamaz." });
    if (b.served_on > today()) return err(422, "validation", VALIDATION, { served_on: "Gelecek tarih olamaz." });
    Object.assign(e.letter, { served_on: b.served_on, status: "served" });
    return HttpResponse.json({ data: e, message: `Tebliğ ${new Date(b.served_on).toLocaleDateString("tr-TR")} olarak kaydedildi.` });
  }),

  // 30 — Ödeme planı
  http.get(`${API}/payment-plans`, async ({ request, params }) => {
    const slug = String(params.slug);
    const status = new URL(request.url).searchParams.get("status");
    const plans = await Promise.all(listOf(paymentPlans, slug).map((p) => planWithStatus(request, slug, p)));
    return HttpResponse.json(plans.filter((p) => !status || p.status === status).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }),
  http.get(`${API}/accounts/:id/payment-plans`, async ({ request, params }) => {
    const slug = String(params.slug);
    return HttpResponse.json(await Promise.all(listOf(paymentPlans, slug).filter((p) => p.account_id === params.id).map((p) => planWithStatus(request, slug, p))));
  }),
  http.post(`${API}/accounts/:id/payment-plans`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { amount?: string; installment_count?: number; first_due_date?: string; note?: string };
    const st = await statement(request, slug, String(params.id), 1);
    if (!st.account) return err(404, "not_found", "Hesap bulunamadı.");
    const f: Record<string, string> = {};
    const total = cents(b.amount);
    if (!(total > 0)) f.amount = "Yapılandırılacak tutarı girin.";
    else if (total > cents(st.account.balance)) f.amount = `Tutar açık bakiyeyi (${Number(st.account.balance).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺) aşamaz.`;
    const n = Number(b.installment_count);
    if (!Number.isInteger(n) || n < 2 || n > 36) f.installment_count = "Taksit sayısı 2–36 arası.";
    if (!b.first_due_date || !DATE_RE.test(b.first_due_date)) f.first_due_date = "İlk vadeyi girin."; else if (b.first_due_date < today()) f.first_due_date = "İlk vade bugünden önce olamaz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const list = listOf(paymentPlans, slug);
    const existing = await Promise.all(list.filter((p) => p.account_id === params.id && !p.cancelled_at).map((p) => planWithStatus(request, slug, p)));
    if (existing.some((p) => p.status === "active")) return err(409, "plan_exists", "Bu hesapta yürürlükte bir ödeme planı var; önce onu iptal edin.");
    const amounts = splitEven(total, n);
    const p: PaymentPlan = {
      id: crypto.randomUUID(), account_id: String(params.id), unit_id: st.account.unit_id, unit_name: st.account.unit_name, person_name: st.account.person_name, reference_code: st.account.reference_code,
      total: tl(total), installment_count: n, tolerance_days: paramsAt(slug).plan_tolerance_days, note: b.note?.trim() || null, created_by: (await me(request)).name, created_at: new Date().toISOString(), start_date: today(),
      cancelled_at: null, cancel_reason: null, installments: amounts.map((a, i) => ({ no: i + 1, due_date: addMonths(b.first_due_date!, i), amount: tl(a), paid: "0.00", status: "open" })), status: "active", paid_total: "0.00",
    };
    list.push(p);
    return HttpResponse.json({ data: p, message: `${n} taksitli ödeme planı oluşturuldu. Taksitler vadesinde ödendikçe plan kendiliğinden ilerler; ${p.tolerance_days} günden fazla geciken taksit planı bozar.` }, { status: 201 });
  }),
  http.post(`${API}/payment-plans/:id/cancel`, async ({ request, params }) => {
    const p = listOf(paymentPlans, String(params.slug)).find((x) => x.id === params.id);
    if (!p) return err(404, "not_found", "Ödeme planı bulunamadı.");
    if (p.cancelled_at) return err(409, "already_cancelled", "Plan zaten iptal edilmiş.");
    const b = (await request.json()) as { reason?: string };
    if ((b.reason ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { reason: "Gerekçe yazın." });
    Object.assign(p, { cancelled_at: new Date().toISOString(), cancel_reason: b.reason!.trim() });
    return HttpResponse.json({ data: p, message: "Ödeme planı iptal edildi; kalan borç normal hatırlatma kurallarına döndü." });
  }),
  http.get(`${API}/resident/payment-plans`, async ({ request, params }) => {
    const slug = String(params.slug);
    const h = await real<{ accounts: { id: string }[] }>(request, `/api/v1/sites/${slug}/resident/home`);
    if (h.status !== 200 || !h.body) return err(h.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(h.body.accounts.map((a) => a.id));
    // Sakin kendi hesabının ekstresini sakin ucundan okur; plan durumu personel ucuna erişmeden hesaplanır
    const out = [];
    for (const p of listOf(paymentPlans, slug).filter((x) => ids.has(x.account_id) && !x.cancelled_at)) {
      const st = await real<StatementResp>(request, `/api/v1/sites/${slug}/resident/statement?account_id=${p.account_id}&page_size=200`);
      let pool = (st.body?.entries.items ?? []).filter((e) => e.date >= p.start_date && cents(e.credit) > 0).reduce((s, e) => s + cents(e.credit), 0);
      const inst = p.installments.map((i) => { const amt = cents(i.amount); const paid = Math.min(pool, amt); pool -= paid; const late = today() > addDays(i.due_date, p.tolerance_days); return { ...i, paid: tl(paid), status: paid >= amt ? "paid" : late ? "overdue" : paid > 0 ? "partial" : "open" }; });
      out.push({ id: p.id, unit_name: p.unit_name, total: p.total, installment_count: p.installment_count, installments: inst, status: inst.every((i) => i.status === "paid") ? "completed" : inst.some((i) => i.status === "overdue") ? "broken" : "active" });
    }
    return HttpResponse.json(out);
  }),

  // 31 — Dönem dışı ücretler
  http.get(`${API}/settings/ad-hoc-charges`, ({ params }) => HttpResponse.json(adHocOf(String(params.slug)))),
  http.put(`${API}/settings/ad-hoc-charges`, async ({ request, params }) => {
    const s = adHocOf(String(params.slug));
    const b = (await request.json()) as Partial<AdHocSettings>;
    for (const [k, v] of Object.entries(b.sources ?? {})) {
      if (!AD_HOC_SOURCES.includes(k as AdHocSource)) continue;
      if (!["immediate", "next_period"].includes(v.mode) || !Number.isInteger(v.due_days) || v.due_days < 0 || v.due_days > 60) return err(422, "validation", VALIDATION, { [`sources.${k}`]: "Yansıma ve 0–60 gün vade." });
      s.sources[k as AdHocSource] = { mode: v.mode, due_days: v.due_days };
    }
    return HttpResponse.json({ data: s, message: "Dönem dışı ücret ayarları kaydedildi." });
  }),
  http.get(`${API}/ad-hoc-charges`, ({ request, params }) => {
    const status = new URL(request.url).searchParams.get("status");
    return HttpResponse.json([...listOf(adHocCharges, String(params.slug))].filter((c) => !status || c.status === status).reverse());
  }),
  http.post(`${API}/ad-hoc-charges`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { unit_id?: string; account_kind?: string; source?: AdHocSource; description?: string; amount?: string; due_date?: string | null };
    const f: Record<string, string> = {};
    if (!b.unit_id) f.unit_id = "Bölüm seçin.";
    if (b.account_kind !== "owner" && b.account_kind !== "occupant") f.account_kind = "Kime yazılacağını seçin.";
    if (!AD_HOC_SOURCES.includes(b.source as AdHocSource)) f.source = "Kaynağı seçin.";
    if ((b.description ?? "").trim().length < 3) f.description = "Açıklama yazın.";
    if (!(cents(b.amount) > 0)) f.amount = "Tutar sıfırdan büyük olmalı.";
    if (b.due_date && (!DATE_RE.test(b.due_date) || b.due_date < today())) f.due_date = "Vade bugünden önce olamaz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const accs = await real<Paged<{ id: string; kind: string; reference_code: string; unit_name: string; person_name: string | null; is_closed: boolean }>>(request, `/api/v1/sites/${slug}/accounts?unit_id=${b.unit_id}&page_size=50`);
    const acc = accs.body?.items?.find((a) => a.kind === b.account_kind && !a.is_closed);
    if (!acc) return err(422, "no_account", `Bu bölümde açık ${b.account_kind === "owner" ? "malik" : "oturan"} hesabı yok.`, { account_kind: "Hesap yok" });
    const set = adHocOf(slug).sources[b.source!];
    const c: AdHocCharge = { id: crypto.randomUUID(), unit_id: b.unit_id!, unit_name: acc.unit_name, account_id: acc.id, account_kind: acc.kind, reference_code: acc.reference_code, person_name: acc.person_name, source: b.source!, description: b.description!.trim(), amount: tl(cents(b.amount)), due_date: b.due_date || addDays(today(), set.due_days), mode: set.mode, status: set.mode === "immediate" ? "posted" : "waiting_next_run", created_by: (await me(request)).name, created_at: new Date().toISOString(), cancel_reason: null };
    listOf(adHocCharges, slug).push(c);
    return HttpResponse.json({ data: c, message: c.status === "posted" ? `${c.unit_name} için ${Number(c.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ ücret oluşturuldu. (Sahte servis: cariye yazılmadı.)` : `Ücret bir sonraki aidat tahakkukunda "ek kalemler" başlığıyla eklenecek.` }, { status: 201 });
  }),
  http.post(`${API}/ad-hoc-charges/:id/cancel`, async ({ request, params }) => {
    const c = listOf(adHocCharges, String(params.slug)).find((x) => x.id === params.id);
    if (!c) return err(404, "not_found", "Ücret bulunamadı.");
    if (c.status === "cancelled") return err(409, "already_cancelled", "Ücret zaten iptal edilmiş.");
    const b = (await request.json()) as { reason?: string };
    if ((b.reason ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { reason: "Gerekçe yazın." });
    Object.assign(c, { status: "cancelled", cancel_reason: b.reason!.trim() });
    return HttpResponse.json({ data: c, message: c.mode === "immediate" ? "Ücret ters kayıtla kapatıldı." : "Bekleyen ücret iptal edildi; tahakkuka eklenmeyecek." });
  }),

  // 32 — Muhasebe aktarımı
  http.get(`${API}/accounting/mappings`, ({ params }) => HttpResponse.json({ items: mappingsOf(String(params.slug)) })),
  http.put(`${API}/accounting/mappings`, async ({ request, params }) => {
    const list = mappingsOf(String(params.slug));
    const b = (await request.json()) as { items?: Mapping[] };
    const f: Record<string, string> = {};
    for (const m of b.items ?? []) {
      for (const k of ["debit_account", "credit_account"] as const) if (m[k] && !/^[0-9][0-9.]{0,19}$/.test(m[k].trim())) f[`${m.key}.${k}`] = "Hesap kodu rakam ve nokta (ör. 120.01).";
    }
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    for (const m of b.items ?? []) { const cur = list.find((x) => x.key === m.key); if (cur) Object.assign(cur, { debit_account: m.debit_account.trim(), credit_account: m.credit_account.trim() }); }
    return HttpResponse.json({ data: { items: list }, message: "Hesap kodu eşlemesi kaydedildi; yalnız bundan sonra üretilen dosyaları etkiler." });
  }),
  http.get(`${API}/accounting/exports/preview`, async ({ request, params }) => {
    const period = new URL(request.url).searchParams.get("period") ?? today().slice(0, 7);
    return HttpResponse.json(await vouchersFor(request, String(params.slug), period));
  }),
  http.get(`${API}/accounting/exports`, ({ params }) => HttpResponse.json([...listOf(exportBatches, String(params.slug))].reverse())),
  http.post(`${API}/accounting/exports`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { period?: string };
    if (!b.period || !/^\d{4}-\d{2}$/.test(b.period)) return err(422, "validation", VALIDATION, { period: "Dönem seçin." });
    const pv = await vouchersFor(request, slug, b.period);
    if (pv.missing_mappings.length) return err(409, "mapping_missing", `Hesap kodu eşlemesi eksik: ${pv.missing_mappings.join(", ")}. Aktarım başlatılamaz.`);
    if (pv.vouchers.length === 0) return err(409, "nothing_to_export", "Bu dönemde aktarılmamış fiş yok.");
    const batch: ExportBatch = { id: crypto.randomUUID(), period: b.period, voucher_count: pv.vouchers.length, total: pv.total, created_by: (await me(request)).name, created_at: new Date().toISOString(), file_name: `muhasebe-fisleri-${slug}-${b.period}-${listOf(exportBatches, slug).filter((x) => x.period === b.period).length + 1}.csv`, vouchers: pv.vouchers };
    listOf(exportBatches, slug).push(batch);
    return HttpResponse.json({ data: batch, message: `${batch.voucher_count} fiş dosyaya yazıldı ve kilitlendi; aynı fişler bir daha aktarılmaz.` }, { status: 201 });
  }),

  // 27 — Dönem kapanışı
  http.get(`${API}/fiscal-periods`, ({ request, params }) => {
    const slug = String(params.slug);
    const year = Number(new URL(request.url).searchParams.get("year") ?? today().slice(0, 4));
    const last = year === Number(today().slice(0, 4)) ? Number(today().slice(5, 7)) : 12;
    const out = Array.from({ length: last }, (_, i) => periodOut(periodOf(slug, `${year}-${String(i + 1).padStart(2, "0")}`))).reverse();
    return HttpResponse.json(out);
  }),
  http.get(`${API}/fiscal-periods/:pid/close-checklist`, async ({ request, params }) => {
    const slug = String(params.slug);
    const p = periodOf(slug, String(params.pid));
    const items = await closeChecklist(request, slug, p.period);
    return HttpResponse.json({ period: periodOut(p), items: items.map((i) => ({ ...i, exception: p.exceptions[i.key] ?? null })) });
  }),
  http.post(`${API}/fiscal-periods/:pid/start-close`, async ({ request, params }) => {
    const slug = String(params.slug);
    const p = periodOf(slug, String(params.pid));
    if (p.status !== "open") return err(409, "invalid_status", "Yalnız açık dönem kapanışa alınır.");
    if (p.period >= today().slice(0, 7)) return err(409, "period_not_ended", "İçinde bulunulan ya da gelecek dönem kapatılamaz.");
    const b =(await request.json().catch(() => ({}))) as { exceptions?: Record<string, string> };
    const items = await closeChecklist(request, slug, p.period);
    const missing = items.filter((i) => i.required && !i.ok && (b.exceptions?.[i.key] ?? "").trim().length < 10);
    if (missing.length) return err(409, "checklist_incomplete", `Eksik maddeler var: ${missing.map((m) => m.label).join("; ")}. Giderin ya da gerekçeli istisna girin (en az 10 karakter).`);
    const by = (await me(request)).name;
    Object.assign(p, { status: "closing", closing_started_by: by, exceptions: Object.fromEntries(Object.entries(b.exceptions ?? {}).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])) });
    p.history.push({ at: new Date().toISOString(), by, action: "start_close", note: Object.keys(p.exceptions).length ? `${Object.keys(p.exceptions).length} gerekçeli istisna` : null });
    return HttpResponse.json({ data: periodOut(p), message: `${periodLabel(p.period)} kapanışta; yeni işlemler sonraki döneme yönlendirilir. Kilitlemek için ikinci bir yetkili onaylamalı.` });
  }),
  http.post(`${API}/fiscal-periods/:pid/lock`, async ({ request, params }) => {
    const p = periodOf(String(params.slug), String(params.pid));
    if (p.status !== "closing" && p.status !== "temp_open") return err(409, "invalid_status", "Yalnız kapanıştaki ya da süreli açılmış dönem kilitlenir.");
    const by = (await me(request)).name;
    if (p.status === "closing" && by === p.closing_started_by) return err(409, "four_eyes", "Kilitleme, kapanışı başlatan kişiden farklı bir yetkili tarafından yapılmalı (iki kişi kuralı).");
    Object.assign(p, { status: "locked", locked_by: by, locked_at: new Date().toISOString(), unlock_until: null });
    p.history.push({ at: new Date().toISOString(), by, action: "lock", note: null });
    return HttpResponse.json({ data: periodOut(p), message: `${periodLabel(p.period)} kilitlendi; bu döneme finansal kayıt eklenemez ve değiştirilemez.` });
  }),
  http.post(`${API}/fiscal-periods/:pid/reopen`, async ({ request, params }) => {
    const p = periodOf(String(params.slug), String(params.pid));
    if (p.status !== "closing") return err(409, "invalid_status", "Yalnız kapanıştaki dönem açığa döner.");
    const by = (await me(request)).name;
    Object.assign(p, { status: "open", closing_started_by: null, exceptions: {} });
    p.history.push({ at: new Date().toISOString(), by, action: "reopen", note: null });
    return HttpResponse.json({ data: periodOut(p), message: `${periodLabel(p.period)} yeniden açık.` });
  }),
  http.post(`${API}/fiscal-periods/:pid/unlock-requests`, async ({ request, params }) => {
    const p = periodOf(String(params.slug), String(params.pid));
    if (p.status !== "locked") return err(409, "invalid_status", "Yalnız kilitli dönem için açma istenir.");
    const b = (await request.json()) as { reason?: string; hours?: number };
    const f: Record<string, string> = {};
    if ((b.reason ?? "").trim().length < 20) f.reason = "Gerekçe en az 20 karakter olmalı.";
    if (![4, 24, 72].includes(Number(b.hours))) f.hours = "Süre seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const by = (await me(request)).name;
    Object.assign(p, { status: "temp_open", unlock_until: new Date(Date.now() + Number(b.hours) * 3600e3).toISOString() });
    p.history.push({ at: new Date().toISOString(), by, action: "unlock", note: b.reason!.trim() });
    return HttpResponse.json({ data: periodOut(p), message: `${periodLabel(p.period)} ${b.hours} saatliğine açıldı; bu sürede yapılan işlemler denetim kaydına "kilit açıkken" etiketiyle yazılır. (Servis gelince YK onayından geçecek.)` });
  }),

  // 34 — Tahakkuk fark raporu
  http.get(`${API}/charge-runs/preview/diff`, async ({ request, params }) => {
    const slug = String(params.slug);
    const url = new URL(request.url);
    const q = new URLSearchParams();
    for (const k of ["charge_date", "due_date"]) { const v = url.searchParams.get(k); if (v) q.set(k, v); }
    const current: ChargeRow[] = [];
    let previewPeriod = "";
    for (let p = 1; p <= 25; p++) {
      q.set("page", String(p)); q.set("page_size", "200");
      const r = await real<{ period: string; charges: Paged<ChargeRow> }>(request, `/api/v1/sites/${slug}/charge-runs/preview?${q}`);
      if (!r.body) return HttpResponse.json(r.body, { status: r.status });
      previewPeriod = r.body.period; current.push(...r.body.charges.items);
      if (current.length >= r.body.charges.total || r.body.charges.items.length === 0) break;
    }
    const runs = await allPages<{ id: string; period: string; status: string; posted_at: string | null }>(request, `/api/v1/sites/${slug}/charge-runs`);
    const base = runs.filter((r) => r.status === "posted" && r.period !== previewPeriod).sort((a, b) => b.period.localeCompare(a.period))[0];
    const threshold = paramsAt(slug).diff_threshold_percent;
    if (!base) return HttpResponse.json({ period: previewPeriod, base_period: null, threshold, rows: [], counts: { increase: 0, decrease: 0, new: 0, missing: 0 }, compared: 0 });
    const prev = await allPages<ChargeRow>(request, `/api/v1/sites/${slug}/charge-runs/${base.id}/charges`);
    const prevMap = new Map(prev.map((c) => [c.ledger_account_id, c]));
    const curMap = new Map(current.map((c) => [c.ledger_account_id, c]));
    const rows: { account_id: string; unit_name: string; person_name: string | null; account_kind: string; previous: string | null; current: string | null; change_percent: number | null; flag: "increase" | "decrease" | "new" | "missing" }[] = [];
    for (const c of current) {
      const p = prevMap.get(c.ledger_account_id);
      if (!p) { rows.push({ account_id: c.ledger_account_id, unit_name: c.unit_name, person_name: c.person_name, account_kind: c.account_kind, previous: null, current: c.amount, change_percent: null, flag: "new" }); continue; }
      const pc = cents(p.amount), cc = cents(c.amount);
      const pct = pc === 0 ? 100 : ((cc - pc) / pc) * 100;
      if (Math.abs(pct) >= threshold) rows.push({ account_id: c.ledger_account_id, unit_name: c.unit_name, person_name: c.person_name, account_kind: c.account_kind, previous: p.amount, current: c.amount, change_percent: Math.round(pct * 10) / 10, flag: cc > pc ? "increase" : "decrease" });
    }
    for (const p of prev) if (!curMap.has(p.ledger_account_id)) rows.push({ account_id: p.ledger_account_id, unit_name: p.unit_name, person_name: p.person_name, account_kind: p.account_kind, previous: p.amount, current: null, change_percent: null, flag: "missing" });
    const counts = { increase: 0, decrease: 0, new: 0, missing: 0 };
    for (const r of rows) counts[r.flag]++;
    return HttpResponse.json({ period: previewPeriod, base_period: base.period, threshold, rows: rows.sort((a, b) => a.unit_name.localeCompare(b.unit_name, "tr")), counts, compared: current.length });
  }),
];

// ============================================================================================
// İNSAN KAYNAKLARI PAKETİ (Yazılım Dokümanı IK-01..05) — servis istekleri 35–39
// Personelin uygulamaya girişi ve kart–kullanıcı eşleşmesi K29'a bağlı: vardiyam, kendi izin talebi ve
// QR/konumlu giriş-çıkış bu pakette yok; kayıtlar İK sorumlusu tarafından tutulur.
// ============================================================================================
interface StaffRow { id: string; full_name: string; position: string; employer: string; contractor_name: string | null; phone: string | null; start_date: string; end_date: string | null; is_active: boolean }
interface ShiftTemplate { id: string; name: string; start: string; end: string; break_minutes: number; position: string | null; location: string | null; is_active: boolean }
interface Assignment { id: string; staff_id: string; date: string; template_id: string; changed_after_publish: boolean }
interface LeaveReq { id: string; staff_id: string; staff_name: string; type: "annual" | "excuse" | "sick" | "unpaid"; from: string; to: string; days: number; note: string | null; status: "pending" | "approved" | "rejected" | "cancelled"; created_by: string; created_at: string; decided_by: string | null; decided_at: string | null; reject_reason: string | null }
interface TimesheetFix { status: "worked" | "absent" | "leave"; late_minutes: number; early_leave_minutes: number; overtime_minutes: number; reason: string; by: string; at: string }
interface TsExport { id: string; month: string; rows: Record<string, string | number>[]; created_by: string; created_at: string; file_name: string }
const payrollNos = loadMap<string, string>("payrollNos"); // staff_id → sicil no
const shiftTemplates = loadMap<string, ShiftTemplate[]>("shiftTemplates");
const assignments = loadMap<string, Assignment[]>("shiftAssignments");
const publishedWeeks = loadMap<string, { week: string; at: string; by: string }[]>("publishedWeeks");
const leaves = loadMap<string, LeaveReq[]>("leaveRequests");
const tsFixes = loadMap<string, TimesheetFix>("timesheetFixes"); // assignment_id → düzeltme
const tsFinal = loadMap<string, { date: string; by: string; at: string }[]>("timesheetFinal");
const tsExports = loadMap<string, TsExport[]>("timesheetExports");
const LEAVE_TYPES = ["annual", "excuse", "sick", "unpaid"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Vardiyanın başlangıç/bitişi (dakika, gün başından); gece vardiyası ertesi güne taşar. */
const span = (t: ShiftTemplate) => { const s = toMin(t.start); let e = toMin(t.end); if (e <= s) e += 1440; return { s, e }; };
const dayIndex = (d: string) => Math.round(new Date(d + "T00:00:00Z").getTime() / 864e5);
const weekStart = (d: string) => { const x = new Date(d + "T00:00:00"); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return iso(x); };
const tplOf = (slug: string) => { if (!shiftTemplates.has(slug)) shiftTemplates.set(slug, [
  { id: crypto.randomUUID(), name: "Sabah", start: "08:00", end: "16:00", break_minutes: 60, position: null, location: null, is_active: true },
  { id: crypto.randomUUID(), name: "Akşam", start: "16:00", end: "00:00", break_minutes: 30, position: null, location: null, is_active: true },
  { id: crypto.randomUUID(), name: "Gece", start: "00:00", end: "08:00", break_minutes: 30, position: null, location: null, is_active: true },
]); return shiftTemplates.get(slug)!; };
const nightMinutes = (t: ShiftTemplate) => { const { s, e } = span(t); let n = 0; for (let m = s; m < e; m++) { const h = (m % 1440) / 60; if (h >= 22 || h < 6) n++; } return n; };
function leaveOn(slug: string, staffId: string, date: string) { return listOf(leaves, slug).find((l) => l.staff_id === staffId && l.status === "approved" && l.from <= date && l.to >= date) ?? null; }
function conflictsFor(slug: string, list: Assignment[]) {
  const tpl = new Map(tplOf(slug).map((t) => [t.id, t]));
  const out: { assignment_id: string; kind: "overlap" | "leave" | "rest"; message: string }[] = [];
  const byStaff = new Map<string, Assignment[]>();
  for (const a of list) byStaff.set(a.staff_id, [...(byStaff.get(a.staff_id) ?? []), a]);
  for (const [, as] of byStaff) {
    const ivs = as.map((a) => { const t = tpl.get(a.template_id); if (!t) return null; const { s, e } = span(t); const base = dayIndex(a.date) * 1440; return { a, s: base + s, e: base + e }; }).filter((x): x is { a: Assignment; s: number; e: number } => !!x).sort((x, y) => x.s - y.s);
    for (let i = 0; i < ivs.length; i++) {
      const cur = ivs[i]!, nxt = ivs[i + 1];
      const lv = leaveOn(slug, cur.a.staff_id, cur.a.date);
      if (lv) out.push({ assignment_id: cur.a.id, kind: "leave", message: `Onaylı izin günü (${lv.type === "sick" ? "raporlu" : lv.type === "annual" ? "yıllık" : lv.type === "excuse" ? "mazeret" : "ücretsiz"})` });
      if (!nxt) continue;
      if (nxt.s < cur.e) { out.push({ assignment_id: nxt.a.id, kind: "overlap", message: "Aynı kişiye çakışan vardiya" }); continue; }
      const rest = (nxt.s - cur.e) / 60;
      if (rest < 11) out.push({ assignment_id: nxt.a.id, kind: "rest", message: `İki vardiya arası dinlenme ${rest.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat (11 saatten az)` });
    }
  }
  return out;
}
async function staffList(request: Request, slug: string, includeLeft = false) {
  const a = await real<StaffRow[]>(request, `/api/v1/sites/${slug}/staff?active=true`);
  const list = [...(a.body ?? [])];
  if (includeLeft) { const b = await real<StaffRow[]>(request, `/api/v1/sites/${slug}/staff?active=false`); list.push(...(b.body ?? [])); }
  return list.map((s) => ({ ...s, payroll_no: payrollNos.get(s.id) ?? null }));
}
function timesheetRows(slug: string, staff: (StaffRow & { payroll_no: string | null })[], date: string) {
  const tpl = new Map(tplOf(slug).map((t) => [t.id, t]));
  const rows = listOf(assignments, slug).filter((a) => a.date === date).map((a) => {
    const t = tpl.get(a.template_id); const s = staff.find((x) => x.id === a.staff_id);
    const lv = leaveOn(slug, a.staff_id, date); const fix = tsFixes.get(a.id);
    const planned = t ? (span(t).e - span(t).s - t.break_minutes) : 0;
    const status = fix?.status ?? (lv ? "leave" : "worked");
    const worked = status === "worked" ? Math.max(0, planned - (fix?.late_minutes ?? 0) - (fix?.early_leave_minutes ?? 0) + (fix?.overtime_minutes ?? 0)) : 0;
    return { id: a.id, staff_id: a.staff_id, staff_name: s?.full_name ?? "—", position: s?.position ?? null, payroll_no: s?.payroll_no ?? null, template: t ? `${t.name} ${t.start}–${t.end}` : "—", planned_minutes: planned, night_minutes: status === "worked" && t ? nightMinutes(t) : 0, status, leave_type: lv?.type ?? null, late_minutes: fix?.late_minutes ?? 0, early_leave_minutes: fix?.early_leave_minutes ?? 0, overtime_minutes: fix?.overtime_minutes ?? 0, worked_minutes: worked, reason: fix?.reason ?? null, fixed_by: fix?.by ?? null, is_exception: !!fix || !!lv };
  });
  // Vardiyası olmayan ama izinli personel de satır olarak görünsün
  for (const l of listOf(leaves, slug).filter((x) => x.status === "approved" && x.from <= date && x.to >= date)) {
    if (!rows.some((r) => r.staff_id === l.staff_id)) rows.push({ id: `leave-${l.id}-${date}`, staff_id: l.staff_id, staff_name: l.staff_name, position: staff.find((x) => x.id === l.staff_id)?.position ?? null, payroll_no: payrollNos.get(l.staff_id) ?? null, template: "—", planned_minutes: 0, night_minutes: 0, status: "leave", leave_type: l.type, late_minutes: 0, early_leave_minutes: 0, overtime_minutes: 0, worked_minutes: 0, reason: null, fixed_by: null, is_exception: true });
  }
  return rows.sort((a, b) => a.staff_name.localeCompare(b.staff_name, "tr"));
}

async function tsPreview(request: Request, slug: string, month: string) {
    const staff = await staffList(request, slug, true);
    const days: string[] = []; for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) days.push(d);
    const fin = new Set(listOf(tsFinal, slug).map((d) => d.date));
    const sum = new Map<string, Record<string, number | string>>();
    const missing: string[] = [];
    for (const d of days) {
      const rows = timesheetRows(slug, staff, d);
      if (rows.length && !fin.has(d)) missing.push(d);
      for (const r of rows) {
        const o = sum.get(r.staff_id) ?? { staff_id: r.staff_id, payroll_no: r.payroll_no ?? "", name: r.staff_name, worked_days: 0, worked_hours: 0, overtime_hours: 0, night_hours: 0, absent_days: 0, leave_annual: 0, leave_excuse: 0, leave_sick: 0, leave_unpaid: 0, holiday_hours: 0 };
        if (r.status === "worked") { o.worked_days = (o.worked_days as number) + 1; o.worked_hours = (o.worked_hours as number) + r.worked_minutes / 60; o.overtime_hours = (o.overtime_hours as number) + r.overtime_minutes / 60; o.night_hours = (o.night_hours as number) + r.night_minutes / 60; }
        else if (r.status === "absent") o.absent_days = (o.absent_days as number) + 1;
        else if (r.leave_type) o[`leave_${r.leave_type}`] = (o[`leave_${r.leave_type}`] as number) + 1;
        sum.set(r.staff_id, o);
      }
    }
    const rows: Record<string, string | number>[] = [...sum.values()].map((o): Record<string, string | number> => ({ ...o, worked_hours: Math.round((o.worked_hours as number) * 100) / 100, overtime_hours: Math.round((o.overtime_hours as number) * 100) / 100, night_hours: Math.round((o.night_hours as number) * 100) / 100 })).sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
    const exported = listOf(tsExports, slug).find((x) => x.month === month) ?? null;
    return { month, rows, missing_days: missing, missing_payroll: rows.filter((r) => !r.payroll_no).map((r) => r.name), exported: exported ? { id: exported.id, created_by: exported.created_by, created_at: exported.created_at } : null };
}

const ik: RequestHandler[] = [
  // 35 — Personel kartına bordro sicil no; ayrılışta açık işler
  http.get(`${API}/staff`, async ({ request, params }) => {
    const r = await real<StaffRow[]>(request, `/api/v1/sites/${params.slug}/staff${new URL(request.url).search}`);
    if (r.status !== 200 || !r.body) return HttpResponse.json(r.body, { status: r.status });
    return HttpResponse.json(r.body.map((s) => ({ ...s, payroll_no: payrollNos.get(s.id) ?? null })));
  }),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/staff` : `${API}/staff/:id`, async ({ request, params }) => {
    const b = (await request.json()) as Record<string, unknown> & { payroll_no?: string | null };
    const { payroll_no, ...rest } = b;
    if (payroll_no != null && payroll_no !== "" && !/^[A-Za-z0-9-]{1,20}$/.test(String(payroll_no))) return err(422, "validation", VALIDATION, { payroll_no: "Sicil no harf, rakam ve tire; en fazla 20 karakter." });
    const r = await real<{ data?: StaffRow }>(request, `/api/v1/sites/${params.slug}/staff${verb === "patch" ? `/${params.id}` : ""}`, { method: verb.toUpperCase(), body: rest });
    if (r.status < 300 && r.body?.data && "payroll_no" in b) { if (payroll_no) payrollNos.set(r.body.data.id, String(payroll_no).trim()); else payrollNos.delete(r.body.data.id); }
    return HttpResponse.json(r.body && r.body.data ? { ...r.body, data: { ...r.body.data, payroll_no: payrollNos.get(r.body.data.id) ?? null } } : r.body, { status: r.status });
  })),
  http.get(`${API}/staff/:id/open-items`, ({ params }) => {
    const slug = String(params.slug);
    const future = listOf(assignments, slug).filter((a) => a.staff_id === params.id && a.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
    const pend = listOf(leaves, slug).filter((l) => l.staff_id === params.id && l.status === "pending");
    return HttpResponse.json({ future_shifts: future.length, first_shift: future[0]?.date ?? null, pending_leaves: pend.length });
  }),

  // 36 — Vardiya şablonları ve plan
  http.get(`${API}/shift-templates`, ({ params }) => HttpResponse.json(tplOf(String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/shift-templates` : `${API}/shift-templates/:id`, async ({ request, params }) => {
    const list = tplOf(String(params.slug));
    const cur = verb === "patch" ? list.find((t) => t.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Vardiya şablonu bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<ShiftTemplate>) };
    const f: Record<string, string> = {};
    if (!b.name?.trim()) f.name = "Ad yazın."; else if (list.some((t) => t.id !== cur?.id && t.name.toLocaleLowerCase("tr-TR") === b.name!.trim().toLocaleLowerCase("tr-TR"))) f.name = "Bu adla şablon var.";
    if (!TIME_RE.test(b.start ?? "")) f.start = "Başlangıç saatini girin (SS:DD).";
    if (!TIME_RE.test(b.end ?? "")) f.end = "Bitiş saatini girin (SS:DD).";
    if (!(Number.isInteger(b.break_minutes) && b.break_minutes! >= 0 && b.break_minutes! <= 180)) f.break_minutes = "Mola 0–180 dakika.";
    if (!f.start && !f.end && b.start === b.end) f.end = "Bitiş başlangıçla aynı olamaz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const t: ShiftTemplate = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), start: b.start!, end: b.end!, break_minutes: b.break_minutes!, position: b.position?.trim() || null, location: b.location?.trim() || null, is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, t); else list.push(t);
    return HttpResponse.json({ data: t, message: verb === "post" ? `${t.name} şablonu eklendi.` : `${t.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/shift-plans`, async ({ request, params }) => {
    const slug = String(params.slug); const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? weekStart(today()); const to = url.searchParams.get("to") ?? addDays(from, 6);
    const list = listOf(assignments, slug).filter((a) => a.date >= from && a.date <= to);
    const staff = await staffList(request, slug);
    const lv = listOf(leaves, slug).filter((l) => l.status === "approved" && l.to >= from && l.from <= to).map((l) => ({ staff_id: l.staff_id, from: l.from, to: l.to, type: l.type }));
    const pub = listOf(publishedWeeks, slug).find((w) => w.week === weekStart(from)) ?? null;
    return HttpResponse.json({ from, to, staff, templates: tplOf(slug), assignments: list, leaves: lv, conflicts: conflictsFor(slug, listOf(assignments, slug).filter((a) => a.date >= addDays(from, -1) && a.date <= addDays(to, 1))).filter((c) => list.some((a) => a.id === c.assignment_id)), published: pub, changed_after_publish: list.filter((a) => a.changed_after_publish).length });
  }),
  http.post(`${API}/shift-plans/assignments`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { staff_id?: string; date?: string; template_id?: string };
    const f: Record<string, string> = {};
    if (!b.staff_id) f.staff_id = "Personel seçin.";
    if (!b.date || !DATE_RE.test(b.date)) f.date = "Gün seçin.";
    if (!tplOf(slug).some((t) => t.id === b.template_id && t.is_active)) f.template_id = "Vardiya seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const list = listOf(assignments, slug);
    if (list.some((a) => a.staff_id === b.staff_id && a.date === b.date && a.template_id === b.template_id)) return err(409, "duplicate", "Bu vardiya o gün bu kişiye zaten atanmış.");
    const published = listOf(publishedWeeks, slug).some((w) => w.week === weekStart(b.date!));
    const a: Assignment = { id: crypto.randomUUID(), staff_id: b.staff_id!, date: b.date!, template_id: b.template_id!, changed_after_publish: published };
    list.push(a);
    const c = conflictsFor(slug, list).filter((x) => x.assignment_id === a.id);
    return HttpResponse.json({ data: { ...a, conflicts: c }, message: c.length ? `Atandı — uyarı: ${c.map((x) => x.message).join("; ")}` : "Vardiya atandı." }, { status: 201 });
  }),
  http.delete(`${API}/shift-plans/assignments/:id`, ({ params }) => {
    const list = listOf(assignments, String(params.slug));
    const i = list.findIndex((a) => a.id === params.id);
    if (i < 0) return err(404, "not_found", "Atama bulunamadı.");
    if (listOf(tsFinal, String(params.slug)).some((d) => d.date === list[i]!.date)) return err(409, "timesheet_final", "Bu günün puantajı kesinleşti; atama kaldırılamaz.");
    list.splice(i, 1);
    return HttpResponse.json({ data: null, message: "Atama kaldırıldı." });
  }),
  http.post(`${API}/shift-plans/copy-week`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { from_week?: string; to_week?: string };
    if (!b.from_week || !b.to_week || weekStart(b.from_week) !== b.from_week || weekStart(b.to_week) !== b.to_week) return err(422, "validation", "Hafta başlarını (pazartesi) seçin.");
    const list = listOf(assignments, slug);
    const src = list.filter((a) => a.date >= b.from_week! && a.date <= addDays(b.from_week!, 6));
    const shift = dayIndex(b.to_week) - dayIndex(b.from_week);
    let n = 0;
    for (const a of src) { const d = addDays(a.date, shift); if (!list.some((x) => x.staff_id === a.staff_id && x.date === d && x.template_id === a.template_id)) { list.push({ id: crypto.randomUUID(), staff_id: a.staff_id, date: d, template_id: a.template_id, changed_after_publish: false }); n++; } }
    return HttpResponse.json({ data: { created: n }, message: `${n} atama kopyalandı.` }, { status: 201 });
  }),
  http.post(`${API}/shift-plans/publish`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { week?: string; acknowledge_conflicts?: boolean };
    if (!b.week || weekStart(b.week) !== b.week) return err(422, "validation", "Hafta seçin.");
    const wk = listOf(assignments, slug).filter((a) => a.date >= b.week! && a.date <= addDays(b.week!, 6));
    if (wk.length === 0) return err(409, "empty_plan", "Bu haftada atama yok.");
    const c = conflictsFor(slug, listOf(assignments, slug)).filter((x) => wk.some((a) => a.id === x.assignment_id));
    if (c.length && !b.acknowledge_conflicts) return err(409, "conflicts", `${c.length} çakışma var. İnceleyip yine de yayınlamak için onaylayın.`);
    const pubs = listOf(publishedWeeks, slug).filter((w) => w.week !== b.week);
    pubs.push({ week: b.week, at: new Date().toISOString(), by: (await me(request)).name });
    publishedWeeks.set(slug, pubs);
    for (const a of wk) a.changed_after_publish = false;
    return HttpResponse.json({ data: { week: b.week, assignments: wk.length }, message: `Hafta planı yayınlandı (${wk.length} vardiya). Personele bildirim, personel hesabı (K29) ve bildirim servisi (K5) gelince gidecek.` });
  }),

  // 37 — İzinler
  http.get(`${API}/leave-requests`, ({ request, params }) => {
    const st = new URL(request.url).searchParams.get("status");
    return HttpResponse.json([...listOf(leaves, String(params.slug))].filter((l) => !st || l.status === st).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }),
  http.get(`${API}/leave-balances`, async ({ request, params }) => {
    const slug = String(params.slug); const year = today().slice(0, 4);
    const staff = await staffList(request, slug);
    return HttpResponse.json(staff.map((s) => ({ staff_id: s.id, staff_name: s.full_name, used: Object.fromEntries(LEAVE_TYPES.map((t) => [t, listOf(leaves, slug).filter((l) => l.staff_id === s.id && l.type === t && l.status === "approved" && l.from.startsWith(year)).reduce((n, l) => n + l.days, 0)])) })));
  }),
  http.post(`${API}/leave-requests`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as Partial<LeaveReq>;
    const f: Record<string, string> = {};
    const staff = (await staffList(request, slug)).find((s) => s.id === b.staff_id);
    if (!staff) f.staff_id = "Personel seçin.";
    if (!LEAVE_TYPES.includes(b.type as never)) f.type = "İzin türünü seçin.";
    if (!b.from || !DATE_RE.test(b.from)) f.from = "Başlangıç tarihini girin.";
    if (!b.to || !DATE_RE.test(b.to)) f.to = "Bitiş tarihini girin."; else if (b.from && b.to < b.from) f.to = "Bitiş başlangıçtan önce olamaz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    if (listOf(leaves, slug).some((l) => l.staff_id === b.staff_id && (l.status === "pending" || l.status === "approved") && l.from <= b.to! && l.to >= b.from!)) return err(409, "leave_overlap", "Bu tarihlerde kişinin başka bir izni var.");
    const days = dayIndex(b.to!) - dayIndex(b.from!) + 1;
    const l: LeaveReq = { id: crypto.randomUUID(), staff_id: staff!.id, staff_name: staff!.full_name, type: b.type!, from: b.from!, to: b.to!, days, note: b.note?.trim() || null, status: "pending", created_by: (await me(request)).name, created_at: new Date().toISOString(), decided_by: null, decided_at: null, reject_reason: null };
    listOf(leaves, slug).push(l);
    const clash = listOf(assignments, slug).filter((a) => a.staff_id === l.staff_id && a.date >= l.from && a.date <= l.to).length;
    return HttpResponse.json({ data: { ...l, clashing_shifts: clash }, message: `İzin talebi kaydedildi${clash ? `; bu tarihlerde ${clash} vardiyası var` : ""}. Onay bekliyor.` }, { status: 201 });
  }),
  http.post(`${API}/leave-requests/:id/:action`, async ({ request, params }) => {
    const slug = String(params.slug);
    if (!["approve", "reject", "cancel"].includes(String(params.action))) return;
    const l = listOf(leaves, slug).find((x) => x.id === params.id);
    if (!l) return err(404, "not_found", "İzin talebi bulunamadı.");
    const b = (await request.json().catch(() => ({}))) as { reason?: string };
    const who = (await me(request)).name;
    if (params.action === "cancel") {
      if (l.status === "cancelled" || l.status === "rejected") return err(409, "invalid_status", "Bu talep zaten kapanmış.");
      if (listOf(tsFinal, slug).some((d) => d.date >= l.from && d.date <= l.to)) return err(409, "timesheet_final", "İzin günlerinden birinin puantajı kesinleşti; iptal edilemez.");
      Object.assign(l, { status: "cancelled", decided_by: who, decided_at: new Date().toISOString() });
      return HttpResponse.json({ data: l, message: "İzin iptal edildi." });
    }
    if (l.status !== "pending") return err(409, "invalid_status", "Yalnız bekleyen talep karara bağlanır.");
    if (params.action === "reject" && (b.reason ?? "").trim().length < 3) return err(422, "validation", VALIDATION, { reason: "Ret gerekçesi yazın." });
    Object.assign(l, { status: params.action === "approve" ? "approved" : "rejected", decided_by: who, decided_at: new Date().toISOString(), reject_reason: params.action === "reject" ? b.reason!.trim() : null });
    const clash = listOf(assignments, slug).filter((a) => a.staff_id === l.staff_id && a.date >= l.from && a.date <= l.to).length;
    return HttpResponse.json({ data: l, message: params.action === "approve" ? `İzin onaylandı; vardiya planına ve puantaja yansır.${clash ? ` ${clash} vardiya "atanmalı" olarak işaretlendi.` : ""}` : "İzin reddedildi." });
  }),

  // 38 — Puantaj
  http.get(`${API}/timesheets`, async ({ request, params }) => {
    const slug = String(params.slug);
    const date = new URL(request.url).searchParams.get("date") ?? addDays(today(), -1);
    const staff = await staffList(request, slug, true);
    const fin = listOf(tsFinal, slug).find((d) => d.date === date) ?? null;
    return HttpResponse.json({ date, is_final: !!fin, finalized_by: fin?.by ?? null, finalized_at: fin?.at ?? null, rows: timesheetRows(slug, staff, date) });
  }),
  http.patch(`${API}/timesheets/:id`, async ({ request, params }) => {
    const slug = String(params.slug);
    const a = listOf(assignments, slug).find((x) => x.id === params.id);
    if (!a) return err(404, "not_found", "Puantaj satırı bulunamadı.");
    if (listOf(tsFinal, slug).some((d) => d.date === a.date)) return err(409, "timesheet_final", "Bu günün puantajı kesinleşti; düzeltme yapılamaz.");
    const b = (await request.json()) as Partial<TimesheetFix>;
    const f: Record<string, string> = {};
    if (!["worked", "absent", "leave"].includes(b.status ?? "")) f.status = "Durum seçin.";
    for (const k of ["late_minutes", "early_leave_minutes", "overtime_minutes"] as const) if (b[k] != null && !(Number.isInteger(b[k]) && b[k]! >= 0 && b[k]! <= 960)) f[k] = "0–960 dakika.";
    if ((b.reason ?? "").trim().length < 3) f.reason = "Düzeltme gerekçesi zorunlu.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    tsFixes.set(a.id, { status: b.status!, late_minutes: b.status === "worked" ? b.late_minutes ?? 0 : 0, early_leave_minutes: b.status === "worked" ? b.early_leave_minutes ?? 0 : 0, overtime_minutes: b.status === "worked" ? b.overtime_minutes ?? 0 : 0, reason: b.reason!.trim(), by: (await me(request)).name, at: new Date().toISOString() });
    return HttpResponse.json({ data: null, message: "Puantaj düzeltildi; denetim kaydına yazıldı." });
  }),
  http.post(`${API}/timesheets/finalize`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { date?: string };
    if (!b.date || !DATE_RE.test(b.date)) return err(422, "validation", VALIDATION, { date: "Gün seçin." });
    if (b.date >= today()) return err(409, "day_not_ended", "Gün bitmeden puantaj kesinleşmez.");
    const list = listOf(tsFinal, slug);
    if (list.some((d) => d.date === b.date)) return err(409, "already_final", "Bu gün zaten kesinleşti.");
    list.push({ date: b.date, by: (await me(request)).name, at: new Date().toISOString() });
    return HttpResponse.json({ data: { date: b.date }, message: `${new Date(b.date).toLocaleDateString("tr-TR")} puantajı kesinleşti.` });
  }),

  // 39 — Puantaj aktarımı
  http.get(`${API}/timesheet-exports/preview`, async ({ request, params }) => HttpResponse.json(await tsPreview(request, String(params.slug), new URL(request.url).searchParams.get("month") ?? addMonths(monthStart(), -1).slice(0, 7)))),
  http.get(`${API}/timesheet-exports`, ({ params }) => HttpResponse.json([...listOf(tsExports, String(params.slug))].reverse())),
  http.post(`${API}/timesheet-exports`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { month?: string };
    if (!b.month || !/^\d{4}-\d{2}$/.test(b.month)) return err(422, "validation", VALIDATION, { month: "Ay seçin." });
    if (b.month >= today().slice(0, 7)) return err(409, "month_not_ended", "Ay bitmeden puantaj aktarılmaz.");
    if (listOf(tsExports, slug).some((x) => x.month === b.month)) return err(409, "already_exported", "Bu ayın puantajı aktarıldı ve kilitli; düzeltme ayrı dönem kaydıyla yapılır.");
    const pv = await tsPreview(request, slug, b.month);
    if (pv.missing_days.length) return err(409, "days_not_final", `Kesinleşmemiş günler var: ${pv.missing_days.map((d) => new Date(d).toLocaleDateString("tr-TR")).join(", ")}. Aktarım başlatılamaz.`);
    if (pv.missing_payroll.length) return err(409, "payroll_missing", `Bordro sicil no eksik: ${pv.missing_payroll.join(", ")}. Personel kartından girin.`);
    const x: TsExport = { id: crypto.randomUUID(), month: b.month, rows: pv.rows, created_by: (await me(request)).name, created_at: new Date().toISOString(), file_name: `puantaj-${slug}-${b.month}.csv` };
    listOf(tsExports, slug).push(x);
    return HttpResponse.json({ data: x, message: `${b.month} puantajı ${pv.rows.length} personel için dosyaya yazıldı ve kilitlendi.` }, { status: 201 });
  }),
];

// ============================================================================================
// GÜVENLİK VE DEVRİYE PAKETİ (Yazılım Dokümanı GUV-01..09, OTP-02) — servis istekleri 40–46
// Park yeri ve tahsis (OTP-01) K30'a, mal kabul (GUV-07) pilot sonrasına bırakıldı.
// ============================================================================================
interface Gate { id: string; name: string; kind: "vehicle" | "pedestrian" | "service"; block_ids: string[]; always_open: boolean; is_active: boolean }
interface SecSettings { unannounced_method: "info" | "approval"; approval_timeout_seconds: number; gate_methods: Record<string, "info" | "approval">; parcel_method: "code" | "qr" | "both"; visitor_fields: { plate: boolean; phone: boolean; id_seen: boolean }; retention_months: number; parcel_long_wait_days: number; guest_parking_capacity: number }
interface VisitorInvite { id: string; unit_id: string; unit_name: string; visitor_name: string; type: "once" | "range" | "recurring"; date_from: string; date_to: string; weekdays: number[]; time_from: string | null; time_to: string | null; plate: string | null; note: string | null; code: string; status: "active" | "used" | "cancelled"; created_by: string; created_at: string; used_at: string | null }
interface VisitRequest { id: string; unit_id: string; unit_name: string; full_name: string; kind: string; plate: string | null; gate_id: string | null; status: "awaiting" | "allowed" | "denied"; decided_by: string | null; decision_source: "resident" | "guard" | null; reason: string | null; created_by: string; created_at: string; expires_at: string; visitor_id: string | null }
interface GateLog { id: string; plate: string; plate_display: string; result: "registered" | "guest" | "unknown"; detail: string | null; gate_id: string | null; direction: "in" | "out"; by: string; at: string }
interface Violation { id: string; plate: string; plate_display: string; location: string; note: string | null; result: "registered" | "guest" | "unknown"; unit_name: string | null; notified: "resident" | "management"; by: string; at: string }
interface ParcelDelegate { id: string; unit_id: string; unit_name: string; name: string; created_by: string; created_at: string; is_active: boolean }
interface LogEntry { id: string; kind: "note" | "event" | "handover"; text: string; gate_id: string | null; by: string; at: string; addenda: { text: string; by: string; at: string }[]; acknowledged_by: string | null; acknowledged_at: string | null }
interface PatrolPoint { id: string; name: string; location: string | null; area: string | null; tag: "qr" | "nfc" | "both"; code: string; is_active: boolean }
interface PatrolPlan { id: string; name: string; point_ids: string[]; ordered: boolean; start_times: string[]; allowed_minutes: number; assignee: string | null; is_active: boolean }
interface PatrolRun { id: string; plan_id: string; plan_name: string; slot: string | null; started_by: string; started_at: string; finished_at: string | null; scans: { point_id: string; at: string; note: string | null; out_of_order: boolean }[] }
const gates = loadMap<string, Gate[]>("gates");
const secSettings = loadMap<string, SecSettings>("secSettings");
const visitorInvites = loadMap<string, VisitorInvite[]>("visitorInvites");
const visitRequests = loadMap<string, VisitRequest[]>("visitRequests");
const gateLogs = loadMap<string, GateLog[]>("gateLogs");
const violations = loadMap<string, Violation[]>("violations");
const parcelDelegates = loadMap<string, ParcelDelegate[]>("parcelDelegates");
const shiftLog = loadMap<string, LogEntry[]>("shiftLog");
const patrolPoints = loadMap<string, PatrolPoint[]>("patrolPoints");
const patrolPlans = loadMap<string, PatrolPlan[]>("patrolPlans");
const patrolRuns = loadMap<string, PatrolRun[]>("patrolRuns");
const secOf = (slug: string) => { if (!secSettings.has(slug)) secSettings.set(slug, { unannounced_method: "info", approval_timeout_seconds: 90, gate_methods: {}, parcel_method: "both", visitor_fields: { plate: true, phone: false, id_seen: false }, retention_months: 6, parcel_long_wait_days: 5, guest_parking_capacity: 10 }); return secSettings.get(slug)!; };
const randCode = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const weekday = (d: string) => (new Date(d + "T00:00:00").getDay() + 6) % 7; // 0 = pazartesi
function inviteValidNow(i: VisitorInvite, date = today(), time = nowHm()) {
  if (i.status !== "active") return false;
  if (date < i.date_from || date > i.date_to) return false;
  if (i.type === "recurring" && !i.weekdays.includes(weekday(date))) return false;
  if (i.time_from && i.time_to && (time < i.time_from || time > i.time_to)) return false;
  return true;
}
function requestOut(r: VisitRequest) { const timed = r.status === "awaiting" && r.expires_at < new Date().toISOString(); return { ...r, timed_out: timed, seconds_left: r.status === "awaiting" ? Math.max(0, Math.round((new Date(r.expires_at).getTime() - Date.now()) / 1000)) : 0 }; }
function plateLookup(slug: string, raw: string) {
  const plate = normPlate(raw);
  const v = listOf(vehicles, slug).find((x) => x.plate === plate && x.status === "active" && (x.kind === "permanent" || (x.valid_until ?? "") >= today()));
  if (v) return { plate, plate_display: displayPlate(plate), result: "registered" as const, unit_name: v.unit_name, owner_name: v.owner_name, valid_until: v.valid_until, detail: `${v.unit_name}${v.owner_name ? ` · ${v.owner_name}` : ""}${v.kind === "guest" ? " · misafir aracı" : ""}` };
  // Tek kullanımlık davetle bugün giren misafirin plakası gün boyu misafir sayılır (çıkışta da tanınsın)
  const inv = listOf(visitorInvites, slug).find((i) => i.plate === plate && (inviteValidNow(i, today(), "12:00") || (i.status === "used" && !!i.used_at && dayOf(i.used_at) === today())));
  if (inv) return { plate, plate_display: displayPlate(plate), result: "guest" as const, unit_name: inv.unit_name, owner_name: null, valid_until: inv.date_to, detail: `${inv.unit_name} misafiri (${inv.visitor_name}) · ${new Date(inv.date_to).toLocaleDateString("tr-TR")} tarihine kadar` };
  return { plate, plate_display: PLATE_RE.test(plate) ? displayPlate(plate) : plate, result: "unknown" as const, unit_name: null, owner_name: null, valid_until: null, detail: null };
}
async function createRealVisitor(request: Request, slug: string, b: { unit_id: string; full_name: string; kind?: string; plate?: string | null }) {
  return real<{ data?: { id: string }; error?: { message?: string; fields?: Record<string, string> } }>(request, `/api/v1/sites/${slug}/visitors`, { method: "POST", body: { unit_id: b.unit_id, full_name: b.full_name, kind: b.kind ?? "guest", plate_number: b.plate ? displayPlate(b.plate) : null, enter_now: true, note: null } });
}
function patrolReport(slug: string, run: PatrolRun) {
  const plan = listOf(patrolPlans, slug).find((p) => p.id === run.plan_id);
  const pts = new Map(listOf(patrolPoints, slug).map((p) => [p.id, p]));
  const scanned = new Set(run.scans.map((s) => s.point_id));
  const missed = (plan?.point_ids ?? []).filter((id) => !scanned.has(id)).map((id) => pts.get(id)?.name ?? "?");
  const end = run.finished_at ?? new Date().toISOString();
  const minutes = Math.round((new Date(end).getTime() - new Date(run.started_at).getTime()) / 60000);
  const lateStart = run.slot ? Math.max(0, Math.round((new Date(run.started_at).getTime() - new Date(`${dayOf(run.started_at)}T${run.slot}:00`).getTime()) / 60000)) : 0;
  return { missed, out_of_order: run.scans.filter((s) => s.out_of_order).map((s) => pts.get(s.point_id)?.name ?? "?"), duration_minutes: minutes, overtime: plan ? minutes > plan.allowed_minutes : false, late_start_minutes: lateStart, total_points: plan?.point_ids.length ?? 0, scanned_points: scanned.size, ok: missed.length === 0 && !run.scans.some((s) => s.out_of_order) && !(plan && minutes > plan.allowed_minutes) };
}

const guvenlik: RequestHandler[] = [
  // 40 — Kapılar ve güvenlik ayarları
  http.get(`${API}/gates`, ({ params }) => HttpResponse.json(listOf(gates, String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/gates` : `${API}/gates/:id`, async ({ request, params }) => {
    const list = listOf(gates, String(params.slug));
    const cur = verb === "patch" ? list.find((g) => g.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Kapı bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<Gate>) };
    const f: Record<string, string> = {};
    if (!b.name?.trim()) f.name = "Kapı adını yazın."; else if (list.some((g) => g.id !== cur?.id && g.name.toLocaleLowerCase("tr-TR") === b.name!.trim().toLocaleLowerCase("tr-TR"))) f.name = "Bu adla kapı var.";
    if (!["vehicle", "pedestrian", "service"].includes(b.kind ?? "")) f.kind = "Kapı tipini seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const g: Gate = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), kind: b.kind!, block_ids: b.block_ids ?? [], always_open: !!b.always_open, is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, g); else list.push(g);
    return HttpResponse.json({ data: g, message: verb === "post" ? `${g.name} eklendi.` : `${g.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/settings/security`, ({ params }) => HttpResponse.json(secOf(String(params.slug)))),
  http.put(`${API}/settings/security`, async ({ request, params }) => {
    const s = secOf(String(params.slug));
    const b = { ...s, ...((await request.json()) as Partial<SecSettings>) };
    const f: Record<string, string> = {};
    if (!["info", "approval"].includes(b.unannounced_method)) f.unannounced_method = "Yöntem seçin.";
    if (!(Number.isInteger(b.approval_timeout_seconds) && b.approval_timeout_seconds >= 30 && b.approval_timeout_seconds <= 600)) f.approval_timeout_seconds = "30–600 saniye.";
    if (!["code", "qr", "both"].includes(b.parcel_method)) f.parcel_method = "Teslim yöntemi seçin.";
    if (!(Number.isInteger(b.retention_months) && b.retention_months >= 1)) f.retention_months = "En az 1 ay.";
    else if (b.retention_months > 24) return err(422, "retention_limit", "Saklama süresi en fazla 2 yıl (24 ay) olabilir.", { retention_months: "En fazla 24 ay." });
    if (!(Number.isInteger(b.parcel_long_wait_days) && b.parcel_long_wait_days >= 1 && b.parcel_long_wait_days <= 60)) f.parcel_long_wait_days = "1–60 gün.";
    if (!(Number.isInteger(b.guest_parking_capacity) && b.guest_parking_capacity >= 0 && b.guest_parking_capacity <= 500)) f.guest_parking_capacity = "0–500.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    Object.assign(s, b);
    return HttpResponse.json({ data: s, message: "Güvenlik ayarları kaydedildi; kapı ekranları hemen güncellenir." });
  }),

  // 41 — Ziyaretçi ön daveti (sakin) ve kapıda kodla giriş
  http.get(`${API}/resident/visitor-invites`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    if (mine.status !== 200) return err(mine.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(mine.units.map((u) => u.unit_id));
    return HttpResponse.json([...listOf(visitorInvites, String(params.slug))].filter((i) => ids.has(i.unit_id)).reverse().map((i) => ({ ...i, valid_now: inviteValidNow(i), expired: i.status === "active" && i.date_to < today() })));
  }),
  http.post(`${API}/resident/visitor-invites`, async ({ request, params }) => {
    const slug = String(params.slug);
    const mine = await myUnits(request, slug);
    const b = (await request.json()) as Partial<VisitorInvite>;
    const unit = mine.units.find((u) => u.unit_id === b.unit_id) ?? mine.units[0];
    if (!unit) return err(404, "not_found", "Bölümünüz bulunamadı.");
    const f: Record<string, string> = {};
    const name = (b.visitor_name ?? "").trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(name) || name.length < 3) f.visitor_name = "Ziyaretçinin adını yazın (yalnız harf).";
    if (!["once", "range", "recurring"].includes(b.type ?? "")) f.type = "Davet tipini seçin.";
    if (!b.date_from || !DATE_RE.test(b.date_from) || b.date_from < today()) f.date_from = "Tarih bugünden önce olamaz.";
    const to = b.type === "once" ? b.date_from : b.date_to;
    if (b.type !== "once" && (!to || !DATE_RE.test(to) || (b.date_from && to < b.date_from))) f.date_to = "Bitiş tarihini girin.";
    if (b.type === "recurring" && !(b.weekdays?.length)) f.weekdays = "En az bir gün seçin.";
    if ((b.time_from && !TIME_RE.test(b.time_from)) || (b.time_to && !TIME_RE.test(b.time_to)) || (b.time_from && b.time_to && b.time_to <= b.time_from)) f.time_to = "Saat aralığını kontrol edin.";
    const plate = b.plate ? normPlate(b.plate) : null;
    if (plate && !PLATE_RE.test(plate)) f.plate = "Plakayı 34 ABC 123 biçiminde yazın.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    if (plate) {
      const cap = secOf(slug).guest_parking_capacity;
      const active = listOf(visitorInvites, slug).filter((i) => i.plate && i.status === "active" && i.date_from <= b.date_from! && i.date_to >= b.date_from!).length;
      if (active >= cap) return err(409, "guest_parking_full", `Misafir parkı bu tarihte dolu (${cap}). Plakasız davet oluşturabilirsiniz.`);
    }
    let code = randCode(6); while (listOf(visitorInvites, slug).some((i) => i.code === code && i.status === "active")) code = randCode(6);
    const inv: VisitorInvite = { id: crypto.randomUUID(), unit_id: unit.unit_id, unit_name: unit.unit_name, visitor_name: name, type: b.type!, date_from: b.date_from!, date_to: to!, weekdays: b.type === "recurring" ? b.weekdays! : [], time_from: b.time_from || null, time_to: b.time_to || null, plate, note: b.note?.trim() || null, code, status: "active", created_by: (await me(request)).name, created_at: new Date().toISOString(), used_at: null };
    listOf(visitorInvites, slug).push(inv);
    return HttpResponse.json({ data: inv, message: `Davet oluşturuldu. Kod: ${code} — ziyaretçinizle paylaşın; kapıda kodu ya da QR'ı gösterir.` }, { status: 201 });
  }),
  http.post(`${API}/resident/visitor-invites/:id/cancel`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    const i = listOf(visitorInvites, String(params.slug)).find((x) => x.id === params.id && mine.units.some((u) => u.unit_id === x.unit_id));
    if (!i) return err(404, "not_found", "Davet bulunamadı.");
    if (i.status !== "active") return err(409, "invalid_status", "Bu davet artık geçerli değil.");
    i.status = "cancelled";
    return HttpResponse.json({ data: i, message: "Davet iptal edildi." });
  }),
  http.get(`${API}/visitor-invites/expected`, ({ params }) => HttpResponse.json(listOf(visitorInvites, String(params.slug)).filter((i) => inviteValidNow(i, today(), "12:00") || (i.status === "active" && i.date_from <= today() && i.date_to >= today() && (i.type !== "recurring" || i.weekdays.includes(weekday(today()))))).map((i) => ({ id: i.id, unit_name: i.unit_name, visitor_name: i.visitor_name, type: i.type, time_from: i.time_from, time_to: i.time_to, plate: i.plate ? displayPlate(i.plate) : null })))),
  http.post(`${API}/visitor-invites/check-in`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { code?: string };
    const code = (b.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) return err(422, "validation", VALIDATION, { code: "6 haneli davet kodunu girin." });
    const i = listOf(visitorInvites, slug).find((x) => x.code === code && x.status !== "cancelled");
    if (!i) return err(404, "invite_not_found", "Bu kodla davet yok. Habersiz ziyaretçi olarak kaydedin.");
    if (!inviteValidNow(i)) return err(409, "invite_not_valid", i.status === "used" ? "Bu tek kullanımlık davet kullanılmış." : "Davet şu an geçerli değil (tarih/gün/saat dışında). Habersiz ziyaretçi olarak kaydedin.");
    const r = await createRealVisitor(request, slug, { unit_id: i.unit_id, full_name: i.visitor_name, plate: i.plate });
    if (r.status >= 300) return HttpResponse.json(r.body, { status: r.status });
    if (i.type === "once") Object.assign(i, { status: "used", used_at: new Date().toISOString() });
    return HttpResponse.json({ data: { visitor_id: r.body?.data?.id, unit_name: i.unit_name, visitor_name: i.visitor_name }, message: `${i.visitor_name} (${i.unit_name}) içeri alındı.` }, { status: 201 });
  }),

  // 42 — Habersiz ziyaretçi: bilgi bildirimi ya da sakin onayı
  http.post(`${API}/visit-requests`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { unit_id?: string; unit_name?: string; full_name?: string; kind?: string; plate?: string; gate_id?: string | null };
    const f: Record<string, string> = {};
    if (!b.unit_id) f.unit_id = "Ziyaret edilen bölümü seçin.";
    if ((b.full_name ?? "").trim().length < 2) f.full_name = "Ad soyad yazın.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const s = secOf(slug);
    const method = (b.gate_id && s.gate_methods[b.gate_id]) || s.unannounced_method;
    const unitName = b.unit_name?.trim() || "Bölüm";
    if (method === "info") {
      const r = await createRealVisitor(request, slug, { unit_id: b.unit_id!, full_name: b.full_name!.trim(), kind: b.kind, plate: b.plate ? normPlate(b.plate) : null });
      if (r.status >= 300) return HttpResponse.json(r.body, { status: r.status });
      return HttpResponse.json({ data: { method, status: "allowed", visitor_id: r.body?.data?.id }, message: `${b.full_name} içeri alındı; ${unitName} sakinlerine bilgi bildirimi (gönderim K5 ile).` }, { status: 201 });
    }
    const req: VisitRequest = { id: crypto.randomUUID(), unit_id: b.unit_id!, unit_name: unitName, full_name: b.full_name!.trim(), kind: b.kind ?? "guest", plate: b.plate ? normPlate(b.plate) : null, gate_id: b.gate_id ?? null, status: "awaiting", decided_by: null, decision_source: null, reason: null, created_by: (await me(request)).name, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + s.approval_timeout_seconds * 1000).toISOString(), visitor_id: null };
    listOf(visitRequests, slug).push(req);
    return HttpResponse.json({ data: { ...requestOut(req), method }, message: `${unitName} sakinlerinden onay istendi; ${s.approval_timeout_seconds} sn içinde yanıt yoksa siz karar verirsiniz.` }, { status: 201 });
  }),
  http.get(`${API}/visit-requests`, ({ request, params }) => {
    const st = new URL(request.url).searchParams.get("status");
    return HttpResponse.json([...listOf(visitRequests, String(params.slug))].filter((r) => !st || r.status === st).filter((r) => dayOf(r.created_at) === today() || r.status === "awaiting").reverse().map(requestOut));
  }),
  http.post(`${API}/visit-requests/:id/decide`, async ({ request, params }) => {
    const slug = String(params.slug);
    const r = listOf(visitRequests, slug).find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Talep bulunamadı.");
    if (r.status !== "awaiting") return err(409, "already_decided", "Bu talep karara bağlanmış.");
    if (!requestOut(r).timed_out) return err(409, "awaiting_resident", "Sakin yanıtı bekleniyor; süre dolunca karar verebilirsiniz.");
    const b = (await request.json()) as { decision?: string; reason?: string };
    if (!["allow", "deny"].includes(b.decision ?? "")) return err(422, "validation", VALIDATION, { decision: "Karar seçin." });
    if ((b.reason ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { reason: "Kararınızın gerekçesini yazın (ör. diafonla ulaşıldı, sakin onayladı)." });
    if (b.decision === "allow") { const v = await createRealVisitor(request, slug, { unit_id: r.unit_id, full_name: r.full_name, kind: r.kind, plate: r.plate }); if (v.status >= 300) return HttpResponse.json(v.body, { status: v.status }); r.visitor_id = v.body?.data?.id ?? null; }
    Object.assign(r, { status: b.decision === "allow" ? "allowed" : "denied", decided_by: (await me(request)).name, decision_source: "guard", reason: b.reason!.trim() });
    return HttpResponse.json({ data: requestOut(r), message: b.decision === "allow" ? `${r.full_name} içeri alındı (görevli kararı).` : `${r.full_name} girişi reddedildi; sakine bilgi.` });
  }),
  http.get(`${API}/resident/visit-approvals`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    if (mine.status !== 200) return err(mine.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(mine.units.map((u) => u.unit_id));
    return HttpResponse.json(listOf(visitRequests, String(params.slug)).filter((r) => ids.has(r.unit_id) && dayOf(r.created_at) === today()).reverse().map(requestOut));
  }),
  http.post(`${API}/resident/visit-approvals/:id`, async ({ request, params }) => {
    const slug = String(params.slug);
    const mine = await myUnits(request, slug);
    const r = listOf(visitRequests, slug).find((x) => x.id === params.id && mine.units.some((u) => u.unit_id === x.unit_id));
    if (!r) return err(404, "not_found", "Talep bulunamadı.");
    if (r.status !== "awaiting") return err(409, "already_decided", "Bu ziyaretçi için karar verilmiş.");
    if (requestOut(r).timed_out) return err(409, "timed_out", "Süre doldu; görevli sizinle diafon/telefonla iletişime geçecek.");
    const b = (await request.json()) as { decision?: string };
    if (!["allow", "deny"].includes(b.decision ?? "")) return err(422, "validation", VALIDATION, { decision: "Karar seçin." });
    if (b.decision === "allow") { const v = await createRealVisitor(request, slug, { unit_id: r.unit_id, full_name: r.full_name, kind: r.kind, plate: r.plate }); r.visitor_id = v.body?.data?.id ?? null; }
    Object.assign(r, { status: b.decision === "allow" ? "allowed" : "denied", decided_by: (await me(request)).name, decision_source: "resident" });
    return HttpResponse.json({ data: requestOut(r), message: b.decision === "allow" ? "Onayladınız; ziyaretçi içeri alındı." : "Reddettiniz; görevli bilgilendirildi." });
  }),

  // 43 — Plaka sorgu, giriş kaydı, otopark ihlali
  http.get(`${API}/plates/lookup`, ({ request, params }) => {
    const q = new URL(request.url).searchParams.get("plate") ?? "";
    if (normPlate(q).length < 4) return err(422, "validation", VALIDATION, { plate: "Plakayı yazın." });
    return HttpResponse.json(plateLookup(String(params.slug), q));
  }),
  http.get(`${API}/gate-logs`, ({ request, params }) => {
    const date = new URL(request.url).searchParams.get("date") ?? today();
    return HttpResponse.json([...listOf(gateLogs, String(params.slug))].filter((l) => dayOf(l.at) === date).reverse());
  }),
  http.post(`${API}/gate-logs`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { plate?: string; direction?: "in" | "out"; gate_id?: string | null };
    const lk = plateLookup(slug, b.plate ?? "");
    if (lk.plate.length < 4) return err(422, "validation", VALIDATION, { plate: "Plakayı yazın." });
    const l: GateLog = { id: crypto.randomUUID(), plate: lk.plate, plate_display: lk.plate_display, result: lk.result, detail: lk.detail, gate_id: b.gate_id ?? null, direction: b.direction === "out" ? "out" : "in", by: (await me(request)).name, at: new Date().toISOString() };
    listOf(gateLogs, slug).push(l);
    return HttpResponse.json({ data: l, message: `${l.plate_display} ${l.direction === "in" ? "girişi" : "çıkışı"} kaydedildi.` }, { status: 201 });
  }),
  http.get(`${API}/parking-violations`, ({ params }) => HttpResponse.json([...listOf(violations, String(params.slug))].reverse())),
  http.post(`${API}/parking-violations`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { plate?: string; location?: string; note?: string };
    const lk = plateLookup(slug, b.plate ?? "");
    const f: Record<string, string> = {};
    if (!PLATE_RE.test(lk.plate)) f.plate = "Plakayı 34 ABC 123 biçiminde yazın.";
    if ((b.location ?? "").trim().length < 2) f.location = "Yeri yazın (ör. B blok önü, engelli park yeri).";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    if (lk.result !== "unknown" && !(b.note ?? "").trim()) return err(409, "plate_authorized", `${lk.plate_display} yetkili (${lk.detail}). Yine de ihlal kaydedilecekse nedenini yazın (ör. yanlış yere park).`);
    const v: Violation = { id: crypto.randomUUID(), plate: lk.plate, plate_display: lk.plate_display, location: b.location!.trim(), note: b.note?.trim() || null, result: lk.result, unit_name: lk.unit_name, notified: lk.unit_name ? "resident" : "management", by: (await me(request)).name, at: new Date().toISOString() };
    listOf(violations, slug).push(v);
    return HttpResponse.json({ data: v, message: v.notified === "resident" ? `İhlal kaydedildi; ${v.unit_name} sakinine bildirim (gönderim K5 ile).` : "İhlal kaydedildi; plaka kayıtlı değil, yönetime bildirildi." }, { status: 201 });
  }),

  // 44 — Kargo: uzun bekleyenler, teslim yetkilisi
  http.get(`${API}/packages/long-waiting`, async ({ request, params }) => {
    const slug = String(params.slug);
    const days = secOf(slug).parcel_long_wait_days;
    const list = await allPages<{ id: string; unit_id: string; unit_name: string; carrier: string | null; received_at: string; status: string }>(request, `/api/v1/sites/${slug}/packages?status=waiting`);
    const limit = Date.now() - days * 864e5;
    return HttpResponse.json({ days, items: list.filter((p) => new Date(p.received_at).getTime() < limit).map((p) => ({ ...p, waiting_days: Math.floor((Date.now() - new Date(p.received_at).getTime()) / 864e5), delegates: listOf(parcelDelegates, slug).filter((d) => d.unit_id === p.unit_id && d.is_active).map((d) => d.name) })) });
  }),
  http.get(`${API}/units/:id/parcel-delegates`, ({ params }) => HttpResponse.json(listOf(parcelDelegates, String(params.slug)).filter((d) => d.unit_id === params.id && d.is_active).map((d) => ({ id: d.id, name: d.name })))),
  http.get(`${API}/resident/parcel-delegates`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    if (mine.status !== 200) return err(mine.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(mine.units.map((u) => u.unit_id));
    return HttpResponse.json(listOf(parcelDelegates, String(params.slug)).filter((d) => ids.has(d.unit_id) && d.is_active));
  }),
  http.post(`${API}/resident/parcel-delegates`, async ({ request, params }) => {
    const slug = String(params.slug);
    const mine = await myUnits(request, slug);
    const b = (await request.json()) as { name?: string; unit_id?: string };
    const unit = mine.units.find((u) => u.unit_id === b.unit_id) ?? mine.units[0];
    if (!unit) return err(404, "not_found", "Bölümünüz bulunamadı.");
    const name = (b.name ?? "").trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(name) || name.length < 3) return err(422, "validation", VALIDATION, { name: "Yetkili kişinin adını yazın." });
    const list = listOf(parcelDelegates, slug);
    if (list.filter((d) => d.unit_id === unit.unit_id && d.is_active).length >= 3) return err(409, "delegate_limit", "En fazla 3 teslim yetkilisi tanımlanabilir.");
    const d: ParcelDelegate = { id: crypto.randomUUID(), unit_id: unit.unit_id, unit_name: unit.unit_name, name, created_by: (await me(request)).name, created_at: new Date().toISOString(), is_active: true };
    list.push(d);
    return HttpResponse.json({ data: d, message: `${name} kargolarınızı teslim alabilir; kapıda sizin teslim kodunuzu söyler.` }, { status: 201 });
  }),
  http.post(`${API}/resident/parcel-delegates/:id/remove`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    const d = listOf(parcelDelegates, String(params.slug)).find((x) => x.id === params.id && mine.units.some((u) => u.unit_id === x.unit_id));
    if (!d) return err(404, "not_found", "Yetkili bulunamadı.");
    d.is_active = false;
    return HttpResponse.json({ data: d, message: `${d.name} yetkisi kaldırıldı.` });
  }),

  // 45 — Nöbet defteri ve vardiya devri
  http.get(`${API}/shift-log`, ({ request, params }) => {
    const date = new URL(request.url).searchParams.get("date");
    return HttpResponse.json([...listOf(shiftLog, String(params.slug))].filter((e) => !date || dayOf(e.at) === date).reverse());
  }),
  http.post(`${API}/shift-log`, async ({ request, params }) => {
    const b = (await request.json()) as { kind?: string; text?: string; gate_id?: string | null };
    if (!["note", "event", "handover"].includes(b.kind ?? "")) return err(422, "validation", VALIDATION, { kind: "Kayıt türünü seçin." });
    if ((b.text ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { text: "En az 5 karakter yazın." });
    const e: LogEntry = { id: crypto.randomUUID(), kind: b.kind as LogEntry["kind"], text: b.text!.trim(), gate_id: b.gate_id ?? null, by: (await me(request)).name, at: new Date().toISOString(), addenda: [], acknowledged_by: null, acknowledged_at: null };
    listOf(shiftLog, String(params.slug)).push(e);
    return HttpResponse.json({ data: e, message: e.kind === "handover" ? "Devir notu yazıldı; sonraki görevli okuyup onaylayacak." : "Nöbet defterine yazıldı. Kayıt değiştirilemez; düzeltme ek notla yapılır." }, { status: 201 });
  }),
  http.post(`${API}/shift-log/:id/addenda`, async ({ request, params }) => {
    const e = listOf(shiftLog, String(params.slug)).find((x) => x.id === params.id);
    if (!e) return err(404, "not_found", "Kayıt bulunamadı.");
    const b = (await request.json()) as { text?: string };
    if ((b.text ?? "").trim().length < 3) return err(422, "validation", VALIDATION, { text: "Ek notu yazın." });
    e.addenda.push({ text: b.text!.trim(), by: (await me(request)).name, at: new Date().toISOString() });
    return HttpResponse.json({ data: e, message: "Ek not eklendi." });
  }),
  http.post(`${API}/shift-log/:id/acknowledge`, async ({ request, params }) => {
    const e = listOf(shiftLog, String(params.slug)).find((x) => x.id === params.id);
    if (!e || e.kind !== "handover") return err(404, "not_found", "Devir notu bulunamadı.");
    if (e.acknowledged_by) return err(409, "already_acknowledged", "Devir zaten onaylanmış.");
    const who = (await me(request)).name;
    if (who === e.by) return err(409, "same_person", "Devri yazan kişi kendi devrini onaylayamaz; sonraki vardiya görevlisi onaylar.");
    Object.assign(e, { acknowledged_by: who, acknowledged_at: new Date().toISOString() });
    return HttpResponse.json({ data: e, message: "Devir okundu olarak onaylandı." });
  }),

  // 46 — Devriye
  http.get(`${API}/patrol-points`, ({ params }) => HttpResponse.json(listOf(patrolPoints, String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/patrol-points` : `${API}/patrol-points/:id`, async ({ request, params }) => {
    const list = listOf(patrolPoints, String(params.slug));
    const cur = verb === "patch" ? list.find((p) => p.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Nokta bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<PatrolPoint>) };
    const f: Record<string, string> = {};
    if (!b.name?.trim()) f.name = "Nokta adını yazın."; else if (list.some((p) => p.id !== cur?.id && p.name.toLocaleLowerCase("tr-TR") === b.name!.trim().toLocaleLowerCase("tr-TR"))) f.name = "Bu adla nokta var.";
    if (!["qr", "nfc", "both"].includes(b.tag ?? "")) f.tag = "Etiket tipini seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    let code = cur?.code ?? randCode(6); while (!cur && list.some((p) => p.code === code)) code = randCode(6);
    const p: PatrolPoint = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), location: b.location?.trim() || null, area: b.area?.trim() || null, tag: b.tag!, code, is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, p); else list.push(p);
    return HttpResponse.json({ data: p, message: verb === "post" ? `${p.name} eklendi; etiket kodu ${p.code}.` : `${p.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/patrol-plans`, ({ params }) => HttpResponse.json(listOf(patrolPlans, String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/patrol-plans` : `${API}/patrol-plans/:id`, async ({ request, params }) => {
    const slug = String(params.slug);
    const list = listOf(patrolPlans, slug);
    const cur = verb === "patch" ? list.find((p) => p.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Tur planı bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<PatrolPlan>) };
    const pts = new Set(listOf(patrolPoints, slug).filter((p) => p.is_active).map((p) => p.id));
    const f: Record<string, string> = {};
    if (!b.name?.trim()) f.name = "Tur adını yazın.";
    if (!b.point_ids?.length || b.point_ids.some((id) => !pts.has(id))) f.point_ids = "En az bir etkin nokta seçin.";
    if (!b.start_times?.length || b.start_times.some((t) => !TIME_RE.test(t))) f.start_times = "Başlangıç saatlerini SS:DD biçiminde girin.";
    if (!(Number.isInteger(b.allowed_minutes) && b.allowed_minutes! >= 5 && b.allowed_minutes! <= 240)) f.allowed_minutes = "5–240 dakika.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const p: PatrolPlan = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), point_ids: b.point_ids!, ordered: !!b.ordered, start_times: [...new Set(b.start_times!)].sort(), allowed_minutes: b.allowed_minutes!, assignee: b.assignee?.trim() || null, is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, p); else list.push(p);
    return HttpResponse.json({ data: p, message: verb === "post" ? `${p.name} turu eklendi.` : `${p.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/patrol-schedule`, ({ request, params }) => {
    const slug = String(params.slug);
    const date = new URL(request.url).searchParams.get("date") ?? today();
    const now = new Date();
    const runs = listOf(patrolRuns, slug).filter((r) => dayOf(r.started_at) === date);
    const slots = listOf(patrolPlans, slug).filter((p) => p.is_active).flatMap((p) => p.start_times.map((t) => {
      const run = runs.find((r) => r.plan_id === p.id && r.slot === t);
      const startAt = new Date(`${date}T${t}:00`);
      const status = run ? (run.finished_at ? (patrolReport(slug, run).ok ? "done" : "done_with_deviation") : (now.getTime() - new Date(run.started_at).getTime() > p.allowed_minutes * 60000 ? "overdue" : "running")) : now < startAt ? "upcoming" : now.getTime() - startAt.getTime() > 15 * 60000 ? "not_started" : "due";
      return { plan_id: p.id, plan_name: p.name, slot: t, status, run_id: run?.id ?? null, report: run ? patrolReport(slug, run) : null };
    })).sort((a, b) => a.slot.localeCompare(b.slot));
    return HttpResponse.json(slots);
  }),
  http.get(`${API}/patrol-runs`, ({ request, params }) => {
    const slug = String(params.slug);
    const date = new URL(request.url).searchParams.get("date");
    return HttpResponse.json([...listOf(patrolRuns, slug)].filter((r) => !date || dayOf(r.started_at) === date).reverse().map((r) => ({ ...r, report: patrolReport(slug, r) })));
  }),
  http.post(`${API}/patrol-runs`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { plan_id?: string; slot?: string | null };
    const plan = listOf(patrolPlans, slug).find((p) => p.id === b.plan_id && p.is_active);
    if (!plan) return err(422, "validation", VALIDATION, { plan_id: "Tur seçin." });
    const runs = listOf(patrolRuns, slug);
    if (runs.some((r) => r.plan_id === plan.id && !r.finished_at)) return err(409, "run_open", "Bu turun bitmemiş bir yürütmesi var.");
    const slot = b.slot ?? plan.start_times.filter((t) => t <= nowHm()).at(-1) ?? null;
    const r: PatrolRun = { id: crypto.randomUUID(), plan_id: plan.id, plan_name: plan.name, slot, started_by: (await me(request)).name, started_at: new Date().toISOString(), finished_at: null, scans: [] };
    runs.push(r);
    return HttpResponse.json({ data: { ...r, report: patrolReport(slug, r) }, message: `${plan.name} başladı. Her noktada etiketi okutun ya da kodunu girin.` }, { status: 201 });
  }),
  http.post(`${API}/patrol-runs/:id/scans`, async ({ request, params }) => {
    const slug = String(params.slug);
    const r = listOf(patrolRuns, slug).find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Tur bulunamadı.");
    if (r.finished_at) return err(409, "run_finished", "Tur bitmiş.");
    const b = (await request.json()) as { code?: string; note?: string };
    const plan = listOf(patrolPlans, slug).find((p) => p.id === r.plan_id)!;
    const point = listOf(patrolPoints, slug).find((p) => p.code === (b.code ?? "").replace(/\D/g, ""));
    if (!point) return err(422, "validation", VALIDATION, { code: "Bu kodla nokta yok." });
    if (!plan.point_ids.includes(point.id)) return err(409, "not_in_plan", `${point.name} bu turda yok.`);
    if (r.scans.some((s) => s.point_id === point.id)) return err(409, "already_scanned", `${point.name} zaten okutuldu.`);
    const expected = plan.point_ids.find((id) => !r.scans.some((s) => s.point_id === id));
    const out = plan.ordered && expected !== point.id;
    r.scans.push({ point_id: point.id, at: new Date().toISOString(), note: b.note?.trim() || null, out_of_order: out });
    return HttpResponse.json({ data: { ...r, report: patrolReport(slug, r) }, message: `${point.name} okutuldu${out ? " — sıra dışı" : ""}. (${r.scans.length}/${plan.point_ids.length})` });
  }),
  http.post(`${API}/patrol-runs/:id/finish`, async ({ params }) => {
    const slug = String(params.slug);
    const r = listOf(patrolRuns, slug).find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Tur bulunamadı.");
    if (r.finished_at) return err(409, "run_finished", "Tur zaten bitmiş.");
    r.finished_at = new Date().toISOString();
    const rep = patrolReport(slug, r);
    return HttpResponse.json({ data: { ...r, report: rep }, message: rep.ok ? "Tur sorunsuz tamamlandı." : `Tur bitti — sapma: ${[rep.missed.length && `${rep.missed.length} nokta okutulmadı`, rep.out_of_order.length && `${rep.out_of_order.length} sıra dışı`, rep.overtime && "süre aşıldı"].filter(Boolean).join(", ")}. Yöneticiye özet gider.` });
  }),
];

// ============================================================================================
// HİZMETLER PAKETİ (Yazılım Dokümanı HIZ-01..05) — servis istekleri 47–52
// Varlık kartı, yasal muayene ve periyodik bakım (HIZ-06/07) K28'e bağlı: bu pakette yok.
// ============================================================================================
const REQ_CATS = ["plumbing", "electrical", "elevator", "heating", "cleaning", "security", "garden", "common_area", "other"] as const;
const PRIOS = ["low", "normal", "high", "urgent"] as const;
interface DayHours { closed: boolean; open: string; close: string }
interface ReqSettings { categories: Record<string, { hour_type: "24x7" | "business"; resolve_hours: Record<string, number> }>; calendar: DayHours[]; auto_close_days: number; merge_window_hours: number; low_rating_threshold: number }
interface ReplyTemplate { id: string; title: string; category: string | null; body: string; is_active: boolean }
interface InternalNote { id: string; request_id: string; body: string; by: string; at: string }
interface Outage { id: string; title: string; category: string; location: string | null; public_description: string; status: "open" | "resolved"; request_ids: string[]; created_by: string; created_at: string; resolved_at: string | null; resolution: string | null }
interface Rating { request_id: string; solved: boolean; score: number | null; comment: string | null; by: string; at: string }
interface Tariff { id: string; name: string; unit: string; price: string; is_active: boolean }
interface Quote { id: string; account: { id: string; kind: string; reference_code: string; person_name: string | null } | null; request_id: string; request_number: number; request_title: string; unit_id: string; unit_name: string; lines: { description: string; qty: number; unit_price: string; total: string }[]; total: string; note: string | null; status: "pending" | "accepted" | "rejected" | "extra_pending" | "billed"; actual_total: string | null; billed_total: string | null; created_by: string; created_at: string; decided_at: string | null }
interface Permit { id: string; unit_id: string; unit_name: string; type: "renovation" | "move_in" | "move_out"; date_from: string; date_to: string; contractor: string | null; description: string; status: "pending" | "approved" | "rejected" | "completed"; reject_reason: string | null; checklist: { item: string; ok: boolean }[]; deposit: string | null; deposit_charge_id: string | null; created_by: string; created_at: string; decided_by: string | null; completed_by: string | null; completed_at: string | null }
interface PermitSettings { weekday_hours: string; saturday_hours: string; sunday_allowed: boolean; deposit_amount: string; checklist: string[] }
interface ReqRow { id: string; number: number; title: string; category: string; priority: string; status: string; unit_id: string | null; unit_name: string | null; location: string | null; reporter_name: string | null; created_at: string; resolved_at: string | null; assigned_to: string | null }
const reqSettings = loadMap<string, ReqSettings>("reqSettings");
const replyTemplates = loadMap<string, ReplyTemplate[]>("replyTemplates");
const internalNotes = loadMap<string, InternalNote[]>("internalNotes");
const outages = loadMap<string, Outage[]>("outages");
const ratings = loadMap<string, Rating[]>("ratings");
const tariffs = loadMap<string, Tariff[]>("tariffs");
const quotes = loadMap<string, Quote[]>("quotes");
const permits = loadMap<string, Permit[]>("permits");
const permitSettings = loadMap<string, PermitSettings>("permitSettings");
const DEFAULT_HOURS: Record<string, number> = { urgent: 4, high: 24, normal: 72, low: 168 };
const reqSetOf = (slug: string) => {
  if (!reqSettings.has(slug)) reqSettings.set(slug, {
    categories: Object.fromEntries(REQ_CATS.map((c) => [c, { hour_type: c === "elevator" || c === "plumbing" || c === "security" ? "24x7" : "business", resolve_hours: { ...DEFAULT_HOURS } }])) as ReqSettings["categories"],
    calendar: Array.from({ length: 7 }, (_, i) => ({ closed: i === 6, open: i === 5 ? "10:00" : "09:00", close: i === 5 ? "14:00" : "18:00" })),
    auto_close_days: 3, merge_window_hours: 24, low_rating_threshold: 2,
  });
  return reqSettings.get(slug)!;
};
const permitSetOf = (slug: string) => { if (!permitSettings.has(slug)) permitSettings.set(slug, { weekday_hours: "09:00-18:00", saturday_hours: "10:00-16:00", sunday_allowed: false, deposit_amount: "0.00", checklist: ["Ortak alanlar temiz bırakıldı", "Asansör ve koridorda hasar yok", "Moloz site dışına çıkarıldı", "Tesisat ve elektrik kapakları kapalı"] }); return permitSettings.get(slug)!; };
const at = (d: Date, hm: string) => { const x = new Date(d); x.setHours(Number(hm.slice(0, 2)), Number(hm.slice(3, 5)), 0, 0); return x; };
const nextDay = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() + 1); x.setHours(0, 0, 0, 0); return x; };
/** Çalışma takviminde `minutes` dakika ilerler; takvim dışında sayaç durur. */
function addBusiness(start: Date, minutes: number, cal: DayHours[]) {
  let t = new Date(start), rest = minutes;
  for (let i = 0; i < 800 && rest > 0; i++) {
    const d = cal[(t.getDay() + 6) % 7]!;
    if (d.closed) { t = nextDay(t); continue; }
    const o = at(t, d.open), c = at(t, d.close);
    if (t < o) t = o;
    if (t >= c) { t = nextDay(t); continue; }
    const avail = (c.getTime() - t.getTime()) / 60000;
    if (rest <= avail) return new Date(t.getTime() + rest * 60000);
    rest -= avail; t = nextDay(t);
  }
  return t;
}
function businessBetween(a: Date, b: Date, cal: DayHours[]) {
  let t = new Date(a), n = 0;
  for (let i = 0; i < 800 && t < b; i++) {
    const d = cal[(t.getDay() + 6) % 7]!;
    if (!d.closed) { const o = at(t, d.open), c = at(t, d.close); const s = t > o ? t : o, e = b < c ? b : c; if (e > s) n += (e.getTime() - s.getTime()) / 60000; }
    t = nextDay(t);
  }
  return n;
}
function slaOf(slug: string, r: ReqRow) {
  const s = reqSetOf(slug); const c = s.categories[r.category] ?? s.categories.other!;
  const hours = c.resolve_hours[r.priority] ?? 72; const start = new Date(r.created_at);
  const due = c.hour_type === "24x7" ? new Date(start.getTime() + hours * 3600e3) : addBusiness(start, hours * 60, s.calendar);
  const done = ["resolved", "closed", "cancelled"].includes(r.status);
  const now = done && r.resolved_at ? new Date(r.resolved_at) : new Date();
  const used = c.hour_type === "24x7" ? (now.getTime() - start.getTime()) / 60000 : businessBetween(start, now, s.calendar);
  const total = hours * 60;
  const d = s.calendar[(new Date().getDay() + 6) % 7]!;
  const paused = !done && c.hour_type === "business" && (d.closed || new Date() < at(new Date(), d.open) || new Date() >= at(new Date(), d.close));
  const state = done ? (now <= due ? "met" : "missed") : used >= total ? "breached" : used >= total * 0.8 ? "warning" : "ok";
  return { due_at: due.toISOString(), hour_type: c.hour_type, target_hours: hours, used_minutes: Math.round(used), remaining_minutes: Math.max(0, Math.round(total - used)), state, paused };
}
async function extrasFor(slug: string, ids: string[]) {
  const out: Record<string, { outage: { title: string; public_description: string; status: string } | null; rating: Rating | null; quote: Quote | null; auto_close_on: string | null }> = {};
  for (const id of ids) {
    const o = listOf(outages, slug).find((x) => x.request_ids.includes(id));
    const q = [...listOf(quotes, slug)].reverse().find((x) => x.request_id === id) ?? null;
    out[id] = { outage: o ? { title: o.title, public_description: o.public_description, status: o.status } : null, rating: listOf(ratings, slug).find((x) => x.request_id === id) ?? null, quote: q, auto_close_on: null };
  }
  return out;
}

const hizmet: RequestHandler[] = [
  // 47 — Kategori SLA ve çalışma takvimi
  http.get(`${API}/settings/requests`, ({ params }) => HttpResponse.json(reqSetOf(String(params.slug)))),
  http.put(`${API}/settings/requests`, async ({ request, params }) => {
    const s = reqSetOf(String(params.slug));
    const b = { ...s, ...((await request.json()) as Partial<ReqSettings>) };
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.categories)) for (const p of PRIOS) { const h = v.resolve_hours[p]; if (!(Number.isFinite(h) && h! >= 1 && h! <= 2160)) f[`categories.${k}.${p}`] = "1–2160 saat."; }
    if (b.calendar.length !== 7 || b.calendar.some((d) => !d.closed && (!TIME_RE.test(d.open) || !TIME_RE.test(d.close) || d.close <= d.open))) f.calendar = "Açık günlerde açılış kapanıştan önce olmalı (SS:DD).";
    if (b.calendar.every((d) => d.closed)) f.calendar = "En az bir çalışma günü olmalı.";
    if (!(Number.isInteger(b.auto_close_days) && b.auto_close_days >= 1 && b.auto_close_days <= 30)) f.auto_close_days = "1–30 gün.";
    if (!(Number.isInteger(b.merge_window_hours) && b.merge_window_hours >= 1 && b.merge_window_hours <= 168)) f.merge_window_hours = "1–168 saat.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    Object.assign(s, b);
    return HttpResponse.json({ data: s, message: "Talep ayarları kaydedildi; yeni talepler bu kurallarla açılır, açık talepler açıldıkları kuralla devam eder." });
  }),
  http.get(`${API}/requests/sla`, async ({ request, params }) => {
    const slug = String(params.slug);
    const rows = await allPages<ReqRow>(request, `/api/v1/sites/${slug}/requests`);
    return HttpResponse.json(Object.fromEntries(rows.map((r) => [r.id, slaOf(slug, r)])));
  }),

  // 48 — Hazır yanıtlar ve iç not
  http.get(`${API}/reply-templates`, ({ params }) => { const l = listOf(replyTemplates, String(params.slug)); if (l.length === 0) l.push({ id: crypto.randomUUID(), title: "Talep alındı", category: null, body: "Merhaba {{sakin.ad}}, {{talep.no}} numaralı talebiniz ekibimize iletildi. En kısa sürede dönüş yapacağız.", is_active: true }, { id: crypto.randomUUID(), title: "Arıza giderildi", category: null, body: "Merhaba {{sakin.ad}}, {{talep.no}} numaralı talebinizdeki arıza giderildi. Sorun devam ederse lütfen bildirin.", is_active: true }); return HttpResponse.json(l); }),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/reply-templates` : `${API}/reply-templates/:id`, async ({ request, params }) => {
    const list = listOf(replyTemplates, String(params.slug));
    const cur = verb === "patch" ? list.find((t) => t.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Şablon bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<ReplyTemplate>) };
    const f: Record<string, string> = {};
    if (!b.title?.trim()) f.title = "Başlık yazın.";
    if ((b.body ?? "").trim().length < 10) f.body = "Metin en az 10 karakter.";
    if (b.category && !REQ_CATS.includes(b.category as never)) f.category = "Kategori geçersiz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const t: ReplyTemplate = { id: cur?.id ?? crypto.randomUUID(), title: b.title!.trim(), category: b.category || null, body: b.body!.trim(), is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, t); else list.push(t);
    return HttpResponse.json({ data: t, message: verb === "post" ? "Şablon eklendi." : "Şablon güncellendi." }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/requests/:id/internal-notes`, ({ params }) => HttpResponse.json(listOf(internalNotes, String(params.slug)).filter((n) => n.request_id === params.id))),
  http.post(`${API}/requests/:id/internal-notes`, async ({ request, params }) => {
    const b = (await request.json()) as { body?: string };
    if ((b.body ?? "").trim().length < 2) return err(422, "validation", VALIDATION, { body: "Not yazın." });
    const n: InternalNote = { id: crypto.randomUUID(), request_id: String(params.id), body: b.body!.trim(), by: (await me(request)).name, at: new Date().toISOString() };
    listOf(internalNotes, String(params.slug)).push(n);
    return HttpResponse.json({ data: n, message: "İç not eklendi; sakin görmez." }, { status: 201 });
  }),

  // 49 — Ana olay ve birleştirme önerisi
  http.get(`${API}/outages`, ({ params }) => HttpResponse.json([...listOf(outages, String(params.slug))].reverse())),
  http.post(`${API}/outages`, async ({ request, params }) => {
    const b = (await request.json()) as { title?: string; category?: string; location?: string; public_description?: string; request_ids?: string[] };
    const f: Record<string, string> = {};
    if ((b.title ?? "").trim().length < 3) f.title = "Başlık yazın.";
    if (!REQ_CATS.includes(b.category as never)) f.category = "Kategori seçin.";
    if ((b.public_description ?? "").trim().length < 10) f.public_description = "Sakinlerin göreceği açıklamayı yazın.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const o: Outage = { id: crypto.randomUUID(), title: b.title!.trim(), category: b.category!, location: b.location?.trim() || null, public_description: b.public_description!.trim(), status: "open", request_ids: [...new Set(b.request_ids ?? [])], created_by: (await me(request)).name, created_at: new Date().toISOString(), resolved_at: null, resolution: null };
    listOf(outages, String(params.slug)).push(o);
    return HttpResponse.json({ data: o, message: `Ana olay oluşturuldu${o.request_ids.length ? `; ${o.request_ids.length} talep bağlandı` : ""}.` }, { status: 201 });
  }),
  http.post(`${API}/outages/:id/links`, async ({ request, params }) => {
    const o = listOf(outages, String(params.slug)).find((x) => x.id === params.id);
    if (!o) return err(404, "not_found", "Ana olay bulunamadı.");
    if (o.status !== "open") return err(409, "outage_resolved", "Çözülmüş ana olaya talep bağlanamaz.");
    const b = (await request.json()) as { request_id?: string };
    if (!b.request_id) return err(422, "validation", VALIDATION, { request_id: "Talep seçin." });
    if (listOf(outages, String(params.slug)).some((x) => x.request_ids.includes(b.request_id!))) return err(409, "already_linked", "Talep zaten bir ana olaya bağlı.");
    o.request_ids.push(b.request_id);
    return HttpResponse.json({ data: o, message: "Talep ana olaya bağlandı; sakin ana olayın genel açıklamasını görür." });
  }),
  http.post(`${API}/outages/:id/unlink`, async ({ request, params }) => {
    const o = listOf(outages, String(params.slug)).find((x) => x.id === params.id);
    if (!o) return err(404, "not_found", "Ana olay bulunamadı.");
    const b = (await request.json()) as { request_id?: string };
    o.request_ids = o.request_ids.filter((x) => x !== b.request_id);
    return HttpResponse.json({ data: o, message: "Bağlantı kaldırıldı." });
  }),
  http.post(`${API}/outages/:id/resolve`, async ({ request, params }) => {
    const slug = String(params.slug);
    const o = listOf(outages, slug).find((x) => x.id === params.id);
    if (!o) return err(404, "not_found", "Ana olay bulunamadı.");
    if (o.status !== "open") return err(409, "outage_resolved", "Ana olay zaten çözüldü.");
    const b = (await request.json()) as { resolution?: string };
    if ((b.resolution ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { resolution: "Çözüm açıklaması yazın; bağlı tüm sakinlere gider." });
    let closed = 0; const failed: string[] = [];
    for (const id of o.request_ids) {
      const r = await real<{ error?: { message?: string } }>(request, `/api/v1/sites/${slug}/requests/${id}/status`, { method: "POST", body: { status: "resolved", resolution: b.resolution!.trim() } });
      if (r.status < 300) closed++; else failed.push(r.body?.error?.message ?? String(r.status));
    }
    Object.assign(o, { status: "resolved", resolved_at: new Date().toISOString(), resolution: b.resolution!.trim() });
    return HttpResponse.json({ data: o, message: `Ana olay çözüldü; ${closed} bağlı talep "çözüldü" oldu ve sakinlere bildirildi.${failed.length ? ` ${failed.length} talep güncellenemedi.` : ""}` });
  }),
  http.get(`${API}/requests/:id/merge-suggestions`, async ({ request, params }) => {
    const slug = String(params.slug);
    const s = reqSetOf(slug);
    const r = await real<ReqRow>(request, `/api/v1/sites/${slug}/requests/${params.id}`);
    if (!r.body) return HttpResponse.json(r.body, { status: r.status });
    const me0 = r.body;
    const linked = listOf(outages, slug).find((o) => o.request_ids.includes(me0.id)) ?? null;
    const all = await allPages<ReqRow>(request, `/api/v1/sites/${slug}/requests`);
    const since = new Date(new Date(me0.created_at).getTime() - s.merge_window_hours * 3600e3).toISOString();
    const block = (x: ReqRow) => x.unit_name?.split("-")[0] ?? null;
    const same = all.filter((x) => x.id !== me0.id && x.category === me0.category && x.created_at >= since && !["closed", "cancelled"].includes(x.status) && ((me0.location && x.location === me0.location) || (!me0.unit_id && !x.unit_id) || (block(me0) && block(x) === block(me0))));
    const openOutages = listOf(outages, slug).filter((o) => o.status === "open" && o.category === me0.category && !o.request_ids.includes(me0.id));
    return HttpResponse.json({ linked_outage: linked, similar: same.map((x) => ({ id: x.id, number: x.number, title: x.title, unit_name: x.unit_name, location: x.location, created_at: x.created_at })), open_outages: openOutages.map((o) => ({ id: o.id, title: o.title, request_count: o.request_ids.length })), window_hours: s.merge_window_hours });
  }),

  // 50 — Kapanış onayı ve memnuniyet
  http.get(`${API}/requests/:id/extras`, async ({ params }) => HttpResponse.json((await extrasFor(String(params.slug), [String(params.id)]))[String(params.id)])),
  http.get(`${API}/resident/requests/extras`, async ({ request, params }) => {
    const slug = String(params.slug);
    const r = await real<Paged<ReqRow>>(request, `/api/v1/sites/${slug}/resident/requests?page_size=100`);
    if (!r.body) return HttpResponse.json(r.body, { status: r.status });
    const ex = await extrasFor(slug, r.body.items.map((x) => x.id));
    const s = reqSetOf(slug);
    for (const x of r.body.items) if (x.status === "resolved" && x.resolved_at && !ex[x.id]!.rating) ex[x.id]!.auto_close_on = iso(new Date(new Date(x.resolved_at).getTime() + s.auto_close_days * 864e5));
    return HttpResponse.json(ex);
  }),
  http.post(`${API}/resident/requests/:id/confirm`, async ({ request, params }) => {
    const slug = String(params.slug);
    const r = await real<Paged<ReqRow>>(request, `/api/v1/sites/${slug}/resident/requests?page_size=100`);
    const req0 = r.body?.items?.find((x) => x.id === params.id);
    if (!req0) return err(404, "not_found", "Talep bulunamadı.");
    if (req0.status !== "resolved") return err(409, "not_resolved", "Yalnız çözüldü durumundaki talep onaylanır.");
    const b = (await request.json()) as { solved?: boolean; score?: number; comment?: string };
    if (b.solved && !(Number.isInteger(b.score) && b.score! >= 1 && b.score! <= 5)) return err(422, "validation", VALIDATION, { score: "1–5 arası puan verin." });
    if (!b.solved && (b.comment ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { comment: "Sorunun neden devam ettiğini yazın." });
    const list = listOf(ratings, slug).filter((x) => x.request_id !== params.id);
    const rt: Rating = { request_id: String(params.id), solved: !!b.solved, score: b.solved ? b.score! : null, comment: b.comment?.trim() || null, by: (await me(request)).name, at: new Date().toISOString() };
    list.push(rt); ratings.set(slug, list);
    const low = rt.score != null && rt.score <= reqSetOf(slug).low_rating_threshold;
    return HttpResponse.json({ data: rt, message: rt.solved ? `Teşekkürler; talep kapatılacak.${low ? " Düşük puanınız yönetime iletildi." : ""}` : "Talebiniz yeniden açılması için yönetime iletildi." });
  }),

  // 51 — Ücretli hizmet
  http.get(`${API}/service-tariffs`, ({ params }) => HttpResponse.json(listOf(tariffs, String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/service-tariffs` : `${API}/service-tariffs/:id`, async ({ request, params }) => {
    const list = listOf(tariffs, String(params.slug));
    const cur = verb === "patch" ? list.find((t) => t.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Tarife kalemi bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<Tariff>) };
    const f: Record<string, string> = {};
    if (!b.name?.trim()) f.name = "Kalem adını yazın.";
    if (!b.unit?.trim()) f.unit = "Birim yazın (saat, adet, iş).";
    if (!(cents(b.price) > 0)) f.price = "Birim fiyat sıfırdan büyük olmalı.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const t: Tariff = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), unit: b.unit!.trim(), price: tl(cents(b.price)), is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, t); else list.push(t);
    return HttpResponse.json({ data: t, message: verb === "post" ? "Tarife kalemi eklendi." : "Tarife güncellendi (onay kuralına bağlanması K21)." }, { status: verb === "post" ? 201 : 200 });
  })),
  http.post(`${API}/requests/:id/quotes`, async ({ request, params }) => {
    const slug = String(params.slug);
    const r = await real<ReqRow>(request, `/api/v1/sites/${slug}/requests/${params.id}`);
    if (!r.body) return HttpResponse.json(r.body, { status: r.status });
    if (!r.body.unit_id) return err(409, "not_unit_request", "Ücretli hizmet yalnız bölüm içi taleplerde verilir.");
    const qs = listOf(quotes, slug);
    if (qs.some((q) => q.request_id === params.id && ["pending", "accepted", "extra_pending"].includes(q.status))) return err(409, "quote_open", "Bu talepte açık bir teklif var.");
    const b = (await request.json()) as { lines?: { description?: string; qty?: number; unit_price?: string }[]; note?: string };
    const lines = (b.lines ?? []).filter((l) => (l.description ?? "").trim());
    if (lines.length === 0) return err(422, "validation", VALIDATION, { lines: "En az bir kalem girin." });
    if (lines.some((l) => !(Number(l.qty) > 0) || !(cents(l.unit_price) > 0))) return err(422, "validation", VALIDATION, { lines: "Miktar ve birim fiyat sıfırdan büyük olmalı." });
    const ls = lines.map((l) => ({ description: l.description!.trim(), qty: Number(l.qty), unit_price: tl(cents(l.unit_price)), total: tl(Math.round(Number(l.qty) * cents(l.unit_price))) }));
    // Ücret hangi cariye yazılacak: oturan hesabı (yoksa açık herhangi biri). Sakin kararı verdiğinde hesap listesine erişemez.
    const accs = await real<Paged<{ id: string; kind: string; reference_code: string; person_name: string | null; is_closed: boolean }>>(request, `/api/v1/sites/${slug}/accounts?unit_id=${r.body.unit_id}&page_size=50`);
    const acc = accs.body?.items?.find((a) => a.kind === "occupant" && !a.is_closed) ?? accs.body?.items?.find((a) => !a.is_closed) ?? null;
    const q: Quote = { id: crypto.randomUUID(), account: acc ? { id: acc.id, kind: acc.kind, reference_code: acc.reference_code, person_name: acc.person_name } : null, request_id: String(params.id), request_number: r.body.number, request_title: r.body.title, unit_id: r.body.unit_id, unit_name: r.body.unit_name ?? "", lines: ls, total: tl(ls.reduce((s, l) => s + cents(l.total), 0)), note: b.note?.trim() || null, status: "pending", actual_total: null, billed_total: null, created_by: (await me(request)).name, created_at: new Date().toISOString(), decided_at: null };
    qs.push(q);
    return HttpResponse.json({ data: q, message: `Teklif (${Number(q.total).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺) sakine iletildi; onaylamadan iş ücretli yapılmaz.` }, { status: 201 });
  }),
  http.post(`${API}/resident/quotes/:id/decision`, async ({ request, params }) => {
    const slug = String(params.slug);
    const mine = await myUnits(request, slug);
    const q = listOf(quotes, slug).find((x) => x.id === params.id && mine.units.some((u) => u.unit_id === x.unit_id));
    if (!q) return err(404, "not_found", "Teklif bulunamadı.");
    const b = (await request.json()) as { decision?: string };
    if (!["accept", "reject"].includes(b.decision ?? "")) return err(422, "validation", VALIDATION, { decision: "Karar seçin." });
    if (q.status === "pending") {
      Object.assign(q, { status: b.decision === "accept" ? "accepted" : "rejected", decided_at: new Date().toISOString() });
      return HttpResponse.json({ data: q, message: b.decision === "accept" ? "Teklifi onayladınız; iş planlanacak." : "Teklifi reddettiniz; iş ücretli yapılmayacak." });
    }
    if (q.status === "extra_pending") {
      const billed = b.decision === "accept" ? q.actual_total! : q.total;
      Object.assign(q, { status: "billed", billed_total: billed });
      const ch = await billQuote(request, slug, q);
      return HttpResponse.json({ data: q, message: `${b.decision === "accept" ? "Ek tutarı onayladınız" : "Ek tutarı reddettiniz; teklif tutarı geçerli"}. ${Number(billed).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ cariye yansıyacak.${ch ? "" : ""}` });
    }
    return err(409, "invalid_status", "Bu teklif için karar beklenmiyor.");
  }),
  http.post(`${API}/quotes/:id/complete`, async ({ request, params }) => {
    const slug = String(params.slug);
    const q = listOf(quotes, slug).find((x) => x.id === params.id);
    if (!q) return err(404, "not_found", "Teklif bulunamadı.");
    if (q.status !== "accepted") return err(409, "invalid_status", "Yalnız sakinin onayladığı teklif tamamlanır.");
    const b = (await request.json()) as { actual_total?: string };
    if (!(cents(b.actual_total) > 0)) return err(422, "validation", VALIDATION, { actual_total: "Gerçekleşen tutarı girin." });
    q.actual_total = tl(cents(b.actual_total));
    if (cents(q.actual_total) > cents(q.total)) { q.status = "extra_pending"; return HttpResponse.json({ data: q, message: "Gerçekleşen tutar teklifi aşıyor; ek tutar için sakin onayı istendi." }); }
    Object.assign(q, { status: "billed", billed_total: q.actual_total });
    await billQuote(request, slug, q);
    return HttpResponse.json({ data: q, message: `İş tamamlandı; ${Number(q.billed_total).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ dönem dışı ücret olarak cariye yansıyacak.` });
  }),

  // 52 — Tadilat ve taşınma izinleri
  http.get(`${API}/settings/permits`, ({ params }) => HttpResponse.json(permitSetOf(String(params.slug)))),
  http.put(`${API}/settings/permits`, async ({ request, params }) => {
    const s = permitSetOf(String(params.slug));
    const b = { ...s, ...((await request.json()) as Partial<PermitSettings>) };
    const f: Record<string, string> = {};
    const RANGE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
    if (!RANGE.test(b.weekday_hours)) f.weekday_hours = "SS:DD-SS:DD biçiminde.";
    if (b.saturday_hours && !RANGE.test(b.saturday_hours)) f.saturday_hours = "SS:DD-SS:DD ya da boş (yasak).";
    if (cents(b.deposit_amount) < 0) f.deposit_amount = "Depozito negatif olamaz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    Object.assign(s, { ...b, deposit_amount: tl(cents(b.deposit_amount)), checklist: (b.checklist ?? []).map((x) => x.trim()).filter(Boolean) });
    return HttpResponse.json({ data: s, message: "Tadilat kuralları kaydedildi." });
  }),
  http.get(`${API}/permits`, ({ request, params }) => { const st = new URL(request.url).searchParams.get("status"); return HttpResponse.json([...listOf(permits, String(params.slug))].filter((p) => !st || p.status === st).reverse()); }),
  http.get(`${API}/resident/permits`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    if (mine.status !== 200) return err(mine.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(mine.units.map((u) => u.unit_id));
    return HttpResponse.json({ rules: permitSetOf(String(params.slug)), items: [...listOf(permits, String(params.slug))].filter((p) => ids.has(p.unit_id)).reverse() });
  }),
  http.post(`${API}/resident/permits`, async ({ request, params }) => {
    const slug = String(params.slug);
    const mine = await myUnits(request, slug);
    const b = (await request.json()) as Partial<Permit>;
    const unit = mine.units.find((u) => u.unit_id === b.unit_id) ?? mine.units[0];
    if (!unit) return err(404, "not_found", "Bölümünüz bulunamadı.");
    const f: Record<string, string> = {};
    if (!["renovation", "move_in", "move_out"].includes(b.type ?? "")) f.type = "Başvuru türünü seçin.";
    if (!b.date_from || !DATE_RE.test(b.date_from) || b.date_from < today()) f.date_from = "Tarih bugünden önce olamaz.";
    const to = b.type === "renovation" ? b.date_to : b.date_from;
    if (b.type === "renovation" && (!to || !DATE_RE.test(to) || to < (b.date_from ?? ""))) f.date_to = "Bitiş tarihini girin.";
    if ((b.description ?? "").trim().length < 5) f.description = b.type === "renovation" ? "Yapılacak işi kısaca yazın." : "Kısa açıklama yazın (ör. nakliye firması, saat).";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const p: Permit = { id: crypto.randomUUID(), unit_id: unit.unit_id, unit_name: unit.unit_name, type: b.type!, date_from: b.date_from!, date_to: to!, contractor: b.contractor?.trim() || null, description: b.description!.trim(), status: "pending", reject_reason: null, checklist: [], deposit: null, deposit_charge_id: null, created_by: (await me(request)).name, created_at: new Date().toISOString(), decided_by: null, completed_by: null, completed_at: null };
    listOf(permits, slug).push(p);
    return HttpResponse.json({ data: p, message: b.type === "renovation" ? "Tadilat başvurunuz yönetime iletildi; onaylanınca çalışma saatleri size bildirilir." : "Taşınma bildiriminiz alındı; asansör ve yükleme alanı için rezervasyon önerilir." }, { status: 201 });
  }),
  http.post(`${API}/permits/:id/:action`, async ({ request, params }) => {
    const slug = String(params.slug); const action = String(params.action);
    if (!["approve", "reject", "complete"].includes(action)) return;
    const p = listOf(permits, slug).find((x) => x.id === params.id);
    if (!p) return err(404, "not_found", "Başvuru bulunamadı.");
    const b = (await request.json().catch(() => ({}))) as { reason?: string; checklist?: { item: string; ok: boolean }[]; refund_deposit?: boolean };
    const who = (await me(request)).name;
    if (action === "reject") {
      if (p.status !== "pending") return err(409, "invalid_status", "Yalnız bekleyen başvuru reddedilir.");
      if ((b.reason ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { reason: "Ret gerekçesi yazın." });
      Object.assign(p, { status: "rejected", reject_reason: b.reason!.trim(), decided_by: who });
      return HttpResponse.json({ data: p, message: "Başvuru reddedildi; sakine gerekçe bildirildi." });
    }
    if (action === "approve") {
      if (p.status !== "pending") return err(409, "invalid_status", "Yalnız bekleyen başvuru onaylanır.");
      const dep = permitSetOf(slug).deposit_amount;
      p.status = "approved"; p.decided_by = who;
      if (p.type === "renovation" && cents(dep) > 0) {
        const accs = await real<Paged<{ id: string; kind: string; reference_code: string; unit_name: string; person_name: string | null; is_closed: boolean }>>(request, `/api/v1/sites/${slug}/accounts?unit_id=${p.unit_id}&page_size=50`);
        const acc = accs.body?.items?.find((a) => a.kind === "owner" && !a.is_closed);
        if (acc) { const c: AdHocCharge = { id: crypto.randomUUID(), unit_id: p.unit_id, unit_name: p.unit_name, account_id: acc.id, account_kind: "owner", reference_code: acc.reference_code, person_name: acc.person_name, source: "renovation", description: `Tadilat depozitosu (${new Date(p.date_from).toLocaleDateString("tr-TR")})`, amount: dep, due_date: p.date_from, mode: "immediate", status: "posted", created_by: who, created_at: new Date().toISOString(), cancel_reason: null }; listOf(adHocCharges, slug).push(c); Object.assign(p, { deposit: dep, deposit_charge_id: c.id }); }
      }
      return HttpResponse.json({ data: p, message: `Başvuru onaylandı; ${p.type === "renovation" ? "çalışma saatleri sakine, komşu bölümlere ve güvenliğe bildirildi" : "giriş/çıkış günü güvenliğe ve görevliye bildirildi"}${p.deposit ? `; ${Number(p.deposit).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ depozito tahakkuk etti` : ""}.` });
    }
    if (p.status !== "approved") return err(409, "invalid_status", "Yalnız onaylı başvuru tamamlanır.");
    const items = b.checklist ?? [];
    if (p.type !== "move_in" && (items.length === 0 || items.some((i) => typeof i.ok !== "boolean"))) return err(422, "validation", VALIDATION, { checklist: "Kontrol listesini doldurun." });
    Object.assign(p, { status: "completed", checklist: items, completed_by: who, completed_at: new Date().toISOString() });
    let msg = "Tamamlandı.";
    if (p.deposit_charge_id && b.refund_deposit) { const c = listOf(adHocCharges, slug).find((x) => x.id === p.deposit_charge_id); if (c) Object.assign(c, { status: "cancelled", cancel_reason: "Tadilat tamamlandı, kontrol listesi uygun — depozito iadesi" }); msg += " Depozito iadesi ters kayıtla yapıldı."; }
    if (p.type === "move_out") msg += " Bölümdeki ilişkinin bitiş tarihini bölüm kartından girin.";
    return HttpResponse.json({ data: p, message: msg });
  }),
];
async function billQuote(_request: Request, slug: string, q: Quote) {
  const acc = q.account;
  if (!acc) return null;
  const set = adHocOf(slug).sources.service;
  const c: AdHocCharge = { id: crypto.randomUUID(), unit_id: q.unit_id, unit_name: q.unit_name, account_id: acc.id, account_kind: acc.kind, reference_code: acc.reference_code, person_name: acc.person_name, source: "service", description: `Ücretli hizmet — talep #${q.request_number} ${q.request_title}`, amount: q.billed_total!, due_date: addDays(today(), set.due_days), mode: set.mode, status: set.mode === "immediate" ? "posted" : "waiting_next_run", created_by: "Sistem", created_at: new Date().toISOString(), cancel_reason: null };
  listOf(adHocCharges, slug).push(c);
  return c;
}

// ============================================================================================
// OPERASYON PAKETİ (Yazılım Dokümanı OPS-01..06) — servis istekleri 53–58
// ============================================================================================
interface KeyItem { id: string; kind: "key" | "card" | "remote"; code: string; name: string; area: string | null; authorized_roles: string[]; is_active: boolean }
interface KeyLoan { id: string; key_id: string; to_name: string; to_phone: string | null; due_at: string; given_by: string; given_at: string; returned_at: string | null; returned_to: string | null }
interface DepositedKey { id: string; unit_id: string; unit_name: string; deposited_by: string; authorized: { name: string; phone: string | null }[]; valid_until: string; note: string | null; status: "requested" | "held" | "handed" | "returned" | "expired"; received_by: string | null; received_at: string | null; handed_to: string | null; handed_at: string | null; created_at: string }
interface StockCount { id: string; lines: { item_id: string; name: string; system: string; counted: string; diff: string }[]; created_by: string; created_at: string }
interface ChkItem { text: string; type: "yesno" | "number" | "score"; photo_required: boolean; min?: number | null; max?: number | null }
interface ChkTemplate { id: string; name: string; items: ChkItem[]; is_active: boolean }
interface Inspection { id: string; template_id: string; template_name: string; location: string; answers: { text: string; type: string; value: string; ok: boolean; photo: string | null }[]; score: number; failed: number; opened_request_ids: string[]; by: string; at: string }
interface Policy { id: string; kind: string; insurer: string; policy_no: string; coverage: string; premium: string; start: string; end: string; area: string | null; note: string | null }
interface Claim { id: string; policy_id: string; policy_label: string; source: string | null; description: string; incident_date: string; status: "open" | "submitted" | "paid" | "rejected"; claimed: string | null; paid: string | null; paid_on: string | null; created_by: string; created_at: string }
interface Meter { id: string; kind: "cold_water" | "hot_water" | "heat" | "electric" | "gas" | "common"; serial: string; unit_id: string | null; unit_name: string | null; area: string | null; unit_label: string; multiplier: number; installed_on: string | null; status: "active" | "faulty" | "replaced"; replaced_by: string | null }
interface Reading { id: string; meter_id: string; period: string; value: string | null; consumption: string | null; prev_value: string | null; status: "ok" | "anomaly" | "approved" | "unreadable" | "reread"; reason: string | null; photo: string | null; by: string; at: string; anomaly_percent: number | null }
interface TaskTemplate { id: string; name: string; description: string | null; frequency: "daily" | "weekdays" | "monthly"; weekdays: number[]; month_day: number | null; time_from: string; time_to: string; location: string | null; assignee: string; photo_required: boolean; checklist_template_id: string | null; is_active: boolean }
interface TaskDone { template_id: string; date: string; status: "done" | "failed"; reason: string | null; note: string | null; photo: string | null; by: string; at: string }
const keyItems = loadMap<string, KeyItem[]>("keyItems");
const keyLoans = loadMap<string, KeyLoan[]>("keyLoans");
const depKeys = loadMap<string, DepositedKey[]>("depositedKeys");
const stockCounts = loadMap<string, StockCount[]>("stockCounts");
const chkTemplates = loadMap<string, ChkTemplate[]>("chkTemplates");
const inspections = loadMap<string, Inspection[]>("inspections");
const policies = loadMap<string, Policy[]>("policies");
const claims = loadMap<string, Claim[]>("claims");
const meters = loadMap<string, Meter[]>("meters");
const readings = loadMap<string, Reading[]>("readings");
const taskTemplates = loadMap<string, TaskTemplate[]>("taskTemplates");
const taskDone = loadMap<string, TaskDone[]>("taskDone");
const CHK_DEFAULTS: Omit<ChkTemplate, "id">[] = [
  { name: "Temizlik kalitesi", is_active: true, items: [{ text: "Giriş holü temiz", type: "yesno", photo_required: false }, { text: "Asansör kabini temiz", type: "yesno", photo_required: false }, { text: "Çöp odası düzenli", type: "yesno", photo_required: true }, { text: "Genel puan", type: "score", photo_required: false, min: 1, max: 5 }] },
  { name: "Havuz hijyeni", is_active: true, items: [{ text: "Klor (ppm)", type: "number", photo_required: false, min: 1, max: 3 }, { text: "pH", type: "number", photo_required: false, min: 7.2, max: 7.8 }, { text: "Su berrak", type: "yesno", photo_required: false }] },
  { name: "Taşınma hasar kontrolü", is_active: true, items: [{ text: "Asansör iç kaplaması sağlam", type: "yesno", photo_required: true }, { text: "Koridor duvarları sağlam", type: "yesno", photo_required: false }, { text: "Anahtar ve kartlar teslim alındı", type: "yesno", photo_required: false }] },
];
const chkOf = (slug: string) => { const l = listOf(chkTemplates, slug); if (l.length === 0) for (const t of CHK_DEFAULTS) l.push({ id: crypto.randomUUID(), ...t }); return l; };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 864e5);
const policyOut = (p: Policy) => { const left = daysBetween(today(), p.end); return { ...p, days_left: left, warning: left < 0 ? "expired" : left <= 30 ? "30" : left <= 60 ? "60" : null }; };
const tasksForDate = (slug: string, date: string) => listOf(taskTemplates, slug).filter((t) => t.is_active && (t.frequency === "daily" || (t.frequency === "weekdays" && t.weekdays.includes(weekday(date))) || (t.frequency === "monthly" && Number(date.slice(8, 10)) === t.month_day)));

const operasyon: RequestHandler[] = [
  // 53 — Anahtar ve emanet
  http.get(`${API}/keys`, ({ params }) => {
    const slug = String(params.slug);
    return HttpResponse.json(listOf(keyItems, slug).map((k) => { const l = [...listOf(keyLoans, slug)].reverse().find((x) => x.key_id === k.id && !x.returned_at) ?? null; return { ...k, loan: l, overdue: !!l && l.due_at < new Date().toISOString() }; }));
  }),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/keys` : `${API}/keys/:id`, async ({ request, params }) => {
    const list = listOf(keyItems, String(params.slug));
    const cur = verb === "patch" ? list.find((k) => k.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Anahtar bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<KeyItem>) };
    const f: Record<string, string> = {};
    if (!b.name?.trim()) f.name = "Ad yazın (ör. Toplantı salonu).";
    if (!b.code?.trim()) f.code = "Kod yazın."; else if (list.some((k) => k.id !== cur?.id && k.code.toLocaleUpperCase("tr-TR") === b.code!.trim().toLocaleUpperCase("tr-TR"))) f.code = "Bu kodla anahtar var.";
    if (!["key", "card", "remote"].includes(b.kind ?? "")) f.kind = "Tip seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const k: KeyItem = { id: cur?.id ?? crypto.randomUUID(), kind: b.kind!, code: b.code!.trim().toLocaleUpperCase("tr-TR"), name: b.name!.trim(), area: b.area?.trim() || null, authorized_roles: b.authorized_roles ?? [], is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, k); else list.push(k);
    return HttpResponse.json({ data: k, message: verb === "post" ? `${k.name} eklendi.` : `${k.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
  })),
  http.post(`${API}/keys/:id/loans`, async ({ request, params }) => {
    const slug = String(params.slug);
    const k = listOf(keyItems, slug).find((x) => x.id === params.id);
    if (!k) return err(404, "not_found", "Anahtar bulunamadı.");
    if (listOf(keyLoans, slug).some((l) => l.key_id === k.id && !l.returned_at)) return err(409, "key_out", "Anahtar şu an başkasında; önce iadesini kaydedin.");
    const b = (await request.json()) as { to_name?: string; to_phone?: string; due_at?: string; role?: string };
    const f: Record<string, string> = {};
    if ((b.to_name ?? "").trim().length < 3) f.to_name = "Teslim alanın adını yazın.";
    if (!b.due_at || Number.isNaN(Date.parse(b.due_at)) || b.due_at < new Date().toISOString()) f.due_at = "İade zamanı ileri bir tarih olmalı.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    if (k.authorized_roles.length && !k.authorized_roles.includes(b.role ?? "")) return err(409, "not_authorized", `Bu kişi ${k.name} için yetkili değil (yetkili: ${k.authorized_roles.join(", ")}).`);
    const l: KeyLoan = { id: crypto.randomUUID(), key_id: k.id, to_name: b.to_name!.trim(), to_phone: b.to_phone ? normPhone(b.to_phone) : null, due_at: new Date(b.due_at!).toISOString(), given_by: (await me(request)).name, given_at: new Date().toISOString(), returned_at: null, returned_to: null };
    listOf(keyLoans, slug).push(l);
    return HttpResponse.json({ data: l, message: `${k.name} ${l.to_name} kişisine verildi.` }, { status: 201 });
  }),
  http.post(`${API}/key-loans/:id/return`, async ({ request, params }) => {
    const l = listOf(keyLoans, String(params.slug)).find((x) => x.id === params.id);
    if (!l) return err(404, "not_found", "Teslim kaydı bulunamadı.");
    if (l.returned_at) return err(409, "already_returned", "İade zaten kaydedilmiş.");
    Object.assign(l, { returned_at: new Date().toISOString(), returned_to: (await me(request)).name });
    return HttpResponse.json({ data: l, message: "İade kaydedildi." });
  }),
  http.get(`${API}/key-loans`, ({ params }) => HttpResponse.json([...listOf(keyLoans, String(params.slug))].reverse().slice(0, 100))),
  http.get(`${API}/deposited-keys`, ({ params }) => HttpResponse.json([...listOf(depKeys, String(params.slug))].map((d) => (d.status === "held" && d.valid_until < today() ? { ...d, status: "expired" } : d)).reverse())),
  http.post(`${API}/deposited-keys/:id/:action`, async ({ request, params }) => {
    const slug = String(params.slug); const action = String(params.action);
    if (!["receive", "hand", "return"].includes(action)) return;
    const d = listOf(depKeys, slug).find((x) => x.id === params.id);
    if (!d) return err(404, "not_found", "Emanet bulunamadı.");
    const who = (await me(request)).name;
    if (action === "receive") { if (d.status !== "requested") return err(409, "invalid_status", "Anahtar zaten teslim alınmış."); Object.assign(d, { status: "held", received_by: who, received_at: new Date().toISOString() }); return HttpResponse.json({ data: d, message: "Emanet anahtar teslim alındı ve kayda bağlandı." }); }
    if (action === "return") { Object.assign(d, { status: "returned" }); return HttpResponse.json({ data: d, message: "Anahtar sahibine iade edildi." }); }
    if (d.status !== "held") return err(409, "invalid_status", "Anahtar emanette değil.");
    if (d.valid_until < today()) return err(409, "expired", "Emanet süresi dolmuş; sakinle görüşün.");
    const b = (await request.json()) as { name?: string; id_checked?: boolean };
    const person = d.authorized.find((a) => a.name.toLocaleLowerCase("tr-TR") === (b.name ?? "").trim().toLocaleLowerCase("tr-TR"));
    if (!person) return err(409, "not_authorized", "Bu kişi yetkili listesinde değil; anahtar verilmez, sakine bilgi gider.");
    if (!b.id_checked) return err(422, "validation", VALIDATION, { id_checked: "Kimlik kontrolünü işaretleyin." });
    Object.assign(d, { status: "handed", handed_to: person.name, handed_at: new Date().toISOString() });
    return HttpResponse.json({ data: d, message: `Anahtar ${person.name} kişisine verildi; sakine bildirim (K5).` });
  }),
  http.get(`${API}/resident/deposited-keys`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    if (mine.status !== 200) return err(mine.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(mine.units.map((u) => u.unit_id));
    return HttpResponse.json(listOf(depKeys, String(params.slug)).filter((d) => ids.has(d.unit_id)).reverse());
  }),
  http.post(`${API}/resident/deposited-keys`, async ({ request, params }) => {
    const slug = String(params.slug);
    const mine = await myUnits(request, slug);
    const unit = mine.units[0];
    if (!unit) return err(404, "not_found", "Bölümünüz bulunamadı.");
    const b = (await request.json()) as { authorized?: { name: string; phone?: string }[]; valid_until?: string; note?: string };
    const auth = (b.authorized ?? []).filter((a) => a.name?.trim()).map((a) => ({ name: a.name.trim(), phone: a.phone ? normPhone(a.phone) : null }));
    const f: Record<string, string> = {};
    if (auth.length === 0) f.authorized = "En az bir yetkili kişi yazın.";
    if (!b.valid_until || !DATE_RE.test(b.valid_until) || b.valid_until < today()) f.valid_until = "Geçerlilik tarihi bugünden önce olamaz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const d: DepositedKey = { id: crypto.randomUUID(), unit_id: unit.unit_id, unit_name: unit.unit_name, deposited_by: (await me(request)).name, authorized: auth, valid_until: b.valid_until!, note: b.note?.trim() || null, status: "requested", received_by: null, received_at: null, handed_to: null, handed_at: null, created_at: new Date().toISOString() };
    listOf(depKeys, slug).push(d);
    return HttpResponse.json({ data: d, message: "Emanet kaydı oluşturuldu; anahtarı yönetime/güvenliğe bıraktığınızda teslim alınacak." }, { status: 201 });
  }),

  // 54 — Stok sayımı
  http.get(`${API}/stock-counts`, ({ params }) => HttpResponse.json([...listOf(stockCounts, String(params.slug))].reverse())),
  http.post(`${API}/stock-counts`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { lines?: { item_id: string; counted: string }[] };
    const items = (await real<{ id: string; name: string; quantity: string }[]>(request, `/api/v1/sites/${slug}/stock-items`)).body ?? [];
    const lines = (b.lines ?? []).filter((l) => l.counted !== "" && l.counted != null);
    if (lines.length === 0) return err(422, "validation", "Sayılan miktar girin.", { lines: "En az bir malzeme." });
    const out: StockCount["lines"] = [];
    for (const l of lines) {
      const it = items.find((x) => x.id === l.item_id); if (!it) continue;
      const counted = Number(String(l.counted).replace(",", "."));
      if (!(counted >= 0)) return err(422, "validation", VALIDATION, { [`lines.${l.item_id}`]: "Geçersiz miktar." });
      const diff = Math.round((counted - Number(it.quantity)) * 1000) / 1000;
      out.push({ item_id: it.id, name: it.name, system: it.quantity, counted: String(counted), diff: String(diff) });
      if (diff !== 0) await real(request, `/api/v1/sites/${slug}/stock-items/${it.id}/moves`, { method: "POST", body: { direction: diff > 0 ? "in" : "out", quantity: String(Math.abs(diff)), note: "Sayım farkı" } });
    }
    const c: StockCount = { id: crypto.randomUUID(), lines: out, created_by: (await me(request)).name, created_at: new Date().toISOString() };
    listOf(stockCounts, slug).push(c);
    const nd = out.filter((x) => Number(x.diff) !== 0).length;
    return HttpResponse.json({ data: c, message: nd ? `Sayım kaydedildi; ${nd} malzemede fark düzeltme hareketi olarak yazıldı.` : "Sayım kaydedildi; fark yok." }, { status: 201 });
  }),

  // 55 — Denetim listeleri
  http.get(`${API}/checklist-templates`, ({ params }) => HttpResponse.json(chkOf(String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/checklist-templates` : `${API}/checklist-templates/:id`, async ({ request, params }) => {
    const list = chkOf(String(params.slug));
    const cur = verb === "patch" ? list.find((t) => t.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Şablon bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<ChkTemplate>) };
    const items = (b.items ?? []).filter((i) => i.text?.trim());
    const f: Record<string, string> = {};
    if (!b.name?.trim()) f.name = "Şablon adını yazın.";
    if (items.length === 0) f.items = "En az bir madde ekleyin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const t: ChkTemplate = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), items: items.map((i) => ({ text: i.text.trim(), type: i.type, photo_required: !!i.photo_required, min: i.min ?? null, max: i.max ?? null })), is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, t); else list.push(t);
    return HttpResponse.json({ data: t, message: verb === "post" ? "Şablon eklendi." : "Şablon güncellendi." }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/inspections`, ({ params }) => HttpResponse.json([...listOf(inspections, String(params.slug))].reverse())),
  http.post(`${API}/inspections`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { template_id?: string; location?: string; answers?: { value: string; photo?: string | null }[]; open_requests?: boolean };
    const t = chkOf(slug).find((x) => x.id === b.template_id);
    if (!t) return err(422, "validation", VALIDATION, { template_id: "Şablon seçin." });
    if ((b.location ?? "").trim().length < 2) return err(422, "validation", VALIDATION, { location: "Konumu yazın." });
    const ans = b.answers ?? [];
    const f: Record<string, string> = {};
    t.items.forEach((it, i) => { const a = ans[i]; if (!a || a.value === "" || a.value == null) f[`answers.${i}`] = "Yanıtlayın."; else if (it.photo_required && !a.photo) f[`answers.${i}`] = "Bu madde için fotoğraf zorunlu."; });
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const answers = t.items.map((it, i) => { const v = ans[i]!.value; const n = Number(String(v).replace(",", ".")); const ok = it.type === "yesno" ? v === "yes" : it.type === "score" ? n >= 3 : (it.min == null || n >= it.min) && (it.max == null || n <= it.max); return { text: it.text, type: it.type, value: v, ok, photo: ans[i]!.photo ?? null }; });
    const failed = answers.filter((a) => !a.ok);
    const opened: string[] = [];
    if (b.open_requests !== false) for (const a of failed) {
      const r = await real<{ data?: { id: string } }>(request, `/api/v1/sites/${slug}/requests`, { method: "POST", body: { title: `Denetim: ${a.text}`, description: `${t.name} denetiminde olumsuz (${b.location}). Değer: ${a.value === "no" ? "Hayır" : a.value}`, category: "common_area", priority: "normal", location: b.location, unit_id: null } });
      if (r.body?.data?.id) opened.push(r.body.data.id);
    }
    const ins: Inspection = { id: crypto.randomUUID(), template_id: t.id, template_name: t.name, location: b.location!.trim(), answers, score: Math.round(((answers.length - failed.length) / answers.length) * 100), failed: failed.length, opened_request_ids: opened, by: (await me(request)).name, at: new Date().toISOString() };
    listOf(inspections, slug).push(ins);
    return HttpResponse.json({ data: ins, message: `Denetim kaydedildi: skor %${ins.score}.${opened.length ? ` ${opened.length} olumsuz madde için talep açıldı.` : ""}` }, { status: 201 });
  }),

  // 56 — Sigorta, poliçe ve hasar
  http.get(`${API}/insurance-policies`, ({ params }) => HttpResponse.json(listOf(policies, String(params.slug)).map(policyOut).sort((a, b) => a.end.localeCompare(b.end)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/insurance-policies` : `${API}/insurance-policies/:id`, async ({ request, params }) => {
    const list = listOf(policies, String(params.slug));
    const cur = verb === "patch" ? list.find((p) => p.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Poliçe bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<Policy>) };
    const f: Record<string, string> = {};
    if (!b.kind?.trim()) f.kind = "Tip seçin.";
    if (!b.insurer?.trim()) f.insurer = "Sigortacıyı yazın.";
    if (!b.policy_no?.trim()) f.policy_no = "Poliçe no yazın.";
    if (!(cents(b.premium) >= 0)) f.premium = "Primi girin.";
    if (!b.start || !DATE_RE.test(b.start)) f.start = "Başlangıç tarihi.";
    if (!b.end || !DATE_RE.test(b.end) || (b.start && b.end <= b.start)) f.end = "Bitiş başlangıçtan sonra olmalı.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const p: Policy = { id: cur?.id ?? crypto.randomUUID(), kind: b.kind!, insurer: b.insurer!.trim(), policy_no: b.policy_no!.trim(), coverage: b.coverage?.trim() ?? "", premium: tl(cents(b.premium)), start: b.start!, end: b.end!, area: b.area?.trim() || null, note: b.note?.trim() || null };
    if (cur) Object.assign(cur, p); else list.push(p);
    return HttpResponse.json({ data: policyOut(p), message: verb === "post" ? "Poliçe kaydedildi; bitişten 60 ve 30 gün önce uyarı gider." : "Poliçe güncellendi." }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/insurance-claims`, ({ params }) => HttpResponse.json([...listOf(claims, String(params.slug))].reverse())),
  http.post(`${API}/insurance-claims`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as Partial<Claim>;
    const p = listOf(policies, slug).find((x) => x.id === b.policy_id);
    const f: Record<string, string> = {};
    if (!p) f.policy_id = "Poliçe seçin.";
    if ((b.description ?? "").trim().length < 5) f.description = "Hasarı kısaca anlatın.";
    if (!b.incident_date || !DATE_RE.test(b.incident_date) || b.incident_date > today()) f.incident_date = "Hasar tarihi (bugün ya da önce).";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const c: Claim = { id: crypto.randomUUID(), policy_id: p!.id, policy_label: `${p!.kind} · ${p!.insurer} · ${p!.policy_no}`, source: b.source?.trim() || null, description: b.description!.trim(), incident_date: b.incident_date!, status: "open", claimed: b.claimed ? tl(cents(b.claimed)) : null, paid: null, paid_on: null, created_by: (await me(request)).name, created_at: new Date().toISOString() };
    listOf(claims, slug).push(c);
    return HttpResponse.json({ data: c, message: "Hasar dosyası açıldı." }, { status: 201 });
  }),
  http.patch(`${API}/insurance-claims/:id`, async ({ request, params }) => {
    const c = listOf(claims, String(params.slug)).find((x) => x.id === params.id);
    if (!c) return err(404, "not_found", "Hasar dosyası bulunamadı.");
    const b = (await request.json()) as Partial<Claim>;
    if (b.status && !["open", "submitted", "paid", "rejected"].includes(b.status)) return err(422, "validation", VALIDATION, { status: "Durum seçin." });
    if (b.status === "paid" && !(cents(b.paid) > 0)) return err(422, "validation", VALIDATION, { paid: "Ödenen tazminatı girin." });
    Object.assign(c, { status: b.status ?? c.status, paid: b.status === "paid" ? tl(cents(b.paid)) : c.paid, paid_on: b.status === "paid" ? b.paid_on || today() : c.paid_on });
    return HttpResponse.json({ data: c, message: c.status === "paid" ? "Tazminat kaydedildi; Mod P'de gelir fişi olarak muhasebe aktarımına girecek." : "Hasar dosyası güncellendi." });
  }),

  // 57 — Sayaçlar ve okuma
  http.get(`${API}/meters`, ({ params }) => HttpResponse.json(listOf(meters, String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/meters` : `${API}/meters/:id`, async ({ request, params }) => {
    const slug = String(params.slug);
    const list = listOf(meters, slug);
    const cur = verb === "patch" ? list.find((m) => m.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Sayaç bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<Meter>) };
    const f: Record<string, string> = {};
    if (!["cold_water", "hot_water", "heat", "electric", "gas", "common"].includes(b.kind ?? "")) f.kind = "Tip seçin.";
    if (!b.serial?.trim()) f.serial = "Seri no yazın."; else if (list.some((m) => m.id !== cur?.id && m.serial === b.serial!.trim() && m.status !== "replaced")) f.serial = "Bu seri no kayıtlı.";
    if (!b.unit_id && !b.area?.trim()) f.unit_id = "Bölüm ya da ortak alan seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    let unitName = cur?.unit_name ?? null;
    if (b.unit_id && b.unit_id !== cur?.unit_id) { const u = await real<{ display_name: string }>(request, `/api/v1/sites/${slug}/units/${b.unit_id}`); unitName = u.body?.display_name ?? null; }
    const m: Meter = { id: cur?.id ?? crypto.randomUUID(), kind: b.kind!, serial: b.serial!.trim(), unit_id: b.unit_id || null, unit_name: b.unit_id ? unitName : null, area: b.unit_id ? null : b.area!.trim(), unit_label: b.unit_label?.trim() || (b.kind === "electric" ? "kWh" : b.kind === "heat" ? "birim" : "m³"), multiplier: Number(b.multiplier) || 1, installed_on: b.installed_on || null, status: b.status ?? "active", replaced_by: cur?.replaced_by ?? null };
    if (cur) Object.assign(cur, m); else list.push(m);
    return HttpResponse.json({ data: m, message: verb === "post" ? "Sayaç eklendi." : "Sayaç güncellendi." }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/meter-readings`, ({ request, params }) => {
    const slug = String(params.slug);
    const period = new URL(request.url).searchParams.get("period") ?? today().slice(0, 7);
    const ms = listOf(meters, slug).filter((m) => m.status !== "replaced");
    const rs = listOf(readings, slug);
    return HttpResponse.json({ period, rows: ms.map((m) => ({ meter: m, reading: rs.find((r) => r.meter_id === m.id && r.period === period) ?? null, last: [...rs].filter((r) => r.meter_id === m.id && r.period < period && r.value != null).sort((a, b) => b.period.localeCompare(a.period))[0] ?? null })), missing: ms.filter((m) => !rs.some((r) => r.meter_id === m.id && r.period === period && r.status !== "reread")).length });
  }),
  http.post(`${API}/meter-readings`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { meter_id?: string; period?: string; value?: string; unreadable_reason?: string; photo?: string | null; replacement?: { old_final: string; new_serial: string; new_initial: string } };
    const m = listOf(meters, slug).find((x) => x.id === b.meter_id);
    if (!m) return err(404, "not_found", "Sayaç bulunamadı.");
    if (!b.period || !/^\d{4}-\d{2}$/.test(b.period)) return err(422, "validation", VALIDATION, { period: "Dönem seçin." });
    const rs = listOf(readings, slug);
    const prev = [...rs].filter((r) => r.meter_id === m.id && r.period < b.period! && r.value != null).sort((a, x) => x.period.localeCompare(a.period))[0];
    const who = (await me(request)).name;
    const existing = rs.find((r) => r.meter_id === m.id && r.period === b.period && r.status !== "reread");
    if (existing && existing.status !== "anomaly") return err(409, "already_read", "Bu dönem okunmuş.");
    if (existing) existing.status = "reread";
    if (b.unreadable_reason) {
      const r: Reading = { id: crypto.randomUUID(), meter_id: m.id, period: b.period, value: null, consumption: null, prev_value: prev?.value ?? null, status: "unreadable", reason: b.unreadable_reason, photo: null, by: who, at: new Date().toISOString(), anomaly_percent: null };
      rs.push(r); return HttpResponse.json({ data: r, message: "Okunamadı olarak kaydedildi; eksik okumalarda listelenir." }, { status: 201 });
    }
    const v = Number(String(b.value ?? "").replace(",", "."));
    if (!(v >= 0)) return err(422, "validation", VALIDATION, { value: "Endeksi girin." });
    if (prev && v < Number(prev.value) && !b.replacement) return err(422, "index_decreased", `Endeks önceki okumadan (${Number(prev.value).toLocaleString("tr-TR")}) küçük olamaz; yeniden okuyun ya da sayaç değişimini işaretleyin.`, { value: "Önceki endeksten küçük." });
    const cons = prev ? v - Number(prev.value) : null;
    const prevCons = prev?.consumption != null ? Number(prev.consumption) : null;
    const pct = cons != null && prevCons != null && prevCons > 0 ? Math.round(((cons - prevCons) / prevCons) * 100) : null;
    const anomaly = pct != null && Math.abs(pct) > 50;
    const r: Reading = { id: crypto.randomUUID(), meter_id: m.id, period: b.period, value: String(v), consumption: cons != null ? String(Math.round(cons * m.multiplier * 1000) / 1000) : null, prev_value: prev?.value ?? null, status: anomaly ? "anomaly" : "ok", reason: null, photo: b.photo ?? null, by: who, at: new Date().toISOString(), anomaly_percent: pct };
    rs.push(r);
    return HttpResponse.json({ data: r, message: anomaly ? `Okuma kaydedildi; tüketim önceki döneme göre %${pct} değişti — yönetici onayı bekliyor.` : "Okuma kaydedildi." }, { status: 201 });
  }),
  http.post(`${API}/meter-readings/:id/:action`, async ({ request, params }) => {
    const action = String(params.action); if (!["approve", "reread"].includes(action)) return;
    const r = listOf(readings, String(params.slug)).find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Okuma bulunamadı.");
    if (r.status !== "anomaly") return err(409, "invalid_status", "Yalnız anormal okuma onaylanır ya da yeniden okunur.");
    r.status = action === "approve" ? "approved" : "reread"; r.reason = action === "approve" ? `Onaylayan: ${(await me(request)).name}` : "Yeniden okuma istendi";
    return HttpResponse.json({ data: r, message: action === "approve" ? "Anormal okuma onaylandı." : "Yeniden okuma istendi; görevliye görev düşer." });
  }),
  http.get(`${API}/resident/meter-readings`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    if (mine.status !== 200) return err(mine.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(mine.units.map((u) => u.unit_id));
    const ms = listOf(meters, String(params.slug)).filter((m) => m.unit_id && ids.has(m.unit_id));
    return HttpResponse.json(ms.map((m) => ({ meter: m, readings: listOf(readings, String(params.slug)).filter((r) => r.meter_id === m.id && r.status !== "reread").sort((a, b) => b.period.localeCompare(a.period)) })));
  }),

  // 58 — Görevli rutin görevleri
  http.get(`${API}/task-templates`, ({ params }) => HttpResponse.json(listOf(taskTemplates, String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/task-templates` : `${API}/task-templates/:id`, async ({ request, params }) => {
    const list = listOf(taskTemplates, String(params.slug));
    const cur = verb === "patch" ? list.find((t) => t.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Görev şablonu bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<TaskTemplate>) };
    const f: Record<string, string> = {};
    if (!b.name?.trim()) f.name = "Görev adını yazın.";
    if (!["daily", "weekdays", "monthly"].includes(b.frequency ?? "")) f.frequency = "Sıklık seçin.";
    if (b.frequency === "weekdays" && !(b.weekdays?.length)) f.weekdays = "En az bir gün seçin.";
    if (b.frequency === "monthly" && !(Number.isInteger(b.month_day) && b.month_day! >= 1 && b.month_day! <= 28)) f.month_day = "Ayın 1–28. günü.";
    if (!TIME_RE.test(b.time_from ?? "") || !TIME_RE.test(b.time_to ?? "") || b.time_to! <= b.time_from!) f.time_to = "Saat aralığını kontrol edin.";
    if (!b.assignee?.trim()) f.assignee = "Rol ya da kişi yazın.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const t: TaskTemplate = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), description: b.description?.trim() || null, frequency: b.frequency!, weekdays: b.frequency === "weekdays" ? b.weekdays! : [], month_day: b.frequency === "monthly" ? b.month_day! : null, time_from: b.time_from!, time_to: b.time_to!, location: b.location?.trim() || null, assignee: b.assignee!.trim(), photo_required: !!b.photo_required, checklist_template_id: b.checklist_template_id || null, is_active: b.is_active ?? true };
    if (cur) Object.assign(cur, t); else list.push(t);
    return HttpResponse.json({ data: t, message: verb === "post" ? `${t.name} görevi eklendi.` : `${t.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
  })),
  http.get(`${API}/tasks`, ({ request, params }) => {
    const slug = String(params.slug);
    const date = new URL(request.url).searchParams.get("date") ?? today();
    const done = listOf(taskDone, slug).filter((d) => d.date === date);
    const now = new Date(); const isToday = date === today(); const nowHm0 = nowHm();
    return HttpResponse.json(tasksForDate(slug, date).map((t) => { const d = done.find((x) => x.template_id === t.id) ?? null; const late = !d && (date < today() || (isToday && nowHm0 > t.time_to)); return { template: t, done: d, status: d ? d.status : late ? "late" : isToday && nowHm0 >= t.time_from ? "due" : "upcoming" }; }).sort((a, b) => a.template.time_from.localeCompare(b.template.time_from)).map((x) => ({ ...x, _now: now.toISOString() })));
  }),
  http.post(`${API}/tasks/:templateId/complete`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { date?: string; status?: "done" | "failed"; reason?: string; note?: string; photo?: string | null };
    const date = b.date ?? today();
    const t = tasksForDate(slug, date).find((x) => x.id === params.templateId);
    if (!t) return err(404, "not_found", "Bu gün için görev yok.");
    if (listOf(taskDone, slug).some((d) => d.template_id === t.id && d.date === date)) return err(409, "already_done", "Görev zaten kapatılmış.");
    if (b.status === "failed" && (b.reason ?? "").trim().length < 3) return err(422, "validation", VALIDATION, { reason: "Tamamlanamama nedenini seçin." });
    if (b.status !== "failed" && t.photo_required && !b.photo) return err(422, "photo_required", "Bu görev fotoğrafsız tamamlanamaz.", { photo: "Fotoğraf ekleyin." });
    const d: TaskDone = { template_id: t.id, date, status: b.status === "failed" ? "failed" : "done", reason: b.reason?.trim() || null, note: b.note?.trim() || null, photo: b.photo ?? null, by: (await me(request)).name, at: new Date().toISOString() };
    listOf(taskDone, slug).push(d);
    return HttpResponse.json({ data: d, message: d.status === "done" ? `${t.name} tamamlandı.` : `${t.name} tamamlanamadı olarak kaydedildi.` }, { status: 201 });
  }),
  http.get(`${API}/tasks/report`, ({ params }) => {
    const slug = String(params.slug);
    const days = Array.from({ length: 7 }, (_, i) => addDays(today(), -i - 1));
    const rows = listOf(taskTemplates, slug).filter((t) => t.is_active).map((t) => { const exp = days.filter((d) => tasksForDate(slug, d).some((x) => x.id === t.id)); const ok = exp.filter((d) => listOf(taskDone, slug).some((x) => x.template_id === t.id && x.date === d && x.status === "done")).length; return { template_id: t.id, name: t.name, assignee: t.assignee, expected: exp.length, done: ok, rate: exp.length ? Math.round((ok / exp.length) * 100) : null }; });
    const tot = rows.reduce((s, r) => s + r.expected, 0), ok = rows.reduce((s, r) => s + r.done, 0);
    return HttpResponse.json({ from: days.at(-1), to: days[0], rows, rate: tot ? Math.round((ok / tot) * 100) : null });
  }),
];

// ============================================================================================
// REZERVASYON PAKETİ (Yazılım Dokümanı REZ-01..03) — servis istekleri 59–61
// ============================================================================================
interface ResRules {
  enabled: boolean; open_from: string; open_to: string; slot_minutes: number; capacity: number; max_people: number; max_guests: number;
  weekly_limit: number; cancel_hours: number; late_cancel_refund: boolean;
  fee_type: "free" | "fixed" | "hourly" | "per_guest"; fee_amount: string;
  channel: "resident" | "staff" | "both"; approval: "auto" | "manual"; verify: "none" | "qr" | "code" | "staff";
  waitlist: boolean; waitlist_minutes: number; noshow: { enabled: boolean; months: number; count: number; block_days: number };
}
interface Reservation {
  id: string; area_id: string; area_name: string; date: string; start: string; end: string; unit_id: string; unit_name: string; person_name: string;
  people: number; guests: number; status: "pending" | "approved" | "rejected" | "cancelled" | "checked_in" | "no_show" | "completed";
  code: string; channel: "resident" | "staff"; created_by: string; created_at: string; fee: string; charge_id: string | null;
  account: { id: string; kind: string; reference_code: string; person_name: string | null } | null;
  reject_reason: string | null; cancel_reason: string | null; cancelled_late: boolean; checked_in_at: string | null; checked_in_by: string | null; decided_by: string | null;
}
interface WaitEntry { id: string; area_id: string; area_name: string; date: string; start: string; end: string; unit_id: string; unit_name: string; person_name: string; people: number; guests: number; status: "waiting" | "offered" | "accepted" | "expired" | "left"; offered_until: string | null; created_at: string; account: Reservation["account"] }
const RES_DEFAULT: ResRules = { enabled: true, open_from: "09:00", open_to: "22:00", slot_minutes: 60, capacity: 1, max_people: 10, max_guests: 5, weekly_limit: 2, cancel_hours: 24, late_cancel_refund: false, fee_type: "free", fee_amount: "0.00", channel: "both", approval: "auto", verify: "code", waitlist: true, waitlist_minutes: 30, noshow: { enabled: false, months: 3, count: 2, block_days: 14 } };
const resRules = loadMap<string, Record<string, ResRules>>("resRules"); // slug → area_id → kurallar
const reservations = loadMap<string, Reservation[]>("reservations");
const waitlist = loadMap<string, WaitEntry[]>("waitlist");
const rulesOf = (slug: string, areaId: string) => { if (!resRules.has(slug)) resRules.set(slug, {}); const m = resRules.get(slug)!; if (!m[areaId]) m[areaId] = { ...RES_DEFAULT, noshow: { ...RES_DEFAULT.noshow } }; return m[areaId]!; };
const resAreas = (slug: string) => listOf(commonAreas, slug).filter((a) => a.is_reservable && a.is_active);
const hm2m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const m2hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const slotsOf = (r: ResRules) => { const out: { start: string; end: string }[] = []; for (let m = hm2m(r.open_from); m + r.slot_minutes <= hm2m(r.open_to); m += r.slot_minutes) out.push({ start: m2hm(m), end: m2hm(m + r.slot_minutes) }); return out; };
const LIVE: Reservation["status"][] = ["pending", "approved", "checked_in"];
const feeOf = (r: ResRules, guests: number) => r.fee_type === "free" ? 0 : r.fee_type === "fixed" ? cents(r.fee_amount) : r.fee_type === "hourly" ? Math.round(cents(r.fee_amount) * r.slot_minutes / 60) : cents(r.fee_amount) * guests;
const resEndIso = (x: { date: string; end: string }) => new Date(`${x.date}T${x.end}:00`).toISOString();
const resStartMs = (x: { date: string; start: string }) => new Date(`${x.date}T${x.start}:00`).getTime();

/** Okuma anında zamanlanmış işleri işletir: biten rezervasyonu kapatır (doğrulama varsa no-show), süresi geçen bekleme teklifini sıradakine geçirir. */
function resTick(slug: string) {
  const now = new Date().toISOString();
  for (const r of listOf(reservations, slug)) {
    if (r.status !== "approved" || resEndIso(r) > now) continue;
    r.status = rulesOf(slug, r.area_id).verify === "none" ? "completed" : "no_show";
  }
  for (const w of listOf(waitlist, slug)) if (w.status === "offered" && w.offered_until! < now) { w.status = "expired"; offerNext(slug, w); }
}
function offerNext(slug: string, slot: { area_id: string; date: string; start: string }) {
  const r = rulesOf(slug, slot.area_id);
  const taken = listOf(reservations, slug).filter((x) => x.area_id === slot.area_id && x.date === slot.date && x.start === slot.start && LIVE.includes(x.status)).length;
  const offered = listOf(waitlist, slug).filter((w) => w.area_id === slot.area_id && w.date === slot.date && w.start === slot.start && w.status === "offered").length;
  if (taken + offered >= r.capacity) return null;
  const next = listOf(waitlist, slug).find((w) => w.area_id === slot.area_id && w.date === slot.date && w.start === slot.start && w.status === "waiting");
  if (!next) return null;
  Object.assign(next, { status: "offered", offered_until: new Date(Date.now() + r.waitlist_minutes * 60000).toISOString() });
  return next;
}
function blockedUntil(slug: string, unitId: string, areaId: string) {
  const r = rulesOf(slug, areaId);
  if (!r.noshow.enabled || r.verify === "none") return null;
  const from = addMonths(today(), -r.noshow.months);
  const ns = listOf(reservations, slug).filter((x) => x.unit_id === unitId && x.area_id === areaId && x.status === "no_show" && x.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  if (ns.length < r.noshow.count) return null;
  const until = addDays(ns.at(-1)!.date, r.noshow.block_days);
  return until >= today() ? until : null;
}
function billReservation(slug: string, r: Reservation) {
  if (cents(r.fee) <= 0 || !r.account || r.charge_id) return;
  const set = adHocOf(slug).sources.reservation;
  const c: AdHocCharge = { id: crypto.randomUUID(), unit_id: r.unit_id, unit_name: r.unit_name, account_id: r.account.id, account_kind: r.account.kind, reference_code: r.account.reference_code, person_name: r.account.person_name, source: "reservation", description: `Rezervasyon — ${r.area_name} ${r.date.split("-").reverse().join(".")} ${r.start}`, amount: r.fee, due_date: addDays(today(), set.due_days), mode: set.mode, status: set.mode === "immediate" ? "posted" : "waiting_next_run", created_by: "Sistem", created_at: new Date().toISOString(), cancel_reason: null };
  listOf(adHocCharges, slug).push(c);
  r.charge_id = c.id;
}
type ResInput = { area_id?: string; date?: string; start?: string; people?: number; guests?: number; waitlist?: boolean };
/** Ortak rezervasyon akışı (REZ-02): yetki, no-show kısıtı, sınırlar, çakışma, bekleme listesi, onay, ücret. */
function createReservation(slug: string, b: ResInput, who: { unit_id: string; unit_name: string; person_name: string; account: Reservation["account"]; channel: "resident" | "staff"; by: string }): Response {
  resTick(slug);
  const area = resAreas(slug).find((a) => a.id === b.area_id);
  if (!area) return err(422, "validation", VALIDATION, { area_id: "Alan seçin." });
  const r = rulesOf(slug, area.id);
  if (!r.enabled) return err(409, "area_closed", `${area.name} rezervasyona kapalı.`);
  if (who.channel === "resident" && r.channel === "staff") return err(409, "channel", `${area.name} için rezervasyonu yönetim açar; lütfen yönetimi arayın.`);
  if (who.channel === "staff" && r.channel === "resident") return err(409, "channel", `${area.name} için rezervasyonu sakin kendisi yapar.`);
  const f: Record<string, string> = {};
  if (!b.date || !DATE_RE.test(b.date) || b.date < today()) f.date = "Bugün ya da ileri bir tarih seçin.";
  const slot = slotsOf(r).find((s) => s.start === b.start);
  if (!slot) f.start = "Saat seçin.";
  else if (b.date === today() && slot.start <= nowHm()) f.start = "Geçmiş saat seçilemez.";
  const people = Number(b.people ?? 1), guests = Number(b.guests ?? 0);
  if (!Number.isInteger(people) || people < 1 || people > r.max_people) f.people = `Kişi sayısı 1–${r.max_people}.`;
  if (!Number.isInteger(guests) || guests < 0 || guests > r.max_guests) f.guests = `Misafir en fazla ${r.max_guests}.`;
  if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
  const until = blockedUntil(slug, who.unit_id, area.id);
  if (until) return err(409, "noshow_blocked", `Gelinmeyen rezervasyonlar nedeniyle ${until.split("-").reverse().join(".")} tarihine kadar ${area.name} rezervasyonu yapamazsınız.`);
  const all = listOf(reservations, slug);
  const ws = weekStart(b.date!);
  const weekCount = all.filter((x) => x.unit_id === who.unit_id && x.area_id === area.id && LIVE.concat(["completed", "no_show"]).includes(x.status) && x.date >= ws && x.date < addDays(ws, 7)).length;
  if (r.weekly_limit > 0 && weekCount >= r.weekly_limit) return err(409, "limit", `Haftalık sınır aşıldı: bölüm başına haftada ${r.weekly_limit} rezervasyon (${area.name}).`);
  if (all.some((x) => x.unit_id === who.unit_id && x.area_id === area.id && x.date === b.date && x.start === slot!.start && LIVE.includes(x.status))) return err(409, "duplicate", "Bu saat için rezervasyonunuz var.");
  const taken = all.filter((x) => x.area_id === area.id && x.date === b.date && x.start === slot!.start && LIVE.includes(x.status)).length;
  const offered = listOf(waitlist, slug).filter((w) => w.area_id === area.id && w.date === b.date && w.start === slot!.start && w.status === "offered").length;
  if (taken + offered >= r.capacity) {
    const free = slotsOf(r).filter((s) => !(b.date === today() && s.start <= nowHm()) && all.filter((x) => x.area_id === area.id && x.date === b.date && x.start === s.start && LIVE.includes(x.status)).length < r.capacity).map((s) => s.start).slice(0, 4);
    if (r.waitlist && b.waitlist) {
      const wl = listOf(waitlist, slug);
      if (wl.some((w) => w.unit_id === who.unit_id && w.area_id === area.id && w.date === b.date && w.start === slot!.start && ["waiting", "offered"].includes(w.status))) return err(409, "already_waiting", "Bu saat için zaten bekleme listesindesiniz.");
      const w: WaitEntry = { id: crypto.randomUUID(), area_id: area.id, area_name: area.name, date: b.date!, start: slot!.start, end: slot!.end, unit_id: who.unit_id, unit_name: who.unit_name, person_name: who.person_name, people, guests, status: "waiting", offered_until: null, created_at: new Date().toISOString(), account: who.account };
      wl.push(w);
      const pos = wl.filter((x) => x.area_id === area.id && x.date === b.date && x.start === slot!.start && x.status === "waiting").length;
      return HttpResponse.json({ data: w, message: `Bekleme listesine eklendiniz; sıranız ${pos}. Yer açılınca ${r.waitlist_minutes} dakika geçerli teklif gelir.` }, { status: 201 });
    }
    return err(409, "slot_full", `Bu saat dolu.${free.length ? ` Boş saatler: ${free.join(", ")}.` : " Bu gün boş saat yok."}${r.waitlist ? " Bekleme listesine girebilirsiniz." : ""}`);
  }
  const res: Reservation = { id: crypto.randomUUID(), area_id: area.id, area_name: area.name, date: b.date!, start: slot!.start, end: slot!.end, unit_id: who.unit_id, unit_name: who.unit_name, person_name: who.person_name, people, guests, status: r.approval === "auto" ? "approved" : "pending", code: randCode(6), channel: who.channel, created_by: who.by, created_at: new Date().toISOString(), fee: tl(feeOf(r, guests)), charge_id: null, account: who.account, reject_reason: null, cancel_reason: null, cancelled_late: false, checked_in_at: null, checked_in_by: null, decided_by: r.approval === "auto" ? "Otomatik" : null };
  all.push(res);
  if (res.status === "approved") billReservation(slug, res);
  const feeTxt = cents(res.fee) > 0 ? ` Ücret ${Number(res.fee).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ borca yansıdı.` : "";
  return HttpResponse.json({ data: res, message: res.status === "approved" ? `Rezervasyon onaylandı.${feeTxt}${who.channel === "staff" ? " Sakine bildirim gider (K5)." : ""}` : "Rezervasyon alındı; yönetici onayı bekleniyor." }, { status: 201 });
}
function cancelReservation(slug: string, r: Reservation, reason: string | null): Response {
  if (!["pending", "approved"].includes(r.status)) return err(409, "invalid_status", "Bu rezervasyon iptal edilemez.");
  const rules = rulesOf(slug, r.area_id);
  const late = resStartMs(r) - Date.now() < rules.cancel_hours * 3600000;
  Object.assign(r, { status: "cancelled", cancel_reason: reason, cancelled_late: late });
  let feeTxt = "";
  if (r.charge_id) {
    const c = listOf(adHocCharges, slug).find((x) => x.id === r.charge_id);
    if (c && c.status !== "cancelled" && (!late || rules.late_cancel_refund)) { Object.assign(c, { status: "cancelled", cancel_reason: "Rezervasyon iptali (ters kayıt)" }); feeTxt = " Ücret ters kayıtla kapatıldı."; }
    else if (c) feeTxt = ` Son iptal süresi (${rules.cancel_hours} saat) geçtiği için ücret iade edilmez.`;
  }
  const o = rules.waitlist ? offerNext(slug, r) : null;
  return HttpResponse.json({ data: r, message: `Rezervasyon iptal edildi.${feeTxt}${o ? ` Bekleme listesindeki ${o.unit_name} bölümüne teklif gitti.` : ""}` });
}
async function residentWho(request: Request, slug: string, unitId?: string) {
  const h = await real<{ units: { unit_id: string; unit_name: string; role: string }[]; accounts: { id: string; kind: string; reference_code: string; unit_id: string; person_name: string | null; is_closed: boolean }[] }>(request, `/api/v1/sites/${slug}/resident/home`);
  if (h.status !== 200 || !h.body) return null;
  const u = h.body.units.find((x) => x.unit_id === unitId) ?? h.body.units[0];
  if (!u) return null;
  const accs = h.body.accounts.filter((a) => a.unit_id === u.unit_id && !a.is_closed);
  const acc = accs.find((a) => a.kind === (u.role === "tenant" ? "tenant" : "owner")) ?? accs[0] ?? null;
  const m = await me(request);
  return { unit_id: u.unit_id, unit_name: u.unit_name, person_name: m.name, account: acc ? { id: acc.id, kind: acc.kind, reference_code: acc.reference_code, person_name: acc.person_name } : null, channel: "resident" as const, by: m.name };
}
function availability(slug: string, areaId: string, date: string, unitId?: string) {
  const r = rulesOf(slug, areaId);
  const all = listOf(reservations, slug).filter((x) => x.area_id === areaId && x.date === date && LIVE.includes(x.status));
  const wl = listOf(waitlist, slug).filter((w) => w.area_id === areaId && w.date === date && ["waiting", "offered"].includes(w.status));
  return slotsOf(r).map((s) => {
    const taken = all.filter((x) => x.start === s.start).length + wl.filter((w) => w.start === s.start && w.status === "offered").length;
    return { ...s, capacity: r.capacity, taken, past: date < today() || (date === today() && s.start <= nowHm()), mine: unitId ? all.some((x) => x.start === s.start && x.unit_id === unitId) : false, waiting: wl.filter((w) => w.start === s.start && w.status === "waiting").length };
  });
}
const resOut = (slug: string, a: CommonArea) => ({ id: a.id, name: a.name, kind: a.kind, block_name: a.block_name, rules: rulesOf(slug, a.id) });

const rezervasyon: RequestHandler[] = [
  // 59 — Alanlar ve kurallar
  http.get(`${API}/reservable-areas`, ({ params }) => HttpResponse.json(resAreas(String(params.slug)).map((a) => resOut(String(params.slug), a)))),
  http.put(`${API}/reservable-areas/:id/rules`, async ({ request, params }) => {
    const slug = String(params.slug);
    const a = resAreas(slug).find((x) => x.id === params.id);
    if (!a) return err(404, "not_found", "Rezerve edilebilir alan bulunamadı (Yapı → Ortak alanlar'da işaretleyin).");
    const b = { ...rulesOf(slug, a.id), ...((await request.json()) as Partial<ResRules>) };
    const f: Record<string, string> = {};
    if (!TIME_RE.test(b.open_from) || !TIME_RE.test(b.open_to) || b.open_to <= b.open_from) f.open_to = "Kapanış açılıştan sonra olmalı.";
    else if (![30, 60, 90, 120, 180, 240].includes(Number(b.slot_minutes)) || hm2m(b.open_to) - hm2m(b.open_from) < Number(b.slot_minutes)) f.slot_minutes = "Süre açık saatlere sığmalı.";
    if (!(Number(b.capacity) >= 1 && Number(b.capacity) <= 200)) f.capacity = "1–200.";
    if (!(Number(b.max_people) >= 1)) f.max_people = "En az 1.";
    if (!(Number(b.max_guests) >= 0)) f.max_guests = "0 ya da üstü.";
    if (!(Number(b.weekly_limit) >= 0)) f.weekly_limit = "0 (sınırsız) ya da üstü.";
    if (!(Number(b.cancel_hours) >= 0)) f.cancel_hours = "0 ya da üstü.";
    if (b.fee_type !== "free" && !(cents(b.fee_amount) > 0)) f.fee_amount = "Ücreti girin.";
    if (b.waitlist && !(Number(b.waitlist_minutes) >= 5)) f.waitlist_minutes = "En az 5 dakika.";
    if (b.noshow.enabled && b.verify === "none") f.noshow = "No-show kuralı için kullanım doğrulaması gerekir.";
    if (b.noshow.enabled && !(b.noshow.count >= 1 && b.noshow.months >= 1 && b.noshow.block_days >= 1)) f.noshow = "No-show sayıları en az 1.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const r: ResRules = { ...b, slot_minutes: Number(b.slot_minutes), capacity: Number(b.capacity), max_people: Number(b.max_people), max_guests: Number(b.max_guests), weekly_limit: Number(b.weekly_limit), cancel_hours: Number(b.cancel_hours), waitlist_minutes: Number(b.waitlist_minutes), fee_amount: b.fee_type === "free" ? "0.00" : tl(cents(b.fee_amount)) };
    resRules.get(slug)![a.id] = r;
    return HttpResponse.json({ data: resOut(slug, a), message: `${a.name} kuralları kaydedildi.${r.enabled ? "" : " Alan rezervasyona kapalı."}` });
  }),
  http.get(`${API}/reservable-areas/:id/availability`, ({ request, params }) => {
    const slug = String(params.slug); resTick(slug);
    const date = new URL(request.url).searchParams.get("date") ?? today();
    if (!resAreas(slug).some((a) => a.id === params.id)) return err(404, "not_found", "Alan bulunamadı.");
    return HttpResponse.json(availability(slug, String(params.id), date));
  }),
  // 60 — Rezervasyon (yönetim, sakin adına)
  http.get(`${API}/reservations`, ({ request, params }) => {
    const slug = String(params.slug); resTick(slug);
    const u = new URL(request.url).searchParams;
    const date = u.get("date"), area = u.get("area_id"), status = u.get("status");
    const rows = listOf(reservations, slug).filter((r) => (!date || r.date === date) && (!area || r.area_id === area) && (!status || r.status === status)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return HttpResponse.json(rows.map(({ account: _a, ...r }) => r));
  }),
  http.post(`${API}/reservations`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as ResInput & { unit_id?: string; person_name?: string };
    if (!b.unit_id) return err(422, "validation", VALIDATION, { unit_id: "Bölüm seçin." });
    const u = await real<{ display_name: string }>(request, `/api/v1/sites/${slug}/units/${b.unit_id}`);
    if (u.status !== 200 || !u.body) return err(422, "validation", VALIDATION, { unit_id: "Bölüm bulunamadı." });
    const accs = await real<Paged<{ id: string; kind: string; reference_code: string; person_name: string | null; is_closed: boolean }>>(request, `/api/v1/sites/${slug}/accounts?unit_id=${b.unit_id}&page_size=50`);
    const open = (accs.body?.items ?? []).filter((a) => !a.is_closed);
    const acc = open.find((a) => a.kind === "tenant") ?? open.find((a) => a.kind === "owner") ?? open[0] ?? null;
    const by = (await me(request)).name;
    const person = (b.person_name ?? "").trim() || acc?.person_name || u.body.display_name;
    return createReservation(slug, b, { unit_id: b.unit_id, unit_name: u.body.display_name, person_name: person, account: acc ? { id: acc.id, kind: acc.kind, reference_code: acc.reference_code, person_name: acc.person_name } : null, channel: "staff", by });
  }),
  ...(["approve", "reject", "cancel", "check-in"] as const).map((action) => http.post(`${API}/reservations/:id/${action}`, async ({ request, params }) => {
    const slug = String(params.slug); resTick(slug);
    const r = listOf(reservations, slug).find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Rezervasyon bulunamadı.");
    const b = ((await request.json().catch(() => ({}))) ?? {}) as { reason?: string };
    const who = (await me(request)).name;
    if (action === "cancel") return cancelReservation(slug, r, b.reason?.trim() || `Yönetim (${who})`);
    if (action === "check-in") {
      if (r.status !== "approved") return err(409, "invalid_status", r.status === "checked_in" ? "Giriş zaten kaydedildi." : "Yalnız onaylı rezervasyona giriş yapılır.");
      if (r.date !== today()) return err(409, "not_today", "Rezervasyon bugün için değil.");
      Object.assign(r, { status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: who });
      return HttpResponse.json({ data: r, message: `${r.unit_name} — ${r.area_name} ${r.start} girişi kaydedildi.` });
    }
    if (r.status !== "pending") return err(409, "invalid_status", "Yalnız onay bekleyen rezervasyon karara bağlanır.");
    if (action === "reject") {
      if ((b.reason ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { reason: "Ret gerekçesi yazın." });
      Object.assign(r, { status: "rejected", reject_reason: b.reason!.trim(), decided_by: who });
      const o = rulesOf(slug, r.area_id).waitlist ? offerNext(slug, r) : null;
      return HttpResponse.json({ data: r, message: `Rezervasyon reddedildi; ücret oluşmadı.${o ? ` Bekleme listesindeki ${o.unit_name} bölümüne teklif gitti.` : ""}` });
    }
    Object.assign(r, { status: "approved", decided_by: who });
    billReservation(slug, r);
    return HttpResponse.json({ data: r, message: `Rezervasyon onaylandı.${r.charge_id ? " Ücret borca yansıdı." : ""}` });
  })),
  http.post(`${API}/reservations/check-in-code`, async ({ request, params }) => {
    const slug = String(params.slug); resTick(slug);
    const b = (await request.json()) as { code?: string };
    const code = String(b.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) return err(422, "validation", VALIDATION, { code: "6 haneli kodu girin." });
    const r = listOf(reservations, slug).find((x) => x.code === code && x.date === today() && ["approved", "checked_in"].includes(x.status));
    if (!r) return err(404, "not_found", "Bugün için bu kodla rezervasyon yok.");
    if (r.status === "checked_in") return err(409, "already", `Giriş zaten kaydedildi (${r.unit_name}, ${r.area_name} ${r.start}).`);
    Object.assign(r, { status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: (await me(request)).name });
    return HttpResponse.json({ data: r, message: `Doğrulandı: ${r.unit_name} · ${r.person_name} — ${r.area_name} ${r.start}–${r.end}, ${r.people} kişi${r.guests ? ` + ${r.guests} misafir` : ""}.` });
  }),
  http.get(`${API}/waitlist`, ({ params }) => { const slug = String(params.slug); resTick(slug); return HttpResponse.json(listOf(waitlist, slug).filter((w) => ["waiting", "offered"].includes(w.status)).map(({ account: _a, ...w }) => w)); }),
  // 61 — Kullanım raporu
  http.get(`${API}/reservations/report`, ({ request, params }) => {
    const slug = String(params.slug); resTick(slug);
    const u = new URL(request.url).searchParams;
    const to = u.get("to") ?? today(), from = u.get("from") ?? addDays(to, -29);
    const rows = resAreas(slug).map((a) => {
      const r = rulesOf(slug, a.id);
      const days = Math.max(1, Math.round((new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 864e5) + 1);
      const list = listOf(reservations, slug).filter((x) => x.area_id === a.id && x.date >= from && x.date <= to);
      const used = list.filter((x) => ["approved", "checked_in", "completed", "no_show"].includes(x.status));
      const ended = list.filter((x) => ["checked_in", "completed", "no_show"].includes(x.status));
      const ns = list.filter((x) => x.status === "no_show").length;
      return { area_id: a.id, area_name: a.name, total: list.length, cancelled: list.filter((x) => x.status === "cancelled").length, checked_in: list.filter((x) => x.status === "checked_in").length, no_show: ns, no_show_rate: r.verify === "none" || ended.length === 0 ? null : Math.round((ns / ended.length) * 100), occupancy: Math.round((used.length / (slotsOf(r).length * r.capacity * days)) * 1000) / 10, revenue: tl(list.filter((x) => x.charge_id && listOf(adHocCharges, slug).some((c) => c.id === x.charge_id && c.status !== "cancelled")).reduce((s, x) => s + cents(x.fee), 0)) };
    });
    return HttpResponse.json({ from, to, rows });
  }),
  // Sakin
  http.get(`${API}/resident/reservable-areas`, ({ params }) => { const slug = String(params.slug); return HttpResponse.json(resAreas(slug).map((a) => resOut(slug, a)).filter((a) => a.rules.enabled && a.rules.channel !== "staff")); }),
  http.get(`${API}/resident/reservable-areas/:id/availability`, async ({ request, params }) => {
    const slug = String(params.slug); resTick(slug);
    const who = await residentWho(request, slug);
    if (!who) return err(403, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const date = new URL(request.url).searchParams.get("date") ?? today();
    return HttpResponse.json({ slots: availability(slug, String(params.id), date, who.unit_id), blocked_until: blockedUntil(slug, who.unit_id, String(params.id)) });
  }),
  http.get(`${API}/resident/reservations`, async ({ request, params }) => {
    const slug = String(params.slug); resTick(slug);
    const who = await residentWho(request, slug);
    if (!who) return err(403, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    return HttpResponse.json({
      reservations: listOf(reservations, slug).filter((r) => r.unit_id === who.unit_id).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)).slice(0, 30).map((r) => ({ ...r, account: undefined, verify: rulesOf(slug, r.area_id).verify, cancel_hours: rulesOf(slug, r.area_id).cancel_hours })),
      waitlist: listOf(waitlist, slug).filter((w) => w.unit_id === who.unit_id && ["waiting", "offered"].includes(w.status)).map(({ account: _a, ...w }) => w),
    });
  }),
  http.post(`${API}/resident/reservations`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as ResInput & { unit_id?: string };
    const who = await residentWho(request, slug, b.unit_id);
    if (!who) return err(403, "forbidden", "Bu işlem için yetkiniz yok.");
    return createReservation(slug, b, who);
  }),
  http.post(`${API}/resident/reservations/:id/cancel`, async ({ request, params }) => {
    const slug = String(params.slug);
    const who = await residentWho(request, slug);
    const r = listOf(reservations, slug).find((x) => x.id === params.id && x.unit_id === who?.unit_id);
    if (!r) return err(404, "not_found", "Rezervasyon bulunamadı.");
    return cancelReservation(slug, r, "Sakin iptal etti");
  }),
  http.post(`${API}/resident/waitlist/:id/:action`, async ({ request, params }) => {
    const slug = String(params.slug); resTick(slug);
    const action = String(params.action); if (!["accept", "leave"].includes(action)) return;
    const who = await residentWho(request, slug);
    const w = listOf(waitlist, slug).find((x) => x.id === params.id && x.unit_id === who?.unit_id);
    if (!w) return err(404, "not_found", "Bekleme kaydı bulunamadı.");
    if (action === "leave") { if (!["waiting", "offered"].includes(w.status)) return err(409, "invalid_status", "Kayıt kapanmış."); const wasOffered = w.status === "offered"; w.status = "left"; if (wasOffered) offerNext(slug, w); return HttpResponse.json({ data: w, message: "Bekleme listesinden çıktınız." }); }
    if (w.status !== "offered") return err(409, w.status === "expired" ? "expired" : "invalid_status", w.status === "expired" ? "Teklifin süresi doldu; sıradaki kişiye geçti." : "Henüz teklif yok.");
    w.status = "accepted";
    const res = createReservation(slug, { area_id: w.area_id, date: w.date, start: w.start, people: w.people, guests: w.guests }, { unit_id: w.unit_id, unit_name: w.unit_name, person_name: w.person_name, account: w.account, channel: "resident", by: w.person_name });
    if (res.status >= 400) w.status = "offered";
    return res;
  }),
];

// ============================================================================================
// SATIN ALMA PAKETİ (Yazılım Dokümanı SAT-01..05 + tedarikçi kartı) — servis istekleri 62–67
// ============================================================================================
interface Vendor { id: string; name: string; tax_no: string; phone: string | null; email: string | null; iban: string | null; category: string | null; status: "active" | "passive" | "blacklist"; note: string | null; created_at: string }
interface VendorRating { vendor_id: string; score: number; source: string; at: string }
interface PurchaseSettings { thresholds: { max: string; quotes: number }[]; above_quotes: number; tolerance_percent: number; link_days: number }
interface PrItem { description: string; qty: number; unit: string; est_unit_price: string; stock_item_id: string | null }
interface PrDecision { stage: "exception" | "purchase"; decision: "approve" | "reject"; by: string; at: string; note: string | null }
interface PurchaseRequest {
  id: string; number: string; title: string; reason: string; category_id: string; category_name: string; items: PrItem[]; estimated_total: string;
  budget: { annual: string; spent: string; committed: string; remaining: string } | null; over_budget: boolean; required_quotes: number; request_number: number | null;
  status: "quoting" | "exception_pending" | "approval_pending" | "approved" | "rejected" | "ordered" | "cancelled";
  selected_quote_id: string | null; exception_reason: string | null; decisions: PrDecision[]; reject_reason: string | null;
  created_by: string; created_by_id: string; created_at: string;
}
interface PrQuote { id: string; pr_id: string; vendor_id: string; vendor_name: string; lines: { unit_price: string }[]; total: string; delivery_days: number; payment_terms: string; valid_until: string; note: string | null; file_name: string | null; source: "staff" | "vendor_link"; created_by: string; created_at: string }
interface QuoteLink { token: string; pr_id: string; vendor_id: string; vendor_name: string; site_name: string; expires_at: string; used_at: string | null; created_at: string }
interface PoLine { description: string; qty: number; unit: string; unit_price: string; total: string; stock_item_id: string | null; received: number }
interface PurchaseOrder { id: string; number: string; pr_id: string; pr_number: string; vendor_id: string; vendor_name: string; category_id: string; lines: PoLine[]; total: string; status: "sent" | "partial" | "received" | "closed"; created_by: string; created_at: string }
interface Receipt { id: string; order_id: string; lines: { qty: number }[]; note: string | null; photo: string | null; rating: number | null; by: string; at: string }
interface VendorInvoice {
  id: string; order_id: string; order_number: string; vendor_id: string; vendor_name: string; number: string; date: string; due_date: string; lines: { qty: number; unit_price: string }[];
  total: string; expected_total: string; diffs: string[]; status: "matched" | "diff_pending" | "disputed" | "paid"; decision: { by: string; at: string; note: string } | null;
  file_name: string | null; paid_on: string | null; cash_account_id: string | null; created_by: string; created_by_id: string; created_at: string;
}
const vendors = loadMap<string, Vendor[]>("vendors");
const vendorRatings = loadMap<string, VendorRating[]>("vendorRatings");
const purchaseSettings = loadMap<string, PurchaseSettings>("purchaseSettings");
const purchaseRequests = loadMap<string, PurchaseRequest[]>("purchaseRequests");
const prQuotes = loadMap<string, PrQuote[]>("prQuotes");
const quoteLinks = loadMap<string, QuoteLink[]>("quoteLinks"); // slug → linkler
const purchaseOrders = loadMap<string, PurchaseOrder[]>("purchaseOrders");
const receipts = loadMap<string, Receipt[]>("receipts");
const vendorInvoices = loadMap<string, VendorInvoice[]>("vendorInvoices");
const PS_DEFAULT: PurchaseSettings = { thresholds: [{ max: "10000.00", quotes: 1 }, { max: "100000.00", quotes: 2 }], above_quotes: 3, tolerance_percent: 1, link_days: 7 };
const psOf = (slug: string) => { if (!purchaseSettings.has(slug)) purchaseSettings.set(slug, structuredClone(PS_DEFAULT)); return purchaseSettings.get(slug)!; };
const requiredQuotes = (slug: string, totalCents: number) => { const s = psOf(slug); for (const t of [...s.thresholds].sort((a, b) => cents(a.max) - cents(b.max))) if (totalCents < cents(t.max)) return t.quotes; return s.above_quotes; };
const ratingOf = (slug: string, vendorId: string) => { const r = listOf(vendorRatings, slug).filter((x) => x.vendor_id === vendorId); return { rating_avg: r.length ? Math.round((r.reduce((s, x) => s + x.score, 0) / r.length) * 10) / 10 : null, rating_count: r.length }; };
const maskIban = (i: string | null) => (i ? `${i.slice(0, 4)} •••• •••• ${i.slice(-4)}` : null);
const vendorOut = (slug: string, v: Vendor) => ({ ...v, iban: undefined, iban_masked: maskIban(v.iban), ...ratingOf(slug, v.id), order_count: listOf(purchaseOrders, slug).filter((o) => o.vendor_id === v.id).length });
const seqNo = (prefix: string, n: number) => `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
const lineTotal = (qty: number, price: string) => Math.round(qty * cents(price));
const TAX_RE = /^\d{10,11}$/;
const IBAN_RE = /^TR\d{24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kategorinin yıllık bütçesi, bu yıl gerçekleşen gider ve açık taahhüt (onaylı talep + faturası kesilmemiş sipariş). */
async function budgetOf(request: Request, slug: string, categoryId: string, excludePr?: string) {
  const plan = await real<{ items?: { expense_category_id: string | null; annual_amount: string }[] }>(request, `/api/v1/sites/${slug}/budget-plans/current`);
  const annual = (plan.body?.items ?? []).filter((i) => i.expense_category_id === categoryId).reduce((s, i) => s + cents(i.annual_amount), 0);
  const ex = await real<Paged<{ amount: string; is_reversed: boolean; is_reversal: boolean }>>(request, `/api/v1/sites/${slug}/expenses?year=${new Date().getFullYear()}&category_id=${categoryId}&paid=all&page_size=200`);
  const spent = (ex.body?.items ?? []).filter((e) => !e.is_reversed && !e.is_reversal).reduce((s, e) => s + cents(e.amount), 0);
  const prs = listOf(purchaseRequests, slug).filter((p) => p.category_id === categoryId && p.id !== excludePr && ["approval_pending", "approved", "exception_pending"].includes(p.status));
  const ords = listOf(purchaseOrders, slug).filter((o) => o.category_id === categoryId && o.status !== "closed");
  const committed = prs.reduce((s, p) => s + cents(p.estimated_total), 0) + ords.reduce((s, o) => s + cents(o.total), 0);
  return { has_budget: plan.status === 200 && annual > 0, annual: tl(annual), spent: tl(spent), committed: tl(committed), remaining: tl(annual - spent - committed) };
}
const prOut = (slug: string, p: PurchaseRequest) => {
  const quotes = listOf(prQuotes, slug).filter((q) => q.pr_id === p.id).map((q) => ({ ...q, ...ratingOf(slug, q.vendor_id) }));
  const links = listOf(quoteLinks, slug).filter((l) => l.pr_id === p.id).map((l) => ({ token: l.token, vendor_name: l.vendor_name, expires_at: l.expires_at, used_at: l.used_at, state: l.used_at ? "used" : l.expires_at < new Date().toISOString() ? "expired" : "open" }));
  const order = listOf(purchaseOrders, slug).find((o) => o.pr_id === p.id) ?? null;
  return { ...p, quotes, links, order_id: order?.id ?? null, order_number: order?.number ?? null };
};
function decideOk(p: PurchaseRequest, meId: string) { return p.created_by_id !== meId; }

const satinalma: RequestHandler[] = [
  // 62 — Tedarikçi kartı
  http.get(`${API}/vendors`, ({ request, params }) => {
    const slug = String(params.slug); const u = new URL(request.url).searchParams;
    const q = (u.get("q") ?? "").toLocaleLowerCase("tr-TR"), st = u.get("status");
    return HttpResponse.json(listOf(vendors, slug).filter((v) => (!q || v.name.toLocaleLowerCase("tr-TR").includes(q) || v.tax_no.includes(q)) && (!st || v.status === st)).sort((a, b) => a.name.localeCompare(b.name, "tr")).map((v) => vendorOut(slug, v)));
  }),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? `${API}/vendors` : `${API}/vendors/:id`, async ({ request, params }) => {
    const slug = String(params.slug); const list = listOf(vendors, slug);
    const cur = verb === "patch" ? list.find((v) => v.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Tedarikçi bulunamadı.");
    const raw = (await request.json()) as Partial<Vendor>;
    const b = { ...(cur ?? {}), ...raw, iban: raw.iban === undefined ? cur?.iban ?? null : raw.iban };
    const f: Record<string, string> = {};
    const name = (b.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) f.name = "Unvan yazın (2–120 karakter).";
    const tax = (b.tax_no ?? "").replace(/\D/g, "");
    if (!TAX_RE.test(tax)) f.tax_no = "Vergi no 10, T.C. kimlik no 11 hane olmalı.";
    else if (list.some((v) => v.id !== cur?.id && v.tax_no === tax)) f.tax_no = "Bu vergi numarasıyla tedarikçi var.";
    const iban = (b.iban ?? "").replace(/\s/g, "").toUpperCase();
    if (iban && !IBAN_RE.test(iban)) f.iban = "IBAN TR ile başlayan 26 karakter olmalı.";
    const email = (b.email ?? "").trim().toLowerCase();
    if (email && (!EMAIL_RE.test(email) || email.length > 254)) f.email = "Geçerli bir e-posta yazın.";
    const phone = b.phone ? normPhone(b.phone) : "";
    if (phone && !/^\d{10}$/.test(phone)) f.phone = "Telefon 10 hane olmalı.";
    if (b.status && !["active", "passive", "blacklist"].includes(b.status)) f.status = "Durum seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const v: Vendor = { id: cur?.id ?? crypto.randomUUID(), name, tax_no: tax, phone: phone || null, email: email || null, iban: iban || null, category: b.category?.trim() || null, status: b.status ?? "active", note: b.note?.trim() || null, created_at: cur?.created_at ?? new Date().toISOString() };
    if (cur) Object.assign(cur, v); else list.push(v);
    return HttpResponse.json({ data: vendorOut(slug, v), message: verb === "post" ? `${v.name} eklendi.` : `${v.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
  })),

  // 63 — Ayarlar ve bütçe
  http.get(`${API}/purchase-settings`, ({ params }) => HttpResponse.json(psOf(String(params.slug)))),
  http.put(`${API}/purchase-settings`, async ({ request, params }) => {
    const slug = String(params.slug); const b = (await request.json()) as Partial<PurchaseSettings>;
    const f: Record<string, string> = {};
    const th = (b.thresholds ?? []).map((t) => ({ max: tl(cents(t.max)), quotes: Number(t.quotes) }));
    if (th.length === 0 || th.some((t) => !(cents(t.max) > 0) || !(t.quotes >= 1 && t.quotes <= 10))) f.thresholds = "Her eşik için tutar > 0 ve teklif sayısı 1–10.";
    else if (th.some((t, i) => i > 0 && cents(t.max) <= cents(th[i - 1]!.max))) f.thresholds = "Eşikler küçükten büyüğe sıralanmalı.";
    if (!(Number(b.above_quotes) >= 1 && Number(b.above_quotes) <= 10)) f.above_quotes = "1–10.";
    if (!(Number(b.tolerance_percent) >= 0 && Number(b.tolerance_percent) <= 10)) f.tolerance_percent = "%0–10.";
    if (!(Number(b.link_days) >= 1 && Number(b.link_days) <= 30)) f.link_days = "1–30 gün.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const s: PurchaseSettings = { thresholds: th, above_quotes: Number(b.above_quotes), tolerance_percent: Number(b.tolerance_percent), link_days: Number(b.link_days) };
    purchaseSettings.set(slug, s);
    return HttpResponse.json({ data: s, message: "Satın alma ayarları kaydedildi." });
  }),
  http.get(`${API}/purchase-budget`, async ({ request, params }) => {
    const c = new URL(request.url).searchParams.get("category_id");
    if (!c) return err(422, "validation", VALIDATION, { category_id: "Kategori seçin." });
    return HttpResponse.json(await budgetOf(request, String(params.slug), c));
  }),

  // 64 — Satın alma talebi, teklif, onay
  http.get(`${API}/purchase-requests`, ({ request, params }) => {
    const slug = String(params.slug); const st = new URL(request.url).searchParams.get("status");
    return HttpResponse.json([...listOf(purchaseRequests, slug)].filter((p) => !st || p.status === st).reverse().map((p) => ({ ...prOut(slug, p), quote_count: listOf(prQuotes, slug).filter((q) => q.pr_id === p.id).length })));
  }),
  http.get(`${API}/purchase-requests/:id`, ({ params }) => {
    const slug = String(params.slug); const p = listOf(purchaseRequests, slug).find((x) => x.id === params.id);
    return p ? HttpResponse.json(prOut(slug, p)) : err(404, "not_found", "Satın alma talebi bulunamadı.");
  }),
  http.post(`${API}/purchase-requests`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { title?: string; reason?: string; category_id?: string; items?: Partial<PrItem>[]; request_number?: number | null };
    const f: Record<string, string> = {};
    if ((b.title ?? "").trim().length < 3) f.title = "Konu yazın.";
    if ((b.reason ?? "").trim().length < 5) f.reason = "Gerekçe yazın.";
    const cats = (await real<{ id: string; name: string }[]>(request, `/api/v1/sites/${slug}/expense-categories`)).body ?? [];
    const cat = cats.find((c) => c.id === b.category_id);
    if (!cat) f.category_id = "Gider kategorisi seçin.";
    const items = (b.items ?? []).filter((i) => (i.description ?? "").trim());
    if (items.length === 0) f.items = "En az bir kalem ekleyin.";
    items.forEach((i, k) => { if (!(Number(i.qty) > 0)) f[`items.${k}.qty`] = "Miktar > 0."; if (!(cents(i.est_unit_price) > 0)) f[`items.${k}.est_unit_price`] = "Tahmini birim fiyat > 0."; });
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const its: PrItem[] = items.map((i) => ({ description: i.description!.trim(), qty: Number(i.qty), unit: (i.unit ?? "adet").trim() || "adet", est_unit_price: tl(cents(i.est_unit_price)), stock_item_id: i.stock_item_id || null }));
    const total = its.reduce((s, i) => s + lineTotal(i.qty, i.est_unit_price), 0);
    const bud = await budgetOf(request, slug, cat!.id);
    const who = await me(request);
    const list = listOf(purchaseRequests, slug);
    const p: PurchaseRequest = { id: crypto.randomUUID(), number: seqNo("ST", list.length + 1), title: b.title!.trim(), reason: b.reason!.trim(), category_id: cat!.id, category_name: cat!.name, items: its, estimated_total: tl(total), budget: bud.has_budget ? { annual: bud.annual, spent: bud.spent, committed: bud.committed, remaining: bud.remaining } : null, over_budget: bud.has_budget && total > cents(bud.remaining), required_quotes: requiredQuotes(slug, total), request_number: b.request_number ?? null, status: "quoting", selected_quote_id: null, exception_reason: null, decisions: [], reject_reason: null, created_by: who.name, created_by_id: who.id, created_at: new Date().toISOString() };
    list.push(p);
    return HttpResponse.json({ data: prOut(slug, p), message: `${p.number} açıldı; ${p.required_quotes} teklif gerekiyor.${p.over_budget ? " Bütçe aşımı işaretlendi." : ""}` }, { status: 201 });
  }),
  http.post(`${API}/purchase-requests/:id/quotes`, async ({ request, params }) => {
    const slug = String(params.slug); const p = listOf(purchaseRequests, slug).find((x) => x.id === params.id);
    if (!p) return err(404, "not_found", "Satın alma talebi bulunamadı.");
    if (p.status !== "quoting") return err(409, "invalid_status", "Teklif yalnız teklif aşamasında eklenir.");
    const b = (await request.json()) as { vendor_id?: string; lines?: { unit_price: string }[]; delivery_days?: number; payment_terms?: string; valid_until?: string; note?: string; file_name?: string };
    const v = listOf(vendors, slug).find((x) => x.id === b.vendor_id);
    const f = quoteFields(p, b);
    if (!v) f.vendor_id = "Tedarikçi seçin."; else if (v.status !== "active") f.vendor_id = "Tedarikçi aktif değil.";
    else if (listOf(prQuotes, slug).some((q) => q.pr_id === p.id && q.vendor_id === v.id)) f.vendor_id = "Bu tedarikçinin teklifi var.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const q = makeQuote(p, v!, b, "staff", (await me(request)).name);
    listOf(prQuotes, slug).push(q);
    return HttpResponse.json({ data: q, message: `${v!.name} teklifi eklendi (${quoteCount(slug, p)}/${p.required_quotes}).` }, { status: 201 });
  }),
  http.post(`${API}/purchase-requests/:id/quote-links`, async ({ request, params }) => {
    const slug = String(params.slug); const p = listOf(purchaseRequests, slug).find((x) => x.id === params.id);
    if (!p) return err(404, "not_found", "Satın alma talebi bulunamadı.");
    if (p.status !== "quoting") return err(409, "invalid_status", "Link yalnız teklif aşamasında gönderilir.");
    const b = (await request.json()) as { vendor_id?: string };
    const v = listOf(vendors, slug).find((x) => x.id === b.vendor_id);
    if (!v) return err(422, "validation", VALIDATION, { vendor_id: "Tedarikçi seçin." });
    if (v.status !== "active") return err(422, "validation", VALIDATION, { vendor_id: "Tedarikçi aktif değil." });
    const now = new Date().toISOString();
    if (listOf(quoteLinks, slug).some((l) => l.pr_id === p.id && l.vendor_id === v.id && !l.used_at && l.expires_at > now)) return err(409, "link_open", "Bu tedarikçiye gönderilmiş açık link var.");
    if (listOf(prQuotes, slug).some((q) => q.pr_id === p.id && q.vendor_id === v.id)) return err(409, "quoted", "Bu tedarikçinin teklifi zaten var.");
    const site = await real<{ name: string }>(request, `/api/v1/sites/${slug}`);
    const l: QuoteLink = { token: crypto.randomUUID().replace(/-/g, ""), pr_id: p.id, vendor_id: v.id, vendor_name: v.name, site_name: site.body?.name ?? slug, expires_at: new Date(Date.now() + psOf(slug).link_days * 864e5).toISOString(), used_at: null, created_at: now };
    listOf(quoteLinks, slug).push(l);
    return HttpResponse.json({ data: { token: l.token, expires_at: l.expires_at, vendor_name: v.name }, message: `${v.name} için teklif linki hazır; ${psOf(slug).link_days} gün geçerli, tek kullanımlık.${v.email ? ` ${v.email} adresine e-posta (K5).` : ""}` }, { status: 201 });
  }),
  http.post(`${API}/purchase-requests/:id/select-quote`, async ({ request, params }) => {
    const slug = String(params.slug); const p = listOf(purchaseRequests, slug).find((x) => x.id === params.id);
    if (!p) return err(404, "not_found", "Satın alma talebi bulunamadı.");
    if (p.status !== "quoting") return err(409, "invalid_status", "Teklif yalnız teklif aşamasında seçilir.");
    const b = (await request.json()) as { quote_id?: string; exception_reason?: string };
    const q = listOf(prQuotes, slug).find((x) => x.id === b.quote_id && x.pr_id === p.id);
    if (!q) return err(422, "validation", VALIDATION, { quote_id: "Teklif seçin." });
    const n = quoteCount(slug, p);
    if (n < p.required_quotes) {
      if ((b.exception_reason ?? "").trim().length < 10) return err(422, "quote_exception", `${p.required_quotes} teklif gerekiyor, ${n} var. Eksik teklif için gerekçe yazın (teklif istisnası onaya düşer).`, { exception_reason: "Eksik teklif gerekçesi (en az 10 karakter)." });
      Object.assign(p, { selected_quote_id: q.id, exception_reason: b.exception_reason!.trim(), status: "exception_pending" });
      return HttpResponse.json({ data: prOut(slug, p), message: "Teklif istisnası onaya gönderildi." });
    }
    Object.assign(p, { selected_quote_id: q.id, status: "approval_pending" });
    return HttpResponse.json({ data: prOut(slug, p), message: `${q.vendor_name} teklifi seçildi; satın alma onayı bekleniyor.` });
  }),
  http.post(`${API}/purchase-requests/:id/decide`, async ({ request, params }) => {
    const slug = String(params.slug); const p = listOf(purchaseRequests, slug).find((x) => x.id === params.id);
    if (!p) return err(404, "not_found", "Satın alma talebi bulunamadı.");
    if (!["exception_pending", "approval_pending"].includes(p.status)) return err(409, "invalid_status", "Onay bekleyen bir adım yok.");
    const who = await me(request);
    if (!decideOk(p, who.id)) return err(403, "self_approval", "Kendi talebinizi onaylayamazsınız.");
    const b = (await request.json()) as { decision?: "approve" | "reject"; note?: string };
    if (b.decision !== "approve" && b.decision !== "reject") return err(422, "validation", VALIDATION, { decision: "Karar seçin." });
    if (b.decision === "reject" && (b.note ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { note: "Ret gerekçesi yazın." });
    const stage = p.status === "exception_pending" ? "exception" : "purchase";
    p.decisions.push({ stage, decision: b.decision, by: who.name, at: new Date().toISOString(), note: b.note?.trim() || null });
    if (stage === "exception") {
      if (b.decision === "approve") { p.status = "approval_pending"; return HttpResponse.json({ data: prOut(slug, p), message: "Teklif istisnası onaylandı; satın alma onayına geçti." }); }
      Object.assign(p, { status: "quoting", selected_quote_id: null }); return HttpResponse.json({ data: prOut(slug, p), message: "Teklif istisnası reddedildi; teklif toplamaya devam." });
    }
    if (b.decision === "approve") { p.status = "approved"; return HttpResponse.json({ data: prOut(slug, p), message: "Satın alma onaylandı; sipariş oluşturulabilir." }); }
    Object.assign(p, { status: "rejected", reject_reason: b.note!.trim() });
    return HttpResponse.json({ data: prOut(slug, p), message: "Talep reddedildi; talep edene gerekçe gider." });
  }),
  http.post(`${API}/purchase-requests/:id/cancel`, async ({ params }) => {
    const slug = String(params.slug); const p = listOf(purchaseRequests, slug).find((x) => x.id === params.id);
    if (!p) return err(404, "not_found", "Satın alma talebi bulunamadı.");
    if (["ordered", "rejected", "cancelled"].includes(p.status)) return err(409, "invalid_status", "Bu talep iptal edilemez.");
    p.status = "cancelled";
    for (const l of listOf(quoteLinks, slug)) if (l.pr_id === p.id && !l.used_at) l.expires_at = new Date().toISOString();
    return HttpResponse.json({ data: prOut(slug, p), message: "Talep iptal edildi; açık teklif linkleri kapatıldı." });
  }),
  // Tedarikçi linki (oturumsuz)
  http.get("/api/v1/public/quote-links/:token", ({ params }) => {
    const found = findLink(String(params.token));
    if (!found) return err(404, "not_found", "Bağlantı bulunamadı.");
    const { slug, l } = found;
    if (l.used_at || l.expires_at < new Date().toISOString()) return err(410, "link_closed", "Bu bağlantının süresi doldu veya kullanıldı.");
    const p = listOf(purchaseRequests, slug).find((x) => x.id === l.pr_id)!;
    if (p.status !== "quoting") return err(410, "link_closed", "Bu bağlantının süresi doldu veya kullanıldı.");
    return HttpResponse.json({ site_name: l.site_name, vendor_name: l.vendor_name, number: p.number, title: p.title, items: p.items.map((i) => ({ description: i.description, qty: i.qty, unit: i.unit })), expires_at: l.expires_at });
  }),
  http.post("/api/v1/public/quote-links/:token", async ({ request, params }) => {
    const found = findLink(String(params.token));
    if (!found) return err(404, "not_found", "Bağlantı bulunamadı.");
    const { slug, l } = found;
    const p = listOf(purchaseRequests, slug).find((x) => x.id === l.pr_id)!;
    if (l.used_at || l.expires_at < new Date().toISOString() || p.status !== "quoting") return err(410, "link_closed", "Bu bağlantının süresi doldu veya kullanıldı.");
    const b = (await request.json()) as { lines?: { unit_price: string }[]; delivery_days?: number; payment_terms?: string; valid_until?: string; note?: string; file_name?: string; terms_ack?: boolean };
    const f = quoteFields(p, b);
    if (!b.terms_ack) f.terms_ack = "Kullanım koşullarını onaylayın.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const v = listOf(vendors, slug).find((x) => x.id === l.vendor_id)!;
    const q = makeQuote(p, v, b, "vendor_link", v.name);
    listOf(prQuotes, slug).push(q);
    l.used_at = new Date().toISOString();
    return HttpResponse.json({ data: { total: q.total }, message: "Teklifiniz iletildi. Teşekkür ederiz; bu bağlantı artık kapandı." }, { status: 201 });
  }),

  // 65 — Sipariş ve mal/hizmet kabul
  http.get(`${API}/purchase-orders`, ({ params }) => { const slug = String(params.slug); return HttpResponse.json([...listOf(purchaseOrders, slug)].reverse().map((o) => orderOut(slug, o))); }),
  http.get(`${API}/purchase-orders/:id`, ({ params }) => { const slug = String(params.slug); const o = listOf(purchaseOrders, slug).find((x) => x.id === params.id); return o ? HttpResponse.json(orderOut(slug, o)) : err(404, "not_found", "Sipariş bulunamadı."); }),
  http.post(`${API}/purchase-orders`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { pr_id?: string };
    const p = listOf(purchaseRequests, slug).find((x) => x.id === b.pr_id);
    if (!p) return err(404, "not_found", "Satın alma talebi bulunamadı.");
    if (p.status !== "approved") return err(409, "not_approved", "Onaysız sipariş verilemez.");
    const q = listOf(prQuotes, slug).find((x) => x.id === p.selected_quote_id)!;
    const v = listOf(vendors, slug).find((x) => x.id === q.vendor_id);
    if (!v || v.status !== "active") return err(409, "vendor_inactive", "Tedarikçi aktif değil; sipariş verilemez.");
    const lines: PoLine[] = p.items.map((i, k) => ({ description: i.description, qty: i.qty, unit: i.unit, unit_price: q.lines[k]!.unit_price, total: tl(lineTotal(i.qty, q.lines[k]!.unit_price)), stock_item_id: i.stock_item_id, received: 0 }));
    const list = listOf(purchaseOrders, slug);
    const o: PurchaseOrder = { id: crypto.randomUUID(), number: seqNo("SIP", list.length + 1), pr_id: p.id, pr_number: p.number, vendor_id: v.id, vendor_name: v.name, category_id: p.category_id, lines, total: q.total, status: "sent", created_by: (await me(request)).name, created_at: new Date().toISOString() };
    list.push(o); p.status = "ordered";
    return HttpResponse.json({ data: orderOut(slug, o), message: `${o.number} oluşturuldu ve ${v.name} tedarikçisine iletildi${v.email ? ` (${v.email}, K5)` : ""}.` }, { status: 201 });
  }),
  http.post(`${API}/purchase-orders/:id/receipts`, async ({ request, params }) => {
    const slug = String(params.slug); const o = listOf(purchaseOrders, slug).find((x) => x.id === params.id);
    if (!o) return err(404, "not_found", "Sipariş bulunamadı.");
    if (o.status === "received" || o.status === "closed") return err(409, "invalid_status", "Siparişin tamamı teslim alınmış.");
    const b = (await request.json()) as { lines?: { qty: number }[]; note?: string; photo?: string | null; rating?: number | null };
    const f: Record<string, string> = {};
    const ls = o.lines.map((_, k) => Number(b.lines?.[k]?.qty ?? 0));
    if (ls.every((q) => q === 0)) f.lines = "Teslim alınan miktarı girin.";
    ls.forEach((q, k) => { if (!(q >= 0)) f[`lines.${k}`] = "Geçersiz miktar."; else if (q > o.lines[k]!.qty - o.lines[k]!.received) f[`lines.${k}`] = `Kalan ${o.lines[k]!.qty - o.lines[k]!.received}; fazla teslim not olarak yazılır.`; });
    if (b.rating != null && !(Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5)) f.rating = "1–5 puan.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const who = (await me(request)).name;
    let stockNote = 0;
    for (const [k, q] of ls.entries()) {
      if (q <= 0) continue;
      const line = o.lines[k]!; line.received += q;
      if (line.stock_item_id) { const r = await real(request, `/api/v1/sites/${slug}/stock-items/${line.stock_item_id}/moves`, { method: "POST", body: { direction: "in", quantity: String(q), note: `${o.number} kabulü` } }); if (r.status < 300) stockNote++; }
    }
    o.status = o.lines.every((l) => l.received >= l.qty) ? "received" : "partial";
    const r: Receipt = { id: crypto.randomUUID(), order_id: o.id, lines: ls.map((qty) => ({ qty })), note: b.note?.trim() || null, photo: b.photo ?? null, rating: b.rating ?? null, by: who, at: new Date().toISOString() };
    listOf(receipts, slug).push(r);
    if (b.rating) listOf(vendorRatings, slug).push({ vendor_id: o.vendor_id, score: b.rating, source: o.number, at: r.at });
    return HttpResponse.json({ data: orderOut(slug, o), message: `${o.status === "received" ? "Tamamı" : "Kısmi"} kabul kaydedildi.${stockNote ? ` ${stockNote} kalem stoğa girdi.` : ""}` }, { status: 201 });
  }),

  // 66 — Tedarikçi faturası ve üçlü eşleşme
  http.get(`${API}/vendor-invoices`, ({ request, params }) => { const slug = String(params.slug); const st = new URL(request.url).searchParams.get("status"); return HttpResponse.json([...listOf(vendorInvoices, slug)].filter((i) => !st || i.status === st).reverse()); }),
  http.post(`${API}/vendor-invoices`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { order_id?: string; number?: string; date?: string; due_date?: string; lines?: { qty: number; unit_price: string }[]; file_name?: string };
    const o = listOf(purchaseOrders, slug).find((x) => x.id === b.order_id);
    if (!o) return err(422, "validation", VALIDATION, { order_id: "Sipariş seçin." });
    const f: Record<string, string> = {};
    const number = (b.number ?? "").trim().toUpperCase();
    if (number.length < 3) f.number = "Fatura no yazın.";
    else if (listOf(vendorInvoices, slug).some((i) => i.vendor_id === o.vendor_id && i.number === number)) f.number = "Bu tedarikçinin bu numaralı faturası kayıtlı.";
    if (!b.date || !DATE_RE.test(b.date) || b.date > today()) f.date = "Fatura tarihi bugünden ileri olamaz.";
    if (!b.due_date || !DATE_RE.test(b.due_date) || (b.date && b.due_date < b.date)) f.due_date = "Vade fatura tarihinden önce olamaz.";
    const lines = o.lines.map((_, k) => ({ qty: Number(b.lines?.[k]?.qty ?? 0), unit_price: tl(cents(b.lines?.[k]?.unit_price ?? 0)) }));
    if (lines.every((l) => l.qty === 0)) f.lines = "Fatura kalemlerini girin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    if (o.lines.every((l) => l.received === 0)) return err(409, "no_receipt", "Teslim alınmamış sipariş için fatura eşleştirilemez; önce mal/hizmet kabulünü girin.");
    const tol = psOf(slug).tolerance_percent;
    const diffs: string[] = [];
    o.lines.forEach((l, k) => {
      const inv = lines[k]!;
      if (inv.qty !== l.received) diffs.push(`${l.description}: faturada ${inv.qty}, teslim alınan ${l.received} ${l.unit}`);
      if (cents(inv.unit_price) !== cents(l.unit_price)) diffs.push(`${l.description}: birim fiyat ${Number(inv.unit_price).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺, siparişte ${Number(l.unit_price).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`);
    });
    const total = lines.reduce((s, l) => s + lineTotal(l.qty, l.unit_price), 0);
    const expected = o.lines.reduce((s, l) => s + lineTotal(l.received, l.unit_price), 0);
    const tolOk = Math.abs(total - expected) <= Math.round(expected * tol / 100);
    if (!tolOk) diffs.push(`Toplam ${(total / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺, beklenen ${(expected / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ (tolerans %${tol})`);
    const qtyDiff = diffs.some((d) => d.includes("teslim alınan"));
    const ok = !qtyDiff && tolOk;
    const who = await me(request);
    const inv: VendorInvoice = { id: crypto.randomUUID(), order_id: o.id, order_number: o.number, vendor_id: o.vendor_id, vendor_name: o.vendor_name, number, date: b.date!, due_date: b.due_date!, lines, total: tl(total), expected_total: tl(expected), diffs: ok ? diffs.filter((d) => !d.includes("birim fiyat")) : diffs, status: ok ? "matched" : "diff_pending", decision: null, file_name: b.file_name || null, paid_on: null, cash_account_id: null, created_by: who.name, created_by_id: who.id, created_at: new Date().toISOString() };
    listOf(vendorInvoices, slug).push(inv);
    if (ok && o.status === "received") o.status = "closed";
    return HttpResponse.json({ data: inv, message: ok ? `Fatura eşleşti; ödenecekler listesine ${inv.due_date.split("-").reverse().join(".")} vadesiyle girdi.` : "Fatura sipariş/kabulle eşleşmedi; fark onaya düştü, ödenecekler listesine giremez." }, { status: 201 });
  }),
  http.post(`${API}/vendor-invoices/:id/decide`, async ({ request, params }) => {
    const slug = String(params.slug); const inv = listOf(vendorInvoices, slug).find((x) => x.id === params.id);
    if (!inv) return err(404, "not_found", "Fatura bulunamadı.");
    if (inv.status !== "diff_pending") return err(409, "invalid_status", "Onay bekleyen fark yok.");
    const who = await me(request);
    if (inv.created_by_id === who.id) return err(403, "self_approval", "Faturayı giren kişi farkı onaylayamaz.");
    const b = (await request.json()) as { decision?: string; note?: string };
    if ((b.note ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { note: "Gerekçe zorunlu." });
    inv.decision = { by: who.name, at: new Date().toISOString(), note: b.note!.trim() };
    if (b.decision === "approve") {
      inv.status = "matched";
      const o = listOf(purchaseOrders, slug).find((x) => x.id === inv.order_id);
      if (o && o.status === "received") o.status = "closed";
      return HttpResponse.json({ data: inv, message: "Fark onaylandı; fatura ödenecekler listesine girdi." });
    }
    inv.status = "disputed";
    return HttpResponse.json({ data: inv, message: "Faturaya itiraz edildi; tedarikçiye bildirim taslağı hazırlanır (K5)." });
  }),

  // 67 — Ödenecekler
  http.get(`${API}/payables`, async ({ request, params }) => {
    const slug = String(params.slug);
    const inv = listOf(vendorInvoices, slug).filter((i) => i.status === "matched").sort((a, b) => a.due_date.localeCompare(b.due_date));
    const ex = await real<Paged<{ id: string; description: string; amount: string; date: string; vendor: string | null; is_paid: boolean; is_reversed: boolean; is_reversal: boolean }>>(request, `/api/v1/sites/${slug}/expenses?paid=unpaid&page_size=200`);
    const direct = (ex.body?.items ?? []).filter((e) => !e.is_paid && !e.is_reversed && !e.is_reversal);
    return HttpResponse.json({ invoices: inv.map((i) => ({ ...i, overdue: i.due_date < today() })), direct_expenses: { count: direct.length, total: tl(direct.reduce((s, e) => s + cents(e.amount), 0)) }, total: tl(inv.reduce((s, i) => s + cents(i.total), 0)) });
  }),
  http.post(`${API}/vendor-invoices/:id/mark-paid`, async ({ request, params }) => {
    const slug = String(params.slug); const inv = listOf(vendorInvoices, slug).find((x) => x.id === params.id);
    if (!inv) return err(404, "not_found", "Fatura bulunamadı.");
    if (inv.status !== "matched") return err(409, "not_matched", inv.status === "paid" ? "Fatura zaten ödendi." : "Eşleşmeyen fatura ödenemez.");
    const b = (await request.json()) as { paid_on?: string; cash_account_id?: string };
    const f: Record<string, string> = {};
    if (!b.paid_on || !DATE_RE.test(b.paid_on) || b.paid_on > today()) f.paid_on = "Ödeme tarihi bugünden ileri olamaz.";
    if (!b.cash_account_id) f.cash_account_id = "Ödemenin yapıldığı hesabı seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    Object.assign(inv, { status: "paid", paid_on: b.paid_on, cash_account_id: b.cash_account_id });
    return HttpResponse.json({ data: inv, message: `${inv.vendor_name} ${inv.number} ödendi olarak işaretlendi; gider ve muhasebe fişi aktarım kuyruğuna girer.` });
  }),
];
function quoteFields(p: PurchaseRequest, b: { lines?: { unit_price: string }[]; delivery_days?: number; payment_terms?: string; valid_until?: string }) {
  const f: Record<string, string> = {};
  if (!b.lines || b.lines.length !== p.items.length) f.lines = "Her kalem için birim fiyat girin.";
  else b.lines.forEach((l, k) => { if (!(cents(l.unit_price) > 0)) f[`lines.${k}`] = "Birim fiyat > 0."; });
  if (!(Number.isInteger(Number(b.delivery_days)) && Number(b.delivery_days) >= 0 && Number(b.delivery_days) <= 365)) f.delivery_days = "Teslim süresi 0–365 gün.";
  if ((b.payment_terms ?? "").trim().length < 2) f.payment_terms = "Ödeme koşulunu yazın (ör. 30 gün vadeli).";
  if (!b.valid_until || !DATE_RE.test(b.valid_until) || b.valid_until < today()) f.valid_until = "Geçerlilik bugünden önce olamaz.";
  return f;
}
function makeQuote(p: PurchaseRequest, v: Vendor, b: { lines?: { unit_price: string }[]; delivery_days?: number; payment_terms?: string; valid_until?: string; note?: string; file_name?: string }, source: PrQuote["source"], by: string): PrQuote {
  const lines = b.lines!.map((l) => ({ unit_price: tl(cents(l.unit_price)) }));
  const total = p.items.reduce((s, it, k) => s + lineTotal(it.qty, lines[k]!.unit_price), 0);
  return { id: crypto.randomUUID(), pr_id: p.id, vendor_id: v.id, vendor_name: v.name, lines, total: tl(total), delivery_days: Number(b.delivery_days), payment_terms: b.payment_terms!.trim(), valid_until: b.valid_until!, note: b.note?.trim() || null, file_name: b.file_name || null, source, created_by: by, created_at: new Date().toISOString() };
}
const quoteCount = (slug: string, p: PurchaseRequest) => listOf(prQuotes, slug).filter((q) => q.pr_id === p.id).length;
function findLink(token: string) { for (const [slug, list] of quoteLinks) { const l = list.find((x) => x.token === token); if (l) return { slug, l }; } return null; }
const orderOut = (slug: string, o: PurchaseOrder) => ({ ...o, receipts: listOf(receipts, slug).filter((r) => r.order_id === o.id), invoices: listOf(vendorInvoices, slug).filter((i) => i.order_id === o.id) });

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
    const l = listOf(inspections, slug).filter((x) => inMonth(x.at, period));
    return l.length ? { actual: Math.round(l.reduce((s, x) => s + x.score, 0) / l.length), detail: `${l.length} denetim ortalaması` } : { actual: null, detail: "Bu ay denetim yok" };
  }
  if (k.source === "patrol") {
    const l = listOf(patrolRuns, slug).filter((x) => inMonth(x.started_at, period)).map((r) => patrolReport(slug, r));
    const tot = l.reduce((s, r) => s + r.total_points, 0), ok = l.reduce((s, r) => s + r.scanned_points, 0);
    return tot ? { actual: Math.round((ok / tot) * 100), detail: `${l.length} tur, ${ok}/${tot} nokta` } : { actual: null, detail: "Bu ay devriye yok" };
  }
  if (k.source === "tasks") {
    const days = daysOfMonth(period).filter((d) => d < today());
    let exp = 0, done = 0;
    for (const d of days) for (const t of tasksForDate(slug, d)) { exp++; if (listOf(taskDone, slug).some((x) => x.template_id === t.id && x.date === d && x.status === "done")) done++; }
    return exp ? { actual: Math.round((done / exp) * 100), detail: `${done}/${exp} görev` } : { actual: null, detail: "Bu ay görev yok" };
  }
  if (k.source === "sla") {
    const rows = await allPages<ReqRow>(request, `/api/v1/sites/${slug}/requests`);
    const l = rows.filter((r) => inMonth(r.created_at, period) && (!k.request_category || r.category === k.request_category) && ["resolved", "closed"].includes(r.status));
    const met = l.filter((r) => slaOf(slug, r).state === "met").length;
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
    const v = ext.vendor_id ? listOf(vendors, slug).find((x) => x.id === ext.vendor_id) : null;
    const cards = listOf(scorecards, slug).filter((s) => s.contract_id === c.id).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12);
    return HttpResponse.json({ ...ext, vendor: v ? { id: v.id, name: v.name, ...ratingOf(slug, v.id) } : null, monthly_amount: monthlyOf(c) != null ? tl(monthlyOf(c)!) : null, escalation_preview: escalationPreview(c, ext), last_scorecards: cards.map((s) => ({ period: s.period, total: s.total, status: s.status, penalty: s.penalty?.status === "approved" ? s.penalty.amount : null })) });
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
    if (vendorId && !listOf(vendors, slug).some((v) => v.id === vendorId)) f.vendor_id = "Tedarikçi bulunamadı."; if (!vendorId) vendorId = null;
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

// ============================================================================================
// İLETİŞİM VE ACİL DURUM (Yazılım Dokümanı ILT-01, 02, 04, 06) — servis istekleri 71–74
// ============================================================================================
interface CommSettings { quiet_from: string; quiet_to: string }
interface AckRule { announcement_id: string; title: string; requires_ack: boolean; ack_hours: number; sms_fallback: boolean; deadline: string; published_at: string }
interface Ack { announcement_id: string; user_id: string; name: string; units: string[]; at: string }
interface Scheduled { id: string; payload: Record<string, unknown>; publish_at: string; requested_at: string; shifted: boolean; requires_ack: boolean; ack_hours: number; sms_fallback: boolean; status: "scheduled" | "published" | "cancelled"; announcement_id: string | null; created_by: string }
interface TplVariant { lang: "tr" | "en"; subject: string | null; body: string }
interface Tpl { code: string; name: string; channel: "push" | "sms" | "email"; variables: string[]; required: string[]; variants: TplVariant[]; version: number; history: { version: number; at: string; by: string }[]; customized: boolean }
interface MusterPoint { id: string; name: string; directions: string; map: string | null }
interface InfoCard { muster_points: MusterPoint[]; phones: { label: string; number: string }[]; instructions: Record<"earthquake" | "fire" | "flood" | "gas", string>; block_notes: { block_id: string; block_name: string; note: string }[]; version: number; updated_at: string | null; updated_by: string | null }
interface EmStatus { unit_id: string; unit_name: string; block_id: string; status: "safe" | "help" | "muster"; note: string | null; muster_point: string | null; by: string; method: "app" | "list"; at: string }
interface Emergency { id: string; kind: "earthquake" | "fire" | "flood" | "gas" | "other"; scope: "all" | "blocks"; block_ids: string[]; message: string; started_by: string; started_at: string; ended_at: string | null; ended_by: string | null; statuses: EmStatus[]; summary: { total: number; safe: number; muster: number; help: number; none: number } | null; purge_on: string | null; audit: { at: string; by: string; action: string }[]; units: { id: string; display_name: string; block: { id: string; name: string } | null; is_active: boolean }[] }
const commSettings = loadMap<string, CommSettings>("commSettings");
const ackRules = loadMap<string, AckRule[]>("ackRules");
const acks = loadMap<string, Ack[]>("acks");
const scheduledAnns = loadMap<string, Scheduled[]>("scheduledAnns");
const notifTpls = loadMap<string, Tpl[]>("notifTpls");
const infoCards = loadMap<string, InfoCard>("infoCards");
const emergencies = loadMap<string, Emergency[]>("emergencies");
const commOf = (slug: string) => { if (!commSettings.has(slug)) commSettings.set(slug, { quiet_from: "22:00", quiet_to: "08:00" }); return commSettings.get(slug)!; };
const inQuiet = (hm: string, s: CommSettings) => (s.quiet_from > s.quiet_to ? hm >= s.quiet_from || hm < s.quiet_to : hm >= s.quiet_from && hm < s.quiet_to);
const localHm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
function shiftOutOfQuiet(iso: string, s: CommSettings) {
  const d = new Date(iso);
  if (!inQuiet(localHm(d), s)) return { at: d.toISOString(), shifted: false };
  const t = new Date(d); const [h, m] = s.quiet_to.split(":").map(Number);
  t.setHours(h!, m!, 0, 0); if (t <= d) t.setDate(t.getDate() + 1);
  return { at: t.toISOString(), shifted: true };
}
const SYS_TPLS: Omit<Tpl, "version" | "history" | "customized">[] = [
  { code: "dues_reminder", name: "Aidat hatırlatma", channel: "sms", variables: ["sakin.ad", "bolum", "tutar", "vade", "site.ad"], required: ["tutar", "vade"], variants: [{ lang: "tr", subject: null, body: "Sayın {{sakin.ad}}, {{bolum}} için {{tutar}} tutarındaki aidatın vadesi {{vade}}. {{site.ad}} Yönetimi" }, { lang: "en", subject: null, body: "Dear {{sakin.ad}}, the dues of {{tutar}} for {{bolum}} are due on {{vade}}. {{site.ad}} Management" }] },
  { code: "payment_received", name: "Tahsilat alındı", channel: "push", variables: ["sakin.ad", "tutar", "makbuz.no"], required: ["tutar"], variants: [{ lang: "tr", subject: null, body: "{{tutar}} ödemeniz alındı. Makbuz: {{makbuz.no}}" }, { lang: "en", subject: null, body: "Your payment of {{tutar}} was received. Receipt: {{makbuz.no}}" }] },
  { code: "request_status", name: "Talep durumu", channel: "push", variables: ["talep.no", "talep.konu", "durum"], required: ["talep.no", "durum"], variants: [{ lang: "tr", subject: null, body: "#{{talep.no}} {{talep.konu}}: {{durum}}" }, { lang: "en", subject: null, body: "#{{talep.no}} {{talep.konu}}: {{durum}}" }] },
  { code: "visitor_arrived", name: "Ziyaretçi geldi", channel: "push", variables: ["ziyaretci.ad", "kapi"], required: ["ziyaretci.ad"], variants: [{ lang: "tr", subject: null, body: "{{ziyaretci.ad}} {{kapi}} kapısında, onayınızı bekliyor." }, { lang: "en", subject: null, body: "{{ziyaretci.ad}} is at the {{kapi}} gate, waiting for your approval." }] },
  { code: "package_arrived", name: "Kargo geldi", channel: "sms", variables: ["firma", "teslim.kodu"], required: ["teslim.kodu"], variants: [{ lang: "tr", subject: null, body: "{{firma}} kargonuz güvenlikte. Teslim kodu: {{teslim.kodu}}" }, { lang: "en", subject: null, body: "Your {{firma}} parcel is at security. Pickup code: {{teslim.kodu}}" }] },
  { code: "ack_reminder", name: "Okuma onayı yedeği (SMS)", channel: "sms", variables: ["duyuru.baslik", "link"], required: ["duyuru.baslik", "link"], variants: [{ lang: "tr", subject: null, body: "Okuma onayı bekleyen duyuru: {{duyuru.baslik}} {{link}}" }, { lang: "en", subject: null, body: "Announcement awaiting acknowledgement: {{duyuru.baslik}} {{link}}" }] },
  { code: "emergency", name: "Acil durum", channel: "sms", variables: ["tur", "mesaj", "link"], required: ["mesaj"], variants: [{ lang: "tr", subject: null, body: "ACİL DURUM ({{tur}}): {{mesaj}} Güvende misiniz? {{link}}" }, { lang: "en", subject: null, body: "EMERGENCY ({{tur}}): {{mesaj}} Are you safe? {{link}}" }] },
];
const tplsOf = (slug: string) => { const l = listOf(notifTpls, slug); if (l.length === 0) for (const t of SYS_TPLS) l.push({ ...structuredClone(t), version: 1, history: [{ version: 1, at: "2026-10-01T00:00:00.000Z", by: "Sistem" }], customized: false }); return l; };
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
const smsCount = (text: string) => { const gsm = GSM7.test(text); const len = text.length; const single = gsm ? 160 : 70, multi = gsm ? 153 : 67; return { encoding: gsm ? "GSM-7" : "Unicode", chars: len, segments: len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi) }; };
const cardOf = (slug: string) => { if (!infoCards.has(slug)) infoCards.set(slug, { muster_points: [], phones: [{ label: "Acil çağrı", number: "112" }], instructions: { earthquake: "Çök–kapan–tutun. Sarsıntı bitince merdivenle, asansör kullanmadan toplanma alanına gidin.", fire: "Asansör kullanmayın; yangın merdiveninden çıkın, kapıları kapatın, 112'yi arayın.", flood: "Elektriği kapatın, bodrum ve otoparktan uzaklaşın, üst katlara çıkın.", gas: "Elektrik düğmelerine dokunmayın, pencereleri açın, binayı terk edip 187'yi arayın." }, block_notes: [], version: 0, updated_at: null, updated_by: null }); return infoCards.get(slug)!; };
const activeEm = (slug: string) => listOf(emergencies, slug).find((e) => !e.ended_at) ?? null;
type UnitLite = { id: string; display_name: string; block: { id: string; name: string } | null; is_active: boolean };
/** Kapsamdaki bölümler başlatma anında başlatanın yetkisiyle sabitlenir; sakin ve güvenlik bölüm listesini okuyamaz. */
async function scopeUnits(request: Request, slug: string, scope: Emergency["scope"], blockIds: string[]) {
  const all = (await allPages<UnitLite>(request, `/api/v1/sites/${slug}/units`)).filter((u) => u.is_active);
  return (scope === "all" ? all : all.filter((u) => u.block && blockIds.includes(u.block.id))).map((u) => ({ id: u.id, display_name: u.display_name, block: u.block ? { id: u.block.id, name: u.block.name } : null, is_active: true }));
}
async function emUnits(_request: Request, _slug: string, e: Emergency) { return e.units ?? []; }
function boardOf(e: Emergency, units: UnitLite[]) {
  const byUnit = new Map(e.statuses.map((s) => [s.unit_id, s]));
  const rows = units.map((u) => ({ unit_id: u.id, unit_name: u.display_name, block_id: u.block?.id ?? "", block_name: u.block?.name ?? "—", status: byUnit.get(u.id)?.status ?? "none", note: byUnit.get(u.id)?.note ?? null, muster_point: byUnit.get(u.id)?.muster_point ?? null, by: byUnit.get(u.id)?.by ?? null, at: byUnit.get(u.id)?.at ?? null }));
  const count = (k: string) => rows.filter((r) => r.status === k).length;
  return { rows, totals: { total: rows.length, safe: count("safe"), muster: count("muster"), help: count("help"), none: count("none") } };
}

const iletisim: RequestHandler[] = [
  // 71 — Okuma onayı, zamanlama, sessiz saat
  http.get(`${API}/communication-settings`, ({ params }) => HttpResponse.json(commOf(String(params.slug)))),
  http.put(`${API}/communication-settings`, async ({ request, params }) => {
    const b = (await request.json()) as Partial<CommSettings>;
    const f: Record<string, string> = {};
    if (!TIME_RE.test(b.quiet_from ?? "")) f.quiet_from = "SS:DD"; if (!TIME_RE.test(b.quiet_to ?? "")) f.quiet_to = "SS:DD";
    if (!f.quiet_from && !f.quiet_to && b.quiet_from === b.quiet_to) f.quiet_to = "Başlangıç ve bitiş aynı olamaz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    commSettings.set(String(params.slug), { quiet_from: b.quiet_from!, quiet_to: b.quiet_to! });
    return HttpResponse.json({ data: commOf(String(params.slug)), message: "Sessiz saatler kaydedildi." });
  }),
  http.post(`${API}/announcements`, async ({ request, params }) => {
    const slug = String(params.slug);
    const raw = (await request.json()) as Record<string, unknown> & { publish_at?: string | null; requires_ack?: boolean; ack_hours?: number; sms_fallback?: boolean };
    const { publish_at, requires_ack, ack_hours, sms_fallback, ...payload } = raw;
    const f: Record<string, string> = {};
    if (requires_ack && !(Number(ack_hours) >= 1 && Number(ack_hours) <= 720)) f.ack_hours = "Son onay süresi 1–720 saat.";
    if (publish_at && (Number.isNaN(Date.parse(publish_at)) || publish_at < new Date().toISOString())) f.publish_at = "Yayın zamanı ileride olmalı.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const critical = payload.importance === "critical";
    if (publish_at) {
      const sh = critical ? { at: new Date(publish_at).toISOString(), shifted: false } : shiftOutOfQuiet(publish_at, commOf(slug));
      const s: Scheduled = { id: crypto.randomUUID(), payload, publish_at: sh.at, requested_at: publish_at, shifted: sh.shifted, requires_ack: !!requires_ack, ack_hours: Number(ack_hours ?? 48), sms_fallback: !!sms_fallback, status: "scheduled", announcement_id: null, created_by: (await me(request)).name };
      listOf(scheduledAnns, slug).push(s);
      return HttpResponse.json({ data: s, message: `Duyuru ${new Date(s.publish_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })} için zamanlandı.${sh.shifted ? " Sessiz saatlere denk geldiği için sessiz saat bitişine kaydırıldı." : ""}` }, { status: 201 });
    }
    const r = await real<{ data?: { id: string; title: string; published_at: string | null } }>(request, `/api/v1/sites/${slug}/announcements`, { method: "POST", body: payload });
    if (r.status >= 300 || !r.body?.data) return HttpResponse.json(r.body, { status: r.status });
    if (requires_ack) { const pub = r.body.data.published_at ?? new Date().toISOString(); listOf(ackRules, slug).push({ announcement_id: r.body.data.id, title: r.body.data.title, requires_ack: true, ack_hours: Number(ack_hours), sms_fallback: !!sms_fallback, published_at: pub, deadline: new Date(new Date(pub).getTime() + Number(ack_hours) * 3600e3).toISOString() }); }
    const quiet = !critical && inQuiet(nowHm(), commOf(slug)) && Array.isArray(payload.channels) && (payload.channels as string[]).some((c) => c !== "in_app");
    return HttpResponse.json({ ...r.body, message: `${(r.body as { message?: string }).message ?? "Duyuru yayınlandı."}${requires_ack ? ` Okuma onayı ${ack_hours} saat içinde bekleniyor.` : ""}${quiet ? ` Sessiz saatler içinde: push/SMS/e-posta ${commOf(slug).quiet_to}'de gider.` : ""}` }, { status: r.status });
  }),
  http.get(`${API}/announcements`, async ({ request, params }) => {
    const slug = String(params.slug);
    // Zamanlanmış iş: vakti gelen duyuruları yayınla
    for (const s of listOf(scheduledAnns, slug)) {
      if (s.status !== "scheduled" || s.publish_at > new Date().toISOString()) continue;
      const r = await real<{ data?: { id: string; title: string; published_at: string | null } }>(request, `/api/v1/sites/${slug}/announcements`, { method: "POST", body: s.payload });
      if (r.body?.data) { s.status = "published"; s.announcement_id = r.body.data.id; if (s.requires_ack) { const pub = r.body.data.published_at ?? new Date().toISOString(); listOf(ackRules, slug).push({ announcement_id: r.body.data.id, title: r.body.data.title, requires_ack: true, ack_hours: s.ack_hours, sms_fallback: s.sms_fallback, published_at: pub, deadline: new Date(new Date(pub).getTime() + s.ack_hours * 3600e3).toISOString() }); } }
    }
    const u = new URL(request.url);
    const r = await real<Paged<{ id: string }>>(request, `/api/v1/sites/${slug}/announcements${u.search}`);
    if (!r.body?.items) return HttpResponse.json(r.body, { status: r.status });
    const rules = listOf(ackRules, slug), ack = listOf(acks, slug);
    return HttpResponse.json({ ...r.body, items: r.body.items.map((a) => { const rule = rules.find((x) => x.announcement_id === a.id); return { ...a, requires_ack: !!rule, ack_deadline: rule?.deadline ?? null, ack_count: rule ? ack.filter((x) => x.announcement_id === a.id).length : null }; }) });
  }),
  http.get(`${API}/scheduled-announcements`, ({ params }) => HttpResponse.json(listOf(scheduledAnns, String(params.slug)).filter((s) => s.status === "scheduled").sort((a, b) => a.publish_at.localeCompare(b.publish_at)).map((s) => ({ id: s.id, title: s.payload.title, importance: s.payload.importance, publish_at: s.publish_at, requested_at: s.requested_at, shifted: s.shifted, requires_ack: s.requires_ack, created_by: s.created_by })))),
  http.post(`${API}/scheduled-announcements/:id/cancel`, ({ params }) => {
    const s = listOf(scheduledAnns, String(params.slug)).find((x) => x.id === params.id);
    if (!s) return err(404, "not_found", "Zamanlanmış duyuru bulunamadı.");
    if (s.status !== "scheduled") return err(409, "invalid_status", "Duyuru yayınlanmış ya da iptal edilmiş.");
    s.status = "cancelled";
    return HttpResponse.json({ data: s, message: "Zamanlanmış duyuru iptal edildi." });
  }),
  http.get(`${API}/announcements/:id/read-report`, async ({ request, params }) => {
    const slug = String(params.slug);
    const rule = listOf(ackRules, slug).find((x) => x.announcement_id === params.id);
    const list = await real<Paged<{ id: string; title: string; published_at: string | null; recipient_count: number | null; read_count: number | null; audience: string }>>(request, `/api/v1/sites/${slug}/announcements?page_size=200`);
    const a = list.body?.items.find((x) => x.id === params.id);
    if (!a) return err(404, "not_found", "Duyuru bulunamadı.");
    const ackList = listOf(acks, slug).filter((x) => x.announcement_id === a.id).sort((x, y) => x.at.localeCompare(y.at));
    const recipients = a.recipient_count ?? 0;
    const due = rule ? rule.deadline < new Date().toISOString() : false;
    return HttpResponse.json({ id: a.id, title: a.title, audience: a.audience, published_at: a.published_at, generated_at: new Date().toISOString(), recipient_count: recipients, read_count: a.read_count ?? 0, requires_ack: !!rule, ack_deadline: rule?.deadline ?? null, acks: ackList.map((x) => ({ name: x.name, units: x.units, at: x.at, channel: "in_app" })), not_acked: rule ? Math.max(0, recipients - ackList.length) : null, sms_fallback: rule?.sms_fallback ? { due, count: due ? Math.max(0, recipients - ackList.length) : null, sent: false, note: "SMS sağlayıcısı seçilmedi (K5); gönderim kaydı tutulur." } : null });
  }),
  http.get(`${API}/resident/announcements`, async ({ request, params }) => {
    const slug = String(params.slug); const u = new URL(request.url);
    const r = await real<Paged<{ id: string }>>(request, `/api/v1/sites/${slug}/resident/announcements${u.search}`);
    if (!r.body?.items) return HttpResponse.json(r.body, { status: r.status });
    const meId = (await me(request)).id;
    const rules = listOf(ackRules, slug), ack = listOf(acks, slug);
    return HttpResponse.json({ ...r.body, items: r.body.items.map((a) => { const rule = rules.find((x) => x.announcement_id === a.id); return { ...a, requires_ack: !!rule, ack_deadline: rule?.deadline ?? null, acked_at: rule ? ack.find((x) => x.announcement_id === a.id && x.user_id === meId)?.at ?? null : null }; }) });
  }),
  http.get(`${API}/resident/pending-acks`, async ({ request, params }) => {
    const slug = String(params.slug); const meId = (await me(request)).id;
    const r = await real<Paged<{ id: string; title: string }>>(request, `/api/v1/sites/${slug}/resident/announcements?page_size=50`);
    const visible = new Set((r.body?.items ?? []).map((x) => x.id));
    return HttpResponse.json(listOf(ackRules, slug).filter((x) => visible.has(x.announcement_id) && !listOf(acks, slug).some((a) => a.announcement_id === x.announcement_id && a.user_id === meId)).map((x) => ({ announcement_id: x.announcement_id, title: x.title, deadline: x.deadline })));
  }),
  http.post(`${API}/resident/announcements/:id/acknowledge`, async ({ request, params }) => {
    const slug = String(params.slug);
    const rule = listOf(ackRules, slug).find((x) => x.announcement_id === params.id);
    if (!rule) return err(404, "not_found", "Bu duyuru okuma onayı istemiyor.");
    const m0 = await me(request); const mine = await myUnits(request, slug);
    if (mine.status !== 200) return err(403, "forbidden", "Okuma onayı yalnız hedef kitledeki sakinden alınır.");
    if (listOf(acks, slug).some((a) => a.announcement_id === rule.announcement_id && a.user_id === m0.id)) return err(409, "already", "Okuma onayınız zaten kayıtlı.");
    await real(request, `/api/v1/sites/${slug}/announcements/${rule.announcement_id}/read`, { method: "POST", body: {} });
    const a: Ack = { announcement_id: rule.announcement_id, user_id: m0.id, name: m0.name, units: mine.units.map((u) => u.unit_name), at: new Date().toISOString() };
    listOf(acks, slug).push(a);
    return HttpResponse.json({ data: a, message: "Okuma onayınız kaydedildi." }, { status: 201 });
  }),

  // 72 — Bildirim ve duyuru şablonları
  http.get(`${API}/notification-templates`, ({ params }) => HttpResponse.json(tplsOf(String(params.slug)).map((t) => ({ ...t, sms: t.channel === "sms" ? t.variants.map((v) => ({ lang: v.lang, ...smsCount(v.body) })) : null })))),
  http.put(`${API}/notification-templates/:code`, async ({ request, params }) => {
    const slug = String(params.slug); const t = tplsOf(slug).find((x) => x.code === params.code);
    if (!t) return err(404, "not_found", "Şablon bulunamadı.");
    const b = (await request.json()) as { variants?: TplVariant[] };
    const f: Record<string, string> = {};
    const vs = (b.variants ?? []).filter((v) => ["tr", "en"].includes(v.lang));
    if (!vs.some((v) => v.lang === "tr")) f.variants = "Türkçe metin zorunlu.";
    for (const v of vs) {
      const used = [...v.body.matchAll(/\{\{\s*([a-z.]+)\s*\}\}/g)].map((m) => m[1]!);
      const missing = t.required.filter((x) => !used.includes(x));
      const unknown = used.filter((x) => !t.variables.includes(x));
      if (!v.body.trim()) f[`variants.${v.lang}`] = "Metin boş olamaz.";
      else if (missing.length) f[`variants.${v.lang}`] = `Zorunlu değişken eksik: ${missing.map((x) => `{{${x}}}`).join(", ")}`;
      else if (unknown.length) f[`variants.${v.lang}`] = `Tanımsız değişken: ${unknown.map((x) => `{{${x}}}`).join(", ")}`;
      else if (t.channel === "sms" && smsCount(v.body).segments > 3) f[`variants.${v.lang}`] = "SMS en fazla 3 parça olabilir.";
    }
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    t.variants = vs.map((v) => ({ lang: v.lang, subject: v.subject ?? null, body: v.body.trim() }));
    t.version += 1; t.customized = true; t.history.push({ version: t.version, at: new Date().toISOString(), by: (await me(request)).name });
    return HttpResponse.json({ data: t, message: `${t.name} şablonu kaydedildi (sürüm ${t.version}); yeni gönderimler bu sürümü kullanır.` });
  }),
  http.post(`${API}/notification-templates/:code/reset`, async ({ request, params }) => {
    const slug = String(params.slug); const t = tplsOf(slug).find((x) => x.code === params.code); const sys = SYS_TPLS.find((x) => x.code === params.code);
    if (!t || !sys) return err(404, "not_found", "Şablon bulunamadı.");
    t.variants = structuredClone(sys.variants); t.version += 1; t.customized = false; t.history.push({ version: t.version, at: new Date().toISOString(), by: (await me(request)).name });
    return HttpResponse.json({ data: t, message: "Sistem şablonuna dönüldü." });
  }),

  // 73 — Acil durum modu ve pano
  http.get(`${API}/emergencies`, ({ params }) => HttpResponse.json([...listOf(emergencies, String(params.slug))].reverse().map(({ statuses: _s, units: _u, ...e }) => e))),
  http.post(`${API}/emergencies`, async ({ request, params }) => {
    const slug = String(params.slug);
    if (activeEm(slug)) return err(409, "already_active", "Zaten aktif bir acil durum var.");
    const b = (await request.json()) as Partial<Emergency>;
    const f: Record<string, string> = {};
    if (!["earthquake", "fire", "flood", "gas", "other"].includes(b.kind ?? "")) f.kind = "Tür seçin.";
    if ((b.message ?? "").trim().length < 5) f.message = "Kısa bir mesaj yazın.";
    if (b.scope === "blocks" && !(b.block_ids ?? []).length) f.block_ids = "En az bir blok seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const who = (await me(request)).name;
    const scope = b.scope === "blocks" ? "blocks" as const : "all" as const; const blockIds = scope === "blocks" ? b.block_ids! : [];
    const units = await scopeUnits(request, slug, scope, blockIds);
    if (units.length === 0) return err(422, "validation", VALIDATION, { block_ids: "Kapsamda bölüm yok." });
    const e: Emergency = { id: crypto.randomUUID(), kind: b.kind!, scope, block_ids: blockIds, message: b.message!.trim(), started_by: who, started_at: new Date().toISOString(), ended_at: null, ended_by: null, statuses: [], summary: null, purge_on: null, audit: [{ at: new Date().toISOString(), by: who, action: "Acil durum başlatıldı" }], units };
    listOf(emergencies, slug).push(e);
    const n = units.length;
    return HttpResponse.json({ data: { ...e, units: undefined, statuses: undefined }, message: `Acil durum başlatıldı: ${n} bölüme sessiz saat ve tercihleri aşan bildirim (push + SMS, K5). Uygulamada acil durum ekranı açıldı.` }, { status: 201 });
  }),
  http.get(`${API}/emergencies/active`, async ({ request, params }) => {
    const slug = String(params.slug); const e = activeEm(slug);
    if (!e) return HttpResponse.json(null);
    const { statuses: _s, units: _u, ...rest } = e;
    return HttpResponse.json({ ...rest, ...boardOf(e, await emUnits(request, slug, e)) });
  }),
  http.post(`${API}/emergencies/:id/muster-checks`, async ({ request, params }) => {
    const slug = String(params.slug); const e = listOf(emergencies, slug).find((x) => x.id === params.id);
    if (!e || e.ended_at) return err(409, "not_active", "Acil durum aktif değil.");
    const b = (await request.json()) as { unit_ids?: string[]; muster_point?: string };
    const units = await emUnits(request, slug, e);
    const pick = units.filter((u) => (b.unit_ids ?? []).includes(u.id));
    if (!pick.length) return err(422, "validation", VALIDATION, { unit_ids: "Bölüm seçin." });
    if (!(b.muster_point ?? "").trim()) return err(422, "validation", VALIDATION, { muster_point: "Toplanma alanını seçin." });
    const who = (await me(request)).name;
    for (const u of pick) {
      const prev = e.statuses.find((s) => s.unit_id === u.id);
      if (prev?.status === "help") continue; // yardım isteyen bölüm yoklamayla kapanmaz, ekip yönlendirilir
      const s: EmStatus = { unit_id: u.id, unit_name: u.display_name, block_id: u.block?.id ?? "", status: "muster", note: prev?.note ?? null, muster_point: b.muster_point!.trim(), by: who, method: "list", at: new Date().toISOString() };
      if (prev) Object.assign(prev, s); else e.statuses.push(s);
    }
    return HttpResponse.json({ data: null, message: `${pick.length} bölüm "${b.muster_point}" toplanma alanında işaretlendi.` });
  }),
  http.post(`${API}/emergencies/:id/end`, async ({ request, params }) => {
    const slug = String(params.slug); const e = listOf(emergencies, slug).find((x) => x.id === params.id);
    if (!e || e.ended_at) return err(409, "not_active", "Acil durum aktif değil.");
    const who = (await me(request)).name;
    const board = boardOf(e, await emUnits(request, slug, e));
    Object.assign(e, { ended_at: new Date().toISOString(), ended_by: who, summary: board.totals, purge_on: addDays(today(), 30) });
    e.audit.push({ at: e.ended_at!, by: who, action: "Acil durum bitirildi" });
    return HttpResponse.json({ data: e, message: `Acil durum bitirildi. Özet: ${board.totals.safe} güvende, ${board.totals.muster} toplanma alanında, ${board.totals.help} yardım, ${board.totals.none} yanıt yok. Ayrıntılı veriler 30 gün sonra silinir.` });
  }),
  http.get(`${API}/resident/emergency`, async ({ request, params }) => {
    const slug = String(params.slug); const e = activeEm(slug);
    if (!e) return HttpResponse.json(null);
    const h = await real<{ units: { unit_id: string; unit_name: string }[] }>(request, `/api/v1/sites/${slug}/resident/home`);
    const inScope = (await emUnits(request, slug, e)).filter((u) => (h.body?.units ?? []).some((m) => m.unit_id === u.id));
    if (!inScope.length) return HttpResponse.json(null);
    return HttpResponse.json({ id: e.id, kind: e.kind, message: e.message, started_at: e.started_at, units: inScope.map((u) => ({ unit_id: u.id, unit_name: u.display_name, status: e.statuses.find((s) => s.unit_id === u.id) ?? null })), muster_points: cardOf(slug).muster_points.map((m) => m.name) });
  }),
  http.post(`${API}/resident/emergency/status`, async ({ request, params }) => {
    const slug = String(params.slug); const e = activeEm(slug);
    if (!e) return err(409, "not_active", "Aktif acil durum yok.");
    const b = (await request.json()) as { status?: "safe" | "help" | "muster"; note?: string; muster_point?: string };
    if (!["safe", "help", "muster"].includes(b.status ?? "")) return err(422, "validation", VALIDATION, { status: "Durum seçin." });
    if (b.status === "muster" && !(b.muster_point ?? "").trim()) return err(422, "validation", VALIDATION, { muster_point: "Toplanma alanını seçin." });
    const h = await real<{ units: { unit_id: string }[] }>(request, `/api/v1/sites/${slug}/resident/home`);
    const units = (await emUnits(request, slug, e)).filter((u) => (h.body?.units ?? []).some((m) => m.unit_id === u.id));
    if (!units.length) return err(403, "forbidden", "Bölümünüz bu acil durumun kapsamında değil.");
    const who = (await me(request)).name;
    for (const u of units) {
      const s: EmStatus = { unit_id: u.id, unit_name: u.display_name, block_id: u.block?.id ?? "", status: b.status!, note: b.note?.trim() || null, muster_point: b.status === "muster" ? b.muster_point!.trim() : null, by: who, method: "app", at: new Date().toISOString() };
      const prev = e.statuses.find((x) => x.unit_id === u.id); if (prev) Object.assign(prev, s); else e.statuses.push(s);
    }
    return HttpResponse.json({ data: null, message: b.status === "help" ? "Yardım isteğiniz yönetime ve güvenliğe iletildi; ekip yönlendiriliyor." : b.status === "muster" ? "Toplanma alanında olduğunuz kaydedildi." : "Güvende olduğunuz kaydedildi." });
  }),

  // 74 — Acil bilgi kartı
  http.get(`${API}/emergency-info-card`, ({ params }) => HttpResponse.json(cardOf(String(params.slug)))),
  http.get(`${API}/resident/emergency-info-card`, ({ params }) => HttpResponse.json(cardOf(String(params.slug)))),
  http.put(`${API}/emergency-info-card`, async ({ request, params }) => {
    const slug = String(params.slug); const b = (await request.json()) as Partial<InfoCard>;
    const f: Record<string, string> = {};
    const mps = (b.muster_points ?? []).map((m) => ({ id: m.id || crypto.randomUUID(), name: (m.name ?? "").trim(), directions: (m.directions ?? "").trim(), map: m.map ?? null }));
    mps.forEach((m, i) => { if (m.name.length < 2) f[`muster_points.${i}.name`] = "Alan adını yazın."; if (m.map && m.map.length > 400000) f[`muster_points.${i}.map`] = "Kroki çok büyük."; });
    if (mps.length === 0) f.muster_points = "En az bir toplanma alanı tanımlayın.";
    const phones = (b.phones ?? []).map((p) => ({ label: (p.label ?? "").trim(), number: (p.number ?? "").replace(/[^\d+]/g, "") }));
    phones.forEach((p, i) => { if (!p.label) f[`phones.${i}.label`] = "Ad yazın."; if (!/^\+?\d{3,13}$/.test(p.number)) f[`phones.${i}.number`] = "Geçerli bir numara yazın."; });
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const cur = cardOf(slug);
    const c: InfoCard = { muster_points: mps, phones, instructions: { ...cur.instructions, ...(b.instructions ?? {}) }, block_notes: (b.block_notes ?? []).filter((n) => n.note?.trim()).map((n) => ({ block_id: n.block_id, block_name: n.block_name, note: n.note.trim() })), version: cur.version + 1, updated_at: new Date().toISOString(), updated_by: (await me(request)).name };
    infoCards.set(slug, c);
    return HttpResponse.json({ data: c, message: `Acil bilgi kartı yayınlandı (sürüm ${c.version}); uygulamalar arka planda güncellenir.` });
  }),
];

// ============================================================================================
// GENEL KURUL (Yazılım Dokümanı TOP-01, TOP-03 fiziki oylama, TOP-04) — servis istekleri 75–77
// ============================================================================================
interface DecisionType { code: string; name: string; base: "present" | "all"; num: number; den: number; strict: boolean; person: boolean; share: boolean }
interface AssemblySettings { decision_types: DecisionType[]; quorum: { num: number; den: number; strict: boolean; person: boolean; share: boolean }; proxy_limit: number }
interface RosterUnit { unit_id: string; unit_name: string; block_name: string; owners: string[]; key: string; share: number; share_den: number }
interface Attendance { unit_id: string; mode: "self" | "proxy"; proxy_name: string | null; at: string }
interface ItemVote { status: "none" | "open" | "closed"; ballots: Record<string, "for" | "against" | "abstain">; result: VoteResult | null; opened_at: string | null; closed_at: string | null }
interface VoteResult { type_code: string; type_name: string; persons: { for: number; against: number; abstain: number; base: number }; shares: { for: number; against: number; abstain: number; base: number }; person_ok: boolean | null; share_ok: boolean | null; accepted: boolean }
interface Assembly {
  meeting_id: string; format: "physical" | "hybrid" | "prevote"; legal_ack: { by: string; at: string } | null; second_call: boolean; item_types: Record<string, string>;
  invitation: { announcement_id: string; sent_at: string; by: string } | null; roster: RosterUnit[]; attendance: Attendance[]; votes: Record<string, ItemVote>;
  minutes: { notes: Record<string, string>; decisions: Record<string, string>; opening: string; finalized_at: string | null; finalized_by: string | null; signed_file: string | null };
}
interface BookEntry { no: number; meeting_id: string; meeting_title: string; date: string; item_title: string; decision: string; result: string; type_name: string }
const assemblySettings = loadMap<string, AssemblySettings>("assemblySettings");
const assemblies = loadMap<string, Record<string, Assembly>>("assemblies");
const decisionBook = loadMap<string, BookEntry[]>("decisionBook");
const AS_DEFAULT: AssemblySettings = {
  decision_types: [
    { code: "ordinary", name: "Oy çokluğu (katılanların sayı ve arsa payı çoğunluğu)", base: "present", num: 1, den: 2, strict: true, person: true, share: true },
    { code: "all_majority", name: "Tüm maliklerin sayı ve arsa payı çoğunluğu", base: "all", num: 1, den: 2, strict: true, person: true, share: true },
    { code: "four_fifths", name: "Tüm maliklerin 4/5'i (sayı ve arsa payı)", base: "all", num: 4, den: 5, strict: false, person: true, share: true },
    { code: "unanimous", name: "Oy birliği (tüm malikler)", base: "all", num: 1, den: 1, strict: false, person: true, share: false },
  ],
  quorum: { num: 1, den: 2, strict: true, person: true, share: true },
  proxy_limit: 2,
};
const asOf = (slug: string) => { if (!assemblySettings.has(slug)) assemblySettings.set(slug, structuredClone(AS_DEFAULT)); return assemblySettings.get(slug)!; };
const passes = (v: number, base: number, num: number, den: number, strict: boolean) => (strict ? v * den > base * num : v * den >= base * num - 1e-9);
async function assemblyOf(request: Request, slug: string, meetingId: string): Promise<Assembly | Response> {
  if (!assemblies.has(slug)) assemblies.set(slug, {});
  const map = assemblies.get(slug)!;
  if (map[meetingId]) return map[meetingId]!;
  const m = await real<{ id: string; kind: string; agenda: { id: string }[] }>(request, `/api/v1/sites/${slug}/meetings/${meetingId}`);
  if (m.status !== 200 || !m.body) return err(404, "not_found", "Toplantı bulunamadı.");
  if (m.body.kind === "board") return err(409, "not_general", "Genel kurul işlemleri yalnız genel kurul toplantılarında.");
  const units = await allPages<{ id: string; display_name: string; block: { name: string } | null; is_active: boolean; owner_names: string[]; land_share_numerator: number | null; land_share_denominator: number | null }>(request, `/api/v1/sites/${slug}/units`);
  const roster: RosterUnit[] = units.filter((u) => u.is_active && u.owner_names?.length).map((u) => { const owners = [...u.owner_names].sort((a, b) => a.localeCompare(b, "tr")); return { unit_id: u.id, unit_name: u.display_name, block_name: u.block?.name ?? "—", owners, key: owners.join(" + ").toLocaleLowerCase("tr-TR"), share: u.land_share_numerator ?? 0, share_den: u.land_share_denominator ?? 1 }; });
  const a: Assembly = { meeting_id: meetingId, format: "physical", legal_ack: null, second_call: false, item_types: Object.fromEntries(m.body.agenda.map((i) => [i.id, "ordinary"])), invitation: null, roster, attendance: [], votes: {}, minutes: { notes: {}, decisions: {}, opening: "", finalized_at: null, finalized_by: null, signed_file: null } };
  map[meetingId] = a;
  return a;
}
const frac = (u: RosterUnit) => u.share / (u.share_den || 1);
function quorumOf(slug: string, a: Assembly) {
  const q = asOf(slug).quorum;
  const present = new Set(a.attendance.map((x) => x.unit_id));
  const keysAll = new Set(a.roster.map((u) => u.key)), keysPresent = new Set(a.roster.filter((u) => present.has(u.unit_id)).map((u) => u.key));
  const shareAll = a.roster.reduce((s, u) => s + frac(u), 0), sharePresent = a.roster.filter((u) => present.has(u.unit_id)).reduce((s, u) => s + frac(u), 0);
  const person_ok = passes(keysPresent.size, keysAll.size, q.num, q.den, q.strict), share_ok = passes(sharePresent, shareAll, q.num, q.den, q.strict);
  const ok = a.second_call || ((!q.person || person_ok) && (!q.share || share_ok));
  return { persons_present: keysPresent.size, persons_total: keysAll.size, share_present: sharePresent, share_total: shareAll, person_ok, share_ok, ok, second_call: a.second_call };
}
function tally(slug: string, a: Assembly, itemId: string): VoteResult {
  const t = asOf(slug).decision_types.find((x) => x.code === (a.item_types[itemId] ?? "ordinary")) ?? asOf(slug).decision_types[0]!;
  const v = a.votes[itemId]!;
  const present = new Set(a.attendance.map((x) => x.unit_id));
  const pres = a.roster.filter((u) => present.has(u.unit_id));
  const byKey = new Map<string, string>();
  for (const u of pres) { const b = v.ballots[u.unit_id]; if (b) byKey.set(u.key, b); }
  const pc = (k: string) => [...byKey.values()].filter((x) => x === k).length;
  const sc = (k: string) => pres.filter((u) => v.ballots[u.unit_id] === k).reduce((s, u) => s + frac(u), 0);
  const personBase = t.base === "present" ? new Set(pres.map((u) => u.key)).size : new Set(a.roster.map((u) => u.key)).size;
  const shareBase = t.base === "present" ? pres.reduce((s, u) => s + frac(u), 0) : a.roster.reduce((s, u) => s + frac(u), 0);
  const person_ok = t.person ? passes(pc("for"), personBase, t.num, t.den, t.strict) : null;
  const share_ok = t.share ? passes(sc("for"), shareBase, t.num, t.den, t.strict) : null;
  return { type_code: t.code, type_name: t.name, persons: { for: pc("for"), against: pc("against"), abstain: pc("abstain"), base: personBase }, shares: { for: sc("for"), against: sc("against"), abstain: sc("abstain"), base: shareBase }, person_ok, share_ok, accepted: person_ok !== false && share_ok !== false };
}
const assemblyOut = (slug: string, a: Assembly) => ({ ...a, settings: asOf(slug), quorum: quorumOf(slug, a), votes: Object.fromEntries(Object.entries(a.votes).map(([k, v]) => [k, { ...v, live: v.status === "open" ? tally(slug, a, k) : null }])) });

const genelKurul: RequestHandler[] = [
  http.get(`${API}/assembly-settings`, ({ params }) => HttpResponse.json(asOf(String(params.slug)))),
  http.put(`${API}/assembly-settings`, async ({ request, params }) => {
    const b = (await request.json()) as Partial<AssemblySettings>;
    if (!(Number.isInteger(b.proxy_limit) && b.proxy_limit! >= 1 && b.proxy_limit! <= 20)) return err(422, "validation", VALIDATION, { proxy_limit: "Kişi başı vekâlet 1–20." });
    const s = asOf(String(params.slug)); s.proxy_limit = b.proxy_limit!;
    return HttpResponse.json({ data: s, message: "Genel kurul ayarları kaydedildi." });
  }),
  http.get(`${API}/meetings/:id/assembly`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id));
    return a instanceof Response ? a : HttpResponse.json(assemblyOut(slug, a));
  }),
  // 75 — Hazırlık: format, karar türü, hukuki uyarı, çağrı
  http.put(`${API}/meetings/:id/assembly/prep`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    if (a.attendance.length) return err(409, "started", "Hazirun başladıktan sonra format ve karar türü değiştirilemez.");
    const b = (await request.json()) as { format?: Assembly["format"]; item_types?: Record<string, string>; second_call?: boolean };
    const codes = asOf(slug).decision_types.map((t) => t.code);
    if (b.format && !["physical", "hybrid", "prevote"].includes(b.format)) return err(422, "validation", VALIDATION, { format: "Format seçin." });
    for (const [k, v] of Object.entries(b.item_types ?? {})) if (!codes.includes(v)) return err(422, "validation", VALIDATION, { [`item_types.${k}`]: "Karar türü seçin." });
    if (b.format && b.format !== a.format) a.legal_ack = null;
    Object.assign(a, { format: b.format ?? a.format, item_types: { ...a.item_types, ...(b.item_types ?? {}) }, second_call: b.second_call ?? a.second_call });
    return HttpResponse.json({ data: assemblyOut(slug, a), message: "Toplantı hazırlığı kaydedildi." });
  }),
  http.post(`${API}/meetings/:id/assembly/legal-ack`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    a.legal_ack = { by: (await me(request)).name, at: new Date().toISOString() };
    return HttpResponse.json({ data: assemblyOut(slug, a), message: "Hukuki geçerlilik uyarısı onaylandı." });
  }),
  http.post(`${API}/meetings/:id/assembly/invitation`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    if (a.format !== "physical" && !a.legal_ack) return err(409, "legal_ack_required", "Hibrit / ön oylama formatında önce hukuki geçerlilik uyarısını onaylayın.");
    if (a.invitation) return err(409, "already_sent", "Çağrı zaten gönderildi.");
    const b = (await request.json()) as { title?: string; body?: string; ack_hours?: number };
    if ((b.title ?? "").trim().length < 3 || (b.body ?? "").trim().length < 10) return err(422, "validation", VALIDATION, { body: "Çağrı metnini yazın." });
    const hours = Number(b.ack_hours ?? 72);
    const r = await real<{ data?: { id: string; title: string; published_at: string | null } }>(request, `/api/v1/sites/${slug}/announcements`, { method: "POST", body: { title: b.title!.trim(), body: b.body!.trim(), importance: "important", audience: "owners_only", audience_block_ids: [], channels: ["in_app", "email", "sms"], expires_on: null, is_pinned: true } });
    if (!r.body?.data) return HttpResponse.json(r.body, { status: r.status });
    const pub = r.body.data.published_at ?? new Date().toISOString();
    listOf(ackRules, slug).push({ announcement_id: r.body.data.id, title: r.body.data.title, requires_ack: true, ack_hours: hours, sms_fallback: true, published_at: pub, deadline: new Date(new Date(pub).getTime() + hours * 3600e3).toISOString() });
    a.invitation = { announcement_id: r.body.data.id, sent_at: new Date().toISOString(), by: (await me(request)).name };
    return HttpResponse.json({ data: assemblyOut(slug, a), message: "Çağrı maliklere okuma onaylı duyuru olarak gönderildi; ispat raporu duyurunun okuma raporundadır." });
  }),
  // 76 — Hazirun, fiziki vekâlet, oylama ve nisap
  http.put(`${API}/meetings/:id/assembly/attendance`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    if (a.minutes.finalized_at) return err(409, "finalized", "Tutanak kesinleşti.");
    if (Object.values(a.votes).some((v) => v.status === "open")) return err(409, "voting_open", "Açık oylama varken hazirun değişmez.");
    const b = (await request.json()) as { unit_id?: string; mode?: "self" | "proxy" | null; proxy_name?: string };
    const u = a.roster.find((x) => x.unit_id === b.unit_id);
    if (!u) return err(404, "not_found", "Bölüm malik listesinde yok.");
    a.attendance = a.attendance.filter((x) => x.unit_id !== u.unit_id);
    if (b.mode === "self") a.attendance.push({ unit_id: u.unit_id, mode: "self", proxy_name: null, at: new Date().toISOString() });
    if (b.mode === "proxy") {
      const name = (b.proxy_name ?? "").trim().replace(/\s+/g, " ");
      if (name.length < 3) return err(422, "validation", VALIDATION, { proxy_name: "Vekilin adını yazın." });
      const keys = new Set(a.roster.filter((x) => a.attendance.some((t) => t.mode === "proxy" && t.proxy_name!.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR") && t.unit_id === x.unit_id)).map((x) => x.key));
      keys.add(u.key);
      if (keys.size > asOf(slug).proxy_limit) return err(409, "proxy_limit", `Vekâlet sınırı aşılıyor: bir kişi en fazla ${asOf(slug).proxy_limit} malikin vekili olabilir.`);
      a.attendance.push({ unit_id: u.unit_id, mode: "proxy", proxy_name: name, at: new Date().toISOString() });
    }
    return HttpResponse.json({ data: assemblyOut(slug, a), message: b.mode ? `${u.unit_name} hazirune eklendi.` : `${u.unit_name} hazirundan çıkarıldı.` });
  }),
  http.post(`${API}/meetings/:id/assembly/items/:itemId/:action`, async ({ request, params }) => {
    const slug = String(params.slug); const action = String(params.action); if (!["open", "close"].includes(action)) return;
    const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    const itemId = String(params.itemId);
    if (!(itemId in a.item_types)) return err(404, "not_found", "Gündem maddesi bulunamadı.");
    const v = a.votes[itemId] ?? (a.votes[itemId] = { status: "none", ballots: {}, result: null, opened_at: null, closed_at: null });
    if (action === "open") {
      if (v.status !== "none") return err(409, "invalid_status", "Bu maddenin oylaması zaten açıldı.");
      if (Object.values(a.votes).some((x) => x.status === "open")) return err(409, "voting_open", "Önce açık oylamayı kapatın.");
      const q = quorumOf(slug, a);
      if (!q.ok) return err(409, "no_quorum", `Toplantı nisabı sağlanamadı (kişi ${q.persons_present}/${q.persons_total}${q.person_ok ? " ✓" : " ✗"}, arsa payı %${(q.share_present / q.share_total * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}${q.share_ok ? " ✓" : " ✗"}). İkinci toplantı kuralını uygulayın.`);
      Object.assign(v, { status: "open", opened_at: new Date().toISOString() });
      return HttpResponse.json({ data: assemblyOut(slug, a), message: "Oylama açıldı." });
    }
    if (v.status !== "open") return err(409, "invalid_status", "Açık oylama yok.");
    const present = new Set(a.attendance.map((x) => x.unit_id));
    const missing = a.roster.filter((u) => present.has(u.unit_id) && !v.ballots[u.unit_id]).length;
    if (missing) return err(422, "missing_ballots", `${missing} katılımcının oyu girilmedi.`);
    Object.assign(v, { status: "closed", closed_at: new Date().toISOString(), result: tally(slug, a, itemId) });
    return HttpResponse.json({ data: assemblyOut(slug, a), message: `Oylama kapandı: ${v.result!.accepted ? "KABUL" : "RET"}.` });
  }),
  http.put(`${API}/meetings/:id/assembly/items/:itemId/ballots`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    const v = a.votes[String(params.itemId)];
    if (!v || v.status !== "open") return err(409, "invalid_status", "Oylama açık değil.");
    const b = (await request.json()) as { ballots?: Record<string, "for" | "against" | "abstain" | null> };
    const present = new Set(a.attendance.map((x) => x.unit_id));
    const next = { ...v.ballots };
    for (const [uid, val] of Object.entries(b.ballots ?? {})) {
      if (!present.has(uid)) return err(422, "validation", VALIDATION, { [`ballots.${uid}`]: "Hazirunda olmayan bölüm oy kullanamaz." });
      if (val === null) delete next[uid]; else if (["for", "against", "abstain"].includes(val)) next[uid] = val; else return err(422, "validation", VALIDATION, { [`ballots.${uid}`]: "Oy seçin." });
    }
    // Aynı malik (kişi) birden çok bölümünde farklı oy kullanamaz
    const byKey = new Map<string, string>();
    for (const u of a.roster) { const x = next[u.unit_id]; if (!x) continue; const prev = byKey.get(u.key); if (prev && prev !== x) return err(422, "owner_conflict", `${u.owners.join(", ")} birden çok bölümünde farklı oy kullanamaz.`); byKey.set(u.key, x); }
    v.ballots = next;
    return HttpResponse.json({ data: assemblyOut(slug, a), message: "Oylar kaydedildi." });
  }),
  // 77 — Tutanak ve karar defteri
  http.put(`${API}/meetings/:id/assembly/minutes`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    if (a.minutes.finalized_at) return err(409, "finalized", "Tutanak kesinleşti; sonuç ve oy sayıları değiştirilemez.");
    const b = (await request.json()) as { notes?: Record<string, string>; decisions?: Record<string, string>; opening?: string };
    Object.assign(a.minutes, { notes: { ...a.minutes.notes, ...(b.notes ?? {}) }, decisions: { ...a.minutes.decisions, ...(b.decisions ?? {}) }, opening: b.opening ?? a.minutes.opening });
    return HttpResponse.json({ data: assemblyOut(slug, a), message: "Tutanak taslağı kaydedildi." });
  }),
  http.post(`${API}/meetings/:id/assembly/minutes/finalize`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    if (a.minutes.finalized_at) return err(409, "finalized", "Tutanak zaten kesinleşti.");
    const m = await real<{ id: string; title: string; agenda: { id: string; order: number; title: string }[] }>(request, `/api/v1/sites/${slug}/meetings/${a.meeting_id}`);
    if (!m.body) return err(404, "not_found", "Toplantı bulunamadı.");
    const open = m.body.agenda.filter((i) => a.votes[i.id]?.status !== "closed");
    if (open.length) return err(422, "items_open", `Oylaması kapanmamış madde: ${open.map((i) => `${i.order}. ${i.title}`).join(", ")}.`);
    const q = quorumOf(slug, a);
    const att = `${q.persons_present}/${q.persons_total} malik (arsa payı %${(q.share_present / q.share_total * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}) katıldı veya vekille temsil edildi${a.second_call ? "; ikinci toplantı" : ""}.`;
    const items = m.body.agenda.map((i) => { const r = a.votes[i.id]!.result!; return { id: i.id, result: r.accepted ? "accepted" : "rejected", decision: (a.minutes.decisions[i.id] ?? "").trim() || (r.accepted ? "Kabul edildi." : "Reddedildi."), votes_for: r.persons.for, votes_against: r.persons.against, votes_abstain: r.persons.abstain }; });
    const w = await real(request, `/api/v1/sites/${slug}/meetings/${a.meeting_id}/decisions`, { method: "POST", body: { attendance_note: att, items } });
    if (w.status >= 300) return HttpResponse.json(w.body as Record<string, unknown>, { status: w.status });
    const book = listOf(decisionBook, slug);
    for (const i of m.body.agenda) { const r = a.votes[i.id]!.result!; if (!r.accepted) continue; book.push({ no: book.length + 1, meeting_id: a.meeting_id, meeting_title: m.body.title, date: today(), item_title: i.title, decision: items.find((x) => x.id === i.id)!.decision, result: "Kabul", type_name: r.type_name }); }
    Object.assign(a.minutes, { finalized_at: new Date().toISOString(), finalized_by: (await me(request)).name });
    return HttpResponse.json({ data: assemblyOut(slug, a), message: `Tutanak kesinleşti; ${items.filter((x) => x.result === "accepted").length} karar karar defterine işlendi.` });
  }),
  http.post(`${API}/meetings/:id/assembly/minutes/signed`, async ({ request, params }) => {
    const slug = String(params.slug); const a = await assemblyOf(request, slug, String(params.id)); if (a instanceof Response) return a;
    if (!a.minutes.finalized_at) return err(409, "not_finalized", "Önce tutanağı kesinleştirin.");
    const b = (await request.json()) as { file_name?: string };
    if (!/\.(pdf|jpg|jpeg|png)$/i.test(b.file_name ?? "")) return err(422, "validation", VALIDATION, { file_name: "PDF ya da görsel dosya adı." });
    a.minutes.signed_file = b.file_name!;
    return HttpResponse.json({ data: assemblyOut(slug, a), message: "İmzalı tutanak kaydedildi." });
  }),
  http.get(`${API}/decision-book`, ({ params }) => HttpResponse.json([...listOf(decisionBook, String(params.slug))].reverse())),
];

// ============================================================================================
// RAPORLAR, BELGELER VE KVKK (Yazılım Dokümanı RAP-01, 03, 04, 05) — servis istekleri 78–81
// ============================================================================================
interface DocVersion { v: number; file_name: string; mime: string; size: number; sha256: string; data: string; uploaded_by: string; at: string }
interface Doc { id: string; title: string; kind: string; scope: "site" | "block" | "unit"; scope_id: string | null; scope_name: string | null; confidentiality: "public" | "unit" | "management" | "secret"; valid_until: string | null; versions: DocVersion[]; created_at: string; access_log: { by: string; at: string; v: number }[] }
interface PrivacyReq { id: string; kind: "access" | "rectify" | "erase" | "object"; detail: string; user_id: string; name: string; units: string[]; snapshot: unknown; status: "open" | "answered"; created_at: string; due_on: string; response: string | null; outcome: "fulfilled" | "partial" | "rejected" | null; retained: string | null; answered_by: string | null; answered_at: string | null }
interface Notice { version: number; text: string; published_at: string; published_by: string; summary: string }
interface AuditPkg { id: string; title: string; from: string; to: string; created_by: string; created_at: string; decisions: { no: number; item_title: string; decision: string; date: string }[]; document_ids: string[]; status: "open" | "reviewed"; report_document_id: string | null; reviewed_by: string | null; reviewed_at: string | null; note: string | null }
const docs = loadMap<string, Doc[]>("docs");
const privacyReqs = loadMap<string, PrivacyReq[]>("privacyReqs");
const notices = loadMap<string, Notice[]>("notices");
const auditPkgs = loadMap<string, AuditPkg[]>("auditPkgs");
const DOC_KINDS = ["plan", "rules", "insurance", "fire_report", "elevator", "contract", "minutes", "financial", "other"];
// Furkan (25.10.2026): gider ekleriyle aynı sınır, 10 MB. Sahte servis dosyayı oturum deposunda tuttuğu için
// tarayıcı kotasını (~5 MB) aşan dosya sayfa yenilenince kaybolur; sınır sözleşmeye uygun tutuldu.
const MAX_DOC = 10 * 1024 * 1024;
async function permsOf(request: Request, slug: string) {
  const m = await real<{ sites: { slug: string; permissions: string[] }[] }>(request, "/api/v1/me");
  return new Set(m.body?.sites.find((s) => s.slug === slug)?.permissions ?? []);
}
function sniff(dataUrl: string) {
  const b64 = dataUrl.split(",")[1] ?? "";
  let head = "";
  try { head = atob(b64.slice(0, 16)); } catch { return null; }
  if (head.startsWith("%PDF")) return "application/pdf";
  if (head.charCodeAt(0) === 0x89 && head.slice(1, 4) === "PNG") return "image/png";
  if (head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8) return "image/jpeg";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}
async function sha256Hex(dataUrl: string) {
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const docOut = (d: Doc) => { const last = d.versions.at(-1)!; const left = d.valid_until ? Math.round((new Date(d.valid_until + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 864e5) : null; return { id: d.id, title: d.title, kind: d.kind, scope: d.scope, scope_name: d.scope_name, confidentiality: d.confidentiality, valid_until: d.valid_until, days_left: left, warning: left == null ? null : left < 0 ? "expired" : left <= 30 ? "30" : left <= 60 ? "60" : null, version: last.v, file_name: last.file_name, size: last.size, sha256: last.sha256, uploaded_by: last.uploaded_by, updated_at: last.at, versions: d.versions.map(({ data: _d, ...v }) => v) }; };

const CATALOG = [
  { key: "income_expense", name: "Gelir–gider", group: "Finans", permission: "finance.reports.read", link: "raporlar", metrics: [["Gelir", "Dönemde yapılan tahsilatlar (tahakkuk değil)."], ["Gider", "Dönemde kaydedilen, ters kaydı olmayan giderler; fon/kategori bazında."]] },
  { key: "collections", name: "Tahsilat oranı ve trendi", group: "Finans", permission: "finance.reports.read", link: "raporlar", metrics: [["Tahsilat oranı", "Dönemde tahsil edilen / dönemde vadesi gelen."]] },
  { key: "aging", name: "Borç yaşlandırma", group: "Finans", permission: "finance.read", link: "borclular", metrics: [["Yaş dilimi", "En eski açık borcun vadesinden bugüne gün: 0–30 / 31–60 / 61–90 / 90+."]] },
  { key: "budget", name: "Bütçe–gerçekleşme", group: "Finans", permission: "finance.read", link: "isletme-projesi", metrics: [["Gerçekleşme oranı", "Kategoride bu yıl gerçekleşen gider / işletme projesindeki yıllık tutar."]] },
  { key: "cash", name: "Kasa ve banka özeti", group: "Finans", permission: "finance.cash.read", link: "kasa", metrics: [["Bakiye", "Hesap hareketlerinden hesaplanır; saklanmaz."]] },
  { key: "requests_sla", name: "Talep ve SLA", group: "Operasyon", permission: "requests.read", link: "rapor-katalogu?rapor=requests_sla", metrics: [["SLA uyumu", "Dönemde kapanan taleplerden SLA süresi içinde çözülenlerin oranı."], ["Ortalama çözüm süresi", "Açılıştan çözüme geçen takvim saati ortalaması."], ["Memnuniyet", "Sakin kapanış puanlarının ortalaması (1–5)."]] },
  { key: "security", name: "Güvenlik ve devriye", group: "Operasyon", permission: "security.incidents", link: "guvenlik?sekme=devriye", metrics: [["Devriye tamamlama", "Okutulan nokta / plandaki nokta."]] },
  { key: "hr", name: "Puantaj ve izin", group: "İK", permission: "staff.manage", link: "puantaj", metrics: [["Fazla mesai", "Vardiya süresini aşan çalışma saatleri."]] },
  { key: "purchasing", name: "Satın alma ve sözleşme karnesi", group: "Satın alma", permission: "expenses.read", link: "satin-alma", metrics: [["Talep–sipariş süresi", "Talep açılışından siparişe gün."], ["Tedarikçi puanı", "Kabul puanlarının ortalaması."]] },
  { key: "facility", name: "Tesis kullanımı", group: "Operasyon", permission: "requests.assign", link: "rezervasyon?sekme=rapor", metrics: [["Doluluk", "Kullanılan saat / açık saat × kapasite."], ["Gelmedi oranı", "Doğrulama yapılan alanlarda gelinmeyen / biten rezervasyon."]] },
  { key: "meters", name: "Sayaç ve tüketim", group: "Operasyon", permission: "units.manage", link: "sayaclar", metrics: [["Tüketim", "(Endeks − önceki endeks) × çarpan."]] },
  { key: "audit", name: "Denetim kaydı", group: "Yönetim", permission: "audit.read", link: "denetim", metrics: [["Kayıt", "Kim, ne zaman, neyi değiştirdi."]] },
];

const raporlar: RequestHandler[] = [
  // 78 — Belge arşivi
  http.get(`${API}/documents`, ({ request, params }) => {
    const u = new URL(request.url).searchParams; const q = (u.get("q") ?? "").toLocaleLowerCase("tr-TR"), kind = u.get("kind"), exp = u.get("expiring");
    return HttpResponse.json(listOf(docs, String(params.slug)).map(docOut).filter((d) => (!q || d.title.toLocaleLowerCase("tr-TR").includes(q)) && (!kind || d.kind === kind) && (!exp || d.warning)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }),
  http.post(`${API}/documents`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { title?: string; kind?: string; scope?: Doc["scope"]; scope_id?: string | null; scope_name?: string | null; confidentiality?: Doc["confidentiality"]; valid_until?: string | null; file_name?: string; data_url?: string };
    const f: Record<string, string> = {};
    const title = (b.title ?? "").trim();
    if (title.length < 3) f.title = "Belge adını yazın.";
    if (!DOC_KINDS.includes(b.kind ?? "")) f.kind = "Tür seçin.";
    if (!["site", "block", "unit"].includes(b.scope ?? "")) f.scope = "Kapsam seçin."; else if (b.scope !== "site" && !b.scope_id) f.scope = "Blok ya da bölüm seçin.";
    if (!["public", "unit", "management", "secret"].includes(b.confidentiality ?? "")) f.confidentiality = "Gizlilik seçin.";
    if (b.confidentiality === "unit" && b.scope !== "unit") f.confidentiality = "Bölüme özel belge bir bölüme bağlı olmalı.";
    if (b.valid_until && (!DATE_RE.test(b.valid_until))) f.valid_until = "Tarih seçin.";
    const mime = b.data_url ? sniff(b.data_url) : null;
    const size = b.data_url ? Math.floor(((b.data_url.split(",")[1] ?? "").length * 3) / 4) : 0;
    if (!b.data_url) f.file = "Dosya seçin.";
    else if (!mime) f.file = "Yalnız PDF, PNG, JPEG ya da WebP (dosya içeriği doğrulandı).";
    else if (size > MAX_DOC) f.file = "Dosya en fazla 10 MB.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const who = (await me(request)).name;
    const v: DocVersion = { v: 1, file_name: (b.file_name ?? "belge").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120), mime: mime!, size, sha256: await sha256Hex(b.data_url!), data: b.data_url!, uploaded_by: who, at: new Date().toISOString() };
    const list = listOf(docs, slug);
    const same = list.find((d) => d.title.toLocaleLowerCase("tr-TR") === title.toLocaleLowerCase("tr-TR") && d.scope === b.scope && (d.scope_id ?? null) === (b.scope_id ?? null));
    if (same) {
      if (same.versions.at(-1)!.sha256 === v.sha256) return err(409, "same_file", "Bu dosya son sürümle aynı.");
      v.v = same.versions.length + 1; same.versions.push(v); Object.assign(same, { valid_until: b.valid_until ?? same.valid_until, confidentiality: b.confidentiality, kind: b.kind });
      return HttpResponse.json({ data: docOut(same), message: `${same.title} için ${v.v}. sürüm kaydedildi; eski sürümler korunur.` }, { status: 201 });
    }
    const d: Doc = { id: crypto.randomUUID(), title, kind: b.kind!, scope: b.scope!, scope_id: b.scope === "site" ? null : b.scope_id!, scope_name: b.scope === "site" ? null : b.scope_name ?? null, confidentiality: b.confidentiality!, valid_until: b.valid_until || null, versions: [v], created_at: v.at, access_log: [] };
    list.push(d);
    return HttpResponse.json({ data: docOut(d), message: `${d.title} arşive eklendi.` }, { status: 201 });
  }),
  http.get(`${API}/documents/:id/versions/:v/download`, async ({ request, params }) => {
    const slug = String(params.slug); const d = listOf(docs, slug).find((x) => x.id === params.id);
    const v = d?.versions.find((x) => x.v === Number(params.v));
    if (!d || !v) return err(404, "not_found", "Belge bulunamadı.");
    if (d.confidentiality === "secret") { const p = await permsOf(request, slug); if (!p.has("audit.read") && !p.has("members.manage")) return err(404, "not_found", "Belge bulunamadı."); d.access_log.push({ by: (await me(request)).name, at: new Date().toISOString(), v: v.v }); }
    return HttpResponse.json({ file_name: v.file_name, mime: v.mime, data_url: v.data });
  }),
  http.get(`${API}/documents/:id/access-log`, ({ params }) => { const d = listOf(docs, String(params.slug)).find((x) => x.id === params.id); return d ? HttpResponse.json(d.access_log.slice().reverse()) : err(404, "not_found", "Belge bulunamadı."); }),
  http.get(`${API}/resident/documents`, async ({ request, params }) => {
    const slug = String(params.slug); const mine = await myUnits(request, slug);
    if (mine.status !== 200) return err(403, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const unitIds = new Set(mine.units.map((u) => u.unit_id));
    return HttpResponse.json(listOf(docs, slug).filter((d) => d.confidentiality === "public" || (d.confidentiality === "unit" && d.scope_id && unitIds.has(d.scope_id))).map(docOut).map(({ versions: _v, uploaded_by: _u, sha256: _s, ...x }) => x));
  }),
  http.get(`${API}/resident/documents/:id/download`, async ({ request, params }) => {
    const slug = String(params.slug); const mine = await myUnits(request, slug);
    const d = listOf(docs, slug).find((x) => x.id === params.id);
    const ok = d && (d.confidentiality === "public" || (d.confidentiality === "unit" && mine.units.some((u) => u.unit_id === d.scope_id)));
    if (!ok) return err(404, "not_found", "Belge bulunamadı.");
    const v = d!.versions.at(-1)!;
    return HttpResponse.json({ file_name: v.file_name, mime: v.mime, data_url: v.data });
  }),

  // 79 — Rapor kataloğu ve talep/SLA raporu
  http.get(`${API}/reports/catalog`, async ({ request, params }) => {
    const p = await permsOf(request, String(params.slug));
    return HttpResponse.json(CATALOG.filter((r) => p.has(r.permission)).map((r) => ({ ...r, metrics: r.metrics.map(([name, definition]) => ({ name, definition })) })));
  }),
  http.get(`${API}/reports/requests-sla`, async ({ request, params }) => {
    const slug = String(params.slug);
    const p = await permsOf(request, slug);
    if (!p.has("requests.read")) return err(403, "forbidden", "Bu raporu görme yetkiniz yok.");
    const u = new URL(request.url).searchParams; const to = u.get("to") ?? today(), from = u.get("from") ?? addDays(to, -29);
    const rows = (await allPages<ReqRow>(request, `/api/v1/sites/${slug}/requests`)).filter((r) => dayOf(r.created_at) >= from && dayOf(r.created_at) <= to);
    const cats = [...new Set(rows.map((r) => r.category))];
    const rated = listOf(ratings, slug);
    const line = (list: ReqRow[]) => {
      const closed = list.filter((r) => ["resolved", "closed"].includes(r.status) && r.resolved_at);
      const met = closed.filter((r) => slaOf(slug, r).state === "met").length;
      const hours = closed.map((r) => (new Date(r.resolved_at!).getTime() - new Date(r.created_at).getTime()) / 3600e3).filter((h) => h >= 0); // çözüm zamanı açılıştan önce olan (bozuk) kayıtlar ortalamaya girmez
      const sc = rated.filter((x) => list.some((r) => r.id === x.request_id) && x.score != null).map((x) => x.score!);
      return { total: list.length, open: list.filter((r) => !["resolved", "closed", "cancelled"].includes(r.status)).length, closed: closed.length, sla_rate: closed.length ? Math.round((met / closed.length) * 100) : null, avg_hours: hours.length ? Math.round((hours.reduce((s, x) => s + x, 0) / hours.length) * 10) / 10 : null, satisfaction: sc.length ? Math.round((sc.reduce((s, x) => s + x, 0) / sc.length) * 10) / 10 : null, rated: sc.length };
    };
    return HttpResponse.json({ from, to, total: line(rows), rows: cats.map((c) => ({ category: c, ...line(rows.filter((r) => r.category === c)) })).sort((a, b) => b.total - a.total) });
  }),

  // 80 — KVKK: ilgili kişi başvurusu ve aydınlatma metni sürümleri
  http.post(`${API}/resident/privacy-requests`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { kind?: PrivacyReq["kind"]; detail?: string };
    const f: Record<string, string> = {};
    if (!["access", "rectify", "erase", "object"].includes(b.kind ?? "")) f.kind = "Başvuru türünü seçin.";
    if ((b.detail ?? "").trim().length < (b.kind === "access" ? 0 : 10)) f.detail = "Talebinizi kısaca açıklayın.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const m0 = await me(request);
    const home = await real<{ units: { unit_id: string; unit_name: string; role: string }[]; accounts: unknown[]; recent_entries: unknown[] }>(request, `/api/v1/sites/${slug}/resident/home`);
    if (home.status !== 200) return err(403, "forbidden", "Başvuru sakin hesabıyla yapılır.");
    if (listOf(privacyReqs, slug).some((x) => x.user_id === m0.id && x.kind === b.kind && x.status === "open")) return err(409, "already_open", "Aynı türde açık başvurunuz var.");
    const profile = await real<Record<string, unknown>>(request, "/api/v1/me");
    const r: PrivacyReq = { id: crypto.randomUUID(), kind: b.kind!, detail: (b.detail ?? "").trim(), user_id: m0.id, name: m0.name, units: home.body!.units.map((u) => u.unit_name), snapshot: { kisi: { ad: profile.body?.full_name, eposta: profile.body?.email ?? null }, bolumler: home.body!.units, hesaplar: home.body!.accounts, son_hareketler: home.body!.recent_entries, hazirlanma: new Date().toISOString() }, status: "open", created_at: new Date().toISOString(), due_on: addDays(today(), 30), response: null, outcome: null, retained: null, answered_by: null, answered_at: null };
    listOf(privacyReqs, slug).push(r);
    return HttpResponse.json({ data: { id: r.id, due_on: r.due_on }, message: `Başvurunuz alındı; en geç ${r.due_on.split("-").reverse().join(".")} tarihine kadar yanıtlanır (30 gün).` }, { status: 201 });
  }),
  http.get(`${API}/resident/privacy-requests`, async ({ request, params }) => { const id = (await me(request)).id; return HttpResponse.json(listOf(privacyReqs, String(params.slug)).filter((x) => x.user_id === id).map(({ snapshot: _s, ...x }) => x).reverse()); }),
  http.get(`${API}/privacy-requests`, ({ params }) => HttpResponse.json(listOf(privacyReqs, String(params.slug)).map(({ snapshot: _s, ...x }) => ({ ...x, days_left: Math.round((new Date(x.due_on + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 864e5) })).sort((a, b) => (a.status === b.status ? a.due_on.localeCompare(b.due_on) : a.status === "open" ? -1 : 1)))),
  http.get(`${API}/privacy-requests/:id/data-package`, ({ params }) => { const r = listOf(privacyReqs, String(params.slug)).find((x) => x.id === params.id); return r ? HttpResponse.json(r.snapshot as Record<string, unknown>) : err(404, "not_found", "Başvuru bulunamadı."); }),
  http.post(`${API}/privacy-requests/:id/answer`, async ({ request, params }) => {
    const r = listOf(privacyReqs, String(params.slug)).find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Başvuru bulunamadı.");
    if (r.status !== "open") return err(409, "invalid_status", "Başvuru yanıtlanmış.");
    const b = (await request.json()) as { response?: string; outcome?: PrivacyReq["outcome"]; retained?: string };
    const f: Record<string, string> = {};
    if ((b.response ?? "").trim().length < 10) f.response = "Gerekçeli yanıt yazın.";
    if (!["fulfilled", "partial", "rejected"].includes(b.outcome ?? "")) f.outcome = "Sonucu seçin.";
    if (r.kind === "erase" && b.outcome !== "fulfilled" && !(b.retained ?? "").trim()) f.retained = "Saklanan kayıtları ve yasal dayanağı yazın (ör. finansal kayıtlar 10 yıl).";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    Object.assign(r, { status: "answered", response: b.response!.trim(), outcome: b.outcome, retained: b.retained?.trim() || null, answered_by: (await me(request)).name, answered_at: new Date().toISOString() });
    return HttpResponse.json({ data: { ...r, snapshot: undefined }, message: "Başvuru yanıtlandı; kişiye bildirim gider (K5)." });
  }),
  http.get(`${API}/privacy-notices`, ({ params }) => HttpResponse.json([...listOf(notices, String(params.slug))].reverse())),
  http.post(`${API}/privacy-notices`, async ({ request, params }) => {
    const b = (await request.json()) as { text?: string; summary?: string };
    if ((b.text ?? "").trim().length < 200) return err(422, "validation", VALIDATION, { text: "Aydınlatma metni çok kısa (en az 200 karakter)." });
    if ((b.summary ?? "").trim().length < 5) return err(422, "validation", VALIDATION, { summary: "Değişiklik özetini yazın." });
    const l = listOf(notices, String(params.slug));
    const n: Notice = { version: l.length + 1, text: b.text!.trim(), summary: b.summary!.trim(), published_at: new Date().toISOString(), published_by: (await me(request)).name };
    l.push(n);
    return HttpResponse.json({ data: n, message: `Aydınlatma metni sürüm ${n.version} yayınlandı; eski sürümler saklanır.` }, { status: 201 });
  }),

  // 81 — Denetim kurulu paketi
  http.get(`${API}/audit-packages`, ({ params }) => HttpResponse.json([...listOf(auditPkgs, String(params.slug))].reverse())),
  http.post(`${API}/audit-packages`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { title?: string; from?: string; to?: string; document_ids?: string[] };
    const f: Record<string, string> = {};
    if ((b.title ?? "").trim().length < 3) f.title = "Paket adını yazın.";
    if (!b.from || !DATE_RE.test(b.from)) f.from = "Başlangıç tarihi."; if (!b.to || !DATE_RE.test(b.to) || (b.from && b.to < b.from)) f.to = "Bitiş başlangıçtan önce olamaz.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const decisions = listOf(decisionBook, slug).filter((e) => e.date >= b.from! && e.date <= b.to!).map((e) => ({ no: e.no, item_title: e.item_title, decision: e.decision, date: e.date }));
    const docIds = (b.document_ids ?? []).filter((id) => listOf(docs, slug).some((d) => d.id === id));
    const p: AuditPkg = { id: crypto.randomUUID(), title: b.title!.trim(), from: b.from!, to: b.to!, created_by: (await me(request)).name, created_at: new Date().toISOString(), decisions, document_ids: docIds, status: "open", report_document_id: null, reviewed_by: null, reviewed_at: null, note: null };
    listOf(auditPkgs, slug).push(p);
    return HttpResponse.json({ data: p, message: `Denetim paketi hazırlandı: ${decisions.length} karar, ${docIds.length} belge.` }, { status: 201 });
  }),
  http.post(`${API}/audit-packages/:id/report`, async ({ request, params }) => {
    const slug = String(params.slug); const p = listOf(auditPkgs, slug).find((x) => x.id === params.id);
    if (!p) return err(404, "not_found", "Paket bulunamadı.");
    if (p.status === "reviewed") return err(409, "invalid_status", "Denetim raporu zaten yüklendi.");
    const perms = await permsOf(request, slug);
    if (!perms.has("audit.read")) return err(403, "forbidden", "Denetim raporunu denetçi yükler.");
    const b = (await request.json()) as { document_id?: string; note?: string };
    const d = listOf(docs, slug).find((x) => x.id === b.document_id);
    if (!d) return err(422, "validation", VALIDATION, { document_id: "Denetim raporu belgesini seçin." });
    Object.assign(p, { status: "reviewed", report_document_id: d.id, reviewed_by: (await me(request)).name, reviewed_at: new Date().toISOString(), note: b.note?.trim() || null });
    return HttpResponse.json({ data: p, message: "Denetim raporu pakete eklendi; paket arşivlendi." });
  }),
];

// ============================================================================================
// PLATFORM DESTEK (Yazılım Dokümanı PYN-04, PYN-06) — servis istekleri 82–84
// ============================================================================================
interface TicketMsg { by: string; side: "customer" | "support"; body: string; at: string }
interface Ticket {
  id: string; number: string; site_slug: string; site_name: string; category: string; priority: "critical" | "high" | "normal"; title: string;
  context: { path: string; app_version: string; user_agent: string; correlation_id: string };
  status: "open" | "answered" | "waiting_customer" | "resolved" | "closed"; messages: TicketMsg[]; created_by: string; created_at: string;
  first_response_at: string | null; resolved_at: string | null;
}
interface Article { id: string; title: string; body: string; audience: "staff" | "resident"; screens: string[]; helpful: number; not_helpful: number; updated_at: string; updated_by: string }
interface SupportSession { id: string; site_slug: string; site_name: string; reason: string; hours: number; requested_by: string; requested_at: string; status: "pending" | "active" | "rejected" | "expired"; decided_by: string | null; decided_at: string | null; ends_at: string | null; reject_reason: string | null }
const tickets = loadMap<string, Ticket[]>("tickets"); // "platform" → tüm siteler
const articles = loadMap<string, Article[]>("articles");
const supportSessions = loadMap<string, SupportSession[]>("supportSessions");
const TICKET_SLA: Record<Ticket["priority"], { first: number; resolve: number }> = { critical: { first: 1, resolve: 8 }, high: { first: 4, resolve: 24 }, normal: { first: 8, resolve: 72 } };
const TICKET_CATS = ["login", "payment", "finance", "import", "security", "other"];
const slaState = (t: Ticket) => {
  const s = TICKET_SLA[t.priority]; const c = new Date(t.created_at).getTime(); const now = Date.now();
  const firstDue = c + s.first * 3600e3, resolveDue = c + s.resolve * 3600e3;
  return { first_due: new Date(firstDue).toISOString(), resolve_due: new Date(resolveDue).toISOString(), first_breached: (t.first_response_at ? new Date(t.first_response_at).getTime() : now) > firstDue, resolve_breached: (t.resolved_at ? new Date(t.resolved_at).getTime() : now) > resolveDue };
};
const ticketOut = (t: Ticket) => ({ ...t, sla: slaState(t) });
const sessTick = () => { for (const s of listOf(supportSessions, "platform")) if (s.status === "active" && s.ends_at! < new Date().toISOString()) s.status = "expired"; };
async function isPlatformAdmin(request: Request) { const m = await real<{ is_platform_admin: boolean; full_name: string }>(request, "/api/v1/me"); return m.body?.is_platform_admin ? m.body.full_name : null; }

const platformDestek: RequestHandler[] = [
  // 82 — Destek biletleri (müşteri)
  http.get(`${API}/support-tickets`, ({ params }) => HttpResponse.json(listOf(tickets, "platform").filter((t) => t.site_slug === params.slug).map(ticketOut).reverse())),
  http.post(`${API}/support-tickets`, async ({ request, params }) => {
    const slug = String(params.slug);
    const b = (await request.json()) as { title?: string; body?: string; category?: string; priority?: Ticket["priority"]; context?: Partial<Ticket["context"]> };
    const f: Record<string, string> = {};
    if ((b.title ?? "").trim().length < 5) f.title = "Konuyu yazın.";
    if ((b.body ?? "").trim().length < 10) f.body = "Sorunu kısaca anlatın.";
    if (!TICKET_CATS.includes(b.category ?? "")) f.category = "Kategori seçin.";
    if (!["critical", "high", "normal"].includes(b.priority ?? "")) f.priority = "Öncelik seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const site = await real<{ name: string }>(request, `/api/v1/sites/${slug}`);
    const who = (await me(request)).name; const all = listOf(tickets, "platform");
    const t: Ticket = { id: crypto.randomUUID(), number: `DST-${String(all.length + 1).padStart(4, "0")}`, site_slug: slug, site_name: site.body?.name ?? slug, category: b.category!, priority: b.priority!, title: b.title!.trim(), context: { path: String(b.context?.path ?? "").slice(0, 200), app_version: String(b.context?.app_version ?? "").slice(0, 40), user_agent: String(b.context?.user_agent ?? "").slice(0, 200), correlation_id: crypto.randomUUID().slice(0, 8) }, status: "open", messages: [{ by: who, side: "customer", body: b.body!.trim(), at: new Date().toISOString() }], created_by: who, created_at: new Date().toISOString(), first_response_at: null, resolved_at: null };
    all.push(t);
    return HttpResponse.json({ data: ticketOut(t), message: `${t.number} açıldı.${t.priority === "critical" ? " Kritik öncelik: paket 7/24 destek içeriyorsa nöbet hattına düşer." : ""}` }, { status: 201 });
  }),
  http.post(`${API}/support-tickets/:id/messages`, async ({ request, params }) => {
    const t = listOf(tickets, "platform").find((x) => x.id === params.id && x.site_slug === params.slug);
    if (!t) return err(404, "not_found", "Bilet bulunamadı.");
    if (t.status === "closed") return err(409, "closed", "Bilet kapandı; yeni bilet açın.");
    const b = (await request.json()) as { body?: string };
    if ((b.body ?? "").trim().length < 2) return err(422, "validation", VALIDATION, { body: "Mesaj yazın." });
    t.messages.push({ by: (await me(request)).name, side: "customer", body: b.body!.trim(), at: new Date().toISOString() });
    if (t.status !== "open") t.status = "open";
    return HttpResponse.json({ data: ticketOut(t), message: "Mesaj gönderildi." });
  }),
  http.post(`${API}/support-tickets/:id/close`, async ({ params }) => {
    const t = listOf(tickets, "platform").find((x) => x.id === params.id && x.site_slug === params.slug);
    if (!t) return err(404, "not_found", "Bilet bulunamadı.");
    if (t.status !== "resolved") return err(409, "invalid_status", "Bilet çözüldü olarak işaretlenmedi.");
    t.status = "closed";
    return HttpResponse.json({ data: ticketOut(t), message: "Bilet kapandı. Teşekkürler." });
  }),
  // 82 — Destek biletleri (platform)
  http.get("/api/v1/platform/support-tickets", async ({ request }) => {
    if (!(await isPlatformAdmin(request))) return err(404, "not_found", "Bulunamadı.");
    const st = new URL(request.url).searchParams.get("status");
    return HttpResponse.json(listOf(tickets, "platform").filter((t) => !st || t.status === st).map(ticketOut).sort((a, b) => (a.priority === b.priority ? b.created_at.localeCompare(a.created_at) : a.priority === "critical" ? -1 : b.priority === "critical" ? 1 : a.priority === "high" ? -1 : 1)));
  }),
  http.post("/api/v1/platform/support-tickets/:id/messages", async ({ request, params }) => {
    const who = await isPlatformAdmin(request); if (!who) return err(404, "not_found", "Bulunamadı.");
    const t = listOf(tickets, "platform").find((x) => x.id === params.id);
    if (!t) return err(404, "not_found", "Bilet bulunamadı.");
    const b = (await request.json()) as { body?: string; status?: "answered" | "waiting_customer" | "resolved" };
    if ((b.body ?? "").trim().length < 2) return err(422, "validation", VALIDATION, { body: "Yanıt yazın." });
    t.messages.push({ by: `${who} (destek)`, side: "support", body: b.body!.trim(), at: new Date().toISOString() });
    t.first_response_at ??= new Date().toISOString();
    t.status = b.status ?? "answered";
    if (t.status === "resolved") t.resolved_at = new Date().toISOString();
    return HttpResponse.json({ data: ticketOut(t), message: "Yanıt gönderildi." });
  }),

  // 83 — Bilgi bankası
  http.get("/api/v1/knowledge-articles", ({ request }) => {
    const u = new URL(request.url).searchParams; const q = (u.get("q") ?? "").toLocaleLowerCase("tr-TR"), screen = u.get("screen"), aud = u.get("audience");
    return HttpResponse.json(listOf(articles, "platform").filter((a) => (!aud || a.audience === aud) && (!q || `${a.title} ${a.body}`.toLocaleLowerCase("tr-TR").includes(q)) && (!screen || a.screens.some((s) => screen.startsWith(s)))).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }),
  http.post("/api/v1/knowledge-articles/:id/feedback", async ({ request, params }) => {
    const a = listOf(articles, "platform").find((x) => x.id === params.id);
    if (!a) return err(404, "not_found", "Makale bulunamadı.");
    const b = (await request.json()) as { helpful?: boolean };
    if (b.helpful) a.helpful++; else a.not_helpful++;
    return HttpResponse.json({ data: a, message: "Geri bildiriminiz için teşekkürler." });
  }),
  ...(["post", "patch"] as const).map((verb) => http[verb](verb === "post" ? "/api/v1/platform/knowledge-articles" : "/api/v1/platform/knowledge-articles/:id", async ({ request, params }) => {
    const who = await isPlatformAdmin(request); if (!who) return err(404, "not_found", "Bulunamadı.");
    const list = listOf(articles, "platform"); const cur = verb === "patch" ? list.find((x) => x.id === params.id) : undefined;
    if (verb === "patch" && !cur) return err(404, "not_found", "Makale bulunamadı.");
    const b = { ...(cur ?? {}), ...((await request.json()) as Partial<Article>) };
    const f: Record<string, string> = {};
    if ((b.title ?? "").trim().length < 5) f.title = "Başlık yazın.";
    if ((b.body ?? "").trim().length < 30) f.body = "Makale en az 30 karakter.";
    if (!["staff", "resident"].includes(b.audience ?? "")) f.audience = "Okuyucu seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const a: Article = { id: cur?.id ?? crypto.randomUUID(), title: b.title!.trim(), body: b.body!.trim(), audience: b.audience!, screens: (b.screens ?? []).map((s) => s.trim().replace(/^\/+/, "")).filter(Boolean), helpful: cur?.helpful ?? 0, not_helpful: cur?.not_helpful ?? 0, updated_at: new Date().toISOString(), updated_by: who };
    if (cur) Object.assign(cur, a); else list.push(a);
    return HttpResponse.json({ data: a, message: verb === "post" ? "Makale yayınlandı." : "Makale güncellendi." }, { status: verb === "post" ? 201 : 200 });
  })),

  // 84 — Destek oturumu (müşteri onaylı, süreli, salt okunur)
  http.post("/api/v1/platform/support-sessions", async ({ request }) => {
    const who = await isPlatformAdmin(request); if (!who) return err(404, "not_found", "Bulunamadı.");
    const b = (await request.json()) as { site_slug?: string; site_name?: string; reason?: string; hours?: number };
    const f: Record<string, string> = {};
    if (!b.site_slug) f.site_slug = "Tesis seçin.";
    if ((b.reason ?? "").trim().length < 10) f.reason = "Gerekçeyi yazın (bilet no ile).";
    if (!(Number.isInteger(Number(b.hours)) && Number(b.hours) >= 1 && Number(b.hours) <= 24)) f.hours = "Süre 1–24 saat.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    sessTick();
    if (listOf(supportSessions, "platform").some((s) => s.site_slug === b.site_slug && ["pending", "active"].includes(s.status))) return err(409, "exists", "Bu tesis için bekleyen ya da aktif oturum var.");
    const s: SupportSession = { id: crypto.randomUUID(), site_slug: b.site_slug!, site_name: b.site_name ?? b.site_slug!, reason: b.reason!.trim(), hours: Number(b.hours), requested_by: who, requested_at: new Date().toISOString(), status: "pending", decided_by: null, decided_at: null, ends_at: null, reject_reason: null };
    listOf(supportSessions, "platform").push(s);
    return HttpResponse.json({ data: s, message: "Oturum talebi tesis yöneticisinin onayına gönderildi." }, { status: 201 });
  }),
  http.get("/api/v1/platform/support-sessions", async ({ request }) => { if (!(await isPlatformAdmin(request))) return err(404, "not_found", "Bulunamadı."); sessTick(); return HttpResponse.json([...listOf(supportSessions, "platform")].reverse()); }),
  http.get(`${API}/support-sessions`, ({ params }) => { sessTick(); return HttpResponse.json(listOf(supportSessions, "platform").filter((s) => s.site_slug === params.slug).reverse()); }),
  http.get(`${API}/support-sessions/active`, ({ params }) => { sessTick(); return HttpResponse.json(listOf(supportSessions, "platform").find((s) => s.site_slug === params.slug && s.status === "active") ?? null); }),
  http.post(`${API}/support-sessions/:id/:action`, async ({ request, params }) => {
    const action = String(params.action); if (!["approve", "reject", "end"].includes(action)) return;
    sessTick();
    const s = listOf(supportSessions, "platform").find((x) => x.id === params.id && x.site_slug === params.slug);
    if (!s) return err(404, "not_found", "Oturum bulunamadı.");
    const perms = await permsOf(request, String(params.slug));
    if (!perms.has("members.manage")) return err(403, "forbidden", "Destek oturumunu tesis yöneticisi onaylar.");
    const who = (await me(request)).name;
    if (action === "end") { if (s.status !== "active") return err(409, "invalid_status", "Aktif oturum yok."); Object.assign(s, { status: "expired", ends_at: new Date().toISOString() }); return HttpResponse.json({ data: s, message: "Destek oturumu sonlandırıldı." }); }
    if (s.status !== "pending") return err(409, "invalid_status", "Oturum karara bağlanmış.");
    if (action === "reject") { const b = (await request.json().catch(() => ({}))) as { reason?: string }; Object.assign(s, { status: "rejected", decided_by: who, decided_at: new Date().toISOString(), reject_reason: b.reason?.trim() || null }); return HttpResponse.json({ data: s, message: "Oturum talebi reddedildi; oturum açılmadı." }); }
    Object.assign(s, { status: "active", decided_by: who, decided_at: new Date().toISOString(), ends_at: new Date(Date.now() + s.hours * 3600e3).toISOString() });
    return HttpResponse.json({ data: s, message: `Destek oturumu ${s.hours} saat için açıldı (salt okunur); işlemler denetim kaydına "destek oturumu" olarak yazılır.` });
  }),
];

export const handlers: RequestHandler[] = [...ortakOnbellek, ...finans, ...ik, ...guvenlik, ...hizmet, ...operasyon, ...rezervasyon, ...satinalma, ...sozlesme, ...iletisim, ...genelKurul, ...raporlar, ...platformDestek];
