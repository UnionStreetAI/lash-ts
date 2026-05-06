import assert from "node:assert/strict";
import test from "node:test";
import {
  callToolResult,
  continuation,
  lashTool,
  lashOutputSchema,
  result,
  threadSchema,
  validateMethodName,
  validateThread,
  withThread
} from "./index.js";

const thread = {
  id: "review/protocol-core",
  resume: "resume_or_create" as const,
  summary: "Review Lash",
  turn: 1
};

test("builds Lash tool metadata", () => {
  const tool = lashTool({
    name: "request_review",
    description: "Request a peer review.",
    properties: { thread: threadSchema(), task: { type: "string" } },
    required: ["thread", "task"],
    trace: "trace-1",
    allowedCallers: ["master"]
  });
  assert.equal(tool.name, "request_review");
  assert.deepEqual(tool.outputSchema, lashOutputSchema());
  assert.deepEqual((tool._meta as any)["io.lashprotocol"].allowed_callers, ["master"]);
});

test("wraps structured result as MCP CallToolResult", () => {
  const structured = result({ accepted: true }, { from: "orch", trace: "trace-1", thread });
  const wrapped = callToolResult(structured);
  assert.equal((wrapped.structuredContent as any).kind, "result");
  assert.equal(wrapped.isError, false);
});

test("creates continuation envelopes", () => {
  const structured = continuation("provide_review_rationale", {
    from: "orch",
    trace: "trace-1",
    thread,
    paramsHint: { segment_id: "seg-1" }
  });
  assert.equal(structured.kind, "continuation");
});

test("adds thread to arguments", () => {
  assert.equal(withThread({ task: "review" }, thread).thread.id, thread.id);
});

test("rejects malformed thread objects", () => {
  assert.throws(() => validateThread({ ...thread, turn: undefined }), /thread/);
});

test("rejects bad method names", () => {
  validateMethodName("review_segment");
  assert.throws(() => validateMethodName("__manifest__"), /method name/);
  assert.throws(() => validateMethodName("review-segment"), /method name/);
});

test("rejects mismatched envelopes", () => {
  assert.throws(
    () =>
      callToolResult({
        kind: "continuation",
        from: "worker-1",
        trace: "trace-1",
        thread
      } as any),
    /structuredContent/
  );
});
