// Sakin ekranında yeni bağlanan uçlar: park yerim, duyuru ayrıntısı + okundu, şeffaflık raporu ayrıntısı.
import { render, screen, waitFor } from "@testing-library/react";
import { SiteUnread } from "../../layouts/AppShell";
import { mockApi, renderSite } from "../../test/utils";
import { MyParkingSpaces } from "./ResidentHouseholdPages";
import { ResidentAnnouncementPage } from "./ResidentPages";
import { ResidentTransparencyReportPage } from "./ResidentTransparencyPage";

afterEach(() => vi.unstubAllGlobals());

describe("Park yerim", () => {
  it("bugünkü tahsisleri gösterir", async () => {
    mockApi({
      "GET /sites/aksu/resident/parking-spaces": [
        { id: "ps-1", code: "P-12", kind: "ev", location: "B2 kat", is_paid: true, is_active: true, note: null, current: { allocation_id: "a-1", unit_id: "u-1", unit_name: "A-3", start_date: "2026-01-01", end_date: null } },
      ],
    });
    renderSite(<MyParkingSpaces />);
    expect(await screen.findByText("P-12")).toBeInTheDocument();
    expect(screen.getByText("Elektrikli araç")).toBeInTheDocument();
    expect(screen.getByText("B2 kat · A-3")).toBeInTheDocument();
    expect(screen.getByText(/01\.01\.2026 tarihinden beri/)).toBeInTheDocument();
  });

  it("tahsis yoksa boş durumu söyler", async () => {
    mockApi({ "GET /sites/aksu/resident/parking-spaces": [] });
    renderSite(<MyParkingSpaces />);
    expect(await screen.findByText("Size tahsisli park yeri yok")).toBeInTheDocument();
  });
});

const ann = {
  id: "an-1", title: "Su kesintisi", body: "Yarın 10:00–14:00 arası su kesilecek.", importance: "important", audience: "all_residents", audience_block_ids: [],
  published_at: "2026-10-28T09:00:00Z", scheduled_for: null, expires_on: null, published_by: "Yönetim", is_pinned: false, requires_ack: false, ack_deadline: null,
  read_at: null, acked_at: null, recipient_count: null, read_count: null, ack_count: null,
};

describe("Duyuru ayrıntısı", () => {
  it("açılınca bir kez okundu işaretler", async () => {
    const api = mockApi({
      "GET /sites/aksu/announcements/an-1": ann,
      "POST /sites/aksu/announcements/an-1/read": { read_at: "2026-10-29T10:00:00Z" },
    });
    renderSite(<ResidentAnnouncementPage />, { path: "/sakin/aksu/duyurular/an-1", pattern: "/sakin/:slug/duyurular/:annId" });
    expect(await screen.findByRole("heading", { name: "Su kesintisi" })).toBeInTheDocument();
    await waitFor(() => expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(api.calls.find((c) => c.method === "POST")!.path).toBe("/sites/aksu/announcements/an-1/read");
  });

  it("salt okunur görüntülemede (view_as) işaretlemez", async () => {
    const api = mockApi({ "GET /sites/aksu/announcements/an-1": ann });
    renderSite(<ResidentAnnouncementPage />, { path: "/sakin/aksu/duyurular/an-1", pattern: "/sakin/:slug/duyurular/:annId", site: { access_mode: "view_as", read_only: true } });
    await screen.findByRole("heading", { name: "Su kesintisi" });
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("Şeffaflık raporu ayrıntısı", () => {
  it("yayınlanmamış ya da olmayan raporda bulunamadı gösterir", async () => {
    mockApi({});
    renderSite(<ResidentTransparencyReportPage />, { path: "/sakin/aksu/seffaflik/r-9", pattern: "/sakin/:slug/seffaflik/:reportId" });
    expect(await screen.findByText("Bulunamadı")).toBeInTheDocument();
  });
});

describe("Menüde site başına okunmamış bildirim", () => {
  it("sayıyı metinle verir, sıfırda gizlenir", () => {
    const { rerender } = render(<SiteUnread count={3} />);
    expect(screen.getByText(", 3 okunmamış bildirim")).toBeInTheDocument();
    rerender(<SiteUnread count={0} />);
    expect(screen.queryByText(/okunmamış/)).not.toBeInTheDocument();
  });
});
