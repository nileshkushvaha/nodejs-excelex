import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "./password";

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
 * Idempotent: safe to re-run, resets the demo password.
 */

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const HOSTNAME = process.env["SEED_HOSTNAME"] ?? "localhost";
const ADMIN_EMAIL = process.env["SEED_ADMIN_EMAIL"] ?? "admin@excelex.in";
const ADMIN_PASSWORD = process.env["SEED_ADMIN_PASSWORD"] ?? "ChangeMe!2026";

/**
 * The permission vocabulary this role is granted. It is a plain string array
 * until packages/permissions exists to make a typo a compile error rather than
 * a silent authorization gap.
 */
const ADMINISTRATOR_PERMISSIONS = [
  "operations.dashboard.view",
  "operations.shipment.view",
  "operations.shipment.create",
  "operations.manifest.view",
  "masters.customer.view",
  "masters.customer.manage",
  "masters.branch.view",
  "masters.branch.manage",
  "settings.user.view",
  "settings.user.manage",
  "settings.role.manage",
];

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_MIGRATION_URL"];
  if (!connectionString) throw new Error("DATABASE_MIGRATION_URL is not set.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
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

      const branch = await tx.branch.upsert({
        where: { clientId_code: { clientId: CLIENT_ID, code: "HO" } },
        create: { clientId: CLIENT_ID, code: "HO", name: "Head Office" },
        update: { name: "Head Office" },
      });

      const role = await tx.role.upsert({
        where: { clientId_name: { clientId: CLIENT_ID, name: "Administrator" } },
        create: {
          clientId: CLIENT_ID,
          name: "Administrator",
          description: "Full access to this client's data and settings.",
          permissions: ADMINISTRATOR_PERMISSIONS,
          isSystem: true,
        },
        update: { permissions: ADMINISTRATOR_PERMISSIONS },
      });

      const user = await tx.user.upsert({
        where: { clientId_email: { clientId: CLIENT_ID, email: ADMIN_EMAIL } },
        create: {
          clientId: CLIENT_ID,
          email: ADMIN_EMAIL,
          fullName: "ExcelEx Administrator",
          passwordHash,
        },
        update: { passwordHash, isActive: true },
      });

      const existingRole = await tx.userRole.findFirst({
        where: { clientId: CLIENT_ID, userId: user.id, roleId: role.id },
      });
      if (!existingRole) {
        await tx.userRole.create({
          data: { clientId: CLIENT_ID, userId: user.id, roleId: role.id },
        });
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

    console.log("Seeded client 'excelex'");
    console.log(`  hostname  ${HOSTNAME}`);
    console.log(`  sign in   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
