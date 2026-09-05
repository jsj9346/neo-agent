# neo-agent

**개인 사용자 1명을 위한 AI 에이전트.** 터미널에서 대화하면 모델이 파일을 읽고 쓰고, 셸 명령을 돌리고, 웹을 가져와 일을 진행한다. 대화는 로컬 SQLite에 저장되어 나중에 이어갈 수 있고, 도구 실행은 기본적으로 실행 전에 사람에게 묻는다. 단일 프로세스로 돌며 상주 데몬이 없고, 빌드 산출물 없이 clone한 소스 트리를 그대로 실행한다. 설계의 정본은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)다.

---

## 전제

| 항목 | 요구 |
|---|---|
| Node | **24 이상** (미만이면 진입점이 원인을 밝히고 거부한다) |
| pnpm | 워크스페이스 설치에 필요 (`packageManager` 필드가 버전을 선언한다) |
| 터미널 | **대화형 TTY 필수.** 파이프·cron·스크립트에서 실행하면 거부된다 — `--version`·`--help`도 예외가 아니다 |
| Docker | 선택. 없으면 **셸 도구가 등록되지 않고** 나머지 도구는 그대로 동작한다 — [`docs/SANDBOX.md`](docs/SANDBOX.md) |
| OS | 현재 Linux에서만 확인됐다 |

셸 도구는 기본적으로 Docker 컨테이너 안에서 실행된다(`sandbox: "on"`). Docker가 없으면 시작 시 두 갈래를 안내한다 — Docker 설치, 또는 `~/.neo-agent/config.json`에 `"sandbox": "off"`로 명시적 옵트아웃(호스트 실행).

## 설치

```bash
git clone https://github.com/jsj9346/neo-agent.git && cd neo-agent/neo-agent-main
pnpm install
mkdir -p ~/.local/bin
ln -s "$PWD/packages/cli/bin/neo-agent.mjs" ~/.local/bin/neo-agent
# ~/.local/bin이 PATH에 없으면: echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

전역 PATH에 놓이는 것은 심볼릭 링크이고 실체는 clone한 소스 트리에 있다. 빌드 단계가 없으므로 `pnpm install` 뒤 바로 실행된다.

되돌리기:

```bash
rm ~/.local/bin/neo-agent
```

## 컨테이너로 실행하기 (선택)

호스트에 Node를 설치하지 않고 쓰려면 공식 `node:24-bookworm` 이미지를 그대로 쓴다. **레포에 `Dockerfile`은 없다** — 이미지를 굽지 않는 것이 설계다([`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md) §3.3).

`pnpm install`은 호스트에서 미리 돌려 둔다(위 「설치」의 2번째 줄까지). 그다음:

```bash
docker run -it --rm \
  -v "$PWD:$PWD" -w "$PWD" \
  -v "$HOME/.neo-agent:$HOME/.neo-agent" \
  -u "$(id -u):$(id -g)" -e HOME="$HOME" \
  node:24-bookworm \
  node packages/cli/bin/neo-agent.mjs
```

`neo-agent-main/` 안에서 실행한다. 갱신은 호스트에서 `git pull` 하는 것이 전부다 — 다시 빌드할 이미지가 없다.

| 인자 | 왜 필요한가 |
|---|---|
| `-it` | 대화형 TTY. 없으면 기동이 거부된다 |
| `-v "$PWD:$PWD" -w "$PWD"` | 소스 트리 겸 워크스페이스. **호스트와 같은 절대 경로로** 마운트한다 |
| `-v "$HOME/.neo-agent:..."` | 세션 DB·설정·API 키. 없으면 컨테이너가 죽을 때 대화가 사라진다 |
| `-u "$(id -u):$(id -g)"` | 만들어지는 파일이 root 소유가 되지 않게. `credentials`(권한 600) 읽기에도 필요하다 |

**이 안에서는 셸 도구가 등록되지 않는다.** 이미지에 Docker가 없어서이고, 위 「전제」 표의 Docker 행과 같은 동작이다. 셸을 쓰려면 `~/.neo-agent/config.json`에 `"sandbox": "off"`를 **명시**한다 — 그때 격리를 지는 것은 컨테이너 자신이다. 실행 위치를 보고 자동으로 내려가지는 않는다([`docs/SANDBOX.md`](docs/SANDBOX.md) §3).

**컨테이너 안에서 `/var/run/docker.sock`을 마운트하지 않는다.** 셸 샌드박스를 컨테이너 안에서 다시 띄우려는 시도인데, 워크스페이스 경로가 조용히 어긋나 빈 디렉터리가 마운트된다 — 근거는 [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md) §3.4.

