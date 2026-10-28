import { ApiError, get, setMfaRequiredHandler, setSessionLostHandler } from "./client";
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
