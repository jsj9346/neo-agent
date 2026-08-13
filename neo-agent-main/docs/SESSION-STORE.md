# 세션 저장소 — 스키마와 계약

**이 문서가 세션 영속화의 정본이다.**

- 상태: 구현 완료
- 근거: packages/store/src
- 작성일: 2026-08-06
- 최종 개정: 2026-08-13(머리 — 지위 선언을 필드로, `DOC-STATUS.md` §3)

`ARCHITECTURE.md` 구 §3.1(상태 저장소 — 현 §2.12로 승격)의 해소이자 `CORE-INTERFACE.md` §11 O-4(메시지 식별자)의 해소다.

**불변(계약)**: 저장소의 경계, 스키마 v1의 테이블·컬럼 의미, 이벤트 구독 계약, 재개 시의 검증 규칙, 실패 처리 방향.
**조정 가능(세부)**: 메서드 시그니처, 인덱스 구성, PRAGMA 값, 마이그레이션 러너의 구현 형태.

전제는 `SAFE-DEFAULTS.md` 머리와 같다: **여기 있는 어떤 것도 보안 경계가 아니다.** 파일 권한과 denylist는 사고를 줄이는 장치이지 적대적 코드를 막는 경계가 아니다 — 유일한 경계는 OS다.

---

## 1. 경계 — 저장소가 아는 것과 모르는 것

| | 저장소가 안다 | 저장소는 모른다 |
|---|---|---|
| 대화 | `AgentEvent` 스트림, `AgentMessage` 직렬화 | 에이전트 루프, 모델 호출, 도구 실행 |
| 세션 | 계보·워크스페이스·시스템 프롬프트·모델 | 프롬프트 내용의 의미, 프로바이더 |
| 표시 | 없음 | CLI 렌더링, 승인 UI |

**코어는 저장소를 모른다**(`CORE-INTERFACE.md` §1). 저장소는 CLI 렌더러와 **같은 이벤트 스트림의 구독자**이며, 이 대칭이 §2.1(전송 비의존)의 실체다. 나중에 웹 UI가 같은 자리에 앉는다.

패키지: `packages/store`. 의존성은 `node:sqlite`(내장) · `zod` · `@neo-agent/core`(타입·스키마).

**예산 게이트 확장** — store가 임포트하지 않는 모듈: `child_process`, `net`, `tls`, `http`, `https`, `dns`. 대화 전문을 보관하는 패키지가 네트워크로 나가는 경로를 기계적으로 차단한다(providers의 `node:fs` 금지와 같은 성격 — 금지의 대상은 능력이지 의도가 아니다). `node:fs`는 허용한다 — 디렉터리 생성과 권한 확인에 필요하다.

---

## 2. 스키마 v1

전 테이블 `STRICT`. boolean은 `INTEGER` + `CHECK`로 값 범위를 못박는다 — STRICT를 채택한 이유가 타입 오염 차단이므로 0/1 제약까지 가야 일관된다.

```sql
CREATE TABLE schema_version (
  version    INTEGER NOT NULL,
  applied_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
  id                TEXT    PRIMARY KEY,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  title             TEXT,
  workspace_root    TEXT    NOT NULL,          -- realpath. 재개 시 검증 (§5)
  system_prompt     TEXT    NOT NULL,
  model             TEXT    NOT NULL,
  parent_session_id TEXT    REFERENCES sessions(id),   -- 🧬 압축(세션 분기)용. v1에서는 항상 NULL
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE TABLE messages (
  id         TEXT    PRIMARY KEY,              -- 코어가 발급한 AgentMessage.id (§3)
  session_id TEXT    NOT NULL REFERENCES sessions(id),
  seq        INTEGER NOT NULL,                 -- 세션 내 트랜스크립트 순서
  role       TEXT    NOT NULL,                 -- body에서 파생 (아래 단방향 규칙)
  timestamp  INTEGER NOT NULL,                 -- body에서 파생
  body       TEXT    NOT NULL,                 -- AgentMessage JSON 전문 — 정본
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE UNIQUE INDEX messages_session_seq   ON messages(session_id, seq);
CREATE INDEX        messages_session_order ON messages(session_id, active, seq);
CREATE INDEX        sessions_recent        ON sessions(active, updated_at DESC);
```

