import { Injectable } from "@nestjs/common";

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
 */
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async countries(): Promise<CountryView[]> {
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

  async states(countryCode: string): Promise<StateView[]> {
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
