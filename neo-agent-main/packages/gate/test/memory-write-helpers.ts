/**
 * T-003(QA-B)용 주입 협력자와 조립기 — `memoryWrite` 분류(§3)와 `isTainted()`(§4).
 *
 * 기대값의 출처는 `docs/APPROVAL-GATE.md` §2 계층 5 · §3 `memoryWrite` 분류 절 · §4와
 * `docs/MEMORY.md` §5뿐이다. **구현보다 먼저 작성한다** — 그래서 이 파일은 아직
 * 존재하지 않는 표면(`memoryWrite` 프로필, `ApprovalGateHandle.isTainted()`)을
 * T-001이 확정한 계약 그대로 타입으로 적고, 현재 타입과의 간극은 캐스팅으로 넘긴다.
 * 캐스팅이 숨기는 것은 "아직 없다"는 사실뿐이고, 구현이 계약대로 들어오면 캐스팅은
 * 무해해진다(QA-C가 `web-taint-helpers.ts`에서 쓴 것과 같은 관례).
 *
 * 기존 `helpers.ts`·`contract-helpers.ts`·`web-taint-helpers.ts`는 건드리지 않는다 —
 * 관례는 재사용하되 원본은 그대로 둔다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { AgentHooks, ToolCallDecision, ToolResult } from "@neo-agent/core";
import { createApprovalGate } from "../src/hook.ts";
import type {
  ApprovalRequest,
  GateSubject,
  GateToolProfile,
  GateVerdict,
  PathClassifier,
  PathScope,
} from "../src/types.ts";
import { buildConfig, type GateOverrides, run } from "./contract-helpers.ts";
import { ch, makeClassifier, PROFILES } from "./helpers.ts";

/**
 * 모델에게 노출되는 유일한 메모리 표면의 이름(`MEMORY.md` §4.1 — `remember`
 * 1종·1액션). 게이트는 이 이름을 상수로 알지 않는다 — 프로필 테이블이 설정
 * 데이터이므로 테스트도 테이블로만 만난다.
 */
export const MEMORY_TOOL_NAME = "remember";

/**
 * `remember`의 인자 이름(`MEMORY.md` §4.1). **테스트가 이 이름을 상수로 아는 것은
 * 정당하지만 게이트는 몰라야 한다** — 그것을 실제로 검사하는 것이
 * `CUSTOM_CONTENT_PARAM` 쪽 테스트다.
 */
export const CONTENT_PARAM = "content";

/**
 * `packages/memory`가 export할 게이트 프로필의 테스트용 등가물.
 *
 * **`contentParam`은 표시 전용이고 판정 입력이 아니다**(`APPROVAL-GATE.md` §3
 * `memoryWrite` 분류 절 — 2026-08-09 정정, 판정 B-1). 프로필에 이 필드가 없으면
 * 게이트가 `"content"`라는 **인자 이름을 스스로 알아야** 하고, 그것은 "게이트는
 * 도구 구현을 모른다"(§3 머리)를 정면으로 깬다. `pathParam`·`commandParam`·
 * `urlParam`이 전부 "어느 인자가 무엇인가"를 설정으로 넘기는 것과 같은 자리다.
 *
 * **캐스팅이 없다**(2026-08-09 재도출). 계약이 확정되고 타입이 그것을 담게 된
 * 지금은 캐스팅이 검증을 가릴 뿐이다 — 실제로 초판의 `as unknown as` 캐스트가
 * 프로필 형태 개정을 타입 검사에서 숨겼고, 실패는 런타임까지 미뤄졌다.
 */
export const MEMORY_WRITE_PROFILE: GateToolProfile = {
  kind: "memoryWrite",
  contentParam: CONTENT_PARAM,
};

export const PROFILES_WITH_MEMORY: Record<string, GateToolProfile> = {
  ...PROFILES,
  [MEMORY_TOOL_NAME]: MEMORY_WRITE_PROFILE,
};

/**
 * **인자 이름을 일부러 다르게 준 프로필.** `contentParam`이 설정인지, 아니면
 * 게이트가 `"content"`를 상수로 알고 있는지를 가르는 유일한 관측 수단이다 —
 * 후자면 §3 머리("게이트는 도구 구현을 모른다")가 거짓이 된다.
 */
