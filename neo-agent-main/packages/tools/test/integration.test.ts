/**
 * 도구 + 게이트 + 코어의 통합 시나리오.
 *
 * 두 패키지는 **상호 무의존**이므로(TOOLS-INTERFACE §1) 실제 결합은 호스트가 배선할
 * 때 처음 일어난다. 그 배선이 계약대로 성립하는지는 어느 한쪽의 단위 테스트로는
 * 알 수 없어서 여기서 확인한다 — 게이트는 `packages/tools`의 devDependency이며
 * 런타임 의존이 아니다(예산 게이트는 `dependencies`만 검사한다).
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Agent,
  type AgentEvent,
  type AssistantMessage,
  type ModelClient,
  type ModelStreamEvent,
} from "@neo-agent/core";
import {
  type AllowlistStore,
  type ApprovalPrompt,
  type ApprovalRequest,
  type ApprovalResponse,
  createApprovalGate,
} from "@neo-agent/gate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHostShellExecutor } from "../src/executor.ts";
import { TOOL_GATE_PROFILES } from "../src/gate-profiles.ts";
import { createStandardTools } from "../src/index.ts";
import { createWorkspaceBoundary, type WorkspaceBoundary } from "../src/workspace.ts";

interface ScriptedTurn {
  text?: string;
  toolCall?: { toolName: string; args: unknown };
}

/** 스크립트대로 도구를 부르는 모의 모델. 턴마다 하나씩 소비한다 */
function createScriptedClient(turns: readonly ScriptedTurn[]): ModelClient {
  let index = 0;
  return {
    modelId: "mock/scripted",
    async *stream(): AsyncIterable<ModelStreamEvent> {
      const turn = turns[index] ?? {};
      index += 1;

      const content: AssistantMessage["content"] = [];
      if (turn.text !== undefined) {
        yield { type: "text_delta", text: turn.text };
        content.push({ type: "text", text: turn.text });
      }
      if (turn.toolCall !== undefined) {
        const toolCallId = `call-${index}`;
        yield {
          type: "toolcall",
          toolCallId,
          toolName: turn.toolCall.toolName,
          args: turn.toolCall.args,
        };
        content.push({
          type: "toolCall",
          toolCallId,
          toolName: turn.toolCall.toolName,
          args: turn.toolCall.args,
        });
      }

      yield {
        type: "done",
        message: {
          role: "assistant",
          content,
          stopReason: turn.toolCall === undefined ? "end_turn" : "tool_use",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
          timestamp: 0,
        },
      };
    },
  };
}

/** 생성자 파라미터 프로퍼티는 `erasableSyntaxOnly`가 막으므로 클래스 대신 클로저를 쓴다 */
function recordingPrompt(answer: ApprovalResponse): ApprovalPrompt & { seen: ApprovalRequest[] } {
  const seen: ApprovalRequest[] = [];
  return {
    seen,
    async ask(req: ApprovalRequest): Promise<ApprovalResponse> {
      seen.push(req);
      return answer;
    },
  };
}

function memoryAllowlist(): AllowlistStore {
  const keys = new Set<string>();
  return { has: (key) => keys.has(key), add: (key) => void keys.add(key) };
}

