import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Building2, Clock, History, PieChart, Plus, ShieldCheck, UserCheck, UserPlus, Users, X } from "lucide-react";
import { Donut } from "../../components/charts";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { InvitationNotice } from "../../components/InvitationNotice";
import { Alert, Avatar, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDate, formatDateTime, todayIso } from "../../lib/format";
import { useSite } from "../../site/SiteContext";

type Role = Schemas["RoleOut"];
type Member = Schemas["MemberOut"];
type MemberRole = Schemas["MemberRoleOut"];
type Added = Schemas["AddedOut"];
type Block = Schemas["BlockOut"];
type History = Schemas["RoleAssignmentHistoryOut"];

/** Tarih alanı (gün) → zaman damgası: başlangıç günün başı, bitiş günün sonu (yerel saat). */
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);

type ScopeDraft = { scope_kind: "site" | "block"; block_id: string; starts_on: string; ends_on: string };
const EMPTY_SCOPE: ScopeDraft = { scope_kind: "site", block_id: "", starts_on: "", ends_on: "" };
const scopeBody = (f: ScopeDraft) => ({
  scope_kind: f.scope_kind,
  block_id: f.scope_kind === "block" ? f.block_id || null : null,
  starts_at: dayStart(f.starts_on),
  ends_at: dayEnd(f.ends_on),
});

/** Rol etiketi: ad + kapsam + süre ("Güvenlik · A blok · 31.12.2026'ya kadar"). */
export function roleText(r: Pick<MemberRole, "role_name" | "scope_kind" | "block_name" | "starts_at" | "ends_at" | "is_current">): string {
  const parts = [r.role_name];
  if (r.scope_kind === "block") parts.push(`${r.block_name ?? "?"} blok`);
  if (!r.is_current && r.starts_at) parts.push(`${formatDate(r.starts_at)} başlar`);
  else if (r.ends_at) parts.push(`${formatDate(r.ends_at)} bitiş`);
  return parts.join(" · ");
}

/**
 * Site kullanıcıları ve rolleri (PLT-09). Bir kişinin birden çok rolü olabilir; izinler birleşir
 * (P18). Rol tesis geneline ya da bir bloğa, isteğe bağlı başlangıç–bitiş tarihiyle atanır.
 * Kendi izninizden fazlasını içeren rolü atayamaz, kaldıramazsınız (backend 403). Yeni personel
 * davet bağlantısıyla eklenir (72 saat geçerli); parolasını kendisi belirler (P5). Yönetim
 * şirketinden gelen erişim burada değiştirilemez.
 */
