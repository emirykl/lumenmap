import { GET as handleGet } from "./_handler";
import { withApiTrace } from "@/lib/telemetry/tracing";

export const dynamic = "force-dynamic";

export const GET = withApiTrace("/api/v1/dapps", handleGet);
