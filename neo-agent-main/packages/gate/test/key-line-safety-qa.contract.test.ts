/**
 * 독립 QA — 학습 키의 「한 줄」·「트림 불변」 가드와 그 가드가 서 있는 표시 표면
 * (`APPROVAL-GATE.md` §4 · §2 계층 6 · §5 · §7 · `CLI-INTERFACE.md` §10).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자
 * 그대로 있는 부분 문자열이다(2026-09-09 전수 대조).
 *
 * **이 파일은 짝 파일 `key-line-safety.contract.test.ts`를 대체하지 않는다.** 그쪽은
 * 구현과 같은 사이클에 쓰였고, 여기는 정본 문서에서만 기대값을 뽑아 **그쪽이 재지 않는
 * 축**을 잰다. 세 부류다:
 *
 * - **Q**(계약 위반 후보) — 문서가 금지한 결과가 실물에서 관측되는 자리. **실패한 채로
 *   제출한다.** 기대값을 구현에 맞춰 통과시키지 않는다.
 * - **D**(문서 부정확) — 실물이 옳고 문서 문면이 틀린 자리. 실물을 못박고 문면을 리포트로 올린다.
 * - **C**(커버리지 구멍) — 계약에 있는데 재는 검사가 없던 자리. 초록이어야 정상이다.
 *
 * 산출 리포트: `plans/20260909-key-line-safety-qa-report.md` (레포 루트 기준).
 */

import { describe, expect, it } from "vitest";
import { cwdBreaksKeySyntax, hasShellOperator, pathBreaksKeySyntax } from "../src/patterns.ts";
import type { ApprovalRequest, ApprovalResponse, GateToolProfile } from "../src/types.ts";
import { run } from "./contract-helpers.ts";
import { makeAllowlist, makePrompt, PROFILES, WORKSPACE_ROOT } from "./helpers.ts";
import { PROFILES_WITH_WEB, runWeb, keyFor as webKeyFor } from "./web-taint-helpers.ts";

/** 제어 문자는 소스에 리터럴로 박지 않는다 — 무엇을 재는지 눈에 보여야 한다 */
const CR = String.fromCodePoint(0x000d);
const LF = String.fromCodePoint(0x000a);

interface Observed {
  readonly request: ApprovalRequest;
  readonly added: readonly string[];
}

/** 프롬프트에 실제로 실린 요청과, 그 응답이 allowlist를 자라게 했는지 함께 본다 */
async function observe(
  tool: string,
  args: Record<string, unknown>,
  response: ApprovalResponse = "allow-once",
  profiles: Record<string, GateToolProfile> = PROFILES,
): Promise<Observed> {
  const prompt = makePrompt({ response });
  const allowlist = makeAllowlist();
  await run({ prompt, allowlist, toolProfiles: { ...profiles } }, tool, args);
  if (prompt.last === undefined) {
    throw new Error("프롬프트에 닿지 않았다 — 표시본과 키를 관측할 수 없다");
  }
  return { request: prompt.last, added: allowlist.added };
}

/** 표시본에서 게이트가 쓴 라벨 줄의 수 — 모델이 심은 가짜 줄이 있으면 는다 */
function countLabelLines(display: string, label: string): number {
  return display.split(LF).filter((line) => line.startsWith(`${label}: `)).length;
}

// ── Q. 계약 위반 후보 — 실패한 채로 제출한다 ──────────────────────────────

