/**
 * 독립 QA — `docs/CLI-INTERFACE.md` §5·§9의 **계약 항목 중 기존 계약 테스트가 재지 않는
 * 것**을 잰다.
 *
 * 대상은 `packages/cli/test/args.contract.test.ts`·`approval-ui.contract.test.ts`이고,
 * 이 파일은 그 둘을 대체하지 않는다 — 두 파일의 단언이 통과하면서도 §5·§9 위반이 통과할
 * 수 있는 자리에만 술어를 세운다. 기대값은 전부 정본 문면에서 도출했고 구현을 읽어 정하지
 * 않았다.
 *
 * 재는 자리(정본 근거):
 *   §5 "`neo-agent --resume <접두>`(재개)"           — 접두가 **그것만** 결과를 가른다
 *   §5 "닫힌 목록 밖의 argv와 인자 없는 `--resume`은 사용법 에러다" — 던지는 것이
 *      **에러**이고 내용이 비어 있지 않은가(§2.6 침묵 실패 차단)
 *   §9 "색상·테두리 장식은 `display` 문자열 **밖**에만 붙인다"      — 원시 출력에서 잰다
 *   §9 "`display`의 각 줄 바이트는 출력에서 보존돼야 하고 줄 수를 바꾸지 않는다"
 *   §9 "선택지: **allow-once / allow-always / deny.**"              — 부정 단언의 공회전 방지
 *   §9 "**기본 선택(그냥 Enter)은 존재하지 않는다**"                 — CR·CRLF 포함
 *   §9 "**특별 취급하는 키는 Ctrl+C 하나다**"                        — 그 키가 응답이 되지 않는다
 *   §9 "**Ctrl+D도 여기 포함되어 EOF·취소 어느 쪽으로도 해석되지 않는다**"
 *   §9 "제어·비가시 문자는 이름(`Ctrl+D`·`Enter`)이나 코드포인트(`U+00A0`)로 표시한다"
 *   §9 "abort 시 `ask`는 reject한다 — `\"deny\"`를 지어내지 않는다"
 *
 * 표시 문구는 세부이므로 문면을 리터럴로 고정하지 않는다(§7 2026-08-17 · K-148). 여기의
 * 리터럴은 전부 **테스트가 주입한 데이터**이거나 **구별·비침묵 프로브**다.
 *
 * 마지막 describe는 **역검증**이다 — 위 술어가 일부러 넣은 위반을 실제로 잡는지 확인한다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { PassThrough } from "node:stream";
import type { ApprovalRequest, ApprovalResponse } from "@neo-agent/gate";
import { beforeAll, describe, expect, it } from "vitest";
import { CaptureStream, flush, loadCliModule, pickExport, stripAnsi } from "./harness.ts";

// ---------------------------------------------------------------------------
// 부품
// ---------------------------------------------------------------------------

interface PromptLike {
  ask(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalResponse>;
}

type Build = (input: PassThrough, output: CaptureStream) => PromptLike;

interface Outcome {
  settled: boolean;
  result?: ApprovalResponse;
  error?: unknown;
  /** 장식을 벗기지 않은 그대로 — §9 "장식은 문자열 밖에만"을 재려면 원시가 필요하다 */
  raw: string;
  /** n번째 관측점(0 = 최초 렌더 직후) 이후에 나온 출력 */
  since: (index: number) => string;
}

