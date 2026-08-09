# 승인 게이트

**`packages/gate`의 공개 계약 정본.** 작성일: 2026-08-06 · 상태: 설계 확정, 구현 전.

이 문서는 `SAFE-DEFAULTS.md` §1(기본 정책 매트릭스·모드)·`CORE-INTERFACE.md` §7(훅과 게이트의 자리)·`REUSE-MAP.md` §2.2(hermes 4계층 채택 판정)를 실제 모듈 계약으로 구체화한다. **판정 파이프라인의 순서·입출력 계약·동결 규칙은 이 문서가 정본**이며, 시그니처 세부와 패턴 목록의 구체 항목은 구현 시 조정될 수 있다. 기본 정책 값 자체(무엇이 자동 허용이고 무엇이 차단인지)는 여전히 `SAFE-DEFAULTS.md`가 정본이다.

**전제 (CORE-INTERFACE §7의 약속 이행으로 재명시): 이 게이트는 실수 방지 장치이지 보안 경계가 아니다. 적대적 LLM에 대한 유일한 경계는 OS다.** 게이트의 어떤 계층도 우회 불가능을 주장하지 않으며, 우회 가능성을 숨기지 않는 것이 이 모듈의 정직성 기준이다.

참조: hermes `tools/approval.py`(5계층 중 4계층 채택)·`tools/threat_patterns.py`(유계 필러·유니코드 순서), OpenClaw `src/infra/exec-approval-command-display.ts`(표시 위조 탐지). 전부 이해 후 재작성.

---

## 1. 경계 — 패키지와 의존성

- 패키지 위치: `packages/gate`. 의존성 예산: **`@neo-agent/core` 정확히 1개** (훅 계약 타입 소비).
- **`node:fs`·`node:child_process`·`node:net`·`node:tls`·`node:http`·`node:https`·`node:sqlite` 임포트 금지** — 게이트는 순수 판정 로직이다. 파일시스템(allowlist 영속화)·사용자 대화(프롬프트)·경로 실체 판정(classifier)은 전부 주입받는다. 이 금지는 예산 게이트로 검사한다 — 판정 모듈이 스스로 프로세스를 스폰하거나 네트워크에 나가는 경로를 기계적으로 차단하는 것이 분리의 목적이다.
- `packages/tools`와 무의존(양방향). 공유 계약(`PathClassifier`, 게이트 프로필 테이블)은 구조적 타입 호환으로 만나고, 결합은 호스트(CLI)의 배선 한 곳이다(§4).
- 코어와의 접점은 `beforeToolCall` 훅 하나다(CORE-INTERFACE §7). 코어는 게이트를 모르고, 게이트는 이벤트 스트림·루프를 모른다.

## 2. 판정 파이프라인 — 4계층 + 매트릭스

한 도구 호출에 대한 판정은 아래 순서로 흐른다. **순서가 계약이다** — 순서를 바꾸면 우회가 생긴다(예: allowlist를 위험 패턴보다 먼저 보면 위험 명령이 학습된 키로 통과한다).

```
0. denied 차단      — classifier가 "denied"(크리덴셜 경로)면 즉시 block.
                      모드 무관, 승인으로도 불가. 도구 자체 강제(TOOLS-INTERFACE §3)의 이중화
1. 하드라인 블록리스트 — 모드 무관, 항상 평가. 걸리면 즉시 block
2. 사용자 deny 규칙   — 모드 무관. 난독화 정규화 후 글로브 매칭. 걸리면 block
3. 모드 확인         — "off"면 여기서 allow (denied·하드라인·deny 규칙 뒤라는 위치가 계약)
4. 위험 패턴 플래그   — 유계 필러 정규식. 차단이 아니라 플래그:
                      자동 허용과 allowlist 숏컷을 무효화하고 프롬프트에 경고를 싣는다
4b. 오염 플래그       — 이 런에서 이미 source: "network" 결과가 나왔으면 같은 효과.
                      (2026-08-08 추가 — WEB-ACCESS.md §5)
5. 정책 매트릭스     — 자동 허용 판정 (SAFE-DEFAULTS §1: 워크스페이스 안 파일 읽기만).
                      **위험 플래그가 없을 때만** 해당하면 allow
6. 영구 allowlist    — 위험 플래그가 없을 때만 매칭. 걸리면 allow
7. 승인 프롬프트     — 주입된 ApprovalPrompt에 위임.
                      allow-once → allow / allow-always → allowlist 학습 + allow / deny → block
```

