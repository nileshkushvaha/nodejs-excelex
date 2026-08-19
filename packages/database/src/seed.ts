import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { SYSTEM_ROLES } from "@excelex/permissions";

import { hashPassword } from "./password";
import { seedCharges } from "./reference/charges";
import { seedProductMasters } from "./reference/products";
import { seedCountriesAndStates, seedOrganisationMasters } from "./reference/seed-reference";
import { syncPermissionCatalogue } from "./sync-permissions";

/**
 * Development seed: one client (ExcelEx itself), one hostname, one role, one
 * administrator who can sign in.
 *
 * Connects as the schema owner because it writes to platform tables, which no
 * runtime role may touch. The owner is still subject to FORCE row-level
 * security, so writes to client-scoped tables set app.client_id like any other
 * caller — the seed gets no privileged shortcut, which is exactly what makes it
 * a useful rehearsal of the real write path.
 *
 * Idempotent: safe to re-run. An existing administrator keeps their password
 * — the seed also syncs the permission catalogue and runs on every deploy,
 * and a deploy must not silently reset anyone's credentials. Pass
 * SEED_RESET_ADMIN_PASSWORD=true to reset it deliberately (a fresh
 * developer machine, a forgotten demo password).
 */

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const HOSTNAME = process.env["SEED_HOSTNAME"] ?? "localhost";
const ADMIN_EMAIL = process.env["SEED_ADMIN_EMAIL"] ?? "admin@excelex.in";
const ADMIN_PASSWORD = process.env["SEED_ADMIN_PASSWORD"] ?? "ChangeMe!2026";
const RESET_ADMIN_PASSWORD = process.env["SEED_RESET_ADMIN_PASSWORD"] === "true";

let passwordSet = false;

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_MIGRATION_URL"];
  if (!connectionString) throw new Error("DATABASE_MIGRATION_URL is not set.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const reference = await seedCountriesAndStates(prisma);
    console.log(
      `Reference data: ${reference.countries} countries, ${reference.states} Indian states and union territories`,
    );

    const catalogue = await syncPermissionCatalogue(prisma);
    console.log(
      `Permission catalogue: ${catalogue.upserted} synced, ${catalogue.deprecated} newly deprecated`,
    );

    await prisma.client.upsert({
      where: { id: CLIENT_ID },
      create: {
        id: CLIENT_ID,
        slug: "excelex",
        legalName: "ExcelEx Logistics",
        status: "ACTIVE",
      },
      update: { status: "ACTIVE" },
    });

    await prisma.clientHostname.upsert({
      where: { hostname: HOSTNAME },
      create: { clientId: CLIENT_ID, hostname: HOSTNAME, isPrimary: true, verifiedAt: new Date() },
      update: { clientId: CLIENT_ID, retiredAt: null },
    });

    const passwordHash = await hashPassword(ADMIN_PASSWORD);

    // Client-scoped tables from here. FORCE RLS applies to the owner too, so the
    // context is sealed exactly as a request would seal it.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.client_id', ${CLIENT_ID}, true)`;

      const existingBranch = await tx.branch.findFirst({ where: { code: "HO", deletedAt: null } });
      const branch =
        existingBranch ??
        (await tx.branch.create({ data: { clientId: CLIENT_ID, code: "HO", name: "Head Office" } }));

      // Every client starts with the same system roles. They are re-synced on
      // each run so a permission added to the catalogue reaches the seeded
      // roles, but only for isSystem rows — a role the client has edited is
      // theirs, and overwriting it would silently revoke access they granted.
      let administratorRoleId = "";

      for (const definition of SYSTEM_ROLES) {
        const found = await tx.role.findFirst({ where: { name: definition.name, deletedAt: null } });
        const role = found
          ? await tx.role.update({
              where: { id: found.id },
              data: { description: definition.description, isSystem: true },
            })
          : await tx.role.create({
              data: {
                clientId: CLIENT_ID,
                name: definition.name,
                description: definition.description,
                isSystem: true,
              },
            });

        if (definition.name === "Administrator") administratorRoleId = role.id;

        await tx.rolePermission.deleteMany({
          where: {
            clientId: CLIENT_ID,
            roleId: role.id,
            permissionKey: { notIn: [...definition.permissions] },
          },
        });

        for (const permissionKey of definition.permissions) {
          await tx.rolePermission.upsert({
            where: {
              clientId_roleId_permissionKey: {
                clientId: CLIENT_ID,
                roleId: role.id,
                permissionKey,
              },
            },
            create: { clientId: CLIENT_ID, roleId: role.id, permissionKey },
            update: {},
          });
        }
      }

      const role = { id: administratorRoleId };

      const foundUser = await tx.user.findFirst({ where: { email: ADMIN_EMAIL, deletedAt: null } });
      passwordSet = !foundUser || RESET_ADMIN_PASSWORD;
      const user = foundUser
        ? await tx.user.update({
            where: { id: foundUser.id },
            data: { isActive: true, ...(RESET_ADMIN_PASSWORD ? { passwordHash } : {}) },
          })
        : await tx.user.create({
            data: {
              clientId: CLIENT_ID,
              email: ADMIN_EMAIL,
              fullName: "ExcelEx Administrator",
              passwordHash,
            },
          });

      const existingRole = await tx.userRole.findFirst({
        where: { clientId: CLIENT_ID, userId: user.id, roleId: role.id, branchId: null },
      });
      if (!existingRole) {
        // branchId null: client-wide, not limited to any one branch.
        await tx.userRole.create({
          data: { clientId: CLIENT_ID, userId: user.id, roleId: role.id },
        });
      }

      const masters = await seedOrganisationMasters(tx, CLIENT_ID);
      if (masters.departments > 0 || masters.designations > 0) {
        console.log(
          `Organisation masters: +${masters.departments} departments, +${masters.designations} designations`,
        );
      }

      const productMasters = await seedProductMasters(tx, CLIENT_ID);
      if (productMasters.products > 0 || productMasters.types > 0) {
        console.log(
          `Product masters: +${productMasters.types} types, +${productMasters.groups} groups, +${productMasters.products} products`,
        );
      }

      const charges = await seedCharges(tx, CLIENT_ID);
      if (charges.charges > 0) {
        console.log(`Charges: +${charges.charges}`);
      }

      const existingMembership = await tx.userBranchMembership.findFirst({
        where: { clientId: CLIENT_ID, userId: user.id, branchId: branch.id },
      });
      if (!existingMembership) {
        await tx.userBranchMembership.create({
          data: { clientId: CLIENT_ID, userId: user.id, branchId: branch.id },
        });
      }
    });

    console.log(`Seeded client 'excelex' with ${SYSTEM_ROLES.length} system roles`);
    console.log(`  hostname  ${HOSTNAME}`);
    console.log(
      passwordSet
        ? `  sign in   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`
        : `  sign in   ${ADMIN_EMAIL} (password unchanged; SEED_RESET_ADMIN_PASSWORD=true to reset it)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
