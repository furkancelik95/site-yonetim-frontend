import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import Decimal from "decimal.js";
import { Building2, CalendarDays, ClipboardList, ReceiptText } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Avatar, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney, formatMoneyShort, parseMoneyInput } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { accountKind, adjustmentStatus, adjustmentTone, chargeSource, diffFlag, diffFlagTone, runStatus, runTone, warningKind } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { ChargeSchedule } from "./ChargeSchedule";
import { CollectionChart, type Collections } from "./CollectionStats";

type Preview = Schemas["site_yonetim__api__v1__charges__PreviewOut"];
type Run = Schemas["ChargeRunOut"];
type PostedCharge = Schemas["PostedChargeOut"];
type Line = Schemas["LineOut"];
type ItemTotal = Schemas["ItemTotalOut"];
type Warning = Schemas["WarningOut"];
type Summary = Schemas["DraftSummaryOut"];
type Adjustment = Schemas["ChargeAdjustmentOut"];
type DateBody = Schemas["PostIn"];

/** Koşu hâlâ deftere yazılmamış (taslak ya da onay sürecinde). */
const PRE_POST: Run["status"][] = ["draft", "approval_pending", "approved"];

export function ChargesPage() {
  const { can } = useSite();
  const [s, set] = useUrlState({ charge_date: "", due_date: "", page: "1" });
  const preview = useSiteGet<Preview>("/charge-runs/preview", { charge_date: s.charge_date, due_date: s.due_date, page: s.page, page_size: 25 });
  const coll = useSiteGet<Collections>("/reports/collections", {}, { enabled: can(P.financeRead) });
  const chart = coll.data && coll.data.periods.length > 0 ? <CollectionChart data={coll.data} series="charged" title="Aylık tahakkuk" /> : null;

  return (
    <div className="stack">
      <PageHead title="Tahakkuk" subtitle="Sıradaki dönemin önizlemesi. Önizlemede hiçbir şey kaydedilmez; kontrol ettikten sonra kaydedin ya da taslak hazırlayıp onaya gönderin." band />

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

      <RunsCard canPost={can(P.chargePost)} openDraftId={preview.data?.open_draft_id ?? null} />
    </div>
  );
}

/** Kıst (K9): bölüm dönemin bir kısmında doluysa "kıst 15/31 gün". */
function Proration({ days, periodDays }: { days?: number | null; periodDays?: number | null }) {
  if (days == null || periodDays == null || days >= periodDays) return null;
  return <Badge tone="info">kıst {days}/{periodDays} gün</Badge>;
}

function WarningsAlert({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert tone="warn" title={`${warnings.length} uyarı`}>
      <ul className="mb-0" style={{ paddingLeft: "1.1rem" }}>
        {warnings.map((w, i) => (
          <li key={i}>{warningKind(w.kind)}{w.message ? ` — ${w.message}` : ""}</li>
        ))}
      </ul>
    </Alert>
  );
}

