import { useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { homePath, useAuth } from "../../auth/AuthContext";
import { FormError, SubmitButton, useDocumentTitle } from "../../components/ui";

// Gösterim hesapları yalnız geliştirme ortamında listelenir (backend docs/10).
const DEMO_PASSWORD = "Demo1234!";
const DEMO_ACCOUNTS = [
  { email: "platform@demo.local", name: "Deniz Aksoy", role: "Platform yöneticisi", desc: "Müşteri ekler, site açar, plan atar" },
  { email: "yonetici@demo.local", name: "Kerem Yıldırım", role: "Yönetim şirketi sahibi", desc: "Üç sitenin tamamı ve portföy" },
  { email: "muhasebe@demo.local", name: "Selin Arı", role: "Muhasebe", desc: "Üç sitede finans; modül ve kullanıcı yönetimi yok" },
  { email: "mimoza@demo.local", name: "Hakan Tunç", role: "Site yöneticisi", desc: "Yalnız Mimoza Apartmanı" },
  { email: "guvenlik@demo.local", name: "Recep Er", role: "Güvenlik", desc: "Yalnız ziyaretçi ve kargo" },
  { email: "denetci@demo.local", name: "Nuray Şen", role: "Denetçi", desc: "Salt okunur finans" },
  { email: "teknik@demo.local", name: "Ergün Kılıç", role: "Teknik personel", desc: "Yalnız talepler" },
  { email: "sakin@demo.local", name: "Sakin", role: "Sakin", desc: "Kendi dairesi: borç, duyuru, talep" },
];

export function LoginPage() {
  useDocumentTitle("Giriş");
  const { status, me, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  if (status === "authenticated" && me) return <Navigate to={homePath(me)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      const back = params.get("donus");
      // Yalnız uygulama içi adrese dönülür (açık yönlendirme olmasın).
      const safeBack = back && back.startsWith("/") && !back.startsWith("//") ? back : null;
      navigate(user.must_change_password ? "/parola-degistir" : (safeBack ?? homePath(user)), { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main id="main" className="auth">
      <div className="auth__panel">
        <div className="auth__brand">
          <span className="sidebar__mark" aria-hidden="true">
            SY
          </span>
          <span>
            <span className="sidebar__name">SiteYönetimi</span>
            <br />
            <span className="sidebar__sub">Site ve apartman yönetim platformu</span>
          </span>
        </div>

        <h1 className="mt-4">Giriş yapın</h1>
        <p className="muted small">Hesabınızla giriş yaparak sitenizin yönetim ekranına ulaşın.</p>

        <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-5)" }} onSubmit={submit} noValidate>
          <FormError error={error} />

          <div className="field">
            <label className="field__label" htmlFor="email">
              E-posta
            </label>
            <input
              className="field__input"
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">
              Parola
            </label>
            <div className="field__wrap">
              <input
                ref={passwordRef}
                className="field__input"
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="field__toggle"
                aria-label={show ? "Parolayı gizle" : "Parolayı göster"}
                aria-pressed={show}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
              </button>
            </div>
          </div>

          <SubmitButton busy={busy} className="btn btn--primary" disabled={!email || !password}>
            Giriş yap
          </SubmitButton>
        </form>
      </div>

      {import.meta.env.DEV && (
        <aside className="auth__demo" aria-label="Gösterim hesapları">
          <div className="section-title">Gösterim hesapları</div>
          <p className="small muted">
            Her rolün ne gördüğünü denemek için aşağıdaki hesaplarla giriş yapabilirsiniz. Hepsinin parolası aynı:{" "}
            <span className="mono strong">{DEMO_PASSWORD}</span>
          </p>
          <div className="stack" style={{ gap: "var(--s-2)", marginTop: "var(--s-4)" }}>
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                className="demo-account"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  passwordRef.current?.focus();
                }}
              >
                <span className="demo-account__row">
                  <span className="demo-account__role">{a.role}</span>
                  <span className="demo-account__name">{a.name}</span>
                </span>
                <span className="demo-account__mail mono xs">{a.email}</span>
                <span className="demo-account__desc">{a.desc}</span>
              </button>
            ))}
          </div>
        </aside>
      )}
    </main>
  );
}
