import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, get } from "../../api/client";
import type { Written } from "../../api/types";
import { Alert, ErrorState, Field, FormError, Loading, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { isTrMobile, phoneDigits, phoneMask, toE164 } from "../../lib/input";
import { partyRole } from "../../lib/labels";

/** Servis isteği 23'teki şekil. */
interface Invite { site_name: string; full_name: string; unit_name: string; relation: string; phone_hint: string; status: string; expires_at: string }
interface Accepted { unit_name: string; temporary_password: string }

/**
 * Davetle kayıt (/davet/:token). Yönetim kişiyi bölümüyle davet etmiştir; kişi yalnız telefonunu doğrular
 * ve bilgilendirmeyi onaylar — form doldurmaz, onay beklemez (YAP-07, davet yöntemi).
 */
export function InviteAcceptPage() {
  useDocumentTitle("Davet");
  const { token = "" } = useParams();
  const inv = useQuery({ queryKey: ["public-invitation", token], queryFn: () => get<Invite>(`/public/invitations/${token}`), retry: false });
  const [phone, setPhone] = useState("");
  const [ack, setAck] = useState(false);
  const [errs, setErrs] = useState<{ phone?: string; kvkk_ack?: string }>({});
  const m = useMutation({ mutationFn: (body: Record<string, unknown>) => api<Written<Accepted>>("POST", `/public/invitations/${token}/accept`, { body }) });
  const err = (k: "phone" | "kvkk_ack") => errs[k] ?? fieldError(m.error, k);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = { phone: isTrMobile(phone) ? undefined : "Cep telefonu 5 ile başlayan 10 hane olmalı (5XX XXX XX XX).", kvkk_ack: ack ? undefined : "Devam etmek için bilgilendirme yazısını onaylayın." };
    setErrs(next);
    if (next.phone) return document.querySelector<HTMLElement>("[data-field=phone]")?.focus();
    if (next.kvkk_ack) return document.getElementById("inv-kvkk_ack")?.focus();
    m.mutate({ phone: toE164(phone), kvkk_ack: true });
  }

  return (
    <main id="main" className="auth auth--single">
      <div className="auth__panel" style={{ width: "min(100%, 560px)" }}>
        <div className="auth__brand">
          <span className="sidebar__mark" aria-hidden="true">SY</span>
          <span><span className="sidebar__name">{inv.data?.site_name ?? "SiteYönetimi"}</span><br /><span className="sidebar__sub">Davetle kayıt</span></span>
        </div>
        {inv.isPending ? <Loading /> : inv.isError ? <div className="mt-4"><ErrorState error={inv.error} /></div> : m.isSuccess ? (
          <div className="stack mt-4" style={{ gap: "var(--s-3)" }}>
            <Alert tone="ok" title="Kaydınız tamamlandı">{m.data.message}</Alert>
            <div className="kv"><span className="kv__k">Bölüm</span><span className="kv__v">{m.data.data.unit_name}</span></div>
            <div className="kv"><span className="kv__k">Geçici parola</span><span className="kv__v mono strong">{m.data.data.temporary_password}</span></div>
            <p className="small muted mb-0">Bu parola yalnız bir kez gösterilir; not alın. <Link to="/giris">Giriş sayfasına git</Link></p>
          </div>
        ) : inv.data.status === "completed" ? (
          <Alert tone="info" title="Bu davet daha önce kullanılmış">Giriş yapmayı deneyin; parolanızı unuttuysanız site yönetimine başvurun.</Alert>
        ) : (
          <>
            <h1 className="mt-4">Merhaba {inv.data.full_name}</h1>
            <p className="muted small mb-0">Site yönetimi sizi <strong>{inv.data.unit_name}</strong> bölümüne <strong>{partyRole(inv.data.relation).toLocaleLowerCase("tr-TR")}</strong> olarak kaydetti. Telefonunuzu doğrulayın, hesabınız hemen açılsın.</p>
            <p className="small muted">Davet {formatDateTime(inv.data.expires_at)} tarihine kadar geçerli.</p>
            <form className="stack" style={{ gap: "var(--s-4)" }} onSubmit={submit} noValidate>
              <FormError error={m.error} />
              <Field label="Cep telefonu" required hint={`Davetteki numara: ••• •• ${inv.data.phone_hint.slice(0, 2)} ${inv.data.phone_hint.slice(2)}`} error={err("phone")}>
                {(p) => (
                  <div className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}>
                    <span className="field__input" style={{ width: "auto", display: "inline-flex", alignItems: "center" }} aria-hidden="true">+90</span>
                    <input {...p} data-field="phone" className="field__input" style={{ flex: 1, minWidth: 0 }} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="5XX XXX XX XX" value={phoneMask(phoneDigits(phone))} onChange={(e) => setPhone(e.target.value)} onBlur={() => setErrs((x) => ({ ...x, phone: isTrMobile(phone) ? undefined : "Cep telefonu 5 ile başlayan 10 hane olmalı." }))} />
                  </div>
                )}
              </Field>
              <p className="small mb-0">Kişisel verilerinizin işlenmesine ilişkin <Link to="/aydinlatma" target="_blank" rel="noopener">Aydınlatma Metni</Link>'ni okudum, bilgilendirildim.</p>
              <div>
                <label className="check check--rich">
                  <input id="inv-kvkk_ack" type="checkbox" checked={ack} aria-invalid={err("kvkk_ack") ? true : undefined} onChange={(e) => { setAck(e.target.checked); if (e.target.checked) setErrs((x) => ({ ...x, kvkk_ack: undefined })); }} />
                  <span><span className="strong">Bilgilendirme *</span><br /><span className="small muted">Bilgilerimin site yönetimince girildiğini ve doğru olduğunu teyit ediyorum.</span></span>
                </label>
                {err("kvkk_ack") && <span className="field__error" role="alert">{err("kvkk_ack")}</span>}
              </div>
              <SubmitButton busy={m.isPending}>Hesabımı aç</SubmitButton>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
