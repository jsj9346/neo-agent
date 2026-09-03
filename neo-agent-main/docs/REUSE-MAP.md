# 레퍼런스 선별 지도 (Reuse Map)

**두 레퍼런스(OpenClaw, hermes-agent)에서 무엇을 가져오고, 무엇을 미루고, 무엇을 버리는지의 확정 기록.**

- 상태: 구현 주장 없음
- 작성일: 2026-08-05
- 최종 개정: 2026-08-13(머리 — 지위 선언을 필드로, `DOC-STATUS.md` §3) · 2026-09-03(「판정 등급」 표·§5 — 금지 등급의 관할과 §5 정본 주소를 `COMPLIANCE.md`로. 증거의 자리도 그 문서로 정정) · 2026-09-03(§2.8 — 주소 표기 정정. hermes의 런타임 산물 USER.md의 코드 스팬을 걷는다(`PUBLIC-TREE.md` §3.4 첫 행))
- 판정 기준: `ARCHITECTURE.md` §2.8 (MVP 범위)

> **`구현 주장 없음`인 이유** — 이 문서는 판정 기록이지 어떤 패키지의 계약이 아니다. 주장이 없으면 거짓일 수 없고, 그 상태를 값으로 승격한 것이 이 필드다(`DOC-STATUS.md` §3.2). 2026-08-13 전수 대조에서 이 문서가 적합 판정을 받은 근거가 정확히 그것이었다.
레퍼런스 상세 분석은 루트 `docs/openclaw-architecture.md`, `docs/hermes-agent-architecture.md`. 파일·줄번호는 전부 2026-08-05 스냅샷 기준이다 — 어긋나면 문서를 고치지 말고 심볼 이름으로 다시 찾는다.

> 루트 `CLAUDE.md`의 "재사용 후보" 표가 **언젠가 가치 있는 것**의 목록이라면, 이 문서는 그 목록을 MVP에 대고 거른 **언제 가져올 것인가**의 판정이다. 판정이 바뀌면 `devlog.md`에 근거를 남기고 이 문서를 갱신한다.

## 판정 등급

| 등급 | 뜻 |
|---|---|
| ✅ **채택 (MVP)** | 지금 이해 후 재작성한다. 코어 설계에 반영 |
| 🧬 **흔적만 채택** | 구현은 미루되, 되돌리기 어려운 **타입·스키마 흔적**만 지금 남긴다 |
| 🕐 **후순위** | 가치는 확인됐으나 MVP 아님. 해당 기능 도입 시점에 다시 본다 |
| ❌ **채택 안 함** | 개인 유저 1명에게 불필요. 근거를 남기고 버린다 |
| 🚫 **금지** | 컴플라이언스 위반. `COMPLIANCE.md` 이식 금지 목록 관할 |

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
| FTS5 대화 검색 (IDEA-004) | 양쪽 | ✅ 채택 (2026-08-07 설계 확정 — `SEARCH.md`) | §2.4 |
| 컨텍스트 압축 (세션 분기) | hermes 분기 모델 + OpenClaw 요약 엔진 | ✅ 채택 (2026-08-06 설계 확정 — `COMPACTION.md`) | §2.4 |
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
| 와이어 프로토콜 (closedObject 원칙) | OpenClaw `gateway-protocol` | ✅ 채택 (2026-08-19 설계 확정 — `WEB-UI.md` §6) | §3 |
| WebSocket 전송 (`ws` 의존성) | OpenClaw `src/gateway/server-http.ts` | ❌ 안 함 (2026-08-20 — `WEB-UI.md` §2.1) | §3 |
| SSE 이벤트 스트림 + 개입은 개별 POST | hermes `gateway/platforms/api_server.py` | ✅ 채택 (2026-08-20 설계 확정 — `WEB-UI.md` §2.1) | §3 |
| 페어링 모델 | OpenClaw `src/pairing/` | 🕐 후순위 | §3 |
| 메모리 (파일 기반 프로즌 스냅샷) | hermes `tools/memory_tool.py`, OpenClaw `src/memory/root-memory-files.ts` | ✅ 채택 (2026-08-09 설계 확정 — `MEMORY.md`) | §2.8 |
| 메모리 내용 위협 스캔 (`[BLOCKED]` 치환) | hermes `memory_tool.py:69-86` | ❌ 안 함 | §2.8 |
| 메모리 조회·검색·RAG 인덱스 | OpenClaw `memory_index_*`, `memory-core` | ❌ 안 함 | §2.8 |
| 배포 = 빌드 없는 링크 설치 | hermes wheel/sdist 의도적 차단 | ✅ 채택 (2026-08-09 설계 확정 — `DISTRIBUTION.md`) | §2.9 |
| 공급망 핀 (정확 핀·릴리스 대기·pnpm 고정) | hermes `==X.Y.Z`, OpenClaw `minimumReleaseAge` | ✅ 채택 | §2.9 |
| 셸 인스톨러·관리형 체크아웃·Nix·번들러·npm publish | hermes §2.3, OpenClaw tsdown | ❌ 안 함 | §2.9 |
| CLI 운영 명령 (`doctor`·`onboard`·`update`·`uninstall`·`migrate`) | OpenClaw 루트 명령 20종 | ❌ 안 함 | §2.9 |
| CI 워크플로 (OSV·공급망 감사) | OpenClaw 23개, hermes `osv-scanner.yml` | 🕐 후순위 | §3 |
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
  > **2026-08-08 흔적 회수 — 정책 집행 채택** (`WEB-ACCESS.md` §5). `web_fetch`가 `source: "network"`를 실제로 발생시키는 첫 지점이 되면서 집행을 열었다. 집행 형태는 **오염된 런에서 allowlist 숏컷 무효화** — 새 정책 계층이 아니라 위험 패턴이 쓰는 기존 기계의 재사용(사다리 1단)이다. 오염 수명은 런 단위(`agent_start`에서 초기화). 위 문장의 전제(셸이 curl을 칠 수 있다는 것)는 같은 날 샌드박스 `network: "none"`으로 **거짓이 됐다** — 그래서 셸의 `source`는 `"local"` 고정을 유지한다.

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

