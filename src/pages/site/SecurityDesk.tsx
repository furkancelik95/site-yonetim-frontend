import { useState, type FormEvent } from "react";
import { BookOpen, Car, CheckCircle2, KeyRound, LogIn, LogOut, PackageX, Route, ShieldAlert, UserRoundPlus } from "lucide-react";
import { ApiError } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Badge, ConfirmButton, Empty, Field, FormError, Loading, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, todayIso } from "../../lib/format";
import { plateInput } from "../../lib/input";
import { inviteType, logKind, patrolSlotStatus, patrolSlotTone, plateResult, plateResultTone, unannouncedMethod, visitRequestStatus, visitorKind } from "../../lib/labels";

type Settings = Schemas["SecuritySettingsOut"];
type Gate = Schemas["GateOut"];
type Expected = Schemas["ExpectedInviteOut"];
type VisitReq = Schemas["VisitRequestOut"];
type Lookup = Schemas["PlateLookupOut"];
type GateLog = Schemas["GateLogOut"];
type LongWait = Schemas["LongWaitingOut"];
type LogEntry = Schemas["ShiftLogEntryOut"];
type Plan = Schemas["PatrolPlanOut"];
type Point = Schemas["PatrolPointOut"];
type Run = Schemas["PatrolRunOut"];
type Slot = Schemas["PatrolSlotOut"];

/**
 * Kapı ekranı (GUV-01): görevlinin günlük işleri tek ekranda — davetli ziyaretçi koduyla giriş, habersiz ziyaretçi
 * (bilgi bildirimi ya da sakin onayı), plaka sorgu ve giriş kaydı, otopark ihlali, uzun bekleyen kargolar.
 * Görevli kişisel veri görmez: yalnız bölüm, ad ve araç bilgisi.
 */
export function GateDesk() {
  const settings = useSiteGet<Settings>("/settings/security");
  const gates = useSiteGet<Gate[]>("/gates");
  const [gate, setGate] = useState("");
  const method = settings.data ? ((gate && settings.data.gate_methods[gate]) || settings.data.unannounced_method) : null;
  return (
    <div className="stack">
      <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
        {(gates.data ?? []).filter((g) => g.is_active).length > 0 && (
          <div className="field" style={{ minWidth: "12rem" }}><label className="field__label" htmlFor="desk-gate">Kapı</label><select id="desk-gate" className="field__input" value={gate} onChange={(e) => setGate(e.target.value)}><option value="">Tüm kapılar</option>{gates.data!.filter((g) => g.is_active).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        )}
        {method && <span className="small muted" style={{ alignSelf: "flex-end", paddingBottom: "var(--s-3)" }}>Habersiz ziyaretçi: <strong>{unannouncedMethod(method)}</strong>{method === "approval" && ` (${settings.data!.approval_timeout_seconds} sn)`}</span>}
      </div>
      <div className="grid grid--2" style={{ alignItems: "start" }}>
        <InviteCheckIn />
        <Unannounced gate={gate} method={method} />
        <PlateDesk gate={gate} />
        <LongWaiting />
      </div>
    </div>
  );
}

function InviteCheckIn() {
  const exp = useSiteGet<Expected[]>("/visitor-invites/expected");
  const [code, setCode] = useState("");
  const m = useSiteMutation<{ code: string }, Schemas["InviteCheckInOut"]>("POST", "/visitor-invites/check-in", { onSuccess: () => setCode("") });
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--ok"><KeyRound aria-hidden="true" /></span><span className="card__title">Davetli ziyaretçi</span><span className="card__meta ml-auto">{exp.data?.length ?? 0} beklenen</span></div>
      <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ code }); }}>
        <FormError error={m.error} />
        <Field label="Davet kodu" hint="Ziyaretçinin gösterdiği 6 haneli kod" error={fieldError(m.error, "code")}>{(p) => <input {...p} className="field__input mono" style={{ fontSize: "1.25rem", letterSpacing: ".2em" }} inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />}</Field>
        <div><SubmitButton busy={m.isPending} disabled={code.length !== 6}><LogIn aria-hidden="true" /> İçeri al</SubmitButton></div>
      </form>
      <div className="card__body">
        {exp.isPending ? <Loading /> : !exp.data || exp.data.length === 0 ? <p className="small muted mb-0">Bugün beklenen davetli yok.</p> : (
          <ul className="stack" style={{ gap: "var(--s-2)", listStyle: "none", margin: 0, padding: 0 }}>{exp.data.map((x) => <li key={x.id} className="small"><span className="strong">{x.visitor_name}</span> · {x.unit_name} · {inviteType(x.type)}{x.time_from && ` ${x.time_from}–${x.time_to}`}{x.plate && <> · <span className="mono">{x.plate}</span></>}</li>)}</ul>
        )}
      </div>
    </div>
  );
}

