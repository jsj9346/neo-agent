/**
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHostShellExecutor, scrubEnv } from "../src/executor.ts";
import { createShellTool, type ShellDetails } from "../src/shell.ts";
import { createWorkspaceBoundary, type WorkspaceBoundary } from "../src/workspace.ts";

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/** 코어의 `ToolResult.details`는 `unknown`이다 — 계약을 넓히지 않고 소비자가 좁힌다 */
function shellDetails(result: { details?: unknown }): ShellDetails {
  return result.details as ShellDetails;
}

describe("scrubEnv", () => {
  it("이름 패턴으로 시크릿 변수를 제거한다", () => {
    const scrubbed = scrubEnv({
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "sk-secret-value",
      GITHUB_TOKEN: "ghp_x",
      DB_PASSWORD: "hunter2",
      HOME: "/home/user",
    });
    expect(scrubbed.PATH).toBe("/usr/bin");
    expect(scrubbed.HOME).toBe("/home/user");
    expect(scrubbed.ANTHROPIC_API_KEY).toBeUndefined();
    expect(scrubbed.GITHUB_TOKEN).toBeUndefined();
    expect(scrubbed.DB_PASSWORD).toBeUndefined();
  });

  it("이름이 평범해도 값이 시크릿이면 제거한다 — 이름 패턴만으로는 놓친다", () => {
    const scrubbed = scrubEnv({ HARMLESS_NAME: "sk-ant-longsecretvalue", OTHER: "fine" }, [
      "sk-ant-longsecretvalue",
    ]);
    expect(scrubbed.HARMLESS_NAME).toBeUndefined();
    expect(scrubbed.OTHER).toBe("fine");
  });

  it("짧은 시크릿도 제거한다 — 계약은 길이 예외 없이 '실린 변수 전부'다", () => {
    // 이 테스트의 이전 판(짧은 값은 매칭에서 제외)은 계약에 없는 예외를 고정하고
    // 있었다. QA가 계약 대조로 잡아냈다 — 구현자의 테스트는 구현을 추인하기 쉽다.
    const scrubbed = scrubEnv({ TOKEN_HOLDER: "abc" }, ["abc"]);
    expect(scrubbed.TOKEN_HOLDER).toBeUndefined();
  });

  it("빈 문자열은 매칭에서 제외한다 — 모든 값이 포함해 환경이 통째로 빈다", () => {
    const scrubbed = scrubEnv({ PATH: "/usr/bin", LANG: "en_US.UTF-8" }, [""]);
    expect(scrubbed.PATH).toBe("/usr/bin");
    expect(scrubbed.LANG).toBe("en_US.UTF-8");
  });
});

describe("shell 도구", () => {
  let sandbox: string;
  let root: string;
  let boundary: WorkspaceBoundary;
  let tool: ReturnType<typeof createShellTool>;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-shell-")));
    root = join(sandbox, "workspace");
    mkdirSync(root, { recursive: true });
    boundary = createWorkspaceBoundary({ root, home: join(sandbox, "home") });
    tool = createShellTool({
      boundary,
      executor: createHostShellExecutor({
        env: { PATH: process.env.PATH ?? "", ANTHROPIC_API_KEY: "sk-must-not-leak-value" },
      }),
    });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const ctx = () => ({ toolCallId: "t1", signal: new AbortController().signal });

  it("명령을 실행하고 stdout과 종료 코드를 보고한다", async () => {
    const result = await tool.execute({ command: "echo hello" }, ctx());
    const text = textOf(result);
    expect(text).toContain("hello");
    expect(text).toContain("Exit code: 0");
  });

  it("실패한 명령의 종료 코드와 stderr를 함께 보고한다", async () => {
    const result = await tool.execute({ command: "echo oops >&2; exit 3" }, ctx());
    const text = textOf(result);
    expect(text).toContain("Exit code: 3");
    expect(text).toContain("oops");
  });

  it("출력이 없어도 침묵하지 않는다", async () => {
    const result = await tool.execute({ command: "true" }, ctx());
    expect(textOf(result)).toContain("(no output)");
  });

  it("환경에서 시크릿이 제거된 채 실행된다", async () => {
    const result = await tool.execute(
      { command: "printenv ANTHROPIC_API_KEY || echo ABSENT" },
      ctx(),
    );
    const text = textOf(result);
    expect(text).not.toContain("sk-must-not-leak-value");
    expect(text).toContain("ABSENT");
  });

  it("타임아웃이 명령을 강제 종료하고 그 사실을 알린다", async () => {
    const result = await tool.execute({ command: "sleep 5", timeoutSeconds: 1 }, ctx());
    const text = textOf(result);
    expect(text).toContain("Timed out");
    expect(shellDetails(result).timedOut).toBe(true);
  }, 10_000);

  it("중단 시그널을 존중한다", async () => {
    const controller = new AbortController();
    const running = tool.execute(
      { command: "sleep 5" },
      { toolCallId: "t1", signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 100);
    const result = await running;
    expect(shellDetails(result).exitCode).not.toBe(0);
  }, 10_000);

  it("워크스페이스 밖 cwd는 실행 전에 거부한다", async () => {
    await expect(tool.execute({ command: "pwd", cwd: sandbox }, ctx())).rejects.toThrow(
      /outside the workspace/,
    );
  });

  it("기본 cwd는 워크스페이스 루트다", async () => {
    const result = await tool.execute({ command: "pwd" }, ctx());
    expect(textOf(result)).toContain(root);
  });

  it("stdin이 닫혀 있어 대화형 명령이 매달리지 않는다", async () => {
    const result = await tool.execute({ command: "cat" }, ctx());
    expect(shellDetails(result).timedOut).toBe(false);
  }, 10_000);
});
