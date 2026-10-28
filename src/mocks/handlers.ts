// Henüz backend'de olmayan uçların sahte karşılıkları (MSW). Yeni bir servis isteği açıldığında
// handler buraya, docs/servis-istekleri/ altındaki "Beklenen yanıt" örneğiyle AYNI şekilde yazılır;
// servis gelince silinir. Diğer bütün istekler gerçek backend'e gider (onUnhandledRequest: "bypass").
//
// Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26, YAP-01..10) backend'de; buradan kaldırıldı.
// Yalnız diğer sahte paketlerin kullandığı ortak alan ve araç önbelleği kaldı (aşağıda).
// Güvenlik ve devriye (40–46: kapılar, ön davet, sakin onayı, plaka/ihlal, kargo yetkilisi, nöbet defteri,
// devriye) ve park yerleri (K30) backend'de — sahte uçları silindi (25.10.2026).
//
// Rezervasyon 59–61 (alanlar ve kurallar, sakin/sakin adına rezervasyon, bekleme listesi, kod/QR ile giriş,
// no-show, kullanım raporu; K11 borçlu bölüm kısıtı) backend'de — sahte uçları silindi (27.10.2026).
// Genel kurul 75–77 (hazırlık ve çağrı, hazirun/vekâlet/nisap/salonda oylama, tutanak ve karar
// defteri) backend'de — sahte uçları silindi (27.10.2026).
//
// Backend'e geçti, handler'ı kaldırıldı: Sözleşme performansı 68–70 (KPI, ceza ve artış kuralı,
// aylık karne ve ceza kesintisi, endeksli artış ve platform endeks değerleri; 27.10.2026).
// Satın alma 62–67 (tedarikçi kartı, ayar ve bütçe, talep/
// teklif/tedarikçi linki/onay, sipariş ve kabul, tedarikçi faturası ve üçlü eşleşme, ödenecekler).
// İletişim ve acil durum 71–74 (okuma onayı ve raporu, zamanlanmış
// duyuru, bildirim/duyuru şablonları, acil durum modu ve pano, toplanma yoklaması, acil bilgi kartı) — P12;
// 71'in sessiz saat ayarı (`communication-settings`; P16c kimlik ve bildirim gönderimi ile — SMS hesabı,
// teslim kayıtları, planlı raporlar). Raporlar ve KVKK 79–81 (rapor kataloğu, talep/SLA raporu, KVKK başvurusu, aydınlatma
// metni sürümleri, saklama politikası, denetim paketi). İnsan kaynakları 35–39 (sicil no ve açık işler, vardiya planı,
// izinler, puantaj, puantaj aktarımı; K29 personel hesabı ve giriş-çıkış dahil); Finans Mod P 27–34
// (dönem kapanışı ve kilit, kasa gün sonu, borç takibi, ödeme planı, dönem dışı ücretler, muhasebe
// aktarımı, finans parametreleri, tahakkuk fark raporu). Finans motoru P03b (otomatik tahakkuk 04, finans
// parametreleri 33, fark raporu 34; aidat kuralları, tahakkuk taslak/onay ve satır düzeltme, yıllık bütçe)
// baştan gerçek uçlarla bağlandı — burada sahte karşılığı yok.
// Platform destek 82–84 (destek talepleri, bilgi bankası, müşteri onaylı destek oturumu) backend'de —
// sahte uçları silindi (P15, 27.10.2026).
import { bypass, http, type RequestHandler } from "msw";

const API = "/api/v1/sites/:slug";

/** Gerçek backend'e aynı oturum başlığıyla istek — sahte uç gerçek veriye dayansın. */
async function real<T>(request: Request, path: string, init?: { method?: string; body?: unknown; idem?: string }) {
  const headers = new Headers({ Authorization: request.headers.get("Authorization") ?? "", Accept: "application/json" });
  if (init?.body !== undefined) headers.set("Content-Type", "application/json");
  if (init?.idem) headers.set("Idempotency-Key", init.idem);
  const res = await fetch(bypass(new Request(new URL(path, request.url), { method: init?.method ?? "GET", headers, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined })));
  return { status: res.status, body: (await res.json().catch(() => null)) as T | null };
}

// Sahte servis verisi sekme kapanana kadar saklanır (sessionStorage): sayfa yenilenince kaybolmasın.
const STORE_KEY = "sy-mock-state";
const stores = new Map<string, Map<string, unknown>>();
function loadMap<K extends string, V>(name: string): Map<K, V> {
  let saved: Record<string, [K, V][]> = {};
  try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "{}"); } catch { /* bozuk ya da erişilemez */ }
  const m = new Map<K, V>(saved[name] ?? []);
  stores.set(name, m as Map<string, unknown>);
  return m;
}
/** Her sahte yanıttan sonra çağrılır (mocks/browser.ts). */
export function saveMockState() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries([...stores].map(([k, m]) => [k, [...m]])))); } catch { /* kota / gizli sekme */ }
}
interface Paged<T> { items: T[]; total: number; page: number; page_size: number }
/** Gerçek sayfalı listeyi sonuna kadar okur (yerel demo veri küçük; servis gelince gerekmez). */
async function allPages<T>(request: Request, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let p = 1; p <= 25; p++) {
    const r = await real<Paged<T>>(request, `${path}${path.includes("?") ? "&" : "?"}page=${p}&page_size=200`);
    if (!r.body) break;
    out.push(...r.body.items);
    if (out.length >= r.body.total || r.body.items.length === 0) break;
  }
  return out;
}

// ============================================================================================
// Yapı, Kişiler ve Kayıt paketi (servis istekleri 19–26) backend'de. Diğer sahte paketlerin
// kullandığı ortak alanlar ve araçlar gerçek uçlardan okunup buraya önbelleğe alınır
// (kapı/plaka sahte uçları bu listeye bakar).
// ============================================================================================
interface CommonArea { id: string; name: string; kind: string; block_id: string | null; block_name: string | null; is_reservable: boolean; is_active: boolean; note: string | null }
interface Vehicle { id: string; plate: string; plate_display: string; unit_id: string; unit_name: string; owner_name: string | null; kind: "permanent" | "guest"; valid_until: string | null; status: "active" | "pending" | "inactive" }
const commonAreas = loadMap<string, CommonArea[]>("commonAreas");
const vehicles = loadMap<string, Vehicle[]>("vehicles");

/** Kapı sahte uçlarından önce gerçek ortak alan ve araç listesini önbelleğe alır. */
async function syncShared(request: Request, slug: string) {
  const areas = await real<CommonArea[]>(request, `/api/v1/sites/${slug}/common-areas`);
  if (areas.status === 200 && areas.body) commonAreas.set(slug, areas.body);
  // Güvenlik rolü araç listesini okuyamaz (units.read yok): önbellekteki son liste kalır
  const probe = await real<Paged<Vehicle>>(request, `/api/v1/sites/${slug}/vehicles?status=active&page_size=1`);
  if (probe.status === 200) vehicles.set(slug, await allPages<Vehicle>(request, `/api/v1/sites/${slug}/vehicles?status=active`));
}
const SYNC_PATHS = /\/(plates\/lookup|gate-logs|parking-violations)(\/|$|\?)/;

const ortakOnbellek: RequestHandler[] = [
  http.all(`${API}/*`, async ({ request, params }) => {
    if (SYNC_PATHS.test(new URL(request.url).pathname)) await syncShared(request, String(params.slug));
    return undefined; // sonraki sahte uca ya da gerçek backend'e geçer
  }),
];

export const handlers: RequestHandler[] = [...ortakOnbellek];
