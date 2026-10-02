import type { ReactElement } from "react";
import { createBrowserRouter, Outlet } from "react-router";
import { ToastProvider } from "./components/toast";
import { NotFound } from "./components/ui";
import { PlatformLayout, RequireAuth, RootIndex, SiteLayout } from "./layouts/guards";
import { ComingSoon } from "./pages/ComingSoon";
import { ChangePasswordPage } from "./pages/auth/ChangePasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { NoAccessPage, NotFoundPage } from "./pages/auth/StatusPages";
import { BudgetPage } from "./pages/site/BudgetPage";
import { CashPage } from "./pages/site/CashPage";
import { CashStatementPage } from "./pages/site/CashStatementPage";
import { ChargesPage } from "./pages/site/ChargesPage";
import { DashboardPage } from "./pages/site/DashboardPage";
import { DebtorsPage } from "./pages/site/DebtorsPage";
import { ExpensesPage } from "./pages/site/ExpensesPage";
import { ImportPage } from "./pages/site/ImportPage";
import { LedgerPage } from "./pages/site/LedgerPage";
import { NewExpensePage } from "./pages/site/NewExpensePage";
import { PaymentsPage } from "./pages/site/PaymentsPage";
import { ReportsPage } from "./pages/site/ReportsPage";
import { UnitDetailPage } from "./pages/site/UnitDetailPage";
import { UnitsPage } from "./pages/site/UnitsPage";
import { SiteIndex } from "./site/SiteIndex";

// Adresler frontend docs/01-ekranlar.md ile aynı.
const siteScreens: [string, ReactElement][] = [
  ["daireler", <UnitsPage />],
  ["daireler/:unitId", <UnitDetailPage />],
  ["borclular", <DebtorsPage />],
  ["cari/:accountId", <LedgerPage />],
  ["tahsilat", <PaymentsPage />],
  ["tahakkuk", <ChargesPage />],
  ["isletme-projesi", <BudgetPage />],
  ["giderler", <ExpensesPage />],
  ["giderler/yeni", <NewExpensePage />],
  ["kasa", <CashPage />],
  ["kasa/:accountId", <CashStatementPage />],
  ["raporlar", <ReportsPage />],
  ["iceri-aktar", <ImportPage />],
  ["talepler", <ComingSoon title="Talepler" />],
  ["talepler/:requestId", <ComingSoon title="Talep" />],
  ["duyurular", <ComingSoon title="Duyurular" />],
  ["guvenlik", <ComingSoon title="Güvenlik" />],
  ["moduller", <ComingSoon title="Modüller" />],
  ["denetim", <ComingSoon title="Denetim Kaydı" />],
];

export const router = createBrowserRouter([
  {
    element: (
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    ),
    children: [
      { path: "/giris", element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "/", element: <RootIndex portfolio={<ComingSoon title="Portföy" />} /> },
          { path: "/parola-degistir", element: <ChangePasswordPage /> },
          { path: "/yetkisiz", element: <NoAccessPage /> },
          {
            path: "/s/:slug",
            element: <SiteLayout />,
            children: [
              { index: true, element: <SiteIndex dashboard={<DashboardPage />} /> },
              ...siteScreens.map(([path, element]) => ({ path, element })),
              { path: "*", element: <NotFound /> },
            ],
          },
          {
            path: "/yonetim",
            element: <PlatformLayout />,
            children: [
              { index: true, element: <ComingSoon title="Genel bakış" /> },
              { path: "musteri-ekle", element: <ComingSoon title="Müşteri ekle" /> },
              { path: "site-ac", element: <ComingSoon title="Site aç" /> },
            ],
          },
          { path: "/sakin/:slug/*", element: <ComingSoon title="Sakin ekranı" /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