**2026-08-06 순서 개정 2건** (구현 중 발견, 사용자 확인 후 반영):

- **deny 규칙을 모드 확인보다 앞으로.** 초판은 `off`가 deny 규칙까지 껐다. deny 규칙은 승인 모드와 **독립된 사용자 의사표시**이고, `off`의 의미는 "매번 묻지 마라"이지 "내가 금지한 것을 풀어라"가 아니다. 설정 하나를 끄면 다른 설정이 함께 꺼지는 은닉된 결합은 가시성 원칙(ARCHITECTURE §2.6) 위반이기도 하다. 이제 `off`를 넘어서는 것은 denied·하드라인·deny 규칙 셋이다.
- **위험 패턴을 정책 매트릭스보다 앞으로.** 초판은 자동 허용이 위험 패턴보다 앞이라, 워크스페이스 안의 `id_rsa`·`credentials.json` 같은 파일이 **경고 없이 조용히 읽혔다**(클론한 저장소에 키가 커밋돼 있는 경우가 실재한다). 자동 허용의 근거는 "읽기는 마찰 대비 이득이 없다"인데, 위험 플래그가 붙은 읽기는 그 전제가 성립하지 않는다. 마찰은 플래그된 파일에만 생긴다.

**계층별 규정:**

- **하드라인(1)** — 의도적으로 최소(루트 FS 파괴·블록 디바이스 덮어쓰기·셧다운급만, SAFE-DEFAULTS §1). 구체 목록은 구현 시 확정하되 **"최소" 원칙이 계약이다** — 넓히면 "어차피 다 막네"가 되어 `off` 옵트인의 의미가 사라진다.

  **하드라인은 판정 대상의 종류로 건너뛰지 않는다** (2026-08-06 명문화). 셸 명령뿐 아니라 **파일 쓰기·편집의 경로**도 평가한다 — 금지되는 것은 특정 도구가 아니라 **결과**이기 때문이다. `dd of=/dev/sda`를 막으면서 `write_file({path: "/dev/sda"})`를 열어두면 같은 파괴에 다른 문으로 도달하고, "승인으로도 불가"라는 하드라인의 정의가 실효를 잃는다(QA 검증에서 발견). 읽기는 대상이 아니다 — 계약이 금지하는 것은 덮어쓰기다.
- **deny 규칙(2)** — 문법은 글로브. 매칭 전에 난독화 정규화를 적용한다: **비가시 유니코드 검사 → NFKC 정규화의 순서 고정**(hermes `threat_patterns.py` 기법 — 순서를 바꾸면 전각 동형이의어 우회가 뚫린다), 인용부호 삽입 변형(`git st""atus`)·백슬래시 변형(`r\m`) 정규화. **글로브 매칭에 정규식을 쓰지 않는다** — 와일드카드가 리터럴로 갈린 규칙(`**a**b**c**`)이 세제곱 백트래킹을 만들고, 판정 대상 텍스트는 모델이 제어하므로 그것이 곧 게이트 정지 경로다. 최악 시간이 보장되는 매칭(와일드카드 DP 등)을 쓴다.
- **위험 패턴(4)** — 정규식은 **유계 필러**(`(?:\w+\s+){0,8}` 형태)만 쓴다 — ReDoS 방지. 구체 패턴 목록은 구현 시 확정(크리덴셜 경로 접촉 명령이 여기 포함된다 — TOOLS-INTERFACE §3의 셸 한계 보완). 플래그는 **자동 허용(5)과 allowlist(6) 양쪽을 무효화**한다.
- **오염 플래그(4b)** (2026-08-08 추가) — 런 중 `ToolResult.source === "network"`인 결과가 하나라도 나오면, **그 런의 남은 모든 도구 호출**이 위험 플래그와 **똑같은 취급**을 받는다: 자동 허용(5)과 allowlist(6)가 무효화되고 경고가 프롬프트에 실린다. 차단은 아니다.

  **경고는 "이 런이 외부 페이지를 가져왔다"는 취지가 사용자에게 읽혀야 한다** (2026-08-09 명문화). 문구는 구현 재량이되 위험 패턴 경고와 구분 가능해야 한다 — 사용자가 *"왜 학습해 둔 명령을 또 묻지?"*를 알 수 없으면 마찰이 이유 없는 마찰이 되고, 이유 없는 마찰은 승인 피로를 거쳐 무조건 allow로 간다. 그것이 게이트가 실제로 무력화되는 경로다(ARCHITECTURE §2.6 가시성의 적용). [QA-C 판정 C-5]

  **`GateLayer`에 오염 식별자를 두지 않는다** (2026-08-09). 4b는 **플래그이지 출구가 아니어서** 오염된 호출은 계층 5·6을 건너뛰고 7(프롬프트)에서 나간다 — verdict에 나타날 수 없는 값을 유니온에 넣으면 테스트가 검증할 수 없는 값이 생긴다. 위험 패턴(계층 4)에 대응 식별자가 없는 것이 이미 같은 전례다. 순서 검증은 **이중 실행**으로 한다: 같은 입력을 무오염 `evaluate`로 돌려 `layer`를 확인하고, 오염 상태에서 훅으로 돌려 `{decision, reason}`이 같고 프롬프트에 닿지 않았음을 확인한다(QA-C 실증). `evaluate`에 오염 인자를 더해 계층을 직접 관측하게 하는 안은 기각한다 — 테스트 편의를 위해 판정 함수의 표면을 넓히는 일이고, 이중 실행으로 이미 성립한다. [QA-C 판정 C-6]

  **새 계층이 아니라 기존 기계의 재사용이라는 점이 채택 근거다** — 정책 효과가 위험 패턴과 동일하므로 파이프라인에 분기가 늘지 않고, 프롬프트·경고 표시 경로도 그대로다(Footprint Ladder 1단). 대상이 `web_fetch`가 아니라 **모든 도구**인 이유는 방어 시나리오가 "가져온 페이지가 다음 행동을 지시한다"이고 그 행동은 대개 셸·파일 쓰기이기 때문이다. 수명·한계·오염원의 정본은 `WEB-ACCESS.md` §5.
