/**
 * 표시 위조 탐지·침묵 거부 금지·중단 계약.
 *
 * - `APPROVAL-GATE.md` §4: "`display`를 만들 때 비가시 문자·동형이의 문자를 탐지해
 *   가시 표기로 이스케이프하고 `warnings`에 싣는다. CLI가 이걸 다시 가공하면 위조
 *   탐지가 무의미해진다 — **CLI는 그대로 표시만 한다.** 승인 UI가 거짓말하면
 *   게이트 전체가 무의미하다."
 * - `APPROVAL-GATE.md` §2·`CORE-INTERFACE.md` §7: "deny는 `{ decision: "block",
 *   reason }`으로 모델에게 보인다(침묵 거부 금지). 프롬프트 대기 중 abort 시그널이
 *   오면 프롬프트를 취소하고 block한다."
 */

import type { AgentHooks, ToolCallDecision } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { createApprovalGate } from "../src/hook.ts";
import { asBlock, buildConfig, run } from "./contract-helpers.ts";
import {
  ch,
  makeAllowlist,
  makeClassifier,
  makePrompt,
  RIGHT_TO_LEFT_OVERRIDE,
  WORKSPACE_ROOT,
  ZERO_WIDTH_SPACE,
} from "./helpers.ts";

const DENIED = `${WORKSPACE_ROOT}/.env`;

function call(
  gate: { beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]> },
  toolName: string,
  args: unknown,
  signal: AbortSignal = new AbortController().signal,
): Promise<ToolCallDecision> {
  return gate.beforeToolCall({ toolCallId: "call-1", toolName, args }, signal);
}

describe("표시 위조 탐지 — 비가시 문자", () => {
  it("비가시 문자가 가시 표기로 드러나고 경고에 실린다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", { command: `git${ZERO_WIDTH_SPACE} status` });
    expect(prompt.last?.display).toContain("<U+200B>");
    expect(prompt.last?.warnings.length).toBeGreaterThan(0);
  });

  it("방향 재정의 문자도 가시 표기로 드러난다 — 표시 순서를 뒤집는 위조다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", {
      command: `rm ${RIGHT_TO_LEFT_OVERRIDE}txt.sh`,
    });
    expect(prompt.last?.display).toContain("<U+202E>");
  });

  it("표시에는 원본 비가시 문자가 남아 있지 않다 — CLI가 그대로 그려도 안전해야 한다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", { command: `ls${ZERO_WIDTH_SPACE}-la` });
    expect(prompt.last?.display).not.toContain(ZERO_WIDTH_SPACE);
    expect(prompt.last?.display).not.toContain(RIGHT_TO_LEFT_OVERRIDE);
  });

  it("파일 경로의 비가시 문자도 같은 처리를 받는다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "write_file", { path: `src/a${ZERO_WIDTH_SPACE}.ts` });
    expect(prompt.last?.display).toContain("<U+200B>");
  });

  it("위조 흔적이 있으면 '항상 허용' 선택지가 없다", async () => {
    const prompt = makePrompt({ response: "allow-always" });
    const allowlist = makeAllowlist();
    await run({ prompt, allowlist }, "shell", { command: `npm${ZERO_WIDTH_SPACE} test` });
    expect(prompt.last?.allowAlwaysKey).toBeUndefined();
    expect(allowlist.added).toEqual([]);
  });
});

describe("표시 위조 탐지 — 동형이의 문자", () => {
  it("경고에 어느 코드포인트가 무엇으로 읽히는지 담긴다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    // 키릴 "с"(U+0441)로 시작하는 가짜 curl
    await run({ prompt }, "shell", { command: `${ch(0x441)}url https://x.test` });
    expect(prompt.last?.warnings.join(" ")).toContain("U+0441");
  });

  it("표시 문자열 자체에서도 동형이의 문자가 가시 표기로 드러난다", async () => {
    // §4는 "비가시 문자·동형이의 문자를 탐지해 가시 표기로 이스케이프하고
    // warnings에 싣는다"고 두 부류를 같은 처리 대상으로 묶었다. 경고만 붙고
    // `display`가 원문 그대로면, CLI를 그대로 믿는 사용자에게 보이는 문자열은
    // 여전히 "curl https://x.test"와 구분되지 않는다 — 승인 UI가 거짓말한다.
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", { command: `${ch(0x441)}url https://x.test` });
    expect(prompt.last?.display).toContain("U+0441");
  });

  it("전각 문자는 정규화 후 무엇으로 읽히는지 함께 보여준다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", { command: `${ch(0xff4e)}${ch(0xff50)}${ch(0xff4d)} test` });
    expect(prompt.last?.warnings.join(" ")).toContain("npm test");
  });

  it("정직한 입력에는 경고가 붙지 않는다 — 늘 경고하면 경고가 무의미해진다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", { command: "git status" });
    expect(prompt.last?.warnings).toEqual([]);
    expect(prompt.last?.allowAlwaysKey).toBe("shell:git status");
  });
});

