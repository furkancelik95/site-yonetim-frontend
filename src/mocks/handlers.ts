// Henüz backend'de olmayan uçların sahte karşılıkları. Her biri docs/servis-istekleri/ altındaki
// isteğin "Beklenen yanıt" örneğiyle AYNI şekli döner. Servis gelince ilgili handler silinir.
// Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
import { bypass, http, HttpResponse } from "msw";

const API = "/api/v1/sites/:slug";

const err = (status: number, code: string, message: string, fields: Record<string, string> | null = null) =>
  HttpResponse.json({ error: { code, message, fields } }, { status });

/** Gerçek backend'den oku (aynı oturum başlığıyla) — sahte uç gerçek veriye dayansın. */
async function real<T>(request: Request, path: string): Promise<{ status: number; body: T | null }> {
  const url = new URL(path, request.url);
  const res = await fetch(bypass(new Request(url, { headers: request.headers })));
  return { status: res.status, body: res.ok ? ((await res.json()) as T) : null };
}

const money = (n: number) => n.toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();

// --- Servis isteği 01: borçsuzluk belgesi -------------------------------------------------
interface Certificate {
  id: string;
  number: string;
  site: { name: string; slug: string };
  account: { id: string; reference_code: string; kind: string; unit_name: string; person_name: string | null };
  balance: string;
  as_of: string;
  issued_at: string;
  issued_by: string;
  valid_until: string;
}
const certificates = new Map<string, Certificate>();
let certSeq = 0;

// --- Servis isteği 02: devir bakiye ---------------------------------------------------------
const openings = new Map<string, { id: string; amount: string; direction: string; date: string; description: string }>();

// --- Servis isteği 04: otomatik tahakkuk ------------------------------------------------------
const schedules = new Map<string, { enabled: boolean; charge_day: number; due_days: number; notify_on_run: boolean }>();

