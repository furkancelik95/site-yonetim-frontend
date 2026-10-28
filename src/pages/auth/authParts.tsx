import { useEffect, useState, type ReactNode } from "react";
import { KeyRound, Smartphone, Wallet, Wrench } from "lucide-react";
import type { Schemas } from "../../api/types";
import { Alert, Field } from "../../components/ui";
import { phoneDigits, phoneMask } from "../../lib/input";

export type CodeSent = Schemas["CodeSentOut"];

/** Giriş ekranlarının ortak çerçevesi: marka paneli + işlem paneli (Premium tasarım düzeni). */
export function AuthFrame({ title, sub, children, aside }: { title?: string; sub?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <main id="main" className="auth">
      {/* Marka paneli: ürünün ne yaptığı yazar; sahte istatistik ya da müşteri sözü yok */}
      <section className="auth__side" aria-label="SiteYönetimi hakkında">
        <div className="hero__grid" aria-hidden="true" />
        <div className="auth__brand">
          <span className="sidebar__mark" aria-hidden="true">SY</span>
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
            <li><span className="auth__feature-icon" aria-hidden="true"><Wallet /></span>Aidat ve tahsilat takibi, banka aktarımı</li>
            <li><span className="auth__feature-icon" aria-hidden="true"><Wrench /></span>Talep, duyuru, rezervasyon ve güvenlik</li>
            <li><span className="auth__feature-icon" aria-hidden="true"><Smartphone /></span>Sakinler için telefondan erişim</li>
          </ul>
        </div>
        <div className="auth__foot">© {new Date().getFullYear()} SiteYönetimi</div>
      </section>
      <div className="auth__main">
        <div className="auth__panel">
          {(title || sub) && <p className="small muted mb-0">{[title, sub].filter(Boolean).join(" · ")}</p>}
          {children}
        </div>
        {aside}
      </div>
    </main>
  );
}

/** +90 sabit önekli cep telefonu alanı (PLT-01: varsayılan +90, boşluk ve baştaki 0 temizlenir). */
export function PhoneField({ value, onChange, error, autoFocus, label = "Cep telefonu" }: { value: string; onChange: (v: string) => void; error?: string; autoFocus?: boolean; label?: string }) {
  return (
    <Field label={label} required error={error}>
      {(p) => (
        <div className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}>
          <span className="field__input" style={{ width: "auto", display: "inline-flex", alignItems: "center" }} aria-hidden="true">+90</span>
          <input
            {...p}
            className="field__input"
            style={{ flex: 1, minWidth: 0 }}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="5XX XXX XX XX"
            autoFocus={autoFocus}
            value={phoneMask(phoneDigits(value))}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </Field>
  );
}

/** 6 haneli kod (SMS ya da doğrulayıcı uygulama); `allowRecovery` → yedek kod da yazılabilir. */
export function CodeField({ value, onChange, error, label = "Doğrulama kodu", hint, allowRecovery }: { value: string; onChange: (v: string) => void; error?: string; label?: string; hint?: ReactNode; allowRecovery?: boolean }) {
  return (
    <Field label={label} required error={error} hint={hint}>
      {(p) => (
        <input
          {...p}
          className="field__input mono"
          style={{ letterSpacing: "0.3em", fontSize: "1.25rem" }}
          inputMode={allowRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoFocus
          maxLength={allowRecovery ? 12 : 6}
          value={value}
          onChange={(e) => onChange(allowRecovery ? e.target.value.trim() : e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      )}
    </Field>
  );
}

/** Geri sayım (yeniden kod göndermek için 60 sn). */
export function useCountdown(seconds: number, key: unknown) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (seconds <= 0) return;
    const t = window.setInterval(() => setLeft((v) => (v <= 1 ? (window.clearInterval(t), 0) : v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [seconds, key]);
  return left;
}

/**
 * Test sağlayıcısının kodu (yalnız geliştirme/demo; backend üretimde `test_code` döndürmez).
 * SMS sağlayıcısı seçilene dek (K5) kod dışarı gitmez; demo kullanıcısı buradan görür.
 */
export function DemoCode({ sent, onUse }: { sent: CodeSent | null; onUse: (code: string) => void }) {
  if (!sent?.test_code) return null;
  return (
    <Alert tone="info" title="Demo: mesaj gönderilmedi">
      Sağlayıcı seçilene dek (K5) kod kayda geçer, dışarı gitmez. Kod: <span className="mono strong">{sent.test_code}</span>{" "}
      <button className="btn btn--ghost btn--sm" type="button" onClick={() => onUse(sent.test_code!)}>
        <KeyRound aria-hidden="true" /> Kodu yaz
      </button>
    </Alert>
  );
}

/** Uygulama içi adres mi? (açık yönlendirme olmasın) */
export function safeBack(back: string | null): string | null {
  return back && back.startsWith("/") && !back.startsWith("//") ? back : null;
}
