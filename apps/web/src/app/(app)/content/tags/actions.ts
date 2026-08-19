"use server";

import type { ActionResult } from "@/lib/api";
import { createTerm, deleteTerm, mergeTerm, updateTerm, type TermInput } from "../terms-actions";

/**
 * The tags screen's actions are the shared term actions — categories and
 * tags are one table and one set of verbs — bound here so the folder reads
 * like every other list folder.
 */
export async function create(input: TermInput): Promise<ActionResult> {
  return createTerm(input);
}
export async function update(id: string, input: TermInput): Promise<ActionResult> {
  return updateTerm(id, input);
}
export async function remove(id: string): Promise<ActionResult> {
  return deleteTerm(id);
}
export async function merge(id: string, intoId: string): Promise<ActionResult> {
  return mergeTerm(id, intoId);
}
