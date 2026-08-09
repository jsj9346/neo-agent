/**
 * 시스템 프롬프트 — `docs/CLI-INTERFACE.md` §3.
 *
 * **CLI 내장 상수다.** config 오버라이드는 MVP에 없다(§3 — 트리거: 커스텀 페르소나
 * 요구 실측). 세션 생성 시 저장소에 기록되고, 재개 시 값이 달라졌으면 캐시 무효화
 * 경고가 뜬다(SESSION-STORE §5) — 그래서 이 문자열을 고치는 것은 **과거 모든 세션의
 * 재개에 경고를 붙이는 변경**이다. 가볍게 손대지 않는다.
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
    // 도구 문장은 **실제 등록되는 집합과 일치해야 한다**. `web_fetch`가 빠져 있던
    // 것은 지난 사이클의 누락이고, `remember`를 넣으면서 함께 고친다.
    //
    // [미규정 EP-7] `shell`만 조건부인데(5b 판정) 이 문자열은 그보다 **앞**에서
    // 만들어진다 — 시작 시퀀스가 5(세션 생성)에 프롬프트를 요구하고 5b는 그 뒤이며,
    // 그 순서가 계약이다(`CLI-INTERFACE.md` §2). 즉 세션별로 정확한 목록을 쓰려면
    // 계약 순서를 바꿔야 하므로, **어느 갈래에서도 참인 문장**으로 적는다. 목록을
    // 단정하지 않고 "받은 도구 목록이 정본"이라고 명시하는 쪽이, 없는 도구를
    // 있다고 적거나(현행 결함) 있는 도구를 숨기는 것보다 사실에 가깝다.
    "Tools: read_file, write_file, edit_file, web_fetch and remember are always available;",
    "shell is present in most sessions but is left out when sandboxing is on and Docker is",
    "not usable, so treat the tool list you were given as authoritative over this line.",
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
