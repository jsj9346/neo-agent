/**
 * `ApprovalGateHandle.isTainted()` 계약 — **구현보다 먼저 작성한다**(T-003, 계약 7).
 *
 * 기대값의 출처는 `docs/APPROVAL-GATE.md` §4(공개 인터페이스 — `isTainted()` 신설)와
 * `docs/MEMORY.md` §5(게이트 측 필요 변경 2건)뿐이다. 구현에서 도출하지 않았다 —
 * `isTainted()`는 아직 없고 T-006에서 들어온다.
 *
 * 정본 문면:
 *   - APPROVAL-GATE §4 — "**`isTainted()`는 가산 노출이지 새 상태가 아니다.** 오염
 *     상태는 이미 게이트가 계층 4b를 위해 들고 있고, 지금까지 쓰기 메서드만
 *     노출돼 있었다. 읽기를 열 뿐이므로 파이프라인 출구도 계층도 늘지 않는다."
 *   - APPROVAL-GATE §4 — "**왜 게이트가 오염의 소유자로 남는가** — 오염을 소비하려는
 *     쪽(`remember`)이 자기 오염 상태를 따로 들면 게이트의 4b와 **두 개의 진실**이
 *     생기고, 둘이 어긋나는 순간 어느 쪽이 맞는지 판정할 근거가 없다."
 *   - hook.ts 계약(§4) — `noteToolResult`는 **단방향**이다. 뒤에 local 결과가 아무리
 *     와도 씻기지 않는다.
 *   - MEMORY.md §4.1 — 호출자는 값이 아니라 **함수**로 배선한다(`() => gate.isTainted()`).
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
import { makePrompt } from "./helpers.ts";
import { callGate, makePlainGate } from "./memory-write-helpers.ts";

/** 워크스페이스 안 파일 읽기 — 계층 5 자동 허용의 정본 사례(SAFE-DEFAULTS §1) */
const INSIDE_READ = { path: "src/a.ts" } as const;

describe("계약 7 — `isTainted()`", () => {
  it("표면에 존재하고 boolean을 돌려준다", () => {
    const gate = makePlainGate();
    expect(typeof gate.isTainted).toBe("function");
    expect(typeof gate.isTainted()).toBe("boolean");
  });

  it("갓 만든 게이트는 무오염이다", () => {
    // 초기 상태가 오염이면 호스트가 `resetTaint()`를 부르기 전인 첫 런에서
    // 기본 정책 매트릭스가 영영 성립하지 않는다
    expect(makePlainGate().isTainted()).toBe(false);
  });

  it('`noteToolResult({ source: "network" })` 후 true다', () => {
    const gate = makePlainGate();
    gate.noteToolResult({ source: "network" });
    expect(gate.isTainted()).toBe(true);
  });

  it("`resetTaint()` 후 false다", () => {
    const gate = makePlainGate();
    gate.noteToolResult({ source: "network" });
    gate.resetTaint();
    expect(gate.isTainted()).toBe(false);
  });

  it("`resetTaint()`는 멱등이다 — 무오염에서 여러 번 불러도 false", () => {
    const gate = makePlainGate();
    gate.resetTaint();
    gate.resetTaint();
    expect(gate.isTainted()).toBe(false);
  });

  it("local 결과만으로는 오염되지 않는다", () => {
    // 로컬 도구 결과까지 오염원으로 보면 모든 런이 즉시 오염되고, 오염 정책은
    // "allowlist 기능 삭제"와 같아진다
    const gate = makePlainGate();
    gate.noteToolResult({ source: "local" });
    gate.noteToolResult({ source: "local" });
    expect(gate.isTainted()).toBe(false);
  });

  it("**단방향** — local 결과로 씻기지 않는다", () => {
    // 씻긴다면 인젝션 직후 아무 로컬 도구 하나로 세탁이 가능해진다.
    // `remember`의 결과는 항상 `source: "local"`이므로(MEMORY.md §4.3), 이 단방향이
    // 깨지면 메모리 쓰기 자체가 세탁 수단이 된다
    const gate = makePlainGate();
    gate.noteToolResult({ source: "network" });
    gate.noteToolResult({ source: "local" });
    expect(gate.isTainted()).toBe(true);
  });

  it("network 결과가 여러 번 와도 상태는 하나다", () => {
    const gate = makePlainGate();
    gate.noteToolResult({ source: "network" });
    gate.noteToolResult({ source: "network" });
    expect(gate.isTainted()).toBe(true);
    gate.resetTaint();
    expect(gate.isTainted()).toBe(false);
  });

  it("게이트 인스턴스마다 독립이다 — 오염이 다른 게이트로 새지 않는다", () => {
    const a = makePlainGate();
    const b = makePlainGate();
    a.noteToolResult({ source: "network" });
    expect(a.isTainted()).toBe(true);
    expect(b.isTainted()).toBe(false);
  });
});