## API 키

Anthropic API 키를 다음 두 곳 중 하나에 둔다. **환경 변수가 우선이며, 있으면 파일을 읽지 않는다.**

1. 프로세스 환경 변수 `ANTHROPIC_API_KEY`
2. `~/.neo-agent/credentials` — `KEY=value` 형식(`#` 주석 허용)

```bash
mkdir -p ~/.neo-agent
printf 'ANTHROPIC_API_KEY=sk-ant-...\n' > ~/.neo-agent/credentials
chmod 600 ~/.neo-agent/credentials
```

`credentials` 파일이 존재하면 사용 여부와 무관하게 권한을 검사하고, 소유자 외에게 열려 있으면 수정 명령을 안내하며 기동을 거부한다. 워크스페이스의 `.env`는 읽지 않는다. 정본은 [`docs/CLI-INTERFACE.md`](docs/CLI-INTERFACE.md) §4, 보호 계약은 [`docs/SAFE-DEFAULTS.md`](docs/SAFE-DEFAULTS.md) §3.

## 실행

```
neo-agent                    새 세션을 시작한다
neo-agent --resume <접두>    세션 id 접두로 이전 대화를 이어간다
neo-agent --help             도움말
neo-agent --version          버전
```

그 밖의 조작은 대화 중 슬래시 명령으로 한다(`/help`, `/sessions`, `/resume`, `/new`, `/delete`, `/search`, `/compact`, `/memory`, `/exit`). 동작 설정은 `~/.neo-agent/config.json`이며 파일이 없으면 전부 기본값으로 돈다 — 키 목록은 [`docs/CLI-INTERFACE.md`](docs/CLI-INTERFACE.md) §3.

세션 DB·메모리·설정은 전부 `~/.neo-agent/` 아래에 있다.

## 갱신과 되돌리기

```bash
git pull
pnpm install        # pnpm-lock.yaml이 바뀐 경우
```

- **실행 중에 갱신하지 않는다.** 소스 트리가 곧 런타임이라, 도는 프로세스가 있는 상태에서 `git pull`을 하면 한 프로세스 안에 두 버전이 섞인다. 세션을 끝낸 뒤 갱신한다.
- **다운그레이드는 지원하지 않는다.** 새 버전으로 한 번 기동해 DB 마이그레이션이 적용되면 옛 커밋으로는 그 DB를 열 수 없다. 되돌릴 가능성이 있으면 갱신 전에 사본을 뜬다:

  ```bash
  cp ~/.neo-agent/sessions.db ~/.neo-agent/sessions.db.bak
  ```

자세한 것은 [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md) §5.

## 안전 기본값

설정을 만지지 않은 상태가 가장 안전하도록 기본값을 잡았다. 승인 게이트는 `manual`이 기본이고 파일 쓰기·셸 실행·워크스페이스 밖 읽기는 실행 전에 묻는다. 크리덴셜 경로는 승인으로도 접근할 수 없고, 셸이 스폰하는 프로세스의 환경 변수에서 시크릿을 제거한다. 셸 격리(`sandbox`)는 기본 `on`이며 컨테이너는 네트워크 없이 뜬다. 처음 접하는 호스트로의 `web_fetch`는 승인 대상이고, 네트워크에서 온 내용이 들어온 런에서는 학습된 허용이 무효화된다. 값과 계약의 정본은 [`docs/SAFE-DEFAULTS.md`](docs/SAFE-DEFAULTS.md)다.

**여기 있는 어떤 것도 보안 경계가 아니다. 유일한 경계는 OS다.** 승인 게이트·denylist·권한 검사는 실수 방지 장치이고, 적대적 프롬프트 인젝션에 대한 격리는 샌드박스가 닿는 범위(셸)까지다.

## 저장소 경계

저장소 루트에는 성격이 전혀 다른 디렉터리가 섞여 있다.

| 디렉터리 | 성격 | 수정 |
|---|---|---|
| `neo-agent-main/` (여기) | **우리가 만드는 것** — 소스코드와 설계 문서 | 자유 |
| `openclaw-main/`, `hermes-agent-main/` | 남의 코드. 참조용 스냅샷 | **금지 — 읽기 전용** |
| 루트의 비공개 기록 접두 | 프로젝트 운영 문서(로컬 전용, 공개 레포에 없다) | 지정된 스킬 경유 — 목록은 [`CONTRIBUTING.md`](CONTRIBUTING.md) 7절, 정본은 [`docs/PUBLIC-TREE.md`](docs/PUBLIC-TREE.md) §3.2 |