/** ask()를 띄우고 키를 순서대로 흘려 넣는다. 각 키 사이에 이벤트 루프를 돌린다 */
async function exercise(
  build: Build,
  request: ApprovalRequest,
  keystrokes: readonly string[] = [],
  options: { abortAfterPrompt?: AbortController } = {},
): Promise<Outcome> {
  const input = new PassThrough();
  const output = new CaptureStream();
  const controller = options.abortAfterPrompt ?? new AbortController();
  const prompt = build(input, output);

  const outcome: Outcome = { settled: false, raw: "", since: () => "" };
  const promise = prompt.ask(request, controller.signal).then(
    (result) => {
      outcome.settled = true;
      outcome.result = result;
    },
    (error) => {
      outcome.settled = true;
      outcome.error = error;
    },
  );

  await flush(3);
  const marks: number[] = [output.text.length];

  if (options.abortAfterPrompt) {
    options.abortAfterPrompt.abort(new Error("QA: 승인 대기 중 중단"));
    await flush(5);
  }

  for (const keystroke of keystrokes) {
    input.write(keystroke);
    await flush(3);
    marks.push(output.text.length);
  }

  await Promise.race([promise, flush(5)]);
  outcome.raw = output.text;
  outcome.since = (index) => output.text.slice(marks[index] ?? 0);
  input.end();
  return outcome;
}

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    toolCallId: "qa-call",
    toolName: "shell",
    subject: { kind: "shellExec", command: "npm run build", cwd: "/ws" },
    display: "npm run build",
    warnings: [],
    ...overrides,
  };
}

/**
 * `display`의 여러 줄이 출력에서 **연속한 줄들**로 나왔는지.
 *
 * §9는 줄 앞 접두(들여쓰기·테두리)를 밖의 장식으로 허용하므로 줄 동일성이 아니라 꼬리
 * 일치로 찾되, **줄 수를 바꾸지 않는다**는 계약은 "첫 줄과 마지막 줄의 간격 = 줄 수 - 1"로
 * 잰다. 사이에 빈 줄·구분선을 끼우는 구현은 여기서 걸린다.
 */
function displayBlock(
  text: string,
  lines: readonly string[],
): { first: number; last: number; missing?: string } {
  const out = stripAnsi(text).split("\n");
  let cursor = -1;
  let first = -1;
  for (const line of lines) {
    const at = out.findIndex((candidate, index) => index > cursor && candidate.endsWith(line));
    if (at === -1) return { first, last: cursor, missing: line };
    if (first === -1) first = at;
    cursor = at;
  }
  return { first, last: cursor };
}

// ---------------------------------------------------------------------------
// §5 — argv
// ---------------------------------------------------------------------------

let parseArgs: (argv: readonly string[]) => unknown;

/** 결과를 비교 가능한 문자열로 — 형태는 문서가 정하지 않았으므로 구조 전체를 본다 */
function shape(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "function" ? "[fn]" : item));
}

function thrownBy(argv: readonly string[]): unknown {
  try {
    parseArgs(argv);
  } catch (error) {
    return error;
  }
  return undefined;
}

beforeAll(async () => {
  const module = await loadCliModule("args.ts");
  parseArgs = pickExport(module, ["parseArgs", "parseArgv", "parseCliArgs"], "argv 파서");
});

describe("argv — 접두의 소유 범위 (CLI-INTERFACE §5)", () => {
  it("--resume 결과는 접두 하나만 다르다", () => {
    // 근거: §5가 재개 형태를 `neo-agent --resume <접두>`로 든다. 기존 계약 테스트는
    // "접두가 결과 어딘가에 있다"만 재므로, 접두를 상수로 갈아 끼우거나 다른 필드까지
    // 함께 흔드는 파서를 통과시킨다. 여기서는 **접두를 치환하면 두 결과가 같아지는가**로
    // 잰다 — 접두가 그대로 실려가고 그 밖의 것은 접두에 의존하지 않는다는 뜻이다.
    const first = shape(parseArgs(["--resume", "3f2a1b"]));
    const second = shape(parseArgs(["--resume", "9c8d7e"]));
    expect(first).toContain("3f2a1b");
    expect(second).toContain("9c8d7e");
    expect(first.split("3f2a1b").join("<PFX>")).toBe(second.split("9c8d7e").join("<PFX>"));
  });

  it("다른 세 형태의 결과에는 접두가 새어 들어가지 않는다", () => {
    parseArgs(["--resume", "3f2a1b"]);
    for (const argv of [[], ["--help"], ["--version"]]) {
      expect(shape(parseArgs(argv)), `${JSON.stringify(argv)}에 접두가 남았다`).not.toContain(
        "3f2a1b",
      );
    }
  });
});

