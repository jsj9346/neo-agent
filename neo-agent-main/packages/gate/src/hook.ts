/**
 * 훅 어댑터 — `docs/APPROVAL-GATE.md` §4.
 *
 * 코어와의 접점은 `beforeToolCall` 하나다(CORE-INTERFACE §7). 코어는 게이트를
 * 모르고, 게이트는 이벤트 스트림·루프를 모른다. 배선은 한 줄이다:
 *
 * ```ts
 * new Agent({ ..., hooks: createApprovalGate(config) })
 * ```
 *
 * 웹 UI를 붙일 때 바뀌는 것은 `ApprovalPrompt` 구현 하나이고 이 모듈은 그대로다.
 */

import type { AgentHooks } from "@neo-agent/core";
import { evaluate, freezeGateConfig } from "./pipeline.ts";
import type { ApprovalGateConfig } from "./types.ts";

/**
 * 승인 게이트를 코어 훅으로 만든다.
 *
 * **설정은 이 호출 시점에 동결된다**(SAFE-DEFAULTS §4). 반환된 훅은 넘긴 config
 * 객체를 다시 읽지 않으므로, 세션 중에 `config.mode = "off"`로 바꿔도 판정은
 * 변하지 않는다. 프로세스 안에서 도는 코드(도구 실행 결과, 프롬프트 인젝션
 * 산출물)가 실행 중에 게이트를 약화시킬 수 있으면 게이트가 아니다.
 *
 * 유일한 예외는 allowlist이며, 사용자의 명시적 `allow-always` 응답 경로에서만
 * 자란다(§5). allowlist 파일을 다시 읽는 경로는 만들지 않는다 — 재읽기는 곧
 * 세션 중 설정 변경이고, 외부 편집의 적용 시점은 다음 프로세스 시작이다.
 */
export function createApprovalGate(config: ApprovalGateConfig): {
  beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]>;
} {
  const gate = freezeGateConfig(config);

  return {
    beforeToolCall: async (ctx, signal) => {
      const verdict = await evaluate(
        gate,
        { toolCallId: ctx.toolCallId, toolName: ctx.toolName, args: ctx.args },
        signal,
      );
      // `layer`는 게이트 내부의 판정 근거라 코어 계약 밖이다. 여기서 떨군다 —
      // 코어가 계층을 알기 시작하면 승인 정책이 코어 릴리스에 묶인다.
      return verdict.decision === "allow"
        ? { decision: "allow" }
        : { decision: "block", reason: verdict.reason };
    },
  };
}
