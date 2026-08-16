import type { Prisma, PrismaClient } from "@prisma/client";

import { countrySeeds } from "./countries";
import { COURIER_DEPARTMENTS, EXECUTIVE_DESIGNATIONS, INDIA_STATES } from "./india";

/**
 * Seeds the shared reference data.
 *
 * Countries and states are platform-owned, so this runs once for the whole
 * installation rather than per client. Rows are upserted and never deleted: a
 * country that leaves the list has almost certainly been renamed rather than
 * ceased to exist, and deleting it would orphan every address that references
 * it. Deactivation is the reversible form of the same intent.
 */
export async function seedCountriesAndStates(prisma: PrismaClient): Promise<{
  countries: number;
  states: number;
}> {
  const countries = countrySeeds();

  for (const country of countries) {
    await prisma.country.upsert({
      where: { code: country.code },
      create: country,
      // isActive is deliberately not overwritten: an installation that has
      // switched a country off has made an operational decision, and re-running
      // the seed should not quietly reverse it.
      update: {
        alpha3: country.alpha3,
        numeric: country.numeric,
        name: country.name,
        dialCode: country.dialCode,
        currency: country.currency,
        region: country.region,
        subregion: country.subregion,
      },
    });
  }

  for (const state of INDIA_STATES) {
    await prisma.state.upsert({
      where: { countryCode_code: { countryCode: "IN", code: state.code } },
      create: {
        countryCode: "IN",
        code: state.code,
        name: state.name,
        type: state.type,
        gstCode: state.gstCode,
      },
      update: { name: state.name, type: state.type, gstCode: state.gstCode },
    });
  }

  return { countries: countries.length, states: INDIA_STATES.length };
}

/**
 * Seeds a client's starting departments and designations.
 *
 * These are client-scoped and editable, so the seed only creates what is
 * missing. Overwriting on every run would silently undo a client's own
 * structure — the opposite of a starting point.
 *
 * Must be called inside a transaction that has already sealed the client
 * context, like every other client-scoped write.
 */
export async function seedOrganisationMasters(
  tx: Prisma.TransactionClient,
  clientId: string,
): Promise<{ departments: number; designations: number }> {
  let departments = 0;
  let designations = 0;

  for (const department of COURIER_DEPARTMENTS) {
    let row = await tx.department.findFirst({
      where: { code: department.code, deletedAt: null },
    });

    if (!row) {
      row = await tx.department.create({
        data: {
          clientId,
          code: department.code,
          name: department.name,
          description: department.description,
        },
      });
      departments += 1;
    }

    for (const designation of department.designations) {
      const existing = await tx.designation.findFirst({
        where: { code: designation.code, deletedAt: null },
      });
      if (existing) continue;

      await tx.designation.create({
        data: {
          clientId,
          departmentId: row.id,
          code: designation.code,
          name: designation.name,
          description: designation.description ?? null,
          level: designation.level,
        },
      });
      designations += 1;
    }
  }

  // Titles that sit above any one department carry no departmentId, rather than
  // being filed under an invented "General" bucket to satisfy a NOT NULL.
  for (const designation of EXECUTIVE_DESIGNATIONS) {
    const existing = await tx.designation.findFirst({
      where: { code: designation.code, deletedAt: null },
    });
    if (existing) continue;

    await tx.designation.create({
      data: {
        clientId,
        code: designation.code,
        name: designation.name,
        description: designation.description,
        level: designation.level,
      },
    });
    designations += 1;
  }

  return { departments, designations };
}
