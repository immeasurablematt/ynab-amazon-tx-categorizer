import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YNAB Import",
  description: "Import transactions to YNAB from CSV",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
