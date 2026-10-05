import { useState, type FormEvent } from "react";
import { Boxes, Plus } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { MockBadge } from "../../components/MockBadge";
import { Badge, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, formatMoney, parseMoneyInput } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { assetStatus, assetStatusTone } from "../../lib/labels";
import { P, useSite } from "../../site/SiteContext";

/** Servis isteği 17'deki şekiller. Miktarlar ondalık metin (en çok 3 hane). */
interface Asset {
  id: string; code: string; name: string; category: string; location: string; acquired_on: string | null; value: string | null;
  status: "in_use" | "broken" | "retired"; assignee: string | null; note: string | null;
}
interface StockItem { id: string; name: string; unit_label: string; quantity: string; min_quantity: string; location: string | null }
interface StockMove { id: string; item_id: string; direction: "in" | "out"; quantity: string; note: string | null; moved_at: string; moved_by: string }

const UNITS = ["adet", "paket", "koli", "litre", "kg", "metre"];
const qty = (v: string) => Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
/** "1,5" ya da "1.5" → "1.5"; geçersizse null. Binlik ayracı kabul edilmez (miktar küçük). */
const parseQty = (raw: string) => {
  const t = raw.trim().replace(",", ".");
  return /^\d+(\.\d{1,3})?$/.test(t) ? t : null;
};

/** Demirbaş ve stok (Apsiyon "Stok", "Demirbaş"): sitenin malları ve sarf malzemesi. */
export function InventoryPage() {
  const [s, set] = useUrlState({ sekme: "demirbas" });
  return (
    <div className="stack">
      <PageHead title="Demirbaş ve stok" subtitle="Sitenin malları ve sarf malzemesi: nerede, kimde, ne kadar kaldı." actions={<MockBadge request="17" />} />
      <div className="row" role="tablist" aria-label="Demirbaş ve stok" style={{ gap: "var(--s-2)" }}>
        {[["demirbas", "Demirbaş"], ["stok", "Stok"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={s.sekme === k} className={`btn btn--sm${s.sekme === k ? " btn--primary" : ""}`} onClick={() => set({ sekme: k! })}>{l}</button>
        ))}
      </div>
      {s.sekme === "stok" ? <Stock /> : <Assets />}
    </div>
  );
}