describe("표시는 CLI가 그대로 그리면 되는 형태다", () => {
  it("원문 그대로가 아니라 도구 이름과 게이트의 판정 분류가 함께 담긴다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", { command: "git status", cwd: "src" });
    const display = prompt.last?.display ?? "";
    expect(display).not.toBe("git status");
    expect(display).toContain("shell");
    expect(display).toContain("git status");
    expect(display).toContain(`${WORKSPACE_ROOT}/src`);
  });

  it("파일 도구는 해석된 경로와 워크스페이스 안팎을 보여준다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "write_file", { path: "/etc/hosts" });
    const display = prompt.last?.display ?? "";
    expect(display).toContain("/etc/hosts");
    expect(display).toContain("워크스페이스 밖");
  });

  it("미등록 도구는 판정 불가라는 사실을 표시에 담는다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "web_fetch", { url: "https://x.test" });
    expect(prompt.last?.display).toContain("web_fetch");
    expect(prompt.last?.display.length).toBeGreaterThan("web_fetch".length);
  });
});

describe("침묵 거부 금지 — 모든 차단에 사유가 있다", () => {
  it("차단 계층 전부에서 사유가 비어 있지 않다", async () => {
    const classifier = makeClassifier({ denied: [DENIED] });
    const controller = new AbortController();
    const cases: ReadonlyArray<{
      readonly label: string;
      readonly expectedLayer: string;
      readonly verdict: () => Promise<import("../src/types.ts").GateVerdict>;
    }> = [
      {
        label: "0 denied",
        expectedLayer: "denied-path",
        verdict: () => run({ classifier }, "read_file", { path: ".env" }),
      },
      {
        label: "1 하드라인",
        expectedLayer: "hardline",
        verdict: () => run({ mode: "off" }, "shell", { command: "rm -rf /" }),
      },
      {
        label: "3 deny 규칙",
        expectedLayer: "deny-rule",
        verdict: () => run({ denyRules: ["**ls**"] }, "shell", { command: "ls" }),
      },
      {
        label: "7 사용자 거부",
        expectedLayer: "prompt",
        verdict: () =>
          run({ prompt: makePrompt({ response: "deny" }) }, "shell", { command: "ls" }),
      },
      {
        label: "7 프롬프트 실패",
        expectedLayer: "prompt",
        verdict: () =>
          run({ prompt: makePrompt({ throws: new Error("TTY 없음") }) }, "shell", {
            command: "ls",
          }),
      },
      {
        label: "7 중단",
        expectedLayer: "prompt",
        verdict: () =>
          run(
            { prompt: makePrompt({ hang: true, onAsk: () => controller.abort() }) },
            "shell",
            { command: "ls" },
            controller.signal,
          ),
      },
    ];

    for (const item of cases) {
      const block = asBlock(await item.verdict());
      expect(block.layer, item.label).toBe(item.expectedLayer);
      expect(block.reason.trim(), item.label).not.toBe("");
    }
  });

  it("사유는 모델이 읽고 다음 행동을 정할 수 있는 문장이다 — 계층 이름만 던지지 않는다", async () => {
    const block = asBlock(await run({ mode: "off" }, "shell", { command: "rm -rf /" }));
    expect(block.reason.length).toBeGreaterThan(20);
    expect(block.reason).not.toBe(block.layer);
  });
});

