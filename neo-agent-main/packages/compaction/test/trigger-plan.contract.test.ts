/**
 * QA-A (T-010) — `shouldCompact` / `planCompaction`의 계약 검증. (T-006)
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `docs/COMPACTION.md` §3 — 트리거. "판정 근거는 추정이 아니라 실측이다 ... 현재
 *       컨텍스트 크기는 트랜스크립트의 **마지막 유효 어시스턴트 응답**의
 *       `input + cacheRead + cacheWrite + output`이다. `stopReason`이 `"error"`·`"aborted"`인
 *       응답의 usage는 불완전할 수 있어 건너뛴다." /
 *       "`contextTokens > contextWindowTokens × threshold`(기본 0.75)면 자동 압축" /
 *       "유효 usage가 없으면 false" /
 *       "분기 직후의 오판은 구조적으로 무해하다 ... 계획 단계에서 요약할 구간이 비어
 *       '압축 불가'로 판정되고 **모델 호출 없이** 끝난다"
 *   - `docs/COMPACTION.md` §4 — 계획. "유지 구간은 **뒤에서부터 `keepRecentTurns`번째
 *       user 메시지**(합성 포함)에서 시작한다" / "도구 짝 고아가 구조적으로 불가능하다" /
 *       "`toSummarize`가 비면 `not-possible`이다 — user 턴이 K개 이하인 세션, 방금 분기된
 *       세션이 여기 해당한다" / `toSummarize`는 "이전 요약 메시지(있으면)를 제외한 cut 이전 전부"
 *   - `docs/COMPACTION.md` §2 — "`parent_session_id`가 있는 세션의 첫 메시지가 요약이다"
 *       (구조적 식별 — 마커 문자열 없음)
 *
 * 실측 근거: `plans/20260806-compaction-qa-a-evidence.md` 실측 1(합성 user 메시지가
 * `role: "user"`로 실재 — cut 경계 카운트가 `role` 필터만으로 성립)·실측 2(error·aborted
 * usage가 0 자리표시자 또는 부분값 — 스킵이 필수).
 *
 * `[미규정 A-4]`: §4의 시그니처는 `(messages, config)` 둘뿐인데 `CompactionPlan.previousSummary`는
 * "부모가 있는 세션의 첫 메시지에서 추출"이라 순수 함수가 알 수 없다. 아래 테스트는 구현자에게
 * 공유된 스케치의 세 번째 파라미터 `options?: { hasPreviousSummary?: boolean }`를 쓴다 —
 * **문서에 아직 없는 표면**이므로 판정 요청 대상이다.
 */

import type {
  AgentMessage,
  AssistantMessage,
  TokenUsage,
  ToolResultMessage,
} from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import { type CompactionConfig, planCompaction, shouldCompact } from "../src/index.ts";

// ---------------------------------------------------------------------------
// 픽스처 — 공개 타입만 쓴다
// ---------------------------------------------------------------------------

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function user(text: string): AgentMessage {
  return { id: nextId("user"), role: "user", content: [{ type: "text", text }], timestamp: 0 };
}

/** `usage` 합계가 `total`이 되는 어시스턴트 응답 — §3의 네 필드 합 판정을 그대로 태운다 */
function assistant(
  text: string,
  options: {
    total?: number;
    usage?: Partial<TokenUsage>;
    stopReason?: AssistantMessage["stopReason"];
    toolCalls?: { toolCallId: string; toolName: string; args?: unknown }[];
  } = {},
): AgentMessage {
  const usage: TokenUsage =
    options.usage !== undefined
      ? { ...ZERO_USAGE, ...options.usage }
      : {
          input: options.total ?? 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        };
  const content: AssistantMessage["content"] = [{ type: "text", text }];
  for (const call of options.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      args: call.args ?? {},
    });
  }
  const message: AssistantMessage = {
    id: nextId("assistant"),
    role: "assistant",
    content,
    stopReason: options.stopReason ?? (options.toolCalls?.length ? "tool_use" : "end_turn"),
    usage,
    timestamp: 0,
  };
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    message.errorMessage = "QA-A 실패 픽스처";
  }
  return message;
}

function toolResult(toolCallId: string, toolName: string, text: string): ToolResultMessage {
  return {
    id: nextId("toolResult"),
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    isError: false,
    source: "local",
    timestamp: 0,
  };
}

