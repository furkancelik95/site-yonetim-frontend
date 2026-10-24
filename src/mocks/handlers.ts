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
/** ISO zaman damgasının YEREL günü (UTC'de .slice(0, 10) gece yarısından sonra bir önceki günü verir). */
const dayOf = (ts: string) => iso(new Date(ts));
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

export const handlers: RequestHandler[] = [...yapi, ...bolum360, ...kisiler, ...araclar, ...kayit, ...ozelAlanlar, ...aktarim, ...kurulum, ...finans, ...ik, ...guvenlik, ...hizmet, ...operasyon, ...rezervasyon, ...satinalma];
