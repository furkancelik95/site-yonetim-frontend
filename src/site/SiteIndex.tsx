import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { Forbidden } from "../components/ui";
import { M, P, useSite } from "./SiteContext";

/**
 * /s/:slug — pano finans izni ister. İzni olmayan rol (güvenlik, teknik personel) yetkisi
 * olan ilk ekrana gider; referansta da güvenlik görevlisi doğrudan güvenlik ekranını görür.
 */
export function SiteIndex({ dashboard }: { dashboard: ReactNode }) {
  const { site, can, shows } = useSite();
  if (can(P.financeRead)) return <>{dashboard}</>;
  const base = `/s/${site.slug}`;
  const first =
    (shows(M.packages, P.packages) || shows(M.visitors, P.visitors) ? `${base}/guvenlik` : null) ??
    (shows(M.requests, P.requestsRead) ? `${base}/talepler` : null) ??
    (shows(M.announcements, P.announcementsRead) ? `${base}/duyurular` : null) ??
    (can(P.unitsRead) ? `${base}/daireler` : null) ??
    (can(P.expensesRead) ? `${base}/giderler` : null);
  return first ? <Navigate to={first} replace /> : <Forbidden />;
}
