/**
 * 압축 통합 시나리오 — T-012 (QA-B).
 *
 * **실물을 조립해 끝에서 끝까지 돌린다.** `startCli`가 조립하는 그대로 — 실제 SQLite
 * 저장소, 실제 설정 로더, 실제 승인 게이트·도구·렌더러·REPL 상태 머신, 실제 압축
 * 컨트롤러다. 모의는 둘뿐이다: 모델(`ScenarioModel`)과 터미널 스트림. 부품별 계약은
 * T-010·T-011이 이미 봤고, 여기서 재는 것은 **합쳤을 때 성립하는가**다.
 *
 * 기대값의 출처는 정본 문서뿐이다:
 *   - `docs/COMPACTION.md` §2(분기 모델)·§3(트리거 2곳)·§4(cut)·§5(요약 실패)·
 *     §6(원자성·표시 의무 4요소·취소)·§7(실패 처리·자동 중지)
 *   - `docs/SESSION-STORE.md` §2(스키마 v2)·§5(superseded 제외)
 *   - `docs/CLI-INTERFACE.md` §3(config 3키)·§5(`/compact`)·§6(재개)
 *
 * Architect 기판정 3건을 기대값에 반영했다:
 *   - **A-1** 사용자 취소는 연속 실패 카운트에 넣지 않는다.
 *   - **E-47** 수동 `/compact`의 `not-possible`은 자동 중지를 건드리지 않는다.
 *   - **E-46** 압축 중 제출은 거부 표시 + 히스토리 보존.
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 `[미규정 B-n]`(B-12부터)에 모았다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PassThrough } from "node:stream";
import type {
  AgentMessage,
  AssistantMessage,
  ModelAssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  StopReason,
  TokenUsage,
} from "@neo-agent/core";
import { contextWindowForModel } from "@neo-agent/providers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliArgs } from "../src/args.ts";
import {
  DEFAULT_COMPACTION_KEEP_RECENT_TURNS,
  DEFAULT_COMPACTION_THRESHOLD,
} from "../src/config.ts";
import { API_KEY_ENV } from "../src/credentials.ts";
import type { InputState } from "../src/input.ts";
import { buildSystemPrompt } from "../src/system-prompt.ts";
import { type CliApp, type CliDeps, startCli } from "../src/wiring.ts";
import { dockerAvailable } from "./probe-docker.ts";

// ───────────────────────────────────────────────────────────────────────────
// 상수 — 임계 계산의 근거를 한자리에 모은다
// ───────────────────────────────────────────────────────────────────────────

/** `contextWindowForModel`이 아는 모델. 창 200,000 (providers 테이블) */
const MODEL_ID = "claude-haiku-4-5-20251001";
/** 기본 threshold 0.75 → 실효 트리거는 150,000 토큰 */
const CONTEXT_WINDOW = 200_000;
/** 임계 초과. 150,000을 넘는다 */
const HIGH_INPUT = 180_000;

/**
 * 임계 초과 usage를 **네 필드에 흩어 놓는다** (V-2, 2026-08-10 독립 `/verify` 판정 2).
 *
 * §3은 컨텍스트 크기를 *"`input + cacheRead + cacheWrite + output`"*으로 규정하고 §6은 그
 * 값의 표시를 의무화한다. `compact.ts`는 *"합산 규칙은 compaction 패키지 하나뿐이다"*라며
 * `measureContextTokens`에 위임하는데, **그 위임이 깨지는 것을 CLI 층이 못 봤다** — 이 파일의
 * 모든 `ConvoTurn`이 `usage: { input: N }`만 채워 나머지 셋이 0이었고, 그러면 합과 `input`이
 * 항상 같아 가를 입력이 존재하지 않는다. 실측: `measureContextTokens`를 *"마지막 유효
 * 어시스턴트의 `usage.input`만 읽는다"*로 바꿔도 `packages/cli` **434건이 전부 통과했다.**
 *
 * 네 값은 서로 다르고, 어떤 부분합도 총계와 같지 않게 골랐다 — 한 필드만 읽든 둘·셋만 더하든
 * 화면 수치가 갈린다. 총계는 `HIGH_INPUT` 그대로여서 임계 계산과 다른 시나리오는 안 움직인다.
 *
 * 단위층(`packages/compaction/test/trigger-plan.contract.test.ts:149`)이 합산 규칙 **자체**는
 * 이미 덮는다. 여기서 새로 재는 것은 **CLI가 그 규칙을 경유하는가**다 — C-W1·C-X1이 창 값에
 * 대해 물었던 것과 같은 질문을 usage 축에 놓은 것이다.
 *
 * **분담을 적어 둔다** (W-1 부수 관찰, 2026-08-11). 시나리오 2-b·2-c의 usage는 `{ input: N }`
 * 단일 필드다 — 그쪽이 재는 것은 창 값의 조회 경유이고 합산 축이 아니기 때문이며, 조회값에서
 * 도출한 수치를 네 필드로 흩으면 그 시나리오의 산술이 읽기 어려워진다. 즉 **합산 축의
 * 판별력은 이 시나리오 하나가 전담한다.** 적어 두지 않으면 2-b·2-c를 보고 *"여기도 합산을
 * 잰다"*로 읽힌다.
 */
const HIGH_USAGE: TokenUsage = {
  input: 88_000,
  output: 12_000,
  cacheRead: 64_000,
  cacheWrite: 16_000,
};

/**
 * **무효 턴의 usage** — §3이 배제하는 값 (W-1, 2026-08-11 독립 `/verify` 커버리지 구멍 1).
 *
 * §3 한 문장이 두 조각이다: *"마지막 **유효** 어시스턴트 응답의 `input + cacheRead +
 * cacheWrite + output`"* / *"`stopReason`이 `"error"`·`"aborted"`인 응답의 usage는 불완전할 수
 * 있어 건너뛴다"*. V-2가 **뒤 조각**(4필드 합산)의 CLI 경유를 `HIGH_USAGE`로 닫았지만
 * **앞 조각(유효성 필터)은 그 처분을 받지 않았다** — 실측으로 두 방향이 다 열려 있었다:
 *
 * ```
 * trigger.ts:36 (stopReason 필터) 삭제      → compaction 6 failed / **cli 434 passed**
 * compact.ts가 measureContextTokens 위임을 깨고 직접 합산 → **cli 434 passed**
 * ```
 *
 * 후자가 결정적이다. `compact.ts:195-196` 주석이 지키는 *"합산 규칙은 compaction 패키지
 * 하나뿐"*이라는 위임이 깨지는 **두 방향 중 한 방향만 계측되고 있었다.** 유효성 필터를 잃은
 * CLI는 실패한 호출의 불완전 usage를 before 토큰으로 화면에 적고(§6 표시 의무) 판정에도
 * 쓴다 — §3이 배제한 근거로 §6이 요구한 수치가 만들어진다.
 *
 * 값은 **실효 임계(150,000)를 크게 넘도록** 골랐다. 필터가 빠지면 이 턴에서 판정이 앞당겨져
 * 압축이 실제로 일어나고(그 시점 user 턴 3개 · `keepRecentTurns=2` → `toSummarize` 비지 않음),
 * 대조군의 `not.toContain("압축 완료")`가 발화한다. 반대로 정상 배선에서는 이 턴이 통째로
 * 건너뛰어져 직전 유효 응답(20 토큰)이 판정 입력이 된다.
 *
 * **배치는 트리거 턴 앞이다.** 뒤에 두면 그 판정은 이미 분기된 **자식 세션**에서 돌아
 * 부모의 판정 입력을 재지 못한다 — 하네스는 제출 1회당 대본 1칸을 소비하므로(`#playConvo`)
 * 대본에 한 줄 더하는 것만으로는 재생조차 되지 않는다. 이 값이 재는 것은 어디까지나
 * **트리거 턴의 판정 입력이 무효 턴에 오염되지 않는가**다.
 *
 * **닫지 못한 축 — 표시(§6 before 토큰) 쪽 위임** (2026-08-11 실측). `compact.ts:197`이
 * `measureContextTokens` 위임을 깨고 **직접 합산**하는 변조는 이 배치에서 여전히
 * `packages/cli` 434건을 전부 통과한다. 그 변조가 화면에 드러나려면 무효 턴이 **압축이
 * 일어나는 시점의 마지막 어시스턴트 응답**이어야 하는데, 앞 배치에서는 그 자리를 트리거
 * 턴(유효)이 차지한다. 뒤 배치가 그 자리를 만들지만 그때의 판정은 자식 세션에서 돌아
 * **두 번째 압축**을 요구하므로(대본 5턴), 판정 축과 표시 축은 한 시나리오로 동시에
 * 닫히지 않는다. 이번 사이클은 판정 축만 닫았다 — 표시 축을 닫으려면 무효 턴이 종단인
 * 별도 자리(예: 수동 `/compact` 앞에 무효 턴을 두는 시나리오 1 계열)가 필요하다.
 */
const INVALID_TURN_INPUT = 900_000;

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** 요약 전용 시스템 프롬프트의 지문 — 요약 호출 판별의 교차 확인용 */
const SUMMARY_PROMPT_MARK = "context-compaction summarizer";

// ───────────────────────────────────────────────────────────────────────────
// 모의 모델 — 대화 호출과 요약 호출을 갈라 대본대로 재생한다
// ───────────────────────────────────────────────────────────────────────────

interface ConvoTurn {
  text?: string;
  usage?: Partial<TokenUsage>;
  stopReason?: StopReason;
}

type SummaryTurn =
  | { kind: "text"; text: string }
  /** `end_turn`이 아닌 종료 — 요약 실패 경로(§5) */
  | { kind: "stop"; stopReason: StopReason; text?: string }
  /** abort될 때까지 매달린다 — Ctrl+C 취소 경로(§6) */
  | { kind: "hang" };

/**
 * 대본대로 재생하는 최소 `ModelClient`.
 *
 * `CORE-INTERFACE.md` §8의 계약만 지킨다: `stream()`은 throw/reject하지 않고,
 * `done.message`에 id가 없으며, `usage`는 항상 실린다.
 *
 * **대화 호출과 요약 호출을 `tools`로 가른다** — 요약 요청은 `tools: []`가 계약이고
 * (COMPACTION §5), 대화 요청은 표준 도구 4종을 싣는다. 판별이 조용히 틀리면 시나리오
 * 전체가 무의미해지므로 시스템 프롬프트로 **교차 확인**하고, 어긋나면 그 자리에서
 * 던진다 — 하네스가 자기 오해를 감춘 채 초록불을 만들지 않는다.
 */
