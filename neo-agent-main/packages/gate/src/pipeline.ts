/**
 * 판정 파이프라인 — `docs/APPROVAL-GATE.md` §2.
 *
 * **순서가 계약이다.** 순서를 바꾸면 우회가 생긴다:
 * - allowlist를 위험 패턴보다 먼저 보면 위험 명령이 학습된 키로 통과한다
 * - 모드 확인을 하드라인보다 먼저 하면 `off`가 하드라인까지 끈다
 * - 모드 확인을 deny 규칙보다 먼저 하면 `off`가 사용자의 명시적 금지까지 끈다
 * - 매트릭스를 위험 패턴보다 먼저 보면 플래그된 파일이 조용히 자동 허용된다
 *
 * ```
 * 0. denied 차단      classifier가 "denied"면 즉시 block (모드 무관, 승인으로도 불가)
 * 1. 하드라인          모드 무관, 항상 평가
 * 2. deny 규칙         모드 무관. 난독화 정규화 후 글로브 매칭
 * 3. 모드 확인         "off"면 여기서 allow — 위 셋 뒤라는 위치가 계약
 * 4. 위험 패턴         차단이 아니라 플래그 — 자동 허용과 allowlist를 무효화한다
 * 4b. 오염 플래그      이 런에서 이미 network 결과가 나왔으면 **위험 패턴과 같은 효과**
 * 5. 정책 매트릭스     워크스페이스 안 파일 읽기만, 플래그가 없을 때만 자동 허용
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
import {
  cwdBreaksKeySyntax,
  hasShellOperator,
  matchHardline,
  matchPathHardline,
  matchRisks,
} from "./patterns.ts";
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
  /**
   * 계층 4b의 오염 플래그(WEB-ACCESS §5). **동결 대상이 아니다** — 런 중에 변하는
   * 것이 이 값의 정의다. allowlist가 동결의 명시적 예외인 것과 같은 자리이며,
   * 같은 규율을 받는다: 이 값을 바꾸는 것은 **호스트가 부르는 인스턴스 메서드**뿐이고
   * (APPROVAL-GATE §4), 도구·훅·모델 산출물이 프로그래밍적으로 바꾸는 경로는 없다.
   *
   * 오염을 `evaluate`의 인자로 받지 않는 이유는 계약이 그 안을 기각했기 때문이다
   * (APPROVAL-GATE §2 계층 4b) — 인자로 두면 오염 상태의 `layer`를 직접 관측할 수
   * 있게 되고, 그것은 나타날 수 없는 값을 관측 가능하게 만드는 표면 확장이다.
   * 오염은 게이트 인스턴스의 상태이므로 게이트 상태에 둔다.
   */
  readonly taint: GateTaintState;
}

/** 4b의 상태 그릇. 게이트 인스턴스당 하나이고 런 경계에서 호스트가 되돌린다 */
export interface GateTaintState {
  tainted: boolean;
}

