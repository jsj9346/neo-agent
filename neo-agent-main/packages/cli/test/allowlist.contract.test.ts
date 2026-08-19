/**
 * AllowlistStore 파일 구현 계약 — `docs/CLI-INTERFACE.md` §10 + `docs/APPROVAL-GATE.md` §5.
 *
 * 검증하는 계약:
 *   CLI §10 위치 `~/.neo-agent/allowlist` — "이 위치의 부수 효과는 ... denylist가
 *           `~/.neo-agent/**` 전체이므로 **에이전트가 도구로 자기 allowlist를 넓힐 수
 *           없다**. 파일을 옮기면 이 보호가 조용히 사라진다"
 *   CLI §10 포맷 "한 줄 = 키 하나(UTF-8)"
 *   CLI §10 "시작 시 1회 로드하고 재읽기하지 않는다. `add`는 메모리와 파일 append에
 *           동시 반영"
 *   CLI §10 "**append 실패는 조용히 넘기지 않는다**: 메모리 반영은 유지하되(이번
 *           세션은 유효) '다음 세션에 남지 않는다'는 경고를 표시한다"
 *   GATE §5 "allowlist는 동결의 명시적 예외 — 세션 중 **추가만** 일어난다"
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadCliModule, pickExport } from "./harness.ts";
import {
  type CallStyle,
  callWith,
  captureWarnings,
  makeTempHome,
  probeCallStyle,
} from "./support.ts";

interface AllowlistCtx {
  home: string;
  allowlistPath: string;
}

interface AllowlistStoreLike {
  has: (key: string) => boolean;
  add: (key: string) => void;
}

const CANDIDATES: readonly CallStyle<AllowlistCtx>[] = [
  { label: "createAllowlistStore()  (HOME 경유)", args: () => [] },
  { label: "createAllowlistStore(path)", args: (ctx) => [ctx.allowlistPath] },
  { label: "createAllowlistStore({ path })", args: (ctx) => [{ path: ctx.allowlistPath }] },
  { label: "createAllowlistStore({ filePath })", args: (ctx) => [{ filePath: ctx.allowlistPath }] },
  { label: "createAllowlistStore(homeDir)", args: (ctx) => [ctx.home] },
  { label: "createAllowlistStore({ home })", args: (ctx) => [{ home: ctx.home }] },
];

let createAllowlistStore: unknown;
let style: CallStyle<AllowlistCtx>;

function setupHome(content?: string): AllowlistCtx & { cleanup: () => void } {
  const { home, cleanup } = makeTempHome();
  const dir = join(home, ".neo-agent");
  mkdirSync(dir, { recursive: true });
  const allowlistPath = join(dir, "allowlist");
  if (content !== undefined) writeFileSync(allowlistPath, content, "utf8");
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  return {
    home,
    allowlistPath,
    cleanup: () => {
      // 권한 테스트가 잠근 것을 되돌린 뒤 정리한다
      try {
        chmodSync(dir, 0o700);
        if (existsSync(allowlistPath)) chmodSync(allowlistPath, 0o600);
      } catch {
        // 이미 정상이면 무시
      }
      cleanup();
    },
  };
}

function open(ctx: AllowlistCtx): AllowlistStoreLike {
  return callWith<AllowlistCtx, AllowlistStoreLike>(createAllowlistStore, style, ctx);
}

beforeAll(async () => {
  const module = await loadCliModule("allowlist.ts");
  createAllowlistStore = pickExport(
    module,
    ["createAllowlistStore", "createFileAllowlistStore", "openAllowlist"],
    "allowlist 스토어 팩토리",
  );

  const ctx = setupHome("shell:npm run build\n");
  try {
    style = probeCallStyle<AllowlistCtx>(
      createAllowlistStore,
      ctx,
      CANDIDATES,
      "createAllowlistStore",
    );
  } finally {
    vi.unstubAllEnvs();
    ctx.cleanup();
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("allowlist — 로드 (CLI-INTERFACE §10)", () => {
  it("한 줄 1키로 로드한다", () => {
    // 근거: §10 "포맷: 한 줄 = 키 하나(UTF-8). 키 형식은 게이트가 정의한다
    //       (APPROVAL-GATE §7 — `shell:…`·`fileWrite:…`)"
    const ctx = setupHome(
      ["shell:npm run build", "fileWrite:/ws/src/a.ts", "shell:git status", ""].join("\n"),
    );
    try {
      const store = open(ctx);
      expect(store.has("shell:npm run build")).toBe(true);
      expect(store.has("fileWrite:/ws/src/a.ts")).toBe(true);
      expect(store.has("shell:git status")).toBe(true);
      expect(store.has("shell:rm -rf /")).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it("파일이 없어도 빈 스토어로 연다", () => {
    // 설정 파일과 같은 원칙 — 안 만진 상태가 동작해야 한다.
    const ctx = setupHome();
    try {
      const store = open(ctx);
      expect(store.has("shell:anything")).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it("공백 줄이 키가 되지 않는다", () => {
    const ctx = setupHome("shell:ls\n\n\n");
    try {
      const store = open(ctx);
      expect(store.has("")).toBe(false);
      expect(store.has(" ")).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });
});

describe("allowlist — add는 메모리와 파일에 동시 반영 (CLI-INTERFACE §10)", () => {
  it("add한 키를 has가 즉시 인정한다", () => {
    const ctx = setupHome("");
    try {
      const store = open(ctx);
      expect(store.has("shell:git status")).toBe(false);
      store.add("shell:git status");
      expect(store.has("shell:git status")).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("add한 키가 파일에도 append된다 — 다음 세션에 남는다", () => {
    // 근거: §10 "`add`는 메모리와 파일 append에 동시 반영"
    const ctx = setupHome("shell:npm run build\n");
    try {
      const store = open(ctx);
      store.add("shell:git status");

      const contents = readFileSync(ctx.allowlistPath, "utf8");
      const keys = contents
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      // 기존 키가 날아가지 않아야 한다(append지 덮어쓰기가 아니다)
      expect(keys).toContain("shell:npm run build");
      expect(keys).toContain("shell:git status");

      // 새 프로세스가 그대로 읽는다
      const reopened = open(ctx);
      expect(reopened.has("shell:git status")).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });
});

describe("allowlist — 재읽기하지 않는다 (CLI-INTERFACE §10 / APPROVAL-GATE §5)", () => {
  it("세션 중 파일이 외부에서 바뀌어도 반영되지 않는다", () => {
    // 근거: §10 "시작 시 1회 로드하고 재읽기하지 않는다(게이트 §5 — 재읽기는 세션 중
    //       설정 변경 경로다)". 재읽기하면 프로세스 안에서 도는 코드가 파일을 고쳐
    //       게이트를 넓히는 경로가 생긴다(SAFE-DEFAULTS §4 동결의 취지).
    const ctx = setupHome("shell:npm run build\n");
    try {
      const store = open(ctx);
      writeFileSync(ctx.allowlistPath, "shell:npm run build\nshell:rm -rf /\n", "utf8");
      expect(store.has("shell:rm -rf /"), "외부 편집이 세션 중에 반영됐다").toBe(false);
    } finally {
      ctx.cleanup();
    }
  });
});

describe("allowlist — append 실패는 조용히 넘기지 않는다 (CLI-INTERFACE §10)", () => {
  it("쓰기 불가일 때 경고를 내고, has()는 이번 세션 동안 true를 유지한다", () => {
    // 근거: §10 "append 실패는 조용히 넘기지 않는다: 메모리 반영은 유지하되(이번
    //       세션은 유효) '다음 세션에 남지 않는다'는 경고를 표시한다. 안내 없는 부분
    //       성공은 침묵 실패다(§2.6)"
    //
    //       CLI §10 "경고는 **주입된 핸들러**로 전달한다"
    //
    // 전달 수단은 2026-08-06에 판정됐다 — 주입된 핸들러다(`SESSION-STORE.md` §7과 같은
    // 구조: 모듈은 UI를 모르고 표시는 호스트 몫). 2026-08-20(K-005)까지 이 자리에
    // 수단이 문서에 없다는 마커가 남아 있었다.
    //
    // **그래도 이 테스트는 핸들러를 주입하지 않는다.** 이 파일의 시그니처 관용 규약이
    // 호출 형태를 탐색으로 고르므로(`support.ts`) 옵션 인자의 이름을 아는 순간 그
    // 규약이 깨진다. 그래서 여기서 재는 것은 여전히 **어디로든 나왔는가**이고,
    // 주입 경로 자체를 재는 것은 이 사이클의 범위 밖이다(보고에 올린다).
    // throw로 알리는 구현은 계약 위반이다 — 메모리 반영은 유지가 성립하지 않는다.
    const ctx = setupHome("shell:npm run build\n");
    const captured = captureWarnings();
    try {
      const store = open(ctx);
      // 파일과 디렉터리 양쪽을 잠가 append를 실패시킨다
      chmodSync(ctx.allowlistPath, 0o400);
      chmodSync(join(ctx.home, ".neo-agent"), 0o500);

      expect(
        () => store.add("shell:git status"),
        "append 실패가 throw로 새어 나왔다",
      ).not.toThrow();
      expect(store.has("shell:git status"), "메모리 반영이 유지되지 않았다").toBe(true);
      expect(
        captured.messages.join("\n").length,
        "append 실패가 조용히 넘어갔다 — 침묵 실패",
      ).toBeGreaterThan(0);
    } finally {
      captured.restore();
      ctx.cleanup();
    }
  });
});

describe("allowlist — 위치 (CLI-INTERFACE §10)", () => {
  it("기본 위치는 ~/.neo-agent/allowlist다", () => {
    // 근거: §10 "위치: **`~/.neo-agent/allowlist`**. ... denylist가 `~/.neo-agent/**`
    //       전체이므로 에이전트가 도구로 자기 allowlist를 넓힐 수 없다. **파일을 옮기면
    //       이 보호가 조용히 사라진다**"
    //
    // 이 테스트는 경로를 주입하는 호출 형태가 선택된 경우 의미가 없으므로, HOME 경유
    // 형태일 때만 관찰한다(그 외에는 기본 경로를 이 테스트로 알 수 없다).
    const ctx = setupHome();
    try {
      const store = open(ctx);
      store.add("shell:location-probe");
      if (style.label.includes("HOME 경유")) {
        expect(
          existsSync(ctx.allowlistPath),
          "allowlist가 ~/.neo-agent/allowlist에 쓰이지 않았다 — denylist 밖이면 보호가 사라진다",
        ).toBe(true);
      }
    } finally {
      ctx.cleanup();
    }
  });
});