class ScenarioModel implements ModelClient {
  readonly modelId = MODEL_ID;
  readonly convoRequests: ModelRequest[] = [];
  readonly summaryRequests: ModelRequest[] = [];

  #convoCursor = 0;
  #summaryCursor = 0;
  readonly #convo: readonly ConvoTurn[];
  readonly #summaries: readonly SummaryTurn[];

  constructor(convo: readonly ConvoTurn[], summaries: readonly SummaryTurn[] = []) {
    this.#convo = convo.length > 0 ? [...convo] : [{ text: "응답" }];
    this.#summaries = summaries.length > 0 ? [...summaries] : [{ kind: "text", text: "요약" }];
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const looksLikeSummary = request.tools.length === 0;
    const hasSummaryPrompt = request.systemPrompt.includes(SUMMARY_PROMPT_MARK);
    if (looksLikeSummary !== hasSummaryPrompt) {
      throw new Error(
        "[하네스 판별 실패] tools 비어 있음과 요약 시스템 프롬프트가 어긋난다 — " +
          `tools=${request.tools.length}, 요약 프롬프트=${hasSummaryPrompt}. ` +
          "요약 호출 판별 기준을 다시 세워야 한다.",
      );
    }

    if (looksLikeSummary) {
      this.summaryRequests.push(request);
      yield* this.#playSummary(signal);
      return;
    }

    // 구조적 복사 — 코어가 같은 배열을 계속 밀어 넣으므로 참조를 들고 있으면
    // "그때 무엇을 봤는가"가 사후에 오염된다.
    this.convoRequests.push(structuredClone(request) as ModelRequest);
    yield* this.#playConvo();
  }

  /** 마지막 턴을 반복한다 — 임계 초과 상태가 이어지는 시나리오가 여럿이다 */
  async *#playConvo(): AsyncIterable<ModelStreamEvent> {
    const index = Math.min(this.#convoCursor, this.#convo.length - 1);
    const turn = this.#convo[index] as ConvoTurn;
    this.#convoCursor += 1;

    const content: AssistantMessage["content"] = [];
    if (turn.text !== undefined) {
      content.push({ type: "text", text: turn.text });
      yield { type: "text_delta", text: turn.text };
    }

    yield {
      type: "done",
      message: {
        role: "assistant",
        content,
        stopReason: turn.stopReason ?? "end_turn",
        usage: { ...ZERO_USAGE, ...turn.usage },
        timestamp: Date.now(),
      } satisfies ModelAssistantMessage,
    };
  }

  async *#playSummary(signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const index = Math.min(this.#summaryCursor, this.#summaries.length - 1);
    const turn = this.#summaries[index] as SummaryTurn;
    this.#summaryCursor += 1;