export const CUSTOM_CONTENT_PARAM = "memo";
export const CUSTOM_MEMORY_TOOL_NAME = "jot";
export const PROFILES_WITH_CUSTOM_MEMORY: Record<string, GateToolProfile> = {
  ...PROFILES,
  [CUSTOM_MEMORY_TOOL_NAME]: { kind: "memoryWrite", contentParam: CUSTOM_CONTENT_PARAM },
};

/** 프로필 테이블만 갈아끼우고 나머지 override는 호출자 것을 우선한다 */
function withMemoryProfiles(overrides: GateOverrides): GateOverrides {
  return { toolProfiles: { ...PROFILES_WITH_MEMORY }, ...overrides };
}

/** `evaluate` 직행 — 판정 **계층**이 보이는 유일한 경로다(hook은 `layer`를 떨군다) */
export async function runMemory(
  overrides: GateOverrides,
  toolName: string,
  args: unknown,
): Promise<GateVerdict> {
  return await run(withMemoryProfiles(overrides), toolName, args);
}

/**
 * 확정 표면(`APPROVAL-GATE.md` §4).
 *
 * `isTainted()`는 **가산 노출이지 새 상태가 아니다** — 오염 상태는 이미 게이트가
 * 계층 4b를 위해 들고 있고 지금까지 쓰기 메서드만 열려 있었다. 읽기를 열 뿐이므로
 * 파이프라인 출구도 계층도 늘지 않는다.
 *
 * **여기에 캐스팅을 쓰지 않는다.** 이 타입은 문서에서 도출한 기대 표면이고,
 * `createApprovalGate`의 반환을 캐스팅 없이 대입하면 **표면이 어긋나는 순간
 * 타입 검사가 잡는다** — 그것이 이 선언을 따로 두는 이유다(구현의
 * `ApprovalGateHandle`을 그대로 임포트하면 검사할 것이 남지 않는다).
 */
export interface MemoryGateHandle {
  beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]>;
  noteToolResult(result: Pick<ToolResult, "source">): void;
  resetTaint(): void;
  isTainted(): boolean;
}

/** 오염을 다루려면 게이트 인스턴스가 필요하다 — 오염은 인스턴스의 상태다 */
export function makeMemoryGate(overrides: GateOverrides = {}): MemoryGateHandle {
  return createApprovalGate(buildConfig(withMemoryProfiles(overrides)));
}

/** 프로필 테이블을 건드리지 않는 게이트 — `isTainted()`는 메모리와 무관한 표면이다 */
export function makePlainGate(overrides: GateOverrides = {}): MemoryGateHandle {
  return createApprovalGate(buildConfig(overrides));
}

export function callGate(
  gate: { beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]> },
  toolName: string,
  args: unknown,
  signal: AbortSignal = new AbortController().signal,
): Promise<ToolCallDecision> {
  return gate.beforeToolCall({ toolCallId: "call-1", toolName, args }, signal);
}

/** 프롬프트에 실린 판정 대상을 꺼낸다 — 프로필 분류의 유일한 관측 지점 */
export function subjectOf(request: ApprovalRequest | undefined): GateSubject {
  if (request === undefined) throw new Error("프롬프트가 호출되지 않았다");
  return request.subject;
}

export function requestOf(request: ApprovalRequest | undefined): ApprovalRequest {
  if (request === undefined) throw new Error("프롬프트가 호출되지 않았다");
  return request;
}

/**
 * 무엇을 물었는지 기록하는 classifier.
 *
 * `memoryWrite`에는 **`scope` 판정이 없다**(`APPROVAL-GATE.md` §3). 대상은 언제나
 * `~/.neo-agent/memory/`이고 그곳은 classifier가 `denied`로 판정하는 영역이라,
 * 경로로 환원해 물으면 **계층 0에 걸려 항상 block된다** — 파일 도구를 막기 위한
 * 판정을 그 막힘을 전제로 설계된 전용 도구에 적용하는 판정 오용이다. 그래서
 * "물었는가"가 곧 계약 위반의 관측값이고, 이 협력자가 그것을 기록한다.
 */
export interface RecordingClassifier extends PathClassifier {
  readonly seen: readonly string[];
}

export function makeRecordingClassifier(): RecordingClassifier {
  const inner = makeClassifier();
  const seen: string[] = [];
  return {
    resolve(input: string): { path: string; scope: PathScope } {
      seen.push(input);
      return inner.resolve(input);
    },
    get seen() {
      return seen;
    },
  };
}

/** 비가시 문자를 소스에 리터럴로 박지 않는다 — 테스트가 무엇을 검사하는지 보여야 한다 */
export const ZWSP = ch(0x200b);
