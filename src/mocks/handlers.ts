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

export const handlers: RequestHandler[] = [...ortakOnbellek, ...platformDestek];
