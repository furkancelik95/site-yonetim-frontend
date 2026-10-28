import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Download, FileSpreadsheet, FileText, History, PieChart, Wallet } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Donut } from "../../components/charts";
import { Alert, ConfirmButton, Empty, ErrorState, FormError, Kpi, Loading, Money, PageHead, SubmitButton } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney, formatMoneyShort } from "../../lib/format";
import { downloadCsv } from "../../lib/csv";
import { useUrlState } from "../../lib/hooks";
import { voucherSource } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 32'deki şekiller. */
interface Mapping { key: string; label: string; debit_account: string; credit_account: string }
interface Voucher { key: string; source: string; source_id: string; date: string; description: string; debit_account: string; credit_account: string; amount: string }
interface Preview { period: string; vouchers: Voucher[]; already_exported: number; total: string; missing_mappings: string[] }
interface Batch { id: string; period: string; voucher_count: number; total: string; created_by: string; created_at: string; file_name: string; vouchers: Voucher[] }

const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const fileRows = (b: Batch) => [["Fiş tarihi", "Kaynak", "Kaynak no", "Açıklama", "Borç hesabı", "Alacak hesabı", "Tutar"], ...b.vouchers.map((v) => [v.date, voucherSource(v.source), v.source_id, v.description, v.debit_account, v.credit_account, v.amount.replace(".", ",")])];

/**
 * Muhasebe aktarımı (FIN-14, Mod P): dönemin tahakkuk, tahsilat, gider ve dönem dışı ücret fişleri, hesap kodu
 * eşlemesiyle dosyaya yazılır; yazılan fiş kilitlenir ve bir daha aktarılmaz. Dosya biçimi genel CSV — muhasebe
 * programının içe alma biçimi mali müşavirle netleşecek (K7).
 */
