// Ekran testleri için ortak düzen: sorgu istemcisi, bildirim, yönlendirici ve site bağlamı.
// Ağ `fetch` taklidiyle karşılanır: anahtar "YÖNTEM /api/v1/yol" (sorgu dizgisi hariç).
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ToastProvider } from "../components/toast";
import { makeSiteCtx, SiteContext, type SiteDetail } from "../site/SiteContext";

export function siteDetail(over: Partial<SiteDetail> = {}): SiteDetail {
  return {
    id: "site-1",
    name: "Aksu Konakları",
    slug: "aksu",
    property_kind: "site",
    city: null,
    district: null,
    role: "Yönetici",
    roles: [],
    permissions: [],
    scoped_permissions: [],
    modules: [],
    access_mode: "member",
    read_only: false,
    access_ends_at: null,
    view_as_person_name: null,
    ...over,
  } as SiteDetail;
}

type Handler = (req: { body: unknown; headers: Record<string, string>; url: string }) => unknown;
export interface ApiCall { method: string; path: string; body: unknown; headers: Record<string, string> }

export function json(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** `fetch` taklidi. İşleyici Response dönerse o, değilse 200 JSON gönderilir; eşleşmeyen istek 404. */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const path = url.replace(/^\/api\/v1/, "").split("?")[0]!;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path, body, headers });
    const key = `${method} ${path}`;
    if (!(key in routes)) return json(404, { error: { code: "not_found", message: "Bulunamadı.", fields: null } });
    const h = routes[key];
    const out = typeof h === "function" ? (h as Handler)({ body, headers, url }) : h;
    return out instanceof Response ? out : json(200, out);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

/** Site bağlamında ekranı çizer. `path` ilk adres; `pattern` ekranın rota kalıbı. */
export function renderSite(ui: ReactNode, opts: { site?: Partial<SiteDetail>; path?: string; pattern?: string } = {}) {
  const site = siteDetail(opts.site);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const path = opts.path ?? `/s/${site.slug}`;
  const result = render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <SiteContext.Provider value={makeSiteCtx(site)}>
            <Routes>
              <Route path={opts.pattern ?? "*"} element={ui} />
              <Route path="*" element={null} />
            </Routes>
            <LocationProbe />
          </SiteContext.Provider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, qc };
}
