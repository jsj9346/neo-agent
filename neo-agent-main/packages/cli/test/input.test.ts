/**
 * 입력 상태 머신 + REPL 단위 테스트 — `docs/CLI-INTERFACE.md` §8.
 *
 * 스트림을 전부 주입받는 구조라 실제 터미널 없이 검증한다. `terminal: true`를
 * 강제해서 readline이 실 터미널과 같은 경로(에코·keypress·자동완성)를 타게 한다 —
 * R-1 실측이 이 조건에서 나왔다.
 *
 * **`terminal: true` 하나로는 그 경로가 보장되지 않는다**(2026-09-08 실측 — V-1).
 * `TERM=dumb`이면 Node는 그 플래그를 그대로 둔 채 키 핸들러만 축소판으로 바꾸므로
 * 전제가 조용히 깨진다. 그래서 두 층으로 든다: `vitest.config.ts`가 환경을 고정하고,
 * 아래 `beforeAll`이 전제를 **행동으로** 재서 깨졌으면 red가 아니라 즉시 중단을 낸다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createRepl, PROMPT, type ReplHandlers } from "../src/input.ts";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * 화면에 남은 「안내」만 걷어낸다 — 에코와 프롬프트를 뺀 나머지다.
 *
 * §7이 재라고 한 **비침묵**을 「출력이 비어 있지 않다」로 재면 판별력이 0이다:
 * 거부를 침묵시켜도 `showInput()`의 프롬프트 되그리기가 출력을 남기기 때문이다
 * (2026-09-08 변이로 실측 — 그 축은 침묵 거부를 통과시켰다). 안내의 실물은
 * 「사용자가 친 것도, 프롬프트도 아닌 줄」이고 이 함수가 그것을 돌려준다.
 *
 * 문면을 단언하지 않으므로 §7의 금지축(단독 리터럴)에 걸리지 않는다 —
 * 문구를 다듬어도 이 축은 안 깨지고, 안내가 사라지면 깨진다.
 */
function noticeLines(shown: string, ...typed: string[]): string[] {
  return shown
    .split("\n")
    .map((line) => line.replaceAll("\r", "").replaceAll(PROMPT, "").trim())
    .filter((line) => line !== "" && !typed.includes(line));
}

/**
 * 전제 가드 — 머리가 선언한 「실 터미널과 같은 경로」가 실제로 살아 있는지 잰다.
 *
 * 이 파일의 탭 자동완성·방향키 히스토리·라인 되그리기 축은 readline이 **완전한**
 * 키 핸들러를 쓸 때만 성립한다. 그 전제가 깨지면 축들은 「어겼다」가 아니라
 * 「못 쟀다」가 되는데, 화면에는 red로 똑같이 나타난다 — 2026-09-07에 그 혼동이
 * 카드 2장으로 2일·3사이클을 물었다(V-1).
 *
 * **`rl.terminal`로는 못 잰다.** `TERM=dumb`에서 Node는 `terminal`을 `true`로 둔 채
 * `_ttyWrite`만 축소판으로 바꾼다(실측 — 리포트 §3.2). 그래서 플래그가 아니라
 * **행동**을 잰다: 탭이 completer에 닿는가. 이 축은 강등의 경로를 묻지 않으므로
 * `TERM` 말고 다른 것이 같은 강등을 들여와도 걸린다.
 *
 * 걸리면 red가 아니라 **즉시 중단**이다. red는 「계약이 깨졌다」는 뜻이어야 하고,
 * 여기서 깨진 것은 계약이 아니라 측정 장치다.
 * > 상세: `plans/20260908-input-test-verify-report.md` V-1
 */
