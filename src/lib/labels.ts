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

/** Tahakkuk koşusu (FIN-05): Taslak → Onay bekliyor → Onaylandı → Kesinleşti; düzeltme yalnız ters kayıtla. */
export const runStatus = label({
  draft: "Taslak", approval_pending: "Onay bekliyor", approved: "Onaylandı", rejected: "Reddedildi",
  cancelled: "Vazgeçildi", posted: "Kesinleşti", reversed: "Ters kaydedildi",
});
export const runTone = (s: string): Tone =>
  ({ draft: "muted", approval_pending: "warn", approved: "info", rejected: "danger", cancelled: "muted", posted: "ok", reversed: "danger" })[s] as Tone ?? "muted";
export const chargeSource = label({ budget_plan: "İşletme projesi", billing_rule: "Aidat kuralları" });
export const scheduleRunStatus = label({ posted: "Kesildi", drafted: "Taslak onaya gönderildi", skipped: "Atlandı", failed: "Başarısız" });
export const scheduleRunTone = (s: string): Exclude<Tone, "muted"> => (s === "failed" ? "danger" : s === "skipped" ? "warn" : s === "drafted" ? "info" : "ok");
export const adjustmentStatus = label({ approval_pending: "Onay bekliyor", applied: "Uygulandı", rejected: "Reddedildi" });
export const adjustmentTone = (s: string): Tone => (s === "applied" ? "ok" : s === "approval_pending" ? "warn" : "danger");
/** Aidat kuralı sürümü ve yıllık bütçe (FIN-17) durumları */
export const versionStatus = label({ draft: "Taslak", approval_pending: "Onay bekliyor", active: "Yürürlükte", rejected: "Reddedildi", superseded: "Yerine yenisi geldi" });
export const versionTone = (s: string): Tone => (s === "active" ? "ok" : s === "approval_pending" ? "warn" : s === "rejected" ? "danger" : "muted");
export const scopeKind = label({ whole_site: "Tüm site", blocks: "Seçili bloklar", unit_types: "Seçili bölüm tipleri", usage: "Kullanım türü" });
export const areaBasis = label({ gross: "Brüt m²", net: "Net m²" });
export const budgetLevelTone = (s: string): Tone => (s === "over" ? "danger" : s === "warn" ? "warn" : "ok");
export const budgetLevel = label({ ok: "Bütçe içinde", warn: "Eşiğe yaklaştı", over: "Bütçe aşıldı" });

export const ledgerSource = label({
  charge: "Tahakkuk",
  payment: "Tahsilat",
  late_fee: "Gecikme tazminatı",
  adjustment: "Düzeltme",
  transfer: "Aktarım",
  advance: "Avans mahsubu",
  opening: "Devir bakiye",
  refund: "İade",
  ad_hoc_charge: "Dönem dışı ücret",
  payment_plan: "Ödeme planı",
  service: "Ücretli hizmet",
  deposit: "Tadilat depozitosu",
  reservation: "Rezervasyon",
});

export const paymentMethod = label({ cash: "Nakit", bank_transfer: "Havale / EFT", credit_card: "Kredi kartı", other: "Diğer" });

export const cashAccountKind = label({ cash: "Kasa", bank: "Banka" });

export const cashSource = label({ manual: "Elle", payment: "Tahsilat", expense: "Gider", transfer: "Aktarım", opening: "Açılış" });

export const expenseCategoryKind = label({ operating: "İşletme gideri", capital_improvement: "Demirbaş / yatırım" });

export const requestStatus = label({
  open: "Açık",
  assigned: "Atandı",
  in_progress: "İşlemde",
  waiting: "Beklemede",
  resolved: "Çözüldü",
  closed: "Kapandı",
  cancelled: "İptal",
});
export const requestStatusTone = (s: string): Tone =>
  ({ open: "info", assigned: "info", in_progress: "warn", waiting: "muted", resolved: "ok", closed: "muted", cancelled: "muted" })[s] as Tone ?? "muted";

/** Talep durumları (dokümandaki akış sırası, K18). Geçilebilecek durumları backend verir (`allowed_transitions`). */
export const REQUEST_STATUSES = ["open", "assigned", "in_progress", "waiting", "resolved", "closed", "cancelled"];

