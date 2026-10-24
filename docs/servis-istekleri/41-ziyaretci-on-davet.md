# [Servis] Ziyaretçi ön daveti ve kapıda kodla giriş

Kaynak: Yazılım Dokümanı **GUV-02**, GUV-03 (davetli kısmı), §10.2.

## Ekran
- **Sakin → Ziyaretçiler** (`/sakin/{slug}/ziyaretci`): davet oluştur (ad, tip tek kullanımlık / tarih aralıklı / süreli
  kalıcı, tarih, günler, saat aralığı, plaka, not); davet kartında **6 haneli kod + QR**, paylaş (metni kopyala), iptal.
- **Güvenlik → Kapı ekranı**: "Davetli ziyaretçi" — kod girişi → içeri al; bugün beklenen davetliler.

## Uç nokta
- `GET  /api/v1/sites/{slug}/resident/visitor-invites` · `POST …/resident/visitor-invites` · `POST …/resident/visitor-invites/{id}/cancel`
  (belgedeki `/me/visitor-invites` ile aynı; site kapsamında)
- `GET  …/visitor-invites/expected` — görevli; yalnız ad, bölüm, tip, saat, plaka
- `POST …/visitor-invites/check-in` — `{ "code": "323096" }` → ziyaretçi kaydı (`visitors`, `enter_now`) oluşturur

Davet:
```json
{ "id": "…", "unit_id": "…", "unit_name": "A-4", "visitor_name": "Test DENEME", "type": "once|range|recurring",
  "date_from": "2026-10-25", "date_to": "2026-10-25", "weekdays": [0,1,2,3,4], "time_from": "08:00", "time_to": "18:00",
  "plate": "34MSF77", "note": null, "code": "323096", "status": "active|used|cancelled", "created_by": "…" }
```

## İş kuralları
- Kod 6 hane, etkin davetler arasında tekil; QR içeriği `SY-DAVET:{kod}` (öneri: imzalı belirteç).
- Geçerlilik: tarih aralığı; `recurring` için gün (0 = pazartesi) ve saat aralığı. `once` kullanılınca `used`.
- Kodla giriş: geçersiz kod 404 `invite_not_found`; geçerlilik dışında / kullanılmış 409 `invite_not_valid` → görevli
  habersiz ziyaretçi akışına geçer. Başarılı girişte ziyaretçi kaydı `entered` ve davet sahibine bilgi (K5).
- Plakalı davet misafir parkına sayılır: o tarihte etkin plakalı davet sayısı `guest_parking_capacity`'ye ulaştıysa
  409 `guest_parking_full`. Davetli plaka, kullanıldığı gün plaka sorgusunda "misafir" döner (istek 43).
- Hane üyesi davet edebilmek için `visitors` yetkisine sahip olmalı (istek 20). Yetkisiz 403.
- Görevli telefon ve not dışındaki kişisel veriyi görmez.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.visitor_name/type/date_from/date_to/weekdays/time_to/plate` | "Formda düzeltilmesi gereken alanlar var." |
| Misafir parkı dolu | 409 `guest_parking_full` | "Misafir parkı bu tarihte dolu (10). Plakasız davet oluşturabilirsiniz." |
| Kod yok | 404 `invite_not_found` | "Bu kodla davet yok. Habersiz ziyaretçi olarak kaydedin." |
| Geçersiz | 409 `invite_not_valid` | "Bu tek kullanımlık davet kullanılmış." |

## Yetki
Sakin uçları: oturum sahibi sakin / yetkili hane üyesi. Görevli uçları: `security.visitors`.

## Kabul kriterleri
- [ ] Davetli ziyaretçi kodla 10 saniyenin altında kaydedilir
- [ ] Tek kullanımlık kod ikinci kez 409
- [ ] Süreli kalıcı davet yalnız seçili gün ve saatte geçerli
