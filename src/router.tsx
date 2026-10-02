import { createBrowserRouter, Outlet } from "react-router";
import { ToastProvider } from "./components/toast";
import { NotFound } from "./components/ui";
import { PlatformLayout, RequireAuth, RootIndex, SiteLayout } from "./layouts/guards";
import { ComingSoon } from "./pages/ComingSoon";
import { ChangePasswordPage } from "./pages/auth/ChangePasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { NoAccessPage, NotFoundPage } from "./pages/auth/StatusPages";
import { SiteIndex } from "./site/SiteIndex";

// Adresler frontend docs/01-ekranlar.md ile aynı.
const siteScreens: [string, string][] = [
  ["daireler", "Daireler"],
  ["daireler/:unitId", "Daire Ayrıntısı"],
  ["borclular", "Borçlular"],
  ["cari/:accountId", "Cari Ekstre"],
  ["tahsilat", "Tahsilat"],
  ["tahakkuk", "Tahakkuk"],
  ["isletme-projesi", "İşletme Projesi"],
  ["giderler", "Giderler"],
  ["giderler/yeni", "Yeni Gider"],
  ["kasa", "Kasa ve Banka"],
  ["kasa/:accountId", "Hesap Ekstresi"],
  ["raporlar", "Raporlar"],
  ["iceri-aktar", "İçeri Aktar"],
  ["talepler", "Talepler"],
  ["talepler/:requestId", "Talep"],
  ["duyurular", "Duyurular"],
  ["guvenlik", "Güvenlik"],
  ["moduller", "Modüller"],
  ["denetim", "Denetim Kaydı"],
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
              { index: true, element: <SiteIndex dashboard={<ComingSoon title="Bugün" />} /> },
              ...siteScreens.map(([path, title]) => ({ path, element: <ComingSoon title={title} /> })),
              { path: "*", element: <NotFoundInShell /> },
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

function NotFoundInShell() {
  return <NotFound />;
}
