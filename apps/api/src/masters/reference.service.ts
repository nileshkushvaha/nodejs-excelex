import { Injectable } from "@nestjs/common";

import { CacheService } from "../core/cache/cache.service";
import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface CountryView {
  code: string;
  alpha3: string;
  name: string;
  dialCode: string | null;
  currency: string | null;
  region: string | null;
}

export interface StateView {
  code: string;
  name: string;
  type: string;
  gstCode: string | null;
}

/**
 * Countries and states, read through the SECURITY DEFINER accessors.
 *
 * The client runtime role has no privileges on either table, so these functions
 * are the only path — the same arrangement as hostname resolution and the
 * permission catalogue. Reference data is shared by every client and editable by
 * none of them: a client with its own copy of India would produce addresses that
 * no other client's data could be reconciled against.
 *
 * Cached platform-wide for the same reason: the answer is identical for every
 * client, so one copy serves them all, and it changes only with a migration
 * (after which the cache manager's platform flush is the way to refresh it).
 */
@Injectable()
export class ReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  countries(): Promise<CountryView[]> {
    return this.cache.getOrSet("platform", "reference", "countries", () => this.loadCountries());
  }

  states(countryCode: string): Promise<StateView[]> {
    return this.cache.getOrSet("platform", "reference", `states.${countryCode}`, () =>
      this.loadStates(countryCode),
    );
  }

  private async loadCountries(): Promise<CountryView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          code: string;
          alpha3: string;
          name: string;
          dial_code: string | null;
          currency: string | null;
          region: string | null;
        }>
      >`SELECT code, alpha3, name, dial_code, currency, region FROM public.list_countries()`;

      return rows.map((row) => ({
        code: row.code,
        alpha3: row.alpha3,
        name: row.name,
        dialCode: row.dial_code,
        currency: row.currency,
        region: row.region,
      }));
    });
  }

  private async loadStates(countryCode: string): Promise<StateView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ code: string; name: string; type: string; gst_code: string | null }>
      >`SELECT code, name, type, gst_code FROM public.list_states(${countryCode})`;

      return rows.map((row) => ({
        code: row.code,
        name: row.name,
        type: row.type,
        gstCode: row.gst_code,
      }));
    });
  }
}
