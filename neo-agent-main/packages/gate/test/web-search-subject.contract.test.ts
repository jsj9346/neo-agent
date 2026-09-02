/**
 * `webSearch` 분류 계약 (T-011).
 *
 * 기대값의 출처는 정본 설계 문서뿐이다 — 구현 소스를 인용하지 않는다:
 * - `docs/APPROVAL-GATE.md` §3 `webSearch` 분류 절(불릿 여덟)이 유일한 정본이고,
 * - 보조로 §2(판정 계층)·§4(표시 위조 탐지·공개 인터페이스)를 쓴다.
 * - 도구 이름·인자 이름·질의 상한(400자)·프로필이 사는 테이블은
 *   `docs/WEB-ACCESS.md` §3.2·§6이 든다.
 *
 * 불릿 여덟과 이 파일의 대응(계약 번호가 곧 불릿이다):
 *   1 subject에 인자 필드가 없다            → 계약 1
 *   2 `allowAlwaysKey`를 주지 않는다        → 계약 2
 *   3 정책 매트릭스 무변경                   → 계약 3
 *   4 `primary`는 도구 이름이다              → 계약 4
 *   5 표시 위조 탐지는 질의에 돈다            → 계약 6
 *   6 `query` 판독 실패의 처리               → 계약 7
 *   7 표시 라벨과 본문                       → 계약 5
 *   8 오염 런에서 추가로 하는 일이 없다        → 계약 8
 * 계약 9는 위 여덟이 전제하는 등록·fail-closed의 회귀 방지다.
 *
 * ---
 *
 * **판정 목록 (T-011 독립 QA, 2026-09-02).** 계약 항목 10개(불릿 8 + 두 유니온 갈래)
 * 전부를 대조했다. 등급별로 — 계약 위반 0 · 문서 부정확 0 · 미규정 2.
 *
 * - **[미규정 S-1]** 빈 문자열 질의. `query: ""`는 문자열로 읽히므로 §3 불릿 6의
 *   판독 실패가 아니고, 그때의 표시를 어느 절도 정하지 않는다. 실물은 판독 실패와
 *   **구분되지 않는다**(둘 다 본문 `질의: `, 다른 것은 경고 유무뿐).
 *   재현: `query`에 `""`를 넘겨 `display`·`warnings`를 본다.
 * - **[미규정 S-2]** 판독 실패 시 「표시 본문을 비운다」의 대상. §3 불릿 6의 괄호는
 *   그것을 표시 **값**으로 읽고(그 읽기에서 실물은 적합), 불릿 7은 `질의: <query>`
 *   **한 줄**을 본문이라 부른다(그 읽기에서는 줄이 남으므로 부적합). 실물은 전자를
 *   택했고 그 선택을 `src/display.ts`의 `[미규정]` 주석이 이미 든다 — 다만
 *   `memoryWrite`가 같은 자리에서 택한 규약(본문이 없을 때 괄호 문구로 사정을 적는다)과
 *   갈린다. 재현: `query`에 `42`를 넘기면 표시본이 `질의: ` 한 줄로 남는다.
 *
 * **관측할 수 없어 축이 서지 않는 항 하나** — §3 불릿 6 말미의 「`flagged`는 세우지
 * 않는다」. 이 분류에는 플래그가 지울 자동 허용도 학습 키도 없어 세우든 말든 공개
 * 표면의 어떤 값도 달라지지 않는다(그것이 그 항의 근거이기도 하다). 그래서 아래
 * 「판독 실패가 판정을 바꾸지 않는다」가 재는 것은 플래그의 부재가 아니라 그 귀결이다.
 *
 * **이 축들은 역검증을 통과했다.** 구현 사본에 위반 여덟을 하나씩 심고(subject에 인자
 * 필드 · `allowAlwaysKey` 부여 · 매트릭스 자동 허용 · `primary`를 질의로 · 본문 두 줄 ·
 * 질의 위조 탐지 제거 · 판독 실패를 `unknown`으로 · 오염 사전 고지 부여) 각각이
 * 의도한 축을 붉히는 것을 확인했다. 사본은 검증 후 삭제했고 `src/`는 건드리지 않았다.
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
import { escapeInvisibles } from "../src/display.ts";
import { createApprovalGate } from "../src/hook.ts";
import { MEMORY_TAINT_REFUSAL_WARNING, TAINT_WARNING } from "../src/pipeline.ts";
import type { ApprovalRequest, GateSubject, GateToolProfile } from "../src/types.ts";
import { asBlock, buildConfig, makePermissiveAllowlist, run } from "./contract-helpers.ts";
import { ch, makeAllowlist, makePrompt, PROFILES } from "./helpers.ts";
import { makeRecordingClassifier } from "./memory-write-helpers.ts";

// ---------------------------------------------------------------------------
// 정본에서 읽은 상수 — 구현에서 읽지 않는다
// ---------------------------------------------------------------------------

/** `WEB-ACCESS.md` §3.2 「등록」·§6 — 검색 도구의 이름 */
const SEARCH_TOOL = "web_search";

