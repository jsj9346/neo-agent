/**
 * 상태줄 조립·절단 — `docs/CLI-INTERFACE.md` §7.1.
 *
 * 이 모듈이 하는 일은 둘뿐이다: 상태 항목들을 **한 줄 문자열**로 조립하고, 표시 폭이
 * 상한을 넘으면 **자른다.** 그리는 것도 걷는 것도 `input.ts`의 하단 고정 영역이 한
 * 단위로 하므로(§7.1) 여기서는 커서를 만지지 않는다.
 *
 * **순수 함수다 — 코어를 호출하지 않는다**(§7.1). 실을 수 있는 값은 세 종류뿐이고
 * (시작 시 동결된 설정 §3, 구독 중인 이벤트가 실어 온 것 §7 표, 세션 수명주기가
 * 실어 온 것 §6 — 아래 `sessionId` 필드 주석과 §7.1의 열거가 같은 셋이다), 전부
 * 호출자가 인자로 넘긴다.
 *
 * **던지지 않는다.** 이 함수는 `wiring.ts`에서 코어가 await하는 리스너 안에서 불린다.
 * §7 머리가 *"렌더러 예외는 삼키지 않는다 — 코어 계약(§3)대로 런을 실패시킨다"*이므로
 * 여기서 예외가 나면 **에이전트 런 전체가 실패한다.** 그래서 전 입력에 대해 전역이다 —
 * 값이 없는 필드도, 빈 문자열도, 음수·비유한 `columns`도 문자열을 돌려준다.
 *
 * **`columns`는 필수 인자다.** 폭을 모르는 곳에서는 애초에 그리지 않는 것이 `input.ts`의
 * 게이트이므로 «폭 미상» 갈래를 두지 않는다 — 두면 정확히 그 자리가 §7.1의 1행 제약을
 * 못 지키는 입력의 도피처가 된다.
 *
 * 절단 기준은 `displayWidth`다 — 바이트도 코드포인트도 아니다. 한국어 대화가 기본 사용
 * 형태라 전각을 1칸으로 세면 즉시 어긋난다(`terminal.ts`의 실측 주석).
 *
 * 표시 문구·색·항목 배열은 **세부**다(문서 머리 · §7.1의 지위 열). 계약은 최소 보장
 * 두 항(승인 모드 `off` · 셸 호스트 실행)과 1행 제약뿐이다.
 */

import type { TokenUsage } from "@neo-agent/core";
import { displayWidth, style } from "./terminal.ts";

/**
 * 상태줄에 실리는 다섯 항목 — §7.1의 표 그대로.
 *
 * 앞의 둘이 **계약**이고 뒤의 셋은 세부다. 계약인 근거는 §2.6의 심각도 순서이고,
 * 그래서 두 항목의 표시 규칙도 §7.1이 정한다 — 아래 `collectPieces`가 그 이행이다.
 */
export interface StatusFields {
  /** 계약 · config 동결 (§3). `"off"`일 때만 싣는다 */
  approvalMode: "manual" | "off";
  /** 계약 · 5b 판정 동결. `sandbox: "off"`(명시적 호스트 실행 옵트아웃)일 때만 참이다 */
  shellOnHost: boolean;
  /** 세부 · config 동결 (§3) */
  model: string;
  /** 세부 · `turn_end`의 usage (§7 표) */
  usage?: TokenUsage | undefined;
  /** 세부 · 세션 생성·재개 (§6). 싣는 것은 접두다 */
  sessionId?: string | undefined;
}

/** 항목 사이 간격 — 세부 */
const SEPARATOR = "  ";

/** 잘렸다는 사실이 보여야 한다 — 조용히 끊으면 표시가 거짓이 된다(§2.6) */
const ELLIPSIS = "…";

/** 세션 id 접두 길이 — 세부 */
const SESSION_ID_PREFIX = 8;

interface StatusPiece {
  /** 제어 문자가 걷힌 본문. 폭 계산과 절단이 이 문자열 위에서 돈다 */
  text: string;
  /** 색 입히기. ANSI는 `displayWidth`가 0칸으로 세므로 절단 뒤에 씌운다 */
  paint: (text: string) => string;
}

/**
 * 상태 항목들을 개행 없는 한 줄로 조립한다. 폭이 넘치면 자른다(§7.1 — 1행 제약).
 *
 * 반환 문자열에는 개행이 없다. 이것은 표시 취향이 아니라 계약의 전제다 — 하단 고정
 * 영역의 행 수가 `input.ts`에서 한 값으로 고정돼 있고, 여기서 개행이 하나 새면
 * 걷는 행 수와 그린 행 수가 그 즉시 어긋난다(§7.1 — 단위성).
 */
