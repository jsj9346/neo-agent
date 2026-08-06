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
  const kept = byLines ? lines.slice(0, maxLines) : lines;
  const joined = kept.join("\n");

  const byBytes = Buffer.byteLength(joined, "utf8") > maxBytes;
  const text = byBytes ? sliceUtf8(joined, maxBytes) : joined;

  if (!byLines && !byBytes) {
    return { text, truncated: false, totalLines, outputLines: totalLines };
  }

  return {
    text,
    truncated: true,
    // 바이트 상한이 더 앞에서 끊었으면 그쪽이 실질 원인이다.
    truncatedBy: byBytes ? "bytes" : "lines",
    totalLines,
    outputLines: text.length === 0 ? 0 : text.split("\n").length,
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
