// Sakin olarak görüntülemede (view_as) sakinin bildirimleri ve KVKK ekranı salt okunur açılır.
import { screen } from "@testing-library/react";
import { NotificationsPage } from "../NotificationsPage";
import { mockApi, renderSite } from "../../test/utils";
import { ResidentPrivacyPage } from "./ResidentRecordsPages";

afterEach(() => vi.unstubAllGlobals());

const viewAs = { access_mode: "view_as", read_only: true } as const;

const notifs = {
  items: [{ id: "n-1", category: "info", title: "Aidat tahakkuku", body: null, kind: "charge", entity_type: null, entity_id: null, created_at: "2026-10-28T09:00:00Z", read_at: null }],
  total: 1, page: 1, page_size: 30, unread_count: 1,
};

const privacy = { notice: null, accepted: [], explicit: [] };

describe("Bildirimler, görüntülemede", () => {
  it("normal oturumda okundu düğmeleri var", async () => {
    mockApi({ "GET /sites/aksu/notifications": notifs });
    renderSite(<NotificationsPage staff={false} />);
    expect(await screen.findByText("Aidat tahakkuku")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aidat tahakkuku: okundu say" })).toBeInTheDocument();
  });

  it("sakinin bildirimlerini gösterir, okundu işaretlemez", async () => {
    mockApi({ "GET /sites/aksu/notifications": notifs });
    renderSite(<NotificationsPage staff={false} />, { site: viewAs });
    expect(await screen.findByText("Aidat tahakkuku")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /okundu/i })).not.toBeInTheDocument();
  });
});

describe("Kişisel verilerim, görüntülemede", () => {
  const routes = { "GET /sites/aksu/my-privacy": privacy, "GET /sites/aksu/resident/privacy-requests": { items: [], total: 0, page: 1, page_size: 50 } };

  it("normal oturumda veri indirme düğmesi var", async () => {
    mockApi(routes);
    renderSite(<ResidentPrivacyPage />);
    expect(await screen.findByRole("button", { name: /Verilerimi indir/ })).toBeInTheDocument();
  });

  it("görüntülemede veri indirme düğmesi yok", async () => {
    mockApi(routes);
    renderSite(<ResidentPrivacyPage />, { site: viewAs });
    expect(await screen.findByText("Site henüz aydınlatma metni yayınlamadı.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Verilerimi indir/ })).not.toBeInTheDocument();
  });
});
