/**
 * QA-A(T-009) 전용 테스트 하네스 — CLI 계약 검증의 공용 부품.
 *
 * `packages/store/test/contract-harness.ts`·`mock-model.ts`를 재사용하지 않는다:
 * 독립 검증이 구현자·타 QA와 같은 하네스를 공유하면 "둘 다 같은 오해를 공유하는"
 * 경우를 잡지 못한다. 여기의 모의 어댑터는 `docs/CORE-INTERFACE.md` §8만 보고
 * 새로 쓴 것이다.
 *
 * 이 파일은 테스트가 아니다(`*.test.ts`가 아니므로 vitest가 수집하지 않는다).
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
 * [미규정] 판정 요청 목록 — QA-A(T-009) 집약
 *
 * 아래는 정본 설계 문서가 정하지 않아 **QA가 임의 판정하지 않은** 항목이다.
 * 각 항목은 해당 테스트 파일에도 `[미규정]` 주석으로 표시돼 있다. 설계자가
 * 판정하면 문서를 먼저 고치고 테스트를 그에 맞춘다.
 *
 * ─ U-1. argv 닫힌 목록 밖의 입력 (CLI-INTERFACE §5)
 *   §5는 "argv는 최소로 닫는다"고만 하고 `neo-agent --yolo`나 인자 없는
 *   `--resume`의 처리를 규정하지 않는다. 설정 파일의 미지 키는 §3이 "시작 시
 *   에러"로 명시했고 근거(침묵 실패 금지, §2.6)는 argv에도 그대로 적용될 것으로
 *   보이지만 문서에 없다.
 *   → 구현(`src/args.ts`)은 **둘 다 throw**로 닫았고 근거도 §2·§2.6으로 같다.
 *      판정: 이 동작을 §5에 명문화할 것인가. (테스트는 관찰만 하고 단언하지 않음)
 *
 * ─ U-2. 여러 줄 `display`의 줄별 가공 (CLI-INTERFACE §9)
 *   §9는 "display는 가공 없이 그대로 표시한다. 색상·테두리 장식은 display 문자열
 *   **밖**에만"이라고 하는데, 여러 줄 display에 줄마다 들여쓰기·테두리 접두를
 *   붙이는 것이 "밖의 장식"인지 "안의 재포맷"인지 갈린다. 게이트의 위조 탐지가
 *   무의미해지는 선이 어디인지가 쟁점이다.
 *   → 테스트는 한 줄 display에만 바이트 동일성을 단언하고, 여러 줄은 "모든 줄이
 *      출력에 나타난다"까지만 본다.
 *
 * ─ U-3. 승인 프롬프트의 abort 처리 형태 (APPROVAL-GATE §2 / CLI-INTERFACE §8·§9)
 *   게이트는 "프롬프트를 취소하고 block한다"고 정했지만, `ApprovalPrompt.ask`가
 *   **reject하는지 `"deny"`로 resolve하는지**는 어느 문서에도 없다. 게이트 쪽
 *   구현이 어느 쪽을 기대하는지에 따라 CLI 구현이 갈린다.
 *   → 테스트는 "매달리지 않는다" + "값을 준다면 allow-* 가 아니다"까지만 단언.
 *
 * ─ U-4. allowlist append 실패 경고의 전달 수단 (CLI-INTERFACE §10)
 *   §10은 "경고를 표시한다"까지만 정한다. 주입 콜백인지 `console`인지 stderr 직접
 *   쓰기인지에 따라 조립 지점(§2 시퀀스)의 배선이 달라진다.
 *   → 테스트는 셋 다 감시해 "어디로든 나왔는가"만 본다. throw는 계약 위반으로
 *      단언한다("메모리 반영은 유지"가 성립하지 않으므로).
 *
 * ─ U-5. 슬래시 디스패처의 소유 모듈 (CLI-INTERFACE §5·§8)
 *   §5는 "디스패치가 레지스트리에서 파생된다"고만 하고 디스패처가 어느 모듈에
 *   사는지는 정하지 않는다(레지스트리인지 입력 상태 머신인지). 계약 자체는 어느
 *   쪽이든 같으므로 테스트는 `registry.ts`와 `input.ts` 양쪽을 찾는다.
 *
 * ─ U-6. 설정 객체의 깊은 동결 범위 (SAFE-DEFAULTS §4)
 *   §4는 "설정을 동결한다"고 하지만 `denyRules` 배열까지인지 최상위 객체까지인지
 *   명시하지 않는다. QA는 **깊은 동결이 계약**이라고 읽고 단언했다 — 배열이 열려
 *   있으면 `config.denyRules.length = 0` 한 줄로 게이트 2계층이 사라져 "실행 중
 *   게이트를 약화시킬 수 없다"가 성립하지 않기 때문이다. 이 독해가 맞는지 확인 요청.
 * ========================================================================== */
