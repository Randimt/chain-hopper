"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans overflow-x-hidden">
      {/* Local styles for 3D animation + helper utilities */}
      <style jsx global>{`
        @keyframes ch-rotate3d {
          from { transform: rotateY(0) rotateX(15deg); }
          to   { transform: rotateY(360deg) rotateX(15deg); }
        }
        @keyframes ch-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ch-bounce {
          0%, 100% { transform: translate(-50%, 0); }
          50%      { transform: translate(-50%, 8px); }
        }
        @keyframes ch-node-pulse {
          from { transform: scale(1); opacity: 1; }
          to   { transform: scale(2); opacity: 0; }
        }
        @keyframes ch-dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
          50%      { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
        }
        .ch-network-scene {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          animation: ch-rotate3d 40s linear infinite;
        }
        .ch-node {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 60px;
          height: 60px;
          margin: -30px 0 0 -30px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #06b6d4, #3b82f6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          box-shadow: 0 0 30px rgba(6,182,212,0.6),
                      inset 0 -8px 16px rgba(0,0,0,0.3);
          border: 2px solid rgba(255,255,255,0.2);
          transform-style: preserve-3d;
        }
        .ch-node-pulse::before {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 9999px;
          border: 2px solid rgba(6,182,212,0.6);
          animation: ch-node-pulse 2s ease-out infinite;
        }
        .ch-fade-up { animation: ch-fade-up 1s ease backwards; }
        .ch-fade-up-delay-1 { animation: ch-fade-up 1s ease 0.1s backwards; }
        .ch-fade-up-delay-2 { animation: ch-fade-up 1s ease 0.2s backwards; }
        .ch-fade-up-delay-3 { animation: ch-fade-up 1s ease 0.3s backwards; }
        .ch-dot-pulse { animation: ch-dot-pulse 2s ease infinite; }
        .ch-bounce-down { animation: ch-bounce 2s ease infinite; }
        @media (max-width: 640px) {
          .ch-node { width: 44px; height: 44px; font-size: 16px; margin: -22px 0 0 -22px; }
        }
      `}</style>

      <LandingNav />
      <Hero3D />
      <VisionSection />
      <RoadmapSection />
      <FeaturesSection />
      <LandingFooter />
    </div>
  );
}

function LandingNav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-black/40 border-b border-white/5 px-5 sm:px-10 py-5 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-base sm:text-[17px] tracking-tight">
        <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-base">
          ⚡
        </div>
        <span>Plix</span>
      </Link>
      <div className="hidden md:flex gap-8 text-sm text-zinc-400">
        <a href="#vision" className="hover:text-zinc-100 transition-colors">Vision</a>
        <a href="#roadmap" className="hover:text-zinc-100 transition-colors">Roadmap</a>
        <a href="#features" className="hover:text-zinc-100 transition-colors">Features</a>
        <Link href="/dashboard" className="hover:text-zinc-100 transition-colors">App</Link>
      </div>
      <Link
        href="/dashboard"
        className="px-4 py-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
      >
        Launch App →
      </Link>
    </nav>
  );
}