### 결정 사항

**메시지 본문은 JSON 통짜로 저장한다.** `AgentMessage`는 코어 계약의 닫힌 유니온이고, 저장소의 역할은 그 직렬화 형태를 보관하는 것이다. 정규화(콘텐츠 블록 테이블 분리)하면 같은 계약이 DDL과 타입 두 곳에 존재하게 되어, 코어가 유니온을 넓힐 때마다 스키마 마이그레이션이 따라붙는다.

**`role`·`timestamp`는 `body`에서 파생된 중복이며 파생은 단방향이다.** `body`가 정본이고 두 컬럼은 인덱스·목록 조회용 사본이다. **컬럼만 갱신해 `body`와 어긋나게 만드는 경로를 두지 않는다** — 쓰기는 항상 `body`를 만들고 거기서 두 값을 뽑는 한 지점을 지난다.

**읽을 때 `body`를 Zod로 검증한다.** DB에서 나온 JSON은 외부 입력과 같이 취급한다. 검증 실패는 손상 행이고 **조용히 건너뛰지 않는다**(§7).

**검증 스키마는 미지의 키를 거부한다(strict)** (2026-08-06 명문화 — 구현이 `z.strictObject`로 먼저 닫은 방향의 소급 확정, T-011 판정 누락분). zod 기본 동작(미지 키를 조용히 버림)이면 저장→읽기 왕복에서 필드가 침묵 유실된다(§2.6 위반). 부수 효과도 의도된 것이다: 코어가 스키마를 확장한 뒤 **구버전 앱이 신버전 DB를 읽으면 명시적 에러**가 난다 — strict가 마이그레이션 강제 장치가 된다(§2 마이그레이션 규율의 "버전이 높으면 거부"와 같은 방향을 메시지 수준에서 이중화).

**`seq`는 id 순서가 아니라 트랜스크립트 순서다.** 메시지 id는 UUID라 정렬 의미가 없다. 순서의 진실은 `seq` 하나이고, 발급은 쓰기 트랜잭션 안에서 `MAX(seq)+1`로 한다.

**`sessions.model`·`system_prompt`를 저장하는 이유는 프롬프트 캐시(§2.4)다.** 재개할 때 같은 값으로 이어가야 캐시가 산다. 재개 시 불일치 처리는 §5.

**`parent_session_id`는 v1에서 항상 NULL이다**(REUSE-MAP §2.4 🧬). 압축은 후순위지만 hermes가 압축을 세션 분기로 구현한 것은 옳았고, 그 전제가 이 컬럼이다. 지금 넣어두면 압축 도입 시 마이그레이션이 없다.
→ **2026-08-06 압축 설계 확정으로 이 컬럼의 소비자가 생겼다** (`COMPACTION.md` §2 — `branchSession`이 채운다). 컬럼 흔적의 예상("마이그레이션 없음")은 이 컬럼에 대해서는 적중했으나, 자기완결 분기(같은 id 복사)가 **messages PK 변경을 요구해 스키마 v2가 필요하다**:

### 스키마 v2 (2026-08-06 압축 설계 확정, 같은 날 구현 완료 — 첫 실사용 마이그레이션)

- **`messages`의 PK를 `id` → `(session_id, id)`로 바꾼다.** 분기가 유지 메시지를 **같은 id로** 자식 세션에 복사하기 때문이다(메시지 동일성 보존 — 재발급 기각은 V-1 판정 재적용). 코어 불변 조건 8은 "한 트랜스크립트 안"의 유일성이므로 세션 간 같은 id는 계약 위반이 아니다. `INSERT OR IGNORE`의 멱등 범위도 세션 내로 좁아진다 — §4의 구독 계약 의미는 그대로다.
- SQLite는 PK 변경을 지원하지 않으므로 테이블 재생성 복사이며, 마이그레이션 규율(위) 그대로 한 트랜잭션이다. v1에 만든 `schema_version` 체계의 첫 실사용.