describe("argv — 사용법 에러의 비침묵 (CLI-INTERFACE §5·§2.6)", () => {
  it("던지는 것은 Error이고 내용이 비어 있지 않다", () => {
    // 근거: §5 "닫힌 목록 밖의 argv와 인자 없는 `--resume`은 사용법 에러다" — 근거는
    // 오타의 침묵 무시 차단(§2.6)이므로 **무엇이든 던지기만 하면 된다**가 아니다.
    // `toThrow()`는 문자열·undefined를 던져도, 내부 크래시(TypeError)여도 통과한다.
    // 여기서는 Error임과 메시지가 비어 있지 않음까지 잰다(문면은 고정하지 않는다).
    const badArgvs: readonly (readonly string[])[] = [
      ["--yolo"],
      ["-h"],
      ["resume", "3f2a1b"],
      ["--help", "extra"],
      ["--resume"],
    ];
    for (const argv of badArgvs) {
      const error = thrownBy(argv);
      expect(error, `${JSON.stringify(argv)}가 던지지 않았다`).toBeInstanceOf(Error);
      expect(
        (error as Error).message.trim().length,
        `${JSON.stringify(argv)}의 에러가 내용을 담지 않았다`,
      ).toBeGreaterThan(0);
    }
  });

  it("[미규정] 공백만 있는 --resume 접두 — 새 세션으로 조용히 강등되지는 않는다", () => {
    // §5는 **인자 없는** `--resume`만 사용법 에러로 든다. 공백만 있는 접두를 파싱 시점에
    // 거부할지, 접두로 받아 §6의 `resolveSessionId` 판정(모호·부재)에 맡길지는 정본이
    // 정하지 않았다 — 판정 필요. 기존 계약 테스트(`args.contract.test.ts`)는 이 경우를
    // **에러**로 단정하는데, 그 단정의 근거는 정본 문면이 아니다.
    //
    // 미규정 구간에서도 문서가 금지한 결과는 있다: 인자 없이 새 세션으로 뜨는 것이
    // 그것이다(§2.6 — `--resmue abc`가 조용히 새 세션이 되는 것과 같은 결과). 그래서
    // 여기서는 "던지거나, 접두를 그대로 실어 재개 형태를 유지하거나" 둘 중 하나만 잰다.
    const error = thrownBy(["--resume", "   "]);
    if (error === undefined) {
      const parsed = shape(parseArgs(["--resume", "   "]));
      expect(parsed, "공백 접두가 --resume 없는 형태로 강등됐다").not.toBe(shape(parseArgs([])));
      expect(parsed, "접두가 소리 없이 사라졌다").toContain("   ");
    } else {
      expect(error).toBeInstanceOf(Error);
    }
  });
});

// ---------------------------------------------------------------------------
// §9 — 승인 프롬프트
// ---------------------------------------------------------------------------

let build: Build;

beforeAll(async () => {
  const module = await loadCliModule("approval-ui.ts");
  const factory = pickExport<(io: unknown) => PromptLike>(
    module,
    ["createApprovalPrompt", "createApprovalUi", "createCliApprovalPrompt"],
    "승인 프롬프트 팩토리",
  );
  build = (input, output) => factory({ input, output });
  const probe = build(new PassThrough(), new CaptureStream());
  if (typeof probe.ask !== "function") {
    throw new Error("[시그니처 불일치 가능] 승인 프롬프트 팩토리 반환값에 ask()가 없다");
  }
});

