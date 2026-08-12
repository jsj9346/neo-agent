/**
 * 압축 오케스트레이션 — `docs/COMPACTION.md` §3·§6·§7, `docs/CLI-INTERFACE.md` §6.
 *
 * **판정 시점을 소유하는 것이 CLI다.** compaction 패키지는 순수 판정·계획·요약
 * 생성만 알고 저장소를 모르며, store는 분기 한 트랜잭션만 안다. 둘을 잇고 Agent를
 * 교체하고 결과를 보이는 것이 여기다 — 조립 지점이 하나라는 계약(§1)의 연장이다.
 *
 * 이 파일이 지키는 것 셋:
 *
 * 1. **자동과 수동은 같은 경로다**(§3). 갈림은 `CompactTrigger` 하나이고, 그것이
 *    바꾸는 것은 임계 판정 여부와 §7 자동 중지 규칙의 적용 여부뿐이다. 두 경로를
 *    따로 쓰면 한쪽만 고쳐지는 날이 온다.
 * 2. **압축은 침묵하지 않는다**(§6). 발생·before 토큰·유지 범위·새 세션 id가 자동
 *    이든 수동이든 나가고, 실패와 취소도 나간다.
 * 3. **실패의 비용은 요약 호출 1회뿐이다**(§7). 구 세션은 어느 실패 경로에서도
 *    원본 그대로 남는다 — 분기는 성공한 요약 뒤에 오는 한 트랜잭션이고, 그 전에
 *    끊기면 아무것도 바뀌지 않는다.
 */

import {
  type CompactionConfig,
  CompactionSummaryError,
  generateSummary,
  measureContextTokens,
  planCompaction,
  shouldCompact,
} from "@neo-agent/compaction";
import { type AgentMessage, createUserMessage, type ModelClient } from "@neo-agent/core";
import type { SessionStore, StoredSession } from "@neo-agent/store";
import type { CliConfig } from "./config.ts";
import { style } from "./terminal.ts";

/**
 * 요약 응답의 maxTokens — **config 파일 키가 아니다**(COMPACTION §3 주석의 기본값).
 *
 * 설정으로 열지 않은 이유는 이 값이 사용자가 조절할 성질이 아니기 때문이다: 너무
 * 작으면 요약이 잘려 `truncated` 실패가 되고(§5 — 잘린 요약은 채택하지 않는다),
 * 크게 잡아도 요약이 길어질 뿐 이득이 없다. 조정이 필요해지는 시점은 요약 품질
 * 실측이고, 그때 열 자리는 config가 아니라 이 상수다.
 */
export const SUMMARY_MAX_TOKENS = 8192;

/** 새 세션 id를 화면에 줄여 보일 때의 길이 — `wiring.ts`의 표시 규칙과 같다 */
const ID_PREFIX_LENGTH = 8;

/**
 * 압축이 소비하는 설정 — `CliConfig`에서 압축 관련 3키만 좁힌 것.
 *
 * `CompactionConfig`(COMPACTION.md §3)와 다른 타입인 것은 의도다. 저쪽은
 * `contextWindowTokens`·`summaryMaxTokens`까지 포함하는 compaction 패키지의 입력이고,
 * 그 두 값은 설정 파일이 아니라 providers 어댑터(§8)와 위 상수에서 온다. 여기는
 * **설정 파일이 정하는 몫**만 담는다.
 */
export type CompactionSettings = Pick<
  CliConfig,
  "compactionAuto" | "compactionThreshold" | "compactionKeepRecentTurns"
>;

/**
 * 압축 발동 경로. `"manual"`은 임계 판정을 건너뛴다(§3).
 *
 * `"auto"`만 §7의 자동 중지 규칙(연속 2회 실패 또는 `not-possible` 시 그 프로세스에서
 * 자동 트리거 중지)의 적용 대상이다 — `/compact`는 중지 상태에서도 언제나 시도할 수
 * 있고, 성공하면 자동이 재개된다.
 */
