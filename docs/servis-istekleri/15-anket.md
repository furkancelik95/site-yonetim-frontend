# [Servis] Anket

## Ekran
- Yönetim → **Anketler** (`/anketler`): Açık / Kapanan; her anket kartında sonuç çubukları (oy sayısı + yüzde yazılı),
  oy veren bölüm sayısı, hedef kitle, bitiş. **Anket aç** (soru, açıklama, 2–8 seçenek, kim oy verir, bitiş tarihi),
  **Erken kapat**.
- Sakin → **Duyurular** sekmesinin üstünde anket kartları: seçenek işaretle → **Oy ver**. Birden çok bölümü varsa
  "Hangi bölüm adına" seçimi. Oy verdikten sonra ya da anket kapanınca sonuç görünür.
- Ekranda not: "Anket sonucu danışma niteliğindedir; genel kurul kararı yerine geçmez."

Apsiyon: Web sitesi → "Anket".

## Uç nokta
Personel:
- `GET  /api/v1/sites/{slug}/polls?status=open|closed&page=`
- `POST /api/v1/sites/{slug}/polls` — `{ "question": "…", "description": "…", "options": ["Evet", "Hayır"], "audience": "all", "ends_on": "2026-10-12" }`
- `POST /api/v1/sites/{slug}/polls/{id}/close`

Sakin:
- `GET  /api/v1/sites/{slug}/resident/polls` — açık anketler + son 30 günde kapananlar
- `POST /api/v1/sites/{slug}/resident/polls/{id}/vote` — `{ "unit_id": "…", "option_id": "…" }`

## Beklenen yanıt
Personel:
```json
{ "id": "…", "question": "Havuz açılış saati 08:00 olsun mu?", "description": null,
  "options": [ { "id": "…", "label": "Evet, 08:00", "votes": 12 }, { "id": "…", "label": "Hayır, 09:00 kalsın", "votes": 5 } ],
  "audience": "all", "ends_on": "2026-10-12", "status": "open", "total_votes": 17, "created_by": "…", "created_at": "…" }
```
Sakin — aynı şekil, ek olarak `my_votes`; oy vermeden ve anket açıkken `votes` ve `total_votes` **null**:
```json
{ "…": "…", "my_votes": [ { "unit_id": "…", "unit_name": "A-4", "option_id": null } ] }
```

## İş kuralları
- **Bir bağımsız bölüm = bir oy.** Oy kişiye değil bölüme yazılır; aynı bölümün maliki ve kiracısı ayrı oy vermez
  (`audience` hangisinin vereceğini belirler). Oy değiştirilemez.
- `audience`: `all` (bölümdeki malik ya da oturan, ilk veren), `owners` (yalnız malik), `tenants` (yalnız oturan/kiracı).
- `ends_on` günü dahil açık; ertesi gün kendiliğinden `closed`.
- Ara sonuç sakine oy vermeden gösterilmez (yönlendirmeyi önlemek için); personel her zaman görür.
- Oylar gizli: personel kim neye oy verdi göremez, yalnız toplamları görür. (Tartışılacak: bazı siteler açık oy isteyebilir.)
- Duyuru gibi bildirim (push/SMS) açık karar K5'e bağlı; şimdilik sakin ekranında görünür.
- Anket sonucu hukuken bağlayıcı değildir; ekranda belirtilir.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Soru/seçenek/tarih hatası | 422 `fields.question/options/audience/ends_on` | "2 ile 8 arasında seçenek yazın." |
| Aynı seçenek iki kez | 422 `fields.options` | "Aynı seçenek iki kez yazılmış." |
| Kapalı ankete oy | 409 `poll_closed` | "Anket kapandı; oy verilemez." |
| Bölüm adına zaten oy var | 409 `already_voted` | "Bu bölüm adına zaten oy verildi." |
| Bölüm sakinin değil | 404 | "Bu bölüm adına oy veremezsiniz." |
| Hedef kitle dışı | 403 `not_eligible` | "Bu anket bölümünüzdeki rolünüze açık değil." |

## Yetki
Personel okuma: `announcements.read`; açma/kapatma: `announcements.publish`. Sakin uçları: bölüm üyeliği.
**Öneri:** `polls.manage` izni.

## Kabul kriterleri
- [ ] Aynı bölüm adına ikinci oy 409 (eşzamanlı iki istekte de — benzersiz kısıt)
- [ ] Sakin yanıtında oy vermeden sonuçlar null
- [ ] `ends_on` geçince oy 409
