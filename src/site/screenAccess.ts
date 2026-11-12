import { P, type SiteCtx } from "./SiteContext";

/**
 * Site ekranı → giriş izni (test raporu #13). Menüde öğe izne bağlıysa, adresi elle yazan kullanıcı da
 * sayfa iskeletini ve formları görmesin: rota bu tabloya bakar, izin yoksa "yetkiniz yok" gösterir.
 *
 * Koşullar AppShell menüsündeki koşullarla AYNIDIR; tek fark modül (shows) yerine yalnız izne (can) bakılır —
 * kapalı modülün ekranı kendi "modül kapalı" durumunu göstermeye devam eder. Menüde yeni bir öğe izne
 * bağlanırsa buraya da eklenir. Tabloda olmayan ekran (Onaylar, Yardım, Bildirimler, Vardiyam, belge/makbuz
 * çıktıları) korumasızdır: menüde herkese açıktır ya da kendi içinde izin denetler.
 *
 * Anahtar: rotanın ilk parçası (`talepler/:requestId` → `talepler`) ya da ayrıca tanımlıysa tam yol.
 */
const ACCESS: Record<string, (c: SiteCtx) => boolean> = {
  daireler: (c) => c.can(P.unitsRead),
  yapi: (c) => c.can(P.unitsManage),
  kisiler: (c) => c.can(P.peopleRead),
  araclar: (c) => c.can(P.unitsRead),
  borclular: (c) => c.can(P.financeRead),
  cari: (c) => c.can(P.financeRead),
  tahsilat: (c) => c.can(P.paymentRecord),
  "banka-aktarim": (c) => c.can(P.paymentRecord) && c.can(P.cashManage),
  tahakkuk: (c) => c.can(P.financeRead),
  "isletme-projesi": (c) => c.can(P.financeRead),
  giderler: (c) => c.can(P.expensesRead),
  "satin-alma": (c) => c.can(P.expensesRead),
  tedarikciler: (c) => c.can(P.expensesRead),
  kasa: (c) => c.can(P.cashRead),
  raporlar: (c) => c.can(P.reportsRead),
  "seffaflik-raporu": (c) => c.can(P.reportsRead) || c.can(P.transparencyManage),
  "iceri-aktar": (c) => c.can(P.unitsManage),
  "aidat-kurallari": (c) => c.can(P.financeRead),
  "odeme-planlari": (c) => c.can(P.financeRead),
  "ek-ucretler": (c) => c.can(P.financeRead),
  "donem-kapanisi": (c) => c.can(P.financeRead),
  "muhasebe-aktarimi": (c) => c.can(P.financeRead),
  "ayarlar/finans": (c) => c.can(P.chargePost),
  guvenlik: (c) => c.can(P.packages) || c.can(P.visitors) || c.can(P.securityIncidents),
  talepler: (c) => c.can(P.requestsRead) || c.can(P.requestsAssigned),
  "tadilat-tasinma": (c) => c.can(P.requestsAssign),
  anahtarlar: (c) => c.can(P.requestsAssign) || c.can(P.visitors),
  rezervasyon: (c) => c.can(P.requestsAssign) || c.can(P.visitors),
  gorevler: (c) => c.can(P.requestsRead) || c.can(P.requestsAssigned),
  denetimler: (c) => c.can(P.requestsAssign) || c.can(P.requestsAssigned),
  sayaclar: (c) => c.can(P.unitsManage),
  duyurular: (c) => c.can(P.announcementsRead),
  "acil-durum": (c) => c.can(P.announcementsPublish) || c.can(P.securityIncidents) || c.can(P.visitors),
  "bildirim-sablonlari": (c) => c.can(P.announcementsPublish),
  "sms-hesabi": (c) => c.can(P.notificationsManage),
  "kayit-basvurulari": (c) => c.can(P.peopleManage),
  kullanicilar: (c) => c.can(P.membersManage),
  roller: (c) => c.can(P.membersManage),
  moduller: (c) => c.can(P.modulesManage),
  "ayarlar/guvenlik": (c) => c.can(P.modulesManage),
  devriye: (c) => c.can(P.modulesManage),
  denetim: (c) => c.can(P.auditRead),
  "onay-kurallari": (c) => c.can(P.approvalRulesRead),
  toplantilar: (c) => c.can(P.meetingsRead),
  "karar-defteri": (c) => c.can(P.meetingsRead),
  dokumanlar: (c) => c.can(P.documentsRead),
  "rapor-katalogu": (c) => c.can(P.financeRead) || c.can(P.requestsRead) || c.can(P.auditRead) || c.can(P.expensesRead),
  "denetim-paketi": (c) => c.can(P.chargePost) || c.can(P.auditRead),
  kvkk: (c) => c.can(P.privacyManage),
  destek: (c) => c.can(P.membersManage) || c.can(P.financeRead) || c.can(P.modulesManage),
  anketler: (c) => c.can(P.announcementsRead),
  sozlesmeler: (c) => c.can(P.expensesRead),
  demirbas: (c) => c.can(P.inventoryRead),
  "teknik-varliklar": (c) => c.can(P.inventoryRead),
  sigorta: (c) => c.can(P.expensesRead),
  personel: (c) => c.can(P.peopleRead),
  vardiya: (c) => c.can(P.peopleRead),
  izinler: (c) => c.can(P.staffManage),
  puantaj: (c) => c.can(P.staffManage) || c.can(P.financeRead),
  "ayarlar/ozel-alanlar": (c) => c.can(P.modulesManage),
  kurulum: (c) => c.can(P.modulesManage),
};

/** Rota yolu (ör. `talepler/:requestId`) için giriş kuralı; tanımsızsa `true` (korumasız). */
export function screenAllowed(path: string, ctx: SiteCtx): boolean {
  const rule = ACCESS[path] ?? ACCESS[path.split("/").slice(0, 2).join("/")] ?? ACCESS[path.split("/")[0]!];
  return rule ? rule(ctx) : true;
}