beforeAll(async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  let completerCalls = 0;
  const probe = createInterface({
    input,
    output,
    terminal: true,
    completer: (line: string): [string[], string] => {
      completerCalls += 1;
      return [[], line];
    },
  });
  probe.on("line", () => {});

  input.write("/probe\t");
  await tick();
  probe.close();

  if (completerCalls === 0) {
    throw new Error(
      "이 파일의 전제가 깨졌다 — readline이 축소 키 핸들러로 돌고 있어 §8의 탭 자동완성·" +
        "히스토리·라인 되그리기를 **잴 수 없다**. 이 상태의 실패는 계약 위반이 아니라 미측정이다.\n" +
        `TERM=${JSON.stringify(process.env.TERM)} — 알려진 원인은 \`TERM=dumb\`이고, ` +
        "고정 자리는 `packages/cli/vitest.config.ts`의 `test.env`다.",
    );
  }
});

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
    // §7 — 표시 문구는 **세부**다. 테스트가 그 문면을 리터럴로 고정하면 문서가 세부라
    // 부르는 것을 기계가 불변으로 지키게 되고, 문구를 다듬는 일이 계약 변경으로
    // 나타난다(`K-010`·`K-148`). §7이 재라고 한 것은 **구별과 비침묵** 둘이다.
    //
    // 비침묵을 「출력이 비어 있지 않다」로 재면 **안 잡힌다** — 거부를 침묵시켜도
    // `showInput()`의 프롬프트 되그리기가 출력을 남기기 때문이다(2026-09-08 변이로
    // 실측: 그 축은 침묵 거부를 통과시켰다). 그래서 에코와 프롬프트를 걷어낸 **나머지**를
    // 잰다 — 그것이 「안내」의 실물이다.
    const submit = async (
      state: "idle-input" | "run-active",
      line: string,
    ): Promise<{ notice: string[]; handlers: ReturnType<typeof createHandlers> }> => {
      const io = createIo();
      const handlers = createHandlers(
        state === "run-active" ? { prompt: vi.fn(async () => new Promise<void>(() => {})) } : {},
      );
      const repl = createRepl(io, handlers);
      repl.start();

      if (state === "run-active") {
        await io.type("작업 시작\r");
      }
      // 어느 상태를 재는지 단언하지 않으면 대비쌍의 두 항이 같은 것이 될 수 있다
      expect(repl.state).toBe(state);
      io.take();

      await io.type(`${line}\r`);
      await tick();

      const notice = noticeLines(stripAnsi(io.take()), line);
      repl.close();
      return { notice, handlers };
    };

    const rejected = await submit("run-active", "/new");
    // 거부 — 어느 경로로도 가지 않는다
    expect(rejected.handlers.dispatch).not.toHaveBeenCalled();
    expect(rejected.handlers.steer).not.toHaveBeenCalled();

    // 대비쌍의 짝 — **같은 상태의 같은 제출**인데 평문은 안내를 낳지 않는다.
    // 이 짝이 있어야 「안내가 있다」가 프롬프트 되그리기와 구별된다
    const steered = await submit("run-active", "그냥 문장");
    expect(steered.handlers.steer).toHaveBeenCalledWith("그냥 문장");
    expect(steered.notice, "평문 제출이 안내를 냈다 — 대비쌍이 성립하지 않는다").toEqual([]);

    // 비침묵 — 거부는 화면에 남는다. 조용히 삼키면 사용자는 제출된 줄 알고 기다린다(§2.6)
    expect(rejected.notice, "거부를 조용히 삼켰다 — 안내가 화면에 없다").not.toEqual([]);

    // 구별 — 같은 슬래시 입력이 상태에 따라 다른 곳으로 간다
    const dispatched = await submit("idle-input", "/new");
    expect(dispatched.handlers.dispatch).toHaveBeenCalledWith("/new");
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

      // §7 — 문면은 세부다. 여기 있던 단독 리터럴은 §7의 금지축이었고, 더구나 같은
      // 리터럴이 `compaction-integration.test.ts`에도 있어 구현 문구를 한 글자 다듬으면
      // 두 파일이 함께 깨졌다(V-4). 재는 것을 «구별과 비침묵»으로 옮긴다.
      expect(
        noticeLines(stripAnsi(io.take()), "압축 중에 친 문장", "/sessions"),
        "압축 중 거부를 조용히 삼켰다",
      ).not.toEqual([]);
      expect(handlers.prompt).not.toHaveBeenCalled();
      expect(handlers.dispatch).not.toHaveBeenCalled();
      expect(handlers.steer).not.toHaveBeenCalled();
    });

    expect(repl.state).toBe("idle-input");

    // 대비쌍의 짝 — **같은 두 입력**이 `idle-input`에서는 안내를 낳지 않고 제 경로로 간다.
    // 이 짝이 있어야 「안내가 있다」가 상태에 결선된다(§7: 서로 다른 상태가 서로 다른
    // 출력을 낳는가). 복귀 직후의 같은 REPL로 재므로 조건도 같다
    io.take();
    await io.type("압축 중에 친 문장\r");
    await io.type("/sessions\r");
    await tick();

    expect(
      noticeLines(stripAnsi(io.take()), "압축 중에 친 문장", "/sessions"),
      "압축이 끝났는데도 거부 안내가 나왔다 — 안내가 상태에 결선되지 않았다",
    ).toEqual([]);
    expect(handlers.prompt).toHaveBeenCalledWith("압축 중에 친 문장");
    expect(handlers.dispatch).toHaveBeenCalledWith("/sessions");
    repl.close();
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
 * `approval-wait` 행의 **처분**(무효 키 → 재프롬프트)만 이 파일에 없다. 그 상태에서는
 * readline이 떼여 EOF가 REPL에 도달하지 않으므로(§8 — 규약이 아니라 구조가
 * 강제한다) 그 처분의 검증 자리는 승인 UI 쪽이다: `approval-ui.test.ts`의 "무효 키".
 *
 * **그 행 자체는 이 파일에도 있다** — 아래 마지막 `it`이 EOF가 REPL에 **도달하지
 * 않는다는 구조**를 재고, 그것은 처분과 다른 대상이다. 이 구절이 없으면 머리가
 * 「그 행은 여기 없다」로 읽혀 그 `it`을 못 찾게 한다.
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
    // §8 `run-active` 행 — D-1대로 표의 두 칸을 각각 인용한다.
    //   처분: "종료 시퀀스(§2) — `waitForIdle()`이 런을 기다린 뒤 끝낸다"
    //   근거: "진행 중인 것을 버리지 않는다. **중단이 목적이면 그 키는 Ctrl+C**(abort)다"
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
    // §8 `compacting` 행 — D-1대로 두 칸을 각각 인용한다.
    //   처분: "종료 시퀀스(§2) — 압축을 기다린 뒤 끝낸다 (대기 지점은 §2가 열거한다)"
    //   근거: "위와 같다. 압축만 취소하려면 Ctrl+C(`COMPACTION.md` §6)"
    // 같은 자리의 Ctrl+C 테스트("압축 중 Ctrl+C는 요약 signal만 끊는다")와 이
    // 테스트가 반대 방향을 고정한다 — `signal.aborted` 단언이 그 축이다.
    // 근거는 `COMPACTION.md` §6("Ctrl+C는 요약 호출을 abort하고 구 세션을 그대로
    // 유지한다")도 함께.
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

  it("approval-wait에서 EOF는 REPL에 도달하지 않는다 — §8 `approval-wait` 행의 구조", async () => {
    // §8: "그 상태에서는 REPL이 readline을 떼고 승인 UI가 입력을 소유하므로(§9 이양)
    //      EOF가 애초에 REPL에 도달하지 않는다"
    //     — 그리고 "규약이 아니라 구조가 이 구분을 강제하며".
    //
    // 이 테스트는 T-007 역검증이 열어 준 자리다: `withApprovalWait`의 `detach()`를
    // 지웠더니 빨개진 것이 Ctrl+C 테스트뿐이었다. `approval-ui.test.ts`의 Ctrl+D
    // 테스트들은 승인 UI를 **단독으로** 세우므로 REPL의 이양이 사라져도 초록이다 —
    // 즉 §8 `approval-wait` 행의 구조 주장을 지키는 단언이 어디에도 없었다.
    const io = createIo();
    const handlers = createHandlers();
    const repl = createRepl(io, handlers);
    repl.start();

    await repl.withApprovalWait(async () => {
      expect(repl.state).toBe("approval-wait");
      io.input.end();
      await tick();

      expect(
        handlers.requestExit,
        "EOF가 REPL까지 왔다 — 승인 대기 중의 Ctrl+D가 종료로 읽혔다",
      ).not.toHaveBeenCalled();
    });

    expect(handlers.requestExit).not.toHaveBeenCalled();
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
