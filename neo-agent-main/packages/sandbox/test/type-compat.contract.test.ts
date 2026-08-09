/**
 * `ShellExecutor` 시그니처 **무변경**을 타입 수준으로 고정 — QA-B.
 *
 * 기대값의 출처:
 *   - `docs/TOOLS-INTERFACE.md` §4 (`ShellExecRequest`·`ShellExecResult`·`ShellExecutor`)
 *   - `docs/SANDBOX.md` §2 ("`ShellExecutor` 인터페이스를 한 글자도 바꾸지 않는다",
 *     구조적 타입 호환)
 *
 * **이 파일의 실질은 컴파일이다.** vitest는 타입을 지우고 실행하므로 아래 대입이
 * 깨졌는지는 `tsc --noEmit`(패키지 `typecheck` 스크립트)이 판정한다. 런타임
 * 어서션은 "형태가 아예 없는 경우"를 잡는 보조 장치다.
 *
 * `@neo-agent/tools`는 이 패키지의 **devDependency**다 — 테스트에서만 임포트하므로
 * 의존성 예산(§2)에 걸리지 않는다. `src`에서 임포트하면 위반이며 그것은
 * `boundary.contract.test.ts`가 따로 본다.
 */

import type { ShellExecRequest, ShellExecResult, ShellExecutor } from "@neo-agent/tools";
import { describe, expect, it } from "vitest";
import { createDockerShellExecutor } from "../src/index.ts";
import { createDockerStub } from "./support.ts";

/**
 * 정본(TOOLS-INTERFACE §4)이 적어 둔 모양 그대로의 고정물.
 * `packages/tools` 쪽 인터페이스에 필드나 메서드가 **추가되면** 이 대입이 깨진다 —
 * 즉 "한 글자도 바꾸지 않는다"는 약속의 감시자다.
 */
const DOC_SHAPE: ShellExecutor = {
  async exec(request: ShellExecRequest, signal: AbortSignal): Promise<ShellExecResult> {
    void request.command;
    void request.cwd;
    void request.timeoutMs;
    void signal.aborted;
    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      truncated: false,
      timedOut: false,
    };
  },
};

describe("구조적 타입 호환 (SANDBOX §2 · TOOLS-INTERFACE §4)", () => {
  it("`createDockerShellExecutor`의 반환이 `ShellExecutor`에 그대로 대입된다", () => {
    const stub = createDockerStub();

    // 임포트 없이 계약을 만족한다 — 이 대입이 컴파일되면 CLI 배선 한 곳에서
    // `HostShellExecutor`와 자리를 바꿀 수 있다는 뜻이다.
    const executor: ShellExecutor = createDockerShellExecutor({
      image: "debian:bookworm-slim",
      workspaceRoot: "/tmp/neo-qa-type-compat",
      docker: stub.runner,
    });

    expect(typeof executor.exec).toBe("function");
    // `exec(request, signal)` 2인자 — 도구가 signal을 넘길 자리가 사라지면
    // abort 존중 계약이 조용히 무력화된다
    expect(executor.exec.length).toBe(2);
  });

  it("정본이 적어 둔 모양만으로 `ShellExecutor`를 만족시킬 수 있다", () => {
    expect(typeof DOC_SHAPE.exec).toBe("function");
  });

  it("`image`와 `workspaceRoot`만으로 생성된다 — 필수 옵션이 늘지 않았다", () => {
    // 필수 옵션이 늘면 CLI 배선이 샌드박스 내부 사정을 알아야 하고, "실행자 교체"가
    // "호출부 개조"가 된다(SANDBOX §2 🧬 회수의 전제).
    const stub = createDockerStub();
    const executor = createDockerShellExecutor({
      image: "debian:bookworm-slim",
      workspaceRoot: "/tmp/neo-qa-type-compat",
      docker: stub.runner,
    });
    expect(executor).toBeDefined();
  });
});
