// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Şu an sahte (Yapı, Kişiler ve Kayıt paketi — Yazılım Dokümanı YAP-01..10):
// 19 yapı tanımları (ortak alanlar, bölüm tipi ekleme, versiyonlu öznitelik + geçmiş, toplu düzenleme,
// yapı özeti), 20 bölüm 360° (özet, iletişim görüntüleme kaydı, hane üyeleri, talep/ziyaretçi bölüm
// süzgeci), 21 kişiler (mükerrer öneri, birleştirme, malik değişimi), 22 araçlar, 23 kayıt yöntemleri
// ve davetler, 24 özel alanlar, 25 aktarım geçmişi (araç ve açılış bakiyesi aktarımı, geri alma),
// 26 kurulum ve canlıya geçiş.
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
const monthStart = () => today().slice(0, 7) + "-01";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^\+905\d{9}$/;
const NAME_RE = /^[A-Za-zÇĞİÖŞÜçğıöşü' -]{2,60}$/u;
const normPhone = (v: string) => { const d = v.replace(/\D/g, "").replace(/^90/, "").replace(/^0/, ""); return d ? `+90${d}` : ""; };

async function me(request: Request) {
  const r = await real<{ full_name: string; user_id: string }>(request, "/api/v1/me");
  return { name: r.body?.full_name ?? "—", id: r.body?.user_id ?? "" };
}
function page<T>(items: T[], url: URL) {
  const p = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("page_size") ?? 50)));
  return { items: items.slice((p - 1) * size, p * size), page: p, page_size: size, total: items.length };
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

// Gerçek yapı şekilleri (openapi: UnitListItem, UnitDetail, PartyOut, PersonOut, BlockOut, UnitTypeOut)
interface Person { id: string; first_name: string; last_name: string; full_name: string; phone: string | null; email: string | null }
interface Party { id: string; role: string; share_percent: string; start_date: string; end_date: string | null; is_current: boolean; person: Person }
interface UnitRow { id: string; display_name: string; block: { id: string; name: string }; number: string; floor: number | null; unit_type: { id: string; name: string } | null; gross_area: string | null; net_area: string | null; land_share_numerator: number | null; land_share_denominator: number | null; usage: string; is_active: boolean; owner_names: string[]; tenant_names: string[] }
interface UnitDetail extends UnitRow { parties: Party[]; accounts: { id: string; kind: string; reference_code: string; is_closed: boolean }[] }
interface UnitType { id: string; name: string; weight: string; sort_order: number }

// ============================================================================================
// 19 — Yapı tanımları: ortak alanlar, bölüm tipi ekleme, versiyonlu öznitelikler, toplu düzenleme
// ============================================================================================
interface CommonArea { id: string; name: string; kind: string; block_id: string | null; block_name: string | null; is_reservable: boolean; is_active: boolean; note: string | null }
interface AttrChange { id: string; effective_from: string; changes: Record<string, { from: unknown; to: unknown }>; changed_by: string; created_at: string; applied: boolean }
const commonAreas = loadMap<string, CommonArea[]>("commonAreas");
const extraUnitTypes = loadMap<string, UnitType[]>("extraUnitTypes");
const attrHistory = loadMap<string, AttrChange[]>("attrHistory"); // unit_id → geçmiş
const COMMON_AREA_KINDS = ["pool", "hall", "gym", "garden", "playground", "parking", "technical", "roof", "other"];

