import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Car, Plus } from "lucide-react";
import { ApiError } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, todayIso } from "../../lib/format";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { plateInput } from "../../lib/input";
import { vehicleKind, vehicleStatus, vehicleStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import { ParkingSpacesPanel } from "./ParkingSpacesPanel";

export type Vehicle = Schemas["VehicleOut"];
type VehicleSettings = Schemas["VehicleSettingsOut"];

/** Araçlar (YAP-05): plaka kaydı; güvenlik kapı ekranında okur, sakin kendi aracını ekler. */
export function VehiclesPage({ unitId, embedded }: { unitId?: string; embedded?: boolean } = {}) {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ q: "", durum: "", page: "1", sekme: "" });
  const [search, setSearch] = useState(s.q);
  const q = useDebounced(search, 300);
  const list = useSiteGet<Page<Vehicle>>("/vehicles", { unit_id: unitId, status: s.durum || undefined, q: q || undefined, page: embedded ? undefined : s.page, page_size: embedded ? 100 : 50 });
  const [adding, setAdding] = useState(false);
  const manage = can(P.unitsManage);
  const body = (
    <>
      {adding && <VehicleForm unitId={unitId} onDone={() => setAdding(false)} />}
      {!embedded && (
        <div className="filters">
          <div className="field"><label className="field__label" htmlFor="v-q">Ara</label><input id="v-q" className="field__input" type="search" placeholder="Plaka, bölüm ya da kişi" value={search} onChange={(e) => { setSearch(e.target.value); set({ q: e.target.value, page: "1" }); }} /></div>
          <div className="field"><label className="field__label" htmlFor="v-st">Durum</label><select id="v-st" className="field__input" value={s.durum} onChange={(e) => set({ durum: e.target.value, page: "1" })}><option value="">Tümü</option>{["active", "pending", "inactive"].map((k) => <option key={k} value={k}>{vehicleStatus(k)}</option>)}</select></div>
        </div>
      )}
      <div className="card"><div className="card__body card__body--flush">
        {list.isPending ? <Loading /> : list.isError ? <div className="card__body"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div> : list.data.items.length === 0 ? (
          <Empty title="Kayıtlı araç yok" icon={<Car aria-hidden="true" />}>Kayıtlı plaka kapı ekranında görünür; sakinler kendi araçlarını uygulamadan ekler.</Empty>
        ) : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Araçlar</caption>
            <thead><tr><th scope="col">Plaka</th>{!unitId && <th scope="col">Bölüm</th>}<th scope="col">Kişi</th><th scope="col">Tür</th><th scope="col">Durum</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{list.data.items.map((v) => <VehicleRow key={v.id} v={v} showUnit={!unitId} manage={manage} slug={site.slug} />)}</tbody>
          </table></div>
        )}
      </div>
      {!embedded && list.data && list.data.total > list.data.page_size && <div className="card__foot"><Pager page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
    </>
  );
  if (embedded) {
    return (
      <div className="stack" style={{ gap: "var(--s-3)" }}>
        {manage && <div className="row"><button className="btn btn--sm" type="button" aria-expanded={adding} onClick={() => setAdding((x) => !x)}><Plus aria-hidden="true" /> Araç ekle</button></div>}
        {body}
      </div>
    );
  }
  const parking = s.sekme === "park";
  return (
    <div className="stack">
      <PageHead title="Araçlar" subtitle="Sakinlerin plakaları ve park yerleri; plaka kapı ekranında sorgulanır. Plaka verisi KVKK kapsamındadır." actions={manage && !parking && <><Link className="btn" to={`/s/${site.slug}/iceri-aktar?tip=araclar`}>Excel'den aktar</Link><button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((x) => !x)}><Plus aria-hidden="true" /> Araç ekle</button></>} />
      <div className="row" role="tablist" aria-label="Araçlar ve park yerleri" style={{ gap: "var(--s-2)" }}>
        {[["", "Araçlar"], ["park", "Park yerleri"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className={`btn btn--sm${s.sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k! })}>{l}</button>)}
      </div>
      {parking ? <ParkingSpacesPanel /> : <>
        {manage && <VehicleSettingsCard />}
        {body}
      </>}
    </div>
  );
}

function VehicleRow({ v, showUnit, manage, slug }: { v: Vehicle; showUnit: boolean; manage: boolean; slug: string }) {
  const upd = useSiteMutation<{ status: string }, Vehicle>("PATCH", `/vehicles/${v.id}`);
  return (
    <tr style={v.status === "inactive" ? { opacity: 0.6 } : undefined}>
      <td><div className="cell-main mono">{v.plate_display}</div>{(v.brand_model || v.color) && <div className="cell-sub">{[v.brand_model, v.color].filter(Boolean).join(" · ")}</div>}</td>
      {showUnit && <td className="small"><Link to={`/s/${slug}/daireler/${v.unit_id}`}>{v.unit_name}</Link></td>}
      <td className="small">{v.owner_name ?? "—"}</td>
      <td className="small">{vehicleKind(v.kind)}{v.valid_until && <div className="cell-sub">{formatDate(v.valid_until)} tarihine kadar</div>}</td>
      <td><Badge tone={vehicleStatusTone(v.status)}>{vehicleStatus(v.status)}</Badge></td>
      {manage && (
        <td className="right nowrap">
          {v.status === "pending" && <button className="btn btn--sm btn--primary" type="button" disabled={upd.isPending} onClick={() => upd.mutate({ status: "active" })}>Onayla</button>}{" "}
          {v.status !== "inactive" ? (
            <ConfirmButton className="btn btn--ghost btn--sm" title={`${v.plate_display} — pasif yap`} confirmLabel="Pasif yap" body="Plaka kapı ekranında görünmez; kayıt geçmişte kalır." onConfirm={() => upd.mutateAsync({ status: "inactive" })}>Pasif yap</ConfirmButton>
          ) : (
            <button className="btn btn--ghost btn--sm" type="button" disabled={upd.isPending} onClick={() => upd.mutate({ status: "active" })}>Yeniden etkinleştir</button>
          )}
        </td>
      )}
    </tr>
  );
}

export function VehicleForm({ unitId, onDone }: { unitId?: string; onDone: () => void }) {
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ plate: "", brand_model: "", color: "", kind: "permanent", valid_until: "" });
  const [force, setForce] = useState(false);
  const m = useSiteMutation<Record<string, unknown>, Vehicle>("POST", "/vehicles", { onSuccess: onDone });
  const elsewhere = m.error instanceof ApiError && m.error.code === "plate_active_elsewhere";
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ ...f, plate: f.plate.replace(/\s/g, ""), unit_id: unitId ?? unit?.id, valid_until: f.kind === "guest" ? f.valid_until : null, force });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Araç ekle</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        {elsewhere && <label className="check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /><span>Plaka başka bölümde kayıtlı; inceledim, yine de ekle</span></label>}
        <div className="grid grid--kpi">
          {!unitId && <UnitPicker label="Bölüm" value={unit} onChange={setUnit} error={fieldError(m.error, "unit_id")} />}
          <Field label="Plaka" required hint="ör. 34 ABC 123" error={fieldError(m.error, "plate")}>{(p) => <input {...p} className="field__input mono" autoComplete="off" value={f.plate} onChange={(e) => setF((x) => ({ ...x, plate: plateInput(e.target.value) }))} />}</Field>
          <Field label="Marka / model">{(p) => <input {...p} className="field__input" maxLength={60} value={f.brand_model} onChange={(e) => setF((x) => ({ ...x, brand_model: e.target.value }))} />}</Field>
          <Field label="Renk">{(p) => <input {...p} className="field__input" maxLength={30} value={f.color} onChange={(e) => setF((x) => ({ ...x, color: e.target.value }))} />}</Field>
          <Field label="Tür" required error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}><option value="permanent">{vehicleKind("permanent")}</option><option value="guest">{vehicleKind("guest")}</option></select>}</Field>
          {f.kind === "guest" && <Field label="Geçerlilik" required error={fieldError(m.error, "valid_until")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.valid_until} onChange={(e) => setF((x) => ({ ...x, valid_until: e.target.value }))} />}</Field>}
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.plate.trim() || (!unitId && !unit)}>Ekle</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function VehicleSettingsCard() {
  const q = useSiteGet<VehicleSettings>("/settings/vehicles");
  const m = useSiteMutation<VehicleSettings, VehicleSettings>("PUT", "/settings/vehicles");
  if (!q.data) return null;
  const s = q.data;
  return (
    <details className="card">
      <summary className="card__head" style={{ cursor: "pointer" }}><span className="card__title">Araç ayarları</span><span className="card__meta ml-auto">bölüm başına {s.plate_limit_per_unit} plaka · {s.approval_required ? "sakin kaydı onaylı" : "sakin kaydı doğrudan etkin"}</span></summary>
      <div className="card__body row" style={{ gap: "var(--s-4)", alignItems: "flex-end" }}>
        <Field label="Bölüm başına kalıcı plaka sınırı" hint="1–10">{(p) => <input {...p} className="field__input" inputMode="numeric" style={{ width: "6rem" }} defaultValue={s.plate_limit_per_unit} onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 10 && n !== s.plate_limit_per_unit) m.mutate({ ...s, plate_limit_per_unit: n }); }} />}</Field>
        <label className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={s.approval_required} disabled={m.isPending} onChange={(e) => m.mutate({ ...s, approval_required: e.target.checked })} /><span>Sakinin eklediği plaka yönetici onayı bekler</span></label>
      </div>
      {m.error && <div className="card__foot"><Alert tone="danger">{(m.error as Error).message}</Alert></div>}
    </details>
  );
}
