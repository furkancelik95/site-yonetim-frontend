import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { MockBadge } from "../../components/MockBadge";
import { Badge, FormError, SubmitButton, fieldError } from "../../components/ui";

/** Servis isteği 11'deki şekil. */
export interface Department { id: string; name: string; is_active: boolean; request_count: number }
/** Talep yanıtına eklenecek alanlar (istek 11). */
export interface WithDepartment { department_id?: string | null; department_name?: string | null }

export const useDepartments = () => useSiteGet<Department[]>("/departments");

/** Liste ve panoda departmana göre süzme. */
export function DepartmentFilter({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const d = useDepartments();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>Departman</label>
      <select id={id} className="field__input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tümü</option>
        {d.data?.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_active ? "" : " (pasif)"}</option>)}
      </select>
    </div>
  );
}

/** Talep ayrıntısında departmana yönlendirme. */
export function DepartmentAssign({ requestId, current, canAssign }: { requestId: string; current: string | null; canAssign: boolean }) {
  const d = useDepartments();
  const m = useSiteMutation<{ department_id: string | null }, unknown>("POST", `/requests/${requestId}/department`);
  const name = d.data?.find((x) => x.id === current)?.name;
  if (!canAssign) return <span>{name ?? "—"}</span>;
  return (
    <span className="row" style={{ gap: "var(--s-2)", justifyContent: "flex-end" }}>
      <select aria-label="Departman" className="field__input" style={{ minHeight: 36, padding: "4px 8px", width: "auto" }} value={current ?? ""} disabled={m.isPending} onChange={(e) => m.mutate({ department_id: e.target.value || null })}>
        <option value="">Yok</option>
        {d.data?.filter((x) => x.is_active || x.id === current).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <MockBadge request="11" />
    </span>
  );
}

/** Departman yönetimi: ekle, yeniden adlandır, pasifleştir (silme yok; geçmiş talepler korunur). */
export function DepartmentManager({ onClose }: { onClose: () => void }) {
  const d = useDepartments();
  const [name, setName] = useState("");
  const add = useSiteMutation<{ name: string }, Department>("POST", "/departments", { onSuccess: () => setName("") });
  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate({ name: name.trim() });
  }
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Departmanlar</span><span className="ml-auto row" style={{ gap: "var(--s-2)" }}><MockBadge request="11" /><button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>Kapat</button></span></div>
      <div className="card__body card__body--flush">
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">Departmanlar</caption>
            <thead><tr><th scope="col">Departman</th><th scope="col" className="right">Talep</th><th scope="col">Durum</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>
              {d.data?.map((x) => <DepartmentRow key={x.id} d={x} />)}
            </tbody>
          </table>
        </div>
      </div>
      <form className="card__foot stack" style={{ gap: "var(--s-2)" }} onSubmit={submit} noValidate>
        <FormError error={add.error} />
        <div className="row" style={{ gap: "var(--s-2)", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: "12rem" }}>
            <label className="field__label" htmlFor="dep-new">Yeni departman</label>
            <input id="dep-new" className="field__input" value={name} aria-invalid={fieldError(add.error, "name") ? true : undefined} onChange={(e) => setName(e.target.value)} placeholder="ör. Peyzaj" />
            {fieldError(add.error, "name") && <span className="field__error" role="alert">{fieldError(add.error, "name")}</span>}
          </div>
          <SubmitButton busy={add.isPending} className="btn" disabled={name.trim().length < 2}>Ekle</SubmitButton>
        </div>
      </form>
    </div>
  );
}

function DepartmentRow({ d }: { d: Department }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const m = useSiteMutation<{ name?: string; is_active?: boolean }, Department>("PATCH", `/departments/${d.id}`, { onSuccess: () => setEditing(false) });
  return (
    <tr style={!d.is_active ? { opacity: 0.6 } : undefined}>
      <td>
        {editing ? (
          <form className="row" style={{ gap: "var(--s-2)" }} onSubmit={(e) => { e.preventDefault(); m.mutate({ name: name.trim() }); }}>
            <input aria-label="Departman adı" className="field__input" style={{ minHeight: 36 }} value={name} onChange={(e) => setName(e.target.value)} />
            <SubmitButton busy={m.isPending} className="btn btn--sm" disabled={name.trim().length < 2}>Kaydet</SubmitButton>
          </form>
        ) : <span className="cell-main">{d.name}</span>}
      </td>
      <td className="right num">{d.request_count}</td>
      <td>{d.is_active ? <Badge tone="ok">Etkin</Badge> : <Badge>Pasif</Badge>}</td>
      <td className="right nowrap">
        {!editing && <button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${d.name}: yeniden adlandır`} onClick={() => setEditing(true)}><Pencil aria-hidden="true" /></button>}
        <button className="btn btn--ghost btn--sm" type="button" disabled={m.isPending} onClick={() => m.mutate({ is_active: !d.is_active })}>{d.is_active ? "Pasifleştir" : "Etkinleştir"}</button>
      </td>
    </tr>
  );
}
