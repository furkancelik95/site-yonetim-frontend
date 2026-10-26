import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { KeyRound, LogOut, MonitorSmartphone, ShieldAlert, Smartphone } from "lucide-react";
import { api } from "../api/client";
import type { Written } from "../api/types";
import { useToast } from "../components/toast";
import { FormError, fieldError } from "../components/ui";
import { formatPhone, isTrMobile, toE164 } from "../lib/input";
import { MfaSetupCard, RecoveryCodesBox } from "./auth/AccountPages";
import { CodeField, DemoCode, PhoneField } from "./auth/authParts";
import { useMeGet, useMeMutation } from "../api/hooks";
import type { Schemas } from "../api/types";
import { useAuth, useMe } from "../auth/AuthContext";
import { Alert, Badge, ConfirmButton, Empty, ErrorState, Loading, PageHead, useDocumentTitle } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { notificationChannel } from "../lib/labels";

type Session = Schemas["SessionOut"];
type AuthEvent = Schemas["AuthEventOut"];
type Preferences = Schemas["PreferencesOut"];
type Change = Schemas["PreferenceChange"];

const RISKY = new Set(["login_failed", "account_locked", "token_reused"]);
const RULE: Record<string, string> = { locked: "Kapatılamaz", at_least_one: "En az bir kanal açık kalmalı" };

/**
 * Profil (PLT-10): güvenlik (telefon, iki adımlı doğrulama, yedek kodlar), açık oturumlar,
 * güvenlik olayları, bildirim tercihleri. Personel ve sakin
 * aynı ekranı kullanır; `passwordPath` parola değiştirme sayfasının adresi.
 */
export function ProfilePage({ passwordPath = "/parola-degistir" }: { passwordPath?: string }) {
  useDocumentTitle("Profil");
  const me = useMe();
  return (
    <div className="stack">
      <PageHead
        title="Profil"
        subtitle={`${me.full_name} — oturumlarınız, güvenlik olaylarınız ve bildirim tercihleriniz`}
        actions={<Link className="btn" to={passwordPath}><KeyRound aria-hidden="true" /> Parola değiştir</Link>}
      />
      <AccountSecurity />
      <Sessions />
      <div className="grid grid--2">
        <NotificationPreferences />
        <SecurityEvents />
      </div>
    </div>
  );
}

