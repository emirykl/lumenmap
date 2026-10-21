import { loadFirstSeen } from "@/lib/entities/first-seen-data";
import { isDashboardNetworkId, resolveDashboardNetwork } from "@/lib/network";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "v1");
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const id = params.get("id");
  const network = params.get("network");
  if (type !== "account" && type !== "contract") {
    return Response.json({ code: "INVALID_TYPE", message: "Unsupported entity type." }, { status: 400 });
  }
  if (!id || !new RegExp(`^${type === "account" ? "G" : "C"}[A-Z2-7]{55}$`).test(id)) {
    return Response.json({ code: "INVALID_ID", message: "Enter a Stellar entity address." }, { status: 400 });
  }
  if (network !== null && !isDashboardNetworkId(network)) {
    return Response.json({ code: "INVALID_NETWORK", message: "Unsupported network." }, { status: 400 });
  }
  const context = await loadFirstSeen(type, id, resolveDashboardNetwork(network));
  return Response.json(context, { headers: { "Cache-Control": "public, max-age=900, s-maxage=900" } });
}
