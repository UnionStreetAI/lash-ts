import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";

export const PROFILE_VERSION = "mcp-profile-0.1";
const METHOD_NAME_RE = /^[A-Za-z0-9_]{1,128}$/;

export type LashThread = {
  id: string;
  resume: "resume_or_create" | "resume_only" | "new";
  summary: string;
  turn: number;
};

export type LashEnvelope =
  | ({ kind: "result"; value: unknown } & LashEnvelopeBase)
  | ({
      kind: "continuation";
      continuation: { method: string; params_hint?: Record<string, unknown> };
    } & LashEnvelopeBase)
  | ({ kind: "stream"; partials: Record<string, unknown>[]; value: unknown } & LashEnvelopeBase)
  | ({ kind: "error"; error: { code: number; message: string } } & LashEnvelopeBase);

type LashEnvelopeBase = {
  from: string;
  trace: string;
  thread: LashThread;
};

const ajv = new Ajv2020({ allErrors: true, strict: false });

export function threadSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      id: { type: "string", minLength: 1, maxLength: 256 },
      resume: { type: "string", enum: ["resume_or_create", "resume_only", "new"] },
      summary: { type: "string" },
      turn: { type: "integer", minimum: 0 }
    },
    required: ["id", "resume", "summary", "turn"],
    additionalProperties: false
  };
}

export function withThread<T extends Record<string, unknown>>(
  args: T,
  thread: LashThread
): T & { thread: LashThread } {
  return { ...args, thread: (args.thread as LashThread | undefined) ?? thread };
}

export function validateSchema(
  schema: Record<string, unknown>,
  value: unknown,
  label = "value"
): void {
  const validate = ajv.compile(schema);
  if (validate(value)) return;
  throw new Error(`${label}${formatAjvError(validate.errors?.[0])}`);
}

export function validateThread(thread: unknown): asserts thread is LashThread {
  validateSchema(threadSchema(), thread, "thread");
}

export function lashTool(options: {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required: string[];
  trace: string;
  allowedCallers?: string[];
  resultSchema?: Record<string, unknown>;
  partialSchema?: Record<string, unknown>;
}): Record<string, unknown> {
  validateMethodName(options.name);
  if (!options.description || options.description.length > 1024) {
    throw new Error("description must be 1-1024 characters");
  }
  if (!Object.hasOwn(options.properties, "thread")) {
    throw new Error("Lash MCP tools must include a thread property");
  }
  if (!options.required.includes("thread")) {
    throw new Error("Lash MCP tools must require thread");
  }

  const lashMeta: Record<string, unknown> = {
    profile_version: PROFILE_VERSION,
    trace: options.trace,
    thread_schema: threadSchema()
  };
  if (options.allowedCallers) lashMeta.allowed_callers = options.allowedCallers;
  if (options.resultSchema) lashMeta.result_schema = options.resultSchema;
  if (options.partialSchema) lashMeta.partial_schema = options.partialSchema;
  return {
    name: options.name,
    description: options.description,
    inputSchema: {
      type: "object",
      properties: options.properties,
      required: options.required,
      additionalProperties: false
    },
    outputSchema: lashOutputSchema(),
    _meta: { "io.lashprotocol": lashMeta }
  };
}

export function lashOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["result", "continuation", "stream", "error"] },
      from: { type: "string" },
      trace: { type: "string" },
      thread: threadSchema(),
      value: {},
      partials: { type: "array", items: { type: "object" } },
      continuation: {
        type: "object",
        properties: {
          method: { type: "string", pattern: "^[A-Za-z0-9_]{1,128}$" },
          params_hint: { type: "object" }
        },
        required: ["method"],
        additionalProperties: false
      },
      error: {
        type: "object",
        properties: {
          code: { type: "integer" },
          message: { type: "string", minLength: 1 }
        },
        required: ["code", "message"],
        additionalProperties: true
      }
    },
    required: ["kind", "from", "trace", "thread"],
    oneOf: [
      { properties: { kind: { const: "result" } }, required: ["value"] },
      { properties: { kind: { const: "continuation" } }, required: ["continuation"] },
      { properties: { kind: { const: "stream" } }, required: ["partials", "value"] },
      { properties: { kind: { const: "error" } }, required: ["error"] }
    ],
    additionalProperties: true
  };
}

export function result(value: unknown, options: BaseOptions): LashEnvelope {
  return envelope("result", options, { value });
}

export function continuation(
  method: string,
  options: BaseOptions & { paramsHint?: Record<string, unknown> }
): LashEnvelope {
  validateMethodName(method);
  const cont: { method: string; params_hint?: Record<string, unknown> } = { method };
  if (options.paramsHint) cont.params_hint = options.paramsHint;
  return envelope("continuation", options, { continuation: cont });
}

export function stream(
  partials: Record<string, unknown>[],
  value: unknown,
  options: BaseOptions
): LashEnvelope {
  if (!Array.isArray(partials)) throw new Error("partials must be an array");
  return envelope("stream", options, { partials, value });
}

export function lashError(code: number, message: string, options: BaseOptions): LashEnvelope {
  if (!Number.isInteger(code)) throw new Error("error code must be an integer");
  if (!message) throw new Error("error message must be non-empty");
  return envelope("error", options, { error: { code, message } });
}

export function callToolResult(structured: LashEnvelope): Record<string, unknown> {
  validateSchema(lashOutputSchema(), structured, "structuredContent");
  return {
    content: [{ type: "text", text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: structured.kind === "error"
  };
}

type BaseOptions = { trace: string; thread: LashThread; from: string };

function envelope(
  kind: LashEnvelope["kind"],
  options: BaseOptions,
  fields: Record<string, unknown>
): LashEnvelope {
  if (!options.trace) throw new Error("trace must be non-empty");
  validateThread(options.thread);
  const structured = {
    kind,
    from: options.from,
    trace: options.trace,
    thread: options.thread,
    ...fields
  } as LashEnvelope;
  validateSchema(lashOutputSchema(), structured, "structuredContent");
  return structured;
}

function formatAjvError(error: ErrorObject | undefined): string {
  if (!error) return ": invalid";
  const path = error.instancePath ? error.instancePath.replaceAll("/", ".") : "";
  return `${path}: ${error.message ?? "invalid"}`;
}

export function validateMethodName(name: string): void {
  if (!METHOD_NAME_RE.test(name) || name.startsWith("__")) {
    throw new Error(
      "method name must be 1-128 chars, alphanumeric plus _, and not start with __"
    );
  }
}
