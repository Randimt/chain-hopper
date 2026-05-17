import { NextRequest, NextResponse } from "next/server";

// Cloudflare Workers requirement
export const runtime = "edge";

/**
 * Proxy Circle Iris API to bypass browser CORS.
 * Usage: GET /api/attestation?domain=0&txHash=0x...
 *
 * Flat route (no dynamic segments) for OpenNext compatibility.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const txHash = searchParams.get("txHash");

  if (!domain || !/^\d+$/.test(domain)) {
    return NextResponse.json(
      { error: "Invalid or missing 'domain' query param" },
      { status: 400 }
    );
  }
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json(
      { error: "Invalid or missing 'txHash' query param" },
      { status: 400 }
    );
  }

  const upstream = `https://iris-api-sandbox.circle.com/v2/messages/${domain}?transactionHash=${txHash}`;

  try {
    const res = await fetch(upstream, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      // 404 = not yet indexed — pass through with empty messages
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
