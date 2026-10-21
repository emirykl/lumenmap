# Public API tracing

Set `LUMENMAP_TRACING=console` or `LUMENMAP_TRACING=otlp` to trace GET requests
to `/api/v1/activity`, `/api/v1/timeseries`, `/api/v1/flow`,
`/api/v1/dapps`, and `/api/health`. Tracing is off by default; unset the
variable or set it to `off` to disable it. The root `instrumentation.ts`
registers the Node tracer once when Next.js starts.

## Local console check

In one terminal, start the server with fixture data and console export:

```sh
LUMENMAP_DATA_SOURCE=fixture LUMENMAP_TRACING=console npm run dev
```

In another terminal, request each route:

```sh
curl -sS 'http://localhost:3000/api/v1/activity?period=1d' >/dev/null
curl -sS 'http://localhost:3000/api/v1/timeseries?period=1d' >/dev/null
curl -sS 'http://localhost:3000/api/v1/flow?period=1d' >/dev/null
curl -sS 'http://localhost:3000/api/v1/dapps?period=1d' >/dev/null
curl -sS 'http://localhost:3000/api/health?type=liveness' >/dev/null
```

The server prints a `lumenmap.api.GET /api/...` span for each request after
the export batch flushes (normally within five seconds). Structured JSON logs
inside those requests contain the same `traceId` as the span. Incoming W3C
`traceparent` headers are honored, so the span can join an upstream trace.

## OTLP/HTTP

Point the exporter at a local collector that accepts OTLP/HTTP traces:

```sh
LUMENMAP_DATA_SOURCE=fixture LUMENMAP_TRACING=otlp \
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces npm run dev
```

Use the same fixture requests above, then inspect the collector's trace
output. The endpoint defaults to `http://localhost:4318/v1/traces` when the
variable is unset. Export uses the OpenTelemetry batch processor, so traces
may appear a few seconds after the HTTP response.

## Overhead and security

Disabled mode skips span creation and registers no exporter. Enabled mode
adds one request span per listed route, trace context processing, and batched
export work. Console output is synchronous when a batch flushes and is best
for local use. The effect on request latency has not been benchmarked; measure
it in the target deployment before enabling OTLP for high traffic.

**SECURITY: Span attributes are allowlisted** to the fixed route template,
`http.request.method`, and `http.response.status_code`. Query strings,
addresses, request and response bodies, provider errors, and raw URLs must
never be added as span attributes or exception events. The span processor drops
framework and other spans before they enter the export queue. If a new
attribute is proposed, review its possible values for PII and cardinality
before adding it.
