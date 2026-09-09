/**
 * 독립 QA — 머리 줄의 도구 이름 슬롯과 그 파급
 * (`APPROVAL-GATE.md` §4 「머리 줄의 도구 이름도 표시본이다 — 모집단은 출처가 아니라
 *  결과로 정한다」 항의 불릿 넷 · 같은 절 `ApprovalRequest` 인터페이스 블록의 `toolName`
 *  주석 · 같은 절 슬롯 열거 문장 · 같은 절 표시 위조 탐지 항의 `warnings` 갈림 규율 ·
 *  §6 마지막 행(OpenClaw 승인 프레젠테이션 메타데이터 정화)).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이다(2026-09-09 전수 대조). 이 파일에 걸리는 것은 대조 축(U-1·D-1·D-2)
 * 이고, 형식 축(D-3~D-5)과 줄번호 축은 이 자리에 확장되지 않았으나 그것이 대조를 면제하지
 * 않는다. 문서 지목은 절 번호와 항 이름으로만 한다 — 줄번호로 가리키지 않는다.
 *
 * **이 파일은 `display-slot-qa.contract.test.ts`를 대체하지 않는다.** 그쪽이 재는 것은
 * `K-609`가 세운 슬롯 표 전체(명령·`cwd`·URL·질의·경로·메모 본문)이고, 여기는 `K-610`이
 * 그 표에 **새로 넣은 구성원 하나** — 머리 줄의 도구 이름 — 만 여덟 분류에 걸쳐 잰다.
 *
 * 겨눈 축 여덟(정본에서만 도출했다 — 구현도 기존 테스트의 단언도 읽지 않고 기대값을 세웠다):
 *
 * 1. **머리 줄의 슬롯** — "도구 이름은 `single-line` 슬롯이고 모든 표시본의 첫 줄에 온다."
 *    "표시본의 첫 줄은 게이트가 `<도구 이름> — <분류 라벨>`로 짓고" 이므로 여덟 분류
 *    전부에서 CR·LF·비가시·동형이의가 드러나고 원문이 안 남아야 한다.
 * 2. **위조 흔적의 합류** — "위조 흔적은 명령·`cwd`의 것과 똑같이 `spoofed`를 세운다"
 *    이고 그것이 "자동 허용과 학습 키를 무효화한다". 키를 내는 다섯 분류 전부와
 *    자동 허용 둘(워크스페이스 안 `fileRead` · `memoryWrite`)에서 잰다.
 * 3. **경고의 원천 구분** — "`warnings`는 어느 쪽에서 왔는지 갈린다". 문면은 재량이므로
 *    **같은 위조 문자**를 세 자리에 각각 넣어 세 문면이 서로 다른지로만 잰다.
 * 4. **`unknown`의 단일 분석** — "`unknown`에서는 이 분석이 곧 `primary`의 분석이다"이고
 *    "한 번만 돈다". 경고의 **수**로 잰다 — 두 번 돌면 같은 사정이 두 줄이 된다.
 * 5. **`unknown`의 본문 줄** — "`unknown`의 본문 줄은 게이트 상수 그대로다".
 * 6. **여러 줄 슬롯과의 무충돌** — "첫 줄이라 「`multi-line` 슬롯은 마지막에만 온다」와
 *    부딪히지 않는다."
 * 7. **공개 인터페이스 불변** — "식별자 — 표시 표면이 아니다. 소비자는 화면에 싣지 않는다."
 *    이고 "게이트에 `displayToolName` 같은 표시용 필드를 더하는 안도 기각한다".
 *    §6의 축소 행은 정화 대상이 "도구 이름만"이고 "나머지 넷은 우리에게 그 필드가 없다".
 * 8. **파급 0** — "오늘의 배선에서 도구 이름은 전부 ASCII 상수라 파급 0".
 *
 * **기대값의 출처는 위 문서뿐이다.** 구현이 문서와 다르면 문서 편에 서고 red를 그대로
 * 남긴다. 회색지대는 `[미규정]` 주석으로 표시하고 리포트에 「판정 필요」로 올린다.
 *
 * 산출 리포트: `plans/20260909-display-head-line-qa-report.md` (레포 루트 기준).
 */

import { describe, expect, it } from "vitest";
import type { ApprovalRequest, GateLayer, GateToolProfile, GateVerdict } from "../src/types.ts";
import { type GateOverrides, run } from "./contract-helpers.ts";
import { type FakeAllowlist, makeAllowlist, makePrompt } from "./helpers.ts";

