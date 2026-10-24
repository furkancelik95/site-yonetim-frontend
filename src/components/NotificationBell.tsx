import { Link } from "react-router";
import { Bell } from "lucide-react";
import { useSiteGet } from "../api/hooks";

/**
 * Üst çubuktaki bildirim zili: okunmamış sayısı dakikada bir tazelenir (PLT-05). Sayı yalnız
 * renkle değil rakamla ve ekran okuyucu metniyle verilir. Tıklayınca bildirim listesine gider.
 */
export function NotificationBell({ to }: { to: string }) {
  const q = useSiteGet<number>("/notifications/unread-count", undefined, { refetchInterval: 60_000 });
  const n = q.data ?? 0;
  const label = n > 0 ? `Bildirimler, ${n} okunmamış` : "Bildirimler";
  return (
    <Link className="btn btn--ghost btn--icon bell" to={to} aria-label={label} title={label}>
      <Bell aria-hidden="true" />
      {n > 0 && <span className="bell__count" aria-hidden="true">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
