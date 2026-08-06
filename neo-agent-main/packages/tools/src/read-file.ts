/**
 * `read_file` — `docs/TOOLS-INTERFACE.md` §2.
 *
 * MVP는 텍스트 전용이다. 이미지는 `ToolResult`가 이미 실을 수 있어 추가가 싸므로
 * 멀티모달 요구가 실재할 때 연다(§6).
 */

import { readFile } from "node:fs/promises";
import type { AgentTool, ToolResult } from "@neo-agent/core";
import { z } from "zod";
import { resolveAccessiblePath } from "./file-access.ts";
import { DEFAULT_MAX_LINES, truncateText } from "./truncate.ts";
import type { WorkspaceBoundary } from "./workspace.ts";

const params = z.strictObject({
  path: z.string().describe("File path. Relative paths resolve against the workspace root."),
  offset: z.number().int().min(1).optional().describe("First line to read, 1-based."),
  limit: z.number().int().min(1).optional().describe("Maximum number of lines to read."),
});

export interface ReadFileDetails {
  path: string;
  truncated: boolean;
  totalLines: number;
  outputLines: number;
  truncatedBy?: "lines" | "bytes";
}

/**
 * 널 바이트가 있으면 텍스트로 다룰 수 없다 — 모델에게 바이너리를 쏟아붓지 않는다.
 * 이스케이프 표기를 쓰는 이유는 소스에 리터럴 제어문자를 두면 편집·grep에서 사라지기 때문이다.
 */
function looksBinary(content: string): boolean {
  return content.includes("\u0000");
}

export function createReadFileTool(boundary: WorkspaceBoundary): AgentTool<typeof params> {
  return {
    name: "read_file",
    label: "Read file",
    description:
      "Read a UTF-8 text file. Output is bounded; if the result is truncated the footer says " +
      "how to continue with `offset`. Returns file content verbatim, without line numbers.",
    paramsSchema: params,

    async execute(args): Promise<ToolResult<ReadFileDetails>> {
      const resolved = resolveAccessiblePath(boundary, args.path);

      let raw: string;
      try {
        raw = await readFile(resolved.path, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          throw new Error(
            `File not found: ${resolved.path}. Check the path, or list the directory first.`,
          );
        }
        if (code === "EISDIR") {
          throw new Error(
            `${resolved.path} is a directory, not a file. Use the shell tool to list its contents.`,
          );
        }
        throw new Error(`Could not read ${resolved.path}: ${(error as Error).message}`);
      }

      if (looksBinary(raw)) {
        throw new Error(
          `${resolved.path} looks like a binary file (contains null bytes). This tool reads UTF-8 text only.`,
        );
      }

      const offset = args.offset ?? 1;
      const allLines = raw.split("\n");

      if (offset > allLines.length) {
        throw new Error(
          `offset ${offset} is past the end of ${resolved.path}, which has ${allLines.length} lines.`,
        );
      }

      const window = allLines.slice(offset - 1);
      // 모델이 요청한 `limit`도 안전 상한을 넘지 못한다 — 상한이 없으면 도구 하나가
      // 컨텍스트를 통째로 먹는다.
      const maxLines = Math.min(args.limit ?? DEFAULT_MAX_LINES, DEFAULT_MAX_LINES);
      const result = truncateText(window.join("\n"), { maxLines });

      const details: ReadFileDetails = {
        path: resolved.path,
        truncated: result.truncated,
        totalLines: allLines.length,
        outputLines: result.outputLines,
        ...(result.truncatedBy === undefined ? {} : { truncatedBy: result.truncatedBy }),
      };

      const lastLine = offset + result.outputLines - 1;
      const footer = result.truncated
        ? `\n\n[Truncated by ${result.truncatedBy}: showed lines ${offset}-${lastLine} of ` +
          `${allLines.length}. Continue with offset=${lastLine + 1}.]`
        : "";

      return {
        content: [{ type: "text", text: result.text + footer }],
        details,
        source: "local",
      };
    },
  };
}