export type CompactTrigger = "manual" | "auto";

/**
 * 지금 열려 있는 세션에 대한 창(窓). 조립 지점이 채운다.
 *
 * 값이 아니라 함수로 받는 이유는 **압축이 세션을 바꾸는 연산**이기 때문이다 — 값으로
 * 받으면 `/resume`·`/new`·직전 압축으로 교체된 뒤의 낡은 세션을 붙잡게 된다. 저장소가
 * 이미 superseded 부모에서의 재분기를 거부하므로(SESSION-STORE §5) 낡은 참조가 조용히
 * 통과하지는 않지만, 애초에 만들지 않는 편이 낫다.
 */
export interface CompactionRuntime {
  /** 체인의 tip — 언제나 지금 열려 있는 세션이다 */
  session(): StoredSession;
  /** 그 세션의 현재 트랜스크립트. Agent의 in-memory 상태가 원천이다 */
  messages(): readonly AgentMessage[];
  /** 폐기 후 재생성 — `/resume`·`/new`와 **같은 경로**다(§6 3단계) */
  switchTo(session: StoredSession, messages: readonly AgentMessage[]): Promise<void>;
}

export interface CompactionDeps {
  settings: CompactionSettings;
  /** 모델 컨텍스트 창 — 배선 시 `contextWindowForModel`로 1회 조회한 값(§8) */
  contextWindowTokens: number;
  /** 본 대화와 같은 클라이언트다. 요약 전용 저가 모델은 MVP 제외(§9) */
  client: ModelClient;
  store: Pick<SessionStore, "branchSession">;
  /** 자식 세션의 시스템 프롬프트·모델. 부모 복사가 아니라 지금 배선의 값이다 */
  systemPrompt: string;
  model: string;
  runtime: CompactionRuntime;
  notify(text: string): void;
  /**
   * 압축 구간의 입력 소유권 이양(§6 "압축 중에는 진행 표시를 하고 입력을 받지
   * 않는다"). 넘겨받은 `signal`이 Ctrl+C의 통로다.
   */
  withCompaction<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T>;
}

export interface CompactionController {
  /** `/compact` — 임계 미달이어도 실행하고, 자동 중지 상태에서도 시도한다(§3·§7) */
  manual(): Promise<void>;
  /**
   * 판정 2곳(런 종료 후 idle · 재개 직후)이 부르는 자동 경로.
   *
   * `compactionAuto: false`거나 자동이 중지됐거나 임계 미달이면 **아무 일도 하지
   * 않는다** — 부르는 쪽이 조건을 알 필요가 없게 판정을 전부 여기 모았다.
   */
  auto(): Promise<void>;
}

/** 압축 1회의 결말. 취소는 실패가 아니므로 예외가 아니라 값으로 돌아온다 */
type Outcome = { kind: "done" } | { kind: "cancelled" };

/**
 * 압축 컨트롤러를 만든다.
 *
 * §7의 자동 중지 상태는 이 클로저의 지역 변수다 — **영속화하지 않는다.** hermes의
 * 쿨다운 컬럼(`compression_failure_cooldown_until` 등)을 채택하지 않은 근거가 그것이
 * 멀티프로세스 게이트웨이의 요구라는 데 있고(§7·SESSION-STORE §8), 우리는 터미널
 * 하나 = 프로세스 하나다. 프로세스가 죽으면 중지도 함께 끝나는 것이 맞다.
 */
