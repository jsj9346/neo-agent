# 에이전트 코어 인터페이스

**코어 패키지의 공개 계약 정본.**

- 상태: 구현 완료
- 근거: packages/core/src
- 작성일: 2026-08-05
- 최종 개정: 2026-08-13(머리 — 구현 완료로 정정) · 2026-08-13(머리 — 지위 선언을 필드로, `DOC-STATUS.md` §3) · 2026-08-24(§1 — I/O성 모듈 금지의 부류 산문을 닫힌 열거로 승격. 예산 게이트 `core` 항과 집합 동일) · **2026-09-02(§11 — 셸 `source` 휴리스틱 해소 항의 도구 수 정정: `web_search` 신설로 `"network"`를 내는 도구가 둘이 됐다. 원문은 그대로 두고 정정을 덧붙였다, `K-412` T-002)**

> **2026-08-13 정정** — 이 줄은 2026-08-06 구현(`packages/core`, `db34f1a`) 이후 7일간 *"구현 전"*으로 남아 있었다. `SANDBOX.md` 머리의 2026-08-12 정정이 지목한 6개 문서 중 하나이며, 전수 대조 결과 6개 전부가 같은 부정확이었다 — 근거는 `plans/20260813-docs-headers-verify-report.md` F-1.

이 문서는 `ARCHITECTURE.md`의 확정 원칙(특히 §2.1 전송 비의존, §2.2 컴플라이언스 타입 강제, §2.4 프롬프트 캐시 보존)과 `REUSE-MAP.md`의 판정(§2.1 에이전트 루프, §2.5 프로바이더)을 실제 타입 계약으로 구체화한다. 여기의 타입 시그니처는 구현 시 세부(필드명, 제네릭 표기)가 다듬어질 수 있으나, **경계(무엇이 코어 안이고 무엇이 밖인지)와 계약(누가 무엇을 보장하는지)은 이 문서가 정본**이다. 경계·계약을 바꾸려면 devlog에 근거를 남기고 이 문서를 먼저 고친다.

참조 구현: OpenClaw `packages/agent-core/`(`agent.ts`, `agent-loop.ts`, `types.ts` — 2026-08-05 스냅샷). 복사가 아니라 이해 후 재작성이며, §9에 레퍼런스 대비 의도적으로 축소한 항목과 근거를 남긴다.

---

## 1. 경계 — 코어가 아는 것과 모르는 것

코어는 **"모델 호출 ↔ 도구 실행"의 반복**만 안다. 그 외 전부는 주입되거나 바깥에 있다.

| | 코어가 안다 | 코어는 모른다 (바깥의 일) |
|---|---|---|
| 모델 | `ModelClient` 인터페이스 (주입) | 프로바이더가 누구인지, API 키, HTTP, SDK |
| 도구 | `AgentTool` 계약, 실행 순서 | 개별 도구 구현, 승인 게이트, 샌드박스 |
| 대화 | 메모리 내 트랜스크립트, 이벤트 방출 | 세션 저장(SQLite), 이어가기, 검색 |
| 사용자 | 큐에 들어온 `AgentMessage` | CLI인지 웹인지, 렌더링, 입력 방식 |
| 설정 | 생성 시 받은 스냅샷 | 설정 파일, env, 시크릿 |

**의존성 예산: `zod` 하나.** 도구 파라미터 스키마가 코어 계약의 일부이므로 zod는 코어 의존성이다(런타임 검증 + `z.toJSONSchema()`로 모델 전송용 겸용, MCP SDK와 호환). 그 외 의존성 추가는 경계가 새고 있다는 신호로 취급하고 리뷰한다(ARCHITECTURE §2.1).

패키지 위치(스캐폴딩 시): `packages/core`. 코어는 `node:*` 내장 모듈 중에서도 **I/O성 모듈을 임포트하지 않는다** — 파일을 만지는 것은 도구 구현(코어 밖)이고, DB를 만지는 것은 세션 저장소(코어 밖)다. 그 부류가 정확히 무엇인지는 아래 줄이 닫힌 열거로 든다.

- **금지 모듈**: `node:fs`·`node:net`·`node:http`·`node:https`·`node:sqlite`·`node:child_process`·`node:worker_threads`·`node:dgram`·`node:tls`
  근거는 위 표가 이미 든다 — 모델 행의 «코어는 모른다»가 HTTP·SDK이므로 소켓 계열(`node:net`·`node:http`·`node:https`·`node:tls`·`node:dgram`)이 닫히고, 도구 행의 그것이 개별 도구 구현·샌드박스이므로 프로세스 스폰(`node:child_process`)이 닫히며, 대화 행의 그것이 세션 저장(SQLite)이므로 파일·DB(`node:fs`·`node:sqlite`)가 닫힌다. `node:worker_threads`는 그 셋을 한꺼번에 되돌리는 자리라 함께 막는다 — 워커는 자기 컨텍스트에서 위 모듈을 그대로 열 수 있어, 금지가 메인 스레드에서만 성립하면 "코어는 I/O를 하지 않는다"가 우회 가능한 상태로 남는다.
  **2026-08-24 개정 — 부류 산문을 닫힌 열거로 승격했다.** 그전까지 이 자리는 부류로만 말하고 괄호가 예시 셋(`node:fs`·`node:net`·`node:sqlite`)을 들었을 뿐이라 기계가 읽을 열거가 없었고, 예산 게이트가 이 패키지에서 막는 아홉 중 여섯이 어느 문서에도 안 적혀 있었다. **이 목록은 닫힌 목록이다**: 닫혔다는 것은 이 줄의 집합이 예산 게이트(`scripts/check-core-budget.mjs`)의 `core` 항(`IO_MODULES`)과 **집합으로 같다**는 뜻이지 여기 없는 내장이 자동으로 허용된다는 뜻이 아니다. 그 폐쇄는 파리티 검사(`packages/cli/test/budget-gate-parity.qa.test.ts`)가 **양방향 집합 동일성**으로 기계화하고, 한쪽에서 모듈을 더하거나 빼는 커밋은 그 단언과 이 줄을 함께 고치게 된다. 표기를 `node:` 접두로 통일한 근거는 `PROVIDERS.md` §2.1의 2026-08-14 선례가 든다.
  **이 아홉은 `MEMORY.md` §4.4의 아홉과 다른 집합이다** — 그쪽은 메모리 파일을 읽고 쓰는 것이 본업이라 `node:fs`가 빠지고 대신 `node:dns`가 든다. 한쪽의 열거를 다른 쪽에 복사하면 그 패키지의 본업이 막힌다.

---

## 2. 메시지 모델

