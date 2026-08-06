# 에이전트 코어 인터페이스

**코어 패키지의 공개 계약 정본.** 작성일: 2026-08-05 · 상태: 설계 확정, 구현 전.

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

패키지 위치(스캐폴딩 시): `packages/core`. 코어는 `node:*` 내장 모듈 중에서도 I/O성 모듈(`node:fs`, `node:net`, `node:sqlite`)을 임포트하지 않는다 — 파일을 만지는 것은 도구 구현(코어 밖)이고, DB를 만지는 것은 세션 저장소(코어 밖)다.

---

## 2. 메시지 모델

MVP 역할은 3개로 닫는다. 전부 모델에 그대로 보이는 역할이므로 **레퍼런스의 `convertToLlm` 변환 계층이 필요 없다** — 프로바이더 와이어 포맷 변환은 `ModelClient` 어댑터의 책임이다(§7).

```typescript
type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; mimeType: string; data: string }; // base64
type ThinkingContent = { type: "thinking"; text: string };
type ToolCallContent = { type: "toolCall"; toolCallId: string; toolName: string; args: unknown };

interface UserMessage {
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
- **커스텀 메시지 역할 없음.** 레퍼런스의 `CustomAgentMessages`(declaration merging 확장, `bashExecution`·`compactionSummary` 등)는 다중 프런트엔드·압축의 요구다. 압축 도입 시 `compactionSummary` 역할 추가가 예상되지만, 소비자가 코어+CLI뿐인 지금 닫힌 유니온 확장은 싼 변경이다. 미리 열어두지 않는다(투기적 인프라 금지).
- **`usage`는 옵션이 아니다.** 비용이 보이지 않는 에이전트는 §2.6(가시적 결과) 위반으로 본다.

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
interface AgentSessionInit {
  systemPrompt: string;
  tools: AgentTool[];
  messages?: AgentMessage[];   // 세션 이어가기: 저장소에서 읽은 과거 트랜스크립트
}

interface AgentHooks {
  beforeToolCall?: (ctx: BeforeToolCallContext, signal: AbortSignal) => Promise<ToolCallDecision>;
  afterToolCall?: (ctx: AfterToolCallContext, signal: AbortSignal) => Promise<ToolResultOverride | undefined>;
}

interface AgentOptions {
  session: AgentSessionInit;
  modelClient: ModelClient;    // §7 — 프로바이더 교체 지점
  hooks?: AgentHooks;
}

class Agent {
  constructor(options: AgentOptions);

  subscribe(listener): () => void;

  /** 새 런 시작. 활성 런이 있으면 throw — steer/followUp을 쓰라는 뜻 */
  prompt(input: string | UserMessage): Promise<void>;

  /** 진행 중 끼어들기 — 현재 턴의 도구 실행이 끝난 뒤, 다음 모델 호출 전에 주입 */
  steer(message: UserMessage): void;

  /** 현재 턴이 자연 종료된 뒤 **같은 런 안에서** 이어 처리할 후속 입력.
   *  새 런을 열지 않는다 — 런을 여는 API는 prompt() 하나다(§5 외부 루프) */
  followUp(message: UserMessage): void;

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
- **`continue()`(트랜스크립트 재개 전용 API)는 없다.** 크래시 복구 중간 상태(마지막 메시지가 toolResult)에서의 자동 재개가 유일한 용도인데, MVP에서 그 상황은 "사용자가 다음 프롬프트를 친다"로 충분히 복구된다. 세션 이어가기는 `AgentSessionInit.messages`로 과거 트랜스크립트를 실어 새 `Agent`를 만드는 것으로 해결한다.
- **`reset()`도 없다.** 새 세션 = 새 `Agent` 인스턴스. 인스턴스 재사용으로 상태 초기화 버그 표면을 만들 이유가 없다.

---

## 5. 에이전트 루프

레퍼런스의 이중 while 구조를 유지하되 순차 실행으로 단순화한다.

```
외부 루프:  (follow-up 큐가 비고 자연 종료할 때까지)
  내부 루프:  (모델이 도구를 더 부르지 않을 때까지)
    중단 확인 → turn_start 방출
    steering 큐 드레인 → 있으면 컨텍스트에 주입
    모델 스트리밍 호출        (message_start / update / end)
    도구 호출 순차 실행       (tool_start / update / end, 각각 훅 통과)
    turn_end 방출
  follow-up 큐 드레인 → 있으면 내부 루프 재진입
