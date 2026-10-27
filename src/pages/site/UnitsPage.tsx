import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Building2, Car, Home, Layers, Percent, Plus, Store, UserX, Warehouse } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Alert, Avatar, Empty, ErrorState, Field, FormError, IconChip, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDecimal } from "../../lib/format";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { unitUsage } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";
import type { StructureSummary } from "./YapiPage";

type Unit = Schemas["UnitListItem"];
type Block = Schemas["BlockOut"];
type UnitType = Schemas["UnitTypeOut"];

const PAGE_SIZE = 50;
/** Kullanım türü → satır başındaki ikon (dekoratif; metin yanında yazılı) */
const USAGE_ICON: Record<string, typeof Home> = { residential: Home, commercial: Store, storage: Warehouse, parking: Car };

export function UnitsPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ q: "", block: "", page: "1" });
  const [search, setSearch] = useState(s.q);
  const q = useDebounced(search);
  useEffect(() => {
    if (q !== s.q) set({ q, page: "1" });
  }, [q]);
  const manage = can(P.unitsManage);
  const blocks = useSiteGet<Page<Block>>("/blocks", { page_size: 200 });
  const units = useSiteGet<Page<Unit>>("/units", { q: s.q, block_id: s.block, page: s.page, page_size: PAGE_SIZE });
  // Yapı sağlığı (istek 19): maliksiz bölüm, arsa payı uyuşmazlığı — yöneticiye uyarı
  const sum = useSiteGet<StructureSummary>("/structure/summary", undefined, { enabled: manage });
  const [adding, setAdding] = useState(false);
  // Toplu düzenleme: sayfadaki seçim (istek 19)
  const [sel, setSel] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const items = units.data?.items ?? [];
  const allOn = items.length > 0 && items.every((u) => sel.includes(u.id));
  const toggleAll = () => setSel(allOn ? sel.filter((id) => !items.some((u) => u.id === id)) : [...new Set([...sel, ...items.map((u) => u.id)])]);
  const toggleOne = (id: string) => setSel((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));

  return (
    <div className="stack">
      <PageHead
        title="Daireler"
        subtitle={units.data ? `${units.data.total} bağımsız bölüm` : undefined}
        actions={manage && (
          <>
            <Link className="btn" to={`/s/${site.slug}/yapi`}>Yapı tanımları</Link>
            <Link className="btn" to={`/s/${site.slug}/belge/hazirun`}>Hazirun listesi</Link>
            <Link className="btn" to={`/s/${site.slug}/iceri-aktar`}>Excel'den aktar</Link>
            <button className="btn btn--primary" type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding}><Plus aria-hidden="true" /> Bölüm ekle</button>
          </>
        )}
      />
      {/* Izgara özet yüklenirken de durur (iskelet): başlık bandı KPI'lara yer ayırır, sayfa zıplamaz */}
      {manage && !sum.isError && (
        <div className={`grid grid--kpi${sum.data ? " rise" : ""}`}>
          {sum.data ? (
            <>
              <Kpi label="Bölüm" icon={<Building2 aria-hidden="true" />} value={sum.data.active_unit_count} note={sum.data.unit_count !== sum.data.active_unit_count ? `${sum.data.unit_count - sum.data.active_unit_count} pasif` : "tümü etkin"} />
              <Kpi label="Blok" icon={<Layers aria-hidden="true" />} value={sum.data.block_count} note={`${sum.data.common_area_count} ortak alan`} />
              <Kpi label="Maliksiz bölüm" icon={<UserX aria-hidden="true" />} tone={sum.data.units_without_owner.length ? "danger" : "ok"} value={sum.data.units_without_owner.length} note={sum.data.units_shares_incomplete.length ? `${sum.data.units_shares_incomplete.length} bölümde hisse eksik` : "hisseler tam"} />
              <Kpi label="Arsa payı" icon={<Percent aria-hidden="true" />} tone={sum.data.land_share_mismatch ? "warn" : undefined} value={sum.data.land_share_denominator ? `${sum.data.land_share_sum} / ${sum.data.land_share_denominator}` : "—"} note={sum.data.land_share_mismatch ? "toplam paydaya eşit değil" : sum.data.units_without_land_share ? `${sum.data.units_without_land_share} bölümde yok` : "tamam"} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" aria-hidden="true" />)
          )}
        </div>
      )}
      {sum.data && (sum.data.units_without_owner.length > 0 || sum.data.land_share_mismatch) && (
        <Alert tone="warn" title="Yapı kontrolü">
          {sum.data.units_without_owner.length > 0 && <>{sum.data.units_without_owner.length} bölümün maliki yok: {sum.data.units_without_owner.slice(0, 6).map((u) => <Link key={u.id} to={u.id}>{u.display_name}</Link>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}{sum.data.units_without_owner.length > 6 && "…"}. </>}
          {sum.data.land_share_mismatch && <>Arsa payları toplamı ({sum.data.land_share_sum}) paydaya ({sum.data.land_share_denominator}) eşit değil. </>}
          <Link to={`/s/${site.slug}/yapi`}>Yapı özeti</Link>
        </Alert>
      )}

      {adding && <NewUnitForm blocks={blocks.data?.items ?? []} onDone={() => setAdding(false)} />}

      {manage && sel.length > 0 && (
        <div className="bulkbar" role="region" aria-label="Seçim">
          <span className="strong">{sel.length} bölüm seçili</span>
          <button className="btn btn--sm btn--primary" type="button" aria-expanded={bulk} onClick={() => setBulk((v) => !v)}>Toplu düzenle</button>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => { setSel([]); setBulk(false); }}>Seçimi kaldır</button>
        </div>
      )}
      {manage && bulk && sel.length > 0 && <BulkForm ids={sel} onDone={() => { setBulk(false); setSel([]); }} />}

      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><Building2 aria-hidden="true" /></span>
          <div>
            <div className="card__title">Bağımsız bölümler</div>
            {units.data && <div className="card__meta">{units.data.total} kayıt</div>}
          </div>
          <div className="card__tools">
            <div className="field">
              <label className="field__label" htmlFor="unit-q">Ara</label>
              <input id="unit-q" className="field__input" type="search" placeholder="Bölüm, malik ya da kiracı adı" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="unit-block">Blok</label>
              <select id="unit-block" className="field__input" value={s.block} onChange={(e) => set({ block: e.target.value, page: "1" })}>
                <option value="">Tümü</option>
                {blocks.data?.items.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="card__body card__body--flush">
          {units.isPending ? (
            <Loading />
          ) : units.isError ? (
            <div className="card__body"><ErrorState error={units.error} onRetry={() => units.refetch()} /></div>
          ) : units.data.items.length === 0 ? (
            <Empty title={s.q || s.block ? "Aramaya uyan bölüm yok" : "Henüz bölüm yok"} icon={<Building2 aria-hidden="true" />}>
              {s.q || s.block ? "Arama ya da blok filtresini değiştirin." : "Bölüm ekleyin ya da Excel'den toplu aktarın."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Bağımsız bölümler</caption>
                <thead>
                  <tr>
                    {manage && <th scope="col" style={{ width: 44 }}><input type="checkbox" aria-label="Sayfadaki bölümleri seç" checked={allOn} onChange={toggleAll} /></th>}
                    <th scope="col">Bölüm</th>
                    <th scope="col">Tip</th>
                    <th scope="col" className="right">Brüt m²</th>
                    <th scope="col" className="right">Arsa payı</th>
                    <th scope="col">Malik</th>
                    <th scope="col">Kiracı</th>
                  </tr>
                </thead>
                <tbody>
                  {units.data.items.map((u) => {
                    const UsageIcon = USAGE_ICON[u.usage] ?? Building2;
                    return (
                      <tr key={u.id} style={!u.is_active ? { opacity: 0.6 } : undefined}>
                        {manage && <td><input type="checkbox" aria-label={`${u.display_name} seç`} checked={sel.includes(u.id)} onChange={() => toggleOne(u.id)} /></td>}
                        <td>
                          <div className="cell-chip">
                            <IconChip tone={u.is_active ? undefined : "muted"}><UsageIcon /></IconChip>
                            <div>
                              <Link to={u.id} className="cell-main">{u.display_name}</Link>
                              <div className="cell-sub">
                                {u.floor !== null && u.floor !== undefined ? `${u.floor}. kat · ` : ""}
                                {unitUsage(u.usage)}
                                {!u.is_active && " · Pasif"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="small">{u.unit_type?.name ?? "—"}</td>
                        <td className="right num">{formatDecimal(u.gross_area)}</td>
                        <td className="right num small">
                          {u.land_share_numerator && u.land_share_denominator ? `${u.land_share_numerator}/${u.land_share_denominator}` : "—"}
                        </td>
                        <td className="small">
                          {u.owner_names.length > 0 ? (
                            <div className="cell-person"><Avatar name={u.owner_names[0]} size="sm" soft /><span>{u.owner_names.join(", ")}</span></div>
                          ) : <span className="field__error">Malik yok</span>}
                        </td>
                        <td className="small">
                          {u.tenant_names.length > 0 ? (
                            <div className="cell-person"><Avatar name={u.tenant_names[0]} size="sm" soft /><span>{u.tenant_names.join(", ")}</span></div>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {units.data && (
          <div className="card__foot">
            <Pager page={units.data.page} pageSize={units.data.page_size} total={units.data.total} onPage={(p) => set({ page: String(p) })} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Toplu düzenleme (istek 19): tip, kullanım, durum — boş bırakılan alan değişmez. */
function BulkForm({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const types = useSiteGet<Page<UnitType>>("/unit-types", { page_size: 200 });
  const [f, setF] = useState({ unit_type_id: "", usage: "", is_active: "" });
  const m = useSiteMutation<Record<string, unknown>, { updated: number; failed: { unit_id: string; message: string }[] }>("POST", "/units/bulk-update", { onSuccess: onDone });
  const changes: Record<string, unknown> = {};
  if (f.unit_type_id) changes.unit_type_id = f.unit_type_id === "__none" ? null : f.unit_type_id;
  if (f.usage) changes.usage = f.usage;
  if (f.is_active) changes.is_active = f.is_active === "1";
  const n = Object.keys(changes).length;
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ unit_ids: ids, changes }); }}>
      <div className="card__head"><span className="card__title">Toplu düzenle — {ids.length} bölüm</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Daire tipi">{(p) => <select {...p} className="field__input" value={f.unit_type_id} onChange={(e) => setF((x) => ({ ...x, unit_type_id: e.target.value }))}><option value="">(değiştirme)</option><option value="__none">Tip yok</option>{types.data?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</Field>
          <Field label="Kullanım">{(p) => <select {...p} className="field__input" value={f.usage} onChange={(e) => setF((x) => ({ ...x, usage: e.target.value }))}><option value="">(değiştirme)</option>{["residential", "commercial", "storage", "parking"].map((u) => <option key={u} value={u}>{unitUsage(u)}</option>)}</select>}</Field>
          <Field label="Durum">{(p) => <select {...p} className="field__input" value={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.value }))}><option value="">(değiştirme)</option><option value="1">Etkin</option><option value="0">Pasif</option></select>}</Field>
        </div>
        <p className="small muted mb-0">m² ve arsa payı toplu değiştirilmez; yürürlük tarihi gerektirir (bölüm kartından ya da Excel'den).</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={n === 0}>{ids.length} bölümü güncelle</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}

function NewUnitForm({ blocks, onDone }: { blocks: Block[]; onDone: () => void }) {
  const types = useSiteGet<Page<UnitType>>("/unit-types", { page_size: 200 });
  const [f, setF] = useState({ block_id: blocks[0]?.id ?? "", number: "", floor: "", unit_type_id: "", gross_area: "", net_area: "", usage: "residential" });
  const m = useSiteMutation<Record<string, unknown>, Schemas["UnitDetail"]>("POST", "/units", { onSuccess: onDone });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({
      block_id: f.block_id,
      number: f.number.trim(),
      floor: f.floor === "" ? null : Number(f.floor),
      unit_type_id: f.unit_type_id || null,
      gross_area: f.gross_area.replace(",", ".") || null,
      net_area: f.net_area.replace(",", ".") || null,
      usage: f.usage,
    });
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Yeni bölüm</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Blok" required error={fieldError(m.error, "block_id")}>
            {(p) => (
              <select {...p} className="field__input" value={f.block_id} onChange={up("block_id")}>
                {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Bölüm no" required error={fieldError(m.error, "number")}>
            {(p) => <input {...p} className="field__input" value={f.number} onChange={up("number")} />}
          </Field>
          <Field label="Kat" error={fieldError(m.error, "floor")}>
            {(p) => <input {...p} className="field__input" inputMode="numeric" value={f.floor} onChange={up("floor")} />}
          </Field>
          <Field label="Daire tipi">
            {(p) => (
              <select {...p} className="field__input" value={f.unit_type_id} onChange={up("unit_type_id")}>
                <option value="">Seçilmedi</option>
                {types.data?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Brüt m²" error={fieldError(m.error, "gross_area")}>
            {(p) => <input {...p} className="field__input" inputMode="decimal" value={f.gross_area} onChange={up("gross_area")} />}
          </Field>
          <Field label="Net m²" error={fieldError(m.error, "net_area")}>
            {(p) => <input {...p} className="field__input" inputMode="decimal" value={f.net_area} onChange={up("net_area")} />}
          </Field>
          <Field label="Kullanım">
            {(p) => (
              <select {...p} className="field__input" value={f.usage} onChange={up("usage")}>
                {["residential", "commercial", "storage", "parking"].map((u) => <option key={u} value={u}>{unitUsage(u)}</option>)}
              </select>
            )}
          </Field>
        </div>
        {blocks.length === 0 && <p className="small muted mb-0">Önce <Link to="../yapi">Yapı tanımları</Link>'ndan blok ekleyin.</p>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.block_id || !f.number.trim()}>Kaydet</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