MVP 역할은 3개로 닫는다. 전부 모델에 그대로 보이는 역할이므로 **레퍼런스의 `convertToLlm` 변환 계층이 필요 없다** — 프로바이더 와이어 포맷 변환은 `ModelClient` 어댑터의 책임이다(§7).

```typescript
type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; mimeType: string; data: string }; // base64
type ThinkingContent = { type: "thinking"; text: string };
type ToolCallContent = { type: "toolCall"; toolCallId: string; toolName: string; args: unknown };

interface UserMessage {
  id: string;                 // 코어 발급(§4). 와이어로 나가지 않는다
  role: "user";
  content: (TextContent | ImageContent)[];
  timestamp: number;
}

type StopReason = "end_turn" | "tool_use" | "max_tokens" | "error" | "aborted";

interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface AssistantMessage {
  id: string;                 // 코어 발급. 스트리밍 초안과 최종 메시지가 같은 id
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCallContent)[];
  stopReason: StopReason;
  errorMessage?: string;      // stopReason이 "error"·"aborted"일 때 원인. 침묵 실패 금지(§2.6)
  usage: TokenUsage;          // 비용 가시성 — 모든 응답에 필수
  timestamp: number;
}

/** 도구 결과의 유래 분류. 턴 오염(taint) 추적의 흔적 — REUSE-MAP §2.1 🧬 */
type ToolResultSource = "local" | "network";

interface ToolResultMessage {
  id: string;                 // 코어 발급
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  isError: boolean;
  source: ToolResultSource;   // 필수. 기본값 없음 — 모든 도구가 명시적으로 판정
  timestamp: number;
}

type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;
```

**결정 사항:**

- **`source`는 지금부터 필수 필드다.** 정책 집행(오염 턴에서 위험 동작 제한)은 후순위지만, 필드를 나중에 넣으면 모든 도구 구현을 재수정한다(REUSE-MAP §2.1). MVP 도구(파일·셸)는 `"local"`을 반환한다 — 셸이 curl로 외부 콘텐츠를 가져오는 경우의 휴리스틱 판정은 정책 집행과 함께 후순위.
- **커스텀 메시지 역할 없음.** 레퍼런스의 `CustomAgentMessages`(declaration merging 확장, `bashExecution`·`compactionSummary` 등)는 다중 프런트엔드·압축의 요구다. ~~압축 도입 시 `compactionSummary` 역할 추가가 예상되지만~~ → **2026-08-06 압축 설계에서 반대로 확정됐다**: 압축 요약은 **합성 `UserMessage`**로 싣고 역할을 신설하지 않는다(`COMPACTION.md` §2). 근거: 역할 3개가 전부 모델 가시적이라 변환 계층을 제거할 수 있었는데, 모델 비가시 역할이 하나라도 생기면 어댑터마다 와이어 변환 규칙이 필요해져 그 계층이 되살아난다. 닫힌 유니온은 그대로 유지된다.
- **`createUserMessage(input: UserMessageInput): UserMessage`를 공개 배럴로 내보낸다** (2026-08-06 압축 설계 확정, 같은 날 구현 완료). 세션 밖에서 만들어지는 합성 메시지(압축 요약)의 id·timestamp 발급을 코어 하나로 유지하는 수단이다 — 소비자가 직접 `randomUUID()`를 부르기 시작하면 "발급자는 코어 하나"가 코드 배치가 아니라 문서 규약으로 격하된다. `Agent` 내부의 발급도 같은 함수를 지난다(발급 지점 단일).
- **`usage`는 옵션이 아니다.** 비용이 보이지 않는 에이전트는 §2.6(가시적 결과) 위반으로 본다.
- **`id`는 코어가 발급하고 와이어로 나가지 않는다** (2026-08-06 추가, O-4 해소 — 정본은 `SESSION-STORE.md` §3). 발급자는 코어 하나다: 트랜스크립트의 소유자가 코어이므로(§5 도구 짝 정합성과 같은 자리) 어댑터와 호출자는 id를 모른다(§4·§8의 경계 타입). **스트리밍 초안과 최종 `AssistantMessage`는 같은 id를 갖는다** — 코어가 초안 생성 시 발급하고 어댑터가 준 최종 메시지에 그 id를 부여하므로 `message_start`/`message_update`/`message_end`가 상관 가능하다. **어댑터의 와이어 변환은 id를 무시한다**: 모델 페이로드에 실리면 매 요청 프롬프트 캐시(§2.4)가 깨진다. 형식은 `crypto.randomUUID()`(Node의 Web Crypto 전역 — 임포트가 없어 의존성 예산 무영향). 순서의 진실은 id가 아니라 트랜스크립트 배열 순서다. **코어는 입력 객체의 id·timestamp를 읽지 않는다** (2026-08-06 QA 명문화) — `UserMessageInput` 타입이 1차 방어이고, 타입을 우회해 실어 보내도 코어가 발급한 값만 트랜스크립트에 남는다. throw 대안은 기각 — 검사 코드가 늘고 JS 소비자만 만나는 표면이다. 같은 원리로 **어댑터가 (타입을 우회해) `done.message`에 id를 실어도 초안 id로 덮인다.**
- **`AgentMessage`의 Zod 스키마를 공개 배럴로 내보낸다.** 저장소가 DB에서 읽은 JSON을 검증하는 데 필요하다. 소비자가 자체 스키마를 정의하면 계약이 두 곳에 존재하게 되고, 코어가 유니온을 넓혔을 때 소비자가 따라오지 않아도 컴파일이 통과한다. 코어는 이미 zod를 의존하고 `validateToolArgs`를 공개했으므로(§6) 같은 종류의 표면 확장이다.
- **`ThinkingContent`는 표시·기록 전용이다** (2026-08-06 명문화). 트랜스크립트에 남고 이벤트로 방출되지만, **어댑터는 이것을 와이어로 되돌려 보내지 않는다.** 두 가지 이유다: (1) 확장 사고 블록의 재전송에는 프로바이더가 발급한 원본 서명이 필요한데 `ThinkingContent`는 텍스트만 싣는다 — 서명을 지어낼 수 없으므로 보내면 거부당한다. (2) 서명 문제를 피하려고 `text`로 바꿔 보내면 모델의 내부 추론이 다음 턴에 **사용자 발화처럼** 보이게 되어 대화 의미가 오염된다. 따라서 어댑터의 올바른 동작은 **누락**이며, 이는 결함이 아니라 계약이다. 확장 사고를 실제로 활성화할 때는 서명 왕복(콘텐츠 타입에 서명 필드 추가)을 함께 설계한다 — §10의 `ThinkingLevel` 항목과 같은 시점이다.

