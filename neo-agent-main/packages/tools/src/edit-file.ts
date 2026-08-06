/**
 * `edit_file` — `docs/TOOLS-INTERFACE.md` §2.
 *
 * **정확 일치만 한다.** 레퍼런스(OpenClaw)의 fuzzy 매칭(NFKC 폴딩·스마트 따옴표
 * 정규화·근사 매칭)은 성공률을 올리는 대신 **조용히 엉뚱한 위치를 고칠 수 있다** —
 * 잘못된 수정이 성공으로 보고되는 것은 silent failure 계열이라 실패보다 나쁘다(§2.6).
 *
 * 대신 실패할 때 잘 실패한다: 일치 횟수와 다음에 무엇을 시도하면 되는지를 담아
 * 모델이 스스로 정정하게 한다.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { AgentTool, ToolResult } from "@neo-agent/core";
import { z } from "zod";
import { resolveAccessiblePath } from "./file-access.ts";
import type { WorkspaceBoundary } from "./workspace.ts";

const params = z.strictObject({
  path: z.string().describe("File path. Relative paths resolve against the workspace root."),
  oldText: z
    .string()
    .describe(
      "Exact text to replace, including whitespace and indentation. Must be unique unless replaceAll is set.",
    ),
  newText: z.string().describe("Replacement text."),
  replaceAll: z
    .boolean()
    .optional()
    .describe("Replace every occurrence instead of requiring exactly one. Default false."),
});

export interface EditFileDetails {
  path: string;
  replacements: number;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

export function createEditFileTool(boundary: WorkspaceBoundary): AgentTool<typeof params> {
  return {
    name: "edit_file",
    label: "Edit file",
    description:
      "Replace exact text in a file. oldText must match character-for-character (including " +
      "whitespace) and must be unique unless replaceAll is set. Read the file first to copy the " +
      "exact text.",
    paramsSchema: params,

    async execute(args): Promise<ToolResult<EditFileDetails>> {
      const resolved = resolveAccessiblePath(boundary, args.path);

      if (args.oldText === "") {
        throw new Error(
          "oldText is empty — it would match everywhere. Provide the exact text to replace.",
        );
      }
      if (args.oldText === args.newText) {
        throw new Error("oldText and newText are identical — this edit would change nothing.");
      }

      let content: string;
      try {
        content = await readFile(resolved.path, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          throw new Error(`File not found: ${resolved.path}. Use write_file to create it.`);
        }
        throw new Error(`Could not read ${resolved.path}: ${(error as Error).message}`);
      }

      const occurrences = countOccurrences(content, args.oldText);

      if (occurrences === 0) {
        throw new Error(
          `oldText was not found in ${resolved.path}. Read the file and copy the exact text — ` +
            "whitespace, indentation, and line endings must match.",
        );
      }
      if (occurrences > 1 && args.replaceAll !== true) {
        throw new Error(
          `oldText matches ${occurrences} places in ${resolved.path}. Include more surrounding ` +
            "context to make it unique, or set replaceAll: true to change all of them.",
        );
      }

      const updated =
        args.replaceAll === true
          ? content.split(args.oldText).join(args.newText)
          : content.replace(args.oldText, args.newText);

      try {
        await writeFile(resolved.path, updated, "utf8");
      } catch (error) {
        throw new Error(`Could not write ${resolved.path}: ${(error as Error).message}`);
      }

      return {
        content: [
          {
            type: "text",
            text:
              occurrences === 1
                ? `Replaced 1 occurrence in ${resolved.path}.`
                : `Replaced ${occurrences} occurrences in ${resolved.path}.`,
          },
        ],
        details: { path: resolved.path, replacements: occurrences },
        source: "local",
      };
    },
  };
}