function PreviewView({ p, canPost, s, set, side }: { p: Preview; canPost: boolean; s: Record<"charge_date" | "due_date" | "page", string>; set: (x: Partial<Record<"charge_date" | "due_date" | "page", string>>) => void; side?: ReactNode }) {
  const { site } = useSite();
  const [open, setOpen] = useState<string | null>(null);
  const post = useSiteMutation<DateBody, Run>("POST", "/charge-runs", { money: true });
  const draft = useSiteMutation<DateBody, Run>("POST", "/charge-runs/drafts");
  const blocked = p.already_charged || p.charge_count === 0 || !!p.open_draft_id;
  const dates: DateBody = { charge_date: s.charge_date || p.charge_date, due_date: s.due_date || p.due_date };
  const fromRules = p.source === "billing_rule";

  const previewCard = (
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><ClipboardList aria-hidden="true" /></span>
          <span className="card__title">{p.period} dönemi</span>
          <span className="card__meta ml-auto">
            {chargeSource(p.source)}{p.budget_plan ? ` · ${p.budget_plan.name}` : ""} · kıst {p.proration === "day" ? "gün bazlı" : "ay bazlı"}
          </span>
        </div>
        <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
          <div className="filters">
            <div className="field">
              <label className="field__label" htmlFor="c-date">Tahakkuk tarihi</label>
              <input id="c-date" className="field__input" type="date" value={dates.charge_date ?? ""} onChange={(e) => set({ charge_date: e.target.value })} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="c-due">Son ödeme tarihi</label>
              <input id="c-due" className="field__input" type="date" value={dates.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value })} />
              <span className="field__hint">Varsayılan: Finans ayarlarındaki vade günü.</span>
            </div>
          </div>

          {p.already_charged && <Alert tone="info" title="Bu dönem zaten tahakkuk edildi">Aynı döneme ikinci kez tahakkuk kesilemez. Tek satırı aşağıdaki koşu ayrıntısından düzeltin; tümü hatalıysa koşuyu ters kaydedin.</Alert>}
          {!p.already_charged && p.open_draft_id && (
            <Alert tone="info" title="Bu dönem için açık taslak var">Aşağıdaki koşu listesinde taslağı inceleyin: yeniden hesaplayın, onaya gönderin ya da vazgeçin.</Alert>
          )}
          {!fromRules && !p.budget_plan && <Alert tone="warn" title="Kesinleşmiş işletme projesi yok">Tahakkuk kaynağı işletme projesi; tahakkuk kesinleşmiş projedeki kalemlerden hesaplanır.</Alert>}
          {fromRules && p.charge_count === 0 && !p.already_charged && (
            <Alert tone="warn" title="Bu dönem yürürlükte aidat kuralı yok">
              Tahakkuk kaynağı aidat kuralları. <Link to={`/s/${site.slug}/aidat-kurallari`}>Aidat kuralları</Link> ekranından kural tanımlayıp yürürlüğe alın.
            </Alert>
          )}
          {p.approval_required && !p.already_charged && (
            <Alert tone="info" title="Tahakkuk onay kuralı var">Kaydettiğinizde koşu onaya gider; onaylanınca tahakkuk tarihinde kesinleşir. Deftere o zamana kadar bir şey yazılmaz.</Alert>
          )}
          <WarningsAlert warnings={p.warnings} />
          {p.not_due_items.length > 0 && <p className="small muted mb-0">Bu dönem kesilmeyen kalemler (takvimi gelmedi): {p.not_due_items.join(", ")}</p>}

          {canPost && (
            <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
              <ConfirmButton
                className="btn btn--primary"
                disabled={blocked}
                title={p.approval_required ? `${p.period} tahakkukunu onaya gönder` : `${p.period} tahakkukunu kaydet`}
                confirmLabel={p.approval_required ? "Onaya gönder" : "Kaydet"}
                body={
                  <>
                    <p>{p.charge_count} hesaba toplam <strong>{formatMoney(p.total_amount)}</strong> borç yazılacak. Son ödeme {formatDate(dates.due_date)}.</p>
                    <p className="mb-0">
                      {p.approval_required
                        ? "Tahakkuk onay kuralı var: koşu onaya gider, onaylanınca tahakkuk tarihinde kesinleşir."
                        : "Kayıt silinmez; hatalı satır düzeltmeyle, tamamı ters kayıtla düzeltilir."}
                    </p>
                  </>
                }
                onConfirm={() => post.mutateAsync(dates)}
              >
                {p.approval_required ? "Onaya gönder" : "Tahakkuku kaydet"}
              </ConfirmButton>
              <button type="button" className="btn" disabled={blocked || draft.isPending} aria-busy={draft.isPending || undefined} onClick={() => draft.mutate(dates)}>
                {draft.isPending && <span className="spinner" aria-hidden="true" />}
                Taslak hazırla
              </button>
              <span className="small muted">Taslak deftere yazılmaz; inceleyip sonra onaya gönderirsiniz.</span>
            </div>
          )}
          <FormError error={draft.error} />
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

      {!p.already_charged && p.charge_count > 0 && <DiffCard path="/charge-runs/preview/diff" query={dates} />}

      <ItemTotalsCard totals={p.item_totals} />

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
                            <Proration days={c.days} periodDays={c.period_days} />
                          </td>
                          <td><div className="cell-person"><Avatar name={c.person_name} size="sm" soft /><span>{c.person_name ?? <span className="subtle">—</span>}</span></div></td>
                          <td className="small">{accountKind(c.account_kind)} · <span className="mono">{c.reference_code}</span></td>
                          <td className="right"><Money value={c.amount} /></td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={4} style={{ background: "var(--bg-inset)" }}>
                              <LineList lines={c.lines} />
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

