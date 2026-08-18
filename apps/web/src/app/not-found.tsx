import { ErrorActions, ErrorScreen } from "@/components/error-screen";

export const metadata = { title: "Page not found · ExcelEx" };

/**
 * 404, for both an unmatched address and a notFound() thrown by a page whose
 * record has gone. The copy covers both, because from the reader's side they
 * are the same event.
 */
export default function NotFound() {
  return <ErrorScreen status={404} actions={<ErrorActions />} />;
}