/**
 * **Q-1·Q-2의 여섯 단언은 `it.fails`다 — 판정이 아니라 착지가 안 됐다는 표기다**
 * (2026-09-09, 이 사이클의 T-005 판단).
 *
 * 독립 QA가 이 여섯을 **붉은 채로** 제출했고 그 판정은 옳다 — 세션이 F-1을 직접
 * 재현했다(`command`에 CR를 넣으면 `display`가 원문 그대로 실리고 `warnings`는 비고
 * `allowAlwaysKey`가 발급된다: 터미널이 CR로 앞줄을 덮어써 사용자가 읽는 명령과
 * 학습되는 명령이 갈린다). `APPROVAL-GATE.md` §4가 *"승인 UI가 거짓말하면 게이트
 * 전체가 무의미하다"*로 금한 결과이므로 계약 위반이 맞다.
 *
 * **그런데 이 사이클의 플랜 범위 밖이다.** `K-606`·`K-607`이 닫은 것은 「모델 제어
 * 문자열이 한 줄을 깬다」의 **영속 쪽 절반**(키 발급)이고, 이 여섯은 **표시 쪽 절반**이라
 * 고칠 자리가 `normalize.ts`의 `INVISIBLE_PATTERN`과 `display.ts`다. 범위 확장은
 * 유저 결정이므로 이 사이클은 열지 않는다.
 *
 * **`it.todo`가 아닌 이유는 선례가 든다**(`packages/cli/test/onboarding-startup.qa.test.ts`):
 * `todo`는 아직 안 정해졌다는 뜻인데 여기서 정해지지 않은 것은 없다. 미규정과 미착지를
 * 같은 칸에 넣으면 다음 감사가 둘을 구별하지 못한다.
 *
 * **그래서 이 여섯은 착지의 트리거다** — 표시 쪽이 서는 날 스스로 붉어져 갱신을
 * 강제한다. 사람의 기억이 아니라 붉어진 축이 그날을 알린다. **다만 재는 것은 오늘
 * 계약이 안 지켜진다는 것까지이고 어떻게 틀렸는지는 아니다** — 부분적으로 잘못
 * 착지해도 통과하므로, 그때 이 자리를 단언으로 되돌린다.
 *
 * 카드: `K-609` · QA 리포트: `plans/20260909-key-line-safety-qa-report.md` F-1·F-2
 */
describe("Q-1 표시본에 실리는 모델 제어 문자열의 CR가 탐지되지 않고, 그 문자열이 영구 학습된다", () => {
  // `APPROVAL-GATE.md` §4: "표시 위조 탐지는 게이트 책임이다" —
  // "모집단은 「표시본에 실리는 모든 모델 제어 문자열」이고" `shellExec`에서 그것은 명령과
  // `cwd` 둘이다. 같은 항이 닫는 문장으로 "승인 UI가 거짓말하면 게이트 전체가 무의미하다"를
  // 든다.
  //
  // **관측(2026-09-09).** 명령 `node evil.js<CR>명령: node build.js`는
  //   - `display`에 CR가 **원문 그대로** 실린다(`escapeInvisibles`의 문자 집합이
  //     `\t\n\r`를 빼기 때문이다 — 그 제외의 근거는 셸 **매칭** 의미론이고 표시 정직성이 아니다),
  //   - `warnings`가 **비어 있고**,
  //   - `spoofed`가 서지 않아 `allowAlwaysKey`가 발급되며, `allow-always` 응답으로
  //     `allowlist.add`까지 간다.
  //
  // CLI는 `CLI-INTERFACE.md` §9에 의해 이 문자열을 가공하지 못하므로(줄 바이트 보존·줄 수
  // 불변) 터미널이 CR를 캐리지 리턴으로 해석해 앞부분을 **덮어쓴다** — 사용자가 읽는 줄은
  // `명령: node build.js`이고 실행·학습되는 것은 `node evil.js`다.
  //
  // 기대값은 문서에서 뽑았다: 위조 흔적이 있는 문자열은 학습되지 않아야 하고(§4 — `cwd`
  // 위조가 `spoofed`를 세워 학습 키를 무효화하는 것과 같은 자리), 최소한 경고가 실려야 한다.
  const FORGED = `node evil.js${CR}명령: node build.js`;

  it.fails("CR가 든 명령에는 「항상 허용」 키를 주지 않는다 [미착지: `K-609`]", async () => {
    const observed = await observe("shell", { command: FORGED }, "allow-always");
    expect(
      observed.request.allowAlwaysKey,
      `표시본이 덮어써질 문자열에 학습 키가 붙었다: ${JSON.stringify(observed.request.allowAlwaysKey)}`,
    ).toBeUndefined();
  });

  it.fails("CR가 든 명령은 allowlist를 자라게 하지 않는다 [미착지: `K-609`]", async () => {
    const observed = await observe("shell", { command: FORGED }, "allow-always");
    expect(observed.added).toEqual([]);
  });

  it.fails("CR가 든 명령에는 경고가 실린다 [미착지: `K-609`]", async () => {
    const observed = await observe("shell", { command: FORGED });
    expect(
      observed.request.warnings.length,
      "사용자가 본 줄과 실행될 명령이 갈리는데 경고가 하나도 없다",
    ).toBeGreaterThan(0);
  });

  it("역검증 — 같은 자리에 동형이의 문자를 넣으면 위 셋이 전부 선다", async () => {
    // 이 단언이 초록이라는 것이 위 셋의 붉음을 «검사가 틀렸다»로 설명할 수 없게 만든다:
    // 기계는 이미 있고, CR만 그 모집단 밖이다.
    const cyrillicC = String.fromCodePoint(0x0441);
    const observed = await observe("shell", { command: `${cyrillicC}url x` }, "allow-always");
    expect(observed.request.allowAlwaysKey).toBeUndefined();
    expect(observed.added).toEqual([]);
    expect(observed.request.warnings.length).toBeGreaterThan(0);
  });
});

