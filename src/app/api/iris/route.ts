import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy Circle Iris API to bypass SSL cert issues affecting some
 * geographic edge nodes. Browser request → our server → Circle Iris.
 *
 * Usage: GET /api/iris?domain=0&txHash=0x...
 *
 * Note: NO `export const runtime = "edge"` — using default Node.js runtime
 * because OpenNext + dynamic edge routes had reliability issues.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const txHash = searchParams.get("txHash");

  if (!domain || !/^\d+$/.test(domain)) {
    return NextResponse.json(
      { error: "Invalid 'domain' query param" },
      { status: 400 }
    );
  }
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json(
      { error: "Invalid 'txHash' query param" },
      { status: 400 }
    );
  }

  const upstream = `https://iris-api-sandbox.circle.com/v2/messages/${domain}?transactionHash=${txHash}`;

  try {
    const res = await fetch(upstream, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      // 404 = not yet indexed — pass through with empty messages so client keeps polling
      if (res.status === 404) {
        return NextResponse.json(
          { messages: [], _proxyStatus: "not_indexed" },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: `Upstream HTTP ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      status: 200,
      headers: {
        // Allow same-origin caching policies, but don't cache aggressively
        "Cache-Control": "no-store",
      },
    });
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
