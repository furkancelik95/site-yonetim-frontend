import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError } from "../../api/client";
import { Copy, Inbox, Link2, Mail, QrCode, RefreshCw, UserCheck, UserX } from "lucide-react";
import { useSiteGet, useSiteMutation } from "../../api/hooks";
import type { Page, Schemas } from "../../api/types";
import { useToast } from "../../components/toast";
import { UnitPicker, type PickedUnit } from "../../components/UnitPicker";
import { Alert, Avatar, Badge, ConfirmButton, Empty, ErrorState, Field, FormError, Kpi, Loading, PageHead, Pager, SubmitButton, fieldError } from "../../components/ui";
import { formatDateTime, todayIso } from "../../lib/format";
import { useUrlState } from "../../lib/hooks";
import { formatPhone, isTrMobile, phoneDigits, phoneMask, toE164 } from "../../lib/input";
import { invitationStatus, invitationStatusTone, partyRole } from "../../lib/labels";
import { useSite } from "../../site/SiteContext";

type RegLink = Schemas["LinkOut"];
type Registration = Schemas["RegistrationOut"];
type Approved = Schemas["ApprovedOut"];

type RegSettings = Schemas["RegistrationSettingsOut"];
type Invitation = Schemas["InvitationOut"];

const TABS = [["basvurular", "Başvurular"], ["davetler", "Davetler"], ["ayarlar", "Kayıt yöntemleri"]] as const;

/**
 * Sakin kaydı (YAP-07/08): üç yöntem — davet (yönetim davet eder, kişi telefonunu doğrular), QR afiş ve
 * site kodu bağlantısı (kişi başvurur, yönetim bölümünü seçip onaylar). Yöntemler ayarlardan açılıp kapanır.
 */
export function RegistrationsPage() {
  const { site } = useSite();
  const [s, set] = useUrlState({ sekme: "basvurular", durum: "pending", page: "1" });
  return (
    <div className="stack">
      <PageHead title="Sakin kaydı" subtitle="Davet, QR afiş ya da site bağlantısıyla kayıt; başvurular burada onaylanır." actions={<Link className="btn" to={`/s/${site.slug}/kayit-afisi`}><QrCode aria-hidden="true" /> QR afiş</Link>} />
      <RegKpis />
      <div className="tabs" role="tablist" aria-label="Sakin kaydı">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.sekme === k} onClick={() => set({ sekme: k })}>{l}</button>)}
      </div>
      {s.sekme === "davetler" ? <Invitations /> : s.sekme === "ayarlar" ? <RegSettingsCard /> : <Applications durum={s.durum} page={s.page} set={set} />}
    </div>
  );
}

/** Başlık bandına binen özet: başvuru durum sayıları (gerçek uç, total) + açık davetler (istek 23). */
function RegKpis() {
  const pending = useSiteGet<Page<Registration>>("/registrations", { status: "pending", page_size: 1 });
  const approved = useSiteGet<Page<Registration>>("/registrations", { status: "approved", page_size: 1 });
  const rejected = useSiteGet<Page<Registration>>("/registrations", { status: "rejected", page_size: 1 });
  // Davet ucu sayfalı: durum başına toplam, süzgeçli sorgunun `total`'ından
  const sent = useSiteGet<Page<Invitation>>("/invitations", { status: "sent", page_size: 1 });
  const opened = useSiteGet<Page<Invitation>>("/invitations", { status: "opened", page_size: 1 });
  const done = useSiteGet<Page<Invitation>>("/invitations", { status: "completed", page_size: 1 });
  if (pending.isError) return null;
  if (!pending.data) return <div className="grid grid--kpi">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel__kpi" aria-hidden="true" />)}</div>;
  const openInv = sent.data && opened.data ? sent.data.total + opened.data.total : undefined;
  const doneInv = done.data?.total;
  return (
    <div className="grid grid--kpi rise">
      <Kpi label="Bekleyen başvuru" icon={<Inbox aria-hidden="true" />} tone={pending.data.total ? "warn" : "ok"} value={pending.data.total} note={pending.data.total ? "bölüm seçip onaylayın" : "kuyruk boş"} />
      <Kpi label="Onaylanan" icon={<UserCheck aria-hidden="true" />} tone="ok" value={approved.data?.total ?? "—"} note="hesabı açılan sakin" />
      <Kpi label="Reddedilen" icon={<UserX aria-hidden="true" />} value={rejected.data?.total ?? "—"} note="gerekçesiyle kayıtlı" />
      <Kpi label="Açık davet" icon={<Mail aria-hidden="true" />} value={openInv ?? "—"} note={doneInv !== undefined ? `${doneInv} davet tamamlandı` : undefined} />
    </div>
  );
}

