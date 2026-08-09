/**
 * `/search` 명령 계약 — T-007 (QA-B). **구현 선행 테스트다.**
 *
 * 기대값의 출처는 정본 문서뿐이다. 구현(T-006)은 이 파일이 작성된 시점에 존재하지
 * 않으므로 구현을 보고 쓴 기대값은 하나도 없다:
 *   - `docs/SEARCH.md` §1(경계 — CLI는 표시 전용)·§4(store 표면 `searchMessages`·
 *     `SearchHit`)·§5(CLI `/search` 명령)
 *   - `docs/CLI-INTERFACE.md` §5(명령 레지스트리 — 2026-08-07 `/search` 반영분)·
 *     §7(렌더링 가시성)·§8(입력 상태 머신 — `/search`는 상태를 추가하지 않는다)
 *   - `docs/ARCHITECTURE.md` §2.6(침묵 실패 금지)
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 `[미규정 B-n]`(B-1부터)에 모았다.
 *
 * ── 두 층에서 잰다
 *
 * 1. **레지스트리 층** (`src/registry.ts` 정적 임포트 — 파일이 이미 존재한다):
 *    등록·`/help` 파생·자동완성 파생·인자 규칙·빈 질의·실패 처리, 그리고 이 파일에서
 *    가장 중요한 **표시 전용 계약**(모델로 가는 경로가 불리지 않는다).
 * 2. **배선 층** (`startCli` 실물 조립 + `openStore` 팩토리로 `searchMessages`만 대역):
 *    질의가 store까지 쪼개지지 않고 도달하는가, 표시 5요소가 화면에 나오는가,
 *    부모 접두가 새지 않는가, 실패가 REPL을 죽이지 않는가, 입력 상태가 그대로인가.
 *
 * `src/search.ts`의 렌더 함수를 직접 부르지 않는 이유: 함수 이름(`formatSearchResults`)은
 * 배치 스케치의 권장안일 뿐 계약이 아니다. 같은 계약을 배선 층의 화면 출력으로 재면
 * 이름에 결합하지 않고도 결과를 잰다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  type OpenSessionStoreOptions,
  openSessionStore,
  type SessionStore,
  SNIPPET_MARK_END,
  SNIPPET_MARK_START,
} from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliArgs } from "../src/args.ts";
import { API_KEY_ENV } from "../src/credentials.ts";
import { dispatchSlashCommand, findSlashCommand, SLASH_COMMANDS } from "../src/registry.ts";
import { type CliApp, type CliDeps, startCli } from "../src/wiring.ts";
import { ScenarioModel, stripAnsi } from "./integration-harness.ts";
import { dockerAvailable } from "./probe-docker.ts";

// ───────────────────────────────────────────────────────────────────────────
// 문서에서 그대로 옮긴 상수
// ───────────────────────────────────────────────────────────────────────────

/**
 * `CLI-INTERFACE.md` §5 MVP 명령 집합 — 2026-08-07 `/search` 개정 반영분.
 *
 * 이 목록은 `registry.contract.test.ts`·`commands.test.ts`에도 7종으로 하드코딩돼
 * 있다(개정 전 문면). 두 파일은 T-006 시점에 8종으로 갱신돼야 한다 — 최종 보고의
 * 지적 사항이다.
 */
const MVP_COMMANDS = [
  "/help",
  "/sessions",
  "/resume",
  "/new",
  "/delete",
  "/search",
  "/compact",
  "/exit",
] as const;

/** `contextWindowForModel`이 아는 모델 — 배선이 압축 판정에서 경고를 내지 않게 한다 */
const MODEL_ID = "claude-haiku-4-5-20251001";

// ───────────────────────────────────────────────────────────────────────────
// 층 1 — 레지스트리 계약 (CLI-INTERFACE §5)
// ───────────────────────────────────────────────────────────────────────────

/** 접근·호출 경로를 전부 기록하는 재귀 프록시 — ctx 형태를 모른 채 부작용만 관찰한다 */
function deepSpy(log: { path: string; args: unknown[] }[], path = "ctx"): unknown {
  const target = (): undefined => undefined;
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === "toString") return () => `[spy ${path}]`;
      if (prop === "then") return undefined; // await 시 thenable로 오인되지 않게
      return deepSpy(log, `${path}.${String(prop)}`);
    },
    apply(_t, _thisArg, args) {
      log.push({ path, args });
      return deepSpy(log, `${path}()`);
    },
    has: () => true,
  });
}

function loggedText(log: { path: string; args: unknown[] }[]): string {
  return log.map((entry) => entry.args.map((arg) => String(arg)).join(" ")).join("\n");
}

/** 출력 싱크와 동작 스파이를 가진 최소 ctx */
function createContext(overrides: Record<string, unknown> = {}): {
  ctx: unknown;
  written: string[];
  calls: { name: string; args: unknown[] }[];
} {
  const written: string[] = [];
  const calls: { name: string; args: unknown[] }[] = [];
  const spy =
    (name: string) =>
    async (...args: unknown[]): Promise<void> => {
      calls.push({ name, args });
    };
  const actions: Record<string, unknown> = {
    listSessions: spy("listSessions"),
    resumeSession: spy("resumeSession"),
    newSession: spy("newSession"),
    deleteSession: spy("deleteSession"),
    // `CliActions.search` — SEARCH §5의 명령이 부를 동작. T-006이 추가한다.
    search: spy("search"),
    compact: spy("compact"),
    exit: spy("exit"),
    ...overrides,
  };
  return {
    ctx: {
      out: {
        write(text: string): void {
          written.push(text);
        },
      },
      actions,
    },
    written,
    calls,
  };
}