**❌ 안 가져올 것**: 승인 게이트를 보안 경계로 취급하는 것. `hermes-agent-main/SECURITY.md:58-65`가 정직하게 선언했듯 **유일한 경계는 OS다.** 게이트는 실수 방지 장치이지 격리가 아니며, 이 전제를 문서·설계에 명시한다.

### 2.3 도구 시스템 — 최소 집합, 명시 등록

**참조**: `openclaw-main/src/agents/sessions/tools/`(read/write/edit/ls/grep/find/bash), `src/agents/bash-tools.*`

**✅ 가져올 것**:

- **도구 집합 그 자체** — 파일 read/write/edit + 셸 exec. OpenClaw의 세션 도구 목록이 사실상 우리 MVP 목록과 일치한다. 스키마는 Zod로, `additionalProperties: false` 상당(closed object)을 기본으로.
- **도구 결과는 프롬프트다** (OpenClaw Product Doctrine) — 도구는 ack가 아니라 모델이 다음에 필요한 것을 반환한다. 도구 텍스트 설계를 1급 관심사로.
- **사용 불가 도구는 실패시키지 말고 숨긴다** — 조건부 노출(Footprint Ladder 3단)의 기초.

**❌ 안 가져올 것**:

- **AST 기반 자동 디스커버리 + 툴셋 합성**(hermes `tools/registry.py:67`, `toolsets.py`) — 도구 145ms 절약용 디스크 캐시까지 딸린 이 구조는 도구 수십 개 + 플러그인 생태계의 요구다. MVP 도구는 ~5개, **명시적 배열 등록이면 충분하고 더 안전하다**(등록 경로가 코드에 보인다).
- OpenClaw 고유 도구 ~50종, hermes 7종 터미널 백엔드(local만 쓴다), `check_fn` 서비스 게이팅(조건부 노출이 필요해지는 시점에).

**🕐 후순위**: 점진적 툴 공개(IDEA-003) — 도구 5개엔 숨길 것이 없다. MCP 도입(사다리 5단) 시점의 과제로 미룬다. 단 IDEA-003의 "이미 노출된 툴을 회수해야 해서 사실상 불가능하다"는 논리는 유효하므로, **코어 도구 추가 기준을 극단적으로 높이는 규율**(§2.5 원칙)로 지금은 대신한다.

### 2.4 세션 영속화 — 스키마 흔적이 가장 중요하다

**참조**: `hermes-agent-main/hermes_state_common.py`(DDL, 스키마 v25), `hermes_state_schema.py`, `openclaw-main/src/state/openclaw-agent-schema.sql`

**✅ 가져올 것**:

