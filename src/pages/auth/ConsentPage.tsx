import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, get } from "../../api/client";
import type { Schemas, Written } from "../../api/types";
import { homePath, useAuth } from "../../auth/AuthContext";
import { Alert, ErrorState, FormError, Loading, SubmitButton, useDocumentTitle } from "../../components/ui";
import { formatDate } from "../../lib/format";

type ConsentState = Schemas["ConsentStateOut"];

/**
 * Aydınlatma metni onayı (PLT-01 adım 14–15, PM kararı P6): erişilen bir sitenin güncel metni
 * onaylanmadan uygulamaya geçilmez. İlk girişte ve metin her değiştiğinde gösterilir; backend bu
 * sürede diğer uçlara 403 `consent_required` döner.
 */
export function ConsentPage() {
  useDocumentTitle("Aydınlatma metni");
  const { reloadMe, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = useQuery({ queryKey: ["me-consents"], queryFn: () => get<ConsentState>("/me/consents") });
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function done() {
    const me = await reloadMe();
    const back = params.get("donus");
    navigate(me ? (back && back.startsWith("/") && !back.startsWith("//") ? back : homePath(me)) : "/giris", { replace: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!q.data || !read) return;
    setBusy(true);
    setError(null);
    try {
      await api<Written<ConsentState>>("POST", "/me/consents", { body: { notice_ids: q.data.pending.map((p) => p.notice_id) } });
      await done();
    } catch (err) {
      setError(err);
      setBusy(false);
      void q.refetch();
    }
  }

  const pending = q.data?.pending ?? [];
  const renewed = q.data ? q.data.given.length > 0 : false;
  return (
    <main id="main" className="auth auth--single">
      <div className="auth__panel stack" style={{ width: "min(100%, 760px)", gap: "var(--s-4)" }}>
        <h1 className="mb-0">Kişisel verilerin korunması</h1>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : pending.length === 0 ? (
          <>
            <Alert tone="ok" title="Onay bekleyen metin yok">Güncel aydınlatma metinlerini onayladınız.</Alert>
            <div><button className="btn btn--primary" type="button" onClick={() => void done()}>Devam et</button></div>
          </>
        ) : (
          <form className="stack" style={{ gap: "var(--s-4)" }} onSubmit={submit} noValidate>
            <Alert tone="info" title={renewed ? "Aydınlatma metni güncellendi" : "Devam etmeden önce"}>
              {renewed
                ? "Site yönetimi aydınlatma metninin yeni bir sürümünü yayınladı. Okuyup onayladıktan sonra kaldığınız yerden devam edebilirsiniz."
                : "Kişisel verilerinizin nasıl işlendiğini anlatan aydınlatma metnini okuyup onaylayın."}
            </Alert>
            <FormError error={error} />
            {pending.map((n) => (
              <section key={n.notice_id} className="card">
                <div className="card__head">
                  <span className="card__title">{n.site_name}</span>
                  <span className="card__meta">Sürüm {n.version} · {formatDate(n.published_at)}{n.version > 1 && n.summary ? ` · ${n.summary}` : ""}</span>
                </div>
                <div className="card__body" style={{ maxHeight: "40vh", overflowY: "auto" }} tabIndex={0} aria-label={`${n.site_name} aydınlatma metni`}>
                  <p className="small mb-0" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{n.text}</p>
                </div>
              </section>
            ))}
            <label className="check check--rich">
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
              <span><span className="strong">Aydınlatma metnini okudum, bilgilendirildim.</span><br /><span className="small muted">Bu bir bilgilendirme onayıdır; isteğe bağlı açık rıza (ör. SMS/e-posta duyuruları) ayrıca "Kişisel verilerim" ekranından verilir ya da geri çekilir.</span></span>
            </label>
            <div className="row" style={{ gap: "var(--s-2)" }}>
              <SubmitButton busy={busy} disabled={!read}>Onayla ve devam et</SubmitButton>
              <button className="btn btn--ghost" type="button" onClick={logout}>Çıkış yap</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
