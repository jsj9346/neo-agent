/**
 * `/search` 결과 표시 — `docs/SEARCH.md` §5, `docs/CLI-INTERFACE.md` §5·§7.
 *
 * **표시 전용이다**(SEARCH §1 불변). 이 파일은 저장소가 돌려준 hit을 화면에 그리는
 * 것 외에 아무것도 하지 않는다 — 검색 결과가 모델 컨텍스트로 들어가는 경로는 없다.
 *
 * 세션 표시는 **`chainTipId`의 접두**다. `sessionId`(매치가 난 세션)는 압축된
 * superseded 부모일 수 있고, 그 접두는 목록에서 빠져 있어 `resolveSessionId`가
 * 해석을 거부한다 — 보여 주면 사용자가 `/resume`에 붙였을 때 막다른 길에 선다(§5).
 * 매치가 부모에서 났다는 사실 자체를 표시하지 않는 것도 같은 문장의 요구다:
 * 사용자에게 압축 체인은 하나의 대화다.
 */

import { type SearchHit, SNIPPET_MARK_END, SNIPPET_MARK_START } from "@neo-agent/store";
import { type OutputSink, style } from "./terminal.ts";

/**
 * 세션 id를 화면에 줄여 보일 때의 길이 — `wiring.ts`의 `/sessions`·재개 안내와 같다.
 * 사용자는 여기서 본 접두를 그대로 `/resume`에 붙이므로 길이가 갈리면 안 된다.
 */
const ID_PREFIX_LENGTH = 8;

/**
 * 표시에서 제거하는 C0 제어문자 — 개행·탭·ANSI(ESC)는 뺀다.
 *
 * 스니펫과 title의 원천은 사용자·모델이 쓴 대화 텍스트라 무엇이든 들어 있을 수 있고,
 * 마커 자신도 제어문자다(§4). 원시 제어문자가 터미널에 닿으면 커서가 움직이거나 줄이
 * 깨져 **다른 hit의 표시까지 무너진다**(CLI-INTERFACE §7 — 표시는 유실되지 않는다).
 * 마커 처리가 끝난 조각에만 적용하므로 강조가 이 정리로 사라지지 않는다.
 *
 * 패턴은 **이스케이프로 쓴다** — 실제 제어문자를 소스에 넣으면 파일이 바이너리로
 * 인식돼 grep·diff·리뷰가 깨진다(store의 마커 상수와 같은 규율).
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 제어문자 제거가 목적이다
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * 검색 결과를 그린다.
 *
 * hit 하나가 두 줄이다 — 첫 줄이 "어느 대화인가"(체인 tip 접두·시각·title), 둘째
 * 줄이 "무엇이 걸렸나"(role·스니펫). 한 줄에 다 넣으면 한국어 스니펫이 대부분의
 * 터미널 폭에서 접혀 접두·시각과 뒤섞인다.
 *
 * **빈 결과는 명시 표시다**(§5·ARCHITECTURE §2.6). 아무것도 쓰지 않고 끝내면
 * 사용자는 검색이 돈 것인지 명령이 씹힌 것인지 구분할 수 없다. 다만 실패가 아니므로
 * 에러 색·에러 문구를 쓰지 않는다 — 없다는 사실과 깨졌다는 사실은 다르다.
 */