- **STRICT 테이블**(OpenClaw 전 테이블) — `node:sqlite`에서 동일하게 가능. 타입 오염을 DB 레벨에서 차단.
- **`schema_version` 테이블 + 마이그레이션 규율**(양쪽 공통) — v1부터 넣는다. 나중에 넣는 마이그레이션 체계는 이미 늦다.
- **메시지 soft-delete**(hermes `messages.active`/`compacted`) — 물리 삭제 대신 상태 컬럼. 압축·디버깅·감사가 전부 이것에 기댄다.
- **WAL 모드 기본** — 단 hermes의 NFS/SMB/ZFS/WSL1 감지 폴백(`journal_mode=DELETE`)은 안 가져온다. 개인 로컬 머신 대상이므로 "WAL 실패 시 명시적 에러"가 silent 폴백보다 낫다(§2.6 가시적 결과 원칙).

**🧬 흔적만 남길 것**:

- **`sessions.parent_session_id`**(hermes 세션 계보) — 컨텍스트 압축은 후순위지만, hermes가 압축을 **세션 분기**로 구현한 것은 옳았고 그 전제가 이 컬럼이다. 스키마 v1에 nullable로 넣어두면 압축 도입 시 마이그레이션이 필요 없다. → **2026-08-06 압축 채택으로 소비자가 생겼다** — 이 컬럼의 예상은 적중했으나 자기완결 분기가 messages PK 변경(스키마 v2)을 별도로 요구한다(`SESSION-STORE.md` §2).

**🕐 후순위**:

- ~~**FTS5 + 트라이그램 검색**(IDEA-004)~~ — 2026-08-07 **✅ 채택으로 전환** (`SEARCH.md`). 독립 trigram 단일 테이블 + 저장 동일 트랜잭션 색인. hermes 이중 인덱스·CJK 네이티브 확장·점진 재빌드는 기각(개인 규모) — 근거는 devlog 2026-08-07.
- ~~**압축 실패 쿨다운/스래싱 방지 컬럼**(`compression_failure_cooldown_until` 등)~~ — 2026-08-06 압축 설계에서 **❌ 안 넣음으로 확정**: 멀티프로세스 게이트웨이의 요구이고 우리는 단일 프로세스라 메모리로 충분하다(`COMPACTION.md` §7).

**❌ 안 가져올 것**: 손상 DB 복구/격리 파이프라인, 전용 스레드 토큰 카운터 배치 라이터, macOS 체크포인트 배리어 — 전부 대규모 운영에서 나온 방어다. 개인 1인 로컬에서 이 복잡성의 임대료를 낼 이유가 없다. **DB 2개 분리 여부(전역/에이전트별)는 2026-08-06 해소** — `SESSION-STORE.md` §8: 나누지 않는다. 분리의 근거가 다중 에이전트·디바이스 페어링·감사라 개인 1인에 없다. 같은 문서에서 **FTS5는 흔적조차 불필요**로 판정이 좁혀졌다 — 원본에서 재구축 가능한 파생 데이터라 `parent_session_id`(🧬)와 성격이 다르다.

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

- **리치 렌더링은 하되 프레임워크 없이** (2026-08-20 판정 — `CLI-INTERFACE.md` §7.1·§11). 근거는 실독 하나다: **두 레퍼런스의 리치 TUI 실물이 전부 「append-only 트랜스크립트 + 하단 고정 라이브 영역」**이고(hermes는 `rich.Live` 사용처 0건, 본문은 개행 단위 append; OpenClaw의 컴포넌트 트리도 수직 단일 스택), **우리 §7 렌더링 모델과 같다.** 프레임워크가 바꾸는 것은 렌더링 모델이 아니라 **레이아웃 엔진**이므로, 모델이 이미 맞는 자리에서는 값만 치른다. 첫 채택 범위는 하단 상태줄 하나.

**❌ 안 가져올 것**: 818줄 엔트리 shim의 콜드 스타트 최적화(사전계산 help fast-path 등 — 155개 확장을 로드하는 프로젝트의 고민이다), Commander 지연 커맨드 등록. **TUI 프레임워크 셋은 값이 서로 달라 갈라 적는다** (2026-08-20 — 그 전까지 한 줄에 묶여 있었고 그 묶음 자체가 부정확했다):

