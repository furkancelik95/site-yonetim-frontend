import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { ApiError, api } from "../../api/client";
import type { Me, Written } from "../../api/types";
import { homePath, useAuth } from "../../auth/AuthContext";
import { Alert, FormError, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatPhone, isTrMobile, toE164 } from "../../lib/input";
import { AuthFrame, CodeField, DemoCode, PhoneField, safeBack, useCountdown, type CodeSent } from "./authParts";

// Gösterim hesapları geliştirmede ve demo sunucusu derlemesinde listelenir (backend docs/10;
// sunucu: VITE_SHOW_DEMO_ACCOUNTS=true). Gerçek kurulumda gizli kalır.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === "true";
const DEMO_PASSWORD = "Demo1234!";
const DEMO_ACCOUNTS = [
  { email: "platform@demo.local", name: "Deniz Aksoy", role: "Platform yöneticisi", desc: "Müşteri ekler, site açar, plan atar" },
  { email: "yonetici@demo.local", name: "Kerem Yıldırım", role: "Yönetim şirketi sahibi", desc: "Üç sitenin tamamı ve portföy" },
  { email: "muhasebe@demo.local", name: "Selin Arı", role: "Muhasebe", desc: "Üç sitede finans; modül ve kullanıcı yönetimi yok" },
  { email: "mimoza@demo.local", name: "Hakan Tunç", role: "Site yöneticisi", desc: "Yalnız Mimoza Apartmanı" },
  { email: "guvenlik@demo.local", name: "Recep Er", role: "Güvenlik", desc: "Yalnız ziyaretçi ve kargo · telefonla: 0555 000 00 02" },
  { email: "denetci@demo.local", name: "Nuray Şen", role: "Denetçi", desc: "Salt okunur finans" },
  { email: "teknik@demo.local", name: "Ergün Kılıç", role: "Teknik personel", desc: "Yalnız talepler · telefonla: 0555 000 00 03" },
  { email: "sakin@demo.local", name: "Sakin", role: "Sakin", desc: "Kendi dairesi: borç, duyuru, talep · telefonla: 0555 000 00 01" },
];

type Mode = "email" | "phone";

/**
 * Giriş (Yazılım Dokümanı PLT-01, P5): yönetici rolleri e-posta + parola (+ iki adımlı kod),
 * sakin ve saha personeli telefon + SMS kodu. Numara kayıtlı olsun olmasın aynı yanıt gelir;
 * kod doğrulanınca hesap yoksa kayıt başvurusuna yönlendirilir.
 */
export function LoginPage() {
  useDocumentTitle("Giriş");
  const { status, me } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("yontem") === "telefon" ? "phone" : "email");
  const [demoEmail, setDemoEmail] = useState<{ email: string; at: number } | null>(null);

  if (status === "authenticated" && me) return <Navigate to={homePath(me)} replace />;

  function done(user: Me | null) {
    if (!user) return; // 2FA adımı: status "mfa" olur, ekran kendini değiştirir
    navigate(user.must_change_password || user.mfa_setup_required ? homePath(user) : (safeBack(params.get("donus")) ?? homePath(user)), { replace: true });
  }

  return (
    <AuthFrame
      aside={
        SHOW_DEMO && status !== "mfa" ? (
          <details className="auth__demo" open>
            <summary>
              <span>Gösterim hesapları</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <p className="small muted" style={{ margin: "var(--s-3) 0 0" }}>
              Her rolün ne gördüğünü denemek için bir hesaba tıklayın. Hepsinin parolası aynı: <span className="mono strong">{DEMO_PASSWORD}</span>. Sakin ve saha hesapları "Telefon ile" sekmesinden SMS koduyla da girer (kod demo ekranında görünür).
            </p>
            <div className="auth__demo-grid">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} type="button" className="demo-account" title={a.desc} onClick={() => { setMode("email"); setDemoEmail({ email: a.email, at: Date.now() }); }}>
                  <span className="demo-account__row">
                    <span className="demo-account__role">{a.role}</span>
                    <span className="demo-account__name">{a.name}</span>
                  </span>
                  <span className="demo-account__mail mono xs">{a.email}</span>
                </button>
              ))}
            </div>
          </details>
        ) : undefined
      }
    >
      {status === "mfa" ? (
        <MfaStep onDone={done} />
      ) : (
        <>
          <h1 className="mt-4">Giriş yapın</h1>
          <p className="muted small">Yönetim ekibi e-posta ve parolayla, sakinler ve saha personeli telefon numarasıyla girer.</p>
          <div className="row" role="tablist" aria-label="Giriş yöntemi" style={{ gap: "var(--s-2)", marginTop: "var(--s-4)" }}>
            <button type="button" role="tab" aria-selected={mode === "email"} className={`btn btn--sm${mode === "email" ? " btn--primary" : ""}`} onClick={() => setMode("email")}>E-posta ile</button>
            <button type="button" role="tab" aria-selected={mode === "phone"} className={`btn btn--sm${mode === "phone" ? " btn--primary" : ""}`} onClick={() => setMode("phone")}>Telefon ile</button>
          </div>
          {mode === "email" ? <EmailLogin onDone={done} demo={demoEmail} /> : <PhoneLogin onDone={done} />}
          <p className="small mt-4 mb-0">
            <Link to="/parola-sifirla">Parolamı unuttum</Link>
          </p>
        </>
      )}
    </AuthFrame>
  );
}

