import { useEffect, useState, type FormEvent } from "react";
import { BellRing, CalendarRange, Hourglass, History, Landmark } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { Alert, Badge, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 33'teki şekiller. */
interface Params { reminder_days: number[]; demand_letter_day: number; proration: "monthly" | "daily"; diff_threshold_percent: number; bank_auto_match: "high" | "high_medium"; plan_tolerance_days: number; plan_suspends_late_fee: boolean; budget_warn_percent: number }
interface Version { id: string; effective_period: string; values: Params; changed: string[]; changed_by: string; created_at: string }
interface Resp { current: Params; current_period: string; earliest_financial_period: string; defaults: Params; versions: Version[]; scheduled: Version[] }

const LABELS: Record<keyof Params, string> = {
  reminder_days: "Hatırlatma kademeleri", demand_letter_day: "İhtarname hazırlığı", proration: "Kıst (ay ortası giriş/çıkış)", diff_threshold_percent: "Tahakkuk fark raporu eşiği",
  bank_auto_match: "Banka otomatik eşleşme", plan_tolerance_days: "Ödeme planı tolerans günü", plan_suspends_late_fee: "Plan süresince gecikme işlemez", budget_warn_percent: "Bütçe uyarı eşiği",
};
const FINANCIAL: (keyof Params)[] = ["proration", "plan_suspends_late_fee"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const plabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

/** Ortak kararı bekleyen parametreler: ekranda yalnız bilgi, değiştirilemez. */
const PENDING = [
  ["Aidat hesap yöntemi", "İşletme projesindeki dağıtım anahtarları (arsa payı, m², eşit…)", "K23 — aidat kuralı mı işletme projesi mi"],
  ["Gecikme yöntemi", "Gecikme tazminatı deftere işlenmiyor", "Hukuk — bileşik/tam ay seçenekleri, %5 üstü oran"],
  ["Mahsup sırası", "Aynı vadede önce gecikme tazminatı (TBK m.100)", "K24"],
  ["Vade ve dönem", "Kesim ayın 1'i, vade +14 gün (Tahakkuk › otomatik tahakkuk)", "K25"],
  ["Kart ile tahsilat, komisyon, taksit", "Kapalı — tahsilat havale/EFT ve elle giriş", "K1"],
  ["Ek toplama (taksitli)", "İşletme projesine ek kalem olarak", "K23 ile birlikte"],
] as const;

/**
 * Finans parametreleri (FIN-16): sitenin finans kuralları tek ekranda, yürürlük dönemiyle versiyonlu. Finansal etkili
 * parametre en erken sonraki dönemden geçerli olur; geçmiş dönem değişmez.
 */
export function FinanceSettingsPage() {
  const { can } = useSite();
  const q = useSiteGet<Resp>("/finance-parameters");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <div className="stack">
      <PageHead title="Finans ayarları" subtitle="Hatırlatma kademeleri, kıst, eşikler. Her değişiklik yürürlük dönemiyle kaydedilir; geçmiş dönemler değişmez." />
      <div className="grid grid--kpi rise">
        <Kpi label="Hatırlatma kademeleri" icon={<BellRing aria-hidden="true" />} value={q.data.current.reminder_days.join(" · ")} note="vadeden sonraki gün" />
        <Kpi label="Kıst yöntemi" icon={<CalendarRange aria-hidden="true" />} value={q.data.current.proration === "daily" ? "Gün bazlı" : "Ay bazlı"} small note={`yürürlükte: ${plabel(q.data.current_period)}`} />
        <Kpi label="Planlı değişiklik" tone={q.data.scheduled.length ? "accent" : undefined} icon={<History aria-hidden="true" />} value={q.data.scheduled.length} note={`${q.data.versions.length} sürüm kayıtlı`} />
        <Kpi label="Karar bekleyen" tone="warn" icon={<Hourglass aria-hidden="true" />} value={PENDING.length} note="ortak kararıyla açılacak" />
      </div>
      {q.data.scheduled.length > 0 && <Alert tone="info" title="Planlı değişiklik">{q.data.scheduled.map((v) => `${plabel(v.effective_period)}: ${v.changed.map((k) => LABELS[k as keyof Params] ?? k).join(", ")}`).join(" · ")}</Alert>}
      {can(P.chargePost) ? <ParamsForm d={q.data} /> : <Alert tone="info">Parametreleri yalnız site yöneticisi ve muhasebe değiştirir.</Alert>}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--warn"><Hourglass aria-hidden="true" /></span><span className="card__title">Ortak kararı bekleyen ayarlar</span><span className="card__meta ml-auto">şimdilik değiştirilemez</span></div>
        <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
          <caption className="visually-hidden">Karar bekleyen finans ayarları</caption>
          <thead><tr><th scope="col">Ayar</th><th scope="col">Şu an</th><th scope="col">Bekleyen karar</th></tr></thead>
          <tbody>{PENDING.map(([a, b, c]) => <tr key={a}><td className="cell-main">{a}</td><td className="small">{b}</td><td className="small"><Badge tone="warn">{c}</Badge></td></tr>)}</tbody>
        </table></div></div>
      </div>
      {q.data.versions.length > 0 && (
        <div className="card">
          <div className="card__head"><span className="card__icon"><History aria-hidden="true" /></span><span className="card__title">Değişiklik geçmişi</span></div>
          <div className="card__body card__body--flush"><div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Parametre sürümleri</caption>
            <thead><tr><th scope="col">Yürürlük</th><th scope="col">Değişen</th><th scope="col">Yapan</th></tr></thead>
            <tbody>{q.data.versions.map((v) => <tr key={v.id}><td className="small nowrap">{plabel(v.effective_period)}{v.effective_period > q.data.current_period && <> <Badge tone="info">Planlı</Badge></>}</td><td className="small">{v.changed.map((k) => LABELS[k as keyof Params] ?? k).join(", ")}</td><td className="small">{v.changed_by}<div className="cell-sub">{formatDateTime(v.created_at)}</div></td></tr>)}</tbody>
          </table></div></div>
        </div>
      )}
    </div>
  );
}

function ParamsForm({ d }: { d: Resp }) {
  const [v, setV] = useState<Params>(d.current);
  const [days, setDays] = useState(d.current.reminder_days.map(String));
  const [period, setPeriod] = useState(d.current_period);
  useEffect(() => { setV(d.current); setDays(d.current.reminder_days.map(String)); }, [d.current]);
  const m = useSiteMutation<{ effective_period: string; values: Partial<Params> }, Version>("POST", "/finance-parameters/versions");
  const next: Params = { ...v, reminder_days: days.map(Number) };
  const changed = (Object.keys(next) as (keyof Params)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(d.current[k]));
  const financial = changed.some((k) => FINANCIAL.includes(k));
  useEffect(() => { if (financial && period < d.earliest_financial_period) setPeriod(d.earliest_financial_period); }, [financial]);
  const num = (k: keyof Params) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) }));
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ effective_period: period, values: next }); }
  const periods = [d.current_period, d.earliest_financial_period, ...[1, 2].map((i) => { const x = new Date(d.earliest_financial_period + "-01T00:00:00"); x.setMonth(x.getMonth() + i); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; })];
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError error={m.error} />
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--danger"><BellRing aria-hidden="true" /></span><span className="card__title">Borç takibi</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Hatırlatma kademeleri (vadeden sonraki gün)</legend>
            <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
              {["Uygulama bildirimi", "SMS", "Yönetici araması"].map((l, i) => (
                <div className="field" key={l}><label className="field__label" htmlFor={`rd-${i}`}>{l}</label><input id={`rd-${i}`} className="field__input" style={{ width: "6rem" }} inputMode="numeric" value={days[i]} onChange={(e) => setDays((x) => x.map((y, j) => (j === i ? e.target.value.replace(/\D/g, "").slice(0, 3) : y)))} /></div>
              ))}
            </div>
            {fieldError(m.error, "reminder_days") && <span className="field__error" role="alert">{fieldError(m.error, "reminder_days")}</span>}
            <span className="field__hint">Bildirim ve SMS gönderimi servisi gelince (K5) bu günlerde otomatik gider; şimdilik borç takibinde elle kaydedilir. Borçlu listesi sakin ekranlarında hiç görünmez.</span>
          </fieldset>
          <div className="grid grid--kpi">
            <Field label="İhtarname hazırlığı (gün)" hint="Son kademeden sonra" error={fieldError(m.error, "demand_letter_day")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.demand_letter_day} onChange={num("demand_letter_day")} />}</Field>
            <Field label="Ödeme planı tolerans günü" hint="Taksit vade + bu gün geçerse plan bozulur" error={fieldError(m.error, "plan_tolerance_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.plan_tolerance_days} onChange={num("plan_tolerance_days")} />}</Field>
          </div>
          <label className="check"><input type="checkbox" checked={v.plan_suspends_late_fee} onChange={(e) => setV((x) => ({ ...x, plan_suspends_late_fee: e.target.checked }))} /><span>Ödeme planına uyulduğu sürece yapılandırılan borca gecikme işlemez <span className="muted">(finansal etkili)</span></span></label>
        </div>
      </div>
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><Landmark aria-hidden="true" /></span><span className="card__title">Tahakkuk ve tahsilat</span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Kıst — ay ortası giriş/çıkışta aidat <span className="muted">(finansal etkili)</span></legend>
            <label className="check"><input type="radio" name="proration" checked={v.proration === "monthly"} onChange={() => setV((x) => ({ ...x, proration: "monthly" }))} /><span>Ay bazlı — başladığı ve bittiği ay tam sayılır</span></label>
            <label className="check"><input type="radio" name="proration" checked={v.proration === "daily"} onChange={() => setV((x) => ({ ...x, proration: "daily" }))} /><span>Gün bazlı — gün oranı uygulanır (ör. 15/31)</span></label>
          </fieldset>
          <div className="grid grid--kpi">
            <Field label="Fark raporu eşiği (%)" hint="Önceki döneme göre bu orandan fazla değişen hesap işaretlenir" error={fieldError(m.error, "diff_threshold_percent")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.diff_threshold_percent} onChange={num("diff_threshold_percent")} />}</Field>
            <Field label="Banka otomatik eşleşme">{(p) => <select {...p} className="field__input" value={v.bank_auto_match} onChange={(e) => setV((x) => ({ ...x, bank_auto_match: e.target.value as Params["bank_auto_match"] }))}><option value="high">Yalnız yüksek güven (referans kodu, IBAN geçmişi)</option><option value="high_medium">Yüksek + orta (ad ve bölüm no)</option></select>}</Field>
            <Field label="Bütçe uyarı eşiği (%)" hint="Kategori bu orana ulaşınca uyarı" error={fieldError(m.error, "budget_warn_percent")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={v.budget_warn_percent} onChange={num("budget_warn_percent")} />}</Field>
          </div>
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
        <div className="card__foot small muted">Parametre değişikliğinin onay mekanizmasına bağlanması ortak kararı bekliyor (K21).</div>
      </div>
    </form>
  );
}
