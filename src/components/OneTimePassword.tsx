import { Copy } from "lucide-react";
import { useToast } from "./toast";
import { Alert } from "./ui";

/**
 * Yeni açılan hesabın giriş bilgisi. Backend geçici parolayı yalnız bu yanıtta döner (no-store);
 * SMS/e-posta gönderimi (açık karar K5) gelene kadar yönetici kişiye elden iletir.
 */
export function OneTimePassword({ email, password }: { email: string | null; password: string }) {
  const toast = useToast();
  return (
    <>
      {email && <div className="kv"><span className="kv__k">Giriş e-postası</span><span className="kv__v mono">{email}</span></div>}
      <div className="kv">
        <span className="kv__k">Geçici parola</span>
        <span className="kv__v">
          <span className="mono strong">{password}</span>{" "}
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(password).then(() => toast("Parola kopyalandı."))}>
            <Copy aria-hidden="true" /> Kopyala
          </button>
        </span>
      </div>
      <Alert tone="warn" title="Bu parola bir daha gösterilmez">Kişiye güvenli bir kanaldan iletin; ilk girişte kendi parolasını belirlemesi istenir.</Alert>
    </>
  );
}