function copyProfile(profile: GateToolProfile): GateToolProfile {
  if (profile.kind === "shellExec") {
    return profile.cwdParam === undefined
      ? { kind: "shellExec", commandParam: profile.commandParam }
      : { kind: "shellExec", commandParam: profile.commandParam, cwdParam: profile.cwdParam };
  }
  if (profile.kind === "webFetch") {
    return { kind: "webFetch", urlParam: profile.urlParam };
  }
  // `memoryWrite`는 **경로 인자가 없다**. 아래 마지막 return으로 떨어지면
  // `pathParam: undefined`를 가진 프로필이 만들어지고, 그 뒤 판정은 존재하지 않는
  // 인자를 읽으려 든다 — 분기가 계약이다(APPROVAL-GATE §3)
  if (profile.kind === "memoryWrite") {
    return { kind: "memoryWrite", contentParam: profile.contentParam };
  }
  // `webSearch`도 **경로 인자가 없다** — 같은 이유로 분기가 계약이다
  if (profile.kind === "webSearch") {
    return { kind: "webSearch", queryParam: profile.queryParam };
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
    // 갓 만든 게이트는 무오염이다 — 초기 상태가 오염이면 호스트가 `resetTaint()`를
    // 부르기 전인 첫 런에서 기본 정책 매트릭스가 영영 성립하지 않는다
    taint: { tainted: false },
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
  /**
   * **표시 본문이 판정 대상과 다른 분류를 위한 필드다.** 없으면 `primary`가 곧
   * 표시 본문이다(기존 분류 전부가 그렇다 — 명령·경로·URL은 판정 대상이 그대로
   * 사용자가 봐야 할 것이다).
   *
   * `memoryWrite`·`webSearch` 둘만 갈린다(APPROVAL-GATE §3, 판정 B-1): `primary`는
   * **도구 이름**이어야 하고(계층 2 deny 규칙·계층 4 위험 패턴의 매칭 대상이라,
   * 산문을 넣으면 `*.env*` 같은 규칙이 메모·질의를 **우회 불가로 차단**하고
   * 크리덴셜 경로를 언급만 한 메모·질의가 플래그된다), 사용자가 봐야 하는 것은
   * **저장될 내용**·**검색될 질의**다. 위조 탐지는 표시 본문에 적용된다 — 둘 다
   * 모델이 제어하는 문자열이고, 메모리는 이후 모든 세션의 시스템 프롬프트에
   * 실리며(판정 B-3) 질의는 승인이 유일한 방어다(2026-09-02 `webSearch` 분류).
   * **분기 조건은 그대로 "`displayBody`가 있는가" 하나다 — 분기가 늘지 않는다.**
   */
  readonly displayBody?: string;
  /**
   * 판정 사정 자체가 자동 허용을 무효화하는가. 위험 패턴·오염·위조 흔적과 같은
   * 무게로 `flagged`에 합류한다 — **무엇이 저장되는지 보여줄 수 없으면 조용히
   * 허용하지 않는다**(판정 B-2). `unknown`으로 떨어뜨리는 대신 이 필드를 쓰는
   * 이유는 그쪽 `display`가 "게이트 프로필에 등록되지 않았다"는 **거짓 사유**를
   * 보이기 때문이다 — 승인 화면이 거짓말하면 게이트 전체가 무의미하다.
   */
  readonly flagged?: boolean;
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
    // 게이트가 자체 기본값을 갖는 순간 도구와 판정이 어긋난다.
    // **이것은 계약이다**(APPROVAL-GATE §3, 2026-08-06 명문화) — `"."`을 루트로
    // 해석하는 것은 classifier의 몫이고 게이트는 상수를 갖지 않는다
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

  if (profile.kind === "webFetch") {
    const raw = readStringArg(args, profile.urlParam);
    if (raw === undefined) {
      return unknownSubject(
        toolName,
        `URL 인자("${profile.urlParam}")를 문자열로 읽지 못했다 — 판정 불가로 승인을 묻는다`,
      );
    }
    // **전역 `URL`로만 판다. 스킴 정책도, 호스트 정책도 여기에 없다** —
    // SSRF·스킴 판정의 유일한 소유자는 `packages/web`이고(WEB-ACCESS §4),
    // 게이트가 그것을 겸하면 판정기가 둘이 되어 어긋난다. 여기서 URL을 읽는
    // 목적은 **학습 키 산출** 하나뿐이지 차단/허용 판정이 아니다.
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      // 파싱 실패는 `unknown`이다 — 기존 fail-closed 규율 그대로(APPROVAL-GATE §3).
      // 판독 못 한 것을 통과시키지 않고, 학습 키도 주지 않는다
      return unknownSubject(
        toolName,
        `URL 인자("${profile.urlParam}")를 URL로 해석하지 못했다 — 판정 불가로 승인을 묻는다`,
      );
    }
    const subject: GateSubject = { kind: "webFetch", url: raw, origin: parsed.origin };
    // 불투명 origin(`file:`·`data:`·`about:` 등)은 **파싱에 성공하지만 대상을
    // 식별하지 못한다**. 그대로 키로 쓰면 서로 다른 모든 불투명 URL이
    // `webFetch:null` 한 키로 묶여, `file:///a`를 허용한 사용자가
    // `file:///home/user/.ssh/id_rsa`까지 허용한 셈이 된다(APPROVAL-GATE §4).
    // 분류는 `webFetch`로 유지하고 키만 없앤다 — `unknown`으로 떨어뜨리면
    // 승인 화면이 "프로필에 등록되지 않았다"는 거짓 사유를 보이고 URL이 사라진다.
    // 셸 연산자를 포함한 명령이 학습되지 않는 것과 같은 기계다(§2 계층 6).
    return isOpaqueOrigin(parsed.origin)
      ? {
          subject,
          primary: raw,
          notes: [
            "이 URL은 호스트를 식별할 수 없어(불투명 origin) '항상 허용'으로 학습할 수 없다 — 매번 승인을 묻는다",
          ],
        }
      : { subject, primary: raw, notes: [] };
  }

  if (profile.kind === "memoryWrite") {
    // **판정 대상은 "이 도구가 불렸다"는 사실 하나다.** classifier에 아무것도 묻지
    // 않는다 — 경로로 환원하면 계층 0(denied)에 걸려 항상 block된다(APPROVAL-GATE §3).
    const subject: GateSubject = { kind: "memoryWrite" };
    // **`primary`는 도구 이름이다** — `content`가 아니다. `primary`는 표시용 값이
    // 아니라 계층 2(deny 규칙)·계층 4(위험 패턴)의 매칭 대상이고, 거기에 메모 산문을
    // 넣으면 (1) 사용자가 명령·경로를 겨냥해 쓴 deny 규칙이 산문에 걸려 **모드로도
    // 못 푸는 차단**이 되고, (2) 크리덴셜 경로를 *언급만 한* 메모가 플래그된다.
    // 위험 패턴은 그 경로에 **접촉하는 명령**을 잡으라고 만든 것이지 그것을 *말하는
    // 문장*을 잡으라고 만든 것이 아니다(판정 B-1). `unknown`이 도구 이름을 `primary`로
    // 두는 것과 같은 자리다. 부수 귀결(의도한 것): 사용자는 deny 규칙으로 메모리
    // 도구 자체를 막을 수 있다 — 도구 단위 금지는 사용자의 정당한 의사표시다.
    const content = readStringArg(args, profile.contentParam);
    if (content === undefined) {
      // **`unknown`으로 떨어뜨리지 않는다**(판정 B-2). 분류는 유지하고 사정을
      // 경고로 싣되 **플래그 처리**해 자동 허용을 무효화한다 — fail-closed는
      // 지켜지되 그 통화가 오분류가 아니라 마찰이다.
      return {
        subject,
        primary: toolName,
        // 표시 본문을 비운다. 비우지 않으면 `primary`(=도구 이름)가 표시 본문으로
        // 흘러 승인 화면이 **"저장할 내용: remember"**라고 거짓말한다 — 표시 위조
        // 탐지를 하는 모듈이 스스로 위조하는 셈이다
        displayBody: "",
        flagged: true,
        notes: [
          `저장할 내용 인자("${profile.contentParam}")를 문자열로 읽지 못했다 — 무엇이 저장되는지 보여줄 수 없어 자동 허용하지 않고 승인을 묻는다`,
        ],
      };
    }
    return { subject, primary: toolName, displayBody: content, notes: [] };
  }

  if (profile.kind === "webSearch") {
    // **판정 대상은 "이 도구가 불렸다"는 사실 하나다**(APPROVAL-GATE §3). classifier에
    // 아무것도 묻지 않고, 학습 키의 정의역이 원소 하나라 게이트가 질의에서 판정할
    // 것이 없다(WEB-ACCESS §6) — 판정 축이 없을 때 축을 발명하지 않는다.
    const subject: GateSubject = { kind: "webSearch" };
    // **`primary`는 도구 이름이다** — 질의가 아니다. 판정 B-1의 근거가 그대로 온다:
    // `primary`는 계층 2(deny 규칙)·계층 4(위험 패턴)의 매칭 대상이고 검색 질의는
    // 산문이라, 여기에 질의를 넣으면 `*.env*` 규칙이 ".env 관리법" 검색을 **모드로도
    // 못 푸는 차단**으로 만들고 `~/.ssh/id_rsa`를 *언급만 한* 질의가 플래그된다.
    // **여기서는 근거가 한 걸음 더 강하다**: 플래그가 사는 이유는 자동 허용과 학습
    // 키를 지우는 것인데 이 분류에는 지울 것이 둘 다 없다(매번 승인·키 없음) —
    // 질의를 `primary`에 넣어 얻는 것은 이미 무조건 주어져 있고 치르는 것은 오탐뿐이다.
    // 부수 귀결(의도한 것): 사용자는 deny 규칙 `web_search`로 검색 도구 자체를 막을 수 있다.
    const query = readStringArg(args, profile.queryParam);
    if (query === undefined) {
      // **`unknown`으로 떨어뜨리지 않는다**(판정 B-2와 같은 근거). 그쪽 `display`는
      // "게이트 프로필에 등록되지 않았다"는 **거짓 사유**를 보이고, 승인 화면이
      // 거짓말하면 게이트 전체가 무의미하다.
      //
      // **자동 허용을 무효화하는 플래그는 세우지 않는다 — 여기가 `memoryWrite`와
      // 갈리는 유일한 자리다**(APPROVAL-GATE §3). 저쪽에서 그 필드가 하는 일은 자동
      // 허용과 학습 키를 지우는 것인데 이 분류에는 둘 다 없어서 세워도 **아무것도
      // 바꾸지 않는다.** 효과 없는 상태를 세우면 다음 사람이 "이건 왜 있나"를 묻고
      // 그 답이 «없다»면 그것은 그냥 표면이다. fail-closed는 매번 승인으로 이미
      // 무조건 지켜진다 — 저쪽이 플래그로 사는 마찰을 이쪽은 기본값으로 갖는다.
      return {
        subject,
        primary: toolName,
        // 표시 본문을 비운다. 비우지 않으면 `primary`(=도구 이름)가 표시 본문으로
        // 흘러 승인 화면이 **"질의: web_search"**라고 스스로 위조한다
        displayBody: "",
        notes: [
          `검색 질의 인자("${profile.queryParam}")를 문자열로 읽지 못했다 — 무엇을 검색하는지 보여줄 수 없다. 검색은 언제나 승인 대상이므로 그대로 승인을 묻는다`,
        ],
      };
    }
    return { subject, primary: toolName, displayBody: query, notes: [] };
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
 * 대상을 식별하지 못하는 origin인가. 전역 `URL`은 호스트가 없는 스킴에 대해
 * `origin`을 문자열 `"null"`로 직렬화한다(`file:`·`data:`·`about:`·`javascript:`).
 * 빈 문자열도 함께 본다 — 어느 쪽이든 "이것이 무엇인지 못 알아냈다"는 뜻이고,
 * 그런 값을 영구 학습 키로 쓰는 것이 넓은 키의 정확한 실패 양태다.
 *
 * [미규정 EP-2] `blob:https://example.com/…`은 origin을 감싼 스킴에서 **상속**해
 * `https://example.com`으로 직렬화된다 — 즉 blob URL이 그 호스트의 학습 키에
 * 합쳐진다. 여기서 갈라내지 않는 이유는 그것이 곧 스킴 정책이고, 스킴 판정의
 * 소유자는 `packages/web`이기 때문이다(WEB-ACCESS §4). 실효도 없다: 웹 패키지가
 * `http(s)` 밖의 스킴을 거부하므로 이 키로 실제 가져오기가 일어나지 않는다.
 */
function isOpaqueOrigin(origin: string): boolean {
  return origin === "null" || origin.length === 0;
}

/**
 * allowlist 키. 셸은 **작업 디렉터리 + 정규화된 명령 전체**가 키다
 * (`shell:<cwd>:<명령>` — APPROVAL-GATE §4, 2026-09-09 개정).
 *
 * 명령 **전체**인 근거: 첫 토큰(`git`)을 키로 삼으면 `git status`를 허용한 사용자가
 * `git push --force`까지 허용한 것이 된다. 학습이 좁아 마찰이 늦게 줄지만, 넓은 키는
 * 사용자가 승인한 적 없는 것을 통과시킨다.
 *
 * **`cwd`가 들어가는 근거**는 두 가지이고 둘 다 실물에서 왔다. ① 승인 화면은
 * `shellExec`에 `작업 디렉터리:` 줄을 **조건 없이** 싣는데(아래 `renderSubjectDisplay`
 * 호출) 키가 그것을 버리면 **사용자가 승인한 것보다 넓은 것이 학습된다** — 첫 토큰 키를
 * 배제한 것, 불투명 origin에 키를 안 주는 것과 같은 실패 양태다. ② allowlist 파일은
 * `~/.neo-agent/allowlist` **하나**이고 워크스페이스마다 갈리지 않는데 워크스페이스
 * 루트는 neo-agent를 띄운 디렉터리다 — 그래서 `shell:npm test`의 유효 범위는
 * 「이 프로젝트 어디서나」가 아니라 **「사용자가 이 에이전트를 띄우는 모든 프로젝트에서」**
 * 였다. `npm test`·`make`·`./x.sh`는 디렉터리가 다르면 다른 프로그램이다.
 *
 * **마찰은 판정이 갈리는 자리에만 는다** — `cwd` 미지정은 워크스페이스 루트로 풀리므로
 * (위 `resolveSubject`의 `?? "."`) 루트에서 도는 명령의 키는 값 하나로 안정된다.
 *
 * **`cwd`는 해석된 절대 경로를 평문으로 쓴다.** 해시(OpenClaw 2.0 `sha256:cwd-argv:v1:`)를
 * 안 쓰는 이유는 allowlist 파일이 사용자가 읽고 지울 수 있어야 하고 그것이 학습을 회수하는
 * 유일한 수단이기 때문이다(게이트는 파일을 재읽기하지 않는다 — APPROVAL-GATE §5).
 * 워크스페이스 상대 경로도 쓰지 않는다 — 서로 다른 워크스페이스의 같은 상대 위치가
 * 한 키가 되어 위 ②의 결함을 다른 옷으로 재생산한다.
 *
 * **셸 연산자가 있으면 키를 주지 않는다** — `ls`를 학습시킨 뒤 `ls; rm -rf ~`가
 * 통과하는 숏컷 차단(APPROVAL-GATE §2 계층 6). **`cwd`가 키 문법을 깨뜨려도 마찬가지다**
 * (`cwdBreaksKeySyntax` — 근거는 그 함수가 든다). 키가 없으면 "항상 허용" 선택지
 * 자체가 프롬프트에 제공되지 않는다.
 *
 * **옛 형식(`shell:<명령>`) 키의 마이그레이션은 없다** — 옛 줄은 매칭되지 않고 파일에
 * 죽은 줄로 남는다. 지우는 코드를 두면 §5의 「allowlist는 추가만」이 깨진다.
 *
 * 파일 도구는 해석된 절대 경로가 키다. 경로 단위라 범위가 좁고, "이 파일은 늘
 * 고쳐도 된다"는 사용자 의사를 그대로 표현한다. **§7이 2026-08-06에 확정했다** —
 * 미결이 아니고, 키 형식까지 그 절에 적혀 있다.
 *
 * `webFetch`는 **origin**이 키다(스킴+호스트+포트, WEB-ACCESS §6). 경로·쿼리를
 * 넣으면 쿼리가 바뀔 때마다 학습이 무효가 되어 아무것도 학습되지 않고, 도메인
 * 접미사로 넓히면 서브도메인 탈취에 열린다 — 호스트 단위가 그 둘 사이의 유일한
 * 지점이다. **표기는 전역 `URL.origin` 직렬화를 그대로 쓴다**: 기본 포트는
 * 생략되고(`https://example.com`) 비기본 포트는 나타난다(`https://example.com:8443`).
 * 포트를 덧붙이거나 깎는 코드는 그 자체로 또 하나의 정규화 규칙이 되고, 이 키는
 * `~/.neo-agent/allowlist`에 **영속**되므로 나중에 표기를 바꾸면 사용자의 학습이
 * 이유 없이 통째로 무효가 된다(APPROVAL-GATE §4).
 */
function allowlistKey(subject: GateSubject, canonical: string): string | undefined {
  if (subject.kind === "unknown") return undefined;
  if (subject.kind === "shellExec") {
    if (canonical.length === 0 || hasShellOperator(canonical)) return undefined;
    if (cwdBreaksKeySyntax(subject.cwd)) return undefined;
    return `shell:${subject.cwd}:${canonical}`;
  }
  if (subject.kind === "webFetch") {
    return isOpaqueOrigin(subject.origin) ? undefined : `webFetch:${subject.origin}`;
  }
  // `memoryWrite`에는 **키를 주지 않는다**(APPROVAL-GATE §3). 자동 허용 대상이라
  // 학습할 것이 없고, 키를 주면 오염·위험 플래그로 프롬프트에 도달했을 때의
  // "항상 허용"이 **그 예외 상황을 영구 학습**해 버린다 — 불투명 origin에 키를
  // 주지 않는 것과 같은 기계다. 아래 마지막 return으로 떨어지면 경로 인자가 없는
  // 이 분류가 `memoryWrite:undefined`라는 키를 얻는다.
  if (subject.kind === "memoryWrite") return undefined;
  // `webSearch`에도 **키를 주지 않는다**(APPROVAL-GATE §3). 기계는 위와 같고 근거가
  // 다르다 — 저쪽은 *학습할 것이 없어서*(자동 허용 대상), 이쪽은 *학습해도 방어가
  // 안 늘어서*다: 검색 엔드포인트가 상수 하나라 호스트 단위 학습 키의 정의역이
  // 원소 하나이고 첫 승인이 그것을 즉시 소진한다(WEB-ACCESS §6). 키가 없으면
  // "항상 허용" 선택지가 애초에 서지 않는다 — 새 정책 계층이 아니라 기존 기계의 재사용이다.
  if (subject.kind === "webSearch") return undefined;
  return `${subject.kind}:${subject.path}`;
}

/**
 * 계층 4b의 경고 문면. **"이 런이 외부 페이지를 가져왔다"는 취지가 사용자에게
 * 읽혀야 하고, 위험 패턴 경고와 구분 가능해야 한다**(APPROVAL-GATE §2 계층 4b).
 *
 * 이 문장이 없으면 사용자는 "왜 학습해 둔 명령을 또 묻지?"를 알 수 없고, 이유를
 * 모르는 마찰은 승인 피로를 거쳐 무조건 allow로 간다 — 그것이 게이트가 실제로
 * 무력화되는 경로다. 위험 패턴 경고가 `위험 패턴(id) — …` 형태이므로 접두를
 * 달리해 한눈에 갈린다.
 *
 * 정책 자체(무엇이 오염원이고 수명이 얼마인가)는 코드 상수다 — 설정으로 열면
 * 프로세스 안에서 도는 코드가 오염 추적을 끌 수 있게 된다.
 *
 * **문면은 재량이지만 이 값은 안정된 식별 수단으로 export한다**(2026-08-09 판정
 * C-9 — `APPROVAL-GATE.md` §2 계층 4b). 오염 경고인지를 문자열 검사로 알아내려면
 * 검사하는 쪽이 문면에 결합하고, 그 순간 "구분 가능해야 한다"가 실제로는 "이 문장을
 * 유지해야 한다"로 굳는다 — 재량이 재량이 아니게 된다. 위험 패턴 경고가 `위험
 * 패턴(<id>)` 꼴로 id를 싣는 것과 같은 방향이다.
 */
export const TAINT_WARNING =
  "외부 콘텐츠 오염 — 이 런에서 외부 페이지를 가져왔다. 가져온 내용이 이 호출을 지시했을 수 있어, 자동 허용과 학습해 둔 '항상 허용'을 무시하고 다시 묻는다";

/**
 * 오염 런의 `memoryWrite` **사전 고지** — `TAINT_WARNING`과 **별개의 문장이다**
 * (APPROVAL-GATE §2 계층 5, 판정 B-5).
 *
 * 오염 런에서는 게이트가 허용을 정직하게 이행한 뒤 **도구 자신이** 저장을 거부한다
 * (`MEMORY.md` §5 — 강제 지점은 게이트가 아니라 도구다). 즉 사용자에게는 허용
 * 버튼이 보이는데 눌러도 아무 일이 일어나지 않는다. 이것은 계층 4b가 오염 시
 * `allowAlwaysKey`를 지우는 근거("선택지가 보이는데 눌러도 아무 일이 없다 = 가시성
 * 원칙 위반")와 **같은 양태**다. 다른 점은 사후에 도구가 사유를 밝힌다는 것뿐인데,
 * 가시성 원칙이 보호하려는 것은 **버튼을 누르는 시점의 판단**이라 그것으로는 부족하다.
 *
 * 그래서 면제(4b를 `memoryWrite`에 한해 끄기)가 아니라 **사전 고지**가 계약이다 —
 * 마찰을 없애는 대신 마찰의 이유를 보이게 한다. 이유 없는 마찰이 승인 피로를 부르는
 * 것이지 마찰 자체가 문제가 아니다.
 *
 * **문면은 재량이되 이 값은 안정된 식별 수단으로 export한다**(`TAINT_WARNING`과 같은
 * 근거 — 판정 C-9). 문면에 검사를 걸면 재량이 재량이 아니게 된다.
 */
export const MEMORY_TAINT_REFUSAL_WARNING =
  "오염 런의 메모리 저장 — 여기서 허용해도 메모리 도구가 저장을 거부한다. 외부에서 가져온 내용이 지시한 기억은 이후 모든 세션에 남으므로, 저장이 필요하면 이 런이 끝난 뒤 직접 다시 요청한다";

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

  // 2. 사용자 deny 규칙 — **모드보다 앞이다**(2026-08-06 개정). deny 규칙은 승인
  //    모드와 독립된 사용자 의사표시이고, `off`의 의미는 "매번 묻지 마라"이지
  //    "내가 금지한 것을 풀어라"가 아니다. 설정 하나를 끄면 다른 설정이 함께 꺼지는
  //    은닉된 결합은 가시성 원칙(ARCHITECTURE §2.6) 위반이기도 하다.
  for (const rule of gate.denyRules) {
    if (normalized.variants.some((text) => rule.matches(text))) {
      return {
        decision: "block",
        layer: "deny-rule",
        reason: `Approval gate: blocked by the user deny rule "${rule.source}". The user explicitly forbade this — do not try to work around it; propose a different approach.`,
      };
    }
  }

  // 3. 모드 — denied·하드라인·deny 규칙 뒤라는 위치가 계약이다
  if (gate.mode === "off") {
    return { decision: "allow", layer: "mode-off" };
  }

  // 4. 위험 패턴 — 차단이 아니라 플래그. **매트릭스보다 앞이다**(2026-08-06 개정):
  //    자동 허용의 근거는 "읽기는 마찰 대비 이득이 없다"인데, 위험 플래그가 붙은
  //    읽기(워크스페이스 안의 `id_rsa` 등)는 그 전제가 성립하지 않는다.
  //     `webFetch`는 명령이 아니므로 `"path"` 쪽 목록을 시도한다 — 실질적으로
  //     크리덴셜 경로 패턴 하나이고, `https://…/.aws/credentials` 같은 URL이
  //     플래그되는 것은 안전한 방향의 오탐이다(대가는 "한 번 더 묻는다"뿐).
  //     [미규정 EP-1] — 계약은 `webFetch`에 어느 위험 목록을 적용할지 말하지 않는다.
  const risks =
    subject.kind === "unknown"
      ? []
      : matchRisks(normalized.variants, subject.kind === "shellExec" ? "command" : "path");

  // 표시 위조 탐지는 **사용자가 실제로 보게 될 문자열**에 돈다. 기존 분류는 판정
  // 대상이 곧 표시 본문이라 `primary`가 그대로 들어가고, 표시 본문이 갈리는
  // `memoryWrite`·`webSearch`만 `content`·`query` 쪽에 적용된다(판정 B-3) — 둘 다
  // 모델이 제어하는 문자열이다. 메모는 이후 모든 세션의 시스템 프롬프트에 실리므로
  // 비가시·동형이의 문자가 섞인 채 마찰 없이 영속되는 것이 게이트가 막으려는 경로의
  // 가장 오래 가는 형태이고, 질의는 **승인이 유일한 방어**라 위조가 섞이면 사용자가
  // 승인한 문자열과 실제로 나가는 문자열이 갈린다(2026-09-02 `webSearch` 분류).
  // 저쪽에서 위조 흔적은 자동 허용을 무효화하지만 이쪽엔 무효화할 것이 없으므로,
  // 남는 효과는 경고가 프롬프트에 함께 실리는 것뿐이다 — **차단이 아니라 표시 정직성**.
  // 정규화 결과를 함께 넘기는 계약은 그대로다 — 같은 입력을 두 번 분석하면 표시와
  // 판정이 어긋날 수 있어서, 표시 본문은 표시 본문의 정규화 결과와 짝지어 넘긴다.
  const display =
    resolution.displayBody === undefined
      ? analyzeDisplayText(resolution.primary, normalized)
      : analyzeDisplayText(resolution.displayBody, normalizeForMatching(resolution.displayBody));

  // 4b. 오염 플래그 — 이 런에서 이미 `source: "network"` 결과가 나왔는가
  //     (WEB-ACCESS §5). **새 계층이 아니라 기존 기계의 재사용이다**: 효과가
  //     위험 패턴과 완전히 같으므로 분기를 늘리지 않고 같은 `flagged`에 합류시킨다
  //     (Footprint Ladder 1단 — 표면 증가 0). 합류의 부수 효과로 "항상 허용" 키가
  //     자동으로 사라지는데, 그것이 계약이 요구하는 바다 — 키를 만들어 프롬프트에
  //     실은 뒤 응답만 무시하면 사용자에게는 선택지가 보이는데 눌러도 아무 일이
  //     없다(가시성 원칙 위반).
  //
  //     **위치가 계약이다**: 계층 3(모드) 뒤이므로 `off`에서는 여기 도달하지 않고,
  //     계층 0~2 뒤이므로 오염돼도 denied·하드라인·deny 규칙은 그대로 차단된다.
  //     4b는 5·6을 무효화하는 플래그이지 출구가 아니라서 `GateLayer`에 값이 없다.
  const tainted = gate.taint.tainted;

  // 표시 위조 흔적도 위험 플래그와 같은 무게로 다룬다 — 사용자가 본 것과 실행될
  // 것이 다를 수 있는 문자열을 영구 학습시키는 것 자체가 우회 경로다
  // `resolution.flagged`는 **판정 사정 자체가 자동 허용을 무효화하는 경우**다
  // (지금은 `memoryWrite`의 content 판독 실패 하나 — 판정 B-2). 같은 플래그에
  // 합류시키므로 분기가 늘지 않고, 부수 효과로 allowlist 키도 함께 사라진다
  const flagged = risks.length > 0 || display.spoofed || tainted || resolution.flagged === true;

  // 5. 정책 매트릭스 — 자동 허용 대상의 정본은 `SAFE-DEFAULTS.md` §1이고 목록은
  //    `APPROVAL-GATE.md` §2 계층 5에 있다. **여기에 수를 적지 않는다** — 대상이
  //    늘 때마다 그 수가 썩고, 이 줄이 실제로 그렇게 썩은 적이 있다(2026-08-12
  //    처분. 경위는 그 커밋 메시지에 있다).
  //    `unknown`은 여기 도달해도 절대 걸리지 않는다 = fail-closed
  if (!flagged && subject.kind === "fileRead" && subject.scope === "inside") {
    return { decision: "allow", layer: "policy-matrix" };
  }
  // 자동 허용 대상 둘째 — `memoryWrite`(2026-08-09 추가, MEMORY.md §5).
  // **가시성은 성립하고 마찰은 요구되지 않았다**: 승인이 요구되는 것은 되돌리기
  // 어렵거나 범위를 알 수 없는 행동인데 메모리 쓰기는 둘 다 아니다 — 몇 KB 상한의
  // append이고, 사용자가 언제든 지울 수 있고, CLI가 호출과 결과를 그대로 렌더링한다.
  // **등록하지 않는 것은 중립이 아니다**: 미등록은 `unknown`으로 fail-closed라
  // 메모리 저장마다 프롬프트가 뜬다. `!flagged` 조건을 공유하는 것이 계약이다 —
  // 위험 플래그·오염 플래그 앞에서 `memoryWrite`는 예외가 아니다(APPROVAL-GATE §2 계층 5)
  if (!flagged && subject.kind === "memoryWrite") {
    return { decision: "allow", layer: "policy-matrix" };
  }

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
    ...(tainted ? [TAINT_WARNING] : []),
    // 오염 런의 메모리 저장은 게이트가 허용해도 **도구가 거부한다**. 버튼을 누르는
    // 시점에 그 사실을 알리지 않으면 "선택지가 보이는데 눌러도 아무 일이 없다"가
    // 되고, 그것이 계층 4b가 키를 지우는 바로 그 근거다(판정 B-5)
    ...(tainted && subject.kind === "memoryWrite" ? [MEMORY_TAINT_REFUSAL_WARNING] : []),
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
