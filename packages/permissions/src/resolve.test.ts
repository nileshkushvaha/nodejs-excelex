import { describe, expect, it } from "vitest";

import { permissionMatches, resolvePermissions, type GrantSet } from "./resolve";

const NOW = new Date("2026-08-17T00:00:00Z");
const YESTERDAY = new Date("2026-08-16T00:00:00Z");
const TOMORROW = new Date("2026-08-18T00:00:00Z");

function grants(overrides: Partial<GrantSet> = {}): GrantSet {
  return { roles: [], direct: [], ...overrides };
}

describe("permissionMatches", () => {
  it("matches an exact permission", () => {
    expect(permissionMatches("operations.shipment.create", "operations.shipment.create")).toBe(true);
    expect(permissionMatches("operations.shipment.create", "operations.shipment.cancel")).toBe(false);
  });

  it("treats * as everything", () => {
    expect(permissionMatches("*", "billing.invoice.finalise")).toBe(true);
  });

  it("expands a wildcard across whole segments", () => {
    expect(permissionMatches("operations.*", "operations.shipment.create")).toBe(true);
    expect(permissionMatches("operations.shipment.*", "operations.shipment.create")).toBe(true);
    expect(permissionMatches("operations.*", "billing.invoice.view")).toBe(false);
  });

  it("does not match a wildcard that stops mid-segment", () => {
    // The reason this matters: `operations.ship*` reads like it covers shipments
    // but is almost always a typo. Matching it would silently over-grant.
    expect(permissionMatches("operations.ship*", "operations.shipment.create")).toBe(false);
  });

  it("matches the prefix itself, not only its children", () => {
    expect(permissionMatches("reports.*", "reports.export")).toBe(true);
  });
});

describe("resolvePermissions", () => {
  it("grants what a role grants", () => {
    const resolved = resolvePermissions(
      grants({
        roles: [{ roleId: "r1", permissions: ["operations.shipment.view"], branchIds: [] }],
      }),
      { now: NOW },
    );

    expect(resolved.has("operations.shipment.view")).toBe(true);
    expect(resolved.has("operations.shipment.create")).toBe(false);
  });

  it("grants nothing by default", () => {
    expect(resolvePermissions(grants(), { now: NOW }).has("operations.dashboard.view")).toBe(false);
  });

  it("lets a direct ALLOW grant outside any role", () => {
    const resolved = resolvePermissions(
      grants({ direct: [{ permission: "billing.invoice.finalise", effect: "ALLOW" }] }),
      { now: NOW },
    );

    expect(resolved.has("billing.invoice.finalise")).toBe(true);
  });

  it("lets a DENY beat a role that grants it", () => {
    const resolved = resolvePermissions(
      grants({
        roles: [{ roleId: "r1", permissions: ["operations.manifest.reopen"], branchIds: [] }],
        direct: [{ permission: "operations.manifest.reopen", effect: "DENY" }],
      }),
      { now: NOW },
    );

    expect(resolved.has("operations.manifest.reopen")).toBe(false);
  });

  it("lets a DENY beat the super grant", () => {
    // The whole point of DENY: "administrator, except this one action".
    const resolved = resolvePermissions(
      grants({
        roles: [{ roleId: "admin", permissions: ["*"], branchIds: [] }],
        direct: [{ permission: "billing.invoice.cancel", effect: "DENY" }],
      }),
      { now: NOW },
    );

    expect(resolved.has("billing.invoice.cancel")).toBe(false);
    expect(resolved.has("billing.invoice.finalise")).toBe(true);
  });

  it("lets a wildcard DENY cover a whole domain", () => {
    const resolved = resolvePermissions(
      grants({
        roles: [{ roleId: "admin", permissions: ["*"], branchIds: [] }],
        direct: [{ permission: "billing.*", effect: "DENY" }],
      }),
      { now: NOW },
    );

    expect(resolved.has("billing.invoice.view")).toBe(false);
    expect(resolved.has("operations.shipment.view")).toBe(true);
  });

  it("ignores an expired role assignment", () => {
    const resolved = resolvePermissions(
      grants({
        roles: [
          {
            roleId: "cover",
            permissions: ["operations.manifest.close"],
            branchIds: [],
            expiresAt: YESTERDAY,
          },
        ],
      }),
      { now: NOW },
    );

    expect(resolved.has("operations.manifest.close")).toBe(false);
  });

  it("honours a role assignment that has not expired yet", () => {
    const resolved = resolvePermissions(
      grants({
        roles: [
          {
            roleId: "cover",
            permissions: ["operations.manifest.close"],
            branchIds: [],
            expiresAt: TOMORROW,
          },
        ],
      }),
      { now: NOW },
    );

    expect(resolved.has("operations.manifest.close")).toBe(true);
  });

  it("ignores an expired denial, restoring the underlying grant", () => {
    const resolved = resolvePermissions(
      grants({
        roles: [{ roleId: "r1", permissions: ["operations.scan.reverse"], branchIds: [] }],
        direct: [
          { permission: "operations.scan.reverse", effect: "DENY", expiresAt: YESTERDAY },
        ],
      }),
      { now: NOW },
    );

    expect(resolved.has("operations.scan.reverse")).toBe(true);
  });

  describe("branch scope", () => {
    const branchScoped = grants({
      roles: [
        {
          roleId: "branch-manager",
          permissions: ["operations.shipment.create"],
          branchIds: ["delhi"],
        },
      ],
    });

    it("grants the permission when no branch is named", () => {
      // "May this person book shipments at all?" — yes. Whether they may book
      // *this* shipment is a separate question asked against the record. Hiding
      // the screen from every branch-scoped operator would be the wrong answer.
      expect(resolvePermissions(branchScoped, { now: NOW }).has("operations.shipment.create")).toBe(
        true,
      );
    });

    it("grants inside the named branch", () => {
      expect(
        resolvePermissions(branchScoped, { now: NOW, branchId: "delhi" }).has(
          "operations.shipment.create",
        ),
      ).toBe(true);
    });

    it("refuses in a different branch", () => {
      expect(
        resolvePermissions(branchScoped, { now: NOW, branchId: "mumbai" }).has(
          "operations.shipment.create",
        ),
      ).toBe(false);
    });

    it("treats an empty branch list as every branch", () => {
      const clientWide = grants({
        roles: [{ roleId: "r1", permissions: ["operations.shipment.create"], branchIds: [] }],
      });

      expect(
        resolvePermissions(clientWide, { now: NOW, branchId: "mumbai" }).has(
          "operations.shipment.create",
        ),
      ).toBe(true);
    });
  });

  it("answers hasAny and hasAll", () => {
    const resolved = resolvePermissions(
      grants({ roles: [{ roleId: "r1", permissions: ["a.b.c"], branchIds: [] }] }),
      { now: NOW },
    );

    expect(resolved.hasAny(["a.b.c", "x.y.z"])).toBe(true);
    expect(resolved.hasAll(["a.b.c", "x.y.z"])).toBe(false);
    expect(resolved.hasAll(["a.b.c"])).toBe(true);
  });
});
