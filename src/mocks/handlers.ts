// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Şu an sahte: 06 banka hareketi aktarımı, 07 tekrarlanan gider, 09 olay kaydı, 10 kayıp eşya,
// 11 talep departmanları, 12 site kullanıcıları ve roller, 13 sakin kayıt başvurusu.
import { bypass, http, HttpResponse, type RequestHandler } from "msw";

const API = "/api/v1/sites/:slug";

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
const tl = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 864e5));

// --- 06 Banka hareketi aktarımı ---------------------------------------------------------------
interface Account { id: string; reference_code: string; unit_name: string; person_name: string | null; balance: string }
interface BankRow {
  row_number: number;
  date: string;
  description: string;
  amount: string;
  direction: "in" | "out";
  bank_reference: string | null;
  status: "matched" | "suggested" | "unmatched" | "ignored" | "duplicate";
  suggestion: { ledger_account_id: string; reference_code: string; unit_name: string; person_name: string | null; balance: string; confidence: "high" | "medium"; reason: string } | null;
}
const imports = new Map<string, { slug: string; cash_account_id: string; rows: BankRow[]; confirmed: boolean }>();

function sampleRows(accounts: Account[]): BankRow[] {
  const debtors = accounts.filter((a) => Number(a.balance) > 0).slice(0, 6);
  const rows: BankRow[] = [];
  const sug = (a: Account, confidence: "high" | "medium", reason: string) => ({
    ledger_account_id: a.id, reference_code: a.reference_code, unit_name: a.unit_name, person_name: a.person_name, balance: a.balance, confidence, reason,
  });
  let n = 1;
  // Açıklamada referans kodu → yüksek güven
  for (const a of debtors.slice(0, 3)) {
    rows.push({ row_number: n++, date: daysAgo(n), description: `FAST ${a.person_name ?? ""} ${a.reference_code} EKIM AIDAT`.trim(), amount: Number(a.balance).toFixed(2), direction: "in", bank_reference: `FT${2600000 + n}`, status: "matched", suggestion: sug(a, "high", `Açıklamada referans kodu var (${a.reference_code})`) });
  }
  // Yalnız ad eşleşiyor → orta güven, öneri
  for (const a of debtors.slice(3, 5)) {
    const name = (a.person_name ?? "SAKIN").toLocaleUpperCase("tr-TR");
    rows.push({ row_number: n++, date: daysAgo(n), description: `EFT ${name} AIDAT`, amount: (Math.round(Number(a.balance) / 2 * 100) / 100).toFixed(2), direction: "in", bank_reference: `EF${7100000 + n}`, status: "suggested", suggestion: sug(a, "medium", "Gönderen adı hesap sahibiyle aynı; referans kodu yok") });
  }
  // Eşleşmeyen giriş
  rows.push({ row_number: n++, date: daysAgo(2), description: "HAVALE 1234567 NOLU HESAPTAN", amount: "3500.00", direction: "in", bank_reference: "HV5512001", status: "unmatched", suggestion: null });
  // Çıkış → aidat değil, aktarılmaz
  rows.push({ row_number: n++, date: daysAgo(1), description: "ELEKTRIK FATURASI OTOMATIK ODEME", amount: "32319.00", direction: "out", bank_reference: null, status: "ignored", suggestion: null });
  // Daha önce aktarılmış hareket
  if (debtors[5]) rows.push({ row_number: n++, date: daysAgo(9), description: `FAST ${debtors[5].reference_code} EYLUL`, amount: "9626.11", direction: "in", bank_reference: "FT2599871", status: "duplicate", suggestion: sug(debtors[5], "high", "Bu banka hareketi daha önce aktarıldı (FT2599871)") });
  return rows;
}

// --- 07 Tekrarlanan gider ------------------------------------------------------------------
interface Recurring {
  id: string; description: string; expense_category_id: string; amount: string; vendor: string | null;
  day_of_month: number; is_active: boolean; auto_pay: boolean; cash_account_id: string | null;
  next_run_on: string | null; last_created_on: string | null; created_at: string;
}
const recurring = loadMap<string, Recurring[]>("recurring");
function nextRun(day: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d <= now) d.setMonth(d.getMonth() + 1);
  return iso(d);
}
function validateRecurring(b: Partial<Recurring>) {
  const f: Record<string, string> = {};
  if (!b.description?.trim()) f.description = "Açıklama zorunlu.";
  if (!b.amount || !(Number(b.amount) > 0)) f.amount = "Tutar sıfırdan büyük olmalı.";
  if (!(Number(b.day_of_month) >= 1 && Number(b.day_of_month) <= 28)) f.day_of_month = "Gün 1–28 arasında olmalı (her ayda olsun diye).";
  if (!b.expense_category_id) f.expense_category_id = "Kategori seçin.";
  if (b.auto_pay && !b.cash_account_id) f.cash_account_id = "Otomatik ödeme için hesap seçin.";
  return Object.keys(f).length ? err(422, "validation", "Formda düzeltilmesi gereken alanlar var.", f) : null;
}