export function createCompactionController(deps: CompactionDeps): CompactionController {
  const config: CompactionConfig = {
    contextWindowTokens: deps.contextWindowTokens,
    threshold: deps.settings.compactionThreshold,
    keepRecentTurns: deps.settings.compactionKeepRecentTurns,
    summaryMaxTokens: SUMMARY_MAX_TOKENS,
  };

  /** §7 — 프로세스 메모리만. **연속** 실패이므로 성공하면 0으로 돌아간다 */
  let consecutiveFailures = 0;
  let autoStopped = false;

  /**
   * 자동 중지 + 사유와 대안 **1회** 안내(§7).
   *
   * `autoStopped` 검사가 먼저인 것이 "반복 안내 금지"의 이행이다 — 이 경로는 매
   * idle마다 도달할 수 있고, 안내가 매번 나가면 그 자체가 스팸이다.
   */
  const stopAuto = (reason: string): void => {
    if (autoStopped) return;
    autoStopped = true;
    deps.notify(
      `${style.yellow("자동 압축을 중지한다")} — ${reason}\n` +
        style.dim("  이 프로세스에서는 자동으로 다시 시도하지 않는다. ") +
        style.dim("/compact 로 직접 시도하거나 /new 로 새 대화를 시작하라."),
    );
  };

  const recordAutoFailure = (reason: string): void => {
    consecutiveFailures += 1;
    // 연속 2회 — 한 번의 실패는 일시적 원인(네트워크·레이트리밋)일 수 있어 자동을
    // 끄지 않는다. 두 번 연속이면 원인이 지속적이라고 보고 스래싱을 끊는다.
    if (consecutiveFailures >= 2) {
      stopAuto(`요약이 연속 ${consecutiveFailures}회 실패했다 (마지막 사유: ${reason})`);
    }
  };

  const compact = async (trigger: CompactTrigger): Promise<void> => {
    const session = deps.runtime.session();
    const messages = deps.runtime.messages();

    if (trigger === "auto") {
      if (!deps.settings.compactionAuto || autoStopped) return;
      // 판정 근거는 실측 usage다(§3). 순수 함수라 여기까지는 비용이 없다.
      if (!shouldCompact(messages, config)) return;
    }

    // **부모가 있는 세션의 첫 메시지가 이전 요약이다**(§2 — 마커 문자열은 없다).
    // 저장소를 모르는 패키지에 이 구조적 사실을 알려 주는 것이 호출자의 몫이다.
    const plan = planCompaction(messages, config, {
      hasPreviousSummary: session.parentSessionId !== null,
    });

    if (plan.kind === "not-possible") {
      // 분기 직후의 오판이 여기서 끝난다(§3) — 모델 호출 없이, 비용 없이.
      //
      // **수동은 사유만 보이고 자동 중지 상태를 건드리지 않는다** — §7이 판정 E-47로
      // 규정했고 근거도 그 절이 갖는다. 자동을 바꾸는 수동의 결과는 **성공에 따른
      // 재개뿐**이고, 그것은 아래 성공 경로가 트리거로 가르지 않는 것으로 이행된다.
      if (trigger === "auto") {
        stopAuto(plan.reason);
      } else {
        deps.notify(`${style.yellow("압축할 수 없다")} — ${plan.reason}`);
      }
      return;
    }

    // §6 표시 의무의 "before 컨텍스트 토큰". 합산 규칙은 compaction 패키지 하나뿐이다
    // — 여기서 usage를 다시 더하면 같은 계약이 두 곳에 살게 된다.
    const beforeTokens = measureContextTokens(messages);
    const keptCount = plan.kept.length;

    let outcome: Outcome;
    try {
      outcome = await deps.withCompaction(async (signal): Promise<Outcome> => {
        deps.notify(
          `${style.dim("⧗ 압축 중")} — 대화를 요약하고 있다. ${style.dim("(Ctrl+C로 취소)")}`,
        );

        const text = await generateSummary(deps.client, plan, config, signal);

        // 요약과 분기 사이에 도착한 취소도 취소다. 분기는 한 트랜잭션이라 시작한
        // 뒤에는 되돌릴 지점이 없으므로, 되돌릴 수 있는 마지막 자리가 여기다.
        if (signal.aborted) return { kind: "cancelled" };

        const summaryMessage = createUserMessage({
          role: "user",
          content: [{ type: "text", text }],
        });
        const child = deps.store.branchSession(session.id, {
          summaryMessage,
          keptMessages: plan.kept,
          systemPrompt: deps.systemPrompt,
          model: deps.model,
        });

        // 구 Agent 폐기 → 새 Agent(messages = [요약, ...kept]) → 재배선.
        // `/resume`·`/new`가 쓰는 그 경로다 — 압축 전용 교체 경로를 만들지 않는다.
        await deps.runtime.switchTo(child, [summaryMessage, ...plan.kept]);

        deps.notify(formatResult(child, beforeTokens, config, keptCount));
        return { kind: "done" };
      });
    } catch (error) {
      // **취소는 실패가 아니다**(A-1). 사용자가 두 번 취소했다고 자동 압축이 꺼지면
      // 사용자가 하지 않은 설정 변경이 일어난다 — 카운트를 건드리지 않는다.
      if (isAbortedSummary(error)) {
        deps.notify(cancelledMessage());
        return;
      }

      // 요약 실패든 분기 실패든 구 세션은 무손상이다(§7). 경고만 남기고 세션을
      // 계속한다 — 저장 실패(SESSION-STORE §7)와 달리 런을 죽일 이유가 없다.
      // 압축이 안 돼도 대화는 아직 가능하기 때문이다.
      const reason = describeError(error);
      deps.notify(
        `${style.yellow("압축에 실패했다")} — ${reason}\n${style.dim("  대화는 그대로다.")}`,
      );
      if (trigger === "auto") recordAutoFailure(reason);
      return;
    }

    if (outcome.kind === "cancelled") {
      deps.notify(cancelledMessage());
      return;
    }

    // 성공하면 자동이 재개된다(§7) — 수동 성공도 마찬가지다.
    consecutiveFailures = 0;
    autoStopped = false;
  };

  return {
    manual: () => compact("manual"),
    auto: () => compact("auto"),
  };
}

