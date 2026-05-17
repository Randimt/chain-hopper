import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Chain Hopper — Cross-chain USDC made simple",
  description: "One-click cross-chain USDC bridging via CCTP. Built with Circle's stablecoin infrastructure.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
