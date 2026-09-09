/**
 * 독립 QA — 표시 슬롯의 줄 계약과 그 파급
 * (`APPROVAL-GATE.md` §4 표시 위조 탐지 항 · §6의 축소 2행 · §7 정의역 항 ·
 *  `CLI-INTERFACE.md` §9 · §10 · `APPROVAL-GATE.md` §3 분류별 표시 본문).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이다(2026-09-09 전수 대조).
 *
 * **이 파일은 형제 둘(`key-line-safety.contract.test.ts`·`key-line-safety-qa.contract.test.ts`)을
 * 대체하지 않는다.** 그쪽이 재는 것은 학습 키의 「한 줄」·「트림 불변」과 그 가드이고, 여기는
 * `K-609`가 세운 **슬롯 표 자체**를 잰다 — 어느 문자열이 어느 슬롯에 확정돼 있는가, 그 표가
 * 전수인가, 그리고 그 확정이 낳는 파급이 문서대로인가.
 *
 * 겨눈 축 일곱:
 *
 * 1. **슬롯 표의 전수** — kind와 슬롯은 1:1이 아니다. `shellExec`은 둘(명령 · 작업 디렉터리)이라
 *    kind당 하나로 세면 부분 착지가 통과한다.
 * 2. **여러 줄 슬롯의 꼬리** — §4가 "슬롯은 표시본의 마지막에만 온다"로 못박은 자리.
 *    다음 개정이 그 뒤에 라벨을 붙이면 여기가 붉어진다.
 * 3. **줄 수 불변** — 한 줄 슬롯만 실린 표시본의 줄 수는 입력의 CR·LF 개수와 무관하다.
 *    짝 계약이 `CLI-INTERFACE.md` §9다("각 줄 바이트는 출력에서 보존돼야 하고 줄 수를
 *    바꾸지 않는다") — CLI가 고쳐 줄 수 없다는 것이 이 축의 무게다.
 * 4. **탭의 부정 단언** — §6이 안 넣음으로 처분한 결과가 실물에서 성립하는가.
 * 5. **파급** — §4 "대가와 파급"이 든 셋.
 * 6. **`cwd`의 트림 축** — §7이 든 자리. 명령 쪽은 안 걸린다.
 * 7. **경고 원천의 구분** — "문면은 구현 재량이되" 갈린다는 것만 계약이다.
 *
 * **기대값의 출처는 위 문서들뿐이다.** 구현을 읽어 기대값을 정하지 않는다 — 그러면 구현이
 * 옳았다는 것을 구현으로 증명하는 순환이 된다. 실물이 문서와 다르면 문서 편에 서고 red를
 * 그대로 남긴다.
 *
 * **F 절의 위반은 2026-09-09에 착지했다**(`K-610` — `APPROVAL-GATE.md` §4 「머리 줄」 항).
 * 아래 F 절은 실패를 기대하는 트리거 표기가 아니라 **착지를 재는 단언**이고, 분류별 커버리지는
 * H 절의 머리 줄 표본 여덟이 든다.
 *
 * 산출 리포트: `plans/20260909-display-slot-qa-report.md` (레포 루트 기준).
 */

import { describe, expect, it } from "vitest";
import { normalizeForMatching } from "../src/normalize.ts";
import type {
  ApprovalRequest,
  ApprovalResponse,
  GateToolProfile,
  GateVerdict,
  PathClassifier,
  PathScope,
} from "../src/types.ts";
import { type GateOverrides, run } from "./contract-helpers.ts";
import { makeAllowlist, makePrompt, PROFILES, WORKSPACE_ROOT } from "./helpers.ts";
import { callGate, makeMemoryGate } from "./memory-write-helpers.ts";

/** 제어 문자는 소스에 리터럴로 박지 않는다 — 무엇을 재는지 눈에 보여야 한다 */
const CR = String.fromCodePoint(0x000d);
const LF = String.fromCodePoint(0x000a);
const TAB = String.fromCodePoint(0x0009);
const ESCAPE = String.fromCodePoint(0x001b);
/** 키릴 소문자 에스 — 라틴 `c`와 동형이의 */
const CYRILLIC_ES = String.fromCodePoint(0x0441);

const MEMORY_TOOL = "remember";
const SEARCH_TOOL = "web_search";
const FETCH_TOOL = "web_fetch";

/**
 * 여덟 분류를 한 자리에서 부르기 위한 프로필 표. 게이트는 도구 구현을 모르므로
 * (`APPROVAL-GATE.md` §3) 테스트도 설정 데이터로만 만난다.
 */
const ALL_PROFILES: Record<string, GateToolProfile> = {
  ...PROFILES,
  [MEMORY_TOOL]: { kind: "memoryWrite", contentParam: "content" },
  [SEARCH_TOOL]: { kind: "webSearch", queryParam: "query" },
  [FETCH_TOOL]: { kind: "webFetch", urlParam: "url" },
};

interface Observed {
  readonly request: ApprovalRequest;
  readonly added: readonly string[];
  readonly verdict: GateVerdict;
}

async function observe(
  tool: string,
  args: unknown,
  options: {
    response?: ApprovalResponse;
    classifier?: PathClassifier;
    /**
     * 위조된 이름으로 프로필을 등록한다 — **등록된 일곱 분류의 머리 줄을 재는 수단**이다
     * (2026-09-09 `K-610`). `toolProfiles`는 `Record<string, GateToolProfile>`이라 게이트는
     * 이름의 모양을 묻지 않는다(§3 — 게이트는 도구 구현을 모르고 설정 데이터로만 만난다).
     * 코어 레지스트리가 그런 이름을 받는지는 **게이트 계약 밖**이고, 게이트가 그 필터링에
     * 기대면 그것이 계층 침범이다(§4 「출처를 묻지 않는 근거」).
     */
    extraProfiles?: Record<string, GateToolProfile>;
  } = {},
): Promise<Observed> {
  const prompt = makePrompt({ response: options.response ?? "allow-once" });
  const allowlist = makeAllowlist();
  const overrides: GateOverrides = {
    prompt,
    allowlist,
    toolProfiles: { ...ALL_PROFILES, ...(options.extraProfiles ?? {}) },
  };
  if (options.classifier !== undefined) overrides.classifier = options.classifier;
  const verdict = await run(overrides, tool, args);
  if (prompt.last === undefined) {
    throw new Error("프롬프트에 닿지 않았다 — 표시본과 키를 관측할 수 없다");
  }
  return { request: prompt.last, added: allowlist.added, verdict };
}

