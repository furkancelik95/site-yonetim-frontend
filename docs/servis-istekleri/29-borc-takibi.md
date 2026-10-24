# [Servis] Borç takibi: yaşlandırma, hatırlatma ve arama kaydı, ihtarname gönderim/tebliğ

Kaynak: Yazılım Dokümanı **FIN-12** (borç takibi bölümü). Ödeme planı istek 30.

## Ekran
- **Borçlular** (`/borclular`): **Yaşlandırma** (0–30 / 31–60 / 61–90 / 90+ gün, blok bazında), **Takip** sütunu (plan
  durumu, ihtarname durumu, hatırlatma sayısı), satır seçimi → **toplu hatırlatma**.
- **Cari hesap** (`/cari/{id}`) → **Borç takibi** kartı: hatırlatma / arama / not kaydı, ihtarname yazısı (mevcut
  `/belge/ihtar`), **ihtarname gönderimini kaydet** (yöntem, tarih, takip/yevmiye no), **tebliğ edildi**, zaman çizelgesi.

## Uç nokta
- `GET  /api/v1/sites/{slug}/receivables/aging`
- `GET  …/collection-status` → `{ "<account_id>": { plan_status, letter_status, last_action_at, reminder_count } }`
- `GET  …/accounts/{id}/collection-timeline` — dizi, yeniden eskiye (hatırlatma, arama, not, ihtarname, ödeme planı)
- `POST …/accounts/{id}/collection-actions` — `{ "kind": "reminder|call|note", "channel": "app|sms", "note": "…" }`
- `POST …/collection-actions/bulk` — `{ "account_ids": [...], "channel": "app|sms" }`
- `POST …/accounts/{id}/demand-letters` — `{ "method": "hand|registered_mail|notary", "sent_on": "2026-10-20", "tracking_no": "RR…", "note": null }`
- `PATCH …/demand-letters/{letter_id}` — `{ "served_on": "2026-10-23" }`

Yaşlandırma yanıtı:
```json
{ "as_of": "2026-10-25",
  "buckets": [{ "key": "0_30", "label": "0–30 gün", "count": 60, "amount": "245000.00" }],
  "by_block": [{ "block": "A", "0_30": "…", "31_60": "…", "61_90": "…", "90_plus": "…", "total": "…" }] }
```
Zaman çizelgesi öğesi: `{ id, kind, channel, note, by, at, letter?: { id, method, sent_on, tracking_no, served_on, status: "sent|served" }, plan?: { id, status } }`.

## İş kuralları
- Kova, hesabın `overdue_days` değerine göre (mevcut `debtors` hesabıyla aynı).
- **Hatırlatma kademeleri** finans parametresidir (istek 33; varsayılan vade +3 bildirim, +10 SMS, +30 yönetici araması,
  +60 ihtarname hazırlığı). Günlük iş kademeye gelen hesaplar için hatırlatma kaydı üretir; aynı kademe bir kez.
  **Gönderim K5'e bağlı:** servis gelene kadar yalnız kayıt tutulur, mesaj gitmez (yanıt mesajı bunu söyler).
  Aktif ödeme planı olan hesaba normal hatırlatma gitmez. Kiracılı bölümde hatırlatma kiracıya, gecikmede malike de.
- Arama kademesinde yöneticiye görev (bildirim merkezi).
- İhtarname: `registered_mail` ve `notary` için takip/yevmiye no zorunlu; tebliğ tarihi gönderimden önce ve gelecekte olamaz.
  Yazı metni avukat onaylı şablon (A-04); hazırlanmasının onay kuralına bağlanması K21. Tebliğ belgesi yüklemesi belge
  modülüyle gelecek. KEP sonraki faz.
- **Borçlu bilgisi hiçbir sakin ucunda dönmez.** Borçlu sakinin hizmetleri kısıtlanmaz.
- Her kayıt denetim kaydına yazılır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.kind/channel/note/method/sent_on/tracking_no/served_on` | "Formda düzeltilmesi gereken alanlar var." |
| İhtarname yok | 404 `not_found` | "İhtarname bulunamadı." |

## Yetki
Okuma `finance.read`; kayıt `finance.payment.record` (öneri: `finance.collection.manage`).

## Kabul kriterleri
- [ ] Vadesi 10 gün geçmiş borç için gece işi SMS hatırlatma kaydını bir kez üretir
- [ ] Ödeme planındaki hesaba kademe hatırlatması üretilmez
- [ ] Yaşlandırma toplamı `debtors.summary.total_balance` ile eşit
