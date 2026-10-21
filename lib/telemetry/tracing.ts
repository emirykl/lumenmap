import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";

/** Only these fixed route templates and HTTP fields may enter exported spans. */
export type TracedRoute =
  | "/api/v1/activity"
  | "/api/v1/timeseries"
  | "/api/v1/flow"
  | "/api/v1/dapps"
  | "/api/health";

export function withApiTrace(
  route: TracedRoute,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return (request) => {
    if (process.env.LUMENMAP_TRACING !== "console" && process.env.LUMENMAP_TRACING !== "otlp") {
      return handler(request);
    }

    const parent = propagation.extract(context.active(), request.headers, {
      // Accept only W3C trace IDs. Tracestate and baggage can contain user data.
      get: (headers, key) => key === "traceparent" ? headers.get(key) ?? undefined : undefined,
      keys: () => ["traceparent"],
    });
    return trace.getTracer("lumenmap.api").startActiveSpan(
      `lumenmap.api.GET ${route}`,
      { attributes: { "http.route": route, "http.request.method": "GET" } },
      parent,
      async (span) => {
        try {
          const response = await handler(request);
          span.setAttribute("http.response.status_code", response.status);
          if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
          return response;
        } catch (error) {
          // Error messages can contain addresses or request data; never record them.
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  };
}