export function renderSearchResults(
  out: OutputSink,
  query: string,
  hits: readonly SearchHit[],
): void {
  if (hits.length === 0) {
    out.write(`${style.dim(`"${sanitize(query)}" — 검색 결과가 없다.`)}\n`);
    return;
  }

  out.write(`${style.dim(`"${sanitize(query)}" — 검색 결과 ${hits.length}건`)}\n`);

  for (const hit of hits) {
    const prefix = hit.chainTipId.slice(0, ID_PREFIX_LENGTH);
    // [미규정 EC-1] title이 null일 때의 대체 표시. `/sessions`의 "(제목 없음)"을
    // 그대로 쓴다 — 같은 세션을 두 화면에서 다른 이름으로 부르지 않게.
    const title =
      hit.chainTipTitle === null ? style.dim("(제목 없음)") : sanitize(hit.chainTipTitle);

    out.write(
      `  ${style.cyan(prefix)}  ${style.dim(formatTime(hit.timestamp))}  ${title}\n` +
        `    ${style.dim(roleLabel(hit.role))}  ${decorateSnippet(hit.snippet)}\n`,
    );
  }

  // 접두를 보여 주는 것만으로 재개 경로는 성립하지만(§5), 검색으로 처음 만난 대화를
  // 어떻게 이어가는지는 화면에 적어 준다 — `/help`를 다시 열게 하지 않는다.
  //
  // **체인 tip이 하나일 때만 구체 명령을 적는다.** 결과에 여러 대화가 섞였는데 첫
  // hit의 접두를 박아 두면, 그 줄은 "이 검색 결과를 이어가려면"으로 읽히지만 실제로는
  // 첫 hit 전용이다 — 두 번째 결과를 이어가려던 사용자가 그대로 복사하면 **엉뚱한
  // 대화가 열린다.** 침묵보다 나쁜 것이 틀린 안내다(ARCHITECTURE §2.6의 방향).
  // 섞여 있을 때는 접두 자리를 자리표시자로 두고, 값은 각 행에 이미 있는 것을 쓰게 한다.
  const tips = new Set(hits.map((hit) => hit.chainTipId));
  const target =
    tips.size === 1
      ? (hits[0]?.chainTipId.slice(0, ID_PREFIX_LENGTH) ?? "")
      : "<각 결과 앞의 접두>";
  out.write(`${style.dim(`이어가려면: /resume ${target}`)}\n`);
}

/**
 * 스니펫의 매치 구간 마커를 색상으로 바꾼다.
 *
 * 마커 문자는 store가 고르고(§4) 여기서는 임포트한 상수로만 다룬다 — 값을 복사해
 * 두면 store가 문자를 바꿨을 때 이쪽이 조용히 강조를 잃는다.
 *
 * [미규정 EC-2] 마커 짝이 맞지 않는 스니펫의 처리. §4는 정상 형태만 규정한다.
 * **여는 마커만 있으면 스니펫 끝까지 강조하고, 홀로 남은 닫는 마커는 제거한다** —
 * 어느 쪽이든 평문은 한 글자도 잃지 않고 제어문자도 새지 않는 것을 우선했다.
 * 강조 구간이 넓어지는 것은 눈에 보이는 어긋남이라 사용자가 알아챌 수 있지만,
 * 텍스트가 사라지는 것은 알아챌 수 없다(§2.6).
 */
function decorateSnippet(snippet: string): string {
  let decorated = "";
  let rest = snippet;

  for (;;) {
    const open = rest.indexOf(SNIPPET_MARK_START);
    if (open === -1) return decorated + sanitize(rest);

    decorated += sanitize(rest.slice(0, open));
    const afterOpen = rest.slice(open + SNIPPET_MARK_START.length);

    const close = afterOpen.indexOf(SNIPPET_MARK_END);
    if (close === -1) return decorated + highlight(afterOpen);

    decorated += highlight(afterOpen.slice(0, close));
    rest = afterOpen.slice(close + SNIPPET_MARK_END.length);
  }
}

/**
 * 매치 구간 강조 — **매치 구간에만** 붙인다(§5 "스니펫(매치 구간 강조)").
 * 발췌 전체를 감싸면 강조가 아무것도 가리키지 않는다.
 */
function highlight(text: string): string {
  const clean = sanitize(text);
  return clean === "" ? "" : style.cyan(clean);
}

function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

/**
 * [미규정 EC-3] role의 화면 표기. 문서는 "role"까지만 정한다. 한국어 UI에 맞춰
 * 옮겼다 — `SearchHit.role`의 영문 리터럴은 저장소의 값이지 사용자에게 보일 이름이
 * 아니고, 이 화면의 나머지 문구가 전부 한국어다.
 */
function roleLabel(role: SearchHit["role"]): string {
  return role === "user" ? "사용자" : "어시스턴트";
}

/** `/sessions`·`/delete`가 쓰는 것과 같은 형식 — 시각 표기가 화면마다 달라지지 않게 */
function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