| 대상 | 판정 | 근거 |
|---|---|---|
| **자체 포크 Ink**(hermes `ui-tui/packages/hermes-ink/`) | ❌ | JSX가 구조적으로 필수라 **빌드 스텝을 강제**한다(2026-08-20 실측: Node v25.9.0에서 `.tsx`는 타입 스트리핑 대상 **밖**이라 어느 플래그로도 실행되지 않는다). `TECH-STACK.md` §2·`DISTRIBUTION.md` §2.1과 양립 불가. 실물도 「Ink 포크」가 아니라 Ink를 뼈대로 삼은 **자체 터미널 엔진**이다(마우스 워치독·손상영역 렌더링·자체 셀 버퍼·독자 termio 파서) — 개인 1인 기준(ARCHITECTURE §1) 밖 |
| **`pi-tui`**(OpenClaw) | ❌ — **값은 싸나 얻는 것이 모델이 아니다** | 이 문서가 그동안 **한 번도 들지 않았던 항목**이다. JSX 불필요(명령형 클래스 트리)라 타입 스트리핑을 통과하고 의존성도 셋(`pi-tui`+`get-east-asian-width`+`marked`)뿐이라 Ink와 값이 전혀 다르다. 배제 근거 셋: ① `cli`의 외부 런타임 의존성 0이 예산 게이트(`scripts/check-core-budget.mjs`)로 강제됨, ② `0.82.1`(0.x)이라 정확 핀 + `minimumReleaseAge` 48시간(`DISTRIBUTION.md` §8)과 겹치면 브레이킹 체인지 처분이 그 창에 갇힘, ③ 얻는 것이 레이아웃 엔진뿐. **트리거**: 하단 영역이 2D 배치를 요구할 때(①②는 그때도 남으므로 자동 채택은 아니다) |
| **Lit 웹 UI/TUI 프레임워크**(OpenClaw) | ❌ (이 절의 소관 아님) | 웹 UI의 정본은 `WEB-UI.md`이고 그 문서가 별도로 판정한다 |

### 2.7 설정·시크릿 — 규율만 먼저

**✅ 가져올 규율**:

- **`.env`는 시크릿 전용, 동작 설정은 config 파일**(hermes 하드 룰) — env var 스프롤을 처음부터 차단.
- **설정 스냅샷 원칙** — 보안 관련 설정은 시작 시 1회 읽고 동결(§2.2의 임포트 시점 동결 일반화).
- **프롬프트 캐시 보존**(hermes 첫 원칙, 이미 ARCHITECTURE §2.4로 확정) — 메모리 프로즌 스냅샷, 스킬의 user 메시지 주입, 지연 무효화 기본. MVP에서 해당하는 것은 시스템 프롬프트 불변 규율 정도지만, 위반 패턴이 생기기 전에 규율로 못 박는다.
- OpenClaw의 **워크스페이스 `.env` fail-closed 차단** 아이디어(프로바이더 자격증명·자기 접두 env를 작업 디렉터리 `.env`에서 읽지 않음) — 클론된 저장소가 트래픽을 리다이렉트하는 경로 차단. 셸 도구가 있는 MVP에 실질 의미가 있다.

**미결 연결 → 해소(2026-08-06)**: 시크릿 저장 방식은 `SAFE-DEFAULTS.md` §3으로 확정 — 전용 파일 + 600 강제(fail-closed) + 자기접근 차단. 두 레퍼런스의 평문 저장 대비 개선 지점이 이것이다.

### 2.8 메모리 — 손실 방지만 가져오고 큐레이션 기계는 버린다 (2026-08-09)

**참조**: hermes `tools/memory_tool.py`(55KB — 부분 실독), `agent/system_prompt.py:505`,
`agent/conversation_compression.py:175-235` · OpenClaw `src/memory/root-memory-files.ts`,
`extensions/memory-core/src/memory-budget.ts`, `src/state/openclaw-agent-schema.sql:431`

§4의 "메모리는 파일 기반 프로즌 스냅샷(hermes 기본형)만으로 시작" 판정을 실장으로 확정했다.
정본은 **`MEMORY.md`**. **저장 매체가 파일이라는 판정은 양쪽 레퍼런스가 수렴한 지점이다** —
OpenClaw도 `MEMORY.md`는 파일이고 SQLite `memory_index_*`는 파생 인덱스일 뿐이다.

**✅ 가져올 것** — 전부 데이터 손실 방지 계열이다:

- **프로즌 스냅샷 + 라이브 2상태**(`memory_tool.py:148-175`) — 프롬프트는 스냅샷, 도구 응답은
  디스크. 이 분리가 ARCHITECTURE §2.4(캐시 불가침)의 실체다.
