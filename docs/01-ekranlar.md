# 01 — Ekranlar

Mevcut referans uygulamadaki (.NET, sunucuda HTML) ekranların tam listesi ve yeni frontend'deki
karşılıkları. Uç nokta adları backend `docs/06-api-sozlesmesi.md` §2'deki katalogdan.

**Durum:** `R` = referansta var, aynen taşınacak · `Y` = yeni tasarlanacak.

## 1. Girişten sonra nereye

`GET /me` → `UserAccess`:
| Kullanıcı | Açılış ekranı |
|---|---|
| Platform yöneticisi | `/yonetim` (platform paneli) |
| Sakin | `/sakin/{slug}` |
| Tek siteye erişimi olan personel | `/s/{slug}` (site panosu) |
| Birden çok siteye erişimi olan | `/` (portföy) |
| Hiçbir siteye erişimi yok | `/yetkisiz` |

Güvenlik görevlisi site panosuna değil `/s/{slug}/guvenlik`'e, teknik personel `/s/{slug}/talepler`'e yönlenir
(`finance.read` izni yoksa panoyu görmez).

## 2. Genel

| Yol | Ekran | Uç nokta | Durum |
|---|---|---|---|
| `/giris` | Giriş. Geliştirme ortamında demo hesapları listelenir, tıklayınca form dolar | `auth/login` | R |
| `/yetkisiz` | Yetkisiz / bulunamadı | — | R |
| `/` | **Portföy** — birden çok sitenin karşılaştırması: bölüm, tahsilat oranı, açık bakiye, geciken talep, sağlık durumu | `portfolio` | R |

## 3. Site yönetim paneli — `/s/{slug}/...`

Sol menü, izne ve açık modüle göre görünür. Menü grupları: **Genel** (portföy, >1 site varsa) ·
**{Site adı}** (finans ve yapı) · **Operasyon** · **Önizleme** · **Siteler** (>1 site varsa).

