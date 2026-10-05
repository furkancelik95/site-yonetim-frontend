import { useState, type FormEvent } from "react";
import { LogIn, LogOut, Package, SearchCheck, Siren, UserRound } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { MockBadge } from "../../components/MockBadge";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, todayIso, trUpper } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { incidentKind, packageStatus, visitorKind, visitorStatus, visitorTone } from "../../lib/labels";
import { M, P, useSite } from "../../site/SiteContext";

type Pkg = Schemas["PackageOut"];
type Visitor = Schemas["VisitorOut"];

/**
 * Güvenlik görevlisi ekranı. Daire araması kısıtlıdır: yalnız bölüm ve oturan adı görünür,
 * telefon ve borç görünmez (KVKK veri minimizasyonu — backend docs/09 §5).
 */
export function SecurityPage() {
  const { shows } = useSite();
  const pk = shows(M.packages, P.packages);
  const vs = shows(M.visitors, P.visitors);
  const [s, set] = useUrlState({ sekme: "kapi" });
  const tabs = [
    { key: "kapi", label: "Kargo ve ziyaretçi" },
    { key: "olay", label: "Olaylar" },
    { key: "kayip", label: "Kayıp eşya" },
  ];
  return (
    <div className="stack">
      <PageHead title="Güvenlik" subtitle="Kargo, ziyaretçi, olay ve kayıp eşya kaydı" />
      <div className="row" role="tablist" aria-label="Güvenlik bölümleri" style={{ gap: "var(--s-2)" }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={s.sekme === t.key} className={`btn btn--sm${s.sekme === t.key ? " btn--primary" : ""}`} onClick={() => set({ sekme: t.key })}>
            {t.label}
          </button>
        ))}
      </div>
      {s.sekme === "olay" ? (
        <IncidentsCard />
      ) : s.sekme === "kayip" ? (
        <LostItemsCard />
      ) : (
        <div className="grid grid--2">
          {pk && <PackagesCard />}
          {vs && <VisitorsCard />}
        </div>
      )}
    </div>
  );
}

const INCIDENT_KINDS = ["theft", "damage", "noise", "fire", "water_leak", "suspicious", "accident", "other"];

/** Servis isteği 09'daki yanıt şekli. */
interface Incident {
  id: string; number: number; occurred_at: string; kind: string; location: string; description: string;
  unit_id: string | null; unit_name: string | null; status: "open" | "closed"; closed_note: string | null; closed_at: string | null; recorded_by: string;
}
/** Servis isteği 10'daki yanıt şekli. */
interface LostItem {
  id: string; number: number; found_at: string; description: string; location: string; found_by: string | null;
  status: "waiting" | "returned" | "disposed"; returned_to: string | null; returned_at: string | null; recorded_by: string;
}

