/**
 * 표시 위조 탐지 — `docs/APPROVAL-GATE.md` §4.
 *
 * **승인 UI가 거짓말하면 게이트 전체가 무의미하다.** 사용자가 `git status`를 보고
 * 허용했는데 실제로 실행된 것이 다른 명령이면, 그 승인은 승인이 아니다. 그래서
 * 표시 문자열을 만드는 책임은 CLI가 아니라 게이트에 있고, **CLI는 여기서 나온
 * `display`를 가공 없이 그대로 표시한다**(다시 가공하면 위조 탐지가 무의미해진다).
 *
 * 탐지 대상 3종:
 * 1. 비가시·서식 제어 문자 — 보이지 않는 곳에 명령을 숨기거나 방향을 뒤집는다
 * 2. 전각·호환 문자 — NFKC를 거치면 다른 명령이 된다(`ｒｍ` → `rm`)
 * 3. 문자 체계를 넘나드는 동형이의 — 키릴 `а`는 라틴 `a`와 눈으로 구분되지 않는다
 *
 * 이스케이프 표기는 `<U+200B>` 형식을 쓴다. `\u{200B}` 대신 이걸 택한 이유는
 * 명령 문자열 자체에 백슬래시가 흔해서(경로·정규식) 이스케이프 표기와 원문이
 * 섞여 보이기 때문이다 — 위조 탐지 표기가 원문과 헷갈리면 목적을 잃는다.
 */

import {
  type ConfusableHit,
  type DisplaySlot,
  displayInvisiblePattern,
  formatCodePoint,
  INVISIBLE_PATTERN,
  type NormalizationResult,
} from "./normalize.ts";
import type { GateSubject } from "./types.ts";

/**
 * 표시 상한. 승인 프롬프트에 메가바이트급 문자열을 흘리면 사용자가 실제 내용을
 * 확인할 수 없고(스크롤 위조), 터미널도 버틴다는 보장이 없다.
 */
const MAX_DISPLAY_CHARS = 4096;
const TRUNCATION_MARKER = " …[표시 잘림]";

export interface DisplayAnalysis {
  /** CLI가 그대로 표시할 문자열 */
  readonly text: string;
  readonly warnings: readonly string[];
  /**
   * 위조 흔적이 있는가. **allowlist 숏컷과 "항상 허용" 선택지를 무효화한다** —
   * 사용자가 본 것과 실행될 것이 다를 수 있는 문자열을 영구 학습시키는 것은
   * 그 자체로 우회 경로다.
   */
  readonly spoofed: boolean;
}

/**
 * 비가시 문자를 가시 표기로 바꾼다. **어느 축의 집합을 쓸지는 `slot`이 정한다**
 * (APPROVAL-GATE §4 — "매칭용 집합과 표시용 집합을 가른다").
 *
 * - `slot`을 주면 **표시 축**이다: 매칭 집합 ∪ {CR} ∪ ({LF} iff `single-line`).
 *   게이트가 소유한 줄 구조를 모델 제어 문자열이 바꾸지 못하게 하는 것이 목적이다.
 * - `slot`을 **생략하면 매칭 축 그대로**다. 이 형태의 소비자는 화면이 아니라 모델이다
 *   — `pipeline.ts`의 `reason`(영어 도구 에러)이 그것이고, 거기서는 줄바꿈·탭이
 *   드러날 이유가 없다(§4 "텍스트의 수신자가 언어를 정한다"). 표시본을 만드는
 *   자리에서 슬롯을 빠뜨리면 그 줄은 표시 축을 잃으므로, **표시 경로의 호출은
 *   반드시 슬롯을 준다** — `analyzeDisplayText`가 그 유일한 경로다.
 */
export function escapeInvisibles(text: string, slot?: DisplaySlot): string {
  const pattern = slot === undefined ? INVISIBLE_PATTERN : displayInvisiblePattern(slot);
  return text.replace(pattern, (char) => `<${formatCodePoint(char)}>`);
}

/**
 * 매칭 축 집합의 **한 글자** 판정용 사본. `g`를 뗀 이유는 `test()`가 `lastIndex`를
 * 들고 다니지 않게 하기 위해서다 — 공유 인스턴스를 `g`인 채 `test()`로 쓰면 같은
 * 입력에 호출이 번갈아 참·거짓을 낸다(`normalize.ts`의 `displayInvisiblePattern`이
 * 호출마다 새 인스턴스를 만드는 것과 같은 근거).
 */
