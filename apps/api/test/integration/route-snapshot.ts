import type { INestApplication } from "@nestjs/common";

/**
 * Every route the application registers, as a sorted list of strings.
 *
 * The point is a refactor that must change nothing. Moving 88 routes out of
 * one controller and into twelve should leave this list byte-identical; if it
 * does not, the diff says exactly which path moved, appeared or vanished.
 */
export function routeCensus(app: INestApplication): string[] {
  const router = app.getHttpAdapter().getInstance().router;
  const routes: string[] = [];

  for (const layer of router?.stack ?? []) {
    if (!layer.route) continue;
    const path = layer.route.path as string;
    for (const [method, enabled] of Object.entries(
      layer.route.methods as Record<string, boolean>,
    )) {
      if (enabled) routes.push(`${method.toUpperCase()} ${path}`);
    }
  }

  return routes.sort();
}
