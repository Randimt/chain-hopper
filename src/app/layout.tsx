import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Chain Hopper — One USDC, every chain",
  description: "Native USDC bridging across 7 EVM testnets in 30 seconds. Powered by Circle CCTP V2.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