const yapi: RequestHandler[] = [
  http.get(`${API}/common-areas`, ({ params }) => HttpResponse.json(listOf(commonAreas, String(params.slug)))),
  ...(["post", "patch"] as const).map((verb) =>
    http[verb](verb === "post" ? `${API}/common-areas` : `${API}/common-areas/:id`, async ({ request, params }) => {
      const list = listOf(commonAreas, String(params.slug));
      const cur = verb === "patch" ? list.find((x) => x.id === params.id) : undefined;
      if (verb === "patch" && !cur) return err(404, "not_found", "Ortak alan bulunamadı.");
      const b: Partial<CommonArea> = { ...(cur ?? {}), ...((await request.json()) as Partial<CommonArea>) };
      const f: Record<string, string> = {};
      if (!b.name?.trim()) f.name = "Ortak alanın adını yazın.";
      else if (list.some((x) => x.id !== cur?.id && x.name.toLocaleLowerCase("tr-TR") === b.name!.trim().toLocaleLowerCase("tr-TR"))) f.name = "Bu adla bir ortak alan var.";
      if (!COMMON_AREA_KINDS.includes(b.kind ?? "")) f.kind = "Tür seçin.";
      if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
      let block_name: string | null = null;
      if (b.block_id) {
        const blocks = await allPages<{ id: string; name: string }>(request, `/api/v1/sites/${params.slug}/blocks`);
        block_name = blocks.find((x) => x.id === b.block_id)?.name ?? null;
        if (!block_name) return err(422, "validation", VALIDATION, { block_id: "Blok bulunamadı." });
      }
      const a: CommonArea = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), kind: b.kind!, block_id: b.block_id || null, block_name, is_reservable: !!b.is_reservable, is_active: b.is_active ?? true, note: b.note?.trim() || null };
      if (cur) Object.assign(cur, a); else list.push(a);
      return HttpResponse.json({ data: a, message: verb === "post" ? `${a.name} eklendi.` : `${a.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
    }),
  ),

  // Bölüm tipleri: GET gerçek + sahte eklenenler; POST/PATCH sahte
  http.get(`${API}/unit-types`, async ({ request, params }) => {
    const r = await real<Paged<UnitType>>(request, `/api/v1/sites/${params.slug}/unit-types?page_size=200`);
    if (r.status !== 200 || !r.body) return HttpResponse.json(r.body, { status: r.status });
    const extra = listOf(extraUnitTypes, String(params.slug));
    const items = [...r.body.items.map((t) => extra.find((e) => e.id === t.id) ?? t), ...extra.filter((e) => !r.body!.items.some((t) => t.id === e.id))].sort((a, b) => a.sort_order - b.sort_order);
    return HttpResponse.json({ ...r.body, items, total: items.length });
  }),
  ...(["post", "patch"] as const).map((verb) =>
    http[verb](verb === "post" ? `${API}/unit-types` : `${API}/unit-types/:id`, async ({ request, params }) => {
      const extra = listOf(extraUnitTypes, String(params.slug));
      const r = await real<Paged<UnitType>>(request, `/api/v1/sites/${params.slug}/unit-types?page_size=200`);
      const all = [...(r.body?.items ?? []), ...extra];
      const cur = verb === "patch" ? all.find((x) => x.id === params.id) : undefined;
      if (verb === "patch" && !cur) return err(404, "not_found", "Bölüm tipi bulunamadı.");
      const b: Partial<UnitType> = { ...(cur ?? {}), ...((await request.json()) as Partial<UnitType>) };
      const f: Record<string, string> = {};
      if (!b.name?.trim()) f.name = "Tip adını yazın (ör. 2+1, Dükkan).";
      else if (all.some((x) => x.id !== cur?.id && x.name.toLocaleLowerCase("tr-TR") === b.name!.trim().toLocaleLowerCase("tr-TR"))) f.name = "Bu adla bir tip var.";
      if (b.weight != null && !/^\d+(\.\d{1,4})?$/.test(String(b.weight))) f.weight = "Katsayıyı sayı olarak girin (ör. 1 ya da 1.25).";
      if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
      const t: UnitType = { id: cur?.id ?? crypto.randomUUID(), name: b.name!.trim(), weight: String(b.weight ?? "1"), sort_order: Number(b.sort_order ?? all.length + 1) };
      const i = extra.findIndex((x) => x.id === t.id);
      if (i >= 0) extra[i] = t; else extra.push(t);
      return HttpResponse.json({ data: t, message: verb === "post" ? `${t.name} tipi eklendi.` : `${t.name} güncellendi.` }, { status: verb === "post" ? 201 : 200 });
    }),
  ),

  // Versiyonlu öznitelikler: m², arsa payı, tip — yürürlük tarihiyle; geçmiş tahakkuk değişmez
  http.patch(`${API}/units/:id/attributes`, async ({ request, params }) => {
    const b = (await request.json()) as { effective_from?: string; gross_area?: string | null; net_area?: string | null; land_share_numerator?: number | null; land_share_denominator?: number | null; unit_type_id?: string | null };
    if (!b.effective_from || !DATE_RE.test(b.effective_from)) return err(422, "validation", VALIDATION, { effective_from: "Yürürlük tarihini girin." });
    if (b.effective_from < monthStart()) {
      const d = new Date(monthStart());
      return err(422, "period_locked", `Yürürlük tarihi geçmiş bir döneme düşemez; en erken ${d.toLocaleDateString("tr-TR")}.`, { effective_from: `En erken ${d.toLocaleDateString("tr-TR")}` });
    }
    if ((b.land_share_numerator == null) !== (b.land_share_denominator == null)) return err(422, "validation", VALIDATION, { land_share_numerator: "Pay ve paydayı birlikte girin." });
    const cur = await real<UnitDetail>(request, `/api/v1/sites/${params.slug}/units/${params.id}`);
    if (cur.status !== 200 || !cur.body) return HttpResponse.json(cur.body, { status: cur.status });
    const changes: AttrChange["changes"] = {};
    const fields = ["gross_area", "net_area", "land_share_numerator", "land_share_denominator"] as const;
    for (const k of fields) if (k in b && String(b[k] ?? "") !== String(cur.body[k] ?? "")) changes[k] = { from: cur.body[k], to: b[k] ?? null };
    if ("unit_type_id" in b && (b.unit_type_id ?? null) !== (cur.body.unit_type?.id ?? null)) changes.unit_type_id = { from: cur.body.unit_type?.name ?? null, to: b.unit_type_id ?? null };
    if (Object.keys(changes).length === 0) return err(422, "no_change", "Değişen bir alan yok.");
    const applied = b.effective_from <= today();
    let detail = cur.body;
    if (applied) {
      const patch: Record<string, unknown> = {};
      for (const k of fields) if (k in changes) patch[k] = b[k] ?? null;
      if ("unit_type_id" in changes) patch.unit_type_id = b.unit_type_id ?? null;
      const r = await real<UnitDetail>(request, `/api/v1/sites/${params.slug}/units/${params.id}`, { method: "PATCH", body: patch });
      if (r.status !== 200 || !r.body) return HttpResponse.json(r.body, { status: r.status });
      detail = r.body;
    }
    const h = listOf(attrHistory, String(params.id));
    h.push({ id: crypto.randomUUID(), effective_from: b.effective_from, changes, changed_by: (await me(request)).name, created_at: new Date().toISOString(), applied });
    return HttpResponse.json({ data: detail, message: applied ? `Bölüm bilgileri ${new Date(b.effective_from).toLocaleDateString("tr-TR")} itibarıyla güncellendi; geçmiş tahakkuklar değişmez.` : `Değişiklik ${new Date(b.effective_from).toLocaleDateString("tr-TR")} tarihinde yürürlüğe girecek.` });
  }),
  http.get(`${API}/units/:id/attribute-history`, ({ params }) => HttpResponse.json([...listOf(attrHistory, String(params.id))].reverse())),

  // Toplu düzenleme: seçili bölümlerde tip / kullanım / durum
  http.post(`${API}/units/bulk-update`, async ({ request, params }) => {
    const b = (await request.json()) as { unit_ids?: string[]; changes?: { unit_type_id?: string | null; usage?: string; is_active?: boolean } };
    if (!b.unit_ids?.length) return err(422, "validation", "Bölüm seçin.", { unit_ids: "En az bir bölüm seçin." });
    if (!b.changes || Object.keys(b.changes).length === 0) return err(422, "validation", "Değiştirilecek alan seçin.", { changes: "En az bir alan." });
    const failed: { unit_id: string; message: string }[] = [];
    let updated = 0;
    for (const id of b.unit_ids) {
      const r = await real<{ error?: { message?: string } }>(request, `/api/v1/sites/${params.slug}/units/${id}`, { method: "PATCH", body: b.changes });
      if (r.status === 200) updated++; else failed.push({ unit_id: id, message: r.body?.error?.message ?? `HTTP ${r.status}` });
    }
    return HttpResponse.json({ data: { updated, failed }, message: failed.length ? `${updated} bölüm güncellendi, ${failed.length} bölümde hata.` : `${updated} bölüm güncellendi.` });
  }),

  // Yapı özeti: canlıya geçiş kontrol listesi ve uyarı rozetleri buradan beslenir
  http.get(`${API}/structure/summary`, async ({ request, params }) => HttpResponse.json(await structureSummary(request, String(params.slug)))),
];

async function structureSummary(request: Request, slug: string) {
  const units = await allPages<UnitRow>(request, `/api/v1/sites/${slug}/units`);
  const blocks = await allPages<{ id: string }>(request, `/api/v1/sites/${slug}/blocks`);
  const active = units.filter((u) => u.is_active);
  const denominators = active.map((u) => u.land_share_denominator).filter((d): d is number => d != null);
  const denominator = denominators.length ? denominators.sort((a, b) => denominators.filter((x) => x === b).length - denominators.filter((x) => x === a).length)[0]! : null;
  const sum = active.reduce((s, u) => s + (u.land_share_numerator ?? 0), 0);
  const withoutOwner = active.filter((u) => u.owner_names.length === 0).map((u) => ({ id: u.id, display_name: u.display_name }));
  // Malik hisseleri: ayrıntı gerektirir (parties). Servis bunu tek sorguda döner; sahte servis yerel demo için tek tek okur.
  const sharesIncomplete: { id: string; display_name: string; total: string }[] = [];
  const owned = active.filter((u) => u.owner_names.length > 0).slice(0, 200);
  const details = await Promise.all(owned.map((u) => real<UnitDetail>(request, `/api/v1/sites/${slug}/units/${u.id}`)));
  for (const d of details) {
    if (!d.body) continue;
    const total = d.body.parties.filter((p) => p.is_current && p.role === "owner").reduce((s, p) => s + Number(p.share_percent), 0);
    if (Math.abs(total - 100) > 0.01) sharesIncomplete.push({ id: d.body.id, display_name: d.body.display_name, total: total.toFixed(2) });
  }
  return {
    unit_count: units.length, active_unit_count: active.length, block_count: blocks.length,
    land_share_sum: sum, land_share_denominator: denominator, land_share_mismatch: denominator != null && sum !== denominator,
    units_without_land_share: active.filter((u) => u.land_share_numerator == null).length,
    units_without_owner: withoutOwner, units_shares_incomplete: sharesIncomplete,
    common_area_count: listOf(commonAreas, slug).filter((a) => a.is_active).length,
  };
}

// ============================================================================================
// 20 — Bölüm 360°: özet, iletişim görüntüleme kaydı, hane üyeleri, talep/ziyaretçi bölüm süzgeci
// ============================================================================================
interface Household { id: string; unit_id: string; unit_name: string; full_name: string; phone: string; invited_by: string; permissions: { visitors: boolean; packages: boolean; reservations: boolean; requests: boolean }; status: "invited" | "active" | "ended"; invite_link: string; created_at: string; ended_at: string | null }
const households = loadMap<string, Household[]>("households"); // slug → üyeler
const contactViews = loadMap<string, { person_id: string; by: string; at: string }[]>("contactViews");
const HOUSEHOLD_LIMIT = 6;

async function myUnits(request: Request, slug: string) {
  const h = await real<{ units: { unit_id: string; unit_name: string; role: string }[] }>(request, `/api/v1/sites/${slug}/resident/home`);
  return { status: h.status, units: h.body?.units ?? [] };
}
function newHousehold(slug: string, unit: { id: string; name: string }, b: Partial<Household>, by: string, origin: string): Household | Response {
  const list = listOf(households, slug);
  const f: Record<string, string> = {};
  const name = (b.full_name ?? "").trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(name) || name.length < 3) f.full_name = "Ad soyad yazın (yalnız harf, 3–60 karakter).";
  const phone = normPhone(b.phone ?? "");
  if (!PHONE_RE.test(phone)) f.phone = "Cep telefonu 5 ile başlayan 10 hane olmalı.";
  if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
  const active = list.filter((h) => h.unit_id === unit.id && h.status !== "ended");
  if (active.length >= HOUSEHOLD_LIMIT) return err(409, "household_limit", `Bu bölümde en fazla ${HOUSEHOLD_LIMIT} hane üyesi olabilir.`);
  if (active.some((h) => h.phone === phone)) return err(409, "already_member", "Bu telefonla hane üyesi zaten var.");
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const h: Household = {
    id: crypto.randomUUID(), unit_id: unit.id, unit_name: unit.name, full_name: name, phone, invited_by: by,
    permissions: { visitors: b.permissions?.visitors ?? true, packages: b.permissions?.packages ?? true, reservations: b.permissions?.reservations ?? false, requests: b.permissions?.requests ?? false },
    status: "invited", invite_link: `${origin}/davet/${token}`, created_at: new Date().toISOString(), ended_at: null,
  };
  list.push(h);
  return h;
}

const bolum360: RequestHandler[] = [
  http.get(`${API}/units/:id/overview`, async ({ request, params }) => {
    const slug = String(params.slug);
    const u = await real<UnitDetail>(request, `/api/v1/sites/${slug}/units/${params.id}`);
    if (u.status !== 200 || !u.body) return HttpResponse.json(u.body, { status: u.status });
    const acc = await real<Paged<{ id: string; balance: string }>>(request, `/api/v1/sites/${slug}/accounts?unit_id=${params.id}&page_size=50`);
    const balance = acc.body ? acc.body.items.reduce((s, a) => s + Number(a.balance), 0).toFixed(2) : null;
    const owners = u.body.parties.filter((p) => p.is_current && p.role === "owner");
    const shareTotal = owners.reduce((s, p) => s + Number(p.share_percent), 0);
    const warnings: string[] = [];
    if (owners.length === 0) warnings.push("no_owner");
    else if (Math.abs(shareTotal - 100) > 0.01) warnings.push("shares_incomplete");
    if (u.body.land_share_numerator == null) warnings.push("no_land_share");
    const pk = await real<Paged<unknown>>(request, `/api/v1/sites/${slug}/packages?unit_id=${params.id}&status=waiting&page_size=1`);
    return HttpResponse.json({
      balance, share_total: shareTotal.toFixed(2), warnings,
      packages_waiting: pk.body?.total ?? 0,
      vehicles: listOf(vehicles, slug).filter((v) => v.unit_id === params.id && v.status !== "inactive").length,
      household: listOf(households, slug).filter((h) => h.unit_id === params.id && h.status !== "ended").length,
    });
  }),
  // Kişisel veri görüntüleme: telefon/e-posta maskeli gelir, "göster" denetim kaydına yazılır
  http.post(`${API}/people/:id/contact-views`, async ({ request, params }) => {
    listOf(contactViews, String(params.slug)).push({ person_id: String(params.id), by: (await me(request)).name, at: new Date().toISOString() });
    return new HttpResponse(null, { status: 204 });
  }),
  // Talepler ve ziyaretçiler: gerçek uçta bölüm süzgeci yok; burada süzülür (istek 20)
  http.get(`${API}/requests`, async ({ request, params }) => {
    const url = new URL(request.url);
    const unitId = url.searchParams.get("unit_id");
    if (!unitId) return; // süzgeç yoksa gerçek backend
    url.searchParams.delete("unit_id"); url.searchParams.set("page_size", "200"); url.searchParams.delete("page");
    const r = await real<Paged<{ unit_id: string | null }>>(request, `/api/v1/sites/${params.slug}/requests?${url.searchParams}`);
    if (!r.body) return HttpResponse.json(r.body, { status: r.status });
    return HttpResponse.json(page(r.body.items.filter((x) => x.unit_id === unitId), new URL(request.url)));
  }),
  http.get(`${API}/visitors`, async ({ request, params }) => {
    const url = new URL(request.url);
    const unitId = url.searchParams.get("unit_id");
    if (!unitId) return;
    url.searchParams.delete("unit_id"); url.searchParams.set("page_size", "200"); url.searchParams.delete("page");
    const r = await real<Paged<{ unit_id: string }>>(request, `/api/v1/sites/${params.slug}/visitors?${url.searchParams}`);
    if (!r.body) return HttpResponse.json(r.body, { status: r.status });
    return HttpResponse.json(page(r.body.items.filter((x) => x.unit_id === unitId), new URL(request.url)));
  }),
  // Hane üyeleri (personel)
  http.get(`${API}/units/:id/household`, ({ params }) => HttpResponse.json(listOf(households, String(params.slug)).filter((h) => h.unit_id === params.id))),
  http.post(`${API}/units/:id/household`, async ({ request, params }) => {
    const u = await real<UnitDetail>(request, `/api/v1/sites/${params.slug}/units/${params.id}`);
    if (u.status !== 200 || !u.body) return HttpResponse.json(u.body, { status: u.status });
    const r = newHousehold(String(params.slug), { id: u.body.id, name: u.body.display_name }, (await request.json()) as Partial<Household>, (await me(request)).name, new URL(request.url).origin);
    if (r instanceof Response) return r;
    return HttpResponse.json({ data: r, message: `${r.full_name} hane üyesi olarak davet edildi. SMS gönderimi henüz yok; davet bağlantısını kendisine iletin.` }, { status: 201 });
  }),
  http.patch(`${API}/household/:id`, async ({ request, params }) => {
    const h = listOf(households, String(params.slug)).find((x) => x.id === params.id);
    if (!h) return err(404, "not_found", "Hane üyesi bulunamadı.");
    const b = (await request.json()) as { permissions?: Partial<Household["permissions"]> };
    h.permissions = { ...h.permissions, ...(b.permissions ?? {}) };
    return HttpResponse.json({ data: h, message: `${h.full_name} yetkileri güncellendi.` });
  }),
  http.post(`${API}/household/:id/end`, ({ params }) => {
    const h = listOf(households, String(params.slug)).find((x) => x.id === params.id);
    if (!h) return err(404, "not_found", "Hane üyesi bulunamadı.");
    if (h.status === "ended") return err(409, "already_ended", "Hane üyeliği zaten bitmiş.");
    Object.assign(h, { status: "ended", ended_at: new Date().toISOString() });
    return HttpResponse.json({ data: h, message: `${h.full_name} hane üyeliği sonlandırıldı.` });
  }),
  // Hane üyeleri (sakin): kendi bölümü için davet eder
  http.get(`${API}/resident/household`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    if (mine.status !== 200) return err(mine.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(mine.units.map((u) => u.unit_id));
    return HttpResponse.json(listOf(households, String(params.slug)).filter((h) => ids.has(h.unit_id)));
  }),
  http.post(`${API}/resident/household`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    const b = (await request.json()) as Partial<Household> & { unit_id?: string };
    const unit = mine.units.find((u) => u.unit_id === b.unit_id) ?? mine.units[0];
    if (!unit) return err(404, "not_found", "Bölümünüz bulunamadı.");
    const r = newHousehold(String(params.slug), { id: unit.unit_id, name: unit.unit_name }, b, (await me(request)).name, new URL(request.url).origin);
    if (r instanceof Response) return r;
    return HttpResponse.json({ data: r, message: `${r.full_name} davet edildi. Davet bağlantısını kendisine iletin.` }, { status: 201 });
  }),
  http.post(`${API}/resident/household/:id/end`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    const h = listOf(households, String(params.slug)).find((x) => x.id === params.id && mine.units.some((u) => u.unit_id === x.unit_id));
    if (!h) return err(404, "not_found", "Hane üyesi bulunamadı.");
    Object.assign(h, { status: "ended", ended_at: new Date().toISOString() });
    return HttpResponse.json({ data: h, message: `${h.full_name} hane üyeliği sonlandırıldı.` });
  }),
];

// ============================================================================================
// 21 — Kişiler: mükerrer önerisi, birleştirme, malik değişimi (satış / veraset)
// ============================================================================================
const mergedPeople = loadMap<string, { merged_id: string; kept_id: string; at: string; by: string }[]>("mergedPeople");

const normKey = (p: Person) => [p.phone ? normPhone(p.phone) : "", p.email?.trim().toLocaleLowerCase("tr-TR") ?? ""];

const kisiler: RequestHandler[] = [
  // Birleştirilen kişi listeden düşer (sahte servis gerçek kaydı silemez)
  http.get(`${API}/people`, async ({ request, params }) => {
    const merged = new Set(listOf(mergedPeople, String(params.slug)).map((m) => m.merged_id));
    if (merged.size === 0) return;
    const url = new URL(request.url);
    const r = await real<Paged<Person>>(request, `/api/v1/sites/${params.slug}/people?${url.searchParams}`);
    if (!r.body) return HttpResponse.json(r.body, { status: r.status });
    const items = r.body.items.filter((p) => !merged.has(p.id));
    return HttpResponse.json({ ...r.body, items, total: r.body.total - (r.body.items.length - items.length) });
  }),
  http.get(`${API}/people/duplicates`, async ({ request, params }) => {
    const merged = new Set(listOf(mergedPeople, String(params.slug)).map((m) => m.merged_id));
    const people = (await allPages<Person>(request, `/api/v1/sites/${params.slug}/people`)).filter((p) => !merged.has(p.id));
    const groups = new Map<string, Person[]>();
    for (const p of people) for (const k of normKey(p)) if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
    const out = [...groups].filter(([, ps]) => ps.length > 1).map(([key, ps]) => ({ key, kind: key.startsWith("+") ? "phone" : "email", people: ps }));
    return HttpResponse.json(out);
  }),
  http.post(`${API}/people/merge`, async ({ request, params }) => {
    const b = (await request.json()) as { keep_id?: string; merge_id?: string };
    if (!b.keep_id || !b.merge_id || b.keep_id === b.merge_id) return err(422, "validation", "Birleştirilecek iki ayrı kişi seçin.");
    const people = await allPages<Person>(request, `/api/v1/sites/${params.slug}/people`);
    const keep = people.find((p) => p.id === b.keep_id), drop = people.find((p) => p.id === b.merge_id);
    if (!keep || !drop) return err(404, "not_found", "Kişi bulunamadı.");
    listOf(mergedPeople, String(params.slug)).push({ merged_id: drop.id, kept_id: keep.id, at: new Date().toISOString(), by: (await me(request)).name });
    return HttpResponse.json({ data: { kept: keep, merged: drop }, message: `${drop.full_name} kaydı ${keep.full_name} ile birleştirildi; ilişkiler ve geçmiş tek kişide toplandı. (Sahte servis: gerçek kayıt taşınmadı.)` });
  }),
  // Satış / veraset: eski malikler satış tarihinde kapanır, yeni malikler aynı tarihte başlar; hisseler tam %100
  http.post(`${API}/units/:id/ownership-transfer`, async ({ request, params }) => {
    const b = (await request.json()) as { reason?: "sale" | "inheritance"; transfer_date?: string; debt_policy?: string; new_owners?: { person_id?: string; person?: { first_name: string; last_name: string; phone: string | null; email: string | null }; share_percent: string }[] };
    const f: Record<string, string> = {};
    if (!b.transfer_date || !DATE_RE.test(b.transfer_date)) f.transfer_date = "Devir tarihini girin.";
    if (b.reason !== "sale" && b.reason !== "inheritance") f.reason = "Devir nedenini seçin.";
    const owners = b.new_owners ?? [];
    if (owners.length === 0) f.new_owners = "En az bir yeni malik girin.";
    const total = owners.reduce((s, o) => s + Number(o.share_percent || 0), 0);
    if (owners.length && Math.abs(total - 100) > 0.01) f.new_owners = `Yeni maliklerin hisse toplamı tam %100 olmalı (şu an %${total.toFixed(2)}).`;
    for (const o of owners) if (!o.person_id && !(o.person?.first_name && o.person?.last_name)) f.new_owners = "Her yeni malik için kişi seçin ya da ad soyad girin.";
    if (b.debt_policy && b.debt_policy !== "stays_with_seller") return err(422, "not_supported", "Satış öncesi borcun yeni malike devri hukuki teyit bekliyor (K10); şimdilik borç eski malikte kalır.", { debt_policy: "Yalnız \"eski malikte kalır\" seçilebilir." });
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const slug = String(params.slug);
    const u = await real<UnitDetail>(request, `/api/v1/sites/${slug}/units/${params.id}`);
    if (u.status !== 200 || !u.body) return HttpResponse.json(u.body, { status: u.status });
    const current = u.body.parties.filter((p) => p.is_current && p.role === "owner");
    // Bitiş günü dahil sayıldığından eski malik devirden bir gün önce kapanır; devir günü yeni malikindir
    const prev = new Date(b.transfer_date + "T00:00:00"); prev.setDate(prev.getDate() - 1);
    for (const p of current) {
      const r = await real<{ error?: { message?: string } }>(request, `/api/v1/sites/${slug}/units/${params.id}/parties/${p.id}/end`, { method: "POST", body: { end_date: iso(prev) } });
      if (r.status >= 300) return err(r.status, "upstream", r.body?.error?.message ?? "Eski malik ilişkisi kapatılamadı.");
    }
    for (const o of owners) {
      const r = await real<{ error?: { message?: string } }>(request, `/api/v1/sites/${slug}/units/${params.id}/parties`, { method: "POST", body: { role: "owner", start_date: b.transfer_date, share_percent: o.share_percent, person_id: o.person_id ?? null, person: o.person ?? null } });
      if (r.status >= 300) return err(r.status, "upstream", r.body?.error?.message ?? "Yeni malik eklenemedi.");
    }
    const after = await real<UnitDetail>(request, `/api/v1/sites/${slug}/units/${params.id}`);
    return HttpResponse.json({ data: after.body, message: `${u.body.display_name}: ${b.reason === "sale" ? "satış" : "veraset"} kaydedildi; eski malik ilişkisi ${new Date(b.transfer_date!).toLocaleDateString("tr-TR")} tarihinde kapandı, ${owners.length} yeni malik başladı. Satış öncesi borç eski malikte kaldı.` });
  }),
];

// ============================================================================================
// 22 — Araçlar
// ============================================================================================
interface Vehicle { id: string; plate: string; plate_display: string; brand_model: string | null; color: string | null; unit_id: string; unit_name: string; owner_person_id: string | null; owner_name: string | null; kind: "permanent" | "guest"; valid_until: string | null; status: "active" | "pending" | "inactive"; created_at: string }
interface VehicleSettings { plate_limit_per_unit: number; approval_required: boolean }
const vehicles = loadMap<string, Vehicle[]>("vehicles");
const vehicleSettings = loadMap<string, VehicleSettings>("vehicleSettings");
const PLATE_RE = /^(0[1-9]|[1-7]\d|8[01])[A-Z]{1,3}\d{2,5}$/;
const normPlate = (v: string) => v.toLocaleUpperCase("en-US").replace(/[^A-Z0-9]/g, "");
const displayPlate = (p: string) => p.replace(/^(\d{2})([A-Z]+)(\d+)$/, "$1 $2 $3");
const vehSettings = (slug: string) => { if (!vehicleSettings.has(slug)) vehicleSettings.set(slug, { plate_limit_per_unit: 2, approval_required: false }); return vehicleSettings.get(slug)!; };

function addVehicle(slug: string, unit: { id: string; name: string }, b: Partial<Vehicle> & { force?: boolean }, owner: { id: string | null; name: string | null }, byResident: boolean): Vehicle | Response {
  const list = listOf(vehicles, slug);
  const s = vehSettings(slug);
  const plate = normPlate(b.plate ?? "");
  const f: Record<string, string> = {};
  if (!PLATE_RE.test(plate)) f.plate = "Plakayı 34 ABC 123 biçiminde yazın.";
  if (b.kind !== "permanent" && b.kind !== "guest") f.kind = "Araç türünü seçin.";
  if (b.kind === "guest" && (!b.valid_until || !DATE_RE.test(b.valid_until))) f.valid_until = "Misafir aracı için geçerlilik tarihi zorunlu.";
  if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
  const activeHere = list.filter((v) => v.unit_id === unit.id && v.status !== "inactive" && v.kind === "permanent");
  if (b.kind === "permanent" && activeHere.length >= s.plate_limit_per_unit) return err(422, "plate_limit", `Bölümünüz için plaka sınırına ulaştınız (${s.plate_limit_per_unit}).`);
  const elsewhere = list.find((v) => v.plate === plate && v.status !== "inactive" && v.unit_id !== unit.id);
  if (elsewhere && (byResident || !b.force)) return err(409, "plate_active_elsewhere", `${displayPlate(plate)} plakası ${elsewhere.unit_name} bölümünde kayıtlı.${byResident ? " Site yönetimine başvurun." : " Yine de eklemek için onaylayın."}`);
  if (list.some((v) => v.plate === plate && v.status !== "inactive" && v.unit_id === unit.id)) return err(409, "already_registered", "Bu plaka bu bölümde zaten kayıtlı.");
  const v: Vehicle = { id: crypto.randomUUID(), plate, plate_display: displayPlate(plate), brand_model: b.brand_model?.trim() || null, color: b.color?.trim() || null, unit_id: unit.id, unit_name: unit.name, owner_person_id: owner.id, owner_name: owner.name, kind: b.kind!, valid_until: b.kind === "guest" ? b.valid_until! : null, status: byResident && s.approval_required ? "pending" : "active", created_at: new Date().toISOString() };
  list.push(v);
  return v;
}

const araclar: RequestHandler[] = [
  http.get(`${API}/settings/vehicles`, ({ params }) => HttpResponse.json(vehSettings(String(params.slug)))),
  http.put(`${API}/settings/vehicles`, async ({ request, params }) => {
    const b = (await request.json()) as Partial<VehicleSettings>;
    const s = vehSettings(String(params.slug));
    if (b.plate_limit_per_unit != null && (!Number.isInteger(b.plate_limit_per_unit) || b.plate_limit_per_unit < 1 || b.plate_limit_per_unit > 10)) return err(422, "validation", VALIDATION, { plate_limit_per_unit: "1–10 arası." });
    Object.assign(s, b);
    return HttpResponse.json({ data: s, message: "Araç ayarları kaydedildi." });
  }),
  http.get(`${API}/vehicles`, ({ request, params }) => {
    const url = new URL(request.url);
    const unitId = url.searchParams.get("unit_id"), status = url.searchParams.get("status"), q = (url.searchParams.get("q") ?? "").trim();
    const list = listOf(vehicles, String(params.slug)).filter((v) => (!unitId || v.unit_id === unitId) && (!status || v.status === status) && (!q || v.plate.includes(normPlate(q)) || v.unit_name.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")) || (v.owner_name ?? "").toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR"))));
    return HttpResponse.json([...list].reverse());
  }),
  http.post(`${API}/vehicles`, async ({ request, params }) => {
    const b = (await request.json()) as Partial<Vehicle> & { force?: boolean };
    const u = await real<UnitDetail>(request, `/api/v1/sites/${params.slug}/units/${b.unit_id}`);
    if (u.status !== 200 || !u.body) return err(422, "validation", VALIDATION, { unit_id: "Bölüm seçin." });
    const owner = u.body.parties.find((p) => p.is_current && p.person.id === b.owner_person_id)?.person ?? u.body.parties.find((p) => p.is_current && (p.role === "tenant" || p.role === "resident"))?.person ?? u.body.parties.find((p) => p.is_current)?.person;
    const r = addVehicle(String(params.slug), { id: u.body.id, name: u.body.display_name }, b, { id: owner?.id ?? null, name: owner?.full_name ?? null }, false);
    if (r instanceof Response) return r;
    return HttpResponse.json({ data: r, message: `${r.plate_display} ${r.unit_name} bölümüne eklendi.` }, { status: 201 });
  }),
  http.patch(`${API}/vehicles/:id`, async ({ request, params }) => {
    const v = listOf(vehicles, String(params.slug)).find((x) => x.id === params.id);
    if (!v) return err(404, "not_found", "Araç bulunamadı.");
    const b = (await request.json()) as Partial<Vehicle>;
    if (b.status && !["active", "pending", "inactive"].includes(b.status)) return err(422, "validation", VALIDATION, { status: "Durum seçin." });
    Object.assign(v, { brand_model: b.brand_model !== undefined ? b.brand_model?.trim() || null : v.brand_model, color: b.color !== undefined ? b.color?.trim() || null : v.color, valid_until: b.valid_until !== undefined ? b.valid_until : v.valid_until, status: b.status ?? v.status });
    return HttpResponse.json({ data: v, message: b.status === "inactive" ? `${v.plate_display} pasif yapıldı; kapı ekranında görünmez.` : b.status === "active" ? `${v.plate_display} onaylandı.` : `${v.plate_display} güncellendi.` });
  }),
  // Sakin: Araçlarım
  http.get(`${API}/resident/vehicles`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    if (mine.status !== 200) return err(mine.status, "forbidden", "Bu ekran sakin hesabıyla görülür.");
    const ids = new Set(mine.units.map((u) => u.unit_id));
    return HttpResponse.json({ limit: vehSettings(String(params.slug)).plate_limit_per_unit, approval_required: vehSettings(String(params.slug)).approval_required, items: listOf(vehicles, String(params.slug)).filter((v) => ids.has(v.unit_id) && v.status !== "inactive") });
  }),
  http.post(`${API}/resident/vehicles`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    const b = (await request.json()) as Partial<Vehicle>;
    const unit = mine.units.find((u) => u.unit_id === b.unit_id) ?? mine.units[0];
    if (!unit) return err(404, "not_found", "Bölümünüz bulunamadı.");
    const who = await me(request);
    const r = addVehicle(String(params.slug), { id: unit.unit_id, name: unit.unit_name }, b, { id: null, name: who.name }, true);
    if (r instanceof Response) return r;
    return HttpResponse.json({ data: r, message: r.status === "pending" ? `${r.plate_display} kaydedildi; site yönetimi onaylayınca kapıda görünür.` : `${r.plate_display} eklendi; kapı ekranında görünür.` }, { status: 201 });
  }),
  http.post(`${API}/resident/vehicles/:id/remove`, async ({ request, params }) => {
    const mine = await myUnits(request, String(params.slug));
    const v = listOf(vehicles, String(params.slug)).find((x) => x.id === params.id && mine.units.some((u) => u.unit_id === x.unit_id));
    if (!v) return err(404, "not_found", "Araç bulunamadı.");
    v.status = "inactive";
    return HttpResponse.json({ data: v, message: `${v.plate_display} kaldırıldı.` });
  }),
];

// ============================================================================================
// 23 — Kayıt yöntemleri, davetler, herkese açık formda blok/bölüm listesi
// ============================================================================================
interface RegSettings { invite_enabled: boolean; qr_enabled: boolean; code_enabled: boolean; owner_can_approve_tenant: boolean; owner_document_required: boolean; invite_valid_days: number; kvkk_published: boolean }
interface Invitation { id: string; full_name: string; phone: string; unit_id: string; unit_name: string; relation: "owner" | "tenant"; status: "sent" | "opened" | "completed" | "expired" | "cancelled"; token: string; link: string; sent_by: string; sent_at: string; expires_at: string; completed_at: string | null }
const regSettings = loadMap<string, RegSettings>("regSettings");
const invitations = loadMap<string, Invitation[]>("invitations");
const regOf = (slug: string) => { if (!regSettings.has(slug)) regSettings.set(slug, { invite_enabled: true, qr_enabled: true, code_enabled: true, owner_can_approve_tenant: false, owner_document_required: false, invite_valid_days: 7, kvkk_published: false }); return regSettings.get(slug)!; };
function invitationOut(i: Invitation): Invitation {
  if (i.status === "sent" && i.expires_at < new Date().toISOString()) i.status = "expired";
  return i;
}
function slugByToken(token: string) {
  for (const [slug, list] of invitations) { const i = list.find((x) => x.token === token); if (i) return { slug, inv: i }; }
  return null;
}

const kayit: RequestHandler[] = [
  http.get(`${API}/settings/registration`, ({ params }) => HttpResponse.json(regOf(String(params.slug)))),
  http.put(`${API}/settings/registration`, async ({ request, params }) => {
    const s = regOf(String(params.slug));
    const b = (await request.json()) as Partial<RegSettings>;
    if (b.invite_valid_days != null && (!Number.isInteger(b.invite_valid_days) || b.invite_valid_days < 1 || b.invite_valid_days > 30)) return err(422, "validation", VALIDATION, { invite_valid_days: "1–30 gün." });
    Object.assign(s, b);
    return HttpResponse.json({ data: s, message: "Kayıt yöntemleri kaydedildi." });
  }),
  http.get(`${API}/invitations`, ({ request, params }) => {
    const status = new URL(request.url).searchParams.get("status");
    const list = listOf(invitations, String(params.slug)).map(invitationOut).filter((i) => !status || i.status === status);
    return HttpResponse.json([...list].reverse());
  }),
  http.post(`${API}/invitations`, async ({ request, params }) => {
    const slug = String(params.slug);
    const s = regOf(slug);
    if (!s.invite_enabled) return err(409, "method_disabled", "Davet yöntemi kapalı; Ayarlar › Kayıt yöntemleri'nden açın.");
    const b = (await request.json()) as Partial<Invitation>;
    const f: Record<string, string> = {};
    const name = (b.full_name ?? "").trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(name) || name.length < 3) f.full_name = "Ad soyad yazın (yalnız harf, 3–60 karakter).";
    const phone = normPhone(b.phone ?? "");
    if (!PHONE_RE.test(phone)) f.phone = "Cep telefonu 5 ile başlayan 10 hane olmalı.";
    if (b.relation !== "owner" && b.relation !== "tenant") f.relation = "İlişkiyi seçin.";
    if (!b.unit_id) f.unit_id = "Bölüm seçin.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    const u = await real<UnitDetail>(request, `/api/v1/sites/${slug}/units/${b.unit_id}`);
    if (u.status !== 200 || !u.body) return err(422, "validation", VALIDATION, { unit_id: "Bölüm bulunamadı." });
    const list = listOf(invitations, slug);
    if (list.some((i) => i.phone === phone && invitationOut(i).status === "sent")) return err(409, "already_invited", "Bu telefona gönderilmiş açık bir davet var; yeniden gönderin ya da iptal edin.");
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const inv: Invitation = { id: crypto.randomUUID(), full_name: name, phone, unit_id: u.body.id, unit_name: u.body.display_name, relation: b.relation!, status: "sent", token, link: `${new URL(request.url).origin}/davet/${token}`, sent_by: (await me(request)).name, sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + s.invite_valid_days * 864e5).toISOString(), completed_at: null };
    list.push(inv);
    return HttpResponse.json({ data: inv, message: `${inv.full_name} için davet oluşturuldu. SMS gönderimi henüz yok (K5); bağlantıyı kendisine iletin.` }, { status: 201 });
  }),
  http.post(`${API}/invitations/:id/resend`, async ({ request, params }) => {
    const slug = String(params.slug);
    const inv = listOf(invitations, slug).find((i) => i.id === params.id);
    if (!inv) return err(404, "not_found", "Davet bulunamadı.");
    if (inv.status === "completed") return err(409, "already_completed", "Bu davet tamamlanmış.");
    Object.assign(inv, { status: "sent", token: crypto.randomUUID().replace(/-/g, "").slice(0, 20), sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + regOf(slug).invite_valid_days * 864e5).toISOString(), sent_by: (await me(request)).name });
    inv.link = `${new URL(request.url).origin}/davet/${inv.token}`;
    return HttpResponse.json({ data: inv, message: "Yeni davet bağlantısı üretildi; eskisi geçersiz." });
  }),
  http.post(`${API}/invitations/:id/cancel`, ({ params }) => {
    const inv = listOf(invitations, String(params.slug)).find((i) => i.id === params.id);
    if (!inv) return err(404, "not_found", "Davet bulunamadı.");
    if (inv.status === "completed") return err(409, "already_completed", "Tamamlanmış davet iptal edilemez.");
    inv.status = "cancelled";
    return HttpResponse.json({ data: inv, message: "Davet iptal edildi." });
  }),
  // Herkese açık: davet
  http.get("/api/v1/public/invitations/:token", async ({ request, params }) => {
    const found = slugByToken(String(params.token));
    if (!found || ["cancelled", "expired"].includes(invitationOut(found.inv).status)) return err(404, "not_found", "Davet bağlantısı geçersiz ya da süresi dolmuş. Site yönetiminden yeni davet isteyin.");
    const site = await real<{ name: string }>(request, `/api/v1/sites/${found.slug}`);
    if (found.inv.status === "sent") found.inv.status = "opened";
    return HttpResponse.json({ site_name: site.body?.name ?? found.slug, full_name: found.inv.full_name, unit_name: found.inv.unit_name, relation: found.inv.relation, phone_hint: found.inv.phone.slice(-4), status: found.inv.status, expires_at: found.inv.expires_at });
  }),
  http.post("/api/v1/public/invitations/:token/accept", async ({ request, params }) => {
    const found = slugByToken(String(params.token));
    if (!found || ["cancelled", "expired"].includes(invitationOut(found.inv).status)) return err(404, "not_found", "Davet bağlantısı geçersiz ya da süresi dolmuş.");
    if (found.inv.status === "completed") return err(409, "already_completed", "Bu davet daha önce kullanılmış.");
    const b = (await request.json()) as { phone?: string; kvkk_ack?: boolean; email?: string | null };
    const f: Record<string, string> = {};
    if (normPhone(b.phone ?? "") !== found.inv.phone) f.phone = "Numara davetteki numarayla eşleşmiyor. Telefonunuz değiştiyse site yönetimine başvurun.";
    if (!b.kvkk_ack) f.kvkk_ack = "Devam etmek için bilgilendirme yazısını onaylayın.";
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    Object.assign(found.inv, { status: "completed", completed_at: new Date().toISOString() });
    return HttpResponse.json({ data: { unit_name: found.inv.unit_name, temporary_password: `Gecici-${Math.random().toString(36).slice(2, 8)}` }, message: "Kaydınız tamamlandı. Geçici parolanızla giriş yapın; ilk girişte parolanızı belirleyeceksiniz." }, { status: 201 });
  }),
  // Herkese açık kayıt formu: gerçek yanıta blok/bölüm listesi ve yöntem ayarları eklenir (kişi adı yok — KVKK)
  http.get("/api/v1/public/registration/:code", async ({ request, params }) => {
    const r = await real<{ site_name: string; site_slug: string }>(request, `/api/v1/public/registration/${params.code}`);
    if (r.status !== 200 || !r.body) return HttpResponse.json(r.body, { status: r.status });
    const slug = r.body.site_slug;
    const s = regOf(slug);
    if (!s.qr_enabled && !s.code_enabled) return err(404, "method_disabled", "Bu site bu yöntemle başvuru kabul etmiyor. Site yönetiminizle iletişime geçin.");
    // Bölüm listesi herkese açık uçtan okunamaz (oturum yok); sahte servis için yerel önbellek
    const cached = publicUnits.get(slug) ?? [];
    return HttpResponse.json({ ...r.body, blocks: cached, document_required: s.owner_document_required, relations: ["owner", "tenant"] });
  }),
];
// Personel sayfaları açıldığında bölüm listesi herkese açık form için önbelleğe alınır (yalnız ad)
const publicUnits = loadMap<string, { id: string; name: string; units: { id: string; name: string }[] }[]>("publicUnits");
async function cachePublicUnits(request: Request, slug: string) {
  const units = await allPages<UnitRow>(request, `/api/v1/sites/${slug}/units?is_active=true`);
  const byBlock = new Map<string, { id: string; name: string; units: { id: string; name: string }[] }>();
  for (const u of units) {
    if (!byBlock.has(u.block.id)) byBlock.set(u.block.id, { id: u.block.id, name: u.block.name, units: [] });
    byBlock.get(u.block.id)!.units.push({ id: u.id, name: u.display_name });
  }
  publicUnits.set(slug, [...byBlock.values()]);
}

// ============================================================================================
// 24 — Özel alanlar
// ============================================================================================
interface CustomField { id: string; entity: "unit" | "person"; label: string; key: string; type: "text" | "number" | "date" | "bool" | "select"; options: string[]; required: boolean; kvkk_category: string; view_roles: string[]; edit_roles: string[]; resident_can_view: boolean; resident_can_edit: boolean; sort_order: number; is_archived: boolean }
const customFields = loadMap<string, CustomField[]>("customFields");
const customValues = loadMap<string, Record<string, unknown>>("customValues"); // `${entity}:${id}` → {key: value}
const FIELD_LIMIT = 30;
const SENSITIVE = ["sağlık", "saglik", "hastalık", "hastalik", "engel", "din", "mezhep", "etnik", "ırk", "irk", "siyasi", "parti", "sendika", "cinsel", "ceza", "sabıka", "sabika", "biyometrik", "genetik", "kan grubu"];
const slugify = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

const ozelAlanlar: RequestHandler[] = [
  http.get(`${API}/custom-fields`, ({ request, params }) => {
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity"), archived = url.searchParams.get("archived") === "true";
    return HttpResponse.json(listOf(customFields, String(params.slug)).filter((f) => (!entity || f.entity === entity) && f.is_archived === archived).sort((a, b) => a.sort_order - b.sort_order));
  }),
  ...(["post", "patch"] as const).map((verb) =>
    http[verb](verb === "post" ? `${API}/custom-fields` : `${API}/custom-fields/:id`, async ({ request, params }) => {
      const list = listOf(customFields, String(params.slug));
      const cur = verb === "patch" ? list.find((x) => x.id === params.id) : undefined;
      if (verb === "patch" && !cur) return err(404, "not_found", "Özel alan bulunamadı.");
      const raw = (await request.json()) as Partial<CustomField> & { acknowledge_sensitive?: boolean };
      const b: Partial<CustomField> = { ...(cur ?? {}), ...raw };
      const f: Record<string, string> = {};
      if (b.entity !== "unit" && b.entity !== "person") f.entity = "Bölüm ya da kişi seçin.";
      if (!b.label?.trim() || b.label.trim().length > 60) f.label = "Etiket 1–60 karakter.";
      if (!["text", "number", "date", "bool", "select"].includes(b.type ?? "")) f.type = "Tip seçin.";
      if (cur && b.type !== cur.type) f.type = "Tip sonradan değiştirilemez; yeni alan açın.";
      if (b.type === "select" && (!b.options || b.options.filter((o) => o.trim()).length < 2)) f.options = "Seçim listesi için en az 2 seçenek yazın.";
      if (!["identity", "contact", "finance", "location_plate", "other"].includes(b.kvkk_category ?? "")) f.kvkk_category = "KVKK kategorisi seçin.";
      if (!b.view_roles?.length) f.view_roles = "En az bir rol görebilmeli.";
      if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
      if (!cur && list.filter((x) => x.entity === b.entity && !x.is_archived).length >= FIELD_LIMIT) return err(409, "field_limit", `Özel alan sınırına ulaşıldı (${FIELD_LIMIT}).`);
      const low = b.label!.toLocaleLowerCase("tr-TR");
      if (!raw.acknowledge_sensitive && SENSITIVE.some((w) => low.includes(w))) return err(422, "sensitive_label", "Bu alan özel nitelikli kişisel veri içeriyor olabilir. KVKK gereği bu tür veri tutulmamalıdır. Etiketi değiştirin ya da gerekçeyle devam edin.", { label: "Özel nitelikli veri çağrışımı" });
      const field: CustomField = {
        id: cur?.id ?? crypto.randomUUID(), entity: b.entity!, label: b.label!.trim(), key: cur?.key ?? (slugify(b.label!) || `alan_${list.length + 1}`),
        type: b.type!, options: b.type === "select" ? (b.options ?? []).map((o) => o.trim()).filter(Boolean) : [], required: !!b.required, kvkk_category: b.kvkk_category!,
        view_roles: b.view_roles!, edit_roles: b.edit_roles ?? ["Yönetici"], resident_can_view: !!b.resident_can_view, resident_can_edit: !!b.resident_can_edit,
        sort_order: Number(b.sort_order ?? list.length + 1), is_archived: cur?.is_archived ?? false,
      };
      if (list.some((x) => x.id !== field.id && x.entity === field.entity && x.key === field.key)) field.key = `${field.key}_${list.length + 1}`;
      if (cur) Object.assign(cur, field); else list.push(field);
      return HttpResponse.json({ data: field, message: verb === "post" ? `"${field.label}" alanı eklendi; formlarda görünür.` : `"${field.label}" güncellendi.` }, { status: verb === "post" ? 201 : 200 });
    }),
  ),
  http.post(`${API}/custom-fields/:id/archive`, ({ params }) => {
    const f = listOf(customFields, String(params.slug)).find((x) => x.id === params.id);
    if (!f) return err(404, "not_found", "Özel alan bulunamadı.");
    f.is_archived = true;
    return HttpResponse.json({ data: f, message: `"${f.label}" arşivlendi; verisi saklama süresince korunur.` });
  }),
  // MSW yol deseni regex grubu desteklemez; iki nesne için ayrı handler
  ...(["units", "people"] as const).flatMap((seg) => {
    const entity = seg === "units" ? "unit" : "person";
    return [
  http.get(`${API}/${seg}/:id/custom-values`, ({ params }) => HttpResponse.json({ values: customValues.get(`${entity}:${params.id}`) ?? {} })),
  http.put(`${API}/${seg}/:id/custom-values`, async ({ request, params }) => {
    const b = (await request.json()) as { values?: Record<string, unknown> };
    const fields = listOf(customFields, String(params.slug)).filter((f) => f.entity === entity && !f.is_archived);
    const f: Record<string, string> = {};
    const out: Record<string, unknown> = { ...(customValues.get(`${entity}:${params.id}`) ?? {}) };
    for (const field of fields) {
      if (!(field.key in (b.values ?? {}))) continue;
      const v = b.values![field.key];
      if (v === "" || v == null) { delete out[field.key]; if (field.required) f[field.key] = `${field.label} zorunlu.`; continue; }
      if (field.type === "number" && Number.isNaN(Number(v))) f[field.key] = `${field.label} sayı olmalı.`;
      if (field.type === "date" && !DATE_RE.test(String(v))) f[field.key] = `${field.label} tarih olmalı.`;
      if (field.type === "select" && !field.options.includes(String(v))) f[field.key] = `${field.label} için listeden seçin.`;
      out[field.key] = field.type === "bool" ? Boolean(v) : v;
    }
    if (Object.keys(f).length) return err(422, "validation", VALIDATION, f);
    customValues.set(`${entity}:${params.id}`, out);
    return HttpResponse.json({ data: { values: out }, message: "Özel alanlar kaydedildi." });
  }),
    ];
  }),
];

// ============================================================================================
// 25 — Aktarım geçmişi, araç ve açılış bakiyesi aktarımı, geri alma
// ============================================================================================
interface ImportBatch { id: string; type: "units" | "vehicles" | "opening_balances"; file_name: string; status: "previewed" | "imported" | "rolled_back"; row_count: number; created_count: number; created_by: string; created_at: string; rollback_until: string | null; rollback_blocked_by: string | null; created_ids: string[]; total_amount: string | null }
interface CsvPreview { import_id: string; type: string; rows: Record<string, unknown>[]; issues: { row_number: number; column: string | null; message: string; severity: "error" | "warning" }[]; total_rows: number; importable_count: number; total_amount: string | null; expires_at: string }
const importBatches = loadMap<string, ImportBatch[]>("importBatches");
const previews = new Map<string, CsvPreview & { slug: string; file_name: string }>();

function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0]?.match(/;/g)?.length ?? 0) >= (lines[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
}
const trNumber = (s: string) => { const t = s.trim(); if (!t) return NaN; return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); };

const aktarim: RequestHandler[] = [
  http.get(`${API}/imports`, ({ params }) => HttpResponse.json([...listOf(importBatches, String(params.slug))].reverse().map((b) => ({ ...b, can_rollback: b.status === "imported" && !b.rollback_blocked_by && !!b.rollback_until && b.rollback_until > new Date().toISOString() })))),
  // Gerçek bölüm aktarımı onayı geçmişe de yazılır
  http.post(`${API}/imports/units/:id/confirm`, async ({ request, params }) => {
    const r = await real<{ data?: { created_units: number }; message?: string }>(request, `/api/v1/sites/${params.slug}/imports/units/${params.id}/confirm`, { method: "POST" });
    if (r.status === 200 && r.body?.data) {
      listOf(importBatches, String(params.slug)).push({ id: String(params.id), type: "units", file_name: "daire-aktarimi.xlsx", status: "imported", row_count: r.body.data.created_units, created_count: r.body.data.created_units, created_by: (await me(request)).name, created_at: new Date().toISOString(), rollback_until: new Date(Date.now() + 7 * 864e5).toISOString(), rollback_blocked_by: "Bölüm aktarımının geri alınması backend'de yapılır (istek 25).", created_ids: [], total_amount: null });
    }
    return HttpResponse.json(r.body, { status: r.status });
  }),
  ...(["vehicles", "opening-balances"] as const).map((seg) => http.post(`${API}/imports/${seg}`, async ({ request, params }) => {
    const fd = await request.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return err(422, "validation", VALIDATION, { file: "Dosya seçin." });
    if (!/\.csv$/i.test(file.name)) return err(422, "invalid_file_type", "Sahte servis yalnız .csv okur; servis gelince .xlsx de kabul edilecek.", { file: "Yalnız .csv" });
    const slug = String(params.slug);
    const type = seg === "vehicles" ? "vehicles" : "opening_balances";
    const cells = parseCsv(await file.text());
    const header = (cells[0] ?? []).map((h) => h.toLocaleLowerCase("tr-TR"));
    const col = (names: string[]) => header.findIndex((h) => names.includes(h));
    const issues: CsvPreview["issues"] = [];
    const rows: Record<string, unknown>[] = [];
    const units = await allPages<UnitRow>(request, `/api/v1/sites/${slug}/units`);
    const byCode = new Map(units.map((u) => [u.display_name.toLocaleUpperCase("tr-TR"), u]));
    let total = 0;
    if (type === "vehicles") {
      const cu = col(["bölüm", "bolum", "daire", "bölüm kodu"]), cp = col(["plaka"]), cb = col(["marka", "marka/model", "marka model"]), cc = col(["renk"]);
      if (cu < 0 || cp < 0) return err(422, "invalid_file_content", "Başlıkta Bölüm ve Plaka sütunları gerekli.", { file: "Sütun eksik" });
      cells.slice(1).forEach((r, i) => {
        const n = i + 2, unit = byCode.get((r[cu] ?? "").toLocaleUpperCase("tr-TR")), plate = normPlate(r[cp] ?? "");
        if (!unit) issues.push({ row_number: n, column: "Bölüm", message: `Bölüm bulunamadı: ${r[cu]}`, severity: "error" });
        if (!PLATE_RE.test(plate)) issues.push({ row_number: n, column: "Plaka", message: `Plaka geçersiz: ${r[cp]}`, severity: "error" });
        rows.push({ row_number: n, unit_id: unit?.id, unit_name: unit?.display_name ?? r[cu], plate, plate_display: displayPlate(plate), brand_model: r[cb] || null, color: r[cc] || null, ok: !!unit && PLATE_RE.test(plate) });
      });
    } else {
      const ca = col(["hesap", "referans", "referans kodu", "hesap kodu"]), ct = col(["tutar", "bakiye", "borç", "borc"]), cd = col(["tarih", "bakiye tarihi"]);
      if (ca < 0 || ct < 0) return err(422, "invalid_file_content", "Başlıkta Referans kodu ve Tutar sütunları gerekli.", { file: "Sütun eksik" });
      const accounts = await allPages<{ id: string; reference_code: string; unit_name: string; person_name: string | null }>(request, `/api/v1/sites/${slug}/accounts`);
      const byRef = new Map(accounts.map((a) => [a.reference_code.toLocaleUpperCase("tr-TR"), a]));
      cells.slice(1).forEach((r, i) => {
        const n = i + 2, acc = byRef.get((r[ca] ?? "").toLocaleUpperCase("tr-TR")), amount = trNumber(r[ct] ?? ""), date = r[cd] || today();
        if (!acc) issues.push({ row_number: n, column: "Referans", message: `Hesap bulunamadı: ${r[ca]}`, severity: "error" });
        if (Number.isNaN(amount) || amount === 0) issues.push({ row_number: n, column: "Tutar", message: `Tutar okunamadı: ${r[ct]}`, severity: "error" });
        const ok = !!acc && !Number.isNaN(amount) && amount !== 0;
        if (ok) total += amount;
        rows.push({ row_number: n, account_id: acc?.id, reference_code: acc?.reference_code ?? r[ca], unit_name: acc?.unit_name, person_name: acc?.person_name, amount: Number.isNaN(amount) ? null : amount.toFixed(2), direction: amount >= 0 ? "debit" : "credit", date, ok });
      });
    }
    const p: CsvPreview & { slug: string; file_name: string } = { import_id: crypto.randomUUID(), type, rows, issues, total_rows: rows.length, importable_count: rows.filter((r) => r.ok).length, total_amount: type === "opening_balances" ? total.toFixed(2) : null, expires_at: new Date(Date.now() + 6 * 3600e3).toISOString(), slug, file_name: file.name };
    previews.set(p.import_id, p);
    return HttpResponse.json(p);
  })),
  http.post(`${API}/imports/:id/confirm`, async ({ request, params }) => {
    const p = previews.get(String(params.id));
    if (!p) return err(404, "not_found", "Önizleme bulunamadı ya da süresi doldu; dosyayı yeniden yükleyin.");
    const b = (await request.json().catch(() => ({}))) as { reconciliation_total?: string | null };
    const slug = String(params.slug);
    const ok = p.rows.filter((r) => r.ok);
    if (p.type === "opening_balances") {
      if (p.issues.some((i) => i.severity === "error")) return err(409, "rows_invalid", "Bakiye aktarımında tüm satırlar temiz olmalı; hatalı satırları düzeltip yeniden yükleyin.");
      if (b.reconciliation_total == null || b.reconciliation_total === "") return err(422, "validation", "Eski sistemdeki toplam bakiyeyi girin.", { reconciliation_total: "Zorunlu." });
      const diff = Number(p.total_amount) - Number(b.reconciliation_total);
      if (Math.abs(diff) > 0.005) return err(409, "reconciliation_mismatch", `Yüklenen toplam (${Number(p.total_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺) eski sistem toplamıyla (${Number(b.reconciliation_total).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺) tutmuyor; fark ${diff.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺. Fark bulunmadan onaya gönderilemez.`);
    }
    const ids: string[] = [];
    const skipped: string[] = [];
    for (const r of ok) {
      if (p.type === "vehicles") {
        const u = await real<UnitDetail>(request, `/api/v1/sites/${slug}/units/${r.unit_id}`);
        const owner = u.body?.parties.find((x) => x.is_current && (x.role === "tenant" || x.role === "resident"))?.person ?? u.body?.parties.find((x) => x.is_current)?.person;
        const v = addVehicle(slug, { id: String(r.unit_id), name: String(r.unit_name) }, { plate: String(r.plate), brand_model: r.brand_model as string | null, color: r.color as string | null, kind: "permanent", force: true }, { id: owner?.id ?? null, name: owner?.full_name ?? null }, false);
        if (v instanceof Response) skipped.push(`${r.row_number}. satır (${r.plate_display})`); else ids.push(v.id);
      } else {
        const res = await real<{ error?: { message?: string } }>(request, `/api/v1/sites/${slug}/accounts/${r.account_id}/opening-balance`, { method: "POST", body: { amount: Math.abs(Number(r.amount)).toFixed(2), direction: r.direction, date: r.date, description: `Açılış bakiyesi aktarımı (${p.file_name})` }, idem: `import-${p.import_id}-${r.row_number}` });
        if (res.status >= 300) skipped.push(`${r.row_number}. satır (${res.body?.error?.message ?? "hata"})`); else ids.push(String(r.account_id));
      }
    }
    const batch: ImportBatch = { id: p.import_id, type: p.type as ImportBatch["type"], file_name: p.file_name, status: "imported", row_count: p.total_rows, created_count: ids.length, created_by: (await me(request)).name, created_at: new Date().toISOString(), rollback_until: new Date(Date.now() + 7 * 864e5).toISOString(), rollback_blocked_by: p.type === "opening_balances" ? "Açılış bakiyesi deftere yazıldı; geri alma ters kayıtla backend'de yapılır (istek 25)." : null, created_ids: ids, total_amount: p.total_amount };
    listOf(importBatches, slug).push(batch);
    previews.delete(p.import_id);
    return HttpResponse.json({ data: { created: ids.length, skipped, total_amount: p.total_amount }, message: p.type === "vehicles" ? `${ids.length} araç aktarıldı.${skipped.length ? ` Atlanan: ${skipped.join(", ")}.` : ""}` : `${ids.length} hesaba açılış bakiyesi yazıldı; toplam ${Number(p.total_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ eski sistemle mutabık.` });
  }),
  http.post(`${API}/imports/:id/rollback`, ({ params }) => {
    const slug = String(params.slug);
    const b = listOf(importBatches, slug).find((x) => x.id === params.id);
    if (!b) return err(404, "not_found", "Aktarım bulunamadı.");
    if (b.status !== "imported") return err(409, "not_imported", "Bu aktarım zaten geri alınmış.");
    if (!b.rollback_until || b.rollback_until < new Date().toISOString()) return err(409, "rollback_expired", "Geri alma süresi (7 gün) doldu.");
    if (b.rollback_blocked_by) return err(409, "rollback_blocked", b.rollback_blocked_by);
    if (b.type === "vehicles") { const ids = new Set(b.created_ids); const list = listOf(vehicles, slug); for (const v of list) if (ids.has(v.id)) v.status = "inactive"; }
    b.status = "rolled_back";
    return HttpResponse.json({ data: b, message: `Aktarım geri alındı; ${b.created_count} kayıt kaldırıldı.` });
  }),
];

// ============================================================================================
// 26 — Kurulum ve canlıya geçiş
// ============================================================================================
interface SetupState { status: "setup" | "live"; went_live_at: string | null; opening_reconciled: boolean }
const setupState = loadMap<string, SetupState>("setupState");
const setupOf = (slug: string) => { if (!setupState.has(slug)) setupState.set(slug, { status: "live", went_live_at: null, opening_reconciled: false }); return setupState.get(slug)!; };

async function checklist(request: Request, slug: string) {
  const sum = await structureSummary(request, slug);
  const reg = regOf(slug);
  const [members, rules, cash, sched, imports] = await Promise.all([
    real<{ role_key: string; is_active: boolean }[]>(request, `/api/v1/sites/${slug}/members`),
    real<{ is_active: boolean }[]>(request, `/api/v1/sites/${slug}/approval-rules`),
    real<Paged<{ kind: string; iban: string | null; is_active: boolean }>>(request, `/api/v1/sites/${slug}/cash-accounts?page_size=50`),
    real<{ enabled: boolean }>(request, `/api/v1/sites/${slug}/charge-schedule`),
    Promise.resolve(listOf(importBatches, slug)),
  ]);
  const bank = (cash.body?.items ?? []).find((a) => a.kind === "bank" && a.iban && a.is_active);
  const items = [
    { key: "structure", label: "Yapı tanımlı (blok ve bölümler)", ok: sum.active_unit_count > 0 && sum.block_count > 0, detail: `${sum.block_count} blok, ${sum.active_unit_count} bölüm`, link: "daireler", required: true },
    { key: "owners", label: "Her bölümün en az bir maliki var", ok: sum.units_without_owner.length === 0, detail: sum.units_without_owner.length ? `${sum.units_without_owner.length} bölümde malik yok: ${sum.units_without_owner.slice(0, 5).map((u) => u.display_name).join(", ")}${sum.units_without_owner.length > 5 ? "…" : ""}` : "Tamam", link: "daireler", required: true },
    { key: "shares", label: "Malik hisseleri tam %100", ok: sum.units_shares_incomplete.length === 0, detail: sum.units_shares_incomplete.length ? `${sum.units_shares_incomplete.length} bölümde eksik: ${sum.units_shares_incomplete.slice(0, 5).map((u) => `${u.display_name} (%${u.total})`).join(", ")}` : "Tamam", link: "daireler", required: true },
    { key: "land_share", label: "Arsa payları toplamı paydaya eşit", ok: !sum.land_share_mismatch && sum.units_without_land_share === 0, detail: sum.land_share_denominator ? `${sum.land_share_sum} / ${sum.land_share_denominator}${sum.units_without_land_share ? ` · ${sum.units_without_land_share} bölümde arsa payı yok` : ""}` : "Arsa payı girilmemiş", link: "daireler", required: false },
    { key: "bank", label: "Site adına banka hesabı (IBAN) tanımlı", ok: !!bank, detail: bank ? "Tamam" : "Kasa ve Banka'dan IBAN'lı banka hesabı ekleyin", link: "kasa", required: true },
    { key: "charge_rule", label: "Aidat kuralı ve otomatik tahakkuk tanımlı", ok: !!sched.body?.enabled, detail: sched.body?.enabled ? "Otomatik aylık tahakkuk açık" : "İşletme projesi kesinleştirilip otomatik tahakkuk açılmalı", link: "tahakkuk", required: true },
    { key: "opening", label: "Açılış bakiyesi mutabakatı yapıldı", ok: imports.some((b) => b.type === "opening_balances" && b.status === "imported") || setupOf(slug).opening_reconciled, detail: "Eski sistemdeki bakiyeler aktarılıp toplam tutturuldu", link: "iceri-aktar", required: true },
    { key: "manager", label: "En az bir etkin site yöneticisi", ok: (members.body ?? []).some((m) => m.role_key === "manager" && m.is_active), detail: `${(members.body ?? []).filter((m) => m.is_active).length} etkin kullanıcı`, link: "kullanicilar", required: true },
    { key: "mfa", label: "Site yöneticisi iki adımlı doğrulama kurdu", ok: false, detail: "İki adımlı doğrulama henüz yok (açık karar); pilot öncesi eklenecek", link: null, required: false },
    { key: "kvkk", label: "KVKK aydınlatma metni yayında", ok: reg.kvkk_published, detail: reg.kvkk_published ? "Yayında" : "Hukuk onayı bekliyor (K8); Ayarlar › Kayıt yöntemleri'nden işaretlenir", link: "kayit-basvurulari", required: true },
    { key: "approvals", label: "Onay kuralları gözden geçirildi", ok: (rules.body ?? []).some((r) => r.is_active), detail: `${(rules.body ?? []).filter((r) => r.is_active).length} yürürlükte kural`, link: "onay-kurallari", required: false },
    { key: "registration", label: "Kayıt yöntemleri ayarlandı", ok: reg.invite_enabled || reg.qr_enabled || reg.code_enabled, detail: [reg.invite_enabled && "davet", reg.qr_enabled && "QR", reg.code_enabled && "site kodu"].filter(Boolean).join(", ") || "Hiçbir yöntem açık değil", link: "kayit-basvurulari", required: false },
  ];
  return items;
}

const kurulum: RequestHandler[] = [
  http.get(`${API}/setup`, async ({ request, params }) => {
    const slug = String(params.slug);
    await cachePublicUnits(request, slug);
    const items = await checklist(request, slug);
    const s = setupOf(slug);
    return HttpResponse.json({ ...s, finance_mode: "platform", checklist: items, ready: items.filter((i) => i.required).every((i) => i.ok) });
  }),
  http.post(`${API}/setup/go-live`, async ({ request, params }) => {
    const slug = String(params.slug);
    const s = setupOf(slug);
    if (s.status === "live") return err(409, "already_live", "Tesis zaten canlı.");
    const missing = (await checklist(request, slug)).filter((i) => i.required && !i.ok);
    if (missing.length) return err(409, "checklist_incomplete", `Eksik maddeler var: ${missing.map((m) => m.label).join("; ")}`);
    Object.assign(s, { status: "live", went_live_at: new Date().toISOString() });
    return HttpResponse.json({ data: s, message: "Tesis canlıya alındı; artık davet gönderilebilir." });
  }),
  http.post(`${API}/setup/reset-demo`, ({ params }) => {
    Object.assign(setupOf(String(params.slug)), { status: "setup", went_live_at: null });
    return HttpResponse.json({ data: setupOf(String(params.slug)), message: "Demo: tesis 'Kurulumda' durumuna alındı." });
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
  for (const c of listOf(adHocCharges, slug).filter((x) => x.status === "posted" && x.created_at.slice(0, 10) >= from && x.created_at.slice(0, 10) <= to)) {
    const m = map.get("ad_hoc_charge")!;
    out.push({ key: `ad_hoc:${c.id}`, source: "ad_hoc_charge", source_id: c.id, date: c.created_at.slice(0, 10), description: `${c.unit_name} ${c.description}`, debit_account: m.debit_account, credit_account: m.credit_account, amount: c.amount });
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
    const acc = accs.body?.items.find((a) => a.kind === b.account_kind && !a.is_closed);
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

export const handlers: RequestHandler[] = [...yapi, ...bolum360, ...kisiler, ...araclar, ...kayit, ...ozelAlanlar, ...aktarim, ...kurulum, ...finans];
