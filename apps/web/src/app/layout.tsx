import type { Metadata } from "next";

import { ThemeProvider, THEME_SCRIPT } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExcelEx — Courier operations",
  description: "Multi-client courier and logistics operations platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before the first paint. Without it a
            dark-mode user gets a white flash on every navigation, because the
            server has no way to know their preference. suppressHydrationWarning
            is on <html> because this script is what makes its class differ from
            what the server rendered — deliberately. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
