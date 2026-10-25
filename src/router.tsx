import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { createBrowserRouter, Outlet } from "react-router";
import { ToastProvider } from "./components/toast";
import { Loading, NotFound } from "./components/ui";
import { PlatformLayout, RequireAuth, RootIndex, SiteLayout } from "./layouts/guards";
import { AppShell } from "./layouts/AppShell";
import { ResidentLayout } from "./layouts/ResidentLayout";
import { ChangePasswordPage } from "./pages/auth/ChangePasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { InviteAcceptPage } from "./pages/auth/InviteAcceptPage";
import { VendorQuotePage } from "./pages/auth/VendorQuotePage";
import { PrivacyNoticePage, PublicRegistrationPage } from "./pages/auth/PublicRegistrationPage";
import { NoAccessPage, NotFoundPage } from "./pages/auth/StatusPages";
import { SiteIndex } from "./site/SiteIndex";

// Ekranlar açıldıkça yüklenir: sakin telefonda yönetim panelinin kodunu indirmez.
// Adresler frontend docs/01-ekranlar.md ile aynı.

type Mod = Record<string, ComponentType>;
const page = (load: () => Promise<unknown>, name: string): LazyExoticComponent<ComponentType> =>
  lazy(() => load().then((m) => ({ default: (m as Mod)[name]! })));

const site = () => import("./pages/site");
const resident = () => import("./pages/resident/ResidentPages");
const platform = () => import("./pages/platform/PlatformPages");

function L({ c: C }: { c: LazyExoticComponent<ComponentType> }) {
  return (
    <Suspense fallback={<Loading />}>
      <C />
    </Suspense>
  );
}

const siteScreens: [string, string][] = [
  ["daireler", "UnitsPage"],
  ["daireler/:unitId", "UnitDetailPage"],
  ["borclular", "DebtorsPage"],
  ["cari/:accountId", "LedgerPage"],
  ["tahsilat", "PaymentsPage"],
  ["tahsilat/toplu", "BulkPaymentPage"],
  ["banka-aktarim", "BankImportPage"],
  ["tahakkuk", "ChargesPage"],
  ["isletme-projesi", "BudgetPage"],
  ["giderler", "ExpensesPage"],
  ["giderler/yeni", "NewExpensePage"],
  ["giderler/tekrarlanan", "RecurringExpensesPage"],
  ["kasa", "CashPage"],
  ["kasa/:accountId", "CashStatementPage"],
  ["raporlar", "ReportsPage"],
  ["iceri-aktar", "ImportPage"],
  ["talepler", "RequestsPage"],
  ["talepler/pano", "RequestBoardPage"],
  ["talepler/:requestId", "RequestDetailPage"],
  ["makbuz/:paymentId", "ReceiptPage"],
  ["belge/borcsuzluk/:certificateId", "ClearanceCertificatePage"],
  ["belge/ihtar/:accountId", "DunningLetterPage"],
  ["belge/hazirun", "AttendanceListPage"],
  ["duyurular", "AnnouncementsPage"],
  ["guvenlik", "SecurityPage"],
  ["moduller", "ModulesPage"],
  ["denetim", "AuditPage"],
  ["kullanicilar", "MembersPage"],
  ["kayit-basvurulari", "RegistrationsPage"],
  ["toplantilar", "MeetingsPage"],
  ["toplantilar/:meetingId", "MeetingDetailPage"],
  ["anketler", "PollsPage"],
  ["sozlesmeler", "ContractsPage"],
  ["demirbas", "InventoryPage"],
  ["personel", "StaffPage"],
  ["bildirimler", "SiteNotificationsPage"],
  ["onaylar", "ApprovalsPage"],
  ["onaylar/:requestId", "ApprovalDetailPage"],
  ["onay-kurallari", "ApprovalRulesPage"],
  // Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26)
  ["yapi", "YapiPage"],
  ["kisiler", "PeoplePage"],
  ["araclar", "VehiclesPage"],
  ["kayit-afisi", "QrPosterPage"],
  ["ayarlar/ozel-alanlar", "CustomFieldsPage"],
  ["kurulum", "SetupPage"],
  // Finans paketi (servis istekleri 27–34)
  ["donem-kapanisi", "FiscalPeriodsPage"],
  ["odeme-planlari", "PaymentPlansPage"],
  ["ek-ucretler", "AdHocChargesPage"],
  ["muhasebe-aktarimi", "AccountingExportPage"],
  ["ayarlar/finans", "FinanceSettingsPage"],
  // İnsan kaynakları paketi (servis istekleri 35–39)
  ["vardiya", "ShiftPlanPage"],
  ["izinler", "LeavePage"],
  ["puantaj", "TimesheetPage"],
  // Güvenlik ve devriye paketi (servis istekleri 40–46)
  ["ayarlar/guvenlik", "SecuritySettingsPage"],
  ["devriye", "PatrolAdminPage"],
  // Hizmetler paketi (servis istekleri 47–52)
  ["talepler/ayarlar", "RequestSettingsPage"],
  ["talepler/ana-olaylar", "OutagesPage"],
  ["tadilat-tasinma", "PermitsPage"],
  // Operasyon paketi (servis istekleri 53-58)
  ["anahtarlar", "KeysPage"],
  ["denetimler", "InspectionsPage"],
  ["sigorta", "InsurancePage"],
  ["sayaclar", "MetersPage"],
  ["gorevler", "TasksPage"],
  // Rezervasyon paketi (servis istekleri 59-61)
  ["rezervasyon", "ReservationsPage"],
  ["rezervasyon/alanlar", "ReservationAreasPage"],
  // Satın alma paketi (servis istekleri 62-67)
  ["satin-alma", "PurchasePage"],
  ["satin-alma/siparis/:poId", "PurchaseOrderPage"],
  ["satin-alma/:prId", "PurchaseRequestPage"],
  ["tedarikciler", "VendorsPage"],
  // Sözleşme performansı (servis istekleri 68-70)
  ["sozlesmeler/:contractId", "ContractDetailPage"],
];

