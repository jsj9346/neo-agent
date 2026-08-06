/**
 * 훅 어댑터 — `docs/APPROVAL-GATE.md` §4, `CORE-INTERFACE.md` §7.
 *
 * 코어와의 접점이 `beforeToolCall` 하나라는 것과, 그 반환이 코어의 닫힌
 * discriminated union(`ToolCallDecision`)에 정확히 맞는다는 것을 확인한다.
 */

import type { ToolCallDecision } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { createApprovalGate } from "../src/hook.ts";
import type { ApprovalGateConfig } from "../src/types.ts";
import { makeAllowlist, makeClassifier, makePrompt, PROFILES, WORKSPACE_ROOT } from "./helpers.ts";

const CREDENTIALS = `${WORKSPACE_ROOT}/.env`;

function configOf(overrides: Partial<ApprovalGateConfig> = {}): ApprovalGateConfig {
  return {
    mode: "manual",
    toolProfiles: { ...PROFILES },
    classifier: makeClassifier({ denied: [CREDENTIALS] }),
    allowlist: makeAllowlist(),
    prompt: makePrompt({ response: "allow-once" }),
    ...overrides,
  };
}

function call(
  hooks: { beforeToolCall: NonNullable<import("@neo-agent/core").AgentHooks["beforeToolCall"]> },
  toolName: string,
  args: unknown,
  signal: AbortSignal = new AbortController().signal,
): Promise<ToolCallDecision> {
  return hooks.beforeToolCall({ toolCallId: "call-1", toolName, args }, signal);
}

describe("코어 훅 계약", () => {
  it("allow는 `{ decision: 'allow' }` 하나뿐이다 — 잉여 필드가 새지 않는다", async () => {
    const gate = createApprovalGate(configOf());
    const decision = await call(gate, "read_file", { path: "src/a.ts" });
    expect(decision).toEqual({ decision: "allow" });
  });

  it("block에는 항상 사유가 실린다 — 침묵 거부 금지", async () => {
    const gate = createApprovalGate(configOf({ prompt: makePrompt({ response: "deny" }) }));
    const decision = await call(gate, "shell", { command: "npm test" });
    if (decision.decision !== "block") throw new Error("차단이어야 한다");
    expect(decision.reason.trim().length).toBeGreaterThan(0);
  });

  it("판정 계층은 코어로 새지 않는다 — 승인 정책이 코어 릴리스에 묶이지 않게", async () => {
    const gate = createApprovalGate(configOf());
    const decision = await call(gate, "read_file", { path: "src/a.ts" });
    expect(Object.keys(decision)).toEqual(["decision"]);
  });

  it("abort 시그널을 그대로 전달받아 차단한다", async () => {
    const controller = new AbortController();
    const gate = createApprovalGate(
      configOf({ prompt: makePrompt({ hang: true, onAsk: () => controller.abort() }) }),
    );
    const decision = await call(gate, "shell", { command: "sleep 100" }, controller.signal);
    expect(decision.decision).toBe("block");
  });
});

describe("생성 시 동결", () => {
  it("config를 나중에 바꿔도 판정이 흔들리지 않는다", async () => {
    const config = configOf({ denyRules: ["**publish**"] });
    const gate = createApprovalGate(config);

    // 프로세스 안에서 도는 코드가 게이트를 풀려는 시도 — 전부 무효여야 한다
    config.mode = "off";
    (config as { denyRules: readonly string[] }).denyRules = [];

    const decision = await call(gate, "shell", { command: "npm publish" });
    expect(decision.decision).toBe("block");
  });

  it("denied 경로는 mode를 off로 만들어 두고 시작해도 차단된다", async () => {
    const gate = createApprovalGate(configOf({ mode: "off" }));
    const decision = await call(gate, "read_file", { path: ".env" });
    expect(decision.decision).toBe("block");
  });

  it("allowlist만이 동결의 예외다 — 프롬프트 응답으로만 자란다", async () => {
    const allowlist = makeAllowlist();
    const gate = createApprovalGate(
      configOf({ allowlist, prompt: makePrompt({ response: "allow-always" }) }),
    );
    await call(gate, "shell", { command: "npm test" });
    expect(allowlist.added).toEqual(["shell:npm test"]);

    // 두 번째 호출은 프롬프트 없이 통과한다 (같은 프로세스, 메모리 반영)
    const silent = makePrompt();
    const gate2 = createApprovalGate(configOf({ allowlist, prompt: silent }));
    const decision = await call(gate2, "shell", { command: "npm test" });
    expect(decision).toEqual({ decision: "allow" });
    expect(silent.calls).toHaveLength(0);
  });
});