**세션 title은 첫 `UserMessage`의 앞부분에서 자동 생성한다.** 모델 요약은 API 호출 비용이 붙어 MVP에서 뺀다.

### 마이그레이션 규율

`schema_version`은 v1부터 존재한다 — **나중에 넣는 마이그레이션 체계는 이미 늦다**(REUSE-MAP §2.4). 규율 세 가지:

- 마이그레이션은 앞으로만 간다. 다운그레이드 경로를 만들지 않는다.
- 각 마이그레이션은 트랜잭션 하나다.
- **DB의 버전이 코드가 아는 최신보다 높으면 거부한다.** 구 버전 바이너리가 신 스키마를 열어 쓰면 손상된다.
- **`schema_version`은 이력 테이블이다** (2026-08-06 B-1 판정 명문화). 마이그레이션마다 행을 추가하고 현재 버전은 `MAX(version)`이다 — `applied_at`이 버전별 적용 시각으로 남는다.
- **기존 DB의 승격은 경고 핸들러로 통지한다** (2026-08-06 B-13 판정). 마이그레이션은 되돌릴 수 없는 변경(위 규율)이므로 침묵하지 않는다(§2.6). 신규 DB 생성은 승격이 아니라 통지하지 않는다 — 매 신규 설치가 경고로 시작하면 §2.3에 어긋난다.
- **마이그레이션은 SQL 단계 + 선택적 코드 단계로 구성된다** (2026-08-07 스키마 v3 도입 시 명문화 — 판정 ES-31). DDL만으로 표현할 수 없는 변환(v3의 FTS 백필은 `body` JSON을 파싱하고 Zod로 검증한 뒤 TS 추출 함수를 거쳐야 한다)이 있기 때문이다. **두 단계는 같은 트랜잭션 안에서 실행된다** — 위 "각 마이그레이션은 트랜잭션 하나다"가 코드 단계에도 그대로 적용되며, 코드 단계의 실패도 전량 롤백이다. 코드 단계는 통지 목록을 돌려줄 수 있다(백필이 건너뛴 손상 행 등 — 침묵 금지의 이행). **DDL로 표현 가능한 것을 코드 단계로 옮기지 않는다**: 변환 로직이 SQL과 TS 두 곳에 흩어지면 스키마의 진실이 나뉜다.

---

## 3. 메시지 식별자 — O-4 해소

O-4의 원래 서술은 "`message_start`(스트리밍 초안)와 `message_end`(최종)가 서로 다른 객체인데 상관지을 id가 없어, 저장소가 start에 행을 만들고 end에 갱신하는 패턴이 불가능하다"였다. **두 갈래로 해소한다.**

**첫째, 그 패턴 자체를 채택하지 않는다.** 스트리밍 초안의 `stopReason`·`usage`는 미확정 자리표시자다(`loop.ts`의 draft). 그것을 저장하면 **거짓 기록**이 남는다 — `stopReason: "end_turn"`인 미완성 어시스턴트 메시지는 재개 시 정상 종료된 턴으로 보인다. 저장소는 `message_end`만 구독한다(§4).

**둘째, 그럼에도 `AgentMessage.id`를 필수 필드로 넣는다.** 저장 로직만 보면 없어도 되지만, 있으면 **중복 방지가 규약이 아니라 구조가 된다** — `INSERT OR IGNORE`가 성립해 `agent_end`·`turn_end`를 실수로 함께 구독해도 데이터 손상이 아니라 무해한 no-op이 된다. 이 프로젝트는 반복해서 같은 방향을 골랐다(컴플라이언스의 타입 레벨 강제, 예산 게이트, denied의 도구 자체 강제, 불변 조건 7). 나중에 넣으면 이미 저장된 모든 행의 마이그레이션 + 메시지 생성 지점 전체 재수정이다.

### 코어 계약 개정 (이 설계가 요구하는 것)

정본은 `CORE-INTERFACE.md`이며 아래는 이 설계가 요구하는 변경의 요약이다.

