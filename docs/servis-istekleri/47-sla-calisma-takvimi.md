# [Servis] Talep SLA'sı ve çalışma takvimi

Kaynak: Yazılım Dokümanı **HIZ-03**, HIZ-02 (SLA takibi), §12.2. Kategoriler şimdilik backend'deki sabit listede
(`RequestCategory`); siteye özel kategori ekleme sonraki adım.

## Ekran
- **Talepler → SLA ve şablonlar → SLA ve takvim** (`/talepler/ayarlar`): kategori × öncelik çözüm süresi (saat), kategori
  saat tipi (7/24 / çalışma saati), haftalık çalışma takvimi, otomatik kapanış günü, birleştirme penceresi, düşük puan eşiği.
- **Talepler** listesinde ve ayrıntıda SLA rozeti (süre içinde / süre doluyor / SLA aşıldı / süresinde çözüldü / geç çözüldü,
  kalan süre, "durdu").

## Uç nokta
- `GET/PUT /api/v1/sites/{slug}/settings/requests`
```json
{ "categories": { "elevator": { "hour_type": "24x7", "resolve_hours": { "low": 168, "normal": 72, "high": 24, "urgent": 4 } } },
  "calendar": [{ "closed": false, "open": "09:00", "close": "18:00" }],  // 7 gün, 0 = pazartesi
  "auto_close_days": 3, "merge_window_hours": 24, "low_rating_threshold": 2 }
```
- `GET …/requests/sla` → `{ "<request_id>": { due_at, hour_type, target_hours, used_minutes, remaining_minutes, state: "ok|warning|breached|met|missed", paused } }`
  (öneri: `RequestOut`'a `sla` alanı olarak eklenmesi daha verimli)

## İş kuralları
- `due_at`: 7/24'te `created_at + saat`; çalışma saatinde yalnız takvimdeki açık saatler sayılır (mesai dışında **sayaç durur**).
  Örnek: mesai 09–18, cuma 17:00, 4 saat → pazartesi 12:00. Resmî tatiller platform takviminden (S-03) gelince düşülür.
- `state`: kullanılan ≥ %80 → `warning` (atanan kişiye bildirim), ≥ %100 → `breached` (yöneticiye eskalasyon, "SLA aşıldı"
  etiketi). Çözülen talepte `resolved_at ≤ due_at` → `met`, değilse `missed`. Takip işi 5 dakikada bir.
- Kural değişikliği yalnız yeni talepleri etkiler; açık talepler açıldıkları kuralla devam eder (talepte kural anlık görüntüsü tutulmalı).
- Varsayılanlar: acil 4, yüksek 24, normal 72, düşük 168 saat; asansör, tesisat, güvenlik 7/24; cumartesi 10–14, pazar kapalı.
- Belgedeki acil kategoriler (su baskını, asansörde mahsur kalma, gaz kokusu) kategori ekleme gelince 7/24 varsayılanla açılır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Saat aralığı | 422 `fields.categories.{kat}.{öncelik}` | "1–2160 saat." |
| Takvim | 422 `fields.calendar` | "Açık günlerde açılış kapanıştan önce olmalı (SS:DD)." / "En az bir çalışma günü olmalı." |

## Yetki
Okuma `requests.read`; yazma `requests.assign` (öneri `requests.settings`).

## Kabul kriterleri
- [ ] Cuma 17:00 + 4 sa (09–18) → pazartesi 12:00
- [ ] Mesai dışında `paused: true`, kalan süre azalmaz
