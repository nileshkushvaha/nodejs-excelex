import { ErrorActions, ErrorScreen } from "@/components/error-screen";

export const metadata = { title: "Not found · ExcelEx" };

/**
 * 404 inside the signed-in shell.
 *
 * A separate file from the root one so the sidebar and header survive: a
 * record that has been deleted should not throw somebody out of the
 * application to find that out.
 */
export default function AppNotFound() {
  return <ErrorScreen status={404} actions={<ErrorActions />} />;
}
