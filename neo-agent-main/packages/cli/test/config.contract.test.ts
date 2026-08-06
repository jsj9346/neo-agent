/**
 * 설정 로더 계약 — `docs/CLI-INTERFACE.md` §3 + `docs/SAFE-DEFAULTS.md` §4.
 *
 * 기대값의 출처는 전부 문서다. 구현이 문서와 다르면 이 파일은 문서 편이다.
 *
 * 검증하는 계약:
 *   §3 표      기본값 — approvalMode "manual", denyRules [], model(값은 세부, 존재가 계약)
 *   §3 "미지의 키는 시작 시 에러다" — 오타 난 보안 키가 조용히 무시되는 침묵 실패 금지
 *   §3 "파싱 실패도 시작 시 에러"
 *   §3 "파일이 없으면 전부 기본값으로 동작한다"
 *   SAFE-DEFAULTS §4 "시작 시 1회 읽고 동결한다"
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadCliModule, pickExport } from "./harness.ts";
import { type CallStyle, callWith, frozenReport, makeTempHome, probeCallStyle } from "./support.ts";

interface ConfigCtx {
  home: string;
  configPath: string;
}

const CANDIDATES: readonly CallStyle<ConfigCtx>[] = [
  { label: "loadConfig()  (HOME 경유)", args: () => [] },
  { label: "loadConfig(configPath)", args: (ctx) => [ctx.configPath] },
  { label: "loadConfig({ configPath })", args: (ctx) => [{ configPath: ctx.configPath }] },
  { label: "loadConfig({ path })", args: (ctx) => [{ path: ctx.configPath }] },
  { label: "loadConfig(homeDir)", args: (ctx) => [ctx.home] },
  { label: "loadConfig({ home })", args: (ctx) => [{ home: ctx.home }] },
];

let loadConfig: unknown;
let style: CallStyle<ConfigCtx>;

/** 임시 홈을 만들고 HOME을 그쪽으로 돌린다. `content`가 없으면 config.json을 만들지 않는다 */
function setupHome(content?: string): ConfigCtx & { cleanup: () => void } {
  const { home, cleanup } = makeTempHome();
  const dir = join(home, ".neo-agent");
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, "config.json");
  if (content !== undefined) writeFileSync(configPath, content, "utf8");
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  return { home, configPath, cleanup };
}

function load(ctx: ConfigCtx): Record<string, unknown> {
  return callWith<ConfigCtx, Record<string, unknown>>(loadConfig, style, ctx);
}

