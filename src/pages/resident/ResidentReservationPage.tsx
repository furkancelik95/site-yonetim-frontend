import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CalendarCheck } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, Money, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDate, formatDateTime, todayIso } from "../../lib/format";
import { resStatus, resTone } from "../../lib/labels";
import { RulesSummary, SlotPicker, type ResArea } from "../site/ReservationPages";

type MyRes = Schemas["ResidentReservationOut"];
type MyWait = Schemas["WaitlistEntryOut"];
type Mine = Schemas["ResidentReservationsOut"];
type Availability = Schemas["ResidentAvailabilityOut"];

/** Rezervasyon (REZ-02, sakin): alan ve saat seçimi, dolu saatte bekleme listesi, rezervasyonlarım (kod/QR), iptal, bekleme teklifi. */
export function ResidentReservationPage() {
  useDocumentTitle("Rezervasyon");
  const areas = useSiteGet<ResArea[]>("/resident/reservable-areas");
  const mine = useSiteGet<Mine>("/resident/reservations", undefined, { refetchInterval: 60000 });
  const [areaId, setAreaId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [start, setStart] = useState("");
  const [people, setPeople] = useState("2");
  const [guests, setGuests] = useState("0");
  const area = (areas.data ?? []).find((a) => a.id === areaId) ?? areas.data?.[0];
  const av = useSiteGet<Availability>(`/resident/reservable-areas/${area?.id}/availability`, { date }, { enabled: !!area });
  const slot = av.data?.slots.find((s) => s.start === start);
  const full = !!slot && slot.taken >= slot.capacity;
  const m = useSiteMutation<Record<string, unknown>, Schemas["BookingOut"]>("POST", "/resident/reservations", { money: true, onSuccess: () => setStart("") });
  const blocked = !!av.data?.blocked_until || !!av.data?.debt_block;
  const upcoming = (mine.data?.reservations ?? []).filter((r) => ["pending", "approved", "checked_in"].includes(r.status) && r.date >= todayIso());
  const past = (mine.data?.reservations ?? []).filter((r) => !upcoming.includes(r)).slice(0, 8);
  return (
    <>
      {mine.isError && <ErrorState error={mine.error} />}
      {(mine.data?.waitlist ?? []).map((w) => <WaitCard key={w.id} w={w} />)}
      {upcoming.length > 0 && <div className="section-title">Yaklaşan rezervasyonlarım</div>}
      {upcoming.map((r) => <ResCard key={r.id} r={r} />)}
      <div className="section-title">Yeni rezervasyon</div>
      {areas.isPending ? <Loading /> : areas.isError ? <ErrorState error={areas.error} /> : !area ? <Empty title="Rezervasyona açık alan yok" icon={<CalendarCheck aria-hidden="true" />} /> : (
        <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ area_id: area.id, date, start, people: Number(people), guests: Number(guests), waitlist: full }); }}>
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <FormError error={m.error} />
            <Field label="Alan">{(p) => <select {...p} className="field__input" value={area.id} onChange={(e) => { setAreaId(e.target.value); setStart(""); }}>{areas.data.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
            <RulesSummary r={area.rules} />
            {av.data?.blocked_until && <div className="alert alert--danger" role="alert">Gelinmeyen rezervasyonlarınız nedeniyle {formatDate(av.data.blocked_until)} tarihine kadar bu alanı rezerve edemezsiniz.</div>}
            {av.data?.debt_block && <div className="alert alert--danger" role="alert">{av.data.debt_block}</div>}
            <Field label="Tarih" error={fieldError(m.error, "date")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={date} onChange={(e) => { setDate(e.target.value); setStart(""); }} />}</Field>
            <SlotPicker slots={av.data?.slots} value={start} onChange={setStart} error={fieldError(m.error, "start")} allowFull={area.rules.waitlist} />
            <div className="grid grid--2">
              <Field label="Kişi" error={fieldError(m.error, "people")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, ""))} />}</Field>
              <Field label="Misafir" error={fieldError(m.error, "guests")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value.replace(/\D/g, ""))} />}</Field>
            </div>
            {full && <p className="small mb-0">Bu saat dolu. Bekleme listesine girerseniz yer açıldığında size {area.rules.waitlist_minutes} dakika geçerli teklif gelir.</p>}
            <SubmitButton busy={m.isPending} disabled={!start || blocked}>{full ? "Bekleme listesine gir" : area.rules.approval === "manual" ? "Rezervasyon iste" : "Rezervasyon yap"}</SubmitButton>
          </div>
        </form>
      )}
      {past.length > 0 && <div className="section-title">Geçmiş</div>}
      {past.map((r) => (
        <div key={r.id} className="r-item"><div style={{ flex: 1, minWidth: 0 }}>
          <div className="r-item__title">{r.area_name} <Badge tone={resTone(r.status)}>{resStatus(r.status)}</Badge></div>
          <div className="r-item__meta">{formatDate(r.date)} {r.start}–{r.end}{Number(r.fee) > 0 && <> · <Money value={r.fee} />{r.fee_refunded && " (iade edildi)"}</>}{r.reject_reason && ` · ${r.reject_reason}`}{r.status === "cancelled" && r.cancelled_late && Number(r.fee) > 0 && " · geç iptal"}</div>
        </div></div>
      ))}
    </>
  );
}