- **allowlist(6)** — `allow-always` 응답으로만 자란다. **셸 연산자(`&&`·`;`·`|`·리다이렉션 등)를 포함한 복합 명령은 allowlist 매칭 대상이 아니다**(hermes `_has_allowlist_shell_operator` 대응) — `ls`를 학습시킨 뒤 `ls; rm -rf`가 통과하는 숏컷을 차단한다. 이런 요청은 `allowAlwaysKey` 없이 프롬프트로 가고, "항상 허용" 선택지 자체가 제공되지 않는다.
- **프롬프트(7)** — deny는 `{ decision: "block", reason }`으로 모델에게 보인다(침묵 거부 금지, CORE-INTERFACE §7). 프롬프트 대기 중 abort 시그널이 오면 프롬프트를 취소하고 block한다(중단 의미론은 코어가 처리).

## 3. 판정 입력 — 게이트가 보는 것

게이트는 도구 구현을 모른다. 도구 호출을 판정 가능한 형태로 옮기는 것은 **프로필 테이블**(설정 데이터)이고, 경로의 실체 판정은 **주입된 classifier**다.

```typescript
/** 게이트가 요구하는 경로 판정 인터페이스.
 *  packages/tools의 WorkspaceBoundary가 구조적으로 만족한다 — 임포트 없는 호환.
 *  도구 실행과 반드시 같은 판정기 인스턴스를 배선한다 (판정 불일치 방지) */
interface PathClassifier {
  resolve(input: string): { path: string; scope: "inside" | "outside" | "denied" };
}
// `"."`은 워크스페이스 루트로 해석된다 — 셸의 `cwd` 미지정 기본값을 게이트가
// 자체 상수로 갖지 않고 classifier에게 물어보기 위한 계약이다. 게이트가 루트 값을
// 따로 알기 시작하면 도구와 판정이 어긋날 수 있다(2026-08-06 명문화).

/** 도구 이름 → 판정 분류. **각 도구 패키지가 자기 도구의 정본 테이블을 export한다**
 *  (packages/tools → TOOL_GATE_PROFILES 4종, packages/web → WEB_TOOL_GATE_PROFILES 1종).
 *  병합은 호스트(CLI)의 배선 한 곳이다 — TOOLS-INTERFACE §5 */
type GateToolProfile =
  | { kind: "fileRead" | "fileWrite" | "fileEdit"; pathParam: string }
  | { kind: "shellExec"; commandParam: string; cwdParam?: string }
  | { kind: "webFetch"; urlParam: string };          // 2026-08-09 추가

/** 파이프라인이 소비하는 판정 대상 */
type GateSubject =
  | { kind: "fileRead" | "fileWrite" | "fileEdit"; path: string; scope: "inside" | "outside" | "denied" }
  | { kind: "shellExec"; command: string; cwd: string }
  /** origin = 스킴+호스트+포트. allowlist 학습 단위이며 URL 전체가 아니다 (WEB-ACCESS §6) */
  | { kind: "webFetch"; url: string; origin: string }
  | { kind: "unknown"; toolName: string };
```

