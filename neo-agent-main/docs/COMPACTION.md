# 컨텍스트 압축 — 세션 분기와 요약 계약

**이 문서가 컨텍스트 압축의 정본이다.**

- 상태: 구현 완료
- 근거: packages/compaction/src
- 작성일: 2026-08-06
- 최종 개정: 2026-08-13(머리 — 지위 선언을 필드로, `DOC-STATUS.md` §3)

> 이 문서는 머리에 `상태:`가 없던 시절에도 부정확이 아니었다 — §8 표가 계약 변경 항목마다 상태를 들기 때문이다(`DOC-STATUS.md` 설계 시 참고된 두 성공 사례 중 하나). 본문 표는 그대로 두며, 머리 필드가 그것을 대체하지 않고 **기계 검사 가능한 층을 더한다.**

`ARCHITECTURE.md` §2.4가 "유일한 예외"로 예약해 둔 압축의 실체이자, REUSE-MAP §2.4·§3에서 🕐 후순위로 판정했던 항목의 채택 설계다. 사용자 확인 4건(요약 형태 / 분기 저장 / 유지 정책 / 트리거) 전부 권장안 채택 — 근거는 `devlog.md` 2026-08-06.

**불변(계약)**: 분기 모델(§2), 트리거 판정의 근거 데이터와 시점(§3), cut 규칙(§4), 요약 생성의 실패 처리(§5·§7), 분기의 원자성과 표시 의무(§6), 각 패키지 계약 변경(§8).
**조정 가능(세부)**: 기본값 수치(threshold·K·summaryMaxTokens), 요약 프롬프트 문구, 표시 문구·형식.

전제: **압축은 과거를 고쳐 쓰지 않는다.** 구 세션의 행은 단 하나도 변경·삭제되지 않으며, 압축의 산출물은 언제나 **새 세션**이다. §2.4(프롬프트 캐시)의 "유일한 예외"는 캐시를 한 번 버리는 비용을 치른다는 뜻이지, 기존 트랜스크립트를 변조한다는 뜻이 아니다.

---

## 1. 경계 — 누가 무엇을 하는가

```
packages/compaction   판정·계획·요약 생성 (순수 로직 + 주입된 ModelClient 호출)
packages/store        분기 영속화 — branchSession 한 트랜잭션 (SESSION-STORE §5)
packages/cli          오케스트레이션 — 판정 시점 소유, Agent 교체, 표시 (§2.13)
packages/core         무변경에 가깝다 — 공개 표면 1개 추가(createUserMessage)뿐 (§8)
```

- **`packages/compaction`의 의존성은 `@neo-agent/core` 하나다** (타입 + `createUserMessage` + `ModelClient`). 저장소를 모른다 — 산출물(`CompactionPlan`·요약 텍스트)을 값으로 돌려주고, 영속화와 Agent 교체는 CLI가 한다. 게이트가 classifier를 구조적 타입으로 받는 것과 같은 무의존 패턴.
- **예산 게이트 확장** — compaction이 임포트하지 않는 모듈: `node:fs`·`node:sqlite`·`child_process`·`net`·`tls`·`http`·`https`·`dns`. 트랜스크립트 전문을 다루는 패키지가 디스크·네트워크로 나가는 경로를 기계 차단한다(모델 호출은 주입된 `ModelClient`가 유일한 출구).
- **코어는 압축을 모른다.** 분기 = `AgentSessionInit.messages`에 새 트랜스크립트를 실은 **새 `Agent` 인스턴스**이므로, 코어 관점에서는 평범한 세션 생성이다. `CORE-INTERFACE.md` 불변 조건 1이 예약했던 "유일한 예외"는 실제로는 **코어 안에서 발생하지 않는다** — 프롬프트 상태 변경 API가 여전히 존재하지 않는다.

## 2. 형태 — 세션 분기 + 합성 UserMessage 요약

압축 1회의 산출물:

