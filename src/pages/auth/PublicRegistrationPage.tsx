import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, get } from "../../api/client";
import type { Written } from "../../api/types";
import { Alert, ErrorState, Field, FormError, Loading, SubmitButton, fieldError, useDocumentTitle } from "../../components/ui";
import { trUpper } from "../../lib/format";

// İletişim formu standardı (kurumsal): isim 2–40, rakam/özel karakter yok, baş/son boşluk kırpılır;
// TR cep 5 ile başlar, 10 hane, sunucuya E.164; e-posta küçük harf, ≤ 254. Doğrulama blur'da ve gönderimde.
const NAME_RE = /^[A-Za-zÇĞİÖŞÜçğıöşü' -]+$/u;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function checkName(v: string, label: string) {
  const t = v.trim();
  if (!t) return `${label} zorunlu.`;
  if (t.length < 2 || t.length > 40) return `${label} 2–40 karakter olmalı.`;
  if (!NAME_RE.test(t)) return `${label} rakam ve özel karakter içeremez.`;
  return undefined;
}
const digits = (v: string) => v.replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "").slice(0, 10);
const maskPhone = (d: string) => [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(" ");
const capitalize = (s: string) => s.trim().split(/\s+/).map((w) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1).toLocaleLowerCase("tr-TR")).join(" ");

