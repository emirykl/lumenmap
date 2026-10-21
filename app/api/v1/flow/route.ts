import { NextResponse } from "next/server";
import { getFlowData } from "@/lib/flow/data";
import { isDashboardNetworkId, resolveDashboardNetwork } from "@/lib/network";
import { isValidPeriod } from "@/lib/periods";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withApiTrace } from "@/lib/telemetry/tracing";

export const dynamic = "force-dynamic";

export async function handleFlowRequest(
  request: Request,
  fetchFlow: typeof getFlowData = getFlowData,
) {
  const limited = enforceRateLimit(request, "v1");
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const period = params.get("period") ?? "1d";
  const networkParam = params.get("network");
  const account = params.get("account");
  if (!isValidPeriod(period)) {
    return NextResponse.json({ code: "INVALID_PERIOD", message: "Unsupported flow period." }, { status: 400 });
  }
  if (networkParam !== null && !isDashboardNetworkId(networkParam)) {
    return NextResponse.json({ code: "INVALID_NETWORK", message: "Unsupported network." }, { status: 400 });
  }
  if (account !== null && !/^G[A-Z2-7]{55}$/.test(account)) {
    return NextResponse.json({ code: "INVALID_ACCOUNT", message: "Enter a Stellar account address." }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchFlow(period, resolveDashboardNetwork(networkParam), account), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch {
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "Failed to load flow data." },
      { status: 500 },
    );
  }
}

export const GET = withApiTrace("/api/v1/flow", handleFlowRequest);
