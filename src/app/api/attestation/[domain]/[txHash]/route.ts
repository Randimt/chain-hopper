import { NextRequest, NextResponse } from "next/server";

// Cloudflare Workers requirement
export const runtime = "edge";

// Catch-all proxy: /api/attestation/{domain}/{txHash}
// Parses URL path manually to avoid dynamic-route param edge cases on OpenNext.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // Path shape: /api/attestation/<domain>/<txHash>
  const parts = url.pathname.split("/").filter(Boolean);
  // parts[0]=api, parts[1]=attestation, parts[2]=domain, parts[3]=txHash
  const domain = parts[2];
  const txHash = parts[3];

  if (!domain || !/^\d+$/.test(domain)) {
    return NextResponse.json(
      { error: "Invalid domain", got: domain },
      { status: 400 }
    );
  }
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json(
      { error: "Invalid txHash", got: txHash?.slice(0, 16) },
      { status: 400 }
    );
  }

  const upstream = `https://iris-api-sandbox.circle.com/v2/messages/${domain}?transactionHash=${txHash}`;

  try {
    const res = await fetch(upstream, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      // 404 means message not yet indexed by Circle — pass through with empty messages
      if (res.status === 404) {
        return NextResponse.json(
          { messages: [], _proxyStatus: "not_indexed" },
          { status: 200 }
        );
      }
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Upstream ${res.status}`, body: text.slice(0, 200) },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Upstream fetch failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
