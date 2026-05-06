# lash-ts

Tiny TypeScript helpers for the Lash MCP profile.

Lash is not a replacement transport or a new MCP SDK. It is a convention layer
for peer agents that already expose and consume MCP tools:

- every peer exposes its callable surface as MCP tools;
- peers call each other with normal MCP client APIs;
- Lash-shaped results travel in `CallToolResult.structuredContent`;
- continuations are explicit structured results that tell the caller what to call next;
- `trace` and `thread` keep distributed work and local agent memory aligned.

## Install

```sh
npm install @lashprotocol/lash
```

Requires Node 20+. The package is ESM-only.

## Example

```ts
import {
  callToolResult,
  continuation,
  lashTool,
  result,
  threadSchema,
  type LashThread
} from "@lashprotocol/lash";

const thread: LashThread = {
  id: "review/agent-runtime",
  resume: "resume_or_create",
  summary: "Review an agent runtime change.",
  turn: 1
};

export const reviewTool = lashTool({
  name: "review_segment",
  description: "Review one assigned code segment.",
  properties: {
    thread: threadSchema(),
    segment_id: { type: "string" }
  },
  required: ["thread", "segment_id"],
  trace: "trace-review-001",
  allowedCallers: ["orch"]
});

export function reviewSegment(args: { thread: LashThread; context?: string }) {
  if (!args.context) {
    return callToolResult(
      continuation("review_segment", {
        from: "worker-1",
        trace: "trace-review-001",
        thread: args.thread,
        paramsHint: { needs: ["local evidence"] }
      })
    );
  }

  return callToolResult(
    result(
      { findings: [], confidence: 0.91 },
      { from: "worker-1", trace: "trace-review-001", thread: args.thread }
    )
  );
}
```

## API

- `threadSchema()` returns the JSON Schema for Lash thread metadata.
- `lashTool(options)` creates MCP tool metadata with Lash `_meta` and output schema.
- `result(value, options)` creates a structured result envelope.
- `continuation(method, options)` creates a structured continuation envelope.
- `stream(partials, value, options)` creates a structured stream envelope.
- `lashError(code, message, options)` creates a structured error envelope.
- `callToolResult(envelope)` wraps a Lash envelope as an MCP-style `CallToolResult`.
- `validateThread(value)`, `validateSchema(schema, value)`, and `validateMethodName(name)` validate Lash boundaries.
- `withThread(args, thread)` adds a thread to tool arguments when one is not already present.

## Development

```sh
npm install
npm run check
npm run demo
```

The demo is transport-free and shows the contract. MCP SDKs should own server
lifecycle, clients, transports, auth, and model calls.

## Boundaries

This package owns tool metadata helpers, the Lash structured output envelope,
trace/thread validation, and envelope constructors.

This package does not own MCP transports, server lifecycle, client sessions,
authentication, authorization, model calls, durable queues, agent memory, or
compaction.