function nextRun(day: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d <= now) d.setMonth(d.getMonth() + 1);
  // toISOString UTC'ye çevirir ve gün kayar; yerel tarih yazılır
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const handlers = [
  // 01 — borçsuzluk belgesi kes
  http.post(`${API}/accounts/:accountId/clearance-certificates`, async ({ request, params }) => {
    const st = await real<{ account: { id: string; reference_code: string; kind: string; unit_name: string; person_name: string | null; balance: string } }>(
      request,
      `/api/v1/sites/${params.slug}/accounts/${params.accountId}/statement?page_size=1`,
    );
    if (st.status === 404 || !st.body) return err(404, "not_found", "Hesap bulunamadı.");
    if (st.status === 403) return err(403, "forbidden", "Bu işlem için yetkiniz yok.");
    const a = st.body.account;
    if (Number(a.balance) > 0.005) {
      return err(409, "has_debt", `Bu hesabın ${a.balance.replace(".", ",")} TL borcu var; borçsuzluk belgesi verilemez.`);
    }
    const site = await real<{ name: string; slug: string }>(request, `/api/v1/sites/${params.slug}`);
    const c: Certificate = {
      id: uuid(),
      number: `BB-${new Date().getFullYear()}-${String(++certSeq).padStart(5, "0")}`,
      site: { name: site.body?.name ?? String(params.slug), slug: String(params.slug) },
      account: { id: a.id, reference_code: a.reference_code, kind: a.kind, unit_name: a.unit_name, person_name: a.person_name },
      balance: a.balance,
      as_of: today(),
      issued_at: new Date().toISOString(),
      issued_by: "Oturumdaki kullanıcı",
      valid_until: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    };
    certificates.set(c.id, c);
    return HttpResponse.json({ data: c, message: `${c.number} numaralı borçsuzluk belgesi düzenlendi.` }, { status: 201 });
  }),

  // 01 — belgeyi oku (yazdırma sayfası)
  http.get(`${API}/clearance-certificates/:id`, ({ params }) => {
    const c = certificates.get(String(params.id));
    return c ? HttpResponse.json(c) : err(404, "not_found", "Belge bulunamadı.");
  }),

  // 02 — devir bakiye
  http.post(`${API}/accounts/:accountId/opening-balance`, async ({ request, params }) => {
    const body = (await request.json()) as { amount?: string; direction?: string; date?: string; description?: string };
    const key = `${params.slug}/${params.accountId}`;
    if (openings.has(key)) return err(409, "already_exists", "Bu hesaba devir bakiye daha önce girildi. Düzeltmek için ters kayıt kullanın.");
    if (!body.amount || Number(body.amount) <= 0) return err(422, "validation", "Tutar sıfırdan büyük olmalı.", { amount: "Tutar sıfırdan büyük olmalı." });
    const e = { id: uuid(), amount: money(Number(body.amount)), direction: body.direction ?? "debit", date: body.date ?? today(), description: body.description || "Devir bakiye" };
    openings.set(key, e);
    return HttpResponse.json({ data: e, message: `${e.amount.replace(".", ",")} TL devir ${e.direction === "debit" ? "borç" : "alacak"} olarak işlendi.` }, { status: 201 });
  }),

  // 03 — iade (alacaklı bakiyenin sakine geri ödenmesi)
  http.post(`${API}/refunds`, async ({ request, params }) => {
    const body = (await request.json()) as { ledger_account_id?: string; amount?: string; cash_account_id?: string; reason?: string };
    const st = await real<{ account: { balance: string } }>(request, `/api/v1/sites/${params.slug}/accounts/${body.ledger_account_id}/statement?page_size=1`);
    if (!st.body) return err(404, "not_found", "Hesap bulunamadı.");
    const credit = -Number(st.body.account.balance);
    if (credit <= 0.005) return err(409, "no_credit", "Bu hesabın alacak bakiyesi yok; iade yapılamaz.");
    if (!body.amount || Number(body.amount) <= 0) return err(422, "validation", "Tutar sıfırdan büyük olmalı.", { amount: "Tutar sıfırdan büyük olmalı." });
    if (Number(body.amount) > credit + 0.005)
      return err(422, "validation", "İade tutarı alacak bakiyesini aşamaz.", { amount: `En fazla ${money(credit).replace(".", ",")} TL iade edilebilir.` });
    if (!body.reason?.trim()) return err(422, "validation", "Gerekçe zorunlu.", { reason: "Gerekçe zorunlu." });
    const r = { id: uuid(), ledger_account_id: body.ledger_account_id, amount: money(Number(body.amount)), date: today(), cash_account_id: body.cash_account_id, reason: body.reason };
    return HttpResponse.json({ data: r, message: `${r.amount.replace(".", ",")} TL iade kaydedildi.` }, { status: 201 });
  }),

  // 04 — otomatik tahakkuk ayarı
  http.get(`${API}/charge-schedule`, ({ params }) => {
    const s = schedules.get(String(params.slug)) ?? { enabled: false, charge_day: 1, due_days: 14, notify_on_run: true };
    return HttpResponse.json({ ...s, next_run_on: s.enabled ? nextRun(s.charge_day) : null, last_run: null });
  }),
  http.put(`${API}/charge-schedule`, async ({ request, params }) => {
    const b = (await request.json()) as { enabled: boolean; charge_day: number; due_days: number; notify_on_run: boolean };
    if (!(b.charge_day >= 1 && b.charge_day <= 28)) return err(422, "validation", "Gün 1–28 arasında olmalı.", { charge_day: "Gün 1–28 arasında olmalı (her ayda bulunsun diye)." });
    if (!(b.due_days >= 0 && b.due_days <= 60)) return err(422, "validation", "Vade 0–60 gün olmalı.", { due_days: "Vade 0–60 gün olmalı." });
    schedules.set(String(params.slug), b);
    return HttpResponse.json({
      data: { ...b, next_run_on: b.enabled ? nextRun(b.charge_day) : null, last_run: null },
      message: b.enabled ? `Otomatik tahakkuk açıldı; her ayın ${b.charge_day}. günü kesilecek.` : "Otomatik tahakkuk kapatıldı.",
    });
  }),
];
