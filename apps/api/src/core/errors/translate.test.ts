import { Prisma } from "@excelex/database";
import { describe, expect, it } from "vitest";

import { translateFailure } from "./translate";

describe("translateFailure", () => {
  it("turns a dropped database connection into a 503 that names the database", () => {
    const error = new Prisma.PrismaClientUnknownRequestError(
      "Invalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `N/A`. Message: `Server has closed the connection.`",
      { clientVersion: "7.9.1" },
    );
    const explained = translateFailure(error);
    expect(explained?.getStatus()).toBe(503);
    expect(explained?.code).toBe("database_unavailable");
    expect(explained?.message).toMatch(/PostgreSQL/);
    expect(explained?.message).not.toMatch(/prisma|queryRaw/i);
  });

  it("recognises the pg adapter's socket code in place of a Prisma code", () => {
    // Observed against Prisma 7 + @prisma/adapter-pg with Postgres stopped.
    const error = Object.assign(new Error("\nInvalid `prisma.$queryRaw()` invocation:\n\n\n"), {
      name: "PrismaClientKnownRequestError",
      code: "ECONNREFUSED",
    });
    expect(translateFailure(error)?.code).toBe("database_unavailable");
  });

  it("recognises Prisma's own connection codes", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
      code: "P1001",
      clientVersion: "7.9.1",
    });
    expect(translateFailure(error)?.code).toBe("database_unavailable");
  });

  it("explains a unique constraint as a conflict, naming the fields not the index", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.9.1",
      meta: { target: ["client_id", "code"] },
    });
    const explained = translateFailure(error);
    expect(explained?.getStatus()).toBe(409);
    expect(explained?.message).toContain("client_id, code");
  });

  it("recognises Redis being down", () => {
    const error = new Error("connect ECONNREFUSED 127.0.0.1:6379");
    expect(translateFailure(error)?.code).toBe("redis_unavailable");
  });

  it("leaves an unknown error alone rather than guessing", () => {
    expect(translateFailure(new Error("Cannot read properties of undefined"))).toBeNull();
    expect(translateFailure("not even an error")).toBeNull();
  });
});
