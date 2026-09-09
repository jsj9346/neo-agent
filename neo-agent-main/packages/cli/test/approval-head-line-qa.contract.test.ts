/**
 * 승인 프롬프트 머리 줄 독립 QA (T-004) — `docs/CLI-INTERFACE.md` §9 ·
 * `docs/APPROVAL-GATE.md` §4 「머리 줄」 항.
 *
 * 검증하는 계약 (기대값은 정본 문서에서만 도출했다 — 구현을 읽고 맞춘 자리는 없다):
 *   CLI §9  "**`ApprovalRequest.toolName`을 화면에 싣지 않는다**"
 *   CLI §9  "도구 이름의 표시 자리는 `display`의 첫 줄 하나이고 그 줄은 게이트의 위조 탐지를 거친다"
 *   CLI §9  "프롬프트 머리 문구(`● 승인 필요`)는 통합 리그의 관측점이라 그대로 두고, 그 뒤에 붙던 도구 이름만 걷는다"
 *   CLI §9  "원문 필드를 자기 문구에 끼우면 게이트가 이스케이프한 줄 바로 위에 원문이 놓여 탐지가 반쪽이 된다"
 *   GATE §4 "**`ApprovalRequest.toolName`은 식별자이지 표시 표면이 아니다 — 소비자는 그것을 화면에 싣지 않는다.**"
 *   GATE §4 "**소비자가 스스로 이스케이프하는 안은 기각한다**"
 *   GATE §4 "**도구 이름은 `single-line` 슬롯이고 모든 표시본의 첫 줄에 온다.**"
 *
 * 단언 형태는 CLI §7의 표시 문구 규칙을 따른다 — "테스트가 재는 것은 **구별과 비침묵**이다".
 * 이 파일의 리터럴은 두 부류뿐이다: (a) 테스트가 주입한 픽스처 데이터가 그대로 통과했는지를
 * 확인하는 단언, (b) §9가 이름으로 든 관측점 문면 하나(아래 [미규정] B-2).
 *
 * [미규정] §7은 "문구 자체가 계약이어야 하는 자리가 나오면 세부에서 떼어 이 절에 **이름으로 든다**"고
 * 적었는데, 승인 머리 문구를 이름으로 든 자리는 §7이 아니라 §9다. 그 문면을 리터럴로 고정하는 것이
 * §7의 허용에 드는지(=§9의 지목이 §7의 「이 절」을 대신하는지)는 어느 정본도 안 정한다. 이 파일은
 * 리터럴 단언 하나를 두되 그 옆에 문면 무관 비침묵 단언(B-1)을 짝으로 둔다 — 판정이 어느 쪽으로
 * 나든 B-1은 살아남는다.
 *
 * [미규정] `display` 밖에서 도구 이름을 **말이 아닌 형태로** 싣는 경로(예: 터미널 타이틀·OSC 시퀀스)는
 * 이 파일이 재지 않는다. 문서가 금지한 것은 "화면에 싣지 않는다"이고 그 모집단이 SGR을 벗긴
 * 문자열인지 원시 바이트인지는 §9·§4 어느 쪽도 안 정한다.
 *
 * **A-1~A-4는 `it.fails`다 — 판정이 아니라 착지가 안 됐다는 표기다** (2026-09-10, 착수 전 결정
 * D-1 (가)). 독립 QA(T-004)가 정본만 보고 쓴 단언 넷이 오늘 실물(`src/approval-ui.ts`의 승인
 * 머리 문구가 `request.toolName` 원문을 접미로 싣는다)에서 붉었다. 그 파일은 Codex 소유의
 * 표현 계층이라 이 세션이 고치지 않고 회부한다 — **이 넷이 Codex 착지의 트리거다**(카드
 * `K-610` ② · `AGENTS.md` §3). Codex가 접미를 걷으면 넷이 «통과해서» 붉어지고, 그때
 * **되돌림(`it.fails` → `it`)은 Codex가 한다** — `AGENTS.md` §2가 이 파일 한 자리를 그 한 건에
 * 한해 예외로 열어 뒀다. 기대값은 내리지 않았다 — 붉은 이유는 계약이 아니라 실물이다.
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

type ApprovalPromptAsk = (req: ApprovalRequest, signal: AbortSignal) => Promise<ApprovalResponse>;

let construct: (input: PassThrough, output: CaptureStream) => { ask: ApprovalPromptAsk };

/** 픽스처 — 분류 라벨은 게이트 상수를 흉내낸 **주입 데이터**이지 계약 문면이 아니다 */
const KIND_LABEL = "셸 명령 실행";
const BODY_LINE = "npm run build";

function request(toolName: string, displayName: string): ApprovalRequest {
  return {
    toolCallId: "qa-t004-call-1",
    toolName,
    subject: { kind: "shellExec", command: BODY_LINE, cwd: "/ws" },
    // 게이트가 만든 표시본을 흉내낸다: 첫 줄이 `<도구 이름> — <분류 라벨>`이고
    // 그 도구 이름은 이미 위조 탐지를 거친 **이스케이프된 형태**다(GATE §4 「머리 줄」).
    display: `${displayName} — ${KIND_LABEL}\n${BODY_LINE}`,
    warnings: [],
  };
}