```typescript
// §2 — 세 메시지 타입 전부에 추가
interface UserMessage      { id: string; role: "user";       /* ... */ }
interface AssistantMessage { id: string; role: "assistant";  /* ... */ }
interface ToolResultMessage{ id: string; role: "toolResult"; /* ... */ }

// §4 — 입력 경계. 호출자는 id·timestamp를 모른다
type UserMessageInput = Omit<UserMessage, "id" | "timestamp">;
prompt(input: string | UserMessageInput): Promise<void>
steer(message: UserMessageInput): void
followUp(message: UserMessageInput): void

// §8 — 어댑터 경계. 어댑터도 id를 모른다
type ModelStreamEvent = /* ... */ | { type: "done"; message: Omit<AssistantMessage, "id"> };
```

**발급자는 코어 하나다.** 트랜스크립트의 소유자가 코어이므로(§5 도구 짝 정합성의 근거와 같은 자리) id도 코어가 발급한다. 어댑터와 호출자가 발급하면 코어가 덮어쓰게 되고, "필수인데 무시되는 필드"라는 잘못된 표면이 생긴다.

**형식은 `crypto.randomUUID()`** — Node 24의 Web Crypto 전역이라 임포트가 없고 코어의 의존성 예산(zod 단일)에 영향이 없다.

**스트리밍 초안과 최종 메시지는 같은 id를 갖는다.** 코어가 초안 생성 시 발급하고, 어댑터가 준 최종 메시지에 그 id를 부여한다. 이로써 `message_start`/`message_update`/`message_end`가 상관 가능해진다 — 저장소는 쓰지 않지만 CLI 렌더러가 쓴다.

**id는 와이어로 나가지 않는다.** 어댑터의 변환은 id를 무시한다. 모델 페이로드에 들어가면 프롬프트 캐시(§2.4)가 매 요청 깨진다. `ThinkingContent`와 같은 종류의 규정이며, 같은 이유로 §2(메시지 모델의 의미론)에 적는다.

**코어가 `AgentMessage`의 Zod 스키마를 공개한다.** 저장소가 자체 스키마를 정의하면 계약이 두 곳에 존재하고, 코어가 유니온을 넓혔을 때 저장소가 따라오지 않아도 컴파일이 통과한다. 코어는 이미 zod를 의존하고 `validateToolArgs`를 공개했으므로(§6) 같은 종류의 표면 확장이다.

**새 불변 조건**: 한 트랜스크립트 안의 모든 메시지는 유일한 id를 갖는다.

---

## 4. 저장 시점 — 이벤트 구독 계약

```
구독한다:  message_end
무시한다:  message_start (초안 — 거짓 기록), message_update,
          turn_end.message, agent_end.messages (이미 저장됨)
```

- 저장은 **`INSERT OR IGNORE`**. 위 규약을 어겨도 데이터가 손상되지 않는다(§3).
- 메시지 INSERT와 `sessions.updated_at` UPDATE는 **한 트랜잭션**이다.
- **저장소는 CLI 렌더러보다 먼저 구독한다.** §3의 구독 계약이 "리스너는 **구독 순서대로 await**된다"를 보장하므로, 이 순서는 **사용자가 화면에서 본 것은 이미 저장된 것**이라는 뜻이 된다. 반대 순서면 렌더링된 뒤 저장이 실패하는 창이 생긴다.
- **종료 시 flush가 따로 필요 없다.** `waitForIdle()`이 리스너 settlement까지 기다린다(§3).

`agent_end`에 일괄 저장하는 대안은 기각한다 — 긴 런에서 프로세스가 죽으면 그 런의 대화가 통째로 사라지고, 사용자는 화면에서 이미 본 내용이다.

---

## 5. 세션 이어가기

