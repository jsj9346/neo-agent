/**
 * 판정 파이프라인 — `docs/APPROVAL-GATE.md` §2.
 *
 * **순서가 계약이다.** 순서를 바꾸면 우회가 생긴다:
 * - allowlist를 위험 패턴보다 먼저 보면 위험 명령이 학습된 키로 통과한다
 * - 모드 확인을 하드라인보다 먼저 하면 `off`가 하드라인까지 끈다
 * - 매트릭스를 deny 규칙보다 먼저 보면 사용자 deny가 자동 허용에 먹힌다
 *
 * ```
 * 0. denied 차단      classifier가 "denied"면 즉시 block (모드 무관, 승인으로도 불가)
 * 1. 하드라인          모드 무관, 항상 평가
 * 2. 모드 확인         "off"면 여기서 allow — 하드라인·denied 뒤라는 위치가 계약
 * 3. deny 규칙         난독화 정규화 후 글로브 매칭
 * 4. 정책 매트릭스     워크스페이스 안 파일 읽기만 자동 허용
 * 5. 위험 패턴         차단이 아니라 플래그 — allowlist를 무효화하고 경고에 실린다
 * 6. allowlist         위험 플래그가 없을 때만 매칭
 * 7. 승인 프롬프트     주입된 ApprovalPrompt에 위임
 * ```
 *
 * 각 판정 결과에 `layer`를 실어 반환하는 이유는 테스트가 **어느 계층이 판정했는지**를
 * 확인할 수 있어야 순서 계약을 검증할 수 있기 때문이다 — "차단됐다"만으로는
 * 하드라인이 모드보다 먼저 평가됐는지 알 수 없다.
 */

import { analyzeDisplayText, escapeInvisibles, renderSubjectDisplay } from "./display.ts";
import { compileGlob, normalizeForMatching } from "./normalize.ts";
import { hasShellOperator, matchHardline, matchPathHardline, matchRisks } from "./patterns.ts";
import type {
  AllowlistStore,
  ApprovalGateConfig,
  ApprovalMode,
  ApprovalPrompt,
  ApprovalRequest,
  ApprovalResponse,
  GateSubject,
  GateToolProfile,
  GateVerdict,
  PathClassifier,
} from "./types.ts";

interface CompiledDenyRule {
  readonly source: string;
  readonly matches: (text: string) => boolean;
}

/**
 * 동결된 설정. `mode`·`denyRules`·`toolProfiles`는 생성 시점의 값을 **복사**해
 * 갖는다(SAFE-DEFAULTS §4 — 시작 시 1회 읽고 동결). 원본 config 객체를 나중에
 * 변조해도 판정은 흔들리지 않는다 — 프로세스 안에서 도는 어떤 코드도(도구 실행,
 * 프롬프트 인젝션 산출물 포함) 실행 중에 게이트를 약화시킬 수 없어야 한다.
 *
 * classifier·allowlist·prompt는 협력자라 참조를 캡처한다. 참조를 잡아 두는 것
 * 자체가 동결이다 — 나중에 `config.classifier = 항상inside인가짜`로 바꿔도
 * 게이트는 생성 시점의 판정기를 계속 쓴다.
 */
export interface FrozenGate {
  readonly mode: ApprovalMode;
  readonly denyRules: readonly CompiledDenyRule[];
  readonly toolProfiles: ReadonlyMap<string, GateToolProfile>;
  readonly classifier: PathClassifier;
  readonly allowlist: AllowlistStore;
  readonly prompt: ApprovalPrompt;
}

function copyProfile(profile: GateToolProfile): GateToolProfile {
  if (profile.kind === "shellExec") {
    return profile.cwdParam === undefined
      ? { kind: "shellExec", commandParam: profile.commandParam }
      : { kind: "shellExec", commandParam: profile.commandParam, cwdParam: profile.cwdParam };
  }
  return { kind: profile.kind, pathParam: profile.pathParam };
}