describe("텍스트의 수신자가 언어를 정한다 — APPROVAL-GATE §4(2026-08-06 명문화)", () => {
  const HANGUL = /[ㄱ-ㆎ가-힣]/;

  it("reason은 영어다 — 모델이 도구 에러로 읽으므로", async () => {
    const classifier = makeClassifier({ denied: [DENIED] });
    const cases: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
      ["0 denied", () => run({ classifier }, "read_file", { path: ".env" })],
      ["1 하드라인(셸)", () => run({ mode: "off" }, "shell", { command: "rm -rf /" })],
      ["1 하드라인(경로)", () => run({ mode: "off" }, "write_file", { path: "/dev/sda" })],
      ["3 deny 규칙", () => run({ denyRules: ["**ls**"] }, "shell", { command: "ls" })],
      [
        "7 사용자 거부",
        () => run({ prompt: makePrompt({ response: "deny" }) }, "shell", { command: "ls" }),
      ],
      [
        "7 프롬프트 실패",
        () =>
          run({ prompt: makePrompt({ throws: new Error("no tty") }) }, "shell", { command: "ls" }),
      ],
    ];
    for (const [label, produce] of cases) {
      const block = asBlock((await produce()) as import("../src/types.ts").GateVerdict);
      expect(HANGUL.test(block.reason), `${label}: ${block.reason}`).toBe(false);
    }
  });

  it("display와 warnings는 사용자 언어다 — CLI가 사용자에게 그대로 보여주므로", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", { command: `sudo rm -rf ${ZERO_WIDTH_SPACE}./build` });
    expect(HANGUL.test(prompt.last?.display ?? "")).toBe(true);
    expect(HANGUL.test(prompt.last?.warnings.join(" ") ?? "")).toBe(true);
  });
});

describe("훅 반환은 코어의 닫힌 유니온 그대로다", () => {
  it("allow에는 decision 하나뿐이다 — layer가 새지 않는다", async () => {
    const gate = createApprovalGate(
      buildConfig({ prompt: makePrompt({ response: "allow-once" }) }),
    );
    const decision = await call(gate, "read_file", { path: "src/a.ts" });
    expect(Object.keys(decision).sort()).toEqual(["decision"]);
  });

  it("block에는 decision과 reason뿐이다", async () => {
    const gate = createApprovalGate(buildConfig({ prompt: makePrompt({ response: "deny" }) }));
    const decision = await call(gate, "shell", { command: "ls" });
    expect(Object.keys(decision).sort()).toEqual(["decision", "reason"]);
    expect(decision).toMatchObject({ decision: "block" });
  });

  it("모든 차단 계층에서 layer가 코어로 새지 않는다", async () => {
    const gate = createApprovalGate(
      buildConfig({
        denyRules: ["**npm publish**"],
        classifier: makeClassifier({ denied: [DENIED] }),
        prompt: makePrompt({ response: "deny" }),
      }),
    );
    const calls: ReadonlyArray<readonly [string, unknown]> = [
      ["read_file", { path: ".env" }],
      ["shell", { command: "rm -rf /" }],
      ["shell", { command: "npm publish" }],
      ["shell", { command: "ls" }],
    ];
    for (const [tool, args] of calls) {
      const decision = await call(gate, tool, args);
      expect(Object.keys(decision).sort(), tool).toEqual(["decision", "reason"]);
    }
  });
});

describe("중단 — 프롬프트 대기 중 abort", () => {
  it("프롬프트를 취소하고 차단한다", async () => {
    const controller = new AbortController();
    const prompt = makePrompt({ hang: true, onAsk: () => controller.abort() });
    const verdict = await run({ prompt }, "shell", { command: "ls" }, controller.signal);
    expect(asBlock(verdict).layer).toBe("prompt");
    expect(asBlock(verdict).reason).toMatch(/abort|cancel/i);
  });

  it("이미 중단된 상태면 프롬프트를 띄우지도 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const prompt = makePrompt({ hang: true });
    const verdict = await run({ prompt }, "shell", { command: "ls" }, controller.signal);
    expect(verdict).toMatchObject({ decision: "block" });
    expect(prompt.calls).toEqual([]);
  });

  it("중단으로 끝난 호출은 allowlist를 키우지 않는다", async () => {
    const controller = new AbortController();
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ hang: true, onAsk: () => controller.abort() });
    await run({ prompt, allowlist }, "shell", { command: "ls -la" }, controller.signal);
    expect(allowlist.added).toEqual([]);
  });

  it("훅 경유로도 중단이 block으로 번역된다", async () => {
    const controller = new AbortController();
    const gate = createApprovalGate(
      buildConfig({ prompt: makePrompt({ hang: true, onAsk: () => controller.abort() }) }),
    );
    const decision = await call(gate, "shell", { command: "ls" }, controller.signal);
    expect(decision).toMatchObject({ decision: "block" });
  });

  it("중단 시그널은 프롬프트 구현에도 그대로 전달된다 — UI가 스스로 정리할 수 있게", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const verdict = await run(
      {
        prompt: {
          async ask(_request, signal) {
            seen = signal;
            controller.abort();
            return await new Promise<never>(() => {});
          },
        },
      },
      "shell",
      { command: "ls" },
      controller.signal,
    );
    expect(seen).toBe(controller.signal);
    expect(verdict).toMatchObject({ decision: "block" });
  });
});