/** `WEB-ACCESS.md` §3.2 — 파라미터는 `query` 하나다 */
const QUERY_PARAM = "query";

/** `WEB-ACCESS.md` §3.2 — `query`의 상수 상한. 게이트의 표시 상한(4096) 아래다 */
const QUERY_MAX = 400;

/**
 * `packages/web`이 export할 `WEB_TOOL_GATE_PROFILES`의 두 번째 엔트리
 * (`WEB-ACCESS.md` §6 「프로필이 사는 자리」). 게이트는 `packages/web`을 임포트하지
 * 않으므로(`APPROVAL-GATE.md` §1) 테스트도 형태로만 만난다 — 프로필은 설정 데이터다.
 *
 * **캐스팅을 쓰지 않는다.** `APPROVAL-GATE.md` §3이 `GateToolProfile`에 갈래
 * `{ kind: "webSearch"; queryParam: string }`을 더했다고 선언했으므로, 타입이
 * 그것을 담지 못하면 타입체크가 그 자리에서 붉어져야 한다.
 */
const WEB_SEARCH_PROFILE: GateToolProfile = { kind: "webSearch", queryParam: QUERY_PARAM };

const PROFILES_WITH_SEARCH: Record<string, GateToolProfile> = {
  ...PROFILES,
  [SEARCH_TOOL]: WEB_SEARCH_PROFILE,
};

/**
 * 인자 이름을 일부러 다르게 준 프로필. `queryParam`이 설정인지, 아니면 게이트가
 * `"query"`를 상수로 알고 있는지를 가르는 유일한 관측 수단이다 — 후자면 §3 머리의
 * 규율(게이트는 도구 구현을 모른다)이 거짓이 된다.
 */
const CUSTOM_TOOL = "find_web";
const CUSTOM_QUERY_PARAM = "q";
const PROFILES_WITH_CUSTOM_SEARCH: Record<string, GateToolProfile> = {
  ...PROFILES,
  [CUSTOM_TOOL]: { kind: "webSearch", queryParam: CUSTOM_QUERY_PARAM },
};

const PLAIN_QUERY = "승인 게이트 설계 사례";

/** 비가시 문자를 소스에 리터럴로 박지 않는다 — 무엇을 검사하는지 보여야 한다 */
const ZWSP = ch(0x200b);
/** 키릴 소문자 에스 — 라틴 `c`와 동형이의 */
const CYRILLIC_ES = ch(0x0441);

// ---------------------------------------------------------------------------
// 조립기
// ---------------------------------------------------------------------------

/**
 * 기본값을 두지 않는다 — `undefined`를 넘기는 것이 이 파일의 검사 대상 중 하나라
 * 기본값이 있으면 그 경우가 조용히 정상 질의로 바뀐다(초판이 실제로 그렇게 새
 * 두 축을 무력화했다).
 */
function searchArgs(query: unknown): Record<string, unknown> {
  return { [QUERY_PARAM]: query };
}

function plainArgs(): Record<string, unknown> {
  return searchArgs(PLAIN_QUERY);
}

type Overrides = Parameters<typeof run>[0];

/** `evaluate` 직행 — 판정 **계층**이 보이는 유일한 경로다(hook은 `layer`를 떨군다) */
async function runSearch(overrides: Overrides, args: unknown, toolName = SEARCH_TOOL) {
  return await run({ toolProfiles: { ...PROFILES_WITH_SEARCH }, ...overrides }, toolName, args);
}

