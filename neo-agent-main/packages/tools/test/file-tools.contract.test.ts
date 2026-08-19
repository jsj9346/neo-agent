/**
 * 파일 도구 3종 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처:
 *   - `docs/TOOLS-INTERFACE.md` §2 (도구별 계약), §3 (denied는 도구가 강제), §6 (fuzzy 기각)
 *   - `docs/CORE-INTERFACE.md` §6 (실패는 throw, strictObject, source 필수, 에러는 다음 행동을 담는다)
 *   - `docs/SAFE-DEFAULTS.md` §1 매트릭스 ("승인으로도 불가")
 *
 * 게이트는 배선하지 않는다 — §1이 "게이트 없이도 도구는 완결적으로 동작한다"고,
 * §3이 "denied 차단은 게이트가 꺼져 있어도 동작한다"고 규정하므로 이 파일 전체가
 * 그 조건의 검증이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool, ToolExecutionContext } from "@neo-agent/core";
import { validateToolArgs } from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createEditFileTool,
  createReadFileTool,
  createWorkspaceBoundary,
  createWriteFileTool,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type WorkspaceBoundary,
} from "../src/index.ts";

function ctx(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return { toolCallId: "call-1", signal };
}

/** 도구 결과의 텍스트 파트만 이어 붙인다 — 모델이 실제로 보는 것 */
function textOf(result: { content: readonly { type: string }[] }): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

