# [Servis] Site kullanıcıları ve roller

## Ekran
- Operasyon → **Kullanıcılar** (`/kullanicilar`): siteye erişen personel listesi, rol değiştirme,
  erişimi kapatma/açma, **Kullanıcı ekle** (geçici parola bir kez gösterilir).
- Altta rollerin ne yapabildiğini anlatan sabit liste.

Apsiyon: Yönetim → "Yetkililer", "Yetki Grupları". Apsiyon'da yetki grubu serbestçe tanımlanıyor;
bizde roller **sabit** (backend docs/05) — burada yalnızca kişiye rol veriliyor.

## Uç nokta
- `GET   /api/v1/sites/{slug}/roles` — sabit rol listesi (ad + kısa açıklama)
- `GET   /api/v1/sites/{slug}/members` — dizi (personel sayısı küçük; sayfalama gerekmez)
- `POST  /api/v1/sites/{slug}/members` — `{ "full_name": "…", "email": "…", "role_key": "accounting" }`
- `PATCH /api/v1/sites/{slug}/members/{id}` — `{ "role_key"?: "…", "is_active"?: false }`

## Beklenen yanıt
```json
[ { "key": "manager", "name": "Yönetici", "description": "Sitenin bütün işlemleri" } ]
```
```json
[
  { "id": "0192…", "full_name": "Selin Arı", "email": "muhasebe@demo.local", "role_key": "accounting", "role_name": "Muhasebe",
    "is_active": true, "source": "site", "last_login_at": null, "invited_at": "2026-10-05T12:00:00Z" }
]
```
Ekleme yanıtı (platformdaki müşteri ekleme akışıyla aynı kalıp):
```json
{ "data": { "member": { "…": "…" }, "temporary_password": "<tek seferlik geçici parola>" }, "message": "Test DENEME Muhasebe olarak eklendi." }
```
Güncellemede `{ "data": <member>, "message": "Test DENEME erişimi kapatıldı; oturumları sonlandırıldı." }`.

## İş kuralları
- Roller: `manager` Yönetici, `board` Yönetim Kurulu Üyesi, `auditor` Denetçi, `accounting` Muhasebe,
  `security` Güvenlik, `technical` Teknik Personel. İzinleri backend docs/05'teki tabloyla aynı.
- `source: "organization"`: erişim yönetim şirketi üyeliğinden türüyor → bu ekrandan değiştirilemez (409).
- E-posta zaten bir kullanıcıya aitse: yeni kullanıcı açılmaz, mevcut kullanıcıya bu sitede rol verilir;
  geçici parola dönmez (`temporary_password: null`) ve mesaj bunu söyler.
- Geçici parola yalnız bu yanıtta döner, kayıtta hash'li tutulur; ilk girişte parola değiştirme zorunlu.
- Erişimi kapatma: kullanıcının bu sitedeki oturumları/refresh token'ları geçersiz olur; kayıtlardaki adı kalır. Silme yok.
- Sitede en az bir etkin `manager` kalmalı (son yöneticiyi kapatma/rolünü düşürme 409).
- Her değişiklik denetim kaydına yazılır (kim, kime, hangi rol).
- Davet e-postası açık karar **K5** (e-posta sağlayıcısı) gelince; o zamana kadar parola elden iletilir.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Geçersiz e-posta / ad | 422 `fields.email` / `fields.full_name` | "Geçerli bir e-posta adresi girin." |
| Bilinmeyen rol | 422 `fields.role_key` | "Rol seçin." |
| Zaten bu sitede | 409 `already_member` | "Bu e-posta zaten sitede kullanıcı." |
| Türetilmiş üyelik | 409 `derived_membership` | "Bu erişim yönetim şirketi üyeliğinden geliyor; şirket ayarlarından değiştirilir." |
| Son yönetici | 409 `last_manager` | "Sitede en az bir etkin yönetici kalmalı." |

## Yetki
Tümü `members.manage`. Kullanıcı kendi rolünü değiştiremez / kendi erişimini kapatamaz (409).

## Kabul kriterleri
- [ ] Kapatılan kullanıcının açık oturumu bir sonraki istekte 401 alıyor
- [ ] Son yönetici kuralı hem rol düşürmede hem kapatmada çalışıyor
- [ ] Başka sitenin kullanıcısı 404; `members.manage` olmayan rol 403
- [ ] Geçici parola loglara ve denetim kaydına yazılmıyor
