import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { Plus, Trash2, Users } from "lucide-react";
import { api, ApiError, newIdempotencyKey } from "../../api/client";
import { useSiteGet } from "../../api/hooks";
import type { CashAccounts, Schemas, Written } from "../../api/types";
import { AccountPicker, type PickedAccount } from "../../components/AccountPicker";
import { useToast } from "../../components/toast";
import { Alert, Badge, PageHead } from "../../components/ui";
import { formatMoney, parseMoneyInput, todayIso } from "../../lib/format";
import { paymentMethod } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type Debtors = Schemas["DebtorPage"];
type Result = Schemas["PaymentResultOut"];

interface Row {
  key: string;
  account: PickedAccount | null;
  amount: string;
  reference: string;
  // kayıt sonucu
  state: "draft" | "saving" | "saved" | "error";
  message?: string;
  idem: string; // satır başına sabit: aynı satır iki kez gönderilse ikinci kayıt oluşmaz
}

const newRow = (account: PickedAccount | null = null, amount = ""): Row => ({
  key: crypto.randomUUID(), account, amount, reference: "", state: "draft", idem: newIdempotencyKey(),
});

/**
 * Toplu tahsilat (Apsiyon "Toplu Tahsilat"). Yeni servis gerekmez: her satır mevcut
 * POST /payments ile, kendi Idempotency-Key'iyle sırayla kaydedilir; satır satır sonuç gösterilir.
 */
