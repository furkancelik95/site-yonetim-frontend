import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { api } from "../../api/client";
import { useSiteGet } from "../../api/hooks";
import type { CashAccounts, Written } from "../../api/types";
import { AccountPicker, type PickedAccount } from "../../components/AccountPicker";
import { MockBadge } from "../../components/MockBadge";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, FormError, Kpi, PageHead, SubmitButton } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format";
import { useSite } from "../../site/SiteContext";
import Decimal from "decimal.js";

/** Servis isteği 06'daki yanıt şekli — servis gelince üretilmiş tipe geçilir. */
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
interface Preview {
  import_id: string;
  file_name: string;
  cash_account_id: string;
  expires_at: string;
  row_count: number;
  matched_count: number;
  suggested_count: number;
  unmatched_count: number;
  ignored_count: number;
  total_in: string;
  rows: BankRow[];
}
interface ConfirmResult { created_payments: number; total_amount: string; skipped: string[] }

const STATUS: Record<BankRow["status"], { label: string; tone: "ok" | "info" | "warn" | "muted" | "danger" }> = {
  matched: { label: "Eşleşti", tone: "ok" },
  suggested: { label: "Öneri", tone: "info" },
  unmatched: { label: "Eşleşmedi", tone: "warn" },
  ignored: { label: "Çıkış · aktarılmaz", tone: "muted" },
  duplicate: { label: "Daha önce aktarıldı", tone: "muted" },
};

/**
 * Banka hareketi aktarımı (Apsiyon "Excel ile Banka Hareketleri Yükleme" + eşleştirme).
 * Bankadan indirilen ekstre yüklenir; girişler referans koduna/ada göre hesaplarla eşleştirilir;
 * kullanıcı onaylar, seçilen satırlar tahsilat olarak işlenir. Servis isteği 06.
 */
