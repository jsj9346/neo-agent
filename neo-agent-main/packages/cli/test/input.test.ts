/**
 * 입력 상태 머신 + REPL 단위 테스트 — `docs/CLI-INTERFACE.md` §8.
 *
 * 스트림을 전부 주입받는 구조라 실제 터미널 없이 검증한다. `terminal: true`를
 * 강제해서 readline이 실 터미널과 같은 경로(에코·keypress·자동완성)를 타게 한다 —
 * R-1 실측이 이 조건에서 나왔다.
 */

import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createRepl, PROMPT, type ReplHandlers } from "../src/input.ts";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

interface Harness {
  input: PassThrough;
  output: PassThrough;
  written: string[];
  /** 지금까지 쓴 것 전부를 비우고 돌려준다 */
  take(): string;
  type(text: string): Promise<void>;
}

function createIo(columns = 80): Harness {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = columns;
  const written: string[] = [];
  output.on("data", (chunk: Buffer) => written.push(chunk.toString("utf8")));

  return {
    input,
    output,
    written,
    take(): string {
      const text = written.join("");
      written.length = 0;
      return text;
    },
    async type(text: string): Promise<void> {
      input.write(text);
      await tick();
    },
  };
}

function createHandlers(overrides: Partial<ReplHandlers> = {}): ReplHandlers & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    prompt: vi.fn(async (text: string) => {
      calls.push(`prompt:${text}`);
    }),
    steer: vi.fn((text: string) => {
      calls.push(`steer:${text}`);
    }),
    abort: vi.fn(() => {
      calls.push("abort");
    }),
    dispatch: vi.fn(async (line: string) => {
      calls.push(`dispatch:${line}`);
    }),
    requestExit: vi.fn(() => {
      calls.push("requestExit");
    }),
    ...overrides,
  } as ReplHandlers & { calls: string[] };
}

describe("REPL 상태 전이", () => {
  it("idle 제출은 prompt()로 가고 런 동안 run-active다", async () => {
    const io = createIo();
    let release: (() => void) | undefined;
    const handlers = createHandlers({
      prompt: vi.fn(
        async () =>
          await new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    });
    const repl = createRepl(io, handlers);
    repl.start();

    expect(repl.state).toBe("idle-input");
    await io.type("안녕\r");

    expect(handlers.prompt).toHaveBeenCalledWith("안녕");
    expect(repl.state).toBe("run-active");

    release?.();
    await tick();
    expect(repl.state).toBe("idle-input");
    repl.close();
  });

  it("run-active 제출은 steer()로 간다 — 새 런을 열지 않는다", async () => {
    const io = createIo();
    const handlers = createHandlers({ prompt: vi.fn(async () => new Promise<void>(() => {})) });
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("첫 입력\r");
    expect(repl.state).toBe("run-active");
    await io.type("아니 그거 말고\r");

    expect(handlers.steer).toHaveBeenCalledWith("아니 그거 말고");
    expect(handlers.prompt).toHaveBeenCalledTimes(1);
    repl.close();
  });

  it("steer가 throw하면(런 닫힘 구간) 런 종료를 기다렸다가 prompt()로 재시도한다", async () => {
    const io = createIo();
    let release: (() => void) | undefined;
    const handlers = createHandlers({
      prompt: vi.fn(
        async () =>
          await new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
      steer: vi.fn(() => {
        throw new Error("run is closing");
      }),
    });
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("첫 입력\r");
    await io.type("늦게 도착한 입력\r");

    // 아직 런이 살아 있으므로 재시도는 대기 중이다
    expect(handlers.prompt).toHaveBeenCalledTimes(1);

    release?.();
    await tick();
    await tick();

    expect(handlers.prompt).toHaveBeenNthCalledWith(2, "늦게 도착한 입력");
    repl.close();
  });

  it("빈 줄은 아무 경로로도 가지 않는다", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("   \r");

    expect(handlers.calls).toEqual([]);
    repl.close();
  });
});

describe("슬래시 명령", () => {
  it("idle에서는 디스패치로 간다", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("/sessions\r");
    await tick();

    expect(handlers.dispatch).toHaveBeenCalledWith("/sessions");
    repl.close();
  });

  it("run-active에서는 거부하고 안내한다 — 디스패치하지 않는다", async () => {
    const io = createIo();
    const handlers = createHandlers({ prompt: vi.fn(async () => new Promise<void>(() => {})) });
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("작업 시작\r");
    io.take();
    await io.type("/new\r");
    await tick();

    expect(handlers.dispatch).not.toHaveBeenCalled();
    expect(handlers.steer).not.toHaveBeenCalled();
    expect(stripAnsi(io.take())).toContain("실행 중에는 슬래시 명령을 쓸 수 없다");
    repl.close();
  });

  it("탭 자동완성은 슬래시 명령에만 동작한다", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    // 후보가 하나면 readline이 나머지를 채운다
    await io.type("/ses");
    await io.type("\t");
    await io.type("\r");
    await tick();
    expect(handlers.dispatch).toHaveBeenCalledWith("/sessions");

    // 슬래시로 시작하지 않는 입력에는 후보를 내지 않는다 — 그대로 제출된다
    await io.type("ses");
    await io.type("\t");
    await io.type("\r");
    await tick();
    expect(handlers.prompt).toHaveBeenCalledWith("ses");
    repl.close();
  });
});

