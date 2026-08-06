# 레퍼런스 선별 지도 (Reuse Map)

**두 레퍼런스(OpenClaw, hermes-agent)에서 무엇을 가져오고, 무엇을 미루고, 무엇을 버리는지의 확정 기록.**

작성일: 2026-08-05 · 판정 기준: `ARCHITECTURE.md` §2.8 (MVP 범위)
레퍼런스 상세 분석은 루트 `docs/openclaw-architecture.md`, `docs/hermes-agent-architecture.md`. 파일·줄번호는 전부 2026-08-05 스냅샷 기준이다 — 어긋나면 문서를 고치지 말고 심볼 이름으로 다시 찾는다.

> 루트 `CLAUDE.md`의 "재사용 후보" 표가 **"언젠가 가치 있는 것"**의 목록이라면, 이 문서는 그 목록을 MVP에 대고 거른 **"언제 가져올 것인가"**의 판정이다. 판정이 바뀌면 `devlog.md`에 근거를 남기고 이 문서를 갱신한다.

## 판정 등급

| 등급 | 뜻 |
|---|---|
| ✅ **채택 (MVP)** | 지금 이해 후 재작성한다. 코어 설계에 반영 |
| 🧬 **흔적만 채택** | 구현은 미루되, 되돌리기 어려운 **타입·스키마 흔적**만 지금 남긴다 |
| 🕐 **후순위** | 가치는 확인됐으나 MVP 아님. 해당 기능 도입 시점에 다시 본다 |
| ❌ **채택 안 함** | 개인 유저 1명에게 불필요. 근거를 남기고 버린다 |
| 🚫 **금지** | 컴플라이언스 위반. `CLAUDE.md` 이식 금지 목록 관할 |

**모든 채택은 "복사"가 아니라 "이해 후 재작성"이다** — 두 레퍼런스의 코드는 그쪽 제약(27채널, 멀티프로파일, 플러그인 하위호환) 아래 쓰였다.

---

## 1. 판정 요약표

| 대상 | 출처 | 판정 | 비고 |
|---|---|---|---|
| 에이전트 루프 엔진 (이중 루프 + 큐 상태 머신) | OpenClaw `agent-core` | ✅ 채택 | §2.1 |
| 턴 오염(taint) 추적 | OpenClaw `agent-loop.ts:1340` | 🧬 흔적만 | §2.1 |
| 승인 게이트 계층 구조 | hermes `tools/approval.py` | ✅ 채택 (4계층) | §2.2 |
| smart approval (보조 LLM 자동 승인) | hermes approval 4계층째 | 🕐 후순위 | §2.2 |
| 위협 패턴 매칭 (유계 필러, 유니코드 순서) | hermes `tools/threat_patterns.py` | ✅ 채택 | §2.2 |
| 승인 표시 위조 탐지 | OpenClaw `exec-approval-command-display` | ✅ 채택 | §2.2 |
| 파일·셸 도구 최소 집합 | OpenClaw `src/agents/sessions/tools/` | ✅ 채택 | §2.3 |
| AST 자동 툴 디스커버리 / 툴셋 합성 | hermes `tools/registry.py` | ❌ 안 함 | §2.3 |
| 점진적 툴 공개 (IDEA-003) | hermes `tool_search.py` 외 | 🕐 후순위 | §2.3 |
| SQLite 엔지니어링 (계보·soft-delete·버전) | hermes `hermes_state*.py` + OpenClaw 스키마 | ✅ 채택 (선별) | §2.4 |
| FTS5 대화 검색 (IDEA-004) | 양쪽 | 🕐 후순위 | §2.4 |
| 컨텍스트 압축 (세션 분기 + 쿨다운) | hermes | 🕐 후순위 + 🧬 스키마 흔적 | §2.4 |
| 프로바이더 attribution 게이트 (IDEA-002) | OpenClaw `provider-attribution.ts` | ✅ 채택 (강제로 승격) | §2.5 |
| Api/Provider 분리 (프로토콜/라우팅 이원화) | OpenClaw `packages/ai` | 🕐 보류 (교체 지점은 `CORE-INTERFACE.md` §8로 확정) | §2.5 |
| auth profile / 키 로테이션 / credential pool | 양쪽 | ❌ 안 함 | §2.5 |
| CLI = 이벤트 스트림 소비자 | OpenClaw 구조에서 도출 | ✅ 채택 | §2.6 |
| 슬래시 명령 중앙 레지스트리 | hermes `hermes_cli/commands.py` | ✅ 채택 (축소) | §2.6 |
| `.env`는 시크릿 전용, 설정은 config 파일 | hermes AGENTS.md 규칙 | ✅ 채택 | §2.7 |
| 프롬프트 캐시 보존 규율 | hermes AGENTS.md 첫 원칙 | ✅ 채택 (이미 §2.4 원칙) | §2.7 |
| SSRF 방어 (connect 직전 재검증, IP 피닝) | hermes `url_safety.py:825` + OpenClaw `ssrf.ts` | 🕐 후순위 | §3 |
| 샌드박스 설정 검증 denylist | OpenClaw `validate-sandbox-security.ts` | 🕐 후순위 | §3 |
| 스킬 시스템 (Claude Code 호환 + 스캐너) | OpenClaw `src/skills/` | 🕐 후순위 | §3 |
| 와이어 프로토콜 (closedObject 원칙) | OpenClaw `gateway-protocol` | 🕐 후순위 | §3 |
| 페어링 모델 | OpenClaw `src/pairing/` | 🕐 후순위 | §3 |
| 멀티채널·멀티프로파일·마켓플레이스 등 | 양쪽 | ❌ 안 함 | §4 |
| 소비자 OAuth 위장·비공식 클라이언트 전부 | 양쪽 | 🚫 금지 | §5 |