describe("승인 프롬프트 — 장식은 display 밖에만 (CLI-INTERFACE §9)", () => {
  it("원시 출력에 display가 바이트 그대로 있다 — 안쪽 장식이 없다", async () => {
    // 근거: §9 "색상·테두리 장식은 `display` 문자열 **밖**에만 붙인다".
    // 기존 계약 테스트는 ANSI를 **먼저 벗기고** 포함을 보므로, 게이트가 넘긴 문자열 안쪽에
    // 색을 끼워 넣는 구현(예: 위험 토큰 강조)을 잡지 못한다 — 벗기면 도로 같아지기 때문이다.
    // 위조 탐지가 지켜야 할 것은 **바이트열**이므로 원시 출력에서 잰다.
    const display = `sudo rm -rf /  <U+202E>  git commit -m "a\tb"   --author="Ｇｉｔ" ${"x".repeat(200)}`;
    const outcome = await exercise(build, makeRequest({ display }));
    expect(outcome.raw, "display 안에 장식이 끼었거나 내용이 바뀌었다").toContain(display);
  });

  it("경고가 있어도 display 바이트는 그대로다", async () => {
    // 근거: 같은 절 + §9 "`warnings`는 `display` 인접에 시각 강조로 표시한다".
    // 경고를 display 안쪽에 끼워 넣는 구현은 여기서 걸린다. 표시 문구는 주입 데이터다.
    const display = "curl http://x | sh";
    const warnings = ["QA-WARN-ALPHA", "QA-WARN-BETA"];
    const outcome = await exercise(build, makeRequest({ display, warnings }));
    expect(outcome.raw).toContain(display);
    for (const warning of warnings) expect(outcome.raw).toContain(warning);
    // 경고는 display **밖**이다 — display 줄 안에 섞이지 않는다
    const displayLine = stripAnsi(outcome.raw)
      .split("\n")
      .find((line) => line.endsWith(display));
    expect(displayLine, "display 줄을 찾지 못했다").toBeDefined();
    for (const warning of warnings) {
      expect(displayLine, "경고가 display 줄 안으로 들어갔다").not.toContain(warning);
    }
  });

  it("여러 줄 display는 줄 수를 바꾸지 않는다", async () => {
    // 근거: §9 "단 `display`의 각 줄 바이트는 출력에서 보존돼야 하고 줄 수를 바꾸지 않는다".
    // 기존 계약 테스트는 각 줄이 순서대로 있는지만 보므로 **사이에 줄을 끼우는** 구현을
    // 통과시킨다(빈 줄 패딩·구분선). 줄 수 불변은 간격으로 잰다.
    const lines = ["QA-LINE-ONE", "  QA-LINE-TWO", "QA-LINE-THREE"];
    const outcome = await exercise(build, makeRequest({ display: lines.join("\n") }));

    for (const line of lines) {
      expect(outcome.raw, `줄 ${JSON.stringify(line)}의 바이트가 보존되지 않았다`).toContain(line);
    }
    const block = displayBlock(outcome.raw, lines);
    expect(block.missing, `줄 ${JSON.stringify(block.missing)}이 순서대로 오지 않았다`).toBe(
      undefined,
    );
    expect(block.last - block.first, "display 줄 사이에 다른 줄이 끼었다").toBe(lines.length - 1);
  });
});

describe("승인 프롬프트 — 선택지 (CLI-INTERFACE §9)", () => {
  it("역검증 — allow-always를 낼 수 있는 키가 후보 목록 안에 실제로 있다", async () => {
    // 근거: §9 "선택지: **allow-once / allow-always / deny.**" — allowAlwaysKey가 있으면
    // allow-always는 **도달 가능해야** 한다. 이 단언이 없으면 형제 테스트("키를 눌러도
    // allow-always가 나오지 않는다")가 공회전한다: 후보 목록에 진짜 키가 하나도 없으면
    // 위반 구현에서도 통과한다. 응답 키는 세부이므로 그럴듯한 키를 전부 시도한다.
    const candidates = ["a", "A", "always", "2", "3", "t", "!", "s"];
    const reached: string[] = [];
    for (const key of candidates) {
      const outcome = await exercise(
        build,
        makeRequest({ allowAlwaysKey: "shell:npm run build" }),
        [key],
      );
      if (outcome.result === "allow-always") reached.push(key);
    }
    expect(
      reached.length,
      `후보 ${JSON.stringify(candidates)} 중 어느 것도 allow-always를 내지 못했다 — ` +
        "형제 부정 단언이 공회전 중이거나 allow-always가 도달 불가능하다",
    ).toBeGreaterThan(0);
  });

  it("allowAlwaysKey가 없으면 같은 키가 allow-always를 내지 않는다", async () => {
    const candidates = ["a", "A", "always", "2", "3", "t", "!", "s"];
    for (const key of candidates) {
      const outcome = await exercise(build, makeRequest(), [key]);
      expect(outcome.result, `키 ${JSON.stringify(key)}가 allow-always를 반환했다`).not.toBe(
        "allow-always",
      );
    }
  });
});