describe("Q-2 개행이 든 모델 제어 문자열이 승인 화면에 게이트가 쓰지 않은 라벨 줄을 심는다", () => {
  // 같은 §4 항의 같은 두 문면이 근거다. 개행은 CR와 달리 키를 얻지 못하지만
  // (`hasShellOperator`·`cwdBreaksKeySyntax`·`pathBreaksKeySyntax`가 세 자리를 각각 막는다)
  // **표시 표면은 아무도 막지 않는다** — `K-606`이 닫은 것은 영속 쪽 절반뿐이다.
  //
  // 관측(2026-09-09): 명령 `ls<LF>작업 디렉터리: /home/me`의 `display`는
  //   shell — 셸 실행 / 명령: ls / 작업 디렉터리: /home/me / 작업 디렉터리: /ws
  // 가 되고 `warnings`는 비어 있다. 가짜 줄이 **진짜 줄보다 위에** 오므로 화면이 짧으면
  // 사용자가 읽는 것은 가짜 쪽이다.
  it.fails("셸 명령: `작업 디렉터리:` 줄은 게이트가 쓴 하나뿐이어야 한다 [미착지: `K-609`]", async () => {
    const observed = await observe("shell", {
      command: `ls${LF}작업 디렉터리: /home/me`,
      cwd: "/ws/deep",
    });
    expect(
      countLabelLines(observed.request.display, "작업 디렉터리"),
      `표시본에 라벨 줄이 여러 개다:\n${observed.request.display}`,
    ).toBe(1);
  });

  it.fails("파일 도구 경로: `경로:` 줄은 게이트가 쓴 하나뿐이어야 한다 [미착지: `K-609`]", async () => {
    const observed = await observe("write_file", {
      path: `/ws/a${LF}경로: /ws/safe.txt  (워크스페이스 안)`,
      content: "x",
    });
    expect(
      countLabelLines(observed.request.display, "경로"),
      `표시본에 라벨 줄이 여러 개다:\n${observed.request.display}`,
    ).toBe(1);
  });

  it.fails("개행이 든 문자열에는 경고가 실린다 [미착지: `K-609`]", async () => {
    const observed = await observe("shell", { command: `ls${LF}작업 디렉터리: /home/me` });
    expect(observed.request.warnings.length).toBeGreaterThan(0);
  });
});

// ── D. 문서 부정확 — 실물을 못박고 문면을 올린다 ────────────────────────────

