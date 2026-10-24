# Servis istekleri

Frontend'in ekranını yaptığı ama backend'de henüz olmayan uçlar. Her dosya backend reposundaki
*Servis isteği* şablonuyla aynı biçimde; issue açarken içeriği olduğu gibi yapıştırılabilir.

Servis gelene kadar ekran bu sözleşmeyle **sahte servisle (MSW, `src/mocks/handlers.ts`)** çalışır;
ekranda sarı "Sahte servis · NN" rozeti görünür. Servis gelince:

1. `openapi.json` güncellenir, `npm run api:types`
2. İlgili handler `src/mocks/handlers.ts`'den silinir
3. Ekrandaki `MockBadge` kaldırılır, elle yazılmış tip üretilmiş tiple değiştirilir

Kaynak: Apsiyon yönetici paneli karşılaştırması — eksik listesinin dış sağlayıcı gerektirmeyen paketleri (01–05 ilk paket, 06–08 finans, 09–11 operasyon, 12–13 kullanıcı, 14–18 yönetim paketi).

Şu an sahte servis yok: 01–18'in hepsi backend'de (15.10.2026).

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
| [12](12-site-kullanicilari.md) | Site kullanıcıları ve roller | `GET …/roles`, `GET/POST …/members`, `PATCH …/members/{id}` | `/kullanicilar` | **Backend'de** (#40) |
| [13](13-sakin-kayit-basvurusu.md) | Sakinin kendini kaydetmesi + onay | `…/registration-link`, `…/registrations`, `/public/registration/{code}` | `/kayit/:code`, `/kayit-basvurulari` | **Backend'de** (#41) — onayda sakine giriş hesabı açılır, geçici parola bir kez gösterilir |
| [14](14-toplantilar.md) | Toplantılar ve genel kurul | `…/meetings`, `…/meetings/{id}/decisions`, `…/cancel` | `/toplantilar` | **Backend'de** (#42) — modül `general-assembly` |
| [15](15-anket.md) | Anket | `…/polls`, `…/resident/polls/{id}/vote` | `/anketler`, sakin Duyurular | **Backend'de** (#43) — modül `surveys` |
| [16](16-sozlesmeler.md) | Hizmet sözleşmeleri | `GET/POST/PATCH …/contracts` | `/sozlesmeler` | **Backend'de** (#44) |
| [17](17-demirbas-stok.md) | Demirbaş ve stok | `…/assets`, `…/stock-items`, `…/stock-items/{id}/moves` | `/demirbas` | **Backend'de** (#45) |
| [18](18-personel.md) | Site personeli | `GET/POST/PATCH …/staff` | `/personel` | **Backend'de** (#46) — modül `staff` |

Yeni servis gerektirmeden yapılanlar (mevcut uçlarla):

- **Tahsilat makbuzu** (`/makbuz/:paymentId`) — `GET …/payments/{id}`. Numara yok (açık karar K15).
- **Talep panosu** (`/talepler/pano`) — `GET …/requests?status=` + `POST …/requests/{id}/status`.
- **İhtar yazısı** (`/belge/ihtar/:accountId`) — `GET …/accounts/{id}/statement` (bakiye ve en eski vade). Yazı kaydedilmez; metni hukukçuya gösterilmeli.
- **Hazirun listesi** (`/belge/hazirun`) — `GET …/units` sayfa sayfa (arsa payı, malik).
- **Toplu tahsilat** (`/tahsilat/toplu`) — `POST …/payments` satır satır, satır başına `Idempotency-Key`.
