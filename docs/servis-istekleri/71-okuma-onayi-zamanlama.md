# [Servis] Duyuruda zorunlu okuma onayı, okuma raporu, zamanlama ve sessiz saatler

Kaynak: Yazılım Dokümanı **ILT-01**, **16.2** (sessiz saatler) ve **16.3** (zorunlu okuma onayı). Duyuru uçları backend'de; bu istek
onlara eklenecek alanlar ve yeni uçlar.

## Ekran
- **Duyurular → Duyuru yayınla**: "Okuma onayı zorunlu" (son onay süresi saat, "süre dolunca onaylamayanlara bir kez SMS"),
  "İleri bir zamanda yayınla" (tarih-saat); sessiz saat bilgisi. Listede "Okuma onayı · N onay · son …" ve **Okuma raporu**.
- **Duyurular → Zamanlanmış**: bekleyen duyurular (kaydırıldıysa istenen zaman), **İptal et**.
- **Duyurular → Sessiz saatler**: başlangıç–bitiş (varsayılan 22:00–08:00).
- **Okuma raporu** (`/duyurular/{id}/okuma-raporu`): alıcı, okuyan, onaylayan, onaylamayan; yayın, hedef, son onay, SMS yedeği;
  onaylayanlar (kişi, bölüm, zaman, kanal); rapor üretim zamanı; **Yazdır / PDF**.
- **Sakin**: ana sayfada onaylanana kadar sabit "Okuma onayı bekleniyor" uyarısı; duyuruda **Okudum, anladım**, sonra
  "Okudunuz ve onayladınız · zaman".

## Uç nokta
- `POST …/announcements` gövdesine: `requires_ack`, `ack_hours` (1–720), `sms_fallback`, `publish_at` (ISO, ileride ise zamanlanır)
- `GET …/announcements` öğelerine: `requires_ack`, `ack_deadline`, `ack_count`
- `GET …/scheduled-announcements` · `POST …/scheduled-announcements/{id}/cancel`
- `GET/PUT …/communication-settings` — `{ quiet_from: "22:00", quiet_to: "08:00" }`
- `GET …/announcements/{id}/read-report` → `{ id, title, audience, published_at, generated_at, recipient_count, read_count, requires_ack, ack_deadline, acks: [{ name, units, at, channel }], not_acked, sms_fallback: { due, count, sent, note } }`
- `GET …/resident/announcements` öğelerine: `requires_ack`, `ack_deadline`, `acked_at`
- `GET …/resident/pending-acks` · `POST …/resident/announcements/{id}/acknowledge` (belgede `/me/announcements/{aid}/acknowledge`)

## İş kuralları
- **Sessiz saatler**: aralık gece yarısını geçebilir (22:00–08:00). Bu aralığa düşen zamanlanmış duyuru ve push/SMS/e-posta
  sessiz saat bitişine kayar; **kritik** önemdeki duyuru ve acil durum aşar. Hemen yayınlanan duyuru uygulamada hemen
  görünür, dış kanallar bitişte gider.
- **Zamanlama**: zamanlanmış iş vakti gelince yayınlar (sahte serviste duyuru listesi okunurken); yayın anında okuma onayı
  kuralı da başlar. İptal yalnız yayınlanmamışsa.
- **Okuma onayı**: son onay = yayın + `ack_hours`. Onay yalnız hedef kitledeki gerçek kişiden; onay aynı zamanda "okundu"
  sayılır. Bir kişi bir kez onaylar. Süre dolunca onaylamayanlara **bir kez** SMS (kademeli hatırlatma yok), kotadan düşer,
  tahmini maliyet yayından önce gösterilmeli (K5). Hane üyesinin onayı bölüm adına sayılmaz, raporda ayrıca gösterilir.
- **Rapor**: kişi bazında teslim / açılma / onay zamanı ve kanal (backend alıcı listesini döndürmeli — sahte serviste yalnız
  onaylayanlar listeleniyor, onaylamayan sayısı alıcı sayısından hesaplanıyor). Zaman damgalı PDF belge arşivine kaydedilir;
  genel kurul çağrısında ispat belgesi (TOP-01, hukuki geçerlilik avukata sorulacak).
- **Ticari ileti** türü ve İYS onayı olmayanların hedeften çıkarılması: rıza verisi gelince (K5, İYS) eklenecek.
- Duyuru onay kuralı (onay modülünde yeni işlem türü) gerekiyorsa yayından önce çalışır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Süre | 422 `fields.ack_hours` | "Son onay süresi 1–720 saat." |
| Yayın zamanı | 422 `fields.publish_at` | "Yayın zamanı ileride olmalı." |
| Sessiz saat | 422 `fields.quiet_from/quiet_to` | "Başlangıç ve bitiş aynı olamaz." |
| Zaten onaylı | 409 `already` | "Okuma onayınız zaten kayıtlı." |
| Onay istemeyen duyuru | 404 `not_found` | … |
| Zamanlanmış iptal | 409 `invalid_status` | … |

## Yetki
Yazma, rapor ve ayar `announcements.publish`; sakin oturum sahibi.