---

## 2. MVP 구성요소별 상세

### 2.1 에이전트 루프 — OpenClaw `agent-core`에서 가져온다

**참조**: `openclaw-main/packages/agent-core/src/agent-loop.ts`(1,394줄), `agent.ts`(643줄), `types.ts:548`(`AgentEvent` 유니온)

**✅ 가져올 설계** (구조를 배우고 다시 쓴다):

- **이중 while 루프** — 외부 루프(follow-up 큐 처리) + 내부 루프(툴 콜 반복). 턴 시작/종료 이벤트 방출 지점까지 포함.
- **큐 기반 상태 머신** — `prompt` / `steer`(진행 중 끼어들기) / `followUp`(턴 종료 후) / `abort` / `waitForIdle`. **CLI만 있어도 steer는 필요하다**(입력 중 인터럽트-리다이렉트). 이 큐 모델은 나중에 덧붙이기 어려우므로 처음부터 루프의 형태로 잡는다.
- **LLM 호출 런타임 주입** — 코어는 호출 구현을 갖지 않는다. OpenClaw가 `src/plugin-sdk/agent-core.ts:11-21` 한 곳에서만 배선하는 규율 포함.
- **코어 반환은 이벤트 스트림** — 렌더링은 바깥(CLI)의 일. `AgentEvent` 유니온을 닫힌 discriminated union으로.
- **훅은 프로퍼티 주입** — `beforeToolCall` / `afterToolCall` 정도의 최소 표면. hermes의 23종 훅은 구체적 소비자가 없는 한 만들지 않는다(hermes 스스로 "투기적 인프라" 금지를 선언).

**🧬 흔적만 남길 것**:

- **턴 오염(taint) 추적**(`agent-loop.ts:1340-1374`) — MVP에는 웹 도구가 없지만 **셸이 curl을 칠 수 있으므로** 외부 유래 콘텐츠는 존재한다. 정책 집행(오염 턴에서 위험 동작 제한)은 후순위로 미루되, `ToolResult`에 `source` 필드(예: `"local" | "network"`)를 **지금 타입에 넣는다**. 나중에 필드를 추가하면 모든 도구 구현을 다시 만져야 한다.