describe("Ctrl+C (§8)", () => {
  it("idle에서는 종료 시퀀스를 요청한다", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("\x03");

    expect(handlers.requestExit).toHaveBeenCalledTimes(1);
    expect(handlers.abort).not.toHaveBeenCalled();
    repl.close();
  });

  it("run-active에서는 abort하고 타이핑하던 것도 지운다", async () => {
    const io = createIo();
    const handlers = createHandlers({ prompt: vi.fn(async () => new Promise<void>(() => {})) });
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("작업\r");
    await io.type("쓰다 만 입력");
    await io.type("\x03");

    expect(handlers.abort).toHaveBeenCalledTimes(1);
    expect(handlers.requestExit).not.toHaveBeenCalled();

    // 버퍼가 비었으므로 곧바로 Enter를 쳐도 제출되는 것이 없다
    io.take();
    await io.type("\r");
    expect(handlers.steer).not.toHaveBeenCalled();
    repl.close();
  });
});

describe("라인 가드 — 스트리밍 출력과 타이핑의 동시성 (R-1)", () => {
  it("타이핑 중 출력이 와도 입력이 유실되지 않고 다시 그려진다", async () => {
    const io = createIo();
    const handlers = createHandlers({ prompt: vi.fn(async () => new Promise<void>(() => {})) });
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("시작\r");
    await io.type("타이핑 중");
    io.take();

    repl.write("모델이 스트리밍한 텍스트\n");
    const painted = io.take();

    // 입력 라인을 걷어내고(클리어) → 출력 → 프롬프트와 버퍼를 다시 그린다
    expect(painted).toContain("\x1b[0J");
    expect(painted).toContain("모델이 스트리밍한 텍스트");
    expect(painted.indexOf("모델이 스트리밍한 텍스트")).toBeLessThan(
      painted.lastIndexOf("타이핑 중"),
    );
    expect(painted).toContain(`${PROMPT}타이핑 중`);

    // 그리고 이어서 친 글자와 함께 온전히 제출된다
    await io.type("이어서\r");
    expect(handlers.steer).toHaveBeenCalledWith("타이핑 중이어서");
    repl.close();
  });

  it("개행으로 끝나지 않은 출력 뒤에도 입력 라인은 자기 행을 갖는다", async () => {
    const io = createIo();
    const handlers = createHandlers({ prompt: vi.fn(async () => new Promise<void>(() => {})) });
    const repl = createRepl(io, handlers);
    repl.start();
    await io.type("시작\r");
    io.take();

    repl.write("부분 출력");
    const first = io.take();
    // 출력 뒤 개행을 넣고 그 아래에 입력 라인을 그린다
    expect(first).toContain("부분 출력\n");

    repl.write("이어지는 출력\n");
    const second = io.take();
    // 다음 출력은 입력 라인을 걷고 **한 행 위로 올라가** 이어 쓴다
    expect(second).toContain("\x1b[1A");
    expect(second).toContain("이어지는 출력");
    repl.close();
  });

  it("제출하면 readline이 에코한 원시 라인을 지운다 (§7)", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("사용자 입력");
    io.take();
    await io.type("\r");

    const painted = io.take();
    // 위로 올라가 화면 끝까지 지운다 — 포맷된 사용자 메시지는 렌더러가 그린다
    expect(painted).toContain("\x1b[1A");
    expect(painted).toContain("\x1b[0J");
    repl.close();
  });
});

