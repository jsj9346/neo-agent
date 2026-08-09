# 파일·셸 도구 인터페이스

**`packages/tools`의 공개 계약과 워크스페이스 경계 정의의 정본.** 작성일: 2026-08-06 · 상태: 설계 확정, 구현 전.

이 문서는 `ARCHITECTURE.md` §2.8(MVP 도구 범위)·`CORE-INTERFACE.md` §6(도구 계약)·`SAFE-DEFAULTS.md` §2~§3(executor 흔적·크리덴셜 보호)을 실제 도구 계약으로 구체화한다. **경계(워크스페이스 판정 규칙, executor 경계, 도구 집합)와 계약(누가 무엇을 보장하는지)은 이 문서가 정본**이며, 시그니처 세부(필드명, 트렁케이션 기본 수치)는 구현 시 조정될 수 있다. 경계·계약을 바꾸려면 devlog에 근거를 남기고 이 문서를 먼저 고친다.

승인 게이트는 별도 모듈이다 — 정본은 `APPROVAL-GATE.md`. 이 문서의 도구는 게이트의 존재를 모른다.

참조 구현: OpenClaw `src/agents/sessions/tools/`(read/write/edit/bash, 2026-08-05 스냅샷). 복사가 아니라 이해 후 재작성. **주의: OpenClaw의 파일 도구는 워크스페이스 봉쇄를 하지 않는다**(`path-utils.ts`가 `~`·절대 경로를 자유 해석) — §3의 경계 강제는 레퍼런스에 없는 우리 고유 설계다.

---

## 1. 경계 — 패키지와 의존성

- 패키지 위치: `packages/tools`. 의존성 예산: **`zod` + `@neo-agent/core` 정확히 2개.**
- `node:fs`·`node:path`·`node:os`·`node:child_process`는 허용(도구의 본업). **`node:net`·`node:tls`·`node:http`·`node:https`·`node:sqlite` 임포트 금지** — 파일·셸 도구가 직접 네트워크·DB에 접근할 이유가 없고, 이 금지는 예산 게이트(`check-core-budget.mjs`)로 검사한다.
- **게이트와 무의존.** `packages/tools`와 `packages/gate`는 서로 임포트하지 않는다. 결합은 호스트(CLI)의 배선 한 곳에서 일어나고, 두 패키지가 공유하는 계약은 구조적 타입 호환으로 만난다(`APPROVAL-GATE.md` §3~§4). 게이트 없이도(모드 `off`, 또는 훅 미배선) 도구는 완결적으로 동작한다.
- **단 크리덴셜 denylist(§3)는 도구 자체가 강제한다.** SAFE-DEFAULTS §1 매트릭스의 "승인으로도 불가" 행은 게이트 계층이 아니라 여기가 최종 보장 지점이다 — 게이트가 꺼져 있어도, 훅이 배선되지 않았어도 동작한다.

## 2. 도구 집합 — 4종으로 닫는다

`read_file` · `write_file` · `edit_file` · `shell`. ARCHITECTURE §2.8 확정 범위의 구체화이며, 등록은 명시적 배열로 한다(CORE-INTERFACE §6 — AST 디스커버리 없음).

`ls`/`grep`/`find`는 넣지 않는다 — 셸 경유로 충분하고, "항상 허용" 학습(allowlist)이 반복 마찰을 흡수한다. **재도입 트리거**: 수동 승인 마찰 실측 후, 읽기성 전용 도구는 워크스페이스 안 자동 허용 대상이 될 수 있으므로 그때 추가를 검토한다.

이 패키지 도구의 `ToolResult.source`는 `"local"` 고정이다.

> **2026-08-08 — 이 고정값이 사실이 됐다.** 원래는 "셸이 curl을 칠 수 있으므로 거짓일 수 있는 값"이었고 그래서 `CORE-INTERFACE.md` §11에 휴리스틱 미결이 달려 있었다. 샌드박스의 `network: "none"`(`SANDBOX.md` §4)이 셸의 네트워크 도달을 실제로 끊으면서 **휴리스틱을 만드는 대신 전제를 참으로 만드는 방향으로** 해소됐다. `source: "network"`를 내는 도구는 `packages/web`의 `web_fetch` 하나이며(`WEB-ACCESS.md` §3), 그 값의 소비자는 오염 정책이다(같은 문서 §5). 단, 사용자가 `sandbox: "off"`로 옵트아웃하면 셸이 다시 네트워크에 닿으므로 그 구성에서는 이 고정값이 다시 낙관적 값이 된다 — 잔여 판정은 `CORE-INTERFACE.md` §11에 남겼다.