/** 계층까지 보려면 판정을 그대로 받는다 — 자동 허용은 프롬프트에 닿지 않는다 */
async function verdictOf(tool: string, args: unknown): Promise<GateVerdict> {
  return await run({ toolProfiles: { ...ALL_PROFILES } }, tool, args);
}

/**
 * 오염을 세워 `memoryWrite`를 프롬프트까지 끌어온다. 자동 허용 대상이라 평소엔 화면이
 * 뜨지 않지만, 계층 4b는 그 자동 허용을 무효화한다(`APPROVAL-GATE.md` §2 계층 4b).
 */
async function observeMemoryViaTaint(content: unknown): Promise<ApprovalRequest> {
  const prompt = makePrompt({ response: "allow-once" });
  const gate = makeMemoryGate({ prompt, toolProfiles: { ...ALL_PROFILES } });
  gate.noteToolResult({ source: "network" });
  await callGate(gate, MEMORY_TOOL, { content });
  if (prompt.last === undefined) throw new Error("오염 런에서도 프롬프트에 닿지 않았다");
  return prompt.last;
}

const lines = (display: string): string[] => display.split(LF);

/** 게이트가 만든 표시본에 `has` 문자가 원문 그대로 남았는가 */
const carriesRaw = (text: string, char: string): boolean => text.includes(char);

/* ======================================================================== *
 * 축 1 — 슬롯 표의 전수
 *
 * §4: 표시 위조 탐지의 모집단은 "표시본에 실리는 모든 모델 제어 문자열"이고, 슬롯 표는
 * `multi-line` 하나(`memoryWrite`의 저장할 내용)와 나머지 전부 `single-line`이다.
 * **kind가 아니라 슬롯이 단위다** — `shellExec`은 슬롯 둘을 갖는다.
 *
 * **이 표의 「전수」는 슬롯 *종류*의 전수다** — 어느 문자열이 어느 슬롯인가. 머리 줄은
 * 종류가 하나이면서 **여덟 분류에 하나씩** 있으므로, 이 표의 표본 하나는 그 종류가
 * 슬롯을 갖는다는 것까지만 잰다. **분류별 머리 줄 커버리지는 H 절의 표본 여덟이 든다**
 * (2026-09-09 `K-610`) — 다음 감사가 이 표를 「머리 줄까지 전수」로 읽지 않게.
 * ======================================================================== */

/** 한 슬롯 = 한 표본. `gateLines`는 게이트가 그 화면에 쓰는 줄 수다(라벨 수 + 머리 1) */
interface SlotCase {
  readonly slot: string;
  readonly tool: string;
  readonly multiLine: boolean;
  readonly gateLines: number;
  /** 주입 문자열을 그 슬롯에 꽂아 호출 인자를 만든다 */
  readonly args: (payload: string) => unknown;
  /** 도구 이름 자체가 슬롯인 경우(미등록 도구의 머리 줄) */
  readonly toolName?: (payload: string) => string;
}

const SLOT_CASES: readonly SlotCase[] = [
  {
    slot: "fileRead 경로",
    tool: "read_file",
    multiLine: false,
    gateLines: 2,
    args: (p) => ({ path: `/ws/a${p}b` }),
  },
  {
    slot: "fileWrite 경로",
    tool: "write_file",
    multiLine: false,
    gateLines: 2,
    args: (p) => ({ path: `/ws/a${p}b` }),
  },
  {
    slot: "fileEdit 경로",
    tool: "edit_file",
    multiLine: false,
    gateLines: 2,
    args: (p) => ({ path: `/ws/a${p}b` }),
  },
  {
    slot: "shellExec 명령",
    tool: "shell",
    multiLine: false,
    gateLines: 3,
    args: (p) => ({ command: `ls${p}la`, cwd: "/ws" }),
  },
  {
    slot: "shellExec 작업 디렉터리",
    tool: "shell",
    multiLine: false,
    gateLines: 3,
    args: (p) => ({ command: "ls", cwd: `/ws/a${p}b` }),
  },
  {
    slot: "webFetch URL",
    tool: FETCH_TOOL,
    multiLine: false,
    gateLines: 2,
    args: (p) => ({ url: `https://example.com/a${p}b` }),
  },
  {
    slot: "webSearch 질의",
    tool: SEARCH_TOOL,
    multiLine: false,
    gateLines: 2,
    args: (p) => ({ query: `검색어${p}뒤` }),
  },
  {
    // 슬롯 열거에서 게이트 상수인 미등록 도구 문면이 걷히고 도구 이름이 들어온 자리다
    // (2026-09-09 `K-610` — §4 「머리 줄」 항). 게이트가 그 화면에 쓰는 줄은 그대로 둘이고
    // (머리 · 상수 안내 줄) 바뀐 것은 **어느 문자열이 슬롯인가**다.
    slot: "도구 이름(머리 줄)",
    tool: "unregistered_tool",
    multiLine: false,
    gateLines: 2,
    args: () => ({}),
    toolName: (p) => `unregistered${p}tool`,
  },
  {
    // 게이트가 쓰는 줄이 셋인 유일한 자리다 — 머리 · 라벨 · 그리고 본문이 라벨 **다음
    // 줄부터** 온다(§3). 본문 안의 LF는 그 위에 더 얹힌다
    slot: "memoryWrite 저장할 내용",
    tool: MEMORY_TOOL,
    multiLine: true,
    gateLines: 3,
    args: (p) => ({ content: `메모${p}뒤` }),
  },
];

