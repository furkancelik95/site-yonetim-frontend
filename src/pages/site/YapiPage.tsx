import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Layers, Pencil, Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Badge, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { useUrlState } from "../../lib/hooks";
import { commonAreaKind } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Block = Schemas["BlockOut"];
type UnitType = Schemas["UnitTypeOut"];
/** Servis isteği 19'daki şekiller. */
interface CommonArea { id: string; name: string; kind: string; block_id: string | null; block_name: string | null; is_reservable: boolean; is_active: boolean; note: string | null }
export interface StructureSummary {
  unit_count: number; active_unit_count: number; block_count: number; land_share_sum: number; land_share_denominator: number | null; land_share_mismatch: boolean;
  units_without_land_share: number; units_without_owner: { id: string; display_name: string }[]; units_shares_incomplete: { id: string; display_name: string; total: string }[]; common_area_count: number;
}

const AREA_KINDS = ["pool", "hall", "gym", "garden", "playground", "parking", "technical", "roof", "other"];
const TABS = [["bloklar", "Bloklar"], ["tipler", "Bölüm tipleri"], ["ortak", "Ortak alanlar"]] as const;

/** Yapı tanımları (YAP-02): bloklar, bölüm tipleri, ortak alanlar; yapının sağlık özeti. */
export function YapiPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ sekme: "bloklar" });
  const sum = useSiteGet<StructureSummary>("/structure/summary");
  const manage = can(P.unitsManage);
  return (
    <div className="stack">
      <PageHead title="Yapı tanımları" subtitle="Bloklar, bölüm tipleri ve ortak alanlar: fiziksel yapının tek doğru kaynağı." actions={<Link className="btn" to={`/s/${site.slug}/daireler`}>Daireler</Link>} />
      {sum.data && (
        <div className="grid grid--kpi">
          <Kpi label="Blok" value={sum.data.block_count} />
          <Kpi label="Bölüm" value={sum.data.active_unit_count} note={sum.data.unit_count !== sum.data.active_unit_count ? `${sum.data.unit_count - sum.data.active_unit_count} pasif` : undefined} />
          <Kpi label="Arsa payı" value={sum.data.land_share_denominator ? `${sum.data.land_share_sum} / ${sum.data.land_share_denominator}` : "—"} tone={sum.data.land_share_mismatch ? "warn" : undefined} note={sum.data.land_share_mismatch ? "Toplam paydaya eşit değil" : sum.data.units_without_land_share ? `${sum.data.units_without_land_share} bölümde yok` : "Tamam"} />
          <Kpi label="Maliksiz bölüm" value={sum.data.units_without_owner.length} tone={sum.data.units_without_owner.length ? "danger" : "ok"} />
          <Kpi label="Hissesi eksik bölüm" value={sum.data.units_shares_incomplete.length} tone={sum.data.units_shares_incomplete.length ? "warn" : "ok"} />
        </div>
      )}
      {sum.data?.land_share_mismatch && <Alert tone="warn" title="Arsa payları toplamı paydaya eşit değil">Toplam {sum.data.land_share_sum}, payda {sum.data.land_share_denominator}. Kayıt engellenmez; arsa payına göre dağıtılan giderler yanlış paylaşılır, bölümleri kontrol edin.</Alert>}
      <div className="row" role="tablist" aria-label="Yapı tanımları" style={{ gap: "var(--s-2)" }}>
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className={`btn btn--sm${s.sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k })}>{l}</button>)}
      </div>
      {s.sekme === "tipler" ? <UnitTypes manage={manage} /> : s.sekme === "ortak" ? <CommonAreas manage={manage} /> : <Blocks manage={manage} />}
    </div>
  );
}

function Blocks({ manage }: { manage: boolean }) {
  const q = useSiteGet<Page<Block>>("/blocks", { page_size: 200 });
  const [editing, setEditing] = useState<Block | "new" | null>(null);
  return (
    <>
      {manage && <div className="row"><button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Blok ekle</button></div>}
      {editing && <BlockForm b={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Blok yok" icon={<Layers aria-hidden="true" />}>Tek binalı sitede bile bir blok tanımlanır (ör. "A").</Empty> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Bloklar</caption>
            <thead><tr><th scope="col">Blok</th><th scope="col" className="right">Kat</th><th scope="col">Asansör</th><th scope="col" className="right">Bölüm</th><th scope="col" className="right">Sıra</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.items.map((b) => (
              <tr key={b.id}>
                <td className="cell-main">{b.name}</td>
                <td className="right num">{b.floor_count ?? "—"}</td>
                <td className="small">{b.has_elevator ? "Var" : "Yok"}</td>
                <td className="right num">{b.unit_count}</td>
                <td className="right num small">{b.sort_order}</td>
                {manage && <td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${b.name} bloğunu düzenle`} onClick={() => setEditing(b)}><Pencil aria-hidden="true" /></button></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function BlockForm({ b, onDone }: { b: Block | null; onDone: () => void }) {
  const [f, setF] = useState({ name: b?.name ?? "", floor_count: b?.floor_count != null ? String(b.floor_count) : "", has_elevator: b?.has_elevator ?? false, sort_order: String(b?.sort_order ?? 0) });
  const m = useSiteMutation<Record<string, unknown>, Block>(b ? "PATCH" : "POST", b ? `/blocks/${b.id}` : "/blocks", { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ name: f.name.trim(), floor_count: f.floor_count === "" ? null : Number(f.floor_count), has_elevator: f.has_elevator, sort_order: Number(f.sort_order || 0) });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{b ? `${b.name} — düzenle` : "Blok ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad / kod" required hint="Bölüm kodunda kullanılır: {blok}-{no}" error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={20} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
          <Field label="Kat sayısı" error={fieldError(m.error, "floor_count")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.floor_count} onChange={(e) => setF((x) => ({ ...x, floor_count: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />}</Field>
          <Field label="Sıra" error={fieldError(m.error, "sort_order")}>{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.sort_order} onChange={(e) => setF((x) => ({ ...x, sort_order: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.has_elevator} onChange={(e) => setF((x) => ({ ...x, has_elevator: e.target.checked }))} /><span>Asansör var (asansör gideri yalnız bu bloklara dağıtılır)</span></label>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.name.trim()}>{b ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function UnitTypes({ manage }: { manage: boolean }) {
  const q = useSiteGet<Page<UnitType>>("/unit-types", { page_size: 200 });
  const [editing, setEditing] = useState<UnitType | "new" | null>(null);
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <p className="small muted mb-0">Daire tipi (1+1, 2+1, dükkan, ofis…) aidat kuralında katsayı olarak kullanılabilir.</p>
        {manage && <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Tip ekle</button>}
      </div>
      {editing && <UnitTypeForm t={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Bölüm tipi yok" /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Bölüm tipleri</caption>
            <thead><tr><th scope="col">Tip</th><th scope="col" className="right">Katsayı</th><th scope="col" className="right">Sıra</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.items.map((t) => (
              <tr key={t.id}><td className="cell-main">{t.name}</td><td className="right num">{Number(t.weight).toLocaleString("tr-TR")}</td><td className="right num small">{t.sort_order}</td>
                {manage && <td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${t.name} tipini düzenle`} onClick={() => setEditing(t)}><Pencil aria-hidden="true" /></button></td>}</tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function UnitTypeForm({ t, onDone }: { t: UnitType | null; onDone: () => void }) {
  const [f, setF] = useState({ name: t?.name ?? "", weight: t ? Number(t.weight).toLocaleString("tr-TR") : "1", sort_order: String(t?.sort_order ?? "") });
  const m = useSiteMutation<Record<string, unknown>, UnitType>(t ? "PATCH" : "POST", t ? `/unit-types/${t.id}` : "/unit-types", { onSuccess: onDone });
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ name: f.name.trim(), weight: f.weight.replace(",", "."), sort_order: f.sort_order === "" ? undefined : Number(f.sort_order) }); }}>
      <div className="card__head"><span className="card__title">{t ? `${t.name} — düzenle` : "Bölüm tipi ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={40} placeholder="ör. 3+1" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
          <Field label="Katsayı" hint="Aidat kuralında tipe göre dağıtımda; 1 = standart" error={fieldError(m.error, "weight")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.weight} onChange={(e) => setF((x) => ({ ...x, weight: e.target.value }))} />}</Field>
          <Field label="Sıra">{(p) => <input {...p} className="field__input" inputMode="numeric" value={f.sort_order} onChange={(e) => setF((x) => ({ ...x, sort_order: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.name.trim()}>{t ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function CommonAreas({ manage }: { manage: boolean }) {
  const q = useSiteGet<CommonArea[]>("/common-areas");
  const [editing, setEditing] = useState<CommonArea | "new" | null>(null);
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <p className="small muted mb-0">Havuz, salon, otopark gibi ortak alanlar; rezerve edilebilir olanlar rezervasyon modülüne bağlanır.</p>
        {manage && <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Ortak alan ekle</button>}
      </div>
      {editing && <CommonAreaForm a={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="card"><div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title="Ortak alan tanımlanmamış" /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Ortak alanlar</caption>
            <thead><tr><th scope="col">Alan</th><th scope="col">Tür</th><th scope="col">Blok</th><th scope="col">Rezervasyon</th><th scope="col">Durum</th>{manage && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.map((a) => (
              <tr key={a.id} style={!a.is_active ? { opacity: 0.6 } : undefined}>
                <td><div className="cell-main">{a.name}</div>{a.note && <div className="cell-sub">{a.note}</div>}</td>
                <td className="small">{commonAreaKind(a.kind)}</td><td className="small">{a.block_name ?? "Tüm site"}</td>
                <td className="small">{a.is_reservable ? <Badge tone="info">Rezerve edilebilir</Badge> : "—"}</td>
                <td>{a.is_active ? <Badge tone="ok">Etkin</Badge> : <Badge>Kapalı</Badge>}</td>
                {manage && <td className="right"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${a.name} alanını düzenle`} onClick={() => setEditing(a)}><Pencil aria-hidden="true" /></button></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </>
  );
}

function CommonAreaForm({ a, onDone }: { a: CommonArea | null; onDone: () => void }) {
  const blocks = useSiteGet<Page<Block>>("/blocks", { page_size: 200 });
  const [f, setF] = useState({ name: a?.name ?? "", kind: a?.kind ?? "hall", block_id: a?.block_id ?? "", is_reservable: a?.is_reservable ?? false, is_active: a?.is_active ?? true, note: a?.note ?? "" });
  const m = useSiteMutation<Record<string, unknown>, CommonArea>(a ? "PATCH" : "POST", a ? `/common-areas/${a.id}` : "/common-areas", { onSuccess: onDone });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ ...f, block_id: f.block_id || null, note: f.note.trim() || null }); }}>
      <div className="card__head"><span className="card__title">{a ? `${a.name} — düzenle` : "Ortak alan ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" maxLength={60} placeholder="ör. Kapalı havuz" value={f.name} onChange={set("name")} />}</Field>
          <Field label="Tür" required error={fieldError(m.error, "kind")}>{(p) => <select {...p} className="field__input" value={f.kind} onChange={set("kind")}>{AREA_KINDS.map((k) => <option key={k} value={k}>{commonAreaKind(k)}</option>)}</select>}</Field>
          <Field label="Blok" hint="Boş: tüm siteye ait" error={fieldError(m.error, "block_id")}>{(p) => <select {...p} className="field__input" value={f.block_id} onChange={set("block_id")}><option value="">Tüm site</option>{blocks.data?.items.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</Field>
          <Field label="Not">{(p) => <input {...p} className="field__input" maxLength={200} value={f.note} onChange={set("note")} />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.is_reservable} onChange={(e) => setF((x) => ({ ...x, is_reservable: e.target.checked }))} /><span>Rezerve edilebilir (rezervasyon modülü açılınca kullanılır)</span></label>
        {a && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /><span>Etkin</span></label>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.name.trim()}>{a ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
