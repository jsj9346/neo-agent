/**
 * 계층 4b 오염 플래그 계약 — `docs/APPROVAL-GATE.md` §2 + `docs/WEB-ACCESS.md` §5.
 *
 * 정본 문면:
 *   - APPROVAL-GATE §2 계층 4b — "런 중 `ToolResult.source === "network"`인 결과가
 *     하나라도 나오면, **그 런의 남은 모든 도구 호출**이 위험 플래그와 **똑같은
 *     취급**을 받는다: 자동 허용(5)과 allowlist(6)가 무효화되고 경고가 프롬프트에
 *     실린다. **차단은 아니다.**"
 *   - WEB-ACCESS §5 — "**대상은 web_fetch가 아니라 모든 도구다.** 방어하려는
 *     시나리오는 '가져온 페이지가 다음 행동을 지시한다'이고 그 다음 행동은 대개
 *     셸·파일 쓰기다. web_fetch만 다시 묻는 것은 표적을 빗나간다."
 *   - WEB-ACCESS §5 — "오염 수명은 런 단위다 — `agent_start`에서 초기화되고 …
 *     초기화는 호스트가 `agent_start`에서 호출한다."
 *
 * **이 파일의 1급 임무는 순서 계약이다.** 4b는 5·6을 무효화하되 0~3을 우회하지
 * 않는다. "다시 물었다"만으로는 그것이 확인되지 않으므로, 0~3에 걸리는 입력은
 * `assertTaintKeepsExit`(같은 입력의 무오염 `evaluate` 판정과 계층·사유 대조)로
 * 검증한다 — 오염 상태의 `layer`는 훅 경로에서 관측되지 않기 때문이다.
 *
 * 구현 전 작성(T-004). 여기서 기대하는 표면은 T-001이 확정한 계약이다.
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
import { makePermissiveAllowlist, makeSeededAllowlist } from "./contract-helpers.ts";
import { makeAllowlist, makeClassifier, makePrompt, WORKSPACE_ROOT } from "./helpers.ts";
import { assertTaintKeepsExit, call, keyFor, makeTaintGate, runWeb } from "./web-taint-helpers.ts";

const DENIED = `${WORKSPACE_ROOT}/.env`;

/**
 * **`GateLayer`에 오염 식별자는 없다** (판정 C-6, APPROVAL-GATE §2 계층 4b).
 * 4b는 플래그이지 출구가 아니어서 오염된 호출은 5·6을 건너뛰고 7에서 나간다 —
 * verdict에 나타날 수 없는 값을 유니온에 넣으면 검증할 수 없는 값이 생긴다.
 * 그래서 이 파일은 "어느 계층에서 나갔는가"를 **양성으로만** 단언한다.
 */

