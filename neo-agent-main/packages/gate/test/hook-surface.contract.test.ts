/**
 * 훅 배치와 패키지 경계 — `docs/APPROVAL-GATE.md` §1·§4 + `docs/CORE-INTERFACE.md` §7.
 *
 * 정본 문면:
 *   - APPROVAL-GATE §4 — "**오염 추적은 훅을 더 갖지 않고 평범한 메서드로
 *     노출한다.** `afterToolCall`을 게이트가 소유해 버리면 출력 후처리(트렁케이션)
 *     라는 원래 소비자와 충돌해 호스트가 합성을 강요받는다(CORE-INTERFACE §7 —
 *     훅 소비자는 각각 하나로 확정돼 있다)."
 *   - CORE-INTERFACE §7 — "두 훅의 소비자는 각각 확정돼 있다: `beforeToolCall` ←
 *     승인 게이트, `afterToolCall` ← 출력 후처리."
 *   - APPROVAL-GATE §1 — "의존성 예산: `@neo-agent/core` 정확히 1개", 금지 임포트,
 *     그리고 §3 — "SSRF 판정의 유일한 소유자는 `packages/web`이다."
 *
 * 소스 텍스트를 직접 읽는 이유: "게이트가 `packages/web`을 임포트하지 않는다"는
 * 런타임 동작이 아니라 **임포트 그래프**의 성질이라 실행으로는 확인되지 않는다
 * (`packages/tools/test/package-boundary.contract.test.ts`의 관례와 같다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { call, makeTaintGate } from "./web-taint-helpers.ts";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(SRC_DIR, name), "utf8") }));
}

describe("훅 배치 — 게이트는 훅을 하나만 소유한다 (APPROVAL-GATE §4)", () => {
  it("반환에 `afterToolCall`이 없다 — 출력 후처리라는 원래 소비자와 충돌하지 않게", () => {
    const gate = makeTaintGate();
    expect("afterToolCall" in gate).toBe(false);
    expect((gate as unknown as Record<string, unknown>)["afterToolCall"]).toBeUndefined();
  });

  it("오염 추적은 평범한 메서드다 — 호스트가 직접 부른다", () => {
    const gate = makeTaintGate();
    expect(typeof gate.beforeToolCall).toBe("function");
    expect(typeof gate.noteToolResult).toBe("function");
    expect(typeof gate.resetTaint).toBe("function");
  });

  it("훅으로 오인될 이름을 더 내보내지 않는다 — 소비자 1:1을 깨는 순간 합성이 강요된다", () => {
    const gate = makeTaintGate();
    const hookish = Object.keys(gate).filter(
      (key) => key !== "beforeToolCall" && /ToolCall$/.test(key),
    );
    expect(hookish).toEqual([]);
  });

  it("오염 상태의 판정도 코어 계약을 그대로 지킨다 — 계층·오염 사실이 새지 않는다", async () => {
    // 코어가 계층이나 오염을 알기 시작하면 승인 정책이 코어 릴리스에 묶인다
    const gate = makeTaintGate();
    gate.noteToolResult({ source: "network" });
    const decision = await call(gate, "read_file", { path: "src/a.ts" });
    expect(Object.keys(decision)).toEqual(["decision"]);
  });
});

describe("패키지 경계 (APPROVAL-GATE §1·§3)", () => {
  it("게이트 src에 `@neo-agent/web` 임포트가 0건이다 — SSRF 판정기는 하나뿐이다", () => {
    // 판정기가 둘이면 어긋난다(WEB-ACCESS §4). 게이트의 URL 파싱은 학습 키
    // 산출용이고 보안 판정이 아니므로, 웹 패키지를 끌어올 이유가 없다
    for (const file of sourceFiles()) {
      expect(file.text.includes("@neo-agent/web"), `${file.name}이 웹 패키지를 임포트한다`).toBe(
        false,
      );
      expect(/from\s+["'][./]*(?:\.\.\/)+web\//.test(file.text), file.name).toBe(false);
    }
  });

  it("런타임 의존성은 `@neo-agent/core` 정확히 1개다", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(["@neo-agent/core"]);
  });

  it("I/O성 내장 모듈을 임포트하지 않는다 — 판정 모듈은 순수하다", () => {
    const forbidden = /from\s+["']node:(fs|child_process|net|tls|http|https|sqlite)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}이 금지된 내장 모듈을 임포트한다`).toBe(false);
    }
  });
});
