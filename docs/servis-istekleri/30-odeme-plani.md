# [Servis] Ödeme planı (borç yapılandırma)

Kaynak: Yazılım Dokümanı **FIN-12** (ödeme planı), **FIN-15** (sakin: ödeme planım), §8.9.

## Ekran
- **Cari hesap → Borç takibi → Ödeme planı oluştur**: tutar (≤ açık bakiye), taksit sayısı (2–36), ilk vade (sonrakiler
  ayda bir), not; **taksit önizlemesi** (toplamı korur). Yürürlükteki plan kartı: taksitler, ödenen, durum, **iptal**.
- **Ödeme planları** (`/odeme-planlari`): yürürlükte / bozuldu / tamamlandı sayıları, kalan tutar, liste, taksitler.
- **Sakin → Borcum → Ödeme planım**: kendi planı ve taksitleri.

## Uç nokta
- `GET  /api/v1/sites/{slug}/payment-plans?status=active|broken|completed|cancelled`
- `GET  …/accounts/{id}/payment-plans`
- `POST …/accounts/{id}/payment-plans` — `{ "amount": "17652.22", "installment_count": 3, "first_due_date": "2026-11-10", "note": null }`
- `POST …/payment-plans/{id}/cancel` — `{ "reason": "…" }`
- `GET  …/resident/payment-plans` — sakin, yalnız kendi hesapları

Plan:
```json
{ "id": "…", "account_id": "…", "unit_name": "A-4", "person_name": "…", "reference_code": "A4-O",
  "total": "17652.22", "installment_count": 3, "tolerance_days": 10, "status": "active", "paid_total": "0.00",
  "installments": [{ "no": 1, "due_date": "2026-11-10", "amount": "5884.08", "paid": "0.00", "status": "open" }],
  "created_by": "…", "created_at": "…", "cancelled_at": null, "cancel_reason": null }
```
Taksit durumu: `paid | partial | open | overdue`.

## İş kuralları
- Taksitler eşit; kuruş artığı **ilk taksitlere** birer kuruş ("en büyük kalan"): 1.000,00 / 3 = 333,34 + 333,33 + 333,33.
- Belgedeki model: plan oluşunca **yapılandırılan açık kalemler kapanır, taksitler ayrı vadeli kalemler olarak açılır**
  (deftere yazılır). Sahte servis yalnız izliyor: plandan sonraki tahsilatları taksitlere sırayla dağıtıp durum hesaplıyor.
- Durum: tüm taksitler ödendi → `completed`; bir taksit `vade + tolerance_days` geçip ödenmediyse → `broken` (yöneticiye
  uyarı; kalan taksitler normal gecikme/hatırlatma kurallarına döner); iptal → `cancelled` (gerekçe zorunlu).
  `tolerance_days` plan oluşurken finans parametresinden (istek 33) kopyalanır.
- Hesapta yürürlükte plan varken yenisi 409 `plan_exists`.
- Plan süresince yapılandırılan borca gecikme işlemez (parametre `plan_suspends_late_fee`) — gecikme tazminatı henüz
  deftere işlenmiyor (açık karar); kural o gelince uygulanır.
- Belgede plan "Ödeme planı" onay kuralından geçer (step-up) — K21.
- Sakin ucu yalnız kendi hesaplarının planını döner; başka bölüm bilgisi yok.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Tutar > bakiye | 422 `fields.amount` | "Tutar açık bakiyeyi (…) aşamaz." |
| Taksit sayısı | 422 `fields.installment_count` | "Taksit sayısı 2–36 arası." |
| İlk vade geçmiş | 422 `fields.first_due_date` | "İlk vade bugünden önce olamaz." |
| Plan var | 409 `plan_exists` | "Bu hesapta yürürlükte bir ödeme planı var; önce onu iptal edin." |

## Yetki
Okuma `finance.read`; oluşturma/iptal `finance.payment.record`; sakin ucu oturum sahibi.

## Kabul kriterleri
- [ ] 1.000,00 / 3 taksit = 333,34 + 333,33 + 333,33
- [ ] Taksit vade + tolerans geçince plan `broken`, yöneticiye bildirim
- [ ] Sakin başka hesabın planını göremez
