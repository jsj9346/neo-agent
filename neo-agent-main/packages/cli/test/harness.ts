/**
 * QA-A(T-009) 전용 테스트 하네스 — CLI 계약 검증의 공용 부품.
 *
 * `packages/store/test/contract-harness.ts`·`mock-model.ts`를 재사용하지 않는다:
 * 독립 검증이 구현자·타 QA와 같은 하네스를 공유하면 "둘 다 같은 오해를 공유하는"
 * 경우를 잡지 못한다. 여기의 모의 어댑터는 `docs/CORE-INTERFACE.md` §8만 보고
 * 새로 쓴 것이다.
 *
 * 이 파일은 테스트가 아니다(`*.test.ts`가 아니므로 vitest가 수집하지 않는다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { Writable } from "node:stream";
import type {
  AssistantMessage,
  ModelAssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  StopReason,
} from "@neo-agent/core";

const ZERO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

export interface ScriptedTurn {
  text?: string;
  thinking?: string;
  toolCalls?: readonly { toolCallId: string; toolName: string; args: unknown }[];
  stopReason?: StopReason;
}

/**
 * 대본대로 재생하는 최소 `ModelClient`.
 *
 * 계약(§8)만 지킨다: throw/reject하지 않고, `done.message`에 id가 없으며,
 * `usage`는 필수다. 대본이 소진되면 같은 마지막 턴을 계속 반복한다 —
 * 턴 한도(grace) 재현에는 "도구를 끝없이 부르는 모델"이 필요하기 때문이다.
 */
export class ProbeModel implements ModelClient {
  readonly modelId = "qa-a/probe-1";
  readonly requests: ModelRequest[] = [];
  #cursor = 0;
  readonly #script: readonly ScriptedTurn[];
  readonly #repeatLast: boolean;

  constructor(script: readonly ScriptedTurn[], options: { repeatLast?: boolean } = {}) {
    this.#script = [...script];
    this.#repeatLast = options.repeatLast ?? false;
  }

  get turnCount(): number {
    return this.#cursor;
  }

  async *stream(request: ModelRequest, _signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    const index = Math.min(this.#cursor, this.#script.length - 1);
    const turn = this.#repeatLast ? this.#script[index] : this.#script[this.#cursor];
    this.#cursor += 1;

    if (!turn) {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: "ProbeModel: 대본이 소진됐다",
          usage: { ...ZERO_USAGE },
          timestamp: Date.now(),
        } satisfies ModelAssistantMessage,
      };
      return;
    }

    const content: AssistantMessage["content"] = [];
    if (turn.thinking !== undefined) {
      yield { type: "thinking_delta", text: turn.thinking };
      content.push({ type: "thinking", text: turn.thinking });
    }
    if (turn.text !== undefined) {
      yield { type: "text_delta", text: turn.text };
      content.push({ type: "text", text: turn.text });
    }
    for (const call of turn.toolCalls ?? []) {
      content.push({ type: "toolCall", ...call });
      yield { type: "toolcall", ...call };
    }

    yield {
      type: "done",
      message: {
        role: "assistant",
        content,
        stopReason:
          turn.stopReason ?? ((turn.toolCalls?.length ?? 0) > 0 ? "tool_use" : "end_turn"),
        usage: { ...ZERO_USAGE },
        timestamp: Date.now(),
      },
    };
  }
}

/**
 * CLI 구현 모듈을 동적으로 로드한다.
 *
 * 정적 임포트를 쓰지 않는 이유: T-009는 **구현 선행** 테스트라 `packages/cli/src`의
 * 모듈이 아직 없을 수 있고, 없는 경로를 정적으로 임포트하면 `pnpm typecheck`가
 * 워크스페이스 전체에서 깨져 병렬 작업 중인 구현자들을 막는다. 계산된 스펙파이어는
 * TS가 정적 해석하지 않으므로 타입체크 게이트를 건드리지 않는다.
 *
 * 로드 실패는 **계약 위반이 아니라 구현 미완**일 수 있다 — 보고 시 구분한다.
 */