function IncidentsCard() {
  const [status, setStatus] = useState("open");
  const r = useSiteGet<Page<Incident>>("/incidents", { status, page_size: 50 });
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ kind: "other", location: "", description: "" });
  const add = useSiteMutation<Record<string, unknown>, Incident>("POST", "/incidents", { onSuccess: () => { setUnit(null); setF({ kind: "other", location: "", description: "" }); } });
  return (
    <div className="grid grid--2">
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); add.mutate({ ...f, unit_id: unit?.id ?? null, unit_name: unit?.name ?? null }); }}>
        <div className="card__head"><span className="card__icon card__icon--danger"><Siren aria-hidden="true" /></span><span className="card__title">Olay kaydet</span><span className="ml-auto"><MockBadge request="09" /></span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={add.error} />
          <div className="grid grid--2">
            <Field label="Tür" required error={fieldError(add.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{INCIDENT_KINDS.map((k) => <option key={k} value={k}>{incidentKind(k)}</option>)}</select>}</Field>
            <Field label="Yer" required error={fieldError(add.error, "location")}>{(p) => <input {...p} className="field__input" value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} placeholder="ör. B blok otopark" />}</Field>
          </div>
          <UnitPicker label="İlgili bölüm (varsa)" source="lookup" value={unit} onChange={setUnit} allowEmptyLabel="ortak alan" />
          <Field label="Ne oldu" required error={fieldError(add.error, "description")}>{(p) => <textarea {...p} className="field__input" rows={3} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
          <div><SubmitButton busy={add.isPending} className="btn btn--primary" disabled={!f.location.trim() || !f.description.trim()}>Olayı kaydet</SubmitButton></div>
        </div>
      </form>
      <div className="card">
        <div className="card__head">
          <span className="card__title">Olaylar</span>
          <div className="row ml-auto" role="group" aria-label="Olay durumu" style={{ gap: "var(--s-2)" }}>
            {[["open", "Açık"], ["closed", "Kapanan"]].map(([k, l]) => <button key={k} type="button" className={`btn btn--sm${status === k ? " btn--primary" : ""}`} aria-pressed={status === k} onClick={() => setStatus(k!)}>{l}</button>)}
          </div>
        </div>
        <div className="card__body card__body--flush">
          {r.isPending ? <Loading /> : r.isError ? <div className="card__body"><ErrorState error={r.error} /></div> : r.data.items.length === 0 ? <Empty title={status === "open" ? "Açık olay yok" : "Kapanan olay yok"} /> : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Olay kayıtları</caption>
                <tbody>
                  {r.data.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <div className="cell-main">#{i.number} {incidentKind(i.kind)} · {i.location}</div>
                        <div className="cell-sub">{i.description}</div>
                        <div className="cell-sub">{formatDateTime(i.occurred_at)} · {i.recorded_by}{i.unit_name ? ` · ${i.unit_name}` : ""}</div>
                        {i.closed_note && <div className="cell-sub">Kapanış: {i.closed_note}</div>}
                      </td>
                      <td className="right">{i.status === "open" ? <CloseIncident i={i} /> : <Badge>Kapandı</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseIncident({ i }: { i: Incident }) {
  const [note, setNote] = useState("");
  const m = useSiteMutation<{ note: string }, Incident>("POST", `/incidents/${i.id}/close`);
  return (
    <ConfirmButton className="btn btn--sm" title={`#${i.number} olayını kapat`} confirmLabel="Kapat"
      body={<div className="field"><label className="field__label" htmlFor={`inc-${i.id}`}>Ne yapıldı *</label><textarea id={`inc-${i.id}`} className="field__input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>}
      onConfirm={() => { if (!note.trim()) throw new Error("Kapanış notu zorunlu."); return m.mutateAsync({ note: note.trim() }); }}>
      Kapat
    </ConfirmButton>
  );
}

function LostItemsCard() {
  const [status, setStatus] = useState("waiting");
  const r = useSiteGet<Page<LostItem>>("/lost-items", { status, page_size: 50 });
  const [f, setF] = useState({ description: "", location: "", found_by: "" });
  const add = useSiteMutation<Record<string, unknown>, LostItem>("POST", "/lost-items", { onSuccess: () => setF({ description: "", location: "", found_by: "" }) });
  return (
    <div className="grid grid--2">
      <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); add.mutate(f); }}>
        <div className="card__head"><span className="card__icon card__icon--info"><SearchCheck aria-hidden="true" /></span><span className="card__title">Bulunan eşya kaydet</span><span className="ml-auto"><MockBadge request="10" /></span></div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <FormError error={add.error} />
          <Field label="Eşya" required error={fieldError(add.error, "description")}>{(p) => <input {...p} className="field__input" value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} placeholder="ör. Siyah sırt çantası" />}</Field>
          <div className="grid grid--2">
            <Field label="Bulunduğu yer" required error={fieldError(add.error, "location")}>{(p) => <input {...p} className="field__input" value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} />}</Field>
            <Field label="Bulan">{(p) => <input {...p} className="field__input" value={f.found_by} onChange={(e) => setF((x) => ({ ...x, found_by: e.target.value }))} />}</Field>
          </div>
          <div><SubmitButton busy={add.isPending} className="btn btn--primary" disabled={!f.description.trim() || !f.location.trim()}>Kaydet</SubmitButton></div>
        </div>
      </form>
      <div className="card">
        <div className="card__head">
          <span className="card__title">Kayıp eşya</span>
          <div className="row ml-auto" role="group" aria-label="Eşya durumu" style={{ gap: "var(--s-2)" }}>
            {[["waiting", "Bekleyen"], ["returned", "Teslim edilen"]].map(([k, l]) => <button key={k} type="button" className={`btn btn--sm${status === k ? " btn--primary" : ""}`} aria-pressed={status === k} onClick={() => setStatus(k!)}>{l}</button>)}
          </div>
        </div>
        <div className="card__body card__body--flush">
          {r.isPending ? <Loading /> : r.isError ? <div className="card__body"><ErrorState error={r.error} /></div> : r.data.items.length === 0 ? <Empty title={status === "waiting" ? "Bekleyen eşya yok" : "Teslim edilen eşya yok"} /> : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Kayıp eşya kayıtları</caption>
                <tbody>
                  {r.data.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <div className="cell-main">#{i.number} {i.description}</div>
                        <div className="cell-sub">{i.location} · {formatDateTime(i.found_at)}{i.found_by ? ` · bulan: ${i.found_by}` : ""}</div>
                        {i.returned_to && <div className="cell-sub">Teslim alan: {i.returned_to} · {formatDateTime(i.returned_at)}</div>}
                      </td>
                      <td className="right">{i.status === "waiting" ? <ReturnItem i={i} /> : <Badge tone={i.status === "returned" ? "ok" : "muted"}>{i.status === "returned" ? "Teslim edildi" : "Elden çıkarıldı"}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReturnItem({ i }: { i: LostItem }) {
  const [to, setTo] = useState("");
  const m = useSiteMutation<{ returned_to: string }, LostItem>("POST", `/lost-items/${i.id}/return`);
  return (
    <ConfirmButton className="btn btn--sm" title={`#${i.number} eşyayı teslim et`} confirmLabel="Teslim et"
      body={<div className="field"><label className="field__label" htmlFor={`lost-${i.id}`}>Teslim alan</label><input id={`lost-${i.id}`} className="field__input" value={to} onChange={(e) => setTo(e.target.value)} /></div>}
      onConfirm={() => { if (to.trim().length < 2) throw new Error("Teslim alanın adını yazın."); return m.mutateAsync({ returned_to: to.trim() }); }}>
      Teslim et
    </ConfirmButton>
  );
}

function PackagesCard() {
  const [status, setStatus] = useState("waiting");
  const r = useSiteGet<Page<Pkg>>("/packages", { status, page_size: 50 });
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [carrier, setCarrier] = useState("");
  const [unitErr, setUnitErr] = useState<string>();
  const add = useSiteMutation<Record<string, unknown>, Pkg>("POST", "/packages", { onSuccess: () => { setUnit(null); setCarrier(""); } });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!unit) return setUnitErr("Bölüm seçin.");
    setUnitErr(undefined);
    add.mutate({ unit_id: unit.id, carrier: carrier.trim() || null, note: null });
  }

  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--warn"><Package aria-hidden="true" /></span><span className="card__title">Kargo</span></div>
      <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} onSubmit={submit} noValidate>
        <FormError error={add.error} />
        <UnitPicker label="Kargonun geldiği bölüm" source="lookup" value={unit} onChange={setUnit} error={unitErr} />
        <Field label="Kargo firması">{(p) => <input {...p} className="field__input" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="ör. Yurtiçi" />}</Field>
        <div><SubmitButton busy={add.isPending} className="btn btn--primary">Kargo geldi</SubmitButton></div>
        <p className="small muted mb-0">Sakine 4 haneli teslim kodu gösterilir; teslimde bu kod sorulur.</p>
      </form>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <div className="row" style={{ gap: "var(--s-2)" }} role="group" aria-label="Kargo durumu">
          {["waiting", "delivered"].map((x) => (
            <button key={x} type="button" className={`btn btn--sm${status === x ? " btn--primary" : ""}`} aria-pressed={status === x} onClick={() => setStatus(x)}>{packageStatus(x)}</button>
          ))}
        </div>
        {r.isPending ? <Loading /> : r.isError ? <ErrorState error={r.error} /> : r.data.items.length === 0 ? (
          <Empty title={status === "waiting" ? "Bekleyen kargo yok" : "Teslim edilen kargo yok"} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Kargolar</caption>
              <tbody>
                {r.data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-main">{p.unit_name}</div>
                      <div className="cell-sub">{p.carrier ?? "—"} · {formatDateTime(p.received_at)}</div>
                      {p.delivered_to && <div className="cell-sub">Teslim alan: {p.delivered_to}</div>}
                    </td>
                    <td className="right">{p.status === "waiting" ? <DeliverButton p={p} /> : <Badge tone="ok">{packageStatus(p.status)}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DeliverButton({ p }: { p: Pkg }) {
  const [code, setCode] = useState("");
  const [to, setTo] = useState("");
  const m = useSiteMutation<{ pickup_code: string; delivered_to: string }, Pkg>("POST", `/packages/${p.id}/deliver`);
  return (
    <ConfirmButton
      className="btn btn--sm"
      title={`${p.unit_name} — kargoyu teslim et`}
      confirmLabel="Teslim et"
      body={
        <div className="stack" style={{ gap: "var(--s-3)" }}>
          <div className="field">
            <label className="field__label" htmlFor={`code-${p.id}`}>Teslim kodu (4 hane)</label>
            <input id={`code-${p.id}`} className="field__input mono" inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`to-${p.id}`}>Teslim alan</label>
            <input id={`to-${p.id}`} className="field__input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      }
      onConfirm={() => {
        if (!/^\d{4}$/.test(code)) throw new Error("Teslim kodu 4 rakam olmalı.");
        if (to.trim().length < 2) throw new Error("Teslim alanın adını yazın.");
        return m.mutateAsync({ pickup_code: code, delivered_to: to.trim() });
      }}
    >
      Teslim et
    </ConfirmButton>
  );
}

function VisitorsCard() {
  const r = useSiteGet<Page<Visitor>>("/visitors", { date: todayIso(), page_size: 100 });
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ full_name: "", kind: "guest", plate_number: "", enter_now: true });
  const [unitErr, setUnitErr] = useState<string>();
  const add = useSiteMutation<Record<string, unknown>, Visitor>("POST", "/visitors", { onSuccess: () => { setUnit(null); setF((x) => ({ ...x, full_name: "", plate_number: "" })); } });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!unit) return setUnitErr("Ziyaret edilen bölümü seçin.");
    setUnitErr(undefined);
    add.mutate({
      unit_id: unit.id,
      full_name: f.full_name.trim(),
      kind: f.kind,
      plate_number: f.plate_number.trim() ? trUpper(f.plate_number.replace(/\s+/g, " ").trim()) : null,
      enter_now: f.enter_now,
    });
  }

  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--info"><UserRound aria-hidden="true" /></span><span className="card__title">Ziyaretçi</span><span className="card__meta ml-auto">bugün</span></div>
      <form className="card__body stack" style={{ gap: "var(--s-3)", borderBottom: "1px solid var(--line)" }} onSubmit={submit} noValidate>
        <FormError error={add.error} />
        <UnitPicker label="Ziyaret edilen bölüm" source="lookup" value={unit} onChange={setUnit} error={unitErr} />
        <div className="grid grid--2">
          <Field label="Ad soyad" required error={fieldError(add.error, "full_name")}>{(p) => <input {...p} className="field__input" value={f.full_name} onChange={(e) => setF((x) => ({ ...x, full_name: e.target.value }))} />}</Field>
          <Field label="Tür">{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>{["guest", "cargo", "service", "contractor"].map((k) => <option key={k} value={k}>{visitorKind(k)}</option>)}</select>}</Field>
          <Field label="Plaka">{(p) => <input {...p} className="field__input mono" value={f.plate_number} onChange={(e) => setF((x) => ({ ...x, plate_number: e.target.value }))} placeholder="34 ABC 123" />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.enter_now} onChange={(e) => setF((x) => ({ ...x, enter_now: e.target.checked }))} /> Şimdi giriş yaptı</label>
        <div><SubmitButton busy={add.isPending} className="btn" disabled={f.full_name.trim().length < 2}>Ziyaretçiyi kaydet</SubmitButton></div>
      </form>
      <div className="card__body card__body--flush">
        {r.isPending ? <Loading /> : r.isError ? <div className="card__body"><ErrorState error={r.error} /></div> : r.data.items.length === 0 ? (
          <Empty title="Bugün ziyaretçi yok" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Bugünkü ziyaretçiler</caption>
              <tbody>
                {r.data.items.map((v) => <VisitorRow key={v.id} v={v} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function VisitorRow({ v }: { v: Visitor }) {
  const enter = useSiteMutation<Record<string, never>, Visitor>("POST", `/visitors/${v.id}/enter`);
  const exit = useSiteMutation<Record<string, never>, Visitor>("POST", `/visitors/${v.id}/exit`);
  return (
    <tr>
      <td>
        <div className="cell-main">{v.full_name}</div>
        <div className="cell-sub">{v.unit_name} · {visitorKind(v.kind)}{v.plate_number ? ` · ${v.plate_number}` : ""}</div>
      </td>
      <td><Badge tone={visitorTone(v.status)}>{visitorStatus(v.status)}</Badge></td>
      <td className="right">
        {v.status === "expected" && <button className="btn btn--sm" type="button" disabled={enter.isPending} onClick={() => enter.mutate({})}><LogIn aria-hidden="true" /> Giriş</button>}
        {v.status === "entered" && <button className="btn btn--sm" type="button" disabled={exit.isPending} onClick={() => exit.mutate({})}><LogOut aria-hidden="true" /> Çıkış</button>}
      </td>
    </tr>
  );
}
