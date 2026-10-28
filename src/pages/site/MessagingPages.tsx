import { useEffect, useState, type FormEvent } from "react";
import { MessageSquare, Send } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, Forbidden, FormError, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { isTrMobile, toE164 } from "../../lib/input";
import { P, useSite } from "../../site/SiteContext";

type SmsAccount = Schemas["SmsAccountOut"];
type Usage = Schemas["SmsUsageOut"];
type Delivery = Schemas["DeliveryOut"];
type SmsTest = Schemas["SmsTestOut"];
type Comm = Schemas["CommunicationSettingsOut"];

const CHANNEL: Record<string, string> = { sms: "SMS", email: "E-posta", push: "Mobil bildirim" };
const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "info" | "muted"> = { sent: "ok", delivered: "ok", queued: "info", failed: "danger", skipped: "muted" };

/**
 * SMS hesabı ve kota (Yazılım Dokümanı ILT-05, §16.2): platform kotası ya da sitenin kendi
 * sağlayıcı hesabı, sessiz saatler, bu ayın kullanımı ve ay sonu tahmini, teslim kayıtları.
 * Sağlayıcı seçilene dek (K5) gönderim test sağlayıcısıyla: kayda geçer, dışarı gitmez.
 */
export function SmsAccountPage() {
  const { can } = useSite();
  if (!can(P.notificationsManage)) return <Forbidden />;
  return (
    <div className="stack">
      <PageHead title="SMS hesabı ve bildirim gönderimi" subtitle="SMS kotası, gönderici, sessiz saatler ve gönderilen mesajların teslim kaydı." />
      <Alert tone="info" title="Test sağlayıcısı (K5)">SMS/e-posta sağlayıcısı teklif aşamasında. O zamana kadar mesajlar gerçekteki gibi kayda geçer, adet ve kota işlenir, ama dışarı gönderilmez.</Alert>
      <UsageCard />
      <div className="grid grid--2">
        <AccountCard />
        <div className="stack">
          <QuietHoursCard />
          <TestSmsCard />
        </div>
      </div>
      <Deliveries />
    </div>
  );
}

function UsageCard() {
  const q = useSiteGet<Usage>("/settings/sms/usage");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const u = q.data;
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Bu ayın kullanımı</span><span className="card__meta">{u.month}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <div className="grid grid--kpi">
          <Kpi label="Kullanılan SMS" value={u.used.toLocaleString("tr-TR")} note={`${u.messages.toLocaleString("tr-TR")} mesaj`} tone={u.percent >= 100 ? "danger" : u.percent >= 80 ? "warn" : undefined} />
          <Kpi label="Aylık kota" value={u.quota.toLocaleString("tr-TR")} note={`%${u.percent} kullanıldı`} />
          <Kpi label="Kalan" value={u.remaining.toLocaleString("tr-TR")} note={u.overage > 0 ? `Aşım: ${u.overage.toLocaleString("tr-TR")} (faturaya yansır)` : undefined} tone={u.overage > 0 ? "danger" : undefined} />
          <Kpi label="Ay sonu tahmini" value={u.forecast.toLocaleString("tr-TR")} tone={u.forecast > u.quota ? "warn" : undefined} note={u.queued ? `${u.queued} mesaj kuyrukta` : undefined} />
        </div>
        <div role="progressbar" aria-label="Kota kullanımı" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, u.percent)} style={{ height: 8, background: "var(--bg-sunken)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, u.percent)}%`, height: "100%", background: u.percent >= 100 ? "var(--danger-solid)" : u.percent >= 80 ? "var(--warn-solid)" : "var(--accent)" }} />
        </div>
        {u.by_category.length > 0 && <p className="small mb-0">Konuya göre: {u.by_category.map((c) => `${c.label} ${c.units}`).join(" · ")}</p>}
        <p className="xs muted mb-0">Uzun ya da Türkçe karakterli mesaj birden çok SMS sayılır. Kota dolsa da gönderim durmaz; %{u.warn_percents.join(" ve %")} eşiklerinde yöneticiye bildirim gider.</p>
      </div>
    </div>
  );
}

