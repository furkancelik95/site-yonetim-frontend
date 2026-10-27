import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Badge, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, parseMoneyInput } from "../../lib/format";
import { P, useSite } from "../../site/SiteContext";

type Params = Schemas["FinanceParamsOut"];
type Version = Schemas["FinanceParamVersionOut"];
type Resp = Schemas["FinanceParametersOut"];

const LABELS: Record<keyof Params, string> = {
  reminder_days: "Hatırlatma kademeleri", demand_letter_day: "İhtarname hazırlığı", proration: "Kıst (ay ortası giriş/çıkış)", diff_threshold_percent: "Tahakkuk fark raporu eşiği",
  bank_auto_match: "Banka otomatik eşleşme", plan_tolerance_days: "Ödeme planı tolerans günü", plan_suspends_late_fee: "Plan süresince gecikme işlemez", budget_warn_percent: "Bütçe uyarı eşiği",
  due_day: "Vade günü", charge_source: "Tahakkuk kaynağı", late_fee_enabled: "Gecikme tazminatı", late_fee_monthly_rate_percent: "Gecikme oranı (aylık %)", late_fee_method: "Gecikme hesap yöntemi",
  late_fee_grace_days: "Gecikme tolerans günü", late_fee_cap_percent: "Gecikme tavanı (%)", late_fee_minimum_amount: "Asgari gecikme tutarı", allocation_order: "Mahsup sırası", debtor_restriction_enabled: "Borçlu hizmet kısıtı", debtor_restriction_min_amount: "Kısıt eşiği (tutar)",
  debtor_restriction_min_days: "Kısıt eşiği (gün)",
};
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const plabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const label = (k: string) => LABELS[k as keyof Params] ?? k;
const versionTone = (s: Version["status"]) => (s === "active" ? "ok" : s === "approval_pending" ? "warn" : "muted");
const versionStatus = (s: Version["status"]) => (s === "active" ? "Geçerli" : s === "approval_pending" ? "Onay bekliyor" : "Reddedildi");

/** Henüz ayara dönmemiş ya da başka ekranda yönetilen konular: burada yalnız bilgi. */
const PENDING = [
  ["Kart ile tahsilat, komisyon, taksit", "Kapalı — tahsilat havale/EFT ve elle giriş", "K1 — sitenin kendi sanal POS'u (ayrı paket)", "warn"],
  ["Ek toplama (taksitli)", "Ayrı bir kalem tipi olarak tanımlanır; işletme projesi kalemi ya da aidat kuralıyla kesilir", "Aidat kuralları ekranında (K23)", "info"],
] as const;

/**
 * Finans parametreleri (FIN-16): sitenin finans kuralları tek ekranda, yürürlük dönemiyle versiyonlu. Finansal etkili
 * parametre en erken sonraki dönemden geçerli olur ve "Finans parametresi" onay kuralı varsa onaya gider; geçmiş dönem
 * değişmez. PM kararlarının ayar noktaları: K9 kıst, K25 vade günü, K23 tahakkuk kaynağı, K2 gecikme, K24 mahsup, K11 kısıt.
 */