**❌ 안 가져올 것**:

- hermes `agent/conversation_loop.py`(7,336줄) — 동기 코드 + god-file 분해 진행 중. 루프 구조의 반면교사로만 쓴다. 단 **예산 추적·1턴 유예(grace call)** 개념은 루프 설계 시 참고 가치 있음.
- OpenClaw의 세션 레인 직렬화(`embedded-agent-runner/lanes.ts`) — 동시 다중 세션은 MVP에 없다.

### 2.2 승인 게이트 — hermes 5계층에서 4계층으로

**참조**: `hermes-agent-main/tools/approval.py`(4,380줄), `tools/threat_patterns.py`, `openclaw-main/src/infra/exec-approval-command-display.ts`

셸이 MVP에 들어가면서 승인 게이트는 **MVP 필수 구성요소**다(ARCHITECTURE §2.8). hermes의 5계층 중 4개를 가져온다:

**✅ 가져올 계층** (통과 순서대로):

1. **하드라인 블록리스트** — yolo류 설정으로도 우회 불가. hermes처럼 **의도적으로 최소**(루트 FS 파괴, 블록 디바이스, 셧다운급만). 넓히면 "어차피 다 물어보네"가 되어 사용자가 게이트 자체를 끈다.
2. **사용자 deny 규칙** — 글로브 매칭 + 난독화 변형 정규화(`r\m`, `git st""atus` 같은 우회 차단, `approval.py`의 정규화 로직 참조).
3. **위험 패턴 정규식** — `threat_patterns.py`의 두 기법을 그대로 배운다: **유계 필러**(`(?:\w+\s+){0,8}` — ReDoS 방지)와 **비가시 유니코드 검사 → NFKC 정규화 순서**(`:229-245` — 순서를 바꾸면 전각 동형이의어 우회가 뚫린다).
4. **영구 allowlist** — 복합 명령의 셸 연산자 숏컷 차단(`_has_allowlist_shell_operator` 대응물) 포함.

**✅ 함께 가져올 원칙**:

- **임포트 시점 동결**(`approval.py:33-35`) — 승인 모드를 매 호출마다 env에서 읽지 않고 프로세스 시작 시 동결. 프로세스 내부에서 도는 코드(스킬·프롬프트 인젝션)가 env를 바꿔 게이트를 우회하는 권한상승 경로를 차단. **neo-agent의 모든 보안 설정 읽기에 일반화할 원칙이다.**
- **승인 표시 위조 탐지**(OpenClaw `exec-approval-command-display.ts`) — 사용자에게 보여주는 명령 문자열의 비가시/동형이의 문자 탐지. 승인 UI가 거짓말하면 게이트 전체가 무의미하다.

**🕐 후순위**: smart approval(보조 LLM 자동 승인) — 판정용 LLM 호출 비용·프롬프트 설계가 따라오고, MVP 사용자는 1명(우리)이라 수동 승인의 마찰을 먼저 실측한 뒤 필요성을 판단한다.

**❌ 안 가져올 것**: 승인 게이트를 보안 경계로 취급하는 것. hermes `SECURITY.md:58-65`가 정직하게 선언했듯 **유일한 경계는 OS다.** 게이트는 실수 방지 장치이지 격리가 아니며, 이 전제를 문서·설계에 명시한다.

### 2.3 도구 시스템 — 최소 집합, 명시 등록

**참조**: `openclaw-main/src/agents/sessions/tools/`(read/write/edit/ls/grep/find/bash), `src/agents/bash-tools.*`

**✅ 가져올 것**:

- **도구 집합 그 자체** — 파일 read/write/edit + 셸 exec. OpenClaw의 세션 도구 목록이 사실상 우리 MVP 목록과 일치한다. 스키마는 Zod로, `additionalProperties: false` 상당(closed object)을 기본으로.
- **"도구 결과는 프롬프트다"** (OpenClaw Product Doctrine) — 도구는 ack가 아니라 모델이 다음에 필요한 것을 반환한다. 도구 텍스트 설계를 1급 관심사로.
- **"사용 불가 도구는 실패시키지 말고 숨긴다"** — 조건부 노출(Footprint Ladder 3단)의 기초.