describe("S-1 슬롯 표는 kind가 아니라 슬롯 단위로 전수다 (APPROVAL-GATE §4)", () => {
  it("표본이 여덟 분류를 전부 덮고, shellExec은 슬롯 둘을 갖는다", () => {
    const kinds = new Set(SLOT_CASES.map((c) => (c.tool === "shell" ? "shellExec" : c.tool)));
    // 여덟 분류: 파일 셋 · 셸 · webFetch · memoryWrite · webSearch · unknown
    expect(SLOT_CASES).toHaveLength(9);
    expect(kinds.size).toBe(8);
    expect(SLOT_CASES.filter((c) => c.tool === "shell")).toHaveLength(2);
    expect(SLOT_CASES.filter((c) => c.multiLine)).toHaveLength(1);
  });

  for (const slotCase of SLOT_CASES) {
    it(`${slotCase.slot}: CR는 어느 슬롯에서도 드러나고 원문이 남지 않는다`, async () => {
      // §4: CR는 "어느 슬롯에서도 정당하지 않다" — 가시 표기로 드러내고 spoofed를 세운다
      const tool = slotCase.toolName?.(CR) ?? slotCase.tool;
      const observed = await observe(tool, slotCase.args(CR));
      expect(observed.request.display).toContain("<U+000D>");
      expect(carriesRaw(observed.request.display, CR)).toBe(false);
      expect(observed.request.warnings.length).toBeGreaterThan(0);
      expect(Object.hasOwn(observed.request, "allowAlwaysKey")).toBe(false);
      expect(lines(observed.request.display)).toHaveLength(slotCase.gateLines);
    });
  }

  for (const slotCase of SLOT_CASES.filter((c) => !c.multiLine)) {
    it(`${slotCase.slot}: LF는 한 줄 슬롯에서 드러나고 줄을 늘리지 않는다`, async () => {
      // §4: "`\n`은 슬롯이 정한다" — `single-line`이면 드러내고 세운다
      const tool = slotCase.toolName?.(LF) ?? slotCase.tool;
      const observed = await observe(tool, slotCase.args(LF));
      expect(observed.request.display).toContain("<U+000A>");
      expect(lines(observed.request.display)).toHaveLength(slotCase.gateLines);
      expect(Object.hasOwn(observed.request, "allowAlwaysKey")).toBe(false);
    });
  }

  it("memoryWrite 저장할 내용만 LF를 통과시킨다 — 그 슬롯의 존재 이유다", async () => {
    const request = await observeMemoryViaTaint(`첫 줄${LF}둘째 줄`);
    expect(request.display).not.toContain("<U+000A>");
    expect(lines(request.display)).toHaveLength(4);
  });

  it("LF만 든 메모는 위조가 아니라서 자동 허용이 그대로 선다 (계층 5)", async () => {
    const verdict = await verdictOf(MEMORY_TOOL, { content: `첫 줄${LF}둘째 줄` });
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
  });
});

/* ======================================================================== *
 * H — 머리 줄의 분류별 커버리지
 *
 * §4 「머리 줄」 항: 도구 이름은 "`single-line` 슬롯이고 모든 표시본의 첫 줄에 온다".
 * 위 축 1의 표는 **슬롯 종류**를 전수하므로 머리 줄을 표본 하나로 잰다 — 그 하나는
 * `unknown`이고, `unknown`만 재면 등록된 일곱의 배선을 빠뜨려도 초록이다.
 *
 * 그래서 여기서 여덟 분류를 **각각** 부른다. 등록된 일곱은 **위조된 이름으로 프로필을
 * 등록**해서 부른다 — `toolProfiles`는 이름을 키로 하는 설정 데이터이고 게이트는 도구
 * 구현을 모르므로(§3), 게이트의 계약을 재는 데는 게이트의 입력이면 충분하다. 코어
 * 레지스트리가 그런 이름을 실제로 받는지는 이 파일이 재는 것이 아니다.
 *
 * 표본마다 재는 것 셋:
 *
 * - **드러난다** — 머리 줄에 가시 표기가 있고 원문 문자가 그 줄에 없다. 줄 수는 게이트가
 *   쓰는 줄 수 그대로다(§4 "줄 구조는 게이트가 소유한다"의 실현).
 * - **키를 무효화한다** — 위조 흔적은 "자동 허용과 학습 키를 무효화한다". 키를 내는 분류
 *   다섯(파일 셋 · 셸 · webFetch)에서 **이름만** 위조돼도 `allowAlwaysKey`가 없다.
 *   `unknown`·`memoryWrite`·`webSearch`에는 이 단언을 걸지 않는다 — 셋 다 착지 전에도
 *   키를 안 받으므로 항진이다.
 * - **자동 허용이 프롬프트로 떨어진다** — 자동 허용 둘(워크스페이스 안 `fileRead` ·
 *   `memoryWrite`)에서 판정 계층이 `policy-matrix`가 아니라 `prompt`다.
 * ======================================================================== */

/** 위조 문자를 **도구 이름에** 꽂아 부르는 표본. 등록 일곱 + 미등록 하나 */
interface HeadLineCase {
  /** §3의 여덟 분류 중 어느 것인가 — 라벨이고 게이트에 들어가지 않는다 */
  readonly kind: string;
  /** 위조 문자를 꽂아 도구 이름을 짓는다. 이름 자체가 이 표본의 주입점이다 */
  readonly name: (payload: string) => string;
  /** 그 위조된 이름으로 등록할 프로필. 생략하면 미등록 = `unknown`(fail-closed) */
  readonly profile?: GateToolProfile;
  readonly args: unknown;
  /** 게이트가 그 화면에 쓰는 줄 수 (머리 1 + 라벨 수) */
  readonly gateLines: number;
  /** 학습 키를 내는 분류인가 — 아니면 부재 단언이 항진이라 걸지 않는다 */
  readonly issuesKey: boolean;
  /** 깨끗한 이름이면 프롬프트에 안 닿는 분류인가 (자동 허용 둘) */
  readonly autoAllowed: boolean;
}