export function BulkPaymentPage() {
  const { site } = useSite();
  const qc = useQueryClient();
  const toast = useToast();
  const cash = useSiteGet<CashAccounts>("/cash-accounts");
  const accounts = cash.data?.items.filter((c) => c.is_active) ?? [];
  const [common, setCommon] = useState({ date: todayIso(), method: "bank_transfer", cash_account_id: "" });
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [running, setRunning] = useState(false);
  const [loadingDebtors, setLoadingDebtors] = useState(false);
  const cashId = common.cash_account_id || accounts.find((a) => (common.method === "cash" ? a.kind === "cash" : a.kind === "bank"))?.id || "";

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.state !== "saved" && r.account && r.amount.trim());
  const total = filled.reduce((s, r) => s.plus(parseMoneyInput(r.amount) ?? 0), new Decimal(0));

  async function addDebtors() {
    setLoadingDebtors(true);
    try {
      const d = await api<Debtors>("GET", `/sites/${site.slug}/debtors`, { query: { page_size: 100 } });
      const existing = new Set(rows.map((r) => r.account?.id).filter(Boolean));
      const add = d.items
        .filter((x) => !existing.has(x.id))
        .map((x) => newRow({ id: x.id, reference_code: x.reference_code, unit_name: x.unit_name, person_name: x.person_name ?? null, balance: x.balance, kind: x.kind }, formatMoney(x.balance, false)));
      setRows((rs) => [...rs.filter((r) => r.account || r.amount), ...add]);
      toast(`${add.length} borçlu hesap eklendi; tutarlar bakiyeyle dolduruldu, gerekeni düzeltin.`, "info");
    } catch {
      toast("Borçlu listesi alınamadı.", "danger");
    } finally {
      setLoadingDebtors(false);
    }
  }

  async function saveAll() {
    setRunning(true);
    let ok = 0;
    for (const r of rows) {
      if (r.state === "saved" || !r.account || !r.amount.trim()) continue;
      const amount = parseMoneyInput(r.amount);
      if (!amount || Number(amount) <= 0) { update(r.key, { state: "error", message: "Geçerli bir tutar girin." }); continue; }
      update(r.key, { state: "saving", message: undefined });
      try {
        const res = await api<Written<Result>>("POST", `/sites/${site.slug}/payments`, {
          idempotencyKey: r.idem,
          body: { ledger_account_id: r.account.id, amount, date: common.date, method: common.method, cash_account_id: cashId || null, reference: r.reference.trim() || null, note: "Toplu tahsilat" },
        });
        ok++;
        update(r.key, { state: "saved", message: `Kaydedildi · yeni bakiye ${formatMoney(res.data.balance)}`, account: { ...r.account, balance: res.data.balance } });
      } catch (e) {
        update(r.key, { state: "error", message: e instanceof ApiError ? e.message : "Bağlantı hatası; tekrar deneyin." });
      }
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["site", site.slug] });
    if (ok > 0) toast(`${ok} tahsilat kaydedildi.`);
  }

  const errors = rows.filter((r) => r.state === "error").length;

  return (
    <div className="stack">
      <PageHead
        title="Toplu tahsilat"
        subtitle="Birden çok hesaba aynı anda tahsilat girin. Her satır ayrı kaydedilir; biri hata verirse diğerleri etkilenmez."
        actions={<Link className="btn" to={`/s/${site.slug}/tahsilat`}>Tahsilat listesi</Link>}
      />

      <div className="card">
        <div className="card__head"><span className="card__title">Ortak bilgiler</span></div>
        <div className="card__body">
          <div className="grid grid--kpi">
            <div className="field">
              <label className="field__label" htmlFor="bp-date">Tarih</label>
              <input id="bp-date" className="field__input" type="date" value={common.date} onChange={(e) => setCommon((c) => ({ ...c, date: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="bp-method">Yöntem</label>
              <select id="bp-method" className="field__input" value={common.method} onChange={(e) => setCommon((c) => ({ ...c, method: e.target.value, cash_account_id: "" }))}>
                {["bank_transfer", "cash", "credit_card", "other"].map((m) => <option key={m} value={m}>{paymentMethod(m)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="bp-cash">Kasa / banka hesabı</label>
              <select id="bp-cash" className="field__input" value={cashId} onChange={(e) => setCommon((c) => ({ ...c, cash_account_id: e.target.value }))}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <span className="card__title">Tahsilatlar</span>
          <button className="btn btn--sm ml-auto" type="button" disabled={loadingDebtors || running} onClick={addDebtors}>
            <Users aria-hidden="true" /> Borçluları ekle
          </button>
        </div>
        <div className="card__body card__body--flush">
          <div className="table-wrap" style={{ overflow: "visible" }}>
            <table className="data">
              <caption className="visually-hidden">Toplu tahsilat satırları</caption>
              <thead>
                <tr><th scope="col" style={{ minWidth: "16rem" }}>Hesap</th><th scope="col" className="right">Bakiye</th><th scope="col">Tutar (₺)</th><th scope="col">Dekont no</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">Sil</span></th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className={r.state === "error" ? "is-overdue" : undefined}>
                    <td><AccountPicker label={`${i + 1}. satır hesabı`} hideLabel value={r.account} onChange={(a) => update(r.key, { account: a, state: "draft", message: undefined })} /></td>
                    <td className="right num small">{r.account ? formatMoney(r.account.balance) : "—"}</td>
                    <td><input aria-label={`${i + 1}. satır tutarı`} className="field__input num" inputMode="decimal" style={{ minWidth: "8rem" }} value={r.amount} disabled={r.state === "saved"} onChange={(e) => update(r.key, { amount: e.target.value, state: "draft" })} /></td>
                    <td><input aria-label={`${i + 1}. satır dekont numarası`} className="field__input" style={{ minWidth: "8rem" }} value={r.reference} disabled={r.state === "saved"} onChange={(e) => update(r.key, { reference: e.target.value })} /></td>
                    <td className="small" style={{ minWidth: "10rem" }} aria-live="polite">
                      {r.state === "saved" ? <Badge tone="ok">{r.message}</Badge> : r.state === "error" ? <span style={{ color: "var(--danger-fg)" }}>{r.message}</span> : r.state === "saving" ? <span className="row" style={{ gap: 6 }}><span className="spinner" aria-hidden="true" /> Kaydediliyor</span> : <span className="subtle">—</span>}
                    </td>
                    <td className="right">
                      {r.state !== "saved" && (
                        <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${i + 1}. satırı sil`} disabled={running} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                          <Trash2 aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={2}>Kaydedilecek: {filled.length} satır</td><td className="num strong">{formatMoney(total.toFixed(2))}</td><td colSpan={3} /></tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="card__foot row row--between">
          <button className="btn btn--sm" type="button" disabled={running} onClick={() => setRows((rs) => [...rs, newRow()])}><Plus aria-hidden="true" /> Satır ekle</button>
          <button className="btn btn--primary" type="button" disabled={running || filled.length === 0} aria-busy={running || undefined} onClick={saveAll}>
            {running && <span className="spinner" aria-hidden="true" />} {filled.length > 0 ? `${filled.length} tahsilatı kaydet` : "Tahsilatları kaydet"}
          </button>
        </div>
      </div>

      {errors > 0 && !running && (
        <Alert tone="warn" title={`${errors} satır kaydedilemedi`}>Hatalı satırları düzeltip yeniden "kaydet"e basın; kaydedilenler tekrar gönderilmez.</Alert>
      )}
    </div>
  );
}
