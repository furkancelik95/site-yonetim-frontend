// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26, YAP-01..10) backend'de; buradan kaldırıldı.
// Yalnız diğer sahte paketlerin kullandığı ortak alan ve araç önbelleği kaldı (aşağıda).
// Güvenlik ve devriye (40–46: kapılar, ön davet, sakin onayı, plaka/ihlal, kargo yetkilisi, nöbet defteri,
// devriye) ve park yerleri (K30) backend'de — sahte uçları silindi (25.10.2026).
//
// Backend'e geçti, handler'ı kaldırıldı: İletişim ve acil durum 71–74 (okuma onayı ve raporu, zamanlanmış
// duyuru, bildirim/duyuru şablonları, acil durum modu ve pano, toplanma yoklaması, acil bilgi kartı) — P12;
// 71'in sessiz saat ayarı (`communication-settings`; P16c kimlik ve bildirim gönderimi ile — SMS hesabı,
// teslim kayıtları, planlı raporlar). Raporlar ve KVKK 79–81 (rapor kataloğu, talep/SLA raporu, KVKK başvurusu, aydınlatma
// metni sürümleri, saklama politikası, denetim paketi). İnsan kaynakları 35–39 (sicil no ve açık işler, vardiya planı,
// izinler, puantaj, puantaj aktarımı; K29 personel hesabı ve giriş-çıkış dahil); Finans Mod P 27–34
// (dönem kapanışı ve kilit, kasa gün sonu, borç takibi, ödeme planı, dönem dışı ücretler, muhasebe
// aktarımı, finans parametreleri, tahakkuk fark raporu). Finans motoru P03b (otomatik tahakkuk 04, finans
// parametreleri 33, fark raporu 34; aidat kuralları, tahakkuk taslak/onay ve satır düzeltme, yıllık bütçe)
// baştan gerçek uçlarla bağlandı — burada sahte karşılığı yok.
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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

// ============================================================================================
// Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26) backend'de. Diğer sahte paketlerin
// kullandığı ortak alanlar ve araçlar gerçek uçlardan okunup buraya önbelleğe alınır
// (rezervasyon ve kapı/plaka sahte uçları bu listeye bakar).
// ============================================================================================
interface CommonArea { id: string; name: string; kind: string; block_id: string | null; block_name: string | null; is_reservable: boolean; is_active: boolean; note: string | null }
interface Vehicle { id: string; plate: string; plate_display: string; unit_id: string; unit_name: string; owner_name: string | null; kind: "permanent" | "guest"; valid_until: string | null; status: "active" | "pending" | "inactive" }
const commonAreas = loadMap<string, CommonArea[]>("commonAreas");
const vehicles = loadMap<string, Vehicle[]>("vehicles");

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
// Ortak yardımcılar — Finans Mod P (27–34) gerçek backend'e geçti. Aşağıdaki sahte modüller (ücretli
// hizmet, rezervasyon, tadilat izni) ücreti hâlâ kendi sahte deposuna yazar; o paketler backend'e
// geçince backend iç servisi (`ad_hoc_charges.create`) ile gerçek cariye bağlanacak.
// ============================================================================================
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const tl = (c: number) => (c / 100).toFixed(2);
const addMonths = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last)); return iso(x); };
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return iso(x); };
type AdHocSource = "reservation" | "service" | "renovation" | "penalty" | "other";
interface AdHocSettings { sources: Record<AdHocSource, { mode: "immediate" | "next_period"; due_days: number }> }
interface AdHocCharge { id: string; unit_id: string; unit_name: string; account_id: string; account_kind: string; reference_code: string; person_name: string | null; source: AdHocSource; description: string; amount: string; due_date: string; mode: "immediate" | "next_period"; status: "posted" | "waiting_next_run" | "cancelled"; created_by: string; created_at: string; cancel_reason: string | null }
const adHocSettings = loadMap<string, AdHocSettings>("adHocSettings");
const adHocCharges = loadMap<string, AdHocCharge[]>("adHocCharges");
const AD_HOC_SOURCES: AdHocSource[] = ["reservation", "service", "renovation", "penalty", "other"];
const adHocOf = (slug: string) => { if (!adHocSettings.has(slug)) adHocSettings.set(slug, { sources: Object.fromEntries(AD_HOC_SOURCES.map((s) => [s, { mode: "immediate", due_days: 10 }])) as AdHocSettings["sources"] }); return adHocSettings.get(slug)!; };

// Ortak saat yardımcıları (İnsan kaynakları paketi 35–39 gerçek backend'e geçti; aşağıdaki sahte uçlar kullanıyor)
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const weekStart = (d: string) => { const x = new Date(d + "T00:00:00"); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return iso(x); };

// Güvenlik ve devriye paketi (servis istekleri 40–46) backend'de; aşağıdaki yardımcılar diğer
// sahte uçlarda (rutin görev, rezervasyon, iletişim) kullanılıyor.
const randCode = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// Hizmetler paketi (servis istekleri 47–52) backend'de; aşağıdaki sahte uçlar (69 hizmet karnesi,
// talep raporları) gerçek talep satırındaki `sla` ve `feedback` alanlarını kullanır.
interface ReqRow { id: string; category: string; status: string; created_at: string; resolved_at: string | null; sla: { state: string } | null; feedback: { solved: boolean; score: number | null } | null }

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
    // Okuma onayı backend'de (P12): çağrı okuma onaylı duyuru olarak gerçek uca gider
    const r = await real<{ data?: { id: string; title: string; published_at: string | null } }>(request, `/api/v1/sites/${slug}/announcements`, { method: "POST", body: { title: b.title!.trim(), body: b.body!.trim(), importance: "important", audience: "owners_only", audience_block_ids: [], channels: ["in_app", "email", "sms"], expires_on: null, is_pinned: true, requires_ack: true, ack_hours: hours, sms_fallback: true } });
    if (!r.body?.data) return HttpResponse.json(r.body, { status: r.status });
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

/** /me'deki site izinleri (sahte destek uçları için). */
async function permsOf(request: Request, slug: string) {
  const m = await real<{ sites: { slug: string; permissions: string[] }[] }>(request, "/api/v1/me");
  return new Set(m.body?.sites.find((s) => s.slug === slug)?.permissions ?? []);
}

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

export const handlers: RequestHandler[] = [...ortakOnbellek, ...rezervasyon, ...satinalma, ...sozlesme, ...genelKurul, ...platformDestek];
