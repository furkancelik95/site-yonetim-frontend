import { useState } from "react";
import { ParkingSquare, Pencil, Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, todayIso } from "../../lib/format";
import { parkingKind } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Space = Schemas["ParkingSpaceOut"];
type Allocation = Schemas["ParkingAllocationOut"];
const KINDS = ["standard", "disabled", "ev", "guest"] as const;

/**
 * Park yerleri (OTP-01, PM kararı K30): park yeri ayrı kaynaktır ve bölüme tarihçeli tahsis edilir. Bir yer aynı
 * tarihte tek bölüme tahsislidir; tahsis silinmez, bitirilir. Ücretli yerin ücreti dönem dışı ücret modülüyle bağlanacak.
 */
export function ParkingSpacesPanel() {
  const { can } = useSite();
  const manage = can(P.unitsManage);
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const list = useSiteGet<Page<Space>>("/parking-spaces", { kind: kind || undefined, q: q.trim() || undefined, page_size: 200 });
  const [editing, setEditing] = useState<Space | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      <div className="filters">
        <div className="field"><label className="field__label" htmlFor="ps-q">Kod</label><input id="ps-q" className="field__input" type="search" placeholder="ör. B-14" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="field"><label className="field__label" htmlFor="ps-k">Tip</label><select id="ps-k" className="field__input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tümü</option>{KINDS.map((k) => <option key={k} value={k}>{parkingKind(k)}</option>)}</select></div>
        {manage && <div className="field" style={{ alignSelf: "flex-end" }}><button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Park yeri ekle</button></div>}
      </div>
      {editing && <SpaceForm s={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="card"><div className="card__body card__body--flush">
        {list.isPending ? <Loading /> : list.isError ? <div className="card__body"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div> : list.data.items.length === 0 ? (
          <Empty title="Park yeri tanımlı değil" icon={<ParkingSquare aria-hidden="true" />}>Park yerlerini kodu ve tipiyle tanımlayın, sonra bölümlere tahsis edin.</Empty>
        ) : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Park yerleri</caption>
            <thead><tr><th scope="col">Kod</th><th scope="col">Tip</th><th scope="col">Bugün tahsisli</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{list.data.items.map((s) => (
              <SpaceRow key={s.id} s={s} manage={manage} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} onEdit={() => setEditing(s)} />
            ))}</tbody>
          </table></div>
        )}
      </div></div>
      {list.data && list.data.total > list.data.items.length && <p className="small muted">İlk {list.data.items.length} park yeri gösteriliyor; kodla arayın.</p>}
    </div>
  );
}

