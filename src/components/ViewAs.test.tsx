import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { VIEW_AS_HEADER, get, setViewAsSession, viewAsSession } from "../api/client";
import { FormError } from "./ui";
import { ViewAsBar, ViewAsButton, ViewAsSettingsCard } from "./ViewAs";
import { json, mockApi, renderSite } from "../test/utils";
import { ApiError } from "../api/client";

const session = {
  id: "va-1", person_id: "p-1", person_name: "Ayşe Yılmaz", viewer_name: "Yönetici", reason: "Borç ekranı şikâyeti",
  started_at: "2026-10-29T10:00:00Z", ends_at: "2026-10-29T10:30:00Z", status: "active", resident_notified: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  setViewAsSession(null);
});

describe("Sakin olarak görüntüle düğmesi (PLT-12)", () => {
  it("izin yoksa görünmez", () => {
    mockApi({});
    renderSite(<ViewAsButton personId="p-1" personName="Ayşe Yılmaz" />, { site: { permissions: ["people.read"] } });
    expect(screen.queryByRole("button", { name: /Sakin olarak görüntüle/ })).not.toBeInTheDocument();
  });

  it("zaten görüntüleme içindeyken görünmez", () => {
    mockApi({});
    renderSite(<ViewAsButton personId="p-1" personName="Ayşe Yılmaz" />, { site: { permissions: ["support.view_as_resident"], access_mode: "view_as" } });
    expect(screen.queryByRole("button", { name: /Sakin olarak görüntüle/ })).not.toBeInTheDocument();
  });

  it("gerekçeyle oturum açar, başlığı takar ve sakin ekranına geçer", async () => {
    const api = mockApi({ "POST /sites/aksu/people/p-1/view-as-sessions": { data: session, message: "Ayşe Yılmaz olarak 30 dakika salt okunur görüntülüyorsunuz." } });
    renderSite(<ViewAsButton personId="p-1" personName="Ayşe Yılmaz" />, { site: { permissions: ["support.view_as_resident"] }, path: "/s/aksu/kisiler?q=ay" });
    fireEvent.click(screen.getByRole("button", { name: /Sakin olarak görüntüle/ }));
    fireEvent.change(screen.getByLabelText(/Gerekçe/), { target: { value: "  Borç ekranı şikâyeti  " } });
    fireEvent.click(screen.getByRole("button", { name: "Görüntülemeyi başlat" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sakin/aksu"));
    const post = api.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ reason: "Borç ekranı şikâyeti" });
    expect(post.headers[VIEW_AS_HEADER]).toBeUndefined();
    expect(viewAsSession()).toEqual({ slug: "aksu", sessionId: "va-1", personName: "Ayşe Yılmaz", endsAt: session.ends_at, returnTo: "/s/aksu/kisiler?q=ay" });
  });

  it("backend alan hatasını gerekçenin altında gösterir", async () => {
    mockApi({ "POST /sites/aksu/people/p-1/view-as-sessions": json(422, { error: { code: "validation_error", message: "Formu kontrol edin.", fields: { reason: "En az 10 karakter." } } }) });
    renderSite(<ViewAsButton personId="p-1" personName="Ayşe Yılmaz" />, { site: { permissions: ["support.view_as_resident"] } });
    fireEvent.click(screen.getByRole("button", { name: /Sakin olarak görüntüle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Görüntülemeyi başlat" }));
    expect(await screen.findByText("En az 10 karakter.")).toBeInTheDocument();
    expect(viewAsSession()).toBeNull();
  });
});

describe("Görüntüleme bandı", () => {
  it("oturum yokken çizilmez", () => {
    mockApi({});
    renderSite(<ViewAsBar />);
    expect(screen.queryByRole("region", { name: "Sakin olarak görüntüleme" })).not.toBeInTheDocument();
  });

  it("kişiyi ve salt okunur olduğunu söyler; Çık oturumu kapatıp yönetici ekranına döner", async () => {
    const api = mockApi({ "DELETE /sites/aksu/view-as-sessions/va-1": { data: { ...session, status: "ended" }, message: "Sakin olarak görüntüleme kapatıldı." } });
    setViewAsSession("aksu", "va-1", { personName: "Ayşe Yılmaz", endsAt: session.ends_at, returnTo: "/s/aksu/kisiler" });
    renderSite(<ViewAsBar />, { path: "/sakin/aksu" });
    const bar = screen.getByRole("region", { name: "Sakin olarak görüntüleme" });
    expect(bar).toHaveTextContent("Ayşe Yılmaz olarak görüntülüyorsunuz");
    expect(bar).toHaveTextContent("Salt okunur");
    fireEvent.click(screen.getByRole("button", { name: /Çık/ }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/s/aksu/kisiler"));
    expect(viewAsSession()).toBeNull();
    const del = api.calls.find((c) => c.method === "DELETE")!;
    expect(del.path).toBe("/sites/aksu/view-as-sessions/va-1");
    expect(del.headers[VIEW_AS_HEADER]).toBeUndefined(); // süresi dolmuş oturum 403 almasın
    expect(await screen.findByText("Sakin olarak görüntüleme kapatıldı.")).toBeInTheDocument();
  });

  it("backend oturumu bitirirse (view_as_ended) bant kalkar ve dönülür", async () => {
    mockApi({ "GET /sites/aksu/resident/home": json(403, { error: { code: "view_as_ended", message: "Sona erdi.", fields: null } }) });
    setViewAsSession("aksu", "va-1", { personName: "Ayşe Yılmaz", returnTo: "/s/aksu/kisiler" });
    renderSite(<ViewAsBar />, { path: "/sakin/aksu" });
    await act(async () => { await get("/sites/aksu/resident/home").catch(() => undefined); });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/s/aksu/kisiler"));
    expect(screen.queryByRole("region", { name: "Sakin olarak görüntüleme" })).not.toBeInTheDocument();
    expect(screen.getByText("Sakin olarak görüntüleme oturumu sona erdi.")).toBeInTheDocument();
  });
});

describe("Salt okunur yazma reddi", () => {
  it("403 read_only formun üstünde açıklamayla gösterilir", () => {
    mockApi({});
    renderSite(<FormError error={new ApiError(403, "read_only", "Sakin olarak görüntüleme salt okunurdur; bu işlem yapılamaz.", null)} />);
    expect(screen.getByText("Salt okunur görünüm")).toBeInTheDocument();
    expect(screen.getByText(/salt okunurdur/)).toBeInTheDocument();
  });
});

describe("Sakine bildir ayarı", () => {
  it("ayarı okur ve değişikliği kaydeder", async () => {
    const api = mockApi({
      "GET /sites/aksu/settings/view-as": { notify_resident: true },
      "PUT /sites/aksu/settings/view-as": ({ body }: { body: unknown }) => ({ data: body, message: "Ayar kaydedildi." }),
    });
    renderSite(<ViewAsSettingsCard />, { site: { permissions: ["members.manage"] } });
    const box = await screen.findByRole("checkbox", { name: /Sakine bildir/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await screen.findByText("Ayar kaydedildi.");
    expect(api.calls.find((c) => c.method === "PUT")!.body).toEqual({ notify_resident: false });
  });
});
