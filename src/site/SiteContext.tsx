import { createContext, useContext } from "react";
import type { Schemas } from "../api/types";

// İzin ve modül adları backend docs/05 ve docs/01 ile aynı.
export const P = {
  financeRead: "finance.read",
  chargePost: "finance.charge.post",
  paymentRecord: "finance.payment.record",
  budgetManage: "finance.budget.manage",
  cashRead: "finance.cash.read",
  cashManage: "finance.cash.manage",
  reportsRead: "finance.reports.read",
  expensesRead: "expenses.read",
  expensesManage: "expenses.manage",
  unitsRead: "units.read",
  unitsManage: "units.manage",
  peopleRead: "people.read",
  peopleManage: "people.manage",
  requestsRead: "requests.read",
  requestsCreate: "requests.create",
  requestsAssign: "requests.assign",
  announcementsRead: "announcements.read",
  announcementsPublish: "announcements.publish",
  packages: "security.packages",
  visitors: "security.visitors",
  modulesManage: "modules.manage",
  membersManage: "members.manage",
  auditRead: "audit.read",
} as const;

export const M = {
  finance: "finance",
  requests: "requests",
  announcements: "announcements",
  packages: "packages",
  visitors: "visitors",
  documents: "documents",
  reservations: "reservations",
  valet: "valet",
} as const;

export type SiteDetail = Schemas["SiteResponse"];

export interface SiteCtx {
  site: SiteDetail;
  /** İzin var mı (gizlemek güvenlik değildir; asıl kontrol backend'de). */
  can: (permission: string) => boolean;
  /** Modül açık mı ve izin var mı — kapalı modülün menüsü görünmez, tıklayan 404 alır. */
  shows: (module: string, permission?: string) => boolean;
}

export const SiteContext = createContext<SiteCtx | null>(null);

export function useSite(): SiteCtx {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSite, site düzeni içinde kullanılmalı");
  return ctx;
}

export function makeSiteCtx(site: SiteDetail): SiteCtx {
  const perms = new Set(site.permissions);
  const mods = new Set(site.modules);
  return {
    site,
    can: (p) => perms.has(p),
    shows: (m, p) => mods.has(m) && (p === undefined || perms.has(p)),
  };
}
