/**
 * 첫 기동 관문 단위 테스트 — `docs/CLI-INTERFACE.md` §2.1 (시작 시퀀스의 `3c`).
 *
 * 계약 표면은 QA의 계약 테스트가 본다(`first-run.qa.test.ts`). 여기서 고정하는 것은
 * **구현이 닫은 미규정 지점**이다 — §2.1이 §12에 위임한 표시 세부(응답 키·무효 키
 * 표기·선택 확인 표시)와, 한 청크에 여러 키가 실려 오는 스트림에서의 수리 규칙이다.
 * `approval-ui.test.ts` ↔ `approval-ui.contract.test.ts`의 분업을 그대로 따른다.
 *
 * **중단 입력의 처분은 그 목록에서 빠진다** — §2.1의 중단 입력과 응답 키 소절이 그것을
 * 계약으로 든다(2026-08-21 확정). 이 파일이 그 자리를 재는 것은 미규정을 닫아서가 아니라
 * 키를 아는 층이기 때문이다. 그 판정이 처음 선 자리는 플랜
 * `plans/20260821-firstrun-gate-plan.md` D-1이고, 지금은 근거 이력이다.
 *
 * **이 파일이 응답 키를 아는 것은 §2.1의 2026-08-21 확정을 따른 것이다.** 그 절의 중단
 * 입력과 응답 키 소절이 응답 키를 세부로 두었고, 계약 표면은 키에 무관한 형태로만 재되
 * 단위 층은 키를 안다고 정했다. 그러면서 그 층이 자기가 세부를 고정한다는 사실을 파일
 * 머리에 선언할 것을 요구한다 — 이 덩어리가 그 선언이다.
 *
 * **선택 확인 줄의 라벨↔값 대응은 §2.1의 귀결 표가 정본이다.** 프롬프트가 두 라벨을
 * 함께 그리므로 전체 출력을 재는 단정은 대응이 뒤바뀌어도 그대로 통과한다. 키를 넣은
 * 뒤에 나온 출력만 잘라서 재는 describe 하나가 그 자리를 맡는다.
 *
 * **문면 사실 셋 중 셋째는 두 층으로 갈려 있다.** 취소하면 아무것도 생기지 않는다는
 * 문장이 실제로 있는가는 여기서 리터럴로 고정하고, 그 주장이 참인가(Blue Pill 후
 * 홈이 비어 있는가)는 QA가 실물로 잰다. §7의 짝 없는 단독 리터럴 금지는 계약 검증의
 * 규율이고, 이 파일은 구현 선택을 못박는 자리라 리터럴이 그 자리의 수단이다.
 *
 * **판정 재료는 `sessions.db`의 부재 하나뿐이라는 것**(§2.1)이 `checkFirstRun`
 * describe의 주제다. 디렉터리만 있는 홈이 first-run으로 남는 것은 §4의 크리덴셜 안내를
 * 따른 사용자의 실제 형태이므로 여기서 못박는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 주석은 설계 정본의 문면을 인용부호로 담지 않는다 — 지목은 절 번호와 코드 표기로만
 * 하므로 §3.4의 대조 축(`U-1`·`D-1`·`D-2`) 중 인용부호에 걸리는 자리가 없다. 형식
 * 축(`D-3`~`D-5`)도 이 자리에 오지 않으나 그것이 대조를 면제하지는 않는다. 문서를
 * 줄번호로 가리키지 않는다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { defaultDatabasePath } from "@neo-agent/store";
import { describe, expect, it } from "vitest";
import { askFirstRunChoice, checkFirstRun } from "../src/first-run.ts";
import type { TerminalIo } from "../src/terminal.ts";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

// biome-ignore lint/suspicious/noControlCharactersInRegex: 이스케이프를 걷어내려면 찾아야 한다
const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g;

/** 스타일이 입힌 ANSI 이스케이프만 걷는다 — 남은 제어문자는 관문이 흘린 것이다 */
const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "");

/** 임시 홈. 관문은 홈을 주입받으므로 실제 `$HOME`을 건드리지 않는다 */
function makeHome(): string {
  return mkdtempSync(join(tmpdir(), "neo-first-run-"));
}

/** 관문이 보는 그 파일을 만든다 — 경로는 저장소의 정본 함수에서 받는다 */
function createDatabaseFile(home: string): void {
  const file = defaultDatabasePath(home);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "");
}

interface Harness {
  io: TerminalIo;
  input: PassThrough;
  out: { write(text: string): void };
  text(): string;
  /** `setRawMode`에 넘어간 값의 순서. TTY 갈래에서만 채워진다 */
  rawModes: boolean[];
}