**❌ 안 가져올 것**:

- **AST 기반 자동 디스커버리 + 툴셋 합성**(hermes `tools/registry.py:67`, `toolsets.py`) — 도구 145ms 절약용 디스크 캐시까지 딸린 이 구조는 도구 수십 개 + 플러그인 생태계의 요구다. MVP 도구는 ~5개, **명시적 배열 등록이면 충분하고 더 안전하다**(등록 경로가 코드에 보인다).
- OpenClaw 고유 도구 ~50종, hermes 7종 터미널 백엔드(local만 쓴다), `check_fn` 서비스 게이팅(조건부 노출이 필요해지는 시점에).

**🕐 후순위**: 점진적 툴 공개(IDEA-003) — 도구 5개엔 숨길 것이 없다. MCP 도입(사다리 5단) 시점의 과제로 미룬다. 단 IDEA-003의 "이미 노출된 툴은 회수 불가능" 논리는 유효하므로, **코어 도구 추가 기준을 극단적으로 높이는 규율**(§2.5 원칙)로 지금은 대신한다.

### 2.4 세션 영속화 — 스키마 흔적이 가장 중요하다

**참조**: `hermes-agent-main/hermes_state_common.py`(DDL, 스키마 v25), `hermes_state_schema.py`, `openclaw-main/src/state/openclaw-agent-schema.sql`

**✅ 가져올 것**:

- **STRICT 테이블**(OpenClaw 전 테이블) — `node:sqlite`에서 동일하게 가능. 타입 오염을 DB 레벨에서 차단.
- **`schema_version` 테이블 + 마이그레이션 규율**(양쪽 공통) — v1부터 넣는다. 나중에 넣는 마이그레이션 체계는 이미 늦다.
- **메시지 soft-delete**(hermes `messages.active`/`compacted`) — 물리 삭제 대신 상태 컬럼. 압축·디버깅·감사가 전부 이것에 기댄다.
- **WAL 모드 기본** — 단 hermes의 NFS/SMB/ZFS/WSL1 감지 폴백(`journal_mode=DELETE`)은 안 가져온다. 개인 로컬 머신 대상이므로 "WAL 실패 시 명시적 에러"가 silent 폴백보다 낫다(§2.6 가시적 결과 원칙).

**🧬 흔적만 남길 것**:

- **`sessions.parent_session_id`**(hermes 세션 계보) — 컨텍스트 압축은 후순위지만, hermes가 압축을 **세션 분기**로 구현한 것은 옳았고 그 전제가 이 컬럼이다. 스키마 v1에 nullable로 넣어두면 압축 도입 시 마이그레이션이 필요 없다.

**🕐 후순위**:

- **FTS5 + 트라이그램 검색**(IDEA-004) — 기술 전제는 이 머신에서 실측 검증됨(`TECH-STACK.md`). 도입 시점만 미결.
- **압축 실패 쿨다운/스래싱 방지 컬럼**(`compression_failure_cooldown_until` 등) — 압축 도입 시 함께.

**❌ 안 가져올 것**: 손상 DB 복구/격리 파이프라인, 전용 스레드 토큰 카운터 배치 라이터, macOS 체크포인트 배리어 — 전부 대규모 운영에서 나온 방어다. 개인 1인 로컬에서 이 복잡성의 임대료를 낼 이유가 없다. **DB 2개 분리 여부(전역/에이전트별)는 §3.1 미결** — 이 문서에서 결정하지 않는다.

### 2.5 모델 프로바이더 — 정직한 1개로 시작

**참조**: `openclaw-main/src/agents/provider-attribution.ts`, `packages/ai/src/providers/openai-chatgpt-responses.ts:1674-1692`(양성 사례)

