import { Fragment, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { Calculator, Plus, Scale, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker } from "../../components/UnitPicker";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, Money, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import {
  COMPONENT_KINDS, RULE_FREQUENCIES, RULE_KINDS, componentsTotal, formToVersionBody, needsCoefficients, nextPeriod, versionToForm,
  type BillingVersion, type BillingVersionBody, type VersionForm,
} from "../../lib/billing";
import { formatDateTime, formatMoney, formatMoneyShort, formatPercent, todayIso } from "../../lib/format";
import { allocationKind, areaBasis, chargeSource, frequency, payerRule, scopeKind, unitUsage, versionStatus, versionTone, warningKind } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Rule = Schemas["BillingRuleOut"];
type Trial = Schemas["BillingTrialOut"];
type ChargeType = Schemas["ChargeTypeOut"];
type Block = Schemas["BlockOut"];
type UnitType = Schemas["UnitTypeOut"];
type Params = Schemas["FinanceParametersOut"];
type RuleCreate = Schemas["BillingRuleCreateIn"];
type RuleMeta = Schemas["BillingRuleIn"];

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const plabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1] ?? p} ${p.slice(0, 4)}`;

/** Doğrudan ya da `version.` önekiyle gelen alan hatası (oluştururken sürüm alanları iç içe). */
const vErr = (e: unknown, name: string) => fieldError(e, name) ?? fieldError(e, `version.${name}`);

/** Sürümün tek satırlık özeti: "Alana (m²) göre · Brüt m² · 12.000,00 ₺ / dönem · Aylık". */
export function describeVersion(v: Pick<BillingVersion, "kind" | "area_basis" | "amount" | "amount_mode" | "frequency" | "components" | "discontinued">): string {
  if (v.discontinued) return "Kural bu dönemden itibaren durur";
  const how = v.kind === "composite"
    ? v.components.map((c) => `%${String(c.percent).replace(".", ",")} ${allocationKind(c.kind)}`).join(" + ")
    : `${allocationKind(v.kind)}${v.kind === "by_area" ? ` (${areaBasis(v.area_basis)})` : ""}`;
  const amount = `${formatMoney(v.amount)} / ${v.amount_mode === "per_unit" ? "bölüm" : "dönem"}`;
  return `${how} · ${amount} · ${frequency(v.frequency)}`;
}

/**
 * Aidat kuralları (K23, FIN-03): işletme projesi olmayan ya da aidatı sabit/m²/arsa payıyla belirleyen sitede tahakkuk
 * kaynağı. Kural sürümlüdür: yeni sürüm yalnız yürürlüğünden sonraki dönemleri etkiler; "Aidat kuralı" onay kuralı
 * varsa onaya gider. Deneme hesabı kayıt oluşturmaz.
 */
export function BillingRulesPage() {
  const { can, site } = useSite();
  const manage = can(P.budgetManage);
  const rules = useSiteGet<Rule[]>("/billing-rules");
  const params = useSiteGet<Params>("/finance-parameters");
  const [creating, setCreating] = useState(false);
  const source = params.data?.current.charge_source;

  return (
    <div className="stack">
      <PageHead
        title="Aidat kuralları"
        subtitle="Aidatın nasıl hesaplanacağı: eşit, m², arsa payı, bölüm tipi katsayısı, bölüm başına sabit ya da bunların karışımı. Her değişiklik yeni sürümdür; geçmiş dönemler değişmez."
        actions={manage && <button className="btn btn--primary" type="button" aria-expanded={creating} onClick={() => setCreating((v) => !v)}><Plus aria-hidden="true" /> Yeni kural</button>}
      />

      <Alert tone={source === "budget_plan" ? "warn" : "info"} title={source ? `Şu anki tahakkuk kaynağı: ${chargeSource(source)}` : undefined}>
        Tahakkuk kaynağı <Link to={`/s/${site.slug}/ayarlar/finans`}>Finans ayarlarında</Link> seçilir: işletme projesi ya da aidat kuralları (K23).
        {source === "budget_plan" && " Kaynak işletme projesi olduğu sürece buradaki kurallar tahakkuku etkilemez; deneme hesabı yine çalışır."}
      </Alert>

      {creating && <NewRuleForm period={params.data ? defaultPeriod(params.data) : nextPeriod(todayIso().slice(0, 7))} onDone={() => setCreating(false)} />}

      {rules.isPending ? (
        <Loading />
      ) : rules.isError ? (
        <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
      ) : rules.data.length === 0 ? (
        <div className="card"><Empty title="Henüz aidat kuralı yok" icon={<Scale aria-hidden="true" />}>{manage ? "Yeni kural ekleyip deneme hesabıyla kontrol edin, sonra onaya gönderin." : "Kuralları site yöneticisi ve muhasebe tanımlar."}</Empty></div>
      ) : (
        rules.data.map((r) => <RuleCard key={r.id} rule={r} manage={manage} period={params.data ? defaultPeriod(params.data) : nextPeriod(todayIso().slice(0, 7))} />)
      )}
    </div>
  );
}

/** Yeni sürümün varsayılan yürürlüğü: finansal etkili değişikliğin en erken dönemi (geçmiş/kilitli olamaz). */
const defaultPeriod = (p: Params) => p.earliest_financial_period;

function RuleCard({ rule, manage, period }: { rule: Rule; manage: boolean; period: string }) {
  const { site } = useSite();
  const [mode, setMode] = useState<{ kind: "new" } | { kind: "edit"; version: BillingVersion } | { kind: "meta" } | null>(null);
  const [trialOf, setTrialOf] = useState<string | null>(null);
  const cur = rule.current_version;
  const hasDraft = rule.versions.some((v) => v.status === "draft" || v.status === "approval_pending");
  const lastVersion = rule.versions.reduce<BillingVersion | null>((a, v) => (!a || v.version_no > a.version_no ? v : a), null);

  return (
    <div className="card">
      <div className="card__head">
        <span className="card__icon card__icon--accent"><Scale aria-hidden="true" /></span>
        <span className="card__title">{rule.name}</span>
        <span className="card__meta">{rule.charge_type_name}{rule.owner_item ? " · malik kalemi" : ""}</span>
        <span className="ml-auto">{cur ? <Badge tone="ok">Yürürlükte: sürüm {cur.version_no}</Badge> : <Badge tone="muted">Yürürlükte sürüm yok</Badge>}</span>
      </div>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        {cur && <div className="small">{describeVersion(cur)} <span className="muted">· {plabel(cur.effective_period)} döneminden · {scopeKind(cur.scope_kind)}</span></div>}
        {mode?.kind === "meta" && <RuleMetaForm rule={rule} onDone={() => setMode(null)} />}
        {mode?.kind === "new" && <VersionEditor rule={rule} initial={versionToForm(lastVersion, period)} onDone={() => setMode(null)} />}
        {mode?.kind === "edit" && <VersionEditor rule={rule} versionId={mode.version.id} initial={versionToForm(mode.version, mode.version.effective_period)} onDone={() => setMode(null)} />}
      </div>
      <div className="card__body card__body--flush">
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">{rule.name} sürüm geçmişi</caption>
            <thead><tr><th scope="col">Sürüm</th><th scope="col">Yürürlük</th><th scope="col">Hesap</th><th scope="col">Dayanak</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>
              {[...rule.versions].sort((a, b) => b.version_no - a.version_no).map((v) => (
                <Fragment key={v.id}>
                  <tr>
                    <td className="num">{v.version_no}</td>
                    <td className="small nowrap">{plabel(v.effective_period)}</td>
                    <td className="small">
                      {describeVersion(v)}
                      <div className="cell-sub">
                        {scopeKind(v.scope_kind)}{v.exemptions.length ? ` · ${v.exemptions.length} muafiyet` : ""}
                      </div>
                    </td>
                    <td className="small">{v.basis_note}<div className="cell-sub">{v.created_by ?? "—"} · {formatDateTime(v.created_at)}</div></td>
                    <td>
                      <Badge tone={versionTone(v.status)}>{versionStatus(v.status)}</Badge>
                      {v.status === "approval_pending" && v.approval_request_id && <div className="cell-sub"><Link to={`/s/${site.slug}/onaylar/${v.approval_request_id}`}>Onay talebi</Link></div>}
                      {v.activated_at && <div className="cell-sub">{formatDateTime(v.activated_at)}</div>}
                    </td>
                    <td className="right nowrap">
                      <span className="row" style={{ gap: "var(--s-1)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button type="button" className="btn btn--ghost btn--sm" aria-expanded={trialOf === v.id} onClick={() => setTrialOf(trialOf === v.id ? null : v.id)}><Calculator aria-hidden="true" /> Deneme</button>
                        {manage && v.status === "draft" && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode({ kind: "edit", version: v })}>Düzenle</button>}
                        {manage && v.status === "draft" && <SubmitVersionButton rule={rule} version={v} />}
                      </span>
                    </td>
                  </tr>
                  {trialOf === v.id && (
                    <tr><td colSpan={6} style={{ background: "var(--bg-inset)" }}><SavedTrial ruleId={rule.id} versionId={v.id} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {manage && (
        <div className="card__foot row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <button type="button" className="btn btn--sm" disabled={hasDraft} onClick={() => setMode({ kind: "new" })}><Plus aria-hidden="true" /> Yeni sürüm</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode({ kind: "meta" })}>Adı ve kalem tipini düzenle</button>
          {hasDraft && <span className="small muted">Açık taslak ya da onay bekleyen sürüm varken yeni sürüm açılmaz.</span>}
        </div>
      )}
    </div>
  );
}

function SubmitVersionButton({ rule, version }: { rule: Rule; version: BillingVersion }) {
  const m = useSiteMutation<Record<string, never>, Rule>("POST", `/billing-rules/${rule.id}/versions/${version.id}/submit`);
  return (
    <ConfirmButton
      className="btn btn--primary btn--sm"
      title={`${rule.name} — sürüm ${version.version_no}`}
      confirmLabel="Gönder"
      body={
        <>
          <p>{describeVersion(version)}; {plabel(version.effective_period)} döneminden.</p>
          <p className="mb-0">"Aidat kuralı" onay kuralı varsa onaya gider; yoksa hemen yürürlüğe girer. Yalnız yürürlüğünden sonraki dönemleri etkiler. Bölüm verisi eksikse (m², arsa payı, tip) ya da kapsam başka kuralla çakışıyorsa gönderilemez.</p>
        </>
      }
      onConfirm={() => m.mutateAsync({})}
    >
      Onaya gönder
    </ConfirmButton>
  );
}

function RuleMetaForm({ rule, onDone }: { rule: Rule; onDone: () => void }) {
  const types = useSiteGet<ChargeType[]>("/charge-types");
  const [f, setF] = useState<RuleMeta>({ name: rule.name, charge_type_id: rule.charge_type_id, owner_item: rule.owner_item });
  const m = useSiteMutation<RuleMeta, Rule>("PATCH", `/billing-rules/${rule.id}`, { onSuccess: onDone });
  return (
    <form className="stack" style={{ gap: "var(--s-3)", padding: "var(--s-3)", background: "var(--bg-inset)", borderRadius: 8 }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, name: f.name.trim() }); }}>
      <FormError error={m.error} />
      <RuleMetaFields f={f} setF={setF} types={types.data ?? []} error={m.error} />
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.name.trim()}>Kaydet</SubmitButton>
        <button type="button" className="btn btn--ghost" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

function RuleMetaFields({ f, setF, types, error }: { f: RuleMeta; setF: (fn: (x: RuleMeta) => RuleMeta) => void; types: ChargeType[]; error: unknown }) {
  return (
    <div className="grid grid--kpi">
      <Field label="Kural adı" required error={fieldError(error, "name")}>
        {(p) => <input {...p} className="field__input" maxLength={120} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="ör. Aylık aidat" />}
      </Field>
      <Field label="Kalem tipi" hint="Kimin ödeyeceğini belirler. Ek toplama için ayrı bir kalem tipi tanımlanabilir." error={fieldError(error, "charge_type_id")}>
        {(p) => (
          <select {...p} className="field__input" value={f.charge_type_id} onChange={(e) => setF((x) => ({ ...x, charge_type_id: e.target.value }))}>
            {!f.charge_type_id && <option value="">Seçin</option>}
            {types.map((t) => <option key={t.id} value={t.id}>{t.name} — {payerRule(t.payer_rule)}</option>)}
          </select>
        )}
      </Field>
      <label className="check" style={{ alignSelf: "end", minHeight: 44 }}>
        <input type="checkbox" checked={!!f.owner_item} onChange={(e) => setF((x) => ({ ...x, owner_item: e.target.checked }))} /> Malik kalemi (malike yazılır, kiracıya görünmez)
      </label>
    </div>
  );
}

function NewRuleForm({ period, onDone }: { period: string; onDone: () => void }) {
  const types = useSiteGet<ChargeType[]>("/charge-types");
  const [meta, setMeta] = useState<RuleMeta>({ name: "", charge_type_id: "", owner_item: false });
  const chargeTypeId = meta.charge_type_id || types.data?.[0]?.id || "";
  const m = useSiteMutation<RuleCreate, Rule>("POST", "/billing-rules", { onSuccess: onDone });
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Yeni aidat kuralı (taslak)</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <RuleMetaFields f={{ ...meta, charge_type_id: chargeTypeId }} setF={setMeta} types={types.data ?? []} error={m.error} />
        <VersionFormBody
          initial={versionToForm(null, period)}
          busy={m.isPending}
          serverError={m.error}
          trialMeta={{ ...meta, name: meta.name.trim() || "Deneme", charge_type_id: chargeTypeId }}
          submitLabel="Taslak olarak kaydet"
          disabled={!meta.name.trim() || !chargeTypeId}
          onSubmit={(version) => m.mutate({ ...meta, name: meta.name.trim(), charge_type_id: chargeTypeId, version })}
          onCancel={onDone}
        />
      </div>
    </div>
  );
}

function VersionEditor({ rule, versionId, initial, onDone }: { rule: Rule; versionId?: string; initial: VersionForm; onDone: () => void }) {
  const m = useSiteMutation<BillingVersionBody, Rule>(versionId ? "PUT" : "POST", versionId ? `/billing-rules/${rule.id}/versions/${versionId}` : `/billing-rules/${rule.id}/versions`, { onSuccess: onDone });
  return (
    <div className="stack" style={{ gap: "var(--s-3)", padding: "var(--s-3)", background: "var(--bg-inset)", borderRadius: 8 }}>
      <div className="strong">{versionId ? "Taslak sürümü düzenle" : "Yeni sürüm (taslak)"}</div>
      <FormError error={m.error} />
      <VersionFormBody
        initial={initial}
        busy={m.isPending}
        serverError={m.error}
        trialMeta={{ name: rule.name, charge_type_id: rule.charge_type_id, owner_item: rule.owner_item }}
        submitLabel={versionId ? "Kaydet" : "Taslak olarak kaydet"}
        onSubmit={(body) => m.mutate(body)}
        onCancel={onDone}
      />
    </div>
  );
}

/** Kayıt öncesi deneme hesabı: hiçbir şey kaydedilmez, önbellek tazelenmez. */
function useTrial() {
  const { site } = useSite();
  return useMutation({ mutationFn: (body: Schemas["BillingTrialIn"]) => api<Trial>("POST", `/sites/${site.slug}/billing-rules/trial`, { body }) });
}

function VersionFormBody({
  initial, busy, serverError, trialMeta, submitLabel, disabled, onSubmit, onCancel,
}: {
  initial: VersionForm;
  busy: boolean;
  serverError: unknown;
  trialMeta: RuleMeta;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (body: BillingVersionBody) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<VersionForm>(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const blocks = useSiteGet<Page<Block>>("/blocks", { page_size: 200 });
  const unitTypes = useSiteGet<Page<UnitType>>("/unit-types", { page_size: 200 });
  const trial = useTrial();
  const set = <K extends keyof VersionForm>(k: K, v: VersionForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const err = (name: string) => errs[name] ?? vErr(serverError, name) ?? vErr(trial.error, name);

  function build(): BillingVersionBody | null {
    const { body, errors } = formToVersionBody(f);
    setErrs(errors);
    return body;
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const body = build();
    if (body) onSubmit(body);
  }
  function runTrial() {
    const body = build();
    if (body) trial.mutate({ ...trialMeta, version: body });
  }
  const total = componentsTotal(f.components);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <form className="stack" style={{ gap: "var(--s-4)" }} onSubmit={submit} noValidate>
      <div className="grid grid--kpi">
        <Field label="Yürürlük dönemi" required hint="Geçmiş ya da kilitli dönem olamaz" error={err("effective_period")}>
          {(p) => <input {...p} className="field__input" type="month" value={f.effective_period} onChange={(e) => set("effective_period", e.target.value)} />}
        </Field>
        <Field label="Dağıtım" error={err("kind")}>
          {(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => set("kind", e.target.value as VersionForm["kind"])}>{RULE_KINDS.map((k) => <option key={k} value={k}>{allocationKind(k)}</option>)}</select>}
        </Field>
        {f.kind === "by_area" && (
          <Field label="Alan esası">
            {(p) => <select {...p} className="field__input" value={f.area_basis} onChange={(e) => set("area_basis", e.target.value as VersionForm["area_basis"])}><option value="gross">Brüt m²</option><option value="net">Net m²</option></select>}
          </Field>
        )}
        <Field label={f.kind === "fixed_per_unit" ? "Bölüm başına tutar (₺)" : "Dönem toplamı (₺)"} required={!f.discontinued} hint={f.kind === "fixed_per_unit" ? "Her bölüme bu tutar yazılır" : "Bir dönemde bölümlere dağıtılacak toplam"} error={err("amount")}>
          {(p) => <input {...p} className="field__input num" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} />}
        </Field>
        <Field label="Dönem" error={err("frequency")}>
          {(p) => <select {...p} className="field__input" value={f.frequency} onChange={(e) => set("frequency", e.target.value as VersionForm["frequency"])}>{RULE_FREQUENCIES.map((k) => <option key={k} value={k}>{frequency(k)}</option>)}</select>}
        </Field>
      </div>

      {f.kind === "composite" && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Bileşenler — toplam %{total.replace(".", ",")} {total === "100" ? <Badge tone="ok">Tamam</Badge> : <Badge tone="warn">%100 olmalı</Badge>}</legend>
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            {f.components.map((c, i) => (
              <div key={i} className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field"><label className="field__label" htmlFor={`cmp-k-${i}`}>Tip</label><select id={`cmp-k-${i}`} className="field__input" value={c.kind} onChange={(e) => set("components", f.components.map((x, j) => (j === i ? { ...x, kind: e.target.value as typeof c.kind } : x)))}>{COMPONENT_KINDS.map((k) => <option key={k} value={k}>{allocationKind(k)}</option>)}</select></div>
                <div className="field"><label className="field__label" htmlFor={`cmp-p-${i}`}>Yüzde</label><input id={`cmp-p-${i}`} className="field__input num" style={{ width: "6rem" }} inputMode="decimal" value={c.percent} onChange={(e) => set("components", f.components.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} /></div>
                {c.kind === "by_area" && <div className="field"><label className="field__label" htmlFor={`cmp-a-${i}`}>Alan</label><select id={`cmp-a-${i}`} className="field__input" value={c.area_basis} onChange={(e) => set("components", f.components.map((x, j) => (j === i ? { ...x, area_basis: e.target.value as typeof c.area_basis } : x)))}><option value="gross">Brüt m²</option><option value="net">Net m²</option></select></div>}
                <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={`${i + 1}. bileşeni kaldır`} disabled={f.components.length <= 2} onClick={() => set("components", f.components.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>
              </div>
            ))}
            <div><button type="button" className="btn btn--sm" onClick={() => set("components", [...f.components, { kind: "equal", percent: "", area_basis: "gross" }])}><Plus aria-hidden="true" /> Bileşen ekle</button></div>
          </div>
          {err("components") && <span className="field__error" role="alert">{err("components")}</span>}
        </fieldset>
      )}

      {needsCoefficients(f) && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Bölüm tipi katsayıları</legend>
          {unitTypes.isPending ? <Loading /> : (unitTypes.data?.items.length ?? 0) === 0 ? <p className="small muted mb-0">Bölüm tipi tanımlı değil; Yapı ekranından ekleyin.</p> : (
            <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
              {unitTypes.data!.items.map((t) => (
                <div className="field" key={t.id}>
                  <label className="field__label" htmlFor={`coef-${t.id}`}>{t.name}</label>
                  <input id={`coef-${t.id}`} className="field__input num" style={{ width: "6rem" }} inputMode="decimal" placeholder={t.weight.replace(".", ",")} value={f.coefficients[t.id] ?? ""} onChange={(e) => set("coefficients", { ...f.coefficients, [t.id]: e.target.value })} />
                </div>
              ))}
            </div>
          )}
          <span className="field__hint">Boş bırakılan tipte bölüm tipinin kendi ağırlığı (gri yazı) kullanılır. Ör. dükkan 1,5 · daire 1.</span>
          {err("type_coefficients") && <span className="field__error" role="alert">{err("type_coefficients")}</span>}
        </fieldset>
      )}

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Kapsam</legend>
        <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
          {(["whole_site", "blocks", "unit_types", "usage"] as const).map((k) => (
            <label key={k} className="check"><input type="radio" name="scope_kind" checked={f.scope_kind === k} onChange={() => set("scope_kind", k)} /> {scopeKind(k)}</label>
          ))}
        </div>
        {f.scope_kind === "blocks" && (
          <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap", marginTop: "var(--s-2)" }}>
            {(blocks.data?.items ?? []).map((b) => <label key={b.id} className="check"><input type="checkbox" checked={f.scope_block_ids.includes(b.id)} onChange={() => set("scope_block_ids", toggle(f.scope_block_ids, b.id))} /> {b.name}</label>)}
          </div>
        )}
        {f.scope_kind === "unit_types" && (
          <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap", marginTop: "var(--s-2)" }}>
            {(unitTypes.data?.items ?? []).map((t) => <label key={t.id} className="check"><input type="checkbox" checked={f.scope_unit_type_ids.includes(t.id)} onChange={() => set("scope_unit_type_ids", toggle(f.scope_unit_type_ids, t.id))} /> {t.name}</label>)}
          </div>
        )}
        {f.scope_kind === "usage" && (
          <div className="field" style={{ marginTop: "var(--s-2)", maxWidth: "20rem" }}>
            <label className="field__label" htmlFor="scope-usage">Kullanım türü</label>
            <select id="scope-usage" className="field__input" value={f.scope_usage} onChange={(e) => set("scope_usage", e.target.value)}>
              <option value="">Seçin</option>
              {["residential", "commercial", "storage", "parking"].map((u) => <option key={u} value={u}>{unitUsage(u)}</option>)}
            </select>
          </div>
        )}
        {(err("scope_block_ids") || err("scope_unit_type_ids") || err("scope_usage")) && <span className="field__error" role="alert">{err("scope_block_ids") || err("scope_unit_type_ids") || err("scope_usage")}</span>}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Muafiyetler</legend>
        <div className="stack" style={{ gap: "var(--s-2)" }}>
          {f.exemptions.map((e, i) => (
            <div key={i} className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
              {e.unit_id ? <ExemptUnit id={e.unit_id} name={e.unit_name} /> : (
                <div style={{ minWidth: "14rem" }}>
                  <UnitPicker label="Bölüm" value={null} onChange={(u) => u && set("exemptions", f.exemptions.map((x, j) => (j === i ? { ...x, unit_id: u.id, unit_name: u.name } : x)))} />
                </div>
              )}
              <div className="field"><label className="field__label" htmlFor={`ex-p-${i}`}>İndirim %</label><input id={`ex-p-${i}`} className="field__input num" style={{ width: "6rem" }} inputMode="decimal" value={e.percent} onChange={(ev) => set("exemptions", f.exemptions.map((x, j) => (j === i ? { ...x, percent: ev.target.value } : x)))} /></div>
              <div className="field" style={{ flex: 1, minWidth: "12rem" }}><label className="field__label" htmlFor={`ex-r-${i}`}>Gerekçe</label><input id={`ex-r-${i}`} className="field__input" maxLength={100} value={e.reason} placeholder="ör. boş daire, personel dairesi" onChange={(ev) => set("exemptions", f.exemptions.map((x, j) => (j === i ? { ...x, reason: ev.target.value } : x)))} /></div>
              <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={`${i + 1}. muafiyeti kaldır`} onClick={() => set("exemptions", f.exemptions.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></button>
            </div>
          ))}
          <div><button type="button" className="btn btn--sm" onClick={() => set("exemptions", [...f.exemptions, { unit_id: "", unit_name: null, percent: "100", reason: "" }])}><Plus aria-hidden="true" /> Muafiyet ekle</button></div>
        </div>
        <span className="field__hint">%100 tam muaf. Muaf tutar diğer bölümlere dağıtılmaz; deneme hesabında ayrıca gösterilir.</span>
        {err("exemptions") && <span className="field__error" role="alert">{err("exemptions")}</span>}
      </fieldset>

      <Field label="Dayanak" required hint="Yönetim planı maddesi ya da kurul kararı (ör. 12.01.2026 tarihli genel kurul, karar 4)" error={err("basis_note")}>
        {(p) => <input {...p} className="field__input" maxLength={300} value={f.basis_note} onChange={(e) => set("basis_note", e.target.value)} />}
      </Field>
      <label className="check"><input type="checkbox" checked={f.discontinued} onChange={(e) => set("discontinued", e.target.checked)} /> Kural bu dönemden itibaren dursun (durdurma sürümü)</label>

      <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={trial.isPending} aria-busy={trial.isPending || undefined} onClick={runTrial}>
          {trial.isPending && <span className="spinner" aria-hidden="true" />}<Calculator aria-hidden="true" /> Deneme hesabı
        </button>
        <SubmitButton busy={busy} disabled={disabled}>{submitLabel}</SubmitButton>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Vazgeç</button>
      </div>
      <FormError error={trial.error} />
      {trial.data && <TrialView t={trial.data} />}
    </form>
  );
}

function ExemptUnit({ id, name }: { id: string; name: string | null }) {
  const q = useSiteGet<Schemas["UnitDetail"]>(`/units/${id}`, undefined, { enabled: !name });
  return (
    <div className="field" style={{ minWidth: "10rem" }}>
      <span className="field__label">Bölüm</span>
      <span className="badge badge--info" style={{ fontSize: ".875rem", padding: "6px 10px", alignSelf: "flex-start" }}>{name ?? q.data?.display_name ?? "…"}</span>
    </div>
  );
}

/** Kayıtlı sürümün deneme hesabı: POST ama yan etkisiz (kayıt oluşturmaz), bu yüzden sorgu olarak önbelleklenir. */
function SavedTrial({ ruleId, versionId }: { ruleId: string; versionId: string }) {
  const { site } = useSite();
  const q = useQuery({
    queryKey: ["site", site.slug, "billing-trial", ruleId, versionId],
    queryFn: () => api<Trial>("POST", `/sites/${site.slug}/billing-rules/${ruleId}/versions/${versionId}/trial`),
  });
  if (q.isPending) return <Loading label="Deneme hesabı yapılıyor…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <TrialView t={q.data} />;
}

const TRIAL_PAGE = 50;

/** Deneme hesabı: bölüm bazında tutar, dönem/yıllık toplam ve yürürlükteki bütçenin gelir hedefiyle karşılaştırma (FIN-17). */
export function TrialView({ t }: { t: Trial }) {
  const [page, setPage] = useState(1);
  const target = t.budget_income_target;
  const ratio = target && !new Decimal(target).isZero() ? new Decimal(t.annual_total).div(target).times(100).toDecimalPlaces(1).toString() : null;
  const gap = target ? new Decimal(t.annual_total).minus(target).toFixed(2) : null;
  return (
    <div className="stack" style={{ gap: "var(--s-3)" }}>
      <div className="grid grid--kpi">
        <Kpi label="Dönem toplamı" tone="accent" value={formatMoneyShort(t.period_total)} note={formatMoney(t.period_total)} />
        <Kpi label="Yıllık karşılığı" value={formatMoneyShort(t.annual_total)} note={formatMoney(t.annual_total)} />
        <Kpi label="Bölüm" value={t.unit_count} note={new Decimal(t.exempted).isZero() ? "muafiyet yok" : `muaf: ${formatMoney(t.exempted)}`} />
        <Kpi
          label="Bütçe gelir hedefi"
          small
          tone={gap == null ? undefined : new Decimal(gap).isNegative() ? "warn" : "ok"}
          value={target ? formatMoney(target) : "—"}
          note={target ? `yıllık karşılık hedefin ${formatPercent(ratio)}'i (${new Decimal(gap!).isNegative() ? "eksik" : "fazla"} ${formatMoney(new Decimal(gap!).abs().toFixed(2))})` : "yürürlükte bütçe yok"}
        />
      </div>
      {t.warnings.length > 0 && (
        <Alert tone="warn" title={`${t.warnings.length} uyarı`}>
          <ul className="mb-0" style={{ paddingLeft: "1.1rem" }}>{t.warnings.map((w, i) => <li key={i}>{warningKind(w.kind)} — {w.message}</li>)}</ul>
        </Alert>
      )}
      {t.lines.length > 0 && (
        <div className="card">
          <div className="card__body card__body--flush">
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Deneme hesabı: bölüm bazında tutarlar</caption>
                <thead><tr><th scope="col">Bölüm</th><th scope="col">Açıklama</th><th scope="col" className="right">Tutar</th></tr></thead>
                <tbody>
                  {t.lines.slice((page - 1) * TRIAL_PAGE, page * TRIAL_PAGE).map((l) => (
                    <tr key={l.unit_id}><td className="cell-main">{l.unit_name}</td><td className="calc">{l.explanation}</td><td className="right"><Money value={l.amount} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card__foot"><Pager page={page} pageSize={TRIAL_PAGE} total={t.lines.length} onPage={setPage} /></div>
        </div>
      )}
      <p className="small muted mb-0">Deneme hesabı kayıt oluşturmaz. Kesin tutar tahakkukta ödeyene (oturan/malik) ve kısta göre yazılır.</p>
    </div>
  );
}
