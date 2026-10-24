# [Servis] Habersiz ziyaretçide sakin onayı ve görevli kararı

Kaynak: Yazılım Dokümanı **GUV-03**, §10.2.

## Ekran
- **Kapı ekranı → Habersiz ziyaretçi**: bölüm (kısıtlı arama), ad soyad, tür, plaka → yönteme göre "Kaydet ve içeri al"
  ya da "Sakinden onay iste"; talepler listesi (geri sayım; süre dolunca **Manuel karar**: içeri al / reddet + gerekçe).
- **Sakin → Ziyaretçiler → Kapıda bekleyen**: "İçeri alın / Almayın" (geri sayımlı); bugünkü kararlar.

## Uç nokta
- `POST /api/v1/sites/{slug}/visit-requests` — `{ unit_id, full_name, kind, plate, gate_id }`
  → `info` yönteminde ziyaretçi kaydı (`entered`) + sakine bilgi; `approval`'da talep `awaiting`
- `GET  …/visit-requests?status=awaiting` — bugünkü ve bekleyen talepler (`timed_out`, `seconds_left`)
- `POST …/visit-requests/{id}/decide` — görevli: `{ "decision": "allow|deny", "reason" }` (yalnız süre dolunca)
- `GET  …/resident/visit-approvals` · `POST …/resident/visit-approvals/{id}` — `{ "decision": "allow|deny" }` (belgede `/me/visit-approvals/{vid}`)

Talep: `{ id, unit_id, unit_name, full_name, kind, plate, gate_id, status: "awaiting|allowed|denied", decided_by, decision_source: "resident|guard", reason, created_at, expires_at, visitor_id }`.

## İş kuralları
- Yöntem: kapı istisnası → site ayarı (istek 40). Onay isteği bölümün malik/kiracı/oturanlarına ve ziyaretçi yetkili
  hane üyelerine gider; **sessiz saatleri aşar**; ilk yanıt geçerli.
- `expires_at = created_at + approval_timeout_seconds`. Süre içinde yalnız sakin karar verir (görevli 409 `awaiting_resident`);
  süre dolunca sakin karar veremez (409 `timed_out`), görevli diafon/telefonla ulaşır ve **gerekçeli** karar girer.
- `allow` → ziyaretçi kaydı `entered`; `deny` → reddedildi kaydı, sakine bilgi. Bildirim gönderimi K5 (şimdilik uygulama içi).
- Tam T.C. kimlik no alınmaz. Her karar denetim kaydına yazılır.
- Not: "bugün" süzgeci tesisin yerel saat dilimine göre (UTC değil) — gece yarısı sonrası kayıtlar aynı güne düşmeli.

## Hata durumları
| Durum | Kod | Mesaj |
|---|---|---|
| Sakin yanıtı bekleniyor | 409 `awaiting_resident` | "Sakin yanıtı bekleniyor; süre dolunca karar verebilirsiniz." |
| Süre doldu (sakin) | 409 `timed_out` | "Süre doldu; görevli sizinle diafon/telefonla iletişime geçecek." |
| Gerekçe yok | 422 `fields.reason` | "Kararınızın gerekçesini yazın…" |
| Karar verilmiş | 409 `already_decided` | … |

## Yetki
Görevli `security.visitors`; sakin uçları oturum sahibi.

## Kabul kriterleri
- [ ] 90 sn içinde yanıt yoksa görevli ekranında manuel karar açılır
- [ ] Sakin onayı ziyaretçiyi içeri alır, görevli ekranında "sakin: …" görünür
