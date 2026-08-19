/**
 * fail-closed 계약 — `docs/APPROVAL-GATE.md` §3.
 *
 * "프로필에 없는 도구는 `unknown`이다 — fail-closed. 매트릭스 자동 허용·allowlist
 * 없이 항상 프롬프트로 간다. 새 도구를 추가하면서 프로필 등록을 잊어도 조용한
 * 자동 허용이 되지 않는다."
 *
 * 검증 방법은 **적대적 협력자 주입**이다. 무엇이든 학습됐다고 답하는 allowlist와
 * 계약 밖 값을 돌려주는 classifier를 끼운 상태에서도 판정이 새지 않아야 한다 —
 * 협력자가 정직할 때만 성립하는 fail-closed는 fail-closed가 아니다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import { makePermissiveAllowlist, makeRogueClassifier, run } from "./contract-helpers.ts";
import { makeClassifier, makePrompt, WORKSPACE_ROOT } from "./helpers.ts";

describe("프로필에 없는 도구", () => {
  it("항상 프롬프트로 간다 — 어떤 인자를 줘도", async () => {
    const table: ReadonlyArray<readonly [string, unknown]> = [
      ["web_fetch", { url: "https://x.test" }],
      ["grep_files", { path: "src/a.ts" }],
      ["read_file_v2", { path: "src/a.ts" }],
      ["noop", {}],
      ["noop", null],
      ["noop", undefined],
      ["noop", []],
      ["noop", "문자열 인자"],
      ["noop", 0],
    ];
    for (const [tool, args] of table) {
      const prompt = makePrompt({ response: "allow-once" });
      const verdict = await run({ prompt }, tool, args);
      expect(verdict, `${tool}(${JSON.stringify(args)})`).toEqual({
        decision: "allow",
        layer: "prompt",
      });
      expect(prompt.calls).toHaveLength(1);
    }
  });

  it("무엇이든 학습됐다고 답하는 allowlist를 끼워도 allowlist로 통과하지 않는다", async () => {
    const allowlist = makePermissiveAllowlist();
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ allowlist, prompt }, "web_fetch", { url: "https://x.test" });
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    // 조회 자체가 없어야 한다 — unknown에는 키가 존재하지 않는다
    expect(allowlist.queried).toEqual([]);
  });

  it("도구 이름이 등록된 도구의 접두·접미여도 매칭되지 않는다", async () => {
    for (const tool of ["read_file2", "xread_file", "shell_exec", "SHELL"]) {
      const prompt = makePrompt({ response: "allow-once" });
      await run({ prompt }, tool, { path: "src/a.ts", command: "ls" });
      expect(prompt.last?.subject, tool).toMatchObject({ kind: "unknown" });
    }
  });

  it("판정 불가 사유가 경고로 전달된다 — 프로필 오등록을 사용자가 알아채게", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "web_fetch", { url: "https://x.test" });
    expect(prompt.last?.warnings.join(" ")).not.toBe("");
  });
});

describe("프로필은 있는데 인자가 예상과 다른 경우", () => {
  it("경로 파라미터가 없으면 unknown으로 떨어진다 — 자동 허용으로 새지 않는다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ prompt }, "read_file", {});
    expect(prompt.last?.subject).toMatchObject({ kind: "unknown" });
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
  });

  it("경로 파라미터의 타입이 다르면 unknown으로 떨어진다", async () => {
    const table: readonly unknown[] = [
      { path: 42 },
      { path: null },
      { path: ["src/a.ts"] },
      { path: { toString: "src/a.ts" } },
      { path: true },
      { Path: "src/a.ts" },
    ];
    for (const args of table) {
      const prompt = makePrompt({ response: "allow-once" });
      await run({ prompt }, "read_file", args);
      expect(prompt.last?.subject, JSON.stringify(args)).toMatchObject({ kind: "unknown" });
    }
  });

  it("셸 명령 파라미터가 문자열이 아니면 unknown으로 떨어진다", async () => {
    for (const args of [{}, { command: 1 }, { command: ["ls"] }, { cmd: "ls" }]) {
      const prompt = makePrompt({ response: "allow-once" });
      await run({ prompt }, "shell", args);
      expect(prompt.last?.subject, JSON.stringify(args)).toMatchObject({ kind: "unknown" });
    }
  });

  it("unknown으로 떨어지면 '항상 허용' 키도 없다 — 판정 불가가 학습으로 굳지 않게", async () => {
    const prompt = makePrompt({ response: "allow-always" });
    const allowlist = makePermissiveAllowlist();
    await run({ prompt, allowlist }, "read_file", { path: 42 });
    expect(prompt.last?.allowAlwaysKey).toBeUndefined();
    expect(allowlist.added).toEqual([]);
  });

  it("classifier가 throw하면 unknown으로 떨어진다 — 예외가 통과로 번역되지 않는다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run(
      { classifier: makeClassifier({ throwOn: "broken" }), prompt },
      "read_file",
      { path: "broken" },
    );
    expect(prompt.last?.subject).toMatchObject({ kind: "unknown" });
    expect(verdict).toMatchObject({ layer: "prompt" });
  });

  it("셸의 cwd 판정이 throw해도 unknown으로 떨어진다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ classifier: makeClassifier({ throwOn: "." }), prompt }, "shell", {
      command: "ls",
    });
    expect(prompt.last?.subject).toMatchObject({ kind: "unknown" });
  });

  it("셸의 cwd가 문자열이 아니면 워크스페이스 루트로 읽는다", async () => {
    // [미규정] — 계약(§3)은 cwd 미지정·판독 실패 시의 처리를 정하지 않았다.
    // 구현은 classifier에게 "."를 물어 도구와 같은 답을 쓴다. 여기서 확인하는 것은
    // "판정 자체가 통과로 새지는 않는다"이며, 루트 대입이 옳은지는 판정 필요다.
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ prompt }, "shell", { command: "ls", cwd: 42 });
    expect(verdict).not.toMatchObject({ decision: "allow", layer: "policy-matrix" });
    expect(prompt.calls).toHaveLength(1);
  });
});

describe("classifier가 계약 밖 값을 돌려줄 때", () => {
  it("모르는 scope는 '안'으로 읽히지 않는다 — 모르는 값을 안으로 읽으면 그게 자동 허용이다", async () => {
    for (const scope of ["INSIDE", "workspace", "", "unknown"]) {
      const prompt = makePrompt({ response: "allow-once" });
      const verdict = await run({ classifier: makeRogueClassifier(scope), prompt }, "read_file", {
        path: "src/a.ts",
      });
      expect(verdict, `scope="${scope}"`).not.toMatchObject({ layer: "policy-matrix" });
    }
  });

  it("scope가 'denied'면 모드와 무관하게 차단된다", async () => {
    const verdict = await run(
      { mode: "off", classifier: makeRogueClassifier("denied") },
      "read_file",
      { path: "src/a.ts" },
    );
    expect(verdict).toMatchObject({ decision: "block", layer: "denied-path" });
  });
});

describe("승인 프롬프트 자체가 고장났을 때", () => {
  it("프롬프트가 throw하면 차단이다 — 물어보지 못했으면 허용이 아니다", async () => {
    const verdict = await run({ prompt: makePrompt({ throws: new Error("TTY 없음") }) }, "shell", {
      command: "ls",
    });
    expect(verdict).toMatchObject({ decision: "block", layer: "prompt" });
  });

  it("프롬프트가 실패해도 allowlist는 자라지 않는다", async () => {
    const allowlist = makePermissiveAllowlist();
    await run({ prompt: makePrompt({ throws: new Error("TTY 없음") }), allowlist }, "shell", {
      command: "ls",
    });
    expect(allowlist.added).toEqual([]);
  });
});

describe("판정 대상별 기본 정책 매트릭스 — SAFE-DEFAULTS §1", () => {
  it("문서의 다섯 행이 그대로 성립한다", async () => {
    const classifier = makeClassifier({ denied: [`${WORKSPACE_ROOT}/.env`] });
    const cases: ReadonlyArray<{
      readonly label: string;
      readonly tool: string;
      readonly args: unknown;
      readonly expected: string;
    }> = [
      { label: "안 읽기", tool: "read_file", args: { path: "a.ts" }, expected: "policy-matrix" },
      { label: "밖 읽기", tool: "read_file", args: { path: "/etc/hosts" }, expected: "prompt" },
      { label: "쓰기", tool: "write_file", args: { path: "a.ts" }, expected: "prompt" },
      { label: "편집", tool: "edit_file", args: { path: "a.ts" }, expected: "prompt" },
      { label: "셸", tool: "shell", args: { command: "ls" }, expected: "prompt" },
      { label: "크리덴셜", tool: "read_file", args: { path: ".env" }, expected: "denied-path" },
    ];
    for (const item of cases) {
      const verdict = await run({ classifier }, item.tool, item.args);
      expect(verdict.layer, item.label).toBe(item.expected);
    }
  });
});