export function formatStatus(fields: StatusFields, columns: number): string {
  const limit = widthLimit(columns);
  if (limit <= 0) return "";

  const ellipsisWidth = displayWidth(ELLIPSIS);
  let line = "";
  let width = 0;

  for (const piece of collectPieces(fields)) {
    const gap = line === "" ? "" : SEPARATOR;
    const gapWidth = displayWidth(gap);
    const room = limit - width - gapWidth;
    const pieceWidth = displayWidth(piece.text);

    if (pieceWidth <= room) {
      line += gap + piece.paint(piece.text);
      width += gapWidth + pieceWidth;
      continue;
    }

    // 넘쳤다 — 여기서 닫는다. 뒤 항목은 폭이 남아도 싣지 않는다: 오른쪽부터 잘리는
    // 것이 일관돼야 어느 항목이 사라졌는지 사용자가 안다.
    if (room >= ellipsisWidth) {
      const cut = cutToWidth(piece.text, room - ellipsisWidth);
      line += gap + (cut === "" ? ELLIPSIS : piece.paint(cut) + ELLIPSIS);
    }
    break;
  }

  return line;
}

/**
 * 절단 상한.
 *
 * `columns`가 아니라 `columns - 1`인 것은 추정이다(플랜 §8.2 A-2) — 정확히 `columns`칸을
 * 쓰고 개행을 내면 즉시 감싸는 터미널이 있고, 그러면 상태줄이 2행이 되어 §7.1의 1행
 * 제약이 깨진다. 잃는 것은 한 칸이고 그것은 세부다.
 */
function widthLimit(columns: number): number {
  if (typeof columns !== "number" || !Number.isFinite(columns)) return 0;
  return Math.trunc(columns) - 1;
}

/**
 * 실을 항목을 고른다.
 *
 * **계약 항목 둘은 기본값에서 내려왔을 때만 싣는다**(§7.1) — 상태줄은 «정상이다»를
 * 말하는 자리가 아니다. 안전한 기본값이 §2.3의 *"안 만진 상태가 가장 안전"*이므로,
 * 그 상태를 매 순간 선언하면 표시가 소음이 되고 정작 내려간 순간의 대비가 죽는다.
 *
 * 폭에 따라 항목을 줄이는 다단 분기를 두지 않는다(§7.1이 이름으로 배제했다) — 이
 * 함수의 결과는 폭과 무관하고, 폭이 개입하는 자리는 `formatStatus`의 절단 하나뿐이다.
 */
function collectPieces(fields: StatusFields): StatusPiece[] {
  const pieces: StatusPiece[] = [];

  if (fields.approvalMode === "off") {
    pieces.push({ text: "승인 off", paint: style.warn });
  }
  if (fields.shellOnHost === true) {
    pieces.push({ text: "셸 호스트", paint: style.warn });
  }

  const model = sanitize(fields.model);
  if (model !== "") pieces.push({ text: model, paint: style.dim });

  const usage = fields.usage;
  if (usage !== undefined && usage !== null) {
    pieces.push({ text: formatUsage(usage), paint: style.dim });
  }

  const sessionId = sanitize(fields.sessionId).slice(0, SESSION_ID_PREFIX);
  if (sessionId !== "") pieces.push({ text: sessionId, paint: style.dim });

  return pieces;
}

/** usage 표시 형식은 §12가 위임한 세부다. 렌더러의 한 줄과 같은 기호를 쓴다 */
function formatUsage(usage: TokenUsage): string {
  return `↑${count(usage.input)} ↓${count(usage.output)} ↺${count(usage.cacheRead)} +${count(usage.cacheWrite)}`;
}

function count(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "?";
  return String(Math.trunc(value));
}

/**
 * 제어 문자를 걷는다 — 개행·복귀·탭·ESC가 여기 든다.
 *
 * **없으면 1행 제약이 설정 한 줄로 깨진다.** `displayWidth`는 제어 문자를 0칸으로 세므로
 * (`terminal.ts`), 개행이 든 `model` 값 하나가 폭 계산을 하나도 안 건드린 채 상태줄을
 * 2행으로 만든다. ESC를 함께 거르는 것은 같은 이유다 — 남의 이스케이프가 우리 좌표
 * 계산의 전제를 바꾼다.
 */
function sanitize(value: string | undefined): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
    out += char;
  }
  return out;
}

/** 표시 폭이 `limit`을 넘지 않는 최장 접두. 전각 문자를 쪼개지 않는다 */
function cutToWidth(text: string, limit: number): string {
  if (limit <= 0) return "";
  let out = "";
  let width = 0;
  for (const char of text) {
    const next = width + displayWidth(char);
    if (next > limit) break;
    out += char;
    width = next;
  }
  return out;
}
