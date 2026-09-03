# 이식 금지 목록 — 컴플라이언스 경계

**두 레퍼런스에서 neo-agent로 옮기지 않는 것의 정본.**

- 상태: 구현 주장 없음
- 작성일: 2026-09-03

| 이 문서가 든다 | 이 문서가 안 든다 |
|---|---|
| 이식 금지 목록의 전문 — 파일·식별자 단위 증거까지 | 기록 체계·백업 경로·에이전트 라우팅 등 작업 하네스 |
| 이식 시 지킬 원칙과 양성 사례 | 레퍼런스의 구조 분석 (루트 `docs/`) |
| 근거 분류 체계 (`vendor-documented` 계열) | 무엇을 언제 가져오는가의 판정 — `REUSE-MAP.md` |

**이 문서는 강제층이 아니다.** 실제 강제는 제품 트리 안의 둘이 진다 — `ARCHITECTURE.md` §2.2가 정한 타입(그 계약은 `CORE-INTERFACE.md` §8이 든다)과 `packages/providers/test/compliance.test.ts`의 계약 테스트. 이 문서는 **왜 그 타입이 그렇게 생겼는지**를 설명하는 층이고, 그 이상을 주장하지 않는다. 판정의 계보(무엇을 언제 가져오는가)는 `REUSE-MAP.md`가 든다.

---

**두 레퍼런스 모두 AI 제공사 ToS를 위반하는 코드를 포함한다.** 이 코드들은 neo-agent로 옮기지 않는다. 유사한 패턴을 새로 작성하지도 않는다.

### 절대 이식 금지

**소비자 구독 OAuth 토큰 재사용 + 공식 클라이언트 위장**
- `hermes-agent-main/agent/anthropic_adapter.py` — Claude Code CLI의 client_id(`9d1c250a-...`) 복제, `claude.ai/oauth/authorize` 소비자 엔드포인트, `user-agent: claude-code/...` 위조. 코드 주석이 "spoofed user-agent", "to avoid Anthropic's server-side content filters"라고 적고, 나아가 `claude-code/`로 시작하는 UA에 Anthropic이 토큰 엔드포인트 레이트리밋을 건다는 것과 그것을 그대로 흉내 낸다는 것까지 주석으로 밝혀 우회 의도를 직접 문서화한다. 시스템 프롬프트에 "You are Claude Code, Anthropic's official CLI"를 주입하고 `Hermes Agent` → `Claude Code` 문자열을 치환한다. `mcp_` → `mcp__` 툴명 변환으로 과금 분류기를 우회한다.
- `openclaw-main/packages/ai/src/providers/anthropic.ts` (912-928, 1296-1307), `openclaw-main/src/llm/utils/oauth/anthropic.ts` — 같은 client_id, `user-agent: claude-cli/2.1.75`, `x-app: cli`, 동일한 시스템 프롬프트 주입. 근거로 제시된 것은 "Anthropic staff told us this usage is allowed again"이라는 비공식 구두 진술뿐이다.
- `hermes-agent-main/hermes_cli/auth.py` + `hermes-agent-main/agent/auxiliary_client.py` — ChatGPT 소비자 백엔드(`chatgpt.com/backend-api/codex`), Codex CLI client_id 복제, `originator: codex_cli_rs`로 **Cloudflare 봇 차단 우회**를 주석에 자백.
- `hermes-agent-main/hermes_cli/copilot_auth.py`, `openclaw-main/src/agents/copilot-dynamic-headers.ts` + `openclaw-main/extensions/github-copilot/` — VS Code의 GitHub App client_id(`Iv1.b507a08c87ecfe98`)로 VS Code Copilot Chat을 위장해 내부 전용 모델에 접근.
- 로컬 CLI 크리덴셜 절취 — macOS Keychain의 `Claude Code-credentials` 직접 읽기, `~/.codex/auth.json`·`~/.qwen/oauth_creds.json` 채택.

**레이트리밋 회피용 다계정 로테이션**
- `hermes-agent-main/agent/credential_pool.py`, OpenClaw의 auth profile 페일오버. 다중 **API 키** 로테이션 자체는 정당하지만, 소비자 구독 OAuth 그랜트를 여러 개 등록해 429마다 넘기는 구성은 금지. neo-agent는 공식 API 키 인증만 지원한다.

**비공식/리버스 엔지니어링 플랫폼 클라이언트**
- WhatsApp(`baileys` — WhatsApp Web 프로토콜 리버스 엔지니어링), Zalo 개인계정(`zca-js`, OpenClaw 자체가 "may result in account suspension or ban"이라 경고), WeChat 개인계정 자동화(`hermes-agent-main/gateway/platforms/weixin.py`), iMessage(`chat.db` 직접 읽기 + Messages.app에 IMCore bridge 주입).
- 메시징 채널이 필요하면 **공식 봇 API만** 사용한다 (Telegram Bot API, Discord Bot API, Slack App 등).

### 이식 시 반드시 지킬 원칙

- 모델 접근은 **공식 API 키 + 공식 엔드포인트**만. OAuth를 쓴다면 해당 제공사가 서드파티 도구 사용을 명시적으로 허용한 경로만 쓰고, 근거 문서 URL을 코드 주석에 남긴다.
- User-Agent·클라이언트 식별자는 **정직하게** neo-agent로 보낸다. 다른 제품을 사칭하는 헤더·프롬프트·문자열 치환을 넣지 않는다.
- 참고할 만한 양성 사례: OpenClaw의 OpenAI ChatGPT OAuth 경로는 `originator: "openclaw"`, `User-Agent: openclaw (...)`로 정직하게 신원을 밝히고 공식 문서를 근거로 인용한다 (`openclaw-main/packages/ai/src/providers/openai-chatgpt-responses.ts:1674-1692`). OpenClaw가 Google의 정책 변경 후 Gemini CLI / Antigravity OAuth 경로를 스스로 제거한 것도 좋은 전례다 (`openclaw-main/docs/providers/google.md:80-85`).
- OpenClaw의 `openclaw-main/src/agents/provider-attribution.ts`는 프로바이더별 근거를 `vendor-documented | vendor-hidden-api-spec | vendor-sdk-hook-only | internal-runtime`으로 분류·추적한다. **이 분류 체계 자체는 neo-agent에 도입할 가치가 있다** — `vendor-documented`가 아닌 경로는 애초에 만들지 않는다는 규칙의 강제 수단이 된다.