describe("계층 4b — 자동 허용(계층 5) 무효화", () => {
  it("오염되면 워크스페이스 안 파일 읽기가 프롬프트로 간다", async () => {
    // 무오염이면 계층 5에서 조용히 통과하는 입력이다(pipeline-order 계약).
    // 오염된 런에서 이게 그대로 통과하면 §5의 방어 시나리오가 성립하지 않는다 —
    // 가져온 페이지가 지시한 "그 파일을 읽어라"가 승인 없이 실행된다.
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });

    gate.noteToolResult({ source: "network" });
    const decision = await call(gate, "read_file", { path: "src/a.ts" });

    expect(decision).toEqual({ decision: "allow" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("오염 전 호출은 자동 허용되고, 오염 후 호출부터 프롬프트로 간다", async () => {
    // "그 런의 **남은** 도구 호출"이 계약이다 — 소급 적용도, 조기 적용도 아니다
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });

    await call(gate, "read_file", { path: "src/a.ts" });
    expect(prompt.calls).toHaveLength(0);

    gate.noteToolResult({ source: "network" });
    await call(gate, "read_file", { path: "src/b.ts" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("오염은 한 번으로 런의 남은 호출 전부에 걸린다 — 다음 호출 하나가 아니다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });

    gate.noteToolResult({ source: "network" });
    for (const path of ["src/a.ts", "src/b.ts", "src/c.ts"]) {
      await call(gate, "read_file", { path });
    }
    expect(prompt.calls).toHaveLength(3);
  });
});

describe("계층 4b — allowlist(계층 6) 무효화", () => {
  it("학습된 셸 명령이 다시 프롬프트로 간다", async () => {
    const allowlist = makeSeededAllowlist([`shell:${WORKSPACE_ROOT}:npm test`]);
    const prompt = makePrompt({ response: "allow-once" });

    // 무오염 기준선: 학습된 키로 계층 6에서 통과한다
    const clean = await runWeb({ allowlist, prompt }, "shell", { command: "npm test" });
    expect(clean).toEqual({ decision: "allow", layer: "allowlist" });
    expect(prompt.calls).toHaveLength(0);

    const gate = makeTaintGate({ allowlist, prompt });
    gate.noteToolResult({ source: "network" });
    const decision = await call(gate, "shell", { command: "npm test" });

    expect(decision).toEqual({ decision: "allow" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("대상은 모든 도구다 — 셸·파일 쓰기도 오염 영향을 받는다 (WEB-ACCESS §5)", async () => {
    // web_fetch만 다시 묻는 구현은 표적을 빗나간다. 인젝션의 다음 행동은 대개
    // 셸·쓰기이므로, 그 둘이 학습된 키로 통과하면 오염 정책은 아무것도 막지 못한다.
    const table: ReadonlyArray<readonly [string, unknown]> = [
      ["read_file", { path: "src/a.ts" }],
      ["shell", { command: "npm test" }],
      ["write_file", { path: "a.txt" }],
      ["edit_file", { path: "a.txt" }],
    ];
    const keys = [
      `shell:${WORKSPACE_ROOT}:npm test`,
      `fileWrite:${WORKSPACE_ROOT}/a.txt`,
      `fileEdit:${WORKSPACE_ROOT}/a.txt`,
      `fileRead:${WORKSPACE_ROOT}/src/a.ts`,
    ];

    for (const [tool, args] of table) {
      const prompt = makePrompt({ response: "allow-once" });
      const gate = makeTaintGate({ allowlist: makeSeededAllowlist(keys), prompt });
      gate.noteToolResult({ source: "network" });
      await call(gate, tool, args);
      expect(prompt.calls, `${tool}이 오염된 런에서 조용히 통과했다`).toHaveLength(1);
    }
  });

  it("오염 상태에서는 '항상 허용' 선택지 자체가 없다 — 위험 패턴과 동일 효과", async () => {
    // 오염된 런에서 학습이 자라면 무효화의 의미가 없다: 인젝션이 유도한 승인이
    // 영구 키가 되어 다음 런부터 조용히 통과한다.
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ response: "allow-always" });
    const gate = makeTaintGate({ allowlist, prompt });

    gate.noteToolResult({ source: "network" });
    await call(gate, "shell", { command: "npm test" });

    expect(prompt.last?.allowAlwaysKey).toBeUndefined();
    expect(allowlist.added).toEqual([]);
  });
});

describe("계층 4b — 차단이 아니다", () => {
  it("오염돼도 프롬프트에서 allow하면 통과한다", async () => {
    const gate = makeTaintGate({ prompt: makePrompt({ response: "allow-once" }) });
    gate.noteToolResult({ source: "network" });
    expect(await call(gate, "shell", { command: "npm test" })).toEqual({ decision: "allow" });
  });

  it("차단 여부의 결정권자는 여전히 사용자다 — deny면 block, 사유가 실린다", async () => {
    const gate = makeTaintGate({ prompt: makePrompt({ response: "deny" }) });
    gate.noteToolResult({ source: "network" });
    const decision = await call(gate, "read_file", { path: "src/a.ts" });
    expect(decision.decision).toBe("block");
    if (decision.decision !== "block") throw new Error("unreachable");
    expect(decision.reason.trim().length).toBeGreaterThan(0);
  });
});

describe("계층 4b — 경고", () => {
  it("오염 경고가 warnings에 실린다 — 무오염 같은 입력보다 경고가 늘어난다", async () => {
    // 사용자가 "왜 학습한 명령을 또 묻지?"를 알 수 있어야 한다. 이유 없는 마찰은
    // 승인 피로를 만들고, 승인 피로는 게이트를 무의미하게 만든다.
    // 문구는 구현 재량이다(판정 C-5) — 개수 증가로만 확인한다
    const cleanPrompt = makePrompt({ response: "allow-once" });
    await runWeb({ prompt: cleanPrompt }, "write_file", { path: "src/a.ts" });
    const cleanWarnings = cleanPrompt.last?.warnings ?? [];

    const taintedPrompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt: taintedPrompt });
    gate.noteToolResult({ source: "network" });
    await call(gate, "write_file", { path: "src/a.ts" });

    const taintedWarnings = taintedPrompt.last?.warnings ?? [];
    expect(taintedWarnings.length).toBeGreaterThan(cleanWarnings.length);
    for (const warning of taintedWarnings) expect(warning.trim().length).toBeGreaterThan(0);
  });

  it("오염 경고는 위험 패턴 경고와 구분된다 — 둘 다 걸린 호출에서 경고가 따로 남는다", async () => {
    // 판정 C-5(APPROVAL-GATE §2 계층 4b): 문구는 구현 재량이되 위험 패턴 경고와
    // **구분 가능해야** 한다. 사용자가 "왜 학습해 둔 명령을 또 묻지?"를 알 수 없으면
    // 마찰이 이유 없는 마찰이 되고, 그것이 승인 피로를 거쳐 무조건 allow로 가는 길이다.
    // 문면은 검사하지 않는다 — 두 사정이 각각의 항목으로 남는지만 본다.
    const riskOnly = makePrompt({ response: "allow-once" });
    await runWeb({ prompt: riskOnly }, "shell", { command: "sudo apt-get update" });
    const riskWarnings = riskOnly.last?.warnings ?? [];
    expect(riskWarnings.length).toBeGreaterThan(0);

    const bothPrompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt: bothPrompt });
    gate.noteToolResult({ source: "network" });
    await call(gate, "shell", { command: "sudo apt-get update" });
    const both = bothPrompt.last?.warnings ?? [];

    // 위험 경고가 그대로 남아야 한다 — 오염 경고가 덮어쓰거나 한 문면으로 합쳐지면
    // 사용자는 두 사정을 구분할 수 없다
    for (const warning of riskWarnings) expect(both).toContain(warning);
    const added = both.filter((warning) => riskWarnings.includes(warning) === false);
    expect(added.length).toBeGreaterThan(0);
  });
});

describe("계층 4b는 0~3계층을 우회하지 않는다 — 순서가 계약이다", () => {
  // 검증 방법은 이중 실행이다. 오염 상태의 판정은 훅 경로라 `layer`가 없으므로,
  // 같은 입력의 무오염 `evaluate` 판정(계층이 보인다)과 결과를 대조한다.
  // 판정이 같고 프롬프트에도 닿지 않았다면 같은 계층에서 나간 것이다.

  it("계층 0(denied)은 오염돼도 그대로 block이다", async () => {
    await assertTaintKeepsExit(
      () => ({ classifier: makeClassifier({ denied: [DENIED] }) }),
      "read_file",
      { path: ".env" },
      "denied-path",
    );
  });

  it("계층 1(하드라인)은 오염돼도 그대로 block이다", async () => {
    await assertTaintKeepsExit(() => ({}), "shell", { command: "rm -rf /" }, "hardline");
  });

  it("계층 1은 파일 쓰기 경로에도 그대로 적용된다", async () => {
    await assertTaintKeepsExit(() => ({}), "write_file", { path: "/dev/sda" }, "hardline");
  });

  it("계층 2(deny 규칙)는 오염돼도 그대로 block이다", async () => {
    await assertTaintKeepsExit(
      () => ({ denyRules: ["**npm publish**"] }),
      "shell",
      { command: "npm publish" },
      "deny-rule",
    );
  });

  it("mode가 off면 오염은 의미가 없다 — 계층 3에서 이미 나갔다", async () => {
    // 4b는 5·6을 무효화하는 플래그다. `off`는 그 앞(계층 3)에서 allow로 나가므로
    // 무효화할 대상 자체가 없다. 여기서 프롬프트가 뜨면 4b가 모드 확인보다
    // 앞으로 올라온 것이고, 그것은 `off` 옵트인을 무력화하는 순서 위반이다.
    await assertTaintKeepsExit(
      () => ({ mode: "off" }),
      "write_file",
      { path: "src/a.ts" },
      "mode-off",
    );
    await assertTaintKeepsExit(
      () => ({ mode: "off" }),
      "read_file",
      { path: "src/a.ts" },
      "mode-off",
    );
    await assertTaintKeepsExit(
      () => ({ mode: "off" }),
      "shell",
      { command: "npm test" },
      "mode-off",
    );
  });

  it("off + 학습된 키여도 판정 계층은 mode-off다 — 4b는 출구가 아니다", async () => {
    // 계층 값이 `mode-off`라는 양성 단언 하나로 충분하다: 4b가 출구였다면 값이
    // 달라지고, 6이 출구였다면 `allowlist`였을 것이다
    const verdict = await runWeb(
      { mode: "off", allowlist: makeSeededAllowlist([`shell:${WORKSPACE_ROOT}:npm test`]) },
      "shell",
      { command: "npm test" },
    );
    expect(verdict).toEqual({ decision: "allow", layer: "mode-off" });
  });
});

describe("오염 수명 — 런 단위 (WEB-ACCESS §5)", () => {
  it("resetTaint() 후 자동 허용이 복구된다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });

    gate.noteToolResult({ source: "network" });
    await call(gate, "read_file", { path: "src/a.ts" });
    expect(prompt.calls).toHaveLength(1);

    gate.resetTaint();
    await call(gate, "read_file", { path: "src/a.ts" });
    // 무한 오염(한 번 오염되면 세션 끝까지)은 채택하지 않았다 — allowlist를 영구
    // 무효화해 기능을 죽인다. 여기서 프롬프트가 또 뜨면 그 배제 판정이 깨진 것이다
    expect(prompt.calls).toHaveLength(1);
  });

  it("resetTaint() 후 allowlist 숏컷도 복구된다", async () => {
    const allowlist = makeSeededAllowlist([`shell:${WORKSPACE_ROOT}:npm test`]);
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ allowlist, prompt });

    gate.noteToolResult({ source: "network" });
    await call(gate, "shell", { command: "npm test" });
    expect(prompt.calls).toHaveLength(1);

    gate.resetTaint();
    await call(gate, "shell", { command: "npm test" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("resetTaint()는 여러 번 불러도 안전하다 — 호스트가 매 런 시작에 부른다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });
    gate.resetTaint();
    gate.resetTaint();
    await call(gate, "read_file", { path: "src/a.ts" });
    expect(prompt.calls).toHaveLength(0);
  });

  it("갓 만든 게이트는 오염되지 않은 상태다 — reset 호출 없이도 매트릭스가 동작한다", async () => {
    // 게이트는 런 경계를 모르고 `resetTaint()`는 호스트가 부른다(§4·§5). 호스트가
    // 첫 런에서 부르기 전에도 기본 정책 매트릭스(SAFE-DEFAULTS §1)는 동작해야
    // 한다 — 초기 상태가 오염이면 첫 런의 자동 허용이 영영 성립하지 않는다.
    // 게이트 단위 테스트에는 `agent_start` 배선이 없으므로 여기서 고정한다.
    // 배선 자체(호스트가 매 런 시작에 부르는가)의 검증은 T-011·T-014 소관이다(판정 C-2).
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });
    await call(gate, "read_file", { path: "src/a.ts" });
    expect(prompt.calls).toHaveLength(0);
  });

  it("게이트는 스스로 오염을 풀지 않는다 — 호출 간 자동 초기화가 없다", async () => {
    // 도구 호출 경계에서 조용히 풀리면 "런 단위"가 "호출 단위"가 되어 정책이 사라진다
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });
    gate.noteToolResult({ source: "network" });
    await call(gate, "read_file", { path: "src/a.ts" });
    await call(gate, "read_file", { path: "src/a.ts" });
    expect(prompt.calls).toHaveLength(2);
  });
});