```typescript
interface StoredSession {
  id: string;
  title: string | null;
  workspaceRoot: string;
  systemPrompt: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  parentSessionId: string | null;
}

/** 재개 시점의 현재 컨텍스트 — §5 검증의 비교 기준. 초판 시그니처 `loadSession(id)`는
 *  산문이 요구하는 워크스페이스 검증을 구현할 수 없었다(2026-08-06 구현·QA 독립 지적으로 정정) */
interface ResumeContext {
  workspaceRoot: string;
  systemPrompt: string;
  model: string;
}

interface SessionStore {
  createSession(init: Omit<StoredSession, "id" | "createdAt" | "updatedAt" | "title" | "parentSessionId">): StoredSession;
  loadSession(id: string, context: ResumeContext): { session: StoredSession; messages: AgentMessage[] };
  listSessions(limit?: number): StoredSession[];
  /** git 스타일 접두 매칭. 입력은 소문자로 정규화한 뒤 매칭한다 (2026-08-06 확정 —
   *  id는 crypto.randomUUID()의 소문자 hex뿐이라 정규화에 정보 손실이 없고, UUID 표기의
   *  대소문자는 구별 의미가 없다(RFC 9562). 대문자화된 접두를 거부하면 복사 과정에서
   *  대문자가 된 id를 이유 없이 막는다). 모호하면 throw — 조용히 하나를 고르지 않는다 */
  resolveSessionId(prefix: string): string;
  /** soft-delete — sessions.active = 0 (2026-08-06 CLI 설계에서 추가, 사용자 확정).
   *  물리 삭제 시점은 §9 미결 유지. 삭제된 세션은 listSessions·resolveSessionId에서 제외 */
  deleteSession(id: string): void;
  /** 압축 분기 (2026-08-06 `COMPACTION.md` 확정, 같은 날 구현 완료).
   *  한 트랜잭션: 자식 세션 행(parent_session_id = parentId) + 요약(seq 1) + 유지 복사(같은 id).
   *  workspace_root·title은 부모에서 복사한다 — 첫 UserMessage 자동 제목 규칙을 적용하면
   *  제목이 요약문이 되므로 이 경로에서는 쓰지 않는다 */
  branchSession(parentId: string, branch: {
    summaryMessage: UserMessage;        // 코어 createUserMessage로 생성된 합성 요약
    keptMessages: readonly AgentMessage[]; // 부모에서 id 그대로
    systemPrompt: string;
    model: string;
  }): StoredSession;
  /** message_end 구독을 배선하고 해지 함수를 돌려준다 */
  attach(agent: Agent, sessionId: string): Unsubscribe;
  close(): void;
}
```

**superseded 세션은 목록·접두 해석에서 빠진다** (2026-08-06 압축 설계 확정, 같은 날 구현 완료). 다른 세션의 `parent_session_id`로 참조되는 세션은 압축으로 대체된 것이며, `listSessions`·`resolveSessionId`에서 제외한다(자식의 `active` 여부와 무관 — 대체는 구조적 사실이라 자식을 soft-delete해도 부모가 목록에 재등장하지 않는다). 전체 id로의 `loadSession`은 열린다 — soft-delete와 같은 "목록 제외 ≠ 접근 봉쇄". 제외는 **조회 조건이지 사후 필터가 아니다** (2026-08-06 QA-B 명문화) — `resolveSessionId`의 모호 판정이 superseded 부모로 후보 자리를 소비하면 살아 있는 세션이 "모호"로 거부된다.

**`branchSession`의 세부 의미론** (2026-08-06 구현 판정 명문화 — 파생 빈칸의 확정, 판정 정본은 압축 QA 리포트):

- **부모가 부재·soft-delete·이미 superseded면 진단 가능한 에러로 거부한다.** 삭제된 부모의 분기는 "지운 대화에서 살아 있는 자식이 태어나는" 결과이고, superseded 부모의 재분기는 형제 세션 둘이 목록에 남아 §6(COMPACTION)이 막으려던 "같은 대화 두 줄"이 되살아난다 — **압축 체인은 선형이다.**
- **`keptMessages` 빈 배열은 거부한다.** 요약만 실린 자식은 사용자가 "대화 전체가 요약 한 줄로 사라진 것"과 구별할 수 없다. 정상 경로(planCompaction)는 이 형상을 만들지 않는다 — cut 규칙상 유지 구간에 최소 user 메시지 하나가 남는다.
- **분기 내부의 메시지 삽입은 `INSERT OR IGNORE`가 아니라 일반 INSERT다.** id 충돌(요약↔kept, kept 내부 중복)은 조용한 한 건 유실이 아니라 전량 롤백이다. §4의 멱등은 이벤트 재구독을 무해화하는 구독 계약의 요구이고, 여기 입력은 1회 전달 목록이라 중복은 결함이다.
- **자식의 `created_at`·`updated_at`은 분기 시각이다.** 부모 복사면 방금 압축한 세션이 `updated_at DESC` 목록에서 아래로 묻힌다. 복사된 유지 메시지의 `active`는 1이다.
- **`keptMessages`가 부모에 실재하는지는 검증하지 않는다.** `summaryMessage`부터가 정의상 부모에 없는 합성 메시지라 "부모에 있어야 한다"는 규칙은 같은 트랜잭션 안에서 자기모순이다 — "저장소는 코어가 보장한 것을 재검증하지 않는다"(아래)와 같은 결.