    if (turn.kind === "hang") {
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [],
          stopReason: "aborted",
          errorMessage: "요약 호출이 취소됐다",
          usage: { ...ZERO_USAGE },
          timestamp: Date.now(),
        },
      };
      return;
    }

    const text = turn.text;
    const content: AssistantMessage["content"] = text === undefined ? [] : [{ type: "text", text }];
    if (text !== undefined) yield { type: "text_delta", text };

    yield {
      type: "done",
      message: {
        role: "assistant",
        content,
        stopReason: turn.kind === "text" ? "end_turn" : turn.stopReason,
        usage: { ...ZERO_USAGE },
        timestamp: Date.now(),
      },
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 리그 — `startCli`를 실물로 돌린다
// ───────────────────────────────────────────────────────────────────────────

let sandbox: string;
let home: string;
let workspace: string;

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-compact-")));
  home = join(sandbox, "home");
  workspace = join(sandbox, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  mkdirSync(workspace, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

interface ConfigOverrides {
  compactionAuto?: boolean;
  compactionThreshold?: number;
  compactionKeepRecentTurns?: number;
  /** 기본은 `MODEL_ID`(창 200,000 기지 모델). 다른 창을 태울 때만 지정한다 — 시나리오 2-b·2-c */
  model?: string;
}

function writeConfig(overrides: ConfigOverrides = {}): void {
  writeFileSync(
    join(home, ".neo-agent", "config.json"),
    JSON.stringify({ model: MODEL_ID, approvalMode: "off", ...overrides }),
    { mode: 0o600 },
  );
}

interface Rig {
  deps: CliDeps;
  /** `startCli`는 argv가 아니라 **파싱된 args**를 받는다 — 재개는 여기로 지정한다 */
  args: CliArgs;
  input: PassThrough;
  model: ScenarioModel;
  text(): string;
  /**
   * 지금까지의 출력을 버린다.
   *
   * 압축 시나리오는 같은 문구가 여러 번 나오므로("압축 완료", 새 세션 id 접두 …)
   * "화면에 X가 있다"만으로는 **이번에 나온 것**을 가릴 수 없다. `/sessions` 목록처럼
   * 직전 상태와 구분해야 하는 검증 앞에서 화면을 비운다.
   */
  clear(): void;
  /**
   * 출력 청크마다 **동기적으로** 콜백한다.
   *
   * 폴링으로는 못 보는 것이 있다 — 모의 모델의 압축은 `setImmediate` 한 틱보다 짧게 끝나서
   * 틱 기반 표본이 통째로 비는 경우가 있다(실측). 쓰기 시점은 그 창 안에 확실히 들어간다.
   */
  onOutput(listener: (chunk: string) => void): void;
  /** API를 우회해 행을 직접 본다 — WAL이라 커밋된 것은 즉시 보인다 */
  messageRows(sessionId: string): { id: string; seq: number; role: string; body: string }[];
  sessionRows(): { id: string; parent_session_id: string | null; active: number }[];
  cleanup(): void;
}

function createRig(options: {
  /** 지정하면 `--resume <prefix>`로 기동한다 */
  resume?: string;
  convo?: readonly ConvoTurn[];
  summaries?: readonly SummaryTurn[];
}): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const model = new ScenarioModel(options.convo ?? [{ text: "응답" }], options.summaries);

  const argv = options.resume === undefined ? [] : ["--resume", options.resume];
  const args: CliArgs =
    options.resume === undefined ? { kind: "run" } : { kind: "resume", prefix: options.resume };

  const deps: CliDeps = {
    argv,
    env: { [API_KEY_ENV]: "sk-ant-테스트" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-qab",
    // Docker 판정은 명시 주입이다 — 생략하면 실제 `docker version`이 스폰되고
    // 이 스위트의 결과가 테스트 머신 상태에 좌우된다(`./probe-docker.ts`).
    factories: { createModelClient: () => model, probeDocker: dockerAvailable() },
  };

  let admin: DatabaseSync | undefined;
  const db = (): DatabaseSync => {
    admin ??= new DatabaseSync(join(home, ".neo-agent", "sessions.db"));
    return admin;
  };

  return {
    deps,
    args,
    input,
    model,
    text: () => stripAnsi(chunks.join("")),
    clear: () => void chunks.splice(0, chunks.length),
    onOutput: (listener) => {
      output.on("data", (chunk: Buffer) => listener(chunk.toString("utf8")));
    },
    messageRows: (sessionId) =>
      db()
        .prepare("SELECT id, seq, role, body FROM messages WHERE session_id = ? ORDER BY seq")
        .all(sessionId) as { id: string; seq: number; role: string; body: string }[],
    sessionRows: () =>
      db()
        .prepare("SELECT id, parent_session_id, active FROM sessions ORDER BY created_at, id")
        .all() as { id: string; parent_session_id: string | null; active: number }[],
    cleanup: () => {
      try {
        admin?.close();
      } catch {
        /* 이미 닫힘 */
      }
    },
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * 대기 헬퍼의 기본 마감. **vitest의 `testTimeout`보다 확실히 짧아야 한다** (V-3,
 * 2026-08-10 독립 `/verify` 판정 3).
 *
 * 아래 헬퍼들은 실패할 때 *"지금까지의 출력"*을 통째로 실어 보낸다 — 이 파일에서
 * 무엇이 어긋났는지는 화면 없이는 읽을 수 없기 때문이다. 그런데 기본값이 5000이던
 * 동안에는 그 덤프가 **한 번도 출력되지 않았다**: `vitest.config.ts`가 `testTimeout`을
 * 지정하지 않아 vitest 기본값도 5000이고, 두 마감이 동시각이면 vitest 쪽이 먼저
 * 테스트를 끊어 `Error: Test timed out in 5000ms.`만 남는다. 경합이 아니라 구조다.
 *
 * 실측(V-3): 같은 변조를 기본 실행하면 화면 덤프가 없고, `--testTimeout=20000`을 주면
 * 전체 덤프가 나왔다. 이 파일은 다섯 사이클 연속 역검증 대상이었으므로 그 차이가
 * 매번 비용이 된다.
 *
 * `vitest.config.ts`를 건드리지 않고 이쪽을 내린 이유는 범위다 — 워크스페이스 전체의
 * 마감을 늘리면 진짜 행(hang)인 테스트의 실패까지 함께 느려진다.
 */
const WAIT_TIMEOUT_MS = 3000;

/**
 * 화면에 표시가 나타날 때까지 기다린다.
 *
 * `waitForIdle()`을 곧바로 부르면 런이 시작되기 전일 수 있어 즉시 resolve한다
 * (제출은 readline 이벤트를 거쳐 비동기로 런이 된다). 관찰 가능한 표시를 기다리는
 * 쪽이 그 경합에 걸리지 않는다.
 */
async function waitFor(rig: Rig, needle: string, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (rig.text().includes(needle)) return;
    await tick();
  }
  throw new Error(`"${needle}"가 화면에 나타나지 않았다. 지금까지의 출력:\n${rig.text()}`);
}

/**
 * 같은 문구가 `count`번 나올 때까지 기다린다.
 *
 * 압축은 한 세션에서 여러 번 일어나고 그때마다 같은 문구를 낸다("압축 중", "압축
 * 완료", "압축을 취소했다"). `waitFor`로 두 번째를 기다리면 **첫 번째가 남긴 글자에
 * 즉시 통과**하고, 그 뒤의 단정은 아직 일어나지 않은 일을 검사한다 — 실측에서
 * 두 번째 Ctrl+C가 압축이 아니라 `idle-input`의 종료 요청으로 간 원인이었다.
 */
async function waitForCount(
  rig: Rig,
  needle: string,
  count: number,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (occurrences(rig.text(), needle) >= count) return;
    await tick();
  }
  throw new Error(
    `"${needle}"가 ${count}번 나타나지 않았다(현재 ${occurrences(rig.text(), needle)}번). 지금까지의 출력:\n${rig.text()}`,
  );
}

/** 어떤 표시가 **나오지 않는다**를 재려면 시간을 줘야 한다 — 즉시 단정은 공허하다 */
async function settle(rounds = 60): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** 조건이 참이 될 때까지 기다린다. 시간을 주지 않으면 "일어나지 않았다"를 잴 수 없다 */
async function waitUntil(
  predicate: () => boolean,
  what: string,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`${what} — ${timeoutMs}ms 안에 일어나지 않았다.`);
}

/**
 * 압축이 도는 동안 REPL이 지나간 입력 상태를 모은다 (W-2, 2026-08-11 커버리지 구멍 2).
 *
 * **왜 화면이 아니라 상태인가.** 자동 압축이 *"런 종료 후"*에 일어나는지(`COMPACTION.md` §3)를
 * 화면 순서로는 못 잰다 — 응답 텍스트는 `text_delta`로 `done`보다 먼저 흐르므로 판정이
 * settlement 앞으로 당겨져도 `응답3 → 압축 중 → 압축 완료` 순서는 그대로다. 게다가
 * `ScenarioModel`은 도구 호출을 내지 않아 이 파일의 **모든 런이 모델 호출 1회**이고,
 * *"런 도중"*과 *"런 종료 후"*가 벌어질 시각 구간 자체가 없다.
 *
 * 대신 `Repl.state`가 두 배치를 가른다. 판정이 런 프로미스 **안**에 있으면(`wiring.ts:637-640`)
 * 압축이 도는 내내 `startRun`의 `finally`가 아직 돌지 않아 상태는 `"compacting"`이다. 판정을
 * 런 **밖**으로 빼면 그 `finally`가 압축 도중에 `state = "idle-input"`을 놓는다
 * (`input.ts:244`) — §6 *"압축 중에는 진행 표시를 하고 입력을 받지 않는다"*가 금지한 상태다.
 * `[미규정 E-45]` 주석이 배제 근거로 적어 둔 *"그 틈에 제출된 입력이 폐기될 Agent로 간다"*가
 * 바로 이 창이며, 이 관측은 그 창을 직접 겨눈다.
 *
 * `압축 완료`는 `withCompaction` **안에서** 나가므로(`compact.ts:228`) 관측 구간은
 * 압축 구간 안에 온전히 들어간다.
 *
 * **표본은 쓰기 시점에 동기적으로 모은다.** 틱 폴링으로 처음 짰더니 표본이 통째로 비었다 —
 * 모의 모델의 압축은 `setImmediate` 한 틱보다 짧게 끝난다(실측). 반환된 집합은 관측이
 * 진행되는 동안 계속 자라므로 단정 전에 `압축 완료`를 기다려야 한다.
 */
function watchCompactionStates(rig: Rig, app: CliApp): Set<InputState> {
  const seen = new Set<InputState>();
  let output = "";
  let closed = false;
  rig.onOutput((chunk) => {
    if (closed) return;
    output += stripAnsi(chunk);
    // 청크 경계가 문구를 가를 수 있어 **누적 문자열**로 판정한다.
    if (!output.includes("압축 중")) return;
    seen.add(app.parts.repl.state);
    if (output.includes("압축 완료")) closed = true;
  });
  return seen;
}

/**
 * 한 턴을 제출하고 그 런이 끝날 때까지 기다린다.
 *
 * **화면의 응답 텍스트를 기다리지 않는다.** 대본이 같은 문구를 반복하면 앞선 턴이
 * 남긴 글자가 이미 화면에 있어 `waitFor`가 즉시 통과하고, 그 뒤의 `waitForIdle()`이
 * **런이 시작되기도 전에** resolve해 버린다(실측으로 확인한 공허한 초록불 — 턴을
 * 4번 돌렸는데 메시지가 7건만 저장됐다). 모델 호출 수의 증가는 문구와 무관하게
 * "이 제출이 실제로 런이 됐다"를 말한다.
 */
async function turn(rig: Rig, app: CliApp, text: string): Promise<void> {
  const before = rig.model.convoRequests.length;
  rig.input.write(`${text}\r`);
  await waitUntil(
    () => rig.model.convoRequests.length > before,
    `제출한 "${text}"가 모델 호출로 이어지지 않았다`,
  );
  await app.parts.agent.waitForIdle();
}

function bodyText(row: { body: string }): string {
  const parsed = JSON.parse(row.body) as AgentMessage;
  return parsed.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 1 — 수동 /compact
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 1 — 수동 /compact (CLI-INTERFACE §5 · COMPACTION §2·§6)", () => {
  it("요약 생성 → 분기 → 새 세션 [요약, kept 2턴] → 부모 제외 → seq 연속", async () => {
    // 자동을 꺼서 수동 경로만 남긴다 — 두 경로가 섞이면 무엇이 압축을 일으켰는지
    // 구분되지 않는다.
    writeConfig({ compactionAuto: false });
    const rig = createRig({
      convo: [{ text: "응답" }],
      summaries: [{ kind: "text", text: "여기까지의 요약이다" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    const parentId = app.parts.session.id;
    for (let index = 1; index <= 4; index += 1) {
      await turn(rig, app, `질문 ${index}`);
    }
    const parentRowsBefore = rig.messageRows(parentId);
    expect(parentRowsBefore).toHaveLength(8);

    rig.input.write("/compact\r");
    await waitFor(rig, "압축 완료");

    // ── 새 세션이 열려 있고, 부모의 자식이다
    const childId = app.parts.session.id;
    expect(childId).not.toBe(parentId);
    const childRow = rig.sessionRows().find((row) => row.id === childId);
    expect(childRow?.parent_session_id).toBe(parentId);

    // ── 트랜스크립트 = [요약, kept 4건] (최근 2 user 턴 = user·assistant ×2)
    const childRows = rig.messageRows(childId);
    expect(childRows.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(childRows.map((row) => row.role)).toEqual([
      "user",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(bodyText(childRows[0] as { body: string })).toBe("여기까지의 요약이다");
    // 유지 메시지는 **같은 id**로 복사된다(COMPACTION §2 — 메시지 동일성 보존)
    expect(childRows.slice(1).map((row) => row.id)).toEqual(
      parentRowsBefore.slice(4).map((row) => row.id),
    );

    // ── 과거를 고쳐 쓰지 않는다: 부모 행은 그대로
    expect(rig.messageRows(parentId)).toEqual(parentRowsBefore);

    // ── superseded 부모는 /sessions에서 빠진다(SESSION-STORE §5)
    // 화면을 비우고 나서 물어야 압축 결과 표시에 섞인 id를 목록으로 오독하지 않는다.
    rig.clear();
    rig.input.write("/sessions\r");
    await waitFor(rig, childId.slice(0, 8));
    await settle();
    expect(rig.text()).toContain(childId.slice(0, 8));
    expect(rig.text()).not.toContain(parentId.slice(0, 8));

    // ── 이어서 1턴 — seq가 이어진다(요약 자리를 재사용하지 않는다)
    await turn(rig, app, "압축 후 질문");
    expect(rig.messageRows(childId).map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 2 — 자동 트리거 (런 종료 후 idle)
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 2 — 자동 트리거 idle (COMPACTION §3 판정 시점 a · §6 표시 의무)", () => {
  it("임계 초과 → agent_end 후 자동 압축 → 표시 4요소가 전부 나온다", async () => {
    // 전제 — 흩어 놓은 네 필드의 합이 총계다. 이것이 깨지면 아래 before 토큰 단정은
    // 계약(§3 4필드 합)이 아니라 우연히 맞은 수를 재게 된다(V-2).
    expect(
      HIGH_USAGE.input + HIGH_USAGE.output + HIGH_USAGE.cacheRead + HIGH_USAGE.cacheWrite,
    ).toBe(HIGH_INPUT);

    // 전제 — 무효 턴의 usage가 실효 임계를 넘는다. 넘지 않으면 아래 무효 턴 대조군은
    // 필터가 빠져도 통과해 아무것도 재지 않는다(W-1).
    expect(INVALID_TURN_INPUT).toBeGreaterThan(CONTEXT_WINDOW * DEFAULT_COMPACTION_THRESHOLD);

    writeConfig({ compactionAuto: true });
    const rig = createRig({
      // 4번째 턴에서 임계를 넘긴다. 그 전까지는 판정이 false다 — 3번째는 임계를 넘는
      // usage를 싣지만 `stopReason: "error"`라 §3이 배제한다.
      convo: [
        { text: "응답1", usage: { input: 10 } },
        { text: "응답2", usage: { input: 20 } },
        { stopReason: "error", usage: { input: INVALID_TURN_INPUT } },
        { text: "응답3", usage: HIGH_USAGE },
      ],
      summaries: [{ kind: "text", text: "자동 압축 요약" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();
    const parentId = app.parts.session.id;

    await turn(rig, app, "질문 1");
    await turn(rig, app, "질문 2");
    // 임계 미달 구간에서는 압축이 일어나지 않는다 — 대조군.
    // **나오지 않는다**를 재므로 시간을 준다(V-4) — 즉시 단정은 공허하다(`settle` 주석).
    await settle();
    expect(rig.text()).not.toContain("압축 완료");
    expect(rig.model.summaryRequests).toHaveLength(0);

    // ── 무효 턴 — **§3 앞 조각의 판별기다** (W-1). `stopReason: "error"`인 응답의 usage는
    // 900,000이지만 §3이 건너뛰라고 규정했으므로 판정 입력은 직전 유효 응답(20)이어야 한다.
    // 유효성 필터가 CLI 경로에서 빠지면 여기서 판정이 앞당겨져 압축이 실제로 일어난다
    // (user 턴 3개 · `keepRecentTurns=2` → `toSummarize`가 비지 않는다).
    await turn(rig, app, "질문 3");
    await settle();
    expect(rig.text()).not.toContain("압축 완료");
    expect(rig.model.summaryRequests).toHaveLength(0);

    rig.input.write("질문 4\r");
    await waitFor(rig, "압축 완료");

    const childId = app.parts.session.id;
    const screen = rig.text();

    // §6 표시 의무 4요소
    expect(screen).toContain("압축 완료"); // (1) 압축이 일어났다는 사실
    expect(screen).toContain(`${HIGH_INPUT.toLocaleString("en-US")} 토큰`); // (2) before 토큰
    expect(screen).toContain("최근 2턴"); // (3) 유지 범위
    expect(screen).toContain(childId.slice(0, 8)); // (4) 새 세션 id

    // ── `창 …`은 **계약이 아니다** (F-2, 2026-08-10 독립 `/verify` 판정 2).
    //
    // §6이 규정한 표시 의무는 위 넷뿐이고, `창 N`은 `compact.ts`가 before 토큰 줄에 덧붙인
    // 구현 재량의 부가 표시다. 그러므로 이 표기를 없애는 리팩터는 §6을 어기지 않는데
    // 이 단정(및 시나리오 2-b·2-c의 같은 단정)은 red가 된다 — 그때는 계약 위반이 아니라
    // **표기 변경에 단정을 맞추는 것**이 옳은 처분이다.
    //
    // 그럼에도 단정을 남기는 이유는 이것이 배선된 창 값을 관측하는 유일한 화면 창구이기
    // 때문이다. §8에 없는 경고 횟수를 단정하지 않기로 한 C-W2 판정과 잣대는 같다(계약이
    // 아닌 것을 테스트가 계약으로 만들지 않는다) — 다르게 처분한 근거가 이 문단이다.
    expect(screen).toContain(`창 ${CONTEXT_WINDOW.toLocaleString("en-US")}`);

    expect(childId).not.toBe(parentId);
    expect(rig.model.summaryRequests).toHaveLength(1);

    await app.shutdown();
    await running;
    rig.cleanup();
  });

  /**
   * **이 `it`이 재는 것과 재지 않는 것** (W-2, 2026-08-11 독립 `/verify` 커버리지 구멍 2).
   *
   * 재는 것은 두 가지다:
   *   1. **표시 순서** — `응답3 → 압축 중 → 압축 완료`. 이것만으로는 판정 시점을 못 가른다.
   *   2. **압축 구간 동안 REPL이 `idle-input`으로 돌아가지 않는다** — §6이 금지한 상태이고,
   *      판정을 런 프로미스 밖으로 빼는 배치가 정확히 그것을 만든다(`statesDuringCompaction`).
   *
   * 2번이 이 `it`의 판별력 전부다. 그 전에는 **고유 판별력이 0이었다** — 시도한 변조 배터리
   * 안에서 이 `it`이 잡는 것은 전부 다른 `it`이 이미 잡았고(합산 파괴는 첫째 `it`이, 진행 표시
   * 제거는 다른 5건이), **제목이 주장하는 축**(판정을 런 밖으로)은 못 잡았다. 그때 그 변조를
   * 유일하게 잡던 것은 취소를 재는 시나리오 6(`:1127`)의 우연이었다.
   *
   * 재지 않는 것: *"런 도중에 판정하지 않는다"*의 **시각적 구간**. `ScenarioModel`이 도구
   * 호출을 내지 않아 모든 런이 모델 호출 1회이므로 그 구간이 하네스 안에 존재하지 않는다.
   * 그 축까지 재려면 하네스가 여러 모델 호출을 내야 하고(승인 게이트가 얽힌다), 그 확장은
   * 2026-08-11 판정에서 채택하지 않았다.
   */
  it("자동 압축은 런이 끝난 뒤에 시작되고, 그동안 REPL은 idle로 돌아가지 않는다 (§3·§6)", async () => {
    writeConfig({ compactionAuto: true });
    const rig = createRig({
      // 같은 describe의 대본은 usage 형태도 같게 둔다 — 이 `it`은 화면 순서만 재므로
      // 판별력이 더해지지는 않지만, 한 시나리오 안에서 트리거 턴의 모양이 갈리면
      // 다음 사람이 그 차이에 의미가 있다고 읽는다.
      convo: [
        { text: "응답1", usage: { input: 10 } },
        { text: "응답2", usage: { input: 20 } },
        { text: "응답3", usage: HIGH_USAGE },
      ],
      summaries: [{ kind: "text", text: "요약" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    await turn(rig, app, "질문 1");
    await turn(rig, app, "질문 2");
    // ── 판별기 — 압축이 도는 동안의 REPL 입력 상태를 출력 쓰기 시점에 표본으로 모은다.
    const states = watchCompactionStates(rig, app);

    rig.input.write("질문 3\r");
    await waitFor(rig, "압축 완료");

    // 표본이 비어 있으면 아래 단정은 공허하다 — 성립 조건을 먼저 건다.
    expect(states.has("compacting")).toBe(true);
    // §6 — 압축 중에는 입력을 받지 않는다. 판정이 런 프로미스 밖에 있으면 `startRun`의
    // `finally`가 압축 도중에 이 상태를 놓고, 그 틈에 제출된 입력은 폐기될 Agent로 간다
    // (`wiring.ts`의 `[미규정 E-45]` 주석이 배제 근거로 적어 둔 바로 그 창이다).
    expect(states.has("idle-input")).toBe(false);

    // 압축 시작 표시가 그 런의 마지막 응답보다 **뒤에** 나온다. 순서만으로는 판정 시점을
    // 가르지 못하지만(위 주석), 표시 자체가 뒤집히는 회귀는 여기서 걸린다.
    const screen = rig.text();
    expect(screen.indexOf("응답3")).toBeLessThan(screen.indexOf("압축 중"));
    expect(screen.indexOf("압축 중")).toBeLessThan(screen.indexOf("압축 완료"));

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 2-b — 미지 모델의 보수 기본값이 실제 판정에 쓰인다
// ═══════════════════════════════════════════════════════════════════════════

/**
 * §8 R6은 *"미지 모델은 **보수 기본값**(200,000 — §10) + **기동 시 경고**"*로 두 조각이다.
 * 두 조각이 **같은 값**을 가리켜야 계약이 의미를 갖는다 — 경고가 200,000을 말하는데 판정이
 * 다른 값으로 돌면 사용자는 압축 시점을 틀린 근거로 이해하고(ARCHITECTURE §2.6 가시적 결과)
 * 보수 기본값 쪽 계약도 함께 깨진다.
 *
 * **왜 여기 있는가** (커버리지 구멍 C-W1, 2026-08-10 `/verify`): `wiring.contract.test.ts` W7은
 * `경고 문면 ↔ contextWindowForModel()` 한 변만 묶는다. 나머지 변(`조회값 → 압축 판정 입력`)을
 * 재는 유일한 단정은 시나리오 2의 화면 `창 …`인데 그 시나리오는 **기지 모델로만** 기동한다.
 * 그래서 `contextWindowTokens: known ? tokens : 512_000`처럼 **미지 경로에서만** 갈라놓는 변조가
 * CLI 테스트 432건을 전부 통과했다. 이 시나리오가 그 경로에 같은 단정을 놓는다.
 *
 * 기지 모델 쪽 3단(경고 없음 → 조회 → 판정)은 시나리오 2가 이미 본다. 여기는 미지 쪽만 잰다.
 *
 * **재지 못하는 것 — 경고 문면이 조회에서 오는가** (2026-08-10 C-X1 실행 중 실측). 경고의 수치를
 * 리터럴 `200,000`으로 바꿔도 이 단정은 통과한다. 미지 모델의 보수 기본값이 **정의상** 200,000이라
 * (§10 E-12) 리터럴과 조회값이 항상 같기 때문이다 — 판정 입력 쪽은 시나리오 2-c가 창이 다른 모델로
 * 닫았지만, 경고 쪽은 창이 다른 미지 모델이 존재할 수 없어 같은 수단이 없다. 닫으려면 E-12를
 * 바꿔야 하므로 **열어 둔다**. 여기를 넓게 읽지 말 것: 이 시나리오가 보장하는 것은
 * *"경고가 말한 값과 판정이 쓰는 값이 같다"*이지 *"둘 다 조회에서 왔다"*가 아니다.
 */
describe("시나리오 2-b — 미지 모델의 보수 기본값이 판정에 쓰인다 (COMPACTION §8 R6)", () => {
  /** 테이블에 없는 id. 접두가 기지 모델과 겹치지 않게 골랐다(조회는 접두 일치를 쓰지 않는다) */
  const UNKNOWN_MODEL = "qa-b/no-such-model";

  /**
   * 기대값을 구현 상수(`FALLBACK_CONTEXT_WINDOW_TOKENS`)에서 읽지 않는다 — 상수를 읽으면
   * "같은 값을 두 번 쓴다"만 확인된다. providers의 **공개 조회 함수**를 CLI의 화면 표시와
   * 교차시키는 것이 계약이다(§21.3의 원칙을 판정 입력 쪽으로 한 변 더 민 것).
   */
  const FALLBACK = contextWindowForModel(UNKNOWN_MODEL);

  /**
   * 임계 초과 입력을 **조회값에서 도출한다.** 수치를 박으면 보수 기본값이 조정될 때
   * (§6은 기본값 수치를 "조정 가능(세부)"로 분류한다) 이 시나리오가 계약과 무관하게 깨진다.
   * 기본 threshold 0.75이므로 0.9배는 넉넉히 넘고, 512,000 같은 더 큰 값으로 갈라지면 넘지 못한다.
   */
  const UNKNOWN_HIGH_INPUT = Math.ceil(FALLBACK.tokens * 0.9);

  it("경고가 말한 창으로 압축을 판정하고, 그 값이 화면에 나온다", async () => {
    // 전제 — 이 id가 실제로 미지다. 테이블에 추가되면 이 시나리오는 대상을 잃으므로 먼저 건다.
    expect(FALLBACK.known).toBe(false);

    writeConfig({ compactionAuto: true, model: UNKNOWN_MODEL });
    const rig = createRig({
      convo: [
        { text: "응답1", usage: { input: 10 } },
        { text: "응답2", usage: { input: 20 } },
        { text: "응답3", usage: { input: UNKNOWN_HIGH_INPUT } },
      ],
      summaries: [{ kind: "text", text: "미지 모델 압축 요약" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    // ── 기동 시 경고(§8 R6 후반). 여기서 말한 수치가 아래 판정과 같아야 한다.
    expect(rig.text()).toContain("컨텍스트 창을 모른다");
    expect(rig.text()).toContain(FALLBACK.tokens.toLocaleString("en-US"));

    await turn(rig, app, "질문 1");
    await turn(rig, app, "질문 2");
    // 임계 미달 구간 — 대조군. **나오지 않는다**를 재므로 시간을 준다(V-4).
    await settle();
    expect(rig.text()).not.toContain("압축 완료");

    rig.input.write("질문 3\r");
    await waitFor(rig, "압축 완료");

    // ── 판정이 실제로 그 창으로 돌았다(§8 R6 전반).
    //
    // 두 방향으로 걸린다. 판정 입력이 조회값보다 **커지면** 임계를 못 넘어 압축이 아예
    // 일어나지 않고(위 `waitFor`가 타임아웃), **다른 값이면** 화면의 창 수치가 갈린다.
    //
    // `창 …` 자체는 §6 표시 의무 4요소가 아니라 구현 재량의 부가 표시다 — 근거와 처분은
    // 시나리오 2의 같은 단정에 달아 둔 F-2 주석 참조.
    expect(rig.text()).toContain(`창 ${FALLBACK.tokens.toLocaleString("en-US")}`);
    expect(rig.model.summaryRequests).toHaveLength(1);

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 2-c — 창이 200,000이 아닌 기지 모델
// ═══════════════════════════════════════════════════════════════════════════

/**
 * §3은 `CompactionConfig.contextWindowTokens`를 *"providers가 제공(§8) — **CLI가 배선 시
 * 채운다**"*로 규정한다. 즉 판정 입력은 **그 모델의 조회값**이어야 한다.
 *
 * **왜 여기 있는가** (커버리지 구멍 C-X1, 2026-08-10 독립 `/verify`): 시나리오 2·2-b가
 * 값을 조회에서 도출하기는 하지만 **둘 다 200,000이다** — 기지 haiku 창과 미지 보수 기본값이
 * 같은 값이기 때문이다(E-12가 *"현행 최소 창과 같아 과대추정이 아니다"*를 근거로 고른 값이라
 * 이 일치는 설계상 필연이다). 그래서 `contextWindowTokens: 200_000`으로 **조회 결과를 통째로
 * 버리는** 변조가 CLI 433건과 예산 게이트를 전부 통과했다. `context-window.ts` 테이블은
 * 9항목 중 8항목이 1,000,000이므로, 무검사로 남아 있던 것은 실사용에서 지배적인 경로다.
 *
 * 이 시나리오가 재는 것은 *"두 표면이 서로 다른 값을 말하는가"*(시나리오 2-b의 축)가 아니라
 * **"판정·표시가 조회에서 값을 얻는가"**다. 그래서 창 값이 다른 모델 하나만 있으면 된다.
 */
describe("시나리오 2-c — 창이 다른 기지 모델도 조회값으로 판정한다 (COMPACTION §3)", () => {
  /** 테이블의 1M 세대. `MODEL_ID`(haiku 200,000)와 창이 다른 것이 이 시나리오의 전부다 */
  const WIDE_MODEL = "claude-opus-5";

  /** 기대값은 구현 상수가 아니라 providers의 공개 조회 함수에서 온다(§21.3과 같은 규율) */
  const WIDE = contextWindowForModel(WIDE_MODEL);

  /** 임계 초과 입력도 조회값에서 도출한다 — threshold 0.75이므로 0.9배는 넘는다 */
  const WIDE_HIGH_INPUT = Math.ceil(WIDE.tokens * 0.9);

  /**
   * 대조군 입력을 **두 실효 임계 사이**에 둔다 (F-1, 2026-08-10 독립 `/verify` 판정 1-a).
   *
   * 이 값이 없으면 이 시나리오는 *표시* 한 변만 잰다. 900,000은 올바른 창(1,000,000×0.75 =
   * 750,000)에서도 폐기된 창(200,000×0.75 = 150,000)에서도 똑같이 임계를 넘으므로
   * `waitFor("압축 완료")`의 판별력이 0이고, **판정 입력만** 200,000으로 바꾸는 변조가
   * 전 테스트를 통과했다(표시가 우연히 같은 필드를 읽어 변조 G만 잡혔던 것이다).
   *
   * 500,000은 750,000 아래이고 150,000 위다 — 정상 배선에서는 판정이 false이고, 조회를 버리면
   * 대조군 턴에서 **판정이** 앞당겨진다.
   *
   * **앞당겨진 판정이 실제 압축까지 가도록 대본을 4턴으로 둔다** (Y-1, 2026-08-11 독립 `/verify`
   * 재검증 커버리지 구멍). 3턴이던 시절에는 앞당겨지는 것이 판정뿐이었다 — 그 시점 user 턴이
   * 2개라 `keepRecentTurns=2`가 대화 전부를 덮어 `planCompaction`이 `not-possible`을 냈고,
   * 모델 호출도 `압축 완료` 표시도 없었다. 그래서 실제 판별기는 §7이 그 `not-possible`에 걸어
   * 둔 **자동 중지 안내** 하나였고, **판별력이 다른 문서의 규칙에 얹혀 있었다.**
   *
   * 실측이 그 의존의 형상을 특정했다 — 사라지는 조건은 2×2 중 한 칸뿐이었다:
   *
   * ```
   * 판정·표시 동시 폐기 + §7 정상 → red (자동중지)   판정만 폐기 + §7 정상 → red (자동중지)
   * 판정·표시 동시 폐기 + §7 완화 → red (표시 단정)   판정만 폐기 + §7 완화 → **green** ← 여기
   * ```
   *
   * §7을 완화하면 그 규칙의 전용 테스트 2건이 먼저 red가 되므로 완화 자체는 눈에 띈다. 문제는
   * 그 다음이다 — 완화를 의도한 사람이 자기 테스트를 갱신하고 나면 이 시나리오는 green인 채로
   * 판정 축 판별력을 잃는다. **대조군 앞에 user 턴을 하나 더 두면** 그 시점 user 턴이 3개가 되어
   * `toSummarize`가 비지 않고, 변조에서 **실제로 압축이 일어나** 대조군 첫 단정이 판별기가 된다.
   * §7 의존이 끊긴다. 대가는 시나리오가 한 턴 길어지는 것뿐이고, 같은 대가를 시나리오 2가
   * 이미 치렀다(`INVALID_TURN_INPUT`).
   */
  const WIDE_MID_INPUT = Math.ceil(WIDE.tokens * 0.5);

  it("1M 창 모델을 조회값으로 판정하고, 그 값이 화면에 나온다", async () => {
    // 전제 네 가지. 어느 하나라도 깨지면 이 시나리오는 대상이나 판별력을 잃으므로 먼저 건다.
    expect(WIDE.known).toBe(true);
    // 창이 기지 haiku와 **달라야** 조회 경유 여부가 관측된다 — 같아지면 C-X1이 되살아난다.
    expect(WIDE.tokens).not.toBe(contextWindowForModel(MODEL_ID).tokens);
    // 대조군이 두 임계 사이에 실제로 앉아 있는가. threshold 기본값이 조정되면(§6 "조정 가능")
    // 이 사이가 사라질 수 있고, 그때 판별력은 조용히가 아니라 red로 사라져야 한다.
    expect(WIDE_MID_INPUT).toBeLessThan(WIDE.tokens * DEFAULT_COMPACTION_THRESHOLD);
    expect(WIDE_MID_INPUT).toBeGreaterThan(CONTEXT_WINDOW * DEFAULT_COMPACTION_THRESHOLD);

    writeConfig({ compactionAuto: true, model: WIDE_MODEL });
    const rig = createRig({
      convo: [
        { text: "응답1", usage: { input: 10 } },
        // 채움 턴 — 대조군 시점의 user 턴을 `keepRecentTurns`보다 많게 만드는 것이 유일한 역할
        // 이다(Y-1). usage는 폐기된 창의 실효 임계(150,000)보다 **작아야** 한다 — 크면 변조 시
        // 판정이 이 턴에서 앞당겨져 대조군이 재는 자리가 위로 밀린다.
        { text: "응답2", usage: { input: 20 } },
        { text: "응답3", usage: { input: WIDE_MID_INPUT } },
        { text: "응답4", usage: { input: WIDE_HIGH_INPUT } },
      ],
      summaries: [{ kind: "text", text: "1M 모델 압축 요약" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    await turn(rig, app, "질문 1");
    await turn(rig, app, "질문 2");
    await turn(rig, app, "질문 3");
    // ── 대조군 — **판정 입력을 재는 자리다.** 500,000은 조회된 창의 임계(750,000) 아래이므로
    // 판정이 false여야 하고, 조회를 버린 창(150,000) 기준으로는 이미 넘는다.
    //
    // **판별기는 첫 단정이다** (Y-1, 2026-08-11). 판정 입력을 폐기하는 변조를 걸면 이 턴에서
    // 판정이 앞당겨지고, 아래 선단정이 보장하는 대로 `toSummarize`가 비지 않으므로 **실제로
    // 압축이 일어난다** — `압축 완료`가 화면에 나와 첫 단정이 발화한다. 셋째 단정(§7 자동 중지)은
    // 3턴 시절의 유일한 판별기였고 지금은 *압축이 일어나지 않는 다른 경로*를 위한 보조다.
    //
    // 셋 다 **나오지 않는다**를 재므로 시간을 준다(V-4) — 즉시 단정은 공허하다(`settle` 주석).
    //
    // 먼저 성립 조건을 건다 (§28.3 관례). 이 시점의 user 턴이 `keepRecentTurns`를 넘지 않으면
    // `planCompaction`이 `not-possible`을 내 변조에서도 압축이 일어나지 않고, 첫 단정은 판별력
    // 0인 채 통과한다 — **실패 양태가 red가 아니라 공허한 green이다.** 3턴 시절이 정확히 그
    // 상태였고(§7 규칙이 대신 잡고 있었다), 대본이 다시 짧아지면 여기서 red로 드러나야 한다.
    // 리터럴이 아니라 모델이 실제로 받은 트랜스크립트에서 센다 — 대본과 제출이 어긋나도 잡힌다.
    const atControl = rig.model.convoRequests.at(-1) as ModelRequest;
    const userTurnsAtControl = atControl.messages.filter((m) => m.role === "user").length;
    expect(userTurnsAtControl).toBeGreaterThan(DEFAULT_COMPACTION_KEEP_RECENT_TURNS);

    await settle();
    expect(rig.text()).not.toContain("압축 완료");
    expect(rig.model.summaryRequests).toHaveLength(0);
    expect(rig.text()).not.toContain("자동 압축을 중지한다");

    rig.input.write("질문 4\r");
    await waitFor(rig, "압축 완료");

    // 표시도 조회값이다. 단 `창 …`은 §6 표시 의무 4요소가 아니라 구현 재량의 부가 표시이므로
    // 표기가 바뀌면 이 단정도 따라 바뀐다 — 근거는 시나리오 2의 F-2 주석.
    //
    // **판정 측과 나눠서 읽을 것.** 이 단정이 잡는 것은 화면 수치 한 변이고, 판정 입력은 위
    // 대조군이 잡는다. 둘을 한 단정에 걸면 표시가 독립 조회로 바뀌는 리팩터 하나에 판별력이
    // 조용히 사라진다 — 실제로 그렇게 열려 있던 것이 F-1이다.
    //
    // 대가(2026-08-10 판정 1-a): 배선 값을 통째로 버리는 변조는 이 단정이 아니라 **대조군 쪽**이
    // 먼저 잡는다 — 판별력을 얻고 진단력을 내준 교환이었다(§23.3). 그 대가는 이후 두 번 줄었다:
    // 2026-08-10 T-002가 타임아웃을 AssertionError로 바꿨고(5,008ms → 14ms), Y-1이 대조군에서
    // 실제 압축을 일으키게 되면서 지금은 **15ms에 `:960`**에서 죽는다(2026-08-11 실측).
    //
    // **남은 한계**: 판정만 버리는 변조(M13)와 판정·표시를 함께 버리는 변조(M3)가 **같은 줄에서**
    // 죽는다. 화면만 보고 배선(`wiring.ts`)과 판정(`compact.ts`) 중 어디를 볼지는 여전히 못 고른다.
    expect(rig.text()).toContain(`창 ${WIDE.tokens.toLocaleString("en-US")}`);
    expect(rig.model.summaryRequests).toHaveLength(1);

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 3 — 재개 직후 판정
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 3 — 재개 직후 판정 (COMPACTION §3 판정 시점 b)", () => {
  it("임계 초과 세션을 --resume 하면 재개 직후 압축된다", async () => {
    // 1) 자동을 끈 채로 임계 초과 트랜스크립트를 만들어 두고 종료한다.
    writeConfig({ compactionAuto: false });
    const first = createRig({
      convo: [
        { text: "응답1", usage: { input: 10 } },
        { text: "응답2", usage: { input: 20 } },
        { text: "응답3", usage: { input: HIGH_INPUT } },
      ],
    });
    const app1 = await startCli(first.deps, first.args);
    const running1 = app1.run();
    const sessionId = app1.parts.session.id;
    await turn(first, app1, "질문 1");
    await turn(first, app1, "질문 2");
    await turn(first, app1, "질문 3");
    expect(first.text()).not.toContain("압축 완료");
    await app1.shutdown();
    await running1;
    first.cleanup();

    // 2) 자동을 켜고 재개한다 — 대화 입력 없이 재개만으로 압축이 일어나야 한다.
    writeConfig({ compactionAuto: true });
    const second = createRig({
      resume: sessionId.slice(0, 8),
      convo: [{ text: "재개 후 응답", usage: { input: HIGH_INPUT } }],
      summaries: [{ kind: "text", text: "재개 직후 요약" }],
    });
    const app2 = await startCli(second.deps, second.args);
    const running2 = app2.run();

    await waitFor(second, "압축 완료");
    // 대화 호출은 0이다 — 압축은 사용자 입력 없이 재개만으로 일어났다.
    expect(second.model.convoRequests).toHaveLength(0);
    expect(second.model.summaryRequests).toHaveLength(1);

    const childId = app2.parts.session.id;
    expect(childId).not.toBe(sessionId);
    expect(second.sessionRows().find((row) => row.id === childId)?.parent_session_id).toBe(
      sessionId,
    );

    await app2.shutdown();
    await running2;
    second.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 4 — not-possible
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 4 — not-possible (COMPACTION §4 · §7 자동 중지)", () => {
  it("user 턴이 K 이하면 모델 호출 0 + 자동 중지 + 안내 1회", async () => {
    writeConfig({ compactionAuto: true, compactionKeepRecentTurns: 2 });
    const rig = createRig({
      // 2번째 턴에서 이미 임계를 넘긴다 — 판정은 참인데 계획은 불가능한 상태.
      convo: [
        { text: "응답1", usage: { input: 10 } },
        { text: "응답2", usage: { input: HIGH_INPUT } },
      ],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();
    const sessionId = app.parts.session.id;

    await turn(rig, app, "질문 1");
    rig.input.write("질문 2\r");
    await waitFor(rig, "자동 압축을 중지한다");

    // **모델 호출 0** — 계획이 순수 함수라 여기까지 비용이 없다(§4)
    expect(rig.model.summaryRequests).toHaveLength(0);
    // 대안 안내가 함께 나간다(§7)
    expect(rig.text()).toContain("/compact");
    expect(rig.text()).toContain("/new");
    // 세션은 바뀌지 않았다
    expect(app.parts.session.id).toBe(sessionId);

    // ── 2회째 idle에서 안내가 반복되지 않는다(§7 스팸 금지)
    const before = occurrences(rig.text(), "자동 압축을 중지한다");
    expect(before).toBe(1);
    await turn(rig, app, "질문 3");
    await settle();
    expect(occurrences(rig.text(), "자동 압축을 중지한다")).toBe(1);
    expect(rig.model.summaryRequests).toHaveLength(0);

    await app.shutdown();
    await running;
    rig.cleanup();
  });

  /**
   * **E-47 기판정**: 수동 `/compact`의 `not-possible`은 자동 중지를 건드리지 않는다.
   * `/compact`는 사용자가 지금 한 번 시도한 것이고, 그 결과로 자동 설정이 바뀌면
   * 사용자가 하지 않은 변경이 일어난다.
   */
  it("수동 /compact의 not-possible은 자동을 중지시키지 않는다 (E-47)", async () => {
    writeConfig({ compactionAuto: true, compactionKeepRecentTurns: 2 });
    const rig = createRig({
      // 임계 미달로 두어 자동이 스스로 발동하지 않게 한다 — 수동만 관측한다.
      convo: [
        { text: "응답1", usage: { input: 10 } },
        { text: "응답2", usage: { input: 20 } },
        { text: "응답3", usage: { input: HIGH_INPUT } },
      ],
      summaries: [{ kind: "text", text: "나중 요약" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    await turn(rig, app, "질문 1");

    // user 턴 1개 — 유지 기준 2턴에 미달이라 not-possible이다.
    rig.input.write("/compact\r");
    await waitFor(rig, "압축할 수 없다");
    expect(rig.model.summaryRequests).toHaveLength(0);
    // 자동 중지 안내가 나가지 않았다 — 수동은 자동 상태를 건드리지 않는다.
    expect(rig.text()).not.toContain("자동 압축을 중지한다");

    // 자동이 살아 있다는 것을 결과로 보인다: 턴을 쌓아 임계를 넘기면 압축된다.
    await turn(rig, app, "질문 2");
    rig.input.write("질문 3\r");
    await waitFor(rig, "압축 완료");
    expect(rig.model.summaryRequests).toHaveLength(1);

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 5 — 요약 실패
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 5 — 요약 실패 (COMPACTION §5 · §7)", () => {
  it("max_tokens 실패 → 구 세션 무손상 + 경고 + 런 비중단 / 연속 2회 → 자동 중지 / 수동 성공 → 자동 재개", async () => {
    writeConfig({ compactionAuto: true });
    const rig = createRig({
      convo: [
        { text: "응답1", usage: { input: 10 } },
        { text: "응답2", usage: { input: 20 } },
        { text: "응답3", usage: { input: HIGH_INPUT } },
      ],
      summaries: [
        // §5: `max_tokens`는 잘린 요약이고, 잘린 요약의 채택은 침묵 유실이다.
        { kind: "stop", stopReason: "max_tokens", text: "잘린 요약" },
        { kind: "stop", stopReason: "max_tokens", text: "잘린 요약" },
        { kind: "text", text: "드디어 성공한 요약" },
      ],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();
    const sessionId = app.parts.session.id;

    await turn(rig, app, "질문 1");
    await turn(rig, app, "질문 2");

    // ── 1회째 실패
    rig.input.write("질문 3\r");
    await waitFor(rig, "압축에 실패했다");
    expect(rig.text()).toContain("대화는 그대로다");
    // 구 세션 무손상 — 세션이 바뀌지 않았고 새 세션도 생기지 않았다
    expect(app.parts.session.id).toBe(sessionId);
    expect(rig.sessionRows()).toHaveLength(1);
    // 런은 죽지 않았다(§7) — 저장 실패와 달리 대화가 계속된다
    const rowsAfterFailure = rig.messageRows(sessionId);
    expect(rowsAfterFailure).toHaveLength(6);
    expect(rig.text()).not.toContain("자동 압축을 중지한다");

    // ── 2회째 실패 → 연속 2회 → 자동 중지
    await turn(rig, app, "질문 4");
    await waitFor(rig, "자동 압축을 중지한다");
    expect(occurrences(rig.text(), "압축에 실패했다")).toBe(2);
    expect(rig.sessionRows()).toHaveLength(1);

    // ── 자동이 중지됐다: 다음 idle에서는 요약 호출이 늘지 않는다
    const summaryCallsAtStop = rig.model.summaryRequests.length;
    expect(summaryCallsAtStop).toBe(2);
    await turn(rig, app, "질문 5");
    await settle();
    expect(rig.model.summaryRequests).toHaveLength(summaryCallsAtStop);

    // ── 수동 /compact는 중지 상태에서도 시도할 수 있고, 성공하면 자동이 재개된다(§7)
    rig.input.write("/compact\r");
    await waitFor(rig, "압축 완료");
    const childId = app.parts.session.id;
    expect(childId).not.toBe(sessionId);

    // 자동 재개의 증거 — 새 세션에서 턴을 쌓으면 자동 압축이 다시 일어난다.
    await turn(rig, app, "질문 6");
    rig.input.write("질문 7\r");
    await waitForCount(rig, "압축 완료", 2);
    expect(app.parts.session.id).not.toBe(childId);

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 6 — Ctrl+C 취소
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 6 — Ctrl+C 취소 (COMPACTION §6 · A-1 · E-46 · R-3)", () => {
  it("압축 중 Ctrl+C → 요약 호출에 signal이 닿고 구 세션이 그대로 유지된다", async () => {
    writeConfig({ compactionAuto: false });
    const rig = createRig({
      convo: [{ text: "응답" }],
      summaries: [{ kind: "hang" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();
    const sessionId = app.parts.session.id;

    for (let index = 1; index <= 3; index += 1) {
      await turn(rig, app, `질문 ${index}`);
    }
    const rowsBefore = rig.messageRows(sessionId);

    rig.input.write("/compact\r");
    await waitFor(rig, "압축 중");
    expect(app.parts.repl.state).toBe("compacting");

    rig.input.write("\x03");
    await waitFor(rig, "압축을 취소했다");

    // 구 세션 그대로 — 새 세션도, 행 변화도 없다
    expect(app.parts.session.id).toBe(sessionId);
    expect(rig.sessionRows()).toHaveLength(1);
    expect(rig.messageRows(sessionId)).toEqual(rowsBefore);
    expect(rig.text()).toContain("대화는 그대로다");
    expect(app.parts.repl.state).not.toBe("compacting");

    await app.shutdown();
    await running;
    rig.cleanup();
  });

  /**
   * **E-46 기판정**: 압축 중 제출은 **거부 표시 + 히스토리 보존**이다. 조용히 삼키면
   * 사용자는 제출된 줄 알고 답을 기다린다(ARCHITECTURE §2.6).
   */
  it("압축 중 제출은 거부를 표시하고 대화로 가지 않는다 (E-46)", async () => {
    writeConfig({ compactionAuto: false });
    const rig = createRig({ convo: [{ text: "응답" }], summaries: [{ kind: "hang" }] });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    for (let index = 1; index <= 3; index += 1) {
      await turn(rig, app, `질문 ${index}`);
    }
    const convoCallsBefore = rig.model.convoRequests.length;

    rig.input.write("/compact\r");
    await waitFor(rig, "압축 중");

    rig.input.write("압축 중에 친 문장\r");
    await waitFor(rig, "압축 중에는 입력을 받지 않는다");
    await settle();
    // 거부된 줄은 모델에 닿지 않는다
    expect(rig.model.convoRequests).toHaveLength(convoCallsBefore);

    rig.input.write("\x03");
    await waitFor(rig, "압축을 취소했다");

    await app.shutdown();
    await running;
    rig.cleanup();
  });

  /**
   * **A-1 기판정**: 사용자 취소는 연속 실패 카운트에 넣지 않는다. 취소 2회 뒤에도
   * 자동이 살아 있어야 한다 — 꺼지면 사용자가 하지 않은 설정 변경이 일어난다.
   */
  it("취소 2회 뒤에도 자동 압축이 살아 있다 (A-1)", async () => {
    writeConfig({ compactionAuto: true });
    const rig = createRig({
      convo: [
        { text: "응답1", usage: { input: 10 } },
        { text: "응답2", usage: { input: 20 } },
        { text: "응답3", usage: { input: HIGH_INPUT } },
      ],
      summaries: [{ kind: "hang" }, { kind: "hang" }, { kind: "text", text: "세 번째는 성공" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    await turn(rig, app, "질문 1");
    await turn(rig, app, "질문 2");

    // 자동 압축 1회째 — 취소
    rig.input.write("질문 3\r");
    await waitFor(rig, "압축 중");
    rig.input.write("\x03");
    await waitFor(rig, "압축을 취소했다");
    expect(occurrences(rig.text(), "압축을 취소했다")).toBe(1);

    // 자동 압축 2회째 — 취소. **자동 중지 안내가 나오면 위반이다**
    await turn(rig, app, "질문 4");
    await waitForCount(rig, "압축 중", 2);
    rig.input.write("\x03");
    await waitForCount(rig, "압축을 취소했다", 2);
    expect(rig.text()).not.toContain("자동 압축을 중지한다");
    // 취소는 실패가 아니다 — 실패 표시도 나가지 않는다
    expect(rig.text()).not.toContain("압축에 실패했다");

    // 3회째는 성공한다 — 자동이 살아 있었다는 결과로서의 증거
    await turn(rig, app, "질문 5");
    await waitFor(rig, "압축 완료");

    await app.shutdown();
    await running;
    rig.cleanup();
  });

  /**
   * **R-3 회귀** — 압축 중 Ctrl+C는 **요약 호출만** 끊는다. 타이핑하던 버퍼는 취소
   * 대상이 아니다(`input.ts` `onSigint`). 부분 입력을 남긴 채 취소한 뒤 개행만
   * 보내면 그 문장이 그대로 제출돼야 한다.
   */
  it("압축 중 Ctrl+C가 타이핑하던 입력을 지우지 않는다 (R-3)", async () => {
    writeConfig({ compactionAuto: false });
    const rig = createRig({ convo: [{ text: "응답" }], summaries: [{ kind: "hang" }] });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    for (let index = 1; index <= 3; index += 1) {
      await turn(rig, app, `질문 ${index}`);
    }

    rig.input.write("/compact\r");
    await waitFor(rig, "압축 중");

    // 개행 없이 부분 입력만 남긴다
    rig.input.write("살아남아야 하는 문장");
    await settle();
    rig.input.write("\x03");
    await waitFor(rig, "압축을 취소했다");

    // 개행만 보내면 지워지지 않은 버퍼가 그대로 제출된다
    const callsBefore = rig.model.convoRequests.length;
    rig.input.write("\r");
    await waitUntil(
      () => rig.model.convoRequests.length > callsBefore,
      "취소 뒤 남아 있던 입력이 제출되지 않았다",
    );
    await app.parts.agent.waitForIdle();

    const lastRequest = rig.model.convoRequests.at(-1);
    const lastUser = lastRequest?.messages.filter((message) => message.role === "user").at(-1);
    expect(lastUser?.role === "user" && bodyOfUser(lastUser)).toContain("살아남아야 하는 문장");

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

function bodyOfUser(message: AgentMessage): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 7 — 반복 압축
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 7 — 반복 압축 (COMPACTION §5 previousSummary · §2 체인)", () => {
  it("자식 세션 재압축 → 이전 요약이 프롬프트에 실리고 toSummarize에서는 빠진다", async () => {
    writeConfig({ compactionAuto: false });
    const firstSummary = "일차요약고유표지";
    const rig = createRig({
      convo: [{ text: "응답" }],
      summaries: [
        { kind: "text", text: firstSummary },
        { kind: "text", text: "이차 요약" },
      ],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();
    const parentId = app.parts.session.id;

    for (let index = 1; index <= 4; index += 1) {
      await turn(rig, app, `질문 ${index}`);
    }
    rig.input.write("/compact\r");
    await waitFor(rig, "압축 완료");
    const childId = app.parts.session.id;

    // 1차 요약 요청에는 이전 요약이 없다
    const firstRequest = rig.model.summaryRequests[0];
    expect(bodyOfUser(firstRequest?.messages[0] as AgentMessage)).not.toContain(
      "<previous-summary>",
    );

    // 자식에서 턴을 더 쌓고 다시 압축한다
    for (let index = 5; index <= 7; index += 1) {
      await turn(rig, app, `질문 ${index}`);
    }
    rig.input.write("/compact\r");
    await waitForCount(rig, "압축 완료", 2);
    const grandchildId = app.parts.session.id;

    const secondText = bodyOfUser(rig.model.summaryRequests[1]?.messages[0] as AgentMessage);
    // ── previousSummary가 프롬프트에 실린다(§5 "보존 + 갱신")
    expect(secondText).toContain("<previous-summary>");
    expect(secondText).toContain(firstSummary);
    // ── 그리고 **toSummarize에서는 빠진다** — 이중 반영이면 표지가 2회 나온다
    expect(occurrences(secondText, firstSummary)).toBe(1);
    const transcriptSection = secondText.slice(secondText.indexOf("<transcript>"));
    expect(transcriptSection).not.toContain(firstSummary);

    // ── 체인: 손자의 부모는 자식이다
    const rows = rig.sessionRows();
    expect(rows.find((row) => row.id === grandchildId)?.parent_session_id).toBe(childId);
    expect(rows.find((row) => row.id === childId)?.parent_session_id).toBe(parentId);

    // ── 중간(자식)도 superseded라 목록에서 빠진다
    rig.clear();
    rig.input.write("/sessions\r");
    await waitFor(rig, grandchildId.slice(0, 8));
    await settle();
    expect(rig.text()).not.toContain(parentId.slice(0, 8));
    expect(rig.text()).not.toContain(childId.slice(0, 8));

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 8 — v1 → v2 마이그레이션 경유 재개
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 동결된 v1 DDL — T-011(`packages/store/test/schema-v2.contract.test.ts`)의
 * `SCHEMA_V1_FROZEN`과 같은 원본(2026-08-06 `src/schema.sql.ts`)의 복사본이다.
 *
 * **`src`에서 임포트하지 않는 이유는 T-011과 같다**: v2가 들어온 지금 현행 코드로는
 * v1 DB를 만들 수 없고, 만들 수 있더라도 구현이 손대면 픽스처가 조용히 따라 바뀐다.
 * T-011 파일에서 임포트하지 않는 이유는 별개다 — `*.test.ts`를 임포트하면 그 파일의
 * 케이스가 이 패키지에서도 수집돼 두 번 돈다.
 */
const SCHEMA_V1_FROZEN = `
CREATE TABLE schema_version (
  version    INTEGER NOT NULL,
  applied_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
  id                TEXT    PRIMARY KEY,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  title             TEXT,
  workspace_root    TEXT    NOT NULL,
  system_prompt     TEXT    NOT NULL,
  model             TEXT    NOT NULL,
  parent_session_id TEXT    REFERENCES sessions(id),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE TABLE messages (
  id         TEXT    PRIMARY KEY,
  session_id TEXT    NOT NULL REFERENCES sessions(id),
  seq        INTEGER NOT NULL,
  role       TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE UNIQUE INDEX messages_session_seq   ON messages(session_id, seq);
CREATE INDEX        messages_session_order ON messages(session_id, active, seq);
CREATE INDEX        sessions_recent        ON sessions(active, updated_at DESC);
`;

const V1_SESSION_ID = "aaaa1111-0000-4000-8000-000000000001";

/** v1 시절의 DB를 손으로 만든다 — 저장소 코드를 전혀 지나지 않는다 */
function createV1Database(turns: number, lastInput: number): void {
  const db = new DatabaseSync(join(home, ".neo-agent", "sessions.db"));
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA_V1_FROZEN);
    db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (1, 1000)").run();
    db.prepare(
      `INSERT INTO sessions
         (id, created_at, updated_at, title, workspace_root, system_prompt, model, parent_session_id, active)
       VALUES (?, 1000, 2000, ?, ?, ?, ?, NULL, 1)`,
    ).run(
      V1_SESSION_ID,
      "v1 시절 대화",
      realpathSync(workspace),
      buildSystemPrompt(realpathSync(workspace)),
      MODEL_ID,
    );

    const insert = db.prepare(
      `INSERT INTO messages (id, session_id, seq, role, timestamp, body, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );

    let seq = 0;
    for (let index = 1; index <= turns; index += 1) {
      const user: AgentMessage = {
        id: `v1-u${index}`,
        role: "user",
        content: [{ type: "text", text: `v1 질문 ${index}` }],
        timestamp: 1000 + index,
      };
      seq += 1;
      insert.run(user.id, V1_SESSION_ID, seq, user.role, user.timestamp, JSON.stringify(user));

      const assistant: AgentMessage = {
        id: `v1-a${index}`,
        role: "assistant",
        content: [{ type: "text", text: `v1 응답 ${index}` }],
        stopReason: "end_turn",
        usage: {
          ...ZERO_USAGE,
          input: index === turns ? lastInput : 10,
        },
        timestamp: 1500 + index,
      };
      seq += 1;
      insert.run(
        assistant.id,
        V1_SESSION_ID,
        seq,
        assistant.role,
        assistant.timestamp,
        JSON.stringify(assistant),
      );
    }
  } finally {
    db.close();
  }
}

describe("시나리오 8 — v1 → v2 마이그레이션 경유 재개 (SESSION-STORE §2)", () => {
  it("v1 실데이터 DB로 기동 → 마이그레이션 → 기존 세션 재개 → 대화 1턴 정상", async () => {
    writeConfig({ compactionAuto: false });
    createV1Database(3, 10);

    const rig = createRig({
      resume: V1_SESSION_ID.slice(0, 8),
      convo: [{ text: "v2에서의 응답" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    // 재개된 세션이 v1 시절 그 세션이고, 트랜스크립트가 그대로다
    expect(app.parts.session.id).toBe(V1_SESSION_ID);
    const resumed = app.parts.agent.state.messages;
    expect(resumed.map((message) => message.id)).toEqual([
      "v1-u1",
      "v1-a1",
      "v1-u2",
      "v1-a2",
      "v1-u3",
      "v1-a3",
    ]);

    // 마이그레이션이 실제로 일어났다 — PK가 (session_id, id)로 바뀌었다
    const probe = new DatabaseSync(join(home, ".neo-agent", "sessions.db"));
    try {
      const info = probe.prepare("PRAGMA table_info(messages)").all() as {
        name: string;
        pk: number;
      }[];
      expect(
        info
          .filter((row) => row.pk > 0)
          .map((row) => row.name)
          .sort(),
      ).toEqual(["id", "session_id"]);
    } finally {
      probe.close();
    }

    // 대화 1턴이 정상 동작하고 seq가 이어진다
    await turn(rig, app, "v2 질문");
    const rows = rig.messageRows(V1_SESSION_ID);
    expect(rows.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.at(-1)?.role).toBe("assistant");

    await app.shutdown();
    await running;
    rig.cleanup();
  });

  it("마이그레이션된 v1 세션도 압축된다 — 분기가 v2 PK 위에서 성립한다", async () => {
    writeConfig({ compactionAuto: true });
    createV1Database(3, HIGH_INPUT);

    const rig = createRig({
      resume: V1_SESSION_ID.slice(0, 8),
      convo: [{ text: "응답" }],
      summaries: [{ kind: "text", text: "v1 세션의 요약" }],
    });
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    await waitFor(rig, "압축 완료");

    const childId = app.parts.session.id;
    expect(childId).not.toBe(V1_SESSION_ID);
    expect(rig.sessionRows().find((row) => row.id === childId)?.parent_session_id).toBe(
      V1_SESSION_ID,
    );
    // 유지 메시지가 **같은 id로** 두 세션에 존재한다 — v2 PK의 존재 이유
    const childRows = rig.messageRows(childId);
    expect(childRows.map((row) => row.id).slice(1)).toEqual(["v1-u2", "v1-a2", "v1-u3", "v1-a3"]);

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 추가 — R-5 대형 트랜스크립트 스모크
// ═══════════════════════════════════════════════════════════════════════════

describe("추가(R-5) — 대형 트랜스크립트에서의 판정 비용 스모크", () => {
  /**
   * **엄밀한 벤치마크가 아니다.** 재는 것은 "메시지 수백 건에서 판정이 체감 지연을
   * 만드는가"이고, 상한을 넉넉히 잡아 머신 속도 차이로 흔들리지 않게 한다. 실패하면
   * 그것은 알고리즘이 트랜스크립트 길이에 대해 병적으로 나쁘다는 신호다.
   */
  it("메시지 600건 세션의 재개 + 자동 압축이 상한 안에서 끝난다", async () => {
    writeConfig({ compactionAuto: true });
    createV1Database(300, HIGH_INPUT); // user/assistant 각 300 = 600건

    const rig = createRig({
      resume: V1_SESSION_ID.slice(0, 8),
      convo: [{ text: "응답" }],
      summaries: [{ kind: "text", text: "대형 세션 요약" }],
    });

    const started = Date.now();
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();
    await waitFor(rig, "압축 완료", 20_000);
    const elapsed = Date.now() - started;

    expect(app.parts.agent.state.messages).toHaveLength(5); // [요약, kept 4]
    // 상한은 관대하다 — 판정이 O(n)을 넘지 않는다는 것만 본다.
    expect(elapsed).toBeLessThan(10_000);

    await app.shutdown();
    await running;
    rig.cleanup();
  }, 30_000);
});

/* ═══════════════════════════════════════════════════════════════════════════
 * [미규정 B-n] 판정 요청 — T-012에서 새로 드러난 것 (B-12부터)
 *
 * 보고는 유실될 수 있으므로 여기에 남긴다. 아래는 **테스트로 어느 쪽도 강제하지
 * 않았다** — 기대값이 정본에 없기 때문이고, 지금 현재 동작을 기술해 두면 그것이
 * 사후적으로 계약이 되어 버린다. B-1~B-11은 `packages/store/test/`의 두 파일에 있다.
 *
 * ── B-12: 재개 직후 압축이 **방금 그린 트랜스크립트를 즉시 폐기한다** ──────────
 *   `wiring.ts`의 `run()`은 재개 트랜스크립트를 전부 렌더한 뒤 `compaction.auto()`를
 *   부른다(주석의 근거: "어느 대화에 접속했는지를 먼저 보고 나서 압축 사실을 봐야
 *   순서가 읽힌다"). 그런데 재개 직후 판정이 참이면 **그 대화는 그 자리에서 자식
 *   세션으로 대체된다** — 사용자는 화면을 가득 채운 과거 대화를 본 직후 "새 세션으로
 *   이어간다"를 본다. R-5 스모크(메시지 600건)에서 실제로 600건을 그린 뒤 압축이
 *   일어났다. COMPACTION §3·§6은 판정 시점과 표시 의무만 정하고 **트랜스크립트 렌더와
 *   압축의 선후**를 정하지 않는다. 선택지: (a) 현행 유지, (b) 판정을 먼저 하고 압축될
 *   대화는 그리지 않는다, (c) 재개 시에는 요약만 그린다. 판정 요청.
 *
 * ── B-13: v1 → v2 마이그레이션이 **완전히 침묵한다** ────────────────────────
 *   실측(2026-08-06, 임시 probe로 확인 후 삭제): v1 DB로 기동하면 스키마가 재생성
 *   복사되지만 화면에 어떤 표시도 없다. 나온 것은 권한 경고와 평소의 시작 배너뿐이다.
 *   `SESSION-STORE.md` §2는 마이그레이션 **규율**(앞으로만·한 트랜잭션·상위 버전 거부)만
 *   정하고 표시 의무를 정하지 않으며, §6·§7이 표시를 요구하는 것은 권한과 손상뿐이다.
 *   그러나 마이그레이션은 **되돌릴 수 없는 변경**이고(다운그레이드 경로를 만들지
 *   않는다가 규율), 침묵 금지(ARCHITECTURE §2.6)의 방향과 견주면 판정이 필요하다.
 *   위 시나리오 8은 **결과**(데이터 보존·재개 성공)만 단정하고 표시 유무는 보지 않는다.
 *
 * ── B-14: 취소가 연속 실패 **streak을 끊는가** ──────────────────────────────
 *   A-1이 "취소는 실패 카운트에 넣지 않는다"를 정했고 구현도 그렇다(`compact.ts`의
 *   abort 분기는 `consecutiveFailures`를 건드리지 않고 return한다). 그런데 **리셋도
 *   하지 않으므로** 실패 → 취소 → 실패는 "연속 2회"가 되어 자동이 중지된다. §7의
 *   "연속 2회 실패" 사이에 사용자 취소가 끼었을 때 그것이 연속인지 아닌지는 정해지지
 *   않았다. A-1이 세운 원칙("사용자가 하지 않은 설정 변경을 만들지 않는다")은 리셋
 *   쪽을 가리키는 것처럼 보이나, 취소가 streak을 지우면 실패가 지속되는 상황에서
 *   사용자가 한 번 취소할 때마다 스래싱이 되살아난다. 위 A-1 테스트는 **취소만 2회**인
 *   경우만 단정하고 실패-취소-실패는 건드리지 않았다. 판정 요청.
 * ═══════════════════════════════════════════════════════════════════════════ */