beforeAll(async () => {
  const module = await loadCliModule("config.ts");
  loadConfig = pickExport(module, ["loadConfig", "loadCliConfig", "readConfig"], "설정 로더");

  // 유효한 설정으로 호출 형태를 1회 결정한다(support.ts 규약)
  const ctx = setupHome(JSON.stringify({ approvalMode: "manual" }));
  try {
    style = probeCallStyle<ConfigCtx>(loadConfig, ctx, CANDIDATES, "loadConfig");
  } finally {
    vi.unstubAllEnvs();
    ctx.cleanup();
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("설정 로더 (CLI-INTERFACE §3)", () => {
  it("파일이 없으면 전부 기본값 — approvalMode는 manual, denyRules는 빈 배열", () => {
    // 근거: §3 "파일이 없으면 전부 기본값으로 동작한다 — '안 만진 상태가 가장 안전'의 이행"
    //       SAFE-DEFAULTS §1 "기본값: manual"
    const ctx = setupHome();
    try {
      const config = load(ctx);
      expect(config.approvalMode).toBe("manual");
      expect(config.denyRules).toEqual([]);
    } finally {
      ctx.cleanup();
    }
  });

  it("model 기본값이 존재한다 (값은 세부, 존재가 계약)", () => {
    // 근거: §3 표 "model | string | 구현 시 확정 (기본값 존재가 계약)"
    const ctx = setupHome();
    try {
      const config = load(ctx);
      expect(typeof config.model).toBe("string");
      expect(String(config.model).length).toBeGreaterThan(0);
    } finally {
      ctx.cleanup();
    }
  });

  it("유효한 설정은 그대로 반영된다", () => {
    const ctx = setupHome(
      JSON.stringify({ approvalMode: "off", denyRules: ["rm *", "git push*"] }),
    );
    try {
      const config = load(ctx);
      expect(config.approvalMode).toBe("off");
      expect(config.denyRules).toEqual(["rm *", "git push*"]);
    } finally {
      ctx.cleanup();
    }
  });

  it("미지의 키는 시작 에러다", () => {
    // 근거: §3 "미지의 키는 시작 시 에러다"
    const ctx = setupHome(JSON.stringify({ approvalMode: "manual", telemetry: true }));
    try {
      expect(() => load(ctx)).toThrow();
    } finally {
      ctx.cleanup();
    }
  });

  it("오타 난 보안 키(approvalmode)는 조용히 무시되지 않고 시작 에러가 된다", () => {
    // 근거: §3 "오타 난 보안 키(approvalmode 등)가 조용히 무시되고 기본값으로 도는 것은
    //       침묵 실패다". 이 케이스가 이 계약의 존재 이유다 — 사용자는 게이트를 껐다고
    //       믿는데 실제로는 manual로 돌거나(마찰) 그 반대(위험)가 된다.
    const ctx = setupHome(JSON.stringify({ approvalmode: "off" }));
    try {
      expect(() => load(ctx)).toThrow();
    } finally {
      ctx.cleanup();
    }
  });

  it("JSON 파싱 실패는 시작 에러다", () => {
    // 근거: §3 "포맷은 JSON ... 파싱 실패도 시작 시 에러"
    const ctx = setupHome('{ "approvalMode": "manual", }  // trailing comma + comment');
    try {
      expect(() => load(ctx)).toThrow();
    } finally {
      ctx.cleanup();
    }
  });

  it("approvalMode의 값이 닫힌 유니온 밖이면 에러다", () => {
    // 근거: SAFE-DEFAULTS §1 `type ApprovalMode = "manual" | "off"` — 닫힌 유니온.
    // 미지 키를 막는 이유("조용히 기본값으로 도는 것은 침묵 실패")가 값에도 그대로
    // 적용된다: `"yolo"`가 조용히 manual로 떨어지면 사용자 의도와 실동작이 갈린다.
    const ctx = setupHome(JSON.stringify({ approvalMode: "yolo" }));
    try {
      expect(() => load(ctx)).toThrow();
    } finally {
      ctx.cleanup();
    }
  });

  it("반환 객체는 동결된다 (SAFE-DEFAULTS §4)", () => {
    // 근거: SAFE-DEFAULTS §4 "보안에 영향을 주는 모든 설정은 프로세스 시작 시 1회 읽고
    //       동결한다. 프로세스 안에서 도는 어떤 코드도 실행 중 게이트를 약화시킬 수 없다"
    //       CLI-INTERFACE §3 "전 키는 시작 시 1회 읽고 동결한다"
    const ctx = setupHome(JSON.stringify({ approvalMode: "manual", denyRules: ["rm *"] }));
    try {
      const config = load(ctx);
      expect(Object.isFrozen(config)).toBe(true);

      // 동결이 실제로 약화를 막는지 — 쓰기 시도가 값을 바꾸지 못해야 한다.
      // (strict mode에서는 throw, sloppy에서는 무시. 둘 다 "안 바뀜"으로 관찰한다)
      try {
        (config as Record<string, unknown>).approvalMode = "off";
      } catch {
        // strict mode의 TypeError — 계약 충족
      }
      expect(config.approvalMode).toBe("manual");
    } finally {
      ctx.cleanup();
    }
  });

  it("denyRules 배열도 동결된다 — 게이트 규칙이 세션 중 비워지는 경로가 없어야 한다", () => {
    // 근거: SAFE-DEFAULTS §4는 "설정"의 동결을 말한다. 최상위 객체만 얼리고 배열을
    //       열어두면 `config.denyRules.length = 0` 한 줄로 2계층이 통째로 사라진다 —
    //       "실행 중 게이트를 약화시킬 수 없다"가 성립하지 않는다.
    //       APPROVAL-GATE §5도 denyRules를 생성 시 동결 대상으로 명시한다.
    const ctx = setupHome(JSON.stringify({ approvalMode: "manual", denyRules: ["rm *"] }));
    try {
      const config = load(ctx);
      expect(frozenReport(config)).toEqual([]);
    } finally {
      ctx.cleanup();
    }
  });
});
