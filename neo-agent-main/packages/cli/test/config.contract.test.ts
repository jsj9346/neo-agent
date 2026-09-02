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
 *   §3 표(2026-08-06 개정) 압축 3키 — T-008 구현자 추가분, T-012 QA 재검토 대상
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
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

  it("memoryDir는 설정 키가 아니다 — 미지 키로 거부된다 (MEMORY.md §9 M-2)", () => {
    // 근거: MEMORY.md §9 M-2 "메모리 디렉터리가 설정 키인가" → "닫힘: 열지 않는다".
    //       고정 `~/.neo-agent/memory/`이고 경로가 곧 격리다 — 이 키가 열리면 사용자가
    //       워크스페이스를 가리킬 수 있게 되어 write_file 한 번으로 §2.1의 격리가
    //       통째로 우회된다. 이 테스트는 KNOWN_KEYS(config.ts)에 memoryDir 부류가
    //       추가되는 순간 빨개진다 — 지금까지는 타입 시그니처(구조적)와 이 일반
    //       미지-키 거부(간접)뿐이었다(plans/20260902-memory-verify-report.md H-1).
    const ctx = setupHome(JSON.stringify({ approvalMode: "manual", memoryDir: "/tmp/elsewhere" }));
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

  // ── T-008 구현자 추가 — T-012 QA 재검토 대상 ─────────────────────────────
  // 근거: `CLI-INTERFACE.md` §3 표의 2026-08-06 개정 3행(`compactionAuto` true /
  //       `compactionThreshold` 0.75 / `compactionKeepRecentTurns` 2)과
  //       `COMPACTION.md` §8 "CLI-INTERFACE.md §3 | config 키 3종".
  //       기존 케이스는 손대지 않았고 아래 3건만 덧붙였다.

  it("[T-008] 압축 3키의 기본값 — 자동 true, 임계 0.75, 유지 2턴", () => {
    // 근거: §3 표 + COMPACTION.md §3 "자동이 기본이다 ... 안 만진 기본값이 하드 한도
    //       충돌을 만나지 않는 것이 §2.3(안전한 기본값)의 이행이다".
    //       기본값 3개는 §3 표가 수치까지 명시하므로 model과 달리 값이 계약이다.
    const ctx = setupHome();
    try {
      const config = load(ctx);
      expect(config.compactionAuto).toBe(true);
      expect(config.compactionThreshold).toBe(0.75);
      expect(config.compactionKeepRecentTurns).toBe(2);
    } finally {
      ctx.cleanup();
    }
  });

  it("[T-008] 압축 3키의 명시 값이 그대로 반영된다", () => {
    const ctx = setupHome(
      JSON.stringify({
        compactionAuto: false,
        compactionThreshold: 0.5,
        compactionKeepRecentTurns: 4,
      }),
    );
    try {
      const config = load(ctx);
      expect(config.compactionAuto).toBe(false);
      expect(config.compactionThreshold).toBe(0.5);
      expect(config.compactionKeepRecentTurns).toBe(4);
    } finally {
      ctx.cleanup();
    }
  });

  it("[T-008] 오타 난 압축 키(compactionauto)는 조용히 무시되지 않고 시작 에러가 된다", () => {
    // 근거: §3 "미지의 키는 시작 시 에러다". approvalmode 케이스와 같은 논리가
    //       압축 키에도 적용된다 — 사용자는 자동 압축을 껐다고 믿는데 실제로는
    //       기본값 true로 돌아 예상 못 한 시점에 세션이 분기된다.
    const ctx = setupHome(JSON.stringify({ compactionauto: false }));
    try {
      expect(() => load(ctx)).toThrow();
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