const MATCHING_AXIS_CHAR = new RegExp(
  INVISIBLE_PATTERN.source,
  INVISIBLE_PATTERN.flags.replace("g", ""),
);

/**
 * 표시 축이 매칭 축보다 **더 보는 것**만 골라낸다 — 오늘의 실물로는 CR과(`single-line`에서)
 * LF다. 그 둘을 여기 열거하지 않고 두 집합의 차로 구하는 이유는 §4가 표시 집합을
 * **관계**로 정의했기 때문이다: 목록을 여기 다시 적으면 `normalize.ts`의 집합을 고칠 때
 * 이쪽이 조용히 갈린다.
 *
 * 이 부분집합을 따로 세는 이유는 **경고 문면이 갈려야** 하기 때문이다. 매칭 축의
 * 비가시 문자는 "무엇이 숨어 있다"는 이야기이고, 이쪽은 "게이트가 만든 줄 구조가
 * 흔들린다"는 다른 이야기다 — 한 문장으로 뭉치면 사용자가 무엇을 다시 봐야 하는지
 * 알 수 없다(§4가 `cwd` 경고에 요구한 것과 같은 규율).
 */
function collectLineStructureHits(raw: string, slot: DisplaySlot): string[] {
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const match of raw.matchAll(displayInvisiblePattern(slot))) {
    const char = match[0];
    if (MATCHING_AXIS_CHAR.test(char)) continue;
    const label = formatCodePoint(char);
    if (seen.has(label)) continue;
    seen.add(label);
    hits.push(label);
  }
  return hits;
}

/**
 * 동형이의 문자를 가시 표기로 드러낸다 — 계약이 요구하는 것은 "탐지"가 아니라
 * **표시본에서 드러나는 것**이다(APPROVAL-GATE §4).
 *
 * 경고 문구로만 알리면 사용자는 여전히 `сurl`(키릴 с)과 `curl`을 눈으로 구분할 수
 * 없다 — 승인 화면이 거짓말하는 상태가 그대로 남는다. 그래서 해당 글자를
 * `<U+0441→c>` 형태로 바꿔 **어느 자리가 위조됐는지**까지 보이게 한다.
 *
 * 대상은 라틴과 혼동되는 글자뿐이다. 한국어·일본어 같은 정상적인 비ASCII 텍스트는
 * confusable로 탐지되지 않으므로 그대로 표시된다.
 */
function escapeConfusables(text: string, confusables: readonly ConfusableHit[]): string {
  if (confusables.length === 0) return text;
  const byCodePoint = new Map(confusables.map((hit) => [hit.codePoint, hit.folded]));
  let out = "";
  for (const char of text) {
    const code = formatCodePoint(char);
    const folded = byCodePoint.get(code);
    out += folded === undefined ? char : `<${code}→${folded}>`;
  }
  return out;
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_DISPLAY_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_DISPLAY_CHARS) + TRUNCATION_MARKER, truncated: true };
}

/**
 * 판정 대상 문자열 하나의 표시본과 경고를 만든다.
 * `normalized`는 이미 계산된 정규화 결과를 재사용하기 위한 것이다 — 같은 입력을
 * 두 번 분석하면 두 결과가 어긋날 수 있고, 어긋남은 곧 표시와 판정의 불일치다.
 *
 * `slot`은 **이 문자열이 게이트가 만든 줄 구조에서 몇 줄을 차지하는가**다
 * (APPROVAL-GATE §4). 슬롯을 아는 것은 표시본을 조립하는 자리가 아니라 **이 호출부**다 —
 * `spoofed`와 `warnings`는 여기서 나가고 조립부(`renderSubjectDisplay`)는 이미
 * 이스케이프가 끝난 문자열만 받기 때문에, 가시화를 조립부에 두면 "위조 흔적을 세운다"가
 * 구조적으로 착지하지 못한다.
 *
 * 기본값이 `single-line`인 이유는 그것이 **더 엄한 쪽**이기 때문이다(더 드러내고 더
 * 세운다). §4가 열거한 슬롯 중 `multi-line`은 오늘 정확히 하나 —
 * `memoryWrite`의 `저장할 내용:` — 이고 나머지는 전부 `single-line`이라, 슬롯을 빠뜨린
 * 새 호출부는 마찰이 느는 쪽으로 틀린다. 반대 방향의 기본값은 새 표시 자리가 조용히
 * 줄 계약을 잃게 만든다.
 */
