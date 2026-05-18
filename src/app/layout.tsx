import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/sidebar";

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
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-sans">
        <Providers>
          <div className="lg:flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
