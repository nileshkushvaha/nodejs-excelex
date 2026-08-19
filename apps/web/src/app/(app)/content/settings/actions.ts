"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

export interface SiteSettingsInput {
  siteTitle: string;
  tagline: string | null;
  homePageId: string | null;
  blogPath: string;
  postsPerPage: number;
  footerText: string | null;
  socialLinks: Array<{ label: string; url: string }>;
  defaultMetaDescription: string | null;
  defaultOgImageId: string | null;
  indexable: boolean;
}

/**
 * One PUT for the whole settings record. The form is small and every field
 * is shown at once, so partial writes would only invite the case where two
 * people save different halves and each undoes the other's.
 */
export async function saveSiteSettings(input: SiteSettingsInput): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/cms/settings", "PUT", input);
  if (result.ok) {
    revalidatePath("/content/settings");
    revalidatePath("/content");
  }
  return result;
}
