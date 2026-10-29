// Yönetim ekranlarında yeni bağlanan uçlar: poliçe ve sayaç düzenleme (PATCH), hane üyesi yetkileri,
// talebi ana olaydan ayırma, karne geçmişi ve geçerli işletme projesi.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Schemas } from "../../api/types";
import { mockApi, renderSite } from "../../test/utils";
import { BudgetPage } from "./BudgetPage";
import { ScorecardHistory } from "./ContractDetailPage";
import { InsurancePage, MetersPage } from "./OpsPages";
import { MergeCard } from "./RequestExtras";
import { HouseholdCard } from "./UnitDetailPage";

afterEach(() => vi.unstubAllGlobals());

const policy = {
  id: "pol-1", kind: "building", insurer: "Anadolu Sigorta", policy_no: "PN-1", coverage: null, premium: "12500.00",
  start: "2026-01-01", end: "2026-12-31", area: null, note: null, days_left: 63, warning: null, documents: [],
};

describe("Sigorta: poliçe düzenleme", () => {
  it("poliçeyi mevcut değerlerle açar ve PATCH ile kaydeder", async () => {
    const api = mockApi({
      "GET /sites/aksu/insurance-policies": [policy],
      "GET /sites/aksu/insurance-claims": [],
      "PATCH /sites/aksu/insurance-policies/pol-1": { data: { ...policy, insurer: "Axa" }, message: "Poliçe güncellendi." },
    });
    renderSite(<InsurancePage />, { site: { permissions: ["expenses.read", "expenses.manage"] } });
    fireEvent.click(await screen.findByRole("button", { name: /poliçesini düzenle/ }));
    const insurer = screen.getByLabelText(/Sigortacı/);
    expect(insurer).toHaveValue("Anadolu Sigorta");
    expect(screen.getByLabelText(/Prim/)).toHaveValue("12.500,00");
    fireEvent.change(insurer, { target: { value: "Axa" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await screen.findByText("Poliçe güncellendi.");
    const patch = api.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toMatchObject({ insurer: "Axa", premium: "12500.00", start: "2026-01-01", end: "2026-12-31" });
  });

  it("yönetme izni yoksa düzenle düğmesi yok", async () => {
    mockApi({ "GET /sites/aksu/insurance-policies": [policy], "GET /sites/aksu/insurance-claims": [] });
    renderSite(<InsurancePage />, { site: { permissions: ["expenses.read"] } });
    await screen.findByText("Anadolu Sigorta", { exact: false });
    expect(screen.queryByRole("button", { name: /poliçesini düzenle/ })).not.toBeInTheDocument();
  });
});

describe("Sayaçlar: sayaç düzenleme", () => {
  const meter = { id: "m-1", kind: "cold_water", serial: "SU-001", unit_id: "u-1", unit_name: "A-1", area: null, unit_label: "m³", multiplier: "1", installed_on: null, status: "active", replaced_by: null };
  it("durumu arızalı yapıp PATCH gönderir", async () => {
    const api = mockApi({
      "GET /sites/aksu/meter-readings": { period: "2026-10", rows: [{ meter, reading: null, last: null }], missing: 1 },
      "GET /sites/aksu/operation-settings": { meter_anomaly_percent: 50, meter_photo_required: false },
      "PATCH /sites/aksu/meters/m-1": { data: { ...meter, status: "faulty" }, message: "Sayaç güncellendi." },
    });
    renderSite(<MetersPage />, { site: { permissions: ["units.manage"] } });
    fireEvent.click(await screen.findByRole("button", { name: "SU-001 sayacını düzenle" }));
    expect(screen.getByLabelText(/Seri no/)).toHaveValue("SU-001");
    fireEvent.change(screen.getByLabelText("Durum"), { target: { value: "faulty" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await screen.findByText("Sayaç güncellendi.");
    expect(api.calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ serial: "SU-001", unit_id: "u-1", status: "faulty" });
  });
});

describe("Bölüm: hane üyesi yetkileri", () => {
  const member = { id: "h-1", unit_id: "u-1", unit_name: "A-1", full_name: "Zeynep Kaya", phone: "+905321112233", permissions: { visitors: true, packages: true, reservations: false, requests: false }, invited_by: "Ali", status: "active", invite_link: null, created_at: "2026-10-01T10:00:00Z", ended_at: null };
  it("yetkileri değiştirip PATCH /household/{id} gönderir", async () => {
    const api = mockApi({
      "GET /sites/aksu/units/u-1/household": [member, { ...member, id: "h-2", full_name: "Eski Üye", status: "ended" }],
      "PATCH /sites/aksu/household/h-1": { data: member, message: "Zeynep Kaya yetkileri güncellendi." },
    });
    renderSite(<HouseholdCard unitId="u-1" />, { site: { permissions: ["people.manage"] } });
    const rows = await screen.findAllByRole("button", { name: /Yetkiler/ });
    expect(rows).toHaveLength(1); // bitmiş üyelikte düzenleme yok
    fireEvent.click(rows[0]!);
    const form = screen.getByRole("group", { name: /Zeynep Kaya — yetkiler/ });
    fireEvent.click(within(form).getByRole("checkbox", { name: "Talep açma" }));
    fireEvent.click(screen.getByRole("button", { name: "Yetkileri kaydet" }));
    await screen.findByText("Zeynep Kaya yetkileri güncellendi.");
    expect(api.calls.find((c) => c.method === "PATCH")!.body).toEqual({ permissions: { visitors: true, packages: true, reservations: false, requests: true } });
  });
});

describe("Talep: ana olaydan ayırma", () => {
  const base = { id: "r-1", outage: { id: "o-1", title: "Asansör arızası", public_description: "", status: "open" } } as unknown as Schemas["RequestDetail"];
  it("açık ana olaydan talebi ayırır", async () => {
    const api = mockApi({
      "GET /sites/aksu/requests/r-1/merge-suggestions": { similar: [], open_outages: [], window_hours: 24 },
      "POST /sites/aksu/outages/o-1/unlink": { data: {}, message: "Bağlantı kaldırıldı." },
    });
    renderSite(<MergeCard r={base} />, { site: { permissions: ["requests.assign"] } });
    fireEvent.click(screen.getByRole("button", { name: "Ana olaydan ayır" }));
    fireEvent.click(screen.getByRole("button", { name: "Ayır" }));
    await screen.findByText("Bağlantı kaldırıldı.");
    expect(api.calls.find((c) => c.path.endsWith("/unlink"))!.body).toEqual({ request_id: "r-1" });
  });

  it("çözülmüş olayda ya da izin yokken düğme yok", () => {
    mockApi({});
    const { unmount } = renderSite(<MergeCard r={{ ...base, outage: { ...base.outage!, status: "resolved" } }} />, { site: { permissions: ["requests.assign"] } });
    expect(screen.queryByRole("button", { name: "Ana olaydan ayır" })).not.toBeInTheDocument();
    unmount();
    renderSite(<MergeCard r={base} />, { site: { permissions: ["requests.read"] } });
    expect(screen.queryByRole("button", { name: "Ana olaydan ayır" })).not.toBeInTheDocument();
  });
});

describe("Sözleşme: karne geçmişi", () => {
  it("sayfalı karne listesini gösterir", async () => {
    const api = mockApi({
      "GET /sites/aksu/contracts/c-1/scorecards": { items: [{ period: "2026-09", total: 82, status: "finalized", penalty: "1500.00", penalty_status: "approved" }, { period: "2026-08", total: null, status: "draft", penalty: null, penalty_status: null }], page: 1, page_size: 12, total: 14 },
    });
    renderSite(<ScorecardHistory contractId="c-1" />);
    expect(await screen.findByText("2026-09")).toBeInTheDocument();
    expect(screen.getByText("14 dönem")).toBeInTheDocument();
    expect(screen.getByText("Taslak")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sayfalama" })).toBeInTheDocument();
    expect(api.calls[0]!.path).toBe("/sites/aksu/contracts/c-1/scorecards");
  });
});

describe("İşletme projesi: geçerli proje", () => {
  const plan = (id: string, status: string, fiscal_year: number) => ({ id, name: `${fiscal_year} projesi`, fiscal_year, status, total: "0.00" });
  it("varsayılan olarak backend'in geçerli projesini açar", async () => {
    const api = mockApi({
      "GET /sites/aksu/budget-plans": { items: [plan("p-27", "draft", 2027), plan("p-26", "finalized", 2026), plan("p-25", "finalized", 2025)], page: 1, page_size: 50, total: 3 },
      "GET /sites/aksu/budget-plans/current": { id: "p-26" },
    });
    renderSite(<BudgetPage />, { site: { permissions: ["finance.read"] } });
    await waitFor(() => expect(api.calls.some((c) => c.path === "/sites/aksu/budget-plans/p-26")).toBe(true));
    expect(screen.getByRole("option", { name: /2026 projesi .*\(geçerli\)/ })).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === "/sites/aksu/budget-plans/p-27")).toBe(false);
  });

  it("kesinleşmiş proje yoksa (404) en yeni projeyi açar", async () => {
    const api = mockApi({ "GET /sites/aksu/budget-plans": { items: [plan("p-27", "draft", 2027)], page: 1, page_size: 50, total: 1 } });
    renderSite(<BudgetPage />, { site: { permissions: ["finance.read"] } });
    await waitFor(() => expect(api.calls.some((c) => c.path === "/sites/aksu/budget-plans/p-27")).toBe(true));
  });
});