```typescript
// 스키마는 전부 z.strictObject (CORE-INTERFACE §6). 파라미터 이름은 시그니처 세부.
const readFileParams = z.strictObject({
  path: z.string(),                        // 상대(워크스페이스 기준)·절대·~ 허용
  offset: z.number().int().min(1).optional(),   // 시작 줄, 1-based
  limit: z.number().int().min(1).optional(),    // 최대 줄 수
});

const writeFileParams = z.strictObject({
  path: z.string(),
  content: z.string(),
});

const editFileParams = z.strictObject({
  path: z.string(),
  oldText: z.string(),                     // 파일 내 정확 일치 문자열
  newText: z.string(),
  replaceAll: z.boolean().optional(),      // 기본 false
});

const shellParams = z.strictObject({
  command: z.string(),
  cwd: z.string().optional(),              // 워크스페이스 안만 허용. 기본 = 워크스페이스 루트
  timeoutSeconds: z.number().int().min(1).optional(),  // 기본값은 구현 시 확정 (기본값 존재가 계약)
});
```

**도구별 계약:**

- **`read_file`** — MVP는 텍스트 전용. 출력은 유계(줄 수·바이트 이중 상한, 기본 수치는 구현 시 확정 — OpenClaw 기본 2000줄/50KB를 기준선으로)이며, 잘렸으면 **잘렸다는 사실과 이어 읽는 방법**(`offset` 재호출)을 결과 텍스트에 명시한다 — "도구 결과는 프롬프트다"(REUSE-MAP §2.3). 존재하지 않는 파일은 에러 텍스트에 경로를 포함해 throw.

  **이어 읽기 안내는 실제로 이어져야 한다** (2026-08-06 명문화). 안내한 `offset`으로 재호출했을 때 잘린 지점과 이어지지 않고 내용이 사라지면, 안내가 있어도 조용한 유실이다(§2.6). 따라서 바이트 상한은 **완전한 줄 경계에서만** 끊는다 — 줄 중간에서 끊고 "다음 줄부터"라고 안내하면 그 줄의 나머지가 영영 회수되지 않는다. 한 줄이 그 자체로 상한을 넘어 부분 반환이 불가피한 경우에는 **그 사실을 별도로 알린다**(이어 읽기로 회수되지 않음을 명시) — 안내가 거짓이 되는 것보다 한계를 밝히는 쪽이 낫다.
- **`write_file`** — 부모 디렉터리를 자동 생성한다. 결과에 신규 생성/덮어쓰기 여부를 명시한다(조용한 덮어쓰기 금지 — 덮어쓰기 자체는 게이트 승인 대상이고, 결과 표시는 §2.6 가시성).
- **`edit_file`** — **정확 일치만.** `oldText`가 파일에 정확히 1회 일치해야 실행한다(`replaceAll: true`면 1회 이상). 0회 일치·2회 이상 일치(replaceAll 아닐 때)·빈 `oldText`는 실행 없이 에러이며, 에러 텍스트는 일치 횟수와 다음 시도 방법(더 긴 문맥 포함, 또는 replaceAll)을 담는다. fuzzy 매칭은 채택하지 않는다(§6).
- **`shell`** — executor 경계(§4) 뒤에서만 실행한다. `cwd`는 워크스페이스 안만 허용(§3 판정으로 검증, 밖이면 실행 전 에러). timeout 기본값이 반드시 존재한다 — 무한 대기는 silent hang이다(ARCHITECTURE §2.6). 결과 텍스트에 exit code와 잘림 여부를 명시한다.

## 3. 워크스페이스 경계 — 판정 규칙 (SAFE-DEFAULTS §6 미결의 해소)

**`WorkspaceBoundary`가 이 판정의 유일한 소유자다.** 도구 실행과 게이트 정책(`APPROVAL-GATE.md`)이 **같은 인스턴스**를 주입받아 쓴다 — 판정기가 둘이면 "게이트는 안이라 했는데 도구는 밖을 읽는" 불일치가 생긴다.

```typescript
type PathScope = "inside" | "outside" | "denied";

interface WorkspaceBoundary {
  readonly root: string;                   // 생성 시 realpath로 정규화·동결 (SAFE-DEFAULTS §4)
  resolve(input: string): ResolvedPath;    // 확장·해석·판정을 한 번에
}

interface ResolvedPath {
  path: string;                            // 최종 절대 경로 (심볼릭 링크 해석 후)
  scope: PathScope;
}
```