const WINDOW = 200_000;

function config(overrides: Partial<CompactionConfig> = {}): CompactionConfig {
  return {
    contextWindowTokens: WINDOW,
    threshold: 0.75,
    keepRecentTurns: 2,
    summaryMaxTokens: 8192,
    ...overrides,
  };
}

/** §3 임계: `contextTokens > contextWindowTokens × threshold` */
const LIMIT = WINDOW * 0.75; // 150_000

// ---------------------------------------------------------------------------
// 1. shouldCompact — 임계 경계
//    §3: "contextTokens > contextWindowTokens × threshold면 자동 압축"
// ---------------------------------------------------------------------------

describe("shouldCompact — 임계 경계 (§3)", () => {
  test("초과하면 true", () => {
    const messages = [user("안녕"), assistant("응", { total: LIMIT + 1 })];
    expect(shouldCompact(messages, config())).toBe(true);
  });

  test("정확히 같으면 false — 동일은 초과가 아니다", () => {
    // §3의 부등호는 `>`다. `>=`로 구현하면 경계에서 한 턴 일찍 압축이 걸린다.
    const messages = [user("안녕"), assistant("응", { total: LIMIT })];
    expect(shouldCompact(messages, config())).toBe(false);
  });

  test("미달하면 false", () => {
    const messages = [user("안녕"), assistant("응", { total: LIMIT - 1 })];
    expect(shouldCompact(messages, config())).toBe(false);
  });

  test("네 필드를 모두 더한다 — input + cacheRead + cacheWrite + output (§3)", () => {
    // 한 필드라도 빠뜨리면 캐시를 많이 쓰는 대화에서 압축이 영영 안 걸린다.
    const each = Math.floor(LIMIT / 4);
    const under = assistant("응", {
      usage: { input: each, output: each, cacheRead: each, cacheWrite: each },
    });
    // 4 × floor(LIMIT/4) ≤ LIMIT 이므로 초과가 아니다
    expect(shouldCompact([user("안녕"), under], config())).toBe(false);

    const over = assistant("응", {
      usage: { input: each + 1, output: each + 1, cacheRead: each + 1, cacheWrite: each + 1 },
    });
    expect(shouldCompact([user("안녕"), over], config())).toBe(true);
  });

  test("threshold를 바꾸면 경계가 따라 움직인다", () => {
    const messages = [user("안녕"), assistant("응", { total: 100_001 })];
    expect(shouldCompact(messages, config({ threshold: 0.5 }))).toBe(true);
    expect(shouldCompact(messages, config({ threshold: 0.75 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. shouldCompact — 유효 어시스턴트 선별
//    §3: "stopReason이 error·aborted인 응답의 usage는 불완전할 수 있어 건너뛴다"
//    실측 2가 이 스킵이 필수임을 확인했다(0 자리표시자 경로가 실재).
// ---------------------------------------------------------------------------

describe("shouldCompact — error·aborted 어시스턴트를 건너뛴다 (§3)", () => {
  test("마지막이 error면 그 앞의 유효 어시스턴트로 판정한다", () => {
    // 실측 2: 코어가 합성한 error 메시지의 usage는 **전부 0**이다. 건너뛰지 않으면
    // 컨텍스트가 0으로 측정되어 §7의 복구 경로("에러 확인 → 압축 → 재시도")가 죽는다.
    const messages = [
      user("안녕"),
      assistant("유효", { total: LIMIT + 1 }),
      user("계속"),
      assistant("", { usage: ZERO_USAGE, stopReason: "error" }),
    ];
    expect(shouldCompact(messages, config())).toBe(true);
  });

  test("마지막이 aborted면 그 앞의 유효 어시스턴트로 판정한다", () => {
    const messages = [
      user("안녕"),
      assistant("유효", { total: LIMIT + 1 }),
      user("계속"),
      assistant("", { usage: ZERO_USAGE, stopReason: "aborted" }),
    ];
    expect(shouldCompact(messages, config())).toBe(true);
  });

  test("error·aborted가 연달아 쌓여도 그 앞의 유효 응답을 찾아간다", () => {
    const messages = [
      user("안녕"),
      assistant("유효", { total: LIMIT + 1 }),
      user("a"),
      assistant("", { usage: ZERO_USAGE, stopReason: "error" }),
      user("b"),
      assistant("", { usage: ZERO_USAGE, stopReason: "aborted" }),
      user("c"),
      assistant("", { usage: ZERO_USAGE, stopReason: "error" }),
    ];
    expect(shouldCompact(messages, config())).toBe(true);
  });

  test("건너뛴 응답의 부분 usage가 판정에 섞이지 않는다", () => {
    // 실측 2: 스트림 중간 실패의 usage는 input·cache만 실린 부분값이다(output 누락).
    // 이것을 채택하면 유효 응답보다 큰 값으로 오판할 수 있다.
    const messages = [
      user("안녕"),
      assistant("유효", { total: LIMIT - 1 }),
      user("계속"),
      assistant("부분", {
        usage: { input: LIMIT * 2, output: 0, cacheRead: 0, cacheWrite: 0 },
        stopReason: "error",
      }),
    ];
    expect(shouldCompact(messages, config())).toBe(false);
  });

  test("max_tokens·tool_use는 유효 응답이다 — 건너뛰는 것은 error·aborted뿐", () => {
    // §3이 지목한 것은 두 stopReason뿐이다. max_tokens는 응답이 잘렸을 뿐 usage는 온전하다.
    for (const stopReason of ["max_tokens", "tool_use", "end_turn"] as const) {
      const messages = [user("안녕"), assistant("응", { total: LIMIT + 1, stopReason })];
      expect(shouldCompact(messages, config()), `stopReason=${stopReason}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. shouldCompact — 유효 usage 부재
//    §3: "유효 usage가 없으면 false"
// ---------------------------------------------------------------------------

describe("shouldCompact — 유효 usage가 없으면 false (§3)", () => {
  test("빈 트랜스크립트", () => {
    expect(shouldCompact([], config())).toBe(false);
  });

  test("어시스턴트 응답이 하나도 없는 트랜스크립트", () => {
    expect(shouldCompact([user("안녕")], config())).toBe(false);
  });

  test("모든 어시스턴트가 error·aborted면 false", () => {
    const messages = [
      user("안녕"),
      assistant("", { usage: ZERO_USAGE, stopReason: "error" }),
      user("계속"),
      assistant("", { usage: ZERO_USAGE, stopReason: "aborted" }),
    ];
    expect(shouldCompact(messages, config())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. planCompaction — cut 경계
//    §4: "유지 구간은 뒤에서부터 keepRecentTurns번째 user 메시지에서 시작한다"
// ---------------------------------------------------------------------------

function expectPlan(
  result: ReturnType<typeof planCompaction>,
): Extract<ReturnType<typeof planCompaction>, { kind: "plan" }> {
  expect(result.kind).toBe("plan");
  if (result.kind !== "plan") throw new Error(`계획이 아니다: ${JSON.stringify(result)}`);
  return result;
}

function expectNotPossible(
  result: ReturnType<typeof planCompaction>,
): Extract<ReturnType<typeof planCompaction>, { kind: "not-possible" }> {
  expect(result.kind).toBe("not-possible");
  if (result.kind !== "not-possible") throw new Error("not-possible이 아니다");
  return result;
}

describe("planCompaction — cut은 user 턴 경계에서만 (§4)", () => {
  test("kept의 첫 메시지가 뒤에서 K번째 user 메시지다", () => {
    const messages = [
      user("u1"),
      assistant("a1", { total: 10 }),
      user("u2"),
      assistant("a2", { total: 20 }),
      user("u3"),
      assistant("a3", { total: 30 }),
      user("u4"),
      assistant("a4", { total: 40 }),
    ];

    const plan = expectPlan(planCompaction(messages, config({ keepRecentTurns: 2 })));

    // 뒤에서 2번째 user = u3
    expect(plan.kept[0]).toBe(messages[4]);
    expect(plan.kept.map((message) => message.id)).toEqual(
      messages.slice(4).map((message) => message.id),
    );
    expect(plan.toSummarize.map((message) => message.id)).toEqual(
      messages.slice(0, 4).map((message) => message.id),
    );
  });

  test("K를 바꾸면 경계가 그만큼 앞으로 간다", () => {
    const messages = [
      user("u1"),
      assistant("a1", { total: 10 }),
      user("u2"),
      assistant("a2", { total: 20 }),
      user("u3"),
      assistant("a3", { total: 30 }),
      user("u4"),
      assistant("a4", { total: 40 }),
    ];

    expect(expectPlan(planCompaction(messages, config({ keepRecentTurns: 1 }))).kept[0]).toBe(
      messages[6],
    );
    expect(expectPlan(planCompaction(messages, config({ keepRecentTurns: 3 }))).kept[0]).toBe(
      messages[2],
    );
  });

  test("toSummarize + kept가 원본 전부이고 순서가 보존된다 — 유실 없음", () => {
    const messages = [
      user("u1"),
      assistant("a1", { total: 10 }),
      user("u2"),
      assistant("a2", { total: 20 }),
      user("u3"),
      assistant("a3", { total: 30 }),
    ];

    const plan = expectPlan(planCompaction(messages, config({ keepRecentTurns: 1 })));
    expect([...plan.toSummarize, ...plan.kept].map((message) => message.id)).toEqual(
      messages.map((message) => message.id),
    );
  });

  test('합성 user 메시지(grace·steer)도 경계로 센다 (§4 "합성 포함")', () => {
    // 실측 1: grace·steer 주입은 role:"user"인 온전한 UserMessage로 트랜스크립트에 남는다.
    // 계획 함수는 그것을 실사용자 발화와 구분할 수단이 없고, §4가 구분하지 말라고 규정한다.
    const graceInjection = user("Turn limit reached: ... Wrap up now");
    const messages = [
      user("u1"),
      assistant("a1", { total: 10 }),
      user("u2"),
      assistant("a2", { total: 20 }),
      graceInjection,
      assistant("마무리", { total: 30 }),
    ];

    const plan = expectPlan(planCompaction(messages, config({ keepRecentTurns: 1 })));
    expect(plan.kept[0]).toBe(graceInjection);
  });

  test("kept가 항상 user 메시지로 시작한다 — 모든 K와 트랜스크립트 길이에서", () => {
    // 이 성질이 깨지면 자식 세션의 트랜스크립트가 [요약(user), assistant, ...]가 되어
    // user 두 개가 연속하거나 assistant가 앞서는 형태가 나온다.
    for (let turns = 3; turns <= 8; turns += 1) {
      const messages: AgentMessage[] = [];
      for (let i = 0; i < turns; i += 1) {
        messages.push(user(`u${i}`), assistant(`a${i}`, { total: 10 }));
      }
      for (let k = 1; k < turns; k += 1) {
        const result = planCompaction(messages, config({ keepRecentTurns: k }));
        if (result.kind !== "plan") continue;
        expect(result.kept[0]?.role, `turns=${turns} k=${k}`).toBe("user");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. planCompaction — 도구 짝이 갈라지지 않는다
//    §4: "user 경계에서 자르면 toolCall과 toolResult가 항상 같은 쪽에 남는다"
// ---------------------------------------------------------------------------

function toolCallIdsIn(messages: readonly AgentMessage[]): string[] {
  return messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => (message.role === "assistant" ? message.content : []))
    .flatMap((block) => (block.type === "toolCall" ? [block.toolCallId] : []));
}

function toolResultIdsIn(messages: readonly AgentMessage[]): string[] {
  return messages.flatMap((message) => (message.role === "toolResult" ? [message.toolCallId] : []));
}

describe("planCompaction — 도구 짝 고아가 구조적으로 불가능하다 (§4)", () => {
  /** user 턴마다 도구 호출이 여러 개 섞인 트랜스크립트 */
  function transcriptWithTools(turns: number): AgentMessage[] {
    const messages: AgentMessage[] = [];
    for (let i = 0; i < turns; i += 1) {
      messages.push(user(`u${i}`));
      messages.push(
        assistant(`a${i}`, {
          total: 10,
          toolCalls: [
            { toolCallId: `call-${i}-a`, toolName: "read" },
            { toolCallId: `call-${i}-b`, toolName: "write" },
          ],
        }),
      );
      messages.push(toolResult(`call-${i}-a`, "read", "결과 a"));
      messages.push(toolResult(`call-${i}-b`, "write", "결과 b"));
      messages.push(assistant(`a${i}-후속`, { total: 20 }));
    }
    return messages;
  }

  test("모든 K에서 toolCall과 toolResult가 같은 쪽에 남는다", () => {
    for (let turns = 3; turns <= 6; turns += 1) {
      const messages = transcriptWithTools(turns);
      for (let k = 1; k < turns; k += 1) {
        const result = planCompaction(messages, config({ keepRecentTurns: k }));
        if (result.kind !== "plan") continue;

        const label = `turns=${turns} k=${k}`;
        expect(new Set(toolCallIdsIn(result.toSummarize)), `${label} toSummarize`).toEqual(
          new Set(toolResultIdsIn(result.toSummarize)),
        );
        expect(new Set(toolCallIdsIn(result.kept)), `${label} kept`).toEqual(
          new Set(toolResultIdsIn(result.kept)),
        );
      }
    }
  });

  test("kept 구간만으로 와이어 정합성이 성립한다 — 자식 세션이 그대로 재개 가능", () => {
    // 자식 세션의 트랜스크립트는 [요약, ...kept]다. kept에 고아 toolResult가 있으면
    // 다음 API 호출이 tool_use/tool_result 정합성 검사에서 거부된다(CORE-INTERFACE §5).
    const messages = transcriptWithTools(4);
    const plan = expectPlan(planCompaction(messages, config({ keepRecentTurns: 2 })));

    expect(toolResultIdsIn(plan.kept).every((id) => toolCallIdsIn(plan.kept).includes(id))).toBe(
      true,
    );
    expect(plan.kept[0]?.role).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// 6. planCompaction — not-possible
//    §4: "toSummarize가 비면 not-possible이다 — user 턴이 K개 이하인 세션,
//         방금 분기된 세션이 여기 해당한다"
// ---------------------------------------------------------------------------

describe("planCompaction — user 턴이 K개 이하면 not-possible (§4)", () => {
  test("user 턴이 K와 같으면 not-possible", () => {
    const messages = [
      user("u1"),
      assistant("a1", { total: 10 }),
      user("u2"),
      assistant("a2", { total: 20 }),
    ];
    const result = expectNotPossible(planCompaction(messages, config({ keepRecentTurns: 2 })));
    expect(typeof result.reason).toBe("string");
    // §6의 표시 의무 — 사유가 비면 사용자가 왜 압축이 안 됐는지 볼 수 없다(§2.6).
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("user 턴이 K보다 적으면 not-possible", () => {
    const messages = [user("u1"), assistant("a1", { total: 10 })];
    expectNotPossible(planCompaction(messages, config({ keepRecentTurns: 2 })));
  });

  test("빈 트랜스크립트는 not-possible", () => {
    expectNotPossible(planCompaction([], config()));
  });

  test("user 턴이 K+1이면 계획이 나온다 — 경계의 반대쪽", () => {
    const messages = [
      user("u1"),
      assistant("a1", { total: 10 }),
      user("u2"),
      assistant("a2", { total: 20 }),
      user("u3"),
      assistant("a3", { total: 30 }),
    ];
    const plan = expectPlan(planCompaction(messages, config({ keepRecentTurns: 2 })));
    expect(plan.toSummarize.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. 분기 직후의 stale usage — §3의 "구조적으로 무해하다"
//    "shouldCompact가 참을 반환할 수 있다. 그러나 계획 단계에서 ... '압축 불가'로
//     판정되고 **모델 호출 없이** 끝난다"
// ---------------------------------------------------------------------------

describe("분기 직후 stale usage는 모델 호출 없이 끝난다 (§3)", () => {
  test("shouldCompact true + planCompaction not-possible", () => {
    // 분기 직후 자식 세션: [요약(user), 유지 user, 유지 assistant(부모 시절 usage)]
    // 유지 어시스턴트가 부모 시절의 큰 usage를 그대로 싣고 있어 트리거는 참이 된다.
    const messages = [
      user("이전 대화 요약"),
      user("u-recent"),
      assistant("a-recent", { total: LIMIT + 1 }),
    ];
    const cfg = config({ keepRecentTurns: 2 });

    expect(shouldCompact(messages, cfg)).toBe(true);
    expectNotPossible(planCompaction(messages, cfg, { hasPreviousSummary: true }));
  });

  test("계획은 순수 함수다 — ModelClient를 받지 않으므로 모델 호출 경로가 없다", () => {
    // §4: "계획은 순수 함수라 이 판정에 비용이 없다." 시그니처에 client가 없다는 것이
    // "모델 호출 없음"의 구조적 보증이다 — 호출 스파이가 아니라 표면으로 확인한다.
    expect(planCompaction.length).toBeLessThanOrEqual(3);
    expect(shouldCompact.length).toBeLessThanOrEqual(2);
  });

  test("입력 트랜스크립트를 변형하지 않는다 — 과거를 고쳐 쓰지 않는다 (전제)", () => {
    const messages = [
      user("u1"),
      assistant("a1", { total: 10 }),
      user("u2"),
      assistant("a2", { total: 20 }),
      user("u3"),
      assistant("a3", { total: 30 }),
    ];
    const snapshot = JSON.stringify(messages);

    shouldCompact(messages, config());
    planCompaction(messages, config());

    expect(JSON.stringify(messages)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// 8. 반복 압축 — previousSummary
//    §4: toSummarize는 "이전 요약 메시지(있으면)를 제외한 cut 이전 전부"
//    §5: "이전 요약 메시지 자체는 toSummarize에서 빠지므로 이중 반영되지 않는다"
//    [미규정 A-4] — options 파라미터는 문서에 없는 스케치 표면이다.
// ---------------------------------------------------------------------------

describe("반복 압축 — 이전 요약은 제외하고 previousSummary로 추출한다 (§4 · §5)", () => {
  const SUMMARY_TEXT = "## 목표\n이전 세션 요약 본문";

  function branchedTranscript(): AgentMessage[] {
    return [
      user(SUMMARY_TEXT), // 자식 세션의 첫 메시지 = 요약 (§2 구조적 식별)
      user("u1"),
      assistant("a1", { total: 10 }),
      user("u2"),
      assistant("a2", { total: 20 }),
      user("u3"),
      assistant("a3", { total: 30 }),
    ];
  }

  test("hasPreviousSummary가 참이면 messages[0]이 toSummarize에서 빠진다", () => {
    const messages = branchedTranscript();
    const plan = expectPlan(
      planCompaction(messages, config({ keepRecentTurns: 2 }), { hasPreviousSummary: true }),
    );

    expect(plan.toSummarize.map((message) => message.id)).not.toContain(messages[0]?.id);
    // §5 — 이중 반영 금지. 요약 본문이 toSummarize 안에 또 들어 있으면 안 된다.
    expect(plan.toSummarize.map((message) => message.id)).toEqual(
      messages.slice(1, 3).map((message) => message.id),
    );
  });

  test("hasPreviousSummary가 참이면 previousSummary로 그 텍스트가 추출된다", () => {
    const messages = branchedTranscript();
    const plan = expectPlan(
      planCompaction(messages, config({ keepRecentTurns: 2 }), { hasPreviousSummary: true }),
    );

    expect(plan.previousSummary).toBeDefined();
    expect(plan.previousSummary).toContain("이전 세션 요약 본문");
  });

  test("hasPreviousSummary가 거짓·생략이면 previousSummary가 없고 첫 메시지도 요약 대상이다", () => {
    const messages = branchedTranscript();

    for (const options of [undefined, { hasPreviousSummary: false }]) {
      const plan = expectPlan(planCompaction(messages, config({ keepRecentTurns: 2 }), options));
      expect(plan.previousSummary).toBeUndefined();
      expect(plan.toSummarize.map((message) => message.id)).toContain(messages[0]?.id);
    }
  });

  test("이전 요약 제외가 kept 경계를 바꾸지 않는다", () => {
    // 요약 메시지도 user이므로 cut 경계 카운트에는 참여한다(§4 "합성 포함"의 연장).
    // 제외되는 것은 `toSummarize` 멤버십뿐이다.
    const messages = branchedTranscript();
    const withSummary = expectPlan(
      planCompaction(messages, config({ keepRecentTurns: 2 }), { hasPreviousSummary: true }),
    );
    const without = expectPlan(planCompaction(messages, config({ keepRecentTurns: 2 })));

    expect(withSummary.kept.map((message) => message.id)).toEqual(
      without.kept.map((message) => message.id),
    );
  });

  test("이전 요약만 남고 요약할 것이 없으면 not-possible", () => {
    // 방금 분기된 세션 — §4가 not-possible의 예로 명시한 경우.
    const messages = [user(SUMMARY_TEXT), user("u1"), assistant("a1", { total: 10 })];
    expectNotPossible(
      planCompaction(messages, config({ keepRecentTurns: 2 }), { hasPreviousSummary: true }),
    );
  });
});