/** `webSearch`는 매번 승인이므로 프롬프트가 곧 기본 관측 지점이다 */
async function ask(args: unknown, response: "allow-once" | "allow-always" | "deny" = "allow-once") {
  const prompt = makePrompt({ response });
  const allowlist = makeAllowlist();
  const verdict = await runSearch({ prompt, allowlist }, args);
  return { verdict, prompt, allowlist };
}

function requestOf(request: ApprovalRequest | undefined): ApprovalRequest {
  if (request === undefined) throw new Error("프롬프트가 호출되지 않았다");
  return request;
}

function subjectOf(request: ApprovalRequest | undefined): GateSubject {
  return requestOf(request).subject;
}

/**
 * 표시본의 머리 줄(도구 이름 + 라벨)과 본문 줄을 가른다.
 * 꼬리의 빈 줄은 본문으로 세지 않는다 — 계약이 정한 것은 본문의 내용이지
 * 문자열 끝의 개행 유무가 아니다.
 */
function splitDisplay(display: string): { head: string; body: readonly string[] } {
  const lines = display.split("\n");
  const head = lines[0] ?? "";
  const body = lines.slice(1);
  while (body.length > 0 && (body[body.length - 1] ?? "").trim() === "") body.pop();
  return { head, body };
}

/** 실제 미등록 도구의 표시본 — `unknown`의 거짓 사유를 문면 고정 없이 잡기 위한 대조군 */
async function unknownDisplay(): Promise<string> {
  const prompt = makePrompt({ response: "allow-once" });
  await runSearch({ prompt }, plainArgs(), "totally_unregistered");
  return requestOf(prompt.last).display;
}

// ---------------------------------------------------------------------------
// 계약 1 — subject에 인자 필드가 없다 (§3 불릿 1)
// ---------------------------------------------------------------------------