function AccountCard() {
  const q = useSiteGet<SmsAccount>("/settings/sms");
  const [f, setF] = useState({ mode: "platform", sender: "", provider: "", api_key: "" });
  const save = useSiteMutation<Record<string, string | null>, SmsAccount>("PUT", "/settings/sms", { onSuccess: () => setF((x) => ({ ...x, api_key: "" })) });
  useEffect(() => {
    if (q.data) setF({ mode: q.data.mode, sender: q.data.sender ?? "", provider: q.data.provider ?? "", api_key: "" });
  }, [q.data]);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(f.mode === "platform" ? { mode: "platform" } : { mode: "own", sender: f.sender.trim(), provider: f.provider, api_key: f.api_key.trim() || null });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__icon card__icon--info"><MessageSquare aria-hidden="true" /></span><span className="card__title">SMS hesabı</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={save.error} />
        <fieldset className="stack" style={{ gap: "var(--s-2)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Hesap</legend>
          <label className="check"><input type="radio" name="sms-mode" checked={f.mode === "platform"} onChange={() => setF((x) => ({ ...x, mode: "platform" }))} /> Platform hesabı (paket kotası, başlık <span className="mono">{a.platform_sender}</span>)</label>
          <label className="check"><input type="radio" name="sms-mode" checked={f.mode === "own"} onChange={() => setF((x) => ({ ...x, mode: "own" }))} /> Sitenin kendi sağlayıcı hesabı</label>
        </fieldset>
        {f.mode === "own" && (
          <>
            <Field label="Sağlayıcı" required error={fieldError(save.error, "provider")}>
              {(p) => <select {...p} className="field__input" value={f.provider} onChange={(e) => setF((x) => ({ ...x, provider: e.target.value }))}><option value="">Seçin</option>{a.providers.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</select>}
            </Field>
            <Field label="Gönderici başlığı" required hint="3–11 karakter; sağlayıcıda onaylı başlık" error={fieldError(save.error, "sender")}>
              {(p) => <input {...p} className="field__input" maxLength={11} value={f.sender} onChange={(e) => setF((x) => ({ ...x, sender: e.target.value }))} />}
            </Field>
            <Field label="API anahtarı" required={!a.api_key_last4} hint={a.api_key_last4 ? `Kayıtlı anahtar: ••••${a.api_key_last4} — boş bırakırsanız korunur` : "Şifreli saklanır; ekranda yalnız son 4 karakter görünür"} error={fieldError(save.error, "api_key")}>
              {(p) => <input {...p} className="field__input" type="password" autoComplete="off" value={f.api_key} onChange={(e) => setF((x) => ({ ...x, api_key: e.target.value }))} />}
            </Field>
          </>
        )}
        <div className="kv"><span className="kv__k">Aylık kota</span><span className="kv__v">{a.monthly_quota.toLocaleString("tr-TR")} SMS {a.quota_source === "platform" ? "(paket)" : "(siteye özel)"}</span></div>
      </div>
      <div className="card__foot"><SubmitButton busy={save.isPending}>Kaydet</SubmitButton></div>
    </form>
  );
}

function QuietHoursCard() {
  const q = useSiteGet<Comm>("/communication-settings");
  const [f, setF] = useState<Comm>({ quiet_from: "22:00", quiet_to: "08:00" });
  const save = useSiteMutation<Comm, Comm>("PUT", "/communication-settings");
  useEffect(() => {
    if (q.data) setF(q.data);
  }, [q.data]);
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); save.mutate(f); }}>
      <div className="card__head"><span className="card__title">Sessiz saatler</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={save.error} />
        <div className="grid grid--2">
          <Field label="Başlangıç" error={fieldError(save.error, "quiet_from")}>{(p) => <input {...p} className="field__input" type="time" value={f.quiet_from} onChange={(e) => setF((x) => ({ ...x, quiet_from: e.target.value }))} />}</Field>
          <Field label="Bitiş" error={fieldError(save.error, "quiet_to")}>{(p) => <input {...p} className="field__input" type="time" value={f.quiet_to} onChange={(e) => setF((x) => ({ ...x, quiet_to: e.target.value }))} />}</Field>
        </div>
        <p className="xs muted mb-0">Bu saatlerde push, SMS ve e-posta gönderilmez, bitişte gider. Acil bildirim aşar.</p>
      </div>
      <div className="card__foot"><SubmitButton busy={save.isPending}>Kaydet</SubmitButton></div>
    </form>
  );
}

