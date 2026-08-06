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

/** 줄바꿈·탭은 살리고 나머지 비가시 문자만 가시 표기로 바꾼다 */
export function escapeInvisibles(text: string): string {
  return text.replace(INVISIBLE_PATTERN, (char) => `<${formatCodePoint(char)}>`);
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
 */
export function analyzeDisplayText(raw: string, normalized: NormalizationResult): DisplayAnalysis {
  const warnings: string[] = [];

  if (normalized.invisible.length > 0) {
    warnings.push(
      `표시 위조 주의 — 비가시 문자 ${normalized.invisible.length}종이 섞여 있다 (${normalized.invisible.join(", ")}). 아래 표시에서 <U+…> 로 드러난다`,
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

  const escaped = truncate(escapeConfusables(escapeInvisibles(raw), normalized.confusables));
  if (escaped.truncated) {
    warnings.push("표시가 길어 잘렸다 — 전체 내용을 확인하지 않은 채 허용하지 않는다");
  }

  return {
    text: escaped.text,
    warnings,
    spoofed:
      normalized.invisible.length > 0 ||
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
  } else if (subject.kind === "unknown") {
    lines.push("게이트 프로필에 등록되지 않아 인자를 판정할 수 없다 — 항상 승인을 묻는다");
  } else {
    lines.push(`경로: ${body}  (${SCOPE_LABEL[subject.scope] ?? subject.scope})`);
  }
  return lines.join("\n");
}
