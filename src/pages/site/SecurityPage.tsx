import { useState, type FormEvent } from "react";
import { LogIn, LogOut, Package, UserRound } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, todayIso, trUpper } from "../../lib/format";
import { packageStatus, visitorKind, visitorStatus, visitorTone } from "../../lib/labels";
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
  return (
    <div className="stack">
      <PageHead title="Güvenlik" subtitle="Kargo ve ziyaretçi kaydı" />
      <div className="grid grid--2">
        {pk && <PackagesCard />}
        {vs && <VisitorsCard />}
      </div>
    </div>
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