const HEAD_LINE_CASES: readonly HeadLineCase[] = [
  {
    kind: "fileRead",
    name: (p) => `read${p}file`,
    profile: { kind: "fileRead", pathParam: "path" },
    args: { path: `${WORKSPACE_ROOT}/note.txt` },
    gateLines: 2,
    issuesKey: true,
    autoAllowed: true,
  },
  {
    kind: "fileWrite",
    name: (p) => `write${p}file`,
    profile: { kind: "fileWrite", pathParam: "path" },
    args: { path: `${WORKSPACE_ROOT}/note.txt` },
    gateLines: 2,
    issuesKey: true,
    autoAllowed: false,
  },
  {
    kind: "fileEdit",
    name: (p) => `edit${p}file`,
    profile: { kind: "fileEdit", pathParam: "path" },
    args: { path: `${WORKSPACE_ROOT}/note.txt` },
    gateLines: 2,
    issuesKey: true,
    autoAllowed: false,
  },
  {
    kind: "shellExec",
    name: (p) => `sh${p}ell`,
    profile: { kind: "shellExec", commandParam: "command", cwdParam: "cwd" },
    args: { command: "ls -la", cwd: WORKSPACE_ROOT },
    gateLines: 3,
    issuesKey: true,
    autoAllowed: false,
  },
  {
    kind: "webFetch",
    name: (p) => `web${p}fetch`,
    profile: { kind: "webFetch", urlParam: "url" },
    args: { url: "https://example.com/doc" },
    gateLines: 2,
    issuesKey: true,
    autoAllowed: false,
  },
  {
    kind: "memoryWrite",
    name: (p) => `re${p}member`,
    profile: { kind: "memoryWrite", contentParam: "content" },
    args: { content: "메모 한 줄" },
    gateLines: 3,
    issuesKey: false,
    autoAllowed: true,
  },
  {
    kind: "webSearch",
    name: (p) => `web${p}search`,
    profile: { kind: "webSearch", queryParam: "query" },
    args: { query: "검색어" },
    gateLines: 2,
    issuesKey: false,
    autoAllowed: false,
  },
  {
    // 프로필을 등록하지 않는 유일한 표본 — 이름이 곧 `unknown`의 `primary`이고,
    // 그 자리에서 머리 줄 분석과 본문 분석이 **같은 하나**다(§4 "한 번만 돈다")
    kind: "unknown",
    name: (p) => `unregistered${p}tool`,
    args: {},
    gateLines: 2,
    issuesKey: false,
    autoAllowed: false,
  },
];

/** 주입 문자와 그것이 표시본에서 드러날 때의 가시 표기 */
const HEAD_PAYLOADS = [
  { label: "CR", payload: CR, marker: "<U+000D>" },
  { label: "LF", payload: LF, marker: "<U+000A>" },
  { label: "동형이의", payload: CYRILLIC_ES, marker: "U+0441" },
] as const;

async function observeHead(headCase: HeadLineCase, tool: string): Promise<Observed> {
  return headCase.profile === undefined
    ? await observe(tool, headCase.args)
    : await observe(tool, headCase.args, { extraProfiles: { [tool]: headCase.profile } });
}

describe("H 머리 줄의 도구 이름은 여덟 분류 전부에서 표시 슬롯이다 (APPROVAL-GATE §4)", () => {
  it("표본이 여덟 분류를 전부 덮고, 등록 일곱과 미등록 하나로 갈린다", () => {
    expect(HEAD_LINE_CASES).toHaveLength(8);
    expect(new Set(HEAD_LINE_CASES.map((c) => c.kind)).size).toBe(8);
    expect(HEAD_LINE_CASES.filter((c) => c.profile === undefined)).toHaveLength(1);
    // 키를 내는 다섯 · 자동 허용 둘 — §2 계층 5·6의 목록이 그대로 온다
    expect(HEAD_LINE_CASES.filter((c) => c.issuesKey)).toHaveLength(5);
    expect(HEAD_LINE_CASES.filter((c) => c.autoAllowed)).toHaveLength(2);
  });

  for (const headCase of HEAD_LINE_CASES) {
    for (const { label, payload, marker } of HEAD_PAYLOADS) {
      it(`${headCase.kind} / ${label}: 머리 줄에서 드러나고 원문이 그 줄에 안 남는다`, async () => {
        const tool = headCase.name(payload);
        const observed = await observeHead(headCase, tool);
        const displayLines = lines(observed.request.display);
        const head = displayLines[0] ?? "";
        expect(head).toContain(marker);
        expect(carriesRaw(head, payload)).toBe(false);
        expect(displayLines).toHaveLength(headCase.gateLines);
        expect(observed.request.warnings.length).toBeGreaterThan(0);
      });

      if (headCase.issuesKey) {
        it(`${headCase.kind} / ${label}: 이름만 위조돼도 학습 키가 나지 않는다`, async () => {
          const tool = headCase.name(payload);
          const observed = await observeHead(headCase, tool);
          expect(Object.hasOwn(observed.request, "allowAlwaysKey")).toBe(false);
        });

        it(`${headCase.kind} / ${label}: "항상 허용"을 눌러도 학습되지 않는다`, async () => {
          const tool = headCase.name(payload);
          const observed =
            headCase.profile === undefined
              ? await observe(tool, headCase.args, { response: "allow-always" })
              : await observe(tool, headCase.args, {
                  response: "allow-always",
                  extraProfiles: { [tool]: headCase.profile },
                });
          expect(observed.added).toEqual([]);
        });
      }

      if (headCase.autoAllowed) {
        it(`${headCase.kind} / ${label}: 자동 허용이 프롬프트로 떨어진다`, async () => {
          const tool = headCase.name(payload);
          const observed = await observeHead(headCase, tool);
          expect(observed.verdict).toEqual({ decision: "allow", layer: "prompt" });
        });
      }
    }
  }
});

