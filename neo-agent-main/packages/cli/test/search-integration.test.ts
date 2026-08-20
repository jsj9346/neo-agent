/**
 * `/search` 통합 시나리오 — T-008 (QA-B).
 *
 * **실물을 조립해 끝에서 끝까지 돌린다.** `startCli`가 조립하는 그대로 — 실제 SQLite
 * 저장소(스키마 v3·FTS 색인), 실제 설정 로더, 실제 압축 컨트롤러, 실제 REPL 상태
 * 머신, 실제 검색 렌더러다. 모의는 둘뿐이다: 모델과 터미널 스트림.
 *
 * 부품별 계약은 `search.contract.test.ts`(cli 27건)와 QA-A의 store 계약이 이미 봤다.
 * 여기서 재는 것은 **합쳤을 때 성립하는가**이며, 특히 계약 테스트가 구조적으로 잴 수
 * 없는 것 하나를 잰다: **화면에 뜬 접두 문자열이 실제로 `/resume`에 먹히는가.**
 * 계약 테스트는 store를 대역으로 갈아 끼우므로 "표시된 id가 진짜 재개 가능한 세션인가"를
 * 증명할 수 없다 — 그 증명은 실 저장소 위에서만 나온다.
 *
 * 기대값의 출처는 정본 문서뿐이다:
 *   - `docs/SEARCH.md` §1(표시 전용)·§3(색인 대상·분기 복사)·§4(범위 판정: superseded
 *     부모 포함·soft-delete 제외·같은 id 1회 / 리터럴 질의 / LIKE 폴백)·§5(CLI 표시)
 *   - `docs/CLI-INTERFACE.md` §5(`/search` 등록·인자)·§6(재개·삭제)·§8(입력 상태)
 *   - `docs/SESSION-STORE.md` §5(superseded 제외·soft-delete)
 *   - `docs/COMPACTION.md` §2(분기 모델 — 메시지 동일성 보존)
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 미규정 B 계열(B-14부터)에 모았다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PassThrough } from "node:stream";
import type {
  AssistantMessage,
  ModelAssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  TokenUsage,
} from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliArgs } from "../src/args.ts";
import { API_KEY_ENV } from "../src/credentials.ts";
import { type CliApp, type CliDeps, startCli } from "../src/wiring.ts";
import { dockerAvailable } from "./probe-docker.ts";

const MODEL_ID = "claude-haiku-4-5-20251001";
const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
/** 요약 전용 시스템 프롬프트의 지문 — 요약 호출 판별의 교차 확인용 */
const SUMMARY_PROMPT_MARK = "context-compaction summarizer";

// ───────────────────────────────────────────────────────────────────────────
// 모의 모델 — 대화 호출과 요약 호출을 갈라 재생한다
// ───────────────────────────────────────────────────────────────────────────

/**
 * `CORE-INTERFACE.md` §8의 계약만 지킨다: throw/reject하지 않고, `done.message`에
 * id가 없으며, `usage`가 항상 실린다.
 *
 * 대화/요약 판별을 `tools`로 하고 시스템 프롬프트로 **교차 확인**한다 — 판별이 조용히
 * 틀리면 시나리오 전체가 무의미해지므로, 어긋나면 그 자리에서 던진다.
 */
class ScenarioModel implements ModelClient {
  readonly modelId = MODEL_ID;
  readonly convoRequests: ModelRequest[] = [];
  #convoCursor = 0;
  readonly #replies: readonly string[];
  readonly #summary: string;

  constructor(replies: readonly string[], summary = "여기까지의 요약이다") {
    this.#replies = replies.length > 0 ? [...replies] : ["응답"];
    this.#summary = summary;
  }