function Unannounced({ gate, method }: { gate: string; method: string | null }) {
  const reqs = useSiteGet<VisitReq[]>("/visit-requests", undefined, { refetchInterval: 5000 });
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ full_name: "", kind: "guest", plate: "" });
  const m = useSiteMutation<Record<string, unknown>, VisitReq>("POST", "/visit-requests", { onSuccess: () => { setUnit(null); setF({ full_name: "", kind: "guest", plate: "" }); } });
  function submit(e: FormEvent) { e.preventDefault(); m.mutate({ unit_id: unit?.id, full_name: f.full_name.trim(), kind: f.kind, plate: f.plate.replace(/\s/g, "") || null, gate_id: gate || null }); }
  const awaiting = (reqs.data ?? []).filter((r) => r.status === "awaiting");
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--info"><UserRoundPlus aria-hidden="true" /></span><span className="card__title">Habersiz ziyaretçi</span>{awaiting.length > 0 && <span className="ml-auto"><Badge tone="warn">{awaiting.length} onay bekliyor</Badge></span>}</div>
      <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={submit}>
        <FormError error={m.error} />
        <UnitPicker label="Gideceği bölüm" source="lookup" value={unit} onChange={setUnit} error={fieldError(m.error, "unit_id")} />
        <div className="grid grid--2">
          <Field label="Ad soyad" required error={fieldError(m.error, "full_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" value={f.full_name} onChange={(e) => setF((x) => ({ ...x, full_name: e.target.value }))} />}</Field>
          <Field label="Tür">{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{["guest", "cargo", "service", "contractor"].map((k) => <option key={k} value={k}>{visitorKind(k)}</option>)}</select>}</Field>
          <Field label="Plaka" hint="İsteğe bağlı">{(p) => <input {...p} className="field__input mono" value={f.plate} onChange={(e) => setF((x) => ({ ...x, plate: plateInput(e.target.value) }))} />}</Field>
        </div>
        <p className="small muted mb-0">Tam T.C. kimlik no alınmaz.</p>
        <div><SubmitButton busy={m.isPending} disabled={!unit || f.full_name.trim().length < 2}>{method === "approval" ? "Sakinden onay iste" : "Kaydet ve içeri al"}</SubmitButton></div>
      </form>
      <div className="card__body stack" style={{ gap: "var(--s-2)" }}>
        {(reqs.data ?? []).length === 0 ? <p className="small muted mb-0">Bugün onaylı/bekleyen talep yok.</p> : (reqs.data ?? []).slice(0, 8).map((r) => <RequestRow key={r.id} r={r} />)}
      </div>
    </div>
  );
}

