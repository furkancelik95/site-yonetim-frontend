# Servis istekleri

Frontend'in ekranını yaptığı ama backend'de henüz olmayan uçlar. Her dosya backend reposundaki
*Servis isteği* şablonuyla aynı biçimde; issue açarken içeriği olduğu gibi yapıştırılabilir.

Servis gelene kadar ekran bu sözleşmeyle **sahte servisle (MSW, `src/mocks/handlers.ts`)** çalışır;
sahte servisle çalışan ekran, açıklamasında istek numarasını belirtir. Servis gelince:

1. `openapi.json` güncellenir, `npm run api:types`
2. İlgili handler `src/mocks/handlers.ts`'den silinir
3. Ekranda elle yazılmış tip üretilmiş tiple değiştirilir

Kaynak: Apsiyon yönetici paneli karşılaştırması — eksik listesinin dış sağlayıcı gerektirmeyen paketleri (01–05 ilk paket, 06–08 finans, 09–11 operasyon, 12–13 kullanıcı, 14–18 yönetim paketi); 19–26 Yazılım Dokümanı **Yapı, Kişiler ve Kayıt paketi** (YAP-01..YAP-10; YAP-09 şablon kopyalama/devir ertelendi).

01–18, 19–26 (yapı, kişiler ve kayıt — backend #70), 27–34 (finans Mod P — backend #74), 35–39 (insan kaynakları — backend #68), 40–46 (güvenlik ve devriye — backend #69), 47–52 (hizmetler — backend #71), 53–58 (operasyon ve teknik varlık, HIZ-06/07, K28 — backend #73), 59–61 (rezervasyon — backend #81), 62–67 (satın alma — backend #78), 68–70 (sözleşme performansı), 71–74 (iletişim ve acil durum — backend #77; K32 şeffaflık raporu dahil), 78 (belge arşivi) ve 79–81 (raporlar ve KVKK — backend #80) backend'de (28.10.2026). Finans motoru (P03b, 27.10.2026): 04, 33, 34 güncellendi; aidat kuralları, tahakkuk taslak/onay akışı, satır düzeltme ve yıllık bütçe–gerçekleşme ekranları doğrudan gerçek uçlarla yazıldı (sahte uç yok). **Kalanı sahte serviste** (75–77 genel kurul, 82–84 platform destek: 25.10.2026) — ortak kararı bekleyen parçalar dışarıda bırakıldı: finans sorumlusu (K22), borcun yeni malike devri (K10), SMS/e-posta gönderimi (K5), KiviERP modu (A-01), belge yükleme.

| # | Konu | Uç nokta | Ekran | Durum |
|---|---|---|---|---|
| [01](01-borcsuzluk-belgesi.md) | Borçsuzluk belgesi | `POST …/accounts/{id}/clearance-certificates`, `GET …/clearance-certificates/{id}` | Cari ekstre → Hesap işlemleri; `/belge/borcsuzluk/:id` | **Backend'de** (#24) |
| [02](02-devir-bakiye.md) | Devir bakiye | `POST …/accounts/{id}/opening-balance` | Cari ekstre → Hesap işlemleri | **Backend'de** (#25) |
| [03](03-iade.md) | İade (alacak bakiyenin geri ödenmesi) | `POST …/refunds` | Cari ekstre → Hesap işlemleri | **Backend'de** (#26) — `Idempotency-Key` zorunlu |
| [04](04-otomatik-tahakkuk.md) | Otomatik aylık tahakkuk | `GET/PUT …/charge-schedule` | Tahakkuk sayfası | **Backend'de (#79, P03b)** (ilk sürüm #27) — `due_days` kalktı: vade Finans ayarlarındaki `due_day`; onay kuralı varsa taslak `draft_lead_days` gün önce onaya gider; `last_run.status` `drafted` olabilir |
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
| [15](15-anket.md) | Anket | `…/polls`, `…/resident/polls/{id}/vote` | `/anketler`, sakin Duyurular | **Backend'de** (#43; K31 çoklu soru ve gizlilik #77) — modül `surveys` |
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
| [27](27-donem-kapanisi.md) | Dönem kapanışı: kontrol listesi, kapanışta, kilit (iki kişi), süreli açma | `…/fiscal-periods`, `…/close-checklist`, `start-close`, `lock`, `reopen`, `unlock-requests` | `/donem-kapanisi` | **Backend'de** (backend #74) — kilit tüm finans yazmalarında 409 `period_locked`; süreli açma "Dönem kilidi açma" onay kuralına bağlı |
| [28](28-kasa-gun-sonu.md) | Kasa gün sonu sayımı | `GET …/cash-accounts/{id}/days`, `POST …/days/close` | `/kasa/{id}` | **Backend'de** (backend #74) — fark "Kasa farkı" onay kuralına bağlı |
| [29](29-borc-takibi.md) | Borç takibi: yaşlandırma, hatırlatma/arama kaydı, ihtarname gönderim ve tebliğ | `…/receivables/aging`, `…/collection-status`, `…/collection-timeline`, `…/collection-actions`, `…/demand-letters` | `/borclular`, `/cari/{id}` | **Backend'de** (backend #74) — zaman çizelgesi sayfalı; gönderim K5 (yalnız kayıt); ihtarname onay kuralına bağlı |
| [30](30-odeme-plani.md) | Ödeme planı (sakin dahil) | `…/payment-plans`, `…/accounts/{id}/payment-plans`, `…/resident/payment-plans` | `/odeme-planlari`, `/cari/{id}`, sakin Borcum | **Backend'de** (backend #74) — plan deftere yazılır (kalemler kapanır, taksitler vadeli borç); liste sayfalı + `counts` |
| [31](31-donem-disi-ucretler.md) | Dönem dışı ücretler | `…/settings/ad-hoc-charges`, `…/ad-hoc-charges` | `/ek-ucretler` | **Backend'de** (backend #74) — cariye yazar; liste sayfalı; sonraki tahakkukta "ek kalemler" |
| [32](32-muhasebe-aktarimi.md) | Muhasebe aktarımı: hesap kodu eşlemesi, fiş dosyası, kilit | `…/accounting/mappings`, `…/accounting/exports(/preview)` | `/muhasebe-aktarimi` | **Backend'de** (backend #74) — dosya sunucuda saklanır (CSV/Excel), geçmiş sayfalı; Kivi biçimi K7 |
| [33](33-finans-parametreleri.md) | Finans parametreleri (versiyonlu) | `…/finance-parameters`, `…/finance-parameters/versions` | `/ayarlar/finans` | **Backend'de (#79, P03b)** (ilk sürüm backend #74) — tahakkuk motoru kıst, vade günü, kaynak (K23), gecikme ve mahsup sırasını kullanıyor; yeni alanlar `late_fee_cap_percent`, `late_fee_minimum_amount` |
| [34](34-tahakkuk-fark-raporu.md) | Tahakkuk fark raporu | `GET …/charge-runs/preview/diff`, `GET …/charge-runs/{id}/diff` | `/tahakkuk` | **Backend'de (#79, P03b)** (ilk sürüm backend #74) — `change_percent` metin; taslak koşuda da fark raporu; taslak/onay akışı, satır düzeltme (D-10), aidat kuralları (`/aidat-kurallari`), yıllık bütçe–gerçekleşme (`/isletme-projesi?sekme=butce`) |
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
| [53](53-anahtar-emanet.md) | Anahtar, kart ve emanet anahtar | `…/keys`, `…/key-loans`, `…/deposited-keys`, `…/resident/deposited-keys` | `/anahtarlar`, sakin `/emanet` | **Backend'de** (#73) |
| [54](54-stok-sayimi.md) | Stok sayımı | `…/stock-counts` | `/demirbas?sekme=sayim` | **Backend'de** (#73) — fark onay kuralına bağlı (K21) |
| [55](55-denetim-listeleri.md) | Denetim (kontrol) listeleri | `…/checklist-templates`, `…/inspections` | `/denetimler` | **Backend'de** (#73) |
| [56](56-sigorta-hasar.md) | Sigorta poliçeleri ve hasar dosyaları | `…/insurance-policies`, `…/insurance-claims` | `/sigorta` | **Backend'de** (#73) — belgeler `…/subject-documents` |
| [57](57-sayac-okuma.md) | Sayaçlar ve okuma | `…/meters`, `…/meter-readings`, `…/resident/meter-readings` | `/sayaclar`, sakin `/emanet` | **Backend'de** (#73) — tahakkuka besleme K14: pilot sonrası |
| [58](58-rutin-gorevler.md) | Görevli rutin görevleri | `…/task-templates`, `…/tasks`, `…/tasks/report` | `/gorevler` | **Backend'de** (#73) — K29 `…/me/tasks` |
| [59](59-rezervasyon-alan-kurallari.md) | Rezervasyon alanları ve kuralları | `…/reservable-areas`, `…/reservable-areas/{id}/rules` | `/rezervasyon/alanlar` | **Backend'de** (#81) — K11 borçlu bölüm kısıtı dahil |
| [60](60-rezervasyon.md) | Rezervasyon: sakin, sakin adına, iptal, bekleme listesi | `…/reservable-areas/{id}/availability`, `…/reservations`, `…/resident/reservations`, `…/resident/waitlist/{id}/accept` | `/rezervasyon`, sakin `/rezervasyon` | **Backend'de** (#81) |
| [61](61-rezervasyon-takvim-dogrulama.md) | Günlük liste, kullanım doğrulama, no-show, kullanım raporu | `…/reservations/check-in-code`, `…/reservations/{id}/check-in`, `…/reservations/report` | `/rezervasyon` | **Backend'de** (#81) |
| [62](62-tedarikci-karti.md) | Tedarikçi kartı | `…/vendors` | `/tedarikciler` | **Backend'de** (#78) |
| [63](63-satin-alma-ayar-butce.md) | Satın alma ayarları ve bütçe kontrolü | `…/purchase-settings`, `…/purchase-budget` | `/satin-alma?sekme=ayar`, talep formu | **Backend'de** (#78) |
| [64](64-satin-alma-talep-teklif-onay.md) | Satın alma talebi, teklif, tedarikçi linki, onay | `…/purchase-requests`, `…/quotes`, `…/quote-links`, `/public/quote-links/{token}` (+`/file`), `…/select-quote`, `…/decide` | `/satin-alma`, `/satin-alma/{id}`, `/teklif/{token}` | **Backend'de** (#78) |
| [65](65-siparis-kabul.md) | Sipariş ve mal/hizmet kabul | `…/purchase-orders`, `…/purchase-orders/{id}/receipts` | `/satin-alma/siparis/{id}` | **Backend'de** (#78) |
| [66](66-tedarikci-faturasi-uclu-eslesme.md) | Tedarikçi faturası ve üçlü eşleşme | `…/vendor-invoices`, `…/vendor-invoices/{id}/decide` | sipariş ayrıntısı, `/satin-alma?sekme=fatura` | **Backend'de** (#78) |
| [67](67-odenecekler.md) | Ödenecekler ve "ödendi" | `…/payables`, `…/vendor-invoices/{id}/mark-paid` | `/satin-alma?sekme=odenecek` | **Backend'de** (#78) |
| [68](68-sozlesme-kpi-ceza-kurallari.md) | Sözleşme performans tanımları: KPI, ceza, artış kuralı | `…/contracts/{id}/performance` | `/sozlesmeler/{id}` | **Backend'de** (backend #84) |
| [69](69-aylik-hizmet-karnesi.md) | Aylık hizmet karnesi ve ceza kesintisi | `…/contracts/{id}/scorecards/{period}` (+`/finalize`, `/penalty`) | `/sozlesmeler/{id}?sekme=karne` | **Backend'de** (backend #84) — onay türü "Ceza kesintisi" |
| [70](70-endeksli-artis.md) | Endeksli fiyat artışı ve endeks değerleri | `…/contracts/{id}/escalation`, `/api/v1/platform/index-values` | `/sozlesmeler/{id}?sekme=artis`, `/yonetim/endeksler` | **Backend'de** (backend #84) |
| [71](71-okuma-onayi-zamanlama.md) | Duyuruda okuma onayı, okuma raporu, zamanlama, sessiz saatler | `…/announcements` (+alanlar), `…/scheduled-announcements`, `…/communication-settings`, `…/read-report`, `…/resident/announcements/{id}/acknowledge` | `/duyurular`, `/duyurular/{id}/okuma-raporu`, sakin ana sayfa ve duyurular | **Backend'de** (#77) — sessiz saat ayarı (`communication-settings`) P16c'de; SMS yedeği P16c ile bağlanacak (K5) |
| [72](72-bildirim-sablonlari.md) | Bildirim ve duyuru şablonları | `…/notification-templates` | `/bildirim-sablonlari` | **Backend'de** (#77) — duyuru şablonları da (`channel: announcement`) |
| [73](73-acil-durum-modu.md) | Acil durum modu, pano, toplanma yoklaması | `…/emergencies`, `…/emergencies/active`, `…/muster-checks`, `…/end`, `…/resident/emergency` | `/acil-durum`, sakin `/acil-durum` | **Backend'de** (#77) — saklama ayarı `…/emergency-settings` (K8: 30 gün, otomatik silme kapalı başlar); push/SMS P16c ile |
| [74](74-acil-bilgi-karti.md) | Acil bilgi kartı (çevrimdışı) | `…/emergency-info-card`, `…/resident/emergency-info-card` | `/acil-durum?sekme=kart`, sakin `/acil-durum` | **Backend'de** (#77) — `ETag`/`If-None-Match` (304) |
| [75](75-genel-kurul-hazirlik-cagri.md) | Genel kurul hazırlığı: format, karar türü, hukuki uyarı, çağrı | `…/meetings/{id}/assembly`, `…/prep`, `…/legal-ack`, `…/invitation`, `…/assembly-settings` | `/toplantilar/{id}/genel-kurul` | Sahte servis |
| [76](76-hazirun-nisap-oylama.md) | Hazirun, fiziki vekâlet, nisap, salonda oylama (kişi + arsa payı) | `…/assembly/attendance`, `…/items/{itemId}/open\|close`, `…/ballots` | `?sekme=hazirun` | Sahte servis — e-oylama/dijital vekâlet hukuk + K5 |
| [77](77-tutanak-karar-defteri.md) | Tutanak ve karar defteri | `…/assembly/minutes`, `…/finalize`, `…/signed`, `…/decision-book` | `?sekme=tutanak`, `/karar-defteri` | Sahte servis |
| [78](78-belge-arsivi.md) | Belge arşivi | `…/documents`, `…/versions/{v}/download`, `…/access-log`, `…/resident/documents` | `/dokumanlar`, sakin `/belgeler` | **Backend'de** (#67) — liste sayfalı, indirme dosya yanıtı; K8: `retention_years` bilgi amaçlı |
| [79](79-rapor-katalogu-sla.md) | Rapor kataloğu, metrik sözlüğü, talep/SLA raporu | `…/reports/catalog`, `…/reports/requests-sla` | `/rapor-katalogu` | **Backend'de** (#80) — oranlar metin, katalog raporu Excel (`…/reports/{key}/export.xlsx`) |
| [80](80-kvkk-basvuru-aydinlatma.md) | KVKK başvurusu ve aydınlatma sürümleri | `…/privacy-requests`, `…/resident/privacy-requests`, `…/privacy-notices` | `/kvkk`, sakin `/kvkk`, `/aydinlatma-onayi` | **Backend'de** (#80) — listeler sayfalı, izin `privacy.manage`; P6 onay kapısı (403 `consent_required`), K8 saklama politikası + VERBİS envanteri |
| [81](81-denetim-kurulu-paketi.md) | Denetim kurulu paketi | `…/audit-packages`, `…/report` | `/denetim-paketi` | **Backend'de** (#80) — sayfalı, dönem özeti dondurulur, Excel; planlı rapor P16c |
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
