import type { ReactNode } from "react";
import { Link } from "react-router";
import { Lock, SearchX } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useDocumentTitle } from "../../components/ui";

function Bare({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  const { status, logout } = useAuth();
  return (
    <main id="main" className="auth" style={{ gridTemplateColumns: "1fr", maxWidth: 560 }}>
      <div className="auth__panel">
        <div className="empty">
          {icon}
          <h1 className="empty__title">{title}</h1>
          <p className="small">{text}</p>
          <div className="row" style={{ justifyContent: "center", marginTop: "var(--s-4)" }}>
            <Link className="btn" to="/">
              Ana sayfaya dön
            </Link>
            {status === "authenticated" && (
              <button className="btn btn--ghost" type="button" onClick={logout}>
                Çıkış yap
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Hiçbir siteye erişimi olmayan kullanıcı. */
export function NoAccessPage() {
  useDocumentTitle("Erişim yok");
  return (
    <Bare
      icon={<Lock aria-hidden="true" />}
      title="Henüz bir siteye erişiminiz yok"
      text="Hesabınız açık ama herhangi bir siteye bağlanmamış. Site yöneticinizden sizi siteye eklemesini isteyin."
    />
  );
}

export function NotFoundPage() {
  useDocumentTitle("Bulunamadı");
  return (
    <Bare
      icon={<SearchX aria-hidden="true" />}
      title="Sayfa bulunamadı"
      text="Aradığınız sayfa yok, ya da görüntüleme izniniz bulunmuyor."
    />
  );
}
