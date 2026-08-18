import Link from "next/link";

import { ErrorScreen } from "@/components/error-screen";

export const metadata = { title: "Page not found · ExcelEx" };

/**
 * 404 on the public site, which keeps the site header and footer — somebody
 * who mistyped a URL should still be one click from the services page.
 */
export default function SiteNotFound() {
  return (
    <ErrorScreen
      status={404}
      actions={
        <>
          <Link href="/" className="btn-primary rounded-xl px-5 py-2.5 text-sm font-medium">
            Back to the home page
          </Link>
          <Link href="/track" className="btn-secondary rounded-xl px-5 py-2.5 text-sm font-medium">
            Track a shipment
          </Link>
        </>
      }
    />
  );
}