/** Herkese açık sakin kayıt formu (/kayit/:code). Oturum gerekmez; başvuru yönetim onayına düşer. Servis isteği 13. */
export function PublicRegistrationPage() {
  useDocumentTitle("Sakin kaydı");
  const { code = "" } = useParams();
  const site = useQuery({ queryKey: ["public-registration", code], queryFn: () => get<{ site_name: string; site_slug: string }>(`/public/registration/${code}`), retry: false });
  const [f, setF] = useState({ first_name: "", last_name: "", phone: "", email: "", unit_text: "", relation: "owner", explicit_consent: false, kvkk_ack: false });
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const m = useMutation({ mutationFn: (body: Record<string, unknown>) => api<Written<{ reference: string }>>("POST", `/public/registration/${code}`, { body }) });

  const validators: Record<string, () => string | undefined> = {
    first_name: () => checkName(f.first_name, "Ad"),
    last_name: () => checkName(f.last_name, "Soyad"),
    phone: () => (/^5\d{9}$/.test(digits(f.phone)) ? undefined : "Cep telefonu 5 ile başlayan 10 hane olmalı (5XX XXX XX XX)."),
    email: () => {
      const e = f.email.trim().toLocaleLowerCase("tr-TR");
      if (!e) return undefined;
      return e.length <= 254 && EMAIL_RE.test(e) ? undefined : "Geçerli bir e-posta adresi girin (Türkçe karakter ve boşluk olmadan).";
    },
    unit_text: () => (f.unit_text.trim() ? undefined : "Blok ve daire numaranızı yazın."),
    kvkk_ack: () => (f.kvkk_ack ? undefined : "Devam etmek için bilgilendirme yazısını onaylayın."),
  };
  const blur = (k: string) => () => setErrs((x) => ({ ...x, [k]: validators[k]!() }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = Object.fromEntries(Object.keys(validators).map((k) => [k, validators[k]!()]));
    setErrs(next);
    const firstBad = Object.keys(next).find((k) => next[k]);
    if (firstBad) {
      document.getElementById(`reg-${firstBad}`)?.focus();
      return;
    }
    m.mutate({
      first_name: capitalize(f.first_name),
      last_name: trUpper(f.last_name.trim()),
      phone: `+90${digits(f.phone)}`,
      email: f.email.trim().toLocaleLowerCase("tr-TR") || null,
      unit_text: f.unit_text.trim(),
      relation: f.relation,
      explicit_consent: f.explicit_consent,
      kvkk_ack: f.kvkk_ack,
    });
  }

  const err = (k: string) => errs[k] ?? fieldError(m.error, k);

  return (
    <main id="main" className="auth" style={{ gridTemplateColumns: "1fr", maxWidth: 620 }}>
      <div className="auth__panel">
        <div className="auth__brand">
          <span className="sidebar__mark" aria-hidden="true">SY</span>
          <span><span className="sidebar__name">{site.data?.site_name ?? "SiteYönetimi"}</span><br /><span className="sidebar__sub">Sakin kaydı</span></span>
        </div>

        {site.isPending ? <Loading /> : site.isError ? <div className="mt-4"><ErrorState error={site.error} /></div> : m.isSuccess ? (
          <div className="stack mt-4" style={{ gap: "var(--s-3)" }}>
            <Alert tone="ok" title="Başvurunuz alındı">{m.data.message}</Alert>
            <p className="small muted mb-0">Başvuru numaranız: <strong className="mono">{m.data.data.reference}</strong>. Bu sayfayı kapatabilirsiniz.</p>
          </div>
        ) : (
          <>
            <h1 className="mt-4">Sakin olarak kaydolun</h1>
            <p className="muted small">Bilgileriniz site yönetimine iletilir; yönetim bölümünüzü doğrulayınca giriş bilgileriniz size gönderilir.</p>
            <form className="stack" style={{ gap: "var(--s-4)", marginTop: "var(--s-4)" }} onSubmit={submit} noValidate>
              <FormError error={m.error} />
              <div className="grid grid--2">
                <Field label="Ad" required error={err("first_name")}>{(p) => <input {...p} id="reg-first_name" className="field__input" autoComplete="given-name" maxLength={40} value={f.first_name} onChange={(e) => setF((x) => ({ ...x, first_name: e.target.value }))} onBlur={blur("first_name")} />}</Field>
                <Field label="Soyad" required error={err("last_name")}>{(p) => <input {...p} id="reg-last_name" className="field__input" autoComplete="family-name" maxLength={40} value={f.last_name} onChange={(e) => setF((x) => ({ ...x, last_name: e.target.value }))} onBlur={blur("last_name")} />}</Field>
              </div>
              <Field label="Cep telefonu" required hint="Türkiye (+90)" error={err("phone")}>
                {(p) => (
                  <div className="row" style={{ gap: "var(--s-2)", flexWrap: "nowrap" }}>
                    <span className="field__input" style={{ width: "auto", display: "inline-flex", alignItems: "center" }} aria-hidden="true">+90</span>
                    <input {...p} id="reg-phone" className="field__input" style={{ flex: 1, minWidth: 0 }} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="5XX XXX XX XX" value={maskPhone(digits(f.phone))} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} onBlur={blur("phone")} />
                  </div>
                )}
              </Field>
              <Field label="E-posta" hint="İsteğe bağlı; giriş bilgileri buraya da gönderilebilir." error={err("email")}>{(p) => <input {...p} id="reg-email" className="field__input" type="email" inputMode="email" autoComplete="email" maxLength={254} value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} onBlur={blur("email")} />}</Field>
              <div className="grid grid--2">
                <Field label="Blok / daire" required error={err("unit_text")}>{(p) => <input {...p} id="reg-unit_text" className="field__input" placeholder="ör. A blok 4" maxLength={60} value={f.unit_text} onChange={(e) => setF((x) => ({ ...x, unit_text: e.target.value }))} onBlur={blur("unit_text")} />}</Field>
                <Field label="Daireyle ilişkiniz" required error={err("relation")}>{(p) => <select {...p} className="field__input" value={f.relation} onChange={(e) => setF((x) => ({ ...x, relation: e.target.value }))}><option value="owner">Malik (ev sahibi)</option><option value="tenant">Kiracı</option></select>}</Field>
              </div>

              <p className="small mb-0">
                Kişisel verilerinizin işlenmesine ilişkin <Link to="/aydinlatma" target="_blank" rel="noopener">Aydınlatma Metni</Link>'ni okudum, bilgilendirildim.
              </p>
              <label className="check check--rich">
                <input type="checkbox" checked={f.explicit_consent} onChange={(e) => setF((x) => ({ ...x, explicit_consent: e.target.checked }))} />
                <span><span className="strong">Açık rıza (isteğe bağlı)</span><br /><span className="small muted">Duyuru ve bilgilendirmelerin SMS ve e-postayla gönderilmesini kabul ediyorum. İşaretlemeden de kaydolabilirsiniz.</span></span>
              </label>
              <div>
                <label className="check check--rich">
                  <input id="reg-kvkk_ack" type="checkbox" checked={f.kvkk_ack} aria-invalid={err("kvkk_ack") ? true : undefined} onChange={(e) => { const v = e.target.checked; setF((x) => ({ ...x, kvkk_ack: v })); if (v) setErrs((x) => ({ ...x, kvkk_ack: undefined })); }} />
                  <span><span className="strong">Bilgilendirme *</span><br /><span className="small muted">Verdiğim bilgilerin doğru olduğunu, başvurumun site yönetimi tarafından doğrulanacağını biliyorum.</span></span>
                </label>
                {err("kvkk_ack") && <span className="field__error" role="alert">{err("kvkk_ack")}</span>}
              </div>
              <SubmitButton busy={m.isPending}>Başvuruyu gönder</SubmitButton>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

/** Aydınlatma metni — TASLAK. Saklama süreleri ve metin hukuk onayı bekliyor (açık karar K8). */
export function PrivacyNoticePage() {
  useDocumentTitle("Aydınlatma metni");
  return (
    <main id="main" className="auth" style={{ gridTemplateColumns: "1fr", maxWidth: 720 }}>
      <div className="auth__panel stack" style={{ gap: "var(--s-3)", lineHeight: 1.7 }}>
        <Alert tone="warn" title="Taslak">Bu metin hukuk onayı bekliyor (açık karar K8). Yayına almadan önce site yönetimi ve hukukçu tarafından tamamlanmalı.</Alert>
        <h1 className="mb-0">Kişisel Verilerin Korunması Aydınlatma Metni</h1>
        <p className="mb-0"><strong>Veri sorumlusu:</strong> Kaydolduğunuz sitenin yönetimi.</p>
        <p className="mb-0"><strong>İşlenen veriler:</strong> ad, soyad, cep telefonu, e-posta, bağımsız bölüm ve malik/kiracı bilgisi.</p>
        <p className="mb-0"><strong>Amaç:</strong> aidat ve ortak gider takibi, duyuru ve talep hizmetleri, site güvenliği (634 sayılı Kat Mülkiyeti Kanunu kapsamındaki yükümlülükler).</p>
        <p className="mb-0"><strong>Hukuki sebep:</strong> sözleşmenin ifası ve kanuni yükümlülük (KVKK m.5/2). Ticari ileti için ayrıca açık rıza istenir.</p>
        <p className="mb-0"><strong>Aktarım:</strong> [barındırma kararı verilince doldurulacak — sunucu yeri, yurt dışına aktarım olup olmadığı]</p>
        <p className="mb-0"><strong>Haklarınız:</strong> KVKK m.11 kapsamındaki başvurularınızı site yönetimine iletebilirsiniz.</p>
      </div>
    </main>
  );
}