/** 타입 표면이 아직 `search`를 모르므로 호출부에서 좁힌다 — 계약은 결과로 잰다 */
function dispatch(line: string, ctx: unknown): Promise<void> {
  return dispatchSlashCommand(line, ctx as Parameters<typeof dispatchSlashCommand>[1]);
}

/**
 * **공허한 초록불 방지 장치.**
 *
 * `/search`가 등록돼 있지 않으면 디스패처는 "알 수 없는 명령"을 쓰고 끝난다 — 그
 * 결과는 이 파일의 부정형 단정(모델로 안 갔다·동작이 안 불렸다·매달리지 않았다)을
 * **전부 만족시킨다.** 즉 명령이 없을 때 통과하는 테스트는 명령이 잘못 구현됐을 때도
 * 통과할 수 있다. 각 테스트가 "명령이 실제로 실행됐다"를 먼저 확인하게 한다.
 */
function requireRegistered(): void {
  expect(
    findSlashCommand("/search"),
    "/search가 레지스트리에 없다 — 이 단정은 명령이 실행돼야 의미가 있다",
  ).toBeDefined();
}

describe("/search — 레지스트리 등록 (CLI-INTERFACE §5)", () => {
  it("MVP 명령 집합에 /search가 있고 목록은 8종으로 닫혀 있다", () => {
    // 근거: §5 표 "| `/search <질의>` | 과거 대화 전문 검색 — 결과는 **표시 전용** |",
    //       "MVP 명령 집합 (닫힌 목록 — 추가는 이 문서 개정)"
    const names = SLASH_COMMANDS.map((command) => command.name);
    expect(names).toContain("/search");
    expect([...names].sort()).toEqual([...MVP_COMMANDS].sort());
  });

  it("argsLabel이 질의 인자를 표기한다", () => {
    // 근거: §5 "`/search <질의>`" — `/compact`(인자 없음)와 달리 인자를 받는 명령이다.
    // 라벨이 없으면 `/help`가 "인자 없는 명령"으로 보여 사용자가 질의를 못 붙인다.
    const search = SLASH_COMMANDS.find((command) => command.name === "/search");
    expect(search).toBeDefined();
    expect(search?.argsLabel).toBeDefined();
    expect(search?.argsLabel ?? "").toContain("질의");
    expect((search?.description ?? "").length).toBeGreaterThan(0);
  });
});

describe("/search — 파생 표면은 별도 구현 0이 정상 (CLI-INTERFACE §5·§8)", () => {
  it("/help 출력에 /search가 이름·인자라벨·설명과 함께 나온다", async () => {
    // 근거: §5 "디스패치·/help 출력·탭 자동완성이 전부 이 테이블에서 파생된다"
    const search = SLASH_COMMANDS.find((command) => command.name === "/search");
    const log: { path: string; args: unknown[] }[] = [];
    await dispatch("/help", deepSpy(log));
    const text = stripAnsi(loggedText(log));

    expect(text).toContain("/search");
    expect(text).toContain(search?.argsLabel ?? "질의");
    expect(text).toContain(search?.description ?? "");
  });

  it("탭 자동완성이 /s·/se·/sea에 /search를 후보로 낸다", async () => {
    // 근거: §8 "탭 자동완성은 슬래시 명령에만 동작한다(레지스트리 파생)"
    // 정적 임포트로 잡으면 T-006 이전에도 이름이 이미 있으므로 그대로 쓴다.
    const { completeSlashCommand } = await import("../src/registry.ts");
    expect(completeSlashCommand("/s")).toContain("/search");
    expect(completeSlashCommand("/se")).toContain("/search");
    expect(completeSlashCommand("/sea")).toEqual(["/search"]);
    // 인자 자리는 완성하지 않는다(기존 계약) — 질의를 완성하려 들면 저장소를 알게 된다
    expect(completeSlashCommand("/search 압축")).toEqual([]);
  });
});

describe("/search — 인자 규칙: 첫 공백 뒤 전부가 한 질의다 (CLI-INTERFACE §5)", () => {
  it("공백을 포함한 질의가 쪼개지지 않고 하나로 전달된다", async () => {
    // 근거: §5 "**`/search`의 인자는 첫 공백 뒤 전부다** — 질의에 공백이 포함되므로
    //       토큰 분리를 하지 않는다", SEARCH §5 "질의 문자열 (공백 포함 — 첫 토큰 이후 전부)"
    const { ctx, calls } = createContext();
    await dispatch("/search 압축 설정 어떻게", ctx);

    const searchCalls = calls.filter((call) => call.name === "search");
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]?.args).toHaveLength(1);
    expect(searchCalls[0]?.args[0]).toBe("압축 설정 어떻게");
  });

  it("질의 안의 연속 공백은 보존되고 앞뒤 공백만 정리된다", async () => {
    // [미규정 B-1] 앞뒤 공백의 처리는 문서에 없다. 기존 인자 명령(`/resume`·`/delete`)이
    // 전부 trim하는 관례를 따라 "앞뒤는 정리, 안쪽은 보존"으로 읽었다. 안쪽 보존은
    // 계약("토큰 분리를 하지 않는다")에서 직접 나온다 — 안쪽까지 정규화하면 그것이
    // 토큰 분리 후 재결합이다.
    const { ctx, calls } = createContext();
    await dispatch("/search    압축  설정   ", ctx);

    const received = calls.find((call) => call.name === "search")?.args[0];
    expect(received).toBe("압축  설정");
  });

  it("FTS5 문법 문자가 든 질의도 그대로 전달된다 — CLI가 해석하지 않는다", async () => {
    // 근거: SEARCH §4 "질의는 항상 리터럴이다 — FTS5 쿼리 문법을 노출하지 않는다".
    // 인용·이스케이프는 store의 책임이므로 CLI는 원문을 손대지 않아야 한다.
    const { ctx, calls } = createContext();
    const query = 'a* AND (b) "c" NEAR/2';
    await dispatch(`/search ${query}`, ctx);

    expect(calls.find((call) => call.name === "search")?.args[0]).toBe(query);
  });
});

