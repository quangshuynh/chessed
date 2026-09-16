import type { Metadata } from "next";

import { BrandLink } from "@/components/brand-link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Chessed",
  description:
    "Review recent public Chess.com games or pasted PGN with an interactive chess review interface.",
  icons: { icon: "/icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <BrandLink />
          </header>
          <div className="site-content">{children}</div>
          <footer className="site-footer">
            <p>
              This page is powered by{" "}
              <a
                href="https://github.com/Clariity/react-chessboard"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="react-chessboard project (opens in a new tab)"
              >
                react-chessboard
              </a>
              ,{" "}
              <a
                href="https://github.com/jhlywa/chess.js/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="chess.js project (opens in a new tab)"
              >
                chess.js
              </a>{" "}
              and{" "}
              <a
                href="https://github.com/nmrugg/stockfish.js"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Stockfish.js project (opens in a new tab)"
              >
                Stockfish.js
              </a>
              .
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
