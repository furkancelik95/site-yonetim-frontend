# [Servis] İzin kaydı ve onayı

Kaynak: Yazılım Dokümanı **IK-03**. Personelin mobilden kendi talebi K29'a bağlı; şimdilik İK sorumlusu personel adına
kaydeder. Onay kuralına ("İzin talebi") bağlanması K21.

## Ekran
- **İzinler** (`/izinler`): **İzin kaydet** (personel, tür, başlangıç–bitiş, açıklama; raporluda tanı yazılmaması uyarısı),
  sekmeler Onay bekleyen / Onaylanan / Reddedilen / Tümü; **Onayla**, **Reddet** (gerekçe), onaylıyı **İptal**;
  "bu yıl kullanılan izinler" (bilgi amaçlı).

## Uç nokta
- `GET  /api/v1/sites/{slug}/leave-requests?status=pending|approved|rejected|cancelled`
- `POST …/leave-requests` — `{ "staff_id", "type": "annual|excuse|sick|unpaid", "from", "to", "note" }`
- `POST …/leave-requests/{id}/approve` · `…/reject` `{ "reason" }` · `…/cancel`
- `GET  …/leave-balances` → `[{ staff_id, staff_name, used: { annual, excuse, sick, unpaid } }]` (bu yıl, onaylı gün)
- (K29 sonrası) `POST /api/v1/me/leave-requests`

İzin: `{ id, staff_id, staff_name, type, from, to, days, note, status, created_by, created_at, decided_by, decided_at, reject_reason }`.

## İş kuralları
- `days` takvim günü (to − from + 1). Aynı kişinin bekleyen/onaylı izniyle tarih çakışması 409 `leave_overlap`.
  Kayıt yanıtında bu tarihlerdeki vardiya sayısı döner (onaycıya gösterilir).
- Onaylı izin vardiya planında görünür (istek 36, `leave` çakışması) ve puantajda o gün "İzinli (tür)" olur (istek 38);
  boşalan vardiya "atanmalı" işaretlenir.
- **Raporlu izinde tanı bilgisi tutulmaz**; yalnız rapor belgesi (belge modülüyle; gizli kategori).
- İzin türleri tesis ayarı (varsayılan dört tür) — ayar ekranı sonraki adım.
- Yıllık izin bakiyesi yalnız bilgi; bordro hesabı platformda yapılmaz.
- Puantajı kesinleşmiş günü kapsayan izin iptal edilemez (409 `timesheet_final`).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.staff_id/type/from/to` | "Formda düzeltilmesi gereken alanlar var." |
| Çakışan izin | 409 `leave_overlap` | "Bu tarihlerde kişinin başka bir izni var." |
| Ret gerekçesi | 422 `fields.reason` | "Ret gerekçesi yazın." |
| Kesin gün | 409 `timesheet_final` | "İzin günlerinden birinin puantajı kesinleşti; iptal edilemez." |

## Yetki
`staff.manage`. Modül `staff`.