```
부모 세션 (그대로 보존)          자식 세션 (신규)
┌──────────────────┐            ┌────────────────────────────┐
│ msg 1..N         │  ────────▶ │ 요약 (합성 UserMessage, 신규 id) │
│ (행 변경 없음)     │  parent_   │ 유지: 최근 K user 턴 (id 그대로) │
└──────────────────┘  session_id └────────────────────────────┘
```

### 결정 사항

**요약은 합성 `UserMessage`다 — `compactionSummary` 역할을 만들지 않는다** (2026-08-06 사용자 확정). `CORE-INTERFACE.md` §2가 예상해 뒀던 역할 신설을 **채택하지 않는 것으로 확정**한다. 근거: 메시지 역할 3개가 전부 모델 가시적이라 `convertToLlm` 변환 계층을 제거할 수 있었는데(§2 결정 사항), 모델에 직접 보낼 수 없는 역할을 추가하는 순간 어댑터마다 와이어 변환 규칙(compactionSummary → user)이 필요해져 **의도적으로 제거한 계층이 되살아난다.** 코어의 grace 턴이 이미 합성 UserMessage 전례이고, CLI의 "사용자 메시지는 항상 렌더" 계약이 합성 메시지의 가시성을 이미 보장한다.

**요약 메시지의 식별은 구조적이다 — 마커 문자열이 없다.** `parent_session_id`가 있는 세션의 첫 메시지가 요약이다. 문자열 마커는 사용자 입력과 충돌할 수 있고, 체인 구조 자체가 이미 그 사실을 담고 있다.

**자식 세션은 자기완결이다** (2026-08-06 사용자 확정). 유지 메시지를 **같은 id로** 자식 세션에 복사한다 — 세션 간 데이터 의존이 없어 부모의 손상·soft-delete·(미래의) 물리 삭제가 자식에 영향을 주지 않고, `loadSession`·손상 검증의 범위가 세션 하나로 닫힌 채 유지된다. 같은 id 유지는 메시지 동일성 보존이다 — 저장소 플랜 V-1 판정(이미 영속화한 id를 조용히 바꾸면 메시지 동일성이 깨진다)과 같은 방향. 이를 위해 `messages`의 PK가 `id` → `(session_id, id)`로 바뀐다(스키마 v2 — `SESSION-STORE.md` §2). 유지 구간의 저장 중복은 K턴 분량으로 유계다.

**프롬프트 캐시**: 분기 직후 첫 모델 호출은 캐시 미스다(§2.4가 예약한 1회 비용). 그 후 요약이 트랜스크립트 머리에 고정되므로 캐시는 새 프리픽스로 즉시 재구축된다. 요약 생성 호출 자체는 시스템 프롬프트가 달라 본 대화의 캐시와 무관하다.

## 3. 트리거 — 실측 usage 기반, 런 경계에서만

**판정 근거는 추정이 아니라 실측이다.** 모든 `AssistantMessage.usage`가 계약 필수이므로(CORE-INTERFACE §2), 현재 컨텍스트 크기는 트랜스크립트의 **마지막 유효 어시스턴트 응답**의 `input + cacheRead + cacheWrite + output`이다. `stopReason`이 `"error"`·`"aborted"`인 응답의 usage는 불완전할 수 있어 건너뛴다(OpenClaw `getAssistantUsage`와 같은 판정). 마지막 유효 응답 이후 추가된 메시지(사용자 입력·도구 결과)는 미반영이지만, threshold 마진(아래)이 그 오차를 흡수한다 — 여기에 문자 수 토큰 추정을 더하는 것은 채택하지 않는다(§9).

**판정 시점은 두 곳이다** — 컨텍스트가 자랄 수 있는 지점 직후:

1. **런 종료 후 idle** — `agent_end` settlement 뒤. 압축이 사용자 입력을 기다리는 시간과 겹쳐 지연이 가려진다.
2. **재개 직후** — `loadSession` 반환 트랜스크립트에 대해. 한도 근처에서 종료한 세션을 다시 열 때.

런 도중에는 판정하지 않는다 — 분기는 새 Agent 인스턴스 생성이므로 활성 런과 양립할 수 없고(불변 조건 7: idle이면 큐가 빈다), 런 중 컨텍스트 초과는 §7의 잔여 리스크로 정직하게 남긴다.

**자동이 기본이다** (2026-08-06 사용자 확정): `contextTokens > contextWindowTokens × threshold`(기본 0.75)면 자동 압축. 안 만진 기본값이 하드 한도 충돌을 만나지 않는 것이 §2.3(안전한 기본값)의 이행이다. `/compact`는 같은 경로의 수동 발동이다(임계 미달이어도 실행).

```typescript
interface CompactionConfig {
  /** 모델 컨텍스트 창. providers가 제공(§8) — CLI가 배선 시 채운다 */
  contextWindowTokens: number;
  /** 자동 압축 임계 비율. 기본 0.75 */
  threshold: number;
  /** 원문 유지할 최근 user 턴 수. 기본 2 */
  keepRecentTurns: number;
  /** 요약 응답의 maxTokens. 기본 8192 */
  summaryMaxTokens: number;
}

/** 마지막 유효 어시스턴트 usage로 판정. 유효 usage가 없으면 false */
function shouldCompact(messages: readonly AgentMessage[], config: CompactionConfig): boolean;
```

**분기 직후의 오판은 구조적으로 무해하다.** 자식 세션의 유지 어시스턴트 메시지는 부모 시절의 usage를 실은 채 복사되므로, 분기 직후 재개하면 `shouldCompact`가 참을 반환할 수 있다. 그러나 계획 단계(§4)에서 요약할 구간이 비어 "압축 불가"로 판정되고 모델 호출 없이 끝난다 — §7의 자동 중지 규칙이 반복 경고를 막는다.

## 4. 계획 — cut은 user 턴 경계에서만

**자르는 지점은 user 메시지 경계로만 한정한다** (2026-08-06 사용자 확정). 유지 구간은 **뒤에서부터 `keepRecentTurns`번째 user 메시지**(합성 포함 — grace·steer 주입도 경계다)에서 시작한다. 이 한정의 값:

- **도구 짝 고아가 구조적으로 불가능하다.** user 경계에서 자르면 toolCall과 toolResult가 항상 같은 쪽에 남는다 — OpenClaw가 `isCutPointMessage`로 toolResult 앞 절단을 막고 split-turn 이중 요약까지 두는 문제 전체가 발생하지 않는다.
- **메시지별 토큰 추정이 불필요하다.** 토큰 예산 방식(OpenClaw `keepRecentTokens`)은 CJK 보정 문자 카운트 휴리스틱을 요구한다. 턴 수 유지는 결정적이고 사용자에게 설명 가능하다("최근 2턴은 원문 유지").

```typescript
type CompactionPlan = {
  kind: "plan";
  /** 요약 대상 — 이전 요약 메시지(있으면)를 제외한 cut 이전 전부 */
  toSummarize: readonly AgentMessage[];
  /** 부모가 있는 세션의 첫 메시지에서 추출한 이전 요약. 반복 압축의 연속성(§5) */
  previousSummary?: string;
  /** cut 이후 전부 — id 그대로 자식 세션으로 */
  kept: readonly AgentMessage[];
};
type CompactionNotPossible = {
  kind: "not-possible";
  /** 표시용 사유 — 예: 유지 구간이 트랜스크립트 전부 */
  reason: string;
};

function planCompaction(
  messages: readonly AgentMessage[],
  config: CompactionConfig,
  options?: { hasPreviousSummary?: boolean },
): CompactionPlan | CompactionNotPossible;
```

