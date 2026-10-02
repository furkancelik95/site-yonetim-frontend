import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/client";
import { homePath, useAuth } from "../../auth/AuthContext";
import { Alert, Field, FormError, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";

const MIN_LENGTH = 8; // backend docs/05 §8

export function ChangePasswordPage() {
  useDocumentTitle("Parolayı değiştir");
  const { me, reloadMe, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [touched, setTouched] = useState({ next: false, repeat: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const forced = me?.must_change_password ?? false;
  const nextErr = touched.next && next.length > 0 && next.length < MIN_LENGTH ? `Parola en az ${MIN_LENGTH} karakter olmalı.` : undefined;
  const repeatErr = touched.repeat && repeat !== next ? "Parolalar aynı değil." : undefined;
  const sameErr = touched.next && next && next === current ? "Yeni parola mevcut paroladan farklı olmalı." : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched({ next: true, repeat: true });
    if (next.length < MIN_LENGTH || next !== repeat || next === current) return;
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/auth/change-password", { body: { current_password: current, new_password: next } });
      const user = await reloadMe();
      navigate(user ? homePath(user) : "/giris", { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main id="main" className="auth" style={{ gridTemplateColumns: "1fr", maxWidth: 560 }}>
      <div className="auth__panel">
        <h1>Parolanızı değiştirin</h1>
        {forced && (
          <Alert tone="info" title="Yeni parola gerekli">
            Hesabınız geçici bir parolayla açıldı. Devam etmeden önce yalnız sizin bildiğiniz bir parola belirleyin.
          </Alert>
        )}

        <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-5)" }} onSubmit={submit} noValidate>
          <FormError error={error} />
          <Field label="Mevcut parola" required error={fieldError(error, "current_password")}>
            {(p) => (
              <input {...p} className="field__input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            )}
          </Field>
          <Field label="Yeni parola" required hint={`En az ${MIN_LENGTH} karakter.`} error={nextErr ?? sameErr ?? fieldError(error, "new_password")}>
            {(p) => (
              <input
                {...p}
                className="field__input"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, next: true }))}
              />
            )}
          </Field>
          <Field label="Yeni parola (tekrar)" required error={repeatErr}>
            {(p) => (
              <input
                {...p}
                className="field__input"
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, repeat: true }))}
              />
            )}
          </Field>
          <div className="row" style={{ gap: "var(--s-2)" }}>
            <SubmitButton busy={busy} disabled={!current || !next || !repeat}>
              Parolayı kaydet
            </SubmitButton>
            {forced ? (
              <button className="btn btn--ghost" type="button" onClick={logout}>
                Çıkış yap
              </button>
            ) : (
              <button className="btn btn--ghost" type="button" onClick={() => navigate(-1)}>
                Vazgeç
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
