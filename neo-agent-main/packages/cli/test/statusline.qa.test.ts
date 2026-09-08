/**
 * 하단 고정 영역·상태줄 독립 검증 — `docs/CLI-INTERFACE.md` §7.1 (부수: §7·§8·§9).
 *
 * **`status.test.ts`와 재는 것이 다르다.** 그 파일은 `formatStatus` 순수 함수 하나를
 * 재고, 하단 고정 영역이 몇 행을 걷고 몇 행을 그리는가는 자기가 재지 않는다고 머리에서
 * 밝힌다. 여기서 재는 것은 그 나머지다 — **실제로 그려진 화면**. 그래서 모의 스트림에
 * `input.isTTY`와 `output.columns`를 **둘 다** 세운다: `src/input.ts`의 상태줄 게이트가
 * 그 둘을 함께 요구하므로 하나라도 빠지면 상태줄이 아예 그려지지 않고, 그 경로를 지나던
 * 기존 테스트는 이 파일이 생기기 전까지 0건이었다.
 *
 * **관측 수단을 스스로 만든다.** 하단 영역의 «걷은 행 수»와 «그린 행 수»는 출력 청크를
 * 눈으로 봐서는 세어지지 않는다 — 커서 이동과 화면 지우기의 누적 결과이기 때문이다.
 * 그래서 아래 `createScreen`이 ANSI를 해석하는 가상 화면을 만들고, 모든 단언이 그 화면의
 * **행 수와 행 내용** 위에서 돈다. 관측 수단 자체가 조용히 통과하는 도구가 되지 않도록
 * 첫 describe 블록이 그 화면을 먼저 검증하고, 각 축마다 **일부러 위반을 심어 붉는지**
 * 확인하는 역검증 짝을 둔다(모르는 이스케이프를 만나면 화면이 던지는 것도 같은 이유다 —
 * 조용히 무시하면 계산이 어긋난 채로 전 단언이 초록이 된다).
 *
 * 재는 넷 — 셋은 §7.1 말미가 이름으로 들고, 넷째는 본문 두 규정에서 나온다:
 *
 *   ① **구별과 비침묵** — 승인 모드가 `off`인 세션과 `manual`인 세션의 상태줄 출력이
 *      서로 갈리는가, `off`인 쪽이 비어 있지 않은가.
 *   ② **정확히 한 행** — 폭보다 긴 입력을 주고 잰다.
 *   ③ **걷은 행 수와 그린 행 수가 같은가** — 하단 영역이 한 단위로 지워지고 그려지는가.
 *   ④ **하단에 우리 것이 남지 않는가** — `approval-wait` 구간과 종료 뒤.
 *
 * 여기에 축 하나를 더 잰다 — §7.1 내용 표의 갱신 계기 열이 사용량 행에 실은 것이 둘이라
 * 재는 것도 둘이다: **교체 뒤에도 갱신이 이어지는가**(`turn_end`)와 **교체 직후에는
 * 항목이 없는가**(«Agent 교체(§6) 시 비움»). 뒤엣것은 표 아래 단락이 이름으로 든
 * 판정(«사용량은 Agent 교체를 넘지 못한다»)이고, 두 갈래(`/new`·`/compact`)에서 각각
 * 잰다 — 어느 갈래를 고르고 어느 갈래를 내렸는지는 그 블록 머리가 든다.
 *
 * **문면을 리터럴로 고정하지 않는다**(§7 말미 · §7.1 말미). 이 파일의 리터럴은 전부
 * 두 갈래 중 하나다 — 같은 값의 있음과 없음을 서로 다른 상태에서 재는 대비쌍이거나,
 * 테스트가 주입한 데이터가 그대로 통과했는지 확인하는 단언이다. 프롬프트 문자는
 * 구현이 내보내는 상수(`PROMPT`)를 임포트해서 쓴다 — 여기에 그 문자를 다시 적으면
 * §12가 세부로 위임한 것을 테스트가 계약으로 굳힌다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApprovalPrompt } from "../src/approval-ui.ts";
import { API_KEY_ENV } from "../src/credentials.ts";
import { createRepl, PROMPT, type Repl, type ReplHandlers } from "../src/input.ts";
import type { StatusFields } from "../src/status.ts";
import { displayWidth } from "../src/terminal.ts";
import type { CliDeps } from "../src/wiring.ts";
import { startCli } from "../src/wiring.ts";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/* ============================================================================
 * 관측 수단 — ANSI 가상 화면
 * ========================================================================== */

interface Screen {
  /** 스트림이 쓴 것을 화면에 반영한다 */
  write(chunk: string): void;
  /** 내용이 있는 마지막 행까지의 행 문자열들. 뒤 공백은 걷는다 */
  rows(): string[];
  cursor(): { row: number; col: number };
  /** 화면 전체 텍스트 — 잔여물 탐색용 */
  text(): string;
}

/**
 * 폭이 `columns`인 터미널을 흉내 낸다.
 *
 * 처리하는 것은 `src/terminal.ts`가 내보내는 제어(커서 위·열 이동, 화면 끝까지 지우기)와
 * readline이 쓰는 것(좌우 이동, 줄 끝까지 지우기, SGR)뿐이다. **그 밖의 이스케이프를
 * 만나면 던진다** — 관측 수단이 모르는 것을 조용히 넘기면 화면 상태가 실물과 갈린 채
 * 모든 단언이 통과한다(§2.6이 부르는 침묵 실패를 검증 도구 안에서 재현하는 셈이다).
 *
 * **개행의 열 처리는 이 화면의 모델링 선택이다**(제품 쪽 열린 판정이 아니므로 마커를
 * 달지 않는다 — `MARKERS.md` §3.2의 예약). `\n`을 **행 내림 + 열 0**으로 본다 — 실제 터미널에서 이 CLI가
 * 도는 조건(raw 모드에서도 ONLCR이 남는다)과 같고, `src/terminal.ts`의 `advanceColumn`이
 * 개행 뒤 열을 0부터 다시 세는 것과도 맞물린다. 정본이 정한 바는 없으나 이 선택이
 * 아래 단언을 바꾸지 않는다: 구현은 개행 뒤 열을 항상 `cursorToColumn`으로 명시한다.
 */
