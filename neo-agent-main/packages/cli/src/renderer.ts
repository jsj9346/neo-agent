/**
 * 이벤트 렌더링 — `docs/CLI-INTERFACE.md` §7.
 *
 * 렌더러는 **이벤트 스트림의 구독자**다. 코어 상태를 폴링하지 않고 이벤트만으로
 * 그린다 — 이 자리에 나중에 웹 UI가 앉는다(ARCHITECTURE §2.1의 실체).
 *
 * **예외를 삼키지 않는다**: 여기서 던진 것은 코어 계약(CORE-INTERFACE §3)대로
 * 런을 실패시킨다. 렌더링이 안 되는데 대화가 계속되는 것 자체가 침묵 실패다.
 * 그래서 이 파일에는 이벤트 처리를 감싸는 try/catch가 없다.
 */

import type {
  AgentEvent,
  AgentEventListener,
  AgentMessage,
  AssistantMessage,
  ImageContent,
  TextContent,
  ThinkingContent,
  TokenUsage,
  ToolCallContent,
  ToolResult,
} from "@neo-agent/core";
import { type OutputSink, style } from "./terminal.ts";

/**
 * 표시 상한 (§7 — "결과 요약(유계 — 전문 덤프 금지)").
 *
 * 도구 결과 전문은 이미 트랜스크립트와 세션 DB에 있다. 화면에 다시 쏟으면 대화의
 * 흐름이 파묻힌다. 수치는 조정 가능한 세부다(문서 머리말).
 */
const MAX_ARGS_CHARS = 120;
const MAX_RESULT_LINES = 6;
const MAX_RESULT_CHARS = 400;

/** 재개 시 되그릴 메시지 수(§6 — 표시 범위는 구현 세부) */
const DEFAULT_TRANSCRIPT_LIMIT = 12;

/**
 * 이벤트 리스너를 만든다. `out`은 주입된 출력 싱크다 — `process.stdout`도, 모의
 * 스트림도, REPL의 라인 가드도 같은 형태다(터미널 직접 참조 금지 계약).
 *
 * 조립 시 **저장소 구독이 먼저, 렌더러가 나중**이다(SESSION-STORE §4 — "사용자가
 * 화면에서 본 것은 이미 저장된 것"). 그 순서는 조립 지점의 책임이라 여기서는
 * 강제하지 않는다.
 */
