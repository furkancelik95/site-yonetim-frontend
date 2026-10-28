# Servis istekleri

Frontend'in ekranını yaptığı ama backend'de henüz olmayan uçlar. Her dosya backend reposundaki
*Servis isteği* şablonuyla aynı biçimde; issue açarken içeriği olduğu gibi yapıştırılabilir.

Servis gelene kadar ekran bu sözleşmeyle **sahte servisle (MSW, `src/mocks/handlers.ts`)** çalışır;
sahte servisle çalışan ekran, açıklamasında istek numarasını belirtir. Servis gelince:

1. `openapi.json` güncellenir, `npm run api:types`
2. İlgili handler `src/mocks/handlers.ts`'den silinir
3. Ekranda elle yazılmış tip üretilmiş tiple değiştirilir

Kaynak: Apsiyon yönetici paneli karşılaştırması — eksik listesinin dış sağlayıcı gerektirmeyen paketleri (01–05 ilk paket, 06–08 finans, 09–11 operasyon, 12–13 kullanıcı, 14–18 yönetim paketi); 19–26 Yazılım Dokümanı **Yapı, Kişiler ve Kayıt paketi** (YAP-01..YAP-10; YAP-09 şablon kopyalama/devir ertelendi).

01–18, 19–26 (yapı, kişiler ve kayıt — backend #70), 35–39 (insan kaynakları — backend #68), 40–46 (güvenlik ve devriye — backend #69) ve 47–52 (hizmetler — backend #71) backend'de (26.10.2026). **Kalanı sahte serviste** (27–34 finans, 53–58 operasyon, 59–61 rezervasyon, 62–67 satın alma, 68–70 sözleşme performansı, 71–74 iletişim ve acil durum, 75–77 genel kurul, 78–81 raporlar/belgeler/KVKK, 82–84 platform destek: 25.10.2026) — ortak kararı bekleyen parçalar dışarıda bırakıldı: finans sorumlusu (K22), borcun yeni malike devri (K10), SMS/e-posta gönderimi (K5), KiviERP modu (A-01), belge yükleme.

| # | Konu | Uç nokta | Ekran | Durum |
|---|---|---|---|---|
| [01](01-borcsuzluk-belgesi.md) | Borçsuzluk belgesi | `POST …/accounts/{id}/clearance-certificates`, `GET …/clearance-certificates/{id}` | Cari ekstre → Hesap işlemleri; `/belge/borcsuzluk/:id` | **Backend'de** (#24) |
| [02](02-devir-bakiye.md) | Devir bakiye | `POST …/accounts/{id}/opening-balance` | Cari ekstre → Hesap işlemleri | **Backend'de** (#25) |
| [03](03-iade.md) | İade (alacak bakiyenin geri ödenmesi) | `POST …/refunds` | Cari ekstre → Hesap işlemleri | **Backend'de** (#26) — `Idempotency-Key` zorunlu |
| [04](04-otomatik-tahakkuk.md) | Otomatik aylık tahakkuk | `GET/PUT …/charge-schedule` | Tahakkuk sayfası | **Backend'de** (#27) — `last_run.run_id` atlananda null |
| [05](05-sakin-odeme-bilgisi.md) | Sakine sitenin IBAN/banka bilgisi | `GET …/resident/home` alanı | Sakin ana sayfası | **Backend'de** (#28) — ekran var (sakin ana sayfası → Ödeme bilgileri) |
| [06](06-banka-hareketi-aktarimi.md) | Banka hareketi aktarımı ve eşleştirme | `POST …/bank-imports`, `POST …/bank-imports/{id}/confirm` | `/banka-aktarim` | **Backend'de** (#35) |
| [07](07-tekrarlanan-gider.md) | Tekrarlanan gider | `GET/POST/PATCH/DELETE …/recurring-expenses` | `/giderler/tekrarlanan` | **Backend'de** (#36) |
| [08](08-toplu-tahsilat.md) | Toplu tahsilat ucu (isteğe bağlı) | `POST …/payments/batch` | `/tahsilat/toplu` | Gerekmiyor; ekran mevcut `POST …/payments` ile çalışıyor |
| [09](09-olay-kaydi.md) | Güvenlik olay kaydı | `GET/POST …/incidents`, `POST …/incidents/{id}/close` | Güvenlik → Olaylar | **Backend'de** (#37) — izin `security.incidents` |
| [10](10-kayip-esya.md) | Kayıp eşya | `GET/POST …/lost-items`, `POST …/lost-items/{id}/return` | Güvenlik → Kayıp eşya | **Backend'de** (#38) — izin `security.incidents` |
| [11](11-talep-departmanlari.md) | Talep departmanları | `…/departments`, `POST …/requests/{id}/department`, talep yanıtına alan | Talepler, pano, talep ayrıntısı | **Backend'de** (#39) |
| [12](12-site-kullanicilari.md) | Site kullanıcıları ve roller | `GET …/roles`, `GET/POST …/members`, `PATCH …/members/{id}` | `/kullanicilar` | **Backend'de** (#40); çoklu rol, siteye özel rol, kapsam ve süre (P18/K20): `POST/PATCH …/roles`, `…/members/{id}/role-assignments`, `GET …/role-assignments`, `GET /permissions` — ekranlar `/kullanicilar`, `/roller` (P16a) |
| [13](13-sakin-kayit-basvurusu.md) | Sakinin kendini kaydetmesi + onay | `…/registration-link`, `…/registrations`, `/public/registration/{code}` | `/kayit/:code`, `/kayit-basvurulari` | **Backend'de** (#41) — onayda sakine **telefonla** giriş hesabı açılır (SMS koduyla girer; P16c, geçici parola yok) |
| [14](14-toplantilar.md) | Toplantılar ve genel kurul | `…/meetings`, `…/meetings/{id}/decisions`, `…/cancel` | `/toplantilar` | **Backend'de** (#42) — modül `general-assembly` |
| [15](15-anket.md) | Anket | `…/polls`, `…/resident/polls/{id}/vote` | `/anketler`, sakin Duyurular | **Backend'de** (#43) — modül `surveys` |
| [16](16-sozlesmeler.md) | Hizmet sözleşmeleri | `GET/POST/PATCH …/contracts` | `/sozlesmeler` | **Backend'de** (#44) |
| [17](17-demirbas-stok.md) | Demirbaş ve stok | `…/assets`, `…/stock-items`, `…/stock-items/{id}/moves` | `/demirbas` | **Backend'de** (#45) |
| [18](18-personel.md) | Site personeli | `GET/POST/PATCH …/staff` | `/personel` | **Backend'de** (#46) — modül `staff` |
| [19](19-yapi-tanimlari.md) | Yapı tanımları: ortak alanlar, bölüm tipi, yürürlük tarihli öznitelik, toplu düzenleme, yapı özeti | `…/common-areas`, `POST/PATCH …/unit-types`, `PATCH …/units/{id}/attributes`, `…/attribute-history`, `POST …/units/bulk-update`, `GET …/structure/summary` | `/yapi`, `/daireler`, bölüm kartı | **Backend'de** (#70) |
| [20](20-bolum-360.md) | Bölüm 360°: özet, maskeli iletişim + görüntüleme kaydı, `requests/visitors?unit_id`, hane üyeleri | `GET …/units/{id}/overview`, `POST …/people/{id}/contact-views`, `…/units/{id}/household`, `…/resident/household` | `/daireler/{id}`, `/kisiler`, sakin `/hane` | **Backend'de** (#70) |
| [21](21-kisiler.md) | Mükerrer kişi önerisi ve birleştirme, satış/veraset | `GET …/people/duplicates`, `POST …/people/merge`, `POST …/units/{id}/ownership-transfer` | `/kisiler`, bölüm kartı | **Backend'de** (#70) |
| [22](22-araclar.md) | Araçlar ve sakin "Araçlarım" | `…/settings/vehicles`, `…/vehicles`, `…/resident/vehicles` | `/araclar`, bölüm kartı, sakin `/araclar` | **Backend'de** (#70) |
| [23](23-kayit-yontemleri-davetler.md) | Kayıt yöntemleri, davetler, QR afiş önseçimi, herkese açık formda blok/bölüm | `…/settings/registration`, `…/invitations`, `/public/invitations/{token}`, `/public/registration/{code}` ek alanlar | `/kayit-basvurulari`, `/kayit-afisi`, `/davet/:token`, `/kayit/:code` | **Backend'de** (#70) |
| [24](24-ozel-alanlar.md) | Özel alanlar (bölüm/kişi) | `…/custom-fields`, `…/units|people/{id}/custom-values` | `/ayarlar/ozel-alanlar`, bölüm kartı, kişi formu | **Backend'de** (#70) |
| [25](25-aktarim-gecmisi.md) | Aktarım geçmişi, araç ve açılış bakiyesi aktarımı (mutabakat), geri alma | `GET …/imports`, `POST …/imports/vehicles|opening-balances`, `…/imports/{id}/confirm|rollback` | `/iceri-aktar` | **Backend'de** (#70) |
| [26](26-kurulum-canliya-gecis.md) | Kurulum durumu ve canlıya geçiş kontrol listesi | `GET …/setup`, `POST …/setup/go-live` | `/kurulum` | **Backend'de** (#70) |
| [27](27-donem-kapanisi.md) | Dönem kapanışı: kontrol listesi, kapanışta, kilit (iki kişi), süreli açma | `…/fiscal-periods`, `…/close-checklist`, `start-close`, `lock`, `reopen`, `unlock-requests` | `/donem-kapanisi` | Sahte servis — kilidin yazmaları engellemesi backend'de |
| [28](28-kasa-gun-sonu.md) | Kasa gün sonu sayımı | `GET …/cash-accounts/{id}/days`, `POST …/days/close` | `/kasa/{id}` | Sahte servis |
| [29](29-borc-takibi.md) | Borç takibi: yaşlandırma, hatırlatma/arama kaydı, ihtarname gönderim ve tebliğ | `…/receivables/aging`, `…/collection-status`, `…/collection-timeline`, `…/collection-actions`, `…/demand-letters` | `/borclular`, `/cari/{id}` | Sahte servis — gönderim K5 |
| [30](30-odeme-plani.md) | Ödeme planı (sakin dahil) | `…/payment-plans`, `…/accounts/{id}/payment-plans`, `…/resident/payment-plans` | `/odeme-planlari`, `/cari/{id}`, sakin Borcum | Sahte servis — deftere taksit yazımı backend'de |
| [31](31-donem-disi-ucretler.md) | Dönem dışı ücretler | `…/settings/ad-hoc-charges`, `…/ad-hoc-charges` | `/ek-ucretler` | Sahte servis — cariye yazmıyor |
| [32](32-muhasebe-aktarimi.md) | Muhasebe aktarımı: hesap kodu eşlemesi, fiş dosyası, kilit | `…/accounting/mappings`, `…/accounting/exports(/preview)` | `/muhasebe-aktarimi` | Sahte servis — biçim K7 |
| [33](33-finans-parametreleri.md) | Finans parametreleri (versiyonlu) | `…/finance-parameters`, `…/finance-parameters/versions` | `/ayarlar/finans` | Sahte servis — K1/K23/K24/K25 salt bilgi |
| [34](34-tahakkuk-fark-raporu.md) | Tahakkuk fark raporu | `GET …/charge-runs/preview/diff` | `/tahakkuk` | Sahte servis |
| [35](35-personel-karti-sicil.md) | Personel kartına bordro sicil no; ayrılışta açık işler | `payroll_no` alanı, `GET …/staff/{id}/open-items` | `/personel` | **Backend'de** (backend #68) — K29: kart giriş hesabına bağlanır, ayrılınca erişim kapanır |
| [36](36-vardiya-plani.md) | Vardiya şablonları ve haftalık plan (çakışma, kopyala, yayınla) | `…/shift-templates`, `…/shift-plans(/assignments, /copy-week, /publish)` | `/vardiya` | **Backend'de** (backend #68) — Vardiyam (`/me/shifts`) dahil |
| [37](37-izinler.md) | İzin kaydı ve onayı | `…/leave-requests`, `…/leave-balances` | `/izinler` | **Backend'de** (backend #68) — onay kuralı varsa onay mekanizması; kendi talebi `/me/leave-requests` |
| [38](38-puantaj.md) | Günlük puantaj ve istisna düzeltme | `…/timesheets`, `…/timesheets/finalize` | `/puantaj` | **Backend'de** (backend #68) — QR/konumlu giriş-çıkış (`/me/attendance-events`, `/attendance-settings`) |
| [39](39-puantaj-aktarimi.md) | Puantaj aktarımı (dosya) | `…/timesheet-exports(/preview)` | `/puantaj?sekme=aktarim` | **Backend'de** (backend #68) — dosya backend'den (CSV); Mod K A-01 sonrası |
| [40](40-kapilar-guvenlik-ayarlari.md) | Kapılar ve güvenlik ayarları | `…/gates`, `…/settings/security` | `/ayarlar/guvenlik` | **Backend'de** (#69) — saklama 6 ay site ayarı, gece anonimleştirme varsayılan kapalı (K8) |
| [41](41-ziyaretci-on-davet.md) | Ziyaretçi ön daveti (sakin) ve kapıda kodla giriş | `…/resident/visitor-invites`, `…/visitor-invites/expected`, `…/visitor-invites/check-in` | sakin `/ziyaretci`, Güvenlik › Kapı ekranı | **Backend'de** (#69) — kod yalnız oluşturulunca gösterilir (özeti saklanır); `…/new-code` |
| [42](42-sakin-onayi.md) | Habersiz ziyaretçide sakin onayı, zaman aşımı, görevli kararı | `…/visit-requests`, `…/resident/visit-approvals` | Kapı ekranı, sakin `/ziyaretci` | **Backend'de** (#69) — bildirim uygulama içi (K5) |
| [43](43-plaka-otopark-ihlali.md) | Plaka sorgu, giriş-çıkış kaydı, otopark ihlali | `…/plates/lookup`, `…/gate-logs`, `…/parking-violations` | Kapı ekranı, Araçlar › Park yerleri | **Backend'de** (#69) — park yeri/tahsis K30 eklendi; kayıtlı araç sonucu P02 ile |
| [44](44-kargo-yetkili-uzun-bekleyen.md) | Kargo teslim yetkilisi, uzun bekleyen kargolar | `…/resident/parcel-delegates`, `…/units/{id}/parcel-delegates`, `…/packages/long-waiting` | sakin `/ziyaretci`, Güvenlik | **Backend'de** (#69) — fotoğraf belge modülüyle |
| [45](45-nobet-defteri.md) | Nöbet defteri ve vardiya devri | `…/shift-log`, `…/addenda`, `…/acknowledge` | Güvenlik › Nöbet defteri | **Backend'de** (#69) |
| [46](46-devriye.md) | Devriye: noktalar (QR etiket), tur planı, yürütme, sapma raporu | `…/patrol-points`, `…/patrol-plans`, `…/patrol-schedule`, `…/patrol-runs` | `/devriye`, Güvenlik › Devriye | **Backend'de** (#69) — NFC mobilde |
| [47](47-sla-calisma-takvimi.md) | Talep SLA'sı ve çalışma takvimi | `…/settings/requests`, `…/request-categories`; SLA `RequestOut.sla` alanında | `/talepler`, `/talepler/ayarlar` | **Backend'de** (#71) — kategoriler site tanımlı (D-26) |
| [48](48-hazir-yanit-ic-not.md) | Hazır yanıt şablonları ve iç not | `…/reply-templates`, `…/requests/{id}/internal-notes` | talep ayrıntısı, `/talepler/ayarlar` | **Backend'de** (#71) — K26: iç not sakin kanalında hiç dönmez |
| [49](49-ana-olay-birlestirme.md) | Ana olay ve birleştirme önerisi | `…/outages(/links, /unlink, /resolve)`, `…/requests/{id}/merge-suggestions` | talep ayrıntısı, `/talepler/ana-olaylar` | **Backend'de** (#71) — liste sayfalı |
| [50](50-kapanis-onayi-puan.md) | Sakin kapanış onayı ve puan; talepte yer seçimi | `…/resident/requests/{id}/confirm`, `…/resident/requests/{id}/cancel`; ekler `RequestOut` alanlarında | sakin Taleplerim | **Backend'de** (#71) — K18 akışı |
| [51](51-ucretli-hizmet.md) | Ücretli hizmet: tarife, teklif, sakin onayı | `…/service-tariffs`, `…/requests/{id}/quotes`, `…/resident/quotes/{id}/decision`, `…/quotes/{id}/complete` | talep ayrıntısı, sakin Taleplerim | **Backend'de** (#71) — tarife onay kuralına bağlı (202) |
| [52](52-tadilat-tasinma.md) | Tadilat ve taşınma izinleri | `…/settings/permits`, `…/permits`, `…/resident/permits` | `/tadilat-tasinma`, sakin `/tadilat` | **Backend'de** (#71) — onay kuralına bağlı (202), liste sayfalı |
| [53](53-anahtar-emanet.md) | Anahtar, kart ve emanet anahtar | `…/keys`, `…/key-loans`, `…/deposited-keys`, `…/resident/deposited-keys` | `/anahtarlar`, sakin `/emanet` | Sahte servis |
| [54](54-stok-sayimi.md) | Stok sayımı | `…/stock-counts` | `/demirbas?sekme=sayim` | Sahte servis — K21 |
| [55](55-denetim-listeleri.md) | Denetim (kontrol) listeleri | `…/checklist-templates`, `…/inspections` | `/denetimler` | Sahte servis |
| [56](56-sigorta-hasar.md) | Sigorta poliçeleri ve hasar dosyaları | `…/insurance-policies`, `…/insurance-claims` | `/sigorta` | Sahte servis |
| [57](57-sayac-okuma.md) | Sayaçlar ve okuma | `…/meters`, `…/meter-readings`, `…/resident/meter-readings` | `/sayaclar`, sakin `/emanet` | Sahte servis — K23 |
| [58](58-rutin-gorevler.md) | Görevli rutin görevleri | `…/task-templates`, `…/tasks`, `…/tasks/report` | `/gorevler` | Sahte servis — K29 |
| [59](59-rezervasyon-alan-kurallari.md) | Rezervasyon alanları ve kuralları | `…/reservable-areas`, `…/reservable-areas/{id}/rules` | `/rezervasyon/alanlar` | Sahte servis — K21 |
| [60](60-rezervasyon.md) | Rezervasyon: sakin, sakin adına, iptal, bekleme listesi | `…/reservable-areas/{id}/availability`, `…/reservations`, `…/resident/reservations`, `…/resident/waitlist/{id}/accept` | `/rezervasyon`, sakin `/rezervasyon` | Sahte servis — K5 |
| [61](61-rezervasyon-takvim-dogrulama.md) | Günlük liste, kullanım doğrulama, no-show, kullanım raporu | `…/reservations/check-in-code`, `…/reservations/{id}/check-in`, `…/reservations/report` | `/rezervasyon` | Sahte servis |
| [62](62-tedarikci-karti.md) | Tedarikçi kartı | `…/vendors` | `/tedarikciler` | Sahte servis |
| [63](63-satin-alma-ayar-butce.md) | Satın alma ayarları ve bütçe kontrolü | `…/purchase-settings`, `…/purchase-budget` | `/satin-alma?sekme=ayar`, talep formu | Sahte servis |
| [64](64-satin-alma-talep-teklif-onay.md) | Satın alma talebi, teklif, tedarikçi linki, onay | `…/purchase-requests`, `…/quotes`, `…/quote-links`, `/public/v1/quote-links/{token}`, `…/select-quote`, `…/decide` | `/satin-alma`, `/satin-alma/{id}`, `/teklif/{token}` | Sahte servis — onay modülüne bağlanacak |
| [65](65-siparis-kabul.md) | Sipariş ve mal/hizmet kabul | `…/purchase-orders`, `…/purchase-orders/{id}/receipts` | `/satin-alma/siparis/{id}` | Sahte servis |
| [66](66-tedarikci-faturasi-uclu-eslesme.md) | Tedarikçi faturası ve üçlü eşleşme | `…/vendor-invoices`, `…/vendor-invoices/{id}/decide` | sipariş ayrıntısı, `/satin-alma?sekme=fatura` | Sahte servis |
| [67](67-odenecekler.md) | Ödenecekler ve "ödendi" | `…/payables`, `…/vendor-invoices/{id}/mark-paid` | `/satin-alma?sekme=odenecek` | Sahte servis |
| [68](68-sozlesme-kpi-ceza-kurallari.md) | Sözleşme performans tanımları: KPI, ceza, artış kuralı | `…/contracts/{id}/performance` | `/sozlesmeler/{id}` | Sahte servis |
| [69](69-aylik-hizmet-karnesi.md) | Aylık hizmet karnesi ve ceza kesintisi | `…/contracts/{id}/scorecards/{period}` (+`/finalize`, `/penalty`) | `/sozlesmeler/{id}?sekme=karne` | Sahte servis — onay türü "Ceza kesintisi" |
| [70](70-endeksli-artis.md) | Endeksli fiyat artışı ve endeks değerleri | `…/contracts/{id}/escalation`, `/api/v1/platform/index-values` | `/sozlesmeler/{id}?sekme=artis`, `/yonetim/endeksler` | Sahte servis |
| [71](71-okuma-onayi-zamanlama.md) | Duyuruda okuma onayı, okuma raporu, zamanlama, sessiz saatler | `…/announcements` (+alanlar), `…/scheduled-announcements`, `…/communication-settings`, `…/read-report`, `…/resident/announcements/{id}/acknowledge` | `/duyurular`, `/duyurular/{id}/okuma-raporu`, sakin ana sayfa ve duyurular | Sahte servis — K5 |
| [72](72-bildirim-sablonlari.md) | Bildirim ve duyuru şablonları | `…/notification-templates` | `/bildirim-sablonlari` | Sahte servis |
| [73](73-acil-durum-modu.md) | Acil durum modu, pano, toplanma yoklaması | `…/emergencies`, `…/emergencies/active`, `…/muster-checks`, `…/end`, `…/resident/emergency` | `/acil-durum`, sakin `/acil-durum` | Sahte servis — K5, A-04 |
| [74](74-acil-bilgi-karti.md) | Acil bilgi kartı (çevrimdışı) | `…/emergency-info-card`, `…/resident/emergency-info-card` | `/acil-durum?sekme=kart`, sakin `/acil-durum` | Sahte servis |
| [75](75-genel-kurul-hazirlik-cagri.md) | Genel kurul hazırlığı: format, karar türü, hukuki uyarı, çağrı | `…/meetings/{id}/assembly`, `…/prep`, `…/legal-ack`, `…/invitation`, `…/assembly-settings` | `/toplantilar/{id}/genel-kurul` | Sahte servis |
| [76](76-hazirun-nisap-oylama.md) | Hazirun, fiziki vekâlet, nisap, salonda oylama (kişi + arsa payı) | `…/assembly/attendance`, `…/items/{itemId}/open\|close`, `…/ballots` | `?sekme=hazirun` | Sahte servis — e-oylama/dijital vekâlet hukuk + K5 |
| [77](77-tutanak-karar-defteri.md) | Tutanak ve karar defteri | `…/assembly/minutes`, `…/finalize`, `…/signed`, `…/decision-book` | `?sekme=tutanak`, `/karar-defteri` | Sahte servis |
| [78](78-belge-arsivi.md) | Belge arşivi | `…/documents`, `…/versions/{v}/download`, `…/access-log`, `…/resident/documents` | `/dokumanlar`, sakin `/belgeler` | **Backend'de** (#67) — liste sayfalı, indirme dosya yanıtı; K8: `retention_years` bilgi amaçlı |
| [79](79-rapor-katalogu-sla.md) | Rapor kataloğu, metrik sözlüğü, talep/SLA raporu | `…/reports/catalog`, `…/reports/requests-sla` | `/rapor-katalogu` | Sahte servis |
| [80](80-kvkk-basvuru-aydinlatma.md) | KVKK başvurusu ve aydınlatma sürümleri | `…/privacy-requests`, `…/resident/privacy-requests`, `…/privacy-notices` | `/kvkk`, sakin `/kvkk` | Sahte servis — K8, hukuk 2.1 |
| [81](81-denetim-kurulu-paketi.md) | Denetim kurulu paketi | `…/audit-packages`, `…/report` | `/denetim-paketi` | Sahte servis — planlı rapor K5 |
| [82](82-destek-biletleri.md) | Destek biletleri | `…/support-tickets`, `/api/v1/platform/support-tickets` | `/destek`, `/yonetim/destek` | Sahte servis — paket SLA (soru 1.9) |
| [83](83-bilgi-bankasi.md) | Bilgi bankası ve yardım | `/api/v1/knowledge-articles`, `/api/v1/platform/knowledge-articles` | `/yardim`, `/yonetim/bilgi-bankasi` | Sahte servis |
| [84](84-destek-oturumu.md) | Destek oturumu (müşteri onaylı) | `/api/v1/platform/support-sessions`, `…/support-sessions` | `/destek?sekme=oturum`, `/yonetim/destek`, tüm ekranlarda bant | Sahte servis |

Yeni servis gerektirmeden yapılanlar (mevcut uçlarla):

- **Tahsilat makbuzu** (`/makbuz/:paymentId`) — `GET …/payments/{id}`. Numara yok (açık karar K15).
- **Talep panosu** (`/talepler/pano`) — `GET …/requests?status=` + `POST …/requests/{id}/status`.
- **İhtar yazısı** (`/belge/ihtar/:accountId`) — `GET …/accounts/{id}/statement` (bakiye ve en eski vade). Yazı kaydedilmez; metni hukukçuya gösterilmeli.
- **Hazirun listesi** (`/belge/hazirun`) — `GET …/units` sayfa sayfa (arsa payı, malik).
- **Toplu tahsilat** (`/tahsilat/toplu`) — `POST …/payments` satır satır, satır başına `Idempotency-Key`.

## P16c — kimlik ve bildirim gönderimi (servis isteği yok; Yazılım Dokümanı PLT-01/05/10, ILT-05, RAP-05)
**Backend'de** (#75): telefon + SMS koduyla giriş, iki adımlı doğrulama (QR, yedek kodlar),
parola sıfırlama, telefon değişikliği, hesap daveti (`/hesap-davet/:token`), SMS hesabı ve kota
(`/s/:slug/sms-hesabi`), sessiz saatler (istek 71'in `communication-settings` kısmı), teslim
kayıtları, planlı raporlar (rapor kataloğu), platform test gelen kutusu. Sağlayıcı K5'e kadar
test sağlayıcısı.
