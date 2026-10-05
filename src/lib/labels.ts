// API'nin döndürdüğü kodların Türkçe karşılıkları ve rozet tonları.
// Kod listesi OpenAPI şemasındaki enum'larla aynı; yeni değer gelirse kodun kendisi gösterilir.

type Tone = "ok" | "warn" | "danger" | "info" | "muted";

const label = (map: Record<string, string>) => (v: string | null | undefined) => (v ? (map[v] ?? v) : "—");

export const accountKind = label({ owner: "Malik", occupant: "Oturan" });

export const propertyKind = label({ residential: "Konut sitesi", mixed: "Karma site", office: "İş merkezi", shopping_center: "AVM" });

export const unitUsage = label({ residential: "Konut", commercial: "Ticari", storage: "Depo", parking: "Otopark" });

export const partyRole = label({ owner: "Malik", tenant: "Kiracı", resident: "Oturan", proxy: "Vekil" });

export const payerRule = label({ occupant: "Oturan öder", owner: "Malik öder" });

export const frequency = label({ monthly: "Aylık", quarterly: "Üç aylık", yearly: "Yıllık", one_time: "Tek seferlik" });

export const allocationKind = label({
  equal: "Eşit",
  by_land_share: "Arsa payına göre",
  by_area: "Alana (m²) göre",
  by_unit_type_weight: "Daire tipi katsayısına göre",
  by_custom_weight: "Özel katsayıya göre",
  fixed_per_unit: "Bölüm başına sabit",
  by_meter_consumption: "Sayaç tüketimine göre",
  composite: "Karma",
});

export const budgetStatus = label({ draft: "Taslak", notified: "Tebliğ edildi", finalized: "Kesinleşti", superseded: "Yerine yenisi geldi" });
export const budgetTone = (s: string): Tone => ({ draft: "muted", notified: "info", finalized: "ok", superseded: "muted" })[s] as Tone ?? "muted";

export const runStatus = label({ draft: "Taslak", posted: "Kaydedildi", reversed: "Ters kaydedildi" });
export const runTone = (s: string): Tone => ({ draft: "muted", posted: "ok", reversed: "danger" })[s] as Tone ?? "muted";

export const ledgerSource = label({
  charge: "Tahakkuk",
  payment: "Tahsilat",
  late_fee: "Gecikme tazminatı",
  adjustment: "Düzeltme",
  transfer: "Aktarım",
  advance: "Avans mahsubu",
});

export const paymentMethod = label({ cash: "Nakit", bank_transfer: "Havale / EFT", credit_card: "Kredi kartı", other: "Diğer" });

export const cashAccountKind = label({ cash: "Kasa", bank: "Banka" });

export const cashSource = label({ manual: "Elle", payment: "Tahsilat", expense: "Gider", transfer: "Aktarım", opening: "Açılış" });

export const expenseCategoryKind = label({ operating: "İşletme gideri", capital_improvement: "Demirbaş / yatırım" });

export const requestStatus = label({
  open: "Açık",
  in_progress: "İşlemde",
  waiting: "Beklemede",
  resolved: "Çözüldü",
  closed: "Kapandı",
  cancelled: "İptal",
});
export const requestStatusTone = (s: string): Tone =>
  ({ open: "info", in_progress: "warn", waiting: "muted", resolved: "ok", closed: "muted", cancelled: "muted" })[s] as Tone ?? "muted";

export const requestCategory = label({
  other: "Diğer",
  plumbing: "Su tesisatı",
  electrical: "Elektrik",
  elevator: "Asansör",
  heating: "Isıtma",
  cleaning: "Temizlik",
  security: "Güvenlik",
  garden: "Bahçe",
  common_area: "Ortak alan",
});