// --- 09 Olay kaydı · 10 Kayıp eşya · 11 Departmanlar ----------------------------------------
interface Incident {
  id: string; number: number; occurred_at: string; kind: string; location: string; description: string;
  unit_id: string | null; unit_name: string | null; status: "open" | "closed"; closed_note: string | null; closed_at: string | null;
  recorded_by: string; created_at: string;
}
interface LostItem {
  id: string; number: number; found_at: string; description: string; location: string; found_by: string | null;
  status: "waiting" | "returned" | "disposed"; returned_to: string | null; returned_at: string | null; recorded_by: string; created_at: string;
}
interface Department { id: string; name: string; is_active: boolean; request_count: number }
const incidents = loadMap<string, Incident[]>("incidents");
const lostItems = loadMap<string, LostItem[]>("lostItems");
const departments = loadMap<string, Department[]>("departments");
const requestDept = loadMap<string, string | null>("requestDept"); // request_id → department_id
const INCIDENT_KINDS = ["theft", "damage", "noise", "fire", "water_leak", "suspicious", "accident", "other"];

async function me(request: Request) {
  const r = await real<{ full_name: string }>(request, "/api/v1/me");
  return r.body?.full_name ?? "—";
}
function page<T>(items: T[], url: URL) {
  const p = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("page_size") ?? 50)));
  return { items: items.slice((p - 1) * size, p * size), page: p, page_size: size, total: items.length };
}
function deptsOf(slug: string) {
  if (!departments.has(slug)) {
    // Varsayılan departmanlar — site kurulumunda backend açar (istek 11)
    departments.set(slug, ["Teknik", "Temizlik", "Güvenlik", "Bahçe", "Yönetim"].map((name) => ({ id: crypto.randomUUID(), name, is_active: true, request_count: 0 })));
  }
  return departments.get(slug)!;
}