**✅ 가져올 것**:

- **attribution 분류를 게이트로 승격**(IDEA-002, ARCHITECTURE §2.2) — OpenClaw는 `vendor-documented | vendor-hidden-api-spec | vendor-sdk-hook-only | internal-runtime`으로 **분류만 하고 강제하지 않아** 위반 경로가 남았다. 우리는 프로바이더 등록 타입이 `evidence: { kind: "vendor-documented"; url: string }`만 받게 해서 그 외 경로는 **컴파일이 안 되게** 한다. 이것이 TypeScript를 고른 이유 중 하나였다(`TECH-STACK.md`).
- **정직한 신원** — OpenClaw의 OpenAI 경로처럼 `User-Agent: neo-agent (...)`. 공식 Anthropic SDK + API 키.

**🕐 보류**: Api/Provider 분리 — 프로바이더 68개가 어댑터 9개를 공유하는 규모의 해법이다. 교체 지점은 `CORE-INTERFACE.md` §8의 `ModelClient` 인터페이스 하나로 확정됐고(ARCHITECTURE §2.9), 이원화는 2번째 프로바이더가 실제로 생길 때 판단한다.

**❌ 안 가져올 것**: auth profile 저장소, 다중 키/계정 로테이션(`credential_pool.py`, `<PROVIDER>_API_KEY_1..N`), 모델 카탈로그/가격 원격 오버레이, 68종 프로바이더 레지스트리와 lazy 등록 인프라. 개인 1인이 쓰는 프로바이더는 1~3개다.

### 2.6 CLI 프런트엔드 — 이벤트 스트림의 소비자

**참조**: OpenClaw 구조(코어 이벤트 → 렌더링 분리), `hermes_cli/commands.py`(슬래시 명령 중앙 레지스트리)

**✅ 가져올 것**:

- **CLI는 코어 이벤트 스트림의 소비자다** — 코어가 `AgentEvent`를 방출하고 CLI는 렌더링만 한다. 이 경계가 §2.1(전송 비의존)의 실체이고, 나중에 웹 UI가 같은 스트림을 소비한다.
- **슬래시 명령 중앙 레지스트리**(hermes 패턴의 축소판) — 명령 정의 한 곳에서 디스패치·help·자동완성이 파생되는 구조. 소비자가 CLI 하나뿐이므로 hermes처럼 6개 표면 자동 파생까지는 불필요하지만, "한 곳 정의" 원칙은 처음부터.

**❌ 안 가져올 것**: 자체 포크 Ink(hermes), Lit 웹 UI/TUI 프레임워크(OpenClaw), 818줄 엔트리 shim의 콜드 스타트 최적화(사전계산 help fast-path 등 — 155개 확장을 로드하는 프로젝트의 고민이다), Commander 지연 커맨드 등록.

### 2.7 설정·시크릿 — 규율만 먼저

**✅ 가져올 규율**:

- **`.env`는 시크릿 전용, 동작 설정은 config 파일**(hermes 하드 룰) — env var 스프롤을 처음부터 차단.
- **설정 스냅샷 원칙** — 보안 관련 설정은 시작 시 1회 읽고 동결(§2.2의 임포트 시점 동결 일반화).
- **프롬프트 캐시 보존**(hermes 첫 원칙, 이미 ARCHITECTURE §2.4로 확정) — 메모리 프로즌 스냅샷, 스킬의 user 메시지 주입, 지연 무효화 기본. MVP에서 해당하는 것은 시스템 프롬프트 불변 규율 정도지만, 위반 패턴이 생기기 전에 규율로 못 박는다.
- OpenClaw의 **워크스페이스 `.env` fail-closed 차단** 아이디어(프로바이더 자격증명·자기 접두 env를 작업 디렉터리 `.env`에서 읽지 않음) — 클론된 저장소가 트래픽을 리다이렉트하는 경로 차단. 셸 도구가 있는 MVP에 실질 의미가 있다.

