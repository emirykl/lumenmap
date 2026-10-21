import { type Context } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

let registered = false;
let provider: NodeTracerProvider | undefined;
const EXPORTED_SPANS = new Set([
  "lumenmap.api.GET /api/v1/activity",
  "lumenmap.api.GET /api/v1/timeseries",
  "lumenmap.api.GET /api/v1/flow",
  "lumenmap.api.GET /api/v1/dapps",
  "lumenmap.api.GET /api/health",
]);

/** Admit only public route spans into the export queue. */
class PublicApiSpanProcessor implements SpanProcessor {
  constructor(private readonly processor: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    if (EXPORTED_SPANS.has(span.name)) this.processor.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    if (EXPORTED_SPANS.has(span.name)) this.processor.onEnd(span);
  }

  shutdown(): Promise<void> {
    return this.processor.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.processor.forceFlush();
  }
}

export function registerTracing(): void {
  const mode = process.env.LUMENMAP_TRACING;
  if (registered || (mode !== "console" && mode !== "otlp")) return;

  const exporter = mode === "console"
    ? new ConsoleSpanExporter()
    : new OTLPTraceExporter();
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": "lumenmap" }),
    spanProcessors: [new PublicApiSpanProcessor(new BatchSpanProcessor(exporter))],
  });
  provider.register();
  registered = true;
}

export async function flushTracing(): Promise<void> {
  await provider?.forceFlush();
}

