import { BadRequestException, Injectable } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface ClientSettings {
  legalName: string;
  tradingName: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateCode: string | null;
  countryCode: string;
  postalCode: string | null;
  timezone: string;
  currency: string;
  dateFormat: string;
  weekStart: number;
  invoicePrefix: string | null;
  invoiceFooter: string | null;
  termsText: string | null;
}

export interface ClientSettingsView extends ClientSettings {
  /** Nothing writes these yet — uploads need the storage service. */
  logoKey: string | null;
  logoDarkKey: string | null;
  faviconKey: string | null;
  updatedAt: string | null;
}

@Injectable()
export class ClientSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the stored row, or a sensible starting point built from what the
   * platform already knows.
   *
   * A client that has never opened this screen should see its own legal name
   * rather than an empty form — the platform recorded it when the account was
   * created, and asking for it again invites a second, slightly different
   * answer.
   */
  async view(): Promise<ClientSettingsView> {
    const { clientId } = requireRequestContext();

    const row = await this.prisma.forClient(clientId!, (tx) => tx.clientSettings.findFirst());
    if (row) {
      return {
        legalName: row.legalName,
        tradingName: row.tradingName,
        gstin: row.gstin,
        pan: row.pan,
        cin: row.cin,
        supportEmail: row.supportEmail,
        supportPhone: row.supportPhone,
        websiteUrl: row.websiteUrl,
        addressLine1: row.addressLine1,
        addressLine2: row.addressLine2,
        city: row.city,
        stateCode: row.stateCode,
        countryCode: row.countryCode,
        postalCode: row.postalCode,
        timezone: row.timezone,
        currency: row.currency,
        dateFormat: row.dateFormat,
        weekStart: row.weekStart,
        invoicePrefix: row.invoicePrefix,
        invoiceFooter: row.invoiceFooter,
        termsText: row.termsText,
        logoKey: row.logoKey,
        logoDarkKey: row.logoDarkKey,
        faviconKey: row.faviconKey,
        updatedAt: row.updatedAt.toISOString(),
      };
    }

    // The clients table is platform-owned and unreachable to the client runtime
    // role, so the name comes through the same accessor the middleware uses.
    const client = await this.prisma.platform.client.findUnique({ where: { id: clientId! } });

    return {
      legalName: client?.legalName ?? "",
      tradingName: null,
      gstin: null,
      pan: null,
      cin: null,
      supportEmail: null,
      supportPhone: null,
      websiteUrl: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      stateCode: null,
      countryCode: "IN",
      postalCode: null,
      timezone: "Asia/Kolkata",
      currency: "INR",
      dateFormat: "dd/MM/yyyy",
      weekStart: 1,
      invoicePrefix: null,
      invoiceFooter: null,
      termsText: null,
      logoKey: null,
      logoDarkKey: null,
      faviconKey: null,
      updatedAt: null,
    };
  }

  async update(settings: ClientSettings): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.assertConsistent(settings);

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.clientSettings.findFirst();
      const data = { ...settings, updatedById: actor?.userId ?? null };

      if (before) {
        await tx.clientSettings.update({ where: { id: before.id }, data });
      } else {
        await tx.clientSettings.create({ data: { ...data, clientId: clientId! } });
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(settings) as Array<keyof ClientSettings>) {
        const previous = before ? before[key] : null;
        if (previous !== settings[key]) changes[key] = { from: previous, to: settings[key] };
      }

      if (Object.keys(changes).length > 0) {
        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "settings.general.updated",
            entity: "client_settings",
            metadata: changes,
          },
        });
      }
    });
  }

  /**
   * Cross-field checks the column constraints cannot express.
   *
   * The GSTIN one is the valuable one: its first two digits are the GST state
   * code of the state that issued it, so a GSTIN that disagrees with the
   * registered address is wrong in a way that only shows up when a tax
   * authority rejects the invoice — months later, across every document issued
   * in between.
   */
  private async assertConsistent(settings: ClientSettings): Promise<void> {
    const { clientId } = requireRequestContext();

    if (settings.timezone && !isKnownTimezone(settings.timezone)) {
      throw new BadRequestException(`"${settings.timezone}" is not a known time zone.`);
    }

    if (!settings.stateCode) return;

    const states = await this.prisma.forClient(clientId!, (tx) =>
      tx.$queryRaw<Array<{ code: string; gst_code: string | null }>>`
        SELECT code, gst_code FROM public.list_states(${settings.countryCode})
      `,
    );

    const state = states.find((row) => row.code === settings.stateCode);
    if (!state) {
      throw new BadRequestException(
        `"${settings.stateCode}" is not a subdivision of ${settings.countryCode}.`,
      );
    }

    if (settings.gstin && state.gst_code && !settings.gstin.startsWith(state.gst_code)) {
      throw new BadRequestException(
        `That GSTIN begins with ${settings.gstin.slice(0, 2)}, which is not the GST code for the selected state (${state.gst_code}).`,
      );
    }
  }
}

/** Validated against the runtime's own zone list rather than a hand-kept one. */
function isKnownTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
