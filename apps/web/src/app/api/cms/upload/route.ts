import { apiForward } from "@/lib/api";

/**
 * The browser's upload endpoint.
 *
 * Server actions serialise their arguments, which is the wrong shape for a
 * fifty-megabyte video; and the /api/v1 rewrite would do, except that a
 * route handler is where a per-file progress bar and a same-origin URL the
 * media picker can call from anywhere both live. It forwards the multipart
 * body verbatim to the API's media endpoint and returns whatever the API
 * said — a 201 with the row, or the API's own error envelope.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return apiForward(request, "/api/v1/cms/media");
}