/* ======================================================================== *
 * 축 2 — 여러 줄 슬롯의 꼬리 조건
 * ======================================================================== */

describe("S-2 여러 줄 슬롯은 표시본의 마지막에만 온다 (APPROVAL-GATE §4)", () => {
  it("표시본은 머리 · 라벨 · 본문으로 끝난다 — 뒤에 게이트가 쓴 줄이 없다", async () => {
    // §4: "여러 줄 슬롯 뒤에 라벨을 하나라도 붙이는 개정은 그 자리에서 위 실측 둘째를
    // 되살린다" — 그래서 이 단언은 등호다. 뒤에 무엇이 붙으면 여기가 붉어진다.
    const body = `첫 줄${LF}둘째 줄${LF}셋째 줄`;
    const request = await observeMemoryViaTaint(body);
    const head = `${MEMORY_TOOL} — 메모리 저장`;
    expect(request.display).toBe(`${head}${LF}저장할 내용:${LF}${body}`);
  });

  it("본문이 아무리 길어져도 마지막 줄은 본문의 마지막 줄이다", async () => {
    const body = Array.from({ length: 40 }, (_, index) => `줄 ${index}`).join(LF);
    const request = await observeMemoryViaTaint(body);
    expect(request.display.endsWith(`${LF}줄 39`)).toBe(true);
  });

  it("본문 안의 가짜 라벨 줄은 남는다 — 기록된 의도적 비결과다", async () => {
    // §4가 남긴 잔여를 **고정**한다. 이 단언이 붉어지면 잔여가 사라진 것이므로 좋은 방향의
    // 변화이지만, 계약 문면과 갈리므로 그때 문서를 함께 고친다.
    const request = await observeMemoryViaTaint(`메모${LF}작업 디렉터리: /evil`);
    expect(lines(request.display)).toContain("작업 디렉터리: /evil");
  });

  it("경고는 표시본 밖의 별도 필드다 — 본문이 경고 자리를 차지할 수 없다", async () => {
    // `CLI-INTERFACE.md` §9: `warnings`는 `display` 인접에 시각 강조로 표시한다.
    // 게이트가 지는 몫은 두 필드가 섞이지 않는 것이다.
    const request = await observeMemoryViaTaint(`메모${CR}뒤`);
    expect(request.warnings.length).toBeGreaterThan(0);
    for (const warning of request.warnings) {
      expect(request.display).not.toContain(warning);
    }
  });

  it("본문은 시각 강조를 위조할 수 없다 — ESC가 가시 표기로 드러난다", async () => {
    // §4의 "본문이 경고를 흉내 낼 수는 없다"가 실제로 서는 자리다. 강조는 ANSI이고,
    // ESC는 C0 제어라 매칭 축 집합에 이미 들어 있다.
    const request = await observeMemoryViaTaint(`${ESCAPE}[31m가짜 경고`);
    expect(request.display).toContain("<U+001B>");
    expect(carriesRaw(request.display, ESCAPE)).toBe(false);
  });
});

/* ======================================================================== *
 * 축 3 — 줄 수 불변
 * ======================================================================== */

describe("S-3 한 줄 슬롯만 실린 표시본의 줄 수는 입력과 무관하다 (CLI-INTERFACE §9)", () => {
  const payloads: readonly (readonly [string, string])[] = [
    ["없음", ""],
    ["LF 하나", LF],
    ["LF 셋", `${LF}${LF}${LF}`],
    ["CR 하나", CR],
    ["CRLF", `${CR}${LF}`],
    ["CRLF 다섯", `${CR}${LF}${CR}${LF}${CR}${LF}${CR}${LF}${CR}${LF}`],
    ["LF 열", LF.repeat(10)],
  ];

  for (const [label, payload] of payloads) {
    it(`셸 표시본은 언제나 세 줄이다 (${label})`, async () => {
      const observed = await observe("shell", { command: `ls${payload}la`, cwd: "/ws" });
      expect(lines(observed.request.display)).toHaveLength(3);
    });

    it(`파일 표시본은 언제나 두 줄이다 (${label})`, async () => {
      const observed = await observe("write_file", { path: `/ws/a${payload}b` });
      expect(lines(observed.request.display)).toHaveLength(2);
    });
  }

  it("표시본 어디에도 CR가 원문으로 남지 않는다 — CLI는 줄 수를 고칠 수 없다", async () => {
    const observed = await observe("shell", {
      command: `ls${CR}la`,
      cwd: `/ws${CR}x`,
    });
    expect(carriesRaw(observed.request.display, CR)).toBe(false);
  });

  it("게이트가 쓴 라벨 줄은 언제나 하나뿐이다", async () => {
    const observed = await observe("shell", {
      command: `ls${LF}작업 디렉터리: /evil`,
      cwd: "/ws",
    });
    const labelLines = lines(observed.request.display).filter((line) =>
      line.startsWith("작업 디렉터리: "),
    );
    expect(labelLines).toHaveLength(1);
  });
});

/* ======================================================================== *
 * 축 4 — 탭의 부정 단언
 * ======================================================================== */

