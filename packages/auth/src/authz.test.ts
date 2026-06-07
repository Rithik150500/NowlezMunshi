import { describe, expect, it } from "vitest";
import { can, ROLE_PERMISSIONS } from "./authz";

describe("RBAC policy", () => {
  it("grades the roles principal > associate > clerk", () => {
    // clerk — the office legwork: read + routine data entry, nothing external or destructive.
    expect(can("clerk", "read")).toBe(true);
    expect(can("clerk", "write")).toBe(true);
    expect(can("clerk", "notify")).toBe(false);
    expect(can("clerk", "delete")).toBe(false);

    // associate — adds client outreach, still cannot delete records.
    expect(can("associate", "notify")).toBe(true);
    expect(can("associate", "delete")).toBe(false);

    // principal — the firm owner: everything.
    expect(can("principal", "read")).toBe(true);
    expect(can("principal", "write")).toBe(true);
    expect(can("principal", "notify")).toBe(true);
    expect(can("principal", "delete")).toBe(true);
  });

  it("is a strict ladder — each role's permissions include the one below", () => {
    const clerk = ROLE_PERMISSIONS.clerk;
    const associate = ROLE_PERMISSIONS.associate;
    const principal = ROLE_PERMISSIONS.principal;
    expect(clerk.every((p) => associate.includes(p))).toBe(true);
    expect(associate.every((p) => principal.includes(p))).toBe(true);
  });
});