function createHarness(options: { tty?: boolean } = {}): Harness {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  const rawModes: boolean[] = [];

  if (options.tty === true) {
    const tty = input as PassThrough & {
      isTTY?: boolean;
      setRawMode?: (mode: boolean) => unknown;
    };
    tty.isTTY = true;
    tty.setRawMode = (mode: boolean) => {
      rawModes.push(mode);
      return tty;
    };
  }

  return {
    io: { input, output } as TerminalIo,
    input,
    out: {
      write(text: string): void {
        chunks.push(text);
      },
    },
    text: () => chunks.join(""),
    rawModes,
  };
}

describe("checkFirstRun — 판정 재료는 sessions.db 하나뿐", () => {
  it("빈 홈은 first-run이다", () => {
    expect(checkFirstRun(makeHome())).toEqual({ kind: "first-run" });
  });

  it("디렉터리만 있고 sessions.db가 없으면 여전히 first-run이다", () => {
    // 크리덴셜 로더의 실패 안내를 따라 `mkdir -p ~/.neo-agent`를 이미 한 사용자의
    // 형태다(§2.1·§4). 디렉터리로 판정하면 그 사용자는 관문을 영영 못 본다.
    const home = makeHome();
    mkdirSync(dirname(defaultDatabasePath(home)), { recursive: true });

    expect(checkFirstRun(home)).toEqual({ kind: "first-run" });
  });

  it("sessions.db가 있으면 returning이다 — 0바이트여도 있는 것은 있는 것이다", () => {
    const home = makeHome();
    createDatabaseFile(home);

    expect(checkFirstRun(home)).toEqual({ kind: "returning" });
  });
});

describe("문면", () => {
  it("취소하면 아무것도 생기지 않는다는 문장이 있다", async () => {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    await tick();
    // 사실 ③의 **존재**를 고정한다. 그 주장이 참인가는 QA의 실물 단정이 잰다.
    expect(harness.text()).toContain("취소하면 아무것도 생기지 않는다.");

    harness.input.write("b");
    await asking;
  });

  it("선택한 뒤 무엇을 골랐는지가 화면에 남는다 — 조용히 지나가지 않는다", async () => {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    harness.input.write("r");
    expect(await asking).toBe("continue");
    expect(harness.text()).toContain("Red Pill");
  });
});

describe("선택 확인 줄 — 고른 값에 맞는 라벨이 나온다", () => {
  /**
   * 키를 넣고 **그 뒤에 나온 출력만** 돌려준다. 프롬프트는 두 라벨을 함께 그리므로
   * 전체 출력을 재면 대응이 뒤바뀌어도 잡히지 않는다 — 잘라내는 것이 이 헬퍼의 요점이다.
   */
  async function confirmationFor(key: string): Promise<{ choice: string; line: string }> {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    await tick();
    const before = harness.text().length;
    harness.input.write(key);
    const choice = await asking;

    return { choice, line: harness.text().slice(before) };
  }

  it("r을 고르면 확인 줄에 Red Pill이 있다", async () => {
    const { choice, line } = await confirmationFor("r");

    expect(choice).toBe("continue");
    expect(line, "고른 쪽의 라벨이 확인 줄에 없다").toContain("Red Pill");
    expect(line, "고르지 않은 쪽의 라벨이 확인 줄에 나왔다").not.toContain("Blue Pill");
  });

  it("b를 고르면 확인 줄에 Blue Pill이 있다", async () => {
    const { choice, line } = await confirmationFor("b");

    expect(choice).toBe("cancel");
    expect(line, "고른 쪽의 라벨이 확인 줄에 없다").toContain("Blue Pill");
    expect(line, "고르지 않은 쪽의 라벨이 확인 줄에 나왔다").not.toContain("Red Pill");
  });
});

describe("응답 키", () => {
  /** 키 하나를 주고 관문이 무엇으로 읽었는지 돌려준다 */
  async function choiceFor(key: string): Promise<string> {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });
    harness.input.write(key);
    return asking;
  }

  it("r은 Red Pill, b는 Blue Pill이다", async () => {
    expect(await choiceFor("r")).toBe("continue");
    expect(await choiceFor("b")).toBe("cancel");
  });

  it("대문자도 같은 키로 본다", async () => {
    expect(await choiceFor("R")).toBe("continue");
    expect(await choiceFor("B")).toBe("cancel");
  });
});