function displayHeadLine(displayName: string): string {
  return `${displayName} — ${KIND_LABEL}`;
}

/** 겹치지 않는 부분 문자열의 출현 횟수 */
function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) throw new Error("빈 바늘로는 셀 수 없다");
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** 표시본 첫 줄 **앞**에 나온 출력 — 없으면 null(표시본 자체가 안 나왔다는 뜻) */
function headBefore(rendered: string, headLine: string): string | null {
  const index = rendered.indexOf(headLine);
  return index === -1 ? null : rendered.slice(0, index);
}

/** ask()를 띄우고 프롬프트가 그려진 직후의 출력을 관측한다. 키는 넣지 않는다 */
async function render(req: ApprovalRequest): Promise<string> {
  const input = new PassThrough();
  const output = new CaptureStream();
  const controller = new AbortController();
  const prompt = construct(input, output);

  const settled = prompt.ask(req, controller.signal).then(
    () => undefined,
    () => undefined,
  );

  await flush(3);
  const rendered = stripAnsi(output.text);

  controller.abort(new Error("QA T-004: 렌더 관측을 마치고 정리한다"));
  await flush(3);
  input.end();
  await settled;
  return rendered;
}

beforeAll(async () => {
  const module = await loadCliModule("approval-ui.ts");
  const factory = pickExport<(...args: unknown[]) => unknown>(
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
      build: (input, output) => factory({ input, output }),
    },
    {
      label: "createApprovalPrompt(input, output)",
      build: (input, output) => factory(input, output),
    },
    {
      label: "createApprovalPrompt({ stdin, stdout })",
      build: (input, output) => factory({ stdin: input, stdout: output }),
    },
  ];

  const failures: string[] = [];
  for (const style of styles) {
    try {
      const probe = style.build(new PassThrough(), new CaptureStream());
      if (typeof (probe as { ask?: unknown })?.ask !== "function") {
        throw new Error("반환값에 ask()가 없다");
      }
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

describe("승인 프롬프트 — toolName 원문은 화면에 안 실린다 (CLI §9 · GATE §4)", () => {
  it.fails("A-1 비가시 문자가 든 toolName의 원문이 렌더 출력에 없다 [미착지: `K-610` ② — Codex]", async () => {
    // 근거: CLI §9 "원문 필드를 자기 문구에 끼우면 게이트가 이스케이프한 줄 바로 위에
    //       원문이 놓여 탐지가 반쪽이 된다"
    //
    // 위조 흔적이 든 이름을 주고, `display`에는 게이트가 이스케이프한 형태를 준다.
    // 두 문자열이 서로 다르므로 **원문의 출현은 곧 `display` 밖의 출현**이다.
    const raw = "shell\u200Bexec";
    const escaped = "shell<U+200B>exec";
    const rendered = await render(request(raw, escaped));

    // 비침묵 — 표시본은 나왔다(안 나왔으면 아래 단언이 무의미하게 통과한다)
    expect(rendered).toContain(displayHeadLine(escaped));
    // 계약 — 원문은 어디에도 없다
    expect(occurrences(rendered, raw)).toBe(0);
  });

  it.fails("A-2 동형이의 문자가 든 toolName의 원문이 렌더 출력에 없다 [미착지: `K-610` ② — Codex]", async () => {
    // 근거: GATE §4 "**`ApprovalRequest.toolName`은 식별자이지 표시 표면이 아니다 —
    //       소비자는 그것을 화면에 싣지 않는다.**"
    //       키릴 `е`(U+0435)는 라틴 `e`와 눈으로 구분되지 않는다.
    const raw = "sh\u0435ll";
    const escaped = "sh<U+0435→e>ll";
    const rendered = await render(request(raw, escaped));

    expect(rendered).toContain(displayHeadLine(escaped));
    expect(occurrences(rendered, raw)).toBe(0);
  });

  it.fails("A-3 위조 흔적이 없는 이름도 표시본 첫 줄 한 자리에만 나온다 [미착지: `K-610` ② — Codex]", async () => {
    // 근거: CLI §9 "도구 이름의 표시 자리는 `display`의 첫 줄 하나이고 그 줄은
    //       게이트의 위조 탐지를 거친다"
    //
    // 원문과 표시본이 같은 문자열인 정상 경우다. 이때 원문 필드를 어딘가에 더 실으면
    // 출현이 둘이 되므로, 재는 것은 부재가 아니라 **횟수**다. 이 축이 A-1·A-2가 못
    // 잡는 갈래를 잡는다 — 소비자가 자체 이스케이프를 하면(GATE §4가 기각한 안) 원문
    // 검색은 0이 되지만 이름은 두 자리에 남는다.
    const name = "qaProbeToolName7f3";
    const rendered = await render(request(name, name));

    expect(rendered).toContain(displayHeadLine(name));
    expect(occurrences(rendered, name)).toBe(1);
  });

  it.fails("A-4 표시본 첫 줄 앞의 머리 출력에 도구 이름이 없다 [미착지: `K-610` ② — Codex]", async () => {
    // 근거: CLI §9 "프롬프트 머리 문구(`● 승인 필요`)는 ... 그대로 두고, 그 뒤에 붙던
    //       도구 이름만 걷는다"
    //
    // A-3의 횟수 축과 달리 **자리**를 직접 잰다: 표시본 첫 줄보다 앞에 놓인 출력이
    // 도구 이름을 들면, 이스케이프된 줄 바로 위에 원문이 놓인 그 배치다.
    const name = "qaProbeToolName9c1";
    const rendered = await render(request(name, name));

    const head = headBefore(rendered, displayHeadLine(name));
    expect(head).not.toBeNull();
    expect(occurrences(head ?? "", name)).toBe(0);
  });
});

describe("승인 프롬프트 — 머리 관측점은 그대로 남는다 (CLI §9)", () => {
  it("B-1 표시본 앞에 비어 있지 않은 머리 출력이 있다", async () => {
    // 근거: CLI §9 "프롬프트 머리 문구(`● 승인 필요`)는 통합 리그의 관측점이라 그대로 두고"
    //
    // 문면 무관 비침묵 단언이다(§7 "테스트가 재는 것은 **구별과 비침묵**이다").
    // 접미(도구 이름)를 걷다가 머리 줄 자체를 함께 걷는 착지를 이 단언이 막는다.
    const name = "qaProbeToolNameB1";
    const rendered = await render(request(name, name));

    const head = headBefore(rendered, displayHeadLine(name));
    expect(head).not.toBeNull();
    expect((head ?? "").trim().length).toBeGreaterThan(0);
  });

  it("B-2 [미규정] §9가 이름으로 든 관측점 문면이 출력에 있다", async () => {
    // 근거: CLI §9가 그 문면을 괄호 안에 이름으로 들고 "통합 리그의 안정 관측점"의
    //       지위를 준다. 다만 §7은 문면 고정의 허용을 "이 절에 **이름으로 든다**"로
    //       적었고 그 「이 절」은 §7이다 — §9의 지목이 그것을 대신하는지는 미규정이다.
    //       판정이 "아니다"로 나면 이 단언만 지우고 B-1을 남긴다.
    const name = "qaProbeToolNameB2";
    const rendered = await render(request(name, name));

    expect(rendered).toContain("● 승인 필요");
  });
});

describe("역검증 — 술어 자체가 위반을 잡는가", () => {
  // 위 단언들이 쓰는 술어(occurrences·headBefore)에 **일부러 위반을 심은 합성 출력**을
  // 먹여 실제로 잡히는지 본다. 술어가 조용히 0을 돌려주는 상태면 위 통과는 무의미하다.

  it("R-1 원문을 머리에 끼운 합성 출력은 A-1·A-2 술어에 걸린다", () => {
    const raw = "shell\u200Bexec";
    const escaped = "shell<U+200B>exec";
    const violating = `\n● 승인 필요 — ${raw}\n\n  ${displayHeadLine(escaped)}\n  ${BODY_LINE}\n`;
    expect(occurrences(violating, raw)).toBeGreaterThan(0);

    const conforming = `\n● 승인 필요\n\n  ${displayHeadLine(escaped)}\n  ${BODY_LINE}\n`;
    expect(occurrences(conforming, raw)).toBe(0);
  });

  it("R-2 이름을 두 자리에 실은 합성 출력은 A-3·A-4 술어에 걸린다", () => {
    const name = "qaProbeToolNameR2";
    const violating = `\n● 승인 필요 — ${name}\n\n  ${displayHeadLine(name)}\n  ${BODY_LINE}\n`;
    expect(occurrences(violating, name)).toBe(2);
    expect(occurrences(headBefore(violating, displayHeadLine(name)) ?? "", name)).toBe(1);

    const conforming = `\n● 승인 필요\n\n  ${displayHeadLine(name)}\n  ${BODY_LINE}\n`;
    expect(occurrences(conforming, name)).toBe(1);
    expect(occurrences(headBefore(conforming, displayHeadLine(name)) ?? "", name)).toBe(0);
  });

  it("R-3 머리를 통째로 걷은 합성 출력은 B-1 술어에 걸린다", () => {
    const name = "qaProbeToolNameR3";
    const headless = `\n\n  ${displayHeadLine(name)}\n  ${BODY_LINE}\n`;
    expect((headBefore(headless, displayHeadLine(name)) ?? "").trim().length).toBe(0);

    const withHead = `\n● 승인 필요\n\n  ${displayHeadLine(name)}\n  ${BODY_LINE}\n`;
    expect((headBefore(withHead, displayHeadLine(name)) ?? "").trim().length).toBeGreaterThan(0);
  });

  it("R-4 표시본이 아예 안 나온 출력은 null로 갈린다", () => {
    expect(headBefore("● 승인 필요\n", displayHeadLine("qaProbeToolNameR4"))).toBeNull();
  });
});