`loadSession`은 `active = 1`인 메시지를 `seq` 순으로 반환한다. 그 배열이 그대로 `AgentSessionInit.messages`가 된다.

> ~~⚠️ 계약-구현 격차 (의도적)~~ — 2026-08-06 CLI 구현 플랜 T-002에서 닫혔다(QA-B contract 테스트 선행 작성 → 구현 통과).

**`deleteSession`의 세부 의미론** (2026-08-06 T-012 명문화 — QA-B 판정 요청의 확정, 계약 변경 아님):

- **없는 id·이미 삭제된 id는 no-op이다.** 반환이 `void`라 호출자에게 구분을 알릴 채널이 없고, 호출 후의 사후 조건("그 id는 목록·해석에 없다")이 두 경우 모두 이미 성립한다. 던지면 `/delete`를 두 번 부른 사용자가 이유 없이 에러를 본다.
- **메시지 행은 건드리지 않는다** (`messages.active` 불변). §5가 규정한 것은 세션 행의 `active`뿐이며, 규정되지 않은 파괴는 하지 않는다 — 메시지까지 내리면 복구 경로에서 트랜스크립트가 비어 나온다(§7의 검증 범위가 `active = 1`이므로).
- **`updated_at`을 갱신하지 않는다.** `listSessions`가 `updated_at DESC` 정렬이므로 갱신하면 목록 순서가 "마지막 대화 시각"이 아니라 "마지막 삭제 시각"으로 오염된다.
- **`loadSession`은 `active = 0` 세션도 전체 id로는 연다** (현행 명문화). soft-delete는 **목록·접두 해석에서의 제외**이지 접근 봉쇄가 아니다 — 행이 남는 것이 계약이고(§9 물리 삭제 미결), 정확한 id를 아는 사용자의 복구 경로가 된다. CLI의 `/resume`은 `resolveSessionId`를 거치므로 접두로는 삭제된 세션에 도달하지 않는다.

### 재개 검증 — 두 불일치를 다르게 취급한다

**워크스페이스 불일치는 거부한다.** 현재 워크스페이스의 realpath가 `sessions.workspace_root`와 다르면 재개가 실패한다. 근거: 과거 트랜스크립트의 파일 경로가 전부 다른 실체를 가리키게 되고, 모델은 그것을 모른 채 "아까 고친 파일"을 다시 수정하려 한다 — **조용히 엉뚱한 곳을 고치는 경로**이며, `TOOLS-INTERFACE.md`가 fuzzy edit를 기각한 것과 같은 방향이다. 사용자가 의도했다면 명시적 재지정으로 넘긴다.

**시스템 프롬프트·모델 불일치는 경고 후 진행한다.** 결과가 비용 증가(캐시 무효화)에 그치고, neo-agent 버전이 올라 시스템 프롬프트가 바뀌면 모든 과거 세션의 재개가 막히기 때문이다. 경고는 캐시가 무효화된다는 사실을 알린다.

이 둘을 가르는 기준은 **틀린 결과가 나오는가, 비싼 결과가 나오는가**다.

### 저장소는 코어가 보장한 것을 재검증하지 않는다

도구 호출-결과 짝 정합성은 코어가 모든 종료 경로에서 보장한다(`CORE-INTERFACE.md` §5). 저장소가 이를 다시 검증하지 않는다 — 사후 검증에서 "정합성 검증을 모든 소비자에 복제시키는 대안은 기각"으로 이미 판정했다. 저장소의 검증 책임은 **직렬화 형태의 무결성**(§2의 Zod 검증)까지다.