describe("무효 키", () => {
  /** 무효 키 하나를 넣고 그때 나온 재프롬프트 텍스트를 돌려준다 */
  async function retryTextFor(key: string): Promise<string> {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    await tick();
    const before = harness.text().length;
    harness.input.write(key);
    await tick();
    const retry = harness.text().slice(before);

    harness.input.write("b");
    await asking;
    return retry;
  }

  it("Enter는 선택이 아니다 — 기본 선택이 없으므로 재프롬프트로 간다", async () => {
    const harness = createHarness();
    let settled: string | undefined;
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() }).then(
      (choice) => {
        settled = choice;
      },
    );

    harness.input.write("\r");
    await tick();
    expect(settled, "Enter가 관문을 지나갔다").toBeUndefined();

    // 여전히 살아 있어 다음 키를 받는다
    harness.input.write("r");
    await asking;
    expect(settled).toBe("continue");
  });

  it("이름이 있는 키는 이름으로 보여준다 — 원시 이스케이프가 아니다", async () => {
    expect(await retryTextFor("\r")).toContain("Enter");
    expect(await retryTextFor("\t")).toContain("Tab");

    const esc = await retryTextFor("\x1b");
    expect(esc).toContain("Esc");
    // 스타일이 쓰는 ANSI 이스케이프를 걷어낸 뒤에 본다 — 걷지 않으면 이 단정은
    // `style`의 색 코드에 걸려 무효 키와 무관하게 실패한다.
    expect(stripAnsi(esc), "제어문자가 그대로 새어 나왔다").not.toContain("\x1b");
  });

  it("이름을 모르는 비가시 문자는 코드포인트로 보여준다", async () => {
    const retry = await retryTextFor("​");
    expect(retry).toContain("U+200B");
    expect(retry, "비가시 문자가 그대로 새어 나왔다").not.toContain("​");
  });

  it("무효 키를 알린 뒤 유효 키 둘을 다시 보인다", async () => {
    const retry = await retryTextFor("z");
    expect(retry).toContain("z");
    expect(retry).toContain("[r]");
    expect(retry).toContain("[b]");
  });

  it("같은 청크에 뒤따라온 유효 키를 잃지 않는다", async () => {
    // 실제 터미널은 키마다 청크가 오지만 파이프·모의 스트림은 여러 키를 한 청크로
    // 준다. 무효 키 하나에서 빠져나오면 뒤의 유효 키가 조용히 사라지고 관문이 영영
    // 답을 못 받는다.
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    harness.input.write("z\rb");
    expect(await asking).toBe("cancel");
  });
});

describe("중단 입력 — Blue Pill과 같은 귀결", () => {
  it("Ctrl+C는 취소다 — raw 모드에서는 SIGINT가 아니라 바이트로 온다", async () => {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    harness.input.write("\x03");
    expect(await asking).toBe("cancel");
  });

  it("Ctrl+D도 취소다", async () => {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    harness.input.write("\x04");
    expect(await asking).toBe("cancel");
  });

  it("스트림이 끝나면 취소다 — 답 없이 매달리지 않는다", async () => {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    harness.input.end();
    expect(await asking).toBe("cancel");
  });

  it("이미 끝난 스트림에도 답한다 — 그 경로에는 end가 다시 오지 않는다", async () => {
    const harness = createHarness();
    harness.input.resume();
    harness.input.end();
    await new Promise<void>((resolve) => {
      harness.input.on("end", () => resolve());
    });
    expect(harness.input.readable, "스트림이 아직 살아 있어 이 갈래를 재지 못한다").toBe(false);

    expect(await askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() })).toBe(
      "cancel",
    );
  });
});

describe("raw 모드", () => {
  it("TTY면 raw 모드로 바꾸고 답한 뒤 되돌린다", async () => {
    const harness = createHarness({ tty: true });
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    await tick();
    expect(harness.rawModes).toEqual([true]);

    harness.input.write("r");
    await asking;
    expect(harness.rawModes).toEqual([true, false]);
  });

  it("중단으로 끝나도 되돌린다 — 터미널을 raw로 두고 나가지 않는다", async () => {
    const harness = createHarness({ tty: true });
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    harness.input.write("\x03");
    await asking;
    expect(harness.rawModes).toEqual([true, false]);
  });

  it("모의 스트림에서는 raw 모드를 건드리지 않는다", async () => {
    const harness = createHarness();
    const asking = askFirstRunChoice({ io: harness.io, out: harness.out, home: makeHome() });

    harness.input.write("b");
    await asking;
    expect(harness.rawModes).toEqual([]);
  });
});