export function MembersPage() {
  const { site } = useSite();
  const q = useSiteGet<Member[]>("/members");
  const roles = useSiteGet<Role[]>("/roles");
  const blocks = useSiteGet<Page<Block>>("/blocks", { page_size: 100 });
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const roleList = roles.data ?? [];
  const blockList = blocks.data?.items ?? [];

  return (
    <div className="stack">
      <PageHead
        title="Kullanıcılar"
        subtitle="Siteye erişen personel ve rolleri. Bir kişiye birden çok rol verilebilir; izinleri birleşir. Sakinler burada değil, daire sayfasından ve kayıt başvurularından yönetilir."
        actions={<>
          <Link className="btn" to={`/s/${site.slug}/roller`}>Roller ve yetkiler</Link>
          <button className="btn" type="button" aria-expanded={history} onClick={() => setHistory((v) => !v)}><History aria-hidden="true" /> Atama geçmişi</button>
          <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><UserPlus aria-hidden="true" /> Kullanıcı ekle</button>
        </>}
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
      {adding && <AddMember roles={roleList} blocks={blockList} onDone={() => setAdding(false)} />}

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
                <thead><tr><th scope="col">Kullanıcı</th><th scope="col">Roller</th><th scope="col">Erişim</th><th scope="col">Son giriş</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>{q.data.map((m) => <MemberRow key={m.id} m={m} roles={roleList} blocks={blockList} />)}</tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card__foot">
          <p className="small muted mb-0">Rolün neyi görebildiği <Link to={`/s/${site.slug}/roller`}>Roller ve yetkiler</Link> ekranındadır. Blok kapsamlı rol yalnız o bloğun kapı işlerinde (kargo, ziyaretçi) geçerlidir. Rolü kaldırılan kişi bir sonraki işleminde o yetkiyi kaybeder; erişimi kapatılan kullanıcının oturumları sonlanır, geçmiş kayıtlarındaki adı korunur.</p>
        </div>
      </div>

      {history && <AssignmentHistory />}

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

/** Erişimi açık kullanıcıları rollerine göre sayar (çoktan aza); çok rollü kişi her rolde sayılır. */
function roleSegments(list: Member[]) {
  const m = new Map<string, number>();
  for (const x of list) if (x.is_active) for (const r of x.roles) m.set(r.role_name, (m.get(r.role_name) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

function MemberRow({ m, roles, blocks }: { m: Member; roles: Role[]; blocks: Block[] }) {
  const upd = useSiteMutation<{ is_active?: boolean }, Member>("PATCH", `/members/${m.id}`);
  const resend = useSiteMutation<Record<string, never>, Schemas["MemberInvitationOut"]>("POST", `/members/${m.id}/resend-invitation`, { onSuccess: (d) => d && setInvite(d) });
  const [invite, setInvite] = useState<Schemas["MemberInvitationOut"] | null>(null);
  const [assigning, setAssigning] = useState(false);
  const derived = m.source === "organization";
  return (
    <>
      <tr style={!m.is_active ? { opacity: 0.6 } : undefined}>
        <td><div className="cell-person"><Avatar name={m.full_name} size="sm" soft={!m.is_active} /><div><div className="cell-main">{m.full_name}{m.invitation_pending && <> <Badge tone="warn">Davet bekliyor</Badge></>}{m.mfa_enabled && <> <Badge tone="ok">2FA</Badge></>}</div><div className="cell-sub mono">{m.email}</div>{invite && <div className="stack small mt-2" style={{ gap: 4 }}><InvitationNotice invitation={invite} /></div>}</div></div></td>
        <td>
          <div className="row" style={{ gap: "var(--s-1)", flexWrap: "wrap" }}>
            {m.roles.length === 0 && <span className="small muted">Etkin rol yok</span>}
            {m.roles.map((r) => <RoleChip key={r.assignment_id ?? r.role_key} member={m} r={r} removable={!derived && m.is_active} />)}
          </div>
        </td>
        <td>
          {derived ? <Badge tone="info">Yönetim şirketinden</Badge> : m.is_active ? <Badge tone="ok">Açık</Badge> : <Badge>Kapalı</Badge>}
        </td>
        <td className="small nowrap">{m.last_login_at ? formatDateTime(m.last_login_at) : "Henüz girmedi"}</td>
        <td className="right nowrap">
          {!derived && m.invitation_pending && m.is_active && (
            <button className="btn btn--ghost btn--sm" type="button" disabled={resend.isPending} onClick={() => resend.mutate({})}>Daveti yeniden gönder</button>
          )}
          {!derived && m.is_active && (
            <button className="btn btn--ghost btn--sm" type="button" aria-expanded={assigning} onClick={() => setAssigning((v) => !v)}><Plus aria-hidden="true" /> Rol ekle</button>
          )}
          {!derived && (m.is_active ? (
            <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${m.full_name} erişimini kapat`} confirmLabel="Erişimi kapat" body="Kullanıcı bu siteye giremez, açık oturumları sonlanır. Yaptığı kayıtlar ve adı geçmişte kalır." onConfirm={() => upd.mutateAsync({ is_active: false })}>
              Erişimi kapat
            </ConfirmButton>
          ) : (
            <button className="btn btn--ghost btn--sm" type="button" disabled={upd.isPending} onClick={() => upd.mutate({ is_active: true })}>Erişimi aç</button>
          ))}
        </td>
      </tr>
      {assigning && (
        <tr>
          <td colSpan={5}><AssignRole member={m} roles={roles} blocks={blocks} onDone={() => setAssigning(false)} /></td>
        </tr>
      )}
    </>
  );
}

function RoleChip({ member, r, removable }: { member: Member; r: MemberRole; removable: boolean }) {
  const end = useSiteMutation<{ id: string }, Member>("DELETE", (v) => `/members/${member.id}/role-assignments/${v.id}`);
  const text = roleText(r);
  return (
    <span className={`badge badge--${r.is_current ? "info" : "muted"}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {text}
      {removable && r.assignment_id && (
        <ConfirmButton className="btn btn--ghost btn--sm" danger title={`${member.full_name}: ${r.role_name} rolünü kaldır`} confirmLabel="Rolü kaldır" body="Atama bugünün tarihiyle kapanır; geçmişte kalır. Kişi bir sonraki işleminde bu rolün yetkisini kaybeder." onConfirm={() => end.mutateAsync({ id: r.assignment_id! })}>
          <X aria-hidden="true" /><span className="visually-hidden">{r.role_name} rolünü kaldır</span>
        </ConfirmButton>
      )}
      {end.error && <span className="visually-hidden" role="alert">{end.error.message}</span>}
    </span>
  );
}

function ScopeFields({ f, setF, blocks, error }: { f: ScopeDraft; setF: (p: Partial<ScopeDraft>) => void; blocks: Block[]; error: unknown }) {
  return (
    <>
      <Field label="Kapsam" hint={f.scope_kind === "block" ? "Yalnız bu bloğun kargo ve ziyaretçi işleri" : "Tesis geneli"} error={fieldError(error, "scope_kind")}>
        {(p) => <select {...p} className="field__input" value={f.scope_kind} onChange={(e) => setF({ scope_kind: e.target.value as ScopeDraft["scope_kind"] })}><option value="site">Tesis geneli</option><option value="block" disabled={blocks.length === 0}>Blok</option></select>}
      </Field>
      {f.scope_kind === "block" && (
        <Field label="Blok" required error={fieldError(error, "block_id")}>
          {(p) => <select {...p} className="field__input" value={f.block_id} onChange={(e) => setF({ block_id: e.target.value })}><option value="">Seçin</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
        </Field>
      )}
      <Field label="Başlangıç" hint="Boş: hemen" error={fieldError(error, "starts_at")}>{(p) => <input {...p} className="field__input" type="date" min={todayIso()} value={f.starts_on} onChange={(e) => setF({ starts_on: e.target.value })} />}</Field>
      <Field label="Bitiş" hint="Boş: süresiz" error={fieldError(error, "ends_at")}>{(p) => <input {...p} className="field__input" type="date" min={f.starts_on || todayIso()} value={f.ends_on} onChange={(e) => setF({ ends_on: e.target.value })} />}</Field>
    </>
  );
}

function AssignRole({ member, roles, blocks, onDone }: { member: Member; roles: Role[]; blocks: Block[]; onDone: () => void }) {
  const held = new Set(member.roles.filter((r) => r.scope_kind === "site").map((r) => r.role_key));
  const options = roles.filter((r) => r.is_active);
  const [roleKey, setRoleKey] = useState(options.find((r) => !held.has(r.key))?.key ?? "");
  const [f, setF] = useState<ScopeDraft>(EMPTY_SCOPE);
  const m = useSiteMutation<Record<string, unknown>, Member>("POST", `/members/${member.id}/role-assignments`, { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ role_key: roleKey, ...scopeBody(f) });
  }
  const chosen = roles.find((r) => r.key === roleKey);
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} onSubmit={submit} noValidate>
      <FormError error={m.error} />
      <div className="grid grid--kpi">
        <Field label={`${member.full_name} — yeni rol`} required error={fieldError(m.error, "role_key")} hint={chosen?.description}>
          {(p) => <select {...p} className="field__input" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}><option value="">Seçin</option>{options.map((r) => <option key={r.key} value={r.key}>{r.name}{r.kind === "custom" ? " (özel)" : ""}</option>)}</select>}
        </Field>
        <ScopeFields f={f} setF={(p) => setF((x) => ({ ...x, ...p }))} blocks={blocks} error={m.error} />
      </div>
      {chosen?.is_critical && <p className="small muted mb-0">Bu rol kritik izin içeriyor (ör. kullanıcı yönetimi, tahakkuk).</p>}
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!roleKey || (f.scope_kind === "block" && !f.block_id)}>Rolü ata</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

function AddMember({ roles, blocks, onDone }: { roles: Role[]; blocks: Block[]; onDone: () => void }) {
  const [f, setF] = useState({ full_name: "", email: "", role_key: "accounting" });
  const [scope, setScope] = useState<ScopeDraft>(EMPTY_SCOPE);
  const [created, setCreated] = useState<Added | null>(null);
  const m = useSiteMutation<Record<string, unknown>, Added>("POST", "/members", { onSuccess: (d) => d && setCreated(d) });

  if (created) {
    return (
      <div className="card">
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          <Alert tone="ok" title={`${created.member.full_name} eklendi`}>Rol: {created.member.roles.map(roleText).join(", ") || created.member.role_name}</Alert>
          {created.invitation ? (
            <InvitationNotice invitation={created.invitation} />
          ) : (
            <p className="small mb-0">Bu e-postanın zaten bir hesabı vardı; hesap bu siteye bağlandı, parolası değişmedi. Kişi mevcut hesabıyla girer.</p>
          )}
        </div>
        <div className="card__foot"><button className="btn" type="button" onClick={() => { m.reset(); setCreated(null); onDone(); }}>Tamam</button></div>
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ full_name: f.full_name.trim(), email: f.email.trim().toLocaleLowerCase("tr-TR"), role_key: f.role_key, ...scopeBody(scope) });
  }
  const active = roles.filter((r) => r.is_active);
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Kullanıcı ekle</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad soyad" required error={fieldError(m.error, "full_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" value={f.full_name} onChange={(e) => setF((x) => ({ ...x, full_name: e.target.value }))} />}</Field>
          <Field label="E-posta" required error={fieldError(m.error, "email")}>{(p) => <input {...p} className="field__input" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} />}</Field>
          <Field label="Rol" error={fieldError(m.error, "role_key")} hint={active.find((r) => r.key === f.role_key)?.description}>
            {(p) => <select {...p} className="field__input" value={f.role_key} onChange={(e) => setF((x) => ({ ...x, role_key: e.target.value }))}>{active.map((r) => <option key={r.key} value={r.key}>{r.name}{r.kind === "custom" ? " (özel)" : ""}</option>)}</select>}
          </Field>
          <ScopeFields f={scope} setF={(p) => setScope((x) => ({ ...x, ...p }))} blocks={blocks} error={m.error} />
        </div>
        <p className="small muted mb-0">Başka rolleri ekledikten sonra satırdaki "Rol ekle" ile verebilirsiniz.</p>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={m.isPending} disabled={!f.full_name.trim() || !f.email.trim() || (scope.scope_kind === "block" && !scope.block_id)}>Ekle</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

/** Rol atama geçmişi (PLT-09): kim, kime, hangi rolü, ne zaman atadı / kaldırdı. */
function AssignmentHistory() {
  const [page, setPage] = useState(1);
  const q = useSiteGet<Page<History>>("/role-assignments", { page, page_size: 20 });
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Rol atama geçmişi</span></div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : q.data.items.length === 0 ? (
          <Empty title="Henüz atama yok" icon={<History aria-hidden="true" />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Rol atama geçmişi</caption>
              <thead><tr><th scope="col">Kişi</th><th scope="col">Rol</th><th scope="col">Atayan</th><th scope="col">Atandı</th><th scope="col">Kaldıran</th><th scope="col">Bitiş</th></tr></thead>
              <tbody>
                {q.data.items.map((h) => (
                  <tr key={h.id}>
                    <td>{h.user_name}</td>
                    <td>{h.role_name}{h.scope_kind === "block" && <span className="small muted"> · {h.block_name} blok</span>}</td>
                    <td className="small">{h.assigned_by ?? "—"}</td>
                    <td className="small nowrap">{formatDateTime(h.assigned_at)}</td>
                    <td className="small">{h.removed_by ?? "—"}</td>
                    <td className="small nowrap">{h.ends_at ? formatDateTime(h.ends_at) : "Süresiz"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {q.data && <div className="card__foot"><Pager page={page} pageSize={20} total={q.data.total} onPage={setPage} /></div>}
    </div>
  );
}