export function freezeGateConfig(config: ApprovalGateConfig): FrozenGate {
  const profiles = new Map<string, GateToolProfile>();
  for (const [name, profile] of Object.entries(config.toolProfiles)) {
    profiles.set(name, copyProfile(profile));
  }
  const denyRules = (config.denyRules ?? []).map((source) => ({
    source,
    matches: compileGlob(source),
  }));
  return {
    mode: config.mode,
    denyRules,
    toolProfiles: profiles,
    classifier: config.classifier,
    allowlist: config.allowlist,
    prompt: config.prompt,
  };
}

export interface GateCallContext {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

interface SubjectResolution {
  readonly subject: GateSubject;
  /** 판정·표시의 1차 대상 텍스트 (명령 또는 해석된 경로) */
  readonly primary: string;
  /** 계층 0이 차단할 경로. classifier가 "denied"로 판정한 것 */
  readonly deniedPath?: string;
  /** 사용자에게 알릴 판정 사정 (프로필 누락, 인자 판독 실패 등) */
  readonly notes: readonly string[];
}

/** 모델 인자는 신뢰하지 않는다 — 타입이 어긋나면 없는 것으로 본다(→ fail-closed) */
function readStringArg(args: unknown, key: string): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function unknownSubject(toolName: string, note: string): SubjectResolution {
  return { subject: { kind: "unknown", toolName }, primary: toolName, notes: [note] };
}

/**
 * 도구 호출 → 판정 대상. 프로필이 없거나 인자를 읽지 못하면 `unknown`이다.
 * **인자 판독 실패를 `unknown`으로 떨어뜨리는 것이 fail-closed의 실체다** —
 * "경로를 못 읽었으니 그냥 통과"가 되면 프로필 오등록이 조용한 자동 허용이 된다.
 */
function resolveSubject(gate: FrozenGate, toolName: string, args: unknown): SubjectResolution {
  const profile = gate.toolProfiles.get(toolName);
  if (profile === undefined) {
    return unknownSubject(toolName, "게이트 프로필에 등록되지 않은 도구다 — 항상 승인을 묻는다");
  }

  if (profile.kind === "shellExec") {
    const command = readStringArg(args, profile.commandParam);
    if (command === undefined) {
      return unknownSubject(
        toolName,
        `셸 명령 인자("${profile.commandParam}")를 문자열로 읽지 못했다 — 판정 불가로 승인을 묻는다`,
      );
    }
    // cwd 미지정은 워크스페이스 루트다(TOOLS-INTERFACE §2). 게이트는 루트 값을
    // 직접 알지 못하므로 classifier에게 "."를 물어 같은 판정기의 답을 쓴다 —
    // 게이트가 자체 기본값을 갖는 순간 도구와 판정이 어긋난다. [미규정]
    const cwdInput =
      (profile.cwdParam === undefined ? undefined : readStringArg(args, profile.cwdParam)) ?? ".";
    let cwd: ReturnType<PathClassifier["resolve"]>;
    try {
      cwd = gate.classifier.resolve(cwdInput);
    } catch (error) {
      return unknownSubject(
        toolName,
        `작업 디렉터리 판정에 실패했다(${describeError(error)}) — 판정 불가로 승인을 묻는다`,
      );
    }
    const subject: GateSubject = { kind: "shellExec", command, cwd: cwd.path };
    return cwd.scope === "denied"
      ? { subject, primary: command, deniedPath: cwd.path, notes: [] }
      : { subject, primary: command, notes: [] };
  }

  const input = readStringArg(args, profile.pathParam);
  if (input === undefined) {
    return unknownSubject(
      toolName,
      `경로 인자("${profile.pathParam}")를 문자열로 읽지 못했다 — 판정 불가로 승인을 묻는다`,
    );
  }
  let resolved: ReturnType<PathClassifier["resolve"]>;
  try {
    resolved = gate.classifier.resolve(input);
  } catch (error) {
    return unknownSubject(
      toolName,
      `경로 판정에 실패했다(${describeError(error)}) — 판정 불가로 승인을 묻는다`,
    );
  }
  // classifier는 주입된 협력자다. 계약 밖의 값이 오면 가장 안전한 쪽("밖")으로
  // 떨어뜨린다 — 모르는 값을 "안"으로 읽으면 그게 곧 자동 허용이다
  const scope =
    resolved.scope === "inside" || resolved.scope === "denied" ? resolved.scope : "outside";
  const subject: GateSubject = { kind: profile.kind, path: resolved.path, scope };
  return scope === "denied"
    ? { subject, primary: resolved.path, deniedPath: resolved.path, notes: [] }
    : { subject, primary: resolved.path, notes: [] };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * allowlist 키. 셸은 정규화된 명령 **전체**가 키다 — 첫 토큰(`git`)을 키로 삼으면
 * `git status`를 허용한 사용자가 `git push --force`까지 허용한 것이 된다.
 * 학습이 좁아 마찰이 늦게 줄지만, 넓은 키는 사용자가 승인한 적 없는 것을 통과시킨다.
 *
 * **셸 연산자가 있으면 키를 주지 않는다** — `ls`를 학습시킨 뒤 `ls; rm -rf ~`가
 * 통과하는 숏컷 차단(APPROVAL-GATE §2 계층 6). 키가 없으면 "항상 허용" 선택지
 * 자체가 프롬프트에 제공되지 않는다.
 *
 * 파일 도구는 해석된 절대 경로가 키다. 경로 단위라 범위가 좁고, "이 파일은 늘
 * 고쳐도 된다"는 사용자 의사를 그대로 표현한다. [미규정] — 계약은 키 추출 규칙을
 * 구현에 맡겼다(§7).
 */
function allowlistKey(subject: GateSubject, canonical: string): string | undefined {
  if (subject.kind === "unknown") return undefined;
  if (subject.kind === "shellExec") {
    if (canonical.length === 0 || hasShellOperator(canonical)) return undefined;
    return `shell:${canonical}`;
  }
  return `${subject.kind}:${subject.path}`;
}

/**
 * 승인 프롬프트를 abort와 경주시킨다. 프롬프트 구현이 signal을 무시할 수 있으므로
 * 게이트가 직접 이긴다 — 중단됐는데도 사용자 응답을 계속 기다리면 루프가 멈춘다.
 */
async function askWithAbort(
  prompt: ApprovalPrompt,
  request: ApprovalRequest,
  signal: AbortSignal,
): Promise<ApprovalResponse | "aborted"> {
  if (signal.aborted) return "aborted";
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<"aborted">((resolve) => {
    onAbort = () => resolve("aborted");
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([prompt.ask(request, signal), aborted]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
  }
}

export async function evaluate(
  gate: FrozenGate,
  ctx: GateCallContext,
  signal: AbortSignal,
): Promise<GateVerdict> {
  const resolution = resolveSubject(gate, ctx.toolName, ctx.args);
  const subject = resolution.subject;
  const normalized = normalizeForMatching(resolution.primary);

  // 0. denied — 크리덴셜 경로. 모드 무관, 승인으로도 불가.
  //    도구 자체 강제(TOOLS-INTERFACE §3)의 이중화이지 대체가 아니다.
  if (resolution.deniedPath !== undefined) {
    return {
      decision: "block",
      layer: "denied-path",
      reason: `Approval gate: "${escapeInvisibles(resolution.deniedPath)}" is a protected credential path. This block cannot be lifted by approval — do not retry this path; ask the user directly for any value you need from it.`,
    };
  }

  // 1. 하드라인 — 모드 무관. **판정 대상의 종류로 건너뛰지 않는다**: 금지되는 것은
  //    특정 도구가 아니라 결과다. 셸의 `dd of=/dev/sda`를 막으면서 파일 쓰기로 같은
  //    경로를 열어두면 "승인으로도 불가"가 실효를 잃는다(APPROVAL-GATE §2).
  const hardline =
    subject.kind === "shellExec"
      ? matchHardline(normalized.variants)
      : subject.kind === "fileWrite" || subject.kind === "fileEdit"
        ? matchPathHardline(normalized.variants)
        : undefined;
  if (hardline !== undefined) {
    return {
      decision: "block",
      layer: "hardline",
      reason: `Approval gate hardline (${hardline.id}): ${hardline.message}. Blocked regardless of approval mode; retrying will not change it — ask the user to do it directly.`,
    };
  }

  // 2. 모드 — 하드라인·denied 뒤라는 위치가 계약이다
  if (gate.mode === "off") {
    return { decision: "allow", layer: "mode-off" };
  }

  // 3. 사용자 deny 규칙 — 난독화 정규화 후보 전부에 대해 글로브 매칭
  for (const rule of gate.denyRules) {
    if (normalized.variants.some((text) => rule.matches(text))) {
      return {
        decision: "block",
        layer: "deny-rule",
        reason: `Approval gate: blocked by the user deny rule "${rule.source}". The user explicitly forbade this — do not try to work around it; propose a different approach.`,
      };
    }
  }

  // 4. 정책 매트릭스 — 자동 허용은 워크스페이스 안 파일 읽기 하나뿐(SAFE-DEFAULTS §1).
  //    `unknown`은 여기 도달해도 절대 걸리지 않는다 = fail-closed
  if (subject.kind === "fileRead" && subject.scope === "inside") {
    return { decision: "allow", layer: "policy-matrix" };
  }

  // 5. 위험 패턴 — 차단이 아니라 플래그
  const risks =
    subject.kind === "unknown"
      ? []
      : matchRisks(normalized.variants, subject.kind === "shellExec" ? "command" : "path");

  const display = analyzeDisplayText(resolution.primary, normalized);
  // 표시 위조 흔적도 위험 플래그와 같은 무게로 다룬다 — 사용자가 본 것과 실행될
  // 것이 다를 수 있는 문자열을 영구 학습시키는 것 자체가 우회 경로다
  const flagged = risks.length > 0 || display.spoofed;

  // 6. 영구 allowlist — 위험 플래그가 없을 때만
  const key = flagged ? undefined : allowlistKey(subject, normalized.canonical);
  if (key !== undefined && gate.allowlist.has(key)) {
    return { decision: "allow", layer: "allowlist" };
  }

  // 7. 승인 프롬프트
  const warnings = [
    ...resolution.notes,
    ...display.warnings,
    ...risks.map((risk) => `위험 패턴(${risk.id}) — ${risk.message}`),
  ];
  const request: ApprovalRequest = {
    toolCallId: ctx.toolCallId,
    toolName: ctx.toolName,
    subject,
    display: renderSubjectDisplay(
      ctx.toolName,
      subject,
      display.text,
      subject.kind === "shellExec" ? escapeInvisibles(subject.cwd) : undefined,
    ),
    warnings,
    ...(key !== undefined ? { allowAlwaysKey: key } : {}),
  };

  let response: ApprovalResponse | "aborted";
  try {
    response = await askWithAbort(gate.prompt, request, signal);
  } catch (error) {
    // 프롬프트 구현이 터졌다. fail-closed — 물어보지 못했으면 허용이 아니다
    return {
      decision: "block",
      layer: "prompt",
      reason: `Approval gate: blocked because the approval prompt failed (${describeError(error)}). Tell the user and wait for instructions.`,
    };
  }

  if (response === "aborted") {
    return {
      decision: "block",
      layer: "prompt",
      reason:
        "Approval gate: the run was aborted while waiting for approval, so the prompt was cancelled.",
    };
  }
  if (response === "deny") {
    return {
      decision: "block",
      layer: "prompt",
      reason:
        "Approval gate: the user denied this tool call. Do not repeat the same call — propose an alternative or ask the user.",
    };
  }
  if (response === "allow-always" && key !== undefined) {
    // 동결의 유일한 예외 — 사용자의 명시적 응답이 원천일 때만 allowlist가 자란다.
    // 이 호출 지점이 코드 전체에서 하나뿐이라는 것이 리뷰 기준이다.
    gate.allowlist.add(key);
  }
  return { decision: "allow", layer: "prompt" };
}
