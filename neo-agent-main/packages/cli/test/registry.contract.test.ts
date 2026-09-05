/**
 * 슬래시 명령 레지스트리 계약 — `docs/CLI-INTERFACE.md` §5.
 *
 * 검증하는 계약:
 *   §5 "슬래시 명령은 중앙 레지스트리 한 곳에 정의한다 ... 디스패치·/help 출력·탭
 *      자동완성이 전부 이 테이블에서 파생된다 — 정의 한 곳 원칙"
 *   §5 MVP 명령 집합의 닫힌 목록 (2026-08-06 `/compact`·2026-08-07 `/search` 개정 반영)
 *   §5 "미등록 슬래시 명령은 에러 표시(모르는 명령을 대화로 흘려보내면 오타가
 *      조용히 모델에게 간다 — §2.6)"
 *
 * [미규정] `CliContext`의 형태는 문서에 없다(§5의 `run(args, ctx)` 시그니처만 있음).
 * 아래 테스트는 접근하는 모든 속성을 기록하는 프록시를 ctx로 넘겨, 형태에 의존하지
 * 않고 **관찰 가능한 결과**(출력이 났는가 / 모델 전송 경로가 불렸는가)만 본다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { loadCliModule, pickExport } from "./harness.ts";

// T-008 구현자 추가 — T-012 QA 재검토 대상.
// `/compact`는 2026-08-06 `CLI-INTERFACE.md` §5 개정("/compact 명령 추가",
// COMPACTION.md §8 표)으로, `/search`는 2026-08-07 §5 개정(`SEARCH.md` §5)으로 닫힌
// 목록에 들어왔다. 이 파일 머리의 규율("기대값의 출처는 전부 문서다")대로 문서를 따라
// 목록을 넓힌 것이고, 판정 로직은 손대지 않았다.
const MVP_COMMANDS = [
  "/help",
  "/sessions",
  "/resume",
  "/new",
  "/delete",
  "/search",
  "/compact",
  // §5 표에 2026-08-09 추가 — `/memory`(메모리 표시·삭제, 인자로 하위 동작).
  // "MVP 명령 집합 (닫힌 목록 — 추가는 이 문서 개정)"이고, 그 개정이 일어났다
  "/memory",
  // §5 표에 2026-09-05 추가 — `/config`(설정 조회·변경, 인자로 하위 동작. 계약 정본은
  // §3.2). 위 두 줄과 같은 형태다: 닫힌 목록의 추가는 이 문서 개정을 거치고, 그 개정이
  // 일어났으므로 이 배열이 따라간다. 판정 로직은 손대지 않았다
  "/config",
  "/exit",
] as const;

interface SlashCommandLike {
  name: string;
  aliases?: readonly string[];
  description: string;
  run: (args: string, ctx: unknown) => Promise<void> | void;
}

let registry: readonly SlashCommandLike[];
let module: Record<string, unknown>;

/** 접근·호출을 전부 기록하는 재귀 프록시 — ctx 형태를 모른 채 부작용만 관찰한다 */
function deepSpy(log: { path: string; args: unknown[] }[], path = "ctx"): unknown {
  const target = () => undefined;
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

beforeAll(async () => {
  module = await loadCliModule("registry.ts");
  registry = pickExport<readonly SlashCommandLike[]>(
    module,
    ["SLASH_COMMANDS", "COMMAND_REGISTRY", "slashCommands", "COMMANDS"],
    "슬래시 명령 레지스트리",
  );
});

describe("레지스트리 — 닫힌 목록 (CLI-INTERFACE §5)", () => {
  it("문서의 MVP 명령 집합이 정확히 등록돼 있다", () => {
    // 근거: §5 "MVP 명령 집합 (닫힌 목록 — 추가는 이 문서 개정)"
    expect(Array.isArray(registry)).toBe(true);
    const names = registry.map((command) => command.name).sort();
    expect(names).toEqual([...MVP_COMMANDS].sort());
  });

  it("각 명령이 name·description·run을 갖는다", () => {
    // 근거: §5 `interface SlashCommand` — description은 "/help에 그대로 노출"
    for (const command of registry) {
      expect(typeof command.name).toBe("string");
      expect(command.name.startsWith("/")).toBe(true);
      expect(typeof command.description).toBe("string");
      expect(command.description.length).toBeGreaterThan(0);
      expect(typeof command.run).toBe("function");
    }
  });

  it("이름·별칭이 서로 겹치지 않는다", () => {
    // 겹치면 디스패치가 어느 쪽을 고를지 코드 순서에 좌우된다.
    const keys: string[] = [];
    for (const command of registry) {
      keys.push(command.name, ...(command.aliases ?? []));
    }
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("레지스트리 — /help는 레지스트리에서 파생된다 (CLI-INTERFACE §5)", () => {
  it("/help 출력에 등록된 모든 명령의 이름과 설명이 나온다", async () => {
    // 근거: §5 "/help | 레지스트리에서 파생한 명령 목록", "디스패치·/help 출력·탭
    //       자동완성이 전부 이 테이블에서 파생된다 — 정의 한 곳 원칙"
    // 파생 여부의 관찰 가능한 형태: 레지스트리의 모든 항목이 출력에 나타나는가.
    const help = registry.find((command) => command.name === "/help");
    expect(help, "/help 명령이 레지스트리에 없다").toBeDefined();
    if (!help) return;

    const log: { path: string; args: unknown[] }[] = [];
    await help.run("", deepSpy(log));
    const text = loggedText(log);

    for (const command of registry) {
      expect(text, `/help 출력에 ${command.name}이 없다`).toContain(command.name);
      expect(text, `/help 출력에 ${command.name}의 설명이 없다`).toContain(command.description);
    }
  });

  it("/help 출력에 레지스트리 밖의 명령이 하드코딩돼 있지 않다", async () => {
    // 정의 한 곳 원칙의 반대 방향 — 출력에만 존재하는 명령이 있으면 목록이 두 곳이 된다.
    const help = registry.find((command) => command.name === "/help");
    if (!help) return;

    const log: { path: string; args: unknown[] }[] = [];
    await help.run("", deepSpy(log));
    const text = loggedText(log);

    const known = new Set<string>();
    for (const command of registry) {
      known.add(command.name);
      for (const alias of command.aliases ?? []) known.add(alias);
    }
    const mentioned = [...text.matchAll(/\/[a-z][a-z0-9-]*/gi)].map((match) => match[0]);
    const unknown = [...new Set(mentioned)].filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
  });
});

describe("레지스트리 — 탭 자동완성도 레지스트리 파생 (CLI-INTERFACE §8)", () => {
  it("슬래시 접두의 후보가 전부 등록된 명령이다", () => {
    // 근거: §8 "탭 자동완성은 슬래시 명령에만 동작한다(레지스트리 파생)"
    const complete = pickExport<(line: string) => string[]>(
      module,
      ["completeSlashCommand", "complete", "completions"],
      "탭 자동완성",
    );
    const known = new Set<string>();
    for (const command of registry) {
      known.add(command.name);
      for (const alias of command.aliases ?? []) known.add(alias);
    }
    for (const candidate of complete("/")) {
      expect(known, `자동완성이 레지스트리 밖의 ${candidate}를 제안했다`).toContain(candidate);
    }
    // 슬래시가 아닌 입력은 대화 입력이므로 후보가 없다
    expect(complete("hello")).toEqual([]);
  });
});

describe("레지스트리 — 미등록 슬래시 명령 (CLI-INTERFACE §5)", () => {
  /**
   * 디스패처를 찾는다.
   *
   * **어느 모듈이 소유하든 계약은 같다** — 미등록 슬래시가 대화로 흘러가지 않아야
   * 한다는 것이 §5가 요구하는 전부이고, 그래서 이 함수는 두 모듈을 다 뒤진다.
   *
   * 소유를 정본에 못박지 않기로 2026-08-20에 판정했다(K-005 U-5). 문면을 더하지 않는
   * 근거는 그 자리가 이미 있다는 것이다 — 배럴(`src/index.ts`)의 각 export 줄에 달린
   * `// §n` 주석이 계약 절과 코드 모듈을 잇는 지도이고(`CLI-INTERFACE.md` §1), 오늘
   * 그 지도가 디스패치를 §5 아래에 둔다. 정본에 한 줄을 더하면 같은 사실이 두 곳에
   * 살게 되고, 그중 하나가 먼저 낡는다.
   *
   * 그 전까지 이 자리에는 미규정 마커가 서 있었고, 그 서술이 구현 사실과 어긋난
   * 채였다 — 디스패치를 `input.ts`에 둘 수도 있다고 적혀 있었으나 구현은 이미
   * `registry.ts`를 택했다. 마커는 2026-08-20에 걷혔다.
   */
  async function findDispatcher(): Promise<{
    dispatch: (line: string, ctx: unknown) => unknown;
    where: string;
  }> {
    const names = [
      "dispatchSlashCommand",
      "dispatch",
      "runSlashCommand",
      "handleSlashCommand",
      "dispatchCommand",
      "handleLine",
      "handleInput",
      "submitLine",
    ];
    const searched: string[] = [];
    for (const fileName of ["registry.ts", "input.ts"]) {
      let candidateModule: Record<string, unknown>;
      try {
        candidateModule = fileName === "registry.ts" ? module : await loadCliModule(fileName);
      } catch (error) {
        searched.push(`${fileName}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      for (const name of names) {
        if (typeof candidateModule[name] === "function") {
          return {
            dispatch: candidateModule[name] as (line: string, ctx: unknown) => unknown,
            where: `${fileName}#${name}`,
          };
        }
      }
      searched.push(
        `${fileName}: ${names.join("/")} 없음 (export: ${Object.keys(candidateModule).join(", ")})`,
      );
    }
    throw new Error(
      `슬래시 디스패처를 찾지 못했다.\n${searched.map((s) => `  - ${s}`).join("\n")}`,
    );
  }

  it("미등록 슬래시는 에러로 표시되고 대화로 흘러가지 않는다", async () => {
    // 근거: §5 "슬래시로 시작하지 않는 입력은 전부 대화 입력이다. **미등록 슬래시
    //       명령은 에러 표시**(모르는 명령을 대화로 흘려보내면 오타가 조용히
    //       모델에게 간다 — §2.6)"
    const { dispatch } = await findDispatcher();

    const log: { path: string; args: unknown[] }[] = [];
    let thrownMessage = "";
    try {
      await dispatch("/nope-not-a-command", deepSpy(log));
    } catch (error) {
      // throw로 알리는 구현도 "조용히 넘기지 않음"을 만족한다 — 함께 본다
      thrownMessage = error instanceof Error ? error.message : String(error);
    }

    // 1) 대화로 흘러가지 않았다 — prompt/steer/send 계열이 불리지 않아야 한다
    const modelPaths = log
      .map((entry) => entry.path)
      .filter((path) => /prompt|steer|followUp|send|submit/i.test(path));
    expect(modelPaths, "미등록 명령이 모델로 전송됐다").toEqual([]);

    // 2) 사용자에게 보였다 — 출력이든 throw든 입력한 명령이 언급돼야 한다
    const text = `${loggedText(log)}\n${thrownMessage}`;
    expect(text).toContain("nope-not-a-command");
  });
});