describe("파일 도구 계약 (TOOLS-INTERFACE §2·§3)", () => {
  let sandbox: string;
  let root: string;
  let home: string;
  let outside: string;
  let boundary: WorkspaceBoundary;
  let readFileTool: ReturnType<typeof createReadFileTool>;
  let writeFileTool: ReturnType<typeof createWriteFileTool>;
  let editFileTool: ReturnType<typeof createEditFileTool>;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qa-files-")));
    root = join(sandbox, "ws");
    home = join(sandbox, "home");
    outside = join(sandbox, "elsewhere");

    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(home, ".neo-agent"), { recursive: true });
    mkdirSync(outside, { recursive: true });

    writeFileSync(join(root, "src", "app.ts"), "export const answer = 42;\n");
    writeFileSync(join(root, ".env"), "ANTHROPIC_API_KEY=sk-ant-workspace-secret\n");
    writeFileSync(join(home, ".neo-agent", "credentials"), "sk-ant-real-credential\n");
    writeFileSync(join(home, ".neo-agent", "config.json"), '{"approvalMode":"manual"}\n');
    writeFileSync(join(outside, "notes.txt"), "outside content\n");

    boundary = createWorkspaceBoundary({ root, home });
    readFileTool = createReadFileTool(boundary);
    writeFileTool = createWriteFileTool(boundary);
    editFileTool = createEditFileTool(boundary);
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  // ── 공통 계약 ─────────────────────────────────────────────────────────────
  describe("공통 — CORE-INTERFACE §6", () => {
    it('모든 도구 결과의 source는 "local"이다 (TOOLS-INTERFACE §2)', async () => {
      const read = await readFileTool.execute({ path: "src/app.ts" }, ctx());
      const write = await writeFileTool.execute({ path: "new.txt", content: "x" }, ctx());
      const edit = await editFileTool.execute(
        { path: "new.txt", oldText: "x", newText: "y" },
        ctx(),
      );
      expect(read.source).toBe("local");
      expect(write.source).toBe("local");
      expect(edit.source).toBe("local");
    });

    it("스키마에 없는 필드가 오면 검증이 실패한다 (z.strictObject)", () => {
      const cases: [AgentTool, Record<string, unknown>][] = [
        [readFileTool as AgentTool, { path: "src/app.ts", recursive: true }],
        [writeFileTool as AgentTool, { path: "a.txt", content: "x", mode: 511 }],
        [editFileTool as AgentTool, { path: "a.txt", oldText: "a", newText: "b", fuzzy: true }],
      ];
      for (const [tool, args] of cases) {
        expect(validateToolArgs(tool, args).ok, `${tool.name} rejects unknown key`).toBe(false);
      }
    });

    it("타입이 틀린 인자도 검증이 실패한다", () => {
      expect(validateToolArgs(readFileTool as AgentTool, { path: 1 }).ok).toBe(false);
      expect(validateToolArgs(readFileTool as AgentTool, { path: "a", offset: 0 }).ok).toBe(false);
      expect(validateToolArgs(readFileTool as AgentTool, { path: "a", limit: 0 }).ok).toBe(false);
    });

    it("실패는 content가 아니라 throw로 알린다", async () => {
      await expect(readFileTool.execute({ path: "does-not-exist.txt" }, ctx())).rejects.toThrow();
    });
  });

  // ── denied 차단 — 게이트 없이 ─────────────────────────────────────────────
  describe("denied 차단 — 게이트 미배선 상태 (TOOLS-INTERFACE §3 · SAFE-DEFAULTS §1)", () => {
    it("read_file은 워크스페이스 `.env`를 읽지 못하고 내용도 새지 않는다", async () => {
      await expect(readFileTool.execute({ path: ".env" }, ctx())).rejects.toThrow(
        /blocked|denied|protected/i,
      );
      await expect(readFileTool.execute({ path: ".env" }, ctx())).rejects.not.toThrow(
        /sk-ant-workspace-secret/,
      );
    });

    it("read_file은 크리덴셜 파일을 읽지 못한다", async () => {
      await expect(
        readFileTool.execute({ path: "~/.neo-agent/credentials" }, ctx()),
      ).rejects.toThrow(/blocked|denied|protected/i);
    });

    it("read_file은 설정 디렉터리 전체를 읽지 못한다 — credentials만이 아니다", async () => {
      await expect(
        readFileTool.execute({ path: "~/.neo-agent/config.json" }, ctx()),
      ).rejects.toThrow(/blocked|denied|protected/i);
    });

    it("write_file은 크리덴셜 경로에 쓰지 못하고 파일도 만들지 않는다", async () => {
      await expect(
        writeFileTool.execute({ path: "~/.neo-agent/evil.json", content: "x" }, ctx()),
      ).rejects.toThrow(/blocked|denied|protected/i);
      expect(existsSync(join(home, ".neo-agent", "evil.json"))).toBe(false);
    });

    it("write_file은 설정 파일을 덮어써 다음 세션의 게이트를 약화시키지 못한다", async () => {
      await expect(
        writeFileTool.execute(
          { path: "~/.neo-agent/config.json", content: '{"approvalMode":"off"}' },
          ctx(),
        ),
      ).rejects.toThrow();
      expect(readFileSync(join(home, ".neo-agent", "config.json"), "utf8")).toContain("manual");
    });

    it("edit_file은 워크스페이스 `.env`를 고치지 못하고 내용도 그대로다", async () => {
      await expect(
        editFileTool.execute(
          { path: ".env", oldText: "sk-ant-workspace-secret", newText: "leaked" },
          ctx(),
        ),
      ).rejects.toThrow(/blocked|denied|protected/i);
      expect(readFileSync(join(root, ".env"), "utf8")).toContain("sk-ant-workspace-secret");
    });

    it("차단 사유가 에러 텍스트에 담긴다 — 침묵 거부 금지 (§2.6)", async () => {
      const error = await readFileTool.execute({ path: ".env" }, ctx()).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toMatch(/\.env/);
      // 승인으로도 열리지 않는다는 사실이 모델에게 보여야 재시도 루프를 돌지 않는다
      expect(message.toLowerCase()).toMatch(/approval|cannot be lifted|승인/);
    });

    it("outside는 도구가 막지 않는다 — 밖 접근 허용 여부는 게이트의 판단이다", async () => {
      const result = await readFileTool.execute({ path: join(outside, "notes.txt") }, ctx());
      expect(textOf(result)).toContain("outside content");
    });

    it("대소문자만 바꾼 `.ENV`로 시크릿을 읽어낼 수 없어야 한다", async () => {
      // 대소문자 비구분 파일시스템에서 `.ENV`는 `.env`와 같은 파일이다. 여기서
      // 내용이 반환되면 SAFE-DEFAULTS §1의 "승인으로도 불가" 행이 실제로 뚫린다.
      await expect(readFileTool.execute({ path: ".ENV" }, ctx())).rejects.toThrow(
        /blocked|denied|protected/i,
      );
    });

    it("대소문자만 바꾼 경로로 시크릿 파일을 덮어쓸 수 없어야 한다", async () => {
      // 읽기보다 파괴적인 방향 — 같은 우회로 사용자의 `.env`가 지워지거나
      // 공격자 키로 교체된다.
      await expect(
        writeFileTool.execute({ path: ".ENV", content: "ANTHROPIC_API_KEY=attacker\n" }, ctx()),
      ).rejects.toThrow();
      expect(readFileSync(join(root, ".env"), "utf8")).toContain("sk-ant-workspace-secret");

      await expect(
        writeFileTool.execute({ path: "~/.NEO-AGENT/credentials", content: "attacker\n" }, ctx()),
      ).rejects.toThrow();
      expect(readFileSync(join(home, ".neo-agent", "credentials"), "utf8")).toContain(
        "sk-ant-real-credential",
      );
    });
  });

  // ── read_file ─────────────────────────────────────────────────────────────
  describe("read_file (§2)", () => {
    it("텍스트를 그대로 반환한다", async () => {
      const result = await readFileTool.execute({ path: "src/app.ts" }, ctx());
      expect(textOf(result)).toBe("export const answer = 42;\n");
    });

    it("MVP는 텍스트 전용 — 바이너리를 모델에게 쏟아붓지 않는다 (§2)", async () => {
      writeFileSync(join(root, "blob.bin"), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]));
      const error = await readFileTool.execute({ path: "blob.bin" }, ctx()).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/binary|text/i);
    });

    it("존재하지 않는 파일은 경로를 담아 throw한다", async () => {
      const error = await readFileTool
        .execute({ path: "src/missing.ts" }, ctx())
        .catch((e: Error) => e);
      expect((error as Error).message).toContain(join(root, "src", "missing.ts"));
    });

    it("에러 텍스트가 다음에 무엇을 할지 알려준다 (CORE-INTERFACE §6)", async () => {
      const error = await readFileTool
        .execute({ path: "src/missing.ts" }, ctx())
        .catch((e: Error) => e);
      // "무엇을 시도하면 되는지"가 없으면 모델은 같은 호출을 반복한다
      expect((error as Error).message).toMatch(/check|list|create|instead|try/i);
    });

    it("줄 수 상한을 넘으면 잘렸다는 사실과 이어 읽는 방법을 명시한다", async () => {
      const total = DEFAULT_MAX_LINES + 500;
      const lines = Array.from({ length: total }, (_, i) => `line ${i + 1}`);
      writeFileSync(join(root, "long.txt"), lines.join("\n"));

      const result = await readFileTool.execute({ path: "long.txt" }, ctx());
      const text = textOf(result);
      expect(text).toMatch(/truncat/i);
      expect(text).toMatch(/offset\s*=?\s*\d+/i);
      expect(text).toContain(String(total));
    });

    it("잘린 결과의 안내대로 offset 재호출하면 원본이 손실 없이 복원된다 (줄 상한)", async () => {
      const total = DEFAULT_MAX_LINES + 500;
      const lines = Array.from({ length: total }, (_, i) => `line ${i + 1}`);
      const original = lines.join("\n");
      writeFileSync(join(root, "long.txt"), original);

      const first = textOf(await readFileTool.execute({ path: "long.txt" }, ctx()));
      const nextOffset = Number(/offset\s*=\s*(\d+)/i.exec(first)?.[1]);
      expect(Number.isInteger(nextOffset)).toBe(true);

      const body = first.split("\n\n[")[0] ?? "";
      const second = textOf(
        await readFileTool.execute({ path: "long.txt", offset: nextOffset }, ctx()),
      );
      expect(`${body}\n${second}`).toBe(original);
    });

    it("잘린 결과의 안내대로 offset 재호출하면 원본이 손실 없이 복원된다 (바이트 상한)", async () => {
      // 긴 줄이 섞이면 바이트 상한이 줄 중간에서 끊는다. 안내가 "다음 줄부터"라면
      // 끊긴 줄의 나머지가 조용히 사라진다 — §2 "이어 읽는 방법"이 실제로 이어지지
      // 않는 것이고, §2.6의 조용한 잘림에 해당한다.
      const lineLength = 1000;
      // 2회 읽기로 끝나도록 크기를 잡는다 — 두 번째 읽기가 또 잘리면 원인이 흐려진다
      const count = Math.ceil((DEFAULT_MAX_BYTES / lineLength) * 1.5);
      const lines = Array.from(
        { length: count },
        (_, i) => `${String(i + 1).padStart(4, "0")}:${"x".repeat(lineLength)}`,
      );
      const original = lines.join("\n");
      writeFileSync(join(root, "wide.txt"), original);

      const first = textOf(await readFileTool.execute({ path: "wide.txt" }, ctx()));
      expect(first).toMatch(/truncat/i);
      const nextOffset = Number(/offset\s*=\s*(\d+)/i.exec(first)?.[1]);
      const body = first.split("\n\n[")[0] ?? "";
      const second = textOf(
        await readFileTool.execute({ path: "wide.txt", offset: nextOffset }, ctx()),
      );
      expect(second, "두 번째 읽기는 끝까지 담아야 이 검증이 성립한다").not.toMatch(/truncat/i);

      // 거대한 문자열 diff 대신 길이로 비교한다 — 손실 바이트 수가 바로 보인다
      const stitched = `${body}\n${second}`;
      expect(stitched.length).toBe(original.length);
      expect(stitched).toBe(original);
    });

    it("한 줄이 상한을 넘어 회수 불가하면 거짓 안내 대신 그 사실을 알린다 (§2 2026-08-06)", async () => {
      // §2: "부분 반환이 불가피한 경우에는 그 사실을 별도로 알린다(이어 읽기로
      // 회수되지 않음을 명시)". 이 경우에 "Continue with offset=..."을 쓰면 안내가
      // 거짓이 되고, 모델은 사라진 구간을 인지하지 못한다.
      const giant = `${"y".repeat(DEFAULT_MAX_BYTES + 5000)}\ntail line\n`;
      writeFileSync(join(root, "giant-line.txt"), giant);

      const text = textOf(await readFileTool.execute({ path: "giant-line.txt" }, ctx()));
      expect(text).toMatch(/truncat/i);
      expect(text).not.toMatch(/continue with offset/i);
      expect(text).toMatch(/cannot be retrieved|not be retrieved|회수/i);
    });

    it("뒤쪽의 긴 줄은 그 줄 앞에서 끊어 이어 읽기를 유지한다", async () => {
      // 첫 줄이 아니라 중간 줄이 상한을 넘는 경우 — 그 줄 직전에서 끊으면
      // 안내가 여전히 참이고, 다음 호출에서 그 줄이 창의 첫 줄이 되어 §2의
      // "회수 불가 고지" 경로로 정확히 넘어간다.
      const original = `head line\n${"z".repeat(DEFAULT_MAX_BYTES + 5000)}\n`;
      writeFileSync(join(root, "late-giant.txt"), original);

      const first = textOf(await readFileTool.execute({ path: "late-giant.txt" }, ctx()));
      const body = first.split("\n\n[")[0] ?? "";
      expect(body).toBe("head line");
      const nextOffset = Number(/offset\s*=\s*(\d+)/i.exec(first)?.[1]);
      expect(nextOffset).toBe(2);

      const second = textOf(
        await readFileTool.execute({ path: "late-giant.txt", offset: nextOffset }, ctx()),
      );
      expect(second).not.toMatch(/continue with offset/i);
    });

    it("offset/limit 창의 내용이 정확하고, 이어 읽는 지점이 맞다", async () => {
      // [미규정] 모델이 limit으로 스스로 좁힌 읽기도 "Truncated"로 표시된다. §2는
      // "잘렸으면 명시"만 규정하고 잘림의 기준(파일 전체 대비인지 요청한 창 대비인지)을
      // 정하지 않는다. 안내(offset=15)는 정확하므로 여기서는 위반으로 보지 않았다 — 판정 필요.
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
      writeFileSync(join(root, "small.txt"), lines.join("\n"));
      const text = textOf(
        await readFileTool.execute({ path: "small.txt", offset: 10, limit: 5 }, ctx()),
      );
      const body = text.split("\n\n[")[0] ?? "";
      expect(body).toBe("line 10\nline 11\nline 12\nline 13\nline 14");
      expect(/offset\s*=\s*(\d+)/i.exec(text)?.[1]).toBe("15");
    });

    it("파일 전체가 상한 안이면 잘림 표시가 없다", async () => {
      writeFileSync(join(root, "tiny.txt"), "a\nb\nc\n");
      const text = textOf(await readFileTool.execute({ path: "tiny.txt" }, ctx()));
      expect(text).not.toMatch(/truncat/i);
    });

    it("limit이 상한을 넘겨도 잘림이 가시화된다 — 조용한 축소 금지", async () => {
      const total = DEFAULT_MAX_LINES + 100;
      writeFileSync(
        join(root, "long2.txt"),
        Array.from({ length: total }, (_, i) => `l${i + 1}`).join("\n"),
      );
      const result = await readFileTool.execute(
        { path: "long2.txt", limit: DEFAULT_MAX_LINES + 100 },
        ctx(),
      );
      expect(textOf(result)).toMatch(/truncat/i);
    });
  });

  // ── write_file ────────────────────────────────────────────────────────────
  describe("write_file (§2)", () => {
    it("부모 디렉터리를 자동 생성한다", async () => {
      await writeFileTool.execute({ path: "a/b/c/new.txt", content: "hi" }, ctx());
      expect(readFileSync(join(root, "a", "b", "c", "new.txt"), "utf8")).toBe("hi");
    });

    it("신규 생성임을 결과에 명시한다", async () => {
      const result = await writeFileTool.execute({ path: "fresh.txt", content: "hi" }, ctx());
      expect(textOf(result)).toMatch(/creat/i);
    });

    it("덮어쓰기임을 결과에 명시한다 — 조용한 덮어쓰기 금지 (§2.6)", async () => {
      const result = await writeFileTool.execute(
        { path: "src/app.ts", content: "export const answer = 43;\n" },
        ctx(),
      );
      const text = textOf(result);
      expect(text).toMatch(/overwrote|overwrit|replac/i);
      expect(text).not.toMatch(/^created/i);
    });
  });

  // ── edit_file ─────────────────────────────────────────────────────────────
  describe("edit_file — 정확 일치만 (§2·§6)", () => {
    it("유일 일치는 교체한다", async () => {
      const result = await editFileTool.execute(
        { path: "src/app.ts", oldText: "42", newText: "43" },
        ctx(),
      );
      expect(readFileSync(join(root, "src", "app.ts"), "utf8")).toBe("export const answer = 43;\n");
      expect(textOf(result)).toMatch(/1/);
    });

    it("0회 일치는 실행 없이 에러이며 다음 시도 방법을 담는다", async () => {
      writeFileSync(join(root, "t.txt"), "alpha\n");
      const error = await editFileTool
        .execute({ path: "t.txt", oldText: "beta", newText: "gamma" }, ctx())
        .catch((e: Error) => e);
      expect((error as Error).message).toMatch(/exact|whitespace|read the file/i);
      expect(readFileSync(join(root, "t.txt"), "utf8")).toBe("alpha\n");
    });

    it("2회 이상 일치는 일치 횟수와 replaceAll을 안내한다", async () => {
      writeFileSync(join(root, "t.txt"), "x\nx\nx\n");
      const error = await editFileTool
        .execute({ path: "t.txt", oldText: "x", newText: "y" }, ctx())
        .catch((e: Error) => e);
      const message = (error as Error).message;
      expect(message).toContain("3");
      expect(message).toMatch(/replaceAll/);
      expect(readFileSync(join(root, "t.txt"), "utf8")).toBe("x\nx\nx\n");
    });

    it("replaceAll: true면 전부 교체한다", async () => {
      writeFileSync(join(root, "t.txt"), "x\nx\nx\n");
      await editFileTool.execute(
        { path: "t.txt", oldText: "x", newText: "y", replaceAll: true },
        ctx(),
      );
      expect(readFileSync(join(root, "t.txt"), "utf8")).toBe("y\ny\ny\n");
    });

    it("빈 oldText는 실행 없이 에러다", async () => {
      writeFileSync(join(root, "t.txt"), "alpha\n");
      await expect(
        editFileTool.execute({ path: "t.txt", oldText: "", newText: "z" }, ctx()),
      ).rejects.toThrow();
      expect(readFileSync(join(root, "t.txt"), "utf8")).toBe("alpha\n");
    });

    it("fuzzy 매칭을 하지 않는다 — NFKC 동형·스마트 따옴표·공백·개행 차이는 전부 실패", async () => {
      const cases: { name: string; content: string; oldText: string }[] = [
        // NFKC 폴딩을 하면 전각 문자가 반각과 일치한다
        { name: "전각/반각", content: "const foo = 1;\n", oldText: "ｆｏｏ" },
        { name: "NFD 결합문자", content: "café\n", oldText: "café" },
        // 스마트 따옴표 정규화를 하면 곧은 따옴표와 일치한다
        { name: "스마트 따옴표", content: 'say("hi");\n', oldText: "say(“hi”);" },
        { name: "들여쓰기 탭/스페이스", content: "\tindented\n", oldText: "    indented" },
        { name: "줄바꿈 CRLF/LF", content: "a\r\nb\r\n", oldText: "a\nb" },
        { name: "논브레이킹 스페이스", content: "a b\n", oldText: "a b" },
      ];

      for (const testCase of cases) {
        const file = join(root, "fuzzy.txt");
        writeFileSync(file, testCase.content);
        await expect(
          editFileTool.execute(
            { path: "fuzzy.txt", oldText: testCase.oldText, newText: "REPLACED" },
            ctx(),
          ),
          testCase.name,
        ).rejects.toThrow();
        expect(readFileSync(file, "utf8"), testCase.name).toBe(testCase.content);
      }
    });

    it("존재하지 않는 파일은 write_file을 안내한다", async () => {
      const error = await editFileTool
        .execute({ path: "nope.txt", oldText: "a", newText: "b" }, ctx())
        .catch((e: Error) => e);
      expect((error as Error).message).toMatch(/write_file|create/i);
    });
  });
});