---

## 3. 이벤트 스트림

코어의 유일한 출력 채널. CLI 렌더러와 세션 저장소가 **같은 스트림을 구독**한다 — 이 대칭이 §2.1(전송 비의존)의 실체이고, 나중에 웹 UI도 같은 자리에 앉는다.

```typescript
type AgentEvent =
  // 런 수명주기
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }   // 이 런에서 새로 생긴 메시지들
  // 턴 수명주기 — 턴 = 어시스턴트 응답 1개 + 그 도구 호출/결과
  | { type: "turn_start" }
  | { type: "turn_end"; message: AssistantMessage; toolResults: ToolResultMessage[] }
  // 메시지 수명주기
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AssistantMessage; delta: ModelStreamEvent }  // 스트리밍 중인 어시스턴트 메시지만
  | { type: "message_end"; message: AgentMessage }
  // 도구 실행 수명주기
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; toolName: string; partial: ToolResult }
  | { type: "tool_end"; toolCallId: string; toolName: string; result: ToolResult; isError: boolean };
```

**메시지 이벤트의 방출 규칙** (2026-08-06 QA 명문화 — 현행 동작의 확정):

- **트랜스크립트에 추가되는 모든 메시지는 역할 무관 `message_start`/`message_end` 쌍으로 방출된다.** 스트리밍되는 어시스턴트 메시지만 그 사이에 `message_update`가 낀다. `message_end`가 전 메시지 필수라는 것은 저장소 계약(SESSION-STORE §4 — `message_end`만 구독)의 전제이기도 하다.
- **`message_end`·`turn_end`·`agent_end`가 싣는 것은 같은 메시지 객체다** — 동일 id의 별도 스냅샷이 아니다. 별도 스냅샷을 허용하면 먼저 구독한 저장소가 본 값과 나중 소비자가 본 값이 갈릴 수 있다.

**구독 계약** (레퍼런스의 settlement 의미론을 유지):

```typescript
type AgentEventListener = (event: AgentEvent, signal: AbortSignal) => void | Promise<void>;
type Unsubscribe = () => void;

subscribe(listener: AgentEventListener): Unsubscribe
```

- 리스너는 **구독 순서대로 await**된다. 렌더러보다 먼저 구독한 저장소 리스너는 렌더러보다 먼저 이벤트를 받는다. 이벤트 방출 사이에 리스너가 밀리면 루프도 밀린다(자연 배압).
- `agent_end`는 마지막 이벤트지만, 그 리스너들이 전부 settle한 뒤에야 에이전트가 idle이 된다. `waitForIdle()`은 이 settlement까지 기다린다 — "저장이 끝나기 전에 다음 프롬프트가 들어오는" 경합을 계약 수준에서 차단.
- **리스너 예외는 삼키지 않지만, 나머지 리스너의 전달을 취소하지도 않는다.** 한 이벤트는 항상 모든 리스너에게 전달되고, 모아둔 예외는 전달이 끝난 뒤 전파한다(2개 이상이면 `AggregateError`). 중간에 끊으면 "`agent_start`는 못 받았는데 `agent_end`는 받는" 리스너가 생겨 불변 조건 2가 리스너 단위로 깨진다. 전파된 예외는 런을 끝내고 `prompt()`가 reject한다 — `waitForIdle()`은 대기 수단이므로 던지지 않는다.
- **에러 전용 이벤트는 없다.** 모델·런타임 실패는 `stopReason: "error"` + `errorMessage`를 단 `AssistantMessage`로 트랜스크립트에 남고, 정상적인 `message_*`/`turn_end`/`agent_end` 시퀀스로 방출된다. 실패도 대화의 일부로 보이게 한다(§2.6). 크래시로 이벤트 시퀀스가 끊기는 것은 코어 결함으로 취급한다.

---

## 4. 제어 API — 큐 기반 상태 머신

```typescript
/** 입력 경계 — 호출자는 id·timestamp를 모른다. 코어가 채운다(§2) */
type UserMessageInput = Omit<UserMessage, "id" | "timestamp">;

interface AgentSessionInit {
  systemPrompt: string;
  tools: AgentTool[];
  messages?: AgentMessage[];   // 세션 이어가기: 저장소에서 읽은 과거 트랜스크립트(id 포함)
}
// `messages`에 중복 id가 있으면 생성자가 즉시 throw한다 (2026-08-06 확정 — QA 판정).
// 불변 조건 8이 금지하는 결과가 재개 경로로 실현되는 것을 막는다: 중복을 들여보내면
// 저장소의 INSERT OR IGNORE가 두 번째 메시지를 조용히 버린다(침묵 유실, §2.6 위반).
// 강제 시점은 §6 도구 등록과 같은 세션 생성 fail-fast. 재발급 대안은 기각 —
// 저장소가 이미 영속화한 id를 조용히 바꾸면 메시지 동일성이 깨진다.

interface AgentHooks {
  beforeToolCall?: (ctx: BeforeToolCallContext, signal: AbortSignal) => Promise<ToolCallDecision>;
  afterToolCall?: (ctx: AfterToolCallContext, signal: AbortSignal) => Promise<ToolResultOverride | undefined>;
}

interface AgentOptions {
  session: AgentSessionInit;
  modelClient: ModelClient;    // §7 — 프로바이더 교체 지점
  hooks?: AgentHooks;
  /** 런당 턴 수 상한 — 폭주 백스톱(기본 50). 도달 시 grace 턴 1회 후 런 종료(§5) */
  maxTurnsPerRun?: number;
}

class Agent {
  constructor(options: AgentOptions);

  subscribe(listener): () => void;

  /** 새 런 시작. 활성 런이 있으면 throw — steer/followUp을 쓰라는 뜻 */
  prompt(input: string | UserMessageInput): Promise<void>;

  /** 진행 중 끼어들기 — 현재 턴의 도구 실행이 끝난 뒤, 다음 모델 호출 전에 주입.
   *  활성 런이 없으면 throw — idle 상태의 새 입력은 prompt()로 (불변 조건 7) */
  steer(message: UserMessageInput): void;

  /** 현재 턴이 자연 종료된 뒤 **같은 런 안에서** 이어 처리할 후속 입력.
   *  새 런을 열지 않는다 — 런을 여는 API는 prompt() 하나다(§5 외부 루프).
   *  활성 런이 없으면 throw (불변 조건 7) */
  followUp(message: UserMessageInput): void;

  /** 활성 런 중단 + 양쪽 큐 비움 */
  abort(reason?: string): void;

  /** 활성 런과 모든 이벤트 리스너의 settlement까지 대기 */
  waitForIdle(): Promise<void>;

  readonly state: Readonly<AgentState>;
}

interface AgentState {
  readonly systemPrompt: string;          // 생성 시 동결 — setter 없음 (§8)
  readonly tools: readonly AgentTool[];   // 생성 시 동결 — setter 없음 (§8)
  readonly messages: readonly AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCall?: string;      // 순차 실행이므로 단수 (§5)
  readonly errorMessage?: string;
}
```

