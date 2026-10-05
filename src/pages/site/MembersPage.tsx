import { useState, type FormEvent } from "react";
import { Copy, UserPlus, Users } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import { MockBadge } from "../../components/MockBadge";
import { useToast } from "../../components/toast";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Loading, PageHead, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime } from "../../lib/format";

/** Servis isteği 12'deki şekiller. */
interface Role { key: string; name: string; description: string }
interface Member {
  id: string; full_name: string; email: string; role_key: string; role_name: string; is_active: boolean;
  source: "site" | "organization"; last_login_at: string | null; invited_at: string;
}

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
        actions={<><MockBadge request="12" /><button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><UserPlus aria-hidden="true" /> Kullanıcı ekle</button></>}
      />
      {adding && <AddMember roles={roles.data ?? []} onDone={() => setAdding(false)} />}

      <div className="card">
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

      {roles.data && (
        <div className="card">
          <div className="card__head"><span className="card__title">Roller</span></div>
          <div className="card__body">
            {roles.data.map((r) => <div key={r.key} className="kv"><span className="kv__k strong">{r.name}</span><span className="kv__v small">{r.description}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({ m, roles }: { m: Member; roles: Role[] }) {
  const upd = useSiteMutation<{ role_key?: string; is_active?: boolean }, Member>("PATCH", `/members/${m.id}`);
  const derived = m.source === "organization";
  return (
    <tr style={!m.is_active ? { opacity: 0.6 } : undefined}>
      <td><div className="cell-main">{m.full_name}</div><div className="cell-sub mono">{m.email}</div></td>
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
  const toast = useToast();
  const [f, setF] = useState({ full_name: "", email: "", role_key: "accounting" });
  const [created, setCreated] = useState<{ member: Member; temporary_password: string } | null>(null);
  const m = useSiteMutation<Record<string, string>, { member: Member; temporary_password: string }>("POST", "/members", { onSuccess: (d) => d && setCreated(d) });

  if (created) {
    return (
      <div className="card">
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <Alert tone="ok" title={`${created.member.full_name} eklendi`}>Rol: {created.member.role_name}</Alert>
          <div className="kv"><span className="kv__k">E-posta</span><span className="kv__v mono">{created.member.email}</span></div>
          <div className="kv">
            <span className="kv__k">Geçici parola</span>
            <span className="kv__v"><span className="mono strong">{created.temporary_password}</span>{" "}
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(created.temporary_password).then(() => toast("Parola kopyalandı."))}><Copy aria-hidden="true" /> Kopyala</button>
            </span>
          </div>
          <Alert tone="warn" title="Bu parola bir daha gösterilmez">Kişiye güvenli bir kanaldan iletin; ilk girişte kendi parolasını belirlemesi istenir.</Alert>
        </div>
        <div className="card__foot"><button className="btn" type="button" onClick={onDone}>Tamam</button></div>
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
