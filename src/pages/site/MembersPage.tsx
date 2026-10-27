import { useState, type FormEvent } from "react";
import { Building2, Clock, PieChart, ShieldCheck, UserCheck, UserPlus, Users } from "lucide-react";
import { Donut } from "../../components/charts";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Schemas } from "../../api/types";
import { OneTimePassword } from "../../components/OneTimePassword";
import { Alert, Avatar, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";

type Role = Schemas["RoleOut"];
type Member = Schemas["MemberOut"];
type Added = Schemas["AddedOut"];

/**
 * Site kullanıcıları ve rolleri (Apsiyon "Yetkililer" / "Yetki Grupları"). Yeni personeli rolüyle
 * ekler; geçici parola bir kez gösterilir (platformdaki müşteri ekleme akışıyla aynı). Yönetim
 * şirketinden gelen erişim burada değiştirilemez.
 */
export function MembersPage() {
  const q = useSiteGet<Member[]>("/members");
  const roles = useSiteGet<Role[]>("/roles");
  const [adding, setAdding] = useState(false);

  return (
    <div className="stack">
      <PageHead
        title="Kullanıcılar"
        subtitle="Siteye erişen personel ve rolleri. Sakinler burada değil, daire sayfasından ve kayıt başvurularından yönetilir."
        actions={<button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><UserPlus aria-hidden="true" /> Kullanıcı ekle</button>}
      />
      {q.isPending && <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" aria-hidden="true" />)}</div>}
      {q.data && (
        <div className="grid grid--kpi rise">
          <Kpi label="Kullanıcı" icon={<Users aria-hidden="true" />} value={q.data.length} note="bu siteye erişen" />
          <Kpi label="Erişimi açık" icon={<UserCheck aria-hidden="true" />} tone="ok" value={q.data.filter((m) => m.is_active).length} note={`${q.data.filter((m) => !m.is_active).length} kapalı`} />
          <Kpi label="Yönetim şirketinden" icon={<Building2 aria-hidden="true" />} tone="accent" value={q.data.filter((m) => m.source === "organization").length} note="burada değiştirilemez" />
          <Kpi label="Hiç girmemiş" icon={<Clock aria-hidden="true" />} tone={q.data.some((m) => m.is_active && !m.last_login_at) ? "warn" : undefined} value={q.data.filter((m) => m.is_active && !m.last_login_at).length} note="erişimi açık, ilk giriş yok" />
        </div>
      )}
      {adding && <AddMember roles={roles.data ?? []} onDone={() => setAdding(false)} />}

      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><Users aria-hidden="true" /></span>
          <span className="card__title">Kullanıcı listesi</span>
          {q.data && <span className="card__meta ml-auto">{q.data.length} kayıt</span>}
        </div>
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : q.data.length === 0 ? (
            <Empty title="Henüz kullanıcı yok" icon={<Users aria-hidden="true" />} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Site kullanıcıları</caption>
                <thead><tr><th scope="col">Kullanıcı</th><th scope="col">Rol</th><th scope="col">Erişim</th><th scope="col">Son giriş</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>{q.data.map((m) => <MemberRow key={m.id} m={m} roles={roles.data ?? []} />)}</tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card__foot">
          <p className="small muted mb-0">Rollerin neyi görebildiği sabittir: Denetçi kişisel veri görmez, Güvenlik borç görmez (backend docs/05). Erişimi kapatılan kullanıcının oturumları sonlanır; geçmiş kayıtlarındaki adı korunur.</p>
        </div>
      </div>

      {(roles.data || (q.data && q.data.length > 0)) && (
        <div className="grid grid--main">
          {roles.data && (
            <div className="card">
              <div className="card__head"><span className="card__icon card__icon--accent"><ShieldCheck aria-hidden="true" /></span><span className="card__title">Roller</span></div>
              <div className="card__body">
                {roles.data.map((r) => <div key={r.key} className="kv"><span className="kv__k strong">{r.name}</span><span className="kv__v small">{r.description}</span></div>)}
              </div>
            </div>
          )}
          {q.data && q.data.length > 0 && (
            <div className="card">
              <div className="card__head"><span className="card__icon card__icon--accent"><PieChart aria-hidden="true" /></span><span className="card__title">Rollere göre dağılım</span><span className="card__meta ml-auto">erişimi açık</span></div>
              <div className="card__body yapi-pie">
                <Donut label="Rollere göre kullanıcı sayısı" centerSub="kullanıcı" segments={roleSegments(q.data)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Erişimi açık kullanıcıları rol adına göre sayar (çoktan aza). */
function roleSegments(list: Member[]) {
  const m = new Map<string, number>();
  for (const x of list) if (x.is_active) m.set(x.role_name, (m.get(x.role_name) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

function MemberRow({ m, roles }: { m: Member; roles: Role[] }) {
  const upd = useSiteMutation<{ role_key?: string; is_active?: boolean }, Member>("PATCH", `/members/${m.id}`);
  const derived = m.source === "organization";
  return (
    <tr style={!m.is_active ? { opacity: 0.6 } : undefined}>
      <td><div className="cell-person"><Avatar name={m.full_name} size="sm" soft={!m.is_active} /><div><div className="cell-main">{m.full_name}</div><div className="cell-sub mono">{m.email}</div></div></div></td>
      <td>
        {derived ? <span className="small">{m.role_name}</span> : (
          <select aria-label={`${m.full_name} rolü`} className="field__input" style={{ minHeight: 36, padding: "4px 8px", width: "auto" }} value={m.role_key} disabled={upd.isPending || !m.is_active} onChange={(e) => upd.mutate({ role_key: e.target.value })}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        )}
      </td>
      <td>
        {derived ? <Badge tone="info">Yönetim şirketinden</Badge> : m.is_active ? <Badge tone="ok">Açık</Badge> : <Badge>Kapalı</Badge>}
      </td>
      <td className="small nowrap">{m.last_login_at ? formatDateTime(m.last_login_at) : "Henüz girmedi"}</td>
      <td className="right">
        {!derived && (m.is_active ? (
          <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${m.full_name} erişimini kapat`} confirmLabel="Erişimi kapat" body="Kullanıcı bu siteye giremez, açık oturumları sonlanır. Yaptığı kayıtlar ve adı geçmişte kalır." onConfirm={() => upd.mutateAsync({ is_active: false })}>
            Erişimi kapat
          </ConfirmButton>
        ) : (
          <button className="btn btn--ghost btn--sm" type="button" disabled={upd.isPending} onClick={() => upd.mutate({ is_active: true })}>Erişimi aç</button>
        ))}
      </td>
    </tr>
  );
}

function AddMember({ roles, onDone }: { roles: Role[]; onDone: () => void }) {
  const [f, setF] = useState({ full_name: "", email: "", role_key: "accounting" });
  const [created, setCreated] = useState<Added | null>(null);
  const m = useSiteMutation<Record<string, string>, Added>("POST", "/members", { onSuccess: (d) => d && setCreated(d) });

  if (created) {
    return (
      <div className="card">
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <Alert tone="ok" title={`${created.member.full_name} eklendi`}>Rol: {created.member.role_name}</Alert>
          {created.temporary_password ? (
            <OneTimePassword email={created.member.email} password={created.temporary_password} />
          ) : (
            <p className="small mb-0">Bu e-postanın zaten bir hesabı vardı; hesap bu siteye bağlandı, parolası değişmedi. Kişi mevcut parolasıyla girer.</p>
          )}
        </div>
        <div className="card__foot"><button className="btn" type="button" onClick={() => { m.reset(); setCreated(null); onDone(); }}>Tamam</button></div>
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ full_name: f.full_name.trim(), email: f.email.trim().toLocaleLowerCase("tr-TR"), role_key: f.role_key });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Kullanıcı ekle</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad soyad" required error={fieldError(m.error, "full_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" value={f.full_name} onChange={(e) => setF((x) => ({ ...x, full_name: e.target.value }))} />}</Field>
          <Field label="E-posta" required error={fieldError(m.error, "email")}>{(p) => <input {...p} className="field__input" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} />}</Field>
          <Field label="Rol" error={fieldError(m.error, "role_key")} hint={roles.find((r) => r.key === f.role_key)?.description}>
            {(p) => <select {...p} className="field__input" value={f.role_key} onChange={(e) => setF((x) => ({ ...x, role_key: e.target.value }))}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>}
          </Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.full_name.trim() || !f.email.trim()}>Ekle</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