function SpaceRow({ s, manage, open, onToggle, onEdit }: { s: Space; manage: boolean; open: boolean; onToggle: () => void; onEdit: () => void }) {
  return (
    <>
      <tr style={!s.is_active ? { opacity: 0.6 } : undefined}>
        <td><div className="cell-main mono">{s.code}</div>{s.location && <div className="cell-sub">{s.location}</div>}</td>
        <td className="small">{parkingKind(s.kind)}{s.is_paid && <div className="cell-sub">Ücretli</div>}</td>
        <td className="small">{s.current ? <>{s.current.unit_name}<div className="cell-sub">{formatDate(s.current.start_date)}{s.current.end_date ? ` – ${formatDate(s.current.end_date)}` : " itibarıyla"}</div></> : "—"}</td>
        <td>{s.is_active ? <Badge tone="ok">Kullanımda</Badge> : <Badge>Kapalı</Badge>}</td>
        <td className="right nowrap">
          <button className="btn btn--ghost btn--sm" type="button" aria-expanded={open} onClick={onToggle}>Tahsisler</button>
          {manage && <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${s.code} düzenle`} onClick={onEdit}><Pencil aria-hidden="true" /></button>}
        </td>
      </tr>
      {open && <tr><td colSpan={5}><Allocations space={s} manage={manage} /></td></tr>}
    </>
  );
}

function Allocations({ space, manage }: { space: Space; manage: boolean }) {
  const q = useSiteGet<Page<Allocation>>("/parking-allocations", { space_id: space.id, page_size: 50 });
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ start_date: todayIso(), end_date: "", note: "" });
  const add = useSiteMutation<Record<string, unknown>, Allocation>("POST", `/parking-spaces/${space.id}/allocations`, { onSuccess: () => { setUnit(null); setF({ start_date: todayIso(), end_date: "", note: "" }); } });
  return (
    <div className="stack" style={{ gap: "var(--s-3)", padding: "var(--s-2) 0" }}>
      {q.isPending ? <Loading /> : !q.data || q.data.items.length === 0 ? <p className="small muted mb-0">Bu yer hiç tahsis edilmedi.</p> : (
        <ul className="stack" style={{ gap: "var(--s-1)", listStyle: "none", margin: 0, padding: 0 }}>
          {q.data.items.map((a) => <AllocationRow key={a.id} a={a} manage={manage} />)}
        </ul>
      )}
      {manage && space.is_active && (
        <form className="stack" style={{ gap: "var(--s-2)" }} noValidate onSubmit={(e) => { e.preventDefault(); add.mutate({ unit_id: unit?.id, start_date: f.start_date || null, end_date: f.end_date || null, note: f.note.trim() || null }); }}>
          <FormError error={add.error} />
          <div className="grid grid--kpi">
            <UnitPicker label="Bölüm" value={unit} onChange={setUnit} error={fieldError(add.error, "unit_id")} />
            <Field label="Başlangıç" required error={fieldError(add.error, "start_date")}>{(p) => <input {...p} className="field__input" type="date" value={f.start_date} onChange={(e) => setF((x) => ({ ...x, start_date: e.target.value }))} />}</Field>
            <Field label="Bitiş" hint="Boş: süresiz" error={fieldError(add.error, "end_date")}>{(p) => <input {...p} className="field__input" type="date" min={f.start_date} value={f.end_date} onChange={(e) => setF((x) => ({ ...x, end_date: e.target.value }))} />}</Field>
            <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={200} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
          </div>
          <div><SubmitButton busy={add.isPending} disabled={!unit || !f.start_date} className="btn btn--sm">Tahsis et</SubmitButton></div>
        </form>
      )}
    </div>
  );
}

function AllocationRow({ a, manage }: { a: Allocation; manage: boolean }) {
  const [end, setEnd] = useState(todayIso());
  const stop = useSiteMutation<{ end_date: string }, Allocation>("POST", `/parking-allocations/${a.id}/end`);
  return (
    <li className="row row--between small" style={{ gap: "var(--s-2)" }}>
      <span><span className="strong">{a.unit_name}</span> · {formatDate(a.start_date)}{a.end_date ? ` – ${formatDate(a.end_date)}` : " itibarıyla"}{a.is_current && <> <Badge tone="ok">Bugün</Badge></>}{a.note && <span className="muted"> · {a.note}</span>}</span>
      {manage && !a.end_date && (
        <ConfirmButton className="btn btn--ghost btn--sm" title={`${a.space_code} — tahsisi bitir`} confirmLabel="Bitir"
          body={<div className="field"><label className="field__label" htmlFor={`end-${a.id}`}>Bitiş tarihi</label><input id={`end-${a.id}`} className="field__input" type="date" min={a.start_date} value={end} onChange={(e) => setEnd(e.target.value)} /></div>}
          onConfirm={() => stop.mutateAsync({ end_date: end })}>Bitir</ConfirmButton>
      )}
    </li>
  );
}

function SpaceForm({ s, onDone }: { s: Space | null; onDone: () => void }) {
  const [f, setF] = useState({ code: s?.code ?? "", kind: s?.kind ?? "standard", location: s?.location ?? "", is_paid: s?.is_paid ?? false, is_active: s?.is_active ?? true, note: s?.note ?? "" });
  const m = useSiteMutation<Record<string, unknown>, Space>(s ? "PATCH" : "POST", s ? `/parking-spaces/${s.id}` : "/parking-spaces", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, location: f.location.trim() || null, note: f.note.trim() || null }); }}>
      <div className="card__head"><span className="card__title">{s ? `${s.code} — düzenle` : "Park yeri ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Kod" required error={fieldError(m.error, "code")}>{(p) => <input {...p} className="field__input mono" maxLength={20} placeholder="ör. B-14" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value }))} />}</Field>
          <Field label="Tip" required error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value as Space["kind"] }))}>{KINDS.map((k) => <option key={k} value={k}>{parkingKind(k)}</option>)}</select>}</Field>
          <Field label="Konum">{(p) => <input {...p} className="field__input" maxLength={80} placeholder="ör. Kapalı otopark -1" value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} />}</Field>
          <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={200} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
        </div>
        <div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>
          <label className="check"><input type="checkbox" checked={f.is_paid} onChange={(e) => setF((x) => ({ ...x, is_paid: e.target.checked }))} /><span>Ücretli</span></label>
          {s && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /><span>Kullanımda</span></label>}
        </div>
        {f.kind === "disabled" && <p className="small muted mb-0">Engelli park yeri tahsisinde sağlık verisi tutulmaz.</p>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.code.trim()}>{s ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
