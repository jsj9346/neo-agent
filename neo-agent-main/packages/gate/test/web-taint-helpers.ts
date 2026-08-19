/**
 * T-004(QA-C)용 주입 협력자와 조립기 — 오염 추적(계층 4b)과 `webFetch` 분류.
 *
 * 기대값의 출처는 `docs/APPROVAL-GATE.md` §2·§3·§4 + `docs/WEB-ACCESS.md` §5·§6뿐이다.
 * **구현보다 먼저 작성한다** — 그래서 이 파일은 아직 존재하지 않는 표면(`webFetch`
 * 프로필, `noteToolResult`/`resetTaint`)을 T-001이 확정한 계약 그대로 타입으로
 * 적고, 현재 타입과의 간극은 캐스팅으로 넘긴다. 캐스팅이 숨기는 것은 "아직
 * 없다"는 사실뿐이고, 구현이 계약대로 들어오면 캐스팅은 무해해진다.
 *
 * 기존 `helpers.ts`·`contract-helpers.ts`는 건드리지 않는다 — 관례는 재사용하되
 * 원본은 그대로 둔다.
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
import { expect } from "vitest";
import { createApprovalGate } from "../src/hook.ts";
import type {
  GateLayer,
  GateSubject,
  GateToolProfile,
  GateVerdict,
  PathClassifier,
  PathScope,
} from "../src/types.ts";
import { buildConfig, type GateOverrides, run } from "./contract-helpers.ts";
import { makePrompt, PROFILES } from "./helpers.ts";

/**
 * T-001 확정 표면(`APPROVAL-GATE.md` §4).
 *
 * **오염 추적은 훅을 더 갖지 않고 평범한 메서드로 노출된다** — `afterToolCall`을
 * 게이트가 소유하면 출력 후처리라는 원래 소비자와 충돌한다(`CORE-INTERFACE.md` §7:
 * 훅 소비자는 각각 하나로 확정). 그래서 이 타입에도 `afterToolCall`이 없다.
 */
export interface TaintTrackingGate {
  beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]>;
  /** 호스트가 `afterToolCall`에서 호출한다 */
  noteToolResult(result: Pick<ToolResult, "source">): void;
  /** 호스트가 `agent_start`에서 호출한다 — 오염 수명은 런 단위(WEB-ACCESS §5) */
  resetTaint(): void;
}

/**
 * `packages/web`이 export할 `WEB_TOOL_GATE_PROFILES`의 테스트용 등가물.
 * 게이트는 `packages/web`을 임포트하지 않으므로(APPROVAL-GATE §1) 테스트도
 * 임포트하지 않고 형태로만 만난다 — 프로필 테이블은 설정 데이터다.
 */
export const WEB_FETCH_PROFILE = {
  kind: "webFetch",
  urlParam: "url",
} as unknown as GateToolProfile;

export const PROFILES_WITH_WEB: Record<string, GateToolProfile> = {
  ...PROFILES,
  web_fetch: WEB_FETCH_PROFILE,
};

function withWebProfiles(overrides: GateOverrides): GateOverrides {
  return { toolProfiles: { ...PROFILES_WITH_WEB }, ...overrides };
}

/** `evaluate` 직행 — 판정 **계층**이 보이는 유일한 경로다(hook은 layer를 떨군다) */
export async function runWeb(
  overrides: GateOverrides,
  toolName: string,
  args: unknown,
): Promise<GateVerdict> {
  return await run(withWebProfiles(overrides), toolName, args);
}

/**
 * "항상 허용" 키. 없으면 `undefined` — 선택지 자체가 제공되지 않는다는 뜻이다.
 * (`webFetch`의 키는 `webFetch:<origin>`이고 origin 표기는 전역 `URL.origin`
 * 직렬화 그대로다 — APPROVAL-GATE §4)
 */
export async function keyFor(url: unknown): Promise<string | undefined> {
  const prompt = makePrompt({ response: "allow-once" });
  await runWeb({ prompt }, "web_fetch", { url });
  return prompt.last?.allowAlwaysKey;
}

/** 오염 상태를 다루려면 게이트 인스턴스가 필요하다 — 오염은 인스턴스의 상태다 */
export function makeTaintGate(overrides: GateOverrides = {}): TaintTrackingGate {
  return createApprovalGate(
    buildConfig(withWebProfiles(overrides)),
  ) as unknown as TaintTrackingGate;
}

