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

import type { AgentHooks, ToolResult } from "@neo-agent/core";
import { evaluate, freezeGateConfig } from "./pipeline.ts";
import type { ApprovalGateConfig } from "./types.ts";

/**
 * 게이트가 호스트에 내미는 표면. **훅은 `beforeToolCall` 하나뿐이다.**
 *
 * 오염 추적(계층 4b)은 훅을 더 갖지 않고 평범한 메서드로 노출한다
 * (APPROVAL-GATE §4). **도구 결과 훅을 게이트가 소유해 버리면** 출력 후처리라는
 * 원래 소비자와 충돌해 호스트가 훅 합성을 강요받는다 — `CORE-INTERFACE.md` §7은
 * 두 훅의 소비자를 각각 하나로 확정했다(호출 전 훅 ← 승인 게이트, 결과 훅 ←
 * 출력 후처리). 메서드로 두면 호스트가 자기 코드에서 결과 훅 → `noteToolResult`,
 * `agent_start` → `resetTaint`로 부르면 되고, **런 경계 지식은 호스트에 남는다**
 * — 게이트는 여전히 코어 타입만 알고 이벤트 스트림도 전송도 모른다.
 */
export interface ApprovalGateHandle {
  beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]>;
  /**
   * 호스트가 도구 결과 훅에서 호출한다. `source: "network"` 하나로 런이 오염되고,
   * **뒤에 local 결과가 아무리 와도 씻기지 않는다** — 씻긴다면 인젝션 직후 아무
   * 로컬 도구 하나로 세탁이 가능해진다.
   */
  noteToolResult(result: Pick<ToolResult, "source">): void;
  /**
   * 호스트가 `agent_start`에서 호출한다 — 오염 수명은 런 단위다(WEB-ACCESS §5).
   * 멱등이다. **게이트가 도구 호출 경계에서 스스로 초기화하지 않는다**: 자동
   * 초기화는 "런 단위"를 "호출 단위"로 바꿔 정책을 소멸시킨다.
   */
  resetTaint(): void;
}

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
 *
 * **오염 상태는 동결 대상이 아니다** — 런 중에 변하는 것이 그 값의 정의다(§5).
 * 다만 오염 **정책**(무엇이 오염원이고 효과가 무엇인가)은 코드 상수다.
 */
export function createApprovalGate(config: ApprovalGateConfig): ApprovalGateHandle {
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

    noteToolResult(result) {
      // `source` 필드만이 근거다. 로컬 도구 결과까지 오염원으로 보면 모든 런이
      // 즉시 오염되고, 오염 정책은 "allowlist 기능 삭제"와 같아진다.
      // 단방향인 것이 계약이다 — 여기에 `else { tainted = false }`는 없다
      if (result.source === "network") gate.taint.tainted = true;
    },

    resetTaint() {
      gate.taint.tainted = false;
    },
  };
}
