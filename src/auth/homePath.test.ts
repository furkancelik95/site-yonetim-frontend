import { describe, expect, it } from "vitest";
import type { Me } from "../api/types";
import { homePath } from "./AuthContext";

const base: Me = {
  user_id: "u1",
  full_name: "Test",
  kind: "staff",
  is_platform_admin: false,
  can_see_portfolio: false,
  must_change_password: false,
  consent_required: false,
  sites: [{ site_id: "s1", name: "Aksu", slug: "aksu", role: "Yönetici", permissions: [], person_id: null, is_derived: false, organization_id: null, organization_role: null }],
};

describe("homePath — aydınlatma onayı (P6)", () => {
  it("onay bekleyen kullanıcı önce onay ekranına gider", () => {
    expect(homePath({ ...base, consent_required: true })).toBe("/aydinlatma-onayi");
  });
  it("geçici parola onaydan önce gelir", () => {
    expect(homePath({ ...base, consent_required: true, must_change_password: true })).toBe("/parola-degistir");
  });
  it("onaylı kullanıcı kendi sitesine gider", () => {
    expect(homePath(base)).toBe("/s/aksu");
  });
});
