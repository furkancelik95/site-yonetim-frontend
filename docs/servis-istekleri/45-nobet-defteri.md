# [Servis] Nöbet defteri ve vardiya devri

Kaynak: Yazılım Dokümanı **GUV-06**. Olay kaydı (`incidents`, istek 09) ayrı kalır (K27: ad değişmez); nöbet defteri
vardiya boyunca kısa notlar ve devir içindir.

## Ekran
- **Güvenlik → Nöbet defteri**: kayıt türü (not / olay / vardiya devri), metin; zaman çizelgesi; **Ek not**;
  devir notunda sonraki görevli için **Okudum, devraldım**.

## Uç nokta
- `GET  /api/v1/sites/{slug}/shift-log?date=` · `POST …/shift-log` — `{ kind: "note|event|handover", text, gate_id }`
- `POST …/shift-log/{id}/addenda` — `{ text }`
- `POST …/shift-log/{id}/acknowledge` — yalnız `handover`

Kayıt: `{ id, kind, text, gate_id, by, at, addenda: [{ text, by, at }], acknowledged_by, acknowledged_at }`.

## İş kuralları
- **Kayıt değiştirilemez ve silinmez**; düzeltme ek notla. Metin en az 5 karakter.
- Devri yazan kişi kendi devrini onaylayamaz (409 `same_person`); onay bir kez.
- Yönetimin müdahalesi gereken durum için olay kaydı (istek 09) ya da talep açılır; eskalasyon bildirimi K5.
- Tarih süzgeci tesis yerel saatine göre.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Kısa metin | 422 `fields.text` | "En az 5 karakter yazın." |
| Kendi devri | 409 `same_person` | "Devri yazan kişi kendi devrini onaylayamaz; sonraki vardiya görevlisi onaylar." |
| Zaten onaylı | 409 `already_acknowledged` | "Devir zaten onaylanmış." |

## Yetki
Yazma `security.incidents`; okuma site yöneticisi.