// --- 12 Site kullanıcıları ve roller · 13 Sakin kayıt başvurusu --------------------------------
const ROLES = [
  { key: "manager", name: "Yönetici", description: "Sitenin bütün işlemleri" },
  { key: "board", name: "Yönetim Kurulu Üyesi", description: "Her şeyi görür, hiçbirini değiştirmez" },
  { key: "auditor", name: "Denetçi", description: "Salt okunur finans; kişisel veri görmez (KMK m.41)" },
  { key: "accounting", name: "Muhasebe", description: "Tahakkuk, tahsilat, gider, kasa" },
  { key: "security", name: "Güvenlik", description: "Yalnız kargo ve ziyaretçi" },
  { key: "technical", name: "Teknik Personel", description: "Yalnız talepler" },
];
interface Member {
  id: string; full_name: string; email: string; role_key: string; role_name: string; is_active: boolean;
  source: "site" | "organization"; last_login_at: string | null; invited_at: string;
}
interface Registration {
  id: string; reference: string; first_name: string; last_name: string; phone: string; email: string | null; unit_text: string;
  relation: "owner" | "tenant"; explicit_consent: boolean; status: "pending" | "approved" | "rejected";
  created_at: string; decided_at: string | null; decided_by: string | null; reject_reason: string | null; unit_name: string | null;
}
const members = loadMap<string, Member[]>("members");
const regLinks = loadMap<string, { code: string; is_enabled: boolean; site_name?: string }>("regLinks"); // slug → link
const registrations = loadMap<string, Registration[]>("registrations");
// Sahte servis: her eklemede rastgele üretilen tek seferlik değer (sabit bir sır değil)
const oneTimeCode = () => `Gecici-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
const roleName = (k: string) => ROLES.find((r) => r.key === k)?.name ?? k;

async function membersOf(request: Request, slug: string) {
  if (!members.has(slug)) {
    const m = await real<{ full_name: string; sites: { slug: string; role: string; is_derived: boolean }[] }>(request, "/api/v1/me");
    const mine = m.body?.sites.find((s) => s.slug === slug);
    const seed: Member[] = [];
    if (m.body && mine) seed.push({ id: crypto.randomUUID(), full_name: m.body.full_name, email: "(oturumdaki kullanıcı)", role_key: "manager", role_name: mine.role, is_active: true, source: mine.is_derived ? "organization" : "site", last_login_at: new Date().toISOString(), invited_at: "2026-05-01T09:00:00Z" });
    if (slug === "aksu-konaklari") {
      // backend docs/10 demo hesapları
      seed.push(
        { id: crypto.randomUUID(), full_name: "Selin Arı", email: "muhasebe@demo.local", role_key: "accounting", role_name: "Muhasebe", is_active: true, source: "organization", last_login_at: null, invited_at: "2026-05-01T09:00:00Z" },
        { id: crypto.randomUUID(), full_name: "Recep Er", email: "guvenlik@demo.local", role_key: "security", role_name: "Güvenlik", is_active: true, source: "site", last_login_at: null, invited_at: "2026-05-01T09:00:00Z" },
        { id: crypto.randomUUID(), full_name: "Nuray Şen", email: "denetci@demo.local", role_key: "auditor", role_name: "Denetçi", is_active: true, source: "site", last_login_at: null, invited_at: "2026-05-01T09:00:00Z" },
        { id: crypto.randomUUID(), full_name: "Ergün Kılıç", email: "teknik@demo.local", role_key: "technical", role_name: "Teknik Personel", is_active: true, source: "site", last_login_at: null, invited_at: "2026-05-01T09:00:00Z" },
      );
    }
    members.set(slug, seed);
  }
  return members.get(slug)!;
}
function linkOf(slug: string) {
  if (!regLinks.has(slug)) regLinks.set(slug, { code: crypto.randomUUID().replace(/-/g, "").slice(0, 10), is_enabled: true });
  return regLinks.get(slug)!;
}
function slugByCode(code: string) {
  for (const [slug, l] of regLinks) if (l.code === code && l.is_enabled) return slug;
  return null;
}
// İletişim formu standardı: isim 2–40, rakam/özel karakter yok; TR cep 5XX, E.164; e-posta küçük harf ≤ 254
const NAME_RE = /^[A-Za-zÇĞİÖŞÜçğıöşü' -]{2,40}$/u;
function validateRegistration(b: Partial<Registration> & { kvkk_ack?: boolean }) {
  const f: Record<string, string> = {};
  if (!b.first_name || !NAME_RE.test(b.first_name.trim()) || !b.first_name.trim()) f.first_name = "Ad 2–40 harf olmalı; rakam ve özel karakter içermez.";
  if (!b.last_name || !NAME_RE.test(b.last_name.trim()) || !b.last_name.trim()) f.last_name = "Soyad 2–40 harf olmalı; rakam ve özel karakter içermez.";
  if (!b.phone || !/^\+905\d{9}$/.test(b.phone)) f.phone = "Cep telefonu 5 ile başlayan 10 hane olmalı.";
  if (b.email && (b.email.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(b.email))) f.email = "Geçerli bir e-posta adresi girin.";
  if (!b.unit_text?.trim()) f.unit_text = "Blok ve daire numaranızı yazın.";
  if (b.relation !== "owner" && b.relation !== "tenant") f.relation = "Malik mi kiracı mı, seçin.";
  return f;
}

export const handlers: RequestHandler[] = [
  // 12 — roller ve kullanıcılar
  http.get(`${API}/roles`, () => HttpResponse.json(ROLES)),
  http.get(`${API}/members`, async ({ request, params }) => HttpResponse.json(await membersOf(request, String(params.slug)))),
  http.post(`${API}/members`, async ({ request, params }) => {
    const list = await membersOf(request, String(params.slug));
    const b = (await request.json()) as { full_name?: string; email?: string; role_key?: string };
    const f: Record<string, string> = {};
    const email = (b.email ?? "").trim().toLocaleLowerCase("tr-TR");
    if (!b.full_name || b.full_name.trim().length < 3) f.full_name = "Ad soyad yazın.";
    if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) f.email = "Geçerli bir e-posta adresi girin.";
    if (!ROLES.some((r) => r.key === b.role_key)) f.role_key = "Rol seçin.";
    if (Object.keys(f).length) return err(422, "validation", "Formda düzeltilmesi gereken alanlar var.", f);
    if (list.some((m) => m.email === email)) return err(409, "already_member", "Bu e-posta zaten sitede kullanıcı.");
    const m: Member = { id: crypto.randomUUID(), full_name: b.full_name!.trim(), email, role_key: b.role_key!, role_name: roleName(b.role_key!), is_active: true, source: "site", last_login_at: null, invited_at: new Date().toISOString() };
    list.push(m);
    return HttpResponse.json({ data: { member: m, temporary_password: oneTimeCode() }, message: `${m.full_name} ${m.role_name} olarak eklendi.` }, { status: 201 });
  }),
  http.patch(`${API}/members/:id`, async ({ request, params }) => {
    const list = await membersOf(request, String(params.slug));
    const m = list.find((x) => x.id === params.id);
    if (!m) return err(404, "not_found", "Kullanıcı bulunamadı.");
    if (m.source === "organization") return err(409, "derived_membership", "Bu erişim yönetim şirketi üyeliğinden geliyor; şirket ayarlarından değiştirilir.");
    const b = (await request.json()) as { role_key?: string; is_active?: boolean };
    if (b.role_key && !ROLES.some((r) => r.key === b.role_key)) return err(422, "validation", "Rol seçin.", { role_key: "Rol seçin." });
    const managers = list.filter((x) => x.is_active && x.role_key === "manager");
    if (m.role_key === "manager" && managers.length === 1 && (b.is_active === false || (b.role_key && b.role_key !== "manager"))) {
      return err(409, "last_manager", "Sitede en az bir etkin yönetici kalmalı.");
    }
    if (b.role_key) Object.assign(m, { role_key: b.role_key, role_name: roleName(b.role_key) });
    if (b.is_active !== undefined) m.is_active = b.is_active;
    return HttpResponse.json({ data: m, message: b.is_active === false ? `${m.full_name} erişimi kapatıldı; oturumları sonlandırıldı.` : b.is_active === true ? `${m.full_name} erişimi açıldı.` : `${m.full_name} artık ${m.role_name}.` });
  }),

  // 13 — sakin kayıt bağlantısı (personel)
  http.get(`${API}/registration-link`, async ({ request, params }) => {
    const l = linkOf(String(params.slug));
    // Herkese açık form site adını oturumsuz gösterir; sahte serviste ad personel isteğinden alınır
    if (!l.site_name) l.site_name = (await real<{ name: string }>(request, `/api/v1/sites/${params.slug}`)).body?.name;
    return HttpResponse.json({ code: l.code, is_enabled: l.is_enabled });
  }),
  http.post(`${API}/registration-link/rotate`, ({ params }) => {
    const l = linkOf(String(params.slug));
    l.code = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    return HttpResponse.json({ data: l, message: "Yeni kayıt bağlantısı oluşturuldu; eski bağlantı artık çalışmaz." });
  }),
  http.patch(`${API}/registration-link`, async ({ request, params }) => {
    const l = linkOf(String(params.slug));
    const b = (await request.json()) as { is_enabled?: boolean };
    l.is_enabled = !!b.is_enabled;
    return HttpResponse.json({ data: l, message: l.is_enabled ? "Kayıt bağlantısı açıldı." : "Kayıt bağlantısı kapatıldı." });
  }),
  // 13 — başvurular (personel)
  http.get(`${API}/registrations`, ({ request, params }) => {
    const status = new URL(request.url).searchParams.get("status");
    const list = (registrations.get(String(params.slug)) ?? []).filter((r) => !status || r.status === status);
    return HttpResponse.json(page([...list].reverse(), new URL(request.url)));
  }),
  http.post(`${API}/registrations/:id/approve`, async ({ request, params }) => {
    const r = (registrations.get(String(params.slug)) ?? []).find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Başvuru bulunamadı.");
    if (r.status !== "pending") return err(409, "already_decided", "Bu başvuru zaten sonuçlandı.");
    const b = (await request.json()) as { unit_id?: string; unit_name?: string; start_date?: string };
    if (!b.unit_id) return err(422, "validation", "Bölümü seçin.", { unit_id: "Başvurunun ait olduğu bölümü seçin." });
    // Onay: kişiyi gerçek backend'de bölüme ekle (mevcut uç); hesap daveti istek 13'ün parçası
    const res = await real(request, `/api/v1/sites/${params.slug}/units/${b.unit_id}/parties`, {
      method: "POST",
      body: { role: r.relation, start_date: b.start_date ?? iso(new Date()), person: { first_name: r.first_name, last_name: r.last_name, phone: r.phone, email: r.email } },
    });
    if (res.status !== 201) return err(res.status, "upstream", (res.body as { error?: { message?: string } } | null)?.error?.message ?? "Kişi bölüme eklenemedi.");
    Object.assign(r, { status: "approved", decided_at: new Date().toISOString(), decided_by: await me(request), unit_name: b.unit_name ?? null });
    return HttpResponse.json({ data: r, message: `${r.first_name} ${r.last_name} ${b.unit_name ?? "bölüme"} ${r.relation === "owner" ? "malik" : "kiracı"} olarak eklendi. Giriş bilgileri e-posta/SMS sağlayıcısı gelince gönderilecek.` });
  }),
  http.post(`${API}/registrations/:id/reject`, async ({ request, params }) => {
    const r = (registrations.get(String(params.slug)) ?? []).find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Başvuru bulunamadı.");
    if (r.status !== "pending") return err(409, "already_decided", "Bu başvuru zaten sonuçlandı.");
    const b = (await request.json()) as { reason?: string };
    if (!b.reason?.trim()) return err(422, "validation", "Gerekçe zorunlu.", { reason: "Gerekçe zorunlu." });
    Object.assign(r, { status: "rejected", decided_at: new Date().toISOString(), decided_by: await me(request), reject_reason: b.reason.trim() });
    return HttpResponse.json({ data: r, message: "Başvuru reddedildi." });
  }),
  // 13 — herkese açık kayıt formu (oturum yok)
  http.get("/api/v1/public/registration/:code", ({ params }) => {
    const slug = slugByCode(String(params.code));
    if (!slug) return err(404, "not_found", "Kayıt bağlantısı geçersiz ya da kapatılmış. Site yönetiminden yeni bağlantı isteyin.");
    return HttpResponse.json({ site_name: regLinks.get(slug)!.site_name ?? slug, site_slug: slug });
  }),
  http.post("/api/v1/public/registration/:code", async ({ request, params }) => {
    const slug = slugByCode(String(params.code));
    if (!slug) return err(404, "not_found", "Kayıt bağlantısı geçersiz ya da kapatılmış.");
    const b = (await request.json()) as Partial<Registration> & { kvkk_ack?: boolean };
    const f = validateRegistration(b);
    if (!b.kvkk_ack) f.kvkk_ack = "Devam etmek için bilgilendirme yazısını onaylayın.";
    if (Object.keys(f).length) return err(422, "validation", "Formda düzeltilmesi gereken alanlar var.", f);
    const list = registrations.get(slug) ?? [];
    if (list.some((r) => r.status === "pending" && r.phone === b.phone)) return err(409, "already_pending", "Bu telefonla bekleyen bir başvuru var; yönetim inceleyince size dönülecek.");
    const r: Registration = {
      id: crypto.randomUUID(), reference: `KB-${String(list.length + 1).padStart(4, "0")}`, first_name: b.first_name!.trim(), last_name: b.last_name!.trim().toLocaleUpperCase("tr-TR"),
      phone: b.phone!, email: b.email || null, unit_text: b.unit_text!.trim(), relation: b.relation!, explicit_consent: !!b.explicit_consent,
      status: "pending", created_at: new Date().toISOString(), decided_at: null, decided_by: null, reject_reason: null, unit_name: null,
    };
    list.push(r);
    registrations.set(slug, list);
    return HttpResponse.json({ data: { reference: r.reference }, message: `Başvurunuz alındı (${r.reference}). Site yönetimi onaylayınca giriş bilgileriniz size iletilecek.` }, { status: 201 });
  }),

  // 09 — olay kaydı
  http.get(`${API}/incidents`, ({ request, params }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const list = (incidents.get(String(params.slug)) ?? []).filter((i) => !status || i.status === status);
    return HttpResponse.json(page([...list].reverse(), url));
  }),
  http.post(`${API}/incidents`, async ({ request, params }) => {
    const b = (await request.json()) as Partial<Incident>;
    const f: Record<string, string> = {};
    if (!b.kind || !INCIDENT_KINDS.includes(b.kind)) f.kind = "Olay türünü seçin.";
    if (!b.location?.trim()) f.location = "Olayın yerini yazın.";
    if (!b.description?.trim() || b.description.trim().length < 5) f.description = "Ne olduğunu kısaca yazın.";
    if (Object.keys(f).length) return err(422, "validation", "Formda düzeltilmesi gereken alanlar var.", f);
    const list = incidents.get(String(params.slug)) ?? [];
    const i: Incident = {
      id: crypto.randomUUID(), number: list.length + 1, occurred_at: b.occurred_at || new Date().toISOString(), kind: b.kind!, location: b.location!.trim(),
      description: b.description!.trim(), unit_id: b.unit_id ?? null, unit_name: b.unit_name ?? null, status: "open", closed_note: null, closed_at: null,
      recorded_by: await me(request), created_at: new Date().toISOString(),
    };
    list.push(i);
    incidents.set(String(params.slug), list);
    return HttpResponse.json({ data: i, message: `#${i.number} numaralı olay kaydedildi.` }, { status: 201 });
  }),
  http.post(`${API}/incidents/:id/close`, async ({ request, params }) => {
    const i = (incidents.get(String(params.slug)) ?? []).find((x) => x.id === params.id);
    if (!i) return err(404, "not_found", "Olay bulunamadı.");
    if (i.status === "closed") return err(409, "already_closed", "Olay zaten kapatıldı.");
    const b = (await request.json()) as { note?: string };
    if (!b.note?.trim()) return err(422, "validation", "Kapanış notu zorunlu.", { note: "Ne yapıldığını yazın." });
    Object.assign(i, { status: "closed", closed_note: b.note.trim(), closed_at: new Date().toISOString() });
    return HttpResponse.json({ data: i, message: `#${i.number} numaralı olay kapatıldı.` });
  }),

  // 10 — kayıp eşya
  http.get(`${API}/lost-items`, ({ request, params }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const list = (lostItems.get(String(params.slug)) ?? []).filter((i) => !status || i.status === status);
    return HttpResponse.json(page([...list].reverse(), url));
  }),
  http.post(`${API}/lost-items`, async ({ request, params }) => {
    const b = (await request.json()) as Partial<LostItem>;
    const f: Record<string, string> = {};
    if (!b.description?.trim()) f.description = "Eşyayı tarif edin.";
    if (!b.location?.trim()) f.location = "Bulunduğu yeri yazın.";
    if (Object.keys(f).length) return err(422, "validation", "Formda düzeltilmesi gereken alanlar var.", f);
    const list = lostItems.get(String(params.slug)) ?? [];
    const i: LostItem = {
      id: crypto.randomUUID(), number: list.length + 1, found_at: b.found_at || new Date().toISOString(), description: b.description!.trim(), location: b.location!.trim(),
      found_by: b.found_by?.trim() || null, status: "waiting", returned_to: null, returned_at: null, recorded_by: await me(request), created_at: new Date().toISOString(),
    };
    list.push(i);
    lostItems.set(String(params.slug), list);
    return HttpResponse.json({ data: i, message: `Kayıp eşya #${i.number} kaydedildi.` }, { status: 201 });
  }),
  http.post(`${API}/lost-items/:id/return`, async ({ request, params }) => {
    const i = (lostItems.get(String(params.slug)) ?? []).find((x) => x.id === params.id);
    if (!i) return err(404, "not_found", "Kayıt bulunamadı.");
    if (i.status !== "waiting") return err(409, "not_waiting", "Bu eşya zaten teslim edildi ya da elden çıkarıldı.");
    const b = (await request.json()) as { returned_to?: string; disposed?: boolean };
    if (!b.disposed && (!b.returned_to || b.returned_to.trim().length < 2)) return err(422, "validation", "Teslim alanın adını yazın.", { returned_to: "Teslim alanın adını yazın." });
    Object.assign(i, b.disposed ? { status: "disposed", returned_at: new Date().toISOString() } : { status: "returned", returned_to: b.returned_to!.trim(), returned_at: new Date().toISOString() });
    return HttpResponse.json({ data: i, message: b.disposed ? `Kayıp eşya #${i.number} elden çıkarıldı olarak işaretlendi.` : `Kayıp eşya #${i.number} ${i.returned_to} kişisine teslim edildi.` });
  }),

  // 11 — departmanlar
  http.get(`${API}/departments`, ({ params }) => {
    const list = deptsOf(String(params.slug));
    for (const d of list) d.request_count = [...requestDept.values()].filter((x) => x === d.id).length;
    return HttpResponse.json(list);
  }),
  http.post(`${API}/departments`, async ({ request, params }) => {
    const b = (await request.json()) as { name?: string };
    const name = b.name?.trim() ?? "";
    if (name.length < 2) return err(422, "validation", "Departman adı en az 2 karakter.", { name: "Departman adı en az 2 karakter." });
    const list = deptsOf(String(params.slug));
    if (list.some((d) => d.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) return err(409, "already_exists", `"${name}" adında bir departman var.`);
    const d = { id: crypto.randomUUID(), name, is_active: true, request_count: 0 };
    list.push(d);
    return HttpResponse.json({ data: d, message: `"${name}" departmanı eklendi.` }, { status: 201 });
  }),
  http.patch(`${API}/departments/:id`, async ({ request, params }) => {
    const d = deptsOf(String(params.slug)).find((x) => x.id === params.id);
    if (!d) return err(404, "not_found", "Departman bulunamadı.");
    const b = (await request.json()) as { name?: string; is_active?: boolean };
    if (b.name !== undefined && b.name.trim().length < 2) return err(422, "validation", "Departman adı en az 2 karakter.", { name: "Departman adı en az 2 karakter." });
    Object.assign(d, { ...(b.name !== undefined ? { name: b.name.trim() } : {}), ...(b.is_active !== undefined ? { is_active: b.is_active } : {}) });
    return HttpResponse.json({ data: d, message: d.is_active ? `"${d.name}" güncellendi.` : `"${d.name}" pasifleştirildi; mevcut talepleri yerinde kalır.` });
  }),
  http.post(`${API}/requests/:id/department`, async ({ request, params }) => {
    const b = (await request.json()) as { department_id?: string | null };
    const dep = b.department_id ? deptsOf(String(params.slug)).find((d) => d.id === b.department_id && d.is_active) : null;
    if (b.department_id && !dep) return err(422, "validation", "Departman seçin.", { department_id: "Geçerli bir departman seçin." });
    const real1 = await real<Record<string, unknown>>(request, `/api/v1/sites/${params.slug}/requests/${params.id}`);
    if (!real1.body) return err(real1.status, "not_found", "Talep bulunamadı.");
    requestDept.set(String(params.id), dep?.id ?? null);
    return HttpResponse.json({ data: { ...real1.body, department_id: dep?.id ?? null, department_name: dep?.name ?? null }, message: dep ? `Talep "${dep.name}" departmanına yönlendirildi.` : "Talebin departmanı kaldırıldı." });
  }),
  // Gerçek talep uçlarını departman alanıyla zenginleştir (backend alanı ekleyince bu iki handler silinir)
  http.get(`${API}/requests`, async ({ request, params }) => {
    const url = new URL(request.url);
    const dep = url.searchParams.get("department_id");
    const q = new URLSearchParams(url.searchParams);
    q.delete("department_id");
    if (dep) { q.set("page", "1"); q.set("page_size", "200"); }
    const r = await real<{ items: { id: string }[]; page: number; page_size: number; total: number }>(request, `/api/v1/sites/${params.slug}/requests?${q}`);
    if (!r.body) return HttpResponse.json(r.body, { status: r.status });
    const names = new Map(deptsOf(String(params.slug)).map((d) => [d.id, d.name]));
    let items = r.body.items.map((x) => ({ ...x, department_id: requestDept.get(x.id) ?? null, department_name: names.get(requestDept.get(x.id) ?? "") ?? null }));
    if (dep) {
      items = items.filter((x) => x.department_id === dep);
      return HttpResponse.json(page(items, url));
    }
    return HttpResponse.json({ ...r.body, items });
  }),
  http.get(`${API}/requests/:id`, async ({ request, params }) => {
    const r = await real<Record<string, unknown>>(request, `/api/v1/sites/${params.slug}/requests/${params.id}`);
    if (!r.body) return HttpResponse.json(r.body, { status: r.status });
    const depId = requestDept.get(String(params.id)) ?? null;
    return HttpResponse.json({ ...r.body, department_id: depId, department_name: deptsOf(String(params.slug)).find((d) => d.id === depId)?.name ?? null });
  }),

  // 06 — dosyayı yükle, önizleme
  http.post(`${API}/bank-imports`, async ({ request, params }) => {
    const form = await request.formData();
    const file = form.get("file");
    const cash = String(form.get("cash_account_id") ?? "");
    if (!(file instanceof File)) return err(422, "validation", "Dosya seçin.", { file: "Dosya seçin." });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return err(422, "validation", "Yalnız .xlsx, .xls ya da .csv yüklenebilir.", { file: "Yalnız .xlsx, .xls ya da .csv yüklenebilir." });
    if (file.size > 5 * 1024 * 1024) return err(422, "validation", "Dosya en fazla 5 MB olabilir.", { file: "Dosya en fazla 5 MB olabilir." });
    if (!cash) return err(422, "validation", "Banka hesabını seçin.", { cash_account_id: "Banka hesabını seçin." });
    const acc = await real<{ items: Account[] }>(request, `/api/v1/sites/${params.slug}/accounts?page_size=200`);
    if (!acc.body) return err(acc.status, "upstream", "Hesaplar okunamadı.");
    const rows = sampleRows(acc.body.items);
    const id = crypto.randomUUID();
    imports.set(id, { slug: String(params.slug), cash_account_id: cash, rows, confirmed: false });
    const inRows = rows.filter((r) => r.direction === "in");
    return HttpResponse.json({
      import_id: id,
      file_name: file.name,
      cash_account_id: cash,
      expires_at: new Date(Date.now() + 6 * 3600e3).toISOString(),
      row_count: rows.length,
      matched_count: rows.filter((r) => r.status === "matched").length,
      suggested_count: rows.filter((r) => r.status === "suggested").length,
      unmatched_count: rows.filter((r) => r.status === "unmatched").length,
      ignored_count: rows.filter((r) => r.status === "ignored" || r.status === "duplicate").length,
      total_in: inRows.reduce((s, r) => s + Number(r.amount), 0).toFixed(2),
      rows,
    });
  }),

  // 06 — onayla: seçilen satırlar tahsilat olarak kaydedilir (sahte uç gerçek tahsilat ucunu çağırır)
  http.post(`${API}/bank-imports/:id/confirm`, async ({ request, params }) => {
    const imp = imports.get(String(params.id));
    if (!imp || imp.slug !== params.slug) return err(404, "not_found", "Aktarım bulunamadı ya da süresi doldu; dosyayı yeniden yükleyin.");
    if (imp.confirmed) return err(409, "already_confirmed", "Bu aktarım zaten onaylandı.");
    const body = (await request.json()) as { rows?: { row_number: number; ledger_account_id: string }[] };
    const picks = body.rows ?? [];
    if (picks.length === 0) return err(422, "validation", "Aktarılacak satır seçin.");
    let created = 0, total = 0;
    const skipped: string[] = [];
    for (const p of picks) {
      const row = imp.rows.find((r) => r.row_number === p.row_number);
      if (!row || row.direction !== "in" || row.status === "duplicate") { skipped.push(`${p.row_number}. satır aktarılamaz`); continue; }
      const res = await real(request, `/api/v1/sites/${params.slug}/payments`, {
        method: "POST",
        idem: `bank-${params.id}-${p.row_number}`,
        body: { ledger_account_id: p.ledger_account_id, amount: row.amount, date: row.date, method: "bank_transfer", cash_account_id: imp.cash_account_id, reference: row.bank_reference, note: row.description.slice(0, 200) },
      });
      if (res.status === 201) { created++; total += Number(row.amount); } else skipped.push(`${p.row_number}. satır kaydedilemedi`);
    }
    imp.confirmed = true;
    return HttpResponse.json({
      data: { created_payments: created, total_amount: total.toFixed(2), skipped },
      message: `${created} banka hareketi tahsilat olarak işlendi (${tl(total)} TL).`,
    });
  }),

  // 07 — tekrarlanan gider listesi / ekle / güncelle / sil
  http.get(`${API}/recurring-expenses`, ({ params }) => HttpResponse.json(recurring.get(String(params.slug)) ?? [])),
  http.post(`${API}/recurring-expenses`, async ({ request, params }) => {
    const b = (await request.json()) as Partial<Recurring>;
    const bad = validateRecurring(b);
    if (bad) return bad;
    const r: Recurring = {
      id: crypto.randomUUID(), description: b.description!.trim(), expense_category_id: b.expense_category_id!, amount: Number(b.amount).toFixed(2),
      vendor: b.vendor?.trim() || null, day_of_month: Number(b.day_of_month), is_active: b.is_active ?? true, auto_pay: !!b.auto_pay,
      cash_account_id: b.auto_pay ? (b.cash_account_id ?? null) : null, next_run_on: null, last_created_on: null, created_at: new Date().toISOString(),
    };
    r.next_run_on = r.is_active ? nextRun(r.day_of_month) : null;
    const list = recurring.get(String(params.slug)) ?? [];
    list.push(r);
    recurring.set(String(params.slug), list);
    return HttpResponse.json({ data: r, message: `"${r.description}" her ayın ${r.day_of_month}. günü kaydedilecek.` }, { status: 201 });
  }),
  http.patch(`${API}/recurring-expenses/:id`, async ({ request, params }) => {
    const list = recurring.get(String(params.slug)) ?? [];
    const r = list.find((x) => x.id === params.id);
    if (!r) return err(404, "not_found", "Tekrarlanan gider bulunamadı.");
    const b = (await request.json()) as Partial<Recurring>;
    const merged = { ...r, ...b };
    const bad = validateRecurring(merged);
    if (bad) return bad;
    Object.assign(r, merged, { amount: Number(merged.amount).toFixed(2), cash_account_id: merged.auto_pay ? merged.cash_account_id : null });
    r.next_run_on = r.is_active ? nextRun(r.day_of_month) : null;
    return HttpResponse.json({ data: r, message: r.is_active ? `"${r.description}" güncellendi.` : `"${r.description}" durduruldu.` });
  }),
  http.delete(`${API}/recurring-expenses/:id`, ({ params }) => {
    const list = recurring.get(String(params.slug)) ?? [];
    const i = list.findIndex((x) => x.id === params.id);
    if (i < 0) return err(404, "not_found", "Tekrarlanan gider bulunamadı.");
    const [r] = list.splice(i, 1);
    return HttpResponse.json({ data: r, message: `"${r!.description}" kaldırıldı. Daha önce oluşturulan giderler yerinde kalır.` });
  }),
];