describe("승인 대기 이양 (§8·§9)", () => {
  it("이양 중에는 approval-wait이고 readline이 입력을 놓는다", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    const keys: string[] = [];
    const result = repl.withApprovalWait(async () => {
      expect(repl.state).toBe("approval-wait");
      const onData = (chunk: Buffer): void => {
        keys.push(chunk.toString("utf8"));
      };
      io.input.on("data", onData);
      await io.type("y");
      io.input.off("data", onData);
      return "allow-once" as const;
    });

    expect(await result).toBe("allow-once");
    // 승인 UI가 읽는 키가 readline에 먹히지 않는다
    expect(keys).toEqual(["y"]);
    expect(repl.state).toBe("idle-input");

    // 복귀 후에도 입력이 정상 동작한다
    await io.type("복귀 확인\r");
    expect(handlers.prompt).toHaveBeenCalledWith("복귀 확인");
    repl.close();
  });

  it("이양 중 Ctrl+C는 abort로 간다 — 승인 UI가 아니라 REPL이 소유한다", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    await repl.withApprovalWait(async () => {
      await io.type("\x03");
    });

    expect(handlers.abort).toHaveBeenCalledTimes(1);
    expect(handlers.requestExit).not.toHaveBeenCalled();
    repl.close();
  });

  it("이양 중 입력 히스토리가 보존된다", async () => {
    const io = createIo();
    const repl = createRepl(io, createHandlers());
    repl.start();

    await io.type("기억할 입력\r");
    await tick();
    await repl.withApprovalWait(async () => undefined);

    io.take();
    await io.type("\x1b[A"); // ↑
    expect(stripAnsi(io.take())).toContain("기억할 입력");
    repl.close();
  });
});