| Yol | Ekran | İzin | Uç nokta | Durum |
|---|---|---|---|---|
| `/s/{slug}` | **Bugün (pano)** — KPI'lar, en yüksek borçlular, açık talepler, son duyurular, son giderler | `finance.read` | `dashboard` | R |
| `/s/{slug}/daireler` | **Daireler** — blok, tip, m², arsa payı, malik, kiracı, bakiye | `units.read` | `units` | R |
| `/s/{slug}/daireler/{id}` | **Daire ayrıntısı** — taraflar (geçmiş dahil), kiracı değişimi, hesaplar | `units.read` / `people.manage` | `units/{id}`, `parties` | **Y** |
| `/s/{slug}/borclular` | **Borçlular** — KPI + tablo, gecikme günü | `finance.read` | `debtors` | R |
| `/s/{slug}/cari/{id}` | **Cari ekstre** — hareketler, bakiye, son tahakkukun kalem dökümü ("bu tutar nasıl hesaplandı"), **tahsilat girişi** | `finance.read` / `finance.payment.record` | `accounts/{id}/statement`, `payments` | R |
| `/s/{slug}/tahakkuk` | **Tahakkuk** — sıradaki dönemin önizlemesi (daire × kalem, uyarılar, kalem toplam kontrolü), kaydet, geçmiş koşular, ters kayıt | `finance.charge.post` | `charge-runs/preview`, `charge-runs` | R |
| `/s/{slug}/isletme-projesi` | **İşletme projesi** — kalemler, dağıtım kuralı, ödeyen, durum | `finance.read` | `budget-plans/current` | R (yalnız görüntüleme) |
| `/s/{slug}/giderler` | **Gider defteri** — KPI, filtre (yıl, durum, kategori), kategori dağılımı, tablo; satırda **Öde** ve **Geri al** açılır formları; Excel | `expenses.read` / `expenses.manage` | `expenses` | R |
| `/s/{slug}/giderler/yeni` | **Yeni gider** — fatura yükleme, "ödendi" işaretlenince hesap ve tarih alanları açılır | `expenses.manage` | `expenses` (multipart) | R |
| `/s/{slug}/kasa` | **Kasa ve banka** — hesap kartları, bakiye, hesap aç, aktarım | `finance.cash.read` / `.manage` | `cash-accounts`, `cash-transfers` | R |
| `/s/{slug}/kasa/{id}` | **Hesap ekstresi** — tarih aralığı, elle hareket, yürüyen bakiye, sayfalama, Excel | `finance.cash.read` | `cash-accounts/{id}/statement` | R |
| `/s/{slug}/raporlar` | **Gelir-gider raporu** — yıl seçimi, KPI, ay ay çubuk, kategori dökümü, işletme projesi karşılaştırması, Excel | `finance.reports.read` | `reports/income-expense` | R |
| `/s/{slug}/iceri-aktar` | **Excel'den aktarım** — şablon indir, yükle, önizleme (satır satır hata/uyarı), onayla | `units.manage` | `imports/units` | R |
| `/s/{slug}/talepler` | **Talepler** — liste, filtre, yeni talep | `requests.read` | `requests` | R |
| `/s/{slug}/talep/{id}` | **Talep ayrıntısı** — durum değiştir (çözüldü/kapandıda çözüm notu zorunlu), ata, not, geçmiş | `requests.read` / `.assign` | `requests/{id}` | R |
| `/s/{slug}/duyurular` | **Duyurular** — liste + yayınla (hedef kitle, kanal, önem, sabitle) | `announcements.read` / `.publish` | `announcements` | R |
| `/s/{slug}/guvenlik` | **Güvenlik** — kargo geldi, ziyaretçi geldi; bekleyen kargolar, bugünkü ziyaretçiler; daire araması yalnız bölüm + oturan adı | `security.*` + modül | `packages`, `visitors` | R |
| `/s/{slug}/moduller` | **Modüller** — aç/kapa, planda olmayan kilitli | `modules.manage` | `modules` | R |
| `/s/{slug}/yapi` | **Yapı tanımları** — yapı özeti KPI; bloklar, bölüm tipleri, ortak alanlar (YAP-02) | `units.manage` | `blocks`, `unit-types`, `common-areas`, `structure/summary` (istek 19) | R (sahte servis) |
| `/s/{slug}/daireler/{id}` | **Bölüm 360°** — bakiye/hisse/araç/hane KPI, uyarılar, sekmeler: Kişiler (maskeli iletişim, hane), Finans, Talepler, Araçlar, Güvenlik, Özel alanlar, Geçmiş; düzenle (kimlik + yürürlük tarihli ölçü/pay), satış/veraset (YAP-03) | `units.read` / `.manage` | `units/{id}`, `units/{id}/overview`, istek 19–22, 24 | R (sahte servis) |
| `/s/{slug}/kisiler` | **Kişiler** — arama, düzenleme, mükerrer birleştirme, özel alanlar (YAP-04) | `people.read` / `.manage` | `people`, `people/duplicates`, `people/merge` (istek 21) | R (sahte servis) |
| `/s/{slug}/araclar` | **Araçlar** — plaka listesi, ekle/onayla/pasif, ayarlar (YAP-05) | `units.read` / `.manage` | `vehicles`, `settings/vehicles` (istek 22) | R (sahte servis) |
| `/s/{slug}/kayit-basvurulari` | **Sakin kaydı** — Başvurular (istek 13), Davetler, Kayıt yöntemleri (YAP-07/08) | `people.manage` | `registrations`, `invitations`, `settings/registration` (istek 23) | R (sahte servis) |
| `/s/{slug}/kayit-afisi` | **QR kayıt afişi** — tesis/blok/bölüm, A4/A5/etiket, yazdır; `?blok=`/`?bolum=` önseçim | `people.manage` | `registration-link`, `blocks`, `units` | R |
| `/davet/{token}` | **Davetle kayıt** (oturumsuz) — telefon doğrula, bilgilendirme, geçici parola | — | `public/invitations/{token}` (istek 23) | R (sahte servis) |
| `/s/{slug}/ayarlar/ozel-alanlar` | **Özel alanlar** — bölüm/kişi alan tanımları, KVKK kategorisi, rol görünürlüğü, arşiv (YAP-10) | `modules.manage` | `custom-fields` (istek 24) | R (sahte servis) |
| `/s/{slug}/iceri-aktar` | **İçeri aktarım** — sekmeler: bölümler (xlsx), araçlar ve açılış bakiyeleri (csv, mutabakat); aktarım geçmişi + geri alma (YAP-06) | `units.manage` | `imports/units`, istek 25 | R (sahte servis) |
| `/s/{slug}/kurulum` | **Kurulum ve canlıya geçiş** — adımlar, finans modu (Mod P), kontrol listesi, canlıya al (YAP-01) | `modules.manage` | `setup` (istek 26) | R (sahte servis) |
| `/s/{slug}/borclular` | **Borçlular** — yaşlandırma (blok × 0–30/31–60/61–90/90+), takip sütunu (plan, ihtarname), toplu hatırlatma (FIN-12) | `finance.read` | `debtors`, istek 29 | R (sahte servis) |
| `/s/{slug}/cari/{id}` | **Cari hesap → Borç takibi** — hatırlatma/arama/not, ihtarname gönderim ve tebliğ, ödeme planı, zaman çizelgesi | `finance.read` / `finance.payment.record` | istek 29, 30 | R (sahte servis) |
| `/s/{slug}/odeme-planlari` | **Ödeme planları** — durum sayıları, liste, taksitler, iptal (FIN-12) | `finance.read` | istek 30 | R (sahte servis) |
| `/s/{slug}/ek-ucretler` | **Dönem dışı ücretler** — elle ücret, kaynak bazında yansıma, iptal (FIN-06) | `finance.charge.post` | istek 31 | R (sahte servis) |
| `/s/{slug}/donem-kapanisi` | **Dönem kapanışı** — kontrol listesi, gerekçeli istisna, kapanışta, kilit (iki kişi), süreli açma (FIN-13) | `finance.read` / `finance.charge.post` | istek 27 | R (sahte servis) |
| `/s/{slug}/muhasebe-aktarimi` | **Muhasebe aktarımı** — fiş önizleme, dosya üret ve kilitle, hesap kodu eşlemesi, geçmiş (FIN-14) | `finance.charge.post` | istek 32 | R (sahte servis) |
| `/s/{slug}/ayarlar/finans` | **Finans ayarları** — hatırlatma kademeleri, kıst, eşikler; yürürlük dönemli sürüm; karar bekleyenler (FIN-16) | `finance.charge.post` | istek 33 | R (sahte servis) |
| `/s/{slug}/kasa/{id}` | **Kasa ekstresi → Gün sonu sayımı** (yalnız kasa hesabı) (FIN-11) | `finance.cash.manage` | istek 28 | R (sahte servis) |
| `/s/{slug}/tahakkuk` | **Tahakkuk → Fark raporu** — önceki döneme göre eşik üstü değişen hesaplar (FIN-05) | `finance.read` | istek 34 | R (sahte servis) |
| `/s/{slug}/personel` | **Personel** — bordro sicil no; ayrılışta ileri vardiya / bekleyen izin uyarısı (IK-01) | `staff.manage` | `staff`, istek 35 | R (sahte servis) |
| `/s/{slug}/vardiya` | **Vardiya planı** — şablonlar; personel × gün ızgarası, çakışma (çakışan vardiya, izin, 11 saat dinlenme), kopyala, yayınla (IK-02) | `staff.manage` | istek 36 | R (sahte servis) |
| `/s/{slug}/izinler` | **İzinler** — kaydet, onayla/reddet/iptal, yıllık kullanım (IK-03) | `staff.manage` | istek 37 | R (sahte servis) |
| `/s/{slug}/puantaj` | **Puantaj** — günlük (plandan; istisna düzelt; kesinleştir) ve aylık aktarım (sicil no ile dosya, kilit) (IK-04/05) | `staff.manage` | istek 38, 39 | R (sahte servis) |
| `/s/{slug}/guvenlik?sekme=masa` | **Kapı ekranı** — davet koduyla giriş, habersiz ziyaretçi (bilgi / sakin onayı, zaman aşımında gerekçeli karar), plaka sorgu + giriş/çıkış + ihlal, uzun bekleyen kargolar (GUV-01/03/04/05) | `security.visitors` | istek 41–44 | R (sahte servis) |
| `/s/{slug}/guvenlik?sekme=nobet` | **Nöbet defteri** — not/olay/devir, ek not, devralma onayı (GUV-06) | `security.incidents` | istek 45 | R (sahte servis) |
| `/s/{slug}/guvenlik?sekme=devriye` | **Devriye (görevli)** — tur başlat, nokta kodu okut, bitir (GUV-09) | `security.incidents` | istek 46 | R (sahte servis) |
| `/s/{slug}/ayarlar/guvenlik` | **Güvenlik ayarları** — kapılar, habersiz ziyaretçi yöntemi ve kapı istisnası, kargo teslimi, saklama, misafir parkı (GUV-08) | `modules.manage` | istek 40 | R (sahte servis) |
| `/s/{slug}/devriye` | **Devriye (yönetim)** — takvim ve sapma raporu, kontrol noktaları + QR etiket, tur planları (GUV-09) | `modules.manage` | istek 46 | R (sahte servis) |
| `/s/{slug}/talepler` (+ ayrıntı) | **Talepler** — SLA rozeti; ayrıntıda SLA, birleştirme önerisi/ana olay, iç notlar, hazır yanıt, sakin puanı, ücretli hizmet teklifi (HIZ-01..04) | `requests.read` / `.assign` | istek 47–51 | R (sahte servis) |
| `/s/{slug}/talepler/ayarlar` | **Talep ayarları** — kategori × öncelik SLA, çalışma takvimi, hazır yanıtlar, hizmet tarifesi (HIZ-03/04) | `requests.assign` | istek 47, 48, 51 | R (sahte servis) |
| `/s/{slug}/talepler/ana-olaylar` | **Ana olaylar** — bağlı talepler, çözülünce hepsi kapanır (HIZ-02) | `requests.assign` | istek 49 | R (sahte servis) |
| `/s/{slug}/tadilat-tasinma` | **Tadilat ve taşınma** — kurallar, onay/ret, kontrol listesiyle tamamlama, depozito (HIZ-05) | `requests.assign` | istek 52 | R (sahte servis) |
| `/s/{slug}/anahtarlar` | **Anahtar ve emanet** — anahtar/kart/kumanda teslim-iade, gecikenler; sakin emanet anahtarı yetkili kişiye (OPS-01) | `requests.assign` / `visitors` | istek 53 | R (sahte servis) |
| `/s/{slug}/denetimler` | **Denetim listeleri** — şablon, denetim, skor, olumsuz maddeden talep (OPS-03) | `requests.assign` | istek 55 | R (sahte servis) |
| `/s/{slug}/sigorta` | **Sigorta ve hasar** — poliçe, bitiş uyarısı, hasar dosyası, tazminat (OPS-04) | `expenses.read` | istek 56 | R (sahte servis) |
| `/s/{slug}/sayaclar` | **Sayaçlar** — sayaç kaydı, dönem okuması, fotoğraf, anormal tüketim onayı (OPS-05) | `units.manage` | istek 57 | R (sahte servis) |
| `/s/{slug}/gorevler` | **Rutin görevler** — günlük görev listesi, fotoğraflı tamamlama, şablonlar, 7 günlük rapor (OPS-06) | `requests.read` | istek 58 | R (sahte servis) |
| `/s/{slug}/rezervasyon` | **Rezervasyon** — günlük liste, kodla giriş doğrulama, onay, sakin adına rezervasyon, bekleme listesi, kullanım raporu (REZ-02/03) | `requests.assign` / `security.visitors` | istek 60, 61 | R (sahte servis) |
| `/s/{slug}/rezervasyon/alanlar` | **Rezervasyon alanları ve kuralları** — saat, kapasite, ücret, kanal, onay, doğrulama, bekleme listesi, no-show (REZ-01) | `modules.manage` | istek 59 | R (sahte servis) |
| `/s/{slug}/satin-alma` | **Satın alma** — talepler, siparişler, tedarikçi faturaları, ödenecekler, ayarlar (SAT-01..05) | `expenses.read` | istek 63–67 | R (sahte servis) |
| `/s/{slug}/satin-alma/{id}` | **Satın alma talebi** — bütçe, teklif karşılaştırma, tedarikçi linki, istisna, onay, sipariş (SAT-01..03) | `expenses.read` | istek 64 | R (sahte servis) |
| `/s/{slug}/satin-alma/siparis/{id}` | **Sipariş** — sipariş formu, mal/hizmet kabul, fatura üçlü eşleşme (SAT-03..05) | `expenses.read` | istek 65, 66 | R (sahte servis) |
| `/s/{slug}/tedarikciler` | **Tedarikçiler** — tedarikçi kartı, maskeli IBAN, puan (SAT-06) | `expenses.read` | istek 62 | R (sahte servis) |
| `/s/{slug}/sozlesmeler/{id}` | **Sözleşme ayrıntısı** — KPI ve ceza kuralları, aylık hizmet karnesi, ceza kesintisi onayı, endeksli artış (SAT-06) | `contracts.manage` | istek 68–70 | R (sahte servis) |
| `/s/{slug}/dokumanlar` | Doküman | — | — | **Y** |