describe("S-4 탭은 넓히지 않는다 — 기록된 의도적 비결과다 (APPROVAL-GATE §6)", () => {
  // §6 축소 행: "탭은 게이트가 소유한 줄 구조를 깨지 않고" 정렬 흉내는 공백 다수의 것과
  // 구별되지 않는다. 그래서 **가시화도 플래그도 하지 않는 것**이 계약이다.
  const tabCases: readonly (readonly [string, string, unknown])[] = [
    ["명령", "shell", { command: `ls${TAB}-la`, cwd: "/ws" }],
    ["작업 디렉터리", "shell", { command: "ls", cwd: `/ws/a${TAB}b` }],
    ["경로", "write_file", { path: `/ws/a${TAB}b` }],
    ["URL", FETCH_TOOL, { url: `https://example.com/a${TAB}b` }],
    ["질의", SEARCH_TOOL, { query: `검색${TAB}어` }],
  ];

  for (const [label, tool, args] of tabCases) {
    it(`${label}: 탭은 원문 그대로 실리고 가시 표기로 바뀌지 않는다`, async () => {
      const observed = await observe(tool, args);
      expect(observed.request.display).not.toContain("<U+0009>");
      expect(carriesRaw(observed.request.display, TAB)).toBe(true);
    });

    it(`${label}: 탭만으로는 경고가 붙지 않는다`, async () => {
      const observed = await observe(tool, args);
      const spoofWarnings = observed.request.warnings.filter((w) => w.includes("표시 위조"));
      expect(spoofWarnings).toEqual([]);
    });
  }

  it("탭이 든 명령은 학습 키를 그대로 얻는다 — 플래그가 서지 않았다는 관측값", async () => {
    const observed = await observe("shell", { command: `ls${TAB}-la`, cwd: "/ws" });
    expect(observed.request.allowAlwaysKey).toBe("shell:/ws:ls -la");
  });

  it("탭이 든 워크스페이스 안 읽기는 자동 허용 그대로다 (계층 5)", async () => {
    const verdict = await verdictOf("read_file", { path: `/ws/a${TAB}b` });
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
  });

  it("탭이 든 메모도 자동 허용 그대로다 (계층 5)", async () => {
    const verdict = await verdictOf(MEMORY_TOOL, { content: `메모${TAB}뒤` });
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
  });
});

/* ======================================================================== *
 * 축 5 — 대가와 파급 셋
 * ======================================================================== */

describe("S-5 파급 셋은 전부 안전한 방향이다 (APPROVAL-GATE §4 대가와 파급)", () => {
  it("① 워크스페이스 안 fileRead의 자동 허용이 그런 경로에서는 프롬프트로 바뀐다", async () => {
    const plain = await verdictOf("read_file", { path: "/ws/a" });
    expect(plain).toEqual({ decision: "allow", layer: "policy-matrix" });
    for (const [label, payload] of [
      ["CR", CR],
      ["LF", LF],
    ] as const) {
      const flagged = await verdictOf("read_file", { path: `/ws/a${payload}b` });
      expect(flagged, label).toEqual({ decision: "allow", layer: "prompt" });
    }
  });

  it("② memoryWrite의 자동 허용이 CR가 든 메모에서는 프롬프트로 바뀐다", async () => {
    const plain = await verdictOf(MEMORY_TOOL, { content: "평범한 메모" });
    expect(plain).toEqual({ decision: "allow", layer: "policy-matrix" });
    const withCr = await verdictOf(MEMORY_TOOL, { content: `메모${CR}뒤` });
    expect(withCr).toEqual({ decision: "allow", layer: "prompt" });
  });

  it("② 마찰의 크기 — CR를 하나라도 가진 메모는 전부 프롬프트로 간다", async () => {
    // 정본대로여도 마찰의 크기는 사실이므로 기록한다. CRLF 줄바꿈으로 들어온 여러 줄
    // 메모는 **줄 수와 무관하게 전부** 걸린다.
    const shapes: readonly (readonly [string, string])[] = [
      ["한 줄", "평범한 메모"],
      ["LF 두 줄", `첫 줄${LF}둘째 줄`],
      ["LF 열 줄", Array.from({ length: 10 }, (_, i) => `줄 ${i}`).join(LF)],
      ["CRLF 두 줄", `첫 줄${CR}${LF}둘째 줄`],
      ["CRLF 열 줄", Array.from({ length: 10 }, (_, i) => `줄 ${i}`).join(`${CR}${LF}`)],
      ["끝에 CR 하나", `평범한 메모${CR}`],
      ["탭 정렬", `이름${TAB}값${LF}둘${TAB}셋`],
    ];
    const prompted: string[] = [];
    for (const [label, content] of shapes) {
      const verdict = await verdictOf(MEMORY_TOOL, { content });
      if (verdict.decision === "allow" && verdict.layer === "prompt") prompted.push(label);
    }
    expect(prompted).toEqual(["CRLF 두 줄", "CRLF 열 줄", "끝에 CR 하나"]);
  });

  it("③ 셸 명령의 CR는 키를 얻지 못한다 — §7의 정의역 항이 여기서 닫힌다", async () => {
    // §7: 매칭용 정규화의 `canonical`이 정의역이고 그 뷰는 셸의 토큰화보다 넓다 —
    // CR가 공백으로 접혀 두 명령이 **같은 키**가 되던 자리를 표시 축이 닫는다.
    expect(normalizeForMatching(`git${CR}status`).canonical).toBe(
      normalizeForMatching("git status").canonical,
    );
    const clean = await observe("shell", { command: "git status", cwd: "/ws" });
    expect(clean.request.allowAlwaysKey).toBe("shell:/ws:git status");
    const spoofed = await observe("shell", { command: `git${CR}status`, cwd: "/ws" });
    expect(Object.hasOwn(spoofed.request, "allowAlwaysKey")).toBe(false);
  });

  it("③ 키를 못 얻은 호출은 allow-always 응답에도 allowlist를 자라게 하지 않는다", async () => {
    const observed = await observe(
      "shell",
      { command: `git${CR}status`, cwd: "/ws" },
      { response: "allow-always" },
    );
    expect(observed.added).toEqual([]);
  });

  it("새 계층도 새 출구도 늘지 않는다 — 파급은 전부 기존 프롬프트 출구다", async () => {
    const verdicts = await Promise.all([
      verdictOf("read_file", { path: `/ws/a${CR}b` }),
      verdictOf(MEMORY_TOOL, { content: `메모${CR}뒤` }),
      verdictOf("shell", { command: `git${CR}status`, cwd: "/ws" }),
    ]);
    for (const verdict of verdicts) {
      expect(verdict.decision).toBe("allow");
      if (verdict.decision === "allow") expect(verdict.layer).toBe("prompt");
    }
  });
});

/* ======================================================================== *
 * 축 6 — `cwd`의 트림 축과 명령 쪽 비대칭
 * ======================================================================== */