function Sessions() {
  const { logout } = useAuth();
  const q = useMeGet<Session[]>("/sessions");
  const revokeOne = useMeMutation<string, undefined>("DELETE", (id) => `/sessions/${id}`);
  const revokeOthers = useMeMutation<Record<string, never>, Schemas["RevokedOut"]>("DELETE", "/sessions?keep_current=true");
  const others = (q.data ?? []).filter((s) => !s.is_current).length;
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__icon card__icon--info"><MonitorSmartphone aria-hidden="true" /></span>
        <span className="card__title">Açık oturumlar</span>
        {others > 0 && (
          <span className="ml-auto">
            <ConfirmButton className="btn btn--sm" title="Diğer cihazlardan çık" confirmLabel="Çıkış yap" body={`Bu cihaz dışındaki ${others} oturum kapatılır; o cihazlarda yeniden giriş gerekir.`} onConfirm={() => revokeOthers.mutateAsync({})}>
              <LogOut aria-hidden="true" /> Diğer cihazlardan çık
            </ConfirmButton>
          </span>
        )}
      </div>
      <div className="card__body card__body--flush">
        {q.isPending ? <Loading /> : q.isError ? <div className="card__body"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Açık oturumlar</caption>
              <thead><tr><th scope="col">Cihaz</th><th scope="col">Son kullanım</th><th scope="col">Açılış</th><th scope="col"><span className="visually-hidden">İşlem</span></th></tr></thead>
              <tbody>
                {q.data.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-main">{s.device}{s.is_current && <> <Badge tone="ok">Bu cihaz</Badge></>}</div>
                      {s.ip && <div className="cell-sub mono">{s.ip}</div>}
                    </td>
                    <td className="small nowrap">{formatDateTime(s.last_used_at)}</td>
                    <td className="small nowrap">{formatDateTime(s.created_at)}</td>
                    <td className="right">
                      {s.is_current ? (
                        <button className="btn btn--ghost btn--sm" type="button" onClick={logout}>Çıkış yap</button>
                      ) : (
                        <ConfirmButton className="btn btn--ghost btn--sm" title="Oturumu kapat" confirmLabel="Kapat" body={`${s.device} cihazındaki oturum kapatılır.`} onConfirm={() => revokeOne.mutateAsync(s.id)}>Kapat</ConfirmButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card__foot"><p className="small muted mb-0">Tanımadığınız bir cihaz görürseniz oturumu kapatın ve parolanızı değiştirin.</p></div>
    </div>
  );
}

function SecurityEvents() {
  const q = useMeGet<AuthEvent[]>("/security-events");
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--danger"><ShieldAlert aria-hidden="true" /></span><span className="card__title">Güvenlik olayları</span></div>
      <div className="card__body">
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? <Empty title="Kayıt yok" /> : (
          <ul className="stack small" style={{ gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }}>
            {q.data.slice(0, 20).map((e, i) => (
              <li key={`${e.at}-${i}`}>
                {RISKY.has(e.kind) ? <Badge tone="warn">{e.label}</Badge> : <span className="strong">{e.label}</span>}
                <div className="muted">{formatDateTime(e.at)} · {e.device}{e.ip ? ` · ${e.ip}` : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NotificationPreferences() {
  const q = useMeGet<Preferences>("/notification-preferences");
  const save = useMeMutation<{ changes: Change[] }, Preferences>("PUT", "/notification-preferences");
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const key = (c: Change) => `${c.category}:${c.channel}`;
  const changes: Change[] = Object.entries(draft).map(([k, enabled]) => {
    const [category, channel] = k.split(":") as [Change["category"], Change["channel"]];
    return { category, channel, enabled };
  });
  const channels = q.data?.categories[0]?.channels.map((c) => c.channel) ?? [];
  return (
    <div className="card">
      <div className="card__head"><span className="card__title">Bildirim tercihleri</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <>
            {!q.data.delivery_enabled ? (
              <Alert tone="info">SMS, e-posta ve mobil bildirim gönderimi henüz açılmadı. Tercihleriniz kaydedilir, gönderim başlayınca uygulanır.</Alert>
            ) : q.data.test_provider && (
              <Alert tone="info">Tercihleriniz gönderimde uygulanır. SMS/e-posta sağlayıcısı seçilene dek (K5) mesajlar kayda geçer, dışarı gönderilmez.</Alert>
            )}
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">Bildirim kategorisi ve kanal tercihleri</caption>
                <thead><tr><th scope="col">Konu</th>{channels.map((c) => <th key={c} scope="col" className="center">{notificationChannel(c)}</th>)}</tr></thead>
                <tbody>
                  {q.data.categories.map((row) => (
                    <tr key={row.category}>
                      <td><div className="cell-main">{row.label}</div>{RULE[row.rule] && <div className="cell-sub">{RULE[row.rule]}</div>}</td>
                      {row.channels.map((cell) => {
                        const k = key({ category: row.category, channel: cell.channel, enabled: cell.enabled });
                        const on = draft[k] ?? cell.enabled;
                        return (
                          <td key={cell.channel} className="center">
                            <input
                              type="checkbox"
                              aria-label={`${row.label} — ${notificationChannel(cell.channel)}`}
                              checked={on}
                              disabled={cell.locked || save.isPending}
                              title={cell.locked ? "Bu kanal bu konu için kapatılamaz" : undefined}
                              onChange={(e) => {
                                const v = e.target.checked;
                                setDraft((d) => {
                                  const n = { ...d };
                                  if (v === cell.enabled) delete n[k]; else n[k] = v;
                                  return n;
                                });
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {changes.length > 0 && (
        <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
          <button className="btn btn--primary" type="button" disabled={save.isPending} aria-busy={save.isPending || undefined} onClick={() => save.mutate({ changes }, { onSuccess: () => setDraft({}) })}>Kaydet</button>
          <button className="btn btn--ghost" type="button" onClick={() => setDraft({})}>Vazgeç</button>
          {save.error && <span className="field__error" role="alert">{(save.error as Error).message}</span>}
        </div>
      )}
    </div>
  );
}

type Security = Schemas["AccountSecurityOut"];
type CodeSentOut = Schemas["CodeSentOut"];

/** Güvenlik (PLT-10, §4.7): telefon değişikliği, iki adımlı doğrulama ve yedek kodlar. */
function AccountSecurity() {
  const q = useMeGet<Security>("/security");
  const [mode, setMode] = useState<"" | "phone" | "mfa" | "codes" | "disable">("");
  const close = () => {
    setMode("");
    void q.refetch();
  };
  return (
    <div className="card">
      <div className="card__head"><span className="card__icon card__icon--info"><Smartphone aria-hidden="true" /></span><span className="card__title">Güvenlik</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <>
            <div className="kv"><span className="kv__k">E-posta</span><span className="kv__v mono">{q.data.email ?? "—"}</span></div>
            <div className="kv">
              <span className="kv__k">Telefon</span>
              <span className="kv__v">
                <span className="mono">{q.data.phone ? formatPhone(q.data.phone) : "Kayıtlı değil"}</span>{" "}
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => setMode(mode === "phone" ? "" : "phone")}>{q.data.phone ? "Değiştir" : "Ekle"}</button>
              </span>
            </div>
            {q.data.phone_changed_at && <p className="xs muted mb-0">Telefon {formatDateTime(q.data.phone_changed_at)} tarihinde değişti; 24 saat boyunca finansal işlemlerde ek doğrulama istenir.</p>}
            {mode === "phone" && <PhoneChange onDone={close} />}
            <div className="kv">
              <span className="kv__k">İki adımlı doğrulama</span>
              <span className="kv__v">
                {q.data.mfa.enabled ? <Badge tone="ok">Açık</Badge> : q.data.mfa.required ? <Badge tone="warn">Zorunlu — kurulmadı</Badge> : <Badge>Kapalı</Badge>}{" "}
                {q.data.mfa.enabled ? (
                  <>
                    <button className="btn btn--ghost btn--sm" type="button" onClick={() => setMode(mode === "codes" ? "" : "codes")}>Yedek kodları yenile</button>
                    {!q.data.mfa.required && <button className="btn btn--ghost btn--sm" type="button" onClick={() => setMode(mode === "disable" ? "" : "disable")}>Kapat</button>}
                  </>
                ) : (
                  <button className="btn btn--ghost btn--sm" type="button" onClick={() => setMode(mode === "mfa" ? "" : "mfa")}>Kur</button>
                )}
              </span>
            </div>
            {q.data.mfa.enabled && <p className="xs muted mb-0">Kalan yedek kod: {q.data.mfa.recovery_codes_left}{q.data.mfa.recovery_codes_left <= 3 ? " — azaldı, yenileyin." : ""}</p>}
            {!q.data.mfa.enabled && q.data.mfa.setup_deadline && <p className="xs muted mb-0">Yönetici rolünde zorunlu: {formatDateTime(q.data.mfa.setup_deadline)} tarihine kadar kurun.</p>}
            {mode === "mfa" && <MfaSetupCard onEnabled={close} />}
            {mode === "codes" && <MfaCodeAction path="/auth/mfa/recovery-codes" label="Yeni yedek kod üret" onDone={close} showCodes />}
            {mode === "disable" && <MfaCodeAction path="/auth/mfa/disable" label="İki adımlı doğrulamayı kapat" onDone={close} />}
          </>
        )}
      </div>
    </div>
  );
}

function PhoneChange({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<CodeSentOut | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [phoneErr, setPhoneErr] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!sent) {
        if (!isTrMobile(phone)) {
          setPhoneErr("Cep telefonu 5 ile başlayan 10 hane olmalı.");
          return;
        }
        setPhoneErr(undefined);
        const r = await api<Written<CodeSentOut>>("POST", "/me/phone-change", { body: { phone: toE164(phone) } });
        setSent(r.data);
        toast(r.message);
        return;
      }
      const r = await api<Written<unknown>>("POST", "/me/phone-change/confirm", { body: { phone: toE164(phone), code } });
      toast(r.message);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={submit}>
      <FormError error={error} />
      {!sent ? (
        <PhoneField value={phone} onChange={setPhone} label="Yeni cep telefonu" error={phoneErr ?? fieldError(error, "phone")} autoFocus />
      ) : (
        <>
          <p className="small mb-0">Kod <span className="mono">{sent.sent_to}</span> numarasına gönderildi. Onaylayınca eski numaranıza bilgilendirme gider.</p>
          <DemoCode sent={sent} onUse={setCode} />
          <CodeField value={code} onChange={setCode} error={fieldError(error, "code")} label="SMS kodu" />
        </>
      )}
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy || (sent ? code.length !== 6 : !phone)} aria-busy={busy || undefined}>{sent ? "Onayla" : "Kod gönder"}</button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}

/** Doğrulayıcı koduyla yapılan 2FA işlemi (yedek kod yenileme, kapatma). */
function MfaCodeAction({ path, label, onDone, showCodes }: { path: string; label: string; onDone: () => void; showCodes?: boolean }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<Written<{ codes: string[] }> | undefined>("POST", path, { body: { code } });
      if (showCodes && res) {
        toast(res.message);
        setCodes(res.data.codes);
      } else {
        toast("İki adımlı doğrulama kapatıldı.");
        onDone();
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (codes) return <RecoveryCodesBox codes={codes} onDone={onDone} />;
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} noValidate onSubmit={submit}>
      <FormError error={error} />
      <CodeField value={code} onChange={setCode} error={fieldError(error, "code")} label="Doğrulayıcıdaki kod" allowRecovery={!showCodes} />
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy || code.length < 6} aria-busy={busy || undefined}>{label}</button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onDone}>Vazgeç</button>
      </div>
    </form>
  );
}