**미결 연결 → 해소(2026-08-06)**: 시크릿 저장 방식은 `SAFE-DEFAULTS.md` §3으로 확정 — 전용 파일 + 600 강제(fail-closed) + 자기접근 차단. 두 레퍼런스의 평문 저장 대비 개선 지점이 이것이다.

---

## 3. 후순위 — 도입 시점에 다시 볼 것

각 항목은 **트리거(무엇이 생기면 다시 보나)**와 함께 남긴다. 트리거 없이 미루면 영원히 안 본다.

| 항목 | 참조 | 트리거 |
|---|---|---|
| **SSRF 방어** | hermes `tools/url_safety.py:825`(connect 직전 재검증 + Host/SNI 보존), OpenClaw `src/infra/net/ssrf.ts`(`createPinnedLookup`) | 웹 fetch/search 도구 도입 시. **메타데이터 IP 차단은 설정으로도 해제 불가**로 가져올 것 |
| **컨텍스트 압축** | hermes 세션 분기 + `compression_locks` + 실패 쿨다운 | 긴 세션에서 컨텍스트 한도 도달이 실제 관측될 때. 스키마 흔적은 §2.4에서 선반영 |
| **점진적 툴 공개** (IDEA-003) | hermes `tool_search.py` vs OpenClaw 매니페스트 lazy activation | MCP 도입 또는 코어 도구가 ~10개를 넘을 때 |
| **FTS5 대화 검색** (IDEA-004) | hermes `hermes_state_search.py`, CJK 트라이그램 | 세션 영속화가 돌고 "지난 대화 검색" 수요가 실제로 생길 때 |
| **스킬 시스템** | OpenClaw `src/skills/`(Claude Code 포맷 호환 + `requires` 게이팅 + 설치 전 정적 스캐너), hermes의 user 메시지 주입 | Footprint Ladder 2단(CLI 명령 + 스킬)이 필요한 첫 기능이 나올 때 |
| **샌드박스** | OpenClaw `validate-sandbox-security.ts`(Docker 소켓 별칭·홈 민감 경로 denylist), `sanitize-env-vars.ts` | 웹 fetch/search 도구 도입 시 함께(외부 유래 콘텐츠가 셸로 흐르는 최초 시점), 또는 allowlist 비대로 게이트 방어력 약화 판단 시. **도입 시 기본 on — `SAFE-DEFAULTS.md` §2가 약속을 못박음(2026-08-06).** denylist·Docker 하드닝 기본값은 그대로 재사용 가치 |
| **와이어 프로토콜** | OpenClaw `gateway-protocol`(closedObject 강제, 메서드×스코프 테이블) | 웹 UI 도입 시. TypeBox→Swift 코드젠은 다중 네이티브 클라이언트 요구가 없는 한 불채택 — **closedObject 원칙만** 가져온다 |
| **페어링 모델** | OpenClaw `src/pairing/`(혼동 문자 제외 알파벳, TTL, 대기 캡) | 메시징 채널(공식 봇 API) 도입 시 |
| **스킬 자동 제안** (IDEA-005) | OpenClaw `skills/workshop/` 4단계 | 스킬 시스템 도입 이후 |
| **서브에이전트 위임** | hermes `delegate_tool.py`의 leaf/orchestrator 역할 분리, `subagent_lifecycle.py` 불변 계약 | 단일 세션으로 부족한 실제 작업 패턴이 관측될 때 |

## 4. 채택 안 함 — 근거와 함께 버리는 것

**복잡성의 원천이 우리 요구에 없다**는 것이 공통 근거다. 두 레퍼런스 복잡성의 상당 부분은 다중 채널·다중 사용자·생태계 운영에서 온다.