function RequestRow({ r }: { r: VisitReq }) {
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"allow" | "deny">("allow");
  const m = useSiteMutation<{ decision: string; reason: string }, VisitReq>("POST", `/visit-requests/${r.id}/decide`);
  return (
    <div className="row row--between" style={{ gap: "var(--s-2)", borderBottom: "1px solid var(--line)", paddingBottom: "var(--s-2)" }}>
      <div>
        <div className="strong small">{r.full_name} <span className="muted">· {r.unit_name}</span></div>
        <div className="xs muted">{formatDateTime(r.created_at)}{r.decided_by && ` · ${r.decision_source === "resident" ? "sakin" : "görevli"}: ${r.decided_by}`}{r.reason && ` · ${r.reason}`}</div>
      </div>
      {r.status === "awaiting" && !r.timed_out ? <Badge tone="warn">Sakin yanıtı · {r.seconds_left} sn</Badge>
        : r.status === "awaiting" ? (
          <ConfirmButton className="btn btn--sm btn--primary" title={`${r.full_name} — manuel karar`} confirmLabel="Kararı kaydet"
            body={<div className="stack" style={{ gap: "var(--s-3)" }}>
              <p className="small mb-0">Sakin süresinde yanıt vermedi. Diafon ya da telefonla ulaşmayı deneyin, sonra kararınızı gerekçesiyle girin.</p>
              <div className="row" style={{ gap: "var(--s-3)" }}>
                <label className="check"><input type="radio" name={`dec-${r.id}`} checked={decision === "allow"} onChange={() => setDecision("allow")} /><span>İçeri al</span></label>
                <label className="check"><input type="radio" name={`dec-${r.id}`} checked={decision === "deny"} onChange={() => setDecision("deny")} /><span>Reddet</span></label>
              </div>
              <div className="field"><label className="field__label" htmlFor={`rs-${r.id}`}>Gerekçe *</label><input id={`rs-${r.id}`} className="field__input" placeholder="ör. Diafonla ulaşıldı, sakin onayladı" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            </div>}
            onConfirm={() => m.mutateAsync({ decision, reason })}>Manuel karar</ConfirmButton>
        ) : <Badge tone={r.status === "allowed" ? "ok" : "danger"}>{visitRequestStatus(r.status)}</Badge>}
    </div>
  );
}