describe("계약 7 — 보고된 상태와 계층 4b의 실제 효과가 같은 진실이다", () => {
  /**
   * `isTainted()`가 계층 4b와 **다른 상태**를 보면 "두 개의 진실"이 생긴다 —
   * 게이트가 오염의 소유자로 남는 근거가 바로 그것을 막는 데 있다(§4). 그래서
   * 읽기 값만 검사하지 않고, 같은 인스턴스에서 4b의 관측 가능한 효과(자동 허용
   * 무효화 → 프롬프트 도달)와 짝지어 확인한다.
   */
  it("true를 보고하는 동안 워크스페이스 안 파일 읽기가 프롬프트로 간다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makePlainGate({ prompt });

    // 무오염 — 계층 5 자동 허용이라 프롬프트에 닿지 않는다
    expect(gate.isTainted()).toBe(false);
    await callGate(gate, "read_file", INSIDE_READ);
    expect(prompt.calls).toEqual([]);

    // 오염 — 보고값과 효과가 함께 바뀐다
    gate.noteToolResult({ source: "network" });
    expect(gate.isTainted()).toBe(true);
    await callGate(gate, "read_file", INSIDE_READ);
    expect(prompt.calls).toHaveLength(1);
  });

  it("false로 돌아가면 자동 허용도 함께 돌아온다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makePlainGate({ prompt });
    gate.noteToolResult({ source: "network" });
    await callGate(gate, "read_file", INSIDE_READ);
    expect(prompt.calls).toHaveLength(1);

    gate.resetTaint();
    expect(gate.isTainted()).toBe(false);
    await callGate(gate, "read_file", INSIDE_READ);
    expect(prompt.calls, "resetTaint 후에도 프롬프트로 갔다").toHaveLength(1);
  });

  it("판정을 돌린다고 오염 상태가 변하지 않는다 — 읽기 전용 노출이다", async () => {
    // 게이트가 도구 호출 경계에서 스스로 초기화하면 "런 단위"가 "호출 단위"로
    // 바뀌어 정책이 소멸한다(hook.ts §4)
    const gate = makePlainGate({ prompt: makePrompt({ response: "allow-once" }) });
    gate.noteToolResult({ source: "network" });
    await callGate(gate, "read_file", INSIDE_READ);
    await callGate(gate, "shell", { command: "ls" });
    expect(gate.isTainted()).toBe(true);
  });

  it("함수로 배선해도 늦은 바인딩이 성립한다 — `() => gate.isTainted()`", () => {
    // MEMORY.md §4.1: 호출자는 값이 아니라 함수로 배선한다. 도구가 게이트보다
    // 먼저 만들어지는 배선 순서에서 값 캡처는 성립하지 않는다
    const gate = makePlainGate();
    const isRunTainted: () => boolean = () => gate.isTainted();
    expect(isRunTainted()).toBe(false);
    gate.noteToolResult({ source: "network" });
    expect(isRunTainted()).toBe(true);
    gate.resetTaint();
    expect(isRunTainted()).toBe(false);
  });
});