// ---------------------------------------------------------------- Başvurular (gerçek uç, istek 13)
function Applications({ durum, page, set }: { durum: string; page: string; set: (p: Partial<{ durum: string; page: string }>) => void }) {
  const toast = useToast();
  const link = useSiteGet<RegLink>("/registration-link");
  const rotate = useSiteMutation<Record<string, never>, RegLink>("POST", "/registration-link/rotate");
  const toggle = useSiteMutation<{ is_enabled: boolean }, RegLink>("PATCH", "/registration-link");
  const q = useSiteGet<Page<Registration>>("/registrations", { status: durum, page, page_size: 30 });
  const url = link.data ? `${window.location.origin}/kayit/${link.data.code}` : "";
  // Onaylanan başvuru listeden çıkar; giriş bilgisi (telefon + SMS kodu, P5) burada gösterilir
  const [issued, setIssued] = useState<Approved | null>(null);
  return (
    <>
      {issued && (
        <div className="card">
          <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
            <Alert tone="ok" title={`${issued.first_name} ${issued.last_name} ${issued.login === "created" ? "için giriş hesabı açıldı" : "mevcut hesabına bağlandı"}`}>{issued.unit_name} · {partyRole(issued.relation)}</Alert>
            <div className="kv"><span className="kv__k">Giriş telefonu</span><span className="kv__v mono">{issued.login_phone}</span></div>
            <p className="small mb-0">Kişi giriş ekranında telefon numarasını girer, SMS koduyla girer; parola gerekmez. Onay SMS'i gönderildi (sağlayıcı seçilene dek test sağlayıcısı — K5: kayda geçer, dışarı gitmez).</p>
          </div>
          <div className="card__foot"><button className="btn" type="button" onClick={() => setIssued(null)}>Tamam</button></div>
        </div>
      )}
      <div className="card">
        <div className="card__head"><span className="card__icon card__icon--accent"><Link2 aria-hidden="true" /></span><span className="card__title">Kayıt bağlantısı</span>{link.data && <span className="ml-auto">{link.data.is_enabled ? <Badge tone="ok">Açık</Badge> : <Badge>Kapalı</Badge>}</span>}</div>
        <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
          {link.isPending ? <Loading /> : link.data && (
            <>
              <div className="linkbox">
                <code className="mono small">{url}</code>
                <button className="btn btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Bağlantı kopyalandı."))}><Copy aria-hidden="true" /> Kopyala</button>
              </div>
              <p className="small muted mb-0">Bağlantıyı duyuru panosuna, WhatsApp grubuna koyun ya da QR afiş basın. Kötüye kullanılırsa yenileyin; eski bağlantı ve basılı afişler çalışmaz.</p>
              <div className="row" style={{ gap: "var(--s-2)" }}>
                <ConfirmButton className="btn btn--sm" title="Bağlantıyı yenile" confirmLabel="Yenile" body="Yeni bağlantı üretilir; dağıtılmış eski bağlantı ve basılı QR afişler artık çalışmaz." onConfirm={() => rotate.mutateAsync({})}><RefreshCw aria-hidden="true" /> Yenile</ConfirmButton>
                <button className="btn btn--ghost btn--sm" type="button" disabled={toggle.isPending} onClick={() => toggle.mutate({ is_enabled: !link.data!.is_enabled })}>{link.data.is_enabled ? "Kayda kapat" : "Kayda aç"}</button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Başvuru durumu">
        {[["pending", "Bekleyen"], ["approved", "Onaylanan"], ["rejected", "Reddedilen"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={durum === k} onClick={() => set({ durum: k!, page: "1" })}>{l}</button>
        ))}
      </div>
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--warn"><Inbox aria-hidden="true" /></span>
          <span className="card__title">Başvurular</span>
          {q.data && <span className="card__meta ml-auto">{q.data.total} kayıt</span>}
        </div>
        <div className="card__body card__body--flush">
          {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? (
            <Empty title={durum === "pending" ? "Bekleyen başvuru yok" : "Kayıt yok"} icon={<Inbox aria-hidden="true" />}>Kayıt bağlantısını ya da QR afişi sakinlerle paylaştığınızda başvurular burada görünür.</Empty>
          ) : durum === "pending" ? (
            // Bekleyenler kart olarak: bölüm seçici ve onay düğmeleri telefonda da sığar (tablo taşıyordu)
            <div className="stack" style={{ gap: "var(--s-3)", padding: "var(--s-3)" }}>{q.data.items.map((r) => <PendingCard key={r.id} r={r} onApproved={(d) => setIssued(d)} />)}</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Sakin kayıt başvuruları</caption>
                <thead><tr><th scope="col">Başvuran</th><th scope="col">Yazdığı bölüm</th><th scope="col">İletişim</th><th scope="col">Tarih</th><th scope="col">Sonuç</th></tr></thead>
                <tbody>{q.data.items.map((r) => (
                  <tr key={r.id}>
                    <td><div className="cell-person"><Avatar name={`${r.first_name} ${r.last_name}`} size="sm" soft /><div><div className="cell-main">{r.first_name} {r.last_name}</div><div className="cell-sub">{partyRole(r.relation)} · <span className="mono">{r.reference}</span></div></div></div></td>
                    <td className="small">{r.unit_text}</td>
                    <td className="small">{formatPhone(r.phone)}{r.email && <div className="cell-sub">{r.email}</div>}</td>
                    <td className="small nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="small">{r.status === "approved" ? <><Badge tone="ok">Onaylandı</Badge> {r.unit_name} · {r.decided_by}</> : <><Badge tone="danger">Reddedildi</Badge> {r.reject_reason}</>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
        {q.data && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </div>
    </>
  );
}

function PendingCard({ r, onApproved }: { r: Registration; onApproved: (d: Approved) => void }) {
  const [unit, setUnit] = useState<PickedUnit | null>(r.requested_unit_id && r.requested_unit_name ? { id: r.requested_unit_id, name: r.requested_unit_name } : null);
  const [reason, setReason] = useState("");
  // Malik başvurusunda hisse (boş = %100); bölümde başka malik varsa toplam %100'ü aşamaz (409)
  const [share, setShare] = useState("");
  // Onay sonucu (giriş telefonu) yalnız sayfa üstündeki kartta tutulur
  const approve = useSiteMutation<{ unit_id: string; start_date: string; share_percent?: string }, Approved>("POST", `/registrations/${r.id}/approve`, { onSuccess: (d) => { if (d) onApproved(d); approve.reset(); } });
  const reject = useSiteMutation<{ reason: string }, Registration>("POST", `/registrations/${r.id}/reject`);
  // Hisse dolu (409) gelince hisse alanı açılır; daha düşük oranla yeniden denenebilir
  const sharesFull = approve.error instanceof ApiError && approve.error.code === "owner_shares_exceed";
  return (
    <article className="stack subcard" aria-label={`${r.first_name} ${r.last_name} başvurusu`} style={{ gap: "var(--s-3)" }}>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <div className="cell-person"><Avatar name={`${r.first_name} ${r.last_name}`} soft /><div><div className="cell-main">{r.first_name} {r.last_name}</div><div className="cell-sub">{partyRole(r.relation)} · <span className="mono">{r.reference}</span>{r.explicit_consent ? " · açık rıza verdi" : ""}</div></div></div>
        <span className="small muted nowrap">{formatDateTime(r.created_at)}</span>
      </div>
      <div className="grid grid--kpi">
        <div className="kv" style={{ margin: 0 }}><span className="kv__k">Yazdığı bölüm</span><span className="kv__v">{r.unit_text}{r.requested_unit_name && r.requested_unit_name !== r.unit_text ? ` (listeden: ${r.requested_unit_name})` : ""}</span></div>
        <div className="kv" style={{ margin: 0 }}><span className="kv__k">Telefon</span><span className="kv__v">{formatPhone(r.phone)}</span></div>
        {r.email && <div className="kv" style={{ margin: 0 }}><span className="kv__k">E-posta</span><span className="kv__v" style={{ wordBreak: "break-all" }}>{r.email}</span></div>}
      </div>
      <div className="grid grid--kpi" style={{ alignItems: "end" }}>
        <UnitPicker label="Bölüm" value={unit} onChange={setUnit} />
        {r.relation === "owner" && (sharesFull || share) && (
          <div className="field">
            <label className="field__label" htmlFor={`share-${r.id}`}>Hisse oranı (%)</label>
            <input id={`share-${r.id}`} className="field__input" inputMode="decimal" placeholder="100" value={share} onChange={(e) => setShare(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} aria-describedby={`share-${r.id}-hint`} />
            <span className="field__hint" id={`share-${r.id}-hint`}>Bölümde başka malik varsa hisseler toplamı %100'ü aşamaz.</span>
          </div>
        )}
      </div>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <button className="btn btn--sm btn--primary" type="button" disabled={!unit || approve.isPending} aria-busy={approve.isPending || undefined} onClick={() => unit && approve.mutate({ unit_id: unit.id, start_date: todayIso(), ...(r.relation === "owner" && share.trim() ? { share_percent: share.trim().replace(",", ".") } : {}) })}>Onayla</button>
        <ConfirmButton className="btn btn--ghost btn--sm" danger title="Başvuruyu reddet" confirmLabel="Reddet"
          body={<div className="field"><label className="field__label" htmlFor={`rej-${r.id}`}>Gerekçe *</label><input id={`rej-${r.id}`} className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Bu bölümde kayıtlı değil" /></div>}
          onConfirm={() => { if (!reason.trim()) throw new Error("Gerekçe zorunlu."); return reject.mutateAsync({ reason: reason.trim() }); }}>
          Reddet
        </ConfirmButton>
      </div>
      {approve.error && <span className="field__error" role="alert">{(approve.error as Error).message}</span>}
    </article>
  );
}

// ---------------------------------------------------------------- Davetler (istek 23)
function Invitations() {
  const toast = useToast();
  const [st, setSt] = useState("");
  const [page, setPage] = useState(1);
  const q = useSiteGet<Page<Invitation>>("/invitations", { status: st || undefined, page, page_size: 30 });
  const [adding, setAdding] = useState(false);
  // Belirtecin yalnız özeti saklanır: bağlantı oluşturma/yenileme yanıtında bir kez gelir, bu oturumda gösterilir.
  const [links, setLinks] = useState<Record<string, string>>({});
  const copy = (link: string) => navigator.clipboard?.writeText(`${window.location.origin}${link}`).then(() => toast("Davet bağlantısı kopyalandı."));
  const remember = (i?: Invitation) => { if (i?.link) { const l = i.link; setLinks((x) => ({ ...x, [i.id]: l })); copy(l); } };
  return (
    <>
      <div className="row row--between" style={{ gap: "var(--s-2)" }}>
        <p className="small muted mb-0">Yönetim kişiyi bölümüyle davet eder; kişi bağlantıdan telefonunu doğrular, hesabı hemen açılır — onay beklemez. SMS gönderimi henüz yok (K5): bağlantıyı siz iletirsiniz.</p>
        <button className="btn btn--primary" type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Mail aria-hidden="true" /> Davet oluştur</button>
      </div>
      {adding && <InviteForm onDone={(i) => { setAdding(false); remember(i); }} />}
      <div className="card">
        <div className="card__head">
          <span className="card__icon card__icon--accent"><Mail aria-hidden="true" /></span>
          <div>
            <div className="card__title">Davetler</div>
            {q.data && <div className="card__meta">{q.data.total} kayıt</div>}
          </div>
          <div className="card__tools">
            <div className="field"><label className="field__label" htmlFor="inv-st">Durum</label><select id="inv-st" className="field__input" value={st} onChange={(e) => { setSt(e.target.value); setPage(1); }}><option value="">Tümü</option>{["sent", "opened", "completed", "expired", "cancelled"].map((k) => <option key={k} value={k}>{invitationStatus(k)}</option>)}</select></div>
          </div>
        </div>
        <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} /></div> : q.data.items.length === 0 ? <Empty title="Davet yok" icon={<Mail aria-hidden="true" />}>Davet oluşturup bağlantıyı kişiye iletin.</Empty> : (
          <div className="table-wrap"><table className="data">
            <caption className="visually-hidden">Davetler</caption>
            <thead><tr><th scope="col">Kişi</th><th scope="col">Bölüm</th><th scope="col">Durum</th><th scope="col">Gönderen</th><th scope="col">Geçerlilik</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
            <tbody>{q.data.items.map((i) => <InviteRow key={i.id} i={i} onCopy={links[i.id] ? () => copy(links[i.id]!) : undefined} onResent={remember} />)}</tbody>
          </table></div>
        )}
      </div>
      {q.data && q.data.total > q.data.page_size && <div className="card__foot"><Pager page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPage={setPage} /></div>}
      </div>
    </>
  );
}

function InviteRow({ i, onCopy, onResent }: { i: Invitation; onCopy?: () => void; onResent: (i?: Invitation) => void }) {
  const resend = useSiteMutation<Record<string, never>, Invitation>("POST", `/invitations/${i.id}/resend`, { onSuccess: onResent });
  const cancel = useSiteMutation<Record<string, never>, Invitation>("POST", `/invitations/${i.id}/cancel`);
  const open = i.status === "sent" || i.status === "opened";
  return (
    <tr style={i.status === "cancelled" || i.status === "expired" ? { opacity: 0.6 } : undefined}>
      <td><div className="cell-person"><Avatar name={i.full_name} size="sm" soft /><div><div className="cell-main">{i.full_name}</div><div className="cell-sub">{formatPhone(i.phone)}</div></div></div></td>
      <td className="small">{i.unit_name}<div className="cell-sub">{partyRole(i.relation)}</div></td>
      <td><Badge tone={invitationStatusTone(i.status)}>{invitationStatus(i.status)}</Badge>{i.completed_at && <div className="cell-sub">{formatDateTime(i.completed_at)}</div>}</td>
      <td className="small">{i.sent_by ?? "—"}<div className="cell-sub">{formatDateTime(i.sent_at)}</div></td>
      <td className="small nowrap">{formatDateTime(i.expires_at)}</td>
      <td className="right nowrap">
        {open && onCopy && <button className="btn btn--ghost btn--sm" type="button" onClick={onCopy}><Copy aria-hidden="true" /> Bağlantı</button>}{" "}
        {i.status !== "completed" && i.status !== "cancelled" && <ConfirmButton className="btn btn--ghost btn--sm" title="Daveti yeniden gönder" confirmLabel="Yeniden gönder" body="Yeni bağlantı üretilir ve panoya kopyalanır; eskisi geçersiz olur." onConfirm={() => resend.mutateAsync({})}><RefreshCw aria-hidden="true" /> Yenile</ConfirmButton>}{" "}
        {open && <ConfirmButton className="btn btn--ghost btn--sm" danger title="Daveti iptal et" confirmLabel="İptal et" body="Bağlantı çalışmaz; kişi kaydolamaz." onConfirm={() => cancel.mutateAsync({})}>İptal</ConfirmButton>}
      </td>
    </tr>
  );
}

function InviteForm({ onDone }: { onDone: (created?: Invitation) => void }) {
  const [unit, setUnit] = useState<PickedUnit | null>(null);
  const [f, setF] = useState({ full_name: "", phone: "", email: "", relation: "owner" });
  const [phoneErr, setPhoneErr] = useState<string>();
  const m = useSiteMutation<Record<string, unknown>, Invitation>("POST", "/invitations", { onSuccess: onDone });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isTrMobile(f.phone)) return setPhoneErr("Cep telefonu 5 ile başlayan 10 hane olmalı.");
    m.mutate({ full_name: f.full_name.trim(), phone: toE164(f.phone), email: f.email.trim().toLocaleLowerCase("tr-TR") || null, unit_id: unit?.id, relation: f.relation });
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head"><span className="card__title">Davet oluştur</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <div className="grid grid--kpi">
          <Field label="Ad soyad" required error={fieldError(m.error, "full_name")}>{(p) => <input {...p} className="field__input" autoComplete="off" maxLength={60} value={f.full_name} onChange={(e) => setF((x) => ({ ...x, full_name: e.target.value }))} />}</Field>
          <Field label="Cep telefonu" required hint="Kişi bu numarayı doğrulayarak kaydolur" error={phoneErr ?? fieldError(m.error, "phone")}>{(p) => <input {...p} className="field__input" type="tel" inputMode="tel" placeholder="5XX XXX XX XX" value={phoneMask(phoneDigits(f.phone))} onChange={(e) => { setF((x) => ({ ...x, phone: e.target.value })); setPhoneErr(undefined); }} />}</Field>
          <Field label="E-posta" hint="Giriş e-postayla yapılır; boşsa kişi kayıtta yazar" error={fieldError(m.error, "email")}>{(p) => <input {...p} className="field__input" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} />}</Field>
          <UnitPicker label="Bölüm" value={unit} onChange={setUnit} error={fieldError(m.error, "unit_id")} />
          <Field label="İlişki" required error={fieldError(m.error, "relation")}>{(p) => <select {...p} className="field__input" value={f.relation} onChange={(e) => setF((x) => ({ ...x, relation: e.target.value }))}><option value="owner">Malik</option><option value="tenant">Kiracı</option></select>}</Field>
        </div>
      </div>
      <div className="card__foot row" style={{ gap: "var(--s-2)" }}><SubmitButton busy={m.isPending} disabled={!f.full_name.trim() || !f.phone || !unit}>Davet oluştur</SubmitButton><button className="btn btn--ghost" type="button" onClick={() => onDone()}>Vazgeç</button></div>
    </form>
  );
}

// ---------------------------------------------------------------- Kayıt yöntemleri (istek 23)
const SWITCHES: [keyof RegSettings, string, string][] = [
  ["invite_enabled", "Davetle kayıt", "Yönetim davet eder; kişi telefonunu doğrular, onay beklemez."],
  ["qr_enabled", "QR afişle kayıt", "Afişteki kodu okutan kişi başvurur; yönetim onaylar."],
  ["code_enabled", "Site bağlantısıyla kayıt", "Paylaşılan bağlantıdan başvuru; yönetim onaylar."],
  ["owner_can_approve_tenant", "Malik kendi kiracısını onaylayabilir", "Kiracı başvurusunu malik de onaylar (ortak kararı bekleyen davranış; varsayılan kapalı)."],
  ["owner_document_required", "Malik başvurusunda belge zorunlu", "Tapu ya da yetki belgesi istenir; belge yükleme bir sonraki sürümde."],
  ["kvkk_published", "KVKK aydınlatma metni yayında", "Hukuk onayı (K8) alınınca işaretlenir; canlıya geçiş kontrol listesinde zorunlu."],
];

function RegSettingsCard() {
  const q = useSiteGet<RegSettings>("/settings/registration");
  const m = useSiteMutation<RegSettings, RegSettings>("PUT", "/settings/registration");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const s = q.data;
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Kayıt yöntemleri</span><span className="card__meta ml-auto">değişiklik anında geçerli</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        {SWITCHES.map(([k, label, desc]) => (
          <label key={k} className="check check--rich">
            <input type="checkbox" checked={Boolean(s[k])} disabled={m.isPending} onChange={(e) => m.mutate({ ...s, [k]: e.target.checked })} />
            <span><span className="strong">{label}</span><br /><span className="small muted">{desc}</span></span>
          </label>
        ))}
        <Field label="Davet geçerlilik süresi (gün)" hint="1–30; süresi dolan davet yeniden gönderilir" error={fieldError(m.error, "invite_valid_days")}>{(p) => <input {...p} className="field__input" inputMode="numeric" style={{ width: "6rem" }} defaultValue={s.invite_valid_days} onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 30 && n !== s.invite_valid_days) m.mutate({ ...s, invite_valid_days: n }); }} />}</Field>
      </div>
    </div>
  );
}
