# [Servis] Görevli rutin görevleri

Kaynak: Yazılım Dokümanı **OPS-06**.

## Ekran
**Rutin Görevler** (`/gorevler`): sekmeler **Bugün** (tarih seçilebilir; görev kartları: saat aralığı, yer, sorumlu, durum —
bekliyor / gecikti / tamamlandı / tamamlanamadı; **Tamamla** (not, fotoğraf zorunluysa fotoğraf), **Tamamlanamadı** (neden)),
**Şablonlar** (ad, açıklama, sıklık: her gün / haftanın günleri / ayın günü, saat aralığı, yer, sorumlu rol/kişi, fotoğraf
zorunlu, aktif), **Rapor** (son 7 gün görev bazında beklenen / tamamlanan / oran).

## Uç nokta
- `GET …/task-templates` · `POST` · `PATCH …/{id}` — `{ name, description, frequency: "daily|weekdays|monthly", weekdays: [0..6] (0 = pazartesi), month_day, time_from, time_to, location, assignee, photo_required, is_active }`
- `GET …/tasks?date=YYYY-MM-DD` → `[{ template, done, status: "upcoming|due|late|done|failed" }]` (due: bugün saat aralığı içinde)
- `POST …/tasks/{templateId}/complete` — `{ date, status: "done|failed", reason, note, photo }`
- `GET …/tasks/report` → `{ from, to, rows: [{ template_id, name, expected, done, rate }], rate }`

## İş kuralları
- Ayın günü 1–28. Saat bitişi başlangıçtan sonra.
- Görev günü geçmiş ya da bugün saat aralığı bitmiş ve kapatılmamışsa `late`; gecikme yöneticiye bildirim (K5).
- Fotoğraf zorunlu görev fotoğrafsız tamamlanamaz; tamamlanamadı → neden zorunlu. Bir gün bir görev bir kez kapatılır.
- Personel–kullanıcı eşleşmesi (K29) gelince `assignee` personele bağlanır ve "benim görevlerim" süzgeci eklenir.
- Dış firma personeline atanan görevlerin tamamlanma oranı sözleşme KPI'ı olarak kullanılabilir (SAT).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Şablon alanları | 422 `fields.name/frequency/weekdays/month_day/time_to/assignee` | … |
| O gün görev yok | 404 `not_found` | "Bu gün için görev yok." |
| Zaten kapatılmış | 409 `already_done` | … |
| Neden yok | 422 `fields.reason` | … |
| Fotoğraf zorunlu | 422 `photo_required` | "Bu görev fotoğrafsız tamamlanamaz." |

## Yetki
Görüntüleme ve kapatma `requests.read`; şablon yönetimi `requests.assign`.