agent_end 방출
```

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

단, **게이트는 실수 방지 장치이지 보안 경계가 아니다**(hermes SECURITY.md의 정직한 선언을 계승). 유일한 경계는 OS다. 이 전제는 게이트 모듈 문서에 다시 명시한다.

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
  maxTokens?: number;
}

type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "toolcall"; toolCallId: string; toolName: string; args: unknown }  // 인자 완성 시점에 방출
  | { type: "done"; message: AssistantMessage };
```

**스트림 계약** (레퍼런스 `StreamFn` 계약 유지 — 이것이 §2.6의 하부 구조다):

- `stream()`은 요청·모델·런타임 실패로 **throw하거나 reject하지 않는다.** 모든 실패는 스트림 안에서 `stopReason: "error" | "aborted"` + `errorMessage`를 단 최종 `done` 이벤트로 인코딩한다. 어댑터의 재시도·백오프도 어댑터 안에서 끝낸다.
- `done.message.usage`는 필수다. usage를 주지 않는 어댑터는 계약 위반.
- 코어는 `done` 없이 끝난 스트림을 `stopReason: "error"`로 합성한다. 계약상 금지된 throw가 어댑터 결함으로 새어 나온 경우도 마찬가지 — 불변 조건 2(완결된 시퀀스)가 어댑터 품질보다 우선한다.
- **스키마 변환은 `io: "input"`으로 한다.** Zod의 기본값(`"output"`)은 `.default()`가 붙은 필드를 `required`로 표기해, 생략 가능한 인자를 모델에게 필수라고 알린다(2026-08-06 실측).

### 컴플라이언스 게이트 (ARCHITECTURE §2.2, IDEA-002)

프로바이더 어댑터는 코어 밖(`packages/providers` 예정)이지만, 등록 계약은 코어 설계의 일부로 여기서 확정한다:

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

---

## 9. 불변 조건 (invariants)

구현·리뷰에서 항상 확인하는 것들. 위반은 버그다.

1. **세션 중 프롬프트 상태 불변** (§2.4) — `systemPrompt`·`tools`는 생성자에서 받고 setter가 없다. 레퍼런스는 `state.tools` 재할당을 허용하지만 우리는 타입 수준에서 막는다. 도구·프롬프트를 바꾸려면 새 세션(새 인스턴스). 유일하게 예정된 예외는 컨텍스트 압축(후순위)이며, 그때도 세션 분기(`parent_session_id`)로 구현한다.
2. **모든 런은 완결된 이벤트 시퀀스로 끝난다** (§2.6) — 성공이든 실패든 중단이든 `agent_start ... agent_end`가 닫힌다. 실패가 이벤트 없이 사라지면 코어 결함.
3. **도구 인자는 검증 전에 실행되지 않는다** — strictObject 검증 실패는 실행 없이 에러 결과.
4. **훅을 통과하지 않은 도구 실행은 없다** — 승인 게이트 우회 경로가 코어 안에 존재하지 않아야 한다.
5. **`source` 없는 도구 결과는 컴파일되지 않는다** — taint 흔적의 강제.
6. **코어는 결정적(deterministic) 순서로 직렬화한다** — 도구 목록 등 컬렉션은 등록 순서를 보존해 모델 페이로드의 바이트 안정성(캐시 적중)을 지킨다.

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
| 컴팩션 엔진 (`harness/compaction/`) | 후순위 | 스키마 흔적(`parent_session_id`)만 선반영(REUSE-MAP §2.4). 트리거: 컨텍스트 한도 도달 실측 |
| `ThinkingLevel` 7단계 | 축소 예정 | 어댑터 옵션으로 시작(코어 관심사 아님). 모델 교체 UX가 생기면 재검토 |