function Assets() {
  const { can } = useSite();
  const [status, setStatus] = useState("");
  const q = useSiteGet<Asset[]>("/assets", { status: status || undefined });
  const [editing, setEditing] = useState<Asset | "new" | null>(null);
  const manage = can(P.expensesManage);
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <div className="field" style={{ minWidth: "12rem" }}>
          <label className="field__label" htmlFor="as-status">Durum</label>
          <select id="as-status" className="field__input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tümü</option>{["in_use", "broken", "retired"].map((k) => <option key={k} value={k}>{assetStatus(k)}</option>)}
          </select>
        </div>
        {manage && <button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Demirbaş ekle</button>}
      </div>
      {editing && <AssetForm a={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? (
            <Empty title="Demirbaş yok" icon={<Boxes aria-hidden="true" />}>Çim biçme makinesi, havuz robotu, güvenlik kamerası gibi sitenin mallarını ekleyin.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Demirbaşlar</caption>
                <thead><tr><th scope="col">Demirbaş</th><th scope="col">Yer / zimmet</th><th scope="col">Alış</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>
                  {q.data.map((a) => (
                    <tr key={a.id}>
                      <td><div className="cell-main">{a.name}</div><div className="cell-sub"><span className="mono">{a.code}</span> · {a.category}</div></td>
                      <td className="small">{a.location}{a.assignee && <div className="cell-sub">Zimmet: {a.assignee}</div>}</td>
                      <td className="small nowrap">{a.acquired_on ? formatDate(a.acquired_on) : "—"}{a.value && <div className="cell-sub">{formatMoney(a.value)}</div>}</td>
                      <td><Badge tone={assetStatusTone(a.status)}>{assetStatus(a.status)}</Badge></td>
                      <td className="right">{manage && <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(a)}>Düzenle</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AssetForm({ a, onDone }: { a: Asset | null; onDone: () => void }) {
  const [f, setF] = useState({
    name: a?.name ?? "", category: a?.category ?? "", location: a?.location ?? "", acquired_on: a?.acquired_on ?? "",
    value: a?.value ? formatMoney(a.value, false) : "", status: a?.status ?? "in_use", assignee: a?.assignee ?? "", note: a?.note ?? "",
  });
  const [valueErr, setValueErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Asset>(a ? "PATCH" : "POST", a ? `/assets/${a.id}` : "/assets", { onSuccess: onDone });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const value = f.value.trim() ? parseMoneyInput(f.value) : null;
    if (f.value.trim() && !value) { setValueErr("Tutarı 12.500,00 biçiminde girin."); return; }
    setValueErr(undefined);
    m.mutate({ ...f, value, acquired_on: f.acquired_on || null });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{a ? `${a.code} — düzenle` : "Demirbaş ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" placeholder="ör. Çim biçme makinesi" value={f.name} onChange={set("name")} />}</Field>
          <Field label="Grup" required error={fieldError(m.error, "category")}>{(p) => <input {...p} className="field__input" list="asset-groups" placeholder="ör. Bahçe ekipmanı" value={f.category} onChange={set("category")} />}</Field>
          <Field label="Yer" required error={fieldError(m.error, "location")}>{(p) => <input {...p} className="field__input" placeholder="ör. B blok depo" value={f.location} onChange={set("location")} />}</Field>
          <Field label="Durum" error={fieldError(m.error, "status")}>{(p) => <select {...p} className="field__input" value={f.status} onChange={set("status")}>{["in_use", "broken", "retired"].map((k) => <option key={k} value={k}>{assetStatus(k)}</option>)}</select>}</Field>
          <Field label="Alış tarihi" error={fieldError(m.error, "acquired_on")}>{(p) => <input {...p} className="field__input" type="date" value={f.acquired_on} onChange={set("acquired_on")} />}</Field>
          <Field label="Alış bedeli (₺)" error={valueErr ?? fieldError(m.error, "value")}>{(p) => <input {...p} className="field__input" inputMode="decimal" placeholder="12.500,00" value={f.value} onChange={set("value")} />}</Field>
          <Field label="Zimmetli kişi" hint="İsteğe bağlı">{(p) => <input {...p} className="field__input" value={f.assignee} onChange={set("assignee")} />}</Field>
        </div>
        <datalist id="asset-groups">{["Bahçe ekipmanı", "Temizlik ekipmanı", "Havuz ekipmanı", "Güvenlik sistemi", "Mobilya", "Elektronik", "Spor aleti"].map((g) => <option key={g} value={g} />)}</datalist>
        <Field label="Not">{(p) => <textarea {...p} className="field__input" rows={2} maxLength={1000} value={f.note} onChange={set("note")} />}</Field>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>{a ? "Kaydet" : "Ekle"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

function Stock() {
  const { can } = useSite();
  const q = useSiteGet<StockItem[]>("/stock-items");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const manage = can(P.expensesManage);
  const low = (q.data ?? []).filter((s) => Number(s.quantity) <= Number(s.min_quantity));
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <span className="small muted">{low.length > 0 ? `${low.length} malzeme asgari miktarın altında ya da eşiğinde.` : "Asgari miktarın altına inen malzeme yok."}</span>
        {manage && <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus aria-hidden="true" /> Malzeme ekle</button>}
      </div>
      {adding && <NewStockItem onDone={() => setAdding(false)} />}
      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? (
            <Empty title="Stok kalemi yok" icon={<Boxes aria-hidden="true" />}>Temizlik malzemesi, ampul, havuz kimyasalı gibi sarf malzemelerini ekleyin.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Stok kalemleri</caption>
                <thead><tr><th scope="col">Malzeme</th><th scope="col" className="right">Mevcut</th><th scope="col" className="right">Asgari</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>
                  {q.data.map((s) => {
                    const isLow = Number(s.quantity) <= Number(s.min_quantity);
                    return [
                      <tr key={s.id}>
                        <td><div className="cell-main">{s.name}</div>{s.location && <div className="cell-sub">{s.location}</div>}</td>
                        <td className="right nowrap strong" style={{ fontVariantNumeric: "tabular-nums" }}>{qty(s.quantity)} {s.unit_label}</td>
                        <td className="right nowrap small" style={{ fontVariantNumeric: "tabular-nums" }}>{qty(s.min_quantity)} {s.unit_label}</td>
                        <td>{isLow ? <Badge tone="warn">Azaldı</Badge> : <Badge tone="ok">Yeterli</Badge>}</td>
                        <td className="right"><button className="btn btn--ghost btn--sm" type="button" aria-expanded={open === s.id} onClick={() => setOpen((v) => (v === s.id ? null : s.id))}>{manage ? "Giriş / çıkış" : "Hareketler"}</button></td>
                      </tr>,
                      open === s.id && <tr key={`${s.id}-m`}><td colSpan={5} style={{ background: "var(--bg-sunken)" }}><StockMoves item={s} manage={manage} /></td></tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function NewStockItem({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", unit_label: "adet", min_quantity: "", location: "" });
  const [minErr, setMinErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, StockItem>("POST", "/stock-items", { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    const min = parseQty(f.min_quantity || "0");
    if (!min) { setMinErr("Asgari miktarı sayı olarak girin (ör. 5 ya da 2,5)."); return; }
    setMinErr(undefined);
    m.mutate({ ...f, min_quantity: min });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Malzeme ekle</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad" required error={fieldError(m.error, "name")}>{(p) => <input {...p} className="field__input" placeholder="ör. Çamaşır suyu 4 L" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}</Field>
          <Field label="Birim" error={fieldError(m.error, "unit_label")}>{(p) => <select {...p} className="field__input" value={f.unit_label} onChange={(e) => setF((x) => ({ ...x, unit_label: e.target.value }))}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>}</Field>
          <Field label="Asgari miktar" hint="Bunun altına inince uyarı" error={minErr ?? fieldError(m.error, "min_quantity")}>{(p) => <input {...p} className="field__input" inputMode="decimal" value={f.min_quantity} onChange={(e) => setF((x) => ({ ...x, min_quantity: e.target.value }))} />}</Field>
          <Field label="Yer">{(p) => <input {...p} className="field__input" placeholder="ör. A blok depo" value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} />}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending}>Ekle</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

function StockMoves({ item, manage }: { item: StockItem; manage: boolean }) {
  const q = useSiteGet<StockMove[]>(`/stock-items/${item.id}/moves`);
  const [f, setF] = useState({ direction: "in", quantity: "", note: "" });
  const [qtyErr, setQtyErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, unknown>("POST", `/stock-items/${item.id}/moves`, { onSuccess: () => setF((x) => ({ ...x, quantity: "", note: "" })) });
  function submit(e: FormEvent) {
    e.preventDefault();
    const quantity = parseQty(f.quantity);
    if (!quantity || Number(quantity) === 0) { setQtyErr("Sıfırdan büyük bir miktar girin."); return; }
    setQtyErr(undefined);
    m.mutate({ ...f, quantity });
  }
  return (
    <div className="stack" style={{ gap: "var(--s-3)", padding: "var(--s-2) 0" }}>
      {manage && (
        <form className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end" }} onSubmit={submit} noValidate>
          <Field label="Hareket">{(p) => <select {...p} className="field__input" value={f.direction} onChange={(e) => setF((x) => ({ ...x, direction: e.target.value }))}><option value="in">Giriş (satın alma)</option><option value="out">Çıkış (kullanım)</option></select>}</Field>
          <Field label={`Miktar (${item.unit_label})`} error={qtyErr ?? fieldError(m.error, "quantity")}>{(p) => <input {...p} className="field__input" inputMode="decimal" style={{ width: "8rem" }} value={f.quantity} onChange={(e) => setF((x) => ({ ...x, quantity: e.target.value }))} />}</Field>
          <Field label="Not">{(p) => <input {...p} className="field__input" placeholder="ör. Fatura no / kim aldı" value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />}</Field>
          <SubmitButton busy={m.isPending}>Kaydet</SubmitButton>
        </form>
      )}
      <FormError error={m.error} />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : q.data.length === 0 ? <span className="small muted">Henüz hareket yok.</span> : (
        <ul className="stack small" style={{ gap: "var(--s-1)", listStyle: "none", padding: 0, margin: 0 }}>
          {q.data.slice(0, 10).map((mv) => (
            <li key={mv.id}>
              <Badge tone={mv.direction === "in" ? "ok" : "info"}>{mv.direction === "in" ? "Giriş" : "Çıkış"}</Badge>{" "}
              <strong>{qty(mv.quantity)} {item.unit_label}</strong> · {formatDateTime(mv.moved_at)} · {mv.moved_by}{mv.note && ` · ${mv.note}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
