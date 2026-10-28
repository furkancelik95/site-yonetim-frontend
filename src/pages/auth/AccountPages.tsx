import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, ShieldCheck } from "lucide-react";
import { api, get } from "../../api/client";
import type { Me, Schemas, Written } from "../../api/types";
import { homePath, useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/toast";
import { Alert, ErrorState, Field, FormError, Loading, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { isTrMobile, toE164 } from "../../lib/input";
import { AuthFrame, CodeField, DemoCode, PhoneField, useCountdown, type CodeSent } from "./authParts";

type InvitationInfo = Schemas["InvitationInfoOut"];
type MfaSetup = Schemas["MfaSetupOut"];
type RecoveryCodes = Schemas["RecoveryCodesOut"];

const PASSWORD_HINT = "En az 8 karakter. Yönetici hesapları için uzun ve tahmin edilemez bir parola seçin.";

// ============================================================ Parola sıfırlama (PLT-01)
/**
 * "Parolamı unuttum": e-posta ya da telefona 6 haneli kod; kod + yeni parola. Hesap olsun olmasın
 * aynı yanıt gelir (hesabın varlığı sızmaz). Başarıda bütün oturumlar kapanır.
 */
export function PasswordResetPage() {
  useDocumentTitle("Parola sıfırlama");
  const navigate = useNavigate();
  const toast = useToast();
  const [by, setBy] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [phoneErr, setPhoneErr] = useState<string>();
  const left = useCountdown(sent?.resend_after_seconds ?? 0, sent);
  const target = by === "email" ? { email: email.trim().toLocaleLowerCase("tr-TR") } : { phone: toE164(phone) };

  async function request() {
    if (by === "phone" && !isTrMobile(phone)) return setPhoneErr("Cep telefonu 5 ile başlayan 10 hane olmalı.");
    setPhoneErr(undefined);
    setBusy(true);
    setError(null);
    try {
      const res = await api<Written<CodeSent>>("POST", "/auth/password/forgot", { body: target });
      setSent(res.data);
      toast(res.message);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<Written<unknown>>("POST", "/auth/password/reset", { body: { ...target, code, new_password: password } });
      toast(res.message);
      navigate("/giris", { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <AuthFrame sub="Parola sıfırlama">
      <h1 className="mt-4">Parolamı unuttum</h1>
      {!sent ? (
        <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-4)" }} onSubmit={(e) => { e.preventDefault(); void request(); }} noValidate>
          <p className="muted small mb-0">Hesabınıza kayıtlı e-posta adresine ya da telefona sıfırlama kodu gönderelim.</p>
          <div className="row" role="tablist" aria-label="Kod nereye gitsin" style={{ gap: "var(--s-2)" }}>
            <button type="button" role="tab" aria-selected={by === "email"} className={`btn btn--sm${by === "email" ? " btn--primary" : ""}`} onClick={() => setBy("email")}>E-posta</button>
            <button type="button" role="tab" aria-selected={by === "phone"} className={`btn btn--sm${by === "phone" ? " btn--primary" : ""}`} onClick={() => setBy("phone")}>Telefon</button>
          </div>
          <FormError error={error} />
          {by === "email" ? (
            <Field label="E-posta" required error={fieldError(error, "email")}>{(p) => <input {...p} className="field__input" type="email" inputMode="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          ) : (
            <PhoneField value={phone} onChange={setPhone} error={phoneErr ?? fieldError(error, "phone")} autoFocus />
          )}
          <SubmitButton busy={busy} disabled={by === "email" ? !email : !phone}>Kod gönder</SubmitButton>
        </form>
      ) : (
        <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-4)" }} onSubmit={reset} noValidate>
          <p className="muted small mb-0">Bu adrese kayıtlı bir hesap varsa <span className="mono">{sent.sent_to}</span> adresine kod gönderildi. Kod 3 dakika geçerli.</p>
          <FormError error={error} />
          <DemoCode sent={sent} onUse={setCode} />
          <CodeField value={code} onChange={setCode} error={fieldError(error, "code")} label="Sıfırlama kodu" />
          <Field label="Yeni parola" required hint={PASSWORD_HINT} error={fieldError(error, "new_password")}>
            {(p) => <input {...p} className="field__input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <SubmitButton busy={busy} disabled={code.length !== 6 || !password}>Parolayı yenile</SubmitButton>
          <button className="btn btn--ghost btn--sm" type="button" disabled={left > 0 || busy} onClick={() => void request()}>{left > 0 ? `Yeni kod (${left} sn)` : "Yeni kod gönder"}</button>
        </form>
      )}
      <p className="small mt-4 mb-0"><Link to="/giris">Girişe dön</Link></p>
    </AuthFrame>
  );
}

// ============================================================ Hesap daveti (PLT-09, 72 saat)
/** /hesap-davet/:token — yönetimin eklediği kullanıcı parolasını belirler ve girer. */
export function AccountInvitePage() {
  useDocumentTitle("Hesap daveti");
  const { token = "" } = useParams();
  const { acceptInvitation } = useAuth();
  const navigate = useNavigate();
  const inv = useQuery({ queryKey: ["account-invitation", token], queryFn: () => get<InvitationInfo>(`/auth/invitations/${encodeURIComponent(token)}`), retry: false });
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mismatch = again.length > 0 && again !== password ? "Parolalar aynı değil." : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      const me = await acceptInvitation(token, password);
      navigate(me ? homePath(me) : "/giris", { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={inv.data?.site_name ?? undefined} sub="Hesap daveti">
      {inv.isPending ? <Loading /> : inv.isError ? <div className="mt-4"><ErrorState error={inv.error} /></div> : inv.data.status === "accepted" ? (
        <Alert tone="info" title="Bu davet kullanılmış">Hesabınız açık. <Link to="/giris">Giriş yapın</Link>; parolanızı unuttuysanız "Parolamı unuttum"u kullanın.</Alert>
      ) : inv.data.status === "expired" ? (
        <Alert tone="warn" title="Davetin süresi doldu">Davet bağlantısı 72 saat geçerlidir. Site yönetiminden yeni davet isteyin.</Alert>
      ) : (
        <>
          <h1 className="mt-4">Merhaba {inv.data.full_name}</h1>
          <p className="muted small mb-0">
            {inv.data.invited_by_name ?? "Site yönetimi"} sizi {inv.data.site_name ? <strong>{inv.data.site_name}</strong> : "platforma"}{inv.data.role_label ? <> <strong>{inv.data.role_label}</strong> olarak</> : null} ekledi. Giriş adresiniz: <span className="mono">{inv.data.login}</span>
          </p>
          <p className="small muted">Davet {formatDateTime(inv.data.expires_at)} tarihine kadar geçerli.</p>
          <form className="stack" style={{ gap: "var(--s-4)" }} onSubmit={submit} noValidate>
            <FormError error={error} />
            <Field label="Parola" required hint={PASSWORD_HINT} error={fieldError(error, "new_password") ?? fieldError(error, "password")}>
              {(p) => <input {...p} className="field__input" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            <Field label="Parola (tekrar)" required error={mismatch}>
              {(p) => <input {...p} className="field__input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />}
            </Field>
            <SubmitButton busy={busy} disabled={!password || password !== again}>Parolamı belirle ve gir</SubmitButton>
            <p className="xs muted mb-0">Yönetici rollerinde girişten sonra iki adımlı doğrulama kurmanız istenir.</p>
          </form>
        </>
      )}
    </AuthFrame>
  );
}

// ============================================================ İki adımlı doğrulama kurulumu (§4.7)
/**
 * Doğrulayıcı uygulama kurulumu: QR (frontend çizer — `qrcode`), elle anahtar, ilk kodla
 * etkinleştirme, yedek kodların bir kez gösterilmesi. Profilde ve zorunlu kurulum ekranında aynı.
 */
export function MfaSetupCard({ onEnabled }: { onEnabled?: () => void }) {
  const toast = useToast();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!setup) return;
    let live = true;
    QRCode.toDataURL(setup.otpauth_uri, { width: 220, margin: 1, errorCorrectionLevel: "M" }).then((d) => live && setQr(d));
    return () => {
      live = false;
    };
  }, [setup]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setSetup(await api<MfaSetup>("POST", "/auth/mfa/setup"));
      setCode("");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function enable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<Written<RecoveryCodes>>("POST", "/auth/mfa/enable", { body: { code } });
      setCodes(res.data.codes);
      toast(res.message);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (codes) return <RecoveryCodesBox codes={codes} onDone={onEnabled} />;
  if (!setup) {
    return (
      <div className="stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={error} />
        <p className="small mb-0">Telefonunuza bir doğrulayıcı uygulama (Google Authenticator, Microsoft Authenticator, 1Password vb.) kurun; sonra QR kodu okutun.</p>
        <div><button className="btn btn--primary" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void start()}><ShieldCheck aria-hidden="true" /> Kurulumu başlat</button></div>
      </div>
    );
  }
  return (
    <form className="stack" style={{ gap: "var(--s-3)" }} onSubmit={enable} noValidate>
      <FormError error={error} />
      <div className="row" style={{ gap: "var(--s-4)", alignItems: "flex-start", flexWrap: "wrap" }}>
        {qr ? <img src={qr} width={220} height={220} alt="Doğrulayıcı uygulamada okutulacak QR kod" style={{ borderRadius: 8 }} /> : <Loading />}
        <div className="stack" style={{ gap: "var(--s-2)", minWidth: 0, flex: 1 }}>
          <div className="small">QR okutamıyorsanız anahtarı elle girin:</div>
          <code className="mono small" style={{ wordBreak: "break-all" }}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          <div className="xs muted">Hesap: {setup.account} · {setup.issuer}</div>
          <div><button className="btn btn--ghost btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(setup.secret).then(() => toast("Anahtar kopyalandı."))}><Copy aria-hidden="true" /> Anahtarı kopyala</button></div>
        </div>
      </div>
      <CodeField value={code} onChange={setCode} error={fieldError(error, "code")} label="Uygulamadaki 6 haneli kod" />
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <SubmitButton busy={busy} disabled={code.length !== 6}>Etkinleştir</SubmitButton>
        <button className="btn btn--ghost" type="button" onClick={() => void start()} disabled={busy}>Yeni QR</button>
      </div>
    </form>
  );
}

/** Yedek kodlar yalnız bir kez gösterilir (backend yalnız özetlerini saklar). */
export function RecoveryCodesBox({ codes, onDone }: { codes: string[]; onDone?: () => void }) {
  const toast = useToast();
  const text = codes.join("\n");
  return (
    <div className="stack" style={{ gap: "var(--s-3)" }}>
      <Alert tone="warn" title="Yedek kodları şimdi kaydedin">Telefonunuzu kaybederseniz bu kodlarla girersiniz. Her kod bir kez kullanılır; bu liste bir daha gösterilmez.</Alert>
      <ol className="mono small" style={{ columns: 2, margin: 0 }}>{codes.map((c) => <li key={c}>{c}</li>)}</ol>
      <div className="row" style={{ gap: "var(--s-2)" }}>
        <button className="btn btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => toast("Yedek kodlar kopyalandı."))}><Copy aria-hidden="true" /> Kopyala</button>
        {onDone && <button className="btn btn--primary btn--sm" type="button" onClick={onDone}>Kaydettim, devam et</button>}
      </div>
    </div>
  );
}

/**
 * /iki-adimli-dogrulama — yönetici rolünde geçiş süresi dolunca zorunlu ekran (backend diğer uçlara
 * 403 `mfa_setup_required` döner). Süre dolmadan da buradan kurulabilir.
 */
export function MfaRequiredPage() {
  useDocumentTitle("İki adımlı doğrulama");
  const { me, reloadMe, logout } = useAuth();
  const navigate = useNavigate();
  if (!me) return <Navigate to="/giris" replace />;
  if (me.mfa_enabled) return <Navigate to={homePath(me)} replace />;
  async function finished() {
    const fresh: Me | null = await reloadMe();
    navigate(fresh ? homePath(fresh) : "/giris", { replace: true });
  }
  return (
    <AuthFrame sub="Hesap güvenliği">
      <h1 className="mt-4">İki adımlı doğrulamayı kurun</h1>
      {me.mfa_setup_required ? (
        <Alert tone="warn" title="Kurulum zorunlu">Yönetici rollerinde iki adımlı doğrulama zorunludur; geçiş süresi doldu. Kurulumu tamamlayınca kaldığınız yerden devam edersiniz.</Alert>
      ) : (
        me.mfa_setup_deadline && <Alert tone="info" title="Geçiş süresi">{formatDateTime(me.mfa_setup_deadline)} tarihine kadar kurulum yapmadan da girebilirsiniz.</Alert>
      )}
      <div className="mt-4"><MfaSetupCard onEnabled={() => void finished()} /></div>
      <div className="row mt-4" style={{ gap: "var(--s-2)" }}>
        {!me.mfa_setup_required && <Link className="btn btn--ghost btn--sm" to={homePath({ ...me, mfa_setup_required: false })}>Sonra kur</Link>}
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => void logout()}>Çıkış yap</button>
      </div>
    </AuthFrame>
  );
}

/** Yönetici rolünde 2FA kurulmamışken (geçiş süresi) üstte uyarı bandı. */
export function MfaGraceBanner() {
  const { me } = useAuth();
  if (!me || me.mfa_enabled || !me.mfa_setup_deadline || me.mfa_setup_required) return null;
  return (
    <div className="alert alert--warn" role="status" style={{ borderRadius: 0, margin: 0 }}>
      <ShieldCheck aria-hidden="true" />
      <div className="small">
        Yönetici rolünde iki adımlı doğrulama zorunlu. {formatDateTime(me.mfa_setup_deadline)} tarihine kadar kurun; sonra kurulmadan devam edilemez.{" "}
        <Link to="/iki-adimli-dogrulama">Şimdi kur</Link>
      </div>
    </div>
  );
}
