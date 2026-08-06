/**
 * `write_file` — `docs/TOOLS-INTERFACE.md` §2.
 *
 * 덮어쓰기 여부를 결과에 명시한다. 덮어쓰기를 승인할지는 게이트의 판단이지만,
 * **일어난 일이 보이는 것**은 도구의 책임이다(§2.6).
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentTool, ToolResult } from "@neo-agent/core";
import { z } from "zod";
import { resolveAccessiblePath } from "./file-access.ts";
import type { WorkspaceBoundary } from "./workspace.ts";

const params = z.strictObject({
  path: z.string().describe("File path. Relative paths resolve against the workspace root."),
  content: z.string().describe("Full file content to write. Replaces any existing content."),
});

export interface WriteFileDetails {
  path: string;
  created: boolean;
  bytes: number;
  previousBytes?: number;
}

async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

export function createWriteFileTool(boundary: WorkspaceBoundary): AgentTool<typeof params> {
  return {
    name: "write_file",
    label: "Write file",
    description:
      "Write a UTF-8 text file, replacing existing content. Parent directories are created " +
      "automatically. To change part of a file, prefer edit_file — it will not clobber the rest.",
    paramsSchema: params,

    async execute(args): Promise<ToolResult<WriteFileDetails>> {
      const resolved = resolveAccessiblePath(boundary, args.path);
      const previousBytes = await fileSize(resolved.path);

      try {
        await mkdir(dirname(resolved.path), { recursive: true });
        await writeFile(resolved.path, args.content, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EISDIR") {
          throw new Error(`${resolved.path} is a directory — pick a file path.`);
        }
        if (code === "EACCES" || code === "EPERM") {
          throw new Error(`No permission to write ${resolved.path}.`);
        }
        throw new Error(`Could not write ${resolved.path}: ${(error as Error).message}`);
      }

      const bytes = Buffer.byteLength(args.content, "utf8");
      const created = previousBytes === null;

      return {
        content: [
          {
            type: "text",
            text: created
              ? `Created ${resolved.path} (${bytes} bytes).`
              : `Overwrote ${resolved.path} (${previousBytes} → ${bytes} bytes).`,
          },
        ],
        details: {
          path: resolved.path,
          created,
          bytes,
          ...(previousBytes === null ? {} : { previousBytes }),
        },
        source: "local",
      };
    },
  };
}
