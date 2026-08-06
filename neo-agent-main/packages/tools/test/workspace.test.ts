import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkspaceBoundary, type WorkspaceBoundary } from "../src/workspace.ts";

/**
 * 경계 판정은 게이트 매트릭스의 안/밖 구분이 기대는 토대다 — 여기가 뚫리면
 * 승인 정책 전체가 무의미해진다(SAFE-DEFAULTS §6이 1급 검증 대상으로 지목).
 */
describe("WorkspaceBoundary", () => {
  let sandbox: string;
  let root: string;
  let home: string;
  let outside: string;
  let boundary: WorkspaceBoundary;

  beforeAll(() => {
    // macOS tmpdir은 `/var` → `/private/var` 심링크다. realpath로 고정하지 않으면
    // 기대값과 판정 결과가 어긋난다.
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-boundary-")));
    root = join(sandbox, "workspace");
    home = join(sandbox, "home");
    outside = join(sandbox, "elsewhere");

    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(home, ".neo-agent"), { recursive: true });
    mkdirSync(outside, { recursive: true });

    writeFileSync(join(root, "src", "app.ts"), "export {};\n");
    writeFileSync(join(root, ".env"), "SECRET=1\n");
    writeFileSync(join(root, ".env.local"), "SECRET=2\n");
    writeFileSync(join(root, ".env.example"), "SECRET=\n");
    writeFileSync(join(home, ".neo-agent", "credentials"), "key\n");
    writeFileSync(join(outside, "secret.txt"), "private\n");

    boundary = createWorkspaceBoundary({ root, home });
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("루트를 realpath로 정규화해 동결한다", () => {
    const viaSymlinkedTmp = createWorkspaceBoundary({ root: join(tmpdir(), ".."), home });
    expect(viaSymlinkedTmp.root).toBe(realpathSync(join(tmpdir(), "..")));
    expect(boundary.root).toBe(root);
  });

  describe("inside", () => {
    it("워크스페이스 안의 상대 경로", () => {
      expect(boundary.resolve("src/app.ts")).toEqual({
        path: join(root, "src", "app.ts"),
        scope: "inside",
      });
    });

    it("워크스페이스 안의 절대 경로", () => {
      expect(boundary.resolve(join(root, "src")).scope).toBe("inside");
    });

    it("루트 자기 자신", () => {
      expect(boundary.resolve(root).scope).toBe("inside");
    });

    it("아직 존재하지 않는 쓰기 대상 — 미존재를 이유로 판정을 포기하지 않는다", () => {
      const target = boundary.resolve("src/deep/new/file.ts");
      expect(target.scope).toBe("inside");
      expect(target.path).toBe(join(root, "src", "deep", "new", "file.ts"));
    });
  });

  describe("outside", () => {
    it("`..`로 워크스페이스를 탈출하는 경로", () => {
      expect(boundary.resolve("../elsewhere/secret.txt").scope).toBe("outside");
    });

    it("중첩된 `..` 이스케이프", () => {
      expect(boundary.resolve("src/../../elsewhere/secret.txt").scope).toBe("outside");
    });

    it("prefix가 겹치는 형제 디렉터리 — 문자열 비교였다면 통과했을 경로", () => {
      const evil = `${root}-evil`;
      mkdirSync(evil, { recursive: true });
      writeFileSync(join(evil, "x.txt"), "x\n");
      expect(boundary.resolve(join(evil, "x.txt")).scope).toBe("outside");
    });

    it("`~` 확장으로 홈을 가리키는 경로", () => {
      expect(boundary.resolve("~").scope).toBe("outside");
      expect(boundary.resolve("~/notes.md").scope).toBe("outside");
    });

    it("워크스페이스 안의 심볼릭 링크가 밖을 가리키면 밖이다 — 판정 대상은 실체", () => {
      const link = join(root, "escape-link");
      symlinkSync(outside, link);
      const resolved = boundary.resolve("escape-link/secret.txt");
      expect(resolved.scope).toBe("outside");
      expect(resolved.path).toBe(join(outside, "secret.txt"));
    });

    it("심링크 체인도 끝까지 따라간다", () => {
      const first = join(sandbox, "hop-1");
      const second = join(root, "hop-2");
      symlinkSync(outside, first);
      symlinkSync(first, second);
      expect(boundary.resolve("hop-2/secret.txt").scope).toBe("outside");
    });
  });

  describe("denied — 승인으로도 열리지 않는 대상", () => {
    it("크리덴셜 파일", () => {
      expect(boundary.resolve(join(home, ".neo-agent", "credentials")).scope).toBe("denied");
    });

    it("설정 디렉터리 전체 — credentials만이 아니다", () => {
      expect(boundary.resolve(join(home, ".neo-agent")).scope).toBe("denied");
      expect(boundary.resolve(join(home, ".neo-agent", "config.json")).scope).toBe("denied");
      expect(boundary.resolve(join(home, ".neo-agent", "sub", "deep", "x")).scope).toBe("denied");
    });

    it("`~` 경유로 접근해도 같다", () => {
      expect(boundary.resolve("~/.neo-agent/credentials").scope).toBe("denied");
    });

    it("워크스페이스 심링크로 우회해도 같다", () => {
      const link = join(root, "cred-link");
      symlinkSync(join(home, ".neo-agent"), link);
      expect(boundary.resolve("cred-link/credentials").scope).toBe("denied");
    });

    it("워크스페이스 `.env`와 그 변형", () => {
      expect(boundary.resolve(".env").scope).toBe("denied");
      expect(boundary.resolve(".env.local").scope).toBe("denied");
    });

    it("`.env.example`도 막는다 — 예외를 두면 그 이름으로 위장한 시크릿이 통과한다", () => {
      expect(boundary.resolve(".env.example").scope).toBe("denied");
    });

    it("워크스페이스 밖의 `.env`는 denied가 아니라 outside다", () => {
      writeFileSync(join(outside, ".env"), "X=1\n");
      expect(boundary.resolve(join(outside, ".env")).scope).toBe("outside");
    });
  });
});
