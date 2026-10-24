# [Servis] Anahtar, kart ve emanet anahtar

Kaynak: Yazılım Dokümanı **OPS-01**.

## Ekran
- **Anahtar ve Emanet** (`/anahtarlar`): sekmeler **Anahtarlar** (ortak alan anahtarı / kart / kumanda listesi, kimde, ne zaman
  dönecek, gecikenler kırmızı; **Ver**, **İade al**; anahtar tanımı ekle/düzenle) ve **Emanet** (sakinlerin bıraktığı bölüm
  anahtarları; **Teslim al**, **Ver** — yalnız yetkili listesindeki kişiye, kimlik kontrolüyle — **Sakine iade**).
- **Sakin → Emanet ve sayaçlar** (`/sakin/{slug}/emanet`): emanet kaydı oluştur (yetkili kişiler, geçerlilik), durum.

## Uç nokta
- `GET …/keys` → anahtar + açık teslim (`loan`) + `overdue`
- `POST …/keys` · `PATCH …/keys/{id}` — `{ kind: "key|card|remote", code, name, area, authorized_roles: [], is_active }`
- `POST …/keys/{id}/loans` — `{ to_name, to_phone, role, due_at }` · `POST …/key-loans/{id}/return` · `GET …/key-loans` (son 100)
- `GET …/deposited-keys` · `POST …/deposited-keys/{id}/receive|hand|return` (hand: `{ name, id_checked: true }` — `name` yetkili listesindeki adla büyük/küçük harf duyarsız eşleşir)
- `GET/POST …/resident/deposited-keys` — `{ authorized: [{ name, phone }], valid_until, note }`

Emanet: `{ id, unit_id, unit_name, deposited_by, authorized, valid_until, note, status: "requested|held|handed|returned|expired", received_by, handed_to, handed_at, created_at }`.

## İş kuralları
- Kod site içinde benzersiz (büyük harfe çevrilir). Anahtar aynı anda tek kişide olur.
- `authorized_roles` doluysa teslim yalnız o rollere; boşsa herkese.
- Emanet anahtar yalnız yetkili listesindeki kişiye ve **kimlik kontrolü işaretlenince** verilir; süresi dolmuşsa verilmez.
  Verildiğinde sakine bildirim (K5). Liste dışı kişi için reddedilir ve sakine bilgi gider.
- `valid_until` geçince durum `expired` olarak döner (okuma anında hesap ya da zamanlanmış iş).
- Kayıp kart/kumanda ücretlendirmesi ek ücretle (istek 29) yapılır.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alan hatası | 422 `fields.name/code/kind` | "Bu kodla anahtar var." … |
| Anahtar başkasında | 409 `key_out` | "Anahtar şu an başkasında; önce iadesini kaydedin." |
| Yetkisiz rol / kişi | 409 `not_authorized` | … |
| İade zaten | 409 `already_returned` | … |
| Emanet süresi dolmuş | 409 `expired` | … |
| Kimlik kontrolü yok | 422 `fields.id_checked` | "Kimlik kontrolünü işaretleyin." |
| Sakin alanları | 422 `fields.authorized/valid_until` | … |

## Yetki
`requests.assign` ya da `visitors` (güvenlik masası); sakin oturum sahibi, ilk bölümü (çok bölümlü sakin için bölüm seçimi eklenecek).