describe("/search — 빈 질의는 사용법 에러 (CLI-INTERFACE §5, ARCHITECTURE §2.6)", () => {
  it("/search 단독은 동작을 부르지 않고 안내를 표시한다", async () => {
    requireRegistered();
    // 근거: §5 "빈 질의는 사용법 에러(닫힌 목록 밖 argv와 같은 근거 — 오타의 침묵
    //       무시 차단)", SEARCH §5 표 "빈 질의 | 사용법 에러"
    const { ctx, written, calls } = createContext();
    await dispatch("/search", ctx);

    expect(calls.filter((call) => call.name === "search")).toHaveLength(0);
    const text = stripAnsi(written.join(""));
    expect(text.trim(), "빈 질의가 조용히 무시됐다").not.toBe("");
    expect(text).toContain("/search");
  });

  it("공백만 있는 질의도 같은 사용법 에러다", async () => {
    requireRegistered();
    const { ctx, written, calls } = createContext();
    await dispatch("/search    ", ctx);

    expect(calls.filter((call) => call.name === "search")).toHaveLength(0);
    expect(stripAnsi(written.join("")).trim()).not.toBe("");
  });

  it("빈 질의가 대화로 흘러가지 않는다", async () => {
    requireRegistered();
    // 오타의 침묵 무시 차단과 같은 근거의 반대편 — 사용법 에러가 모델 전송이 되면 안 된다.
    const log: { path: string; args: unknown[] }[] = [];
    await dispatch("/search", deepSpy(log));

    const modelPaths = log
      .map((entry) => entry.path)
      .filter((path) => /prompt|steer|followUp|send|submit/i.test(path));
    expect(modelPaths).toEqual([]);
  });
});

describe("/search — 표시 전용 계약 (SEARCH §1 불변)", () => {
  /**
   * **이 파일에서 가장 중요한 테스트다.**
   *
   * SEARCH §1: "검색 결과는 **표시 전용**이며 모델 컨텍스트에 들어가지 않는다 —
   * 컨텍스트 예산·프롬프트 캐시(§2.4) 무영향." §5도 같다: "검색 결과가 모델
   * 컨텍스트로 들어가는 경로는 없다."
   *
   * 관측 방법: ctx 전체를 기록 프록시로 넘겨 **불린 경로 전부**를 본다. 모델로 가는
   * 이름(prompt·steer·followUp·send·submit)이 하나라도 불렸으면 위반이다. 프록시는
   * 형태를 모르는 채로도 모든 접근을 허용하므로, 구현이 어떤 경로를 쓰든 기록된다.
   */
  it("/search 실행이 prompt()·steer() 등 모델 전송 경로를 부르지 않는다", async () => {
    requireRegistered();
    const log: { path: string; args: unknown[] }[] = [];
    await dispatch("/search 압축 설정", deepSpy(log));

    const called = log.map((entry) => entry.path);
    const modelPaths = called.filter((path) =>
      /prompt|steer|followUp|send|submit|append|agent/i.test(path),
    );
    expect(modelPaths, `모델·에이전트 경로가 불렸다: ${modelPaths.join(", ")}`).toEqual([]);
  });

  it("불린 동작은 actions.search 하나뿐이다", async () => {
    // 다른 동작(`newSession`·`compact` 등)이 섞이면 그것도 대화·저장에 영향을 준다.
    const { ctx, calls } = createContext();
    await dispatch("/search 압축 설정", ctx);

    expect(calls.map((call) => call.name)).toEqual(["search"]);
  });

  it("디스패치가 추가 입력 없이 동기 완료된다 (CLI-INTERFACE §8)", async () => {
    requireRegistered();
    // 근거: §8 "**`/search`는 상태를 추가하지 않는다** — 읽기 전용 조회라 `idle-input`에서
    //       디스패치되고 동기 완료된다". 승인 프롬프트처럼 입력 소유권을 넘겨받는 명령은
    //       입력을 주기 전까지 settle하지 않는다 — /search는 그러면 안 된다.
    const { ctx } = createContext();
    const marker = Symbol("pending");
    const settled = await Promise.race([
      dispatch("/search 압축", ctx).then(() => "settled"),
      new Promise((resolve) => setTimeout(() => resolve(marker), 50)),
    ]);
    expect(settled, "/search가 입력을 기다리며 매달렸다").toBe("settled");
  });
});