export function BankImportPage() {
  const { site } = useSite();
  const qc = useQueryClient();
  const toast = useToast();
  const cash = useSiteGet<CashAccounts>("/cash-accounts");
  const banks = cash.data?.items.filter((c) => c.is_active && c.kind === "bank") ?? [];
  const [file, setFile] = useState<File | null>(null);
  const [cashId, setCashId] = useState("");
  const [fileErr, setFileErr] = useState<string>();
  const [picks, setPicks] = useState<Record<number, PickedAccount | null>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const bankId = cashId || banks[0]?.id || "";

  const upload = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("cash_account_id", bankId);
      return api<Preview>("POST", `/sites/${site.slug}/bank-imports`, { form: fd });
    },
    onSuccess: (p) => {
      setResult(null);
      // Öneriler başlangıç seçimi: yüksek güvenli eşleşmeler işaretli, öneriler işaretsiz (kullanıcı bakıp seçsin)
      const pk: Record<number, PickedAccount | null> = {};
      const sel = new Set<number>();
      for (const r of p.rows) {
        if (r.suggestion && (r.status === "matched" || r.status === "suggested")) {
          pk[r.row_number] = { id: r.suggestion.ledger_account_id, reference_code: r.suggestion.reference_code, unit_name: r.suggestion.unit_name, person_name: r.suggestion.person_name, balance: r.suggestion.balance };
        }
        if (r.status === "matched") sel.add(r.row_number);
      }
      setPicks(pk);
      setSelected(sel);
    },
  });
  const p = upload.data;

  const confirm = useMutation({
    mutationFn: (rows: { row_number: number; ledger_account_id: string }[]) =>
      api<Written<ConfirmResult>>("POST", `/sites/${site.slug}/bank-imports/${p!.import_id}/confirm`, { body: { rows } }),
    onSuccess: (res) => {
      toast(res.message);
      setResult(res.data);
      upload.reset();
      setFile(null);
      qc.invalidateQueries({ queryKey: ["site", site.slug] });
    },
  });

  const chosen = useMemo(() => (p ? p.rows.filter((r) => selected.has(r.row_number) && picks[r.row_number]) : []), [p, selected, picks]);
  const chosenTotal = chosen.reduce((s, r) => s.plus(r.amount), new Decimal(0));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setFileErr("Bankadan indirdiğiniz ekstre dosyasını seçin.");
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return setFileErr("Yalnız .xlsx, .xls ya da .csv yüklenebilir.");
    if (file.size > 5 * 1024 * 1024) return setFileErr("Dosya en fazla 5 MB olabilir.");
    setFileErr(undefined);
    upload.mutate(file);
  }

  const toggle = (n: number) => setSelected((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  return (
    <div className="stack">
      <PageHead
        title="Banka hareketi aktarımı"
        subtitle="Bankadan indirdiğiniz ekstreyi yükleyin; gelen havaleler hesaplarla eşleştirilir, onayladıklarınız tahsilat olarak işlenir."
        actions={<MockBadge request="06" />}
      />

      {result && (
        <Alert tone="ok" title="Aktarım tamamlandı">
          {result.created_payments} tahsilat işlendi, toplam {formatMoney(result.total_amount)}.
          {result.skipped.length > 0 && <> Atlanan: {result.skipped.join(", ")}.</>} <Link to={`/s/${site.slug}/tahsilat`}>Tahsilatlara git</Link>
        </Alert>
      )}

      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={upload.error} />
          <div className="grid grid--2">
            <div className="field">
              <label className="field__label" htmlFor="bi-bank">Banka hesabı</label>
              <select id="bi-bank" className="field__input" value={bankId} onChange={(e) => setCashId(e.target.value)}>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <span className="field__hint">Hareketler bu hesaba giriş olarak yazılır.</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="bi-file">Ekstre dosyası</label>
              <input id="bi-file" className="field__input" type="file" accept=".xlsx,.xls,.csv" aria-invalid={fileErr ? true : undefined} onChange={(e) => { setFile(e.target.files?.[0] ?? null); upload.reset(); }} />
              <span className="field__hint">.xlsx, .xls ya da .csv, en fazla 5 MB. Bankanın internet şubesinden "hesap hareketleri" olarak indirilir.</span>
              {fileErr && <span className="field__error" role="alert">{fileErr}</span>}
            </div>
          </div>
        </div>
        <div className="card__foot">
          <SubmitButton busy={upload.isPending} className="btn" disabled={!file || !bankId}><FileSpreadsheet aria-hidden="true" /> Yükle ve eşleştir</SubmitButton>
        </div>
      </form>

      {p && (
        <>
          <div className="grid grid--kpi">
            <Kpi label="Gelen havale" value={formatMoney(p.total_in)} small note={`${p.row_count} satır · ${p.file_name}`} />
            <Kpi label="Eşleşti" tone="ok" value={p.matched_count} note="referans kodu bulundu" />
            <Kpi label="Öneri" value={p.suggested_count} note="ad benziyor, kontrol edin" />
            <Kpi label="Eşleşmedi" tone={p.unmatched_count > 0 ? "warn" : undefined} value={p.unmatched_count} note={`${p.ignored_count} satır aktarılmaz`} />
          </div>

          <div className="card">
            <div className="card__head"><span className="card__title">Hareketler</span><span className="card__meta ml-auto">Önizleme {formatDateTime(p.expires_at)} tarihine kadar geçerli</span></div>
            <div className="card__body card__body--flush">
              <div className="table-wrap" style={{ overflow: "visible" }}>
                <table className="data">
                  <caption className="visually-hidden">Ekstre satırları ve eşleşen hesaplar</caption>
                  <thead>
                    <tr><th scope="col"><span className="visually-hidden">Seç</span></th><th scope="col">Tarih</th><th scope="col">Açıklama</th><th scope="col" className="right">Tutar</th><th scope="col">Durum</th><th scope="col" style={{ minWidth: "15rem" }}>Hesap</th></tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r) => {
                      const importable = r.direction === "in" && r.status !== "duplicate";
                      const st = STATUS[r.status];
                      return (
                        <tr key={r.row_number} style={!importable ? { opacity: 0.6 } : undefined}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`${r.row_number}. satırı aktar`}
                              disabled={!importable || !picks[r.row_number]}
                              checked={selected.has(r.row_number) && !!picks[r.row_number]}
                              onChange={() => toggle(r.row_number)}
                            />
                          </td>
                          <td className="small nowrap">{formatDate(r.date)}</td>
                          <td>
                            <div className="cell-main small">{r.description}</div>
                            {r.bank_reference && <div className="cell-sub mono">{r.bank_reference}</div>}
                          </td>
                          <td className="right num">{r.direction === "out" ? "−" : ""}{formatMoney(r.amount)}</td>
                          <td>
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {r.suggestion && <div className="cell-sub">{r.suggestion.reason}</div>}
                          </td>
                          <td>
                            {importable ? (
                              <AccountPicker
                                label={`${r.row_number}. satırın hesabı`}
                                hideLabel
                                value={picks[r.row_number] ?? null}
                                onChange={(a) => { setPicks((x) => ({ ...x, [r.row_number]: a })); setSelected((s) => { const n = new Set(s); if (a) n.add(r.row_number); else n.delete(r.row_number); return n; }); }}
                              />
                            ) : <span className="subtle">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card__foot row row--between">
              <span className="small">Seçili: <strong>{chosen.length}</strong> hareket · <span className="num strong">{formatMoney(chosenTotal.toFixed(2))}</span></span>
              <ConfirmButton
                className="btn btn--primary"
                disabled={chosen.length === 0}
                title="Banka hareketlerini tahsilat olarak işle"
                confirmLabel="İşle"
                body={`${chosen.length} hareket, toplam ${formatMoney(chosenTotal.toFixed(2))}, seçilen hesaplara tahsilat olarak yazılacak ve en eski borçtan kapatılacak. Aynı banka hareketi ikinci kez aktarılamaz.`}
                onConfirm={() => confirm.mutateAsync(chosen.map((r) => ({ row_number: r.row_number, ledger_account_id: picks[r.row_number]!.id })))}
              >
                {chosen.length > 0 ? `${chosen.length} hareketi işle` : "Hareketleri işle"}
              </ConfirmButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