function EmailLogin({ onDone, demo }: { onDone: (me: Me | null) => void; demo: { email: string; at: number } | null }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [seen, setSeen] = useState(0);
  if (demo && demo.at !== seen) {
    setSeen(demo.at);
    setEmail(demo.email);
    setPassword(DEMO_PASSWORD);
    queueMicrotask(() => passwordRef.current?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await login(email.trim(), password));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-5)" }} onSubmit={submit} noValidate>
      <FormError error={error} />
      <div className="field">
        <label className="field__label" htmlFor="email">E-posta</label>
        <input className="field__input" id="email" type="email" inputMode="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="password">Parola</label>
        <div className="field__wrap">
          <input ref={passwordRef} className="field__input" id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="field__toggle" aria-label={show ? "Parolayı gizle" : "Parolayı göster"} aria-pressed={show} onClick={() => setShow((v) => !v)}>
            {show ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
          </button>
        </div>
      </div>
      <SubmitButton busy={busy} className="btn btn--primary" disabled={!email || !password}>Giriş yap</SubmitButton>
    </form>
  );
}

function PhoneLogin({ onDone }: { onDone: (me: Me | null) => void }) {
  const { loginWithCode } = useAuth();
  const [phone, setPhone] = useState("");
  const [phoneErr, setPhoneErr] = useState<string>();
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const left = useCountdown(sent?.resend_after_seconds ?? 0, sent);

  async function requestCode() {
    if (!isTrMobile(phone)) {
      setPhoneErr("Cep telefonu 5 ile başlayan 10 hane olmalı (5XX XXX XX XX).");
      return;
    }
    setPhoneErr(undefined);
    setBusy(true);
    setError(null);
    try {
      const res = await api<Written<CodeSent>>("POST", "/auth/otp/request", { body: { phone: toE164(phone) } });
      setSent(res.data);
      setCode("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await loginWithCode(toE164(phone), code));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const noAccount = error instanceof ApiError && error.code === "no_account";
  if (!sent) {
    return (
      <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-5)" }} onSubmit={(e) => { e.preventDefault(); void requestCode(); }} noValidate>
        <FormError error={error} />
        <PhoneField value={phone} onChange={setPhone} error={phoneErr ?? fieldError(error, "phone")} autoFocus />
        <SubmitButton busy={busy} disabled={!phone}>Kod gönder</SubmitButton>
        <p className="xs muted mb-0">Numaranıza 6 haneli, 3 dakika geçerli bir kod gönderilir. Günde en fazla 10 kod istenebilir.</p>
      </form>
    );
  }
  return (
    <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-5)" }} onSubmit={verify} noValidate>
      {noAccount ? (
        <Alert tone="warn" title="Bu numarayla kayıtlı hesap yok">
          Sitenizin kayıt bağlantısından (lobi/asansördeki QR afiş ya da yönetimin paylaştığı bağlantı) başvuru yapabilirsiniz. Başvurunuz onaylanınca bu numarayla girersiniz.
        </Alert>
      ) : (
        <FormError error={error} />
      )}
      <p className="small mb-0">
        Kod <span className="mono strong">{formatPhone(toE164(phone))}</span> numarasına gönderildi.{" "}
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => { setSent(null); setError(null); }}>Numarayı değiştir</button>
      </p>
      <DemoCode sent={sent} onUse={setCode} />
      <CodeField value={code} onChange={setCode} error={fieldError(error, "code")} label="SMS kodu" />
      <SubmitButton busy={busy} disabled={code.length !== 6}>Giriş yap</SubmitButton>
      <button className="btn btn--ghost btn--sm" type="button" disabled={left > 0 || busy} onClick={() => void requestCode()}>
        {left > 0 ? `Yeni kod (${left} sn)` : "Yeni kod gönder"}
      </button>
    </form>
  );
}

/** Girişin ikinci adımı: doğrulayıcı uygulamadaki kod ya da yedek kod (PLT-01 adım 7–8). */
function MfaStep({ onDone }: { onDone: (me: Me | null) => void }) {
  const { completeMfa, logout } = useAuth();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await completeMfa(code));
    } catch (err) {
      setError(err);
      setBusy(false);
      if (err instanceof ApiError && err.status === 429) await logout();
    }
  }

  return (
    <>
      <h1 className="mt-4">İki adımlı doğrulama</h1>
      <p className="muted small">{recovery ? "Kurulumda kaydettiğiniz yedek kodlardan birini girin (her biri bir kez kullanılır)." : "Doğrulayıcı uygulamanızdaki (Google Authenticator, Microsoft Authenticator vb.) 6 haneli kodu girin."}</p>
      <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-4)" }} onSubmit={submit} noValidate>
        <FormError error={error} />
        <CodeField key={recovery ? "r" : "t"} value={code} onChange={setCode} label={recovery ? "Yedek kod" : "Doğrulama kodu"} error={fieldError(error, "code")} allowRecovery={recovery} />
        <SubmitButton busy={busy} disabled={recovery ? code.replace(/\W/g, "").length !== 8 : code.length !== 6}>Doğrula</SubmitButton>
        <div className="row" style={{ gap: "var(--s-2)" }}>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => { setRecovery((v) => !v); setCode(""); }}>{recovery ? "Doğrulayıcı kodu kullan" : "Yedek kod kullan"}</button>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => void logout()}>Vazgeç</button>
        </div>
      </form>
    </>
  );
}