export function analyzeDisplayText(
  raw: string,
  normalized: NormalizationResult,
  slot: DisplaySlot = "single-line",
): DisplayAnalysis {
  const warnings: string[] = [];

  if (normalized.invisible.length > 0) {
    warnings.push(
      `표시 위조 주의 — 비가시 문자 ${normalized.invisible.length}종이 섞여 있다 (${normalized.invisible.join(", ")}). 아래 표시에서 <U+…> 로 드러난다`,
    );
  }
  // 줄 구조를 흔드는 문자는 **다른 이야기라 다른 문장으로 싣는다.** `\r`는 커서 제어라
  // 어느 슬롯에서도 정당하지 않고(터미널이 앞줄을 덮어쓴다), `\n`은 `single-line`
  // 슬롯에서만 위조다 — `multi-line`에서는 그 슬롯의 존재 이유다(§4).
  const lineHits = collectLineStructureHits(raw, slot);
  if (lineHits.length > 0) {
    warnings.push(
      `표시 위조 주의 — 승인 화면의 줄 구조를 흔드는 문자가 섞여 있다 (${lineHits.join(", ")}). 아래 표시에서 <U+…> 로 드러난다`,
    );
  }
  if (normalized.confusables.length > 0) {
    const shown = normalized.confusables
      .slice(0, 8)
      .map((hit) => `${hit.codePoint}→"${hit.folded}"`)
      .join(", ");
    warnings.push(
      `표시 위조 주의 — 라틴 문자와 구분되지 않는 다른 문자 체계의 글자가 있다 (${shown})`,
    );
  }
  if (normalized.nfkcChanged) {
    warnings.push(
      `표시 위조 주의 — 전각·호환 문자가 있다. 정규화하면 "${truncate(normalized.canonical).text}"로 읽힌다`,
    );
  }
  if (normalized.truncated) {
    warnings.push("입력이 분석 상한을 넘어 잘린 채 판정됐다 — 보이지 않는 뒷부분이 있다");
  }

  const escaped = truncate(escapeConfusables(escapeInvisibles(raw, slot), normalized.confusables));
  if (escaped.truncated) {
    warnings.push("표시가 길어 잘렸다 — 전체 내용을 확인하지 않은 채 허용하지 않는다");
  }

  return {
    text: escaped.text,
    warnings,
    spoofed:
      normalized.invisible.length > 0 ||
      lineHits.length > 0 ||
      normalized.confusables.length > 0 ||
      normalized.nfkcChanged ||
      normalized.truncated ||
      escaped.truncated,
  };
}

const SCOPE_LABEL: Record<string, string> = {
  inside: "워크스페이스 안",
  outside: "워크스페이스 밖",
  denied: "차단 경로",
};

const KIND_LABEL: Record<GateSubject["kind"], string> = {
  fileRead: "파일 읽기",
  fileWrite: "파일 쓰기",
  fileEdit: "파일 편집",
  shellExec: "셸 실행",
  webFetch: "웹 가져오기",
  memoryWrite: "메모리 저장",
  webSearch: "웹 검색",
  unknown: "미등록 도구",
};

/**
 * 프롬프트에 실릴 최종 표시본. 도구 이름과 행동 분류를 함께 보여주는 이유는,
 * 사용자가 "무엇이 실행되는가"뿐 아니라 "게이트가 이걸 무엇으로 판정했는가"까지
 * 봐야 판정 오류(프로필 오등록)를 알아챌 수 있기 때문이다.
 */
