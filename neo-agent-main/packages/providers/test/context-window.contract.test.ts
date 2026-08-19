/**
 * QA-A (T-010) — `contextWindowForModel` 공개 표면의 계약 검증. (T-003)
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.**
 *
 *   - `docs/COMPACTION.md` §8 표 — "어댑터가 모델의 `contextWindowTokens`를 노출(구체 타입 표면
 *                               — `ModelClient` 계약은 불변). 미지 모델은 보수 기본값 +
 *                               기동 시 경고"
 *                               (그 행의 **정본은 `docs/PROVIDERS.md` §3**이다 — 2026-08-14
 *                               이관. 표 행의 문면은 그대로이므로 위 인용은 유효하다)
 *   - `docs/COMPACTION.md` §3 — 이 값의 소비 지점: `contextTokens > contextWindowTokens × threshold`
 *   - `docs/PROVIDERS.md` §3 — "**`ModelClient` 인터페이스에 `contextWindow`를 넣지 않는다.**
 *                               코어는 컨텍스트 크기를 소비하지 않는다" · "소비자(CLI→compaction)가
 *                               composition root에서 이 구체 표면을 읽으면 충분하다"
 *                               (2026-08-14까지 이 근거는 `docs/COMPACTION.md` §8 각주에
 *                               있었다 — 앵커 `31abb2a`)
 *   - `docs/COMPACTION.md` §10 — E-12 **2026-08-06 승인**: 미지 모델 보수 기본값 = 200,000
 *                               (§10 해소 표시. 그 전까지 "수치는 구현 시 확정"의 미결이었다)
 *
 * **그래도 이 파일은 수치를 단언하지 않는다** — 이유가 바뀌었을 뿐 결론은 같다. 확정된
 * 200,000은 §6이 "조정 가능(세부)"로 분류한 기본값 수치에 해당하고, `docs/PROVIDERS.md` §3이
 * 계약으로 규정한 것은 수치가 아니라 **"보수" 기본값이라는 성질**이다. 그 성질은 아래 "보수 기본값은 기지
 * 모델 창보다 크지 않다"가 단언한다 — 수치를 박으면 세부 조정마다 계약 테스트가 깨지고,
 * 정작 위험한 방향(기본값이 실제 창보다 커지는 것)은 지금처럼 성질로만 잡힌다.
 *
 * 나머지 검증 대상은 구조(`{ tokens, known }`)와 §3이 소비하려면 반드시 참이어야 하는
 * 성질(양수·유한·결정적)이다.
 *
 * "기동 시 경고"는 CLI의 표시 책임(PROVIDERS §3 · CLI-INTERFACE)이므로 여기서 검증하지
 * 않는다. 이 함수가 검증 가능한 형태로 제공해야 하는 것은 **`known: false`라는 신호**뿐이고,
 * 그것은 아래에서 단언한다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, test } from "vitest";
import { type ContextWindowInfo, contextWindowForModel } from "../src/index.ts";

/** CLI가 배선하는 현행 기본 모델 — `packages/cli/src/config.ts`의 `DEFAULT_MODEL` */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** 어떤 모델 테이블에도 존재할 수 없는 이름 */
const UNKNOWN_MODELS = [
  "no-such-model-xyz",
  "claude-does-not-exist-9-9",
  "gpt-not-ours",
  "",
] as const;

// ---------------------------------------------------------------------------
// 타입 수준 검증 — 실행하지 않는다. 판정자는 `tsc --noEmit`.
// ---------------------------------------------------------------------------

function typeLevelSurface(): void {
  // PROVIDERS §3 — 구체 타입 표면. 두 필드가 모두 필수여야 소비자가 분기할 수 있다.
  const info: ContextWindowInfo = contextWindowForModel(DEFAULT_MODEL);
  const tokens: number = info.tokens;
  const known: boolean = info.known;
  void tokens;
  void known;

  // @ts-expect-error PROVIDERS §3 — 모델 id는 문자열이다
  contextWindowForModel(123);
}
void typeLevelSurface;

function expectWellFormed(info: ContextWindowInfo): void {
  expect(typeof info.tokens).toBe("number");
  expect(typeof info.known).toBe("boolean");
  // §3이 `contextWindowTokens × threshold`로 곱셈에 쓰므로 유한한 양수여야 한다.
  // 0·음수·NaN이면 임계가 항상 참(또는 항상 거짓)이 되어 판정이 무의미해진다.
  expect(Number.isFinite(info.tokens)).toBe(true);
  expect(info.tokens).toBeGreaterThan(0);
  expect(Number.isInteger(info.tokens)).toBe(true);
}

// ---------------------------------------------------------------------------
// 1. 기지 모델
// ---------------------------------------------------------------------------