describe("D-1 불투명 origin은 사유를 표시한다 — §4의 「같은 처리」 진술이 실물과 갈린다", () => {
  // `APPROVAL-GATE.md` §4 파일 도구 경로 항: "사유를 사용자에게 표시하지 않는다" —
  // "셸 연산자·불투명 origin과 같은 처리이고". **뒤 절이 틀렸다.** 셸 연산자는 맞지만
  // 불투명 origin은 `notes`로 사유를 싣고 그것이 `warnings`로 나간다. 같은 문장이
  // `patterns.ts`의 `pathBreaksKeySyntax` 주석에도 복사돼 있다.
  //
  // 실물 쪽이 옳다 — 같은 §4의 불투명 origin 항이 `unknown`으로 안 떨어뜨리는 근거로
  // 「거짓 사유를 보이기 때문」을 들어 **정직한 표시**를 요구한다. 고칠 것은 문면이다.
  it("불투명 origin: 학습 불가 사유가 warnings에 실린다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await runWeb({ prompt }, "web_fetch", { url: "file:///a" });
    expect(prompt.last?.allowAlwaysKey).toBeUndefined();
    expect(prompt.last?.warnings.join(LF)).toContain("불투명 origin");
  });

  it("셸 연산자: 사유가 실리지 않는다 — 이쪽은 문면대로다", async () => {
    const observed = await observe("shell", { command: "ls; cat a" });
    expect(observed.request.allowAlwaysKey).toBeUndefined();
    expect(observed.request.warnings).toEqual([]);
  });

  it("파일 도구 경로: 사유가 실리지 않는다 — 이쪽도 문면대로다", async () => {
    const observed = await observe("write_file", { path: `/ws/a${LF}b`, content: "x" });
    expect(observed.request.allowAlwaysKey).toBeUndefined();
    expect(observed.request.warnings).toEqual([]);
  });
});

// ── C. 커버리지 구멍 — 계약에 있는데 재는 검사가 없던 자리 ──────────────────

describe("C-1 게이트가 내는 키는 전 분류에서 트림에 불변이다 (CLI-INTERFACE §10)", () => {
  // §10: "게이트가 내는 키는 `String.prototype.trim`에 불변이고" 그래서 파일 구현의 읽기
  // 트림이 왕복을 깨지 않는다. 이 보장의 주어는 **파일 도구 경로가 아니라 게이트가 내는
  // 키 전부**인데, 짝 파일의 L-3·L-4는 `pathBreaksKeySyntax`만 잰다 — 셸 키와 `webFetch`
  // 키에는 재는 검사가 없었다. 셸 키의 꼬리는 정규화된 명령이고 그 불변은
  // `patterns.ts`가 아니라 `normalize.ts`의 `collapseWhitespace`가 우연히 지고 있으므로,
  // 그쪽이 바뀌면 조용히 깨진다.
  it("역검증 — 이 단언은 falsifiable하다", () => {
    expect("shell:/ws:ls " === "shell:/ws:ls ".trim()).toBe(false);
  });

  const SHELL_SAMPLES: ReadonlyArray<readonly [label: string, args: Record<string, unknown>]> = [
    ["평범한 명령", { command: "npm test" }],
    ["꼬리 공백", { command: "npm test   " }],
    ["꼬리 탭", { command: `npm test${String.fromCodePoint(0x09)}` }],
    ["꼬리 개행 — 정규화가 걷는다", { command: `npm test${LF}` }],
    ["머리 공백", { command: "   npm test" }],
    ["cwd 꼬리 공백", { command: "npm test", cwd: "/ws/x " }],
    ["명령 안의 콜론", { command: "a:npm test" }],
  ];

  for (const [label, args] of SHELL_SAMPLES) {
    it(`셸 키(${label})는 트림에 불변이다`, async () => {
      const observed = await observe("shell", args);
      const key = observed.request.allowAlwaysKey;
      if (key === undefined) return; // 키를 안 주는 것은 이 축의 위반이 아니다
      expect(key, `트림하면 달라지는 키를 발급했다: ${JSON.stringify(key)}`).toBe(key.trim());
    });
  }

  it("webFetch 키는 트림에 불변이다", async () => {
    for (const url of [
      "https://example.com/a?b=c",
      "https://example.com:8443/",
      "http://x.test/",
    ]) {
      const key = await webKeyFor(url);
      expect(key, url).toBeDefined();
      expect(key, url).toBe((key as string).trim());
    }
  });

  it("파일 키는 트림에 불변이다 — 공백·콜론이 든 정상 경로 포함", async () => {
    for (const path of ["/ws/src/a.ts", "/ws/a:b.ts", "/ws/my docs/a.ts"]) {
      const observed = await observe("write_file", { path, content: "x" });
      const key = observed.request.allowAlwaysKey;
      expect(key, path).toBeDefined();
      expect(key, path).toBe((key as string).trim());
    }
  });
});