- **프로필에 없는 도구는 `unknown`이다 — fail-closed.** 매트릭스 자동 허용·allowlist 없이 항상 프롬프트로 간다. 새 도구를 추가하면서 프로필 등록을 잊어도 조용한 자동 허용이 되지 않는다.
- `shellExec`의 `scope` 판정은 없다 — 명령 문자열은 경로로 환원되지 않는다. 셸은 언제나 승인 대상이다(매트릭스).

### `webFetch` 분류 (2026-08-09 추가 — `WEB-ACCESS.md` §6의 요구)

`WEB-ACCESS.md` §6은 `web_fetch`의 allowlist 학습 단위를 **`스킴+호스트+포트`**로 규정했다. 그 학습이 성립하려면 게이트가 URL을 그 단위로 읽을 수 있어야 하고, 분류가 없으면 `unknown`으로 떨어져 **fail-closed지만 학습이 영영 불가능**해진다(`allowAlwaysKey`가 없으면 "항상 허용" 선택지 자체가 제공되지 않는다 — §4). 같은 호스트를 매번 승인하게 되면 §6이 "호스트 단위가 URL 전체와 도메인 접미사 사이의 유일한 지점"이라 판정한 결론이 실현되지 않는다.

- **게이트의 URL 파싱은 학습 키 산출을 위한 것이지 보안 판정이 아니다.** SSRF 판정의 유일한 소유자는 `packages/web`이다(`WEB-ACCESS.md` §4 — 판정기가 둘이면 어긋난다). 게이트는 전역 `URL`로 파싱해 `origin`을 뽑을 뿐이고, **파싱 실패는 `unknown`(fail-closed)으로 떨어진다.** 게이트의 파싱 결과는 차단/허용 판정에 쓰이지 않으므로 "판정기가 둘"이 되지 않는다.
- **정책 매트릭스(계층 5)는 무변경이다** — `webFetch`는 자동 허용 대상이 아니고, 학습은 계층 6(allowlist)에서만 일어난다. 최초 호스트는 항상 프롬프트다(`WEB-ACCESS.md` §6 표).
- `webFetch`의 `scope` 판정은 없다 — 경로 판정기의 관할이 아니다. `shellExec`과 같은 이유로 언제나 승인 대상이다.

## 4. 공개 인터페이스와 배선

```typescript
type ApprovalMode = "manual" | "off";     // SAFE-DEFAULTS §1이 정본. 닫힌 유니온

interface ApprovalRequest {
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

type ApprovalResponse = "allow-once" | "allow-always" | "deny";

interface ApprovalPrompt {
  ask(req: ApprovalRequest, signal: AbortSignal): Promise<ApprovalResponse>;
}

interface AllowlistStore {
  has(key: string): boolean;
  add(key: string): void;                  // 영속화는 구현체(호스트)의 몫
}

interface ApprovalGateConfig {
  mode: ApprovalMode;
  denyRules?: readonly string[];
  toolProfiles: Readonly<Record<string, GateToolProfile>>;
  classifier: PathClassifier;
  allowlist: AllowlistStore;
  prompt: ApprovalPrompt;
}

/** 반환이 곧 코어 훅 — 배선은 new Agent({ hooks: createApprovalGate(config) }) 한 줄 */
function createApprovalGate(config: ApprovalGateConfig): {
  beforeToolCall: NonNullable<AgentHooks["beforeToolCall"]>;

  /** 2026-08-08 — 오염 추적(§2 계층 4b). 호스트가 도구 결과와 런 시작에서 각각 호출한다 */
  noteToolResult(result: Pick<ToolResult, "source">): void;
  resetTaint(): void;
};
```