/** 제어 문자·비ASCII는 소스에 리터럴로 박지 않는다 — 무엇을 재는지 눈에 보여야 한다 */
const ZWSP = String.fromCodePoint(0x200b);
const CR = String.fromCodePoint(0x000d);
const LF = String.fromCodePoint(0x000a);
/** 키릴 소문자 에스 — 라틴 `c`와 눈으로 구분되지 않는다 */
const CYRILLIC_ES = String.fromCodePoint(0x0441);
/** 전각 소문자 알 — NFKC를 거치면 `r`가 된다 */
const FULLWIDTH_R = String.fromCodePoint(0xff52);

/**
 * `U+…` 표기를 테스트가 직접 만든다. 구현의 포맷터를 임포트하면 "드러난다"를 구현으로
 * 증명하는 순환이 된다 — 계약이 드는 표기는 §4 경고 문면의 `<U+…>` 하나이고, 여기서
 * 재는 것은 **그 코드포인트가 머리 줄에 실렸는가**다(감싸는 기호는 구현 재량으로 둔다).
 */
function codePointLabel(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

interface Spoof {
  readonly id: string;
  readonly char: string;
  /** 이 문자가 표시본에 리터럴로 남아 있으면 안 되는가. LF는 게이트의 줄 분리자라 예외다 */
  readonly literalMustVanish: boolean;
}

/**
 * §4가 머리 줄에 요구하는 분석은 다른 슬롯과 **같은 분석**이다. 그 슬롯 계약이 드는 축은
 * 비가시·CR·(`single-line`에서) LF·동형이의 넷이다. 전각(NFKC)은 §4 표시 위조 탐지 항이
 * 문자 부류로 이름 붙이지 않아 여기 넣지 않고, 아래 I절이 「똑같이」의 패리티로만 잰다.
 */
const SPOOFS: readonly Spoof[] = [
  { id: "비가시 U+200B", char: ZWSP, literalMustVanish: true },
  { id: "CR U+000D", char: CR, literalMustVanish: true },
  { id: "LF U+000A", char: LF, literalMustVanish: false },
  { id: "동형이의 U+0441", char: CYRILLIC_ES, literalMustVanish: true },
];

/** 위조 문자를 이름 **가운데**에 넣는다 — 끝에 붙이면 트림·경계 처리에 가려질 수 있다 */
function spoofName(base: string, char: string): string {
  const cut = Math.floor(base.length / 2);
  return `${base.slice(0, cut)}${char}${base.slice(cut)}`;
}

interface KindCase {
  /** `GateSubject["kind"]`의 값. `unknown`은 프로필을 등록하지 않아 도달한다 */
  readonly kind: string;
  readonly profile: ((toolName: string) => GateToolProfile) | undefined;
  readonly args: Record<string, unknown>;
  /** 깨끗한 ASCII 이름으로 불렀을 때 프롬프트에 도달하는가 */
  readonly promptWhenClean: boolean;
  /** 깨끗한 ASCII 이름으로 불렀을 때 학습 키가 나는가 (§4 키를 내는 다섯) */
  readonly keyWhenClean: boolean;
}

/**
 * 여덟 분류를 한 자리에서 부르기 위한 표. 게이트는 도구 구현을 모르므로(§3 머리) 테스트도
 * 설정 데이터로만 만나고, **위조된 이름으로 프로필을 등록**해 등록된 일곱을 잰다 —
 * `ApprovalGateConfig.toolProfiles`가 `Record<string, GateToolProfile>`이라 이름은 임의다.
 * 이것이 §4가 "모집단은 출처가 아니라 결과로 정한다"로 요구한 바를 재는 유일한 수단이다.
 */
const KIND_CASES: readonly KindCase[] = [
  {
    kind: "fileRead",
    profile: () => ({ kind: "fileRead", pathParam: "path" }),
    // 워크스페이스 **밖**이라 자동 허용에 안 걸리고 프롬프트까지 간다. 안쪽 경로는 B절이 쓴다
    args: { path: "/outside/read.txt" },
    promptWhenClean: true,
    keyWhenClean: true,
  },
  {
    kind: "fileWrite",
    profile: () => ({ kind: "fileWrite", pathParam: "path" }),
    args: { path: "/ws/write.txt" },
    promptWhenClean: true,
    keyWhenClean: true,
  },
  {
    kind: "fileEdit",
    profile: () => ({ kind: "fileEdit", pathParam: "path" }),
    args: { path: "/ws/edit.txt" },
    promptWhenClean: true,
    keyWhenClean: true,
  },
  {
    kind: "shellExec",
    profile: () => ({ kind: "shellExec", commandParam: "command", cwdParam: "cwd" }),
    args: { command: "git status", cwd: "/ws" },
    promptWhenClean: true,
    keyWhenClean: true,
  },
  {
    kind: "webFetch",
    profile: () => ({ kind: "webFetch", urlParam: "url" }),
    args: { url: "https://example.com/a" },
    promptWhenClean: true,
    keyWhenClean: true,
  },
  {
    kind: "memoryWrite",
    profile: () => ({ kind: "memoryWrite", contentParam: "content" }),
    args: { content: "memo" },
    // 자동 허용 대상이라 깨끗한 이름으로는 프롬프트가 뜨지 않는다(§2 계층 5)
    promptWhenClean: false,
    keyWhenClean: false,
  },
  {
    kind: "webSearch",
    profile: () => ({ kind: "webSearch", queryParam: "query" }),
    args: { query: "hello" },
    promptWhenClean: true,
    keyWhenClean: false,
  },
  {
    kind: "unknown",
    profile: undefined,
    args: {},
    promptWhenClean: true,
    keyWhenClean: false,
  },
];

const BASE_NAME = "toolname";

interface Observed {
  readonly request: ApprovalRequest | undefined;
  readonly added: readonly string[];
  readonly verdict: GateVerdict;
}

async function observe(
  toolName: string,
  kase: KindCase,
  args?: Record<string, unknown>,
  extra: GateOverrides = {},
): Promise<Observed> {
  const prompt = makePrompt({ response: "allow-always" });
  const allowlist: FakeAllowlist = makeAllowlist();
  const profiles: Record<string, GateToolProfile> =
    kase.profile === undefined ? {} : { [toolName]: kase.profile(toolName) };
  const verdict = await run(
    { toolProfiles: profiles, prompt, allowlist, ...extra },
    toolName,
    args ?? kase.args,
  );
  return { request: prompt.last, added: allowlist.added, verdict };
}

function requestOf(observed: Observed): ApprovalRequest {
  if (observed.request === undefined) {
    throw new Error(`프롬프트가 호출되지 않았다 — layer=${observed.verdict.layer}`);
  }
  return observed.request;
}

function linesOf(request: ApprovalRequest): readonly string[] {
  return request.display.split(LF);
}

function headOf(request: ApprovalRequest): string {
  return linesOf(request)[0] ?? "";
}

// ────────────────────────────────────────────────────────────────────────────
// A. 머리 줄의 슬롯 — 여덟 분류 전부
// ────────────────────────────────────────────────────────────────────────────

describe("A. 도구 이름은 `single-line` 슬롯이고 모든 표시본의 첫 줄에 온다 (§4 「머리 줄」)", () => {
  for (const kase of KIND_CASES) {
    describe(`분류 ${kase.kind}`, () => {
      it("깨끗한 ASCII 이름은 머리 줄에 원문 그대로 실리고 첫 줄이다", async () => {
        const observed = await observe(BASE_NAME, kase);
        if (!kase.promptWhenClean) {
          // 자동 허용이라 프롬프트가 없다 — 그 자체가 §2 계층 5의 계약이고 H절이 잰다
          expect(observed.request).toBeUndefined();
          return;
        }
        const head = headOf(requestOf(observed));
        expect(head.startsWith(`${BASE_NAME} — `)).toBe(true);
      });

      for (const spoof of SPOOFS) {
        it(`${spoof.id}가 머리 줄에서 가시 표기로 드러난다`, async () => {
          const name = spoofName(BASE_NAME, spoof.char);
          const observed = await observe(name, kase);
          const request = requestOf(observed);
          const head = headOf(request);

          // "드러난다" — 코드포인트가 머리 줄에 실려야 한다
          expect(head).toContain(codePointLabel(spoof.char));

          // 원문이 표시본에 남지 않아야 한다 — 어디에도 리터럴이 남으면 안 된다.
          // LF만 예외: 게이트가 소유한 줄 분리자라 표시본에 정당하게 존재한다.
          if (spoof.literalMustVanish) {
            expect(request.display).not.toContain(spoof.char);
          }

          // 위조된 이름의 원문이 머리 줄에 나란히 놓이면 탐지가 반쪽이 된다
          expect(head).not.toContain(name);
        });
      }

      it("LF가 든 이름은 표시본의 줄 수를 늘리지 않는다 (`single-line` 슬롯)", async () => {
        const baseline = requestOf(await observe(spoofName(BASE_NAME, ZWSP), kase));
        const withLf = requestOf(await observe(spoofName(BASE_NAME, LF), kase));
        expect(linesOf(withLf).length).toBe(linesOf(baseline).length);
      });
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// B. 위조 흔적의 합류 — 자동 허용 둘
// ────────────────────────────────────────────────────────────────────────────

const FILE_READ_CASE = KIND_CASES.find((k) => k.kind === "fileRead") as KindCase;
const MEMORY_CASE = KIND_CASES.find((k) => k.kind === "memoryWrite") as KindCase;
const SHELL_CASE = KIND_CASES.find((k) => k.kind === "shellExec") as KindCase;
const UNKNOWN_CASE = KIND_CASES.find((k) => k.kind === "unknown") as KindCase;

describe("B. 위조 흔적은 자동 허용을 무효화한다 (§4 「머리 줄」 — 명령·`cwd`와 똑같이)", () => {
  const INSIDE = { path: "/ws/read.txt" };

  it("대조군 — 깨끗한 이름의 워크스페이스 안 `fileRead`는 매트릭스로 자동 허용된다", async () => {
    const observed = await observe(BASE_NAME, FILE_READ_CASE, INSIDE);
    expect(observed.verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
  });

  it("대조군 — 깨끗한 이름의 `memoryWrite`는 매트릭스로 자동 허용된다", async () => {
    const observed = await observe(BASE_NAME, MEMORY_CASE);
    expect(observed.verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
  });

  for (const spoof of SPOOFS) {
    it(`${spoof.id}가 든 이름이면 워크스페이스 안 \`fileRead\`가 프롬프트로 바뀐다`, async () => {
      const observed = await observe(spoofName(BASE_NAME, spoof.char), FILE_READ_CASE, INSIDE);
      expect(observed.verdict.layer).not.toBe("policy-matrix");
      expect(observed.verdict.layer).toBe("prompt");
    });

    it(`${spoof.id}가 든 이름이면 \`memoryWrite\`가 프롬프트로 바뀐다`, async () => {
      const observed = await observe(spoofName(BASE_NAME, spoof.char), MEMORY_CASE);
      expect(observed.verdict.layer).not.toBe("policy-matrix");
      expect(observed.verdict.layer).toBe("prompt");
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// C. 위조 흔적의 합류 — 학습 키를 내는 다섯
// ────────────────────────────────────────────────────────────────────────────

const KEY_CASES = KIND_CASES.filter((k) => k.keyWhenClean);

describe("C. 위조 흔적은 학습 키를 무효화한다 (§4 「머리 줄」)", () => {
  it("키를 내는 분류가 다섯이다 (§4 — `shellExec`·파일 셋·`webFetch`)", () => {
    expect(KEY_CASES.map((k) => k.kind)).toEqual([
      "fileRead",
      "fileWrite",
      "fileEdit",
      "shellExec",
      "webFetch",
    ]);
  });

  for (const kase of KEY_CASES) {
    it(`대조군 — ${kase.kind}는 깨끗한 이름에서 키가 나고 학습된다`, async () => {
      const observed = await observe(BASE_NAME, kase);
      const request = requestOf(observed);
      expect(request.allowAlwaysKey).toBeDefined();
      expect(observed.added).toHaveLength(1);
    });

    for (const spoof of SPOOFS) {
      it(`${kase.kind} — ${spoof.id}가 든 이름은 키를 얻지 못한다`, async () => {
        const observed = await observe(spoofName(BASE_NAME, spoof.char), kase);
        const request = requestOf(observed);
        expect(request.allowAlwaysKey).toBeUndefined();
        // "항상 허용"으로 응답해도 학습되지 않는다 — 키가 없으면 선택지가 서지 않는다
        expect(observed.added).toEqual([]);
      });
    }
  }

  it("키를 안 내는 셋(`memoryWrite`·`webSearch`·`unknown`)은 위조 전후로 키가 없다", async () => {
    for (const kase of KIND_CASES.filter((k) => !k.keyWhenClean)) {
      const spoofed = requestOf(await observe(spoofName(BASE_NAME, ZWSP), kase));
      expect(spoofed.allowAlwaysKey).toBeUndefined();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// D. 경고의 원천이 갈린다 — `shellExec`의 세 자리
// ────────────────────────────────────────────────────────────────────────────

describe("D. `warnings`는 어느 쪽에서 왔는지 갈린다 (§4 — 문면은 재량, 갈림만 계약)", () => {
  /** 세 자리에 **같은** 위조 문자를 넣는다 — 갈리지 않는 구현은 같은 문자열을 낸다 */
  async function warningsFor(which: "name" | "command" | "cwd"): Promise<readonly string[]> {
    const name = which === "name" ? spoofName(BASE_NAME, ZWSP) : BASE_NAME;
    const command = which === "command" ? spoofName("git status", ZWSP) : "git status";
    const cwd = which === "cwd" ? spoofName("/ws/sub", ZWSP) : "/ws/sub";
    const observed = await observe(name, SHELL_CASE, { command, cwd });
    return requestOf(observed).warnings;
  }

  it("한 자리만 위조하면 다른 둘의 원천 경고가 없다 — 경고는 정확히 한 건이다", async () => {
    for (const which of ["name", "command", "cwd"] as const) {
      expect(await warningsFor(which), `위조 자리: ${which}`).toHaveLength(1);
    }
  });

  it("세 자리의 경고 문면이 서로 다르다", async () => {
    const [name, command, cwd] = await Promise.all([
      warningsFor("name"),
      warningsFor("command"),
      warningsFor("cwd"),
    ]);
    // 셋이 **실재하는지** 먼저 잰다 — 한 축이 아예 경고를 안 내면 `undefined`가 원소로
    // 들어가 집합 크기가 3이 되어 통과한다. 그 통과는 갈림이 아니라 부재의 위장이다
    expect(name[0], "도구 이름 축의 경고가 없다").toBeDefined();
    expect(command[0], "명령 축의 경고가 없다").toBeDefined();
    expect(cwd[0], "작업 디렉터리 축의 경고가 없다").toBeDefined();
    const all = [name[0], command[0], cwd[0]];
    expect(new Set(all).size).toBe(3);
  });

  it("세 자리를 함께 위조하면 서로 다른 경고 셋이 실린다", async () => {
    const observed = await observe(spoofName(BASE_NAME, ZWSP), SHELL_CASE, {
      command: spoofName("git status", ZWSP),
      cwd: spoofName("/ws/sub", ZWSP),
    });
    const warnings = requestOf(observed).warnings;
    expect(warnings).toHaveLength(3);
    expect(new Set(warnings).size).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E. `unknown` — 분석은 한 번만 돈다 · 본문 줄은 게이트 상수 그대로
// ────────────────────────────────────────────────────────────────────────────

describe("E. `unknown`에서는 이 분석이 곧 `primary`의 분석이다 — 한 번만 돈다 (§4)", () => {
  it("비가시 문자 하나가 든 미등록 이름의 경고는 정확히 한 건이다", async () => {
    const observed = await observe(spoofName(BASE_NAME, ZWSP), UNKNOWN_CASE);
    const request = requestOf(observed);
    // 미등록 사유 안내(`resolveSubject`의 note) 한 건 + 위조 경고 한 건.
    // 분석이 두 번 돌면 위조 경고가 두 줄이 되어 사용자는 위조가 둘이라고 읽는다.
    const spoofWarnings = request.warnings.filter((w) => w.includes(codePointLabel(ZWSP)));
    expect(spoofWarnings).toHaveLength(1);
  });

  it("표시 머리 줄과 경고가 같은 코드포인트를 든다", async () => {
    const observed = await observe(spoofName(BASE_NAME, ZWSP), UNKNOWN_CASE);
    const request = requestOf(observed);
    const label = codePointLabel(ZWSP);
    expect(headOf(request)).toContain(label);
    expect(request.warnings.some((w) => w.includes(label))).toBe(true);
  });

  it("본문 줄은 게이트 상수 그대로다 — 위조 전후로 같다", async () => {
    const clean = requestOf(await observe(BASE_NAME, UNKNOWN_CASE));
    for (const spoof of SPOOFS) {
      const spoofed = requestOf(await observe(spoofName(BASE_NAME, spoof.char), UNKNOWN_CASE));
      expect(linesOf(spoofed).slice(1), `위조 문자: ${spoof.id}`).toEqual(linesOf(clean).slice(1));
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F. 여러 줄 슬롯과 부딪히지 않는다 — 머리(1줄) · 라벨 · 본문
// ────────────────────────────────────────────────────────────────────────────

describe("F. 첫 줄이라 「`multi-line` 슬롯은 마지막에만 온다」와 부딪히지 않는다 (§4)", () => {
  it("이름·메모가 둘 다 여러 줄이면 머리 1줄 → 라벨 → 본문 순이다", async () => {
    const name = spoofName(BASE_NAME, LF);
    const observed = await observe(name, MEMORY_CASE, { content: `line1${LF}line2` });
    const lines = linesOf(requestOf(observed));

    // 머리 줄은 한 줄이다 — 이름의 LF가 드러나 줄이 되지 않는다
    expect(lines[0]).toContain(codePointLabel(LF));
    // `multi-line` 슬롯의 라벨. §4가 이 자리를 유일한 여러 줄 슬롯으로 이름 붙인다
    expect(lines[1]).toBe("저장할 내용:");
    // 본문의 LF는 그 슬롯의 존재 이유이므로 드러나지 않는다
    expect(lines.slice(2)).toEqual(["line1", "line2"]);
    expect(lines).toHaveLength(4);
  });

  it("메모 본문의 LF는 여전히 자동 허용을 깨지 않는다 — 깨는 것은 머리 줄 쪽이다", async () => {
    const clean = await observe(BASE_NAME, MEMORY_CASE, { content: `line1${LF}line2` });
    expect(clean.verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// G. 공개 인터페이스 불변
// ────────────────────────────────────────────────────────────────────────────

describe("G. 공개 인터페이스는 이 개정으로 넓어지지 않는다 (§4 · §6)", () => {
  it("`ApprovalRequest`에 `displayToolName`이 없다 — 타입 축", () => {
    type HasDisplayField = "displayToolName" extends keyof ApprovalRequest ? true : false;
    const hasField: HasDisplayField = false;
    expect(hasField).toBe(false);
  });

  it("`ApprovalRequest`에 `displayToolName`이 없다 — 실물 축", async () => {
    for (const kase of KIND_CASES) {
      const request = requestOf(await observe(spoofName(BASE_NAME, ZWSP), kase));
      expect(Object.hasOwn(request, "displayToolName"), `분류: ${kase.kind}`).toBe(false);
    }
  });

  it("`toolName` 필드는 원문을 그대로 든다 — 식별자이지 표시 표면이 아니다", async () => {
    for (const kase of KIND_CASES) {
      for (const spoof of SPOOFS) {
        const name = spoofName(BASE_NAME, spoof.char);
        const request = requestOf(await observe(name, kase));
        expect(request.toolName, `${kase.kind} / ${spoof.id}`).toBe(name);
      }
    }
  });

  it("§6 — 정화 대상은 도구 이름만이고 나머지 넷은 필드가 없다", async () => {
    const request = requestOf(await observe(spoofName(BASE_NAME, ZWSP), SHELL_CASE));
    for (const field of ["host", "nodeId", "agentId", "pluginId"]) {
      expect(Object.hasOwn(request, field), `필드: ${field}`).toBe(false);
    }
  });

  it("위조된 이름의 판정 `layer`가 기존 유니온 값이다", async () => {
    // 유니온이 넓어지면 이 표가 타입 검사에서 붉어진다 — 값이 는 것을 조용히 넘기지 않는다
    const known: Record<GateLayer, true> = {
      "denied-path": true,
      hardline: true,
      "mode-off": true,
      "deny-rule": true,
      "policy-matrix": true,
      allowlist: true,
      prompt: true,
    };
    for (const kase of KIND_CASES) {
      const observed = await observe(spoofName(BASE_NAME, ZWSP), kase);
      expect(known[observed.verdict.layer], `분류: ${kase.kind}`).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// H. 파급 0 — 깨끗한 ASCII 이름에서 머리 줄 · 키 · layer 항등
// ────────────────────────────────────────────────────────────────────────────

describe("H. 오늘의 배선에서 도구 이름은 전부 ASCII 상수라 파급 0 (§4 「대가와 파급」)", () => {
  for (const kase of KIND_CASES) {
    it(`${kase.kind} — 깨끗한 이름에서 경고가 늘지 않고 판정이 그대로다`, async () => {
      const observed = await observe(BASE_NAME, kase);
      if (!kase.promptWhenClean) {
        expect(observed.verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
        return;
      }
      const request = requestOf(observed);
      expect(observed.verdict.layer).toBe("prompt");
      // 도구 이름 축이 만든 경고가 없어야 한다. `unknown`은 미등록 사유 안내 한 건을
      // 원래 갖고, 나머지 일곱은 이 인자들에서 경고가 날 자리가 없다
      expect(request.warnings.length).toBe(kase.kind === "unknown" ? 1 : 0);
      expect(headOf(request).startsWith(`${BASE_NAME} — `)).toBe(true);
      if (kase.keyWhenClean) {
        expect(request.allowAlwaysKey).toBeDefined();
        // 키에 도구 이름이 섞이지 않는다 — 머리 줄은 표시 축이지 키 축이 아니다
        expect(request.allowAlwaysKey).not.toContain(BASE_NAME);
      }
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// I. 「똑같이」의 패리티 — 도구 이름 축과 명령 축이 같은 처분을 받는가
// ────────────────────────────────────────────────────────────────────────────

describe("I. 위조 흔적은 명령·`cwd`의 것과 똑같이 처분된다 (§4 「머리 줄」)", () => {
  async function keyIssued(which: "name" | "command", char: string): Promise<boolean> {
    const name = which === "name" ? spoofName(BASE_NAME, char) : BASE_NAME;
    const command = which === "command" ? spoofName("git status", char) : "git status";
    const observed = await observe(name, SHELL_CASE, { command, cwd: "/ws" });
    return requestOf(observed).allowAlwaysKey !== undefined;
  }

  for (const spoof of SPOOFS) {
    it(`${spoof.id} — 이름 축과 명령 축의 키 발급 여부가 같다`, async () => {
      expect(await keyIssued("name", spoof.char)).toBe(await keyIssued("command", spoof.char));
    });
  }

  // [미규정] §4 표시 위조 탐지 항은 문자 부류로 "비가시 문자·동형이의 문자"만 이름 붙이고
  // 전각·호환 문자(NFKC)를 들지 않는다. 그래서 **전각이 위조 흔적인가**는 이 계약이 정하지
  // 않는다. 여기서 재는 것은 그 물음이 아니라 「똑같이」 하나다 — 명령 축에서 전각이 받는
  // 처분이 무엇이든 이름 축이 같은 처분을 받아야 한다. 판정 필요: 리포트 U-1.
  it("[미규정] 전각·호환 문자 — 이름 축과 명령 축의 키 발급 여부가 같다", async () => {
    expect(await keyIssued("name", FULLWIDTH_R)).toBe(await keyIssued("command", FULLWIDTH_R));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// J. 부정 단언 — 계약이 **안 넓히기로** 처분한 자리
// ────────────────────────────────────────────────────────────────────────────

const TAB = String.fromCodePoint(0x0009);

describe("J. 머리 줄도 탭을 넓히지 않는다 (§4 「`\\t`는 넓히지 않는다」 — 기록된 의도적 비결과)", () => {
  it("탭이 든 이름은 가시화되지 않고 위조로 세어지지 않는다", async () => {
    const name = spoofName(BASE_NAME, TAB);
    const observed = await observe(name, SHELL_CASE);
    const request = requestOf(observed);
    // 드러내지 않는다 — 탭은 게이트가 소유한 줄 구조를 깨지 않는다
    expect(request.display).toContain(name);
    expect(headOf(request)).not.toContain(codePointLabel(TAB));
    // 세우지도 않는다 — 학습 키가 그대로 난다
    expect(request.allowAlwaysKey).toBeDefined();
  });

  it("탭이 든 이름은 워크스페이스 안 `fileRead`의 자동 허용을 깨지 않는다", async () => {
    const observed = await observe(spoofName(BASE_NAME, TAB), FILE_READ_CASE, {
      path: "/ws/read.txt",
    });
    expect(observed.verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// K. 「같은 문자열, 같은 슬롯」이 아닌데 분석이 합쳐지는가
// ────────────────────────────────────────────────────────────────────────────

describe("K. 머리 줄과 명령 줄은 서로 다른 슬롯이다 (§4 슬롯 열거 — 도구 이름과 명령은 따로 열거된다)", () => {
  /**
   * §4는 분석의 재사용을 **`unknown`에서만** 근거지운다: "`unknown`에서는 이 분석이 곧
   * `primary`의 분석이다"이고 그 근거가 "같은 문자열, 같은 슬롯이므로"다. `shellExec`에서
   * 도구 이름과 명령은 슬롯 열거에 **따로** 실린 두 자리이므로 문자열이 우연히 같아도
   * "같은 슬롯"이 아니다 — 그리고 `command`는 모델이 제어하는 인자라 그 일치는 모델이
   * 만들 수 있다.
   *
   * 재현: 위조된 이름으로 셸 프로필을 등록하고, 모델이 `command`에 **그 이름과 같은
   * 문자열**을 넣는다. 계약이 요구하는 것은 두 자리가 화면에서 갈리는 것이다 —
   * "`warnings`는 어느 쪽에서 왔는지 갈린다".
   */
  it("이름과 명령이 같은 문자열이어도 두 원천의 경고가 각각 실린다", async () => {
    const collided = spoofName(BASE_NAME, ZWSP);
    const observed = await observe(collided, SHELL_CASE, { command: collided, cwd: "/ws" });
    const warnings = requestOf(observed).warnings;
    expect(warnings).toHaveLength(2);
    expect(new Set(warnings).size).toBe(2);
  });

  it("대조군 — 문자열이 다르면 두 원천의 경고가 각각 실린다", async () => {
    const observed = await observe(spoofName(BASE_NAME, ZWSP), SHELL_CASE, {
      command: spoofName("git status", ZWSP),
      cwd: "/ws",
    });
    const warnings = requestOf(observed).warnings;
    expect(warnings).toHaveLength(2);
    expect(new Set(warnings).size).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// L. 원문 도구 이름이 공개 표면에 남는 다른 자리
// ────────────────────────────────────────────────────────────────────────────

describe("L. `unknown` subject의 `toolName`도 원문이다", () => {
  /**
   * [미규정] §4는 원문 도구 이름의 표시 금지를 **`ApprovalRequest.toolName` 한 필드**에만
   * 건다("식별자 — 표시 표면이 아니다. 소비자는 화면에 싣지 않는다."). 그런데 `unknown`
   * 분류에서는 같은 원문이 `request.subject`(같은 객체의 공개 필드) 안에도 한 벌 더 실린다.
   * 소비자가 그쪽을 화면에 실으면 §4가 이름 붙인 실패 양태 — 게이트가 이스케이프한 줄
   * 옆에 원문이 놓인다 — 가 그대로 재현되는데, 그 자리에는 규칙이 없다.
   *
   * **판정하지 않는다.** 여기서는 관측값만 고정한다 — 필드가 원문을 든다는 사실과,
   * 그 사실이 계약의 어느 문장에도 안 걸린다는 것. 판정 필요: 리포트 U-2.
   */
  it("[미규정] 위조된 이름이 `subject.toolName`에 원문으로 남는다", async () => {
    const name = spoofName(BASE_NAME, ZWSP);
    const request = requestOf(await observe(name, UNKNOWN_CASE));
    const subject = request.subject;
    expect(subject.kind).toBe("unknown");
    if (subject.kind !== "unknown") throw new Error("도달 불가");
    expect(subject.toolName).toBe(name);
    // 같은 원문이 `display`에는 없다 — 그것이 §4가 실제로 닫은 자리다
    expect(request.display).not.toContain(name);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// M. 표시 상한 잘림도 다른 슬롯과 같은 분석을 받는가
// ────────────────────────────────────────────────────────────────────────────

describe("M. 머리 줄의 표시 상한 잘림 (§4 — 다른 슬롯과 같은 분석)", () => {
  /** 게이트의 표시 상한(4096자)을 넘기는 길이. 상수를 임포트하지 않고 넉넉히 넘긴다 */
  const OVER_LIMIT = "a".repeat(6000);

  it("상한을 넘는 이름과 상한을 넘는 명령이 같은 처분을 받는다", async () => {
    const byName = requestOf(
      await observe(OVER_LIMIT, SHELL_CASE, { command: "git status", cwd: "/ws" }),
    );
    const byCommand = requestOf(
      await observe(BASE_NAME, SHELL_CASE, { command: OVER_LIMIT, cwd: "/ws" }),
    );
    expect(byName.allowAlwaysKey === undefined).toBe(byCommand.allowAlwaysKey === undefined);
  });
});