describe("C-2 키를 안 주는 자리는 `allow-always` 응답에도 allowlist를 자라게 하지 않는다 (§5)", () => {
  // §5: allowlist는 동결의 명시적 예외이고 `add`는 프롬프트 응답 경로에서만 불린다.
  // 짝 검사(`freeze.contract.test.ts`)는 이 롤업을 **2026-09-09 이전 자리들**로만 돌린다 —
  // `cwd` 문법·파일 경로 문법 둘이 빠져 있었다. 프롬프트 구현이 계약을 어기고
  // `allow-always`를 돌려줘도 키가 없으면 학습이 없어야 한다(fail-closed의 이중화).
  const NO_KEY_CASES: ReadonlyArray<
    readonly [label: string, tool: string, args: Record<string, unknown>]
  > = [
    ["셸 연산자", "shell", { command: "ls; cat a" }],
    ["cwd 문법 — 콜론", "shell", { command: "npm test", cwd: "/ws:a" }],
    ["cwd 문법 — 개행", "shell", { command: "npm test", cwd: `/ws/a${LF}b` }],
    ["파일 경로 문법 — 개행", "write_file", { path: `/ws/a${LF}b`, content: "x" }],
    ["파일 경로 문법 — 트림", "write_file", { path: "/ws/a ", content: "x" }],
  ];

  for (const [label, tool, args] of NO_KEY_CASES) {
    it(`${label}: 키도 없고 학습도 없다`, async () => {
      const observed = await observe(tool, args, "allow-always");
      expect(observed.request.allowAlwaysKey, label).toBeUndefined();
      expect(observed.added, label).toEqual([]);
    });
  }

  it("역검증 — 키가 있는 자리에서는 정확히 하나 학습된다", async () => {
    const observed = await observe("shell", { command: "npm test" }, "allow-always");
    expect(observed.added).toEqual([`shell:${WORKSPACE_ROOT}:npm test`]);
  });
});

describe("C-3 「항상 허용」 선택지의 부재는 필드의 부재로 표현된다 (§4 · CLI-INTERFACE §9)", () => {
  // §4 `ApprovalRequest.allowAlwaysKey`: "없으면 그 선택지를 제공하지 않는다".
  // 짝 검사는 전부 `toBeUndefined()`로 재는데 그 단언은 **값이 undefined인 필드**와
  // **필드 자체가 없는 것**을 구별하지 않는다. 구현은 스프레드 분기로 필드를 아예
  // 붙이지 않으므로, 이 축을 못박아 두면 undefined를 명시적으로 넣는 리팩터가
  // `"allowAlwaysKey" in req`로 선택지를 세는 CLI를 조용히 깨는 것을 잡는다.
  it("키가 없으면 필드가 아예 없다", async () => {
    const observed = await observe("shell", { command: "ls; cat a" });
    expect(Object.hasOwn(observed.request, "allowAlwaysKey")).toBe(false);
  });

  it("역검증 — 키가 있으면 필드가 있다", async () => {
    const observed = await observe("shell", { command: "npm test" });
    expect(Object.hasOwn(observed.request, "allowAlwaysKey")).toBe(true);
  });
});

