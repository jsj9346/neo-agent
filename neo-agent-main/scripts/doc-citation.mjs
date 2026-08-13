/**
 * 문서 인용 형식의 **순수 판정**. 정본은 `docs/DOC-CITATION.md` §3이다.
 *
 * **이 파일은 부작용이 없다.** 파일을 읽지 않고, 아무것도 출력하지 않고, 프로세스를
 * 끝내지 않는다. 게이트 실행부는 `check-doc-citation.mjs`에 있고 이 모듈을 임포트한다.
 *
 * **왜 두 파일인가.** `doc-status.mjs`가 같은 이유로 갈렸다 — 한 파일이면 계약 테스트가
 * 순수 함수만 쓰는데도 임포트 순간 게이트가 돌고, 실물 `docs/`가 레드인 날엔
 * `process.exit(1)`이 vitest 워커를 죽여 **"계약 위반"이 "테스트 파일이 사라짐"으로
 * 나타난다.**
 *
 * `import.meta.main` 가드로 막지 않은 것은 의도다 — 그 속성은 Node 24.2.0에서 들어왔고
 * 이 워크스페이스의 `engines`는 `>=24`다. 24.0~24.1에서는 `undefined`라 가드가 거짓이 되어
 * **게이트 본문이 통째로 건너뛰어지고 조용히 exit 0**이 된다. 침묵 통과는 이 게이트가
 * 존재하는 이유 그 자체이므로(`ARCHITECTURE.md` §2.6), 런타임 조건 대신 파일 경계로 갈랐다.
 *
 * **왜 검사가 아니라 형식 금지인가**는 `DOC-CITATION.md` §2에 있다. 요지는 정밀도다 —
 * 우리 트리를 가리키는 줄번호 인용은 정당한 사용이 **정의상 0**이라 오탐이 구조적으로 없고,
 * 그래서 이것은 자유 서술에 의미 패턴을 거는 «격자»가 아니라 **닫힌 구문의 검출**이다.
 */

/**
 * §3.1 — 줄이 움직이지 않는 트리. `CLAUDE.md`가 읽기 전용으로 선언한 레퍼런스 스냅샷이며,
 * 실측에서 이쪽 인용은 전건 정확했다(2026-08-13, 커밋 `9387efb`).
 *
 * **접두는 인용 문자열 안에 있어야 한다.** 산문에 트리 이름을 적고 백틱 안엔 파일명만
 * 두는 형태를 허용하면 판별이 문자열 밖으로 새고, 그 순간 §2가 «오탐 0»으로 세운 근거가
 * 무너진다.
 */
export const FROZEN_TREES = Object.freeze(["openclaw-main/", "hermes-agent-main/"]);

/**
 * 금지 구문 둘(§3.2). **숫자를 필수로 요구하는 것이 §3.3의 `NN` 탈출을 성립시킨다** —
 * 예시가 `NN`이면 이 패턴에 애초에 걸리지 않으므로, 억제 목록도 인용 블록 예외도 두지
 * 않고 규약이 자기 자신을 설명할 수 있다.
 *
 * 경로 부분은 **줄 시작·공백·백틱·괄호 어디에 붙어도** 잡는다. 범위를 좁히면 그 좁힘이
 * 다음 부패가 사는 자리가 된다(§3.3 *"관대하지 않다"*).
 */
const CITATION_PATTERNS = [
  /** `<경로>.md:<숫자>` — 백틱이 파일명 뒤에 붙는 형태(`` `X.md`:5 ``)까지 함께 잡는다. */
  /[A-Za-z0-9_./-]+\.md`?:\d+(?:-\d+)?/g,
  /** `§<절번호>:<숫자>` — 자기 문서의 절:줄. */
  /§\d+(?:\.\d+)*:\d+(?:-\d+)?/g,
];

/** §3.2 — 갈래는 둘이고 «기타»가 없다. 이 이름이 그대로 게이트 출력의 라벨이다. */
const UNPINNED_DOC_LINE = "unpinned-doc-line";
const SELF_SECTION_LINE = "self-section-line";

/**
 * 소스에서 인용 후보를 뽑는다. **탐색 범위는 파일 전체**다(§4) — 머리 규약과 달리 인용은
 * 본문에 살고 자리를 좁힐 수 없다. 좁힐 수 없는 대신 구문으로 줄인다.
 *
 * **문서 이름을 돌려주지 않는다**(§3.2). 순수 판정은 소스 텍스트만 받으므로 파일명을
 * 원리적으로 만들 수 없다 — 게이트 루프가 파일명과 짝지어 출력한다.
 *
 * @param {string} source
 * @returns {{ text: string, line: number }[]} 줄 번호는 1-기반. 판정에 쓰지 않고 출력에만 쓴다.
 */
export function findCitations(source) {
  const found = [];
  const lines = String(source ?? "").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of CITATION_PATTERNS) {
      // `g` 플래그를 가진 정규식은 `lastIndex`를 들고 다닌다. 줄마다 초기화하지 않으면
      // 앞 줄의 위치에서 이어 찾아 **일부 줄을 통째로 건너뛴다** — 조용한 미탐이다.
      pattern.lastIndex = 0;
      for (const match of lines[index].matchAll(pattern)) {
        found.push({ text: match[0], line: index + 1 });
      }
    }
  }

  // 한 줄에 두 갈래가 섞여도 등장 순서대로 읽히게 한다. 출력이 원문 순서와 어긋나면
  // "고칠 곳의 주소"라는 성질이 약해진다.
  return found.sort((a, b) => a.line - b.line);
}

/**
 * 인용 하나를 판정한다. §3.1의 기준은 **«대상 트리가 고정돼 있는가»** 하나이고, 그 판별은
 * 인용 문자열 안에서 완결된다.
 *
 * @param {string} text `findCitations`가 돌려준 `text`
 * @returns {{ ok: true } | { ok: false, violation: string, detail: string }}
 */
export function judgeCitation(text) {
  const value = String(text ?? "");

  if (value.startsWith("§")) {
    return {
      ok: false,
      violation: SELF_SECTION_LINE,
      detail: `자기 문서를 절:줄로 가리킨다 — ${value}. 절이 늘 때마다 자기 줄이 밀리므로 구조적으로 썩는다(§3.4: 문면 인용).`,
    };
  }

  // 동결 트리는 줄이 움직이지 않으므로 줄번호가 산다(§2.2). 접두가 **문자열 안에** 있을
  // 때만 인정한다 — 문맥을 읽어야 알 수 있는 기준은 기계가 못 재고 억제 목록을 부른다.
  if (FROZEN_TREES.some((tree) => value.startsWith(tree))) {
    return { ok: true };
  }

  return {
    ok: false,
    violation: UNPINNED_DOC_LINE,
    detail: `고정되지 않은 트리를 줄번호로 가리킨다 — ${value}. 동결 트리(${FROZEN_TREES.join(" · ")})가 아니면 줄번호를 쓰지 않는다(§3.4).`,
  };
}
