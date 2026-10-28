import { Copy } from "lucide-react";
import type { Schemas } from "../api/types";
import { formatDateTime } from "../lib/format";
import { useToast } from "./toast";
import { Alert } from "./ui";

type Invitation = Schemas["MemberInvitationOut"];

/**
 * Yeni kullanıcıya giden 72 saatlik davet (P5, PLT-09): geçici parola yok; kişi parolasını
 * bağlantıdan belirler. Sağlayıcı seçilene dek (K5) test sağlayıcısı: e-posta dışarı gitmez —
 * geliştirme/demo ortamında backend bağlantıyı `preview_url` ile döner (üretimde boş).
 */
export function InvitationNotice({ invitation }: { invitation: Invitation }) {
  const toast = useToast();
  return (
    <>
      <div className="kv"><span className="kv__k">Davet gönderildi</span><span className="kv__v mono">{invitation.sent_to.join(", ")}</span></div>
      <div className="kv"><span className="kv__k">Geçerlilik</span><span className="kv__v">{formatDateTime(invitation.expires_at)} tarihine kadar (72 saat)</span></div>
      {invitation.preview_url && (
        <div className="kv">
          <span className="kv__k">Davet bağlantısı</span>
          <span className="kv__v">
            <code className="mono small" style={{ wordBreak: "break-all" }}>{invitation.preview_url}</code>{" "}
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => navigator.clipboard?.writeText(invitation.preview_url!).then(() => toast("Bağlantı kopyalandı."))}>
              <Copy aria-hidden="true" /> Kopyala
            </button>
          </span>
        </div>
      )}
      {invitation.test_provider && (
        <Alert tone="info" title="Test sağlayıcısı (K5)">
          E-posta/SMS sağlayıcısı seçilene dek mesaj dışarı gönderilmez, kayda geçer.{invitation.preview_url ? " Demo ortamında bağlantı yukarıda; kişiye siz iletin." : ""}
        </Alert>
      )}
    </>
  );
}