---

## 6. 파일·PRAGMA·권한

**경로: `~/.neo-agent/sessions.db`** (WAL 부산물 `-wal`·`-shm` 동거).

이 위치의 부수 효과가 하나 있고, 우연이 아니라 확인한 것이다: `SAFE-DEFAULTS.md` §3의 크리덴셜 denylist가 `~/.neo-agent/**` **전체**이므로 **에이전트는 자기 대화 DB를 도구로 읽을 수 없다.** denylist는 게이트가 아니라 도구 자체가 강제하므로(`TOOLS-INTERFACE.md`) 게이트 `off`에서도, 훅 미배선에서도 동작한다.

**권한**: 디렉터리 700, 파일 600으로 생성한다. 기존 파일이 더 느슨하면 **매번 경고하되 열기는 한다.** 크리덴셜(§3 SAFE-DEFAULTS)의 fail-closed와 다르게 취급하는 근거: 크리덴셜 노출은 계정 탈취(회복 불가)이고 대화 노출은 프라이버시 침해인데, 그 위협 모델("같은 머신의 다른 사용자")은 개인 1인 머신에 해당하지 않는다. fail-closed면 앱 자체가 뜨지 않는다. **자동 chmod로 조용히 고치지 않는 것은 크리덴셜과 같다** — 노출 사실이 보여야 한다(§2.6).

```
PRAGMA journal_mode  = WAL;       -- 실패 시 명시적 에러. silent 폴백 금지 (REUSE-MAP §2.4)
PRAGMA foreign_keys  = ON;        -- SQLite 기본이 off다. 명시하지 않으면 FK가 장식이 된다
PRAGMA busy_timeout  = 5000;      -- 두 터미널 동시 실행 대비
PRAGMA synchronous   = NORMAL;    -- WAL 권장값. FULL은 개인 로컬에 과하다
```

---

## 7. 실패 처리

**저장 실패는 삼키지 않는다.** 리스너 예외로 전파되어 런이 실패하고 `prompt()`가 reject한다(`CORE-INTERFACE.md` §3). 저장이 안 되는데 대화가 계속되면 사용자는 저장된 줄 안다 — 도구·게이트 설계에서 확립한 "안내가 있는 조용한 유실은 안내 없는 것보다 나쁘다"와 같은 방향이고, 여기선 안내조차 없다.

**손상 행은 건너뛰지 않는다.** `body`의 Zod 검증이 실패하면 에러다. 건너뛰면 트랜스크립트에 구멍이 나고, 도구 호출만 남고 결과가 사라진 트랜스크립트로 재개하면 **다음 API 호출이 와이어 정합성 검사에서 거부된다**(§5의 근거와 같다). 구멍 난 대화를 조용히 이어가는 것보다 열지 못하는 편이 낫다.

검증 범위는 **반환되는 행**(`active = 1`)이다 (2026-08-06 QA 판정 명문화). 비활성 행의 손상은 열기를 막지 않는다 — 반환하지 않는 데이터로 세션을 영구 봉쇄할 이유가 없고, soft-delete된 과거 손상이 재개를 막으면 soft-delete의 목적(§2)이 뒤집힌다. 압축 도입 시 재론.

**경고는 주입된 핸들러로 전달한다** (§5·§6 공통, 2026-08-06 명문화). 저장소는 UI를 모르므로(§1) 경고의 표시 방식은 호스트 몫이다 — CLI가 핸들러를 주입하고, 기본값(핸들러 미주입 시의 동작)은 구현 세부다.

---

## 8. 레퍼런스 대비 의도적 축소

