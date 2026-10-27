import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useSiteGet, useSiteMutation } from "../api/hooks";
import type { Schemas } from "../api/types";
import { Field, FormError, SubmitButton, fieldError } from "./ui";
import { P, useSite } from "../site/SiteContext";

export type CustomField = Schemas["CustomFieldOut"];
type Values = Record<string, unknown>;

/**
 * Bölüm ve kişi kartlarındaki özel alanlar (YAP-10). Alanlar rol yetkisine göre süzülür; değer
 * değişikliği denetim kaydına yazılır (backend). Tanım yoksa yöneticiye kısa bir bağlantı gösterir.
 */
export function CustomValuesCard({ entity, id }: { entity: "unit" | "person"; id: string }) {
  const { site, can } = useSite();
  const fields = useSiteGet<CustomField[]>("/custom-fields", { entity });
  const path = `/${entity === "unit" ? "units" : "people"}/${id}/custom-values`;
  const values = useSiteGet<{ values: Values }>(path);
  const save = useSiteMutation<{ values: Values }, { values: Values }>("PUT", path);
  const [draft, setDraft] = useState<Values>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (values.data) { setDraft(values.data.values); setDirty(false); } }, [values.data]);

  const visible = (fields.data ?? []).filter((f) => f.view_roles.includes(site.role));
  if (fields.isPending || values.isPending) return null;
  if (visible.length === 0) {
    return can(P.modulesManage) && (fields.data ?? []).length === 0 ? (
      <p className="small muted mb-0">Bu karta ek alan eklemek için <Link to={`/s/${site.slug}/ayarlar/ozel-alanlar`}>Özel alanlar</Link>.</p>
    ) : null;
  }
  const set = (key: string, v: unknown) => { setDraft((d) => ({ ...d, [key]: v })); setDirty(true); };
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={(e) => { e.preventDefault(); save.mutate({ values: draft }, { onSuccess: () => setDirty(false) }); }}>
      <div className="section-title">Özel alanlar</div>
      <FormError error={save.error} />
      <div className="grid grid--kpi">
        {visible.map((f) => {
          const editable = f.edit_roles.includes(site.role);
          const v = draft[f.key];
          return (
            <Field key={f.id} label={f.label} required={f.required} error={fieldError(save.error, f.key)}>
              {(p) => f.type === "bool" ? (
                <label className="check" style={{ minHeight: 44 }}><input id={p.id} type="checkbox" checked={Boolean(v)} disabled={!editable} onChange={(e) => set(f.key, e.target.checked)} /><span>{v ? "Evet" : "Hayır"}</span></label>
              ) : f.type === "select" ? (
                <select {...p} className="field__input" value={String(v ?? "")} disabled={!editable} onChange={(e) => set(f.key, e.target.value)}><option value="">Seçin</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              ) : (
                <input {...p} className="field__input" type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={String(v ?? "")} readOnly={!editable} onChange={(e) => set(f.key, e.target.value)} />
              )}
            </Field>
          );
        })}
      </div>
      {dirty && visible.some((f) => f.edit_roles.includes(site.role)) && (
        <div className="row" style={{ gap: "var(--s-2)" }}>
          <SubmitButton busy={save.isPending} className="btn btn--sm btn--primary">Özel alanları kaydet</SubmitButton>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => { setDraft(values.data?.values ?? {}); setDirty(false); }}>Vazgeç</button>
        </div>
      )}
    </form>
  );
}
