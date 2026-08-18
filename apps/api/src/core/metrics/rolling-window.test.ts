import { describe, expect, it } from "vitest";

import { MAX_ROUTES, RollingWindow, percentile } from "./rolling-window";

describe("RollingWindow", () => {
  it("computes percentiles from merged reservoirs", () => {
    let now = 1_000_000 * 60_000;
    const window = new RollingWindow(() => now);
    // 100 requests over two minutes, durations 1..100.
    for (let ms = 1; ms <= 100; ms += 1) {
      if (ms === 51) now += 60_000;
      window.observeRequest({ method: "GET", route: "/api/v1/x", status: ms % 10 === 0 ? 500 : 200, durationMs: ms });
    }
    const snapshot = window.snapshotHttp(5);
    expect(snapshot.requests).toBe(100);
    expect(snapshot.p50).toBe(50);
    expect(snapshot.p95).toBe(95);
    expect(snapshot.p99).toBe(99);
    expect(snapshot.max).toBe(100);
    expect(snapshot.errors5xx).toBe(10);
    expect(snapshot.errorRate).toBeCloseTo(0.1);
    expect(snapshot.perMinute).toHaveLength(5);
    expect(snapshot.perMinute.map((m) => m.count)).toEqual([0, 0, 0, 50, 50]);
    expect(snapshot.byRoute[0]?.route).toBe("/api/v1/x");
  });

  it("forgets what falls outside the window", () => {
    let now = 2_000_000 * 60_000;
    const window = new RollingWindow(() => now);
    window.observeRequest({ method: "GET", route: "/old", status: 200, durationMs: 5 });
    now += 10 * 60_000;
    window.observeRequest({ method: "GET", route: "/new", status: 200, durationMs: 5 });
    expect(window.snapshotHttp(5).requests).toBe(1);
    expect(window.snapshotHttp(15).requests).toBe(2);
    now += 61 * 60_000;
    expect(window.snapshotHttp(60).requests).toBe(0);
  });

  it("caps route cardinality and files the overflow under other", () => {
    const window = new RollingWindow(() => 3_000_000 * 60_000);
    for (let index = 0; index < MAX_ROUTES + 50; index += 1) {
      window.observeRequest({ method: "GET", route: `/r/${index}`, status: 200, durationMs: 1 });
    }
    const routes = window.allRoutes(5);
    expect(routes).toHaveLength(MAX_ROUTES + 1);
    expect(routes.find((r) => r.route === "other")?.count).toBe(50);
    // A known route keeps its own row after the cap.
    window.observeRequest({ method: "GET", route: "/r/0", status: 200, durationMs: 1 });
    expect(window.allRoutes(5).find((r) => r.route === "/r/0")?.count).toBe(2);
  });

  it("keeps a bounded reservoir and still reports a sensible p95", () => {
    const window = new RollingWindow(() => 4_000_000 * 60_000);
    for (let index = 0; index < 5_000; index += 1) {
      window.observeRequest({ method: "GET", route: "/x", status: 200, durationMs: index % 100 });
    }
    const snapshot = window.snapshotHttp(5);
    expect(snapshot.requests).toBe(5_000);
    expect(snapshot.p95).toBeGreaterThan(80);
    expect(snapshot.p95).toBeLessThanOrEqual(99);
  });

  it("aggregates queries per model and counts slow ones", () => {
    const window = new RollingWindow(() => 5_000_000 * 60_000);
    window.observeQuery("User", "findMany", 3);
    window.observeQuery("User", "findFirst", 700);
    window.observeQuery("Job", "create", 2);
    const db = window.snapshotDb(15);
    expect(db.queries).toBe(3);
    expect(db.slowCount).toBe(1);
    expect(db.perModel[0]?.model).toBe("User");
    expect(db.perModel[0]?.operations).toEqual({ findMany: 1, findFirst: 1 });
  });

  it("nearest-rank percentile", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 99)).toBe(7);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  });
});