function Hero3D() {
  return (
    <section className="relative h-screen overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden" style={{ perspective: "1200px" }}>
        <div className="ch-network-scene">
          {/* 7 chain nodes in 3D space */}
          <div className="ch-node ch-node-pulse" style={{ transform: "translate3d(-280px,-150px,100px)" }}>⚪</div>
          <div className="ch-node ch-node-pulse" style={{ transform: "translate3d(220px,-180px,-80px)" }}>🔵</div>
          <div className="ch-node" style={{ transform: "translate3d(-200px,180px,-100px)" }}>🔷</div>
          <div className="ch-node ch-node-pulse" style={{ transform: "translate3d(280px,120px,80px)" }}>🔴</div>
          <div className="ch-node" style={{ transform: "translate3d(0,-220px,180px)" }}>🟣</div>
          <div className="ch-node ch-node-pulse" style={{ transform: "translate3d(0,220px,-150px)" }}>🔺</div>
          <div className="ch-node" style={{ transform: "translate3d(-340px,30px,-50px)" }}>🟢</div>
        </div>
      </div>

      <div className="relative z-10 text-center max-w-4xl px-6">
        <div className="ch-fade-up inline-flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full text-xs text-green-400 mb-8 backdrop-blur">
          <span className="w-[7px] h-[7px] rounded-full bg-green-500 ch-dot-pulse"></span>
          Cross-VM bridge live · Recipes shipped · 22 EVM + Solana · Powered by CCTP V2
        </div>

        <h1 className="ch-fade-up-delay-1 text-[clamp(48px,9vw,108px)] font-bold leading-[0.95] tracking-tight mb-6">
          One USDC,
          <br />
          <span className="bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
            every chain.
          </span>
        </h1>

        <p className="ch-fade-up-delay-2 text-[clamp(16px,2vw,20px)] text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
          Native USDC bridging in 30 seconds. Today, USDC across 22 EVM testnets + Solana Devnet, with multi-output recipes shipped. Tomorrow, multi-asset bridge + swap in one tx.
        </p>

        <div className="ch-fade-up-delay-3 flex gap-3.5 justify-center flex-wrap">
          <Link
            href="/bridge"
            className="px-8 py-3.5 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:-translate-y-0.5 transition-all"
            style={{ boxShadow: "0 8px 32px rgba(6,182,212,0.4)" }}
          >
            Launch Bridge →
          </Link>
          <a
            href="#vision"
            className="px-8 py-3.5 rounded-lg bg-white/5 border border-white/10 text-zinc-100 text-sm font-semibold hover:bg-white/10 transition-colors backdrop-blur"
          >
            See the Vision
          </a>
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 text-zinc-500 text-[11px] uppercase tracking-[0.2em] ch-bounce-down">
        ↓ scroll for the big idea
      </div>
    </section>
  );
}

function VisionSection() {
  return (
    <section id="vision" className="relative z-[5] px-6 sm:px-8 py-24 md:py-32 max-w-6xl mx-auto border-t border-white/5">
      <div className="font-mono text-xs text-cyan-500 uppercase tracking-[0.2em] mb-3.5 before:content-['//_']">
        the big idea
      </div>
      <h2 className="text-[clamp(36px,5vw,64px)] font-bold tracking-tight mb-8 max-w-3xl leading-[1.05]">
        What if cross-chain felt like{" "}
        <span className="bg-gradient-to-br from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          one chain?
        </span>
      </h2>
      <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl mb-16">
        You have <strong className="text-zinc-100">200 USDC on Arbitrum</strong>. You need{" "}
        <strong className="text-zinc-100">100 USDT on Polygon</strong> +{" "}
        <strong className="text-zinc-100">50 ETH worth on Base</strong>. Today you&apos;d open three apps,
        sign six transactions, and burn thirty minutes of your life.{" "}
        <em className="text-cyan-300 not-italic">We&apos;re building something better.</em>
      </p>

      <div className="rounded-2xl border border-cyan-500/20 p-7 sm:p-8 mb-12 max-w-2xl"
           style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.04), rgba(168,85,247,0.04))" }}>
        <div className="font-mono text-[11px] text-cyan-500 uppercase tracking-[0.15em] mb-2.5 before:content-['$_']">
          scenario
        </div>
        <p className="text-base sm:text-[17px] leading-[1.7] text-zinc-300">
          <strong className="text-zinc-100">From:</strong> 200 USDC on Arbitrum
          <br />
          <strong className="text-zinc-100">To:</strong> 100 USDT on Polygon + 50 ETH on Base
        </p>
      </div>

      {/* Comparison */}
      <div className="grid lg:grid-cols-2 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden mb-20">
        {/* Bad: Manual */}
        <div className="p-9 bg-gradient-to-br from-red-500/[0.04] to-transparent flex flex-col">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] mb-6 pb-4 border-b border-white/5 text-red-500 flex items-center gap-2.5">
            <span>—</span>
            <span>The Way Things Are</span>
          </div>
          <div className="text-2xl font-bold tracking-tight mb-6">Manual flow</div>
          <ul className="space-y-3.5 flex-1 mb-6">
            <CompareRow tone="bad" num={1} title="Open Across or Stargate" sub="Bridge 100 USDC ARB → POL" />
            <CompareRow tone="bad" num={2} title="Wait 5–10 minutes" sub="Watch the bridge confirm" />
            <CompareRow tone="bad" num={3} title="Open 1inch" sub="Swap USDC → USDT on Polygon" />
            <CompareRow tone="bad" num={4} title="Open bridge again" sub="Bridge 50 USDC ARB → BASE" />
            <CompareRow tone="bad" num={5} title="Wait 5–10 minutes" sub="More clicking, more waiting" />
            <CompareRow tone="bad" num={6} title="Open 1inch again" sub="Swap USDC → ETH on Base" />
          </ul>
          <div className="pt-5 border-t border-white/5 font-mono text-xs uppercase tracking-[0.1em] text-red-500">
            6 steps · 3 apps · 30+ min · $5–10 lost to fees
          </div>
        </div>

        {/* Good: Plix */}
        <div
          className="p-9 lg:border-l border-green-500/20 flex flex-col"
          style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.05), rgba(6,182,212,0.04))" }}
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] mb-6 pb-4 border-b border-white/5 text-green-500 flex items-center gap-2.5">
            <span>+</span>
            <span>The Plix Way</span>
          </div>
          <div className="text-2xl font-bold tracking-tight mb-6">One step. One app.</div>
          <ul className="space-y-3.5 flex-1 mb-6">
            <CompareRow tone="good" num={1} title="Pick your recipe" sub={"\"Arb USDC → 100 USDT POL + 50 ETH BASE\""} />
            <CompareRow tone="good" num={2} title="Click Execute" sub="Batch tx auto-handles bridge + swap" />
            <CompareRow tone="good" num={3} title="Done" sub="Tokens land on destination chains" />
          </ul>
          <div className="pt-5 border-t border-white/5 font-mono text-xs uppercase tracking-[0.1em] text-green-500">
            1 step · 1 app · ~30 sec · transparent fees
          </div>
        </div>
      </div>
    </section>
  );
}

