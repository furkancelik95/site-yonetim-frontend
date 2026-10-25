import { isApprovalPending } from "./hooks";

describe("isApprovalPending", () => {
  it("202 onay yanıtını tanır (docs/12 K21)", () => {
    expect(isApprovalPending({ status: "approval_pending", approval_request_id: "abc" })).toBe(true);
  });
  it("kaydedilmiş ya da başka durumdaki veriyi onay saymaz", () => {
    expect(isApprovalPending({ status: "saved", rule: {} })).toBe(false);
    expect(isApprovalPending({ status: "approved" })).toBe(false);
    expect(isApprovalPending({ id: "1" })).toBe(false);
  });
  it("boş ve ilkel değerlerde hata vermez", () => {
    expect(isApprovalPending(undefined)).toBe(false);
    expect(isApprovalPending(null)).toBe(false);
    expect(isApprovalPending("approval_pending")).toBe(false);
  });
});