describe("승인 프롬프트 — 기본 선택 부재 (CLI-INTERFACE §9)", () => {
  it("CR·LF·CRLF 어느 것도 응답이 되지 않는다", async () => {
    // 근거: §9 "**기본 선택(그냥 Enter)은 존재하지 않는다** — 승인은 명시적이어야 한다".
    // 기존 계약 테스트는 `\n`만 넣는다. 실제 터미널의 Enter는 `\r`이고 파이프는 `\r\n`도
    // 보낸다 — `\n`만 막고 `\r`을 응답으로 읽는 구현이 있으면 실터미널에서만 무너진다.
    for (const key of ["\r", "\n", "\r\n"]) {
      const outcome = await exercise(
        build,
        makeRequest({ allowAlwaysKey: "shell:npm run build" }),
        [key],
      );
      expect(outcome.settled, `${JSON.stringify(key)}로 응답이 확정됐다`).toBe(false);
      expect(
        outcome.since(0).trim().length,
        `${JSON.stringify(key)} 뒤에 재프롬프트가 없다`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("승인 프롬프트 — 특별 취급은 Ctrl+C 하나 (CLI-INTERFACE §9)", () => {
  it("Ctrl+C 문자는 응답이 되지 않는다", async () => {
    // 근거: §9 "**특별 취급하는 키는 Ctrl+C 하나다**" + "abort 시 `ask`는 reject한다 —
    // `\"deny\"`를 지어내지 않는다". 중단의 의미론은 REPL이 signal로 옮기므로(§8),
    // 스트림으로 들어온 `\x03`을 프롬프트가 스스로 deny로 바꾸면 "중단"이 "사용자가
    // 거부"로 둔갑한다 — 사용자가 하지 않은 결정을 지어내는 경로다.
    const outcome = await exercise(build, makeRequest(), ["\x03"]);
    expect(outcome.settled, "Ctrl+C 문자만으로 응답이 확정됐다").toBe(false);
    expect(outcome.result).toBe(undefined);
  });

  it("Ctrl+D는 EOF도 취소도 아니다 — 무효 키로 재프롬프트한다", async () => {
    // 근거: §9 "**Ctrl+D도 여기 포함되어 EOF·취소 어느 쪽으로도 해석되지 않는다**"
    //       §8 표 `approval-wait` 행 "**무효 키 — 재프롬프트**"
    // 이 행이 §8의 네 행 중 유일하게 승인 UI 쪽에 사는데, 두 계약 테스트 어느 쪽도
    // 재지 않았다.
    const outcome = await exercise(build, makeRequest(), ["\x04"]);
    expect(outcome.settled, "Ctrl+D가 프롬프트를 끝냈다").toBe(false);
    expect(outcome.since(0).trim().length, "Ctrl+D 뒤에 재프롬프트가 없다").toBeGreaterThan(0);
  });

  it("무효 키 안내가 무엇을 눌렀는지 구별해 보여준다", async () => {
    // 근거: §9 "**무효 키를 알렸을 때 사용자가 자기가 무엇을 눌렀는지 알아볼 수 있어야
    // 한다** — 제어·비가시 문자는 이름(`Ctrl+D`·`Enter`)이나 코드포인트(`U+00A0`)로
    // 표시한다. 원시 이스케이프는 ... '무엇이 무효였는지'를 감춘다".
    //
    // 이름의 문면은 세부이므로 고정하지 않는다(§7). 재는 것은 둘이다 —
    // (1) 서로 다른 무효 키가 서로 다른 안내를 낳는가(구별),
    // (2) 원시 제어·비가시 문자가 그대로 새어 나가지 않는가(감춤 금지).
    const keys = ["\x04", "\x7f", " "];
    const notices = new Map<string, string>();
    for (const key of keys) {
      const outcome = await exercise(build, makeRequest(), [key]);
      const notice = stripAnsi(outcome.since(0));
      expect(notice.trim().length, `${JSON.stringify(key)}에 안내가 없다`).toBeGreaterThan(0);
      expect(notice, `${JSON.stringify(key)}가 원시 그대로 출력됐다`).not.toContain(key);
      notices.set(key, notice);
    }
    expect(
      new Set(notices.values()).size,
      `무효 키 ${keys.map((key) => JSON.stringify(key)).join("·")}의 안내가 서로 구별되지 않는다`,
    ).toBe(keys.length);
  });
});

describe("승인 프롬프트 — 중단은 reject다 (CLI-INTERFACE §9)", () => {
  it("abort 시 ask는 reject하고 어떤 응답값도 만들지 않는다", async () => {
    // 근거: §9 "**abort 시 `ask`는 reject한다 — `\"deny\"`를 지어내지 않는다**".
    // 기존 계약 테스트는 "매달리지 않는가"와 "allow-* 가 아닌가"까지만 재고, 그 결과
    // **deny를 지어내는 구현이 통과한다** — 정본이 이름으로 금지한 바로 그 결과다.
    // (사용자가 거부한 것과 런이 끊긴 것은 다른 사실이고, 취소의 block 변환은 게이트 몫이다.)
    const controller = new AbortController();
    const outcome = await exercise(build, makeRequest(), [], { abortAfterPrompt: controller });
    expect(outcome.settled, "중단 후에도 승인 프롬프트가 매달려 있다").toBe(true);
    expect(outcome.result, "중단이 응답값으로 둔갑했다").toBe(undefined);
    expect(outcome.error, "중단이 reject로 알려지지 않았다").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 역검증 — 위 술어가 실제로 위반을 잡는가
//
// 새 검사는 일부러 위반을 넣어 잡히는지 확인해야 한다. 구현(`src/`)을 건드리지 않고
// 확인하기 위해, 위반을 저지르는 **가짜 프롬프트**에 같은 술어를 걸어 본다. 여기의
// `expect`는 전부 "술어가 위반을 잡았다"를 단언한다 — 그러므로 이 describe가 그린인
// 상태가 곧 위 단언들이 살아 있다는 증거다.
// ---------------------------------------------------------------------------

/** 장식을 display **안쪽**에 끼우는 위반 */
const decoratesInside: Build = (_input, output) => ({
  ask(request) {
    output.write("\x1b[33m● 승인 필요\x1b[39m\n");
    output.write(
      `${request.display
        .split(" ")
        .map((word) => `\x1b[1m${word}\x1b[22m`)
        .join(" ")}\n`,
    );
    return new Promise<ApprovalResponse>(() => {});
  },
});

/** display 줄 사이에 구분선을 끼우는 위반 */
const padsLines: Build = (_input, output) => ({
  ask(request) {
    output.write(`${request.display.split("\n").join("\n\n")}\n`);
    return new Promise<ApprovalResponse>(() => {});
  },
});

/** Enter를 기본 선택으로 수리하는 위반 */
const enterIsDefault: Build = (input, output) => ({
  ask() {
    output.write("[y]/[n]\n");
    return new Promise<ApprovalResponse>((resolve) => {
      input.on("data", (chunk: Buffer | string) => {
        const key = String(chunk);
        if (key === "\r" || key === "\n" || key === "\r\n") resolve("allow-once");
      });
      input.resume();
    });
  },
});

/** 스트림의 Ctrl+C를 deny로 바꾸는 위반 */
const ctrlCIsDeny: Build = (input, output) => ({
  ask() {
    output.write("[y]/[n]\n");
    return new Promise<ApprovalResponse>((resolve) => {
      input.on("data", (chunk: Buffer | string) => {
        if (String(chunk).includes("\x03")) resolve("deny");
      });
      input.resume();
    });
  },
});

/** 무효 키를 원시 그대로 되비추는 위반 */
const echoesRawKey: Build = (input, output) => ({
  ask() {
    output.write("[y]/[n]\n");
    return new Promise<ApprovalResponse>(() => {
      input.on("data", (chunk: Buffer | string) => {
        output.write(`  "${String(chunk)}"는 유효한 응답이 아니다.\n`);
      });
      input.resume();
    });
  },
});

/** 중단을 deny로 지어내는 위반 */
const abortIsDeny: Build = (_input, output) => ({
  ask(_request, signal) {
    output.write("[y]/[n]\n");
    return new Promise<ApprovalResponse>((resolve) => {
      signal.addEventListener("abort", () => resolve("deny"), { once: true });
    });
  },
});

describe("역검증 — 위반을 넣으면 잡히는가", () => {
  it("display 안쪽 장식: 원시 단언은 잡고, ANSI를 벗긴 단언은 놓친다", async () => {
    const display = "sudo rm -rf /";
    const outcome = await exercise(decoratesInside, makeRequest({ display }));
    expect(outcome.raw, "원시 단언이 안쪽 장식을 놓쳤다").not.toContain(display);
    // 기존 계약 테스트의 재는 방식(벗긴 뒤 포함)으로는 통과해 버린다는 것을 함께 고정한다
    expect(stripAnsi(outcome.raw), "벗긴 뒤에는 구별되지 않는다는 사실").toContain(display);
  });

  it("줄 끼워 넣기: 줄 수 단언은 잡고, 순서 단언은 놓친다", async () => {
    const lines = ["QA-LINE-ONE", "  QA-LINE-TWO", "QA-LINE-THREE"];
    const outcome = await exercise(padsLines, makeRequest({ display: lines.join("\n") }));
    const block = displayBlock(outcome.raw, lines);
    expect(block.missing, "줄 자체는 순서대로 있다").toBe(undefined);
    expect(block.last - block.first, "줄 수 단언이 끼워 넣기를 놓쳤다").not.toBe(lines.length - 1);
  });

  it("Enter 기본 선택: CR·LF·CRLF 단언이 잡는다", async () => {
    for (const key of ["\r", "\n", "\r\n"]) {
      const outcome = await exercise(enterIsDefault, makeRequest(), [key]);
      expect(outcome.settled, `${JSON.stringify(key)} 위반이 잡히지 않았다`).toBe(true);
    }
  });

  it("Ctrl+C를 deny로: 단언이 잡는다", async () => {
    const outcome = await exercise(ctrlCIsDeny, makeRequest(), ["\x03"]);
    expect(outcome.settled).toBe(true);
    expect(outcome.result).toBe("deny");
  });

  it("원시 키 되비추기: 구별·비침묵 단언이 잡는다", async () => {
    const keys = ["\x04", "\x7f", " "];
    const leaked: string[] = [];
    for (const key of keys) {
      const outcome = await exercise(echoesRawKey, makeRequest(), [key]);
      if (stripAnsi(outcome.since(0)).includes(key)) leaked.push(key);
    }
    expect(leaked.length, "원시 유출 단언이 아무것도 잡지 못했다").toBe(keys.length);
  });

  it("중단을 deny로: reject 단언은 잡고, 기존의 allow-* 배제 단언은 놓친다", async () => {
    const controller = new AbortController();
    const outcome = await exercise(abortIsDeny, makeRequest(), [], {
      abortAfterPrompt: controller,
    });
    expect(outcome.settled, "매달리지 않았다 — 기존 단언은 여기서 통과한다").toBe(true);
    expect(outcome.result).not.toBe("allow-once");
    expect(outcome.result).not.toBe("allow-always");
    // 정본이 금지한 결과는 그대로 남아 있다
    expect(outcome.result, "reject 단언이 지어낸 deny를 놓쳤다").toBe("deny");
    expect(outcome.error).toBe(undefined);
  });
});
