// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Şu an sahte: 06 banka hareketi aktarımı, 07 tekrarlanan gider.
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
const recurring = new Map<string, Recurring[]>();
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

export const handlers: RequestHandler[] = [
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