/** Kalem dökümü; kesinleşmiş koşuda `onAdjust` verilirse satır yanında "Düzelt" çıkar (D-10). */
function LineList({ lines, onAdjust }: { lines: Line[]; onAdjust?: (l: Line) => void }) {
  return (
    <>
      {lines.map((l, i) => (
        <div key={l.id ?? `${l.budget_item_id ?? l.billing_rule_version_id ?? "x"}-${i}`} className="row row--between" style={{ padding: "var(--s-1) 0", gap: "var(--s-3)" }}>
          <div style={{ minWidth: 0 }}>
            <div className="small strong">{l.description}</div>
            {l.explanation && <div className="calc">{l.explanation}</div>}
          </div>
          <div className="row" style={{ gap: "var(--s-2)", flexShrink: 0 }}>
            {l.current_amount != null && l.current_amount !== l.amount ? (
              <span className="right">
                <Money value={l.current_amount} />
                <div className="cell-sub">düzeltildi · ilk tutar {formatMoney(l.amount)}</div>
              </span>
            ) : (
              <Money value={l.amount} />
            )}
            {onAdjust && l.id && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onAdjust(l)}>Düzelt</button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function ItemTotalsCard({ totals }: { totals: ItemTotal[] }) {
  if (totals.length === 0) return null;
  const anyExempt = totals.some((t) => !new Decimal(t.exempted ?? "0").isZero());
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Kalem toplamları</span><span className="card__meta ml-auto">dağıtılan + muaf, kalem tutarına eşit olmalı</span></div>
      <div className="card__body card__body--flush">
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">Kalem bazında tutar ve dağıtılan toplam</caption>
            <thead><tr><th scope="col">Kalem</th><th scope="col" className="right">Tutar</th><th scope="col" className="right">Dağıtılan</th>{anyExempt && <th scope="col" className="right">Muaf</th>}<th scope="col" /></tr></thead>
            <tbody>
              {totals.map((t) => {
                const ok = new Decimal(t.amount).minus(t.exempted ?? "0").equals(t.distributed);
                return (
                  <tr key={t.budget_item_id}>
                    <td className="cell-main">{t.name}</td>
                    <td className="right"><Money value={t.amount} /></td>
                    <td className="right"><Money value={t.distributed} /></td>
                    {anyExempt && <td className="right">{new Decimal(t.exempted ?? "0").isZero() ? <span className="subtle">—</span> : <Money value={t.exempted} />}</td>}
                    <td className="right">{ok ? <Badge tone="ok">Tutuyor</Badge> : <Badge tone="danger">Fark var</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type Diff = Schemas["ChargeDiffOut"];
/** Değişim yüzdesi metin gelir ("12.4"); işaretli ve tr-TR biçimli gösterilir. */
const pct = (v: string | null) => (v == null ? "—" : `${Number(v) > 0 ? "+" : ""}%${Number(v).toLocaleString("tr-TR")}`);

/**
 * Fark raporu (FIN-05): önceki kesinleşmiş döneme göre eşik üstü değişen, yeni ve bu dönem olmayan hesaplar.
 * Önizleme için `/charge-runs/preview/diff`, taslak için `/charge-runs/{id}/diff` (aynı şema).
 */
function DiffCard({ path, query }: { path: string; query?: DateBody }) {
  const { site } = useSite();
  const q = useSiteGet<Diff>(path, query);
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
                <td className="right num">{pct(r.change_percent)}</td>
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

function RunsCard({ canPost, openDraftId }: { canPost: boolean; openDraftId: string | null }) {
  const { site } = useSite();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const runs = useSiteGet<Page<Run>>("/charge-runs", { page, page_size: 12 });
  const shown = expanded ?? openDraftId;

  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Tahakkuk koşuları</span><span className="card__meta ml-auto">taslak, onay süreci ve kesinleşmiş koşular</span></div>
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
                <tr><th scope="col">Dönem</th><th scope="col">Durum</th><th scope="col">Hazırlayan / kaydeden</th><th scope="col" className="right">Kayıt</th><th scope="col" className="right">Tutar</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr>
              </thead>
              <tbody>
                {runs.data.items.map((r) => {
                  const isOpen = shown === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td>
                          <button type="button" className="btn btn--ghost btn--sm" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? "" : r.id)}>{r.period}</button>
                          <div className="cell-sub">{formatDate(r.charge_date)} · son ödeme {formatDate(r.due_date)} · {chargeSource(r.source)}</div>
                        </td>
                        <td>
                          <Badge tone={runTone(r.status)}>{runStatus(r.status)}</Badge>
                          {r.status === "approved" && <div className="cell-sub">{formatDate(r.charge_date)} tarihinde kesinleşecek</div>}
                          {r.status === "approval_pending" && r.approval_request_id && <div className="cell-sub"><Link to={`/s/${site.slug}/onaylar/${r.approval_request_id}`}>Onay talebi</Link></div>}
                          {r.warning_count > 0 && PRE_POST.includes(r.status) && <div className="cell-sub">{r.warning_count} uyarı</div>}
                          {r.reversal_of_run_id && <div className="cell-sub">Ters kayıt{r.reason ? `: ${r.reason}` : ""}</div>}
                        </td>
                        <td className="small">
                          {r.posted_by ?? r.created_by ?? "—"}
                          <div className="cell-sub">{r.posted_at ? formatDateTime(r.posted_at) : r.created_by ? "hazırladı" : ""}</div>
                        </td>
                        <td className="right num">{r.charge_count}</td>
                        <td className="right"><Money value={r.total_amount} /></td>
                        <td className="right nowrap">
                          {canPost && r.status === "draft" && <DraftActions run={r} />}
                          {canPost && r.status === "posted" && !r.reversal_of_run_id && <ReverseButton run={r} />}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} style={{ background: "var(--bg-inset)" }}>
                            <RunDetail run={r} canPost={canPost} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {runs.data && (
        <div className="card__foot">
          <Pager page={runs.data.page} pageSize={runs.data.page_size} total={runs.data.total} onPage={setPage} />
          <p className="small muted mb-0">Dönemi tıklayınca koşunun dökümü açılır. Tek bir hesabın dökümü için <Link to={`/s/${site.slug}/borclular`}>Borçlular</Link> ya da daire sayfasındaki ekstreye bakın.</p>
        </div>
      )}
    </div>
  );
}

/** Taslak satırı: yeniden hesapla, onaya gönder (kural yoksa hemen kesinleşir), vazgeç. */
function DraftActions({ run }: { run: Run }) {
  const refresh = useSiteMutation<Record<string, never>, Run>("POST", `/charge-runs/${run.id}/refresh`);
  const submit = useSiteMutation<Record<string, never>, Run>("POST", `/charge-runs/${run.id}/submit`, { money: true });
  const cancel = useSiteMutation<Record<string, never>, Run>("POST", `/charge-runs/${run.id}/cancel`);
  return (
    <span className="row" style={{ gap: "var(--s-1)", justifyContent: "flex-end", flexWrap: "wrap" }}>
      <button type="button" className="btn btn--sm" disabled={refresh.isPending} aria-busy={refresh.isPending || undefined} onClick={() => refresh.mutate({})}>
        {refresh.isPending && <span className="spinner" aria-hidden="true" />}Yenile
      </button>
      <ConfirmButton
        className="btn btn--sm btn--primary"
        title={`${run.period} taslağını gönder`}
        confirmLabel="Gönder"
        body={
          <>
            <p>{run.charge_count} hesaba toplam <strong>{formatMoney(run.total_amount)}</strong> borç. Son ödeme {formatDate(run.due_date)}.</p>
            <p className="mb-0">Tahakkuk onay kuralı varsa onaya gider ve onaylanınca tahakkuk tarihinde kesinleşir; kural yoksa hemen deftere yazılır.</p>
          </>
        }
        onConfirm={() => submit.mutateAsync({})}
      >
        Gönder
      </ConfirmButton>
      <ConfirmButton className="btn btn--sm btn--ghost" danger title={`${run.period} taslağından vazgeç`} confirmLabel="Vazgeç" body="Taslak iptal edilir; deftere hiçbir şey yazılmamıştı." onConfirm={() => cancel.mutateAsync({})}>
        İptal
      </ConfirmButton>
      {refresh.error ? <FormError error={refresh.error} /> : null}
    </span>
  );
}

/** Koşu ayrıntısı: taslakta uyarılar + kalem toplamları + fark raporu; kesinleşmişte satır düzeltme ve geçmişi. */
function RunDetail({ run, canPost }: { run: Run; canPost: boolean }) {
  const pre = PRE_POST.includes(run.status);
  const posted = run.status === "posted" || run.status === "reversed";
  return (
    <div className="stack" style={{ gap: "var(--s-3)", padding: "var(--s-2) 0" }}>
      {pre && <RunSummary runId={run.id} />}
      {pre && <DiffCard path={`/charge-runs/${run.id}/diff`} />}
      <RunCharges run={run} canAdjust={canPost && run.status === "posted"} />
      {posted && <AdjustmentsList runId={run.id} />}
    </div>
  );
}

function RunSummary({ runId }: { runId: string }) {
  const q = useSiteGet<Summary>(`/charge-runs/${runId}/summary`);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <>
      <WarningsAlert warnings={q.data.warnings} />
      {q.data.not_due_items.length > 0 && <p className="small muted mb-0">Bu dönem kesilmeyen kalemler: {q.data.not_due_items.join(", ")}</p>}
      <ItemTotalsCard totals={q.data.item_totals} />
    </>
  );
}

function RunCharges({ run, canAdjust }: { run: Run; canAdjust: boolean }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<{ line: Line; charge: PostedCharge } | null>(null);
  const q = useSiteGet<Page<PostedCharge>>(`/charge-runs/${run.id}/charges`, { page, page_size: 25 });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.items.length === 0) return <Empty title="Bu koşuda borç kaydı yok" />;
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Borç dökümü</span>{canAdjust && <span className="card__meta ml-auto">hatalı satırı kalem dökümünden düzeltin</span>}</div>
      <div className="card__body card__body--flush">
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">{run.period} koşusunun borç kayıtları</caption>
            <thead><tr><th scope="col">Bölüm</th><th scope="col">Kişi</th><th scope="col">Hesap</th><th scope="col" className="right">Tutar</th></tr></thead>
            <tbody>
              {q.data.items.map((c, i) => {
                const key = c.id ?? `${c.ledger_account_id}-${i}`;
                const isOpen = open === key;
                const adjusted = c.current_amount != null && c.current_amount !== c.amount;
                return (
                  <Fragment key={key}>
                    <tr>
                      <td>
                        <button type="button" className="btn btn--ghost btn--sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>{c.unit_name}</button>
                        <Proration days={c.days} periodDays={c.period_days} />
                      </td>
                      <td>{c.person_name ?? <span className="subtle">—</span>}</td>
                      <td className="small">{accountKind(c.account_kind)} · <span className="mono">{c.reference_code}</span></td>
                      <td className="right">
                        <Money value={adjusted ? c.current_amount : c.amount} />
                        {adjusted && <div className="cell-sub">ilk tutar {formatMoney(c.amount)}</div>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={4}>
                          <LineList lines={c.lines} onAdjust={canAdjust ? (line) => setAdjusting({ line, charge: c }) : undefined} />
                          {adjusting && adjusting.charge === c && <AdjustForm line={adjusting.line} unitName={c.unit_name} onDone={() => setAdjusting(null)} />}
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
        <Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} />
      </div>
    </div>
  );
}

/** Satır düzeltmesi (D-10): ters kayıt + doğru tutarla yeni borç; "Tahakkuk düzeltme" kuralı varsa onaya gider. */
function AdjustForm({ line, unitName, onDone }: { line: Line; unitName: string; onDone: () => void }) {
  const current = line.current_amount ?? line.amount;
  const [amount, setAmount] = useState(formatMoney(current, false));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<{ amount?: string; reason?: string }>({});
  const m = useSiteMutation<Schemas["AdjustmentIn"], Adjustment>("POST", `/charge-runs/lines/${line.id}/adjustments`, { money: true, onSuccess: onDone, onPending: onDone });

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = parseMoneyInput(amount);
    const next: typeof err = {};
    if (v == null || new Decimal(v).isNegative()) next.amount = "Geçerli bir tutar girin (0 olabilir).";
    else if (new Decimal(v).equals(current)) next.amount = "Yeni tutar mevcut tutarla aynı.";
    if (!reason.trim()) next.reason = "Gerekçe zorunlu.";
    setErr(next);
    if (next.amount || next.reason || v == null) return;
    m.mutate({ new_amount: v, reason: reason.trim() });
  }

  return (
    <form className="stack" style={{ gap: "var(--s-3)", padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--r-2, 8px)", marginTop: "var(--s-2)" }} onSubmit={submit} noValidate>
      <div className="strong small">{unitName} · {line.description} — şu an {formatMoney(current)}</div>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label="Yeni tutar (₺)" required error={err.amount ?? fieldError(m.error, "new_amount")}>
          {(p) => <input {...p} className="field__input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="Gerekçe" required error={err.reason ?? fieldError(m.error, "reason")} hint="ör. Bölüm m²'si yanlış girilmişti">
          {(p) => <input {...p} className="field__input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
      <p className="small muted mb-0">Eski borç ters kaydedilir, doğru tutarla yeniden yazılır. Dönem kilitliyse düzeltme açık döneme "önceki döneme ait" olarak yazılır. "Tahakkuk düzeltme" onay kuralı varsa önce onaya gider.</p>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>Düzelt</SubmitButton>
        <button type="button" className="btn btn--ghost" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

function AdjustmentsList({ runId }: { runId: string }) {
  const { site } = useSite();
  const q = useSiteGet<Adjustment[]>(`/charge-runs/${runId}/adjustments`);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return null;
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Düzeltme geçmişi</span><span className="card__meta ml-auto">{q.data.length} düzeltme</span></div>
      <div className="card__body card__body--flush">
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">Koşunun satır düzeltmeleri</caption>
            <thead><tr><th scope="col">Tarih</th><th scope="col" className="right">Eski</th><th scope="col" className="right">Yeni</th><th scope="col">Gerekçe</th><th scope="col">Durum</th></tr></thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id}>
                  <td className="small nowrap">{formatDateTime(a.created_at)}<div className="cell-sub">{a.requested_by ?? "—"}</div></td>
                  <td className="right"><Money value={a.old_amount} /></td>
                  <td className="right"><Money value={a.new_amount} /></td>
                  <td className="small">
                    {a.reason}
                    {a.prior_period && <div><Badge tone="info">Önceki döneme ait</Badge> <span className="cell-sub">dönem kilitliydi, açık döneme yazıldı</span></div>}
                  </td>
                  <td>
                    <Badge tone={adjustmentTone(a.status)}>{adjustmentStatus(a.status)}</Badge>
                    {a.applied_on && <div className="cell-sub">{formatDate(a.applied_on)}</div>}
                    {a.status === "approval_pending" && a.approval_request_id && <div className="cell-sub"><Link to={`/s/${site.slug}/onaylar/${a.approval_request_id}`}>Onay talebi</Link></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
          <p className="mb-0">{run.charge_count} borç kaydının her biri için eksi tutarlı karşı kayıt atılır. Orijinal kayıtlar silinmez. Tek satır hatalıysa ters kayıt yerine koşu dökümünden satırı düzeltin.</p>
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
