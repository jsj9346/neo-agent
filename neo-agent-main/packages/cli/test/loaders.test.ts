/**
 * 설정·크리덴셜·allowlist 로더 단위 테스트 — `docs/CLI-INTERFACE.md` §3·§4·§10.
 *
 * 세 로더 모두 경로를 주입받으므로 실제 홈 디렉터리를 건드리지 않는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAllowlistStore } from "../src/allowlist.ts";
import { DEFAULT_APPROVAL_MODE, DEFAULT_MODEL, loadConfig } from "../src/config.ts";
import { API_KEY_ENV, loadCredentials } from "../src/credentials.ts";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "neo-cli-loaders-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function write(name: string, content: string, mode = 0o600): string {
  const path = join(workDir, name);
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
  return path;
}

describe("loadConfig (§3)", () => {
  it("파일이 없으면 전부 기본값이다 — 안 만진 상태가 가장 안전", () => {
    const config = loadConfig(join(workDir, "없는-파일.json"));
    expect(config.approvalMode).toBe(DEFAULT_APPROVAL_MODE);
    expect(config.model).toBe(DEFAULT_MODEL);
    expect(config.denyRules).toEqual([]);
  });

  it("반환된 설정은 배열까지 동결된다 (SAFE-DEFAULTS §4)", () => {
    const config = loadConfig(write("config.json", JSON.stringify({ denyRules: ["rm *"] })));
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.denyRules)).toBe(true);
    expect(() => {
      (config.denyRules as string[]).push("우회");
    }).toThrow();
  });

  it("모르는 키는 시작 에러다 — 오타 난 보안 키가 조용히 무시되지 않는다", () => {
    const path = write("config.json", JSON.stringify({ approvalmode: "off" }));
    expect(() => loadConfig(path)).toThrow(/approvalmode/);
  });

  it("시크릿 키를 넣으면 모르는 키로 걸린다 — 설정 파일에 시크릿을 두지 않는다", () => {
    const path = write("config.json", JSON.stringify({ apiKey: "sk-ant-xxx" }));
    expect(() => loadConfig(path)).toThrow(/apiKey/);
  });

  it("파싱 실패도 시작 에러다", () => {
    expect(() => loadConfig(write("config.json", "{ 이건 JSON이 아니다"))).toThrow(/JSON/);
  });

  it("타입이 어긋난 값은 기본값으로 흘려보내지 않는다", () => {
    expect(() =>
      loadConfig(write("config.json", JSON.stringify({ approvalMode: "yolo" }))),
    ).toThrow(/approvalMode/);
    expect(() => loadConfig(write("config.json", JSON.stringify({ denyRules: "rm *" })))).toThrow(
      /denyRules/,
    );
    expect(() => loadConfig(write("config.json", JSON.stringify({ model: "" })))).toThrow(/model/);
  });
});

describe("loadCredentials (§4)", () => {
  it("env가 있으면 그 키에 한해 env 값이 이긴다", () => {
    // 근거: §4 우선순위 블록 — "있으면 그 키에 한해 파일 값을 쓰지 않는다".
    //
    // **2026-09-02 갱신.** 이 축의 이전 판은 이름도 단정도 "파일을 읽지 않는다"였고,
    // 그것은 우선순위가 키별 독립이 되기 전의 §4를 굳힌 것이었다. 지금 로더는 파일을
    // **읽는다** — 안 읽으면 다른 키의 파일 값이 함께 가려지기 때문이다. 갈린 것은
    // 「읽는가」이고 「어느 값이 그 키로 쓰이는가」는 그대로다.
    const path = write("credentials", `${API_KEY_ENV}=파일-키\n`);
    const loaded = loadCredentials({ [API_KEY_ENV]: "env-키" }, path);
    expect(loaded.apiKey).toBe("env-키");
    // `secretValues`는 두 갈래의 합집합이다(§4) — 가려진 파일 값도 스크러빙 대상이다.
    // **느슨해진 것이 아니라 요구가 하나 늘었다**: 파일 값이 빠지면 이 갈래에서만
    // 시크릿이 자식 프로세스로 샌다(SAFE-DEFAULTS §3 보호 계약 3).
    expect([...loaded.secretValues].sort()).toEqual(["env-키", "파일-키"].sort());
  });

  it("env로 받았어도 느슨한 파일이 있으면 기동을 거부한다 — 노출 사실이 보여야 한다", () => {
    const path = write("credentials", `${API_KEY_ENV}=파일-키\n`, 0o644);
    expect(() => loadCredentials({ [API_KEY_ENV]: "env-키" }, path)).toThrow(/chmod 0600/);
  });

  it("거부해도 파일 권한을 자동으로 고치지 않는다", () => {
    const path = write("credentials", `${API_KEY_ENV}=k\n`, 0o644);
    expect(() => loadCredentials({}, path)).toThrow();
    expect(readFileSync(path, "utf8")).toContain("k");
    // 여전히 느슨하다 — 두 번째 실행도 같은 이유로 거부된다
    expect(() => loadCredentials({}, path)).toThrow(/chmod/);
  });

  it("더 좁은 권한(0400)은 통과한다", () => {
    const path = write("credentials", `${API_KEY_ENV}=k\n`, 0o400);
    expect(loadCredentials({}, path).apiKey).toBe("k");
  });

  it("dotenv형을 파싱하고 모든 값을 시크릿으로 돌려준다", () => {
    const path = write(
      "credentials",
      ["# 주석", "", `${API_KEY_ENV}="따옴표-키"`, "OTHER_TOKEN = 다른-시크릿 "].join("\n"),
    );
    const loaded = loadCredentials({}, path);
    expect(loaded.apiKey).toBe("따옴표-키");
    expect([...loaded.secretValues].sort()).toEqual(["다른-시크릿", "따옴표-키"].sort());
  });

  it("형식이 어긋난 줄은 조용히 건너뛰지 않는다", () => {
    const path = write("credentials", `${API_KEY_ENV}=k\n이건키가아니다\n`);
    expect(() => loadCredentials({}, path)).toThrow(/:2/);
  });

  it("빈 env 값은 부재로 보고 파일로 넘어간다", () => {
    const path = write("credentials", `${API_KEY_ENV}=파일-키\n`);
    expect(loadCredentials({ [API_KEY_ENV]: "  " }, path).apiKey).toBe("파일-키");
  });

  it("어느 경로에도 키가 없으면 설정 방법을 안내하고 실패한다", () => {
    expect(() => loadCredentials({}, join(workDir, "없는-파일"))).toThrow(/chmod 0600/);
  });
});

describe("createAllowlistStore (§10)", () => {
  it("시작 시 1회 로드하고 파일을 다시 읽지 않는다", () => {
    const path = write("allowlist", "shell:npm run build\n");
    const store = createAllowlistStore(path);
    expect(store.has("shell:npm run build")).toBe(true);

    writeFileSync(path, "shell:npm run build\nshell:나중에 추가됨\n");
    // 재읽기는 세션 중 설정 변경 경로다 — 적용 시점은 다음 프로세스 시작이다
    expect(store.has("shell:나중에 추가됨")).toBe(false);
  });

  it("파일이 없으면 빈 allowlist다", () => {
    const store = createAllowlistStore(join(workDir, "없는-파일"));
    expect(store.has("무엇이든")).toBe(false);
  });

  it("add는 메모리와 파일에 동시 반영한다", () => {
    const path = join(workDir, "allowlist");
    const store = createAllowlistStore(path);
    store.add("fileWrite:/ws/src/a.ts");

    expect(store.has("fileWrite:/ws/src/a.ts")).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("fileWrite:/ws/src/a.ts\n");
  });

  it("개행 없이 끝난 기존 파일에 이어 붙여도 키가 붙지 않는다", () => {
    const path = write("allowlist", "shell:ls");
    const store = createAllowlistStore(path);
    store.add("shell:pwd");
    expect(readFileSync(path, "utf8")).toBe("shell:ls\nshell:pwd\n");
  });

  it("append 실패는 메모리를 유지하되 경고한다 — 조용한 부분 성공 금지", () => {
    const onWarning = vi.fn();
    // 디렉터리 경로로는 append가 실패한다
    const store = createAllowlistStore(join(workDir, "없는-디렉터리", "allowlist"), { onWarning });

    store.add("shell:ls");

    expect(store.has("shell:ls")).toBe(true);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning.mock.calls[0]?.[0]).toMatch(/다음 세션에는 남지 않는다/);
  });

  it("이미 있는 키는 다시 기록하지 않는다", () => {
    const path = write("allowlist", "shell:ls\n");
    const store = createAllowlistStore(path);
    store.add("shell:ls");
    expect(readFileSync(path, "utf8")).toBe("shell:ls\n");
  });
});
