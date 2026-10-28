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
//
// Backend'e geçti, handler'ı kaldırıldı: Sözleşme performansı 68–70 (KPI, ceza ve artış kuralı,
// aylık karne ve ceza kesintisi, endeksli artış ve platform endeks değerleri; 27.10.2026).
// Satın alma 62–67 (tedarikçi kartı, ayar ve bütçe, talep/
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

export const handlers: RequestHandler[] = [...ortakOnbellek, ...genelKurul, ...platformDestek];
