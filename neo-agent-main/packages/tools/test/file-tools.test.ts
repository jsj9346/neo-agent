/**
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEditFileTool } from "../src/edit-file.ts";
import { createReadFileTool } from "../src/read-file.ts";
import { createWorkspaceBoundary, type WorkspaceBoundary } from "../src/workspace.ts";
import { createWriteFileTool } from "../src/write-file.ts";

const ctx = { toolCallId: "t1", signal: new AbortController().signal };

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

describe("파일 도구", () => {
  let sandbox: string;
  let root: string;
  let home: string;
  let boundary: WorkspaceBoundary;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-file-tools-")));
    root = join(sandbox, "workspace");
    home = join(sandbox, "home");
    mkdirSync(root, { recursive: true });
    mkdirSync(join(home, ".neo-agent"), { recursive: true });
    writeFileSync(join(home, ".neo-agent", "credentials"), "ANTHROPIC_API_KEY=secret\n");
    writeFileSync(join(root, ".env"), "ANTHROPIC_API_KEY=secret\n");
    boundary = createWorkspaceBoundary({ root, home });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe("read_file", () => {
    it("워크스페이스 안 파일을 원문 그대로 읽는다", async () => {
      writeFileSync(join(root, "note.txt"), "hello\nworld\n");
      const result = await createReadFileTool(boundary).execute({ path: "note.txt" }, ctx);
      expect(textOf(result)).toBe("hello\nworld\n");
      expect(result.source).toBe("local");
    });

    it("잘렸으면 잘린 사실과 이어 읽는 방법을 알린다", async () => {
      const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
      writeFileSync(join(root, "long.txt"), lines.join("\n"));

      const result = await createReadFileTool(boundary).execute(
        { path: "long.txt", limit: 10 },
        ctx,
      );
      const text = textOf(result);
      expect(text).toContain("line 10");
      expect(text).not.toContain("line 11");
      expect(text).toContain("Truncated");
      expect(text).toContain("offset=11");
    });

    it("offset으로 이어 읽는다", async () => {
      const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
      writeFileSync(join(root, "long.txt"), lines.join("\n"));

      const result = await createReadFileTool(boundary).execute(
        { path: "long.txt", offset: 11, limit: 5 },
        ctx,
      );
      expect(textOf(result)).toContain("line 11");
      expect(textOf(result)).not.toContain("line 10\n");
    });

    it("없는 파일은 경로를 담은 에러로 실패한다", async () => {
      await expect(
        createReadFileTool(boundary).execute({ path: "missing.txt" }, ctx),
      ).rejects.toThrow(/File not found/);
    });

    it("바이너리는 거부한다", async () => {
      writeFileSync(join(root, "bin.dat"), Buffer.from([0x00, 0x01, 0x02]));
      await expect(createReadFileTool(boundary).execute({ path: "bin.dat" }, ctx)).rejects.toThrow(
        /binary/i,
      );
    });

    it("크리덴셜 경로는 게이트 없이도 도구가 차단한다", async () => {
      await expect(
        createReadFileTool(boundary).execute({ path: "~/.neo-agent/credentials" }, ctx),
      ).rejects.toThrow(/cannot be lifted by approval/);
    });

    it("워크스페이스 `.env`도 차단한다", async () => {
      await expect(createReadFileTool(boundary).execute({ path: ".env" }, ctx)).rejects.toThrow(
        /blocked/,
      );
    });
  });

  describe("write_file", () => {
    it("새 파일을 만들고 생성 사실을 알린다", async () => {
      const result = await createWriteFileTool(boundary).execute(
        { path: "out.txt", content: "hi" },
        ctx,
      );
      expect(readFileSync(join(root, "out.txt"), "utf8")).toBe("hi");
      expect(textOf(result)).toContain("Created");
    });

    it("부모 디렉터리를 자동 생성한다", async () => {
      await createWriteFileTool(boundary).execute(
        { path: "deep/nested/dir/file.txt", content: "x" },
        ctx,
      );
      expect(readFileSync(join(root, "deep/nested/dir/file.txt"), "utf8")).toBe("x");
    });

    it("덮어쓰기는 조용히 하지 않는다 — 이전 크기까지 보고한다", async () => {
      writeFileSync(join(root, "exists.txt"), "old content");
      const result = await createWriteFileTool(boundary).execute(
        { path: "exists.txt", content: "new" },
        ctx,
      );
      const text = textOf(result);
      expect(text).toContain("Overwrote");
      expect(text).toContain("11");
    });

    it("크리덴셜 경로 쓰기도 차단한다", async () => {
      await expect(
        createWriteFileTool(boundary).execute(
          { path: "~/.neo-agent/credentials", content: "pwned" },
          ctx,
        ),
      ).rejects.toThrow(/blocked/);
      expect(readFileSync(join(home, ".neo-agent", "credentials"), "utf8")).toContain("secret");
    });
  });

  describe("edit_file", () => {
    it("유일하게 일치하는 텍스트를 바꾼다", async () => {
      writeFileSync(join(root, "code.ts"), "const a = 1;\nconst b = 2;\n");
      const result = await createEditFileTool(boundary).execute(
        { path: "code.ts", oldText: "const a = 1;", newText: "const a = 42;" },
        ctx,
      );
      expect(readFileSync(join(root, "code.ts"), "utf8")).toBe("const a = 42;\nconst b = 2;\n");
      expect(textOf(result)).toContain("1 occurrence");
    });

    it("일치가 없으면 정확 일치가 필요하다고 알린다", async () => {
      writeFileSync(join(root, "code.ts"), "const a = 1;\n");
      await expect(
        createEditFileTool(boundary).execute(
          { path: "code.ts", oldText: "const  a = 1;", newText: "x" },
          ctx,
        ),
      ).rejects.toThrow(/not found[\s\S]*whitespace/);
    });

    it("여러 곳이 일치하면 실행하지 않고 횟수와 대안을 알린다", async () => {
      writeFileSync(join(root, "code.ts"), "x\nx\nx\n");
      await expect(
        createEditFileTool(boundary).execute({ path: "code.ts", oldText: "x", newText: "y" }, ctx),
      ).rejects.toThrow(/matches 3 places[\s\S]*replaceAll/);
      expect(readFileSync(join(root, "code.ts"), "utf8")).toBe("x\nx\nx\n");
    });

    it("replaceAll이면 전부 바꾼다", async () => {
      writeFileSync(join(root, "code.ts"), "x\nx\nx\n");
      const result = await createEditFileTool(boundary).execute(
        { path: "code.ts", oldText: "x", newText: "y", replaceAll: true },
        ctx,
      );
      expect(readFileSync(join(root, "code.ts"), "utf8")).toBe("y\ny\ny\n");
      expect(textOf(result)).toContain("3 occurrences");
    });

    it("fuzzy 매칭을 하지 않는다 — 스마트 따옴표는 정확 일치가 아니다", async () => {
      writeFileSync(join(root, "code.ts"), "const s = 'hi';\n");
      await expect(
        createEditFileTool(boundary).execute(
          { path: "code.ts", oldText: "const s = ‘hi’;", newText: "const s = 'bye';" },
          ctx,
        ),
      ).rejects.toThrow(/not found/);
    });

    it("빈 oldText는 거부한다", async () => {
      writeFileSync(join(root, "code.ts"), "a\n");
      await expect(
        createEditFileTool(boundary).execute({ path: "code.ts", oldText: "", newText: "b" }, ctx),
      ).rejects.toThrow(/empty/);
    });

    it("oldText와 newText가 같으면 거부한다", async () => {
      writeFileSync(join(root, "code.ts"), "a\n");
      await expect(
        createEditFileTool(boundary).execute({ path: "code.ts", oldText: "a", newText: "a" }, ctx),
      ).rejects.toThrow(/identical/);
    });
  });
});
