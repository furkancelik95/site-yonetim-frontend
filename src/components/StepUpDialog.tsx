import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { api, setStepUpHandler } from "../api/client";
import type { Written } from "../api/types";
import { DemoCode, type CodeSent } from "../pages/auth/authParts";
import { Field, FormError, SubmitButton, fieldError } from "./ui";

/**
 * Hassas işlem öncesi yeniden doğrulama (backend `require_step_up`, 403 `step_up_required`).
 * İstemci yakalayıcısı bu pencereyi açar; doğrulama başarılıysa (`POST /auth/step-up`, 5 dk geçerli)
 * reddedilen istek bir kez yinelenir. Vazgeçilirse istek backend'in 403 hatasıyla biter.
 * `canSms`: 2FA'sı olmayan, telefonu kayıtlı kullanıcı SMS kodu isteyebilir (`/auth/step-up/code`).
 */
export function StepUpDialog({ mfa, canSms }: { mfa: boolean; canSms: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);
  const titleId = useId();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStepUpHandler(
      () =>
        new Promise<boolean>((resolve) => {
          pending.current?.(false);
          pending.current = resolve;
          setPassword("");
          setCode("");
          setSent(null);
          setError(null);
          ref.current?.showModal();
        }),
    );
    return () => setStepUpHandler(null);
  }, []);

  function finish(ok: boolean) {
    const resolve = pending.current;
    pending.current = null;
    if (ref.current?.open) ref.current.close();
    resolve?.(ok);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/auth/step-up", { body: { password: password || null, code: code.trim() || null } });
      finish(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setError(null);
    try {
      const res = await api<Written<CodeSent>>("POST", "/auth/step-up/code");
      setSent(res.data);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={() => finish(false)}>
      <form noValidate onSubmit={submit}>
        <div className="dialog__body stack" style={{ gap: "var(--s-3)" }}>
          <h2 className="dialog__title" id={titleId}><ShieldCheck aria-hidden="true" /> Kimliğinizi doğrulayın</h2>
          <p className="small mb-0">Bu işlem hassas; devam etmek için kimliğinizi yeniden doğrulayın. Doğrulama 5 dakika geçerlidir.</p>
          <FormError error={error} />
          <Field label="Parola" error={fieldError(error, "password")}>
            {(p) => <input {...p} className="field__input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {(mfa || canSms || sent) && (
            <Field label={mfa ? "ya da doğrulama kodu (uygulama ya da yedek kod)" : "ya da SMS kodu"} error={fieldError(error, "code")}>
              {(p) => <input {...p} className="field__input mono" inputMode={mfa ? "text" : "numeric"} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />}
            </Field>
          )}
          {!mfa && canSms && (
            <div className="row" style={{ gap: "var(--s-2)" }}>
              <button className="btn btn--sm" type="button" onClick={sendCode}><MessageSquare aria-hidden="true" /> SMS kodu gönder</button>
              {sent && <span className="small muted">Kod {sent.sent_to} numarasına gönderildi.</span>}
            </div>
          )}
          <DemoCode sent={sent} onUse={setCode} />
        </div>
        <div className="dialog__foot">
          <button type="button" className="btn btn--ghost" onClick={() => finish(false)} disabled={busy}>Vazgeç</button>
          <SubmitButton busy={busy} disabled={!password && !code.trim()}>Doğrula ve devam et</SubmitButton>
        </div>
      </form>
    </dialog>
  );
}