describe("도구 + 게이트 + 코어 통합", () => {
  let sandbox: string;
  let root: string;
  let boundary: WorkspaceBoundary;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-integration-")));
    root = join(sandbox, "workspace");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "readme.md"), "hello from workspace\n");
    boundary = createWorkspaceBoundary({ root, home: join(sandbox, "home") });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  function buildAgent(
    turns: readonly ScriptedTurn[],
    prompt: ApprovalPrompt,
    allowlist: AllowlistStore = memoryAllowlist(),
  ): { agent: Agent; events: AgentEvent[] } {
    const tools = createStandardTools({
      boundary,
      executor: createHostShellExecutor({ env: { PATH: process.env.PATH ?? "" } }),
    });

    const agent = new Agent({
      session: { systemPrompt: "test", tools },
      modelClient: createScriptedClient(turns),
      hooks: createApprovalGate({
        mode: "manual",
        toolProfiles: TOOL_GATE_PROFILES,
        // 게이트와 도구가 **같은 판정기 인스턴스**를 공유한다 — 둘로 나뉘면
        // "게이트는 안이라 했는데 도구는 밖을 읽는" 불일치가 생긴다.
        classifier: boundary,
        allowlist,
        prompt,
      }),
    });

    const events: AgentEvent[] = [];
    agent.subscribe((event) => void events.push(event));
    return { agent, events };
  }

  it("워크스페이스 안 읽기는 승인 없이 통과한다", async () => {
    const prompt = recordingPrompt("deny");
    const { agent, events } = buildAgent(
      [{ toolCall: { toolName: "read_file", args: { path: "readme.md" } } }, { text: "done" }],
      prompt,
    );

    await agent.prompt("read the readme");

    expect(prompt.seen).toHaveLength(0);
    const toolEnd = events.find((event) => event.type === "tool_end");
    expect(toolEnd?.type === "tool_end" && toolEnd.isError).toBe(false);
    expect(events[0]?.type).toBe("agent_start");
    expect(events.at(-1)?.type).toBe("agent_end");
  });

  it("쓰기는 승인을 거쳐 실행된다", async () => {
    const prompt = recordingPrompt("allow-once");
    const { agent } = buildAgent(
      [
        { toolCall: { toolName: "write_file", args: { path: "out.txt", content: "written" } } },
        { text: "done" },
      ],
      prompt,
    );

    await agent.prompt("write a file");

    expect(prompt.seen).toHaveLength(1);
    expect(prompt.seen[0]?.toolName).toBe("write_file");
    expect(readFileSync(join(root, "out.txt"), "utf8")).toBe("written");
  });

  it("거부는 도구를 실행하지 않고 사유를 모델에게 보인다", async () => {
    const prompt = recordingPrompt("deny");
    const { agent, events } = buildAgent(
      [
        { toolCall: { toolName: "write_file", args: { path: "blocked.txt", content: "nope" } } },
        { text: "understood" },
      ],
      prompt,
    );

    await agent.prompt("write a file");

    expect(() => readFileSync(join(root, "blocked.txt"), "utf8")).toThrow();

    const toolEnd = events.find((event) => event.type === "tool_end");
    expect(toolEnd?.type === "tool_end" && toolEnd.isError).toBe(true);

    // 침묵 거부 금지(§2.6) — 사유가 트랜스크립트에 남아 모델이 다음 행동을 정정할 수 있다.
    const toolResult = agent.state.messages.find((message) => message.role === "toolResult");
    const reasonText =
      toolResult?.role === "toolResult"
        ? toolResult.content.map((part) => (part.type === "text" ? part.text : "")).join("")
        : "";
    expect(reasonText.length).toBeGreaterThan(0);
  });

  it("`allow-always`를 고르면 다음 같은 호출은 묻지 않는다", async () => {
    const prompt = recordingPrompt("allow-always");
    const allowlist = memoryAllowlist();
    const turns: ScriptedTurn[] = [
      { toolCall: { toolName: "shell", args: { command: "echo first" } } },
      { toolCall: { toolName: "shell", args: { command: "echo first" } } },
      { text: "done" },
    ];

    const { agent } = buildAgent(turns, prompt, allowlist);
    await agent.prompt("run it twice");

    expect(prompt.seen).toHaveLength(1);
  });

  it("크리덴셜 경로는 게이트 판정 이전에 도구가 막는다", async () => {
    const prompt = recordingPrompt("allow-once");
    const { agent, events } = buildAgent(
      [
        { toolCall: { toolName: "read_file", args: { path: "~/.neo-agent/credentials" } } },
        { text: "blocked" },
      ],
      prompt,
    );

    await agent.prompt("read credentials");

    const toolEnd = events.find((event) => event.type === "tool_end");
    expect(toolEnd?.type === "tool_end" && toolEnd.isError).toBe(true);
  });

  it("실패해도 런 봉투는 닫힌다", async () => {
    const prompt = recordingPrompt("deny");
    const { agent, events } = buildAgent(
      [
        { toolCall: { toolName: "read_file", args: { path: "does-not-exist.txt" } } },
        { text: "recovered" },
      ],
      prompt,
    );

    await agent.prompt("read a missing file");

    expect(events.filter((event) => event.type === "agent_start")).toHaveLength(1);
    expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("agent_end");
  });
});
