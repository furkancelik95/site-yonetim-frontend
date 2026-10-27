import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Building2, CalendarDays, ClipboardList, ReceiptText } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Avatar, Badge, ConfirmButton, Empty, ErrorState, Kpi, Loading, Money, PageHead, Pager } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney, formatMoneyShort } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { accountKind, diffFlag, diffFlagTone, runStatus, runTone, warningKind } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { ChargeSchedule } from "./ChargeSchedule";
import { CollectionChart, type Collections } from "./CollectionStats";

type Preview = Schemas["site_yonetim__api__v1__charges__PreviewOut"];
type Run = Schemas["ChargeRunOut"];

export function ChargesPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ charge_date: "", due_date: "", page: "1" });
  const preview = useSiteGet<Preview>("/charge-runs/preview", { charge_date: s.charge_date, due_date: s.due_date, page: s.page, page_size: 25 });
  const coll = useSiteGet<Collections>("/reports/collections", {}, { enabled: can(P.financeRead) });
  const chart = coll.data && coll.data.periods.length > 0 ? <CollectionChart data={coll.data} series="charged" title="Aylık tahakkuk" /> : null;

  return (
    <div className="stack">
      <PageHead title="Tahakkuk" subtitle="Sıradaki dönemin önizlemesi. Önizlemede hiçbir şey kaydedilmez; kontrol ettikten sonra kaydedin." band />

      {preview.isPending ? (
        <>
          <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" />)}</div>
          <Loading label="Önizleme hazırlanıyor…" />
        </>
      ) : preview.isError ? (
        <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
      ) : (
        <PreviewView p={preview.data} canPost={can(P.chargePost)} s={s} set={set} side={chart} />
      )}

      {can(P.chargePost) && <ChargeSchedule />}

      <RunsCard canReverse={can(P.chargePost)} />
    </div>
  );
}