function CompareRow({
  tone,
  num,
  title,
  sub,
}: {
  tone: "bad" | "good";
  num: number;
  title: string;
  sub: string;
}) {
  const iconBg =
    tone === "bad"
      ? "bg-red-500/15 text-red-500"
      : "bg-green-500/15 text-green-500";
  return (
    <li className="flex items-start gap-3.5 text-[15px] text-zinc-300 leading-snug">
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold mt-0.5 ${iconBg}`}
      >
        {num}
      </span>
      <div>
        <strong className="text-zinc-100 block mb-0.5 font-semibold">{title}</strong>
        <span className="text-zinc-500 text-[13px]">{sub}</span>
      </div>
    </li>
  );
}

function RoadmapSection() {
  return (
    <section id="roadmap" className="relative z-[5] px-6 sm:px-8 py-24 md:py-32 max-w-6xl mx-auto border-t border-white/5">
      <div className="font-mono text-xs text-cyan-500 uppercase tracking-[0.2em] mb-3.5 before:content-['//_']">
        the path forward
      </div>
      <h2 className="text-[clamp(36px,5vw,56px)] font-bold tracking-tight mb-4">
        From bridge to{" "}
        <span className="font-mono italic bg-gradient-to-br from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          recipes.
        </span>
      </h2>
      <p className="text-lg text-zinc-400 mb-16 max-w-xl leading-relaxed">
        Building the unified cross-chain experience in five phases. Each phase ships a working product, not a promise.
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <PhaseCard
          tone="live"
          status="LIVE NOW"
          num="01"
          title="Native USDC bridging"
          eta="Q2 2026 · shipped"
          features={[
            "CCTP V2 Fast Transfer (~30 seconds)",
            "22 EVM testnets supported",
            "Resume bridges across devices",
            "Tx history with explorer links",
            "Toast feedback + UI polish",
          ]}
        />
        <PhaseCard
          tone="progress"
          status="⚙ IN PROGRESS"
          num="02"
          title="Multi-aggregator + swap"
          eta="Q3 2026 · in development"
          features={[
            "Across, Relay, LiFi quote comparison",
            "USDC ↔ USDT/ETH swap (1inch SDK)",
            "Best-price routing engine",
            "Slippage controls",
            "Cross-chain swap (bridge + swap chained)",
          ]}
        />
        <PhaseCard
          tone="live"
          status="LIVE NOW"
          num="03"
          title="Recipes & batching"
          eta="Q2 2026 · shipped (Beta)"
          features={[
            "Save bridge configs as reusable recipes",
            "Multi-output sequential queue (1 click → N bridges)",
            "Cross-VM recipes (EVM ↔ Solana)",
            "Per-output skip/cancel + refresh-safe resume",
            "Templates: Diversify L2, Cross-VM split",
          ]}
        />
        <PhaseCard
          tone="live"
          status="LIVE NOW"
          num="04"
          title="Solana integration"
          eta="Q2 2026 · shipped"
          features={[
            "Solana Devnet via CCTP V2 Domain 5",
            "Phantom + Backpack + Solflare + OKX wallets",
            "Bridge USDC EVM ↔ Solana (live)",
            "Powered by Circle Bridge Kit SDK",
            "First non-EVM destination shipped",
          ]}
        />
        <PhaseCard
          tone="future"
          status="⏳ COMING SOON"
          num="05"
          title="Move VM expansion"
          eta="2027 · planned"
          features={[
            "Aptos integration via CCTP V2",
            "Sui integration via CCTP V2",
            "Move-native USDC support",
            "Petra + Sui wallet adapters",
            "Cross-VM consolidation: EVM ↔ SVM ↔ Move",
          ]}
        />
      </div>
    </section>
  );
}

function PhaseCard({
  tone,
  status,
  num,
  title,
  eta,
  features,
}: {
  tone: "live" | "progress" | "future";
  status: string;
  num: string;
  title: string;
  eta: string;
  features: string[];
}) {
  const containerStyles = {
    live: "border-green-500/30 bg-gradient-to-br from-green-500/[0.06] to-cyan-500/[0.04]",
    progress: "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] to-purple-500/[0.04]",
    future: "border-purple-500/20 opacity-90",
  }[tone];

  const statusPill = {
    live: "bg-green-500/15 text-green-400 border-green-500/30",
    progress: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    future: "bg-purple-500/10 text-purple-300 border-purple-500/25",
  }[tone];

  const dotColor = {
    live: "bg-green-500",
    progress: "bg-amber-500",
    future: "bg-purple-500/40",
  }[tone];

  return (
    <div
      className={`border rounded-[18px] p-8 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-white/15 ${containerStyles}`}
      style={{ backgroundColor: "rgba(20,20,25,0.5)" }}
    >
      <div
        className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] px-2.5 py-[5px] rounded-full mb-4 border ${statusPill}`}
      >
        {tone === "live" && <span className="w-[6px] h-[6px] rounded-full bg-green-500 ch-dot-pulse"></span>}
        {status}
      </div>
      <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-[0.2em] mb-2 before:content-['//_']">
        phase {num}
      </div>
      <h3 className="text-2xl font-bold tracking-tight mb-2">{title}</h3>
      <div className="font-mono text-[11px] text-cyan-500 mb-5">{eta}</div>
      <ul className="space-y-2.5">
        {features.map((f) => (
          <li key={f} className="text-sm text-zinc-400 leading-snug pl-[22px] relative">
            <span className={`absolute left-0 top-[7px] w-2 h-2 rounded-full ${dotColor}`}></span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeaturesSection() {
  const features = [
    { icon: "⚡", title: "Sub-30s finality", desc: "CCTP V2 Fast Transfer settles in under 30 seconds. No optimistic delays, no fraud proofs." },
    { icon: "🔐", title: "Native, not wrapped", desc: "Real USDC at the destination. No bridged USDC.e, no liquidity pools, no peg risk." },
    { icon: "🌐", title: "Cross-VM, 23 chains", desc: "22 EVM testnets + Solana Devnet. First non-EVM destination shipped. Aptos and Sui next." },
    { icon: "🍳", title: "Recipes & batching", desc: "Save bridge configs. Multi-output sequential queue. 1 click → N bridges. Cross-VM aware." },
    { icon: "📱", title: "Resume anywhere", desc: "Bridge stuck mid-flow? Resume from any device. Your tx state is portable." },
    { icon: "🛡", title: "Circle-grade security", desc: "First-party protocol from USDC's creator. No third-party bridges to trust." },
  ];

  return (
    <section id="features" className="relative z-[5] px-6 sm:px-8 py-24 md:py-32 max-w-6xl mx-auto border-t border-white/5">
      <div className="font-mono text-xs text-cyan-500 uppercase tracking-[0.2em] mb-3.5 before:content-['//_']">
        why plix
      </div>
      <h2 className="text-[clamp(36px,5vw,64px)] font-bold tracking-tight mb-12 max-w-3xl leading-[1.05]">
        Built for the{" "}
        <span className="bg-gradient-to-br from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          multi-chain future.
        </span>
      </h2>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((f) => (
          <div
            key={f.title}
            className="p-8 backdrop-blur-xl border border-white/[0.06] rounded-[18px] transition-all hover:-translate-y-0.5 hover:border-cyan-500/30"
            style={{ backgroundColor: "rgba(20,20,25,0.5)" }}
          >
            <div className="w-12 h-12 rounded-xl border border-cyan-500/20 flex items-center justify-center text-[22px] mb-4.5"
                 style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(59,130,246,0.05))" }}>
              {f.icon}
            </div>
            <h3 className="text-xl font-semibold tracking-tight mb-2.5">{f.title}</h3>
            <p className="text-sm text-zinc-400 leading-[1.7]">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="px-6 sm:px-8 pt-16 pb-8 border-t border-white/5 backdrop-blur-xl bg-black/60 relative z-[5]">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2.5 font-bold text-[17px] tracking-tight mb-4">
            <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-base">
              ⚡
            </div>
            <span>Plix</span>
          </div>
          <p className="text-sm text-zinc-400 leading-[1.7] mb-6 max-w-[300px]">
            Cross-chain USDC bridging powered by Circle CCTP V2. The first-party protocol from USDC&apos;s creator.
          </p>
          <div className="flex gap-2.5">
            <SocialLink label="𝕏" href="https://x.com/ini_lerand" />
            <SocialLink label="⌨" href="https://github.com/Randimt/chain-hopper" />
            <SocialLink label="💬" href="#" />
          </div>
        </div>
        <FooterCol
          title="Product"
          links={[
            { label: "Bridge", href: "/bridge" },
            { label: "Roadmap", href: "#roadmap" },
            { label: "History", href: "/history" },
          ]}
        />
        <FooterCol
          title="Resources"
          links={[
            { label: "Circle CCTP", href: "https://developers.circle.com/cctp" },
            { label: "Faucet", href: "https://faucet.circle.com" },
            { label: "GitHub", href: "https://github.com/Randimt/chain-hopper" },
            { label: "Status", href: "#" },
          ]}
        />
        <FooterCol
          title="Connect"
          links={[
            { label: "Twitter", href: "https://x.com/ini_lerand" },
            { label: "GitHub", href: "https://github.com/Randimt" },
            { label: "Email", href: "mailto:randmt24@gmail.com" },
          ]}
        />
      </div>
      <div className="max-w-6xl mx-auto pt-8 border-t border-white/5 flex justify-between flex-wrap gap-3 text-[13px] text-zinc-500">
        <div>© 2026 Plix · Built by @ini_lerand</div>
        <div>Testnet · Not production · MIT License</div>
      </div>
    </footer>
  );
}

function SocialLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-[38px] h-[38px] rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:bg-cyan-500/10 hover:border-cyan-500 hover:text-cyan-500 hover:-translate-y-0.5 transition-all"
    >
      {label}
    </a>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h4 className="text-[13px] font-semibold mb-4.5">{title}</h4>
      <ul className="space-y-3">
        {links.map((l) => {
          const isExternal = l.href.startsWith("http") || l.href.startsWith("mailto");
          const isHash = l.href.startsWith("#");
          if (isExternal) {
            return (
              <li key={l.label}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-cyan-500 text-sm transition-colors">
                  {l.label}
                </a>
              </li>
            );
          }
          if (isHash) {
            return (
              <li key={l.label}>
                <a href={l.href} className="text-zinc-500 hover:text-cyan-500 text-sm transition-colors">
                  {l.label}
                </a>
              </li>
            );
          }
          return (
            <li key={l.label}>
              <Link href={l.href} className="text-zinc-500 hover:text-cyan-500 text-sm transition-colors">
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