export function createRenderer(out: OutputSink): AgentEventListener {
  /** 지금 커서가 행의 처음에 있는가. 블록 표시 전에 개행을 넣을지 판단한다 */
  let atLineStart = true;
  /** 스트리밍 중인 어시스턴트 메시지 id. 초안과 최종 메시지의 상관 키다(§7) */
  let streamingId: string | undefined;
  /** 이번 스트리밍에서 델타로 실제 출력한 것이 있는가 */
  let streamed = false;
  /**
   * `tool_end`로 렌더한 toolCallId (§7).
   *
   * 이 집합에 있는 toolResult의 `message_end`는 스킵하고, **없는 것은 표시한다** —
   * 도구 이벤트 없이 오는 toolResult는 비정상 종료의 합성 짝(CORE-INTERFACE §5)이고,
   * 미실행 사실이 화면에 남아야 한다.
   */
  const renderedToolCalls = new Set<string>();

  const emit = (text: string): void => {
    if (text === "") return;
    out.write(text);
    atLineStart = text.endsWith("\n");
  };

  const ensureLineStart = (): void => {
    if (!atLineStart) emit("\n");
  };

  const line = (text: string): void => {
    ensureLineStart();
    emit(`${text}\n`);
  };

  return (event: AgentEvent): void => {
    switch (event.type) {
      case "message_start":
        // **사용자 메시지는 항상 렌더한다**(§7). 직접 친 프롬프트·steer 주입·코어가
        // 주입하는 합성 user 메시지(턴 한도 grace, CORE-INTERFACE §5)가 이 규칙
        // 하나로 구분 없이 처리된다. "내가 만든 메시지"를 추적해 스킵하는 설계는
        // 합성 메시지를 놓친다.
        if (event.message.role === "user") {
          line(`${style.cyan(">")} ${flattenUserContent(event.message.content)}`);
        } else if (event.message.role === "assistant") {
          streamingId = event.message.id;
          streamed = false;
          ensureLineStart();
        }
        return;

      case "message_update": {
        // 상관은 id로 한다(§7) — 스트리밍 초안과 최종 메시지가 같은 id라는
        // 코어 계약(CORE-INTERFACE §2)의 소비 지점이다.
        if (event.message.id !== streamingId) return;
        if (event.delta.type === "text_delta") {
          emit(event.delta.text);
          streamed = true;
        } else if (event.delta.type === "thinking_delta") {
          emit(style.dim(event.delta.text));
          streamed = true;
        }
        // `toolcall`·`done`은 여기서 그리지 않는다 — 도구는 tool_start/tool_end가,
        // 종료는 message_end가 그린다. 부분 인자 스트리밍은 요구하지 않는다(§7).
        return;
      }

      case "message_end": {
        const message = event.message;
        if (message.role === "user") return; // message_start에서 이미 그렸다

        if (message.role === "toolResult") {
          if (renderedToolCalls.delete(message.toolCallId)) return;
          // 도구 이벤트 없이 온 결과 = 실행되지 않은 호출의 합성 짝.
          line(
            `${style.yellow("○")} ${message.toolName} ${style.yellow("실행되지 않음")}${formatIndented(
              flattenResultContent(message.content),
            )}`,
          );
          return;
        }

        // 델타가 하나도 오지 않은 어시스턴트 메시지(합성·비스트리밍 실패 응답)도
        // 내용이 있으면 그린다. 델타만 믿으면 그 내용이 조용히 사라진다.
        // [미규정] §7 표는 message_end를 "스트리밍 마감"으로만 적는다. 침묵 유실
        // 금지(§2.6) 쪽으로 닫았다.
        if (!streamed) emit(flattenAssistantContent(message.content));
        renderStopReason(message);
        streamingId = undefined;
        streamed = false;
        return;
      }

      case "tool_start":
        line(`${style.dim("⏺")} ${style.bold(event.toolName)}(${summarizeArgs(event.args)})`);
        return;

      case "tool_end": {
        renderedToolCalls.add(event.toolCallId);
        const body = formatIndented(summarizeResult(event.result));
        line(
          event.isError
            ? `${style.red("✗")} ${event.toolName} ${style.red("실패")}${body}`
            : `${style.dim("⏹")} ${style.dim(`${event.toolName} 완료`)}${body}`,
        );
        return;
      }

      case "turn_end":
        // **비용 가시성의 소비 지점**(§7) — CORE-INTERFACE §2의 "usage는 옵션이
        // 아니다"가 화면에 닿는 곳이다.
        line(style.dim(formatUsage(event.message.usage)));
        return;

      case "agent_end":
        // 입력 프롬프트 복귀는 REPL이 한다(런 프로미스가 resolve한 뒤, §8).
        // 렌더러는 다음 출력이 행 중간에서 시작하지 않게 정리만 한다.
        ensureLineStart();
        return;

      // `tool_update`는 MVP 렌더러가 소비하지 않는다(§7 — TOOLS-INTERFACE §7 미결의
      // 해소). `agent_start`·`turn_start`는 표시할 것이 없다.
      default:
        return;
    }
  };

  /**
   * **`stopReason`은 침묵하지 않는다**(§7). `end_turn`·`tool_use`만 무표시 정상이다.
   */
  function renderStopReason(message: AssistantMessage): void {
    switch (message.stopReason) {
      case "max_tokens":
        line(style.yellow("⚠ 응답이 길이 한도(max_tokens)에서 잘렸다. 이어서 요청하면 계속된다."));
        return;
      case "error":
        line(style.red(`✗ 실패: ${message.errorMessage ?? "원인이 보고되지 않았다."}`));
        return;
      case "aborted":
        line(
          style.yellow(
            `■ 중단됨${message.errorMessage === undefined ? "" : ` — ${message.errorMessage}`}`,
          ),
        );
        return;
      default:
        return;
    }
  }
}