describe("C-4 단사성 — §4가 2026-09-09에 정정한 예시가 실물에서 성립한다", () => {
  // §4: 충돌하려면 `:`이 `cwd` 안에 있어야 한다. 초판 예시 `(/ws/a, npm test)` /
  // `(/ws, a:npm test)`는 실제로는 갈린다. 짝 검사는 `cwd`의 `:`을 막는 축과
  // 명령의 `:`은 안 막는 축을 각각 재지만 **둘이 같은 키로 합쳐지지 않는다**는
  // 결론 자체는 재지 않는다.
  it("정정된 예시: 두 쌍은 서로 다른 키가 된다", async () => {
    const a = await observe("shell", { command: "npm test", cwd: "/ws/a" });
    const b = await observe("shell", { command: "a:npm test", cwd: "/ws" });
    expect(a.request.allowAlwaysKey).toBe("shell:/ws/a:npm test");
    expect(b.request.allowAlwaysKey).toBe("shell:/ws:a:npm test");
    expect(a.request.allowAlwaysKey).not.toBe(b.request.allowAlwaysKey);
  });

  it("충돌하는 쪽은 애초에 키를 못 얻는다 — `:`이 `cwd` 안에 있는 경우", async () => {
    const collide = await observe("shell", { command: "npm test", cwd: "/ws:a" });
    expect(collide.request.allowAlwaysKey).toBeUndefined();
  });

  it("가드가 서면 첫 `:`이 언제나 경계다 — 발급된 셸 키의 cwd 필드에는 `:`이 없다", async () => {
    const observed = await observe("shell", { command: "a:b:c", cwd: "/ws/deep" });
    const key = observed.request.allowAlwaysKey as string;
    const rest = key.slice("shell:".length);
    expect(rest.slice(0, rest.indexOf(":"))).toBe("/ws/deep");
  });
});

describe("C-5 §4의 「다섯 번째 사용」 — 다섯 자리가 한 표에서 전부 키를 안 준다", () => {
  // §4 파일 도구 경로 항: 계층 6이 이미 쓰는 기계의 "다섯 번째 사용"이다
  // (셸 연산자 · 불투명 origin · `memoryWrite`/`webSearch` · `cwd` 문법). 다섯이 한
  // 자리에서 함께 서는 검사가 없어, 새 분류가 늘 때 열거가 다시 낡는다 —
  // 그 낡음이 정확히 `K-606`의 경위였다(열거가 둘, 실물이 셋).
  const PROFILES_ALL: Record<string, GateToolProfile> = {
    ...PROFILES_WITH_WEB,
    remember: { kind: "memoryWrite", contentParam: "content" },
    web_search: { kind: "webSearch", queryParam: "query" },
  };

  const FIVE: ReadonlyArray<readonly [label: string, tool: string, args: Record<string, unknown>]> =
    [
      ["① 셸 연산자", "shell", { command: "ls; cat a" }],
      ["② 불투명 origin", "web_fetch", { url: "data:,x" }],
      ["③ webSearch", "web_search", { query: "how to rotate keys" }],
      ["④ cwd 문법", "shell", { command: "npm test", cwd: "/ws:a" }],
      ["⑤ 파일 도구 경로 문법", "write_file", { path: `/ws/a${LF}b`, content: "x" }],
    ];

  for (const [label, tool, args] of FIVE) {
    it(`${label}: 「항상 허용」 선택지가 서지 않는다`, async () => {
      const prompt = makePrompt({ response: "allow-always" });
      const allowlist = makeAllowlist();
      await run({ prompt, allowlist, toolProfiles: { ...PROFILES_ALL } }, tool, args);
      expect(prompt.last?.allowAlwaysKey, label).toBeUndefined();
      expect(allowlist.added, label).toEqual([]);
    });
  }

  it("⑥ memoryWrite는 프롬프트에 닿지 않는 자리라 별도로 잰다 — 오염 없이는 자동 허용", async () => {
    // `memoryWrite`는 플래그가 없으면 계층 5에서 나가므로 프롬프트 자체가 없다.
    // 여기서 재는 것은 그 경로에서도 allowlist가 자라지 않는다는 것이다(§3 — 키를 주지 않는다).
    const prompt = makePrompt({ response: "allow-always" });
    const allowlist = makeAllowlist();
    const verdict = await run(
      { prompt, allowlist, toolProfiles: { ...PROFILES_ALL } },
      "remember",
      {
        content: "hello",
      },
    );
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
    expect(allowlist.added).toEqual([]);
  });
});