  async *stream(request: ModelRequest, _signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const looksLikeSummary = request.tools.length === 0;
    const hasSummaryPrompt = request.systemPrompt.includes(SUMMARY_PROMPT_MARK);
    if (looksLikeSummary !== hasSummaryPrompt) {
      throw new Error(
        "[하네스 판별 실패] tools 비어 있음과 요약 시스템 프롬프트가 어긋난다 — " +
          `tools=${request.tools.length}, 요약 프롬프트=${hasSummaryPrompt}.`,
      );
    }

    const text = looksLikeSummary
      ? this.#summary
      : (this.#replies[Math.min(this.#convoCursor, this.#replies.length - 1)] as string);
    if (!looksLikeSummary) {
      this.convoRequests.push(structuredClone(request) as ModelRequest);
      this.#convoCursor += 1;
    }

    const content: AssistantMessage["content"] = [{ type: "text", text }];
    yield { type: "text_delta", text };
    yield {
      type: "done",
      message: {
        role: "assistant",
        content,
        stopReason: "end_turn",
        usage: { ...ZERO_USAGE },
        timestamp: Date.now(),
      } satisfies ModelAssistantMessage,
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 리그
// ───────────────────────────────────────────────────────────────────────────

let sandbox: string;
let home: string;
let workspace: string;

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-search-int-")));
  home = join(sandbox, "home");
  workspace = join(sandbox, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  mkdirSync(workspace, { recursive: true });
  // 자동 압축을 꺼서 수동 경로만 남긴다 — 두 경로가 섞이면 무엇이 압축을 일으켰는지
  // 구분되지 않는다.
  writeFileSync(
    join(home, ".neo-agent", "config.json"),
    JSON.stringify({ model: MODEL_ID, approvalMode: "off", compactionAuto: false }),
    { mode: 0o600 },
  );
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
  return text.replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "");
}

interface Rig {
  deps: CliDeps;
  args: CliArgs;
  input: PassThrough;
  model: ScenarioModel;
  text(): string;
  clear(): void;
  sessionRows(): { id: string; parent_session_id: string | null; active: number }[];
  ftsRows(messageId: string): number;
  cleanup(): void;
}

function createRig(replies: readonly string[] = ["응답"]): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 100;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const model = new ScenarioModel(replies);
  let admin: DatabaseSync | undefined;
  const db = (): DatabaseSync => {
    admin ??= new DatabaseSync(join(home, ".neo-agent", "sessions.db"));
    return admin;
  };

  return {
    deps: {
      argv: [],
      env: { [API_KEY_ENV]: "sk-ant-테스트" },
      cwd: workspace,
      home,
      io: { input, output },
      version: "0.0.0-qab",
      // Docker 판정은 명시 주입이다 — 생략하면 실제 `docker version`이 스폰되고
      // 이 스위트의 결과가 테스트 머신 상태에 좌우된다(`./probe-docker.ts`).
      factories: { createModelClient: () => model, probeDocker: dockerAvailable() },
    },
    args: { kind: "run" },
    input,
    model,
    text: () => stripAnsi(chunks.join("")),
    clear: () => void chunks.splice(0, chunks.length),
    sessionRows: () =>
      db()
        .prepare("SELECT id, parent_session_id, active FROM sessions ORDER BY created_at, id")
        .all() as { id: string; parent_session_id: string | null; active: number }[],
    // API를 우회해 FTS 행을 직접 센다 — "같은 id가 부모·자식 양쪽에 색인된다"(§3)와
    // "검색 결과에는 1회"(§4)가 다른 층의 사실임을 시나리오 3이 구분해 보이기 위해.
    ftsRows: (messageId) =>
      (
        db()
          .prepare("SELECT COUNT(*) AS n FROM messages_fts WHERE message_id = ?")
          .get(messageId) as { n: number }
      ).n,
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

/** 어떤 표시가 **나오지 않는다**를 재려면 시간을 줘야 한다 — 즉시 단정은 공허하다 */
async function settle(rounds = 60): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

async function waitFor(rig: Rig, needle: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (rig.text().includes(needle)) return;
    await tick();
  }
  throw new Error(`"${needle}"가 화면에 나타나지 않았다. 지금까지의 출력:\n${rig.text()}`);
}

async function waitUntil(predicate: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`${what} — ${timeoutMs}ms 안에 일어나지 않았다.`);
}

/**
 * 한 턴을 제출하고 그 런이 끝날 때까지 기다린다.
 *
 * 화면 문구가 아니라 **모델 호출 수의 증가**를 기다린다 — 대본이 같은 문구를 반복하면
 * 앞선 턴이 남긴 글자에 `waitFor`가 즉시 통과하고, 그 뒤의 `waitForIdle()`이 런이
 * 시작되기도 전에 resolve한다(압축 시나리오에서 실측된 공허한 초록불).
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

/** `/search`를 돌리고 그 출력만 돌려준다 */
async function search(rig: Rig, query: string): Promise<string> {
  rig.clear();
  rig.input.write(`/search ${query}\r`);
  // 결과 있음("검색 결과 N건")과 없음("검색 결과가 없다")이 같은 접두를 공유한다.
  await waitFor(rig, "검색 결과");
  await settle(10);
  return rig.text();
}

/**
 * 검색 결과 화면에서 **표시된 세션 접두**를 뽑는다.
 *
 * 계산하지 않고 **화면에서 읽는다** — 이 시나리오가 증명하려는 것이 "화면에 뜬 그
 * 문자열이 실제로 재개 가능한가"이므로, 기대값을 코드로 계산해 넣으면 증명이 사라진다.
 * hit 첫 줄의 형태(`  <접두>  <시각>  <title>`)에서 접두만 취하되 접두 길이·시각
 * 형식에 과결합하지 않게 느슨히 읽는다.
 */
function displayedPrefixes(screen: string): string[] {
  return [...screen.matchAll(/^\s+([0-9a-f]{4,})\s+\d{4}-\d{2}-\d{2}/gm)].map(
    (found) => found[1] as string,
  );
}

/** hit 한 건의 표시 5요소가 다 있는가 — 시나리오 5의 "형식 동일" 판정에 쓴다 */
function hitShape(screen: string): {
  prefixes: string[];
  hasTime: boolean;
  hasRole: boolean;
  hasResumeHint: boolean;
} {
  return {
    prefixes: displayedPrefixes(screen),
    hasTime: /\d{4}-\d{2}-\d{2}/.test(screen),
    hasRole: /사용자|어시스턴트/.test(screen),
    hasResumeHint: screen.includes("/resume"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 1 — 전 구간 관통: 저장 → 검색 → 표시된 접두로 실제 재개
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 1 — 저장 → /search → 표시된 접두로 /resume 성공 (SEARCH §5)", () => {
  it("검색 화면의 접두를 그대로 /resume에 먹이면 그 대화로 돌아간다", async () => {
    // 어시스턴트 응답에는 질의어를 넣지 않는다 — 넣으면 같은 세션이 user·assistant
    // 두 hit으로 잡혀(색인 대상이 두 역할이므로 정상) 접두 추출이 2건이 되고,
    // 이 시나리오가 재려는 "한 대화 → 한 접두 → 재개"가 흐려진다.
    const rig = createRig(["10월이 좋다"]);
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    // ── 세션 A에 고유한 내용을 남긴다
    const sessionA = app.parts.session.id;
    await turn(rig, app, "한라산 등반 계획을 세우자");

    // ── 다른 세션으로 옮긴다. "과거 대화를 검색해 찾아간다"가 이 명령의 용도이므로
    //    현재 세션을 검색해 현재 세션으로 돌아오는 것은 시나리오가 아니다.
    rig.input.write("/new\r");
    await waitUntil(() => app.parts.session.id !== sessionA, "/new가 세션을 바꾸지 않았다");
    const sessionB = app.parts.session.id;
    expect(sessionB).not.toBe(sessionA);

    // ── 검색
    const screen = await search(rig, "한라산");
    expect(screen, "검색이 저장된 대화를 찾지 못했다").toContain("검색 결과 1건");

    const prefixes = displayedPrefixes(screen);
    expect(prefixes, `화면에서 세션 접두를 읽지 못했다. 출력:\n${screen}`).toHaveLength(1);
    const shown = prefixes[0] as string;

    // 표시된 것은 매치가 난 세션(=A)의 접두다. 여기서는 압축이 없어 A가 곧 체인 tip이다.
    expect(sessionA.startsWith(shown), `표시된 접두 ${shown}가 세션 A의 접두가 아니다`).toBe(true);

    // ── **핵심**: 화면의 그 문자열을 그대로 /resume에 먹인다
    rig.clear();
    rig.input.write(`/resume ${shown}\r`);
    await waitUntil(
      () => app.parts.session.id === sessionA,
      `표시된 접두 "${shown}"로 /resume이 성공하지 않았다. 출력:\n${rig.text()}`,
    );

    // ── 재개된 대화가 실제로 그 대화다 — 과거 메시지가 화면에 복원된다
    expect(rig.text()).toContain("한라산 등반 계획을 세우자");

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 2 — 압축 후 부모 원문 검색 → tip(자식) 접두 표시
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 2 — superseded 부모의 매치가 tip 접두로 표시된다 (SEARCH §4·§5)", () => {
  it("부모에만 남은 텍스트를 찾고, 표시·재개는 자식(tip)으로 간다", async () => {
    const rig = createRig(["알겠다"]);
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    const parentId = app.parts.session.id;
    // 유지 기준(2턴)보다 많이 쌓아야 앞쪽 턴이 부모에만 남는다.
    await turn(rig, app, "고유단어알파를 기억해줘");
    for (const text of ["둘째 질문", "셋째 질문", "넷째 질문"]) {
      await turn(rig, app, text);
    }

    rig.input.write("/compact\r");
    await waitFor(rig, "압축 완료");
    const childId = app.parts.session.id;
    expect(childId, "압축이 새 세션을 열지 않았다").not.toBe(parentId);
    expect(rig.sessionRows().find((row) => row.id === childId)?.parent_session_id).toBe(parentId);

    // ── 첫 턴 텍스트는 부모에만 있다 (cut 대상이었다)
    const childRows = new DatabaseSync(join(home, ".neo-agent", "sessions.db"))
      .prepare("SELECT body FROM messages WHERE session_id = ?")
      .all(childId) as { body: string }[];
    const inChild = childRows.some((row) => row.body.includes("고유단어알파"));
    expect(
      inChild,
      "전제가 깨졌다 — 첫 턴이 자식에도 복사됐다면 이 시나리오는 부모를 재지 못한다",
    ).toBe(false);

    // ── 검색: 부모의 원문이 잡힌다 (superseded 부모 포함 — §4)
    const screen = await search(rig, "고유단어알파");
    expect(screen, "압축된 부모의 원문을 찾지 못했다 — 압축할수록 검색이 비게 된다").toContain(
      "검색 결과 1건",
    );

    const shown = displayedPrefixes(screen)[0] as string;
    expect(shown, "화면에서 접두를 읽지 못했다").toBeDefined();

    // ── 표시는 **tip(자식)** 접두다. 부모 접두면 `/resume`이 거부해 막다른 길이다.
    expect(childId.startsWith(shown), `표시된 접두 ${shown}가 자식(tip)의 것이 아니다`).toBe(true);
    expect(parentId.startsWith(shown), `부모 접두가 표시됐다 — /resume이 거부한다`).toBe(false);

    // ── 매치가 부모에서 났다는 사실은 표시하지 않는다 (§5)
    expect(screen).not.toMatch(/superseded|부모 세션/i);

    // ── 표시된 접두가 실제로 재개된다
    rig.input.write("/new\r");
    await waitUntil(() => app.parts.session.id !== childId, "/new가 세션을 바꾸지 않았다");
    rig.clear();
    rig.input.write(`/resume ${shown}\r`);
    await waitUntil(
      () => app.parts.session.id === childId,
      `표시된 tip 접두 "${shown}"로 재개하지 못했다. 출력:\n${rig.text()}`,
    );

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 3 — kept 복사된 메시지는 결과에 1회
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 3 — 같은 id의 메시지가 결과에 한 번만 나온다 (SEARCH §3·§4)", () => {
  it("부모·자식 양쪽에 색인돼 있어도 검색 결과는 1건이다", async () => {
    const rig = createRig(["알겠다"]);
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    const parentId = app.parts.session.id;
    await turn(rig, app, "첫 질문");
    await turn(rig, app, "둘째 질문");
    await turn(rig, app, "셋째 질문");
    // 마지막 user 턴은 유지(kept) 대상이라 부모·자식 양쪽에 같은 id로 존재하게 된다.
    await turn(rig, app, "고유단어베타를 남긴다");

    rig.input.write("/compact\r");
    await waitFor(rig, "압축 완료");
    const childId = app.parts.session.id;

    // ── 전제: 같은 id의 메시지 행이 부모·자식 양쪽에 있다 (COMPACTION §2 동일성 보존)
    const rows = new DatabaseSync(join(home, ".neo-agent", "sessions.db"))
      .prepare("SELECT id, session_id FROM messages WHERE body LIKE '%고유단어베타%'")
      .all() as { id: string; session_id: string }[];
    expect(rows.length, "전제가 깨졌다 — kept 복사가 일어나지 않았다").toBe(2);
    expect(new Set(rows.map((row) => row.id)).size, "복사본이 다른 id를 받았다").toBe(1);
    expect(new Set(rows.map((row) => row.session_id))).toEqual(new Set([parentId, childId]));

    // ── 색인도 양쪽에 있다 (§3 — 색인 대칭. dedupe는 색인이 아니라 검색의 책임)
    const messageId = rows[0]?.id as string;
    expect(rig.ftsRows(messageId), "FTS 행이 부모·자식 양쪽에 있어야 한다").toBe(2);

    // ── 그런데 검색 결과는 1건이다 (§4)
    const screen = await search(rig, "고유단어베타");
    expect(screen, "같은 메시지가 중복 표시됐다").toContain("검색 결과 1건");
    expect(displayedPrefixes(screen)).toHaveLength(1);

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 4 — /delete 후 그 체인 전체가 검색에서 빠진다
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 4 — soft-delete된 체인은 검색에서 빠진다 (SEARCH §4, SESSION-STORE §5)", () => {
  it("삭제 전에는 잡히고 삭제 후에는 부모까지 통째로 사라진다", async () => {
    const rig = createRig(["알겠다"]);
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    const parentId = app.parts.session.id;
    await turn(rig, app, "고유단어감마를 기억해줘");
    for (const text of ["둘째 질문", "셋째 질문", "넷째 질문"]) {
      await turn(rig, app, text);
    }
    rig.input.write("/compact\r");
    await waitFor(rig, "압축 완료");
    const childId = app.parts.session.id;

    // ── 삭제 전: 부모 원문이 잡힌다
    expect(await search(rig, "고유단어감마")).toContain("검색 결과 1건");

    // ── tip을 삭제한다. `/delete`는 확인 1회를 요구한다(CLI-INTERFACE §6).
    rig.input.write("/new\r");
    await waitUntil(() => app.parts.session.id !== childId, "/new가 세션을 바꾸지 않았다");
    rig.clear();
    rig.input.write(`/delete ${childId.slice(0, 8)}\r`);
    await waitFor(rig, "삭제하시겠나");
    rig.input.write("y");
    await waitFor(rig, "삭제했다");

    expect(rig.sessionRows().find((row) => row.id === childId)?.active).toBe(0);

    // ── 삭제 후: 체인 전체가 빠진다. **부모는 목록 밖 행이라 사용자가 개별 삭제할 수
    //    없으므로, 체인의 가시성은 tip의 active가 대표한다**(§4).
    const after = await search(rig, "고유단어감마");
    expect(
      after,
      "삭제한 대화가 검색에 다시 나타났다 — /delete의 가시적 결과와 모순된다",
    ).toContain("검색 결과가 없다");
    expect(after).not.toContain(parentId.slice(0, 8));
    expect(after).not.toContain(childId.slice(0, 8));

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 5 — 2자 한국어 질의(LIKE 폴백)의 표시 형식이 FTS 경로와 같다
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 5 — 2자 질의도 같은 검색이다 (SEARCH §4)", () => {
  it("LIKE 폴백 경로가 매치하고, 표시 형식이 FTS 경로와 구분되지 않는다", async () => {
    const rig = createRig(["압축은 세션 분기로 구현돼 있다"]);
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    await turn(rig, app, "압축 설정을 어떻게 바꾸나?");

    // ── 2자 질의 — trigram은 3자 미만을 매치할 수 없으므로 폴백만이 이것을 찾는다
    const twoChar = await search(rig, "압축");
    expect(twoChar, "2자 한국어 질의가 아무것도 찾지 못했다 — 폴백이 요구사항이다").toMatch(
      /검색 결과 \d+건/,
    );

    // ── 3자 질의 — FTS 경로
    const threeChar = await search(rig, "압축은");
    expect(threeChar).toMatch(/검색 결과 \d+건/);

    // ── **폴백 여부는 결과에 표시되지 않는다**(§4). 두 화면의 형태가 같아야 한다.
    const two = hitShape(twoChar);
    const three = hitShape(threeChar);
    expect(two.prefixes.length).toBeGreaterThan(0);
    expect(three.prefixes.length).toBeGreaterThan(0);
    expect(two.hasTime).toBe(three.hasTime);
    expect(two.hasRole).toBe(three.hasRole);
    expect(two.hasResumeHint).toBe(three.hasResumeHint);
    for (const screen of [twoChar, threeChar]) {
      expect(screen).not.toMatch(/LIKE|폴백|fallback|trigram/i);
    }

    // ── 매치 구간 강조가 두 경로 모두에 있다. 마커는 CLI가 색상으로 소비하므로
    //    제어문자로 새면 안 된다(§4 — CLI가 색상으로 치환한다).
    for (const screen of [twoChar, threeChar]) {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 마커 누출 탐지가 목적이다
      expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F]/.test(screen)).toBe(false);
    }

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 6 — FTS5 문법 문자가 든 질의
// ═══════════════════════════════════════════════════════════════════════════

describe("시나리오 6 — 어떤 입력도 쿼리 문법 에러를 내지 않는다 (SEARCH §4)", () => {
  it("문법 문자 질의가 에러 없이 리터럴로 처리된다", async () => {
    const rig = createRig(["연산자는 a* AND (b) 형태로 쓴다"]);
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    await turn(rig, app, "검색 문법이 궁금하다");

    // 매치가 없는 것과 에러가 나는 것은 다르다 — 전자는 정상, 후자는 위반이다.
    for (const query of ['a* AND (b) "c" NEAR/2', "*", '"', "((((", "100%", "under_score"]) {
      const screen = await search(rig, query);
      expect(screen, `질의 ${query}가 결과 표시로 끝나지 않았다`).toMatch(
        /검색 결과 \d+건|검색 결과가 없다/,
      );
      expect(screen, `질의 ${query}가 실패로 표시됐다`).not.toMatch(/실패|syntax error|malformed/i);
    }

    // ── 리터럴 매치가 실제로 되는지도 본다. 무에러만 보면 "항상 0건"인 구현이 통과한다.
    const literal = await search(rig, "a* AND (b)");
    expect(literal, "문법 문자를 포함한 리터럴이 매치되지 않았다").toContain("검색 결과 1건");

    // ── REPL이 살아 있다
    rig.clear();
    await turn(rig, app, "이어서 대화가 되나?");
    expect(rig.model.convoRequests.length).toBeGreaterThan(1);

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 관측 — 판정 요청의 근거 (위반 단정이 아니다)
// ═══════════════════════════════════════════════════════════════════════════

describe("관측 — 한 대화가 여러 hit으로 나온다 [미규정 B-14]", () => {
  /**
   * 시나리오 1을 짜다가 드러난 동작이다. 질의어가 user 메시지와 assistant 응답에
   * 모두 있으면 **같은 대화가 hit 2건**으로 나오고, hit 첫 줄(접두·시각·title)이
   * 글자 그대로 반복된다.
   *
   * **위반은 아니다** — §4의 dedupe는 "같은 **id**의 메시지는 1회"이지 "한 대화는
   * 1회"가 아니고, §5의 표시 단위도 hit이다. 색인 대상이 두 역할이므로 매치가 둘인
   * 것도 정상이다. 그래서 이 테스트는 **동작을 기록만** 하고 어느 쪽도 옳다고
   * 단정하지 않는다. 판정 근거로 남기는 것이 목적이다.
   */
  it("질의어가 양쪽 역할에 있으면 같은 접두·title이 반복 표시된다", async () => {
    const rig = createRig(["한라산은 10월이 좋다"]);
    const app = await startCli(rig.deps, rig.args);
    const running = app.run();

    const sessionA = app.parts.session.id;
    await turn(rig, app, "한라산 등반 계획을 세우자");

    const screen = await search(rig, "한라산");

    // 같은 대화인데 hit이 2건이고, 접두가 두 번 나온다.
    expect(screen).toContain("검색 결과 2건");
    const prefixes = displayedPrefixes(screen);
    expect(prefixes).toHaveLength(2);
    expect(new Set(prefixes).size, "두 hit이 같은 세션을 가리킨다").toBe(1);
    expect(sessionA.startsWith(prefixes[0] as string)).toBe(true);

    // 두 hit의 role이 갈리는 것이 유일한 구분 정보다.
    expect(screen).toContain("사용자");
    expect(screen).toContain("어시스턴트");

    await app.shutdown();
    await running;
    rig.cleanup();
  });
});

/* ============================================================================
 * 미규정 B 계열 판정 요청 목록 — T-008 통합 (QA-B)
 *
 * B-1~B-10은 `search.contract.test.ts` 말미, B-11~B-13은
 * `plans/20260807-search-quality-report.md` §8에 있다. 여기는 B-14부터다.
 *
 * ─ B-14. 한 대화가 여러 hit으로 나오고 접두·title이 반복된다
 *   질의어가 user·assistant 양쪽에 있으면 같은 세션이 hit 2건이 되고, hit 첫 줄
 *   (접두·시각·title)이 글자 그대로 반복된다. 긴 대화에서 한 세션이 limit 20을
 *   전부 차지할 수도 있다.
 *   → **위반 아님.** §4의 dedupe는 "같은 id의 메시지는 1회"이지 "한 대화는 1회"가
 *      아니고, §5의 표시 단위도 hit이다. 임의 판정하지 않고 동작만 기록했다
 *      (위 "관측" 테스트).
 *   → QA 의견: 지금은 손대지 않는 쪽. "어느 메시지가 걸렸나"가 검색의 답이므로
 *      메시지 단위 hit이 맞고, 세션 단위로 접으면 스니펫을 무엇으로 고를지가 새
 *      문제가 된다. 다만 **반복되는 첫 줄을 접는 표시**(같은 세션이 연속되면 두 번째
 *      hit부터 접두·title 생략)는 계약을 건드리지 않는 순수 표시 개선이라 값이 싸다.
 *      실사용에서 목록이 지저분하다고 느껴질 때 하면 된다.
 * ========================================================================== */
