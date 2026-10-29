import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError, get } from "../api/client";
import { json, mockApi } from "../test/utils";
import { StepUpDialog } from "./StepUpDialog";

const stepUp = () => json(403, { error: { code: "step_up_required", message: "Bu işlem için kimliğinizi yeniden doğrulayın (son 5 dakika).", fields: null } });

afterEach(() => vi.unstubAllGlobals());

describe("Hassas işlem doğrulaması (403 step_up_required)", () => {
  it("parolayla doğrulayınca reddedilen isteği yineler", async () => {
    let first = true;
    const api = mockApi({
      "GET /sites/aksu/hassas": () => (first ? ((first = false), stepUp()) : { ok: true }),
      "POST /auth/step-up": { data: { verified_at: "2026-10-29T10:00:00Z", valid_until: "2026-10-29T10:05:00Z" }, message: "Kimliğiniz doğrulandı." },
    });
    render(<StepUpDialog mfa={false} canSms={false} />);
    const result = get<{ ok: boolean }>("/sites/aksu/hassas");
    fireEvent.change(await screen.findByLabelText("Parola"), { target: { value: "gizli-parola" } });
    fireEvent.click(screen.getByRole("button", { name: "Doğrula ve devam et" }));
    await expect(result).resolves.toEqual({ ok: true });
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /sites/aksu/hassas", "POST /auth/step-up", "GET /sites/aksu/hassas"]);
    expect(api.calls[1]!.body).toEqual({ password: "gizli-parola", code: null });
  });

  it("vazgeçilirse istek 403 hatasıyla biter, yinelenmez", async () => {
    const api = mockApi({ "GET /sites/aksu/hassas": () => stepUp() });
    render(<StepUpDialog mfa={false} canSms={false} />);
    const result = get("/sites/aksu/hassas").catch((e: unknown) => e);
    fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
    const err = await result;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("step_up_required");
    expect(api.calls).toHaveLength(1);
  });

  it("2FA'sız telefonlu kullanıcı SMS kodu isteyip kodla doğrular", async () => {
    let first = true;
    const api = mockApi({
      "POST /sites/aksu/islem": () => (first ? ((first = false), stepUp()) : { data: {}, message: "Tamam." }),
      "POST /auth/step-up/code": { data: { sent_to: "+90 5** *** ** 12", expires_at: "2026-10-29T10:05:00Z", resend_after_seconds: 60 }, message: "Kod gönderildi." },
      "POST /auth/step-up": { data: { verified_at: "x", valid_until: "y" }, message: "Kimliğiniz doğrulandı." },
    });
    render(<StepUpDialog mfa={false} canSms />);
    const { api: call } = await import("../api/client");
    const result = call("POST", "/sites/aksu/islem", { body: { a: 1 } });
    fireEvent.click(await screen.findByRole("button", { name: /SMS kodu gönder/ }));
    await screen.findByText(/numarasına gönderildi/);
    fireEvent.change(screen.getByLabelText("ya da SMS kodu"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Doğrula ve devam et" }));
    await expect(result).resolves.toEqual({ data: {}, message: "Tamam." });
    await waitFor(() => expect(api.calls.filter((c) => c.path === "/sites/aksu/islem")).toHaveLength(2));
    expect(api.calls.find((c) => c.path === "/auth/step-up")!.body).toEqual({ password: null, code: "123456" });
  });
});
