/**
 * `probeDocker` — 조건부 노출의 판정기. 계약 독립 검증 (QA-B, 구현보다 먼저 작성).
 *
 * 기대값의 출처:
 *   - `docs/SANDBOX.md` §3 ("`on`인데 Docker가 없으면 셸 도구를 등록하지 않는다 —
 *     숨긴다, 실패시키지 않는다")
 *   - `docs/SAFE-DEFAULTS.md` §2 약속 2 (감지 기반 자동 전환 `auto` 없음)
 *   - `docs/REUSE-MAP.md` §2.3 (사용 불가 도구는 실패시키지 말고 숨긴다)
 *
 * **왜 판정이 예외가 아니어야 하는가**: 이 함수의 결과는 세션 시작 시 도구 목록을
 * 정하는 데 쓰인다(§3 — 세션 중에는 바뀌지 않는다). 예외로 튀어나오면 호출부가
 * try/catch로 삼키게 되고, 그때 "Docker 없음"과 "우리 코드의 버그"가 같은 모양이
 * 된다. 판정값으로 돌려주면 그 둘이 갈린다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import { probeDocker } from "../src/index.ts";
import { createDockerStub, settlesWithin, throwingDockerRunner } from "./support.ts";

describe("가용 판정 (SANDBOX §3)", () => {
  it("Docker가 있으면 `available: true` + 버전 문자열", async () => {
    const stub = createDockerStub((invocation) => {
      invocation.write("stdout", "29.6.2\n");
      invocation.settle(0);
    });

    const availability = await probeDocker({ docker: stub.runner });

    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version.trim().length).toBeGreaterThan(0);
    }
  });

  it("실행 파일 부재(ENOENT)를 **예외가 아니라 판정으로** 돌려준다", async () => {
    const error = Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" });

    const availability = await probeDocker({ docker: throwingDockerRunner(error) });

    expect(availability.available).toBe(false);
    if (!availability.available) {
      // 사용자에게 두 갈래(설치 / 명시적 opt-out)를 안내하려면 사유가 필요하다.
      // 사유 문면은 계약이 아니다 [미규정 B-6] — 비어 있지 않은지만 본다.
      expect(availability.reason.length).toBeGreaterThan(0);
    }
  });

  it("`command not found`도 불가용 판정이다", async () => {
    const stub = createDockerStub((invocation) => {
      invocation.write("stderr", "docker: command not found\n");
      invocation.settle(127);
    });

    const availability = await probeDocker({ docker: stub.runner });
    expect(availability.available).toBe(false);
  });

  it("권한 없음(소켓 접근 거부)도 불가용 판정이다", async () => {
    // 데몬은 살아 있지만 이 사용자는 붙을 수 없다. "설치돼 있다"만 보고 켜면
    // 셸 도구가 등록된 뒤 매번 실패한다 — 숨기는 편이 낫다(REUSE-MAP §2.3).
    const stub = createDockerStub((invocation) => {
      invocation.write(
        "stderr",
        "permission denied while trying to connect to the Docker daemon socket\n",
      );
      invocation.settle(1);
    });

    const availability = await probeDocker({ docker: stub.runner });
    expect(availability.available).toBe(false);
  });

  it("클라이언트는 응답하는데 **데몬이 죽어 있으면** 불가용이다", async () => {
    // 이 테스트가 "버전 문자열만 보는 판정"과 "데몬 접촉까지 하는 판정"을 가른다.
    // `docker --version`은 데몬 없이도 성공하므로, 그것만 보는 구현은 여기서만 깨진다.
    const stub = createDockerStub((invocation) => {
      invocation.write("stdout", "Client: Docker Engine - Community\n Version: 29.6.2\n");
      invocation.write(
        "stderr",
        "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n",
      );
      invocation.settle(1);
    });

    const availability = await probeDocker({ docker: stub.runner });
    expect(availability.available).toBe(false);
  });

  it("클라이언트 전용 조회(`docker --version`)로 판정하지 않는다", async () => {
    // 위 테스트의 구조적 대응물. 인자 수준에서도 못박아 둔다 — 데몬에 닿는 명령이어야
    // 한다(`version`·`info`·`ping` 계열).
    const stub = createDockerStub((invocation) => {
      invocation.write("stdout", "29.6.2\n");
      invocation.settle(0);
    });

    await probeDocker({ docker: stub.runner });

    expect(stub.invocations.length).toBeGreaterThan(0);
    for (const invocation of stub.invocations) {
      expect(invocation.args).not.toContain("--version");
      expect(invocation.args).not.toContain("-v");
    }
    expect(["version", "info", "ping", "system"]).toContain(stub.invocations[0]?.args[0]);
  });
});

describe("판정에는 상한이 있다 (SANDBOX §3 — 기동이 멈추지 않는다)", () => {
  it("데몬이 매달려도 제한 시간 안에 불가용으로 판정한다", async () => {
    // 데몬이 응답하지 않는 상태는 실재한다(재시작 중, 소켓은 있는데 hang).
    // 상한이 없으면 **에이전트 기동 자체가 영원히 멈춘다** — 도구 하나 때문에
    // 프로그램이 시작하지 않는 것은 조건부 노출의 취지에 정면으로 반한다.
    const stub = createDockerStub(() => {
      // 어떤 호출도 settle하지 않고 kill에도 반응하지 않는다
    });

    const availability = await settlesWithin(
      probeDocker({ timeoutMs: 50, docker: stub.runner }),
      5_000,
      "매달리는 데몬에 대한 probeDocker",
    );

    expect(availability.available).toBe(false);
  });

  it("상한 초과 시 남은 프로세스에 종료를 시도한다 — 판정이 프로세스를 흘리지 않는다", async () => {
    const stub = createDockerStub(() => {});

    await settlesWithin(
      probeDocker({ timeoutMs: 50, docker: stub.runner }),
      5_000,
      "매달리는 데몬에 대한 probeDocker",
    );

    expect(stub.invocations.length).toBeGreaterThan(0);
    for (const invocation of stub.invocations) {
      expect(
        invocation.killSignals.length,
        `타임아웃 후에도 종료를 시도하지 않은 호출: ${invocation.args.join(" ")}`,
      ).toBeGreaterThan(0);
    }
  });
});

// 기본 상한 **수치**(제안 30s)는 계약이 아니라 §8 미결이라 여기서 재지 않는다 —
// 30초를 실제로 기다리는 테스트는 상시 게이트를 느리게 만들 뿐이고, 값의 타당성은
// T-013 실측이 판정한다. 여기서 고정하는 것은 "상한이라는 장치가 있다"까지다.