function createScreen(columns: number): Screen {
  /** 각 행은 열 인덱스로 접근하는 칸 배열. 전각 문자는 다음 칸을 빈 문자열로 채운다 */
  const grid: string[][] = [[]];
  let row = 0;
  let col = 0;

  const ensure = (index: number): string[] => {
    while (grid.length <= index) grid.push([]);
    return grid[index] as string[];
  };

  const put = (char: string): void => {
    const width = displayWidth(char);
    if (width === 0) return;
    if (col + width > columns) {
      row += 1;
      col = 0;
    }
    const cells = ensure(row);
    while (cells.length < col) cells.push(" ");
    cells[col] = char;
    for (let k = 1; k < width; k += 1) cells[col + k] = "";
    col += width;
  };

  const clearToEndOfLine = (): void => {
    const cells = ensure(row);
    cells.length = Math.min(cells.length, col);
  };

  const clearToEndOfScreen = (): void => {
    clearToEndOfLine();
    grid.length = row + 1;
  };

  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI를 해석하는 것이 목적이다
  const TOKEN = /\x1b\[([0-9;]*)([A-Za-z])|[\s\S]/g;

  return {
    write(chunk: string): void {
      TOKEN.lastIndex = 0;
      for (const match of chunk.matchAll(TOKEN)) {
        const [text, params, final] = match;
        if (final === undefined) {
          if (text === "\n") {
            row += 1;
            col = 0;
            ensure(row);
            continue;
          }
          if (text === "\r") {
            col = 0;
            continue;
          }
          const code = text.codePointAt(0) ?? 0;
          if (code < 0x20 || code === 0x7f) {
            throw new Error(`가상 화면이 모르는 제어 문자: U+${code.toString(16)}`);
          }
          put(text);
          continue;
        }

        const raw = params ?? "";
        const n = raw === "" ? 1 : Number(raw.split(";")[0]);
        switch (final) {
          case "A":
            row = Math.max(0, row - n);
            break;
          case "B":
            row += n;
            ensure(row);
            break;
          case "C":
            col = Math.min(columns - 1, col + n);
            break;
          case "D":
            col = Math.max(0, col - n);
            break;
          case "G":
            col = Math.max(0, Math.min(columns - 1, n - 1));
            break;
          case "J":
            if (raw === "" || n === 0) clearToEndOfScreen();
            else if (n === 2) {
              grid.length = 0;
              ensure(0);
              row = 0;
              col = 0;
            } else throw new Error(`가상 화면이 모르는 지우기: ESC[${raw}J`);
            break;
          case "K":
            if (raw === "" || n === 0) clearToEndOfLine();
            else throw new Error(`가상 화면이 모르는 줄 지우기: ESC[${raw}K`);
            break;
          case "m":
            break;
          default:
            throw new Error(`가상 화면이 모르는 이스케이프: ESC[${raw}${final}`);
        }
      }
    },

    rows(): string[] {
      const lines = grid.map((cells) => {
        let out = "";
        for (const cell of cells) out += cell ?? " ";
        return out.replace(/\s+$/u, "");
      });
      let last = lines.length - 1;
      while (last >= 0 && lines[last] === "") last -= 1;
      return lines.slice(0, last + 1);
    },

    cursor: () => ({ row, col }),
    text: () => grid.map((cells) => cells.join("")).join("\n"),
  };
}

describe("관측 수단 — 가상 화면 자체 검증", () => {
  it("평문·개행·감싸임을 행으로 센다", () => {
    const screen = createScreen(10);
    screen.write("abc\ndef");
    expect(screen.rows()).toEqual(["abc", "def"]);

    const wrapping = createScreen(10);
    wrapping.write("0123456789012");
    expect(wrapping.rows()).toEqual(["0123456789", "012"]);
  });

  it("전각 문자를 2칸으로 센다 — 감싸임 시점이 반각과 다르다", () => {
    const screen = createScreen(10);
    screen.write("가나다라마바");
    expect(screen.rows()).toEqual(["가나다라마", "바"]);
    expect(screen.cursor()).toEqual({ row: 1, col: 2 });
  });

  it("커서 위 이동 + 화면 끝까지 지우기가 아래 행을 걷는다", () => {
    const screen = createScreen(10);
    screen.write("a\nb\nc");
    expect(screen.rows()).toEqual(["a", "b", "c"]);
    screen.write("\x1b[2A\r\x1b[0J");
    expect(screen.rows()).toEqual([]);
    screen.write("x");
    expect(screen.rows()).toEqual(["x"]);
  });

  it("모르는 이스케이프를 조용히 넘기지 않는다", () => {
    const screen = createScreen(10);
    expect(() => screen.write("\x1b[2J")).not.toThrow();
    expect(() => screen.write("\x1b[5X")).toThrow();
    expect(() => screen.write("\x1b[1J")).toThrow();
  });

  /**
   * 역검증 — 이 화면이 **걷은 행 수와 그린 행 수의 어긋남**를 실제로 드러내는가.
   *
   * 2행을 그려 놓고 1행만 걷은 뒤 다시 2행을 그리면, 제대로 세는 화면에서는 행이
   * 하나 남는다. 여기서 행 수가 그대로라면 아래 축 ③의 단언은 무엇을 심어도 초록이다.
   */
  it("한 행 덜 걷으면 행이 남는다", () => {
    const honest = createScreen(20);
    honest.write("상태\n> ");
    honest.write("\x1b[1A\r\x1b[0J"); // 두 행을 한 단위로 걷는다
    honest.write("상태\n> ");
    expect(honest.rows()).toHaveLength(2);

    const broken = createScreen(20);
    broken.write("상태\n> ");
    broken.write("\r\x1b[0J"); // 상태줄 몫을 안 걷었다
    broken.write("상태\n> ");
    expect(broken.rows()).toHaveLength(3);
  });
});

/* ============================================================================
 * REPL 리그 — `input.isTTY`와 `output.columns`를 둘 다 세운 모의 터미널
 * ========================================================================== */

/** 출력 청크를 가로채 화면에 넣기 전에 망가뜨린다 — 역검증용 */
type Sabotage = (chunk: string) => string;

const SABOTAGE = {
  /**
   * 하단 영역을 걷을 때 올라가는 행 수를 하나 줄인다 — 상태줄 몫(`statusRows()`)을
   * 걷는 쪽에서만 빼먹은 구현의 재현이다. §7.1이 «두 영역에 각자의 클리어 경로»라
   * 부르며 금지한 상태와 화면상 같은 결과를 낸다.
   */
  eraseOneRowLess: ((chunk) =>
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 시퀀스를 겨냥한다
    chunk.replace(/\x1b\[(\d+)A/g, (_, digits: string) => {
      const rows = Number(digits) - 1;
      return rows > 0 ? `\x1b[${rows}A` : "";
    })) satisfies Sabotage,

  /** 걷는 경로가 실제로는 지우지 않는 구현의 재현 — 잔여물이 그대로 남는다 */
  neverClear: ((chunk) => chunk.replaceAll("\x1b[0J", "")) satisfies Sabotage,
};

interface Rig {
  input: PassThrough & { isTTY?: boolean };
  output: Writable & { columns?: number | undefined };
  screen: Screen;
  repl: Repl;
  /** 하단 고정 영역이 차지해야 하는 행 수 — 상태줄 몫 + 입력 라인 1행 */
  bottomRows: number;
  handlerCalls: string[];
  type(text: string): Promise<void>;
}

interface RigOptions {
  /** 가상 화면의 실제 폭 */
  columns?: number;
  /** 스트림이 REPL에게 알리는 폭. 기본은 `columns`와 같다 — 다르게 주면 그것이 사보타주다 */
  reportedColumns?: number;
  tty?: boolean;
  sabotage?: Sabotage;
  status?: Partial<StatusFields>;
  handlers?: Partial<ReplHandlers>;
}

function createRig(options: RigOptions = {}): Rig {
  const columns = options.columns ?? 60;
  const reported = options.reportedColumns ?? columns;
  const screen = createScreen(columns);
  const sabotage = options.sabotage ?? ((chunk: string) => chunk);

  const input = new PassThrough() as PassThrough & { isTTY?: boolean };
  if (options.tty !== false) input.isTTY = true;

  class Out extends Writable {
    columns: number | undefined = reported;
    override _write(
      chunk: unknown,
      _encoding: BufferEncoding,
      callback: (error?: Error | null) => void,
    ): void {
      screen.write(sabotage(String(chunk)));
      callback();
    }
  }
  const output = new Out();

  const handlerCalls: string[] = [];
  const handlers: ReplHandlers = {
    prompt: async (text) => void handlerCalls.push(`prompt:${text}`),
    steer: (text) => void handlerCalls.push(`steer:${text}`),
    abort: () => void handlerCalls.push("abort"),
    dispatch: async (line) => void handlerCalls.push(`dispatch:${line}`),
    requestExit: () => void handlerCalls.push("requestExit"),
    ...options.handlers,
  };

  const repl = createRepl({ input, output }, handlers);
  if (options.status !== undefined) repl.setStatus(options.status);

  return {
    input,
    output,
    screen,
    repl,
    bottomRows: options.tty !== false && reported > 0 ? 2 : 1,
    handlerCalls,
    async type(text: string): Promise<void> {
      input.write(text);
      await tick();
    },
  };
}

/**
 * 주입 데이터 — 화면에서 «우리 것»을 식별하는 표식.
 *
 * 문면을 고정하는 리터럴이 아니라 **테스트가 넣은 값이 나왔는가**를 보는 표식이다
 * (§7 말미가 허용으로 든 갈래). 상태줄이 걷혔는지 아닌지를 재려면 걷힐 대상이 화면에서
 * 식별돼야 하고, 그 식별을 표시 문구로 하면 그 순간 문구가 계약이 된다.
 */
const MODEL_PROBE = "MODELPROBE-9Z";
const SESSION_PROBE = "S3SS10NPR0BE";

/** 하단 고정 영역의 두 행. 상태줄이 없는 리그에서는 `status`가 `undefined`다 */
function bottomRegion(rig: Rig): { status: string | undefined; input: string } {
  const rows = rig.screen.rows();
  const input = rows.at(-1) ?? "";
  return { status: rig.bottomRows === 2 ? (rows.at(-2) ?? "") : undefined, input };
}

/**
 * 장부 — **걷은 행 수와 그린 행 수가 같은가**의 관측(측정 ③).
 *
 * 화면 행 수가 `트랜스크립트 + 하단 영역`과 정확히 같아야 한다. 덜 걷으면 남은 행이
 * 쌓여 이 수가 커지고, 더 걷으면 트랜스크립트가 먹혀 작아진다. 트랜스크립트 내용까지
 * 함께 보는 이유는 수만 맞고 자리가 밀린 경우를 가르기 위해서다.
 */
function expectLedger(rig: Rig, transcript: readonly string[], label: string): void {
  const rows = rig.screen.rows();
  expect(rows.length, `${label} — 화면 행 수(트랜스크립트 ${transcript.length} + 하단)`).toBe(
    transcript.length + rig.bottomRows,
  );
  expect(rows.slice(0, transcript.length), `${label} — 트랜스크립트 내용`).toEqual([...transcript]);
  // 입력 라인은 최하단이다(§7.1 층 순서). 상태줄은 그 **위**에 낀다.
  expect(rows.at(-1), `${label} — 입력 라인이 최하단`).toBe(PROMPT.trimEnd());
}

/** 측정 ① — 두 상태의 상태줄이 갈리고, 보호가 내려온 쪽이 비어 있지 않은가 */
function expectDistinctAndNonSilent(
  lowered: string | undefined,
  safe: string | undefined,
  label: string,
): void {
  expect(lowered, `${label} — 구별`).not.toBe(safe);
  expect((lowered ?? "").length, `${label} — 비침묵`).toBeGreaterThan(0);
}

/* ============================================================================
 * ① 구별과 비침묵 — 그려진 화면에서 (§7.1 말미 · §7 말미)
 * ========================================================================== */

describe("§7.1 ① 구별과 비침묵 — 그려진 상태줄", () => {
  it("승인 모드가 off인 세션과 manual인 세션의 상태줄 행이 갈리고, off 쪽이 비어 있지 않다", () => {
    const off = createRig({ status: { approvalMode: "off" } });
    const manual = createRig({ status: { approvalMode: "manual" } });
    off.repl.start();
    manual.repl.start();

    expectDistinctAndNonSilent(bottomRegion(off).status, bottomRegion(manual).status, "승인 모드");
    // 기본값 쪽은 아무것도 선언하지 않는다 — 상태줄은 정상이라는 것을 말하는 자리가
    // 아니라는 §7.1의 규정이 화면에서도 성립한다.
    expect(bottomRegion(manual).status).toBe("");

    off.repl.close();
    manual.repl.close();
  });

  it("셸이 호스트에서 도는 세션과 격리된 세션의 상태줄 행이 갈리고, 호스트 쪽이 비어 있지 않다", () => {
    const host = createRig({ status: { shellOnHost: true } });
    const sandboxed = createRig({ status: { shellOnHost: false } });
    host.repl.start();
    sandboxed.repl.start();

    expectDistinctAndNonSilent(
      bottomRegion(host).status,
      bottomRegion(sandboxed).status,
      "셸 호스트 실행",
    );

    host.repl.close();
    sandboxed.repl.close();
  });

  it("계약 항목 둘이 함께 내려온 화면은 하나만 내려온 화면과도 갈린다", () => {
    const both = createRig({ status: { approvalMode: "off", shellOnHost: true } });
    const onlyApproval = createRig({ status: { approvalMode: "off" } });
    const onlyShell = createRig({ status: { shellOnHost: true } });
    for (const rig of [both, onlyApproval, onlyShell]) rig.repl.start();

    expect(bottomRegion(both).status).not.toBe(bottomRegion(onlyApproval).status);
    expect(bottomRegion(both).status).not.toBe(bottomRegion(onlyShell).status);
    expect(bottomRegion(onlyApproval).status).not.toBe(bottomRegion(onlyShell).status);

    for (const rig of [both, onlyApproval, onlyShell]) rig.repl.close();
  });

  /**
   * 역검증 — 실경로 사보타주. TTY가 아니면 §7.1이 그리지 말라고 하므로 두 세션의
   * 화면이 같아지고, 그때 위 단언이 **실제로 붉어야** 한다. 붉지 않으면 그 단언은
   * 무엇을 심어도 통과하는 단언이다.
   *
   * 같은 테스트가 §7.1 그리기 게이트의 첫 축(입력이 TTY)을 함께 잰다.
   */
  it("역검증 — TTY가 아니면 두 세션의 하단이 같아지고 구별 단언이 붉는다", () => {
    const off = createRig({ tty: false, status: { approvalMode: "off" } });
    const manual = createRig({ tty: false, status: { approvalMode: "manual" } });
    off.repl.start();
    manual.repl.start();

    // 상태줄이 아예 없다 — 하단은 입력 라인 한 행뿐이다.
    expect(off.screen.rows()).toEqual([PROMPT.trimEnd()]);
    expect(manual.screen.rows()).toEqual([PROMPT.trimEnd()]);

    expect(() =>
      expectDistinctAndNonSilent(bottomRegion(off).status, bottomRegion(manual).status, "역검증"),
    ).toThrow();

    off.repl.close();
    manual.repl.close();
  });
});

/* ============================================================================
 * ② 상태줄은 정확히 한 행 (§7.1)
 * ========================================================================== */

/** 폭을 넘기려고 만든 값들 — 전각·반각·섞임을 각각 한 줄씩 */
const OVERFLOW: { label: string; status: Partial<StatusFields> }[] = [
  {
    label: "전각만",
    status: {
      approvalMode: "off",
      shellOnHost: true,
      model: "아주아주긴한글모델이름을넣어폭을훌쩍넘긴다".repeat(4),
      sessionId: "가나다라마바사아자차카타파하",
      usage: { input: 128_450, output: 9_812, cacheRead: 64_000, cacheWrite: 512 },
    },
  },
  {
    label: "반각만",
    status: {
      approvalMode: "off",
      shellOnHost: true,
      model: "some-very-long-model-identifier-that-will-not-fit".repeat(4),
      sessionId: "0123456789abcdef",
      usage: { input: 128_450, output: 9_812, cacheRead: 64_000, cacheWrite: 512 },
    },
  },
  {
    label: "섞임",
    status: {
      approvalMode: "off",
      shellOnHost: true,
      model: "모델claude-옵스-미리보기-2026년판".repeat(6),
      sessionId: "8f3a-세션-c1d2",
      usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
    },
  },
];

describe("§7.1 ② 상태줄은 정확히 한 행", () => {
  for (const columns of [20, 40, 80]) {
    for (const { label, status } of OVERFLOW) {
      it(`폭보다 긴 값을 줘도 하단이 두 행이다 — ${label} · columns=${columns}`, () => {
        const rig = createRig({ columns, status });
        rig.repl.start();

        const rows = rig.screen.rows();
        expect(rows, `${label} · columns=${columns}`).toHaveLength(2);
        expect(displayWidth(rows[0] ?? ""), "상태줄 폭").toBeLessThanOrEqual(columns);
        expect(rows.at(-1)).toBe(PROMPT.trimEnd());
        rig.repl.close();
      });
    }
  }

  it("제어 문자가 든 값이 상태줄을 두 행으로 만들지 못한다", () => {
    // 폭 계산은 제어 문자를 0칸으로 세므로(`terminal.ts`) 개행 하나가 폭을 하나도 안
    // 건드린 채 상태줄을 감싸이게 만들 수 있다 — 여기가 §7.1의 1행 제약이 가장 싸게
    // 깨지는 자리다.
    const rig = createRig({
      columns: 40,
      status: { approvalMode: "off", model: `모델\n둘째줄\r셋째\x1b[31m넷째`, sessionId: "a\nb" },
    });
    rig.repl.start();
    expect(rig.screen.rows()).toHaveLength(2);
    rig.repl.close();
  });

  it("상태줄이 그려진 뒤에도 커서는 화면 맨 아래 입력 라인에 있다 (§7.1 층 순서)", () => {
    const rig = createRig({ columns: 40, status: { approvalMode: "off" } });
    rig.repl.start();
    const rows = rig.screen.rows();
    expect(rig.screen.cursor().row).toBe(rows.length - 1);
    expect(rig.screen.cursor().col).toBe(displayWidth(PROMPT));
    rig.repl.close();
  });

  /**
   * 역검증 — 실경로 사보타주. 스트림이 폭을 실제보다 넓게 알린다(터미널 폭 40, 알린 폭
   * 400). 절단이 알린 폭을 기준으로 도므로 상태줄이 화면에서 감싸이고, 그때 위 단언이
   * 붉어야 한다. §7.1이 «폭을 넘으면 감싸임이 생기고 `cursorUp` 기반 계산이 전부
   * 틀어진다»고 든 그 상태를 그대로 만든 것이다.
   */
  it("역검증 — 폭을 넓게 속이면 상태줄이 감싸이고 1행 단언이 붉는다", () => {
    const rig = createRig({
      columns: 40,
      reportedColumns: 400,
      status: OVERFLOW[1]?.status ?? {},
    });
    rig.repl.start();

    const rows = rig.screen.rows();
    expect(rows.length).toBeGreaterThan(2);
    expect(() => expect(rows).toHaveLength(2)).toThrow();
    rig.repl.close();
  });
});

/* ============================================================================
 * ③ 걷은 행 수 == 그린 행 수 (§7.1 단위성)
 * ========================================================================== */

describe("§7.1 ③ 걷은 행 수와 그린 행 수", () => {
  it("출력이 반복돼도 하단 영역이 쌓이지 않는다", () => {
    const rig = createRig({ status: { approvalMode: "off", model: MODEL_PROBE } });
    rig.repl.start();
    expectLedger(rig, [], "그리기 직후");

    const transcript: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const line = `트랜스크립트 ${i}`;
      rig.repl.write(`${line}\n`);
      transcript.push(line);
      expectLedger(rig, transcript, `${i + 1}번째 출력 뒤`);
    }

    // 우리 것은 화면에 **하나만** 있다 — 걷힌 자리마다 남았다면 여러 번 나온다.
    expect(rig.screen.text().split(MODEL_PROBE)).toHaveLength(2);
    rig.repl.close();
  });

  it("행 중간에서 끊긴 출력을 이어 써도 장부가 맞는다", () => {
    const rig = createRig({ status: { approvalMode: "off", model: MODEL_PROBE } });
    rig.repl.start();

    // 스트리밍은 개행 없이 조각으로 온다. 하단 영역은 그 조각마다 걷혔다 다시 그려진다.
    rig.repl.write("조각");
    rig.repl.write("들이");
    rig.repl.write(" 이어진다\n");
    expectLedger(rig, ["조각들이 이어진다"], "조각 이어쓰기");
    expect(rig.screen.text().split(MODEL_PROBE)).toHaveLength(2);
    rig.repl.close();
  });

  it("상태줄 갱신을 반복해도 장부가 맞는다 — 되그리기는 단위 경로다", () => {
    const rig = createRig({ status: { approvalMode: "off", model: MODEL_PROBE } });
    rig.repl.start();
    rig.repl.write("첫 줄\n");

    for (let i = 0; i < 4; i += 1) {
      rig.repl.setStatus({ usage: { input: i, output: i, cacheRead: i, cacheWrite: i } });
      expectLedger(rig, ["첫 줄"], `${i + 1}번째 갱신 뒤`);
    }
    expect(rig.screen.text().split(MODEL_PROBE)).toHaveLength(2);
    rig.repl.close();
  });

  it("제출된 원시 입력 라인을 걷을 때도 상태줄 몫이 함께 걷힌다", async () => {
    const rig = createRig({ status: { approvalMode: "off", model: MODEL_PROBE } });
    rig.repl.start();

    await rig.type("사용자 입력\r");
    await tick();

    // 렌더러가 없으므로 트랜스크립트는 비어 있다. 제출된 원시 라인이 걷혔다면 화면은
    // 하단 영역 두 행뿐이다 — 안 걷혔거나 상태줄 몫을 빠뜨렸다면 그 자리가 남는다.
    expect(rig.handlerCalls).toContain("prompt:사용자 입력");
    expectLedger(rig, [], "제출 뒤");
    expect(rig.screen.text().split(MODEL_PROBE)).toHaveLength(2);
    rig.repl.close();
  });

  it("역검증 — 걷을 때 한 행을 덜 올라가면 장부가 붉는다", () => {
    const rig = createRig({
      status: { approvalMode: "off", model: MODEL_PROBE },
      sabotage: SABOTAGE.eraseOneRowLess,
    });
    rig.repl.start();
    rig.repl.write("트랜스크립트\n");

    expect(() => expectLedger(rig, ["트랜스크립트"], "역검증")).toThrow();
    // 남는 방향으로 어긋난다 — 상태줄이 걷히지 않아 화면에 둘이 된다.
    expect(rig.screen.rows().length).toBeGreaterThan(1 + rig.bottomRows);
    expect(rig.screen.text().split(MODEL_PROBE).length).toBeGreaterThan(2);
    rig.repl.close();
  });

  it("역검증 — 걷는 경로가 지우지 않으면 장부가 붉는다", () => {
    const rig = createRig({
      status: { approvalMode: "off", model: MODEL_PROBE },
      sabotage: SABOTAGE.neverClear,
    });
    rig.repl.start();
    rig.repl.write("트랜스크립트\n");

    expect(() => expectLedger(rig, ["트랜스크립트"], "역검증")).toThrow();
    rig.repl.close();
  });

  /**
   * 그리는 시점과 걷는 시점 사이에 **폭 판정이 갈리는** 경우 — §7.1 보증 밖 현행의 기록.
   *
   * `docs/CLI-INTERFACE.md` §7.1이 판정했다(2026-08-21 — 그전까지 SL-1 미규정):
   * 단위성의 판정은 결과 독해(«걷은 행 수 == 그린 행 수»)이되, 그 보증은 **그리기와
   * 걷기가 같은 폭 판정 아래 있을 때** 성립한다. 폭 상실은 실 TTY에서 일어나지 않는
   * 합성 경로라 보증 밖이고(이 리그가 그 합성이다), 리사이즈 리플로는 터미널 의존이라
   * 역시 보증 밖이다 — 즉시 되그리기는 §11의 트리거가 들고 있다.
   *
   * 하단 영역의 행 수는 한 함수(`statusRows()`)에서만 나오지만, 그리는 쪽과 걷는 쪽이
   * 그 함수를 **서로 다른 시점에** 부른다. 사이에 `output.columns`가 바뀌면 두 답이
   * 갈리고, 걷히지 않은 상태줄이 트랜스크립트 안에 죽은 채로 박힌다. 아래가 그 관측이고,
   * **보증 밖 현행의 기록으로 존치한다** — 여기가 붉으면 구현이 보증 범위를 스스로
   * 넓힌 것이므로, 그때 §7.1의 한정 문면과 함께 다시 판정한다.
   */
  it("SL-1 — 폭을 잃으면 걷히지 않은 상태줄이 트랜스크립트에 박힌다 — §7.1 보증 밖 현행 기록", () => {
    const rig = createRig({ columns: 40, status: { approvalMode: "off", model: MODEL_PROBE } });
    rig.repl.start();
    expectLedger(rig, [], "그리기 직후");

    // 그린 뒤에 폭이 사라진다. 이 뒤의 `statusRows()`는 0을 답한다.
    rig.output.columns = undefined;
    rig.repl.write("트랜스크립트\n");

    const rows = rig.screen.rows();
    // §7.1을 결과 쪽으로 읽으면 여기 남아야 하는 것은 트랜스크립트 한 행 + 입력 라인
    // 한 행이다. 실제로는 걷히지 않은 상태줄이 그 위에 죽은 채로 박힌다.
    expect(rows).toHaveLength(3);
    expect(rows[0], "걷히지 않은 상태줄").toContain(MODEL_PROBE);
    expect(rows[1]).toBe("트랜스크립트");
    rig.repl.close();
  });

  /**
   * 감싸인 입력 라인에서 커서를 앞 행으로 올린 뒤 제출하는 경로 — §7.1 차분 측정의 이행.
   *
   * `docs/CLI-INTERFACE.md` §7.1이 판정했다(2026-08-21 — 그전까지 SL-2 미규정):
   * 셋째 측정(«걷은 행 수 == 그린 행 수»)의 모집단은 **그 절이 만든 걷기·그리기
   * 경로**이고, readline 선재 결함은 절대값이 아니라 **차분으로** 잰다 — 상태줄이 있는
   * 화면과 없는 화면의 남는 행 수가 같으면 적합이다.
   *
   * readline이 감싸인 라인을 자기 방식으로 되그리는 자리라 걷은 행 수와 실제로 그려진
   * 행 수가 어긋난다 — **우리 개입이 없어도 그렇다**는 것이 `src/input.ts`의 R-1 실측
   * 3이 든 선재 결함이고, §7.1이 금지한 것은 그 결함을 우리가 **새로 만드는 것**이다.
   * 아래 대조가 정확히 그 차분 측정이다.
   */
  it("SL-2 — 감싸인 입력의 되그리기 결함이 상태줄 때문에 넓어지지는 않는다", async () => {
    const withStatus = createRig({ columns: 20, status: { approvalMode: "off" } });
    const withoutStatus = createRig({ columns: 20, tty: false });

    const residue: number[] = [];
    for (const rig of [withStatus, withoutStatus]) {
      rig.repl.start();
      await rig.type("012345678901234567890123456789");
      for (let i = 0; i < 25; i += 1) rig.input.write("\x1b[D");
      await tick();
      await rig.type("\r");
      residue.push(rig.screen.rows().length - rig.bottomRows);
      rig.repl.close();
    }

    // 둘 다 0이면 결함이 없는 것이고, 같은 값이면 상태줄이 넓히지 않은 것이다.
    // 실측(이 리그, 폭 20): 둘 다 2행이 남는다 — 결함은 실재하고, 상태줄이 그 수를
    // 늘리지 않는다. 값을 리터럴로 굳히지 않는 이유는 그것이 readline 쪽 세부이기
    // 때문이다. 여기서 계약이 요구하는 것은 **둘이 같다**뿐이다.
    expect(residue[0], `상태줄 있음 ${residue[0]} / 없음 ${residue[1]}`).toBe(residue[1]);
    expect(residue[0], "결함이 실재해야 이 대조가 의미를 갖는다").toBeGreaterThan(0);
  });
});

/* ============================================================================
 * ④ approval-wait 구간과 종료 뒤 — 하단에 우리 것이 남지 않는다 (§7.1)
 * ========================================================================== */

/** 화면 어디에도 우리 것이 없고, 하단 고정 영역도 없다 */
function expectNothingOfOurs(rig: Rig, transcript: readonly string[], label: string): void {
  const rows = rig.screen.rows();
  expect(rows, `${label} — 하단 영역이 걷혔다`).toEqual([...transcript]);
  expect(rig.screen.text(), `${label} — 상태줄 잔여물`).not.toContain(MODEL_PROBE);
  expect(rig.screen.text(), `${label} — 상태줄 잔여물`).not.toContain(SESSION_PROBE.slice(0, 8));
}

describe("§7.1 ④ approval-wait 구간에는 하단에 우리 것이 없다", () => {
  it("승인 대기 중에는 상태줄도 입력 라인도 화면에 없다", async () => {
    const rig = createRig({
      status: { approvalMode: "off", model: MODEL_PROBE, sessionId: SESSION_PROBE },
    });
    rig.repl.start();
    rig.repl.write("트랜스크립트\n");
    expectLedger(rig, ["트랜스크립트"], "승인 전");

    let inside: string[] = [];
    await rig.repl.withApprovalWait(async () => {
      inside = rig.screen.rows();
      expectNothingOfOurs(rig, ["트랜스크립트"], "승인 대기 중");
      // 이 구간의 상태 갱신은 값만 병합하고 그리지 않아야 한다 — 그리면 승인
      // 프롬프트와 겹치고, §9의 승인 표시 무가공은 그 자리에 우리 것이 없을 때만
      // 성립한다.
      rig.repl.setStatus({ usage: { input: 7, output: 7, cacheRead: 7, cacheWrite: 7 } });
      expectNothingOfOurs(rig, ["트랜스크립트"], "승인 대기 중 갱신 뒤");
    });

    expect(inside).toEqual(["트랜스크립트"]);
    // 복귀 뒤에는 다시 온전한 하단 영역이다.
    expectLedger(rig, ["트랜스크립트"], "승인 복귀 뒤");
    rig.repl.close();
  });

  it("실제 승인 프롬프트가 쓴 블록에 우리 것이 섞이지 않는다 (§9 무가공의 전제)", async () => {
    const rig = createRig({
      columns: 60,
      status: { approvalMode: "off", model: MODEL_PROBE, sessionId: SESSION_PROBE },
    });
    const prompt = createApprovalPrompt({ input: rig.input, output: rig.output });
    rig.repl.start();
    rig.repl.write("트랜스크립트\n");

    const display = "DISPLAYPROBE-QQ";
    const asked = rig.repl.withApprovalWait(async () => {
      const controller = new AbortController();
      const answer = prompt.ask(
        {
          toolCallId: "probe-1",
          toolName: "probe",
          subject: { kind: "shellExec", command: "probe", cwd: "/tmp" },
          display,
          warnings: [],
        },
        controller.signal,
      );
      await tick();
      // 프롬프트 블록이 그려진 이 시점의 화면에 우리 것이 있으면 승인 표시와 겹친다.
      expect(rig.screen.text()).toContain(display);
      expect(rig.screen.text()).not.toContain(MODEL_PROBE);
      expect(rig.screen.rows().at(-1)).not.toBe(PROMPT.trimEnd());
      rig.input.write("n");
      return await answer;
    });

    expect(await asked).toBe("deny");
    // 복귀 뒤 하단 영역은 승인 블록 **아래**에 다시 선다 — 겹쳐 그리지 않는다.
    const rows = rig.screen.rows();
    expect(rows.at(-1)).toBe(PROMPT.trimEnd());
    expect(rows.at(-2) ?? "").toContain(MODEL_PROBE);
    expect(rows.filter((row) => row.includes(MODEL_PROBE))).toHaveLength(1);
    rig.repl.close();
  });

  it("종료 뒤에는 하단에 우리 것이 남지 않는다", () => {
    const rig = createRig({
      status: { approvalMode: "off", model: MODEL_PROBE, sessionId: SESSION_PROBE },
    });
    rig.repl.start();
    rig.repl.write("트랜스크립트\n");

    rig.repl.close();
    expectNothingOfOurs(rig, ["트랜스크립트"], "종료 뒤");

    // 종료 시퀀스의 마지막 항목은 반납 **뒤**에 나간다(§2) — 인사가 트랜스크립트
    // 바로 아래에 붙고, 그 위에 죽은 상태줄이 없다.
    rig.repl.write("세션 id와 재개 방법\n");
    expect(rig.screen.rows()).toEqual(["트랜스크립트", "세션 id와 재개 방법"]);
  });

  it("역검증 — 걷는 경로가 지우지 않으면 잔여물 단언이 붉는다", async () => {
    const rig = createRig({
      status: { approvalMode: "off", model: MODEL_PROBE, sessionId: SESSION_PROBE },
      sabotage: SABOTAGE.neverClear,
    });
    rig.repl.start();
    rig.repl.write("트랜스크립트\n");

    await rig.repl.withApprovalWait(async () => {
      expect(() => expectNothingOfOurs(rig, ["트랜스크립트"], "역검증 · 승인 대기")).toThrow();
      expect(rig.screen.text()).toContain(MODEL_PROBE);
    });

    rig.repl.close();
    expect(() => expectNothingOfOurs(rig, ["트랜스크립트"], "역검증 · 종료 뒤")).toThrow();
  });

  /**
   * 승인 대기 **중에** 종료가 걸리는 경로.
   *
   * §7.1이 상태줄을 걷는 자리로 든 둘(`approval-wait`·종료 시퀀스)이 겹치는 자리다.
   * 복귀 경로가 종료 여부를 안 보면 인사 위에 죽은 상태줄이 다시 그려진다 — 두 규정이
   * 각각은 지켜지면서 맞물리는 자리에서만 깨지는 형태이므로 따로 잰다.
   */
  it("승인 대기 중에 종료되면 복귀가 상태줄을 되그리지 않는다", async () => {
    const rig = createRig({
      status: { approvalMode: "off", model: MODEL_PROBE, sessionId: SESSION_PROBE },
    });
    rig.repl.start();
    rig.repl.write("트랜스크립트\n");

    let release: (() => void) | undefined;
    const waiting = rig.repl.withApprovalWait(
      async () =>
        await new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await tick();
    rig.repl.close();
    release?.();
    await waiting;

    expectNothingOfOurs(rig, ["트랜스크립트"], "승인 대기 중 종료");
    rig.repl.write("세션 id와 재개 방법\n");
    expect(rig.screen.rows()).toEqual(["트랜스크립트", "세션 id와 재개 방법"]);
  });
});

/* ============================================================================
 * §7.1 «시계를 두지 않는다» — 갱신은 이벤트로만
 * ========================================================================== */

describe("§7.1 시계를 두지 않는다", () => {
  /**
   * 소스 검사인 이유: 타이머의 부재는 **일어나지 않는 일**이라 화면으로는 관측되지
   * 않는다. §7 머리가 렌더러를 이벤트 구독자로 못박고 §7.1이 그 위에 시간 기반 항목을
   * 금지했으므로, 상태줄 경로에 주기 실행이 들어오는 순간 그 두 절이 함께 거짓이 된다.
   * 이 검사가 없으면 스피너 하나가 조용히 들어와도 아무 테스트도 붉지 않는다.
   */
  it("상태줄 경로의 두 모듈에 주기 실행·시각 읽기가 없다", async () => {
    const { readFile } = await import("node:fs/promises");
    const here = new URL(".", import.meta.url);
    for (const name of ["status.ts", "input.ts"]) {
      const source = await readFile(new URL(`../src/${name}`, here), "utf8");
      const stripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      for (const forbidden of ["setInterval", "setTimeout", "performance.now", "Date.now"]) {
        expect(stripped.includes(forbidden), `${name} — ${forbidden}`).toBe(false);
      }
    }
  });

  it("역검증 — 같은 검사가 주기 실행이 든 소스에서는 붉는다", () => {
    const planted = "const timer = setInterval(draw, 120);";
    expect(() => expect(planted.includes("setInterval")).toBe(false)).toThrow();
  });
});

/* ============================================================================
 * 추가 축 — 세션 교체 뒤에도 사용량 갱신이 이어지는가 (§7.1 내용 표)
 * ========================================================================== */

let home: string;
let workspace: string;
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neo-statusline-qa-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  // `0b` 첫 기동 관문(`CLI-INTERFACE.md` §2.1)을 이미 지난 홈으로 만든다 — 판정은
  // `~/.neo-agent/sessions.db`의 부재 하나뿐이라 빈 파일 하나면 «returning»이 된다
  // (0바이트는 SQLite가 유효한 빈 DB로 취급한다). 없으면 조립이 관문에서 키를
  // 기다리며 끝나지 않는다. 모드를 명시하는 것은 umask가 writeFileSync의 mode를
  // 깎아 `loose-file-permissions` 경고가 새로 나가는 것을 막기 위해서다.
  writeFileSync(join(home, ".neo-agent", "sessions.db"), "");
  chmodSync(join(home, ".neo-agent", "sessions.db"), 0o600);
  mkdirSync(workspace, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 턴마다 다른 사용량을 싣는 모델 — 갱신이 **이어지는가**는 값이 바뀌어야 관측된다 */
function countingModel(): ModelClient {
  let turn = 0;
  return {
    modelId: "qa-statusline",
    async *stream(): AsyncIterable<ModelStreamEvent> {
      turn += 1;
      const input = 900_000 + turn;
      const text = `답 ${turn}`;
      yield { type: "text_delta", text };
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          stopReason: "end_turn",
          usage: { input, output: turn, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

interface WiringRig {
  deps: CliDeps;
  input: PassThrough & { isTTY?: boolean };
  screen: Screen;
  statusRow(): string;
}

function createWiringRig(columns = 120): WiringRig {
  const screen = createScreen(columns);
  const input = new PassThrough() as PassThrough & { isTTY?: boolean };
  input.isTTY = true;

  class Out extends Writable {
    columns: number | undefined = columns;
    override _write(
      chunk: unknown,
      _encoding: BufferEncoding,
      callback: (error?: Error | null) => void,
    ): void {
      screen.write(String(chunk));
      callback();
    }
  }

  return {
    input,
    screen,
    statusRow: () => screen.rows().at(-2) ?? "",
    deps: {
      argv: [],
      env: { [API_KEY_ENV]: "sk-ant-테스트" },
      cwd: workspace,
      home,
      io: { input, output: new Out() },
      version: "0.0.0-test",
      factories: {
        createModelClient: () => countingModel(),
        // `sandbox: "off"`에서는 판정 자체가 일어나지 않는 것이 계약이다(§2 단계 5b) —
        // 불리면 기동을 실패시켜 그 사실이 관측되게 한다.
        probeDocker: async () => {
          throw new Error('probeDocker가 불렸다 — sandbox: "off"에서는 판정하지 않는다.');
        },
      },
    },
  };
}

async function waitForStatus(rig: WiringRig, needle: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (rig.statusRow().includes(needle)) return;
    await tick();
  }
  throw new Error(
    `상태줄에 "${needle}"가 나타나지 않았다. 지금 상태줄: ${JSON.stringify(rig.statusRow())}\n화면:\n${rig.screen.rows().join("\n")}`,
  );
}

describe("§7.1 내용 표 — 세션 교체 뒤에도 갱신이 이어진다", () => {
  it("/new 뒤의 턴에도 상태줄 사용량이 갱신되고, 이전 세션 값은 남지 않는다", async () => {
    writeFileSync(
      join(home, ".neo-agent", "config.json"),
      JSON.stringify({ approvalMode: "off", sandbox: "off", model: "qa-model" }),
    );
    const rig = createWiringRig();
    const app = await startCli(rig.deps, { kind: "run" });
    const running = app.run();

    // 아직 턴이 없다 — 두 사용량 어느 쪽도 상태줄에 없다(단언이 공허하지 않다는 확인).
    expect(rig.statusRow()).not.toContain("900001");
    expect(rig.statusRow()).not.toContain("900002");
    // 계약 항목 둘은 이 구성에서 내려와 있으므로 상태줄이 침묵하면 안 된다.
    expect(rig.statusRow().length).toBeGreaterThan(0);

    const firstSession = app.parts.session.id;
    rig.input.write("첫 질문\r");
    await waitForStatus(rig, "900001");
    expect(rig.statusRow()).toContain(firstSession.slice(0, 8));

    rig.input.write("/new\r");
    await tick();
    for (let i = 0; i < 50 && app.parts.session.id === firstSession; i += 1) await tick();
    const secondSession = app.parts.session.id;
    expect(secondSession).not.toBe(firstSession);

    /**
     * 세션이 바뀐 **직후**의 상태줄 — 여기서는 **교체와 무관하게 남는 것**만 잰다.
     *
     * 사용량 항목이 그 순간 비어야 한다는 §7.1 판정(«사용량은 Agent 교체를 넘지
     * 못한다»)은 이 `it` 안에 두지 않는다. vitest는 첫 실패에서 `it`을 중단하므로
     * 그 단언이 여기 있으면 아래 셋(갱신 지속·관측 수단 역검증·종료 뒤 잔존 없음)이
     * 실행조차 되지 않는다. 그래서 파일 끝의 독립 블록으로 세웠다 — 그쪽이 붉는
     * 동안에도 이 `it`의 그린이 함께 관측되게 하는 것이 분리의 목적이다.
     */
    const rightAfterNew = rig.statusRow();
    expect(rightAfterNew, "세션 id는 교체 즉시 갈린다").toContain(secondSession.slice(0, 8));
    expect(rightAfterNew, "계약 항목은 세션 교체와 무관하게 유지된다").not.toBe("");

    rig.input.write("둘째 질문\r");
    await waitForStatus(rig, "900002");

    // 갱신이 이어졌다: 새 값이 실렸고 옛 값은 상태줄에서 사라졌다.
    expect(rig.statusRow()).not.toContain("900001");
    expect(rig.statusRow()).toContain(secondSession.slice(0, 8));

    /**
     * 역검증 — 관측 수단이 **상태줄만** 보는가.
     *
     * 첫 턴의 사용량은 렌더러가 트랜스크립트에도 한 줄로 남겼으므로(§7 표의 `turn_end`
     * 행) 화면 어딘가에는 아직 있다. 그런데 상태줄에는 없다 — 화면 전체를 훑는
     * 단언이었다면 위 줄이 통과할 수 없다. 상태줄이 그 한 줄을 **대체하지 않는다**는
     * §7.1의 규정이 함께 관측되는 자리이기도 하다.
     */
    expect(rig.screen.rows().some((row) => row.includes("900001"))).toBe(true);

    // 없는 값을 기다리면 실제로 붉는가 — 기다림이 무조건 통과하는 도구가 아니라는 확인.
    await expect(waitForStatus(rig, "900009", 50)).rejects.toThrow();

    await app.shutdown();
    await running;

    // 종료 뒤 하단에는 우리 것이 없다 — 마지막 행은 인사이고 그 위에 죽은 상태줄이 없다.
    const rows = rig.screen.rows();
    expect(rows.at(-1)).not.toBe(PROMPT.trimEnd());
    expect(rows.at(-1)).not.toContain("900002");
    expect(rows.at(-2) ?? "").not.toContain("qa-model");
  });
});

/* ============================================================================
 * 추가 축 ㉡ — 사용량은 Agent 교체를 넘지 못한다 (§7.1 내용 표 · 그 아래 단락)
 * ========================================================================== */

/**
 * 교체 갈래 — 고른 둘과 내린 하나.
 *
 * `docs/CLI-INTERFACE.md` §7.1의 표 아래 단락이 계기로 든 것은 «세션 생성·재개·압축의
 * Agent 교체(§6)» 셋이고, §6은 그 셋을 전부 «폐기 후 재생성» 하나로 묶는다. 이 축이
 * 시험하는 것은 그 묶음, 즉 비우는 자리가 하나뿐이라는 전제이므로 **부르는 쪽이 서로
 * 다른 둘**을 고른다:
 *
 *   `/new`     — 슬래시 디스패치가 직접 부르는 교체. 이 파일의 앞 블록이 이미 지나는 길이다.
 *   `/compact` — 압축 컨트롤러가 자기 트랜잭션 **안에서** 부르는 교체. §6이
 *                «자동 압축의 판정 시점은 CLI가 소유한다»고 둔 그 경로이고, 부르는 쪽이
 *                슬래시 핸들러가 아니라 압축 쪽이라 전제를 실제로 시험한다.
 *
 * **`/resume`은 내렸다.** `/new`와 같은 슬래시 디스패치에서 같은 교체 함수를 부르므로
 * 새 자리를 하나도 지나지 않고, 대신 재개 트랜스크립트(§6)가 화면에 딸려 와 관측만
 * 흐린다. 갈래를 하나 더 덮을 값이 생기면 그때 이쪽을 올린다.
 */
type SwitchKind = "/new" | "/compact";

interface SwitchObservation {
  /** 교체 **직전** 상태줄에 실려 있던 사용량의 표식 — 테스트가 주입한 값이다 */
  staleUsage: string;
  previousSessionId: string;
  sessionId: string;
  /** 교체 직후, 교체 후 첫 `turn_end` **전**의 상태줄 한 행 */
  rowAfterSwitch: string;
}

async function waitForSessionChange(
  app: { readonly parts: { readonly session: { readonly id: string } } },
  rig: WiringRig,
  previous: string,
  timeoutMs = 5000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = app.parts.session.id;
    if (current !== previous) return current;
    await tick();
  }
  throw new Error(
    `세션이 교체되지 않았다 (여전히 ${previous.slice(0, 8)}).\n화면:\n${rig.screen.rows().join("\n")}`,
  );
}

/**
 * 한 갈래를 끝까지 몰아 **교체 직후**의 상태줄 한 행을 떠 온다.
 *
 * `/compact`가 두 턴을 먼저 도는 이유는 압축 계획이 유지 구간 밖의 대화를 요구하기
 * 때문이다(`compactionKeepRecentTurns: 1` + 사용자 턴 둘). `compactionAuto`는 끈다 —
 * 자동이 켜져 있으면 교체가 우리가 부른 자리에서 일어났는지가 흐려진다.
 */
async function observeSwitch(options: {
  approvalMode: "off" | "manual";
  switchBy: SwitchKind;
}): Promise<SwitchObservation> {
  const turns = options.switchBy === "/compact" ? 2 : 1;
  writeFileSync(
    join(home, ".neo-agent", "config.json"),
    JSON.stringify({
      approvalMode: options.approvalMode,
      sandbox: "off",
      model: "qa-model",
      compactionAuto: false,
      compactionKeepRecentTurns: 1,
    }),
  );

  const rig = createWiringRig();
  const app = await startCli(rig.deps, { kind: "run" });
  const running = app.run();
  try {
    let staleUsage = "";
    for (let turn = 1; turn <= turns; turn += 1) {
      staleUsage = String(900_000 + turn);
      rig.input.write(`질문 ${turn}\r`);
      await waitForStatus(rig, staleUsage);
    }

    const previousSessionId = app.parts.session.id;
    rig.input.write(`${options.switchBy}\r`);
    const sessionId = await waitForSessionChange(app, rig, previousSessionId);
    return { staleUsage, previousSessionId, sessionId, rowAfterSwitch: rig.statusRow() };
  } finally {
    await app.shutdown();
    await running;
  }
}

/**
 * 상태줄 한 행에서 세션 id 몫을 걷는다 — 접두 길이를 모른 채로.
 *
 * 두 관측을 대조하려면 **교체마다 반드시 달라지는 항목**을 먼저 빼야 한다. 접두를 몇 자
 * 싣는지는 §7.1이 지위 열에서 세부로 위임했으므로 그 수를 테스트가 알면 안 된다 —
 * id의 가장 긴 접두부터 내려오며 화면에 실제로 실린 것을 찾아 걷는다.
 */
function withoutSessionId(row: string, id: string): string {
  for (let length = id.length; length >= 4; length -= 1) {
    const piece = id.slice(0, length);
    if (row.includes(piece)) return row.split(piece).join("");
  }
  return row;
}

/**
 * 한 갈래의 판정 — 부재 하나만 재지 않는다.
 *
 * §7.1이 사용량 항목의 부재를 요구할 때 **함께 서 있어야 하는 것**이 계약 항목 둘이다
 * (그 둘의 갱신 계기는 «없음(고정)»이라 교체와 무관하다). 부재 단언 하나만 두면 상태줄이
 * 통째로 사라진 화면에서도 초록이 되어 아무것도 안 재는 단언이 된다. 그래서 순서가 이렇다:
 *
 *   ⑴ 교체가 실제로 일어났는가 (전제 — 아니면 아래 전부가 공허하다)
 *   ⑵ 그 행이 **새 세션의** 상태줄인가 (얼어붙은 유령이 아니다)
 *   ⑶ 세션 id 몫을 걷고도 두 구성이 갈리고 비어 있지 않은가 — §7.1 말미의 «구별과 비침묵»을
 *      교체 직후 시점에 그대로 적용한 것이다. 승인 모드만 다른 두 관측이라, 걷고 남은
 *      차이는 계약 항목 하나뿐이다.
 *   ⑷ 그러고 나서야 부재.
 *
 * 부재를 맨 뒤에 두는 것도 의도다 — 붉을 때 위 셋이 이미 통과한 뒤라, 상태줄이 살아 있는데
 * 옛 값만 남았다는 것이 실패 메시지 그 자체로 읽힌다.
 */
function expectClearedOnSwitch(
  lowered: SwitchObservation,
  safe: SwitchObservation,
  label: string,
): void {
  expect(lowered.sessionId, `${label} — 교체가 일어났다`).not.toBe(lowered.previousSessionId);
  expect(safe.sessionId, `${label} — 대조군도 교체됐다`).not.toBe(safe.previousSessionId);

  expect(lowered.rowAfterSwitch, `${label} — 새 세션의 상태줄이다`).toContain(
    lowered.sessionId.slice(0, 8),
  );
  expect(lowered.rowAfterSwitch, `${label} — 떠난 세션 id는 남지 않는다`).not.toContain(
    lowered.previousSessionId.slice(0, 8),
  );

  expectDistinctAndNonSilent(
    withoutSessionId(lowered.rowAfterSwitch, lowered.sessionId),
    withoutSessionId(safe.rowAfterSwitch, safe.sessionId),
    `${label} — 교체 직후의 계약 항목`,
  );

  expect(
    lowered.rowAfterSwitch,
    `${label} — 교체 직후 상태줄에 떠난 세션의 사용량이 남았다`,
  ).not.toContain(lowered.staleUsage);
}

describe("§7.1 — 사용량은 Agent 교체를 넘지 못한다", () => {
  /**
   * `docs/CLI-INTERFACE.md` §7.1의 판정이다(2026-08-21 — 그전까지 SL-3 미규정):
   * 표의 갱신 계기 열이 사용량 행에 «Agent 교체(§6) 시 비움»을 싣고, 표 아래 단락이
   * 근거를 든다 — «떠난 세션의 값이 새 세션 id와 한 행에 나란히 서면» 사용자는 세부
   * 분류의 근거(«모르면 물어보면 되는 것»)에서 벗어나 틀리게 안다. 같은 단락이
   * «비우는 비용은 없다»고 못박았고 «항목 없음은 이미 이 절의 정상 상태다».
   *
   * 문면은 고정하지 않는다 — 재는 것은 **테스트가 주입한 사용량 값**의 있음과 없음이고
   * (앞 블록의 `countingModel`이 턴마다 다른 값을 싣는다), 그것이 §7 말미가 허용으로
   * 든 두 갈래 중 뒤엣것이다.
   */
  it("/new 교체 직후 상태줄에 떠난 세션의 사용량이 없다", async () => {
    const lowered = await observeSwitch({ approvalMode: "off", switchBy: "/new" });
    const safe = await observeSwitch({ approvalMode: "manual", switchBy: "/new" });
    expectClearedOnSwitch(lowered, safe, "/new");
  });

  it("/compact 교체 직후 상태줄에 떠난 세션의 사용량이 없다", async () => {
    const lowered = await observeSwitch({ approvalMode: "off", switchBy: "/compact" });
    const safe = await observeSwitch({ approvalMode: "manual", switchBy: "/compact" });
    expectClearedOnSwitch(lowered, safe, "/compact");
  });

  /**
   * 역검증 — 위 두 `it`의 관측 수단이 실제로 무언가를 잡는가.
   *
   * 판정이 요구하는 것과 정반대인 행(떠난 세션의 사용량이 그대로 실린 행)을 만들어
   * 같은 판정 함수에 넣는다. 여기서 던지지 않으면 위 둘은 무엇을 심어도 초록이다.
   * 함께 재는 것이 하나 더 있다 — 상태줄이 **통째로 사라진** 화면도 잡히는가. 부재
   * 단언만 있는 판정은 그 화면에서 조용히 통과한다.
   */
  it("역검증 — 옛 사용량이 남은 행도, 통째로 빈 행도 같은 판정에서 붉는다", () => {
    const base = {
      staleUsage: "900001",
      previousSessionId: "aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa",
      sessionId: "bbbbbbbb-2222-4444-8888-bbbbbbbbbbbb",
    };
    const safe: SwitchObservation = {
      ...base,
      previousSessionId: "cccccccc-3333-4444-8888-cccccccccccc",
      sessionId: "dddddddd-4444-4444-8888-dddddddddddd",
      rowAfterSwitch: "셸 호스트 · qa-model · dddddddd",
    };

    // ⑴ 옛 값이 남은 행 — 부재 단언이 잡아야 한다.
    const stale: SwitchObservation = {
      ...base,
      rowAfterSwitch: "승인 off · 셸 호스트 · qa-model · ↑900001 ↓1 ↺0 +0 · bbbbbbbb",
    };
    expect(() => expectClearedOnSwitch(stale, safe, "역검증 · 잔존")).toThrow();

    // ⑵ 상태줄이 통째로 사라진 화면 — 부재만 재는 판정이었다면 여기서 초록이다.
    const vanished: SwitchObservation = { ...base, rowAfterSwitch: "" };
    expect(vanished.rowAfterSwitch).not.toContain(vanished.staleUsage);
    expect(() => expectClearedOnSwitch(vanished, safe, "역검증 · 소멸")).toThrow();

    // ⑶ 적합한 행은 통과한다 — 판정이 무엇이든 던지는 도구가 아니라는 확인.
    const cleared: SwitchObservation = {
      ...base,
      rowAfterSwitch: "승인 off · 셸 호스트 · qa-model · bbbbbbbb",
    };
    expect(() => expectClearedOnSwitch(cleared, safe, "역검증 · 적합")).not.toThrow();
  });
});
