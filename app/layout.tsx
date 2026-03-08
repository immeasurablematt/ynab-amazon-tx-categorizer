import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amazon to YNAB - AI-Powered Transaction Import",
  description:
    "Import Amazon purchases into YNAB with AI-powered categorization. Save hours of manual data entry every month.",
  openGraph: {
    title: "Amazon to YNAB - AI-Powered Transaction Import",
    description:
      "Import Amazon purchases into YNAB with AI-powered categorization.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