const Dashboard = page(site, "DashboardPage");
const Portfolio = page(() => import("./pages/PortfolioPage"), "PortfolioPage");
const Profile = page(() => import("./pages/ProfilePage"), "ProfilePage");

export const router = createBrowserRouter([
  {
    element: (
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    ),
    children: [
      { path: "/giris", element: <LoginPage /> },
      // Oturumsuz: sakinin kendini kaydetmesi (servis isteği 13) ve aydınlatma metni.
      { path: "/kayit/:code", element: <PublicRegistrationPage /> },
      { path: "/davet/:token", element: <InviteAcceptPage /> },
      { path: "/teklif/:token", element: <VendorQuotePage /> },
      { path: "/aydinlatma", element: <PrivacyNoticePage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "/", element: <RootIndex portfolio={<L c={Portfolio} />} /> },
          { path: "/parola-degistir", element: <ChangePasswordPage /> },
          { path: "/profil", element: <AppShell title="Profil"><L c={Profile} /></AppShell> },
          { path: "/yetkisiz", element: <NoAccessPage /> },
          {
            path: "/s/:slug",
            element: <SiteLayout />,
            children: [
              { index: true, element: <SiteIndex dashboard={<L c={Dashboard} />} /> },
              ...siteScreens.map(([path, name]) => ({ path, element: <L c={page(site, name)} /> })),
              { path: "*", element: <NotFound /> },
            ],
          },
          {
            path: "/yonetim",
            element: <PlatformLayout />,
            children: [
              { index: true, element: <L c={page(platform, "PlatformOverviewPage")} /> },
              { path: "musteri-ekle", element: <L c={page(platform, "NewCustomerPage")} /> },
              { path: "site-ac", element: <L c={page(platform, "NewSitePage")} /> },
              { path: "endeksler", element: <L c={page(platform, "IndexValuesPage")} /> },
            ],
          },
          {
            path: "/sakin/:slug",
            element: <ResidentLayout />,
            children: [
              { index: true, element: <L c={page(resident, "ResidentHomePage")} /> },
              { path: "borcum", element: <L c={page(resident, "ResidentStatementPage")} /> },
              { path: "duyurular", element: <L c={page(resident, "ResidentAnnouncementsPage")} /> },
              { path: "taleplerim", element: <L c={page(resident, "ResidentRequestsPage")} /> },
              { path: "giderler", element: <L c={page(resident, "ResidentExpensesPage")} /> },
              { path: "bildirimler", element: <L c={page(resident, "ResidentNotificationsPage")} /> },
              { path: "profil", element: <L c={page(resident, "ResidentProfilePage")} /> },
              { path: "hane", element: <L c={page(resident, "ResidentHouseholdPage")} /> },
              { path: "araclar", element: <L c={page(resident, "ResidentVehiclesPage")} /> },
              { path: "ziyaretci", element: <L c={page(resident, "ResidentVisitorsPage")} /> },
              { path: "tadilat", element: <L c={page(resident, "ResidentPermitsPage")} /> },
              { path: "emanet", element: <L c={page(resident, "ResidentKeysMetersPage")} /> },
              { path: "rezervasyon", element: <L c={page(resident, "ResidentReservationPage")} /> },
              { path: "*", element: <NotFound /> },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