function PreviewView({ p, canPost, s, set, side }: { p: Preview; canPost: boolean; s: Record<"charge_date" | "due_date" | "page", string>; set: (x: Partial<Record<"charge_date" | "due_date" | "page", string>>) => void; side?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const post = useSiteMutation<{ charge_date: string; due_date: string }, Run>("POST", "/charge-runs", { money: true });
  const blocked = p.already_charged || p.charge_count === 0;

  const previewCard = (
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><ClipboardList aria-hidden="true" /></span>
          <span className="card__title">{p.period} dönemi</span>
          <span className="card__meta ml-auto">{p.budget_plan ? p.budget_plan.name : "İşletme projesi yok"}</span>
        </div>
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <div className="filters">
            <div className="field">
              <label className="field__label" htmlFor="c-date">Tahakkuk tarihi</label>
              <input id="c-date" className="field__input" type="date" value={s.charge_date || p.charge_date} onChange={(e) => set({ charge_date: e.target.value })} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="c-due">Son ödeme tarihi</label>
              <input id="c-due" className="field__input" type="date" value={s.due_date || p.due_date} onChange={(e) => set({ due_date: e.target.value })} />
            </div>
          </div>

          {p.already_charged && <Alert tone="info" title="Bu dönem zaten tahakkuk edildi">Aynı döneme ikinci kez tahakkuk kesilemez. Düzeltmek için önce aşağıdan koşuyu ters kaydedin.</Alert>}
          {!p.budget_plan && <Alert tone="warn" title="Kesinleşmiş işletme projesi yok">Tahakkuk, kesinleşmiş işletme projesindeki kalemlerden hesaplanır.</Alert>}
          {p.warnings.length > 0 && (
            <Alert tone="warn" title={`${p.warnings.length} uyarı`}>
              <ul className="mb-0" style={{ paddingLeft: "1.1rem" }}>
                {p.warnings.map((w, i) => (
                  <li key={i}>{warningKind(w.kind)}{w.message ? ` — ${w.message}` : ""}</li>
                ))}
              </ul>
            </Alert>
          )}
          {p.not_due_items.length > 0 && <p className="small muted mb-0">Bu dönem kesilmeyen kalemler (takvimi gelmedi): {p.not_due_items.join(", ")}</p>}

          {canPost && (
            <div className="row">
              <ConfirmButton
                className="btn btn--primary"
                disabled={blocked}
                title={`${p.period} tahakkukunu kaydet`}
                confirmLabel="Kaydet"
                body={
                  <>
                    <p>{p.charge_count} hesaba toplam <strong>{formatMoney(p.total_amount)}</strong> borç yazılacak. Son ödeme {formatDate(p.due_date)}.</p>
                    <p className="mb-0">Kayıt silinmez; hatalıysa ters kayıtla iptal edilir.</p>
                  </>
                }
                onConfirm={() => post.mutateAsync({ charge_date: s.charge_date || p.charge_date, due_date: s.due_date || p.due_date })}
              >
                Tahakkuku kaydet
              </ConfirmButton>
            </div>
          )}
        </div>
      </div>
  );

  return (
    <>
      <div className="grid grid--kpi rise">
        <Kpi label="Toplam tutar" tone="accent" icon={<ReceiptText aria-hidden="true" />} value={formatMoneyShort(p.total_amount)} note={formatMoney(p.total_amount)} />
        <Kpi label="Bağımsız bölüm" icon={<Building2 aria-hidden="true" />} value={p.unit_count} note={`${p.period} dönemi`} />
        <Kpi label="Borç kaydı" icon={<ClipboardList aria-hidden="true" />} value={p.charge_count} note="oturan + malik hesapları" />
        <Kpi label="Son ödeme" icon={<CalendarDays aria-hidden="true" />} value={formatDate(p.due_date)} small note={`tahakkuk ${formatDate(p.charge_date)}`} />
      </div>

      {side ? <div className="grid grid--main">{previewCard}{side}</div> : previewCard}

      {!p.already_charged && p.charge_count > 0 && <DiffCard chargeDate={s.charge_date || p.charge_date} dueDate={s.due_date || p.due_date} />}

      {p.item_totals.length > 0 && (
        <div className="card">
          <div className="card__head"><span className="card__title">Kalem toplamları</span><span className="card__meta ml-auto">dağıtılan tutar kalem tutarına eşit olmalı</span></div>
          <div className="card__body card__body--flush">
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Kalem bazında tutar ve dağıtılan toplam</caption>
                <thead><tr><th scope="col">Kalem</th><th scope="col" className="right">Tutar</th><th scope="col" className="right">Dağıtılan</th><th scope="col" /></tr></thead>
                <tbody>
                  {p.item_totals.map((t) => (
                    <tr key={t.budget_item_id}>
                      <td className="cell-main">{t.name}</td>
                      <td className="right"><Money value={t.amount} /></td>
                      <td className="right"><Money value={t.distributed} /></td>
                      <td className="right">{t.amount === t.distributed ? <Badge tone="ok">Tutuyor</Badge> : <Badge tone="danger">Fark var</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {p.charges.total > 0 && (
        <div className="card">
          <div className="card__head"><span className="card__title">Hesap bazında borçlar</span><span className="card__meta ml-auto">satıra tıklayınca kalem dökümü açılır</span></div>
          <div className="card__body card__body--flush">
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Önizlemedeki borç kayıtları</caption>
                <thead><tr><th scope="col">Bölüm</th><th scope="col">Kişi</th><th scope="col">Hesap</th><th scope="col" className="right">Tutar</th></tr></thead>
                <tbody>
                  {p.charges.items.map((c) => {
                    const key = c.ledger_account_id;
                    const isOpen = open === key;
                    return (
                      <Fragment key={key}>
                        <tr>
                          <td>
                            <button type="button" className="btn btn--ghost btn--sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                              {c.unit_name}
                            </button>
                          </td>
                          <td><div className="cell-person"><Avatar name={c.person_name} size="sm" soft /><span>{c.person_name ?? <span className="subtle">—</span>}</span></div></td>
                          <td className="small">{accountKind(c.account_kind)} · <span className="mono">{c.reference_code}</span></td>
                          <td className="right"><Money value={c.amount} /></td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={4} style={{ background: "var(--bg-inset)" }}>
                              {c.lines.map((l) => (
                                <div key={l.budget_item_id} className="row row--between" style={{ padding: "var(--s-1) 0" }}>
                                  <div>
                                    <div className="small strong">{l.description}</div>
                                    <div className="calc">{l.explanation}</div>
                                  </div>
                                  <Money value={l.amount} />
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card__foot">
            <Pager page={p.charges.page} pageSize={p.charges.page_size} total={p.charges.total} onPage={(n) => set({ page: String(n) })} />
          </div>
        </div>
      )}
    </>
  );
}

/** Servis isteği 34'teki şekil. */
interface Diff {
  period: string; base_period: string | null; threshold: number; compared: number; counts: Record<"increase" | "decrease" | "new" | "missing", number>;
  rows: { account_id: string; unit_name: string; person_name: string | null; account_kind: string; previous: string | null; current: string | null; change_percent: number | null; flag: "increase" | "decrease" | "new" | "missing" }[];
}

/** Fark raporu (FIN-05): önceki kesinleşmiş döneme göre eşik üstü değişen, yeni ve bu dönem olmayan hesaplar. */
function DiffCard({ chargeDate, dueDate }: { chargeDate: string; dueDate: string }) {
  const { site } = useSite();
  const q = useSiteGet<Diff>("/charge-runs/preview/diff", { charge_date: chargeDate, due_date: dueDate });
  if (q.isPending) return <div className="card"><div className="card__body"><Loading label="Önceki dönemle karşılaştırılıyor…" /></div></div>;
  if (q.isError || !q.data.base_period) return null;
  const d = q.data;
  const total = d.rows.length;
  return (
    <details className="card" open={total > 0 && total <= 15}>
      <summary className="card__head" style={{ cursor: "pointer" }}>
        <span className="card__title">Fark raporu</span>
        <span className="card__meta ml-auto">{d.base_period} ile · eşik %{d.threshold} · {total ? `${total} hesap işaretli` : "eşik üstü değişim yok"}</span>
      </summary>
      {total > 0 && (
        <div className="card__body card__body--flush">
          <div className="card__body row" style={{ gap: "var(--s-2)" }}>
            {(["increase", "decrease", "new", "missing"] as const).filter((k) => d.counts[k]).map((k) => <Badge key={k} tone={diffFlagTone(k)}>{diffFlag(k)}: {d.counts[k]}</Badge>)}
          </div>
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Önceki döneme göre değişen hesaplar</caption>
            <thead><tr><th scope="col">Bölüm / hesap</th><th scope="col" className="right">{d.base_period}</th><th scope="col" className="right">{d.period}</th><th scope="col" className="right">Değişim</th><th scope="col">İşaret</th></tr></thead>
            <tbody>{d.rows.map((r) => (
              <tr key={r.account_id}>
                <td><Link className="cell-main" to={`/s/${site.slug}/cari/${r.account_id}`}>{r.unit_name}</Link><div className="cell-sub">{accountKind(r.account_kind)} · {r.person_name ?? "—"}</div></td>
                <td className="right">{r.previous ? <Money value={r.previous} /> : <span className="subtle">—</span>}</td>
                <td className="right">{r.current ? <Money value={r.current} /> : <span className="subtle">—</span>}</td>
                <td className="right num">{r.change_percent != null ? `${r.change_percent > 0 ? "+" : ""}%${r.change_percent.toLocaleString("tr-TR")}` : "—"}</td>
                <td><Badge tone={diffFlagTone(r.flag)}>{diffFlag(r.flag)}</Badge></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      <div className="card__foot small muted">Eşik Finans ayarlarından değişir. Sorumlusu belirsiz bölüm kontrolü finans sorumlusu kararına (K22) bağlı.</div>
    </details>
  );
}

function RunsCard({ canReverse }: { canReverse: boolean }) {
  const { site } = useSite();
  const [page, setPage] = useState(1);
  const runs = useSiteGet<Page<Run>>("/charge-runs", { page, page_size: 12 });

  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Geçmiş tahakkuklar</span></div>
      <div className="card__body card__body--flush">
        {runs.isPending ? (
          <Loading />
        ) : runs.isError ? (
          <div className="card__body"><ErrorState error={runs.error} /></div>
        ) : runs.data.items.length === 0 ? (
          <Empty title="Henüz tahakkuk kesilmedi" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Tahakkuk koşuları</caption>
              <thead>
                <tr><th scope="col">Dönem</th><th scope="col">Durum</th><th scope="col">Kaydeden</th><th scope="col" className="right">Kayıt</th><th scope="col" className="right">Tutar</th><th scope="col" /></tr>
              </thead>
              <tbody>
                {runs.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-main">{r.period}</div>
                      <div className="cell-sub">{formatDate(r.charge_date)} · son ödeme {formatDate(r.due_date)}</div>
                    </td>
                    <td>
                      <Badge tone={runTone(r.status)}>{runStatus(r.status)}</Badge>
                      {r.reversal_of_run_id && <div className="cell-sub">Ters kayıt{r.reason ? `: ${r.reason}` : ""}</div>}
                    </td>
                    <td className="small">{r.posted_by ?? "—"}<div className="cell-sub">{formatDateTime(r.posted_at)}</div></td>
                    <td className="right num">{r.charge_count}</td>
                    <td className="right"><Money value={r.total_amount} /></td>
                    <td className="right">{canReverse && r.status === "posted" && !r.reversal_of_run_id && <ReverseButton run={r} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {runs.data && (
        <div className="card__foot">
          <Pager page={runs.data.page} pageSize={runs.data.page_size} total={runs.data.total} onPage={setPage} />
          <p className="small muted mb-0">Tek bir hesabın dökümü için <Link to={`/s/${site.slug}/borclular`}>Borçlular</Link> ya da daire sayfasındaki ekstreye bakın.</p>
        </div>
      )}
    </div>
  );
}

function ReverseButton({ run }: { run: Run }) {
  const [reason, setReason] = useState("");
  const m = useSiteMutation<{ reason: string }, Run>("POST", `/charge-runs/${run.id}/reverse`, { money: true });
  return (
    <ConfirmButton
      className="btn btn--sm"
      danger
      title={`${run.period} tahakkukunu ters kaydet`}
      confirmLabel="Ters kaydet"
      body={
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          <p className="mb-0">{run.charge_count} borç kaydının her biri için eksi tutarlı karşı kayıt atılır. Orijinal kayıtlar silinmez.</p>
          <div className="field">
            <label className="field__label" htmlFor={`rev-${run.id}`}>Gerekçe *</label>
            <input id={`rev-${run.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Yanlış tarihle kesildi" />
          </div>
        </div>
      }
      onConfirm={() => {
        if (!reason.trim()) throw new Error("Gerekçe zorunlu.");
        return m.mutateAsync({ reason: reason.trim() });
      }}
    >
      Ters kaydet
    </ConfirmButton>
  );
}
