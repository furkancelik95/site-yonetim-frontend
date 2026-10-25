# [Servis] Hazirun, fiziki vekâlet, nisap ve salonda oylama (kişi + arsa payı)

Kaynak: Yazılım Dokümanı **TOP-03** (hesap kuralları) ve **TOP-02** (yalnız fiziki vekâlet yöntemi).

## Ekran
**Genel kurul → Hazirun ve oylama**: KPI (katılan malik kişi/toplam, katılan arsa payı %, toplantı nisabı, vekâlet sınırı);
nisap yoksa kırmızı uyarı; hazirun cetveli (blok · bölüm, malik(ler), arsa payı; **Kendisi** / vekil adı + **Vekille** /
**Çıkar**); her gündem maddesi için kart: karar türü, **Oylamayı aç**, "Tümünü işaretle: Kabul / Ret / Çekimser", bölüm bazında
oy düğmeleri, anlık sayım (kişi ve arsa payı, taban, sağlandı/sağlanamadı), **Oylamayı kapat**, sonuç (KABUL / RET).

## Uç nokta
- `PUT …/meetings/{id}/assembly/attendance` — `{ unit_id, mode: "self|proxy|null", proxy_name }`
- `POST …/meetings/{id}/assembly/items/{itemId}/open|close`
- `PUT …/meetings/{id}/assembly/items/{itemId}/ballots` — `{ ballots: { [unit_id]: "for|against|abstain|null" } }`
- Belgedeki uygulamadan katılım/oy uçları (`/me/meetings/{mid}/attendance`, `/me/agenda-items/{aid}/votes`) hukuki teyit + K5 sonrası.

Sonuç: `{ type_code, type_name, persons: { for, against, abstain, base }, shares: { for, against, abstain, base }, person_ok, share_ok, accepted }` (paylar 0–1 oran).

## Hesap kuralları
- **Malik listesi (roster)** ilk açılışta sabitlenir: aktif ve maliki olan bölümler, malik adları, arsa payı (pay/payda).
- **Kişi sayımı**: bölümün malik kümesi bir kişidir (hisseli bölüm tek temsilci; birden çok bölümü olan malik bir kişi).
  Backend'de ad yerine kişi kimliği kullanılmalı.
- **Toplantı nisabı**: katılan kişi > toplam kişi/2 **ve** katılan pay > toplam pay/2 (ikinci toplantıda aranmaz). Nisap
  yoksa oylama açılmaz. Gerçek veriyle doğrulandı: 46 malikten 24'ü (kişi ✓) ama arsa payının %38,52'si (pay ✗) → "sağlanamadı"
  (belgedeki S1 ile aynı mantık).
- **Karar**: karar türünün tabanı (katılanlar ya da tüm malikler) üzerinden kişi ve/veya pay oranı ayrı ayrı; ikisi de
  isteniyorsa ikisi de sağlanmalı. Örn. 4/5 maddesi 33/46 kişi ve %69 pay kabulle RET.
- **Aynı malik tek oy**: bir malikin bölümleri farklı oy kullanamaz (422 `owner_conflict`); ekran bir bölüme verilen oyu malikin
  katılan diğer bölümlerine de yazar.
- Tek seferde tek açık oylama; açık oylama varken hazirun değişmez; kapatırken katılan herkesin oyu girilmiş olmalı.
- Oy kayıtları değiştirilemez denetim kaydına yazılmalı (oy, zaman, giren kişi; uygulamadan oyda cihaz ve SMS kodu doğrulaması).
- **Fiziki vekâlet**: vekil adı girilir, kâğıt vekâletname salonda kontrol edilir. Bir kişi en fazla `proxy_limit` malikin
  (kişi) vekili olabilir; aşan kayıt edilmez. Vekâletin toplantıdan önce geri alınması ve dijital/PDF vekâlet hukuki teyitle.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Nisap yok | 409 `no_quorum` | "Toplantı nisabı sağlanamadı (kişi 24/46 ✓, arsa payı %38,52 ✗). İkinci toplantı kuralını uygulayın." |
| Vekâlet sınırı | 409 `proxy_limit` | "Vekâlet sınırı aşılıyor: bir kişi en fazla 2 malikin vekili olabilir." |
| Vekil adı | 422 `fields.proxy_name` | … |
| Açık oylama varken hazirun | 409 `voting_open` | … |
| Hazirunda olmayan oy | 422 `fields.ballots.{unit_id}` | … |
| Malik çatışması | 422 `owner_conflict` | "… birden çok bölümünde farklı oy kullanamaz." |
| Eksik oy | 422 `missing_ballots` | "N katılımcının oyu girilmedi." |
| Yanlış durum | 409 `invalid_status` | … |

## Yetki
`meetings.manage`.
