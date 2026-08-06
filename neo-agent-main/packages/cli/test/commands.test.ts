/**
 * argv 파싱 + 슬래시 레지스트리 단위 테스트 — `docs/CLI-INTERFACE.md` §5.
 *
 * 관심사는 "표면이 닫혀 있는가"다 — 명령 목록이 7개로 닫혔는지, 디스패치·`/help`·
 * 자동완성이 **같은 테이블**에서 파생되는지, 모르는 입력이 조용히 흘러가지 않는지.
 */

import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "../src/args.ts";
import {
  type CliActions,
  type CliContext,
  completeSlashCommand,
  dispatchSlashCommand,
  findSlashCommand,
  formatSlashHelp,
  isSlashCommand,
  SLASH_COMMANDS,
} from "../src/registry.ts";

function createContext(): CliContext & { written: string[]; actions: CliActions } {
  const written: string[] = [];
  const actions: CliActions = {
    listSessions: vi.fn(async () => undefined),
    resumeSession: vi.fn(async () => undefined),
    newSession: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    compact: vi.fn(async () => undefined),
    exit: vi.fn(async () => undefined),
  };
  return {
    written,
    actions,
    out: {
      write(text: string): void {
        written.push(text);
      },
    },
  };
}

describe("parseArgs (§5)", () => {
  it("네 가지 형태만 인식한다", () => {
    expect(parseArgs([])).toEqual({ kind: "run" });
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["--version"])).toEqual({ kind: "version" });
    expect(parseArgs(["--resume", "a1b2"])).toEqual({ kind: "resume", prefix: "a1b2" });
  });

  it("모르는 인자는 던진다 — 오타가 조용히 새 세션이 되지 않는다", () => {
    expect(() => parseArgs(["--resmue", "a1b2"])).toThrow(/알 수 없는 인자/);
    expect(() => parseArgs(["세션이름"])).toThrow(/알 수 없는 인자/);
  });

  it("--resume에 값이 없으면 던진다", () => {
    expect(() => parseArgs(["--resume"])).toThrow(/접두/);
  });

  it("남는 인자를 무시하지 않는다", () => {
    expect(() => parseArgs(["--resume", "a1", "b2"])).toThrow(/남는 인자/);
    expect(() => parseArgs(["--help", "extra"])).toThrow(/남는 인자/);
  });
});

describe("명령 표면 (§5)", () => {
  it("MVP 명령 집합은 7개로 닫혀 있다", () => {
    // `/compact`는 2026-08-06 CLI-INTERFACE §5 개정으로 닫힌 목록에 추가됐다(T-008).
    expect(SLASH_COMMANDS.map((command) => command.name)).toEqual([
      "/help",
      "/sessions",
      "/resume",
      "/new",
      "/delete",
      "/compact",
      "/exit",
    ]);
  });

  it("/compact는 압축 동작에 위임한다 — 인자를 받지 않는다", async () => {
    // 근거: §5 표 "/compact | 수동 압축 — 자동 트리거와 같은 경로, 임계 미달이어도 실행".
    // COMPACTION.md §9가 커스텀 지시 인자를 MVP에서 뺐으므로 argsLabel도 없다.
    const compact = SLASH_COMMANDS.find((command) => command.name === "/compact");
    expect(compact?.argsLabel).toBeUndefined();

    const ctx = createContext();
    await dispatchSlashCommand("/compact", ctx);
    expect(ctx.actions.compact).toHaveBeenCalled();
  });

  it("/help·자동완성·조회가 전부 같은 테이블에서 나온다", () => {
    const help = formatSlashHelp();
    for (const command of SLASH_COMMANDS) {
      expect(help).toContain(command.description);
      expect(findSlashCommand(command.name)).toBe(command);
      expect(completeSlashCommand(command.name)).toContain(command.name);
    }
  });

  it("슬래시로 시작하는 입력만 명령이다", () => {
    expect(isSlashCommand("/help")).toBe(true);
    expect(isSlashCommand("  /help")).toBe(true);
    expect(isSlashCommand("help")).toBe(false);
    expect(isSlashCommand("경로에 /슬래시가 있는 대화")).toBe(false);
  });

  it("자동완성은 인자 자리를 완성하지 않는다", () => {
    expect(completeSlashCommand("/se")).toEqual(["/sessions"]);
    expect(completeSlashCommand("/resume a1")).toEqual([]);
    expect(completeSlashCommand("안녕")).toEqual([]);
  });
});

describe("디스패치 (§5)", () => {
  it("등록된 명령에 인자를 넘긴다", async () => {
    const ctx = createContext();
    await dispatchSlashCommand("/resume a1b2", ctx);
    expect(ctx.actions.resumeSession).toHaveBeenCalledWith("a1b2");
  });

  it("미등록 명령은 에러 표시로 끝난다 — 대화로 흘리지 않는다", async () => {
    const ctx = createContext();
    await dispatchSlashCommand("/sesions", ctx);

    expect(ctx.written.join("")).toContain("알 수 없는 명령");
    for (const action of Object.values(ctx.actions)) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  it("인자가 빠진 명령은 동작을 부르지 않고 안내한다", async () => {
    const ctx = createContext();
    await dispatchSlashCommand("/delete", ctx);

    expect(ctx.actions.deleteSession).not.toHaveBeenCalled();
    expect(ctx.written.join("")).toContain("인자가 필요하다");
  });

  it("동작이 던져도 REPL을 죽이지 않고 표시한다", async () => {
    const ctx = createContext();
    ctx.actions.resumeSession = vi.fn(async () => {
      throw new Error("접두가 모호하다");
    });

    await expect(dispatchSlashCommand("/resume a", ctx)).resolves.toBeUndefined();
    expect(ctx.written.join("")).toContain("접두가 모호하다");
  });

  it("/help는 동작 주입 없이 레지스트리만으로 답한다", async () => {
    const ctx = createContext();
    await dispatchSlashCommand("/help", ctx);
    expect(ctx.written.join("")).toContain("/sessions");
  });
});