| 레퍼런스 기능 | 판정 | 근거 · 트리거 |
|---|---|---|
| DB 2개 분리 (OpenClaw `agent`/`state`) | 안 나눔 | 분리의 근거가 다중 에이전트·디바이스 페어링·감사 이벤트다. 개인 1인 단일 에이전트에 없다. **트리거**: 다중 에이전트 프로파일 또는 머신 간 동기화 |
| `system_prompts` SHA-256 중복 제거 (hermes) | 안 넣음 | 세션당 수 KB × 수백 세션은 수 MB. 테이블 하나와 조인의 임대료가 더 비싸다. **트리거**: DB 크기 실측 |
| 세션 토큰 카운터 컬럼 (hermes) | 안 넣음 | `usage`가 모든 어시스턴트 메시지에 있어 SUM으로 계산된다. 개인 규모에서 충분 |
| FTS5 + 트라이그램 (IDEA-004) | ~~후순위, 흔적 불필요~~ → **2026-08-07 채택** (`SEARCH.md`, 스키마 v3) | "흔적 불필요" 판정(파생 데이터라 스키마 흔적이 필요 없다)은 적중 — v1·v2에 아무 흔적 없이 v3에서 테이블 추가만으로 도입됐다. 단 "external-content 테이블"이라는 예상 형태는 **개정**: body가 JSON 통짜라 독립 테이블 + 앱 코드 색인이다(`SEARCH.md` §2) |
| `messages.compacted` (hermes) | **안 넣음 확정** (2026-08-06) | 압축 설계에서 판정 — 분기 모델에서 부모 행은 무변경이라 표시할 것이 없다 (`COMPACTION.md` §9) |
| 압축 쿨다운·스래싱 방지 컬럼 | **안 넣음 확정** (2026-08-06) | 단일 프로세스는 메모리로 충분 — 멀티프로세스 게이트웨이의 요구였다 (`COMPACTION.md` §7) |
| `compression_locks` 멀티프로세스 배타 | 안 넣음 | 개인 1인 단일 프로세스 — 압축 채택(2026-08-06) 후에도 불변. `busy_timeout`으로 충분 |
| 손상 DB 복구·격리 파이프라인 | 안 넣음 | REUSE-MAP §2.4 확정. 대규모 운영에서 나온 방어다 |
| NFS/SMB/WSL1 WAL 폴백 감지 | 안 넣음 | REUSE-MAP §2.4 확정 — 실패 시 명시적 에러가 silent 폴백보다 낫다(§2.6) |
| Kysely 쿼리 빌더 | 안 넣음 | TECH-STACK §5. 테이블 3개에 raw SQL로 충분. **트리거**: 스키마가 커져 raw SQL이 부담이 될 때 |
| 세션 레인 직렬화 (`lanes.ts`) | 안 넣음 | 동시 다중 세션이 MVP 밖 |
| 전용 스레드 토큰 카운터 배치 라이터 | 안 넣음 | REUSE-MAP §2.4 확정 |

---

## 9. 미결 — 이 문서가 정하지 않은 것

- **soft-delete된 행의 물리 삭제 시점.** `active = 0`만 쌓이면 DB가 단조 증가한다. **트리거**: DB 크기 실측. 재론 시 **압축 체인 단위 정리를 함께** 본다(2026-08-06 추가 — `/delete`는 체인 tip만 내리고 superseded 부모 행들은 목록 밖에 남는다, `COMPACTION.md` §10).
- ~~**`messages.compacted`의 필요 여부.**~~ — 2026-08-06 해소: **안 넣음** (§8 표).
- ~~**FTS5 도입 시점.**~~ → **2026-08-07 해소** — 채택 확정(`SEARCH.md`). 스키마 v3(`messages_fts`)와 `searchMessages`가 이 저장소에 추가된다. 검색의 정본은 `SEARCH.md`이고 이 문서는 스키마·트랜잭션 규율의 정본으로 남는다.
- **같은 세션에 두 프로세스가 동시에 쓰는 경우.** `busy_timeout`으로 시작하고 세션 락은 두지 않는다. 두 CLI가 같은 세션을 여는 것을 막지 않으며, 그때의 트랜스크립트 순서 보장은 정의하지 않는다.
- ~~**세션 export·백업 형식.**~~ — 2026-08-06 CLI 설계에서 판정: **MVP 제외**(`CLI-INTERFACE.md` §11). DB 파일 복사로 대체 가능한 동안은 명령 표면을 늘리지 않는다. 트리거: 사람이 읽는 형식(markdown) 요구 실측.
