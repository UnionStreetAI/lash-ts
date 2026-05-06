import {
  callToolResult,
  continuation,
  lashTool,
  result,
  threadSchema,
  type LashEnvelope,
  type LashThread
} from "./index.js";

const TRACE = "trace-ts-review-001";
const THREAD: LashThread = {
  id: "review/lash-ts",
  resume: "resume_or_create",
  summary: "Review the TypeScript Lash convention layer.",
  turn: 1
};

type ToolHandler = (args: Record<string, unknown>, caller: string) => Record<string, unknown>;

class Peer {
  readonly tools = new Map<string, ToolHandler>();
  readonly toolMetadata: Record<string, unknown>[] = [];

  constructor(readonly nodeId: string) {}

  tool(options: {
    name: string;
    description: string;
    properties: Record<string, unknown>;
    required: string[];
    handler: ToolHandler;
    allowedCallers?: string[];
  }): void {
    this.tools.set(options.name, options.handler);
    this.toolMetadata.push(
      lashTool({
        name: options.name,
        description: options.description,
        properties: { ...options.properties, thread: threadSchema() },
        required: [...options.required, "thread"],
        trace: TRACE,
        allowedCallers: options.allowedCallers
      })
    );
  }

  call(caller: string, method: string, arguments_: Record<string, unknown>): LashEnvelope {
    const handler = this.tools.get(method);
    if (!handler) throw new Error(`${this.nodeId}: unknown tool ${method}`);
    if (!Object.hasOwn(arguments_, "thread")) {
      throw new Error(`${this.nodeId}.${method}: missing thread`);
    }
    console.log(`${caller} -> ${this.nodeId}.${method}`);
    const wrapped = handler(arguments_, caller);
    const structured = wrapped.structuredContent as LashEnvelope | undefined;
    if (!structured) throw new Error(`${this.nodeId}.${method}: missing structuredContent`);
    console.log(`${this.nodeId} -> ${caller}: ${structured.kind}`);
    return structured;
  }
}

const master = new Peer("master");
const orch = new Peer("orch");
const work1 = new Peer("work-1");
const work2 = new Peer("work-2");

function workerReviewSegment(options: {
  workerId: string;
  segmentId: string;
  finding: Record<string, unknown>;
  needsContext?: boolean;
}): ToolHandler {
  return (args) => {
    if (options.needsContext && !args.context) {
      return callToolResult(
        continuation("review_segment", {
          trace: TRACE,
          thread: args.thread as LashThread,
          from: options.workerId,
          paramsHint: { segment_id: options.segmentId, needs: ["local evidence"] }
        })
      );
    }
    return callToolResult(
      result(
        {
          reviewer: options.workerId,
          segment_id: options.segmentId,
          findings: [options.finding],
          confidence: 0.92
        },
        { trace: TRACE, thread: args.thread as LashThread, from: options.workerId }
      )
    );
  };
}

work1.tool({
  name: "review_segment",
  description: "Review one assigned code segment and return structured findings.",
  properties: { segment_id: { type: "string" }, context: { type: "string" } },
  required: ["segment_id"],
  allowedCallers: ["orch"],
  handler: workerReviewSegment({
    workerId: "work-1",
    segmentId: "typescript-core",
    finding: {
      severity: "high",
      location: "src/index.ts",
      issue: "Thread and trace handling must be mechanically validated before dispatch.",
      recommendation: "Reject malformed caller/thread metadata before invoking handlers."
    }
  })
});

work2.tool({
  name: "review_segment",
  description: "Review one assigned code segment and return structured findings.",
  properties: { segment_id: { type: "string" }, context: { type: "string" } },
  required: ["segment_id"],
  allowedCallers: ["orch"],
  handler: workerReviewSegment({
    workerId: "work-2",
    segmentId: "agent-ergonomics",
    needsContext: true,
    finding: {
      severity: "medium",
      location: "src/index.ts",
      issue: "The convention layer is small enough to port, but examples must not own MCP.",
      recommendation: "Keep examples SDK-shaped and transport-free unless using a real MCP SDK."
    }
  })
});

master.tool({
  name: "deliver_review_opinion",
  description: "Receive the orchestrator's judged user-facing review opinion.",
  properties: { opinion: { type: "object" } },
  required: ["opinion"],
  allowedCallers: ["orch"],
  handler: (args) =>
    callToolResult(
      result(
        { accepted: true, displayed: true, opinion: args.opinion },
        { trace: TRACE, thread: args.thread as LashThread, from: "master" }
      )
    )
});

orch.tool({
  name: "request_review",
  description: "Fan review work to peers, judge findings, and optionally emit a user-facing opinion.",
  properties: { task: { type: "string" } },
  required: ["task"],
  allowedCallers: ["master"],
  handler: (args) => {
    const findings: Record<string, unknown>[] = [];
    for (const [worker, segmentId] of [
      [work1, "typescript-core"],
      [work2, "agent-ergonomics"]
    ] as const) {
      let response = worker.call("orch", "review_segment", {
        thread: args.thread,
        segment_id: segmentId
      });
      if (response.kind === "continuation") {
        response = worker.call("orch", response.continuation.method, {
          thread: args.thread,
          segment_id: response.continuation.params_hint?.segment_id ?? segmentId,
          context: "Local repo evidence gathered by orchestrator."
        });
      }
      if (response.kind !== "result") {
        throw new Error(`unexpected worker response: ${response.kind}`);
      }
      const value = response.value as { findings: Record<string, unknown>[] };
      findings.push(...value.findings);
    }

    const highCount = findings.filter((finding) => finding.severity === "high").length;
    const emitResponse = highCount > 0;
    const opinion = {
      emit_response: emitResponse,
      reasoning_summary: `${findings.length} findings reviewed; ${highCount} high severity.`,
      findings,
      next_action: emitResponse
        ? "Fix high-severity protocol validation issues first."
        : "No user-facing response needed."
    };
    if (emitResponse) {
      master.call("orch", "deliver_review_opinion", { thread: args.thread, opinion });
    }
    return callToolResult(
      result(opinion, { trace: TRACE, thread: args.thread as LashThread, from: "orch" })
    );
  }
});

console.log("tools/list orch:");
console.log(JSON.stringify(orch.toolMetadata, null, 2));
console.log("\nreview trace:");
const final = orch.call("master", "request_review", { thread: THREAD, task: "review Lash TS" });
console.log("\nfinal structuredContent:");
console.log(JSON.stringify(final, null, 2));