export function AccountingExportPage() {
  const { site, can } = useSite();
  const manage = can(P.chargePost);
  const [s, set] = useUrlState({ donem: lastMonth() });
  const pv = useSiteGet<Preview>("/accounting/exports/preview", { period: s.donem });
  const hist = useSiteGet<Batch[]>("/accounting/exports");
  const run = useSiteMutation<{ period: string }, Batch>("POST", "/accounting/exports", { onSuccess: (b) => b && downloadCsv(b.file_name, fileRows(b)) });
  const bySource = (() => {
    const m = new Map<string, number>();
    for (const v of pv.data?.vouchers ?? []) m.set(v.source, (m.get(v.source) ?? 0) + Number(v.amount));
    return [...m.entries()].filter(([, v]) => v > 0).map(([k, v]) => ({ label: voucherSource(k), value: v }));
  })();
  return (
    <div className="stack">
      <PageHead title="Muhasebe aktarımı" subtitle="Dönemin fişlerini muhasebe programına aktarılacak dosyaya yazın. Aktarılan fiş kilitlenir; düzeltme ters fişle yapılır." />
      {pv.data ? (
        <div className="grid grid--kpi rise">
          <Kpi label="Bekleyen fiş" icon={<FileText aria-hidden="true" />} value={pv.data.vouchers.length} note={`${pv.data.period} · aktarılmayı bekliyor`} />
          <Kpi label="Tutar" tone="accent" icon={<Wallet aria-hidden="true" />} value={formatMoneyShort(pv.data.total)} note={formatMoney(pv.data.total)} />
          <Kpi label="Daha önce aktarılan" tone="ok" icon={<CheckCircle2 aria-hidden="true" />} value={pv.data.already_exported} note="bu dönemde kilitli fiş" />
          <Kpi label="Aktarım dosyası" icon={<History aria-hidden="true" />} value={hist.data ? hist.data.length : "—"} note={hist.data && hist.data.length > 0 ? `son: ${formatDate(hist.data.map((b) => b.created_at).sort().at(-1))}` : "henüz yok"} />
        </div>
      ) : pv.isPending ? (
        <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
      ) : null}
      <Alert tone="info" title="Dosya biçimi geçici">Fişler genel CSV olarak üretiliyor. Muhasebe programının (Kivi vb.) içe alma biçimi ve hesap planı mali müşavirle netleşecek (K7); hesap kodları aşağıda öneri olarak dolu.</Alert>
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><FileSpreadsheet aria-hidden="true" /></span>
          <div>
            <div className="card__title">Aktarılmamış fişler</div>
            {pv.data && <div className="card__meta">{pv.data.vouchers.length} fiş</div>}
          </div>
          <div className="card__tools">
            <div className="field"><label className="field__label" htmlFor="ae-p">Dönem</label><input id="ae-p" className="field__input" type="month" value={s.donem} onChange={(e) => set({ donem: e.target.value })} /></div>
          </div>
        </div>
        {pv.isPending ? <div className="card__body"><Loading /></div> : pv.isError ? <div className="card__body"><ErrorState error={pv.error} /></div> : (<>
          {(pv.data.missing_mappings.length > 0 || run.error) && (
            <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
              {pv.data.missing_mappings.length > 0 && <Alert tone="danger" title="Hesap kodu eksik">{pv.data.missing_mappings.join(", ")} için borç/alacak hesap kodu girilmeden aktarım başlatılamaz.</Alert>}
              <FormError error={run.error} />
            </div>
          )}
          {pv.data.vouchers.length === 0 && <Empty title="Bu dönemde aktarılacak fiş yok" icon={<CheckCircle2 aria-hidden="true" />} />}
          {pv.data.vouchers.length > 0 && (
            <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Aktarılacak fişler</caption>
              <thead><tr><th scope="col">Tarih</th><th scope="col">Kaynak</th><th scope="col">Açıklama</th><th scope="col">Borç</th><th scope="col">Alacak</th><th scope="col" className="right">Tutar</th></tr></thead>
              <tbody>{pv.data.vouchers.slice(0, 100).map((v) => <tr key={v.key}><td className="small nowrap">{formatDate(v.date)}</td><td className="small">{voucherSource(v.source)}</td><td className="small">{v.description}</td><td className="mono small">{v.debit_account || "—"}</td><td className="mono small">{v.credit_account || "—"}</td><td className="right"><Money value={v.amount} /></td></tr>)}</tbody>
            </table></div>{pv.data.vouchers.length > 100 && <p className="small muted" style={{ padding: "var(--s-3) var(--s-4)", margin: 0 }}>İlk 100 fiş gösteriliyor; dosyada hepsi var.</p>}</div>
          )}
          {manage && (
            <div className="card__foot row row--between">
              <span className="small muted">Borç toplamı = alacak toplamı; her fiş tek borç ve tek alacak satırıdır.</span>
              <ConfirmButton className="btn btn--primary" disabled={pv.data.vouchers.length === 0 || pv.data.missing_mappings.length > 0} title="Fişleri dosyaya yaz" confirmLabel="Dosyayı üret" body={`${pv.data.vouchers.length} fiş dosyaya yazılıp kilitlenecek; aynı fişler bir daha aktarılmaz. Dosya hemen iner ve geçmişte saklanır.`} onConfirm={() => run.mutateAsync({ period: s.donem })}><Download aria-hidden="true" /> Dosyayı üret</ConfirmButton>
            </div>
          )}
        </>)}
      </div>
      {manage && <MappingCard />}
      <div className={bySource.length > 0 ? "grid grid--main" : "stack"}>
      <div className="card">
        <div className="card__head"><span className="card__icon"><History aria-hidden="true" /></span><span className="card__title">Aktarım geçmişi</span></div>
        <div className="card__body card__body--flush">
          {hist.isPending ? <Loading /> : !hist.data || hist.data.length === 0 ? <Empty title="Henüz aktarım yok" /> : (
            <div className="table-wrap"><table className="data">
              <caption className="visually-hidden">Muhasebe aktarım geçmişi</caption>
              <thead><tr><th scope="col">Tarih</th><th scope="col">Dönem</th><th scope="col" className="right">Fiş</th><th scope="col" className="right">Tutar</th><th scope="col">Yapan</th><th scope="col"><span className="visually-hidden">Dosya</span></th></tr></thead>
              <tbody>{hist.data.map((b) => <tr key={b.id}><td className="small nowrap">{formatDateTime(b.created_at)}</td><td className="small">{b.period}</td><td className="right num">{b.voucher_count}</td><td className="right"><Money value={b.total} /></td><td className="small">{b.created_by}</td><td className="right"><button className="btn btn--ghost btn--sm" type="button" onClick={() => downloadCsv(b.file_name, fileRows(b))}><Download aria-hidden="true" /> İndir</button></td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
      {bySource.length > 0 && (
        <div className="card">
          <div className="card__head">
            <span className="card__icon card__icon--accent"><PieChart aria-hidden="true" /></span>
            <span className="card__title">Bekleyen fişler kaynağa göre</span>
          </div>
          <div className="card__body fin-pie">
            <Donut segments={bySource} label="Aktarılmamış fişlerin kaynağa göre tutarı" center={formatMoneyShort(pv.data?.total)} centerSub="toplam" format={(v) => formatMoneyShort(v.toFixed(2))} />
          </div>
        </div>
      )}
      </div>
      <p className="small muted">Bağlantı: <Link to={`/s/${site.slug}/donem-kapanisi`}>Dönem kapanışı</Link> kontrol listesi aktarılmamış fiş varken dönemi kilitletmez.</p>
    </div>
  );
}

function MappingCard() {
  const q = useSiteGet<{ items: Mapping[] }>("/accounting/mappings");
  const m = useSiteMutation<{ items: Mapping[] }, { items: Mapping[] }>("PUT", "/accounting/mappings");
  const [rows, setRows] = useState<Mapping[]>([]);
  useEffect(() => { if (q.data) setRows(q.data.items); }, [q.data]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(q.data?.items ?? []);
  const upd = (key: string, k: "debit_account" | "credit_account", v: string) => setRows((r) => r.map((x) => (x.key === key ? { ...x, [k]: v.replace(/[^0-9.]/g, "").slice(0, 20) } : x)));
  return (
    <details className="card">
      <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Hesap kodu eşlemesi</span><span className="card__meta ml-auto">işlem tipi → borç / alacak hesabı</span></summary>
      <form noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ items: rows }); }}>
        <div className="card__body card__body--flush">
          <FormError error={m.error} />
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Hesap kodu eşlemesi</caption>
            <thead><tr><th scope="col">İşlem tipi</th><th scope="col">Borç hesabı</th><th scope="col">Alacak hesabı</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.key}>
                <td className="cell-main">{r.label}</td>
                <td><input className="field__input mono" style={{ maxWidth: "9rem" }} inputMode="decimal" aria-label={`${r.label} borç hesabı`} value={r.debit_account} onChange={(e) => upd(r.key, "debit_account", e.target.value)} /></td>
                <td><input className="field__input mono" style={{ maxWidth: "9rem" }} inputMode="decimal" aria-label={`${r.label} alacak hesabı`} value={r.credit_account} onChange={(e) => upd(r.key, "credit_account", e.target.value)} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="card__foot row row--between"><span className="small muted">Değişiklik yalnız bundan sonra üretilen dosyaları etkiler.</span><SubmitButton busy={m.isPending} disabled={!dirty}>Eşlemeyi kaydet</SubmitButton></div>
      </form>
    </details>
  );
}