describe("오염원 — source 필드만이 근거다", () => {
  it('source: "local"은 오염시키지 않는다', async () => {
    // 로컬 도구 결과까지 오염원으로 보면 모든 런이 즉시 오염되고, 오염 정책은
    // "allowlist 기능 삭제"와 같아진다
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });

    gate.noteToolResult({ source: "local" });
    await call(gate, "read_file", { path: "src/a.ts" });
    expect(prompt.calls).toHaveLength(0);
  });

  it("local이 여러 번 와도, 그 뒤 network 하나면 오염된다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ prompt });

    gate.noteToolResult({ source: "local" });
    gate.noteToolResult({ source: "local" });
    gate.noteToolResult({ source: "network" });
    gate.noteToolResult({ source: "local" });
    // network 뒤에 local이 와도 오염이 씻기지 않는다 — 씻긴다면 인젝션 직후
    // 아무 로컬 도구 하나로 세탁이 가능해진다
    await call(gate, "read_file", { path: "src/a.ts" });
    expect(prompt.calls).toHaveLength(1);
  });
});

describe("web_fetch 자신도 예외가 아니다 (WEB-ACCESS §5 — 2026-08-09 명문화 · 판정 C-1)", () => {
  // "모든 도구"에 오염원 자신을 빼는 예외는 없다. 예외를 두면 §6이 인정한
  // 쿼리스트링 유출 구멍을 4b가 좁힌다는 논리가 **정작 유출이 일어나는 도구에서만**
  // 성립하지 않게 된다 — 학습된 호스트로 `?d=<컨텍스트>`가 조용히 나갈 수 있다.

  it("오염된 런에서는 학습된 호스트로 가는 두 번째 fetch도 프롬프트로 간다", async () => {
    const key = await keyFor("https://example.com/");
    if (key === undefined) throw new Error("학습 키가 없다");
    const allowlist = makeSeededAllowlist([key]);

    // 무오염 기준선: 학습된 호스트는 계층 6에서 통과한다 (WEB-ACCESS §6 표)
    const cleanPrompt = makePrompt({ response: "allow-once" });
    const clean = await runWeb({ allowlist, prompt: cleanPrompt }, "web_fetch", {
      url: "https://example.com/a",
    });
    expect(clean).toEqual({ decision: "allow", layer: "allowlist" });
    expect(cleanPrompt.calls).toEqual([]);

    // 오염된 런: 첫 fetch의 결과가 오염원이고, 다음 fetch는 다시 승인 대상이다
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeTaintGate({ allowlist, prompt });
    gate.noteToolResult({ source: "network" });
    const decision = await call(gate, "web_fetch", { url: "https://example.com/b?d=leak" });

    expect(decision).toEqual({ decision: "allow" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("오염된 런의 web_fetch에는 '항상 허용' 선택지도 없다", async () => {
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ response: "allow-always" });
    const gate = makeTaintGate({ allowlist, prompt });

    gate.noteToolResult({ source: "network" });
    await call(gate, "web_fetch", { url: "https://example.com/" });

    expect(prompt.last?.allowAlwaysKey).toBeUndefined();
    expect(allowlist.added).toEqual([]);
  });

  it("오염 없는 런의 최초 호스트는 여전히 학습 가능하다 — 4b가 기능을 죽이지 않는다", async () => {
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ response: "allow-always" });
    const gate = makeTaintGate({ allowlist, prompt });

    await call(gate, "web_fetch", { url: "https://example.com/" });
    expect(allowlist.added).toEqual([`webFetch:https://example.com`]);
  });
});