function PlateDesk({ gate }: { gate: string }) {
  const [plate, setPlate] = useState("");
  const [res, setRes] = useState<Lookup | null>(null);
  const [lookErr, setLookErr] = useState<string>();
  const logs = useSiteGet<Page<GateLog>>("/gate-logs", { page_size: 8 });
  const log = useSiteMutation<{ plate: string; direction: string; gate_id: string | null }, GateLog>("POST", "/gate-logs", { onSuccess: () => { setPlate(""); setRes(null); } });
  const viol = useSiteMutation<{ plate: string; location: string; note: string }, Schemas["ParkingViolationOut"]>("POST", "/parking-violations");
  const [loc, setLoc] = useState("");
  const [note, setNote] = useState("");
  const look = useSiteGet<Lookup>("/plates/lookup", { plate: plate.replace(/\s/g, "") }, { enabled: false });
  async function search(e: FormEvent) {
    e.preventDefault();
    setLookErr(undefined);
    const r = await look.refetch();
    if (r.data) setRes(r.data); else setLookErr(r.error instanceof ApiError ? r.error.message : "Sorgulanamadı.");
  }
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--accent"><Car aria-hidden="true" /></span><span className="card__title">Plaka</span><span className="card__meta ml-auto">{logs.data?.total ?? 0} kayıt bugün</span></div>
      <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={search}>
        <Field label="Plaka" error={lookErr}>{(p) => <input {...p} className="field__input mono" style={{ fontSize: "1.25rem" }} autoComplete="off" placeholder="34 ABC 123" value={plate} onChange={(e) => { setPlate(plateInput(e.target.value)); setRes(null); }} />}</Field>
        <div><SubmitButton busy={look.isFetching} disabled={plate.replace(/\s/g, "").length < 4} className="btn">Sorgula</SubmitButton></div>
        {res && (
          <div className="stack" style={{ gap: "var(--s-2)" }}>
            <div><Badge tone={plateResultTone(res.result)}>{plateResult(res.result)}</Badge> <span className="mono strong">{res.plate_display}</span>{res.detail && <div className="small">{res.detail}</div>}{res.result === "unknown" && <div className="small muted">Ziyaretçi kaydına geçin ya da ihlal kaydedin.</div>}</div>
            <div className="row" style={{ gap: "var(--s-2)" }}>
              <button className="btn btn--sm btn--primary" type="button" disabled={log.isPending} onClick={() => log.mutate({ plate: res.plate, direction: "in", gate_id: gate || null })}><LogIn aria-hidden="true" /> Giriş</button>
              <button className="btn btn--sm" type="button" disabled={log.isPending} onClick={() => log.mutate({ plate: res.plate, direction: "out", gate_id: gate || null })}><LogOut aria-hidden="true" /> Çıkış</button>
              <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${res.plate_display} — otopark ihlali`} confirmLabel="İhlali kaydet"
                body={<div className="stack" style={{ gap: "var(--s-3)" }}>
                  <div className="field"><label className="field__label" htmlFor="v-loc">Yer *</label><input id="v-loc" className="field__input" placeholder="ör. B blok önü, engelli park yeri" value={loc} onChange={(e) => setLoc(e.target.value)} /></div>
                  <div className="field"><label className="field__label" htmlFor="v-note">Not {res.result !== "unknown" && "*"}</label><input id="v-note" className="field__input" value={note} onChange={(e) => setNote(e.target.value)} /><span className="field__hint">{res.result !== "unknown" ? "Plaka yetkili; ihlal nedenini yazın." : "Plaka kayıtlı değil; yönetime bildirilir."} Fotoğraf belge modülüyle gelecek.</span></div>
                </div>}
                onConfirm={() => viol.mutateAsync({ plate: res.plate, location: loc, note })}><ShieldAlert aria-hidden="true" /> İhlal</ConfirmButton>
            </div>
          </div>
        )}
      </form>
      <div className="card__body">
        {!logs.data || logs.data.items.length === 0 ? <p className="small muted mb-0">Bugün plaka kaydı yok.</p> : (
          <ul className="stack" style={{ gap: "var(--s-1)", listStyle: "none", margin: 0, padding: 0 }}>{logs.data.items.map((l) => <li key={l.id} className="small">{new Date(l.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · <span className="mono">{l.plate_display}</span> {l.direction === "in" ? "giriş" : "çıkış"} · <Badge tone={plateResultTone(l.result)}>{plateResult(l.result)}</Badge></li>)}</ul>
        )}
      </div>
    </div>
  );
}

function LongWaiting() {
  const q = useSiteGet<LongWait>("/packages/long-waiting");
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--warn"><PackageX aria-hidden="true" /></span><span className="card__title">Uzun bekleyen kargolar</span><span className="card__meta ml-auto">{q.data ? `${q.data.days} günden eski` : ""}</span></div>
      <div className="card__body">
        {q.isPending ? <Loading /> : !q.data || q.data.items.length === 0 ? <p className="small muted mb-0">Uzun bekleyen kargo yok.</p> : (
          <ul className="stack" style={{ gap: "var(--s-2)", listStyle: "none", margin: 0, padding: 0 }}>{q.data.items.map((p) => <li key={p.id} className="small"><span className="strong">{p.unit_name}</span> · {p.carrier ?? "Kargo"} · <Badge tone="warn">{p.waiting_days} gün</Badge>{p.delegates.length > 0 && <div className="xs muted">Teslim yetkilisi: {p.delegates.join(", ")}</div>}</li>)}</ul>
        )}
      </div>
    </div>
  );
}

/** Nöbet defteri (GUV-06): değiştirilemez kayıtlar, ek not, vardiya devri ve sonraki görevlinin onayı. */
export function ShiftLogCard() {
  const q = useSiteGet<LogEntry[]>("/shift-log");
  const [f, setF] = useState({ kind: "note", text: "" });
  const m = useSiteMutation<{ kind: string; text: string }, LogEntry>("POST", "/shift-log", { onSuccess: () => setF((x) => ({ ...x, text: "" })) });
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--accent"><BookOpen aria-hidden="true" /></span><span className="card__title">Nöbet defteri</span><span className="card__meta ml-auto">kayıtlar değiştirilemez; düzeltme ek notla</span></div>
      <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ kind: f.kind, text: f.text.trim() }); }}>
        <FormError error={m.error} />
        <div className="row" style={{ gap: "var(--s-3)" }}>{["note", "event", "handover"].map((k) => <label key={k} className="check"><input type="radio" name="log-kind" checked={f.kind === k} onChange={() => setF((x) => ({ ...x, kind: k }))} /><span>{logKind(k)}</span></label>)}</div>
        <Field label={f.kind === "handover" ? "Devir notu" : "Kayıt"} required hint={f.kind === "event" ? "Ciddi olaylar için Olaylar sekmesindeki olay kaydını kullanın." : f.kind === "handover" ? "Sonraki vardiya görevlisi okuyup onaylar." : undefined} error={fieldError(m.error, "text")}>{(p) => <textarea {...p} className="field__input" rows={3} maxLength={1000} value={f.text} onChange={(e) => setF((x) => ({ ...x, text: e.target.value }))} />}</Field>
        <div><SubmitButton busy={m.isPending} disabled={f.text.trim().length < 5}>Deftere yaz</SubmitButton></div>
      </form>
      <div className="card__body">
        {q.isPending ? <Loading /> : !q.data || q.data.length === 0 ? <Empty title="Defter boş" /> : (
          <ol className="timeline">{q.data.map((e) => <LogItem key={e.id} e={e} />)}</ol>
        )}
      </div>
    </div>
  );
}

function LogItem({ e }: { e: LogEntry }) {
  const [text, setText] = useState("");
  const add = useSiteMutation<{ text: string }, LogEntry>("POST", `/shift-log/${e.id}/addenda`);
  const ack = useSiteMutation<Record<string, never>, LogEntry>("POST", `/shift-log/${e.id}/acknowledge`);
  return (
    <li className={e.acknowledged_by ? "is-done" : undefined}>
      <div className="timeline__title">{logKind(e.kind)}{e.kind === "handover" && (e.acknowledged_by ? <> <Badge tone="ok">Okundu: {e.acknowledged_by}</Badge></> : <> <Badge tone="warn">Onay bekliyor</Badge></>)}</div>
      <div className="timeline__meta">{formatDateTime(e.at)} · {e.by}</div>
      <div className="small" style={{ whiteSpace: "pre-wrap" }}>{e.text}</div>
      {e.addenda.map((a, i) => <div key={i} className="small" style={{ borderLeft: "2px solid var(--line)", paddingLeft: "var(--s-2)", marginTop: 4 }}>Ek not: {a.text} <span className="xs muted">· {a.by}, {formatDateTime(a.at)}</span></div>)}
      <div className="row" style={{ gap: "var(--s-2)", marginTop: 4 }}>
        {e.kind === "handover" && !e.acknowledged_by && !e.by_me && <button className="btn btn--sm btn--primary" type="button" disabled={ack.isPending} onClick={() => ack.mutate({})}><CheckCircle2 aria-hidden="true" /> Okudum, devraldım</button>}
        <ConfirmButton className="btn btn--ghost btn--sm" title="Ek not" confirmLabel="Ekle" body={<div className="field"><label className="field__label" htmlFor={`ad-${e.id}`}>Ek not</label><input id={`ad-${e.id}`} className="field__input" value={text} onChange={(x) => setText(x.target.value)} /></div>} onConfirm={() => add.mutateAsync({ text })}>Ek not</ConfirmButton>
      </div>
    </li>
  );
}

/** Devriye yürütme (GUV-09): görevli turu başlatır, her noktada etiketi okutur ya da kodunu girer, bitirir; sapma raporu. */
export function PatrolRunner() {
  const plans = useSiteGet<Plan[]>("/patrol-plans");
  const points = useSiteGet<Point[]>("/patrol-points");
  const sched = useSiteGet<Slot[]>("/patrol-schedule", undefined, { refetchInterval: 30000 });
  const runs = useSiteGet<Run[]>("/patrol-runs", { date: todayIso() });
  const open = runs.data?.find((r) => !r.finished_at);
  const [planId, setPlanId] = useState("");
  const start = useSiteMutation<{ plan_id: string }, Run>("POST", "/patrol-runs");
  const active = (plans.data ?? []).filter((p) => p.is_active);
  if (plans.isPending) return <Loading />;
  if (active.length === 0) return <Empty title="Tanımlı devriye turu yok" icon={<Route aria-hidden="true" />}>Yönetim Devriye ekranından nokta ve tur tanımlar.</Empty>;
  return (
    <div className="grid grid--2" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><Route aria-hidden="true" /></span><span className="card__title">{open ? `${open.plan_name} sürüyor` : "Devriye başlat"}</span></div>
        {open ? <RunView run={open} points={points.data ?? []} /> : (
          <form className="card__body stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={(e) => { e.preventDefault(); start.mutate({ plan_id: planId || active[0]!.id }); }}>
            <FormError error={start.error} />
            <Field label="Tur">{(p) => <select {...p} className="field__input" value={planId || active[0]!.id} onChange={(e) => setPlanId(e.target.value)}>{active.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.point_ids.length} nokta · {p.allowed_minutes} dk</option>)}</select>}</Field>
            <div><SubmitButton busy={start.isPending}>Turu başlat</SubmitButton></div>
            <p className="small muted mb-0">Okutma anında yalnız o anki zaman kaydedilir; sürekli konum takibi yapılmaz. NFC okuma mobil uygulamayla gelecek; burada etiketteki kodu girin.</p>
          </form>
        )}
      </div>
      <div className="card">
        <div className="card__head"><span className="card__title">Bugünkü turlar</span></div>
        <div className="card__body">
          {!sched.data || sched.data.length === 0 ? <p className="small muted mb-0">Planlı tur yok.</p> : (
            <ul className="stack" style={{ gap: "var(--s-2)", listStyle: "none", margin: 0, padding: 0 }}>{sched.data.map((s) => <li key={`${s.plan_id}-${s.slot}`} className="row row--between small"><span><span className="mono">{s.slot}</span> · {s.plan_name}</span><Badge tone={patrolSlotTone(s.status)}>{patrolSlotStatus(s.status)}</Badge></li>)}</ul>
          )}
        </div>
      </div>
    </div>
  );
}

function RunView({ run, points }: { run: Run; points: Point[] }) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const scan = useSiteMutation<{ code: string; note: string }, Run>("POST", `/patrol-runs/${run.id}/scans`, { onSuccess: () => { setCode(""); setNote(""); } });
  const finish = useSiteMutation<Record<string, never>, Run>("POST", `/patrol-runs/${run.id}/finish`);
  const byId = new Map(points.map((p) => [p.id, p]));
  const done = new Set(run.scans.map((s) => s.point_id));
  return (
    <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
      <div className="small muted">Başladı {formatDateTime(run.started_at)} · {run.scans.length}/{run.point_ids.length} nokta{run.ordered && " · sıralı tur"}</div>
      <ol className="patrol-points">{run.point_ids.map((id) => { const p = byId.get(id); const s = run.scans.find((x) => x.point_id === id); return <li key={id} className={done.has(id) ? "is-done" : undefined}>{done.has(id) ? <CheckCircle2 aria-hidden="true" /> : <span className="patrol-points__dot" aria-hidden="true" />}<span>{p?.name ?? "?"}{p?.location && <span className="muted"> · {p.location}</span>}{s?.out_of_order && <> <Badge tone="warn">sıra dışı</Badge></>}</span><span className="visually-hidden">{done.has(id) ? "okutuldu" : "bekliyor"}</span></li>; })}</ol>
      <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); scan.mutate({ code, note }); }}>
        <FormError error={scan.error} />
        <Field label="Nokta kodu" hint="Etiketteki 6 haneli kod" error={fieldError(scan.error, "code")}>{(p) => <input {...p} className="field__input mono" style={{ fontSize: "1.25rem", letterSpacing: ".2em" }} inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />}</Field>
        <Field label="Not" hint="İsteğe bağlı; sorun varsa Olaylar'dan olay kaydı açın">{(p) => <input {...p} className="field__input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <div className="row" style={{ gap: "var(--s-2)" }}>
          <SubmitButton busy={scan.isPending} disabled={code.length !== 6}>Okut</SubmitButton>
          <ConfirmButton className="btn btn--ghost" title="Turu bitir" confirmLabel="Bitir" body={done.size < run.point_ids.length ? `${run.point_ids.length - done.size} nokta okutulmadı; sapma raporuna girer ve yöneticiye özet gider.` : "Tüm noktalar okutuldu."} onConfirm={() => finish.mutateAsync({})}>Turu bitir</ConfirmButton>
        </div>
      </form>
      {run.report.overtime && <Alert tone="warn">İzin verilen süre ({run.allowed_minutes} dk) aşıldı.</Alert>}
    </div>
  );
}
