import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Building2, Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { Empty, ErrorState, Field, FormError, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDecimal } from "../../lib/format";
import { useDebounced, useUrlState } from "../../lib/hooks";
import { unitUsage } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

type Unit = Schemas["UnitListItem"];
type Block = Schemas["BlockOut"];
type UnitType = Schemas["UnitTypeOut"];

const PAGE_SIZE = 50;

export function UnitsPage() {
  const { site, can } = useSite();
  const [s, set] = useUrlState({ q: "", block: "", page: "1" });
  const [search, setSearch] = useState(s.q);
  const q = useDebounced(search);
  useEffect(() => {
    if (q !== s.q) set({ q });
  }, [q]);

  const blocks = useSiteGet<Page<Block>>("/blocks", { page_size: 200 });
  const units = useSiteGet<Page<Unit>>("/units", { q: s.q, block_id: s.block, page: s.page, page_size: PAGE_SIZE });
  const [adding, setAdding] = useState(false);

  return (
    <div className="stack">
      <PageHead
        title="Daireler"
        subtitle={units.data ? `${units.data.total} bağımsız bölüm` : undefined}
        actions={
          can(P.unitsManage) && (
            <>
              <Link className="btn" to={`/s/${site.slug}/belge/hazirun`}>Hazirun listesi</Link>
              <Link className="btn" to={`/s/${site.slug}/iceri-aktar`}>Excel'den aktar</Link>
              <button className="btn btn--primary" type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
                <Plus aria-hidden="true" /> Bölüm ekle
              </button>
            </>
          )
        }
      />

      {adding && <NewUnitForm blocks={blocks.data?.items ?? []} onDone={() => setAdding(false)} />}

      <div className="filters">
        <div className="field">
          <label className="field__label" htmlFor="unit-q">Ara</label>
          <input id="unit-q" className="field__input" type="search" placeholder="Bölüm, malik ya da kiracı adı" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="unit-block">Blok</label>
          <select id="unit-block" className="field__input" value={s.block} onChange={(e) => set({ block: e.target.value })}>
            <option value="">Tümü</option>
            {blocks.data?.items.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
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
                    <th scope="col">Bölüm</th>
                    <th scope="col">Tip</th>
                    <th scope="col" className="right">Brüt m²</th>
                    <th scope="col" className="right">Arsa payı</th>
                    <th scope="col">Malik</th>
                    <th scope="col">Kiracı</th>
                  </tr>
                </thead>
                <tbody>
                  {units.data.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <Link to={u.id} className="cell-main">{u.display_name}</Link>
                        <div className="cell-sub">
                          {u.floor !== null && u.floor !== undefined ? `${u.floor}. kat · ` : ""}
                          {unitUsage(u.usage)}
                          {!u.is_active && " · Pasif"}
                        </div>
                      </td>
                      <td className="small">{u.unit_type?.name ?? "—"}</td>
                      <td className="right num">{formatDecimal(u.gross_area)}</td>
                      <td className="right num small">
                        {u.land_share_numerator && u.land_share_denominator ? `${u.land_share_numerator}/${u.land_share_denominator}` : "—"}
                      </td>
                      <td className="small">{u.owner_names.join(", ") || "—"}</td>
                      <td className="small">{u.tenant_names.join(", ") || "—"}</td>
                    </tr>
                  ))}
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
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.block_id || !f.number.trim()}>Kaydet</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