/**
 * 재개 직후의 과거 대화 표시 — `docs/CLI-INTERFACE.md` §6.
 *
 * **재개 시 과거 대화는 이벤트로 재방출되지 않는다**(2026-08-06 실측 확정). 그래서
 * 라이브 렌더러로는 그릴 수 없고, `loadSession`이 돌려준 배열로 직접 그린다.
 * "재개 직후 어디까지 진행된 세션인지가 화면에 보여야 한다"가 계약이고, 표시 범위는
 * 구현 세부다(§6).
 *
 * 라이브 경로와 **일부러 다르게** 처리하는 것이 하나 있다: 도구 결과를 "실행되지
 * 않음"으로 그리지 않는다. 라이브에서 그 표시는 "`tool_end` 없이 온 결과 = 비정상
 * 종료의 합성 짝"이라는 판정에서 나오는데, 과거 트랜스크립트에는 애초에 도구
 * 이벤트가 없으므로 같은 규칙을 적용하면 **실제로 실행됐던 도구가 전부 미실행으로
 * 보인다**. 판정 근거는 `isError`뿐이다.
 */
export function renderTranscript(
  out: OutputSink,
  messages: readonly AgentMessage[],
  options: { limit?: number } = {},
): void {
  const limit = options.limit ?? DEFAULT_TRANSCRIPT_LIMIT;
  const hidden = Math.max(0, messages.length - limit);
  const shown = hidden > 0 ? messages.slice(hidden) : messages;

  if (hidden > 0) {
    out.write(`${style.dim(`… 이전 메시지 ${hidden}개 생략 (전체 ${messages.length}개)`)}\n`);
  }

  for (const message of shown) {
    if (message.role === "user") {
      out.write(`${style.cyan(">")} ${flattenUserContent(message.content)}\n`);
      continue;
    }

    if (message.role === "assistant") {
      const text = flattenAssistantContent(message.content).trim();
      if (text !== "") out.write(`${text}\n`);
      for (const block of message.content) {
        if (block.type === "toolCall") {
          out.write(
            `${style.dim("⏺")} ${style.bold(block.toolName)}(${summarizeArgs(block.args)})\n`,
          );
        }
      }
      continue;
    }

    const body = formatIndented(summarizeText(flattenResultContent(message.content)));
    out.write(
      message.isError
        ? `${style.red("✗")} ${message.toolName} ${style.red("실패")}${body}\n`
        : `${style.dim("⏹")} ${style.dim(`${message.toolName} 완료`)}${body}\n`,
    );
  }
}

function flattenUserContent(content: readonly (TextContent | ImageContent)[]): string {
  return content
    .map((block) => (block.type === "text" ? block.text : `[이미지 ${block.mimeType}]`))
    .join("")
    .trim();
}

function flattenAssistantContent(
  content: readonly (TextContent | ThinkingContent | ToolCallContent)[],
): string {
  return content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "thinking") return style.dim(block.text);
      return "";
    })
    .join("");
}

function flattenResultContent(content: readonly (TextContent | ImageContent)[]): string {
  return content
    .map((block) => (block.type === "text" ? block.text : `[이미지 ${block.mimeType}]`))
    .join("\n");
}

/** 도구 인자 요약 — 한 줄, 유계 */
function summarizeArgs(args: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(args) ?? String(args);
  } catch {
    // 순환 참조 등. 인자를 못 그리는 것이 런을 죽일 이유는 아니다.
    text = "(표시할 수 없는 인자)";
  }
  return truncateOneLine(text, MAX_ARGS_CHARS);
}

/** 도구 결과 요약 — 줄 수·글자 수 양쪽으로 유계. 전문 덤프 금지(§7) */
function summarizeResult(result: ToolResult): string {
  return summarizeText(flattenResultContent(result.content));
}

function summarizeText(text: string): string {
  const lines = text.split("\n");
  const kept = lines.slice(0, MAX_RESULT_LINES).join("\n");
  const clipped = kept.length > MAX_RESULT_CHARS ? `${kept.slice(0, MAX_RESULT_CHARS)}…` : kept;
  const hiddenLines = lines.length - Math.min(lines.length, MAX_RESULT_LINES);

  if (hiddenLines > 0) return `${clipped}\n${style.dim(`… ${hiddenLines}줄 더`)}`;
  return clipped;
}

function truncateOneLine(text: string, limit: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine;
}

/** 요약 본문을 헤더 아래 들여쓴다. 빈 본문이면 아무것도 붙이지 않는다 */
function formatIndented(body: string): string {
  if (body.trim() === "") return "";
  return `\n${body
    .split("\n")
    .map((entry) => `  ${entry}`)
    .join("\n")}`;
}

function formatUsage(usage: TokenUsage): string {
  return `  ↑${usage.input} ↓${usage.output} cache↺${usage.cacheRead} cache+${usage.cacheWrite}`;
}
