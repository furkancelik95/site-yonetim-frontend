# [Servis] Rezervasyon: sakin, sakin adına, iptal, bekleme listesi

Kaynak: Yazılım Dokümanı **REZ-02**.

## Ekran
- **Sakin → Rezervasyon** (`/sakin/{slug}/rezervasyon`): bekleme listesi / teklif kartı (**Rezervasyonu al**, **Listeden çık**);
  yaklaşan rezervasyonlar (doğrulama kodu ve gerekirse QR, **İptal et** — geç iptal uyarısıyla); yeni rezervasyon (alan,
  kural özeti, tarih, saat ızgarası — dolu saat seçilirse buton **Bekleme listesine gir** olur —, kişi, misafir); geçmiş.
  No-show kısıtındaysa form kapanır ve tarih gösterilir.
- **Rezervasyon → Sakin adına** (`/rezervasyon?sekme=yeni`): bölüm, rezervasyonu yapan, alan, tarih, saat, kişi, misafir.
- **Rezervasyon → Onay bekleyen**: **Onayla**, **Reddet** (gerekçe).
- **Rezervasyon → Günlük liste**: satırda **İptal** (gerekçe).

## Uç nokta
- `GET …/reservable-areas/{id}/availability?date=` → `[{ start, end, capacity, taken, past, mine, waiting }]` (personel)
- `GET …/resident/reservable-areas` (açık ve kanalı "yalnız yönetim" olmayan alanlar)
- `GET …/resident/reservable-areas/{id}/availability?date=` → `{ slots: [...], blocked_until }` (`mine` sakinin bölümüne göre)
- `POST …/resident/reservations` — `{ area_id, date, start, people, guests, waitlist: bool, unit_id? }` (belgede `/me/reservations`)
- `POST …/reservations` (sakin adına) — `{ unit_id, person_name?, area_id, date, start, people, guests }`
- `GET …/reservations?date=&area_id=&status=` · `POST …/reservations/{id}/approve|reject|cancel` (`reject`/`cancel`: `{ reason }`)
- `GET …/resident/reservations` → `{ reservations: [...+ verify, cancel_hours], waitlist: [...] }`
- `POST …/resident/reservations/{id}/cancel` · `POST …/resident/waitlist/{id}/accept|leave` (belgede `/me/waitlist-offers/{oid}/accept`)
- `GET …/waitlist` (personel; bekleyen ve teklif gitmiş kayıtlar)

Rezervasyon: `{ id, area_id, area_name, date, start, end, unit_id, unit_name, person_name, people, guests, status: "pending|approved|rejected|cancelled|checked_in|no_show|completed", code, channel: "resident|staff", created_by, created_at, fee, charge_id, reject_reason, cancel_reason, cancelled_late, checked_in_at, checked_in_by, decided_by }`.
Bekleme: `{ id, area_id, area_name, date, start, end, unit_id, unit_name, person_name, people, guests, status: "waiting|offered|accepted|expired|left", offered_until, created_at }`.

## İş kuralları (belge akışındaki sırayla)
1. Hane üyesi `reservations` yetkisi yoksa 403 (hane üyesi girişi geldiğinde; sahte serviste malik/kiracı).
2. **No-show kısıtı**: son `months` ayda `count` no-show → son no-show tarihi + `block_days` gününe kadar 409.
3. Kişi/misafir sınırı (422), **haftalık sınır** (pazartesi başlangıçlı hafta, bölüm × alan; bekleyen, onaylı, gelen, tamamlanan
   ve gelinmeyen sayılır) 409. Aynı bölüm aynı saate ikinci kez rezervasyon yapamaz.
4. **Çakışma**: `taken + teklif gitmiş bekleme ≥ capacity` → dolu. Veritabanı düzeyinde kilit (ör. `(area_id, date, start)`
   üzerinde sayaç satırı `SELECT … FOR UPDATE` ya da kapasite 1 için benzersiz kısmi indeks); eşzamanlı iki istekte biri kazanır.
5. Dolu + bekleme listesi açık + `waitlist: true` → bekleme kaydı (201, sıra numarası). Değilse 409 `slot_full` ve mesajda boş saatler.
6. Onay otomatik → `approved`; yönetici → `pending`. Ret gerekçeli, ücret oluşmaz.
7. Onaylanınca ücret > 0 ise **dönem dışı ücret** (istek 31, kaynak `reservation`) sakinin hesabına yazılır (kiracı varsa kiracı,
   yoksa malik hesabı). Sakin adına açılanda kanal `staff` ve açan personel kaydedilir; sakine bildirim (K5).
8. **İptal**: başlangıca `cancel_hours`'tan fazla varsa ücret ters kayıtla kapanır; geç iptalde `late_cancel_refund` false ise
   iade yok. İptal ya da ret sonrası bekleme listesinde ilk kişiye `waitlist_minutes` geçerli teklif (`offered`); süre dolunca
   (zamanlanmış iş) `expired` ve sıradakine geçer. Kabulde 2–7 yeniden işletilir.
9. Borçlu sakinin rezervasyonu kısıtlanmaz.
10. Olaylar: RezervasyonOlusturuldu, RezervasyonOnaylandi, RezervasyonIptalEdildi, BeklemeListesiTeklifi (bildirimler K5).

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan/tarih/saat/kişi/misafir | 422 `fields.area_id/date/start/people/guests` | "Geçmiş saat seçilemez." … |
| Alan kapalı | 409 `area_closed` | … |
| Kanal uymuyor | 409 `channel` | "… rezervasyonu yönetim açar; lütfen yönetimi arayın." |
| No-show kısıtı | 409 `noshow_blocked` | "… tarihine kadar … rezervasyonu yapamazsınız." |
| Haftalık sınır | 409 `limit` | "Haftalık sınır aşıldı: …" |
| Aynı saat ikinci kez | 409 `duplicate` | … |
| Dolu | 409 `slot_full` | "Bu saat dolu. Boş saatler: …" |
| Zaten bekleme listesinde | 409 `already_waiting` | … |
| Teklif süresi doldu | 409 `expired` | "Teklifin süresi doldu; sıradaki kişiye geçti." |
| Yanlış durum | 409 `invalid_status` | … |
| Ret gerekçesi | 422 `fields.reason` | "Ret gerekçesi yazın." |
| Sakin değil | 403 `forbidden` | … |

## Yetki
Personel: sakin adına, onay, iptal `requests.assign`. Sakin: oturum sahibi, kendi bölümü.

## Backend'de (27.10.2026) — sözleşmeden farklar
- `GET …/reservations` ve `GET …/waitlist` sayfalı (`{items, total, page, page_size}`; ekran `page_size=200`).
- Oluşturma yanıtı `{status: approved|pending|approval_pending|waitlisted, reservation, waitlist, position, approval_request_id}`;
  "Rezervasyon" onay kuralı tanımlıysa **202** ve karar Onaylar ekranından (onay bekleyen listesinde "Onay sürecinde").
- Personel çıktısında giriş kodu (`code`) yok; yalnız sakinin kendi listesinde.
- Kullanım raporunda `occupancy` metin (`"12.5"`), para gibi oranlar da metin döner.
- Madde 9 yerine PM kararı K11: site ayarı (varsayılan kapalı) `GET/PUT …/reservation-settings`; açıkken eşik aşan bölüme 409 `debt_restricted`;
  sakin saat durumunda `debt_block` gerekçesi.
- Ücret cari deftere `reservation` kaynağıyla yazılır (dönem dışı ücret servisi gelince oraya taşınacak).