- **이전 요약의 인지는 호출자가 전달한다** (2026-08-06 구현 확정 — QA-A A-4의 독립 지적과 수렴). `planCompaction`은 순수 함수라 세션의 부모 유무를 알 수 없고, 그 사실을 아는 유일한 위치가 호출자(CLI)다. `hasPreviousSummary`가 참이면 `messages[0]`이 이전 요약(§2의 구조적 식별)이며 `toSummarize`에서 제외되고 `previousSummary`로 추출된다. 참인데 `messages[0]`이 user 메시지가 아니면 throw한다 — 그 위반의 출처는 호출자 배선 하나뿐이라 조용히 `not-possible`로 접으면 배선 버그가 살아남는다.

- **`toSummarize`가 비면 `not-possible`이다** — user 턴이 K개 이하인 세션, 방금 분기된 세션이 여기 해당한다. 계획은 순수 함수라 이 판정에 비용이 없다.
- **유지 구간이 그 자체로 임계를 넘는 경우도 압축은 수행된다** — 요약으로 줄어드는 것은 cut 이전뿐이므로 효과가 작을 수 있고, 그 사실은 §6의 결과 표시(before 토큰)로 드러난다. 거대 단일 턴 문제의 완화는 도구 출력 트렁케이션(`afterToolCall`)과 `maxTurnsPerRun`이 담당한다.

## 5. 요약 생성 — 주입된 ModelClient로, 실패는 값이 아니라 예외로

```typescript
/** 실패는 throw — 부분 요약을 반환하지 않는다 */
async function generateSummary(
  client: ModelClient,
  plan: CompactionPlan,
  config: CompactionConfig,
  signal: AbortSignal,
): Promise<string>;
```

- **요청 형태**: `systemPrompt` = 요약 전용 프롬프트(아래), `messages` = 직렬화된 대화를 담은 단일 user 메시지, `tools` = 빈 배열, `maxTokens` = `summaryMaxTokens`(코어가 아니라 호출자가 채우는 것은 `ModelRequest.maxTokens` 계약 그대로 — 어댑터 기본값 오버라이드). "`tools` = 빈 배열"은 **`ModelRequest` 수준의 규정**이다(2026-08-06 QA-A A-3 명문화) — 어댑터가 와이어에서 빈 배열을 필드 생략으로 변환하는 것은 어댑터의 와이어 책임(CORE-INTERFACE §8)이지 위반이 아니다.
- **요약 프롬프트는 구조가 계약이고 문구는 세부다.** 구조: 목표 / 제약·선호 / 진행(완료·진행 중·막힘) / 핵심 결정과 근거 / 다음 단계 / 이어가는 데 필요한 컨텍스트 — 그리고 **파일 경로·심볼·에러 메시지는 원문 보존** 지시. OpenClaw의 실전 검증된 골격을 재작성한다.
- **직렬화에서 `ThinkingContent`는 제외한다.** 표시·기록 전용(CORE-INTERFACE §2)이라는 규정의 연장 — 내부 추론이 요약에 스며들면 다음 세션의 "사용자가 말한 사실"처럼 오염된다. toolCall(이름+인자)과 toolResult(텍스트)는 포함한다.
- **반복 압축은 이전 요약을 갱신한다.** `previousSummary`가 있으면 프롬프트에 함께 실어 "보존 + 갱신"을 지시한다(OpenClaw update 모드). 이전 요약 메시지 자체는 `toSummarize`에서 빠지므로 이중 반영되지 않는다.
- **`stopReason`이 `"end_turn"`이 아니면 실패다.** `max_tokens`는 잘린 요약이고, 잘린 요약의 채택은 침묵 유실이다(§2.6) — 명시적 실패로 처리한다. `error`·`aborted`도 마찬가지. 응답에 텍스트가 없어도 실패다.
- 요약 호출도 어댑터를 그대로 지나므로 컴플라이언스 게이트(UA·evidence)가 자동 적용된다 — 별도 경로 없음.

