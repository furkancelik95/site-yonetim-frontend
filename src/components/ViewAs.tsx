import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, LogOut } from "lucide-react";
import { ApiError, api, setViewAsEndedHandler, setViewAsSession, subscribeViewAs, viewAsSession, type ViewAsState } from "../api/client";
import { useSiteGet, useSiteMutation } from "../api/hooks";
import type { Schemas, Written } from "../api/types";
import { P, useSite } from "../site/SiteContext";
import { formatDateTime } from "../lib/format";
import { useToast } from "./toast";
import { ConfirmButton, Field, FormError, SubmitButton, fieldError } from "./ui";

// Sakin olarak görüntüle (PLT-12, P15). Backend: POST /sites/{slug}/people/{id}/view-as-sessions
// (30 dk, salt okunur, gerekçeli, denetim kaydına yazılır), DELETE /sites/{slug}/view-as-sessions/{id}.
// Oturum açıkken o sitenin her isteği `X-View-As-Session` başlığını taşır; backend erişimi sakinin
// erişimine çevirir ve yazma isteklerini 403 `read_only` ile reddeder.

type Session = Schemas["ViewAsSessionOut"];

/** Etkin görüntüleme oturumu (yoksa null). */
export function useViewAs(): ViewAsState | null {
  return useSyncExternalStore(subscribeViewAs, viewAsSession, viewAsSession);
}

/** Site önbelleği yönetici ve sakin görünümü arasında karışmasın: geçişte o sitenin verisi atılır. */
function useDropSiteCache() {
  const qc = useQueryClient();
  return useCallback((slug: string) => qc.removeQueries({ queryKey: ["site", slug] }), [qc]);
}

/** Görüntülemeden çık: önce başlık kalkar (süresi dolmuş oturum 403 almasın), sonra backend'de kapatılır. */
export function useExitViewAs() {
  const navigate = useNavigate();
  const toast = useToast();
  const drop = useDropSiteCache();
  const [busy, setBusy] = useState(false);
  async function exit() {
    const v = viewAsSession();
    if (!v) return;
    setBusy(true);
    setViewAsSession(null);
    try {
      const res = await api<Written<Session>>("DELETE", `/sites/${v.slug}/view-as-sessions/${v.sessionId}`);
      toast(res.message);
    } catch (e) {
      // Oturum zaten bitmiş olabilir (404); yerel görünüm yine kapanır.
      toast(e instanceof ApiError ? e.message : "Görüntüleme kapatılamadı; oturum en geç süre sonunda kendiliğinden biter.", "info");
    } finally {
      setBusy(false);
      drop(v.slug);
      navigate(v.returnTo ?? `/s/${v.slug}/kisiler`);
    }
  }
  return { exit, busy };
}

/**
 * Görüntüleme açıkken her sayfanın üstündeki bant: kimin gözünden bakıldığı, salt okunur olduğu ve
 * "Çık" düğmesi. Backend oturumu kapatırsa (süre doldu) bant kalkar ve yönetici ekranına dönülür.
 */
export function ViewAsBar() {
  const v = useViewAs();
  const { exit, busy } = useExitViewAs();
  const navigate = useNavigate();
  const toast = useToast();
  const drop = useDropSiteCache();
  useEffect(() => {
    setViewAsEndedHandler((ended) => {
      drop(ended.slug);
      toast("Sakin olarak görüntüleme oturumu sona erdi.", "info");
      navigate(ended.returnTo ?? `/s/${ended.slug}/kisiler`);
    });
    return () => setViewAsEndedHandler(null);
  }, [navigate, toast, drop]);
  if (!v) return null;
  return (
    <div className="viewas-bar" role="region" aria-label="Sakin olarak görüntüleme">
      <Eye aria-hidden="true" />
      <div className="viewas-bar__text">
        <strong>{v.personName ?? "Sakin"}</strong> olarak görüntülüyorsunuz.{" "}
        <span>Salt okunur: hiçbir değişiklik kaydedilmez; açtığınız ekranlar denetim kaydına yazılır.</span>
        {v.endsAt && <span className="viewas-bar__time"> Bitiş: {formatDateTime(v.endsAt)}</span>}
      </div>
      <button className="btn btn--sm" type="button" onClick={exit} disabled={busy} aria-busy={busy || undefined}>
        <LogOut aria-hidden="true" /> Çık
      </button>
    </div>
  );
}