export function FinanceSettingsPage() {
  const { can, site } = useSite();
  const q = useSiteGet<Resp>("/finance-parameters");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const pending = q.data.versions.filter((v) => v.status === "approval_pending");
  return (
    <div className="stack">
      <PageHead title="Finans ayarları" subtitle="Vade, kıst, gecikme, mahsup, hatırlatma kademeleri, eşikler. Her değişiklik yürürlük dönemiyle kaydedilir; geçmiş dönemler değişmez." />
      {q.data.scheduled.length > 0 && <Alert tone="info" title="Planlı değişiklik">{q.data.scheduled.map((v) => `${plabel(v.effective_period)}: ${v.changed.map(label).join(", ")}`).join(" · ")}</Alert>}
      {pending.length > 0 && <Alert tone="warn" title="Onay bekleyen değişiklik">{pending.map((v) => `${plabel(v.effective_period)}: ${v.changed.map(label).join(", ")}`).join(" · ")} — Onaylar ekranından izleyin.</Alert>}
      <Alert tone="info" title="Tahakkuk motoru bu ayarları kullanır">
        Kıst (gün/ay bazlı), vade günü ve tahakkuk kaynağı (işletme projesi ya da <Link to={`/s/${site.slug}/aidat-kurallari`}>aidat kuralları</Link>) her tahakkukta uygulanır.
        Gecikme tazminatı açıksa ay sonu işiyle ve tahsilat anında işlenir; ödeme planı süresince işlemez, oran en fazla aylık %5'tir.
        Mahsup sırası tahsilatta ve avans mahsubunda uygulanır.
      </Alert>
      {can(P.chargePost) ? <ParamsForm d={q.data} /> : <Alert tone="info">Parametreleri yalnız site yöneticisi ve muhasebe değiştirir.</Alert>}
      <div className="card">
        <div className="card__head"><span className="card__title">Bu ekranda olmayan ayarlar</span><span className="card__meta ml-auto">dış karar bekleyen ya da başka ekranda</span></div>
        <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
          <caption className="visually-hidden">Karar bekleyen finans ayarları</caption>
          <thead><tr><th scope="col">Ayar</th><th scope="col">Şu an</th><th scope="col">Bekleyen</th></tr></thead>
          <tbody>{PENDING.map(([a, b, c, tone]) => <tr key={a}><td className="cell-main">{a}</td><td className="small">{b}</td><td className="small"><Badge tone={tone}>{c}</Badge></td></tr>)}</tbody>
        </table></div></div>
      </div>
      {q.data.versions.length > 0 && (
        <div className="card">
          <div className="card__head"><span className="card__title">Değişiklik geçmişi</span></div>
          <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Parametre sürümleri</caption>
            <thead><tr><th scope="col">Yürürlük</th><th scope="col">Değişen</th><th scope="col">Durum</th><th scope="col">Yapan</th></tr></thead>
            <tbody>{q.data.versions.map((v) => <tr key={v.id}><td className="small nowrap">{plabel(v.effective_period)}{v.status === "active" && v.effective_period > q.data.current_period && <> <Badge tone="info">Planlı</Badge></>}</td><td className="small">{v.changed.map(label).join(", ")}</td><td><Badge tone={versionTone(v.status)}>{versionStatus(v.status)}</Badge></td><td className="small">{v.changed_by}<div className="cell-sub">{formatDateTime(v.created_at)}</div></td></tr>)}</tbody>
          </table></div></div>
        </div>
      )}
    </div>
  );
}

type Form = Omit<Params, "reminder_days" | "late_fee_monthly_rate_percent" | "debtor_restriction_min_amount" | "late_fee_minimum_amount"> & { rate: string; minAmount: string; lateMin: string };
const toForm = (p: Params): Form => ({ ...p, rate: p.late_fee_monthly_rate_percent.replace(".", ","), minAmount: p.debtor_restriction_min_amount.replace(".", ","), lateMin: p.late_fee_minimum_amount.replace(".", ",") });
const digits = (v: string, n = 3) => v.replace(/\D/g, "").slice(0, n);