**판정 알고리즘** (이 순서가 계약):

1. **입력 확장** — `~`/`~/…`는 홈으로 확장한다. 상대 경로는 워크스페이스 루트 기준으로 resolve한다.
2. **실경로 해석** — `realpath`로 심볼릭 링크를 해석한다. 존재하지 않는 경로(쓰기 대상)는 **존재하는 최근접 조상**의 realpath에 나머지 세그먼트(`..` 정규화 완료 상태)를 이어 붙여 판정한다.
3. **봉쇄 판정** — 해석 결과가 `root`와 같거나 그 하위인지 **경로 세그먼트 단위**로 비교한다. 문자열 prefix 비교는 금지 — `/ws`에 대해 `/ws-evil`이 통과하는 고전적 우회다.

**규칙:**

- **심볼릭 링크는 실경로 기준이다.** 워크스페이스 안의 링크가 밖을 가리키면 `outside`다. 링크 위치가 아니라 링크가 가리키는 실체가 판정 대상이다.
- **`denied` — 크리덴셜 denylist** (SAFE-DEFAULTS §3 계약 2의 실장, 게이트 무관 차단):
  - `~/.neo-agent/` **전체** (credentials만이 아니다 — 에이전트가 `config.*`를 고치면 동결 원칙이 못 막는 **다음 세션의 게이트 약화**가 되므로, 설정 디렉터리 통째로 막는다. 읽기·쓰기·편집 전부)
  - 워크스페이스의 `.env`·`.env.*` (SAFE-DEFAULTS §3 계약 4)
- 파일 도구(`read_file`/`write_file`/`edit_file`)는 실행 직전에 자체적으로 `resolve()`를 호출하고, `denied`면 실행 없이 에러 결과를 낸다(에러 텍스트에 차단 사유 명시 — 침묵 거부 금지). `outside`는 도구가 막지 않는다 — 밖 접근의 허용 여부는 게이트의 정책 판단이다(SAFE-DEFAULTS §1 매트릭스).
- **셸 명령에 대한 denylist는 완전하지 않다.** 명령 문자열에서 크리덴셜 경로 접근을 정적으로 전부 잡을 수 없다(셸 파싱의 한계). 게이트의 위험 패턴 계층이 최선 노력으로 차단하고(`APPROVAL-GATE.md` §2), env 스크러빙(§4)이 `printenv` 경로를 막지만, **우회는 가능하다** — 이것이 게이트·경계가 보안 경계가 아니라 실수 방지 장치인 이유이며(SAFE-DEFAULTS 전제), 완전 차단은 샌드박스(OS 경계) 도입의 몫이다.
- **TOCTOU는 방어하지 않는다** (정직 명시). 판정과 `open()` 사이에 심볼릭 링크를 교체하는 공격은 막지 못한다. hermes가 SSRF에서 connect 직전 재검증으로 좁힌 것처럼 도구는 **실행 시점에 재판정**하지만(게이트 판정 시점의 결과를 신뢰하지 않는다), 판정-사용 간극 자체는 남는다. 유일한 경계는 OS다.
- **봉쇄 판정(`inside`/`outside`)은 바이트 그대로 비교하고, denylist 판정(`denied`)은 대소문자를 구분하지 않는다** (2026-08-06 정정). 두 판정의 오차가 향하는 방향이 반대이기 때문이다: 대소문자 비구분 파일시스템에서 봉쇄 비교가 어긋나면 같은 디렉터리를 `outside`로 읽어 **자동 허용을 놓칠 뿐**이지만, denylist가 어긋나면 **막아야 할 것을 놓친다**. 비대칭인 위험에는 비대칭으로 대응한다.

  > 이 문서의 초판은 "realpath가 파일시스템의 실체를 반환하므로 정규화가 불필요하다"는 근거로 전부 바이트 비교를 규정했다. **그 전제는 실측으로 반증됐다** — macOS에서 `realpath(".ENV")`는 `.env`가 실재해도 입력 표기를 그대로 돌려주며, `.ENV`로 `.env`의 내용을 읽을 수 있다. 그 결과 `read_file` 한 번으로 `SAFE-DEFAULTS.md` §3 계약 2가 뚫렸다(QA 검증에서 발견).

  플랫폼별 분기(대소문자 구분 FS에서는 구분 비교)는 하지 않는다 — 같은 설정이 머신마다 다른 보안 수준이 되는 것은 `SAFE-DEFAULTS.md` §2가 샌드박스 `auto`를 기각한 것과 같은 이유로 기각한다. 항상 비구분으로 비교하면 대소문자 구분 FS에서 `.ENV`라는 **별개 파일**을 잘못 막지만, 그것은 안전 방향의 오탐이다. 유니코드 정규화(NFC/NFD)는 미결이다(§7) — 현재 denylist 대상은 전부 ASCII다.
