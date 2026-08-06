/**
 * `shell` — `docs/TOOLS-INTERFACE.md` §2·§4.
 *
 * 이 파일은 프로세스를 직접 스폰하지 않는다 — 주입된 `ShellExecutor`를 부를 뿐이다.
 * 실행 백엔드가 여기 새어 들어오면 샌드박스 도입이 셸 도구 재작성이 된다.
 */

import type { AgentTool, ToolResult } from "@neo-agent/core";
import { z } from "zod";
import type { ShellExecutor } from "./executor.ts";
import type { WorkspaceBoundary } from "./workspace.ts";

const params = z.strictObject({
  command: z.string().describe("Shell command to run."),
  cwd: z
    .string()
    .optional()
    .describe("Working directory. Must be inside the workspace. Defaults to the workspace root."),
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Kill the command after this many seconds."),
});

/** 무한 대기는 결과 없는 침묵이다(§2.6) — 기본값이 반드시 존재한다 */
const DEFAULT_TIMEOUT_SECONDS = 120;

export interface ShellDetails {
  cwd: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export interface ShellToolOptions {
  boundary: WorkspaceBoundary;
  executor: ShellExecutor;
  defaultTimeoutSeconds?: number;
}

/** 모델은 stdout만 보고 성공을 판단하기 쉽다 — 종료 코드와 stderr를 항상 함께 싣는다 */
function renderResult(
  exitCode: number | null,
  stdout: string,
  stderr: string,
  notes: readonly string[],
): string {
  const sections: string[] = [];
  sections.push(exitCode === null ? "Terminated by signal." : `Exit code: ${exitCode}`);
  if (stdout.trim().length > 0) sections.push(`stdout:\n${stdout.trimEnd()}`);
  if (stderr.trim().length > 0) sections.push(`stderr:\n${stderr.trimEnd()}`);
  if (stdout.trim().length === 0 && stderr.trim().length === 0) {
    sections.push("(no output)");
  }
  for (const note of notes) sections.push(note);
  return sections.join("\n\n");
}

export function createShellTool(options: ShellToolOptions): AgentTool<typeof params> {
  const { boundary, executor } = options;
  const defaultTimeoutSeconds = options.defaultTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  return {
    name: "shell",
    label: "Run shell command",
    description:
      "Run a shell command inside the workspace. stdin is closed, so interactive commands will " +
      "not hang waiting for input. Output is bounded and the exit code is always reported.",
    paramsSchema: params,

    async execute(args, ctx): Promise<ToolResult<ShellDetails>> {
      const requested = args.cwd ?? boundary.root;
      const resolved = boundary.resolve(requested);

      // 경계 검사는 실행 **직전**에 한다 — 게이트가 승인 시점에 한 판정을 신뢰하지
      // 않는다(판정과 사용 사이의 간극은 TOOLS-INTERFACE §3이 인정한 한계지만,
      // 재판정으로 그 창을 최대한 좁힌다).
      if (resolved.scope !== "inside") {
        throw new Error(
          `cwd "${requested}" is outside the workspace (${boundary.root}). ` +
            "Run commands from inside the workspace.",
        );
      }

      const timeoutMs = (args.timeoutSeconds ?? defaultTimeoutSeconds) * 1000;
      const result = await executor.exec(
        { command: args.command, cwd: resolved.path, timeoutMs },
        ctx.signal,
      );

      const notes: string[] = [];
      if (result.timedOut) {
        notes.push(
          `[Timed out after ${timeoutMs / 1000}s and was killed. Re-run with a larger ` +
            "timeoutSeconds, or narrow the command.]",
        );
      }
      if (result.truncated) {
        notes.push("[Output was truncated; only the tail is shown.]");
      }

      return {
        content: [
          {
            type: "text",
            text: renderResult(result.exitCode, result.stdout, result.stderr, notes),
          },
        ],
        details: {
          cwd: resolved.path,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
        // 셸이 curl로 외부 콘텐츠를 가져오는 경우의 휴리스틱 판정은 taint 정책
        // 집행과 함께 후순위다(CORE-INTERFACE §11) — 그때까지 "local" 고정.
        source: "local",
      };
    },
  };
}