describe("/search — 실패 처리 (SEARCH §5·§6)", () => {
  it("검색 실패가 에러 표시로 끝나고 REPL을 죽이지 않는다", async () => {
    // 근거: SEARCH §5 "검색 실패(FTS 쿼리 에러 등)는 에러 표시로 끝낸다 — 대화에 영향 없음",
    //       §6 표 "검색 쿼리 실패 | CLI 에러 표시. 대화·저장 무영향"
    const { ctx, written } = createContext({
      search: async () => {
        throw new Error("FTS 쿼리 실패: 색인이 없다");
      },
    });

    await expect(dispatch("/search 압축", ctx)).resolves.toBeUndefined();
    expect(stripAnsi(written.join(""))).toContain("FTS 쿼리 실패");
  });

  it("실패 후에도 다음 명령이 정상 동작한다", async () => {
    requireRegistered();
    const { ctx, calls } = createContext({
      search: async () => {
        throw new Error("FTS 쿼리 실패");
      },
    });

    await dispatch("/search 압축", ctx);
    await dispatch("/sessions", ctx);
    expect(calls.map((call) => call.name)).toContain("listSessions");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 층 2 — 배선·표시 계약 (`startCli` 실물 조립, store의 검색만 대역)
// ───────────────────────────────────────────────────────────────────────────

/**
 * `SearchHit` 표본 — `SEARCH.md` §4 인터페이스 그대로.
 *
 * `sessionId`(매치가 난 superseded 부모)와 `chainTipId`(재개 가능한 tip)를 **접두가
 * 겹치지 않게** 만든다. 그래야 "화면에 어느 쪽 접두가 나왔는가"가 구분된다.
 */
const PARENT_SESSION_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const TIP_SESSION_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const TIP_TITLE = "압축 설계 대화";
/** 2026-07-15 정오 UTC — 어느 시간대에서도 날짜가 2026년 안에 있다 */
const HIT_TIMESTAMP = Date.UTC(2026, 6, 15, 12, 0, 0);
/**
 * 스니펫의 매치 마킹 — **B-2 해소** (`SEARCH.md` §4, 2026-08-07 정정).
 *
 * 원안이던 FTS5 `snippet()`은 **trigram 토크나이저와 조합하면 쓸 수 없다**: 문자
 * 하나하나가 개별 토큰이라 발췌 **전 구간**이 마커로 감싸져 "매치 구간 표시"라는
 * 목적 자체가 성립하지 않는다. 그래서 스니펫은 store의 애플리케이션 코드가 만들고,
 * §4가 소비 책임을 **"CLI가 색상으로 치환한다"**로 못박았다. 더는 회색지대가 아니다.
 *
 * 그 정정이 이 픽스처의 형태를 지배한다: **마커는 매치 구간에만 두른다.** 발췌 전체를
 * 감싼 픽스처를 쓰면 정정 **전**의 깨진 동작(전 구간 마킹)을 검증하게 되고, "매치
 * 구간만 강조"라는 계약이 테스트에서 사라진다.
 *
 * **값은 store의 상수를 임포트한다 — 하드코딩하지 않는다.** 초안은 문서 본문의
 * `U+0001`·`U+0002`를 그대로 적었는데 구현은 `U+0002`·`U+0003`이었다(T-008 실측에서
 * 발견 — 문서가 구현에 맞춰 정정됐다). 문자 선택이 두 곳에 있으면 이렇게 어긋난다.
 */
const MARK_START = SNIPPET_MARK_START;
const MARK_END = SNIPPET_MARK_END;
const SNIPPET_PLAIN_HEAD = "어제 ";
const SNIPPET_MATCH = "압축";
const SNIPPET_PLAIN_TAIL = " 설정을 바꿨다";
const SNIPPET = `${SNIPPET_PLAIN_HEAD}${MARK_START}${SNIPPET_MATCH}${MARK_END}${SNIPPET_PLAIN_TAIL}`;

interface SearchHitLike {
  messageId: string;
  sessionId: string;
  chainTipId: string;
  chainTipTitle: string | null;
  role: "user" | "assistant";
  snippet: string;
  timestamp: number;
}

function sampleHit(overrides: Partial<SearchHitLike> = {}): SearchHitLike {
  return {
    messageId: "cccccccc-3333-4333-8333-333333333333",
    sessionId: PARENT_SESSION_ID,
    chainTipId: TIP_SESSION_ID,
    chainTipTitle: TIP_TITLE,
    role: "user",
    snippet: SNIPPET,
    timestamp: HIT_TIMESTAMP,
    ...overrides,
  };
}

/** ANSI(ESC)·개행·탭을 뺀 C0 제어문자 — 터미널에 그대로 나가면 안 되는 것들 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 제어문자 누출 탐지가 목적이다
const RAW_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F]/;

let sandbox: string;
let home: string;
let workspace: string;

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-search-")));
  home = join(sandbox, "home");
  workspace = join(sandbox, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(
    join(home, ".neo-agent", "config.json"),
    JSON.stringify({ model: MODEL_ID, approvalMode: "off", compactionAuto: false }),
    { mode: 0o600 },
  );
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

interface SearchCall {
  query: unknown;
  options: unknown;
}

interface Rig {
  deps: CliDeps;
  args: CliArgs;
  input: PassThrough;
  model: ScenarioModel;
  searchCalls: SearchCall[];
  text(): string;
  raw(): string;
  clear(): void;
}

/**
 * `startCli`를 실물로 돌리되 **store의 `searchMessages`만** 대역으로 갈아 끼운다.
 *
 * 대역이 필요한 이유: T-004(store 구현)와 T-006(cli 구현)이 병렬이라, store가 아직
 * 검색을 못 해도 CLI의 계약(질의 전달·표시 5요소·부모 접두 비노출)은 독립적으로
 * 재야 한다. 나머지는 전부 실물이다 — 실제 SQLite 저장소, 실제 설정 로더, 실제 REPL.
 */
function createRig(result: () => SearchHitLike[]): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const model = new ScenarioModel([{ text: "응답" }]);
  const searchCalls: SearchCall[] = [];

  const deps: CliDeps = {
    argv: [],
    env: { [API_KEY_ENV]: "sk-ant-테스트" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-qab",
    factories: {
      createModelClient: () => model,
      // Docker 판정은 명시 주입이다 — 생략하면 실제 `docker version`이 스폰된다
      // (`./probe-docker.ts`).
      probeDocker: dockerAvailable(),
      openStore: (options: OpenSessionStoreOptions): SessionStore => {
        const real = openSessionStore(options);
        return {
          ...real,
          searchMessages(query: unknown, searchOptions?: unknown) {
            searchCalls.push({ query, options: searchOptions });
            return result();
          },
        } as unknown as SessionStore;
      },
    },
  };

  return {
    deps,
    args: { kind: "run" },
    input,
    model,
    searchCalls,
    text: () => stripAnsi(chunks.join("")),
    raw: () => chunks.join(""),
    clear: () => void chunks.splice(0, chunks.length),
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** "일어나지 않았다"를 재려면 시간을 줘야 한다 — 즉시 단정은 공허하다 */
async function settle(rounds = 80): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

/** 검색 한 줄을 제출하고 처리가 가라앉을 때까지 기다린다 */
async function submit(rig: Rig, line: string): Promise<void> {
  rig.input.write(`${line}\r`);
  await settle();
}

async function startRig(rig: Rig): Promise<{ app: CliApp; running: Promise<void> }> {
  const app = await startCli(rig.deps, rig.args);
  const running = app.run();
  await settle(10);
  rig.clear();
  return { app, running };
}

async function stopRig(app: CliApp, running: Promise<void>): Promise<void> {
  await app.shutdown();
  await running;
}

/**
 * 배선 층의 공허한 초록불 방지 장치 — `requireRegistered` 와 같은 근거다.
 * store 대역이 불리지 않았다면 화면에 있는 것은 검색 결과가 아니라 미등록 명령
 * 에러이고, 그 위에서 재는 부정형 단정은 전부 의미가 없다.
 */
function requireSearched(rig: Rig, times = 1): void {
  expect(
    rig.searchCalls.length,
    "store.searchMessages가 불리지 않았다 — 화면에 있는 것은 검색 결과가 아니다",
  ).toBe(times);
}

describe("/search — 배선 (SEARCH §1·§4, CLI-INTERFACE §5)", () => {
  it("질의가 쪼개지지 않고 store.searchMessages에 그대로 닿는다", async () => {
    const rig = createRig(() => [sampleHit()]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축 설정 어떻게");

    expect(rig.searchCalls, "store.searchMessages가 불리지 않았다").toHaveLength(1);
    expect(rig.searchCalls[0]?.query).toBe("압축 설정 어떻게");

    await stopRig(app, running);
  });

  it("검색이 모델을 전혀 부르지 않는다 — 표시 전용 (SEARCH §1)", async () => {
    // 배선 층에서 본 표시 전용 계약. 레지스트리 층이 "경로가 안 불린다"를 봤다면
    // 여기는 **결과**를 본다: 모델 클라이언트가 요청을 한 건도 받지 않는다.
    const rig = createRig(() => [sampleHit()]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축 설정");

    requireSearched(rig);
    expect(rig.model.requests, "검색이 모델 호출을 일으켰다").toHaveLength(0);
    expect(rig.model.callCount).toBe(0);

    await stopRig(app, running);
  });
});

describe("/search — 결과 표시 (SEARCH §5, CLI-INTERFACE §5·§7)", () => {
  it("hit마다 체인 tip 접두·title·날짜·role·스니펫이 표시된다", async () => {
    // 근거: SEARCH §5 표 "표시 | hit마다: 체인 tip 접두·title, 날짜, role,
    //       스니펫(매치 구간 강조)", CLI-INTERFACE §5 같은 문장
    const rig = createRig(() => [sampleHit()]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축");
    requireSearched(rig);
    const text = rig.text();

    // ① 체인 tip의 접두
    // [미규정 B-3] 접두 길이가 문서에 없다. `/sessions`·압축 표시의 관례가 8자라
    // 8자를 본다 — 표본 id가 앞 8자를 같은 문자로 채웠으므로 더 긴 접두를 써도
    // 이 단정은 통과한다(짧은 접두만 실패한다).
    expect(text, "체인 tip 접두가 표시되지 않았다").toContain(TIP_SESSION_ID.slice(0, 8));
    // ② title
    expect(text, "체인 tip title이 표시되지 않았다").toContain(TIP_TITLE);
    // ③ 날짜
    // [미규정 B-4] 날짜 형식이 문서에 없다("날짜"까지만). 연도만 본다.
    expect(text, "날짜가 표시되지 않았다").toContain("2026");
    // ④ role
    // [미규정 B-5] role 표기가 문서에 없다. 영문 그대로("user")든 한국어("사용자")든
    // 계약을 만족한다고 읽고 둘 다 통과시킨다.
    expect(text, "role이 표시되지 않았다").toMatch(/user|사용자|나|you/i);
    // ⑤ 스니펫 — 평문은 마킹과 무관하게 보존된다
    expect(text).toContain(SNIPPET_PLAIN_HEAD.trim());
    expect(text).toContain(SNIPPET_MATCH);
    expect(text).toContain(SNIPPET_PLAIN_TAIL.trim());

    await stopRig(app, running);
  });

  it("매치가 superseded 부모에서 났다는 사실은 표시하지 않는다", async () => {
    // 근거: SEARCH §5 "결과의 세션 표시는 **체인 tip의 접두**다 — superseded 부모의
    //       접두를 보여주면 `resolveSessionId`가 해석을 거부해(목록 제외) 사용자가
    //       막다른 길에 선다. 매치가 부모에서 났다는 사실은 표시하지 않는다"
    const rig = createRig(() => [sampleHit()]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축");
    requireSearched(rig);
    const text = rig.text();

    expect(text, "부모 세션 접두가 노출됐다 — /resume이 거부하는 막다른 길이다").not.toContain(
      PARENT_SESSION_ID.slice(0, 8),
    );
    expect(text).not.toMatch(/superseded|부모 세션|압축 전 세션/i);

    await stopRig(app, running);
  });

  it("스니펫 마커가 색상으로 치환된다 — 지워지지도, 새어 나가지도 않는다", async () => {
    // 근거: SEARCH §4(2026-08-07 정정) "마커는 store가 넣고(제어문자 U+0001·U+0002)
    //       CLI가 색상으로 치환한다". B-2 해소분이라 더는 회색지대가 아니고, 세 갈래를
    //       전부 단정한다 — 누출 금지·치환 실행·매치 구간 한정.
    //       ANSI(ESC)·개행·탭은 정상 출력이므로 제어문자 검사에서 뺀다.
    const rig = createRig(() => [sampleHit()]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축");
    requireSearched(rig);

    const raw = rig.raw();

    // ① 마커가 터미널로 새지 않는다 — 원시 제어문자는 표시를 깨뜨린다
    expect(RAW_CONTROL.test(raw), "원시 제어문자가 출력에 그대로 나갔다").toBe(false);
    expect(raw).not.toContain(MARK_START);
    expect(raw).not.toContain(MARK_END);

    // ② 그렇다고 **지우기만** 해서도 안 된다. §4의 계약은 "CLI가 색상으로 치환한다"이므로
    //    매치 구간에 실제로 장식이 붙어야 한다. ①만 있으면 마커를 통째로 버리는 구현이
    //    통과한다 — 그러면 "매치 구간 강조"(§5 표시 항목)가 조용히 사라진다.
    const decorated = raw.slice(raw.indexOf(SNIPPET_PLAIN_HEAD.trim()));
    expect(decorated, "매치 구간에 색상이 붙지 않았다 — 마커를 지우기만 했다").toMatch(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR 탐지가 목적이다
      /\u001b\[[0-9;]*m/,
    );

    // ③ 강조는 **매치 구간에만** 붙는다. 정정 전 `snippet()` 동작(발췌 전 구간 마킹)이
    //    재현되면 평문까지 같은 장식 안에 들어간다.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR 탐지가 목적이다
    const highlighted = [...raw.matchAll(/\u001b\[[0-9;]*m([^\u001b]*)\u001b\[[0-9;]*m/g)].map(
      (found) => found[1] ?? "",
    );
    const swallowsPlainText = highlighted.some(
      (segment) =>
        segment.includes(SNIPPET_MATCH) &&
        (segment.includes(SNIPPET_PLAIN_HEAD.trim()) ||
          segment.includes(SNIPPET_PLAIN_TAIL.trim())),
    );
    expect(swallowsPlainText, "발췌 전 구간이 강조됐다 — 매치 구간만 강조해야 한다").toBe(false);

    await stopRig(app, running);
  });

  it("[미규정 B-10] 마커 짝이 맞지 않아도 제어문자는 새지 않는다", async () => {
    // store가 짝이 안 맞는 마커(여는 것만·홀수 개)를 실은 스니펫을 돌려줬을 때의 CLI
    // 동작은 계약에 없다 — §4는 정상 형태만 규정한다. 임의 판정하지 않는다.
    //
    // 다만 **문서가 금지한 결과**는 회색지대와 무관하게 단정한다: 어떤 입력이 오든
    // 원시 제어문자가 터미널로 나가면 표시가 깨진다. 판정 기준("원인 쪽이 미규정이어도
    // 문서가 금지한 결과가 나오면 위반")의 적용이다. 나머지(무시할지·평문 취급할지·
    // 에러로 볼지)는 B-10으로 남긴다.
    const unbalanced = `${SNIPPET_PLAIN_HEAD}${MARK_START}${SNIPPET_MATCH} 짝 없는 여는 마커`;
    const rig = createRig(() => [sampleHit({ snippet: unbalanced })]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축");
    requireSearched(rig);
    const raw = rig.raw();

    expect(RAW_CONTROL.test(raw), "짝이 안 맞는 마커가 그대로 출력됐다").toBe(false);
    expect(raw).not.toContain(MARK_START);
    // 평문은 어느 판정을 택하든 사라지면 안 된다(침묵 유실 금지 — ARCHITECTURE §2.6)
    expect(rig.text()).toContain(SNIPPET_MATCH);

    await stopRig(app, running);
  });

  it("여러 hit이 모두 표시된다", async () => {
    const second = sampleHit({
      messageId: "dddddddd-4444-4444-8444-444444444444",
      sessionId: "eeeeeeee-5555-4555-8555-555555555555",
      chainTipId: "ffffffff-6666-4666-8666-666666666666",
      chainTipTitle: "두 번째 대화",
      role: "assistant",
      snippet: "다른 스니펫이다",
    });
    const rig = createRig(() => [sampleHit(), second]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축");
    requireSearched(rig);
    const text = rig.text();

    expect(text).toContain(TIP_SESSION_ID.slice(0, 8));
    expect(text).toContain("ffffffff");
    expect(text).toContain("두 번째 대화");
    expect(text).toContain("다른 스니펫이다");

    await stopRig(app, running);
  });

  it("title이 null인 hit도 표시가 깨지지 않는다", async () => {
    // 근거: SEARCH §4 `chainTipTitle: string | null` — null이 계약상 가능한 값이다.
    // [미규정 B-6] null일 때 무엇을 대신 보일지는 문서에 없다. "행 자체가 사라지지
    // 않는다"까지만 단정한다 — 접두가 없으면 `/resume`으로 갈 길이 사라진다.
    const rig = createRig(() => [sampleHit({ chainTipTitle: null })]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축");
    requireSearched(rig);
    const text = rig.text();

    expect(text).toContain(TIP_SESSION_ID.slice(0, 8));
    expect(text).toContain(SNIPPET_MATCH);
    expect(text).not.toContain("null");

    await stopRig(app, running);
  });
});

describe("/search — 빈 결과는 명시 표시 (SEARCH §5, ARCHITECTURE §2.6)", () => {
  it("결과 0건일 때 '결과 없음'류가 화면에 나온다 — 침묵 종료는 위반이다", async () => {
    // 근거: SEARCH §5 표 "빈 결과 | \"결과 없음\"을 명시 표시 — 침묵 종료 금지(§2.6)"
    // [미규정 B-7] 정확한 문구는 문서가 정하지 않는다("결과 없음"류). 부재를 뜻하는
    // 표현이 나왔는가까지만 본다.
    const rig = createRig(() => []);
    const { app, running } = await startRig(rig);

    // 질의어에 "없"이 들어가면 readline 에코만으로 아래 단정이 통과한다 — 질의는
    // 판정 문구와 글자가 겹치지 않는 것을 쓴다.
    await submit(rig, "/search 존재하지도않는문자열");
    requireSearched(rig);
    const text = rig.text();

    expect(text.trim(), "빈 결과에서 아무것도 표시되지 않았다 — 침묵 종료").not.toBe("");
    expect(text, "결과 없음을 뜻하는 표시가 없다").toMatch(/없|0건|찾지 못|no result/i);
    // 빈 결과는 실패가 아니다 — 에러로 보이면 사용자가 검색이 깨진 줄 안다
    expect(text).not.toMatch(/실패|error/i);

    await stopRig(app, running);
  });
});

describe("/search — 실패해도 REPL이 계속된다 (SEARCH §5·§6)", () => {
  it("store 검색이 던지면 에러 표시로 끝나고 대화·저장에 영향이 없다", async () => {
    const rig = createRig(() => {
      throw new Error("FTS 쿼리 실패: 색인 없음");
    });
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축");
    requireSearched(rig);

    expect(rig.text(), "검색 실패가 표시되지 않았다").toContain("FTS 쿼리 실패");
    expect(rig.model.requests, "검색 실패가 모델 호출로 이어졌다").toHaveLength(0);

    // REPL이 살아 있다 — 다음 명령이 정상 동작한다
    rig.clear();
    await submit(rig, "/help");
    expect(rig.text()).toContain("/search");

    await stopRig(app, running);
  });
});

describe("/search — 입력 상태 무변경 (CLI-INTERFACE §8)", () => {
  it("검색 전후로 상태가 idle-input이고 새 상태가 관측되지 않는다", async () => {
    // 근거: §8 "**`/search`는 상태를 추가하지 않는다**(2026-08-07) — 읽기 전용 조회라
    //       `idle-input`에서 디스패치되고 동기 완료된다. 상태는 계속 4개 닫힌 목록이다."
    const rig = createRig(() => [sampleHit()]);
    const { app, running } = await startRig(rig);

    expect(app.parts.repl.state).toBe("idle-input");

    // 처리 중 상태를 표본 추출한다. 검색이 순수 동기라면 표본이 안 잡힐 수 있고
    // 그때는 통과다 — 이 표본은 **위반만 잡는다**.
    const seen = new Set<string>();
    let sampling = true;
    const sample = (): void => {
      if (!sampling) return;
      seen.add(app.parts.repl.state);
      setImmediate(sample);
    };
    sample();

    await submit(rig, "/search 압축 설정");
    sampling = false; // 단정보다 먼저 멈춘다 — 실패해도 재귀 표본이 남지 않게
    requireSearched(rig);

    expect([...seen], `검색 중 관측된 상태: ${[...seen].join(", ")}`).toEqual(["idle-input"]);
    expect(app.parts.repl.state).toBe("idle-input");

    await stopRig(app, running);
  });

  it("검색 뒤에 보낸 대화 입력이 정상적으로 런이 된다", async () => {
    // 상태가 실제로 idle로 돌아왔는가의 결과 검증. 상태 값만 보면 "값은 idle인데
    // readline이 떨어져 있는" 경우를 놓친다.
    const rig = createRig(() => [sampleHit()]);
    const { app, running } = await startRig(rig);

    await submit(rig, "/search 압축");
    requireSearched(rig);
    expect(rig.model.requests).toHaveLength(0);

    rig.input.write("안녕\r");
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && rig.model.requests.length === 0) await tick();
    expect(rig.model.requests, "검색 뒤 대화 입력이 런으로 이어지지 않았다").toHaveLength(1);
    await app.parts.agent.waitForIdle();

    await stopRig(app, running);
  });
});

/* ============================================================================
 * [미규정 B-n] 판정 요청 목록 — T-007 (QA-B)
 *
 * 정본 문서가 정하지 않아 QA가 **임의 판정하지 않은** 항목이다. 각 항목은 해당
 * 테스트에도 주석으로 표시돼 있다. 판정되면 문서를 먼저 고치고 테스트를 맞춘다.
 *
 * ─ B-1. 질의의 앞뒤 공백 처리 (CLI-INTERFACE §5 / SEARCH §5)
 *   §5는 "첫 공백 뒤 전부"까지만 정하고 앞뒤 공백을 정리하는지 말하지 않는다.
 *   → 잠정: 기존 인자 명령(`/resume`·`/delete`)의 `requireArgument`가 전부
 *      trim하는 관례를 따라 **앞뒤는 정리, 안쪽은 보존**으로 읽었다. 안쪽 보존은
 *      "토큰 분리를 하지 않는다"에서 직접 나오므로 회색지대가 아니다.
 *
 * ─ B-2. ~~스니펫 매치 마킹의 구체 문자~~ **해소됨** (2026-08-07, Architect 통지)
 *   `SEARCH.md` §4가 정정되며 확정됐다: FTS5 `snippet()`은 trigram과 조합 불가(발췌
 *   전 구간이 마킹된다)라 스니펫은 store의 앱 코드가 만들고, 마커는 `U+0001`·`U+0002`,
 *   **CLI가 색상으로 치환한다**. 테스트도 결과 단정에서 계약 단정으로 올렸다 —
 *   "안 샌다"에 더해 "색상이 실제로 붙는다"와 "매치 구간에만 붙는다"를 단정한다.
 *      파생 미결이 하나 남았다 — B-10(마커 짝 불일치).
 *
 * ─ B-3. 세션 접두의 표시 길이 (문서에 없음)
 *   §5는 "체인 tip 접두"까지만 정하고 몇 자인지 말하지 않는다.
 *   → 잠정: `/sessions`·압축 표시의 관례(8자)를 기준으로 단정했다. 표본 id의 앞
 *      8자를 같은 문자로 채워, 구현이 더 긴 접두를 써도 통과하게 만들었다.
 *
 * ─ B-4. 날짜 표시 형식 (CLI-INTERFACE §12 "표시 세부" 미결의 하위)
 *   → 잠정: 연도만 단정. 형식(절대/상대·시각 포함 여부)은 화면 실측 후 판정 몫.
 *
 * ─ B-5. role 표기 (문서에 없음)
 *   §5는 "role"까지만 정한다. 영문 그대로(`user`/`assistant`)인지 한국어
 *   (사용자/어시스턴트)인지 갈린다.
 *   → 잠정: 둘 다 통과시켰다. 한국어 UI 일관성으로는 한국어가 맞아 보이나
 *      `SearchHit.role`이 영문 리터럴이라 그대로 쓰는 것도 자연스럽다.
 *
 * ─ B-6. `chainTipTitle`이 null일 때의 표시 (SEARCH §4는 null을 계약으로 허용)
 *   → 잠정: "행이 사라지지 않는다" + "문자열 `null`이 화면에 나오지 않는다"까지만
 *      단정. 대체 표시(무제·id만 표시 등)의 선택은 판정 몫.
 *
 * ─ B-7. 빈 결과 문구 (SEARCH §5는 "결과 없음"을 예시로만 든다)
 *   → 잠정: 부재를 뜻하는 표현이 나왔는가 + 에러로 보이지 않는가까지만 단정.
 *
 * ─ B-8. `/search` 결과에 `/resume` 안내를 붙일지 (SEARCH §5)
 *   §5는 "CLI는 이것으로 `/resume` 안내를 만든다"(§4 말미)고 하고 §5 표의 표시
 *   항목에는 안내가 없다. 안내 문구가 **의무인지 선택인지** 갈린다.
 *   → 잠정: 의무로 단정하지 않았다(표시 5요소만 단정). tip 접두가 보이면
 *      사용자가 `/resume`으로 갈 수 있다는 것이 §5 문장의 핵심으로 읽힌다.
 *
 * ─ B-9. `SearchOptions.limit`을 CLI가 넘기는지 (SEARCH §4)
 *   §4는 기본 20을 store 쪽 기본값으로 두고, CLI가 이 옵션을 채우는지는 정하지
 *   않는다(사용자에게 노출되는 인자도 없다).
 *   → 잠정: 단정하지 않았다(대역이 옵션을 기록만 한다). CLI가 넘기지 않고 store
 *      기본에 맡기는 쪽이 "기본값이 한 곳"이라 나아 보인다.
 *
 * ─ B-10. 마커 짝이 맞지 않는 스니펫의 CLI 동작 (신규 — B-2 해소에서 파생)
 *   §4는 정상 형태(여는 마커 + 닫는 마커)만 규정한다. store 버그·백필 경계·발췌 자르기
 *   경계에서 짝이 깨진 스니펫이 나올 수 있는데, 그때 CLI가 무시할지·평문으로 볼지·
 *   에러로 표시할지는 어느 문서에도 없다.
 *   → 테스트는 임의 판정하지 않고 **문서가 금지한 결과**만 단정한다: 원시 제어문자
 *      누출 금지 + 평문 유실 금지. 판정 요청: 짝 불일치를 어떻게 다룰 것인가.
 * ========================================================================== */