## 6. 분기 실행 — 원자적 영속화, 그리고 반드시 보인다

CLI 오케스트레이션 순서 (요약 생성 성공 후):

```
1. summaryMessage = createUserMessage({ role: "user", content: [{ type: "text", text: 요약 }] })
2. store.branchSession(parentId, { summaryMessage, keptMessages: plan.kept,
                                   systemPrompt, model })     — 한 트랜잭션 (SESSION-STORE §5)
3. 구 Agent 폐기(구독 해지) → 새 Agent 생성(messages = [요약, ...kept]) → 재배선
   — /resume과 같은 "폐기 후 재생성" 경로 (CLI-INTERFACE §5)
4. 결과 표시
```

- **`branchSession`은 한 트랜잭션이다.** 세션 행 + 요약 + 유지 복사가 전부 반영되거나 전부 안 된다 — 반쯤 분기된 세션은 손상이다. `workspace_root`·`title`은 부모에서 복사한다(자식의 첫 메시지는 요약이므로 첫 UserMessage 자동 제목 규칙을 적용하면 제목이 요약문이 된다).
- **압축은 침묵하지 않는다** (§2.6). 표시 의무: 압축이 일어났다는 사실, before 컨텍스트 토큰, 유지 범위(최근 K턴), 새 세션 id. 자동이든 수동이든 같다. 압축 중에는 진행 표시를 하고 입력을 받지 않는다 — Ctrl+C는 요약 호출을 abort하고 구 세션을 그대로 유지한다(취소도 가시적 결과).
- **부모 세션은 목록·접두 해석에서 빠진다** — 다른 세션의 `parent_session_id`로 참조되는 세션은 superseded다(SESSION-STORE §5). 같은 대화가 `/sessions`에 두 줄로 보이면 어느 쪽을 재개해야 하는지가 사용자 문제가 된다. 전체 id로의 `loadSession`은 여전히 열린다(soft-delete와 같은 "목록 제외 ≠ 접근 봉쇄").

## 7. 실패 처리

- **요약 실패 = 압축 포기, 대화는 무손상.** 구 세션이 원본 그대로이므로 실패의 비용은 요약 호출 1회뿐이다. 경고를 표시하고 세션을 계속한다 — 저장 실패(SESSION-STORE §7)와 달리 런을 죽일 이유가 없다. 압축 없이도 대화는 아직 가능하기 때문이다.
- **자동 트리거의 중지 규칙 (프로세스 메모리, 영속화 없음)**: 자동 압축이 **연속 2회 실패**하거나 **`not-possible`로 판정**되면 그 프로세스에서 자동 트리거를 중지하고 사유와 대안(`/compact` 재시도 또는 `/new`)을 1회 안내한다. 매 idle마다 실패를 반복하는 스래싱과 경고 스팸을 막는다. 수동 `/compact`는 항상 시도할 수 있고, 성공하면 자동이 재개된다.
  - **사용자 취소는 실패가 아니다** (2026-08-06 판정 A-1). 취소를 세면 취소 2회가 "사용자가 하지 않은 설정 변경"(자동 압축 중지)을 만든다 — §6이 취소를 별도 결과로 규정한 것과 정합. 판정 수단은 요약 실패 에러의 취소 구분(`CompactionSummaryError.reason`)이다.
  - **"연속"의 기준은 성공이다** (2026-08-06 판정 B-14). 취소는 실패 카운트를 늘리지도 **끊지도** 않는다 — 취소는 실패 원인이 해소됐다는 증거가 아니므로, 끊으면 실패 지속 상황에서 취소 한 번마다 스래싱이 되살아난다.
  - **수동 `/compact`의 `not-possible`·실패는 자동 중지 상태를 건드리지 않는다** (2026-08-06 판정 E-47). 수동은 사용자가 지금 한 번 시도한 것이고, 그 결과로 자동 설정이 바뀌면 A-1과 같은 문제가 된다. 자동을 바꾸는 수동의 결과는 **성공에 따른 재개**뿐이다. hermes의 쿨다운 **컬럼**(`compression_failure_cooldown_until` 등)은 채택하지 않는다 — 멀티프로세스 게이트웨이의 요구이고, 우리는 단일 프로세스라 메모리로 충분하다(SESSION-STORE §8 확정).