- **오염 추적은 훅을 더 갖지 않고 평범한 메서드로 노출한다** (2026-08-08). `afterToolCall`을 게이트가 소유해 버리면 출력 후처리(트렁케이션)라는 원래 소비자와 충돌해 호스트가 합성을 강요받는다(`CORE-INTERFACE.md` §7 — 훅 소비자는 각각 하나로 확정돼 있다). 메서드로 두면 호스트가 `afterToolCall`에서 `noteToolResult`를, `agent_start`에서 `resetTaint`를 부르면 되고, **게이트는 여전히 코어 타입만 알고 이벤트 스트림도 전송도 모른다.** 런 경계 지식은 호스트에 남는다.

- **`webFetch`의 `allowAlwaysKey`는 `webFetch:<origin>`이다** (2026-08-09). **`origin`의 표기는 전역 `URL`의 `origin` 직렬화 그대로다** — 기본 포트는 **생략**되고(`https://example.com`), 비기본 포트는 나타난다(`https://example.com:8443`). 표기를 우리가 발명하지 않는 이유는 (1) 포트를 덧붙이는 코드가 그 자체로 또 하나의 정규화 규칙이 되고, (2) 이 키는 `~/.neo-agent/allowlist`에 **영속**되므로 나중에 표기를 바꾸면 사용자의 학습이 통째로, 그리고 이유 없이 무효가 되기 때문이다(`CLI-INTERFACE.md` §10). 요구는 "기본 포트가 정규화된다"이고 — `https://example.com/`과 `https://example.com:443/`이 같은 키 — 플랫폼 직렬화가 그 요구를 구성으로 만족한다. [QA-C 판정 C-3]
- **경로·쿼리는 키에 들어가지 않는다**(URL 전체면 쿼리가 바뀔 때마다 학습이 무효가 되어 아무것도 학습되지 않는다). **도메인 접미사로 넓히지 않는다** — `https://example.com`과 `https://sub.example.com`은 다른 키이며, 서브도메인 탈취에 열지 않기 위해서다. 근거 정본은 `WEB-ACCESS.md` §6이고, 같은 문서가 **호스트 단위 학습이 쿼리스트링 유출을 막지 못한다는 것을 인정**한다 — 그 구멍을 좁히는 것은 §2 계층 4b(오염)다.
- **불투명 origin(`origin === "null"`)에는 키를 주지 않는다** (2026-08-09). `file:///a`·`data:,x`는 전역 `URL`로 **파싱에 성공**하지만 origin이 대상을 식별하지 못한다 — 순진하게 `url.origin`을 키로 쓰면 서로 다른 모든 불투명 URL이 `webFetch:null` **한 키**로 묶여, `file:///a`를 한 번 허용한 사용자가 `file:///home/user/.ssh/id_rsa`까지 허용한 셈이 된다(§7이 첫 토큰 키를 배제한 바로 그 실패 양태다). **분류는 `webFetch`로 유지하고 `allowAlwaysKey`만 제공하지 않는다** — 셸 연산자 포함 명령과 **같은 기계**다(§2 계층 6). `unknown`으로 떨어뜨리지 않는 이유는 그쪽 `display`가 "게이트 프로필에 등록되지 않았다"는 **거짓 사유**를 보이고 URL이 화면에서 사라지기 때문이다: 승인 화면이 거짓말하면 게이트 전체가 무의미하다. **게이트가 스킴 정책을 갖는 안은 기각한다** — 스킴 판정은 `packages/web`의 관할이고(`WEB-ACCESS.md` §4), 게이트가 그것을 겸하면 "판정기가 둘"이 된다. [QA-C 판정 C-4]
- **표시 위조 탐지는 게이트 책임이다** (OpenClaw `exec-approval-command-display` 재작성, REUSE-MAP §2.2 채택 확정). `display`를 만들 때 비가시 문자·동형이의 문자를 탐지해 가시 표기로 이스케이프하고 `warnings`에 싣는다. CLI가 이걸 다시 가공하면 위조 탐지가 무의미해진다 — **CLI는 그대로 표시만 한다.** 승인 UI가 거짓말하면 게이트 전체가 무의미하다.
- **텍스트의 수신자가 언어를 정한다** (2026-08-06 명문화). `reason`은 모델에게 도구 에러로 전달되므로(CORE-INTERFACE §7) **영어**로 쓴다 — 도구 구현의 에러 텍스트가 이미 영어라, 한 트랜스크립트 안에서 언어가 갈리면 모델이 보는 실패 서술이 일관되지 않는다. 반대로 `display`·`warnings`는 CLI가 사용자에게 보여주는 것이므로 **사용자 언어**를 쓴다. 두 필드가 한 객체에 있다고 해서 같은 언어여야 하는 것이 아니다 — 읽는 쪽이 다르다.
- 웹 UI 도입 시 바뀌는 것은 `ApprovalPrompt` 구현 하나다 — 게이트 모듈은 그대로다(CORE-INTERFACE §7의 배치 근거가 이 계약으로 실현된다).

