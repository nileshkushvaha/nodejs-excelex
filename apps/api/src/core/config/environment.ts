import { z } from "zod";

/**
 * One schema for the entire environment surface, validated at boot. The process
 * refuses to start on a missing or malformed variable, because a server that
 * starts and then fails on the first request that happens to need the variable
 * is a server that fails in production rather than in CI.
 */
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),

    /** Client runtime. Must be excelex_app — never the owner, never a superuser. */
    DATABASE_URL: z.string().min(1),
    /** Control plane. excelex_platform. */
    DATABASE_PLATFORM_URL: z.string().min(1),

    /** The host suffix a request must match to be served at all. */
    APP_BASE_DOMAIN: z.string().min(1).default("localhost"),

    /**
     * Whether X-Forwarded-Host may be believed. False in development, where
     * nothing sits in front of the API; true only behind a proxy we control,
     * because the header is trivially forgeable by any client otherwise.
     */
    TRUST_PROXY_HEADERS: z
      .string()
      .default("false")
      .transform((value) => value === "true"),

    SESSION_COOKIE_NAME: z.string().default("__Host-excelex_session"),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),

    WEB_ORIGIN: z.string().default("http://localhost:3000"),

    /**
     * Where the job queue lives.
     *
     * Redis rather than the database, because claiming work without two
     * workers taking the same job is what a queue is for, and Postgres can be
     * made to do it but not well. The record of what ran stays in Postgres.
     */
    REDIS_URL: z.string().default("redis://localhost:6379"),

    /**
     * Whether this process runs the workers as well as serving requests.
     *
     * True in development, where one process is the whole system. In
     * production the workers run as their own deployment, so a rate import
     * cannot starve the API of event loop, and so they can be scaled apart.
     */
    RUN_WORKERS: z
      .string()
      .default("true")
      .transform((value) => value === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    // Production-only boot assertions. Each of these is a misconfiguration that
    // silently removes a barrier rather than breaking anything visibly.
    if (!env.SESSION_COOKIE_NAME.startsWith("__Host-")) {
      ctx.addIssue({
        code: "custom",
        path: ["SESSION_COOKIE_NAME"],
        message:
          "must use the __Host- prefix in production: the browser then enforces " +
          "Secure, Path=/ and no Domain, so host-only scoping does not depend on us",
      });
    }

    if (/excelex_owner|postgres:/.test(env.DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message:
          "resolves to the schema owner or a superuser. A table owner is exempt " +
          "from row-level security unless FORCE is applied, and a superuser is " +
          "exempt regardless — the runtime must be neither",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  return result.data;
}

export const ENVIRONMENT = Symbol("ENVIRONMENT");