---

## 11. 미결 — 이 문서가 정하지 않은 것

- **셸 도구의 `source` 휴리스틱** — 셸 결과를 언제 `"network"`로 분류할지(curl/wget 감지 등)는 taint 정책 집행과 함께 후순위. 그때까지 셸은 `"local"`.
- **승인 게이트 기본 모드** (ARCHITECTURE §3.1) — 게이트의 *자리*는 §7로 확정됐지만 기본 동작(무엇을 물어볼지)은 안전 기본값 결정의 일부로 남아 있다. 구현 전 필수 결정.
- **`ModelStreamEvent`의 세부** — 부분 인자 스트리밍(`input_json_delta` 대응) 여부는 CLI 렌더링 요구를 보고 구현 시 확정. 계약(no-throw, done 필수)은 불변.
- **세션 저장소 스키마** (ARCHITECTURE §3.2) — 이벤트 스트림을 어떻게 영속화할지는 저장소 설계의 몫. 코어는 관여하지 않는다.

### 2026-08-06 구현에서 드러난 미결 (QA 대조 리뷰 §4)

구현이 계약의 빈칸을 임의로 메운 지점들이다. **다음 소비자(CLI 렌더러·세션 저장소·프로바이더 어댑터)가 관찰된 동작에 의존하기 전에** 정한다 — 의존이 생긴 뒤에는 변경이 파괴적이 된다.

| # | 미결 | 현재 구현의 잠정 동작 | 결정 시점 |
|---|---|---|---|
| O-1 | **턴 수 상한이 없다** | 모델이 도구 호출을 계속 반환하면 내부 루프가 끝나지 않는다. 탈출 수단은 `abort()`뿐 | **CLI 플랜 전 필수** — 개인용에서 토큰이 무한정 타는 경로 |
| O-2 | `ModelRequest.maxTokens`를 누가 채우는가 | 아무도 안 채운다. `AgentOptions`에 받을 경로가 없어 코어를 통해서는 절대 설정되지 않는 죽은 필드 | 어댑터 플랜 |
| O-3 | 런 경계를 넘어 남는 steering 큐 | 모델이 도구 없이 자연 종료한 뒤 도착한 `steer()`는 드레인되지 않고 **다음 런까지 남는다.** 그 결과 먼저 친 steer가 나중에 친 프롬프트 **뒤에** 주입되어 순서가 뒤집힌다. 소실은 없고 `abort()`만 큐를 비운다 | **CLI 플랜 전** — 1인 CLI에서 실제로 밟는 경로 |
| O-4 | 메시지 식별자 부재 | `message_start`(스트리밍 초안)와 `message_end`(어댑터가 준 최종 메시지)가 **서로 다른 객체**를 싣는데 상관지을 id가 없다. 저장소가 start에 행을 만들고 end에 갱신하는 패턴이 불가능 | **세션 저장소 설계 전** |
| O-5 | `stopReason: "max_tokens"`의 루프 처리 | 도구 호출이 없으면 자연 종료, 있으면 정상 계속. 잘린 응답을 이어가도 되는지는 정책 문제 | 어댑터 플랜 |

확정해 문서에 반영한 것(더는 미결 아님): `errorMessage`의 적용 범위(§2), followUp이 런을 쪼개지 않음(§4), 리스너 예외 의미론(§3), `io: "input"` 변환·`done` 없는 스트림 처리(§8), 도구 등록 fail-fast·`validateToolArgs` 공개(§6).

`AgentState.errorMessage`는 **직전 런에서 마지막으로 발견된 실패 사유**를 담고 다음 `prompt()`에서 초기화된다. `state.messages`·`state.tools`의 불변성은 **타입 수준 보증**이며 런타임 동결이 아니다(불변 조건 1의 문구 그대로).
