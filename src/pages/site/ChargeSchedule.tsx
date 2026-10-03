import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Alert, Field, FormError, SubmitButton, fieldError } from "../../components/ui";
import { formatDate } from "../../lib/format";

/** `GET …/charge-schedule` (servis isteği 04, backend #27). `last_run.run_id` atlanan çalışmada null. */
export type Schedule = Schemas["ScheduleOut"];

/**
 * Otomatik aylık tahakkuk (Apsiyon "Otomatik Borçlandırma" karşılığı). Backend her ay seçilen
 * günde, elle kaydetmeyle AYNI kurallarla tahakkuku keser; dönem zaten kesilmişse atlar.
 */
export function ChargeSchedule() {
  const q = useSiteGet<Schedule>("/charge-schedule");
  const [f, setF] = useState({ enabled: false, charge_day: "1", due_days: "14", notify_on_run: true });
  useEffect(() => {
    if (q.data) setF({ enabled: q.data.enabled, charge_day: String(q.data.charge_day), due_days: String(q.data.due_days), notify_on_run: q.data.notify_on_run });
  }, [q.data]);
  const m = useSiteMutation<Record<string, unknown>, Schedule>("PUT", "/charge-schedule");

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ enabled: f.enabled, charge_day: Number(f.charge_day), due_days: Number(f.due_days), notify_on_run: f.notify_on_run });
  }

  const last = q.data?.last_run;
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
            <span className="small muted">Kesinleşmiş işletme projesine göre, elle kaydetmeyle aynı kurallarla. Dönem zaten kesilmişse o ay atlanır.</span>
          </span>
        </label>
        {f.enabled && (
          <div className="grid grid--kpi">
            <Field label="Ayın kaçında" hint="1–28 (her ayda olsun diye)." error={fieldError(m.error, "charge_day")}>
              {(p) => <input {...p} className="field__input" inputMode="numeric" value={f.charge_day} onChange={(e) => setF((x) => ({ ...x, charge_day: e.target.value.replace(/\D/g, "") }))} />}
            </Field>
            <Field label="Vade (gün)" hint="Tahakkuktan kaç gün sonra son ödeme." error={fieldError(m.error, "due_days")}>
              {(p) => <input {...p} className="field__input" inputMode="numeric" value={f.due_days} onChange={(e) => setF((x) => ({ ...x, due_days: e.target.value.replace(/\D/g, "") }))} />}
            </Field>
            <label className="check" style={{ alignSelf: "end", minHeight: 44 }}>
              <input type="checkbox" checked={f.notify_on_run} onChange={(e) => setF((x) => ({ ...x, notify_on_run: e.target.checked }))} /> Kesilince yöneticilere bildir
            </label>
          </div>
        )}
        {last && (
          <Alert tone={last.status === "failed" ? "danger" : last.status === "skipped" ? "warn" : "ok"} title={`Son çalışma: ${last.period}`}>
            {formatDate(last.ran_at.slice(0, 10))} · {last.status === "posted" ? "Kesildi" : last.status === "skipped" ? "Atlandı" : "Başarısız"}
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
