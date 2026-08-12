/**
 * 게이트 공개 타입 — `docs/APPROVAL-GATE.md` §3·§4.
 *
 * 게이트는 도구 구현을 모른다. 도구 호출을 판정 가능한 형태로 옮기는 것은
 * 프로필 테이블(설정 데이터)이고, 경로의 실체 판정은 주입된 classifier다.
 * 그래서 이 파일에는 `packages/tools`로 가는 임포트가 없다 — 공유 계약은
 * 구조적 타입 호환으로 만나고, 결합은 호스트(CLI)의 배선 한 곳이다.
 */

/** SAFE-DEFAULTS §1이 정본. 닫힌 유니온 — `"smart"`는 소비자가 생길 때 추가한다 */
export type ApprovalMode = "manual" | "off";

/** TOOLS-INTERFACE §3의 `PathScope`와 같은 값 집합. 이름만 우리 쪽에서 다시 선언한다 */
export type PathScope = "inside" | "outside" | "denied";

/**
 * 게이트가 요구하는 경로 판정 인터페이스.
 * `packages/tools`의 `WorkspaceBoundary`가 구조적으로 만족한다 — 임포트 없는 호환.
 * **도구 실행과 반드시 같은 판정기 인스턴스를 배선한다** — 판정기가 둘이면
 * "게이트는 안이라 했는데 도구는 밖을 읽는" 불일치가 생긴다.
 */
export interface PathClassifier {
  resolve(input: string): { path: string; scope: PathScope };
}

/**
 * 도구 이름 → 판정 분류. **각 도구 패키지가 자기 도구의 정본 테이블을 export하고**
 * 병합은 호스트(CLI)의 배선 한 곳이다 — 게이트는 어느 패키지가 무엇을 등록했는지
 * 모른다. 그래서 여기에 패키지를 열거하지 않는다(열거하면 그 무지가 거짓이 된다).
 */
export type GateToolProfile =
  | { kind: "fileRead" | "fileWrite" | "fileEdit"; pathParam: string }
  | { kind: "shellExec"; commandParam: string; cwdParam?: string }
  | { kind: "webFetch"; urlParam: string }
  /**
   * 경로 인자가 **없는** 도구다(`MEMORY.md` §4.1 — 대상 파일은 `deps.dir`로 고정이고
   * 모델 입력에서 파생되지 않는다). `contentParam`은 **표시 전용**이며 판정 입력이
   * 아니다(APPROVAL-GATE §3, 판정 B-1): 판정 표면(`GateSubject`)과 표시 표면은
   * 파이프라인에서 이미 갈라져 있고, "저장될 내용을 보여야 한다"는 요구는 후자다.
   * 그럼에도 필드가 필요한 이유는 **게이트가 인자 이름을 스스로 알면 안 되기**
   * 때문이다 — `"content"`를 코드 상수로 갖는 순간 "게이트는 도구 구현을 모른다"가
   * 거짓이 된다. `pathParam`·`commandParam`·`urlParam`이 전부 "어느 인자가
   * 무엇인가"를 설정으로 넘기는 것과 같은 자리다.
   */
  | { kind: "memoryWrite"; contentParam: string };

/** 파이프라인이 소비하는 판정 대상 */
export type GateSubject =
  | { kind: "fileRead" | "fileWrite" | "fileEdit"; path: string; scope: PathScope }
  | { kind: "shellExec"; command: string; cwd: string }
  /**
   * `origin` = 스킴+호스트+포트. **allowlist 학습 단위이며 URL 전체가 아니다**
   * (WEB-ACCESS §6 — URL 전체면 쿼리가 바뀔 때마다 학습이 무효가 되어 아무것도
   * 학습되지 않는다). `scope`가 없는 것이 계약이다: URL은 경로가 아니므로
   * 경로 판정기의 관할 밖이고, `shellExec`과 같은 이유로 언제나 승인 대상이다.
   */
  | { kind: "webFetch"; url: string; origin: string }
  /**
   * **판정 대상은 "이 도구가 불렸다"는 사실 하나다 — 인자 필드가 없다**
   * (APPROVAL-GATE §3). `scope`도 없다: 대상은 언제나 `~/.neo-agent/memory/`이고
   * 그곳은 classifier가 `denied`로 판정하는 영역이라, 경로로 환원해 물으면 계층
   * 0에 걸려 **항상 block**된다 — 파일 도구를 막기 위한 판정을 그 막힘을 전제로
   * 설계된 전용 도구에 적용하는 판정 오용이다. 인자를 읽지 않는 것이 그 오용을
   * 구조적으로 막는다.
   */
  | { kind: "memoryWrite" }
  /** 프로필 미등록·인자 판독 실패. fail-closed로 항상 프롬프트 */
  | { kind: "unknown"; toolName: string };

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  subject: GateSubject;
  /** 위조 탐지 처리를 마친 표시 문자열 — CLI는 가공 없이 그대로 표시한다 */
  display: string;
  /** 위험 패턴·비가시 문자 탐지 등 경고. 프롬프트에 함께 표시 */
  warnings: readonly string[];
  /** "항상 허용" 선택 시 allowlist에 학습될 키. 없으면 그 선택지를 제공하지 않는다 */
  allowAlwaysKey?: string;
}

export type ApprovalResponse = "allow-once" | "allow-always" | "deny";

export interface ApprovalPrompt {
  ask(req: ApprovalRequest, signal: AbortSignal): Promise<ApprovalResponse>;
}

export interface AllowlistStore {
  has(key: string): boolean;
  /** 영속화는 구현체(호스트)의 몫. 게이트는 프롬프트 응답 경로에서만 호출한다 */
  add(key: string): void;
}

export interface ApprovalGateConfig {
  mode: ApprovalMode;
  denyRules?: readonly string[];
  toolProfiles: Readonly<Record<string, GateToolProfile>>;
  classifier: PathClassifier;
  allowlist: AllowlistStore;
  prompt: ApprovalPrompt;
}

/**
 * 판정이 끝난 계층. 테스트가 **순서 계약**을 검증할 수 있게 판정 결과에 싣는다 —
 * "차단됐다"만으로는 하드라인이 모드보다 먼저 평가됐는지 알 수 없다.
 *
 * **계층 4·4b(위험 패턴·오염)에 대응하는 값은 없다.** 둘은 플래그이지 출구가
 * 아니어서 판정은 5·6을 건너뛰고 7(프롬프트)에서 나간다 — verdict에 나타날 수
 * 없는 값을 유니온에 넣으면 검증할 수 없는 값이 생긴다(APPROVAL-GATE §2 계층 4b).
 */
export type GateLayer =
  | "denied-path"
  | "hardline"
  | "mode-off"
  | "deny-rule"
  | "policy-matrix"
  | "allowlist"
  | "prompt";

export type GateVerdict =
  | { decision: "allow"; layer: GateLayer }
  | { decision: "block"; layer: GateLayer; reason: string };