describe("C-6 가드 함수의 정의역 — 세 자리가 서로를 대신하지 않는다 (§4)", () => {
  // §4: 개행이 들어갈 수 있는 세 자리가 각각 선다. 각 함수가 **자기 자리만** 막고
  // 이웃의 판정을 흉내 내지 않는지 단위로 잰다 — 한 함수가 넓어지면 «정상 경로가
  // 이유 없이 학습 불가»가 되고(§4의 비대칭 항), 좁아지면 자리 하나가 비는데
  // 파이프라인 위에서는 다른 자리가 가려 버려 붉어지지 않는다.
  it("`cwdBreaksKeySyntax`는 `:`을 막는다 — 뒤에 필드가 하나 더 오기 때문", () => {
    expect(cwdBreaksKeySyntax("/ws:a")).toBe(true);
    expect(cwdBreaksKeySyntax(`/ws/a${LF}b`)).toBe(true);
    expect(cwdBreaksKeySyntax(`/ws/a${CR}b`)).toBe(true);
    expect(cwdBreaksKeySyntax("/ws/a")).toBe(false);
  });

  it("`pathBreaksKeySyntax`는 `:`을 막지 않는다 — 비대칭이 계약이다", () => {
    expect(pathBreaksKeySyntax("/ws/a:b.ts")).toBe(false);
    expect(pathBreaksKeySyntax(`/ws/a${LF}b`)).toBe(true);
    expect(pathBreaksKeySyntax("/ws/a ")).toBe(true);
  });

  it("`cwdBreaksKeySyntax`는 트림 축을 지지 않는다 — `cwd`는 키의 가운데라 필요가 없다", () => {
    // [미규정] 문서는 `cwd`의 트림 불변을 요구하지 않는다. 실제로 필요도 없다 —
    // 키가 `shell:` 로 시작하고 명령으로 끝나므로 `cwd`의 양끝 공백은 트림이 닿지
    // 않는 가운데에 있다. 다만 **표시본에서는 보이지 않는다**: `작업 디렉터리: /ws/x `와
    // `작업 디렉터리: /ws/x`가 화면에서 같아 보이는데 학습 키는 갈린다. 판정 필요.
    expect(cwdBreaksKeySyntax("/ws/x ")).toBe(false);
    const midKeyTail = `shell:${"/ws/x "}:ls`;
    expect(midKeyTail).toBe(midKeyTail.trim());
  });

  it("`hasShellOperator`는 CR를 보지 않는다 — 정규화가 공백으로 접기 때문", () => {
    // 이 단언은 Q-1의 전제를 못박는다: CR는 「한 줄」 축에서는 무해하고
    // (정규화가 공백으로 바꾼다) **표시 축에서만** 해롭다.
    expect(hasShellOperator(`ls${CR}rm`)).toBe(false);
    expect(hasShellOperator(`ls${LF}rm`)).toBe(true);
  });
});

describe("C-7 학습 → 재조회 왕복이 같은 키로 성립한다 (§2 계층 6)", () => {
  // 발급되는 키와 조회되는 키가 같은 함수에서 나오는지를 파이프라인 위에서 잰다.
  // `:`·공백이 든 경로처럼 «가드가 통과시키기로 한» 표본으로 도는 것이 요점이다.
  it("파일 키: 콜론과 공백이 든 경로도 두 번째 호출에서 계층 6으로 나간다", async () => {
    const prompt = makePrompt({ response: "allow-always" });
    const allowlist = makeAllowlist();
    const args = { path: "/ws/a:b c.ts", content: "x" };
    await run({ prompt, allowlist }, "write_file", args);
    expect(allowlist.added).toEqual(["fileWrite:/ws/a:b c.ts"]);
    const second = await run({ prompt, allowlist }, "write_file", args);
    expect(second).toEqual({ decision: "allow", layer: "allowlist" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("셸 키: 정규화 차이가 있는 두 명령이 같은 키로 만난다", async () => {
    const prompt = makePrompt({ response: "allow-always" });
    const allowlist = makeAllowlist();
    await run({ prompt, allowlist }, "shell", { command: "npm   test" });
    expect(allowlist.added).toEqual([`shell:${WORKSPACE_ROOT}:npm test`]);
    const second = await run({ prompt, allowlist }, "shell", { command: "npm test" });
    expect(second).toEqual({ decision: "allow", layer: "allowlist" });
  });
});