- **참조 소스트리는 읽기 전용이다.** 가져올 것이 있으면 복사하지 말고 **이해 후 재작성**한다 — 두 레퍼런스의 코드는 그 프로젝트의 제약(플러그인 SDK 하위호환, 채널 27종, 멀티프로파일) 아래 쓰였다.
- **루트 `docs/`와 `neo-agent-main/docs/`를 혼동하지 말 것.** 루트 `docs/`는 남의 코드를 읽은 결과이고, `neo-agent-main/docs/`가 우리 설계다.

## 문서 지도

전부 `neo-agent-main/docs/` 아래에 있고, 각각이 해당 영역의 **정본**이다.

| 문서 | 내용 |
|---|---|
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 설계 원칙과 열린 결정. **먼저 읽는다** |
| [`TECH-STACK.md`](docs/TECH-STACK.md) | 기술 스택 확정 기록 |
| [`REUSE-MAP.md`](docs/REUSE-MAP.md) | 두 레퍼런스에서 무엇을 가져오고 무엇을 버리는지 |
| [`COMPLIANCE.md`](docs/COMPLIANCE.md) | 두 레퍼런스에서 옮기지 않는 것 — 이식 금지 목록 |
| [`CORE-INTERFACE.md`](docs/CORE-INTERFACE.md) | `packages/core` — 에이전트 루프의 공개 계약 |
| [`CLI-INTERFACE.md`](docs/CLI-INTERFACE.md) | `packages/cli` — 조립 책임, 시작·종료 시퀀스, 설정·크리덴셜 |
| [`TOOLS-INTERFACE.md`](docs/TOOLS-INTERFACE.md) | `packages/tools` — 도구 계약과 워크스페이스 경계 |
| [`PROVIDERS.md`](docs/PROVIDERS.md) | `packages/providers` — 어댑터 경계와 근거 강제 |
| [`APPROVAL-GATE.md`](docs/APPROVAL-GATE.md) | `packages/gate` — 승인 게이트 |
| [`SESSION-STORE.md`](docs/SESSION-STORE.md) | `packages/store` — 세션 영속화와 마이그레이션 |
| [`COMPACTION.md`](docs/COMPACTION.md) | `packages/compaction` — 컨텍스트 압축 |
| [`SEARCH.md`](docs/SEARCH.md) | 세션 트랜스크립트 전문 검색 |
| [`MEMORY.md`](docs/MEMORY.md) | `packages/memory` — 세션을 넘는 기억 |
| [`WEB-ACCESS.md`](docs/WEB-ACCESS.md) | `packages/web` — SSRF 판정과 외부 유래 콘텐츠 취급 |
| [`WEB-UI.md`](docs/WEB-UI.md) | `packages/serve` — 웹 UI 서버·프로토콜·노출 경계 |
| [`SANDBOX.md`](docs/SANDBOX.md) | `packages/sandbox` — 컨테이너 하드닝과 조건부 노출 |
| [`SAFE-DEFAULTS.md`](docs/SAFE-DEFAULTS.md) | 설정을 안 만진 상태의 기본값과 보호 계약 |
| [`DISTRIBUTION.md`](docs/DISTRIBUTION.md) | 배포·설치·실행·갱신 |
| [`PUBLIC-TREE.md`](docs/PUBLIC-TREE.md) | 공개 트리 자족성 — 주소 부류·경계 층 인덱스·기여자 진입점 |
| [`BOUNDARY-LAYERS.md`](docs/BOUNDARY-LAYERS.md) | 경계 층 인덱스 — 어느 파일이 어느 경계 계약의 일부인가 |

**이 표는 정본을 쓰는 사람을 향한 것이 아니다.** 고치는 사람을 위한 규약(문서 형식·인용·주소 해결)은
[`CONTRIBUTING.md`](CONTRIBUTING.md)로 넘긴다 — 진입점 둘의 합집합이 `docs/`의 정본 전부를 든다.

## 개발

```bash
pnpm check          # 타입체크 + 린트 + 예산 게이트 + 테스트 전량
pnpm test           # 테스트만
pnpm lint           # biome
```

`pnpm check`가 통합 게이트다. 패키지 수·의존성 예산·버전 일치는 `scripts/check-core-budget.mjs`가 강제하며, 그 수치를 문서에서 따로 세지 않는다.

## 라이선스

MIT — 저장소 루트의 [`LICENSE`](../LICENSE). 레퍼런스 파생 가능성에 대한 고지는 루트 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)에 중앙 집중돼 있다([`docs/REUSE-MAP.md`](docs/REUSE-MAP.md) §6.1).