describe("기지 모델 (PROVIDERS §3)", () => {
  test("현행 기본 모델은 known: true + 양수 tokens", () => {
    const info = contextWindowForModel(DEFAULT_MODEL);
    expectWellFormed(info);
    // 기본 모델이 미지로 나오면 안 만진 기본값이 매 기동마다 경고를 띄운다 —
    // §2.3(안전한 기본값)의 취지에 어긋난다.
    expect(info.known).toBe(true);
  });

  test("날짜 스냅샷 id와 별칭이 같은 모델로 조회된다", () => {
    // CLI 기본값은 날짜형 id(`claude-haiku-4-5-20251001`)이고 문서·별칭은 접미사가 없다.
    // 둘이 갈리면 기본 설정이 상시 `known: false`가 되어 헛경고가 난다.
    const snapshot = contextWindowForModel("claude-haiku-4-5-20251001");
    const alias = contextWindowForModel("claude-haiku-4-5");

    expectWellFormed(snapshot);
    expectWellFormed(alias);
    expect(snapshot).toEqual(alias);
    expect(snapshot.known).toBe(true);
  });

  test("[미규정 A-8] 어떤 모델이 테이블에 있어야 하는지는 계약이 정하지 않는다", () => {
    // PROVIDERS §3은 "미지 모델은 보수 기본값 + 기동 시 경고"라는 **메커니즘**만 규정하고,
    // 테이블 membership은 정하지 않는다. 그래서 여기서는 **어느 쪽이든 구조가 성립하는지**만
    // 단언한다 — 이 단언은 membership이 어느 쪽으로 결정되든 그대로 선다.
    //
    // 실물 갱신(2026-08-20 · `K-013`): `claude-opus-4-5`는 이제 테이블에 있다. 그 전까지
    // 이 자리는 구현 주석의 부재 주장(공식 문서가 그 모델의 컨텍스트 창을 명시하지 않는다)을
    // 복창했는데, 그 주장은 거짓이었다 — 공식 문서의 Legacy 표가 200k로 명시한다.
    // **멤버십의 판정은 섰지만(문서에 실린 대로 싣는다) 그것이 계약으로 규정된 것은 아니다.**
    // §3은 여전히 메커니즘만 들므로 이 마커는 남는다. 마커를 언제·어떻게 소거하는가의 절차는
    // `K-011`의 범위이고, 여기서 새로 만들지 않는다.
    const info = contextWindowForModel("claude-opus-4-5");
    expectWellFormed(info);
    expect(typeof info.known).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// 2. 미지 모델 — 보수 기본값 + known: false
// ---------------------------------------------------------------------------

describe("미지 모델 — 보수 기본값 (PROVIDERS §3 · COMPACTION §10)", () => {
  for (const model of UNKNOWN_MODELS) {
    test(`"${model}" → known: false + 양수 보수 기본값`, () => {
      const info = contextWindowForModel(model);
      expectWellFormed(info);
      expect(info.known).toBe(false);
      // 수치 자체는 단언하지 않는다 — 확정값(200,000)은 §6의 "조정 가능(세부)"이고
      // 계약은 보수성이다. 근거는 이 파일 머리 주석.
    });
  }

  test("미지 모델도 throw하지 않는다 — 판정 경로가 죽으면 안 된다", () => {
    // §3의 판정은 런 종료마다 일어난다. 여기서 던지면 idle 경로 전체가 깨진다.
    expect(() => contextWindowForModel("no-such-model-xyz")).not.toThrow();
  });

  test("보수 기본값은 기지 모델 창보다 크지 않다", () => {
    // PROVIDERS §3이 "**보수** 기본값"이라고 규정한 것의 의미: 미지 모델의 실제 창을 과대평가하면
    // 압축이 늦게 걸려 하드 한도 충돌이 난다(§2.3이 막으려는 것). 과소평가는 압축이
    // 일찍 걸릴 뿐이라 무해하다. 따라서 기본값은 실제 모델 창들의 하한 쪽에 있어야 한다.
    const fallback = contextWindowForModel("no-such-model-xyz").tokens;
    const knownDefault = contextWindowForModel(DEFAULT_MODEL).tokens;
    expect(fallback).toBeLessThanOrEqual(knownDefault);
  });
});

// ---------------------------------------------------------------------------
// 3. 결정성 — 같은 입력은 같은 출력
// ---------------------------------------------------------------------------

describe("결정성", () => {
  test("같은 모델 id는 항상 같은 값을 낸다", () => {
    for (const model of [DEFAULT_MODEL, "no-such-model-xyz"]) {
      const first = contextWindowForModel(model);
      const second = contextWindowForModel(model);
      expect(second).toEqual(first);
    }
  });

  test("반환 객체를 변형해도 다음 호출이 오염되지 않는다", () => {
    // 내부 테이블 객체를 그대로 돌려주면 소비자 한 명의 변형이 전역에 번진다.
    const first = contextWindowForModel(DEFAULT_MODEL);
    const baseline = { ...first };
    (first as { tokens: number }).tokens = 1;

    expect(contextWindowForModel(DEFAULT_MODEL)).toEqual(baseline);
  });
});

// ---------------------------------------------------------------------------
// 4. §3 소비 형태 — 이 값으로 임계 판정이 성립하는가
// ---------------------------------------------------------------------------

describe("§3 소비 형태 — CompactionConfig.contextWindowTokens로 쓸 수 있다", () => {
  test("기지·미지 어느 쪽이든 threshold 곱셈이 유한한 양수를 낸다", () => {
    for (const model of [DEFAULT_MODEL, "no-such-model-xyz"]) {
      const { tokens } = contextWindowForModel(model);
      const limit = tokens * 0.75; // §3 기본 threshold
      expect(Number.isFinite(limit)).toBe(true);
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThan(tokens);
    }
  });
});
