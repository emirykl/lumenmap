import assert from "node:assert/strict";
import { test } from "node:test";
import { trace } from "@opentelemetry/api";
import { logInfo } from "@/lib/log";
import { flushTracing, registerTracing } from "@/lib/telemetry/tracing-node";
import { withApiTrace, type TracedRoute } from "@/lib/telemetry/tracing";

test("tracer init exports only allowlisted route spans and correlates structured logs", async () => {
  const oldMode = process.env.LUMENMAP_TRACING;
  const oldDir = console.dir;
  const oldLog = console.log;
  const spans: Array<{
    name: string;
    traceId: string;
    attributes: Record<string, unknown>;
    status: { code: number };
    events: unknown[];
    traceState?: string;
  }> = [];
  const logs: Array<{ traceId?: string }> = [];
  console.dir = ((value: typeof spans[number]) => { spans.push(value); }) as typeof console.dir;
  console.log = ((line: string) => { logs.push(JSON.parse(line)); }) as typeof console.log;

  try {
    delete process.env.LUMENMAP_TRACING;
    const untraced = withApiTrace("/api/health", async () => {
      assert.equal(trace.getActiveSpan(), undefined);
      return new Response(null, { status: 200 });
    });
    assert.equal((await untraced(new Request("http://localhost/api/health"))).status, 200);

    process.env.LUMENMAP_TRACING = "console";
    registerTracing();
    registerTracing(); // startup is idempotent

    const routes: TracedRoute[] = [
      "/api/v1/activity", "/api/v1/timeseries", "/api/v1/flow",
      "/api/v1/dapps", "/api/health",
    ];
    const incomingTraceId = "0123456789abcdef0123456789abcdef";
    for (const route of routes) {
      const traced = withApiTrace(route, async () => {
        assert.equal(trace.getActiveSpan()?.isRecording(), true);
        logInfo({ event: "trace.smoke", correlationId: "test" });
        return new Response(null, { status: 200 });
      });
      const request = new Request(`http://localhost${route}?account=GSECRET`, {
        headers: {
          traceparent: `00-${incomingTraceId}-0123456789abcdef-01`,
          tracestate: "private=GSECRET",
        },
      });
      assert.equal((await traced(request)).status, 200);
    }

    // Other framework spans must never reach either exporter.
    trace.getTracer("next").startSpan("GET /private?account=GSECRET").end();
    await flushTracing();

    assert.deepEqual(spans.map((span) => span.name), routes.map((route) => `lumenmap.api.GET ${route}`));
    for (const span of spans) {
      assert.equal(span.traceId, incomingTraceId);
      assert.deepEqual(span.attributes, {
        "http.route": span.name.replace("lumenmap.api.GET ", ""),
        "http.request.method": "GET",
        "http.response.status_code": 200,
      });
      assert.equal(span.status.code, 0);
      assert.equal(span.traceState, undefined);
    }
    assert.equal(logs.length, routes.length);
    assert.ok(logs.every((log) => log.traceId === incomingTraceId));

    const failed = withApiTrace("/api/v1/flow", async () => {
      throw new Error("private account GSECRET");
    });
    await assert.rejects(failed(new Request("http://localhost/api/v1/flow")));
    await flushTracing();
    assert.equal(spans.at(-1)?.status.code, 2);
    assert.deepEqual(spans.at(-1)?.events, []);
    assert.equal(JSON.stringify(spans.at(-1)?.attributes).includes("GSECRET"), false);
  } finally {
    console.dir = oldDir;
    console.log = oldLog;
    if (oldMode === undefined) delete process.env.LUMENMAP_TRACING;
    else process.env.LUMENMAP_TRACING = oldMode;
  }
});