function TestSmsCard() {
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string>();
  const [result, setResult] = useState<SmsTest | null>(null);
  const m = useSiteMutation<{ phone: string | null }, SmsTest>("POST", "/settings/sms/test", { onSuccess: (d) => d && setResult(d) });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (phone && !isTrMobile(phone)) return setErr("Cep telefonu 5 ile başlayan 10 hane olmalı.");
    setErr(undefined);
    m.mutate({ phone: phone ? toE164(phone) : null });
  }
  return (
    <form className="card" noValidate onSubmit={submit}>
      <div className="card__head"><span className="card__title">Test SMS'i</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <Field label="Telefon" hint="Boş bırakırsanız hesabınızdaki numaraya gider" error={err ?? fieldError(m.error, "phone")}>
          {(p) => <input {...p} className="field__input" type="tel" inputMode="tel" placeholder="5XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
        {result && <p className="small mb-0">{result.recipient}: <Badge tone={STATUS_TONE[result.status]}>{result.status === "sent" ? "Gönderildi (test)" : result.status}</Badge> · {result.segments} SMS</p>}
      </div>
      <div className="card__foot"><SubmitButton busy={m.isPending}><Send aria-hidden="true" /> Gönder</SubmitButton></div>
    </form>
  );
}

function Deliveries() {
  const [s, set] = useUrlState({ kanal: "", durum: "", page: "1" });
  const q = useSiteGet<Page<Delivery>>("/notification-deliveries", { channel: s.kanal, status: s.durum, page: s.page, page_size: 30 });
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Teslim kayıtları</span>
        <span className="ml-auto row" style={{ gap: "var(--s-2)" }}>
          <select aria-label="Kanal" className="field__input" style={{ width: "auto", minHeight: 36 }} value={s.kanal} onChange={(e) => set({ kanal: e.target.value, page: "1" })}>
            <option value="">Tüm kanallar</option>{Object.entries(CHANNEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select aria-label="Durum" className="field__input" style={{ width: "auto", minHeight: 36 }} value={s.durum} onChange={(e) => set({ durum: e.target.value, page: "1" })}>
            <option value="">Tüm durumlar</option><option value="queued">Kuyrukta</option><option value="sent">Gönderildi</option><option value="failed">Başarısız</option>
          </select>
        </span>
      </div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Gönderim kaydı yok" /> : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Bildirim teslim kayıtları</caption>
              <thead><tr><th scope="col">Zaman</th><th scope="col">Kanal</th><th scope="col">Alıcı</th><th scope="col">Mesaj</th><th scope="col">Durum</th><th scope="col" className="right">SMS</th></tr></thead>
              <tbody>
                {q.data.items.map((d) => (
                  <tr key={d.id}>
                    <td className="small nowrap">{formatDateTime(d.sent_at ?? d.scheduled_for)}{d.deferred && <div className="cell-sub">sessiz saat</div>}</td>
                    <td className="small">{CHANNEL[d.channel] ?? d.channel}{d.is_critical && <> <Badge tone="danger">Kritik</Badge></>}{d.is_fallback && <> <Badge tone="info">Yedek</Badge></>}</td>
                    <td className="mono small">{d.recipient}</td>
                    <td className="small" style={{ maxWidth: 360 }}>{d.subject && <div className="strong">{d.subject}</div>}<div className="cell-sub">{d.body}</div></td>
                    <td><Badge tone={STATUS_TONE[d.status] ?? "muted"}>{d.status_label}</Badge>{d.error && <div className="cell-sub">{d.error}</div>}</td>
                    <td className="right num">{d.cost_units || "—"}{d.is_overage && <div className="cell-sub">aşım</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {q.data && q.data.total > q.data.page_size && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
    </div>
  );
}

// ============================================================ Planlı raporlar (RAP-05)

type Scheduled = Schemas["ScheduledReportOut"];
type Options = Schemas["ScheduledReportOptionsOut"];
type Run = Schemas["ScheduledReportRunOut"];
const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const EMPTY = { name: "", report_key: "", frequency: "monthly", weekday: "0", day_of_month: "1", send_time: "08:30", format: "pdf", recipients: [] as string[] };

/**
 * Planlı raporlar (RAP-05): rapor, periyot, saat, alıcılar (yalnız raporun verisine yetkili site
 * kullanıcıları), format. Zamanı gelince e-postayla gider; "Şimdi gönder" elle tetikler. Rapor
 * içerikleri sonra bağlanacak; e-posta şimdilik dönem ve panel bağlantısını taşır.
 */
export function ScheduledReports() {
  const list = useSiteGet<Page<Scheduled>>("/scheduled-reports", { page_size: 50 });
  const opts = useSiteGet<Options>("/scheduled-reports/options");
  const [editing, setEditing] = useState<Scheduled | "new" | null>(null);
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Planlı raporlar</span>
        <button className="btn btn--sm ml-auto" type="button" onClick={() => setEditing(editing ? null : "new")}>{editing ? "Kapat" : "Yeni planlı rapor"}</button>
      </div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {editing && opts.data && <ScheduleForm options={opts.data} report={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} /> : list.data.items.length === 0 ? (
          <Empty title="Planlı rapor yok">Raporları belirli günlerde yetkili kişilere e-postayla gönderin.</Empty>
        ) : list.data.items.map((r) => <ScheduleRow key={r.id} r={r} onEdit={() => setEditing(r)} />)}
        <p className="xs muted mb-0">E-posta sağlayıcısı seçilene dek (K5) gönderim test sağlayıcısıyla yapılır: kayda geçer, dışarı gitmez.</p>
      </div>
    </div>
  );
}

function when(r: Scheduled) {
  const day = r.frequency === "weekly" ? `${WEEKDAYS[r.weekday ?? 0]} ` : r.frequency === "monthly" ? `her ayın ${r.day_of_month}. günü ` : "her gün ";
  return `${r.frequency_label}: ${day}${r.send_time}`;
}

function ScheduleRow({ r, onEdit }: { r: Scheduled; onEdit: () => void }) {
  const run = useSiteMutation<Record<string, never>, Run>("POST", `/scheduled-reports/${r.id}/run`);
  const remove = useSiteMutation<string, undefined>("DELETE", () => `/scheduled-reports/${r.id}`);
  const [showRuns, setShowRuns] = useState(false);
  return (
    <div className="kv" style={{ alignItems: "flex-start", opacity: r.is_active ? 1 : 0.6 }}>
      <span className="kv__k">
        <span className="strong">{r.name}</span> {!r.is_active && <Badge>Pasif</Badge>}
        <div className="small muted">{r.report_label} · {when(r)} · {r.format.toLocaleUpperCase("tr-TR")}</div>
        <div className="small">Alıcılar: {r.recipients.map((x) => x.full_name).join(", ")}</div>
        <div className="xs muted">Sonraki: {formatDateTime(r.next_run_at)}{r.last_run_at ? ` · son: ${formatDateTime(r.last_run_at)}` : ""}</div>
        {showRuns && <Runs id={r.id} />}
      </span>
      <span className="kv__v row" style={{ gap: "var(--s-1)", justifyContent: "flex-end" }}>
        <button className="btn btn--ghost btn--sm" type="button" disabled={run.isPending} onClick={() => run.mutate({})}><Send aria-hidden="true" /> Şimdi gönder</button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => setShowRuns((v) => !v)}>Geçmiş</button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onEdit}>Düzenle</button>
        {r.is_active && <ConfirmButton className="btn btn--ghost btn--sm" title="Planlı raporu durdur" confirmLabel="Durdur" body="Rapor artık gönderilmez; geçmiş kayıtlar korunur." onConfirm={() => remove.mutateAsync(r.id)}>Durdur</ConfirmButton>}
      </span>
    </div>
  );
}

function Runs({ id }: { id: string }) {
  const q = useSiteGet<Page<Run>>(`/scheduled-reports/${id}/runs`, { page_size: 10 });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.items.length === 0) return <p className="xs muted mb-0">Henüz gönderilmedi.</p>;
  return (
    <ul className="xs" style={{ margin: "4px 0 0", paddingLeft: "1.2em" }}>
      {q.data.items.map((x) => <li key={x.id}>{formatDateTime(x.run_at)} · {x.period_label} · {x.status === "sent" ? `${x.recipient_count} alıcı` : x.error ?? x.status}</li>)}
    </ul>
  );
}

function ScheduleForm({ options, report, onDone }: { options: Options; report: Scheduled | null; onDone: () => void }) {
  const [f, setF] = useState(() =>
    report
      ? { name: report.name, report_key: report.report_key, frequency: report.frequency, weekday: String(report.weekday ?? 0), day_of_month: String(report.day_of_month ?? 1), send_time: report.send_time, format: report.format, recipients: report.recipients.map((x) => x.user_id) }
      : { ...EMPTY, report_key: options.kinds[0]?.key ?? "" },
  );
  const m = useSiteMutation<Record<string, unknown>, Scheduled>(report ? "PUT" : "POST", report ? `/scheduled-reports/${report.id}` : "/scheduled-reports", { onSuccess: onDone });
  const candidates = options.recipients[f.report_key] ?? [];
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      name: f.name.trim(),
      report_key: f.report_key,
      frequency: f.frequency,
      weekday: f.frequency === "weekly" ? Number(f.weekday) : null,
      day_of_month: f.frequency === "monthly" ? Number(f.day_of_month) : null,
      send_time: f.send_time,
      format: f.format,
      recipient_user_ids: f.recipients,
      is_active: true,
    });
  }
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} onSubmit={submit} noValidate>
      <FormError error={m.error} />
      <div className="grid grid--2">
        <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={120} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
        <Field label="Rapor" required error={fieldError(m.error, "report_key")}>{(p) => <select {...p} className="field__input" value={f.report_key} onChange={(e) => setF((x) => ({ ...x, report_key: e.target.value, recipients: [] }))}>{options.kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>}</Field>
        <Field label="Periyot">{(p) => <select {...p} className="field__input" value={f.frequency} onChange={(e) => setF((x) => ({ ...x, frequency: e.target.value as typeof x.frequency }))}><option value="daily">Günlük</option><option value="weekly">Haftalık</option><option value="monthly">Aylık</option></select>}</Field>
        {f.frequency === "weekly" && <Field label="Gün" error={fieldError(m.error, "weekday")}>{(p) => <select {...p} className="field__input" value={f.weekday} onChange={(e) => setF((x) => ({ ...x, weekday: e.target.value }))}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>}</Field>}
        {f.frequency === "monthly" && <Field label="Ayın günü" hint="1–28" error={fieldError(m.error, "day_of_month")}>{(p) => <input {...p} className="field__input" type="number" min={1} max={28} value={f.day_of_month} onChange={(e) => setF((x) => ({ ...x, day_of_month: e.target.value }))} />}</Field>}
        <Field label="Saat" error={fieldError(m.error, "send_time")}>{(p) => <input {...p} className="field__input" type="time" value={f.send_time} onChange={(e) => setF((x) => ({ ...x, send_time: e.target.value }))} />}</Field>
        <Field label="Format">{(p) => <select {...p} className="field__input" value={f.format} onChange={(e) => setF((x) => ({ ...x, format: e.target.value as typeof x.format }))}><option value="pdf">PDF</option><option value="xlsx">Excel</option></select>}</Field>
      </div>
      <fieldset className="stack" style={{ gap: 4, border: 0, padding: 0, margin: 0 }} aria-describedby="sr-rec-hint">
        <legend className="field__label">Alıcılar *</legend>
        <span id="sr-rec-hint" className="field__hint">Yalnız bu raporun verisine yetkili kullanıcılar listelenir.</span>
        {candidates.length === 0 ? <span className="small muted">Bu rapora yetkili kullanıcı yok.</span> : candidates.map((c) => (
          <label key={c.user_id} className="check">
            <input type="checkbox" checked={f.recipients.includes(c.user_id)} onChange={(e) => setF((x) => ({ ...x, recipients: e.target.checked ? [...x.recipients, c.user_id] : x.recipients.filter((i) => i !== c.user_id) }))} />
            {c.full_name}{!c.has_email && <span className="xs muted"> (e-postası yok)</span>}
          </label>
        ))}
        {fieldError(m.error, "recipient_user_ids") && <span className="field__error" role="alert">{fieldError(m.error, "recipient_user_ids")}</span>}
      </fieldset>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.name || f.recipients.length === 0}>{report ? "Kaydet" : "Planla"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
