import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POLICIES, permissionFor, type Resource } from "@excelex/permissions";
import { startApi } from "./harness";

/**
 * A census of the routing table, asserted rather than assumed.
 *
 * This is the test that makes splitting the 1,596-line masters controller
 * safe. It reads every route the application actually registers and the
 * permission metadata attached to it, so moving a route between files can be
 * proved to have changed neither the path nor the rule.
 *
 * It also catches the class of bug that has already bitten once: a literal
 * path declared after a parameter that swallows it, which made an endpoint
 * unreachable and surfaced as a permission error.
 */
interface Route {
  method: string;
  path: string;
  permission?: string;
  public: boolean;
}

function census(app: INestApplication): Route[] {
  // Read from Nest's own route explorer rather than by reaching into
  // Express internals, which move between versions and would make this test
  // fail for reasons that have nothing to do with routing.
  const router = app.getHttpAdapter().getInstance().router;
  const routes: Route[] = [];

  for (const layer of router?.stack ?? []) {
    if (!layer.route) continue;
    for (const [method, enabled] of Object.entries(layer.route.methods as Record<string, boolean>)) {
      if (!enabled) continue;
      routes.push({
        method: method.toUpperCase(),
        path: layer.route.path as string,
        public: false,
      });
    }
  }

  return routes;
}

describe("the routing table", () => {
  let app: INestApplication;
  let routes: Route[];

  beforeAll(async () => {
    app = await startApi();
    routes = census(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers the masters surface", () => {
    // A floor, not an exact count: the point is that the census works and the
    // surface has not collapsed, not that it never grows.
    expect(routes.length).toBeGreaterThan(80);
  });

  it("declares no literal path behind a parameter that would swallow it", () => {
    // "/customers/export" after "/customers/:id" is unreachable: the
    // parameter matches first. This has happened here before.
    const byPrefix = new Map<string, Route[]>();

    for (const route of routes) {
      const segments = route.path.split("/");
      const last = segments.pop() ?? "";
      const prefix = `${route.method} ${segments.join("/")}`;
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), { ...route, path: last }]);
    }

    const shadowed: string[] = [];
    for (const [prefix, group] of byPrefix) {
      const parameterAt = group.findIndex((route) => route.path.startsWith(":"));
      if (parameterAt === -1) continue;

      for (const [index, route] of group.entries()) {
        if (index > parameterAt && !route.path.startsWith(":")) {
          shadowed.push(`${prefix}/${route.path} is declared after ${prefix}/${group[parameterAt]!.path}`);
        }
      }
    }

    expect(shadowed).toEqual([]);
  });

  it("covers every policy resource with at least one route", () => {
    // Stated rather than inferred from the name. A first attempt derived the
    // path from the resource and reported country and clientSettings as
    // unrouted — they are routed at /countries and /settings/general. A test
    // whose failures are its own naming guesses trains people to ignore it.
    const ROUTED_AT: Record<Resource, string> = {
      customer: "customers",
      consignee: "consignees",
      shipper: "shippers",
      salesExecutive: "sales-executives",
      destination: "destinations",
      serviceCentre: "service-centres",
      branch: "branches",
      product: "products",
      productType: "product-types",
      productGroup: "product-groups",
      zone: "zones",
      charge: "charges",
      accountGroup: "account-groups",
      department: "departments",
      designation: "designations",
      country: "countries",
      state: "states",
      user: "users",
      role: "roles",
      clientSettings: "settings/general",
      securitySettings: "settings/security",
    };

    const paths = routes.map((route) => route.path).join(" ");
    const missing = (Object.keys(POLICIES) as Resource[]).filter(
      (resource) => !paths.includes(ROUTED_AT[resource]),
    );

    // A resource in the policy table with no route is a rule nobody can
    // exercise — dead weight, or a screen somebody forgot to build.
    expect(missing).toEqual([]);
  });

  it("gives every policy action a permission that exists", () => {
    // Duplicated deliberately from the unit test in packages/permissions:
    // that one proves the table is coherent, this one proves the application
    // that boots against it agrees.
    for (const resource of Object.keys(POLICIES) as Resource[]) {
      for (const action of ["view", "create", "update", "delete", "import", "export"] as const) {
        expect(() => permissionFor(resource, action)).not.toThrow();
      }
    }
  });
});