export async function loadCliModule(fileName: string): Promise<Record<string, unknown>> {
  const specifier = new URL(`../src/${fileName}`, import.meta.url).href;
  try {
    return (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[구현 미완 또는 로드 실패] packages/cli/src/${fileName} — ${detail}\n` +
        "이 실패가 계약 위반인지 아직 구현이 없을 뿐인지는 보고에서 구분한다.",
    );
  }
}

/** 모듈에서 후보 이름 중 처음 발견되는 함수를 꺼낸다 — 이름 세부에 관대하되 부재는 실패 */
export function pickExport<T = unknown>(
  module: Record<string, unknown>,
  candidates: readonly string[],
  what: string,
): T {
  for (const name of candidates) {
    if (module[name] !== undefined) return module[name] as T;
  }
  throw new Error(
    `${what}를 찾지 못했다. 확인한 export 이름: ${candidates.join(", ")} / 실제 export: ${Object.keys(module).join(", ") || "(없음)"}`,
  );
}

/** 출력 검증용 메모리 Writable — 렌더러·승인 프롬프트에 주입한다 */
export class CaptureStream extends Writable {
  #chunks: string[] = [];

  override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.#chunks.push(String(chunk));
    callback();
  }

  get text(): string {
    return this.#chunks.join("");
  }

  clear(): void {
    this.#chunks = [];
  }

  /**
   * `write()`를 동기 throw로 바꾼다 — "렌더러 예외는 삼키지 않는다"(§7) 검증용.
   *
   * `_write` 콜백에 에러를 넘기는 방식을 쓰지 않는 이유: 콜백 에러는 스트림의
   * `error` 이벤트가 되어 렌더러가 관찰하지 않아도 테스트가 통과해 버린다.
   * 우리가 재는 것은 **렌더러가 예외를 삼키는가**다.
   */
  breakWrites(): void {
    (this as unknown as { write: () => boolean }).write = () => {
      throw new Error("CaptureStream: 의도적 쓰기 실패");
    };
  }
}

/** ANSI 이스케이프(SGR·커서 제어)를 지운 텍스트 — 장식 무관 내용 검증용 */
export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

/** 이벤트 루프를 몇 바퀴 돌려 "아직 resolve되지 않았다"를 관찰 가능하게 만든다 */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** 프라미스가 아직 settle되지 않았는지 확인한다 */
export async function isPending(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  const settled = await Promise.race([
    promise.then(
      () => "resolved",
      () => "rejected",
    ),
    flush().then(() => marker),
  ]);
  return settled === marker;
}

/* ============================================================================
 * QA-A(T-009) 판정 요청 여섯 — **전부 닫혔다** (2026-08-20 · K-005).
 *
 * 이 자리에는 정본이 정하지 않아 QA가 임의 판정하지 않은 항목 여섯(U-1~U-6)이
 * 마커로 서 있었다. 여섯 다 판정이 끝났으므로 마커를 걷는다 — 열린 것으로 다시
 * 읽히지 않게, 어디가 답을 들고 있는지만 남긴다. 줄번호는 적지 않는다(머리 선언).
 *
 *   U-1 argv 닫힌 목록 밖의 입력      → `CLI-INTERFACE.md` §5 (2026-08-06 명문화)
 *   U-2 여러 줄 `display`의 줄별 가공  → `CLI-INTERFACE.md` §9 (2026-08-06 명문화)
 *   U-3 승인 프롬프트의 abort 처리     → `CLI-INTERFACE.md` §9 (2026-08-06 명문화).
 *       `APPROVAL-GATE.md` §7이 승인 프롬프트의 CLI UX를 그 절로 넘겨 닫았다
 *   U-4 allowlist append 실패 경고     → `CLI-INTERFACE.md` §10 (2026-08-06 명문화)
 *   U-5 슬래시 디스패처의 소유 모듈    → **정하지 않기로 정했다** (2026-08-20).
 *       배럴(`src/index.ts`)의 `// §n` 주석이 계약 절과 모듈을 잇는 지도이고
 *       (`CLI-INTERFACE.md` §1), 소속은 그 지도가 든다. 계약은 어느 모듈이
 *       소유하든 같으므로 정본에 문면을 더하지 않는다
 *   U-6 설정 객체의 깊은 동결 범위     → `CLI-INTERFACE.md` §3 (2026-08-06 명문화 —
 *       깊은 동결이라는 QA 독해가 지지됐다)
 *
 * 판정 정본은 `plans/20260806-cli-qa-report.md` §3과 그날 이후의 문서 개정이다.
 * ========================================================================== */