- **`WorkspaceBoundary`는 런타임에서도 동결된다.** `root`는 타입 수준 `readonly`만으로는 부족하고 재할당이 실제로 불가능해야 한다(`SAFE-DEFAULTS.md` §4) — 판정기의 기준점이 실행 중에 바뀌면 경계 전체가 무의미해진다. 이는 코어의 `state.messages`가 "타입 수준 보증"에 그치는 것(`CORE-INTERFACE.md` §11)과 의도적으로 다르다: 그쪽은 데이터 노출이고 이쪽은 **보안 판정의 기준점**이다.

## 4. 셸 executor 경계 (SAFE-DEFAULTS §2 🧬의 실체)

`shell` 도구는 실행 백엔드를 직접 품지 않는다 — 주입된 `ShellExecutor`를 호출할 뿐이다. 샌드박스 도입은 `HostShellExecutor` → `DockerShellExecutor` **교체**이지 셸 도구 재작성이 아니다.

```typescript
interface ShellExecRequest {
  command: string;
  cwd: string;                             // 도구가 경계 검증을 마친 절대 경로
  timeoutMs: number;
}

interface ShellExecResult {
  exitCode: number | null;                 // null = 시그널 종료
  stdout: string;                          // 유계 (tail 유지)
  stderr: string;                          // 유계 (tail 유지)
  truncated: boolean;
  timedOut: boolean;
}

interface ShellExecutor {
  exec(req: ShellExecRequest, signal: AbortSignal): Promise<ShellExecResult>;
}
```

**executor 계약:**

- **env 스크러빙은 executor 책임이다** (SAFE-DEFAULTS §3 계약 3의 실장 지점). 자식 프로세스 환경 변수에서 (1) neo-agent가 크리덴셜 파일에서 로드한 시크릿 값이 실린 변수 전부, (2) 알려진 시크릿 패턴(`*_API_KEY`·`*_TOKEN`·`*_SECRET`류)을 제거한다. 정확한 패턴 목록은 구현 시 확정하되, **제거(denylist) 방향과 제거 지점(executor)이 계약**이다.
- **timeout은 executor가 강제한다.** 초과 시 프로세스 트리를 종료하고 `timedOut: true`로 보고한다 — 결과 없는 무한 대기는 silent failure다.
- **abort 시그널을 존중한다.** 중단 요청 후에도 계속 도는 프로세스는 결함이다(CORE-INTERFACE §6의 존중 의무를 executor까지 전파).
- 출력은 유계다(기본 수치는 구현 시 확정 — OpenClaw의 64KB tail을 기준선으로). 잘림은 결과에 표시된다.
- MVP 구현은 `HostShellExecutor` 하나다(`child_process` 기반, 호스트 직접 실행).

> **2026-08-08 — 교체 지점이 실제로 쓰였다.** `DockerShellExecutor`가 `packages/sandbox`에 추가된다(정본 `SANDBOX.md`). **위 인터페이스는 한 글자도 바뀌지 않았다** — 흔적(🧬) 채택이 회수된 두 번째 사례다. 기본값은 샌드박스 쪽(`on`)이고 `HostShellExecutor`는 명시적 `sandbox: "off"` 옵트아웃 경로가 된다. 위 세 계약(timeout 강제·abort 존중·출력 유계)이 **컨테이너 경계 너머에서도** 성립하는지는 별도 검증 대상이다 — `docker run` 클라이언트를 죽여도 컨테이너는 살 수 있어, 호스트에서 통과하던 테스트가 여기서 조용히 거짓이 되기 쉽다(`SANDBOX.md` §4).

## 5. 게이트와의 접점 — 이 패키지가 내보내는 것

게이트 배선(호스트가 할 일)을 위해 도구 패키지는 두 가지를 export한다. 게이트 쪽 소비 계약은 `APPROVAL-GATE.md` §3~§4가 정본이다.