describe("압축 구간 (COMPACTION §6 — T-009)", () => {
  it("압축 중에는 대화 입력도 슬래시 명령도 받지 않고, 거부가 보인다", async () => {
    // 근거: §6 "압축 중에는 진행 표시를 하고 입력을 받지 않는다". 조용히 삼키면
    //       사용자는 제출된 줄 알고 답을 기다린다(ARCHITECTURE §2.6).
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    await repl.withCompaction(async () => {
      expect(repl.state).toBe("compacting");
      io.take();

      await io.type("압축 중에 친 문장\r");
      await io.type("/sessions\r");
      await tick();

      const shown = stripAnsi(io.take());
      expect(shown).toContain("압축 중에는 입력을 받지 않는다");
      expect(handlers.prompt).not.toHaveBeenCalled();
      expect(handlers.dispatch).not.toHaveBeenCalled();
      expect(handlers.steer).not.toHaveBeenCalled();
    });

    expect(repl.state).toBe("idle-input");
  });

  it("압축 중 Ctrl+C는 요약 signal만 끊는다 — 런 abort도 종료도 아니다", async () => {
    // 근거: §6 "Ctrl+C는 요약 호출을 abort하고 구 세션을 그대로 유지한다".
    //       `approval-wait`의 Ctrl+C(=abort)와 의미가 다른 것이 4번째 상태의 근거다.
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    let observed: AbortSignal | undefined;
    await repl.withCompaction(async (signal) => {
      observed = signal;
      expect(signal.aborted).toBe(false);
      await io.type("\x03");
      await tick();
    });

    expect(observed?.aborted).toBe(true);
    expect(handlers.abort).not.toHaveBeenCalled();
    expect(handlers.requestExit).not.toHaveBeenCalled();
    repl.close();
  });

  it("거부된 입력은 히스토리에 남아 ↑로 되살아난다", async () => {
    const io = createIo();
    const repl = createRepl(io, createHandlers());
    repl.start();

    await repl.withCompaction(async () => {
      await io.type("되살릴 문장\r");
      await tick();
    });

    io.take();
    await io.type("\x1b[A"); // ↑
    expect(stripAnsi(io.take())).toContain("되살릴 문장");
    repl.close();
  });

  it("압축이 끝나면 이전 상태로 돌아간다 — 런 종료 직후의 압축이 상태를 바꾸지 않는다", async () => {
    // 자동 압축은 `run-active`가 아직 걷히기 전(런 종료 직후)과 `idle-input`(재개
    // 직후) 양쪽에서 불린다. 한쪽으로 고정하면 다른 쪽 상태가 압축 한 번으로 바뀐다.
    const io = createIo();
    let release: (() => void) | undefined;
    const handlers = createHandlers({
      prompt: vi.fn(
        async () =>
          await new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    });
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("질문\r");
    expect(repl.state).toBe("run-active");

    await repl.withCompaction(async () => {
      expect(repl.state).toBe("compacting");
    });
    expect(repl.state).toBe("run-active");

    release?.();
    await tick();
    expect(repl.state).toBe("idle-input");
    repl.close();
  });

  it("압축 중 출력도 라인 가드를 지난다 — 타이핑 중인 입력이 유실되지 않는다", async () => {
    // R-3: input.ts의 재그리기 실측 위에 쌓이는 변경이므로 기존 계약을 함께 본다.
    const io = createIo();
    const repl = createRepl(io, createHandlers());
    repl.start();

    await repl.withCompaction(async () => {
      await io.type("타이핑 중");
      io.take();
      repl.write("⧗ 압축 중\n");
      const shown = stripAnsi(io.take());
      expect(shown).toContain("⧗ 압축 중");
      // 출력 뒤에 입력 라인이 다시 그려진다
      expect(shown).toContain("타이핑 중");
    });
    repl.close();
  });
});

/**
 * Ctrl+D(EOF) — `docs/CLI-INTERFACE.md` §8 표의 이행. 표는 상태마다 한 행이므로
 * **여기 테스트도 상태마다 하나**다. 원리는 §8이 적은 한 문장이다: *"더 이상
 * 입력하지 않겠다"* — 대기 중인 물음이 없으면 그대로 수리한다.
 *
 * `approval-wait` 행(무효 키 → 재프롬프트)만 이 파일에 없다. 그 상태에서는
 * readline이 떼여 EOF가 REPL에 도달하지 않으므로(§8 — 규약이 아니라 구조가
 * 강제한다) 검증 자리가 승인 UI 쪽이다: `approval-ui.test.ts`의 "무효 키".
 */
describe("종료", () => {
  it("EOF(Ctrl+D)는 종료 시퀀스를 요청한다 — §8 `idle-input` 행", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    // 어느 행을 검증하는지는 상태가 정한다. 단언하지 않으면 이 테스트는
    // "기본 상태에서 EOF"일 뿐이고 표의 특정 행에 결선되지 않는다.
    expect(repl.state).toBe("idle-input");

    io.input.end();
    await tick();

    expect(handlers.requestExit).toHaveBeenCalledTimes(1);
    repl.close();
  });

  it("run-active에서 EOF는 종료 시퀀스다 — abort가 아니다 (§8 `run-active` 행)", async () => {
    // §8: "종료 시퀀스 — waitForIdle()이 런을 기다린 뒤 끝낸다. 진행 중인 것을
    //      버리지 않는다. **중단이 목적이면 그 키는 Ctrl+C**(abort)다."
    // 그래서 `abort` 미호출 단언이 이 테스트의 값이다 — 종료 요청만 확인하면
    // Ctrl+C와 갈리는 지점을 검증하지 않은 것이 된다.
    const io = createIo();
    const handlers = createHandlers({ prompt: vi.fn(async () => new Promise<void>(() => {})) });
    const repl = createRepl(io, handlers);
    repl.start();

    await io.type("런을 여는 입력\r");
    expect(repl.state).toBe("run-active");

    io.input.end();
    await tick();

    expect(handlers.requestExit).toHaveBeenCalledTimes(1);
    expect(handlers.abort, "Ctrl+D가 런을 버렸다 — 그건 Ctrl+C의 일이다").not.toHaveBeenCalled();
    repl.close();
  });

  it("compacting에서 EOF는 종료 시퀀스다 — 요약을 끊지 않는다 (§8 `compacting` 행)", async () => {
    // §8: "종료 시퀀스 — 압축을 기다린 뒤 끝낸다. 압축만 취소하려면 Ctrl+C".
    // 같은 자리의 Ctrl+C 테스트("압축 중 Ctrl+C는 요약 signal만 끊는다")와 이
    // 테스트가 반대 방향을 고정한다 — `signal.aborted` 단언이 그 축이다.
    // 근거는 `COMPACTION.md` §6("Ctrl+C는 요약 호출을 abort하고 구 세션을 유지")도 함께.
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    let observed: AbortSignal | undefined;
    await repl.withCompaction(async (signal) => {
      observed = signal;
      expect(repl.state).toBe("compacting");

      io.input.end();
      await tick();

      expect(handlers.requestExit).toHaveBeenCalledTimes(1);
      expect(signal.aborted, "Ctrl+D가 요약을 끊었다 — 그건 Ctrl+C의 일이다").toBe(false);
    });

    expect(observed?.aborted).toBe(false);
    expect(handlers.abort).not.toHaveBeenCalled();
    repl.close();
  });

  it("close()는 종료 요청을 만들지 않는다", async () => {
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    repl.close();
    await tick();

    expect(handlers.requestExit).not.toHaveBeenCalled();
  });
});

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 이스케이프를 벗기는 것이 목적이다
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}
