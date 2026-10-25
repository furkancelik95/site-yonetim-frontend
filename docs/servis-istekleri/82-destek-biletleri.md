# [Servis] Destek biletleri

Kaynak: Yazılım Dokümanı **PYN-06** ve **19.3** (destek bileti).

## Ekran
- **Destek** (`/destek`) → **Destek biletleri**: yeni bilet (kategori, öncelik, konu, açıklama; ekran, tesis, sürüm, tarayıcı ve
  iz kimliği otomatik); biletlerim (numara, durum, öncelik; yazışma; "Sorun çözüldü, kapat"; yanıt yazınca yeniden açılır).
- **Platform → Destek** (`/yonetim/destek`): KPI (açık, ilk yanıtı geciken, kritik); durum süzgeci; bilet kartında bağlam ve
  SLA hedefleri, yazışma, yanıt + durum (yanıtlandı / müşteri yanıtı bekleniyor / çözüldü).

## Uç nokta
- `GET/POST …/support-tickets` — `{ title, body, category: "login|payment|finance|import|security|other", priority: "critical|high|normal", context: { path, app_version, user_agent } }`
- `POST …/support-tickets/{id}/messages` — `{ body }` · `POST …/support-tickets/{id}/close`
- `GET /api/v1/platform/support-tickets?status=` · `POST /api/v1/platform/support-tickets/{id}/messages` — `{ body, status }`
- (belgede `POST|GET /api/v1/support-tickets`, `…/{tid}/messages`)

Bilet: `{ id, number: "DST-0001", site_slug, site_name, category, priority, title, context: { path, app_version, user_agent, correlation_id }, status: "open|answered|waiting_customer|resolved|closed", messages: [{ by, side: "customer|support", body, at }], created_by, created_at, first_response_at, resolved_at, sla: { first_due, resolve_due, first_breached, resolve_breached } }`.

## İş kuralları
- Bileti yönetim rolleri açar. Bağlam otomatik eklenir; iz kimliği (correlation id) backend günlükleriyle eşleşmeli.
- **SLA**: paket destek seviyesine bağlı (paket sınırları kararı — ortaklara soru 1.9). Sahte serviste varsayılan: kritik 1 saat
  ilk yanıt / 8 saat çözüm, yüksek 4/24, normal 8/72 (takvim saati). İlk destek yanıtında `first_response_at`, çözümde
  `resolved_at` yazılır; hedef aşımları raporlanır.
- Kritik öncelik yalnız paket 7/24 destek içeriyorsa nöbet hattına düşer (K5 bildirim); değilse mesai içi kuyruk.
- Müşteri "çözüldü" bileti kapatır; çözülmediyse yazar ve bilet `open` olur. Kapalı bilete yazılmaz.
- Ek dosyalar belge deposuyla (istek 78).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alanlar | 422 `fields.title/body/category/priority` | … |
| Kapalı bilet | 409 `closed` | "Bilet kapandı; yeni bilet açın." |
| Kapatma | 409 `invalid_status` | "Bilet çözüldü olarak işaretlenmedi." |
| Platform dışı | 404 `not_found` | … |

## Yetki
Müşteri: `members.manage`, `finance.read` ya da `modules.manage`; platform: platform yöneticisi / destek ekibi.