/** 해석 결과에 양끝 공백을 살려 돌려주는 classifier — 경로 판정기의 실물 성질이다 */
function makePaddingClassifier(pad: (path: string) => string): PathClassifier {
  return {
    resolve(input: string): { path: string; scope: PathScope } {
      const base = input === "." || input === "" ? WORKSPACE_ROOT : input;
      return { path: pad(base), scope: "inside" as PathScope };
    },
  };
}

describe("S-6 cwd의 트림 축 — 근거는 왕복이 아니라 화면 단사성이다 (APPROVAL-GATE §4)", () => {
  it("꼬리 공백이 든 작업 디렉터리에는 키를 주지 않는다", async () => {
    const observed = await observe("shell", { command: "ls", cwd: "/ws/x " });
    expect(Object.hasOwn(observed.request, "allowAlwaysKey")).toBe(false);
  });

  it("머리 공백이 든 작업 디렉터리에도 키를 주지 않는다", async () => {
    const observed = await observe(
      "shell",
      { command: "ls", cwd: "/ws/x" },
      { classifier: makePaddingClassifier((p) => ` ${p}`) },
    );
    expect(Object.hasOwn(observed.request, "allowAlwaysKey")).toBe(false);
  });

  it("트림 불변인 작업 디렉터리에는 키를 준다 — 가드가 정상 경로를 삼키지 않는다", async () => {
    const observed = await observe("shell", { command: "ls", cwd: "/ws/x" });
    expect(observed.request.allowAlwaysKey).toBe("shell:/ws/x:ls");
  });

  it("화면에서 같은 두 작업 디렉터리가 서로 다른 키를 낳지 않는다", async () => {
    // 화면 단사성: 꼬리 공백은 화면에서 보이지 않으므로 같은 화면이다. 그 화면이 키 둘을
    // 낳으면 사용자는 이유를 알 수 없는 마찰을 받는다.
    const variants = ["/ws/x", "/ws/x ", "/ws/x  "];
    const screens = new Set<string>();
    const keys = new Set<string>();
    for (const cwd of variants) {
      const observed = await observe("shell", { command: "ls", cwd });
      screens.add(
        lines(observed.request.display)
          .map((line) => line.replace(/\s+$/, ""))
          .join(LF),
      );
      const key = observed.request.allowAlwaysKey;
      if (key !== undefined) keys.add(key);
    }
    expect(screens.size).toBe(1);
    expect(keys.size).toBeLessThanOrEqual(1);
  });

  it("이 축은 명령 쪽으로 넓히지 않는다 — 양끝 공백 명령은 키를 그대로 얻는다", async () => {
    const padded = await observe("shell", { command: "  ls -la  ", cwd: "/ws" });
    expect(padded.request.allowAlwaysKey).toBe("shell:/ws:ls -la");
  });

  it("명령 쪽은 트림 차이가 같은 키로 만난다 — 물음 자체가 성립하지 않는다", async () => {
    const padded = await observe("shell", { command: " ls -la ", cwd: "/ws" });
    const plain = await observe("shell", { command: "ls -la", cwd: "/ws" });
    expect(padded.request.allowAlwaysKey).toBe(plain.request.allowAlwaysKey);
  });

  it("파일 도구 경로는 트림 축을 진다 — 정의역은 키에 원문으로 들어가는 문자열 둘이다", async () => {
    const observed = await observe(
      "write_file",
      { path: "/ws/a" },
      { classifier: makePaddingClassifier((p) => `${p} `) },
    );
    expect(Object.hasOwn(observed.request, "allowAlwaysKey")).toBe(false);
  });
});

/* ======================================================================== *
 * 축 7 — 경고 원천의 구분
 * ======================================================================== */

describe("S-7 경고는 어느 쪽에서 왔는지 갈린다 (APPROVAL-GATE §4)", () => {
  // "문면은 구현 재량이되" 갈린다는 것만 계약이므로, 단언은 문면을 고정하지 않고
  // **두 원천의 경고 집합이 서로소인가**로 잰다. 접두 문자열을 베끼면 재량이 아니게 된다.
  const spoof = (payload: string) => ({
    commandOnly: { command: `ls${payload}la`, cwd: "/ws" },
    cwdOnly: { command: "ls", cwd: `/ws/a${payload}b` },
    both: { command: `ls${payload}la`, cwd: `/ws/a${payload}b` },
  });

  for (const [label, payload] of [
    ["CR", CR],
    ["LF", LF],
    ["동형이의", CYRILLIC_ES],
  ] as const) {
    it(`${label}: 명령만 위조되면 작업 디렉터리 원천의 경고가 없다`, async () => {
      const cases = spoof(payload);
      const commandOnly = await observe("shell", cases.commandOnly);
      const cwdOnly = await observe("shell", cases.cwdOnly);
      expect(commandOnly.request.warnings.length).toBeGreaterThan(0);
      expect(cwdOnly.request.warnings.length).toBeGreaterThan(0);
      const shared = commandOnly.request.warnings.filter((w) =>
        cwdOnly.request.warnings.includes(w),
      );
      expect(shared).toEqual([]);
    });

    it(`${label}: 둘 다 위조되면 두 경고가 함께 실리고 서로 문면이 다르다`, async () => {
      const observed = await observe("shell", spoof(payload).both);
      expect(observed.request.warnings.length).toBeGreaterThanOrEqual(2);
      expect(new Set(observed.request.warnings).size).toBe(observed.request.warnings.length);
    });
  }

  it("한쪽만 위조된 화면의 경고 수는 둘 다 위조된 화면보다 적다", async () => {
    const one = await observe("shell", { command: `ls${CR}la`, cwd: "/ws" });
    const both = await observe("shell", { command: `ls${CR}la`, cwd: `/ws${CR}x` });
    expect(both.request.warnings.length).toBeGreaterThan(one.request.warnings.length);
  });
});