/**
 * Kişi satırındaki "Sakin olarak görüntüle" düğmesi. İzin (`support.view_as_resident`) yoksa ya da
 * zaten salt okunur bir görünümdeyse gizli; asıl kontrol backend'de (403).
 */
export function ViewAsButton({ personId, personName }: { personId: string; personName: string }) {
  const { site, can } = useSite();
  const location = useLocation();
  const navigate = useNavigate();
  const drop = useDropSiteCache();
  const [reason, setReason] = useState("");
  const m = useSiteMutation<{ reason: string }, Session>("POST", `/people/${personId}/view-as-sessions`, {
    onSuccess: (s) => {
      if (!s) return;
      setViewAsSession(site.slug, s.id, { personName: s.person_name, endsAt: s.ends_at, returnTo: location.pathname + location.search });
      drop(site.slug);
      navigate(`/sakin/${site.slug}`);
    },
  });
  if (!can(P.viewAsResident) || site.access_mode === "view_as") return null;
  return (
    <ConfirmButton
      className="btn btn--ghost btn--sm"
      title={`${personName} olarak görüntüle`}
      confirmLabel="Görüntülemeyi başlat"
      body={
        <div className="stack" style={{ gap: "var(--s-2)" }}>
          <p className="mb-0">Sakin ekranını bu kişinin gözünden, salt okunur görürsünüz. Oturum 30 dakika sürer; açtığınız ekranlar denetim kaydına yazılır.</p>
          <Field label="Gerekçe" required hint="Neden bakıldığı denetim kaydına yazılır (en az 10 karakter)." error={fieldError(m.error, "reason")}>
            {(p) => <textarea {...p} className="field__input" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </div>
      }
      onConfirm={() => m.mutateAsync({ reason: reason.trim() })}
    >
      <Eye aria-hidden="true" /> Sakin olarak görüntüle
    </ConfirmButton>
  );
}

/** Site ayarı (members.manage): görüntüleme başlayınca sakine bildirim gitsin mi (backend varsayılanı açık). */
export function ViewAsSettingsCard() {
  const q = useSiteGet<Schemas["ViewAsSettingsOut"]>("/settings/view-as");
  const [notify, setNotify] = useState<boolean | null>(null);
  const m = useSiteMutation<{ notify_resident: boolean }, Schemas["ViewAsSettingsOut"]>("PUT", "/settings/view-as", { onSuccess: () => setNotify(null) });
  if (!q.data) return null;
  const value = notify ?? q.data.notify_resident;
  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); m.mutate({ notify_resident: value }); }}>
      <div className="card__head"><span className="card__icon card__icon--accent"><Eye aria-hidden="true" /></span><span className="card__title">Sakin olarak görüntüle</span><span className="card__meta ml-auto">30 dk, salt okunur, gerekçeli</span></div>
      <div className="card__body stack" style={{ gap: "var(--s-3)" }}>
        <FormError error={m.error} />
        <p className="small muted mb-0">Yetkili personel (ve onayladığınız destek oturumunda platform ekibi) kişi kartından sakin ekranını o kişinin gözünden görebilir. Her görüntüleme ve açılan ekranlar denetim kaydına yazılır.</p>
        <label className="check check--rich" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={value} onChange={(e) => setNotify(e.target.checked)} />
          <span>Sakine bildir<span className="field__hint" style={{ display: "block" }}>Görüntüleme başladığında sakine bildirim gider.</span></span>
        </label>
      </div>
      {notify !== null && notify !== q.data.notify_resident && (
        <div className="card__foot row" style={{ gap: "var(--s-2)" }}>
          <SubmitButton busy={m.isPending}>Kaydet</SubmitButton>
          <button className="btn btn--ghost" type="button" onClick={() => setNotify(null)}>Vazgeç</button>
        </div>
      )}
    </form>
  );
}
