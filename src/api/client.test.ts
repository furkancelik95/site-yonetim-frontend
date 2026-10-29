import { ApiError, VIEW_AS_HEADER, get, setMfaRequiredHandler, setSessionLostHandler, setViewAsEndedHandler, setViewAsSession, viewAsSession } from "./client";
import { safeBack } from "../pages/auth/authParts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("iki adımlı doğrulama bekleyen oturum (PLT-01 S2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setMfaRequiredHandler(null);
    setSessionLostHandler(null);
  });

  it("401 mfa_required: yenileme denenmez, kod ekranına geçilir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, { error: { code: "mfa_required", message: "İki adımlı doğrulama kodunu girin.", fields: null } }));
    vi.stubGlobal("fetch", fetchMock);
    const onMfa = vi.fn();
    const onLost = vi.fn();
    setMfaRequiredHandler(onMfa);
    setSessionLostHandler(onLost);
    await expect(get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(onMfa).toHaveBeenCalledOnce();
    expect(onLost).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce(); // /auth/refresh çağrılmadı
  });
});

describe("safeBack", () => {
  it("yalnız uygulama içi adrese döner", () => {
    expect(safeBack("/s/aksu")).toBe("/s/aksu");
    expect(safeBack("//kotu.example")).toBeNull();
    expect(safeBack("https://kotu.example")).toBeNull();
    expect(safeBack(null)).toBeNull();
  });
});

describe("sakin olarak görüntüleme başlığı (PLT-12)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setViewAsSession(null);
  });
  const headerOf = (call: unknown[]) => (call[1] as RequestInit & { headers: Record<string, string> }).headers[VIEW_AS_HEADER];

  it("yalnız o sitenin isteklerine X-View-As-Session eklenir", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(200, {})));
    vi.stubGlobal("fetch", fetchMock);
    setViewAsSession("aksu", "s-1");
    await get("/sites/aksu/resident/home");
    await get("/sites/baska/resident/home");
    await get("/me");
    await get("/sites/aksu"); // site bilgisi (izinler) de sakinin erişimiyle gelsin
    await get("/sites/aksu-2/resident/home");
    expect(headerOf(fetchMock.mock.calls[0]!)).toBe("s-1");
    expect(headerOf(fetchMock.mock.calls[1]!)).toBeUndefined();
    expect(headerOf(fetchMock.mock.calls[2]!)).toBeUndefined();
    expect(headerOf(fetchMock.mock.calls[3]!)).toBe("s-1");
    expect(headerOf(fetchMock.mock.calls[4]!)).toBeUndefined();
  });

  it("403 view_as_ended oturumu bırakır", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(403, { error: { code: "view_as_ended", message: "Sona erdi.", fields: null } })));
    setViewAsSession("aksu", "s-1");
    const onEnded = vi.fn();
    setViewAsEndedHandler(onEnded);
    setViewAsSession("aksu", "s-1", { personName: "Ayşe" });
    await expect(get("/sites/aksu/resident/home")).rejects.toBeInstanceOf(ApiError);
    expect(viewAsSession()).toBeNull();
    expect(onEnded).toHaveBeenCalledWith({ slug: "aksu", sessionId: "s-1", personName: "Ayşe" });
    setViewAsEndedHandler(null);
  });
});
