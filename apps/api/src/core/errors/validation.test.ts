import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ValidationError } from "./app-error";
import { parseOrThrow } from "./validation";

describe("parseOrThrow", () => {
  const schema = z.object({ name: z.string().min(2, "Name is too short."), address: z.object({ pin: z.string().length(6) }) });

  it("returns the parsed value", () => {
    expect(parseOrThrow(schema, { name: "ok", address: { pin: "110001" } })).toEqual({
      name: "ok",
      address: { pin: "110001" },
    });
  });

  it("throws a ValidationError carrying every issue with its path", () => {
    try {
      parseOrThrow(schema, { name: "x", address: { pin: "1" } });
      throw new Error("did not throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validation = error as ValidationError;
      expect(validation.getStatus()).toBe(400);
      expect(validation.code).toBe("validation_failed");
      expect(validation.errors?.map((e) => e.path)).toEqual(["name", "address.pin"]);
      expect(validation.errors?.[0]?.message).toBe("Name is too short.");
      // The Nest payload keeps the message array, as BadRequestException did.
      const payload = validation.getResponse() as { message: string[] };
      expect(payload.message).toEqual(["Name is too short.", expect.any(String)]);
    }
  });
});
