/**
 * `shell` 도구와 실행자 경계 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처:
 *   - `docs/TOOLS-INTERFACE.md` §2 (`shell` 계약), §4 (executor 계약 5개)
 *   - `docs/SAFE-DEFAULTS.md` §3 계약 3 (자식 프로세스 env에서 시크릿 제거)
 *   - `docs/CORE-INTERFACE.md` §6 (실패는 throw, strictObject, signal 존중 의무)
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool, ToolExecutionContext } from "@neo-agent/core";
import { validateToolArgs } from "@neo-agent/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createHostShellExecutor,
  createShellTool,
  createWorkspaceBoundary,
  type ShellExecRequest,
  type ShellExecResult,
  type ShellExecutor,
  type WorkspaceBoundary,
} from "../src/index.ts";

function ctx(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return { toolCallId: "call-1", signal };
}

function textOf(result: { content: readonly { type: string }[] }): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

interface StubExecutor {
  executor: ShellExecutor;
  requests: ShellExecRequest[];
  signals: AbortSignal[];
}

function stubExecutor(overrides: Partial<ShellExecResult> = {}): StubExecutor {
  const requests: ShellExecRequest[] = [];
  const signals: AbortSignal[] = [];
  return {
    requests,
    signals,
    executor: {
      async exec(request, signal) {
        requests.push(request);
        signals.push(signal);
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          truncated: false,
          timedOut: false,
          ...overrides,
        };
      },
    },
  };
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("shell 도구 계약 (TOOLS-INTERFACE §2)", () => {
  let sandbox: string;
  let root: string;
  let home: string;
  let outside: string;
  let boundary: WorkspaceBoundary;

  beforeAll(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qa-shell-")));
    root = join(sandbox, "ws");
    home = join(sandbox, "home");
    outside = join(sandbox, "elsewhere");
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(home, ".neo-agent"), { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(root, "link-dir"));
    boundary = createWorkspaceBoundary({ root, home });
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe("cwd 경계 — 실행 전 검증", () => {
    it("cwd 기본값은 워크스페이스 루트다", async () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      await tool.execute({ command: "true" }, ctx());
      expect(stub.requests[0]?.cwd).toBe(root);
    });

    it("상대 cwd는 루트 기준 절대 경로로 실행자에게 넘어간다", async () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      await tool.execute({ command: "true", cwd: "src" }, ctx());
      expect(stub.requests[0]?.cwd).toBe(join(root, "src"));
    });

    it("워크스페이스 밖 cwd는 실행 없이 에러다", async () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      await expect(tool.execute({ command: "id", cwd: outside }, ctx())).rejects.toThrow();
      expect(stub.requests).toHaveLength(0);
    });

    it("심링크로 밖을 가리키는 cwd도 실행 없이 에러다", async () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      await expect(tool.execute({ command: "id", cwd: "link-dir" }, ctx())).rejects.toThrow();
      expect(stub.requests).toHaveLength(0);
    });

    it("denied 경로 cwd도 실행 없이 에러다", async () => {
      // [미규정] §2는 cwd를 "워크스페이스 안만 허용"으로 규정하므로 차단 자체는 계약이다.
      // 다만 현재 에러 텍스트는 denied를 "outside the workspace"라고 말한다 — 사유가
      // 사실과 다르면 모델이 승인 요청으로 우회를 시도한다(§2.6의 방향). 판정 필요.
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      await expect(
        tool.execute({ command: "cat credentials", cwd: "~/.neo-agent" }, ctx()),
      ).rejects.toThrow();
      expect(stub.requests).toHaveLength(0);
    });
  });

  describe("timeout·중단", () => {
    it("timeoutSeconds를 주지 않아도 기본 timeout이 존재한다", async () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      await tool.execute({ command: "true" }, ctx());
      expect(stub.requests[0]?.timeoutMs).toBeGreaterThan(0);
      expect(Number.isFinite(stub.requests[0]?.timeoutMs)).toBe(true);
    });

    it("timeoutSeconds가 실행자에게 밀리초로 전달된다", async () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      await tool.execute({ command: "true", timeoutSeconds: 7 }, ctx());
      expect(stub.requests[0]?.timeoutMs).toBe(7000);
    });

    it("호출자의 AbortSignal이 실행자에게 그대로 전달된다 (§6 존중 의무의 전파)", async () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      const controller = new AbortController();
      await tool.execute({ command: "true" }, ctx(controller.signal));
      expect(stub.signals[0]).toBe(controller.signal);
    });
  });

  describe("결과 표시 (§2 — 결과 텍스트에 exit code와 잘림 여부를 명시)", () => {
    it("exit code가 항상 결과에 있다", async () => {
      const stub = stubExecutor({ exitCode: 3, stdout: "out" });
      const tool = createShellTool({ boundary, executor: stub.executor });
      const text = textOf(await tool.execute({ command: "false" }, ctx()));
      expect(text).toMatch(/3/);
    });

    it("성공(0)도 명시된다 — 모델이 stdout만 보고 판단하지 않게", async () => {
      const stub = stubExecutor({ exitCode: 0, stdout: "ok" });
      const tool = createShellTool({ boundary, executor: stub.executor });
      expect(textOf(await tool.execute({ command: "true" }, ctx()))).toMatch(/exit code:\s*0/i);
    });

    it("타임아웃은 결과에 표시되고 다음 시도 방법을 담는다", async () => {
      const stub = stubExecutor({ timedOut: true, exitCode: null });
      const tool = createShellTool({ boundary, executor: stub.executor });
      const text = textOf(await tool.execute({ command: "sleep 999" }, ctx()));
      expect(text).toMatch(/timed out|timeout/i);
      expect(text).toMatch(/timeoutSeconds/);
    });

    it("잘림은 결과에 표시된다 — 조용한 잘림 금지 (§2.6)", async () => {
      const stub = stubExecutor({ truncated: true, stdout: "tail" });
      const tool = createShellTool({ boundary, executor: stub.executor });
      expect(textOf(await tool.execute({ command: "cat big" }, ctx()))).toMatch(/truncat/i);
    });

    it("stderr도 모델에게 보인다", async () => {
      const stub = stubExecutor({ exitCode: 1, stderr: "boom" });
      const tool = createShellTool({ boundary, executor: stub.executor });
      expect(textOf(await tool.execute({ command: "false" }, ctx()))).toContain("boom");
    });

    it('source는 "local"이다', async () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor });
      expect((await tool.execute({ command: "true" }, ctx())).source).toBe("local");
    });

    it("스키마에 없는 필드는 거부된다 (z.strictObject)", () => {
      const stub = stubExecutor();
      const tool = createShellTool({ boundary, executor: stub.executor }) as AgentTool;
      expect(validateToolArgs(tool, { command: "true", shell: "/bin/zsh" }).ok).toBe(false);
      expect(validateToolArgs(tool, { command: "true", env: { A: "1" } }).ok).toBe(false);
      expect(validateToolArgs(tool, { command: "true", timeoutSeconds: 0 }).ok).toBe(false);
    });
  });
});

describe("HostShellExecutor 계약 (TOOLS-INTERFACE §4)", () => {
  let sandbox: string;

  beforeAll(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qa-exec-")));
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const signal = (): AbortSignal => new AbortController().signal;

  describe("env 스크러빙 (SAFE-DEFAULTS §3 계약 3)", () => {
    it("이름 패턴에 걸리는 변수는 자식 프로세스에 도달하지 않는다", async () => {
      const executor = createHostShellExecutor({
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          ANTHROPIC_API_KEY: "sk-ant-name-pattern",
          GITHUB_TOKEN: "ghp-name-pattern",
          MY_SECRET: "secret-name-pattern",
          DB_PASSWORD: "password-name-pattern",
          HARMLESS: "keep-me",
        },
      });
      const result = await executor.exec(
        { command: "env", cwd: sandbox, timeoutMs: 5000 },
        signal(),
      );

      expect(result.stdout).not.toContain("sk-ant-name-pattern");
      expect(result.stdout).not.toContain("ghp-name-pattern");
      expect(result.stdout).not.toContain("secret-name-pattern");
      expect(result.stdout).not.toContain("password-name-pattern");
      // 스크러빙이 env를 통째로 비우는 것으로 "통과"하지 않게 하는 대조군
      expect(result.stdout).toContain("keep-me");
    });

    it("크리덴셜에서 로드한 값이 실린 변수는 이름과 무관하게 제거된다", async () => {
      const loaded = "sk-ant-loaded-from-credentials-file";
      const executor = createHostShellExecutor({
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          INNOCENT_NAME: loaded,
          EMBEDDED: `prefix ${loaded} suffix`,
        },
        secretValues: [loaded],
      });
      const result = await executor.exec(
        { command: "env", cwd: sandbox, timeoutMs: 5000 },
        signal(),
      );
      expect(result.stdout).not.toContain(loaded);
    });

    it("짧은 시크릿 값이 실린 변수도 제거된다", async () => {
      // §4 executor 계약은 "시크릿 값이 실린 변수 **전부**"라고 쓴다. 길이 하한을 두면
      // 그보다 짧은 시크릿은 그대로 자식에게 흐른다.
      // [미규정] "정확한 패턴 목록은 구현 시 확정"은 (2) 이름 패턴에 걸린 문장이고,
      // (1) 값 기반 제거에는 예외가 명시돼 있지 않다 — 판정 필요.
      const shortSecret = "s3cr3t";
      const executor = createHostShellExecutor({
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", INNOCENT: shortSecret },
        secretValues: [shortSecret],
      });
      const result = await executor.exec(
        { command: "env", cwd: sandbox, timeoutMs: 5000 },
        signal(),
      );
      expect(result.stdout).not.toContain(shortSecret);
    });
  });

  describe("timeout 강제", () => {
    it("초과하면 timedOut: true로 보고한다", async () => {
      const executor = createHostShellExecutor();
      const started = Date.now();
      const result = await executor.exec(
        { command: "sleep 10", cwd: sandbox, timeoutMs: 300 },
        signal(),
      );
      expect(result.timedOut).toBe(true);
      expect(Date.now() - started).toBeLessThan(5000);
    });

    it("백그라운드 손자 프로세스까지 종료한다 (프로세스 트리)", async () => {
      const marker = join(sandbox, "grandchild.marker");
      const executor = createHostShellExecutor();
      const result = await executor.exec(
        {
          // 백그라운드 서브셸이 살아남으면 타임아웃 후에 마커를 만든다
          command: `( sleep 1; echo pwned > ${marker} ) & sleep 10`,
          cwd: sandbox,
          timeoutMs: 300,
        },
        signal(),
      );
      expect(result.timedOut).toBe(true);
      await delay(2500);
      expect(existsSync(marker)).toBe(false);
    }, 20000);
  });

  describe("abort 존중", () => {
    it("중단 요청 후 프로세스가 계속 돌지 않는다", async () => {
      const marker = join(sandbox, "abort.marker");
      const controller = new AbortController();
      const executor = createHostShellExecutor();
      const started = Date.now();
      const pending = executor.exec(
        { command: `sleep 1; echo late > ${marker}`, cwd: sandbox, timeoutMs: 30000 },
        controller.signal,
      );
      setTimeout(() => controller.abort(), 100);
      await pending;
      expect(Date.now() - started).toBeLessThan(1000);
      await delay(1500);
      expect(existsSync(marker)).toBe(false);
    }, 20000);

    it("이미 중단된 시그널이면 프로세스를 아예 만들지 않는다", async () => {
      const marker = join(sandbox, "pre-abort.marker");
      const controller = new AbortController();
      controller.abort();
      const executor = createHostShellExecutor();
      await executor.exec(
        { command: `echo ran > ${marker}`, cwd: sandbox, timeoutMs: 5000 },
        controller.signal,
      );
      await delay(300);
      expect(existsSync(marker)).toBe(false);
    });
  });

  describe("출력 유계·전파", () => {
    it("상한을 넘으면 꼬리를 남기고 truncated로 표시한다", async () => {
      const executor = createHostShellExecutor({ maxOutputBytes: 1024 });
      const result = await executor.exec(
        {
          command: `node -e "process.stdout.write('HEADMARK'+'a'.repeat(5000)+'TAILMARK')"`,
          cwd: sandbox,
          timeoutMs: 10000,
        },
        signal(),
      );
      expect(result.truncated).toBe(true);
      expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(1024);
      // 진단 정보는 끝에 있다 — 꼬리를 남기는 것이 §4 계약
      expect(result.stdout.endsWith("TAILMARK")).toBe(true);
      expect(result.stdout).not.toContain("HEADMARK");
    }, 20000);

    it("exit code를 그대로 전파한다", async () => {
      const executor = createHostShellExecutor();
      const result = await executor.exec(
        { command: "exit 7", cwd: sandbox, timeoutMs: 5000 },
        signal(),
      );
      expect(result.exitCode).toBe(7);
      expect(result.timedOut).toBe(false);
    });

    it("stdout과 stderr를 분리해 담는다", async () => {
      const executor = createHostShellExecutor();
      const result = await executor.exec(
        { command: "echo to-out; echo to-err 1>&2", cwd: sandbox, timeoutMs: 5000 },
        signal(),
      );
      expect(result.stdout).toContain("to-out");
      expect(result.stderr).toContain("to-err");
      expect(result.stdout).not.toContain("to-err");
    });

    it("cwd에서 실행된다", async () => {
      const executor = createHostShellExecutor();
      const result = await executor.exec(
        { command: "pwd", cwd: sandbox, timeoutMs: 5000 },
        signal(),
      );
      expect(result.stdout.trim()).toBe(sandbox);
    });

    it("stdin이 닫혀 있어 입력 대기 명령이 타임아웃까지 매달리지 않는다", async () => {
      const executor = createHostShellExecutor();
      const started = Date.now();
      const result = await executor.exec(
        { command: "cat", cwd: sandbox, timeoutMs: 5000 },
        signal(),
      );
      expect(result.timedOut).toBe(false);
      expect(Date.now() - started).toBeLessThan(2000);
    }, 20000);
  });
});
