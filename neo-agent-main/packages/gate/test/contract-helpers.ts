/**
 * 계약 검증(QA-B)용 주입 협력자와 조립기.
 *
 * `helpers.ts`(다른 담당자 작성)의 가짜 협력자를 재사용하되, 계약 검증에만
 * 필요한 적대적 협력자(무엇이든 학습됐다고 답하는 allowlist, 계약 밖 scope를
 * 돌려주는 classifier)를 여기에 더한다. 원본 파일은 건드리지 않는다.
 */

import { evaluate, type FrozenGate, freezeGateConfig } from "../src/pipeline.ts";
import type {
  AllowlistStore,
  ApprovalGateConfig,
  ApprovalMode,
  ApprovalPrompt,
  GateLayer,
  GateToolProfile,
  GateVerdict,
  PathClassifier,
  PathScope,
} from "../src/types.ts";
import { makeAllowlist, makeClassifier, makePrompt, PROFILES } from "./helpers.ts";

export interface GateOverrides {
  mode?: ApprovalMode;
  denyRules?: readonly string[];
  toolProfiles?: Record<string, GateToolProfile>;
  classifier?: PathClassifier;
  allowlist?: AllowlistStore;
  prompt?: ApprovalPrompt;
}

/** `exactOptionalPropertyTypes` 때문에 선택 필드는 스프레드가 아니라 분기로 붙인다 */
export function buildConfig(overrides: GateOverrides = {}): ApprovalGateConfig {
  const config: ApprovalGateConfig = {
    mode: overrides.mode ?? "manual",
    toolProfiles: overrides.toolProfiles ?? { ...PROFILES },
    classifier: overrides.classifier ?? makeClassifier(),
    allowlist: overrides.allowlist ?? makeAllowlist(),
    prompt: overrides.prompt ?? makePrompt(),
  };
  return overrides.denyRules === undefined ? config : { ...config, denyRules: overrides.denyRules };
}

export function buildGate(overrides: GateOverrides = {}): FrozenGate {
  return freezeGateConfig(buildConfig(overrides));
}

export async function run(
  overrides: GateOverrides,
  toolName: string,
  args: unknown,
  signal: AbortSignal = new AbortController().signal,
): Promise<GateVerdict> {
  return await evaluate(buildGate(overrides), { toolCallId: "call-1", toolName, args }, signal);
}

/** 차단 판정임을 확인하고 계층·사유를 꺼낸다 — 타입 좁히기를 매번 쓰지 않기 위해 */
export function asBlock(verdict: GateVerdict): { layer: GateLayer; reason: string } {
  if (verdict.decision !== "block") {
    throw new Error(`차단이어야 하는데 allow(${verdict.layer})였다`);
  }
  return { layer: verdict.layer, reason: verdict.reason };
}

/**
 * 무엇이든 이미 학습돼 있다고 답하는 allowlist.
 * "allowlist 숏컷이 절대 닿으면 안 되는 지점"을 드러내는 도구다 — 이 저장소를
 * 끼웠는데도 프롬프트로 가야 하는 곳이 fail-closed의 실체다.
 */
export interface RecordingAllowlist extends AllowlistStore {
  readonly added: readonly string[];
  readonly queried: readonly string[];
}

export function makePermissiveAllowlist(): RecordingAllowlist {
  const added: string[] = [];
  const queried: string[] = [];
  return {
    has(key: string): boolean {
      queried.push(key);
      return true;
    },
    add(key: string): void {
      added.push(key);
    },
    get added() {
      return added;
    },
    get queried() {
      return queried;
    },
  };
}

/**
 * 계약 밖의 `scope` 값을 돌려주는 classifier. classifier는 주입된 협력자라
 * 게이트가 신뢰할 근거가 없다 — 모르는 값이 "안"으로 읽히면 그게 곧 자동 허용이다.
 */
export function makeRogueClassifier(scope: string): PathClassifier {
  return {
    resolve(input: string): { path: string; scope: PathScope } {
      return { path: input.startsWith("/") ? input : `/ws/${input}`, scope: scope as PathScope };
    },
  };
}

/** 학습된 키를 그대로 노출하는 allowlist — 어떤 키가 조회됐는지 확인용 */
export function makeSeededAllowlist(keys: readonly string[]): RecordingAllowlist {
  const store = makeAllowlist(keys);
  const queried: string[] = [];
  const added: string[] = [];
  return {
    has(key: string): boolean {
      queried.push(key);
      return store.has(key);
    },
    add(key: string): void {
      store.add(key);
      added.push(key);
    },
    get added() {
      return added;
    },
    get queried() {
      return queried;
    },
  };
}