/** Talep kategorisi adı — site kategorileri backend'den gelir (GET /request-categories); bu varsayılanların yedeği. */
export const requestCategory = label({
  other: "Diğer",
  plumbing: "Su / tesisat",
  electrical: "Elektrik",
  elevator: "Asansör",
  heating: "Isıtma",
  cleaning: "Ortak alan temizliği",
  security: "Güvenlik",
  garden: "Bahçe",
  common_area: "Ortak alan",
  noise: "Gürültü / şikâyet",
  parking: "Otopark",
  meter_dispute: "Sayaç itirazı",
  flood: "Su baskını",
  elevator_trapped: "Asansörde mahsur kalma",
  gas_smell: "Gaz kokusu",
});

export const requestPriority = label({ low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" });
export const priorityTone = (p: string): Tone => ({ low: "muted", normal: "muted", high: "warn", urgent: "danger" })[p] as Tone ?? "muted";

export const requestEvent = label({
  created: "Talep açıldı",
  status_changed: "Durum değişti",
  assigned: "Atandı",
  comment: "Yorum",
  resolved: "Çözüldü",
  department_changed: "Departman",
  closed: "Kapandı",
  cancelled: "İptal edildi",
  reopened: "Yeniden açıldı",
  feedback: "Sakin değerlendirmesi",
  outage_linked: "Ana olaya bağlandı",
  outage_unlinked: "Ana olaydan ayrıldı",
  quote: "Ücretli hizmet",
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

export const auditAction = label({ create: "Oluşturma", update: "Güncelleme", delete: "Silme", import: "İçe aktarma", download: "İndirme", export: "Dışa aktarma", contact_view: "Kişisel veri görüntüleme" });
export const actorType = label({ user: "Kullanıcı", system: "Sistem", delegate: "Vekâleten" });

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

// Bildirim, onay mekanizması (ONY-01..03), yetki devri
export const notificationCategory = label({
  urgent: "Acil", financial: "Finans", security: "Güvenlik", operations: "Operasyon", governance: "Yönetim", announcement: "Duyuru",
});
export const notificationChannel = label({ push: "Mobil bildirim", sms: "SMS", email: "E-posta" });
export const approvalStatus = label({
  pending: "Onay bekliyor", revision_requested: "Düzeltme istendi", approved: "Onaylandı", executed: "Uygulandı",
  execution_failed: "Onaylandı – uygulanamadı", rejected: "Reddedildi", withdrawn: "Geri çekildi", module_disabled: "Modül kapalı",
});
export const approvalStatusTone = (v: string): Tone =>
  v === "executed" || v === "approved" ? "ok" : v === "rejected" || v === "execution_failed" ? "danger" : v === "pending" || v === "revision_requested" ? "warn" : "muted";
export const stepMode = label({ sequential: "Sıralı (adım adım)", parallel: "Paralel (aynı anda)" });
export const rejectBehavior = label({ single_rejects: "Tek ret reddeder", counts: "Ret oylardan biri sayılır" });
export const quorumKind = label({ any: "Herhangi biri", all: "Hepsi", majority: "Çoğunluk", count: "Belirli sayıda" });
export const dayBasis = label({ calendar: "Takvim günü", business: "İş günü" });
export const decisionLabel = label({ approve: "Onayladı", reject: "Reddetti", revision: "Düzeltme istedi" });
export const decisionTone = (v: string): Tone => (v === "approve" ? "ok" : v === "reject" ? "danger" : "warn");
export const delegationState = label({ scheduled: "Başlamadı", active: "Etkin", ended: "Bitti" });
export const delegationStateTone = (v: string): Tone => (v === "active" ? "ok" : v === "scheduled" ? "info" : "muted");

// Yapı, kişiler ve kayıt paketi (servis istekleri 19–26)
export const commonAreaKind = label({ pool: "Havuz", hall: "Salon / toplantı odası", gym: "Spor salonu", garden: "Bahçe", playground: "Çocuk parkı", parking: "Otopark", technical: "Teknik oda", roof: "Çatı / teras", other: "Diğer" });
export const vehicleKind = label({ permanent: "Kalıcı", guest: "Misafir" });
export const vehicleStatus = label({ active: "Etkin", pending: "Onay bekliyor", inactive: "Pasif" });
export const vehicleStatusTone = (v: string): Tone => (v === "active" ? "ok" : v === "pending" ? "warn" : "muted");
export const invitationStatus = label({ sent: "Gönderildi", opened: "Açıldı", completed: "Tamamlandı", expired: "Süresi doldu", cancelled: "İptal" });
export const invitationStatusTone = (v: string): Tone => (v === "completed" ? "ok" : v === "sent" || v === "opened" ? "info" : "muted");
export const householdStatus = label({ invited: "Davet bekliyor", active: "Etkin", ended: "Bitti" });
export const householdPermission = label({ visitors: "Ziyaretçi davet etme", packages: "Kargo bildirimi ve teslim", reservations: "Rezervasyon", requests: "Talep açma" });
export const customFieldType = label({ text: "Metin", number: "Sayı", date: "Tarih", bool: "Evet / Hayır", select: "Seçim listesi" });
export const kvkkCategory = label({ identity: "Kimlik", contact: "İletişim", finance: "Finans", location_plate: "Konum / plaka", other: "Diğer" });
export const importType = label({ units: "Bölümler ve kişiler", vehicles: "Araçlar", opening_balances: "Açılış bakiyeleri" });
export const importStatus = label({ previewed: "Önizlendi", imported: "Aktarıldı", rolled_back: "Geri alındı" });
export const unitAttr = label({ gross_area: "Brüt m²", net_area: "Net m²", land_share_numerator: "Arsa payı (pay)", land_share_denominator: "Arsa payı (payda)", unit_type_id: "Bölüm tipi" });

// Finans paketi (servis istekleri 27–34)
export const fiscalStatus = label({ open: "Açık", closing: "Kapanışta", locked: "Kilitli", temp_open: "Süreli açık" });
export const fiscalStatusTone = (v: string): Tone => (v === "locked" ? "ok" : v === "closing" ? "warn" : v === "temp_open" ? "danger" : "muted");
export const fiscalAction = label({ start_close: "Kapanış başlatıldı", lock: "Kilitlendi", reopen: "Açığa alındı", unlock_requested: "Süreli açma onaya gönderildi", unlock: "Süreli açıldı", unlock_rejected: "Süreli açma reddedildi", relocked: "Süre doldu, yeniden kilitlendi" });
export const collectionKind = label({ reminder: "Hatırlatma", call: "Arama", note: "Not", demand_letter: "İhtarname", payment_plan: "Ödeme planı" });
export const reminderChannel = label({ app: "Uygulama bildirimi", sms: "SMS", phone: "Telefon" });
export const letterMethod = label({ hand: "Elden, imzalı", registered_mail: "İadeli taahhütlü", notary: "Noter" });
export const letterStatus = label({ approval_pending: "Onay bekliyor", sent: "Gönderildi", served: "Tebliğ edildi", rejected: "Reddedildi" });
export const planStatus = label({ approval_pending: "Onay bekliyor", active: "Yürürlükte", broken: "Bozuldu", completed: "Tamamlandı", cancelled: "İptal", rejected: "Reddedildi" });
export const planStatusTone = (v: string): Tone => (v === "completed" ? "ok" : v === "active" ? "info" : v === "broken" ? "danger" : v === "approval_pending" ? "warn" : "muted");
export const installmentStatus = label({ paid: "Ödendi", partial: "Kısmi", open: "Bekliyor", overdue: "Gecikti" });
export const installmentTone = (v: string): Tone => (v === "paid" ? "ok" : v === "overdue" ? "danger" : v === "partial" ? "warn" : "muted");
export const adHocSource = label({ reservation: "Rezervasyon", service: "Ücretli hizmet", renovation: "Tadilat / taşınma", penalty: "Ceza", other: "Diğer" });
export const adHocMode = label({ immediate: "Anında tahakkuk", next_period: "Sonraki aidat dönemine ekle" });
export const adHocStatus = label({ approval_pending: "Onay bekliyor", posted: "Cariye yazıldı", waiting_next_run: "Sonraki tahakkukta", cancelled: "İptal", rejected: "Reddedildi" });
export const voucherSource = label({ charge: "Tahakkuk", ad_hoc_charge: "Dönem dışı ücret", payment_cash: "Tahsilat — nakit", payment_bank_transfer: "Tahsilat — havale", payment_credit_card: "Tahsilat — kart", payment_other: "Tahsilat — diğer", expense: "Gider ödemesi", refund: "İade" });
export const diffFlag = label({ increase: "Arttı", decrease: "Azaldı", new: "Yeni hesap", missing: "Bu dönem yok" });
export const diffFlagTone = (v: string): Tone => (v === "increase" ? "warn" : v === "decrease" ? "info" : v === "new" ? "info" : "danger");

// İnsan kaynakları paketi (servis istekleri 35–39)
export const leaveType = label({ annual: "Yıllık izin", excuse: "Mazeret izni", sick: "Raporlu", unpaid: "Ücretsiz izin" });
export const leaveStatus = label({ pending: "Onay bekliyor", approved: "Onaylandı", rejected: "Reddedildi", cancelled: "İptal" });
export const leaveStatusTone = (v: string): Tone => (v === "approved" ? "ok" : v === "pending" ? "warn" : v === "rejected" ? "danger" : "muted");
export const timesheetStatus = label({ worked: "Çalıştı", absent: "Gelmedi", leave: "İzinli" });
export const conflictKind = label({ overlap: "Çakışan vardiya", leave: "İzin günü", rest: "Dinlenme < 11 saat" });
export const attendanceFlag = label({ no_check_in: "Giriş kaydı yok", no_check_out: "Çıkış kaydı yok", late: "Geç giriş", early_leave: "Erken çıkış", overtime: "Vardiya sonrası çıkış", unverified: "Doğrulanamayan kayıt" });
export const attendanceMethod = label({ none: "Doğrulama yok (plana göre)", qr: "Kulübedeki QR kodu", location: "O anki konum (tesis sınırı)" });

// Güvenlik ve devriye paketi (servis istekleri 40–46)
export const gateKind = label({ vehicle: "Araç", pedestrian: "Yaya", service: "Servis" });
export const unannouncedMethod = label({ info: "Bilgi bildirimi", approval: "Sakin onayı" });
export const parcelMethod = label({ code: "4 haneli kod", qr: "QR", both: "Kod ya da QR" });
export const inviteType = label({ once: "Tek kullanımlık", range: "Tarih aralıklı", recurring: "Süreli kalıcı" });
export const inviteStatus = label({ active: "Geçerli", used: "Kullanıldı", cancelled: "İptal" });
export const visitRequestStatus = label({ awaiting: "Onay bekliyor", allowed: "İçeri alındı", denied: "Reddedildi" });
export const plateResult = label({ registered: "Kayıtlı", guest: "Misafir", unknown: "Kayıtsız" });
export const plateResultTone = (v: string): Tone => (v === "registered" ? "ok" : v === "guest" ? "info" : "danger");
export const logKind = label({ note: "Not", event: "Olay", handover: "Vardiya devri" });
export const tagType = label({ qr: "QR", nfc: "NFC", both: "QR + NFC" });
export const parkingKind = label({ standard: "Standart", disabled: "Engelli", ev: "Elektrikli araç", guest: "Misafir" });
export const patrolSlotStatus = label({ upcoming: "Sırada", due: "Başlamalı", running: "Sürüyor", overdue: "Süre aşıldı", done: "Tamamlandı", done_with_deviation: "Sapmalı tamamlandı", not_started: "Başlamadı" });
export const patrolSlotTone = (v: string): Tone => (v === "done" ? "ok" : v === "running" || v === "upcoming" ? "info" : v === "due" || v === "done_with_deviation" ? "warn" : "danger");
export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

// Hizmetler paketi (servis istekleri 47–52)
export const slaState = label({ ok: "Süre içinde", warning: "Süre doluyor", breached: "SLA aşıldı", met: "Süresinde çözüldü", missed: "Geç çözüldü" });
export const slaTone = (v: string): Tone => (v === "ok" || v === "met" ? "ok" : v === "warning" ? "warn" : "danger");
export const hourType = label({ "24x7": "7/24", business: "Çalışma saati" });
export const quoteStatus = label({ pending: "Sakin onayı bekliyor", accepted: "Sakin onayladı", rejected: "Sakin reddetti", extra_pending: "Ek tutar onayı bekliyor", billed: "Cariye yansıdı" });
export const quoteTone = (v: string): Tone => (v === "billed" || v === "accepted" ? "ok" : v === "rejected" ? "danger" : "warn");
export const permitType = label({ renovation: "Tadilat", move_in: "Taşınma (giriş)", move_out: "Taşınma (çıkış)" });
export const permitStatus = label({ pending: "Onay bekliyor", approved: "Onaylandı", rejected: "Reddedildi", completed: "Tamamlandı" });
export const permitTone = (v: string): Tone => (v === "completed" ? "ok" : v === "approved" ? "info" : v === "rejected" ? "danger" : "warn");
export const WEEKDAYS_LONG = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
/** Hazır yanıt değişkenleri: {{sakin.ad}}, {{talep.no}}, {{talep.konu}} */
export const fillTemplate = (body: string, r: { number?: number; reporter_name?: string | null; title?: string }) =>
  body.replace(/\{\{\s*sakin\.ad\s*\}\}/g, r.reporter_name ?? "Sayın sakin").replace(/\{\{\s*talep\.no\s*\}\}/g, `#${r.number ?? ""}`).replace(/\{\{\s*talep\.konu\s*\}\}/g, r.title ?? "");

// Operasyon paketi (servis istekleri 53–58)
export const keyKind = label({ key: "Anahtar", card: "Kart", remote: "Kumanda" });
export const depositStatus = label({ requested: "Teslim bekleniyor", held: "Emanette", handed: "Verildi", returned: "Sahibine iade", expired: "Süresi doldu" });
export const depositTone = (v: string): Tone => (v === "held" ? "info" : v === "handed" ? "ok" : v === "expired" ? "danger" : "muted");
export const itemType = label({ yesno: "Evet / Hayır", number: "Sayı", score: "Puan (1–5)" });
export const policyKind = label({ building: "Bina (deprem/yangın)", liability: "Üçüncü şahıs sorumluluk", elevator: "Asansör", personnel: "Personel kaza", glass: "Cam kırılması", other: "Diğer" });
export const claimStatus = label({ open: "Açık", submitted: "Sigortacıya iletildi", paid: "Tazminat ödendi", rejected: "Reddedildi" });
export const claimTone = (v: string): Tone => (v === "paid" ? "ok" : v === "rejected" ? "danger" : v === "submitted" ? "info" : "warn");
export const meterKind = label({ cold_water: "Soğuk su", hot_water: "Sıcak su", heat: "Isı pay ölçer", electric: "Elektrik", gas: "Doğalgaz", common: "Ortak alan sayacı" });
export const readingStatus = label({ ok: "Okundu", anomaly: "Anormal — onay bekliyor", approved: "Onaylandı", unreadable: "Okunamadı", reread: "Yeniden okunacak" });
export const readingTone = (v: string): Tone => (v === "ok" || v === "approved" ? "ok" : v === "anomaly" ? "warn" : "danger");
export const taskFrequency = label({ daily: "Her gün", weekdays: "Haftanın günleri", monthly: "Aylık" });
export const taskStatus = label({ upcoming: "Sırada", due: "Şimdi", late: "Gecikti", done: "Tamamlandı", failed: "Tamamlanamadı" });
export const taskTone = (v: string): Tone => (v === "done" ? "ok" : v === "late" || v === "failed" ? "danger" : v === "due" ? "warn" : "muted");
export const meterStatus = label({ active: "Aktif", faulty: "Arızalı", replaced: "Değişti" });
export const stockCountStatus = label({ applied: "Uygulandı", approval_pending: "Onay bekliyor", rejected: "Reddedildi", withdrawn: "Geri çekildi", failed: "Onaylandı – yürütülemedi" });
export const stockCountTone = (v: string): Tone => (v === "applied" ? "ok" : v === "approval_pending" ? "info" : v === "rejected" || v === "failed" ? "danger" : "muted");
export const techCategory = label({ elevator: "Asansör", generator: "Jeneratör", hydrophore: "Hidrofor", fire_system: "Yangın sistemi", camera: "Kamera", barrier: "Bariyer", electrical_panel: "Elektrik panosu", pool_equipment: "Havuz ekipmanı", hvac: "İklimlendirme (HVAC)", boiler: "Kazan", other: "Diğer" });
export const TECH_CATEGORIES = ["elevator", "generator", "hydrophore", "fire_system", "camera", "barrier", "electrical_panel", "pool_equipment", "hvac", "boiler", "other"];
export const techStatus = label({ working: "Çalışıyor", faulty: "Arızalı", out_of_service: "Devre dışı", nonconforming: "Uygunsuz (muayene)" });
export const techStatusTone = (v: string): Tone => (v === "working" ? "ok" : v === "out_of_service" ? "muted" : "danger");
export const dueWarning = label({ "60": "60 gün içinde", "30": "30 gün içinde", "7": "7 gün içinde", overdue: "Tarihi geçti" });
export const dueWarningTone = (v: string | null | undefined): Tone => (v === "overdue" || v === "7" ? "danger" : v === "30" ? "warn" : v === "60" ? "info" : "ok");
export const inspectionResult = label({ pass: "Olumlu", fail: "Olumsuz" });
export const periodUnit = label({ week: "hafta", month: "ay" });
export const maintenanceRunStatus = label({ open: "İş emri açık", done: "Yapıldı", skipped: "Yapılmadı" });
export const timelineKind = label({ created: "Kart", inspection_pass: "Muayene", inspection_fail: "Muayene", maintenance_open: "Bakım", maintenance_done: "Bakım", maintenance_skipped: "Bakım", document: "Belge" });

// Rezervasyon paketi (servis istekleri 59-61)
export const resStatus = label({ pending: "Onay bekliyor", approved: "Onaylı", rejected: "Reddedildi", cancelled: "İptal", checked_in: "Geldi", no_show: "Gelmedi", completed: "Tamamlandı" });
export const resTone = (v: string): Tone => (v === "approved" || v === "checked_in" || v === "completed" ? "ok" : v === "pending" ? "warn" : v === "no_show" || v === "rejected" ? "danger" : "muted");
export const feeType = label({ free: "Ücretsiz", fixed: "Sabit (rezervasyon başı)", hourly: "Saat başı", per_guest: "Misafir başı" });
export const verifyMethod = label({ none: "Yok", qr: "QR", code: "6 haneli kod", staff: "Görevli listeden onaylar" });
export const resChannel = label({ resident: "Sakin yapar", staff: "Yönetim sakin adına açar", both: "İkisi de" });

// Satın alma paketi (servis istekleri 62-67)
export const prStatus = label({ quoting: "Teklif toplanıyor", exception_pending: "Teklif istisnası onayda", approval_pending: "Satın alma onayında", approved: "Onaylandı", rejected: "Reddedildi", ordered: "Sipariş verildi", cancelled: "İptal" });
export const prTone = (v: string): Tone => (v === "approved" || v === "ordered" ? "ok" : v === "rejected" ? "danger" : v === "cancelled" ? "muted" : v === "quoting" ? "info" : "warn");
export const vendorStatus = label({ active: "Aktif", passive: "Pasif", blacklist: "Kara liste" });
export const vendorTone = (v: string): Tone => (v === "active" ? "ok" : v === "blacklist" ? "danger" : "muted");
export const poStatus = label({ sent: "Gönderildi", partial: "Kısmi teslim", received: "Teslim alındı", closed: "Kapandı" });
export const poTone = (v: string): Tone => (v === "closed" ? "ok" : v === "received" ? "ok" : v === "partial" ? "warn" : "info");
export const invoiceStatus = label({ matched: "Eşleşti — ödenecek", diff_pending: "Fark onayda", disputed: "İtiraz edildi", paid: "Ödendi" });
export const invoiceTone = (v: string): Tone => (v === "paid" ? "ok" : v === "matched" ? "info" : v === "disputed" ? "danger" : "warn");

// Sözleşme performansı (servis istekleri 68-70)
export const kpiSource = label({ inspection: "Denetim listesi puanı", patrol: "Devriye tamamlama oranı", tasks: "Görev tamamlama oranı", sla: "Talep SLA uyumu", manual: "Elle giriş" });
export const escalationKind = label({ none: "Artış yok", tufe: "TÜFE", ufe: "ÜFE", avg: "TÜFE+ÜFE ortalaması", fixed: "Sabit oran" });
