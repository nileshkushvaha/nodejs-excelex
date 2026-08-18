import { describe, expect, it } from "vitest";

import { PERMISSION_KEYS } from "./catalogue";
import { POLICIES, permissionFor, unknownPolicyPermissions } from "./policies";
import { resolvePermissions } from "./resolve";

describe("policies", () => {
  it("names only permissions the catalogue defines", () => {
    // A policy pointing at a permission that does not exist would be a route
    // nobody can call: the guard would look for a grant no role can hold.
    expect(unknownPolicyPermissions()).toEqual([]);
  });

  it("gives every resource a view action", () => {
    for (const [resource, policy] of Object.entries(POLICIES)) {
      expect(policy, `${resource} must be viewable`).toHaveProperty("view");
    }
  });

  it("never lets export need more than view", () => {
    // Export is a read. If it ever required manage, a read-only auditor would
    // be unable to take the list they are allowed to look at.
    for (const resource of Object.keys(POLICIES) as Array<keyof typeof POLICIES>) {
      const view = permissionFor(resource, "view");
      const exported = permissionFor(resource, "export");
      expect(exported, `${resource}.export`).toBe(view);
    }
  });

  it("never lets import need less than update", () => {
    // An import writes. Letting it run on a view permission would be a way to
    // edit the master without the permission to edit the master.
    for (const resource of Object.keys(POLICIES) as Array<keyof typeof POLICIES>) {
      expect(permissionFor(resource, "import"), `${resource}.import`).toBe(
        permissionFor(resource, "update"),
      );
    }
  });

  it("keeps reference data unwritable by any real permission", () => {
    // Countries and states are platform-owned. Their write actions name a
    // permission the catalogue does not grant, so no role can hold it.
    const catalogued = new Set<string>(PERMISSION_KEYS);
    for (const resource of ["country", "state"] as const) {
      for (const action of ["create", "update", "delete", "import"] as const) {
        expect(catalogued.has(permissionFor(resource, action))).toBe(false);
      }
    }
  });

  it("throws on a resource and action pair it does not define", () => {
    expect(() => permissionFor("customer", "publish" as never)).toThrow(/No policy/);
  });

  it("resolves a granted action and refuses one that is denied", () => {
    const grants = {
      roles: [{ roleId: "r1", permissions: ["masters.customer.view"], branchIds: [] }],
      direct: [],
    };
    const resolved = resolvePermissions(grants);

    expect(resolved.has(permissionFor("customer", "view"))).toBe(true);
    expect(resolved.has(permissionFor("customer", "delete"))).toBe(false);
  });
});
