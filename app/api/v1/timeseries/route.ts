import { GET as handleGet } from "./_handler";
import { withApiTrace } from "@/lib/telemetry/tracing";

export const GET = withApiTrace("/api/v1/timeseries", handleGet);