/* ======================================================================== *
 * F — 착지한 계약. **2026-09-09에 초록이 됐다**(`K-610`)
 *
 * 표시본의 머리 줄은 게이트가 쓰지만 그 안의 도구 이름은 호출자가 준 문자열이고,
 * 미등록 도구에서는 그것이 모델의 도구 호출에서 온다. §4의 모집단은
 * "표시본에 실리는 모든 모델 제어 문자열"인데 이 자리는 **어떤 슬롯도 타지 않았다** —
 * `analyzeDisplayText`가 그 문자열을 분석해 경고와 `spoofed`는 세우지만 이스케이프된
 * 결과는 머리 줄에 쓰이지 않았다. 그것이 `K-609` 사이클이 붉은 채로 남긴 관측이다.
 *
 * **오늘의 지위가 바뀌었다.** §4가 「머리 줄의 도구 이름도 표시본이다」 항으로 슬롯 열거의
 * 구성원을 고쳤고(수는 그대로, 미등록 도구 문면 대신 도구 이름), 배선이 그것을 따라갔다.
 * 아래 셋은 이제 **착지를 재는 단언**이므로 실패 기대 표기가 아니라 평범한 `it`이다 —
 * 되돌아가면 그냥 붉어진다.
 *
 * **「오늘 실제로 닿는가」는 판정됐다.** 코어 루프가 미등록 이름을 훅보다 앞에서 도구
 * 에러로 돌려보내는 것은 여전히 사실이지만(`packages/core/src/loop.ts`), §4의 「출처를
 * 묻지 않는 근거」 불릿이 그 사실에 기대 검사를 빼는 안을 기각했다 — 게이트가 다른
 * 패키지의 필터링에 의존하는 순간 그것이 계층 침범이고, §3의 `unknown`이 fail-closed인
 * 것 자체가 「임의의 이름이 여기 올 수 있다」를 전제한다.
 * ======================================================================== */

/**
 * **단언 강화** (2026-09-09) — 되돌림만으로는 부분 착지가 통과한다. 실패 기대 표기는 「오늘
 * 계약이 안 지켜진다」까지만 재고 *어떻게* 틀렸는지는 안 재므로, 초록으로 돌리면서
 * 「지웠다」와 「드러냈다」를 가르는 단언을 함께 세운다:
 *
 * - 줄 수만이 아니라 **가시 표기가 머리 줄에 있다**는 것 (지우기만 해도 줄 수는 맞는다)
 * - 가짜 라벨 줄이 **0줄**이라는 것
 * - 경고가 서고, 그 문면이 **같은 문자를 명령에 넣었을 때와 다르다**는 것 —
 *   §4가 `cwd`에 요구한 갈림이 머리 줄에도 걸린다(문면은 재량, 갈림만 계약)
 *
 * 분류별 커버리지는 위 H 절이 든다. 여기 셋은 `unknown` 한 분류의 정밀 단언이다.
 */

describe("F-1 표시본의 머리 줄도 게이트가 소유한 줄이다 (APPROVAL-GATE §4)", () => {
  it("도구 이름의 LF는 가시 표기로 드러나고 가짜 라벨 줄을 심지 못한다", async () => {
    // §4: "줄 구조는 게이트가 소유한다" — 모델 제어 문자열이 그 구조를 바꿀 수 있으면
    // 화면은 게이트가 쓰지 않은 것을 말한다.
    const observed = await observe(`evil${LF}작업 디렉터리: /evil`, {});
    const displayLines = lines(observed.request.display);
    expect(displayLines).toHaveLength(2);
    // **가시 표기가 머리 줄에 있다** — 지우기만 해도 줄 수는 맞으므로, 줄 수 단언 하나로는
    // 「지웠다」와 「드러냈다」가 구별되지 않는다
    expect(displayLines[0] ?? "").toContain("<U+000A>");
    expect(carriesRaw(displayLines[0] ?? "", LF)).toBe(false);
    const labelLines = displayLines.filter((line) => line.startsWith("작업 디렉터리: "));
    expect(labelLines).toHaveLength(0);
  });

  it("도구 이름의 CR도 드러난다 — 어느 슬롯에서도 정당하지 않다", async () => {
    const observed = await observe(`evil${CR}rm -rf /`, {});
    expect(observed.request.display).toContain("<U+000D>");
    expect(carriesRaw(observed.request.display, CR)).toBe(false);
    // 경고가 서고, 그 문면이 **같은 문자를 명령에 넣었을 때**의 것과 갈린다(§4 — 접두)
    expect(observed.request.warnings.length).toBeGreaterThan(0);
    const inCommand = await observe("shell", { command: `ls${CR}la`, cwd: WORKSPACE_ROOT });
    const shared = observed.request.warnings.filter((warning) =>
      inCommand.request.warnings.includes(warning),
    );
    expect(shared).toEqual([]);
  });
});

describe("F-2 머리 줄의 동형이의 문자도 표시본에서 드러난다 (APPROVAL-GATE §4)", () => {
  it("도구 이름의 키릴 글자가 가시 표기로 바뀐다", async () => {
    // §4는 위조 흔적을 "탐지해 가시 표기로 이스케이프하고" 경고에 싣는다고 적는다.
    // 경고만 실리면 사용자는 여전히 두 글자를 눈으로 구분할 수 없다.
    const observed = await observe(`${CYRILLIC_ES}url_tool`, {});
    expect(observed.request.warnings.join(" ")).toContain("U+0441");
    expect(observed.request.display).toContain("U+0441");
    expect(carriesRaw(observed.request.display, CYRILLIC_ES)).toBe(false);
    // 같은 글자를 **명령**에 넣었을 때와 경고 문면이 갈린다 — 사용자가 무엇을 다시 봐야
    // 하는지가 화면에서 정해져야 한다(§4). 접두 문면 자체는 베끼지 않는다(재량이다)
    const inCommand = await observe("shell", {
      command: `ls ${CYRILLIC_ES}x`,
      cwd: WORKSPACE_ROOT,
    });
    const shared = observed.request.warnings.filter((warning) =>
      inCommand.request.warnings.includes(warning),
    );
    expect(shared).toEqual([]);
  });
});