**결정 사항:**

- **CLI만 있어도 `steer`는 처음부터 넣는다**(REUSE-MAP §2.1) — 작업 중 인터럽트-리다이렉트("아니 그 파일 말고")는 1인 사용에서도 핵심 UX고, 큐 모델은 루프의 형태 자체라 나중에 덧붙이기 어렵다.
- **큐 드레인 모드는 고정** — steering·followUp 모두 한 번에 하나씩(one-at-a-time). 레퍼런스의 `QueueMode` 설정("all" | "one-at-a-time")은 채널별 요구 차이에서 나온 것으로, 설정 표면만 늘린다. 필요가 실측되면 그때 연다.
- **`abort()`는 큐도 비운다.** 레퍼런스는 중단과 큐 정리가 별도 메서드지만, 1인 CLI에서 Ctrl+C의 기대 의미는 "지금 하던 것과 예약한 것 전부 취소"다. 중단된 런의 어시스턴트 메시지는 `stopReason: "aborted"`로 트랜스크립트에 남는다(중단도 가시적 결과).
- **idle 상태의 `steer()`/`followUp()`은 throw한다** (2026-08-06, 구 O-3 해소). `prompt()`가 활성 런 중에 throw하는 것과 대칭이다. 큐 주입을 idle에 허용하면 그 메시지가 다음 런까지 남아 **먼저 친 steer가 나중에 친 프롬프트 뒤에 주입되는 순서 역전**이 생긴다(QA 재현). 대안이던 자동 승격(steer가 조용히 새 런 시작)은 "런을 여는 API는 prompt() 하나" 원칙을 깨고 실패 관찰 경로가 애매해져 기각. CLI는 catch해서 `prompt()`로 다시 보내면 된다 — 런 종료와 입력이 겹치는 경합 창은 §5의 종료 직전 드레인으로 이미 좁혀져 있다.
- **런이 닫히기 시작한 뒤의 `steer()`/`followUp()`도 throw한다** (2026-08-06 사후 검증). §5의 모든 드레인 지점을 지나 런이 닫히는 구간(큐 클리어 이후, `agent_end` 방출과 그 리스너 settlement 포함)에 도착한 큐 입력은 그 런에서 처리될 수 없다 — 받는 척하면 침묵 폐기(§2.6 위반)나 idle 잔류(불변 조건 7 위반) 중 하나가 된다. `agent_end` 리스너 안에서 부르는 경우가 여기 해당한다. idle-throw와 같은 에러이며 CLI의 대응도 같다(catch 후 `prompt()`).
- **`continue()`(트랜스크립트 재개 전용 API)는 없다.** 크래시 복구 중간 상태(마지막 메시지가 toolResult)에서의 자동 재개가 유일한 용도인데, MVP에서 그 상황은 "사용자가 다음 프롬프트를 친다"로 충분히 복구된다. 세션 이어가기는 `AgentSessionInit.messages`로 과거 트랜스크립트를 실어 새 `Agent`를 만드는 것으로 해결한다.
- **`reset()`도 없다.** 새 세션 = 새 `Agent` 인스턴스. 인스턴스 재사용으로 상태 초기화 버그 표면을 만들 이유가 없다.

---

## 5. 에이전트 루프

레퍼런스의 이중 while 구조를 유지하되 순차 실행으로 단순화한다.

```
외부 루프:  (follow-up 큐가 비고 자연 종료할 때까지)
  내부 루프:  (모델이 도구를 더 부르지 않고 **steering 큐가 빌** 때까지)
    중단 확인 → 턴 한도 확인(도달 시 grace 턴 1회 → 런 종료) → turn_start 방출
    steering 큐 드레인 → 있으면 컨텍스트에 주입
    모델 스트리밍 호출        (message_start / update / end)
    도구 호출 순차 실행       (tool_start / update / end, 각각 훅 통과)
    turn_end 방출
  follow-up 큐 드레인 → 있으면 내부 루프 재진입
agent_end 방출
```

**런 종료 직전 steering 드레인** (2026-08-06, 구 O-3 해소): 내부 루프의 종료 조건은 "도구 호출 없음 **그리고** steering 큐 빔"이다. 마지막 모델 호출이 스트리밍되는 동안 도착한 `steer()`는 — 다음 모델 호출 전 드레인 지점이 더 없더라도 — 루프가 종료되지 않고 한 턴을 더 돌아 같은 런에서 처리된다. 이 규정과 §4의 idle-throw가 합쳐져 **런 경계를 넘어 살아남는 큐 항목은 존재하지 않는다**(불변 조건 7).

**턴 한도와 grace 턴** (2026-08-06, 구 O-1 해소): 한 런의 턴 수(= 모델 호출 수, steering 재진입 포함)가 `maxTurnsPerRun`(기본 50)에 도달하면:

1. 코어가 합성 `UserMessage`(내용: 턴 한도 도달 — 도구 호출 없이 지금까지의 작업을 마무리하라. 정확한 문구는 구현 시 확정)를 트랜스크립트에 주입하고 **마지막 모델 호출 1회(grace 턴)**를 허용한다.
2. grace 턴 후 루프는 **무조건 종료**한다. grace 응답에 도구 호출이 있으면 실행하지 않고, 각 호출에 `isError: true`("턴 한도로 미실행") 합성 `ToolResultMessage`를 붙여 트랜스크립트 정합성(도구 호출-결과 짝)을 지킨다.
3. 이 경로의 런 종료는 `abort()`와 같이 **양쪽 큐를 비운다** — 백스톱 발동은 비정상 종료이고, "예약한 것 전부 취소"의 의미론을 따른다(불변 조건 7 유지).