## 4. Sakin ekranı — `/sakin/{slug}/...`

Mobil öncelikli (telefon genişliği), 760px üstünde masaüstü düzeni. Üstte **Çıkış** ve (personel
önizliyorsa) **Panele dön**.

| Yol | Ekran | Durum |
|---|---|---|
| `/sakin/{slug}` | Ana sayfa — bakiye, son hareketler, duyurular, açık talepler | R |
| `/sakin/{slug}/ekstre` | Kendi cari ekstresi | R |
| `/sakin/{slug}/duyurular` | Duyurular | R |
| `/sakin/{slug}/talepler` | Talepler + yeni talep | R |
| `/sakin/{slug}/giderler` | **Sitenin gider dökümü + fatura görüntüsü** — şeffaflık vaadinin karşılığı | **Y** |
| `/sakin/{slug}/hane` | **Hane üyeleri** — davet (bağlantı kopyala), yetkiler, bitir; en fazla 6 (YAP-04) | R (sahte servis, istek 20) |
| `/sakin/{slug}/borcum` | **Borcum → Ödeme planım** — taksitler ve durumları (FIN-15) | R (sahte servis, istek 30) |
| `/sakin/{slug}/ziyaretci` | **Ziyaretçiler** — ön davet (kod + QR), kapıda bekleyen onayı, kargo teslim yetkilisi (GUV-02/03/05) | R (sahte servis, istek 41, 42, 44) |
| `/sakin/{slug}/tadilat` | **Tadilat ve taşınma** — kurallar, başvuru, durum (HIZ-05) | R (sahte servis, istek 52) |
| `/sakin/{slug}/emanet` | **Emanet ve sayaçlar** — anahtar emaneti ve yetkililer, sayaç okumaları ve tüketim (OPS-01/05) | R (sahte servis, istek 53, 57) |
| `/teklif/{token}` | **Tedarikçi teklif formu** — oturumsuz, tek kullanımlık link (SAT-02) | R (sahte servis, istek 64) |
| `/sakin/{slug}/rezervasyon` | **Rezervasyon** — alan ve saat seçimi, bekleme listesi ve teklif, kod/QR, iptal (REZ-02) | R (sahte servis, istek 60) |
| `/sakin/{slug}/araclar` | **Araçlarım** — plaka ekle/kaldır, sınır ve onay bilgisi (YAP-05) | R (sahte servis, istek 22) |

## 5. Platform paneli — `/yonetim/...`

Koyu kenar çubuğu — müşteri panelinden bir bakışta ayrılsın (yanlış panelde olduğunu fark
etmemek yanlış müşterinin verisine dokunmakla biter).

| Yol | Ekran | Durum |
|---|---|---|
| `/yonetim` | Genel bakış — müşteri, site, bölüm sayısı, tavan aşımı; müşteri tablosu; site tablosu (kullanım çubuğu, satır içinde plan değiştir) | R |
| `/yonetim/musteri-ekle` | Müşteri + ilk yetkili; kayıt sonrası **geçici parola bir kez gösterilir** | R |
| `/yonetim/site-ac` | Site aç — açılışta ne kurulacağı bilgi kutusunda yazılı | R |
| `/yonetim/endeksler` | **Endeks değerleri** — TÜFE/ÜFE aylık giriş, tüm tesislerde sözleşme artışı (SAT-06, istek 70) | R (sahte servis) |

## 6. Ekran örnekleri

Referans uygulamanın ekran görüntüleri Burhan'da. Birebir kopyalamak şart değil ama bilgi
mimarisi (hangi bilgi nerede, hangi sırada) korunmalı.
