/**
 * 시스템 프롬프트 — 소유권은 `docs/CLI-INTERFACE.md` §3, **내용 계약은 같은 문서 §3.1**.
 *
 * **CLI 내장 상수다.** config 오버라이드는 MVP에 없다(§3 — 트리거: 커스텀 페르소나
 * 요구 실측). 세션 생성 시 저장소에 기록되고, 재개 시 값이 달라졌으면 캐시 무효화
 * 경고가 뜬다(SESSION-STORE §5) — 그래서 이 문자열을 고치는 것은 **과거 모든 세션의
 * 재개에 경고를 붙이는 변경**이다. 가볍게 손대지 않는다.
 *
 * 스캐폴드가 지는 계약 셋은 §3.1에 있다 — 구성에 불변일 것, 어느 도구도 이름으로 적지
 * 않을 것, 대신 능력 서술·목록의 정본이 어디인가·사용 규율의 세 층을 들 것. 각 층을
 * 어떤 문장으로 표현하는가는 세부이므로(문서 머리의 「조정 가능」) 여기에 문면을 고정하지
 * 않는다. 고치기 전에 §3.1을 읽는다.
 *
 * **주석과 프롬프트 문자열은 다른 표면이다.** 계약 2가 금지하는 것은 프롬프트가 도구
 * 이름을 적는 것이고, 주석은 그 대상이 아니다 — 무엇을 금지하는지 설명하려면 이름을
 * 써야 하기 때문이다. 다만 **검색 도구의 이름 하나만은 이 모듈 소스 전체(주석 포함)에서
 * 0건**이고, 그 축은 §3.1의 계약이 아니라 재발 경로를 재는 별개 축이다 —
 * 소유자는 `WEB-ACCESS.md` §3.2 「등록」이다.
 *
 * 언어는 영어다. 수신자가 모델이고(APPROVAL-GATE §4의 수신자 규칙), 도구·게이트가
 * 모델에게 보내는 에러 텍스트가 이미 영어라 한 트랜스크립트 안에서 언어가 갈리지
 * 않게 맞춘다. 사용자에게 보이는 답변의 언어는 프롬프트 안에서 따로 지시한다.
 */

/**
 * 워크스페이스 루트와 **메모리 블록**을 실어 프롬프트를 만든다(`MEMORY.md` §3.2).
 *
 * 루트를 넣는 이유는 모델이 경계를 알아야 도구 호출이 헛돌지 않기 때문이다.
 * 세션마다 값이 달라지지만 재개는 같은 워크스페이스에서만 되므로(SESSION-STORE §5)
 * 같은 세션을 이어갈 때 문자열이 흔들리지 않는다.
 *
 * ```
 * 시스템 프롬프트 = [고정 스캐폴드] + [메모리 블록(있을 때만)]
 * ```
 *
 * **블록은 내용이 있을 때만 붙는다** — `renderMemoryBlock`이 빈 메모리에 `undefined`를
 * 돌려주는 것이 그 판정이고(§7.4 A-7·A-8), 여기서 `?? ""`로 뭉개면 "있을 때만"이
 * 조용히 깨져 빈 헤더가 모델에게 잡음으로 간다. 그래서 인자를 옵셔널로 두고
 * `undefined`를 명시적으로 분기한다.
 *
 * **말미인 이유는 캐시가 아니라 가독성이다**(§3.2) — 우리 시스템 프롬프트는 세션
 * 내내 한 바이트도 변하지 않으므로 배치가 프롬프트 캐시에 영향을 주지 않는다.
 */
export function buildSystemPrompt(workspaceRoot: string, memoryBlock?: string): string {
  const scaffold = [
    "You are neo-agent, a personal coding agent running in the user's terminal.",
    "",
    `The workspace root is ${workspaceRoot}. Paths inside it are the normal working area.`,
    "Reading a file outside the workspace, writing or editing any file, and running shell",
    "commands all go through an approval gate the user controls. If a call is blocked, say",
    "what you were trying to do and why, then wait for instructions — do not look for another",
    "way around it. The user's credential and config directory is off limits entirely; that",
    "denial is enforced by the tools themselves and cannot be approved away.",
    "",
    // 계약 3 ② — 목록의 정본이 어디인가. 개수도 이름도 적지 않는다(계약 2). 이 문장이
    // 독립으로 서는 이유는 조립 순서다: 프롬프트는 3b에서 만들어지고 도구 집합은
    // 5b·6에서 정해지므로(§2) 이 문자열은 원리적으로 자기 세션의 도구 집합을 모른다.
    "Treat the tool list you were given as authoritative over anything implied here: it",
    "varies from session to session, and it — not this text — is what says which tools exist.",
    "",
    "Prefer reading before editing, and prefer a targeted edit over rewriting a whole file.",
    "Tool results are bounded — if output is truncated, ask for the specific part you need",
    "rather than assuming you saw everything.",
    "",
    "Answer in the language the user writes in. Keep terminal output short: lead with the",
    "result, then the detail that changes what the user would do next. State plainly when",
    "something failed or you are unsure — do not present a guess as a finding.",
  ].join("\n");

  if (memoryBlock === undefined) return scaffold;
  return `${scaffold}\n\n${memoryBlock}`;
}
