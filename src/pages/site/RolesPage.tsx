import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Copy, Pencil, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { get } from "../../api/client";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { useSite } from "../../site/SiteContext";

type Role = Schemas["RoleOut"];
type Group = Schemas["PermissionGroupOut"];
type Sensitivity = Schemas["Sensitivity"];

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SENSITIVITY: Record<Sensitivity, { label: string; tone: "danger" | "warn" | "muted" }> = {
  critical: { label: "Kritik", tone: "danger" },
  sensitive: { label: "Hassas", tone: "warn" },
  normal: { label: "Normal", tone: "muted" },
};

/** İzin ağacı (GET /api/v1/permissions): grup → izin, açıklama ve hassasiyet. */
function usePermissionGroups() {
  return useQuery({ queryKey: ["permissions"], queryFn: ({ signal }) => get<Group[]>("/permissions", undefined, signal), staleTime: Infinity });
}

/**
 * Roller ve yetkiler (PLT-09; PM kararları P18, K20). Hazır rol şablonları salt okunurdur; "Kopyala
 * ve özelleştir" ile siteye özel rol oluşturulur. Rol düzeyi (1 en üst) yetki devrinde "aynı ya da
 * üst rol" ve eskalasyon önerisi için kullanılır; site kendi sırasını belirler. Kendi sahip
 * olmadığınız izni role ekleyemezsiniz (backend 403).
 */