function ResCard({ r }: { r: MyRes }) {
  const [qr, setQr] = useState<string>();
  const show = r.status === "approved" && r.verify !== "none" && r.verify !== "staff";
  useEffect(() => { if (show && r.verify === "qr") QRCode.toDataURL(`SY-REZ:${r.code}`, { width: 200, margin: 1 }).then(setQr); }, [show, r.verify, r.code]);
  const cancel = useSiteMutation<Record<string, never>, unknown>("POST", `/resident/reservations/${r.id}/cancel`);
  const late = new Date(`${r.date}T${r.start}:00`).getTime() - Date.now() < r.cancel_hours * 3600000;
  return (
    <div className="card"><div className="card__body stack" style={{ gap: "var(--s-2)" }}>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}><span className="strong">{r.area_name}</span><Badge tone={resTone(r.status)}>{resStatus(r.status)}</Badge></div>
      <div className="small">{formatDate(r.date)} · {r.start}–{r.end} · {r.people} kişi{r.guests > 0 && ` + ${r.guests} misafir`}{Number(r.fee) > 0 && <> · <Money value={r.fee} /></>}{r.channel === "staff" && <span className="muted"> · {r.created_by} sizin adınıza açtı</span>}</div>
      {show && (
        <div className="row" style={{ gap: "var(--s-3)", alignItems: "center" }}>
          {qr && <img src={qr} alt={`Rezervasyon QR kodu, kod ${r.code}`} width={120} height={120} style={{ borderRadius: 8 }} />}
          <div><div className="xs muted">Girişte görevliye söyleyin{r.verify === "qr" && " ya da QR'ı okutun"}</div><div className="mono strong" style={{ fontSize: "1.5rem", letterSpacing: "0.2em" }}>{r.code}</div></div>
        </div>
      )}
      {r.status === "checked_in" && <div className="small">Girişiniz kaydedildi.</div>}
      <FormError error={cancel.error} />
      {["pending", "approved"].includes(r.status) && (
        <div><ConfirmButton className="btn btn--sm btn--ghost" title="Rezervasyonu iptal et" confirmLabel="İptal et" danger
          body={<p className="mb-0">{r.area_name}, {formatDate(r.date)} {r.start}.{Number(r.fee) > 0 && (late ? ` Son iptal süresi (${r.cancel_hours} saat) geçti; ücret iade edilmeyebilir.` : " Ücret borcunuzdan düşülür.")}</p>}
          onConfirm={() => cancel.mutateAsync({})}>İptal et</ConfirmButton></div>
      )}
    </div></div>
  );
}

function WaitCard({ w }: { w: MyWait }) {
  const accept = useSiteMutation<Record<string, never>, unknown>("POST", `/resident/waitlist/${w.id}/accept`);
  const leave = useSiteMutation<Record<string, never>, unknown>("POST", `/resident/waitlist/${w.id}/leave`);
  const offered = w.status === "offered";
  return (
    <div className={`alert ${offered ? "alert--info" : ""}`} role={offered ? "alert" : undefined}>
      <div className="stack" style={{ gap: "var(--s-2)" }}>
        <div><strong>{offered ? "Yer açıldı!" : "Bekleme listesindesiniz"}</strong> {w.area_name}, {formatDate(w.date)} {w.start}–{w.end}{offered && w.offered_until && ` — ${formatDateTime(w.offered_until)} saatine kadar onaylayın.`}</div>
        <FormError error={accept.error ?? leave.error} />
        <div className="row" style={{ gap: "var(--s-2)" }}>
          {offered && <button className="btn btn--sm btn--primary" type="button" disabled={accept.isPending} onClick={() => accept.mutate({})}>Rezervasyonu al</button>}
          <button className="btn btn--sm btn--ghost" type="button" disabled={leave.isPending} onClick={() => leave.mutate({})}>Listeden çık</button>
        </div>
      </div>
    </div>
  );
}
