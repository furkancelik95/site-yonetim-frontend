import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { CalendarClock } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Field, FormError, SubmitButton, fieldError } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { scheduleRunStatus, scheduleRunTone } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

/** `GET …/charge-schedule` (servis isteği 04; P03b). `last_run.run_id` atlanan çalışmada null. */
export type Schedule = Schemas["ScheduleOut"];
type ScheduleBody = Schemas["ScheduleIn"];

/**
 * Otomatik aylık tahakkuk (Apsiyon "Otomatik Borçlandırma" karşılığı). Backend her ay seçilen
 * günde, elle kaydetmeyle AYNI kurallarla tahakkuku keser; dönem zaten kesilmişse atlar.
 * Vade günü Finans ayarlarından gelir (K25). "Tahakkuk" onay kuralı varsa taslak kesimden
 * `draft_lead_days` gün önce hazırlanıp onaya gider; onaylanınca kesim gününde kesinleşir (FIN-05).
 */
export function ChargeSchedule() {
  const { site } = useSite();
  const q = useSiteGet<Schedule>("/charge-schedule");
  const [f, setF] = useState({ enabled: false, charge_day: "1", draft_lead_days: "5", notify_on_run: true });
  useEffect(() => {
    if (q.data) setF({ enabled: q.data.enabled, charge_day: String(q.data.charge_day), draft_lead_days: String(q.data.draft_lead_days), notify_on_run: q.data.notify_on_run });
  }, [q.data]);
  const m = useSiteMutation<ScheduleBody, Schedule>("PUT", "/charge-schedule");

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ enabled: f.enabled, charge_day: Number(f.charge_day), draft_lead_days: Number(f.draft_lead_days), notify_on_run: f.notify_on_run });
  }

  const last = q.data?.last_run;
  const approval = q.data?.approval_required ?? false;
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head">
        <span className="card__icon card__icon--info"><CalendarClock aria-hidden="true" /></span>
        <span className="card__title">Otomatik aylık tahakkuk</span>
        <span className="ml-auto row" style={{ gap: "var(--s-2)" }}>
          {q.data?.enabled && q.data.next_run_on && <span className="card__meta">sıradaki: {formatDate(q.data.next_run_on)}</span>}
        </span>
      </div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <label className="check check--rich">
          <input type="checkbox" checked={f.enabled} onChange={(e) => setF((x) => ({ ...x, enabled: e.target.checked }))} />
          <span>
            <span className="strong">Her ay kendiliğinden kes</span>
            <br />
            <span className="small muted">Finans ayarlarında seçilen tahakkuk kaynağına göre, elle kaydetmeyle aynı kurallarla. Dönem zaten kesilmişse o ay atlanır.</span>
          </span>
        </label>
        {f.enabled && (
          <div className="grid grid--kpi">
            <Field label="Ayın kaçında" hint="1–28 (her ayda olsun diye)." error={fieldError(m.error, "charge_day")}>
              {(p) => <input {...p} className="field__input" inputMode="numeric" value={f.charge_day} onChange={(e) => setF((x) => ({ ...x, charge_day: e.target.value.replace(/\D/g, "").slice(0, 2) }))} />}
            </Field>
            {approval && (
              <Field label="Taslak kaç gün önce" hint="0–15; taslak kesim gününden bu kadar önce hazırlanıp onaya gider." error={fieldError(m.error, "draft_lead_days")}>
                {(p) => <input {...p} className="field__input" inputMode="numeric" value={f.draft_lead_days} onChange={(e) => setF((x) => ({ ...x, draft_lead_days: e.target.value.replace(/\D/g, "").slice(0, 2) }))} />}
              </Field>
            )}
            <label className="check" style={{ alignSelf: "end", minHeight: 44 }}>
              <input type="checkbox" checked={f.notify_on_run} onChange={(e) => setF((x) => ({ ...x, notify_on_run: e.target.checked }))} /> Kesilince yöneticilere bildir
            </label>
          </div>
        )}
        {q.data && (
          <p className="small muted mb-0">
            Vade: ayın {q.data.due_day}'i (<Link to={`/s/${site.slug}/ayarlar/finans`}>Finans ayarları</Link>).
          </p>
        )}
        {approval && (
          <Alert tone="info" title="Tahakkuk onay kuralı var">
            Taslak kesimden {f.draft_lead_days || q.data?.draft_lead_days} gün önce hazırlanıp onaya gider; onaylanınca kesim gününde kesinleşir.
          </Alert>
        )}
        {last && (
          <Alert tone={scheduleRunTone(last.status)} title={`Son çalışma: ${last.period}`}>
            {formatDate(last.ran_at.slice(0, 10))} · {scheduleRunStatus(last.status)}
            {last.message ? ` — ${last.message}` : ""}
          </Alert>
        )}
      </div>
      <div className="card__foot">
        <SubmitButton busy={m.isPending} className="btn">Ayarı kaydet</SubmitButton>
      </div>
    </form>
  );
}
