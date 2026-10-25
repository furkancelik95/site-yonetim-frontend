# [Servis] Genel kurul hazırlığı: format, karar türü, hukuki uyarı ve çağrı

Kaynak: Yazılım Dokümanı **TOP-01** ve **17.2**. Toplantı kartı (`/meetings`) backend'de; bu istek genel kurul katmanı.

## Ekran
**Toplantı → Genel kurul** (`/toplantilar/{id}/genel-kurul`, yalnız genel kurul türlerinde) **Hazırlık ve çağrı** sekmesi:
format (fiziki / hibrit / ön oylama + fiziki), her gündem maddesi için karar türü, "İkinci toplantı" işareti, kişi başı azami
vekâlet (site ayarı); hibrit/ön oylamada **hukuki geçerlilik uyarısı** ve "Okudum, onaylıyorum"; **Çağrı**: başlık, metin
(tarih, yer, gündem, ikinci toplantı cümlesiyle hazır gelir), okuma onayı süresi → **Çağrıyı maliklere gönder**; gönderildikten
sonra **çağrı ispat raporu** (okuma onayı raporu) ve basılı liste bağlantısı.

## Uç nokta
- `GET …/meetings/{id}/assembly` → `{ format, legal_ack, second_call, item_types: { [agenda_item_id]: code }, invitation, roster, attendance, votes, minutes, settings, quorum }`
- `PUT …/meetings/{id}/assembly/prep` — `{ format: "physical|hybrid|prevote", item_types, second_call }`
- `POST …/meetings/{id}/assembly/legal-ack`
- `POST …/meetings/{id}/assembly/invitation` — `{ title, body, ack_hours }` (belgede `…/invitations`, `…/invitation-proof.pdf`)
- `GET/PUT …/assembly-settings` — `{ decision_types: [{ code, name, base: "present|all", num, den, strict, person, share }], quorum: { num, den, strict, person, share }, proxy_limit }`

## İş kuralları
- **Karar türleri** (site parametresi; varsayılanlar): oy çokluğu (katılanların sayı ve arsa payı çoğunluğu, `>1/2`), tüm
  maliklerin sayı ve arsa payı çoğunluğu (`>1/2`), tüm maliklerin 4/5'i (`≥4/5`, sayı ve pay), oy birliği (tüm malikler).
  Çekimser oy "kabul" sayılmaz (taban katılanlar ise fiilen ret etkisi) — parametre olarak açılabilir. Değerler avukat ve
  yönetim planıyla teyit edilmeli.
- **Toplantı nisabı**: maliklerin sayı **ve** arsa payı yarıdan fazlası (KMK m.30). İkinci toplantıda toplantı nisabı
  aranmaz; çağrı süresi ve ikinci toplantı kuralı mevzuat teyidine bağlı.
- Hazirun başladıktan sonra format ve karar türü değişmez. Format değişirse hukuki uyarı onayı sıfırlanır.
- **Çağrı**: hibrit/ön oylamada hukuki uyarı onaylanmadan gönderilmez. Maliklere (audience `owners_only`) uygulama + e-posta
  + SMS, **okuma onayı zorunlu** duyuru olarak gider (istek 71); ispat raporu o duyurunun okuma raporudur. Vekillere gönderim
  ve tebliğ tutanağı PDF'i sonraki adım. Bir toplantıya tek çağrı.
- Uzaktan katılım/oy, ön oylama penceresi ve dijital vekâlet **hukuki teyit (avukat sorusu 2.4) ve SMS doğrulaması (K5)**
  gelene kadar kapalı; ekranda bu açıkça yazıyor.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Kurul dışı toplantı | 409 `not_general` | "Genel kurul işlemleri yalnız genel kurul toplantılarında." |
| Başladıktan sonra değişiklik | 409 `started` | … |
| Uyarı onayı yok | 409 `legal_ack_required` | "Hibrit / ön oylama formatında önce hukuki geçerlilik uyarısını onaylayın." |
| Çağrı zaten | 409 `already_sent` | … |
| Alanlar | 422 `fields.format/item_types.{id}/body/proxy_limit` | … |

## Yetki
`meetings.manage`.