export function call(
  gate: { beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]> },
  toolName: string,
  args: unknown,
  signal: AbortSignal = new AbortController().signal,
): Promise<ToolCallDecision> {
  return gate.beforeToolCall({ toolCallId: "call-1", toolName, args }, signal);
}

/** `GateVerdict` → 코어 훅이 내보내는 형태. 계층은 코어로 새지 않는다(hook.ts) */
export function toDecision(verdict: GateVerdict): ToolCallDecision {
  return verdict.decision === "allow"
    ? { decision: "allow" }
    : { decision: "block", reason: verdict.reason };
}

/**
 * **오염 상태에서 "어느 계층이 판정했는가"를 확인하기 위한 이중 실행.**
 *
 * 순서 계약 검증에는 `GateVerdict.layer`가 필요한데, 오염 상태는 게이트
 * 인스턴스(=`beforeToolCall`)에만 존재하고 그 경로는 `layer`를 떨군다. 그래서:
 *
 *   (1) 같은 입력을 **오염 없이** `evaluate`로 돌려 계층을 직접 확인하고,
 *   (2) 같은 입력을 **오염 상태에서** 훅으로 돌려 판정이 (1)과 동일함을 확인한다.
 *
 * 판정이 완전히 같고 프롬프트에 닿지도 않았다면, 오염된 실행도 (1)과 같은 계층에서
 * 나갔다는 뜻이다 — 계층 4b는 5·6만 무효화하고 0~3은 건드리지 않는다(APPROVAL-GATE §2).
 * `reason`까지 비교하는 이유는 그것이 (1)의 계층에 판정을 묶는 유일한 관측값이기
 * 때문이다. 4b의 효과는 "프롬프트에 경고를 싣는 것"이지 모델에게 가는 차단 사유를
 * 바꾸는 것이 아니다(§2 — 차단은 4b의 효과가 아니다).
 *
 * `makeOverrides`가 함수인 이유: 협력자(allowlist·prompt)는 상태를 갖는다.
 * 두 실행이 같은 인스턴스를 공유하면 (1)의 부작용이 (2)를 오염시킨다.
 */
export async function assertTaintKeepsExit(
  makeOverrides: () => GateOverrides,
  toolName: string,
  args: unknown,
  expectedLayer: GateLayer,
  label = `${toolName}(${JSON.stringify(args)})`,
): Promise<void> {
  const reference = await runWeb(makeOverrides(), toolName, args);
  expect(reference.layer, `${label} — 오염 전 기준 계층`).toBe(expectedLayer);

  const prompt = makePrompt({ response: "allow-once" });
  const gate = makeTaintGate({ ...makeOverrides(), prompt });
  gate.noteToolResult({ source: "network" });
  const decision = await call(gate, toolName, args);

  expect(decision, `${label} — 오염이 계층 ${expectedLayer}의 판정을 바꿨다`).toEqual(
    toDecision(reference),
  );
  // 0~3에서 나갔다면 프롬프트에 닿을 일이 없다. 닿았다면 4b가 계층 7까지 밀어낸 것이다
  expect(prompt.calls, `${label} — 계층 ${expectedLayer}인데 프롬프트로 갔다`).toEqual([]);
}

/**
 * 무엇을 물어도 터지는 classifier.
 *
 * `webFetch`·`unknown`은 경로 판정기의 관할이 아니다(APPROVAL-GATE §3). 관할이
 * 아닌 것을 물으면 터지게 해 두면, 게이트가 URL을 경로로 착각해 판정기에 넣는
 * 오등록이 조용히 지나가지 않는다 — 그 경우 판정 대상이 `unknown`으로 떨어져
 * 프로필 등록 테스트가 실패한다.
 */
export function makeExplodingClassifier(): PathClassifier {
  return {
    resolve(input: string): { path: string; scope: PathScope } {
      throw new Error(`경로 판정기가 호출되면 안 되는 자리다: ${input}`);
    },
  };
}

/** 프롬프트에 실린 판정 대상을 꺼낸다 — 프로필 분류의 유일한 관측 지점 */
export function subjectOf(request: { subject: GateSubject } | undefined): GateSubject {
  if (request === undefined) throw new Error("프롬프트가 호출되지 않았다");
  return request.subject;
}
