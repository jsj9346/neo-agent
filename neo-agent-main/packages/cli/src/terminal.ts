/**
 * 터미널 제어 원시 요소 — `docs/CLI-INTERFACE.md` §1.
 *
 * 렌더링은 `node:readline` + ANSI 이스케이프 직접 제어다(2026-08-06 사용자 확정 —
 * 외부 런타임 의존성 0). TUI 라이브러리가 없으므로 커서 이동·라인 지우기는 여기의
 * 문자열 상수로 조립한다.
 *
 * **`process.stdin`/`process.stdout`을 직접 참조하지 않는다.** 스트림은 전부
 * 주입받는다 — QA가 모의 스트림으로 전 모듈을 검증할 수 있어야 하고(계약),
 * `process.*`를 만지는 곳은 조립 지점(`main.ts`, T-008)뿐이다.
 */

/** 출력 싱크. `process.stdout`도, 모의 스트림도, REPL의 라인 가드도 이 형태다 */
export interface OutputSink {
  write(text: string): void;
}

/**
 * REPL·승인 프롬프트가 받는 입출력 짝.
 *
 * `isTTY`·`setRawMode`가 선택적인 것은 모의 스트림 때문이다 — 있으면 쓰고 없으면
 * 건너뛴다. 실제 터미널에서는 둘 다 존재한다(`tty.ReadStream`).
 */
export interface TerminalIo {
  input: NodeJS.ReadableStream & {
    isTTY?: boolean | undefined;
    setRawMode?: ((mode: boolean) => unknown) | undefined;
  };
  output: NodeJS.WritableStream & { columns?: number | undefined };
}

const ESC = "\x1b[";

/** 커서부터 화면 끝까지 지우기. 감싸인 입력 라인이 여러 행을 먹어도 한 번에 지운다 */
export const CLEAR_TO_END = `${ESC}0J`;

export function cursorUp(rows: number): string {
  return rows > 0 ? `${ESC}${rows}A` : "";
}

/** 1-기반 열 번호로 이동 (`\x1b[nG`) */
export function cursorToColumn(column1: number): string {
  return `${ESC}${column1}G`;
}

/**
 * 스타일. 색상·강조는 **조정 가능한 표시 세부**다(CLI-INTERFACE 머리말).
 *
 * 색상 비활성화 스위치는 두지 않았다 — 계약이 정한 표면이 아니고, 비-TTY 출력의
 * 처리는 조립 지점의 미결(§12 "표시 세부")이기 때문이다. 테스트는 이스케이프를
 * 벗겨서 단정한다.
 */
export const style = {
  dim: (text: string) => `${ESC}2m${text}${ESC}22m`,
  bold: (text: string) => `${ESC}1m${text}${ESC}22m`,
  red: (text: string) => `${ESC}31m${text}${ESC}39m`,
  yellow: (text: string) => `${ESC}33m${text}${ESC}39m`,
  cyan: (text: string) => `${ESC}36m${text}${ESC}39m`,
} as const;

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 이스케이프를 세지 않으려면 찾아야 한다
const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * 표시 폭.
 *
 * 두 가지를 처리한다:
 * - **ANSI 이스케이프는 0칸이다.** 렌더러가 스타일을 입힌 텍스트도 이 싱크로 나가므로
 *   (`style.dim(...)` 한 번에 8~9바이트) 세어 버리면 열 추정이 곧바로 크게 어긋난다.
 * - **전각 문자는 2칸이다.** 한국어 대화가 기본 사용 형태라, 1칸으로 세면 스트리밍
 *   도중 재그리기가 매번 어긋난다(실제 pty 40열에서 실측).
 *
 * [미규정] 폭 판정은 East Asian Wide/Fullwidth의 주요 구간 근사다 — 정확한 표를 쓰려면
 * 유니코드 데이터가 필요하고 그것은 외부 의존성 0 원칙과 부딪힌다. 결합 문자·가변
 * 이모지 시퀀스는 근사에서 벗어날 수 있다. 어긋나는 것은 **재그리기 위치이지 입력
 * 내용이 아니므로** 계약(타이핑 유실 없음)은 그대로 지켜진다.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text.replace(ANSI_PATTERN, "")) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue; // 제어 문자
    if (isZeroWidth(code)) continue;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isZeroWidth(code: number): boolean {
  return (
    (code >= 0x0300 && code <= 0x036f) || // 결합 분음 부호
    (code >= 0x200b && code <= 0x200f) || // zero-width·방향 표시
    code === 0xfeff
  );
}

function isWide(code: number): boolean {
  if (code < 0x1100) return false;
  return (
    code <= 0x115f || // 한글 자모
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) || // CJK
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) || // 전각 폼
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) || // 이모지
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

/**
 * 개행 이후 몇 칸을 썼는지 갱신한다.
 *
 * 라인 가드가 "출력 커서가 어느 열에 있는지"를 알아야 스트리밍 도중에 입력 라인을
 * 걷어내고 이어 쓸 수 있다(§7 — 타이핑 중인 입력은 출력에 유실되지 않는다).
 */
export function advanceColumn(column: number, text: string): number {
  const lastBreak = text.lastIndexOf("\n");
  if (lastBreak === -1) return column + displayWidth(text);
  return displayWidth(text.slice(lastBreak + 1));
}

/** 표시 폭이 `columns`일 때 `column`칸을 쓴 커서가 몇 행 아래로 내려갔는지 */
export function wrappedRows(column: number, columns: number | undefined): number {
  if (columns === undefined || columns <= 0) return 0;
  return Math.floor(column / columns);
}

/** 표시 폭이 `columns`일 때 `column`칸을 쓴 커서의 1-기반 열 번호 */
export function wrappedColumn(column: number, columns: number | undefined): number {
  if (columns === undefined || columns <= 0) return column + 1;
  return (column % columns) + 1;
}
