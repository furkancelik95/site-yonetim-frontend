# [Servis — isteğe bağlı] Toplu tahsilat ucu

## Durum
**Acil değil.** Toplu tahsilat ekranı (`/s/{slug}/tahsilat/toplu`) şu an mevcut `POST /sites/{slug}/payments` ucunu satır satır
çağırıyor; her satırın kendi `Idempotency-Key`'i var, satır başına sonuç (kaydedildi / hata) gösteriliyor. Yeni servis
gerekmeden çalışıyor ve gerçek backend'e bağlı.

## Neden ileride istenebilir
- 50+ satırda tek tek istek yavaş (her biri ayrı transaction, ayrı bakiye güncellemesi).
- "Hepsi ya da hiçbiri" isteyen kullanıcı olursa tek transaction gerekir.

## Önerilen uç (gerekirse)
`POST /api/v1/sites/{slug}/payments/batch` — gövde: `{ "date", "method", "cash_account_id", "items": [ { "ledger_account_id", "amount", "reference" } ] }`
→ `{ "data": { "results": [ { "index": 0, "status": "created", "payment_id": "…", "balance": "…" } | { "index": 1, "status": "error", "code": "…", "message": "…" } ] }, "message": "…" }`.
Idempotency-Key istek başına. Karar Furkan'ın; ekran her iki yolla da çalışır.