- **`WorkspaceBoundary`** — §3의 판정기. 게이트의 `PathClassifier` 요구를 구조적으로 만족한다(임포트 없는 호환).
- **`TOOL_GATE_PROFILES`** — 도구 4종의 게이트 분류 테이블(어느 도구가 어떤 행동이고 어느 인자가 경로/명령인지). 게이트는 이 테이블을 설정으로 받을 뿐 도구 구현을 모른다. **테이블에 없는 도구는 게이트가 fail-closed로 처리한다**(항상 승인 프롬프트) — 새 도구 추가 시 분류 누락이 조용한 자동 허용이 되지 않게.

### 프로필 테이블의 소유 규칙 (2026-08-09 확정)

**각 도구 패키지가 자기 도구의 프로필 테이블을 export하고, 호스트(CLI)가 병합한다.**

- `packages/tools` → `TOOL_GATE_PROFILES` (파일 3종 + `shell`). **`web_fetch`는 여기 들어가지 않는다.**
- `packages/web` → `WEB_TOOL_GATE_PROFILES` (`web_fetch` 1종. `WEB-ACCESS.md` §2·§6).
- 배선: `{ ...TOOL_GATE_PROFILES, ...WEB_TOOL_GATE_PROFILES }` — `CLI-INTERFACE.md` §2 조립 지점.

대안(`packages/tools`의 테이블에 `web_fetch`를 넣기)을 택하지 않은 이유는, **tools가 소유하지 않은 도구를 선언하게 되어 "테이블에 없는 도구는 fail-closed"의 책임 소재가 흐려지기** 때문이다. 도구를 만든 패키지가 그 분류의 정본을 갖는 편이 누락을 알아채기 쉽다. 두 패키지는 서로 무의존이고(`WEB-ACCESS.md` §2), 병합은 결합이 원래 일어나기로 돼 있던 한 곳에서만 일어난다.

## 6. 레퍼런스 대비 의도적 축소

| 레퍼런스 기능 | 판정 | 근거·트리거 |
|---|---|---|
| fuzzy edit 매칭 (OpenClaw `edit-diff.ts` — NFKC 폴딩·스마트 따옴표·레벤슈타인) | 안 넣음 | 오매치는 조용히 엉뚱한 곳을 고친다(§2.6 위반 방향). 정확 일치 + 정정 유도 에러가 예측 가능. 트리거: exact 일치 실패율 실측 |
| `ls`/`grep`/`find` 전용 도구 | MVP 제외 | 셸 경유 + allowlist 학습으로 흡수. 트리거: 승인 마찰 실측(읽기성 도구는 자동 허용 가능해지므로) |
| macOS 파일명 변형 해석 (NFD·AM/PM 공백·curly quote 변형 시도) | 안 넣음 | 스크린샷 경로 UX 요구가 실재할 때 |
| `read_file` 이미지 지원 | MVP 제외 | `ToolResult`가 `ImageContent`를 이미 실을 수 있어(타입 준비됨) 추가가 싸다. 트리거: 멀티모달 워크플로 요구 |
| 터미널 백엔드 7종 (Modal, Daytona, SSH…) | executor 1종(host) | REUSE-MAP §4 기판정. 도입 시 docker 1종부터(SAFE-DEFAULTS §5) |
| 파일 뮤테이션 큐·쓰기 검증 (OpenClaw `file-mutation-queue.ts`) | 안 넣음 | 도구 실행이 순차 고정(CORE-INTERFACE §5)이라 경합이 없다. 병렬 실행 도입 시 재검토 |
| bash 영구 세션·`process` 도구 (백그라운드 프로세스 관리) | 안 넣음 | 명령 1회 실행으로 시작. 트리거: 장시간 프로세스(dev server 등) 관리 요구 실측 |

## 7. 미결 — 이 문서가 정하지 않은 것

- **트렁케이션·timeout 기본 수치** — 구현 시 확정. 계약은 "유계 + 잘림 가시화 + 기본값 존재"이지 수치가 아니다.
- **셸 결과의 `source` 휴리스틱** — CORE-INTERFACE §11 미결 유지. 그때까지 `"local"` 고정.
- **`read_file` 이미지 지원 시점** — §6 트리거.
- **Windows 지원 범위** — §3 판정은 POSIX 경로 의미론 전제다(macOS/Linux 우선). Windows 요구가 실재할 때 경로 판정을 재검증한다.
- ~~**셸 출력의 `tool_update` 스트리밍**~~ — 2026-08-06 해소: MVP CLI 렌더러는 `tool_update`를 소비하지 않는 것으로 판정됐다(`CLI-INTERFACE.md` §7). 도구의 `onUpdate` 호출은 불필요로 확정. 재론 트리거: 장시간 명령의 진행 표시 요구 실측(dev server·빌드 감시 등).