hermes의 실전 교훈(#7915)을 그대로 계승한다: **중간 경고는 주입하지 않는다** — 진행 중 압박 메시지는 모델을 복잡한 작업에서 조기 포기하게 만든다. 알림은 소진 시점에 한 번, 요약 기회도 한 번이다. 하드 스톱(즉시 에러 종료) 대안은 긴 작업이 요약 없이 끊겨 기각 — 모델 호출 1회 비용으로 사용 가능한 마무리 답변을 얻는 쪽이 개인용 UX에 맞다. `maxTurnsPerRun`은 폭주 백스톱이지 일상 예산이 아니다 — 기본값을 낮게 잡아 정상 작업을 끊는 것이 더 나쁘다(같은 이슈의 교훈).

**비정상 종료의 도구 짝 정합성** (2026-08-06 사후 검증): 런이 어떤 경로로 끝나든(리스너 예외·훅 예외 포함) 트랜스크립트의 어시스턴트 `toolCall`은 대응하는 `ToolResultMessage` 없이 남지 않는다. 런 종료 시점에 짝 없는 도구 호출이 있으면 코어가 `isError: true` 합성 결과로 짝을 채운다 — grace 턴의 짝 채움 메커니즘을 모든 종료 경로로 일반화한 것이다. 근거: 짝 없는 트랜스크립트로 세션을 이어가면(`AgentSessionInit.messages`) 다음 API 호출이 와이어의 tool_use/tool_result 정합성 검사에서 거부된다. 정합성 검증을 모든 소비자(저장소·CLI·이후의 웹 UI)에 복제시키는 대안은 기각 — 트랜스크립트 소유자인 코어가 보장한다. 합성 짝은 grace 턴과 마찬가지로 도구 이벤트(tool_start/tool_end) 없이 `message_start`/`message_end`로만 방출된다(실행이 없었으므로).

**실패 응답의 도구 실행** (2026-08-06 명문화): `stopReason: "error"`인 응답에 실린 완성 도구 호출도 평소대로 실행된 뒤 런이 실패 종료한다. 방출된 도구 호출은 완결된 의도이고(§8 — 인자 완성 시점 방출, 잘린 호출은 애초에 도달하지 않는다), 루프는 stopReason으로 분기하지 않는다(구 O-5의 "특별 분기 없음"과 같은 자리). 중단(`aborted`)은 다르다 — 아래 중단 의미론대로 실행 없이 미실행 에러 짝이 남는다.

**도구 실행은 순차(sequential) 고정.** 레퍼런스의 병렬 실행 + 도구별 모드 오버라이드는 버리는 것이 아니라 MVP에서 뺀 것이다. 근거: (1) 승인 게이트가 MVP 필수인데, 병렬 실행 중 승인 프롬프트가 겹치는 UX는 그 자체가 설계 과제다. (2) 파일 편집 + 셸 실행 조합은 순서 의존이 잦아 병렬의 이득이 작다. 병렬 도입 트리거: 독립적인 읽기성 도구(웹 fetch 등)가 생길 때.

**중단(abort) 의미론:** `signal`은 모델 호출과 도구 실행에 전파된다. 도구는 signal을 존중할 의무가 있고(§6), 중단된 도구 호출은 `isError: true` 결과로 트랜스크립트에 남는다.

---

## 6. 도구 계약

```typescript
interface ToolResult<TDetails = unknown> {
  content: (TextContent | ImageContent)[];  // 모델이 보는 것 — "도구 결과는 프롬프트다"
  details?: TDetails;                        // UI·로그용 구조화 데이터. 모델에게 안 감
  source: ToolResultSource;                  // 필수 (§2)
}

interface ToolExecutionContext {
  toolCallId: string;
  signal: AbortSignal;                       // 존중 의무 — 중단 요청 후 계속 도는 도구는 결함
  onUpdate?: (partial: ToolResult) => void;  // 장시간 도구의 진행 스트리밍
}

interface AgentTool<TParams extends z.ZodType = z.ZodType> {
  name: string;
  label: string;                             // UI 표시용
  description: string;                       // 모델이 보는 설명 — 코드와 같은 무게로 리뷰
  paramsSchema: TParams;                     // z.strictObject 필수 — closed object
  execute(params: z.infer<TParams>, ctx: ToolExecutionContext): Promise<ToolResult>;
}
```

**계약:**

- **실패는 throw로.** 도구는 실패를 `content`에 인코딩하지 않고 throw한다. 루프가 잡아서 `isError: true`인 `ToolResultMessage`로 변환하고 에러 텍스트를 모델에게 보인다 — 모델이 다음 행동을 정정할 수 있어야 하므로 에러 메시지는 "무엇을 시도하면 되는지"까지 담는 것을 지향한다.
- **파라미터는 `z.strictObject`(closed object)만.** 스키마에 없는 필드가 오면 검증 실패 → 실행 전에 에러 결과. 모델 인자는 신뢰하지 않는다.
- **등록은 명시적 배열로.** AST 디스커버리·툴셋 합성 없음(REUSE-MAP §2.3 기각). 도구 5개에 등록 자동화는 과설계고, 등록 경로가 코드에 보이는 것이 보안 리뷰에 유리하다.
- **강제 시점은 세션 생성(fail-fast).** `z.strictObject`가 아닌 스키마와 중복 도구 이름은 `new Agent()`에서 즉시 throw한다. 잘못된 등록이 첫 도구 호출까지 살아 있지 않게 한다.
- **검증 진입점은 `validateToolArgs(tool, args): ToolArgsValidation`으로 공개한다.** 루프가 쓰는 것과 같은 함수를 도구 저작·테스트에서도 쓸 수 있게 한다. 실패는 throw가 아니라 값으로 돌아온다 — 루프가 그대로 `isError` 결과로 변환해 모델에게 보이기 때문이다.
- 도구 구현(파일·셸)은 코어 밖 별도 모듈이다. 코어는 `AgentTool` 배열을 받을 뿐, 어떤 도구가 존재하는지 모른다.

---

## 7. 훅과 승인 게이트의 자리

훅은 레퍼런스의 8종에서 **2종으로 축소**한다(REUSE-MAP §2.1 — "구체적 소비자가 없는 한 만들지 않는다").

```typescript
interface BeforeToolCallContext {
  toolCallId: string;
  toolName: string;
  args: unknown;                 // 스키마 검증 통과 후의 인자
}

type ToolCallDecision =
  | { decision: "allow" }
  | { decision: "block"; reason: string };   // reason은 모델에게 에러 결과로 전달됨

interface AfterToolCallContext {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: ToolResult;
  isError: boolean;
}

interface ToolResultOverride {
  content?: (TextContent | ImageContent)[];  // 부분 오버라이드 — 생략 필드는 원본 유지
  isError?: boolean;
}
```

- `beforeToolCall`의 반환은 **닫힌 discriminated union**이다. 레퍼런스의 `{ block?: boolean; reason?: string }`은 `block: false` + `reason` 같은 무의미 조합을 표현할 수 있다 — 불가능한 상태는 타입으로 배제한다.
- 두 훅의 소비자는 각각 확정돼 있다: `beforeToolCall` ← **승인 게이트**, `afterToolCall` ← 출력 후처리(트렁케이션 등). 세 번째 훅은 세 번째 소비자가 실재할 때.

**승인 게이트는 코어 밖이다.** 게이트 4계층(하드라인 블록리스트 → deny 규칙 → 위험 패턴 → allowlist, REUSE-MAP §2.2)은 별도 모듈로 만들고, 호스트(CLI)가 `beforeToolCall`에 배선한다. 사용자에게 물어야 할 때는 훅이 비동기로 CLI 프롬프트를 띄우고 응답까지 대기한다 — 루프는 훅을 await하므로 자연스럽게 멈춘다.

이 배치의 근거: 코어가 승인을 알면 승인 *UI*도 알아야 하고(전송 비의존 위반), 승인 정책 갱신이 코어 릴리스에 묶인다. 훅 경계 뒤에 두면 게이트는 코어와 독립적으로 진화하고, 웹 UI 도입 시 같은 게이트 모듈에 다른 프롬프트 구현만 붙인다.

단, **게이트는 실수 방지 장치이지 보안 경계가 아니다**(hermes SECURITY.md의 정직한 선언을 계승). 유일한 경계는 OS다. 이 전제는 게이트 모듈 문서(`APPROVAL-GATE.md` 머리)에 다시 명시했다.

---

## 8. 모델 프로바이더 경계 — `ModelClient`

**§3.1(구) 미결의 답.** Api/Provider 이원화(프로토콜 9종 × 라우팅 68종)는 채택하지 않고, **교체 지점 하나를 좁게 정의**한다. 이원화 재검토 트리거: 2번째 프로바이더가 실제로 생길 때(REUSE-MAP §2.5).

```typescript
/** 코어가 아는 모델의 전부 */
interface ModelClient {
  readonly modelId: string;
  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent>;
}

interface ModelToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;   // z.toJSONSchema() 산출물. 세션 시작 시 1회 변환
}

/** 변환 함수도 공개한다 — 등록 순서 보존(불변 조건 6), 비-strictObject·중복 이름은 throw */
function toModelToolSchemas(tools: readonly AgentTool[]): ModelToolSchema[];

interface ModelRequest {
  systemPrompt: string;
  messages: AgentMessage[];               // 와이어 포맷 변환은 어댑터 책임
  tools: ModelToolSchema[];
  /** 어댑터 소유(2026-08-06, 구 O-2). 코어는 채우지 않는다 — 생략 시 어댑터 기본값 */
  maxTokens?: number;
}

type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "toolcall"; toolCallId: string; toolName: string; args: unknown }  // 인자 완성 시점에 방출
  | { type: "done"; message: ModelAssistantMessage };

/** 어댑터 경계 — 어댑터도 id를 모른다(§2). 코어가 초안의 id를 최종 메시지에 부여한다 */
type ModelAssistantMessage = Omit<AssistantMessage, "id">;
```

**스트림 계약** (레퍼런스 `StreamFn` 계약 유지 — 이것이 §2.6의 하부 구조다):

- `stream()`은 요청·모델·런타임 실패로 **throw하거나 reject하지 않는다.** 모든 실패는 스트림 안에서 `stopReason: "error" | "aborted"` + `errorMessage`를 단 최종 `done` 이벤트로 인코딩한다. 어댑터의 재시도·백오프도 어댑터 안에서 끝낸다.
- `done.message.usage`는 필수다. usage를 주지 않는 어댑터는 계약 위반.
- 코어는 `done` 없이 끝난 스트림을 `stopReason: "error"`로 합성한다. 계약상 금지된 throw가 어댑터 결함으로 새어 나온 경우도 마찬가지 — 불변 조건 2(완결된 시퀀스)가 어댑터 품질보다 우선한다.
- **어댑터도 같은 태도를 와이어에 대해 취한다** (2026-08-06 명문화). 프로바이더 스트림이 종료 사유를 주지 않고 끝나면 — 빈 본문, 중간 절단, 예상 밖 콘텐츠 타입, 그리고 **예외를 던지지 않고 조용히 닫히는 중단** — 어댑터는 `end_turn`을 만들어내지 않는다. `signal.aborted`면 `"aborted"`, 아니면 `"error"`로 `errorMessage`와 함께 인코딩한다. 던져지는 실패만 처리하고 조용히 끝나는 경로를 놓치면 "비용 0의 빈 정상 응답"이 되어 침묵 실패가 된다(§2.6). 실제로 Anthropic SDK의 raw 스트림 이터레이터는 중단 시 throw하지 않고 종료한다(2026-08-06 실측).
- **`usage`는 누적하되 덮어쓰지 않는다.** 와이어가 토큰 종류별로 다른 시점에 값을 주는 경우(Anthropic은 입력·캐시 토큰을 스트림 시작에, 최종 출력 토큰을 종료 델타에 싣는다), 나중 이벤트에 없는 필드가 이전 값을 지우면 안 된다. 값이 실제로 오지 않은 필드는 이전 값을 유지한다 — 비용 가시성(§2)이 매핑 순서에 좌우되면 안 되기 때문이다.
- **스키마 변환은 `io: "input"`으로 한다.** Zod의 기본값(`"output"`)은 `.default()`가 붙은 필드를 `required`로 표기해, 생략 가능한 인자를 모델에게 필수라고 알린다(2026-08-06 실측).
- **`maxTokens`는 어댑터가 소유한다** (2026-08-06, 구 O-2 해소). 코어는 `ModelRequest.maxTokens`를 채우지 않는다 — 응답 길이 한도는 프로바이더별 상한·과금과 얽힌 어댑터 관심사이고, 코어에 설정 표면을 만들면 모델 파라미터 전반(temperature·topP…)을 코어가 떠안는 미끄러운 경사가 시작된다. 어댑터는 생성 시 config로 기본값을 받고, 요청에 값이 실려 오면 그것을 우선한다. 코어 경유로는 항상 어댑터 기본값이 쓰인다.
- **`stopReason: "max_tokens"`는 잘린 도구 호출을 만들지 않는다** (2026-08-06, 구 O-5 해소). `toolcall` 이벤트는 "인자 완성 시점에 방출"이 계약이므로, 응답이 도구 호출 중간에 잘리면 어댑터는 그 블록을 **방출하지 않는다**. 따라서 코어가 보는 것은 언제나 완성된 도구 호출뿐이고, 루프는 특별 분기 없이 평소대로 처리한다 — 완성된 호출이 있으면 실행하고 계속, 없으면 자연 종료. 잘린 응답을 이어 붙이는 continuation은 넣지 않는다(재시도 정책이 어댑터 안에서 종결된다는 원칙과 같은 자리). 사용자에게는 `stopReason`이 그대로 보이므로 잘렸다는 사실이 가려지지 않는다(§2.6).

### 컴플라이언스 게이트 (ARCHITECTURE §2.2, IDEA-002)

프로바이더 어댑터는 코어 밖(`packages/providers` — 작성 당시 예정, 2026-08-06 구현됨)이지만, 등록 계약은 코어 설계의 일부로 여기서 확정한다:

```typescript
/** 유일한 합법 증거 종류. OpenClaw의 4분류 중 vendor-documented만 표현 가능하게 남긴다 */
interface ProviderEvidence {
  kind: "vendor-documented";
  url: string;                  // 공식 문서 URL — 코드 리뷰에서 실링크 검증
}

interface ProviderRegistration {
  id: string;
  evidence: ProviderEvidence;
  /** 정직한 신원 — 템플릿 리터럴 타입으로 접두 강제. 타 제품 사칭 UA는 컴파일 불가 */
  userAgent: `neo-agent/${string}`;
  createClient(config: { apiKey: string; model: string }): ModelClient;
}
```

- OpenClaw는 `vendor-documented | vendor-hidden-api-spec | vendor-sdk-hook-only | internal-runtime`으로 **분류만 하고 강제하지 않아** 위반 경로가 살아남았다. 우리는 `ProviderEvidence.kind`가 리터럴 하나뿐인 유니온이라 다른 종류의 경로는 **타입이 존재하지 않는다.** 새 evidence 종류를 추가하려면 이 파일을 고쳐야 하고, 그 diff가 곧 컴플라이언스 리뷰 지점이다.
- MVP 어댑터는 Anthropic 공식 SDK + API 키 1개. evidence URL은 공식 API 문서를 가리킨다.
- **`packages/providers`의 의존성 예산은 `PROVIDERS.md` §2.1이 정본이다** (2026-08-14 이관 — 그전까지 이 자리가 들고 있었다: `31abb2a`. 패키지 예산은 그 패키지의 문서가 든다는 관행에 맞춘 것이고, 검사는 여전히 예산 게이트가 한다). **이 절에 남는 것은 리뷰가 언제 걸리는가다**: 새 SDK 의존은 위 `ProviderEvidence`와 **같은 diff에서 리뷰된다.** 새 프로바이더를 붙이는 일은 의존성 추가이자 컴플라이언스 판정이므로, 둘을 다른 시점에 보면 SDK가 먼저 들어오고 근거가 나중에 따라붙는 순서가 만들어진다.

---

## 9. 불변 조건 (invariants)

구현·리뷰에서 항상 확인하는 것들. 위반은 버그다.

1. **세션 중 프롬프트 상태 불변** (§2.4) — `systemPrompt`·`tools`는 생성자에서 받고 setter가 없다. 레퍼런스는 `state.tools` 재할당을 허용하지만 우리는 타입 수준에서 막는다. 도구·프롬프트를 바꾸려면 새 세션(새 인스턴스). 예정됐던 유일한 예외(컨텍스트 압축)는 **2026-08-06 설계 확정으로 코어 안에서는 발생하지 않는 것이 됐다** — 압축은 세션 분기(새 트랜스크립트를 실은 새 인스턴스)로 구현되어 이 불변 조건에 예외가 없다(`COMPACTION.md` §1).
2. **모든 런은 완결된 이벤트 시퀀스로 끝난다** (§2.6) — 성공이든 실패든 중단이든 `agent_start ... agent_end`가 닫힌다. 실패가 이벤트 없이 사라지면 코어 결함.
3. **도구 인자는 검증 전에 실행되지 않는다** — strictObject 검증 실패는 실행 없이 에러 결과.
4. **훅을 통과하지 않은 도구 실행은 없다** — 승인 게이트 우회 경로가 코어 안에 존재하지 않아야 한다.
5. **`source` 없는 도구 결과는 컴파일되지 않는다** — taint 흔적의 강제.
6. **코어는 결정적(deterministic) 순서로 직렬화한다** — 도구 목록 등 컬렉션은 등록 순서를 보존해 모델 페이로드의 바이트 안정성(캐시 적중)을 지킨다.
7. **idle이면 양쪽 큐는 비어 있다** (2026-08-06 추가) — 큐 항목은 런 경계를 넘지 못한다. 진입 차단(idle **및 런 닫힘 구간**의 `steer()`/`followUp()`은 throw, §4)과 탈출 보장(런 종료 직전 steering 드레인·비정상 종료 시 큐 클리어, §5)이 양쪽에서 이를 지킨다. 먼저 큐된 메시지가 나중 프롬프트 뒤에 주입되는 순서 역전이 계약 수준에서 불가능해진다.
8. **트랜스크립트의 모든 메시지는 유일한 id를 갖는다** (2026-08-06 추가) — 발급자는 코어 하나이고(§2), 스트리밍 초안과 그 최종 메시지만이 id를 공유한다. 소비자(저장소·CLI)의 중복 방지가 규약이 아니라 구조가 되게 하는 것이 이 조건의 목적이다.

---

## 10. 레퍼런스 대비 의도적 축소

"버린 것"이 아니라 "지금 안 넣은 것"과 "안 넣기로 한 것"을 구분해 남긴다. 다시 논의하게 될 때 이 표부터.

| 레퍼런스 기능 | 판정 | 근거 |
|---|---|---|
| `convertToLlm` / `transformContext` 변환 계층 | 안 넣음 | MVP 메시지 역할 3개가 전부 모델 가시적. 변환 책임은 `ModelClient` 어댑터로 이동. 커스텀 역할이 생기면 재검토 |
| 커스텀 메시지 역할 (declaration merging) | 안 넣음 | 소비자가 코어+CLI뿐. 닫힌 유니온 확장이 더 싸다 |
| 병렬 도구 실행 + 도구별 모드 | MVP 제외 | §5. 트리거: 독립 읽기성 도구 도입 |
| `QueueMode` 설정 | 안 넣음 | one-at-a-time 고정. 채널별 요구가 없다 |
| `continue()` / `reset()` | 안 넣음 | §4. 새 세션 = 새 인스턴스 |
| 훅 8종 (`prepareNextTurn`, `afterToolOutcome`, `resolveDeferredTool`, `getApiKey`, `onPayload`/`onResponse` 등) | 2종만 | 소비자가 실재하는 훅만. API 키는 `ModelClient` 생성 시점 주입으로 충분(단명 OAuth 토큰 요구 없음) |
| deferred tool 하이드레이션 | 안 넣음 | 점진적 툴 공개(IDEA-003)가 후순위. 도구 5개엔 숨길 것이 없다 |
| 세션 레인 직렬화 (`lanes.ts`) | 안 넣음 | 동시 다중 세션이 MVP에 없다 |
| 컴팩션 엔진 (`harness/compaction/`) | 채택 (2026-08-06 설계 확정) | 코어 밖 `packages/compaction`으로 — 정본 `COMPACTION.md`. 코어 변경은 `createUserMessage` 공개 1건뿐(§2). 토큰 추정·split-turn 이중 요약은 불채택 |
| `ThinkingLevel` 7단계 | 축소 예정 | 어댑터 옵션으로 시작(코어 관심사 아님). 모델 교체 UX가 생기면 재검토 |

---

## 11. 미결 — 이 문서가 정하지 않은 것

- ~~**셸 도구의 `source` 휴리스틱**~~ — 2026-08-08 해소: **휴리스틱을 만들지 않는다.** 샌드박스의 `network: "none"`(`SANDBOX.md` §4)이 셸의 네트워크 도달을 실제로 끊어 `"local"` 고정이 참이 됐다 — 감지로 푸는 대신 전제를 참으로 만드는 쪽으로 닫혔다. `"network"`를 내는 도구는 `web_fetch` 하나이며 소비자는 오염 정책이다(`WEB-ACCESS.md` §5). **잔여**: 사용자가 `sandbox: "off"`로 옵트아웃한 구성에서는 셸이 다시 네트워크에 닿으므로 `"local"`이 낙관적 값이 된다. curl/wget 감지는 그 구성에서도 채택하지 않는 쪽이 유력하다(셸 문자열 정적 판정의 한계는 `TOOLS-INTERFACE.md` §3이 이미 인정한 것과 같다) — 재론 트리거는 옵트아웃 구성이 실사용에서 기본이 되는 경우.
  - **2026-09-02 정정 — 그 수가 둘이 됐다.** 위 줄의 도구 수는 2026-08-08 시점의 사실이다. `WEB-ACCESS.md` §3.2의 `web_search` 신설로 `"network"`를 내는 도구는 `web_fetch`·`web_search` **둘**이며, 소비자가 오염 정책 하나인 것과 해소 판정·잔여 판정은 전부 그대로다 — **수만 고친다.** 같은 정정이 `TOOLS-INTERFACE.md` §2에도 걸린다.
- ~~**승인 게이트 기본 모드**~~ — 2026-08-06 해소: `SAFE-DEFAULTS.md` §1 (기본 `"manual"`, 읽기만 자동 허용, 시작 시 동결).
- ~~**`ModelStreamEvent`의 세부**~~ — 2026-08-06 해소: CLI 렌더링이 부분 인자 스트리밍(`input_json_delta` 대응)을 요구하지 않는 것으로 판정됐다(`CLI-INTERFACE.md` §7 — 도구 호출 표시는 인자 완성 시점이면 충분). `toolcall`의 "인자 완성 시점 방출" 계약은 그대로다. 재론 트리거: 긴 인자(대용량 파일 쓰기)의 진행 표시 요구 실측.
- ~~**세션 저장소 스키마**~~ — 2026-08-06 해소: `SESSION-STORE.md`. 코어는 여전히 저장소를 모르지만, 저장소가 요구한 **메시지 id**(§2·§4·§8·불변 조건 8)만은 코어 계약이 됐다.

### 2026-08-06 구현에서 드러난 미결 (QA 대조 리뷰 §4)

구현이 계약의 빈칸을 임의로 메운 지점들이다. **다음 소비자(CLI 렌더러·세션 저장소·프로바이더 어댑터)가 관찰된 동작에 의존하기 전에** 정한다 — 의존이 생긴 뒤에는 변경이 파괴적이 된다.

| # | 미결 | 현재 구현의 잠정 동작 | 결정 시점 |
|---|---|---|---|
| ~~O-4~~ | ~~메시지 식별자 부재~~ | **2026-08-06 해소** — `SESSION-STORE.md` §3. 두 갈래로 닫혔다: (1) 문제로 지목된 패턴(저장소가 start에 행을 만들고 end에 갱신하는 것)을 **채택하지 않는다**(초안의 `stopReason`·`usage`는 자리표시자라 저장하면 거짓 기록이 된다 — 저장소는 `message_end`만 구독). (2) 그럼에도 `AgentMessage.id`를 필수로 넣어 중복 방지를 규약이 아니라 구조로 만들었다 | 해소됨 |

> 메시지 id의 계약-구현 격차는 2026-08-06 같은 날 닫혔다(커밋 `db3f36c` — 저장소 플랜 T-002·T-003). 재개 트랜스크립트의 중복 id는 생성자 fail-fast로 확정(§4).

확정해 문서에 반영한 것(더는 미결 아님): `errorMessage`의 적용 범위(§2), followUp이 런을 쪼개지 않음(§4), 리스너 예외 의미론(§3), `io: "input"` 변환·`done` 없는 스트림 처리(§8), 도구 등록 fail-fast·`validateToolArgs` 공개(§6). **2026-08-06 해소: O-1(턴 한도 — `maxTurnsPerRun` + grace 턴, §5)·O-3(steering 큐 — 종료 직전 드레인 + idle-throw, §4·§5·불변 조건 7)·O-2(`maxTokens` 어댑터 소유, §8)·O-5(`max_tokens`는 잘린 도구 호출을 만들지 않음 — 코어 특별 분기 없음, §8).** 2026-08-06 사후 검증(`plans/20260806-core-providers-verify-report.md`)에서 추가 확정: 런 닫힘 구간의 큐 입력 throw(§4), 비정상 종료의 도구 짝 정합성(§5), 실패 응답의 도구 실행(§5). 번호는 재사용하지 않는다 — 과거 기록(devnote·QA 리포트)이 이 번호를 참조한다.

O-2·O-5는 **코어 코드를 바꾸지 않는다** — 둘 다 어댑터 책임으로 확정됐고, 코어의 현행 동작이 곧 확정된 계약이다.

> O-1·O-3 해소는 같은 날 구현에 반영됐다(계약-구현 격차 없음). 큐 클리어는 §5의 턴 한도 경로만이 아니라 **모든 비정상 종료**(에러·중단·리스너 예외)에서 일어난다 — 불변 조건 7이 무조건적이기 때문이다.

`AgentState.errorMessage`는 **직전 런에서 마지막으로 발견된 실패 사유**를 담고 다음 `prompt()`에서 초기화된다. `state.messages`·`state.tools`의 불변성은 **타입 수준 보증**이며 런타임 동결이 아니다(불변 조건 1의 문구 그대로).