export function RolesPage() {
  const { site } = useSite();
  const [archived, setArchived] = useState(false);
  const q = useSiteGet<Role[]>("/roles", { include_archived: archived ? "true" : undefined });
  const groups = usePermissionGroups();
  const [form, setForm] = useState<{ mode: "copy" | "edit"; role: Role } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="stack">
      <PageHead
        title="Roller ve yetkiler"
        subtitle="Hazır roller değiştirilemez; kopyalayıp izinlerini seçerek siteye özel rol oluşturun. Düzey 1 en üsttür: yetki devri aynı ya da üst düzeydeki role yapılır, süresi geçen onay bir üst düzeye önerilir."
        actions={<>
          <Link className="btn" to={`/s/${site.slug}/kullanicilar`}>Kullanıcılar</Link>
          <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /><span>Arşivdekiler</span></label>
        </>}
      />
      {form && <RoleForm key={`${form.mode}-${form.role.key}`} mode={form.mode} role={form.role} roles={q.data ?? []} groups={groups.data ?? []} onDone={() => setForm(null)} />}

      <div className="card">
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : q.data.length === 0 ? (
            <Empty title="Rol yok" icon={<ShieldCheck aria-hidden="true" />} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Roller</caption>
                <thead><tr><th scope="col">Rol</th><th scope="col">Düzey</th><th scope="col">İzinler</th><th scope="col">Kişi</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>
                  {q.data.map((r) => (
                    <RoleRow key={r.key} r={r} groups={groups.data ?? []} expanded={open === r.key} onToggle={() => setOpen((x) => (x === r.key ? null : r.key))} onCopy={() => setForm({ mode: "copy", role: r })} onEdit={() => setForm({ mode: "edit", role: r })} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card__foot">
          <p className="small muted mb-0">Rol adı onay kurallarında rolü tanıttığı için sonradan değiştirilmez. Kritik izin içeren rol atamaları ileride onaydan geçecek (K21). Kişide atanmış rol arşivlenemez; önce atamaları kaldırın.</p>
        </div>
      </div>
    </div>
  );
}

function RoleRow({ r, groups, expanded, onToggle, onCopy, onEdit }: { r: Role; groups: Group[]; expanded: boolean; onToggle: () => void; onCopy: () => void; onEdit: () => void }) {
  const level = useSiteMutation<{ level: number }, Role>("PATCH", `/roles/${r.key}`);
  const archive = useSiteMutation<{ is_active: boolean }, Role>("PATCH", `/roles/${r.key}`);
  const custom = r.kind === "custom";
  return (
    <>
      <tr style={!r.is_active ? { opacity: 0.6 } : undefined}>
        <td>
          <div className="cell-main">{r.name} {custom ? <Badge tone="info">Özel</Badge> : <Badge>Hazır</Badge>} {!r.is_active && <Badge>Arşivde</Badge>}</div>
          <div className="cell-sub">{r.description || "—"}</div>
        </td>
        <td>
          <select aria-label={`${r.name} düzeyi`} className="field__input" style={{ minHeight: 36, padding: "4px 8px", width: "auto" }} value={r.level} disabled={level.isPending || !r.is_active} onChange={(e) => level.mutate({ level: Number(e.target.value) })}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}{l === 1 ? " (en üst)" : ""}</option>)}
          </select>
          {level.error && <div className="field__error" role="alert">{level.error.message}</div>}
        </td>
        <td>
          <button className="btn btn--ghost btn--sm" type="button" aria-expanded={expanded} onClick={onToggle}>{r.permissions.length} izin</button>
          {r.is_critical && <Badge tone="danger">Kritik</Badge>}
        </td>
        <td className="num">{r.holder_count}</td>
        <td className="right nowrap">
          <button className="btn btn--ghost btn--sm" type="button" onClick={onCopy}><Copy aria-hidden="true" /> Kopyala</button>
          {custom && r.is_active && <button className="btn btn--ghost btn--sm" type="button" onClick={onEdit}><Pencil aria-hidden="true" /> Düzenle</button>}
          {custom && (r.is_active ? (
            <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${r.name} rolünü arşivle`} confirmLabel="Arşivle" body="Rol yeni atamalarda görünmez; geçmiş atamalar ve onay geçmişi korunur." onConfirm={() => archive.mutateAsync({ is_active: false })}>Arşivle</ConfirmButton>
          ) : (
            <button className="btn btn--ghost btn--sm" type="button" disabled={archive.isPending} onClick={() => archive.mutate({ is_active: true })}>Geri al</button>
          ))}
          {archive.error && <div className="field__error" role="alert">{archive.error.message}</div>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5}><PermissionList keys={new Set(r.permissions)} groups={groups} /></td>
        </tr>
      )}
    </>
  );
}

function PermissionList({ keys, groups }: { keys: Set<string>; groups: Group[] }) {
  return (
    <div className="stack" style={{ gap: "var(--s-2)" }}>
      {groups.map((g) => {
        const items = g.permissions.filter((p) => keys.has(p.key));
        if (items.length === 0) return null;
        return (
          <div key={g.group}>
            <span className="strong small">{g.group}</span>
            <ul className="small mb-0">{items.map((p) => <li key={p.key}>{p.description} {p.sensitivity !== "normal" && <Badge tone={SENSITIVITY[p.sensitivity].tone}>{SENSITIVITY[p.sensitivity].label}</Badge>}</li>)}</ul>
          </div>
        );
      })}
    </div>
  );
}

/** Kopyala ve özelleştir / özel rolü düzenle. İzin ağacı gruplu; sizde olmayan izin seçilemez. */
function RoleForm({ mode, role, roles, groups, onDone }: { mode: "copy" | "edit"; role: Role; roles: Role[]; groups: Group[]; onDone: () => void }) {
  const { can } = useSite();
  const editing = mode === "edit";
  const [f, setF] = useState({
    base_key: role.key,
    name: editing ? role.name : "",
    description: role.description,
    level: role.level,
  });
  const [chosen, setChosen] = useState<Set<string>>(new Set(role.permissions));
  const create = useSiteMutation<Record<string, unknown>, Role>("POST", "/roles", { onSuccess: onDone });
  const update = useSiteMutation<Record<string, unknown>, Role>("PATCH", `/roles/${role.key}`, { onSuccess: onDone });
  const m = editing ? update : create;

  function pickBase(key: string) {
    const base = roles.find((r) => r.key === key);
    setF((x) => ({ ...x, base_key: key, description: base?.description ?? x.description, level: base?.level ?? x.level }));
    if (base) setChosen(new Set(base.permissions));
  }
  function toggle(key: string, on: boolean) {
    setChosen((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const body = { description: f.description.trim() || null, permissions: [...chosen].sort(), level: f.level };
    if (editing) update.mutate(body); else create.mutate({ ...body, base_key: f.base_key, name: f.name.trim() });
  }
  const missing = [...chosen].filter((p) => !can(p));

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">{editing ? `${role.name} — düzenle` : "Kopyala ve özelleştir"}</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-4)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          {!editing && (
            <Field label="Kopyalanacak rol" required error={fieldError(m.error, "base_key")}>
              {(p) => <select {...p} className="field__input" value={f.base_key} onChange={(e) => pickBase(e.target.value)}>{roles.filter((r) => r.is_active).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>}
            </Field>
          )}
          {!editing && (
            <Field label="Yeni rolün adı" required hint="Sonradan değiştirilemez" error={fieldError(m.error, "name")}>
              {(p) => <input {...p} className="field__input" maxLength={60} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />}
            </Field>
          )}
          <Field label="Açıklama" error={fieldError(m.error, "description")}>{(p) => <input {...p} className="field__input" maxLength={200} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />}</Field>
          <Field label="Düzey" hint="1 en üst; devir ve eskalasyon önerisi buna bakar" error={fieldError(m.error, "level")}>
            {(p) => <select {...p} className="field__input" value={f.level} onChange={(e) => setF((x) => ({ ...x, level: Number(e.target.value) }))}>{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select>}
          </Field>
        </div>

        <fieldset className="stack" style={{ gap: "var(--s-3)", border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">İzinler ({chosen.size})</legend>
          {fieldError(m.error, "permissions") && <span className="field__error" role="alert">{fieldError(m.error, "permissions")}</span>}
          {groups.map((g) => (
            <fieldset key={g.group} className="stack" style={{ gap: "var(--s-1)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "var(--s-3)", margin: 0 }}>
              <legend className="strong small">{g.group}</legend>
              {g.permissions.map((p) => {
                const allowed = can(p.key);
                return (
                  <label key={p.key} className="check" title={allowed ? undefined : "Sizde olmayan izni role ekleyemezsiniz"}>
                    <input type="checkbox" checked={chosen.has(p.key)} disabled={!allowed && !chosen.has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                    <span>{p.description} {p.sensitivity !== "normal" && <Badge tone={SENSITIVITY[p.sensitivity].tone}>{SENSITIVITY[p.sensitivity].label}</Badge>}{!allowed && <span className="small muted"> · sizde yok</span>}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </fieldset>
        {missing.length > 0 && <p className="small field__error mb-0" role="alert">Seçili izinlerden {missing.length} tanesi sizde yok; kaydetmek için çıkarın (kendi yetkinizden fazla izin içeren rol tanımlanamaz).</p>}
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={chosen.size === 0 || (!editing && !f.name.trim())}>{editing ? "Kaydet" : "Rolü oluştur"}</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
