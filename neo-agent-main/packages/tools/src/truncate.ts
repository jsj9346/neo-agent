/**
 * 유계 출력 — `docs/TOOLS-INTERFACE.md` §2.
 *
 * 도구 결과는 매 API 호출에 실리므로 상한이 없으면 파일 하나가 컨텍스트를
 * 통째로 먹는다. 상한만큼 중요한 것은 **잘렸다는 사실이 보이는 것**이다 —
 * 조용히 잘린 결과는 모델에게 "이게 전부"로 보이고, 그것이 silent failure다(§2.6).
 */

/** 기본 상한. OpenClaw의 세션 도구 기준선(2000줄 / 50KB)을 그대로 차용했다 */
export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024;

export interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
}

export interface TruncationResult {
  text: string;
  truncated: boolean;
  /** 무엇이 상한에 먼저 걸렸는지 — 사용자가 어느 인자를 조정할지 알 수 있다 */
  truncatedBy?: "lines" | "bytes";
  /** 잘리기 전 원본의 총 줄 수 */
  totalLines: number;
  /** 실제로 실린 줄 수 */
  outputLines: number;
  /**
   * 한 줄이 그 자체로 바이트 상한을 넘어 줄 중간에서 끊겼다.
   * 이 경우에만 이어 읽기(`offset`)로 나머지를 회수할 수 없으므로, 호출자는
   * 안내 문구를 달리해야 한다 — 회수 가능한 것처럼 말하면 안내가 거짓이 된다.
   */
  lineOverflow?: boolean;
}

/**
 * UTF-8 문자 경계를 지키며 바이트 상한까지 자른다.
 * 상한 위치가 멀티바이트 문자 중간이면 그 문자 시작 앞으로 물린다 — 깨진 바이트를
 * 모델에게 보내면 대체 문자(U+FFFD)로 보여서 원본이 그렇게 생긴 것처럼 오해된다.
 */
function sliceUtf8(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= maxBytes) return text;

  let end = maxBytes;
  while (end > 0 && ((buffer[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return buffer.subarray(0, end).toString("utf8");
}

export function truncateText(content: string, options: TruncationOptions = {}): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const lines = content.split("\n");
  const totalLines = lines.length;

  const byLines = lines.length > maxLines;
  const lineWindow = byLines ? lines.slice(0, maxLines) : lines;

  // 바이트 상한은 **완전한 줄 경계에서만** 끊는다. 줄 중간에서 끊고 "다음 줄부터
  // 이어 읽어라"라고 안내하면 그 줄의 나머지가 영영 회수되지 않는다 — 안내가 있는
  // 조용한 유실이라 안내가 없는 것보다 나쁘다(TOOLS-INTERFACE §2, QA 검증에서 발견).
  const kept: string[] = [];
  let bytes = 0;
  let byBytes = false;
  for (const line of lineWindow) {
    // 두 번째 줄부터는 이어 붙일 개행 1바이트를 함께 센다.
    const cost = Buffer.byteLength(line, "utf8") + (kept.length > 0 ? 1 : 0);
    if (bytes + cost > maxBytes) {
      byBytes = true;
      break;
    }
    bytes += cost;
    kept.push(line);
  }

  // 첫 줄이 그 자체로 상한을 넘으면 줄 경계를 지킬 수 없다. 빈손으로 돌려주는 대신
  // 부분이라도 주되, 회수 불가라는 사실을 `lineOverflow`로 알린다.
  if (kept.length === 0 && lineWindow.length > 0) {
    return {
      text: sliceUtf8(lineWindow[0] ?? "", maxBytes),
      truncated: true,
      truncatedBy: "bytes",
      totalLines,
      outputLines: 1,
      lineOverflow: true,
    };
  }

  const text = kept.join("\n");

  if (!byLines && !byBytes) {
    return { text, truncated: false, totalLines, outputLines: totalLines };
  }

  return {
    text,
    truncated: true,
    // 바이트 상한이 더 앞에서 끊었으면 그쪽이 실질 원인이다.
    truncatedBy: byBytes ? "bytes" : "lines",
    totalLines,
    outputLines: kept.length,
  };
}

/**
 * 꼬리를 남기며 바이트 상한을 지킨다 — 셸 출력용.
 * 긴 명령의 진단 정보는 대개 끝(에러 메시지·요약)에 있으므로 머리가 아니라 꼬리를 남긴다.
 */
export function truncateTailBytes(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= maxBytes) return { text, truncated: false };

  let start = buffer.length - maxBytes;
  while (start < buffer.length && ((buffer[start] ?? 0) & 0xc0) === 0x80) start += 1;
  return { text: buffer.subarray(start).toString("utf8"), truncated: true };
}
