# [Servis] Sigorta poliçeleri ve hasar dosyaları

Kaynak: Yazılım Dokümanı **OPS-04**.

## Ekran
**Sigorta ve Hasar** (`/sigorta`): poliçe listesi (tür, şirket,
no, teminat, prim, bitiş, kalan gün — 60/30 gün ve süresi geçmiş uyarıları); poliçe ekle/düzenle; hasar dosyaları (poliçe,
olay tarihi, kaynak, talep edilen / ödenen tazminat, durum geçişleri).

## Uç nokta
- `GET …/insurance-policies` (bitişe göre) · `POST` · `PATCH …/{id}` — `{ kind, insurer, policy_no, coverage, premium, start, end, area, note }`
  → ek alanlar `days_left`, `warning: "60"|"30"|"expired"|null`
- `GET …/insurance-claims` · `POST` — `{ policy_id, source, description, incident_date, claimed }` · `PATCH …/{id}` — `{ status: "open|submitted|paid|rejected", paid, paid_on }`

## İş kuralları
- Tür, sigortacı, poliçe no zorunlu; bitiş > başlangıç; prim ≥ 0. 60 ve 30 gün kala yöneticiye hatırlatma (K5); listede kalan gün gösterilir.
- Hasar dosyası bir talepten/olaydan (ör. su baskını) açılabilir (`source`).
- Tazminat ödendi → tutar ve tarih zorunlu; **Mod P'de gelir fişi** olarak muhasebe aktarımına girer (istek 32).
- Poliçe belgesi PDF'i belge modülüyle (RAP) eklenecek.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.kind/insurer/policy_no/start/end/premium` | … |
| Hasar alanları | 422 `fields.policy_id/description/incident_date` | … |
| Ödeme tutarı yok | 422 `fields.paid` | "Ödenen tazminatı girin." |

## Yetki
Okuma `expenses.read`, yazma `expenses.manage`.
