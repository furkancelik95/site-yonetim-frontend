import { useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { ChevronDown, Eye, EyeOff, Smartphone, Wallet, Wrench } from "lucide-react";
import { homePath, useAuth } from "../../auth/AuthContext";
import { FormError, SubmitButton, useDocumentTitle } from "../../components/ui";

// Gösterim hesapları geliştirmede ve demo sunucusu derlemesinde listelenir (backend docs/10;
// sunucu: VITE_SHOW_DEMO_ACCOUNTS=true). Gerçek kurulumda gizli kalır.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === "true";
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
      {/* Marka paneli: ürünün ne yaptığı yazar; sahte istatistik ya da müşteri sözü yok */}
      <section className="auth__side" aria-label="SiteYönetimi hakkında">
        <div className="hero__grid" aria-hidden="true" />
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
        <div>
          <p className="auth__headline display strong">Sitenizi tek ekrandan yönetin.</p>
          <p className="auth__lead">
            Aidat, tahsilat, talep, duyuru ve güvenlik — yönetim şirketi, site yöneticisi ve sakinler için tek platform.
          </p>
          <ul className="auth__features">
            <li>
              <span className="auth__feature-icon" aria-hidden="true">
                <Wallet />
              </span>
              Aidat ve tahsilat takibi, banka aktarımı
            </li>
            <li>
              <span className="auth__feature-icon" aria-hidden="true">
                <Wrench />
              </span>
              Talep, duyuru, rezervasyon ve güvenlik
            </li>
            <li>
              <span className="auth__feature-icon" aria-hidden="true">
                <Smartphone />
              </span>
              Sakinler için telefondan erişim
            </li>
          </ul>
        </div>
        <div className="auth__foot">© {new Date().getFullYear()} SiteYönetimi</div>
      </section>

      <div className="auth__main">
        <div className="auth__panel">
          <h1>Giriş yapın</h1>
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

        {SHOW_DEMO && (
          <details className="auth__demo" open>
            <summary>
              <span>Gösterim hesapları</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <p className="small muted" style={{ margin: "var(--s-3) 0 0" }}>
              Her rolün ne gördüğünü denemek için bir hesaba tıklayın. Hepsinin parolası aynı: <span className="mono strong">{DEMO_PASSWORD}</span>
            </p>
            <div className="auth__demo-grid">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  className="demo-account"
                  title={a.desc}
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
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </main>
  );
}
