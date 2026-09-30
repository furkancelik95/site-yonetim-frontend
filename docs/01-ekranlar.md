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
| `/s/{slug}/rezervasyon` | Sosyal tesis rezervasyonu | — | — | **Y** |
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

## 5. Platform paneli — `/yonetim/...`

Koyu kenar çubuğu — müşteri panelinden bir bakışta ayrılsın (yanlış panelde olduğunu fark
etmemek yanlış müşterinin verisine dokunmakla biter).

| Yol | Ekran | Durum |
|---|---|---|
| `/yonetim` | Genel bakış — müşteri, site, bölüm sayısı, tavan aşımı; müşteri tablosu; site tablosu (kullanım çubuğu, satır içinde plan değiştir) | R |
| `/yonetim/musteri-ekle` | Müşteri + ilk yetkili; kayıt sonrası **geçici parola bir kez gösterilir** | R |
| `/yonetim/site-ac` | Site aç — açılışta ne kurulacağı bilgi kutusunda yazılı | R |

## 6. Ekran örnekleri

Referans uygulamanın ekran görüntüleri Burhan'da. Birebir kopyalamak şart değil ama bilgi
mimarisi (hangi bilgi nerede, hangi sırada) korunmalı.
