# Lash Language Packages

Lash ships as an MCP peer profile, not as a replacement transport or a parallel
MCP implementation. Each language package is a thin helper layer over that
language's official MCP SDK.

The rule is simple:

> MCP owns servers, clients, transports, auth, resources, prompts, lifecycle,
> streaming transport behavior, and protocol compliance. Lash owns the peer
> convention: structured continuations, trace/thread propagation, peer tool-call
> helpers, and conformance fixtures.

## Package Contract

Every Lash language package should expose the same small surface:

- `result(...)`
- `continuation(...)`
- `decision(...)`
- `error(...)`
- `thread_schema(...)`
- `lash_tool(...)` / tool metadata helpers
- `call_tool_result(...)` / structured MCP result helpers
- `call_peer(...)` / continuation-following helper over the native MCP client
- validation for thread, envelope, continuation, and result shapes

Every package should avoid owning:

- HTTP, stdio, SSE, Streamable HTTP, or WebSocket transports
- MCP initialization and session lifecycle
- OAuth, mTLS, bearer validation, or identity providers
- process supervision
- retries, durable workflow, queues, or scheduling
- agent memory, compaction, prompting, or model calls
- a custom manifest or discovery protocol

## Shared Wire Shape

Lash data lives in normal MCP tool metadata and `CallToolResult` fields.

Tool metadata:

```json
{
  "_meta": {
    "io.lashprotocol": {
      "profile_version": "mcp-profile-0.1",
      "thread_schema": {},
      "allowed_callers": ["orch"],
      "result_schema": {},
      "partial_schema": {}
    }
  }
}
```

Structured result:

```json
{
  "content": [{ "type": "text", "text": "{...same JSON...}" }],
  "structuredContent": {
    "kind": "continuation",
    "from": "work-1",
    "trace": "trace-001",
    "thread": {
      "id": "review/oauth",
      "resume": "resume_or_create",
      "summary": "Review OAuth readiness.",
      "turn": 1
    },
    "continuation": {
      "method": "review_segment",
      "params_hint": {
        "segment_id": "auth-runtime",
        "needs": ["docs/production-runtime.md"]
      }
    }
  },
  "isError": false
}
```

The `kind` field is the portable decision point:

- `result`: completed tool call with `value`
- `continuation`: caller should make another MCP `tools/call`
- `decision`: completed orchestration decision, often `emit_response=false`
- `stream`: buffered or transport-mapped partials plus final `value`
- `error`: structured tool error

## Repository Plan

The package names should be boring and explicit.

| Language | MCP SDK | SDK tier | Lash repo | Priority |
|---|---|---:|---|---:|
| TypeScript | `modelcontextprotocol/typescript-sdk` | 1 | `lash-ts` | 2 |
| Python | `modelcontextprotocol/python-sdk` | 1 | `lash-py` | 1 |
| C# | `modelcontextprotocol/csharp-sdk` | 1 | `lash-csharp` | 4 |
| Go | `modelcontextprotocol/go-sdk` | 1 | `lash-go` | 3 |
| Java | `modelcontextprotocol/java-sdk` | 2 | `lash-java` | 6 |
| Rust | `modelcontextprotocol/rust-sdk` | 2 | `lash-rs` | 5 |
| Swift | `modelcontextprotocol/swift-sdk` | 3 | `lash-swift` | 8 |
| Ruby | `modelcontextprotocol/ruby-sdk` | 3 | `lash-ruby` | 7 |
| PHP | `modelcontextprotocol/php-sdk` | 3 | `lash-php` | 9 |
| Kotlin | `modelcontextprotocol/kotlin-sdk` | TBD | `lash-kotlin` | 10 |

Priority follows two constraints:

1. Build first where the MCP SDK is Tier 1 and agent developers are already
   active.
2. Keep Rust close because this repo already has Rust conformance and protocol
   fixtures, even though the MCP Rust SDK is Tier 2.

## Monorepo To Multi-Repo Split

This repository remains the reference/spec workspace:

- `docs/mcp-profile.md`
- `docs/language-packages.md`
- `testdata/`
- Rust conformance helpers
- cross-language fixtures
- demo apps

Language repositories should start from the code already here:

- the Python sibling is `lash-py`
- this repo is `lash-ts`
- `crates/lash-*` informs `lash-rs`

Each language repo should include:

- package metadata
- helpers
- tests against shared JSON fixtures
- one local peer-to-peer example
- one MCP SDK example
- CI that runs conformance fixtures

## Conformance Matrix

Every implementation must pass the same fixture set:

- creates the same `thread_schema`
- wraps the same `result`
- wraps the same `continuation`
- rejects malformed thread objects
- rejects malformed continuation objects
- follows a continuation mechanically
- preserves `trace`
- preserves `thread`
- exposes `io.lashprotocol` metadata
- interoperates with at least one other language package

Minimum cross-language checks:

- Python client -> Python server
- Python client -> TypeScript server
- TypeScript client -> Python server
- Rust helper fixtures match Python and TypeScript output

## MCP SEP Alignment

Track these MCP SEPs before freezing `mcp-profile-1.0`:

- SEP-414: align trace propagation with OpenTelemetry trace context.
- SEP-986: keep Lash method/tool names inside MCP tool-name rules.
- SEP-1046, SEP-2207, SEP-985, SEP-990, SEP-991: reuse MCP OAuth guidance.
- SEP-1613: treat JSON Schema 2020-12 as the default dialect.
- SEP-1686: decide how Lash `thread` relates to MCP Tasks.
- SEP-2133: publish Lash as an MCP extension/profile rather than a competing
  protocol.
- SEP-2243: follow Streamable HTTP header conventions for trace and auth
  propagation.

## First External Release

The first release should be small enough to audit in an afternoon:

1. Freeze `mcp-profile-0.1`.
2. Extract `lash-py`.
3. Extract `lash-ts`.
4. Add cross-language fixtures.
5. Add a FastMCP/TypeScript interop demo.
6. Submit a short MCP SEP or extension proposal describing the peer profile.

The launch line:

> Lash is a minimal MCP profile for peer-symmetric agent workflows. Agents
> expose MCP tools, call peer tools directly, and use structured continuations
> to move work down and evidence back up without inventing a new transport.
