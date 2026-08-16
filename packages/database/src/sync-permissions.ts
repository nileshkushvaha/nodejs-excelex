import { PERMISSION_DEFINITIONS, SUPER_PERMISSION } from "@excelex/permissions";
import type { PrismaClient } from "@prisma/client";

/**
 * Projects the typed catalogue onto the `permissions` table.
 *
 * Runs as part of migration and deploy, never at request time. Code is the
 * source of truth; the table exists so the role editor can list and group
 * permissions, and so a permission's description lives somewhere a
 * non-developer can read.
 *
 * A permission that disappears from the code is marked deprecated rather than
 * deleted. Live grant rows may still reference it, and deleting the catalogue
 * row would either break them or, worse, silently change what a role grants on
 * the day of a deploy.
 */
export async function syncPermissionCatalogue(
  prisma: PrismaClient,
): Promise<{ upserted: number; deprecated: number }> {
  const definitions = [
    {
      key: SUPER_PERMISSION,
      group: "Settings",
      label: "All permissions",
      description:
        "Grants everything, including future permissions. Held explicitly and visible here — " +
        "there is deliberately no framework-level super-user hook.",
      deprecated: false,
    },
    ...PERMISSION_DEFINITIONS.map((definition) => ({
      key: definition.key,
      group: definition.group,
      label: definition.label,
      description: definition.description,
      deprecated: "deprecated" in definition ? Boolean(definition.deprecated) : false,
    })),
  ];

  for (const definition of definitions) {
    await prisma.permission.upsert({
      where: { key: definition.key },
      create: { ...definition, syncedAt: new Date() },
      update: { ...definition, syncedAt: new Date() },
    });
  }

  const { count } = await prisma.permission.updateMany({
    where: { key: { notIn: definitions.map((definition) => definition.key) }, deprecated: false },
    data: { deprecated: true },
  });

  return { upserted: definitions.length, deprecated: count };
}