function ParamsForm({ d }: { d: Resp }) {
  const [v, setV] = useState<Form>(toForm(d.current));
  const [days, setDays] = useState(d.current.reminder_days.map(String));
  const [period, setPeriod] = useState(d.current_period);
  useEffect(() => { setV(toForm(d.current)); setDays(d.current.reminder_days.map(String)); }, [d.current]);
  const m = useSiteMutation<{ effective_period: string; values: Partial<Params> }, Version>("POST", "/finance-parameters/versions");
  const { rate, minAmount, lateMin, ...rest } = v;
  const next: Params = { ...rest, reminder_days: days.map(Number), late_fee_monthly_rate_percent: parseMoneyInput(rate) ?? rate, debtor_restriction_min_amount: parseMoneyInput(minAmount) ?? minAmount, late_fee_minimum_amount: parseMoneyInput(lateMin) ?? lateMin };
  const changed = (Object.keys(next) as (keyof Params)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(d.current[k]));
  const financial = changed.some((k) => d.financial_keys.includes(k));
  useEffect(() => { if (financial && period < d.earliest_financial_period) setPeriod(d.earliest_financial_period); }, [financial]);
  const set = <K extends keyof Form>(k: K, value: Form[K]) => setV((x) => ({ ...x, [k]: value }));
  const num = (k: keyof Form) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: Number(digits(e.target.value)) }));
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ effective_period: period, values: Object.fromEntries(changed.map((k) => [k, next[k]])) as Partial<Params> }); }
  const periods = [d.current_period, d.earliest_financial_period, ...[1, 2].map((i) => { const x = new Date(d.earliest_financial_period + "-01T00:00:00"); x.setMonth(x.getMonth() + i); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; })];
  const fin = <span className="muted">(finansal etkili)</span>;
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError error={m.error} />
      <div className="card">
        <div className="card__head"><span className="card__title">Tahakkuk ve vade</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Tahakkuk kaynağı {fin}</legend>
            <label className="check"><input type="radio" name="charge_source" checked={v.charge_source === "budget_plan"} onChange={() => set("charge_source", "budget_plan")} /><span>İşletme projesi — aidat bütçe kalemlerinden dağıtılır</span></label>
            <label className="check"><input type="radio" name="charge_source" checked={v.charge_source === "billing_rule"} onChange={() => set("charge_source", "billing_rule")} /><span>Aidat kuralları — sabit, m², arsa payı ya da bölüm tipi katsayısıyla (Aidat kuralları ekranı)</span></label>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Kıst — ay ortası giriş/çıkışta aidat {fin}</legend>
            <label className="check"><input type="radio" name="proration" checked={v.proration === "day"} onChange={() => set("proration", "day")} /><span>Gün bazlı — gün oranı uygulanır (ör. 15/31 ve 16/31)</span></label>
            <label className="check"><input type="radio" name="proration" checked={v.proration === "month"} onChange={() => set("proration", "month")} /><span>Ay bazlı — başladığı ve bittiği ay tam sayılır</span></label>
          </fieldset>
          <div className="grid grid--kpi">
            <Field label="Vade günü (ayın kaçı)" hint="1–28; varsayılan 10 (finansal etkili)" error={fieldError(m.error, "due_day")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.due_day} onChange={num("due_day")} />}</Field>
            <Field label="Fark raporu eşiği (%)" hint="Önceki döneme göre bu orandan fazla değişen hesap işaretlenir" error={fieldError(m.error, "diff_threshold_percent")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.diff_threshold_percent} onChange={num("diff_threshold_percent")} />}</Field>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Gecikme tazminatı ve mahsup</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <label className="check"><input type="checkbox" checked={v.late_fee_enabled} onChange={(e) => set("late_fee_enabled", e.target.checked)} /><span>Gecikme tazminatı uygulanır {fin} <span className="muted">— site yönetimi kararı; varsayılan kapalı</span></span></label>
          {v.late_fee_enabled && (
            <div className="grid grid--kpi">
              <Field label="Aylık oran (%)" hint="KMK m.20 üst sınırı %5" error={fieldError(m.error, "late_fee_monthly_rate_percent")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={rate} onChange={(e) => set("rate", e.target.value)} />}</Field>
              <Field label="Hesap yöntemi">{(p) => <select {...p} className="field__input" value={v.late_fee_method} onChange={(e) => set("late_fee_method", e.target.value as Params["late_fee_method"])}><option value="daily">Gün bazlı oransal (oran × gün / 30)</option><option value="full_month">Başlamış ay tam ay</option></select>}</Field>
              <Field label="Tolerans (gün)" hint="0–30; vade + tolerans dolmadan işlemez" error={fieldError(m.error, "late_fee_grace_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.late_fee_grace_days} onChange={num("late_fee_grace_days")} />}</Field>
              <Field label="Tavan (ana borcun %'si)" hint="0–100; 0 = tavan yok" error={fieldError(m.error, "late_fee_cap_percent")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.late_fee_cap_percent} onChange={num("late_fee_cap_percent")} />}</Field>
              <Field label="Asgari tutar (₺)" hint="Bu tutarın altındaki gecikme yazılmaz" error={fieldError(m.error, "late_fee_minimum_amount")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={lateMin} onChange={(e) => set("lateMin", e.target.value)} />}</Field>
            </div>
          )}
          <span className="field__hint">Oran ve yöntem avukat görüşüne kadar parametredir (K2). Tazminat ay sonu işiyle ve tahsilat anında cariye "Gecikme tazminatı" satırı olarak işlenir; ödeme planı süresince işlemez.</span>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Mahsup sırası {fin}</legend>
            <label className="check"><input type="radio" name="allocation_order" checked={v.allocation_order === "late_fee_first"} onChange={() => set("allocation_order", "late_fee_first")} /><span>Aynı vadede önce gecikme tazminatı, sonra ana borç (TBK m.100 — varsayılan)</span></label>
            <label className="check"><input type="radio" name="allocation_order" checked={v.allocation_order === "principal_first"} onChange={() => set("allocation_order", "principal_first")} /><span>Önce en eski ana borç, sonra gecikmesi</span></label>
          </fieldset>
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Borç takibi</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Hatırlatma kademeleri (vadeden sonraki gün)</legend>
            <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
              {["Uygulama bildirimi", "SMS", "Yönetici araması"].map((l, i) => (
                <div className="field" key={l}><label className="field__label" htmlFor={`rd-${i}`}>{l}</label><input id={`rd-${i}`} className="field__input" style={{ width: "6rem" }} inputMode="numeric" value={days[i]} onChange={(e) => setDays((x) => x.map((y, j) => (j === i ? digits(e.target.value) : y)))} /></div>
              ))}
            </div>
            {fieldError(m.error, "reminder_days") && <span className="field__error" role="alert">{fieldError(m.error, "reminder_days")}</span>}
            <span className="field__hint">Gece işi bu günlerde kademe kaydını yazar ve arama/ihtarname kademesinde yöneticiye görev bildirimi düşer. Bildirim ve SMS gönderimi sağlayıcı seçilince (K5); borçlu listesi sakin ekranlarında hiç görünmez.</span>
          </fieldset>
          <div className="grid grid--kpi">
            <Field label="İhtarname hazırlığı (gün)" hint="Son kademeden sonra" error={fieldError(m.error, "demand_letter_day")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.demand_letter_day} onChange={num("demand_letter_day")} />}</Field>
            <Field label="Ödeme planı tolerans günü" hint="Taksit vade + bu gün geçerse plan bozulur" error={fieldError(m.error, "plan_tolerance_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.plan_tolerance_days} onChange={num("plan_tolerance_days")} />}</Field>
          </div>
          <label className="check"><input type="checkbox" checked={v.plan_suspends_late_fee} onChange={(e) => set("plan_suspends_late_fee", e.target.checked)} /><span>Ödeme planına uyulduğu sürece yapılandırılan borca gecikme işlemez {fin}</span></label>
          <label className="check"><input type="checkbox" checked={v.debtor_restriction_enabled} onChange={(e) => set("debtor_restriction_enabled", e.target.checked)} /><span>Borçlu bölüme isteğe bağlı hizmet kısıtı (rezervasyon, ücretli hizmet) <span className="muted">— site kararı; varsayılan kapalı (K11)</span></span></label>
          {v.debtor_restriction_enabled && (
            <div className="grid grid--kpi">
              <Field label="Borç eşiği (₺)" error={fieldError(m.error, "debtor_restriction_min_amount")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={minAmount} onChange={(e) => set("minAmount", e.target.value)} />}</Field>
              <Field label="Gecikme eşiği (gün)" hint="0–365" error={fieldError(m.error, "debtor_restriction_min_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.debtor_restriction_min_days} onChange={num("debtor_restriction_min_days")} />}</Field>
            </div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Diğer</span></div>
        <div className="card__body grid grid--kpi">
          <Field label="Banka otomatik eşleşme">{(p) => <select {...p} className="field__input" value={v.bank_auto_match} onChange={(e) => set("bank_auto_match", e.target.value as Params["bank_auto_match"])}><option value="high">Yalnız yüksek güven (referans kodu, IBAN geçmişi)</option><option value="high_medium">Yüksek + orta (ad ve bölüm no)</option></select>}</Field>
          <Field label="Bütçe uyarı eşiği (%)" hint="Kategori bu orana ulaşınca uyarı" error={fieldError(m.error, "budget_warn_percent")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.budget_warn_percent} onChange={num("budget_warn_percent")} />}</Field>
        </div>
      </div>
      <div className="card">
        <div className="card__body row" style={{ gap: "var(--s-4)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Yürürlük dönemi" hint={financial ? `Finansal etkili değişiklik en erken ${plabel(d.earliest_financial_period)}` : "Finansal etkisi olmayan değişiklik bu aydan geçerli olabilir"} error={fieldError(m.error, "effective_period")}>
            {(p) => <select {...p} className="field__input" value={period} onChange={(e) => setPeriod(e.target.value)}>{[...new Set(periods)].filter((x) => !financial || x >= d.earliest_financial_period).map((x) => <option key={x} value={x}>{plabel(x)}</option>)}</select>}
          </Field>
          <span className="small muted" style={{ paddingBottom: "var(--s-3)" }}>{changed.length ? `Değişen: ${changed.map((k) => LABELS[k]).join(", ")}` : "Değişiklik yok"}</span>
          <SubmitButton busy={m.isPending} disabled={changed.length === 0}>Kaydet</SubmitButton>
        </div>
        <div className="card__foot small muted">Finansal etkili değişiklik "Finans parametresi" onay kuralı varsa onaya gider; onaylanınca seçilen dönemden geçerli olur.</div>
      </div>
    </form>
  );
}