/** 취소도 가시적 결과다(§6) — 조용히 없던 일이 되지 않는다 */
function cancelledMessage(): string {
  return style.dim("압축을 취소했다 — 대화는 그대로다.");
}

/**
 * §6 표시 의무 4요소: 압축 발생 사실 / before 컨텍스트 토큰 / 유지 범위 / 새 세션 id.
 *
 * before 토큰이 `undefined`인 경우를 0으로 적지 않는다 — 유효 어시스턴트 usage가 없는
 * 트랜스크립트에서 일어나며(§3), 0은 "컨텍스트가 비어 있었다"는 다른 사실이다.
 * 모르는 것을 아는 척하는 수치가 침묵 실패의 형상이다(ARCHITECTURE §2.6).
 */
function formatResult(
  child: StoredSession,
  beforeTokens: number | undefined,
  config: CompactionConfig,
  keptCount: number,
): string {
  const window = config.contextWindowTokens.toLocaleString("en-US");
  const before =
    beforeTokens === undefined
      ? "측정 불가 (유효한 어시스턴트 usage가 없다)"
      : `${beforeTokens.toLocaleString("en-US")} 토큰 / 창 ${window}`;

  return [
    style.dim("── 압축 완료 — 대화를 요약하고 새 세션으로 이어간다"),
    `   ${style.dim("압축 전")}  ${before}`,
    `   ${style.dim("원문 유지")}  최근 ${config.keepRecentTurns}턴 (메시지 ${keptCount}건)`,
    `   ${style.dim("새 세션")}  ${style.cyan(child.id.slice(0, ID_PREFIX_LENGTH))}`,
  ].join("\n");
}

/**
 * 취소 판정 — `CompactionSummaryError.reason === "aborted"`(A-1의 판정 수단).
 *
 * `signal.aborted`를 보지 않는 이유: 그 판정은 abort **이후에 일어난 다른 실패**까지
 * 취소로 뭉갠다(compaction 패키지가 에러 타입을 연 근거이기도 하다). 원인을 지어내지
 * 않고 그대로 읽는다.
 */
function isAbortedSummary(error: unknown): boolean {
  return error instanceof CompactionSummaryError && error.reason === "aborted";
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