- **잔여 리스크 — 런 도중의 한도 초과는 막지 못한다.** 한 런이 도구 결과로 컨텍스트를 폭증시키면 모델 호출이 프로바이더 에러로 실패하고, 런은 `stopReason: "error"`로 가시적으로 끝난다(어댑터 계약 §8). 그 직후 idle 판정이 압축을 수행하므로 복구 경로는 "에러 확인 → (자동)압축 → 재시도"다. 완화 장치는 도구 출력 트렁케이션과 `maxTurnsPerRun`. 런 중 압축(hermes의 프리플라이트·포스트 툴 압축)은 채택하지 않는다(§9).

## 8. 이 설계가 요구하는 계약 변경 (정본은 각 문서)

| 정본 | 변경 | 상태 |
|---|---|---|
| `CORE-INTERFACE.md` §2 | `createUserMessage(input): UserMessage` 공개 — id·timestamp 발급 지점을 코어 하나로 유지한 채 세션 밖(요약 메시지) 생성을 허용. `compactionSummary` 역할 **불채택 확정** | ✅ 구현 완료 (2026-08-06) |
| `SESSION-STORE.md` §2 | 스키마 v2: `messages` PK `id` → `(session_id, id)` — 첫 마이그레이션 | ✅ 구현 완료 (2026-08-06) |
| `SESSION-STORE.md` §5 | `branchSession()` 추가(단일 트랜잭션), `listSessions`·`resolveSessionId`가 superseded 부모 제외 | ✅ 구현 완료 (2026-08-06) |
| `CLI-INTERFACE.md` §3 | config 키 `compactionAuto`(기본 true)·`compactionThreshold`(0.75)·`compactionKeepRecentTurns`(2) | ✅ 구현 완료 (2026-08-06) |
| `CLI-INTERFACE.md` §5 | `/compact` 명령 추가 | ✅ 구현 완료 (2026-08-06) |
| `PROVIDERS.md` §3 | 어댑터가 모델의 `contextWindowTokens`를 노출(구체 타입 표면 — `ModelClient` 계약은 불변). 미지 모델은 보수 기본값(200,000 — §10) + 기동 시 경고 | ✅ 구현 완료 (2026-08-06) |

**표의 모든 행이 정본을 다른 문서로 넘긴다** (2026-08-14). 마지막 행은 2026-08-10부터 2026-08-14까지 **예외였다** — 어댑터 구체 표면 계약을 실을 문서가 없어 이 절이 스스로 정본을 겸했고, 그 사정을 문단 하나로 설명해야 했다(`31abb2a`). `PROVIDERS.md` 신설로 도착지가 생겨 **그 예외가 소멸했다**. 신설 판정과 그 근거는 `PROVIDERS.md` §4가 든다.

providers 전용 문서의 신설을 이 절이 유보했던 것은 2026-08-10이고, **그 유보는 2026-08-14에 트리거 발동으로 뒤집혔다**(`PROVIDERS.md` §4.1). 유보 근거는 계약이 한 건뿐이라 문서가 한 줄짜리가 되고 범위를 서술하는 자리만 늘어난다는 것이었는데, 재론 시점에는 계약이 이미 여러 문서에 흩어져 있어 그 전제가 거짓이 됐다. 유보 시점의 문면은 `31abb2a`에 있다.

