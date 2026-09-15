import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Chessed",
  description:
    "Review recent public Chess.com games or pasted PGN with an interactive chess review interface.",
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
