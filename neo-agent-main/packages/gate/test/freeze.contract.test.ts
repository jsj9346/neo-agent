/**
 * 동결 계약 — `docs/SAFE-DEFAULTS.md` §4, `docs/APPROVAL-GATE.md` §5.
 *
 * "보안에 영향을 주는 모든 설정은 프로세스 시작 시 1회 읽고 동결한다. 프로세스
 * 안에서 도는 어떤 코드도(도구 실행, 프롬프트 인젝션 산출물 포함) 실행 중 게이트를
 * 약화시킬 수 없다."
 *
 * 이 파일은 **공개 진입점(`createApprovalGate`)** 기준으로 검증한다. 내부
 * `freezeGateConfig`가 아니라 호스트가 실제로 배선하는 함수가 동결을 보장해야
 * 계약이 지켜진 것이다. 변조 수단도 재할당뿐 아니라 **제자리 변형(push·delete·
 * 프로퍼티 대입)** 까지 시도한다 — 재할당만 막는 동결은 동결이 아니다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { AgentHooks, ToolCallDecision } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { createApprovalGate } from "../src/hook.ts";
import type { ApprovalGateConfig, GateToolProfile } from "../src/types.ts";
import { buildConfig, makePermissiveAllowlist } from "./contract-helpers.ts";
import { makeAllowlist, makeClassifier, makePrompt, PROFILES, WORKSPACE_ROOT } from "./helpers.ts";

type Gate = { beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]> };

function call(
  gate: Gate,
  toolName: string,
  args: unknown,
  signal: AbortSignal = new AbortController().signal,
): Promise<ToolCallDecision> {
  return gate.beforeToolCall({ toolCallId: "call-1", toolName, args }, signal);
}

describe("mode 동결", () => {
  it("생성 후 mode를 off로 바꿔도 판정이 변하지 않는다", async () => {
    const config = buildConfig({ prompt: makePrompt({ response: "deny" }) });
    const gate = createApprovalGate(config);

    const before = await call(gate, "shell", { command: "ls" });
    config.mode = "off";
    const after = await call(gate, "shell", { command: "ls" });

    expect(before).toMatchObject({ decision: "block" });
    expect(after).toEqual(before);
  });

  it("생성 후 mode를 manual로 조여도 판정이 변하지 않는다 — 동결은 양방향이다", async () => {
    const config = buildConfig({ mode: "off", prompt: makePrompt({ response: "deny" }) });
    const gate = createApprovalGate(config);

    config.mode = "manual";
    expect(await call(gate, "shell", { command: "ls" })).toEqual({ decision: "allow" });
  });
});

describe("denyRules 동결", () => {
  it("배열을 재할당해도 규칙이 사라지지 않는다", async () => {
    const config = buildConfig({
      denyRules: ["**npm publish**"],
      prompt: makePrompt({ response: "allow-once" }),
    });
    const gate = createApprovalGate(config);

    (config as { denyRules: readonly string[] }).denyRules = [];
    expect(await call(gate, "shell", { command: "npm publish" })).toMatchObject({
      decision: "block",
    });
  });

  it("배열을 제자리에서 비워도 규칙이 사라지지 않는다", async () => {
    const rules: string[] = ["**npm publish**"];
    const config = buildConfig({
      denyRules: rules,
      prompt: makePrompt({ response: "allow-once" }),
    });
    const gate = createApprovalGate(config);

    rules.length = 0;
    rules.push("**아무 의미 없는 규칙**");
    expect(await call(gate, "shell", { command: "npm publish" })).toMatchObject({
      decision: "block",
    });
  });

  it("나중에 규칙을 밀어 넣어도 새 규칙이 적용되지 않는다 — 세션 중 정책 추가 경로 없음", async () => {
    const rules: string[] = [];
    const config = buildConfig({
      denyRules: rules,
      prompt: makePrompt({ response: "allow-once" }),
    });
    const gate = createApprovalGate(config);

    rules.push("**ls**");
    expect(await call(gate, "shell", { command: "ls" })).toEqual({ decision: "allow" });
  });
});

describe("toolProfiles 동결", () => {
  it("프로필을 지워도 판정 분류가 유지된다", async () => {
    const profiles: Record<string, GateToolProfile> = { ...PROFILES };
    const prompt = makePrompt({ response: "allow-once" });
    const gate = createApprovalGate(buildConfig({ toolProfiles: profiles, prompt }));

    delete profiles.read_file;
    // 지워졌다면 unknown → 프롬프트. 동결됐다면 매트릭스 자동 허용(프롬프트 없음)
    await call(gate, "read_file", { path: "src/a.ts" });
    expect(prompt.calls).toEqual([]);
  });

  it("프로필을 나중에 추가해도 그 도구는 여전히 unknown이다", async () => {
    const profiles: Record<string, GateToolProfile> = { ...PROFILES };
    const prompt = makePrompt({ response: "allow-once" });
    const config = buildConfig({ toolProfiles: profiles, prompt });
    const gate = createApprovalGate(config);

    profiles.web_fetch = { kind: "fileRead", pathParam: "url" };
    await call(gate, "web_fetch", { url: "src/a.ts" });
    expect(prompt.last?.subject).toMatchObject({ kind: "unknown" });
  });

  it("프로필 객체 내부를 바꿔치기해도 판정 분류가 바뀌지 않는다", async () => {
    const profiles: Record<string, GateToolProfile> = {
      write_file: { kind: "fileWrite", pathParam: "path" },
    };
    const prompt = makePrompt({ response: "allow-once" });
    const config = buildConfig({ toolProfiles: profiles, prompt });
    const gate = createApprovalGate(config);

    // 쓰기를 "읽기"로 위장해 매트릭스 자동 허용을 노린 변조
    profiles.write_file = { kind: "fileRead", pathParam: "path" };
    await call(gate, "write_file", { path: "src/a.ts" });
    expect(prompt.last?.subject).toMatchObject({ kind: "fileWrite" });
  });

  it("동결된 프로필 객체를 제자리에서 변형해도 판정 분류가 바뀌지 않는다", async () => {
    const profile: GateToolProfile = { kind: "fileWrite", pathParam: "path" };
    const prompt = makePrompt({ response: "allow-once" });
    const gate = createApprovalGate(buildConfig({ toolProfiles: { write_file: profile }, prompt }));

    (profile as { kind: string }).kind = "fileRead";
    await call(gate, "write_file", { path: "src/a.ts" });
    expect(prompt.last?.subject).toMatchObject({ kind: "fileWrite" });
  });
});

describe("협력자 동결", () => {
  it("classifier를 나중에 바꿔치기해도 생성 시점의 판정기를 쓴다", async () => {
    const config = buildConfig({
      classifier: makeClassifier({ denied: [`${WORKSPACE_ROOT}/.env`] }),
      prompt: makePrompt({ response: "allow-once" }),
    });
    const gate = createApprovalGate(config);

    // 무엇이든 "안"이라고 답하는 가짜로 교체 시도
    config.classifier = makeClassifier();
    expect(await call(gate, "read_file", { path: ".env" })).toMatchObject({ decision: "block" });
  });

  it("prompt를 나중에 바꿔치기해도 생성 시점의 프롬프트가 응답한다", async () => {
    const original = makePrompt({ response: "deny" });
    const config = buildConfig({ prompt: original });
    const gate = createApprovalGate(config);

    config.prompt = makePrompt({ response: "allow-once" });
    expect(await call(gate, "shell", { command: "ls" })).toMatchObject({ decision: "block" });
    expect(original.calls).toHaveLength(1);
  });

  it("allowlist를 나중에 바꿔치기해도 생성 시점의 저장소를 쓴다", async () => {
    const original = makeAllowlist();
    const config = buildConfig({
      prompt: makePrompt({ response: "allow-always" }),
      allowlist: original,
    });
    const gate = createApprovalGate(config);

    config.allowlist = makePermissiveAllowlist();
    await call(gate, "shell", { command: "ls -la" });
    expect(original.added).toEqual([`shell:${WORKSPACE_ROOT}:ls -la`]);
  });
});

describe("allowlist는 동결의 명시적 예외 — 그러나 자라는 경로는 하나뿐이다", () => {
  it("allow-always 응답만이 allowlist를 키운다", async () => {
    const table: ReadonlyArray<readonly ["allow-once" | "deny", number]> = [
      ["allow-once", 0],
      ["deny", 0],
    ];
    for (const [response, expected] of table) {
      const allowlist = makeAllowlist();
      const gate = createApprovalGate(buildConfig({ prompt: makePrompt({ response }), allowlist }));
      await call(gate, "shell", { command: "ls -la" });
      expect(allowlist.added, response).toHaveLength(expected);
    }
  });

  it("프롬프트를 거치지 않는 모든 판정 경로에서 allowlist가 자라지 않는다", async () => {
    const allowlist = makeAllowlist();
    const config: ApprovalGateConfig = {
      mode: "manual",
      denyRules: ["**npm publish**"],
      toolProfiles: { ...PROFILES },
      classifier: makeClassifier({ denied: [`${WORKSPACE_ROOT}/.env`] }),
      allowlist,
      // 프롬프트에 닿으면 "항상 허용"이라 답한다 — 그래도 아래 경로들은 닿지 않아야 한다
      prompt: makePrompt({ response: "allow-always" }),
    };
    const gate = createApprovalGate(config);

    await call(gate, "read_file", { path: ".env" }); // 0 denied
    await call(gate, "shell", { command: "rm -rf /" }); // 1 하드라인
    await call(gate, "shell", { command: "npm publish" }); // 3 deny 규칙
    await call(gate, "read_file", { path: "src/a.ts" }); // 4 매트릭스
    await call(gate, "shell", { command: "sudo apt-get update" }); // 5 위험 → 키 없음
    await call(gate, "shell", { command: "ls; cat a" }); // 6 연산자 → 키 없음
    await call(gate, "web_fetch", { url: "https://x.test" }); // unknown → 키 없음

    expect(allowlist.added).toEqual([]);
  });

  it("mode가 off면 allowlist는 아예 자라지 않는다 — 프롬프트에 닿지 않으므로", async () => {
    const allowlist = makeAllowlist();
    const gate = createApprovalGate(
      buildConfig({ mode: "off", allowlist, prompt: makePrompt({ response: "allow-always" }) }),
    );
    await call(gate, "shell", { command: "ls -la" });
    expect(allowlist.added).toEqual([]);
  });

  it("학습된 키는 다음 호출에서 프롬프트 없이 통과한다 — 예외가 실제로 작동한다", async () => {
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ response: "allow-always" });
    const gate = createApprovalGate(buildConfig({ allowlist, prompt }));

    await call(gate, "shell", { command: "ls -la" });
    await call(gate, "shell", { command: "ls -la" });
    expect(prompt.calls).toHaveLength(1);
    expect(allowlist.added).toEqual([`shell:${WORKSPACE_ROOT}:ls -la`]);
  });
});