| 항목 | 근거 |
|---|---|
| 멀티채널 27종 + 채널 추상화(~30종 어댑터 인터페이스) | 개인 1인. 채널이 필요해도 공식 봇 API 1~2개면 충분하고, 그때 30종 어휘가 아니라 그 1~2개에 맞는 좁은 인터페이스를 만든다 |
| 멀티프로파일 / 멀티테넌시 | 운영자 1명. hermes 스스로 "프로파일은 의도적으로 독립된 섬"이라며 상속 PR을 거부할 만큼 비용이 큰 축이다 |
| 플러그인 SDK (OpenClaw 600+ 파일, hermes 5종 체계) | Footprint Ladder 4단은 "제3자가 확장한다"의 요구. 1인용은 코드 직접 수정(1단)이 항상 더 싸다. 필요해지면 그 시점의 실제 요구로 설계 |
| 마켓플레이스(ClawHub) / agentskills.io 연동 | 배포 생태계가 없다 |
| Gateway 상주 데몬 + 345 메서드 RPC | CLI 단일 프로세스로 충분. 웹 UI 시점에 프로세스 분리를 다시 판단(§3 와이어 프로토콜과 함께) |
| cron 스케줄러(hermes 320KB+, OpenClaw ~40파일) | MVP 아님. 개인용 가치는 인정하나 "대화하는 에이전트"가 검증된 뒤의 기능. 필요 시 idea로 재제안 |
| Kanban 멀티 에이전트 큐, 배치 트라젝토리 러너, 학습 데이터 압축 | 리서치 조직(Nous)의 요구. 우리는 학습 데이터를 만들지 않는다 |
| Honcho 변증법적 사용자 모델링, 메모리 외부 백엔드 8종 | 메모리는 파일 기반 프로즌 스냅샷(hermes 기본형)만으로 시작 |
| Companion apps / 디바이스 노드 / Canvas / 음성 | 하드웨어 확장 축 전체가 범위 밖 |
| ACP 어댑터, MCP **서버** 노출(에이전트를 도구로 노출) | 소비자가 없다. MCP **클라이언트**(도구 가져오기)는 사다리 5단으로 언젠가 열릴 수 있으나 서버 방향은 별개 |
| Electron/Tauri 데스크톱 | 웹 UI조차 후순위. 데스크톱은 그 다음 |
| 7종 터미널 백엔드(Modal, Daytona, Vercel…) | local 하나. 원격 실행 요구가 생기면 SSH 하나를 그때 |
| 콜드 스타트 최적화 인프라(사전계산 help, compile cache, 지연 등록 전반) | 확장 155개를 로드하는 프로젝트의 문제. 우리 프로세스는 작다 |

## 5. 금지 — 컴플라이언스

이 문서는 판정만 기록한다. **정본은 루트 `CLAUDE.md` "컴플라이언스 — 이식 금지 목록"**이며 파일·줄번호 증거는 루트 `docs/` 두 분석 문서 §7에 있다. 요약:

- 소비자 구독 OAuth 재사용 + 공식 클라이언트 위장 (Anthropic/OpenAI/Copilot 전 경로)
- 레이트리밋 회피용 다계정 로테이션
- 비공식/리버스 엔지니어링 플랫폼 클라이언트 (WhatsApp baileys, Zalo, WeChat 개인계정, iMessage)
- 콘텐츠 필터·과금 분류기·봇 차단 우회 일체

**양성 기준선**: OpenClaw의 OpenAI 경로(`originator: "openclaw"` — 정직한 신원 + 공식 문서 인용)와 Google 정책 변경 후 스스로 제거한 전례(`docs/providers/google.md:80-85`). §2.5의 attribution 게이트가 이 기준선을 타입으로 강제한다.

---

## 6. 이 문서의 유지보수

- 판정 변경은 `devlog.md`에 근거를 남긴 뒤 이 문서를 갱신한다. **표만 고치고 devlog를 안 남기면 나중에 "왜 바뀌었지"를 알 수 없다.**
- 후순위 항목이 트리거를 만나면: idea.md 경유가 아니라 이 표에서 바로 착수 판단 — 이미 한 번 선별을 통과한 항목이다.
- 참조 줄번호는 2026-08-05 스냅샷. 어긋나면 심볼 이름으로 재탐색.