- **읽기 실패 ≠ 빈 저장소**(`_read_failed_error`) — 못 읽는 파일을 `[]`로 읽고 첫 쓰기에서
  덮으면 메모리 전체가 조용히 소실된다. 우리는 기동 실패로 처리한다.
- **심볼릭 링크 거부**(OpenClaw `root-memory-files.ts:41`) — 링크로 밖을 가리키면 denylist
  격리가 깨진다.
- **하드 문자 예산** — hermes 2,200/1,375 · OpenClaw 파일당 주입 상한 ~12KB. 매 호출 비용.

**❌ 안 가져올 것** (근거는 devlog 2026-08-09):

- **내용 위협 스캔 + `[BLOCKED]` 치환** — `WEB-ACCESS.md` §5가 이미 기각한 방향이며
  (거짓 방어 신호), 우리 위험 패턴은 명령·경로 지향이라 채택은 **산문 스캐너 신설**이다.
  지속 인젝션의 답은 오염 런 거부(`MEMORY.md` §5).
- **드리프트 감지 + `.bak`**(#26045) — append-only 형식이 문제를 소멸시켰다. 트리거:
  구조적 형식(구분자·프론트매터) 도입 시 검증기가 함께 와야 한다.
- **모델에게 통합 지시 + 턴당 실패 상한**(#42405) — 상한의 존재가 판단 착오의 증거.
- `replace`/`remove`/`batch`/`target`, USER.md 분리(트리거: 에이전트가 프로필을 갱신하기
  시작할 때), nudge(트리거: 모델이 저장을 안 하는 것이 실사용에서 관측될 때), 승인 스테이징,
  외부 프로바이더 8종, **RAG 인덱스·dreaming/REM 통합**(트리거: 스냅샷을 프롬프트에 다 싣기
  어려운 규모 = 이 설계의 전제가 무너질 때), 프로파일 스코프, volatile band 배치 최적화.

### 2.9 배포·설치 — 두 레퍼런스가 만든 배포 기계는 전부 남을 위한 것이다 (2026-08-09)

**참조**: `docs/hermes-agent-architecture.md` §2.1(공급망 핀 — Mini Shai-Hulud 이후 강화)·§2.3(배포 경로 한정)·§3.1(관리형 체크아웃) · `docs/openclaw-architecture.md` §2(`minimumReleaseAge`·`blockExoticSubdeps`·번들러)·CLI 루트 명령 20종. 정본은 **`DISTRIBUTION.md`**.

이 영역은 판정 기준이 유난히 단순하다 — **배포 기계의 대부분은 "설치하는 사람"과 "만드는 사람"이 다를 때 생기는 비용**이고, 우리는 그 둘이 같은 사람이다.

**✅ 가져올 것**:

- **빌드 산출물을 만들지 않는다는 판정 자체** — hermes가 `setup.py`로 wheel/sdist를 **의도적으로 차단**한 것과 같은 방향이다. 동기는 다르지만(그쪽은 관리형 체크아웃 강제) 결론이 같다는 것이, 이 형태가 실전에서 성립한다는 방증이다. 우리 근거는 실측이다(`DISTRIBUTION.md` §2.1 — `node_modules` 아래 `.ts`는 거부, 심볼릭 링크는 통과).
- **공급망 핀 4종** — 정확 핀(hermes), `minimumReleaseAge`·`blockExoticSubdeps`·패키지 매니저 버전 고정(OpenClaw). **외부 런타임 의존성 2개 규모에서는 전부 설정 한 줄이고 비용이 사실상 0이다.** 규모가 작을 때 조여 두는 것이 나중에 조이는 것보다 항상 싸다(§2.3 안전한 기본값과 같은 논리).

**❌ 안 가져올 것**:

- **셸 인스톨러(`curl \| bash`)·관리형 체크아웃·Nix·Docker 배포**(hermes 4종) — 전부 "제3자에게 전달"의 비용이다. 소비자가 본인이면 `git clone` 한 줄이 더 정직하고 신뢰 요구도 작다.
- **번들러(tsdown/rolldown)·npm publish**(OpenClaw) — 번들이 필요한 이유가 그쪽에 있다(확장 155개를 로드하면 tsx 실행이 ~220초). 우리 프로세스는 작고, 빌드를 넣는 순간 `TECH-STACK.md` §2가 얻으려 한 셋(줄번호 일치·드리프트 불가·갱신 절차 없음)을 전부 잃는다.
- **CLI 운영 명령 20종**(`doctor`·`onboard`·`setup`·`update`·`uninstall`·`migrate`…) — `CLI-INTERFACE.md` §5가 argv를 4개로 닫은 기결정과 정면으로 충돌한다. 우리 대응물은 전부 명령이 아니다: update = `git pull`, migrate = 기동 시 자동, uninstall = 링크 제거, doctor = 시작 시퀀스의 fail-closed 검사들.

**🕐 후순위**: CI(§3에 트리거와 함께 등록).

---

## 3. 후순위 — 도입 시점에 다시 볼 것

각 항목은 **트리거(무엇이 생기면 다시 보나)**와 함께 남긴다. 트리거 없이 미루면 영원히 안 본다.

| 항목 | 참조 | 트리거 |
|---|---|---|
| ~~**SSRF 방어**~~ | hermes `tools/url_safety.py:825`(connect 직전 재검증 + Host/SNI 보존), OpenClaw `src/infra/net/ssrf.ts`(`createPinnedLookup`) | **2026-08-08 채택으로 전환** (`WEB-ACCESS.md` §4). 트리거("웹 fetch/search 도구 도입 시", `8ccb23c`)를 충족한 정상 발동이다. "메타데이터 IP 차단은 설정으로도 해제 불가"(`8ccb23c`)는 **더 강하게** 이행됐다 — 완화 설정 자체를 만들지 않아 메타데이터뿐 아니라 사설 대역 전체가 해제 불가다. `ipaddr.js` 대신 내장 `net.BlockList`(실측 근거는 devlog 2026-08-08) |
| ~~**컨텍스트 압축**~~ | hermes 세션 분기, OpenClaw 요약 엔진 | **2026-08-06 채택으로 전환** (`COMPACTION.md`). 트리거("한도 도달 실측")는 미충족 상태의 선제 채택이었다 — 근거는 devlog 2026-08-06(실사용 전 마지막 구조 변경을 끝내 두는 시점 판단) |
| **점진적 툴 공개** (IDEA-003) | hermes `tool_search.py` vs OpenClaw 매니페스트 lazy activation | MCP 도입 또는 코어 도구가 ~10개를 넘을 때 |
| ~~**FTS5 대화 검색**~~ (IDEA-004) | hermes `hermes_state_search.py`, CJK 트라이그램 | **2026-08-07 채택으로 전환** (`SEARCH.md`). 트리거("검색 수요 실증")는 미충족 상태의 선제 채택 — 구현 난이도 축 판단, 근거는 devlog 2026-08-07 |
| **스킬 시스템** | OpenClaw `src/skills/`(Claude Code 포맷 호환 + `requires` 게이팅 + 설치 전 정적 스캐너), hermes의 user 메시지 주입 | Footprint Ladder 2단(CLI 명령 + 스킬)이 필요한 첫 기능이 나올 때 |
| ~~**샌드박스**~~ | OpenClaw `validate-sandbox-security.ts`(Docker 소켓 별칭·홈 민감 경로 denylist), `sanitize-env-vars.ts` | **2026-08-08 채택으로 전환** (`SANDBOX.md`). 트리거("§3.2(안전 기본값) 결정에서 샌드박스 방침이 정해질 때", `8ccb23c`) 충족. 기본 on 약속은 완화 없이 이행. 단 **denylist는 채택하지 않았다** — 마운트 추가 설정을 안 만들어 검증 대상 자체를 없앴다(더 높은 사다리 단계). 재도입 트리거: 추가 마운트 설정을 만드는 순간 검증기가 함께 와야 한다. `sanitize-env-vars`는 화이트리스트로 강화 채택 |
| ~~**와이어 프로토콜**~~ | OpenClaw `gateway-protocol`(closedObject 강제, 메서드×스코프 테이블) | **2026-08-19 채택으로 전환** (`WEB-UI.md` §6). 트리거(*"웹 UI 도입 시"*)를 충족한 정상 발동이다. 코드젠 불채택·**closedObject 원칙만**이라는 단서는 **그대로 이행됐고 실독이 그 판정을 보강했다** — 코드젠의 외부 언어 산출물을 실제로 소비하는 자리를 그 레포에서 찾지 못했다(주석 1건만 매치). 메서드×스코프 테이블은 스코프 축이 빠진 채 **미분류 기본 거부만** 들어왔다(`WEB-UI.md` §11) — 운영자가 1명이라 스코프가 전부 최고 권한으로 수렴한다 |
| ~~**웹 UI 전송 수단**~~ | OpenClaw `src/gateway/server-http.ts`(`ws` 8.x, 업그레이드 시점 사전인증) vs hermes `gateway/platforms/api_server.py`(SSE + 개별 POST) | **2026-08-20 판정 — `ws`는 ❌ 안 함, SSE + POST를 ✅ 채택**(`WEB-UI.md` §2.1). 트리거(*"웹 UI 도입 시"*) 충족. **판정을 가른 것은 우리 프로토콜 자신이다** — §6의 프레임 셋이 이미 *밀어내는 이벤트*와 *왕복하는 요청*으로 갈려 있어 양방향 소켓이 파는 능력을 쓰지 않는다. OpenClaw가 `ws`를 지는 요구(사전인증·연결 예산·아웃바운드 realtime)는 §4가 인증을 없애면서 전부 사라졌고, **같은 레포가 저부담 소비자용으로 SSE도 둔다**(`sessions-history-http.ts`). hermes는 승인의 프로세스 귀속(§7)까지 SSE 위에서 성립시켜 존재 증명이 됐다. **다만 그쪽 수명 정책은 안 가져온다** — 단일 구독자 큐(재접속 404)와 «연결이 곧 실행»은 §8이 정면으로 거부한 것이다. 외부 런타임 의존성 0이 목표에서 **계약**으로 승격됐다 |
| **페어링 모델** | OpenClaw `src/pairing/`(혼동 문자 제외 알파벳, TTL, 대기 캡) | 메시징 채널(공식 봇 API) 도입 시 |
| **스킬 자동 제안** (IDEA-005) | OpenClaw `skills/workshop/` 4단계 | 스킬 시스템 도입 이후 |
| **서브에이전트 위임** | hermes `delegate_tool.py`의 leaf/orchestrator 역할 분리, `subagent_lifecycle.py` 불변 계약 | 단일 세션으로 부족한 실제 작업 패턴이 관측될 때 |
| **CI 워크플로** | OpenClaw `.github/workflows/` 23개, hermes `osv-scanner.yml`·`supply-chain-audit.yml` | 외부 기여 PR이 오거나, 통합 게이트를 안 돌린 푸시 사고가 실제로 날 때. 현재는 `pnpm check` + `/execute` 사이클의 규율이 그 자리를 메운다 (`DISTRIBUTION.md` §8) |
| **npm 배포 (빌드 도입)** | OpenClaw의 일부 패키지 npm 배포 | 제3자 설치 요구가 실증될 때(공개 레포에 설치 문의가 열리는 등). 그때 npm 경로는 **순수 추가**이며 링크 설치를 대체하지 않는다 (`DISTRIBUTION.md` §2.2) |

## 4. 채택 안 함 — 근거와 함께 버리는 것

**복잡성의 원천이 우리 요구에 없다**는 것이 공통 근거다. 두 레퍼런스 복잡성의 상당 부분은 다중 채널·다중 사용자·생태계 운영에서 온다.

| 항목 | 근거 |
|---|---|
| 멀티채널 27종 + 채널 추상화(~30종 어댑터 인터페이스) | 개인 1인. 채널이 필요해도 공식 봇 API 1~2개면 충분하고, 그때 30종 어휘가 아니라 그 1~2개에 맞는 좁은 인터페이스를 만든다 |
| 멀티프로파일 / 멀티테넌시 | 운영자 1명. hermes 스스로 "프로파일은 의도적으로 독립된 섬"이라며 상속 PR을 거부할 만큼 비용이 큰 축이다 |
| 플러그인 SDK (OpenClaw 600+ 파일, hermes 5종 체계) | Footprint Ladder 4단은 "제3자가 확장한다"의 요구. 1인용은 코드 직접 수정(1단)이 항상 더 싸다. 필요해지면 그 시점의 실제 요구로 설계 |
| 마켓플레이스(ClawHub) / agentskills.io 연동 | 배포 생태계가 없다 |
| Gateway 상주 데몬 + 345 메서드 RPC | CLI 단일 프로세스로 충분. 웹 UI 시점에 프로세스 분리를 다시 판단(§3 와이어 프로토콜과 함께) → **2026-08-19 재판단됨: 프로세스를 분리하지 않는다.** `neo-agent serve`가 상주하되 **데몬화하지 않고**(포그라운드·pidfile 없음·수명은 systemd) CLI는 클라이언트가 되지 않는다 — 직접 실행 경로를 유지한다. 345 메서드 RPC는 여전히 안 가져오고 최소 메서드 집합만 둔다. 정본은 `WEB-UI.md` §3 |
| cron 스케줄러(hermes 320KB+, OpenClaw ~40파일) | MVP 아님. 개인용 가치는 인정하나 "대화하는 에이전트"가 검증된 뒤의 기능. 필요 시 idea로 재제안 |
| Kanban 멀티 에이전트 큐, 배치 트라젝토리 러너, 학습 데이터 압축 | 리서치 조직(Nous)의 요구. 우리는 학습 데이터를 만들지 않는다 |
| Honcho 변증법적 사용자 모델링, 메모리 외부 백엔드 8종 | 메모리는 파일 기반 프로즌 스냅샷(hermes 기본형)만으로 시작 → **2026-08-09 소비됨**: 이 판정이 §2.8(`MEMORY.md`)의 전제가 됐다 |
| Companion apps / 디바이스 노드 / Canvas / 음성 | 하드웨어 확장 축 전체가 범위 밖 |
| ACP 어댑터, MCP **서버** 노출(에이전트를 도구로 노출) | 소비자가 없다. MCP **클라이언트**(도구 가져오기)는 사다리 5단으로 언젠가 열릴 수 있으나 서버 방향은 별개 |
| Electron/Tauri 데스크톱 | 웹 UI조차 후순위. 데스크톱은 그 다음 |
| 7종 터미널 백엔드(Modal, Daytona, Vercel…) | local 하나. 원격 실행 요구가 생기면 SSH 하나를 그때 |
| 콜드 스타트 최적화 인프라(사전계산 help, compile cache, 지연 등록 전반) | 확장 155개를 로드하는 프로젝트의 문제. 우리 프로세스는 작다 |

## 5. 금지 — 컴플라이언스

이 문서는 판정만 기록한다. **정본은 `COMPLIANCE.md`**이고 파일·식별자 단위 증거도 그 문서가 든다. 요약:

- 소비자 구독 OAuth 재사용 + 공식 클라이언트 위장 (Anthropic/OpenAI/Copilot 전 경로)
- 레이트리밋 회피용 다계정 로테이션
- 비공식/리버스 엔지니어링 플랫폼 클라이언트 (WhatsApp baileys, Zalo, WeChat 개인계정, iMessage)
- 콘텐츠 필터·과금 분류기·봇 차단 우회 일체

**양성 기준선**: OpenClaw의 OpenAI 경로(`originator: "openclaw"` — 정직한 신원 + 공식 문서 인용)와 Google 정책 변경 후 스스로 제거한 전례(`openclaw-main/docs/providers/google.md:80-85`). §2.5의 attribution 게이트가 이 기준선을 타입으로 강제한다.

---

## 6. 이 문서의 유지보수

- 판정 변경은 `devlog.md`에 근거를 남긴 뒤 이 문서를 갱신한다. **표만 고치고 devlog를 안 남기면 나중에 "왜 바뀌었지"를 알 수 없다.**
- 후순위 항목이 트리거를 만나면: idea.md 경유가 아니라 이 표에서 바로 착수 판단 — 이미 한 번 선별을 통과한 항목이다.
- 참조 줄번호는 2026-08-05 스냅샷. 어긋나면 심볼 이름으로 재탐색.

### 6.1 라이선스 고지 규칙 (2026-08-07 확정)

레퍼런스 파생 가능성에 대한 MIT 고지는 **git 루트 `THIRD_PARTY_NOTICES.md` 중앙 blanket 방식** 하나로 한다.

- **파일별 법적 헤더는 두지 않는다.** "이해 후 재작성" 원칙상 파일 단위 파생 판정이 늘 모호하고, 파일별 헤더는 매 파일 판정 비용에 더해 누락이 곧 규칙 위반이 되는 구조다. 중앙 blanket은 판정 없이 MIT 조건(고지 유지)을 가장 보수적으로 충족한다. OpenClaw 자신의 pi-mono 고지(`THIRD_PARTY_NOTICES.md`)가 동일 형식의 전례다.
- **코드 내 레퍼런스 경로 인용 주석은 법적 고지가 아니라 추적 수단이다.** 채택 재작성 시 근거 주석에 원 경로를 남기는 현행 관행을 유지한다 — 신규 의무가 아니라 명문화다.
- **제3의 레퍼런스가 ✅ 채택 판정을 받으면 `THIRD_PARTY_NOTICES.md`에 항목 추가가 판정 절차의 일부다.** 현행 두 레퍼런스는 blanket으로 이미 포괄되므로 파일은 그 전까지 정적이다.