export const requestPriority = label({ low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" });
export const priorityTone = (p: string): Tone => ({ low: "muted", normal: "muted", high: "warn", urgent: "danger" })[p] as Tone ?? "muted";

export const requestEvent = label({
  created: "Talep açıldı",
  status_changed: "Durum değişti",
  assigned: "Atandı",
  comment: "Yorum",
  resolved: "Çözüldü",
});

export const importance = label({ normal: "Normal", important: "Önemli", critical: "Acil" });
export const importanceTone = (i: string): Tone => ({ normal: "muted", important: "warn", critical: "danger" })[i] as Tone ?? "muted";

export const audience = label({
  all_residents: "Tüm sakinler",
  blocks: "Seçili bloklar",
  owners_only: "Yalnız malikler",
  tenants_only: "Yalnız kiracılar",
  debtors_only: "Yalnız borçlular",
});

export const channel = label({ in_app: "Uygulama", web_push: "Tarayıcı bildirimi", email: "E-posta", sms: "SMS" });

export const packageStatus = label({ waiting: "Bekliyor", delivered: "Teslim edildi", returned: "İade edildi" });
export const visitorKind = label({ guest: "Misafir", cargo: "Kargo", service: "Servis", contractor: "Yüklenici" });
export const visitorStatus = label({ expected: "Bekleniyor", entered: "İçeride", exited: "Çıktı", denied: "Alınmadı" });
export const visitorTone = (s: string): Tone => ({ expected: "info", entered: "ok", exited: "muted", denied: "danger" })[s] as Tone ?? "muted";

export const moduleName = label({
  finance: "Finans",
  announcements: "Duyurular",
  requests: "Talepler",
  visitors: "Ziyaretçi",
  packages: "Kargo",
  documents: "Doküman",
  reservations: "Rezervasyon",
  valet: "Vale",
  "general-assembly": "Genel kurul",
  surveys: "Anket",
  staff: "Personel",
  portfolio: "Portföy",
});

export const auditAction = label({ create: "Oluşturma", update: "Güncelleme", delete: "Silme", import: "İçe aktarma", download: "İndirme" });

export const warningKind = label({
  no_active_party: "Ödeyecek kişi yok",
  missing_ledger_account: "Cari hesap eksik",
  missing_weight_data: "Dağıtım için veri eksik",
  empty_scope: "Kapsamda bölüm yok",
  composite_percent_mismatch: "Karma oranların toplamı %100 değil",
});

/** Gecikme günü rozeti (referans: 30+ uyarı, 60+ tehlike). */
export function overdueTone(days: number): Tone {
  if (days > 60) return "danger";
  if (days > 30) return "warn";
  return "muted";
}

export const CATEGORIES = ["plumbing", "electrical", "elevator", "heating", "cleaning", "security", "garden", "common_area", "other"];
export const PRIORITIES = ["low", "normal", "high", "urgent"];

export const incidentKind = label({
  theft: "Hırsızlık",
  damage: "Hasar",
  noise: "Gürültü / rahatsızlık",
  fire: "Yangın / duman",
  water_leak: "Su baskını / sızıntı",
  suspicious: "Şüpheli durum",
  accident: "Kaza / yaralanma",
  other: "Diğer",
});

// Servis istekleri 14–18 (toplantı, anket, sözleşme, demirbaş/stok, personel)
export const meetingKind = label({ general_ordinary: "Olağan genel kurul", general_extraordinary: "Olağanüstü genel kurul", board: "Yönetim kurulu" });
export const meetingStatus = label({ planned: "Planlandı", held: "Yapıldı", cancelled: "İptal" });
export const meetingStatusTone = (v: string): Tone => (v === "held" ? "ok" : v === "cancelled" ? "muted" : "info");
export const agendaResult = label({ accepted: "Kabul", rejected: "Ret", postponed: "Ertelendi", info: "Bilgi verildi" });
export const agendaResultTone = (v: string | null): Tone => (v === "accepted" ? "ok" : v === "rejected" ? "danger" : v === "postponed" ? "warn" : "muted");
export const pollAudience = label({ all: "Tüm bölümler", owners: "Yalnız malikler", tenants: "Yalnız oturanlar" });
export const contractCategory = label({
  elevator: "Asansör bakımı", cleaning: "Temizlik", security: "Güvenlik", garden: "Bahçe / peyzaj",
  maintenance: "Teknik bakım", insurance: "Sigorta", pool: "Havuz", other: "Diğer",
});
export const contractPeriod = label({ monthly: "Aylık", yearly: "Yıllık", once: "Tek seferlik" });
export const assetStatus = label({ in_use: "Kullanımda", broken: "Arızalı", retired: "Kullanım dışı" });
export const assetStatusTone = (v: string): Tone => (v === "in_use" ? "ok" : v === "broken" ? "warn" : "muted");
export const staffEmployer = label({ site: "Site kadrosu", contractor: "Taşeron firma" });