`ModelClient` 인터페이스에 `contextWindow`를 넣지 않는 이유는 `PROVIDERS.md` §3이 든다 — 코어가 컨텍스트 크기를 소비하지 않는다는 것이고, `maxTokens`를 어댑터 소유로 판정한 것(구 O-2)과 같은 자리다.

## 9. 레퍼런스 대비 의도적 축소

| 레퍼런스 기능 | 판정 | 근거 · 트리거 |
|---|---|---|
| `compactionSummary` 커스텀 역할 + `convertToLlm` (OpenClaw) | 안 넣음 | §2 — 변환 계층 부활 방지. 트리거: 모델 비가시 역할이 2종 이상 실재할 때 |
| 토큰 예산 유지 + CJK 문자 추정 (OpenClaw `estimateTokens`) | 안 넣음 | §4 — user 턴 경계 유지는 추정이 불필요하다. 트리거: K턴 유지가 재압축을 즉시 유발하는 패턴 실측 |
| split-turn 이중 요약 (OpenClaw `TURN_PREFIX_...`) | 안 넣음 | §4의 귀결 — user 경계 절단이면 턴이 쪼개질 수 없다 |
| 런 중 압축 (hermes 프리플라이트·포스트 툴) | 안 넣음 | §7 — 분기 모델과 양립 불가. 루프가 컨텍스트를 소유해야 가능한 설계다. 트리거: 런 중 한도 초과가 실사용에서 반복 관측될 때 (그때도 먼저 트렁케이션 강화를 검토) |
| 압축 쿨다운·스래싱 컬럼 영속화 (hermes) | 안 넣음 | §7 — 단일 프로세스는 메모리로 충분. 트리거: 상주 데몬 도입 |
| `compression_locks` 멀티프로세스 배타 (hermes) | 안 넣음 | SESSION-STORE §8 기판정 유지 |
| `messages.compacted` 플래그 (hermes) | **안 넣음 확정** | 분기 모델에서 부모 행은 무변경이라 표시할 것이 없다 — SESSION-STORE §9 미결의 해소 |
| 파일 조작 목록 추출·요약 부착 (OpenClaw `extractFileOperations`) | 안 넣음 | 요약 프롬프트의 "파일 경로 원문 보존" 지시로 시작. 트리거: 요약에서 파일 맥락 유실 실측 |
| 압축 안전 타임아웃·선제 압축 러너 (OpenClaw `preemptive-compaction` 등) | 안 넣음 | 게이트웨이 상주 프로세스의 요구 |
| `/compact` 커스텀 지시 인자 (OpenClaw customInstructions) | MVP 제외 | 트리거: 요약 품질 불만 실측 |
| 요약 전용 저가 모델 지정 | MVP 제외 | 본 대화와 같은 `ModelClient` 사용. 트리거: 압축 비용 실측. 열릴 때 배선은 config 키 하나다 |

## 10. 미결 — 이 문서가 정하지 않은 것

- **체인 단위 삭제.** `/delete`는 체인 끝(tip)만 지우고 superseded 부모들은 목록 밖 행으로 남는다. 물리 삭제 시점(SESSION-STORE §9 미결)을 결정할 때 체인 단위 정리를 함께 재론한다.

2026-08-06 구현 플랜에서 해소된 것 (판정 정본은 압축 QA 리포트):

- ~~요약 프롬프트 전문과 직렬화 포맷~~ — 구현 확정 (`packages/compaction/src/summary.ts`·`serialize.ts`가 정본, E-33·E-35 판정). 구조 계약(§5)은 불변.
- ~~압축 중 입력 상태의 표현~~ — **4번째 상태 `compacting`** (E-44 판정 — `approval-wait`는 "입력 소유권을 넘겨받는 프롬프트"로 명문화돼 있어 얹으면 이름이 거짓말한다).
- ~~미지 모델 보수 기본값~~ — **200,000 토큰** (E-12 판정 — 현행 최소 창과 같아 과대추정이 아니고, 과대추정만이 위험한 방향이다).
