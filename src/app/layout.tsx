import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.lyxsa.xyz"),
  title: "Lyxsa — One USDC, every chain",
  description:
    "Native USDC bridging across 22 EVM testnets + Solana Devnet in 30 seconds. Multi-output recipes, atomic batch fan-out, cross-VM bridge. Powered by Circle CCTP V2.",
  applicationName: "Lyxsa",
  keywords: [
    "USDC bridge",
    "CCTP V2",
    "Circle",
    "cross-chain",
    "Arc Testnet",
    "batch bridge",
    "Solana",
    "EVM",
  ],
  authors: [{ name: "Lerand", url: "https://twitter.com/ini_lerand" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://app.lyxsa.xyz",
    siteName: "Lyxsa",
    title: "Lyxsa — One USDC, every chain",
    description:
      "Native USDC bridging across 22 EVM testnets + Solana Devnet. Atomic batch fan-out via custom CCTP V2 splitter contract.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lyxsa — One USDC, every chain",
    description:
      "Bridge USDC to up to 5 chains in a single transaction. Native CCTP V2, no wrapped tokens.",
    creator: "@ini_lerand",
  },
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
