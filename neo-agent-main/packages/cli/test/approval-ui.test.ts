/**
 * 승인 프롬프트 단위 테스트 — `docs/CLI-INTERFACE.md` §9.
 *
 * 계약 표면은 QA의 계약 테스트가 본다. 여기서는 구현이 닫은 [미규정] 지점을
 * 고정한다 — Ctrl+C의 소유자와 여러 줄 `display`의 무가공 여부다.
 */

import { PassThrough } from "node:stream";
import type { ApprovalRequest } from "@neo-agent/gate";
import { describe, expect, it } from "vitest";
import { createApprovalPrompt } from "../src/approval-ui.ts";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function createIo(): {
  io: { input: PassThrough; output: PassThrough };
  text(): string;
} {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
  return { io: { input, output }, text: () => chunks.join("") };
}

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

describe("Ctrl+C의 소유자", () => {
  it("Ctrl+C를 deny로 바꾸지 않는다 — 중단과 거부는 다른 사실이다", async () => {
    const { io } = createIo();
    const prompt = createApprovalPrompt(io);
    const controller = new AbortController();

    let settled: string | undefined;
    const asking = prompt
      .ask(request(), controller.signal)
      .then((response) => {
        settled = response;
      })
      .catch(() => {
        settled = "rejected";
      });

    io.input.write("\x03");
    await tick();
    expect(settled).toBeUndefined();

    // 실제 중단은 REPL이 abort()로 옮기고, 그 signal이 프롬프트를 취소한다
    controller.abort();
    await asking;
    expect(settled).toBe("rejected");
  });

  it("이미 중단된 signal로 물으면 곧바로 취소된다", async () => {
    const { io } = createIo();
    const controller = new AbortController();
    controller.abort();

    await expect(createApprovalPrompt(io).ask(request(), controller.signal)).rejects.toThrow(
      /중단/,
    );
  });
});

describe("display 무가공", () => {
  it("여러 줄 display도 바이트 그대로 나간다 — 들여쓰기·재포맷 없음", async () => {
    const { io, text } = createIo();
    const display = "npm run build\n  && rm -rf dist\n\t비가시문자<U+200B>";
    const prompt = createApprovalPrompt(io);
    const asking = prompt.ask(request({ display }), new AbortController().signal);

    io.input.write("n");
    await asking;

    expect(text()).toContain(display);
  });

  it("경고는 display 밖에 붙는다 — display 내용을 건드리지 않는다", async () => {
    const { io, text } = createIo();
    const prompt = createApprovalPrompt(io);
    const asking = prompt.ask(
      request({ display: "rm -rf /", warnings: ["위험 패턴: 재귀 삭제"] }),
      new AbortController().signal,
    );

    io.input.write("n");
    expect(await asking).toBe("deny");
    expect(text()).toContain("rm -rf /");
    expect(text()).toContain("위험 패턴: 재귀 삭제");
  });
});

describe("응답 수리", () => {
  it("한 청크에 여러 글자가 와도 첫 유효 키만 취한다", async () => {
    const { io } = createIo();
    const prompt = createApprovalPrompt(io);
    const asking = prompt.ask(
      request({ allowAlwaysKey: "shell:npm run build" }),
      new AbortController().signal,
    );

    io.input.write("y\n");
    expect(await asking).toBe("allow-once");
  });

  it("대문자 응답도 같은 키로 본다", async () => {
    const { io } = createIo();
    const prompt = createApprovalPrompt(io);
    const asking = prompt.ask(request(), new AbortController().signal);

    io.input.write("N");
    expect(await asking).toBe("deny");
  });

  it("allowAlwaysKey가 있을 때만 allow-always가 나온다", async () => {
    const { io } = createIo();
    const prompt = createApprovalPrompt(io);
    const asking = prompt.ask(
      request({ allowAlwaysKey: "shell:npm run build" }),
      new AbortController().signal,
    );

    io.input.write("a");
    expect(await asking).toBe("allow-always");
  });
});

/**
 * §9 "특별 취급하는 키는 Ctrl+C 하나" + "사용자가 무엇을 눌렀는지 알아볼 수 있어야
 * 한다" — 2026-08-10 실측으로 열린 자리다. Ctrl+D가 `firstMeaningfulKey`에 걸러지지
 * 않는다는 것과, 무효 키가 원시 이스케이프(`""`)로 나오던 것을 함께 고정한다.
 */
describe("무효 키", () => {
  /** 무효 키 하나를 넣고 그때 나온 재프롬프트 텍스트를 돌려준다. */
  async function retryTextFor(key: string): Promise<string> {
    const { io, text } = createIo();
    const prompt = createApprovalPrompt(io);
    const asking = prompt.ask(request(), new AbortController().signal);

    io.input.write(key);
    await tick();
    const retry = text();

    io.input.write("n");
    await asking;
    return retry;
  }

  it("Ctrl+D는 취소도 EOF도 아니다 — 재프롬프트로 간다", async () => {
    const { io } = createIo();
    const prompt = createApprovalPrompt(io);

    let settled: string | undefined;
    const asking = prompt
      .ask(request(), new AbortController().signal)
      .then((response) => {
        settled = response;
      })
      .catch(() => {
        settled = "rejected";
      });

    io.input.write("\x04");
    await tick();
    expect(settled, "Ctrl+D가 프롬프트를 끝냈다").toBeUndefined();

    // 여전히 살아 있어 다음 키를 받는다
    io.input.write("n");
    await asking;
    expect(settled).toBe("deny");
  });

  it("Ctrl+D를 이름으로 보여준다 — 원시 이스케이프가 아니다", async () => {
    const retry = await retryTextFor("\x04");
    expect(retry).toContain("Ctrl+D");
    expect(retry, "제어문자가 그대로 새어 나왔다").not.toContain("\x04");
    expect(retry).not.toContain("u0004");
  });

  it("이름이 있는 키는 이름으로 보여준다", async () => {
    expect(await retryTextFor("\r")).toContain("Enter");
    expect(await retryTextFor("\t")).toContain("Tab");
    expect(await retryTextFor("\x1b")).toContain("Esc");
    expect(await retryTextFor("\x7f")).toContain("Backspace");
    expect(await retryTextFor(" ")).toContain("Space");
  });

  it("이름을 모르는 비가시 문자는 코드포인트로 보여준다 — 이름을 지어내지 않는다", async () => {
    const retry = await retryTextFor("​"); // zero-width space
    expect(retry).toContain("U+200B");
    expect(retry, "비가시 문자가 그대로 새어 나왔다").not.toContain("​");
  });

  it("보이는 문자는 그대로 보여준다", async () => {
    expect(await retryTextFor("z")).toContain("z");
  });
});