describe('계약 1 — subject는 `{ kind: "webSearch" }` 하나이고 질의를 읽지 않는다', () => {
  it("판정 대상은 이 도구가 불렸다는 사실 하나다 — 필드가 더 붙지 않는다", async () => {
    // §3: 학습 키의 정의역이 원소 하나라 게이트가 질의에서 판정할 것이 없다
    const { prompt } = await ask(plainArgs());
    expect(subjectOf(prompt.last)).toEqual({ kind: "webSearch" });
    expect(Object.keys(subjectOf(prompt.last))).toEqual(["kind"]);
  });

  it("`queryParam`은 프로필에만 있고 subject로 새지 않는다 — 표시 전용이다", async () => {
    const { prompt } = await ask(plainArgs());
    const subject = subjectOf(prompt.last) as Record<string, unknown>;
    expect(subject["query"]).toBeUndefined();
    expect(subject["origin"]).toBeUndefined();
  });

  it("인자에 `path`·`url`·`cwd`·`command`를 심어도 subject에 나타나지 않는다", async () => {
    // 게이트가 인자를 판정 축으로 삼는 순간 이 도구는 파일/웹 분류로 새고,
    // 경로로 환원되면 계층 0(denied)에 걸려 항상 block된다
    const { prompt } = await ask({
      [QUERY_PARAM]: PLAIN_QUERY,
      path: "/etc/passwd",
      url: "https://evil.example/x",
      cwd: "/",
      command: "rm -rf /",
    });
    expect(subjectOf(prompt.last)).toEqual({ kind: "webSearch" });
  });

  it("`scope` 판정이 없다 — 경로 판정기의 관할이 아니다", async () => {
    // §3: *"게이트가 읽을 수 있는 판정 축이 그 도구에 존재하지 않을 때 축을 발명하지 않는다"*
    const { prompt } = await ask(plainArgs());
    expect(subjectOf(prompt.last)).not.toHaveProperty("scope");
  });

  it("경로 판정기(classifier)에 아무것도 묻지 않는다", async () => {
    const classifier = makeRecordingClassifier();
    await runSearch({ classifier }, plainArgs());
    expect(classifier.seen).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 계약 2 — `allowAlwaysKey`를 주지 않는다 (§3 불릿 2)
// ---------------------------------------------------------------------------

describe("계약 2 — `allowAlwaysKey`가 없다", () => {
  it('프롬프트의 `allowAlwaysKey`가 `undefined`다 — "항상 허용" 선택지가 서지 않는다', async () => {
    // §3: 학습해도 방어가 안 늘어서 키를 주지 않는다
    // (`memoryWrite`가 키를 안 받는 것과 기계는 같고 근거가 다르다 — *"학습해도 방어가 안 늘어서"*)
    const { prompt } = await ask(plainArgs());
    expect(requestOf(prompt.last).allowAlwaysKey).toBeUndefined();
  });

  it("`allow-always`로 응답해도 allowlist가 자라지 않는다", async () => {
    const { allowlist } = await ask(plainArgs(), "allow-always");
    expect(allowlist.added).toEqual([]);
  });

  it("무엇이든 학습됐다고 답하는 allowlist를 끼워도 계층 6으로 새지 않는다", async () => {
    // 키가 없으면 조회할 것도 없다. 여기서 `layer: "allowlist"`가 나오면
    // 첫 승인이 그 뒤 모든 질의를 무승인으로 통과시킨다는 뜻이다
    const allowlist = makePermissiveAllowlist();
    const verdict = await runSearch(
      { allowlist, prompt: makePrompt({ response: "allow-once" }) },
      plainArgs(),
    );
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(allowlist.queried).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 계약 3 — 정책 매트릭스 무변경: 매번 승인 (§3 불릿 3)
// ---------------------------------------------------------------------------

describe("계약 3 — 자동 허용 대상이 아니다 (매번 승인)", () => {
  it("모드 `manual`에서 `layer`는 `prompt`다 — 매트릭스로 통과하지 않는다", async () => {
    const { verdict, prompt } = await ask(plainArgs());
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("어떤 질의도 `policy-matrix`로 통과하지 않는다", async () => {
    for (const query of [PLAIN_QUERY, "", "a", "날씨", "site:example.com 문서"]) {
      const verdict = await runSearch(
        { prompt: makePrompt({ response: "allow-once" }) },
        searchArgs(query),
      );
      expect(verdict, query).not.toMatchObject({ layer: "policy-matrix" });
    }
  });

  it("한 번 승인해도 다음 호출이 또 프롬프트다 — 학습이 성립하지 않는다", async () => {
    // 매번 승인이 계약이므로, 같은 allowlist를 이어 써도 둘째 호출이 계층 7에서 나가야 한다
    const allowlist = makeAllowlist();
    const first = makePrompt({ response: "allow-always" });
    await runSearch({ allowlist, prompt: first }, searchArgs("첫 질의"));

    const second = makePrompt({ response: "allow-once" });
    const verdict = await runSearch({ allowlist, prompt: second }, searchArgs("둘째 질의"));
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(second.calls).toHaveLength(1);
  });

  it('`mode: "off"`에서는 계층 3에서 나간다 — 자동 허용보다 앞이라는 위치가 계약이다', async () => {
    // §2 계층 3. `webSearch` 등록이 앞선 계층의 위치를 흔들지 않는다는 회귀 방지
    const verdict = await runSearch({ mode: "off" }, plainArgs());
    expect(verdict).toEqual({ decision: "allow", layer: "mode-off" });
  });
});

// ---------------------------------------------------------------------------
// 계약 4 — `primary`는 도구 이름이고 질의는 매칭 대상이 아니다 (§3 불릿 4)
// ---------------------------------------------------------------------------

describe("계약 4 — 질의는 deny 규칙·위험 패턴의 매칭 대상이 아니다", () => {
  const ENV_QUERY = ".env 관리법";
  const CREDENTIAL_QUERY = "~/.ssh/id_rsa 백업 방법";

  it("사용자가 경로를 겨냥해 쓴 deny 규칙이 질의를 막지 않는다", async () => {
    // §3: 그런 규칙이 질의에 걸리면 계층 2에서 우회 불가로 차단되고,
    // 계층 2는 모드보다 앞이라 `off`로도 안 풀린다 — 그것이 금지된 결과다
    for (const rule of ["*.env*", "**.env**", "**id_rsa**", "**자격증명**"]) {
      const verdict = await runSearch(
        { denyRules: [rule], prompt: makePrompt({ response: "allow-once" }) },
        searchArgs(`${ENV_QUERY} 그리고 ${CREDENTIAL_QUERY}`),
      );
      expect(verdict, `deny 규칙 ${rule}이 질의에 걸렸다`).toEqual({
        decision: "allow",
        layer: "prompt",
      });
    }
  });

  it("크리덴셜 경로를 언급만 한 질의에 위험 패턴 경고가 붙지 않는다", async () => {
    // §3: 위험 패턴은 그 경로에 접촉하는 명령을 잡으라고 만든 것이지
    // 그것을 말하는 문장을 잡으라고 만든 것이 아니다
    for (const query of [
      CREDENTIAL_QUERY,
      "sudo rm -rf / 를 실행하면 어떻게 되나",
      "~/.aws/credentials 위치",
    ]) {
      const { prompt } = await ask(searchArgs(query));
      const warnings = requestOf(prompt.last).warnings;
      expect(
        warnings.filter((w) => w.startsWith("위험 패턴(")),
        query,
      ).toEqual([]);
    }
  });

  it("deny 규칙 `web_search`는 도구 자체를 막는다 — 의도된 부수 귀결이다", async () => {
    const verdict = await runSearch({ denyRules: [SEARCH_TOOL] }, plainArgs());
    expect(asBlock(verdict).layer).toBe("deny-rule");
  });

  it('도구 이름 deny 규칙은 `mode: "off"`로도 풀리지 않는다 — 계층 2가 모드보다 앞이다', async () => {
    const verdict = await runSearch({ denyRules: [SEARCH_TOOL], mode: "off" }, plainArgs());
    expect(asBlock(verdict).layer).toBe("deny-rule");
  });
});

// ---------------------------------------------------------------------------
// 계약 5 — 표시 라벨 하나와 본문 한 줄 (§3 불릿 7)
// ---------------------------------------------------------------------------

describe("계약 5 — 표시 라벨과 본문", () => {
  it("본문은 `질의: <query>` 한 줄이다", async () => {
    // §3: 본문은 `질의: <query>` 한 줄이다. `memoryWrite`처럼 다음 줄부터
    // 내리지 않는 이유는 질의가 400자 상한의 단문이라서다
    const { prompt } = await ask(plainArgs());
    const { body } = splitDisplay(requestOf(prompt.last).display);
    expect(body).toEqual([`질의: ${PLAIN_QUERY}`]);
  });

  it("머리 줄이 도구 이름과 라벨을 함께 보인다", async () => {
    const { prompt } = await ask(plainArgs());
    const { head } = splitDisplay(requestOf(prompt.last).display);
    expect(head.startsWith(SEARCH_TOOL)).toBe(true);
    expect(head.length).toBeGreaterThan(SEARCH_TOOL.length);
  });

  it("라벨이 미등록 도구의 것과 다르다 — 거짓 사유를 보이지 않는다", async () => {
    const { prompt } = await ask(plainArgs());
    const { head } = splitDisplay(requestOf(prompt.last).display);
    const { head: unknownHead } = splitDisplay(await unknownDisplay());
    expect(head).not.toBe(unknownHead);
  });

  it("어느 인자를 읽을지는 프로필이 정한다 — 게이트는 인자 이름을 모른다", async () => {
    // §6(`WEB-ACCESS.md`)의 `queryParam`은 `contentParam`과 같은 자리다 —
    // 필드를 빼면 게이트가 `"query"`라는 인자 이름을 스스로 알아야 한다
    const body = "프로필이 가리키는 인자의 값";
    const prompt = makePrompt({ response: "allow-once" });
    await run({ toolProfiles: { ...PROFILES_WITH_CUSTOM_SEARCH }, prompt }, CUSTOM_TOOL, {
      [CUSTOM_QUERY_PARAM]: body,
      // 게이트가 `"query"`를 상수로 알고 있으면 이쪽이 표시되고 테스트가 깨진다
      [QUERY_PARAM]: "게이트가 상수로 알면 안 되는 값",
    });
    const display = requestOf(prompt.last).display;
    expect(display).toContain(body);
    expect(display).not.toContain("게이트가 상수로 알면 안 되는 값");
  });

  it("프로필이 가리키지 않은 인자는 표시되지 않는다", async () => {
    const { prompt } = await ask({
      [QUERY_PARAM]: PLAIN_QUERY,
      note: "프로필이 가리키지 않는 인자",
    });
    const display = requestOf(prompt.last).display;
    expect(display).toContain(PLAIN_QUERY);
    expect(display).not.toContain("프로필이 가리키지 않는 인자");
  });
});

// ---------------------------------------------------------------------------
// 계약 6 — 표시 위조 탐지는 질의에 돈다 (§3 불릿 5)
// ---------------------------------------------------------------------------

describe("계약 6 — 위조 탐지가 질의에 돈다", () => {
  it("비가시 문자가 가시 표기로 드러나고 원문은 남지 않는다", async () => {
    // §3: 비가시·동형이의 문자가 섞이면 사용자가 승인한 문자열과 실제로 나가는
    // 문자열이 갈리고, *"승인 화면은 질의 문자열 전체를 보인다"*가 그 순간 거짓이 된다
    const spoofed = `환경${ZWSP}변수 유출 사례`;
    const { prompt } = await ask(searchArgs(spoofed));
    const display = requestOf(prompt.last).display;
    expect(display).not.toContain(ZWSP);
    expect(display).toContain(escapeInvisibles(spoofed));
  });

  it("위조 흔적이 경고로 프롬프트에 실린다", async () => {
    // §3: 여기엔 무효화할 것이 없으므로 남는 효과는 *"경고가 프롬프트에 함께 실리는 것"*뿐이다
    const control = await ask(searchArgs("환경 변수 유출 사례"));
    expect(requestOf(control.prompt.last).warnings).toEqual([]);

    const spoofed = await ask(searchArgs(`환경${ZWSP}변수 유출 사례`));
    expect(requestOf(spoofed.prompt.last).warnings.length).toBeGreaterThan(0);
  });

  it("동형이의 문자도 경고로 실린다", async () => {
    const { prompt } = await ask(searchArgs(`${CYRILLIC_ES}url 사용법`));
    expect(requestOf(prompt.last).warnings.length).toBeGreaterThan(0);
  });

  it("위조가 있어도 판정과 학습 키는 그대로다 — 무효화할 것이 없다", async () => {
    // §3: 저쪽에서는 위조 흔적이 자동 허용을 무효화하지만 여기엔 무효화할 것이 없다.
    // 즉 위조 유무가 판정을 가르면 안 된다 — 양쪽 다 계층 7이다
    const clean = await runSearch(
      { prompt: makePrompt({ response: "allow-once" }) },
      searchArgs("정직한 질의"),
    );
    const dirty = await ask(searchArgs(`정직하지${ZWSP}않은 질의`), "allow-always");
    expect(clean).toEqual({ decision: "allow", layer: "prompt" });
    expect(dirty.verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(requestOf(dirty.prompt.last).allowAlwaysKey).toBeUndefined();
    expect(dirty.allowlist.added).toEqual([]);
  });

  it("상한(400자) 질의에서 표시 잘림 경고가 뜨지 않는다", async () => {
    // §3: *"표시 잘림 경고는 구조적으로 뜨지 않는다"* — `WEB-ACCESS.md` §3.2가
    // `query` 상한을 400자로 두고 게이트의 표시 상한은 4096자다
    const query = "검색 질의 상한 실측 ".repeat(40).slice(0, QUERY_MAX);
    expect(query).toHaveLength(QUERY_MAX);

    const { prompt } = await ask(searchArgs(query));
    const request = requestOf(prompt.last);
    expect(request.display).toContain(query);
    expect(request.warnings).toEqual([]);
  });

  it("게이트 표시 상한을 넘는 질의에서는 기존 잘림 경고가 뜬다 — 조용한 실패가 아니다", async () => {
    // §3.2(`WEB-ACCESS.md`): 게이트 상한이 400 아래로 내려가는 날 뜨는 것은
    // 조용한 실패가 아니라 기존 잘림 경고다. 게이트는 도구의 상한을 모르므로
    // 상한을 넘는 질의가 도달하는 경로 자체는 열려 있다
    const query = "가".repeat(9000);
    const { prompt } = await ask(searchArgs(query));
    const request = requestOf(prompt.last);
    if (!request.display.includes(query)) {
      expect(request.warnings.length, "표시가 잘렸는데 잘렸다는 경고가 없다").toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 계약 7 — `query` 판독 실패 (§3 불릿 6)
// ---------------------------------------------------------------------------

describe("계약 7 — `query`를 문자열로 읽지 못해도 `unknown`으로 떨어뜨리지 않는다", () => {
  const UNREADABLE: readonly unknown[] = [42, null, undefined, { nested: "x" }, ["a"], true];

  it("분류가 `webSearch`로 유지된다", async () => {
    for (const bad of UNREADABLE) {
      const { prompt } = await ask(searchArgs(bad));
      expect(subjectOf(prompt.last), `query=${JSON.stringify(bad)}`).toEqual({ kind: "webSearch" });
    }
  });

  it("인자 객체 자체가 없거나 객체가 아니어도 같다", async () => {
    for (const args of [{}, undefined, null, "문자열", 7]) {
      const { prompt, verdict } = await ask(args);
      expect(subjectOf(prompt.last), `args=${JSON.stringify(args)}`).toEqual({ kind: "webSearch" });
      expect(verdict.layer, `args=${JSON.stringify(args)}`).toBe("prompt");
    }
  });

  it("[미규정 S-2] 표시 본문을 비운다 — 「본문」이 값인가 줄인가", async () => {
    // §3은 *"표시 본문을 비우고"*를 요구하면서 그 낱말을 두 자리에서 다르게 쓴다.
    //  (가) 불릿 6의 괄호가 든 기계 — 비우지 않으면 `primary`가 흘러 들어간다 —
    //       는 「본문」을 표시 **값**으로 읽는다. 값을 비우면 계약이 지켜진다.
    //  (나) 불릿 7은 본문을 `질의: <query>` **한 줄**이라 부른다. 그 읽기에서는
    //       줄 자체가 사라져야 비운 것이다.
    // 어느 쪽인지 정본이 정하지 않았고, `memoryWrite`가 같은 자리에서 택한 규약
    // (본문이 없을 때 그 사정을 괄호 문구로 적는다)과도 갈린다 — 판정 필요.
    //
    // **금지된 결과 둘만 잰다**: ① 도구 이름이 질의인 것처럼 보이는 것(§3이 이름을
    // 댄 위조), ② 읽지 못한 인자의 값이 질의인 것처럼 화면에 서는 것
    for (const bad of UNREADABLE) {
      const label = `query=${JSON.stringify(bad)}`;
      const { prompt } = await ask(searchArgs(bad));
      const display = requestOf(prompt.last).display;
      expect(display, label).not.toContain(`질의: ${SEARCH_TOOL}`);
      expect(display, label).not.toContain(`질의: ${String(bad)}`);
    }
  });

  it("읽지 못했다는 사정이 `warnings`에 실린다", async () => {
    for (const bad of UNREADABLE) {
      const { prompt } = await ask(searchArgs(bad));
      expect(
        requestOf(prompt.last).warnings.length,
        `query=${JSON.stringify(bad)}`,
      ).toBeGreaterThan(0);
    }
  });

  it("`unknown`의 거짓 사유가 화면에 뜨지 않는다", async () => {
    // §3: `unknown`의 `display`는 게이트 프로필에 등록되지 않았다는 거짓 사유를
    // 보이고, 승인 화면이 거짓말하면 게이트 전체가 무의미하다.
    // 문면을 고정하지 않고 실제 미등록 도구의 표시본과 대조한다
    const { body: unknownBody } = splitDisplay(await unknownDisplay());
    expect(unknownBody.length, "대조군이 비면 이 축이 무의미해진다").toBeGreaterThan(0);

    const { prompt } = await ask(searchArgs(42));
    const display = requestOf(prompt.last).display;
    for (const line of unknownBody) {
      expect(display, `미등록 도구의 사유가 그대로 실렸다: ${line}`).not.toContain(line);
    }
  });

  it("판독 실패에도 `allowAlwaysKey`는 없다", async () => {
    const { prompt, allowlist } = await ask(searchArgs(42), "allow-always");
    expect(requestOf(prompt.last).allowAlwaysKey).toBeUndefined();
    expect(allowlist.added).toEqual([]);
  });

  it("판독 실패가 판정을 바꾸지 않는다 — 세울 플래그가 없다", async () => {
    // §3: 이 분류에는 자동 허용도 학습 키도 없어서 플래그가 아무것도 바꾸지 않는다.
    // 그래서 관측 가능한 계약은 정상 질의와 판독 실패의 판정이 같다는 것이다
    const readable = await runSearch(
      { prompt: makePrompt({ response: "allow-once" }) },
      plainArgs(),
    );
    const unreadable = await runSearch(
      { prompt: makePrompt({ response: "allow-once" }) },
      searchArgs(42),
    );
    expect(unreadable).toEqual(readable);
  });
});

// ---------------------------------------------------------------------------
// 계약 8 — 오염 런에서 추가로 하는 일이 없다 (§3 불릿 8)
// ---------------------------------------------------------------------------

describe("계약 8 — 오염 런에서 추가로 하는 일이 없다", () => {
  async function taintedCall(args: unknown = plainArgs()) {
    const prompt = makePrompt({ response: "allow-once" });
    const gate = createApprovalGate(
      buildConfig({ toolProfiles: { ...PROFILES_WITH_SEARCH }, prompt }),
    );
    gate.noteToolResult({ source: "network" });
    const decision = await gate.beforeToolCall(
      { toolCallId: "call-1", toolName: SEARCH_TOOL, args },
      new AbortController().signal,
    );
    return { decision, prompt };
  }

  it("판정이 무오염과 같다 — 이미 매번 승인이라 밀려날 계층이 없다", async () => {
    // §3: *"오염 런에서 추가로 하는 일이 없다"* — 오염 플래그가 하는 일
    // (자동 허용·키 무효화)은 이 분류에 처음부터 없다
    const clean = await runSearch({ prompt: makePrompt({ response: "allow-once" }) }, plainArgs());
    expect(clean).toEqual({ decision: "allow", layer: "prompt" });

    const { decision, prompt } = await taintedCall();
    expect(decision).toEqual({ decision: "allow" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("계층 4b의 기존 오염 경고가 함께 실린다", async () => {
    const { prompt } = await taintedCall();
    expect(requestOf(prompt.last).warnings).toContain(TAINT_WARNING);
  });

  it("`memoryWrite`가 받는 사전 고지에 대응하는 것은 없다", async () => {
    // §3: 검색은 오염 런에서 거부되지 않는다. 그 문장을 실으면 승인 화면이 거짓말한다
    const { prompt } = await taintedCall();
    expect(requestOf(prompt.last).warnings).not.toContain(MEMORY_TAINT_REFUSAL_WARNING);
  });

  it("오염 런에서도 `allowAlwaysKey`는 없다", async () => {
    const { prompt } = await taintedCall();
    expect(requestOf(prompt.last).allowAlwaysKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 계약 9 — 등록과 fail-closed (회귀 방지)
// ---------------------------------------------------------------------------

describe("계약 9 — 등록·프로필 형태·격리", () => {
  it("프로필 형태는 `{ kind, queryParam }`이다", () => {
    // `WEB-ACCESS.md` §6 — 테이블은 설정 데이터라 형태 자체가 계약이다
    expect(WEB_SEARCH_PROFILE).toEqual({ kind: "webSearch", queryParam: QUERY_PARAM });
  });

  it("등록하지 않으면 `unknown`으로 fail-closed다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ toolProfiles: { ...PROFILES }, prompt }, SEARCH_TOOL, plainArgs());
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(subjectOf(prompt.last)).toEqual({ kind: "unknown", toolName: SEARCH_TOOL });
  });

  it("`webSearch` 등록이 다른 도구의 판정을 바꾸지 않는다", async () => {
    const inside = await runSearch({}, { path: "src/a.ts" }, "read_file");
    expect(inside).toEqual({ decision: "allow", layer: "policy-matrix" });

    const write = await runSearch(
      { prompt: makePrompt({ response: "deny" }) },
      { path: "src/a.ts" },
      "write_file",
    );
    expect(asBlock(write).layer).toBe("prompt");
  });
});

// ---------------------------------------------------------------------------
// 미규정 — 판정 중립
// ---------------------------------------------------------------------------

describe("미규정 — 판정 중립", () => {
  it("[미규정 S-1] 빈 문자열 질의를 판독 성공으로 볼 것인가", async () => {
    // §3은 *"`query`를 문자열로 읽지 못하면"*의 처리를 정하지만 빈 문자열은
    // 문자열로 읽힌다. 본문을 `질의: `로 낼 것인지 판독 실패처럼 비울 것인지는
    // 어느 절도 정하지 않는다.
    //
    // **금지된 결과**는 하나다 — 승인 화면이 도구 이름을 질의인 것처럼 보이는 것
    const { prompt, verdict } = await ask(searchArgs(""));
    expect(verdict.layer).toBe("prompt");
    expect(requestOf(prompt.last).display).not.toContain(`질의: ${SEARCH_TOOL}`);
  });
});
