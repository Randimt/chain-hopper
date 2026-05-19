"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "react-hot-toast";

import { config } from "@/lib/wagmi";
import { SolanaProvider } from "@/components/solana-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#0052FF",
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
        >
          <SolanaProvider>{children}</SolanaProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#18181b",
                color: "#f4f4f5",
                border: "1px solid #3f3f46",
                fontSize: "13px",
              },
              success: { iconTheme: { primary: "#22c55e", secondary: "#18181b" } },
              error: { iconTheme: { primary: "#ef4444", secondary: "#18181b" } },
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
