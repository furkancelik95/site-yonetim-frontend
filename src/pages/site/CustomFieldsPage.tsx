import { useState, type FormEvent } from "react";
import { Asterisk, Building2, Eye, Pencil, Plus, SlidersHorizontal, UserRound } from "lucide-react";
import { ApiError } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { CustomField } from "../../components/CustomValuesCard";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { useUrlState } from "../../lib/hooks";
import { customFieldType, kvkkCategory } from "../../lib/labels";

const ROLES = ["Yönetici", "Yönetim Kurulu Üyesi", "Denetçi", "Muhasebe", "Güvenlik", "Teknik Personel"];
const TYPES = ["text", "number", "date", "bool", "select"] as const;
const KVKK = ["identity", "contact", "finance", "location_plate", "other"];

/** Özel alanlar (YAP-10): bölüm ve kişi kartlarına kod yazmadan ek alan. Tesis başına nesne türünde en fazla 30. */
export function CustomFieldsPage() {
  const [s, set] = useUrlState({ nesne: "unit", arsiv: "" });
  const q = useSiteGet<CustomField[]>("/custom-fields", { entity: s.nesne, archived: s.arsiv ? "true" : undefined });
  const [editing, setEditing] = useState<CustomField | "new" | null>(null);
  // Özet: iki nesne türünün etkin alanları (tesis başına türde en fazla 30)
  const units = useSiteGet<CustomField[]>("/custom-fields", { entity: "unit" });
  const people = useSiteGet<CustomField[]>("/custom-fields", { entity: "person" });
  const both = units.data && people.data ? [...units.data, ...people.data] : null;
  return (
    <div className="stack">
      <PageHead title="Özel alanlar" subtitle="Bölüm ve kişi kartlarına ek alanlar: evcil hayvan, depo no, bahçe kullanımı… Alanlar formlarda, listelerde ve Excel aktarımında görünür." actions={<button className="btn btn--primary" type="button" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Alan ekle</button>} />
      {!units.isError && !people.isError && (
        <div className={`grid grid--kpi${both ? " rise" : ""}`}>
          {both && units.data && people.data ? (
            <>
              <Kpi label="Bölüm alanı" icon={<Building2 aria-hidden="true" />} value={units.data.length} note={`en fazla 30 · ${30 - units.data.length} boş`} />
              <Kpi label="Kişi alanı" icon={<UserRound aria-hidden="true" />} value={people.data.length} note={`en fazla 30 · ${30 - people.data.length} boş`} />
              <Kpi label="Zorunlu" icon={<Asterisk aria-hidden="true" />} value={both.filter((f) => f.required).length} note="boş geçilemez" />
              <Kpi label="Sakine açık" icon={<Eye aria-hidden="true" />} value={both.filter((f) => f.resident_can_view || f.resident_can_edit).length} note={`${both.filter((f) => f.resident_can_edit).length} alanı sakin düzenler`} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" aria-hidden="true" />)
          )}
        </div>
      )}
      <Alert tone="info">Sağlık, din, etnik köken gibi özel nitelikli kişisel veri için alan açılmaz (KVKK m.6). Alan etiketinde bu çağrışım varsa sistem uyarır.</Alert>
      {editing && <FieldForm f={editing === "new" ? null : editing} entity={s.nesne as "unit" | "person"} onDone={() => setEditing(null)} />}
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><SlidersHorizontal aria-hidden="true" /></span>
          <div>
            <div className="card__title">Alan listesi</div>
            {q.data && <div className="card__meta">{q.data.length} alan</div>}
          </div>
          <div className="card__tools" style={{ alignItems: "center" }}>
            <div className="tabs" role="tablist" aria-label="Nesne">
              {[["unit", "Bölüm alanları"], ["person", "Kişi alanları"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.nesne === k} onClick={() => set({ nesne: k! })}>{l}</button>)}
            </div>
            <label className="check"><input type="checkbox" checked={!!s.arsiv} onChange={(e) => set({ arsiv: e.target.checked ? "1" : "" })} /><span>Arşivdekileri göster</span></label>
          </div>
        </div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.length === 0 ? <Empty title={s.arsiv ? "Arşivde alan yok" : "Henüz özel alan yok"} icon={<SlidersHorizontal aria-hidden="true" />} /> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Özel alanlar</caption>
            <thead><tr><th scope="col">Alan</th><th scope="col">Tip</th><th scope="col">KVKK</th><th scope="col">Görebilen</th><th scope="col">Sakin</th>{!s.arsiv && <th scope="col"><span className="visually-hidden">İşlem</span></th>}</tr></thead>
            <tbody>{q.data.map((f) => (
              <tr key={f.id}>
                <td><div className="cell-main">{f.label}{f.required && " *"}</div><div className="cell-sub mono">{f.key}</div></td>
                <td className="small">{customFieldType(f.type)}{f.type === "select" && <div className="cell-sub">{f.options.join(", ")}</div>}</td>
                <td className="small">{kvkkCategory(f.kvkk_category)}</td>
                <td className="small">{f.view_roles.join(", ")}<div className="cell-sub">Düzenler: {f.edit_roles.join(", ") || "—"}</div></td>
                <td className="small">{f.resident_can_edit ? <Badge tone="info">Düzenler</Badge> : f.resident_can_view ? <Badge>Görür</Badge> : "—"}</td>
                {!s.arsiv && <td className="right nowrap"><button className="btn btn--ghost btn--sm btn--icon" type="button" aria-label={`${f.label} alanını düzenle`} onClick={() => setEditing(f)}><Pencil aria-hidden="true" /></button> <ArchiveButton f={f} /></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}

function ArchiveButton({ f }: { f: CustomField }) {
  const m = useSiteMutation<Record<string, never>, CustomField>("POST", `/custom-fields/${f.id}/archive`);
  return <ConfirmButton className="btn btn--ghost btn--sm" danger title={`"${f.label}" alanını arşivle`} confirmLabel="Arşivle" body="Alan formlardan kalkar; girilmiş değerler saklama süresi boyunca korunur. Silme yoktur." onConfirm={() => m.mutateAsync({})}>Arşivle</ConfirmButton>;
}

function FieldForm({ f, entity, onDone }: { f: CustomField | null; entity: "unit" | "person"; onDone: () => void }) {
  const [d, setD] = useState({
    entity: f?.entity ?? entity, label: f?.label ?? "", type: f?.type ?? "text", options: f?.options.join("\n") ?? "", required: f?.required ?? false, kvkk_category: f?.kvkk_category ?? "other",
    view_roles: f?.view_roles ?? ["Yönetici"], edit_roles: f?.edit_roles ?? ["Yönetici"], resident_can_view: f?.resident_can_view ?? false, resident_can_edit: f?.resident_can_edit ?? false, sort_order: String(f?.sort_order ?? ""),
  });
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const m = useSiteMutation<Record<string, unknown>, CustomField>(f ? "PATCH" : "POST", f ? `/custom-fields/${f.id}` : "/custom-fields", { onSuccess: onDone });
  const sensitive = m.error instanceof ApiError && m.error.code === "sensitive_label";
  const toggle = (k: "view_roles" | "edit_roles", role: string, on: boolean) => setD((x) => ({ ...x, [k]: on ? [...x[k], role] : x[k].filter((r) => r !== role) }));
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ ...d, options: d.options.split("\n").map((o) => o.trim()).filter(Boolean), sort_order: d.sort_order === "" ? undefined : Number(d.sort_order), acknowledge_sensitive: ack, sensitive_reason: ack ? reason.trim() || undefined : undefined });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{f ? `${f.label} — düzenle` : "Özel alan ekle"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
        <FormError error={m.error} />
        {sensitive && <label className="check check--rich"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span><span className="strong">Gerekçeyle devam et</span><br /><span className="small muted">Bu alanın özel nitelikli kişisel veri içermediğini teyit ediyorum. Tercih edilen yol etiketi değiştirmektir.</span></span></label>}
        {sensitive && ack && <Field label="Gerekçe" hint="Denetim kaydına yazılır">{(p) => <input {...p} className="field__input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
        <div className="grid grid--kpi">
          <Field label="Nesne" required>{(p) => <select {...p} className="field__input" disabled={!!f} value={d.entity} onChange={(e) => setD((x) => ({ ...x, entity: e.target.value as "unit" | "person" }))}><option value="unit">Bölüm</option><option value="person">Kişi</option></select>}</Field>
          <Field label="Etiket" required error={fieldError(m.error, "label")}>{(p) => <input {...p} className="field__input" maxLength={60} placeholder="ör. Evcil hayvan" value={d.label} onChange={(e) => setD((x) => ({ ...x, label: e.target.value }))} />}</Field>
          <Field label="Tip" required hint={f ? "Tip sonradan değiştirilemez" : undefined} error={fieldError(m.error, "type")}>{(p) => <select {...p} className="field__input" disabled={!!f} value={d.type} onChange={(e) => setD((x) => ({ ...x, type: e.target.value as CustomField["type"] }))}>{TYPES.map((t) => <option key={t} value={t}>{customFieldType(t)}</option>)}</select>}</Field>
          <Field label="KVKK kategorisi" required error={fieldError(m.error, "kvkk_category")}>{(p) => <select {...p} className="field__input" value={d.kvkk_category} onChange={(e) => setD((x) => ({ ...x, kvkk_category: e.target.value as CustomField["kvkk_category"] }))}>{KVKK.map((k) => <option key={k} value={k}>{kvkkCategory(k)}</option>)}</select>}</Field>
          <Field label="Sıra">{(p) => <input {...p} className="field__input" inputMode="numeric" value={d.sort_order} onChange={(e) => setD((x) => ({ ...x, sort_order: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />}</Field>
        </div>
        {d.type === "select" && <Field label="Seçenekler" required hint="Her satıra bir seçenek" error={fieldError(m.error, "options")}>{(p) => <textarea {...p} className="field__input" rows={4} value={d.options} onChange={(e) => setD((x) => ({ ...x, options: e.target.value }))} />}</Field>}
        <div className="grid grid--2">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Görebilen roller *</legend><div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>{ROLES.map((r) => <label key={r} className="check"><input type="checkbox" checked={d.view_roles.includes(r)} onChange={(e) => toggle("view_roles", r, e.target.checked)} /><span>{r}</span></label>)}</div>{fieldError(m.error, "view_roles") && <span className="field__error" role="alert">{fieldError(m.error, "view_roles")}</span>}</fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field__label">Düzenleyebilen roller</legend><div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>{ROLES.map((r) => <label key={r} className="check"><input type="checkbox" checked={d.edit_roles.includes(r)} onChange={(e) => toggle("edit_roles", r, e.target.checked)} /><span>{r}</span></label>)}</div></fieldset>
        </div>
        <div className="row" style={{ gap: "var(--s-2) var(--s-4)" }}>
          <label className="check"><input type="checkbox" checked={d.required} onChange={(e) => setD((x) => ({ ...x, required: e.target.checked }))} /><span>Zorunlu (mevcut kayıtlarda boşsa uyarı, engel yok)</span></label>
          <label className="check"><input type="checkbox" checked={d.resident_can_view} onChange={(e) => setD((x) => ({ ...x, resident_can_view: e.target.checked, resident_can_edit: e.target.checked && x.resident_can_edit }))} /><span>Sakin görür</span></label>
          <label className="check"><input type="checkbox" checked={d.resident_can_edit} disabled={!d.resident_can_view} onChange={(e) => setD((x) => ({ ...x, resident_can_edit: e.target.checked }))} /><span>Sakin düzenler</span></label>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!d.label.trim() || d.view_roles.length === 0}>{f ? "Kaydet" : "Ekle"}</SubmitButton><button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button></div>
    </form>
  );
}