export function renderSubjectDisplay(
  toolName: string,
  subject: GateSubject,
  body: string,
  cwdLine?: string,
): string {
  const header = `${toolName} — ${KIND_LABEL[subject.kind]}`;
  const lines = [header];
  if (subject.kind === "shellExec") {
    lines.push(`명령: ${body}`);
    if (cwdLine !== undefined) lines.push(`작업 디렉터리: ${cwdLine}`);
  } else if (subject.kind === "webFetch") {
    // URL 자체가 유출 경로다(`?d=<컨텍스트에서 읽은 것>`은 GET 하나로 데이터를
    // 내보낸다 — WEB-ACCESS §6). 그래서 학습 단위인 origin이 아니라 **요청된 URL
    // 전체**를 보여준다. 승인의 대상은 사용자가 읽은 그 문자열이다.
    lines.push(`URL: ${body}`);
  } else if (subject.kind === "memoryWrite") {
    // **저장될 내용을 보인다**(APPROVAL-GATE §3). 자동 허용이라 평소엔 이 화면이
    // 뜨지 않지만, 플래그로 프롬프트에 도달했을 때 사용자가 무엇이 저장되려는지
    // 못 보면 그 승인은 계층 4b가 만들려던 판단 기회가 아니다. 메모는 여러 줄일 수
    // 있어 라벨 뒤가 아니라 다음 줄부터 보여준다 — 첫 줄만 라벨 옆에 붙으면
    // 나머지가 화면에서 격이 달라 보인다.
    //
    // [미규정 EP-3] 계약은 "저장될 내용을 보여야 한다"까지만 정하고 **보여줄 내용이
    // 없을 때의 표시**를 정하지 않는다(판정 B-2는 분류·플래그·경고만 정한다).
    // 본문이 비어 있는 경우는 두 가지다: 정말 빈 문자열이거나, 인자를 문자열로 읽지
    // 못해 표시할 본문이 없거나(판정 B-2). **어느 쪽인지 단정하지 않는다** — 후자면
    // 그 사정이 `warnings`에 실려 있고, 승인 화면이 아는 것보다 더 말하면 그 자체가
    // 거짓말이다.
    //
    // **이 자리가 유일한 `multi-line` 슬롯이고, 표시본의 마지막에만 온다 — 계약이다**
    // (APPROVAL-GATE §4). 뒤에 게이트가 쓴 줄이 없어야 본문에 낀 `\n`이 게이트의 줄을
    // 밀어내거나 흉내 낼 수 없다. **여러 줄 슬롯 뒤에 라벨을 하나라도 붙이는 개정은
    // 그 자리에서 「가짜 라벨 줄이 진짜 줄 위에 온다」를 되살린다.**
    lines.push(
      body.length === 0 ? "저장할 내용: (비어 있거나 읽지 못했다)" : `저장할 내용:\n${body}`,
    );
  } else if (subject.kind === "webSearch") {
    // **질의 문자열 전체를 보인다**(WEB-ACCESS §6). 승인이 유일한 방어라 사용자가
    // 승인하는 대상은 자기가 읽은 그 문자열이다. `memoryWrite`처럼 다음 줄부터
    // 내리지 않는 이유는 질의가 400자 상한의 단문이라서다(APPROVAL-GATE §3).
    // 표시 잘림 경고는 구조적으로 뜨지 않는다 — 질의 상한 400 < 표시 상한 4096.
    // 그 관계는 **결합이 아니라 관찰**이다(400을 4096의 함수로 정의하지 않는다).
    //
    // [미규정] 계약은 본문이 `질의: <query>` 한 줄이라는 것까지만 정하고 **본문이
    // 빌 때의 표시**를 정하지 않는다. 빈 경우는 둘이다: 정말 빈 질의이거나, 인자를
    // 문자열로 읽지 못했거나. `memoryWrite`(EP-3)는 "(비어 있거나 읽지 못했다)"로
    // 두 경우를 뭉쳐 적었으나 **여기서는 괄호 문구를 발명하지 않는다** — 계약이
    // 요구하는 것은 「표시 본문이 빈다」이고, 읽지 못했다는 사정은 이미 `warnings`에
    // 실려 있다. 승인 화면이 아는 것보다 더 말하지 않는다(판정 B-5의 규율).
    lines.push(`질의: ${body}`);
  } else if (subject.kind === "unknown") {
    lines.push("게이트 프로필에 등록되지 않아 인자를 판정할 수 없다 — 항상 승인을 묻는다");
  } else {
    lines.push(`경로: ${body}  (${SCOPE_LABEL[subject.scope] ?? subject.scope})`);
  }
  return lines.join("\n");
}