## 5. 동결과 allowlist의 예외

- `mode`·`denyRules`·`toolProfiles`·`classifier`는 **생성 시 동결**된다(SAFE-DEFAULTS §4 — 시작 시 1회 읽기). 세션 중 이 값들을 바꾸는 공개 API는 존재하지 않는다.
- **allowlist는 동결의 명시적 예외다** — 세션 중 **추가만** 일어난다. 방향이 약화(허용 확대)지만 원천이 사용자의 명시적 프롬프트 응답(`allow-always`)이므로 허용한다. `AllowlistStore.add`는 게이트의 프롬프트 응답 처리 경로에서만 호출한다 — 도구·훅·모델 산출물이 프로그래밍적으로 allowlist를 넓히는 경로를 만들지 않는다(코드 리뷰 기준).
- 게이트는 allowlist 파일을 다시 읽지 않는다(재읽기 = 세션 중 설정 변경 경로). 추가는 메모리와 스토어에 동시에 반영되고, 외부 편집의 적용 시점은 다음 프로세스 시작이다.

## 6. 레퍼런스 대비 의도적 축소

| 레퍼런스 기능 | 판정 | 근거·트리거 |
|---|---|---|
| smart approval (보조 LLM 자동 승인, hermes 4계층째) | 🕐 후순위 | REUSE-MAP §2.2 기판정. 수동 승인 마찰 실측 후 |
| 승인 모드 3종(`manual/smart/off`) | 2종으로 축소 | SAFE-DEFAULTS §5 기판정. 유니온 확장은 싼 변경 |
| hermes 승인 모듈 전체 재현(4,380줄) | 핵심 기법만 | 채택: 4계층 순서·임포트 시점 동결·유계 필러·유니코드 순서·연산자 숏컷 차단. 나머지는 멀티프로파일·smart·MCP 게이팅의 요구 |
| Gateway request/wait 지연 승인 라우팅 (OpenClaw) | 안 넣음 | 프로세스 1개·운영자 1명 — 프롬프트 직대기(훅 await)로 충분. 원격 승인 요구(모바일 알림 등)가 실재할 때 |
| 승인 시 파라미터 오버라이드 병합 (OpenClaw) | 안 넣음 | "수정 후 허용" UX 요구가 실측될 때. MVP는 allow/deny 2값 + always |
| deny 규칙의 난독화 변형 전수 재현 | 핵심 정규화만 | 비가시 유니코드→NFKC 순서·인용부호·백슬래시. 목록 확장은 위협 실측 기반으로 |

## 7. 미결 — 이 문서가 정하지 않은 것

- **하드라인·위험 패턴의 구체 목록** — 구현 시 확정. 계약은 "하드라인 최소 원칙"(§2)과 "유계 필러만"(§2)이다.
- ~~**allowlist 키 정규화 규칙**~~ — 2026-08-06 구현 확정: 셸은 **정규화된 명령 전체**(`shell:npm run build`), 파일 도구는 **해석된 절대 경로**(`fileWrite:/ws/src/a.ts`). 2026-08-09 추가: `web_fetch`는 **origin**(`webFetch:https://example.com` — 전역 `URL.origin` 직렬화 그대로이므로 기본 포트는 생략된다. §4). 첫 토큰을 키로 삼으면 `git status`를 허용한 사용자가 `git push --force`까지 허용한 셈이 된다 — 학습이 좁아 마찰이 늦게 줄더라도, 승인한 적 없는 것을 통과시키는 쪽이 나쁘다. 연산자 포함 명령의 학습 불가(§2)는 계약 그대로다.
- **deny 규칙 글로브의 방언** — 구현 시 확정(`*`/`**`/`?` 지원 범위).
- ~~**allowlist 영속화 위치·포맷**~~ — 2026-08-06 해소: `CLI-INTERFACE.md` §10 (`~/.neo-agent/allowlist`, 한 줄 1키, 시작 시 1회 로드 — denylist 안이라 에이전트가 도구로 자기 allowlist를 넓힐 수 없다).
- ~~**승인 프롬프트의 CLI UX**~~ — 2026-08-06 해소: `CLI-INTERFACE.md` §9.
