# [Servis] KVKK: ilgili kişi başvurusu, 30 gün sayacı ve aydınlatma metni sürümleri

Kaynak: Yazılım Dokümanı **RAP-04** ve **18.2** (KVKK).

## Ekran
- **KVKK** (`/kvkk`) → **Başvurular**: kart başına tür, kişi, bölüm, açıklama, son gün ve kalan gün (7 gün ve altı kırmızı);
  erişim başvurusunda **Kişisel veri paketi (JSON)**; yanıt: sonuç (yerine getirildi / kısmen / reddedildi), silmede saklanan
  kayıtlar ve dayanağı, gerekçeli yanıt. → **Aydınlatma metni**: yeni sürüm yayınla (metin + değişiklik özeti), sürüm geçmişi.
- **Sakin → Kişisel verilerim** (`/sakin/{slug}/kvkk`): başvuru (erişim / düzeltme / silme / itiraz + açıklama), aydınlatma metni
  bağlantısı (yeni sekme), başvurularım ve yanıtları.

## Uç nokta
- `POST …/resident/privacy-requests` — `{ kind: "access|rectify|erase|object", detail }` · `GET …/resident/privacy-requests`
  (belgede `POST /api/v1/me/privacy-requests`)
- `GET …/privacy-requests` (açıklar önce, son güne göre; `days_left`) · `GET …/privacy-requests/{id}/data-package` · `POST …/privacy-requests/{id}/answer` — `{ response, outcome: "fulfilled|partial|rejected", retained }`
- `GET/POST …/privacy-notices` — `{ text, summary }` → `{ version, text, summary, published_at, published_by }`

## İş kuralları
- Başvuru anında **30 gün sayacı** başlar (`due_on`); yöneticiye görev, son 7 gün ve gecikmede uyarı (K5). Aynı türde açık
  başvuru varken yenisi açılmaz. Erişim dışındaki başvurularda açıklama zorunlu.
- **Erişim**: kişisel veri paketi (JSON + PDF) — kişi, bölümler, hesaplar, son hareketler; sahte serviste başvuru anındaki
  görüntü. Backend kişiye ait tüm kayıtları (talepler, ziyaretçi, araç, hane, rıza kayıtları) kapsamalı.
- **Silme**: finansal kayıtlar yasal saklama süresince silinmez; sonuç "yerine getirildi" değilse **saklanan kayıtlar ve
  dayanağı zorunlu**; diğerleri silinir ya da anonimleşir.
- Yanıt kişiye gider (K5); hepsi denetim kaydına yazılır.
- **Aydınlatma metni**: Türkçe bağlayıcı metin sürümlenir (≥ 200 karakter), eski sürümler saklanır; çeviriler sonra. Belgedeki
  "metin değişince yeniden onay" ve girişi onaya bağlama kurgusu hukuki teyide bağlı (ortaklara soru 2.1: aydınlatma
  bilgilendirmedir, onay kutusu gerekmez) — uygulanmadı. Herkese açık `/aydinlatma` sayfası son sürümü göstermeli.
- **Saklama politikası** (kategori × süre) ve VERBİS veri envanteri dökümü K8 kararına bağlı.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Alanlar | 422 `fields.kind/detail` | "Talebinizi kısaca açıklayın." |
| Açık başvuru | 409 `already_open` | "Aynı türde açık başvurunuz var." |
| Sakin değil | 403 `forbidden` | … |
| Yanıt | 422 `fields.response/outcome/retained` | "Saklanan kayıtları ve yasal dayanağı yazın …" |
| Yanıtlanmış | 409 `invalid_status` | … |
| Metin | 422 `fields.text/summary` | "Aydınlatma metni çok kısa (en az 200 karakter)." |

## Yetki
Başvuru yönetimi ve metin `members.manage` (öneri: ayrı `privacy.manage`); sakin kendi başvuruları.
