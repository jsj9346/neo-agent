/**
 * `ShellExecutor` 3계약이 **컨테이너 경계 너머에서도** 성립하는가 — QA-B 1급 임무.
 *
 * 기대값의 출처:
 *   - `docs/TOOLS-INTERFACE.md` §4 (timeout 강제 · abort 존중 · 출력 유계,
 *     `ShellExecResult` 필드 의미)
 *   - `docs/SANDBOX.md` §4 "컨테이너 고아 방지가 계약이다"
 *
 * **왜 이 파일이 1급인가**: `docker run` 클라이언트 프로세스를 죽여도 컨테이너는
 * 계속 돌 수 있다(SANDBOX §4). 호스트 실행자에서 통과하던 timeout·abort 테스트가
 * 여기서 **조용히 거짓**이 된다 — `exec`는 제때 반환하는데 컨테이너는 살아 있는
 * 상태다. 그래서 이 파일은 "반환했는가"만 보지 않고 **컨테이너 종료 명령이
 * 나갔는가**까지 본다.
 *
 * `--rm`에 기대는 구현은 불합격이다. `--rm`은 컨테이너가 **정상 종료했을 때**의
 * 제거 경로이지, 죽지 않는 컨테이너를 죽이는 수단이 아니다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDockerShellExecutor } from "../src/index.ts";
import {
  containerIdentifiers,
  createDockerStub,
  type DockerStub,
  type StubInvocation,
  settlesWithin,
} from "./support.ts";

const PINNED_IMAGE = "debian:bookworm-slim";
/** 정리 명령으로 인정하는 동사 — 어느 것을 쓸지는 구현 재량이다 [미규정 B-3] */
const TERMINATION_VERBS = new Set(["stop", "kill", "rm"]);

let workspaceRoot: string;
let scratch: string;

beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "neo-qa-sandbox-life-")));
  workspaceRoot = join(scratch, "ws");
  mkdirSync(workspaceRoot, { recursive: true });
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function executorWith(stub: DockerStub, tuning: { maxOutputBytes?: number } = {}) {
  return createDockerShellExecutor({
    image: PINNED_IMAGE,
    workspaceRoot,
    uid: 1234,
    gid: 5678,
    docker: stub.runner,
    ...(tuning.maxOutputBytes !== undefined && { maxOutputBytes: tuning.maxOutputBytes }),
  });
}

/** 끝나지 않는 컨테이너. `kill()`은 **클라이언트만** 죽인다 — 실제 Docker의 성질이다 */
function neverEndingContainer(invocation: StubInvocation): void {
  if (invocation.args[0] === "run") {
    invocation.onKill = () => {
      // 클라이언트 프로세스는 죽는다. 컨테이너는? 스텁은 모른다 —
      // 그것을 보장하는 것이 실행자의 몫이고, 이 테스트가 보는 것이다.
      invocation.settle(null);
    };
    return;
  }
  // 정리 명령(stop/kill/rm)은 즉시 성공한다
  invocation.settle(0);
}

/** 정리 명령을 찾는다 — 없으면 undefined */
function terminationOf(stub: DockerStub, runArgs: readonly string[]): StubInvocation | undefined {
  const identifiers = containerIdentifiers(runArgs);
  return stub.others().find((invocation) => {
    const verb = invocation.args[0] ?? "";
    if (!TERMINATION_VERBS.has(verb)) return false;
    const joined = invocation.args.join(" ");
    return identifiers.some((identifier) => joined.includes(identifier));
  });
}

describe("결과 매핑 (TOOLS-INTERFACE §4 `ShellExecResult`)", () => {
  it("`exitCode`는 **컨테이너 프로세스의** 종료 코드다 — `exit 7`이 7로 온다", async () => {
    // docker CLI 자신의 코드(125 등)를 그대로 흘리면 모델이 명령 실패의 원인을
    // 오해한다. 이 매핑이 어긋나면 `&&`/`||`로 엮인 셸 사용이 조용히 틀어진다.
    const stub = createDockerStub((invocation) => {
      invocation.write("stdout", "before-exit\n");
      invocation.settle(7);
    });
    const result = await executorWith(stub).exec(
      { command: "exit 7", cwd: workspaceRoot, timeoutMs: 5_000 },
      new AbortController().signal,
    );

    expect(result.exitCode).toBe(7);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain("before-exit");
  });

  it("시그널 종료는 `exitCode: null`이다", async () => {
    const stub = createDockerStub((invocation) => invocation.settle(null));
    const result = await executorWith(stub).exec(
      { command: "kill -9 $$", cwd: workspaceRoot, timeoutMs: 5_000 },
      new AbortController().signal,
    );
    expect(result.exitCode).toBeNull();
  });

  it("stderr가 결과에 실린다 — 실패 원인이 사라지면 디버깅이 불가능하다", async () => {
    const stub = createDockerStub((invocation) => {
      invocation.write("stderr", "sh: 1: nope: not found\n");
      invocation.settle(127);
    });
    const result = await executorWith(stub).exec(
      { command: "nope", cwd: workspaceRoot, timeoutMs: 5_000 },
      new AbortController().signal,
    );
    expect(result.stderr).toContain("not found");
    expect(result.exitCode).toBe(127);
  });

  /**
   * [미규정 B-4] docker CLI **자신의** 실패(이미지 없음 → 125 등)를 컨테이너 종료
   * 코드와 어떻게 구분하는가. 정본은 말하지 않는다.
   * 중립으로 쓴다 — **에러로 승격하든 결과로 돌려주든, 성공(exitCode 0)으로는
   * 보이지 않아야 한다**. 조용한 성공이 유일하게 금지된 결과다.
   */
  it("docker CLI 자신의 실패가 성공으로 보이지 않는다 [미규정 B-4]", async () => {
    const stub = createDockerStub((invocation) => {
      invocation.write("stderr", "docker: Error response from daemon: No such image\n");
      invocation.settle(125);
    });

    let result: Awaited<ReturnType<ReturnType<typeof executorWith>["exec"]>> | undefined;
    try {
      result = await executorWith(stub).exec(
        { command: "echo hi", cwd: workspaceRoot, timeoutMs: 5_000 },
        new AbortController().signal,
      );
    } catch {
      return; // 에러 승격도 합격 경로다
    }
    expect(result?.exitCode).not.toBe(0);
  });

  it("명령 문자열이 컨테이너까지 전달된다 — 인자든 stdin이든 [미규정 B-5]", async () => {
    // 전달 수단(`sh -c <cmd>` vs stdin 파이프)은 구현 재량이다. 계약은 "도달한다"뿐.
    const stub = createDockerStub();
    await executorWith(stub).exec(
      { command: "echo neo-qa-marker", cwd: workspaceRoot, timeoutMs: 5_000 },
      new AbortController().signal,
    );
    const run = stub.lastRun();
    const carried = `${run.args.join(" ")} ${run.stdin ?? ""}`;
    expect(carried).toContain("neo-qa-marker");
  });
});

describe("출력 유계 (TOOLS-INTERFACE §4)", () => {
  it("stdout·stderr가 상한을 넘지 않고 `truncated`가 표시된다", async () => {
    // 상한 수치는 계약이 아니므로 주입해 검증한다. 계약은 "유계 + 잘림이 보인다"이다.
    const maxOutputBytes = 1024;
    const chunk = "x".repeat(1000);
    const stub = createDockerStub((invocation) => {
      for (let index = 0; index < 200; index += 1) {
        invocation.write("stdout", chunk);
        invocation.write("stderr", chunk);
      }
      invocation.settle(0);
    });

    const result = await executorWith(stub, { maxOutputBytes }).exec(
      { command: "yes", cwd: workspaceRoot, timeoutMs: 5_000 },
      new AbortController().signal,
    );

    // 잘림 표시 문구가 붙을 여지를 두되(1KB), 200KB가 그대로 실리는 것은 막는다
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(maxOutputBytes + 1024);
    expect(Buffer.byteLength(result.stderr, "utf8")).toBeLessThanOrEqual(maxOutputBytes + 1024);
    expect(result.truncated).toBe(true);
  });

  it("상한 안이면 `truncated`가 false다 — 항상 true면 표시가 정보가 아니다", async () => {
    const stub = createDockerStub((invocation) => {
      invocation.write("stdout", "short\n");
      invocation.settle(0);
    });
    const result = await executorWith(stub, { maxOutputBytes: 1024 }).exec(
      { command: "echo short", cwd: workspaceRoot, timeoutMs: 5_000 },
      new AbortController().signal,
    );
    expect(result.truncated).toBe(false);
    expect(result.stdout).toContain("short");
  });
});

describe("timeout 강제 — 컨테이너 너머 (TOOLS-INTERFACE §4 · SANDBOX §4)", () => {
  it("초과 시 `timedOut: true`로 반환한다 — 결과 없는 무한 대기는 silent failure", async () => {
    const stub = createDockerStub(neverEndingContainer);
    const result = await settlesWithin(
      executorWith(stub).exec(
        { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 50 },
        new AbortController().signal,
      ),
      5_000,
      "timeout 초과 후 exec",
    );

    expect(result.timedOut).toBe(true);
  });

  it("timeout 후 **컨테이너 종료 명령**이 나간다 — 클라이언트만 죽이면 고아가 남는다", async () => {
    // 이 프로젝트에서 가장 조용히 거짓이 되기 쉬운 지점이다(SANDBOX §4).
    // `--rm`은 정상 종료 경로일 뿐이라 여기서는 아무것도 보장하지 않는다.
    const stub = createDockerStub(neverEndingContainer);
    await settlesWithin(
      executorWith(stub).exec(
        { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 50 },
        new AbortController().signal,
      ),
      5_000,
      "timeout 초과 후 exec",
    );

    const termination = terminationOf(stub, stub.lastRun().args);
    expect(
      termination,
      `컨테이너 종료 명령이 없다. 발생한 호출: ${JSON.stringify(
        stub.invocations.map((invocation) => invocation.args),
      )}`,
    ).toBeDefined();
  });

  it("정리 명령은 **그 컨테이너만** 지목한다 — 광범위 정리는 사용자 컨테이너를 죽인다", async () => {
    // 정리 시점·횟수는 구현 재량이지만(정상 경로는 `--rm`이 덮는다) **범위는 계약이다**.
    // `docker stop $(docker ps -q)` 류의 쓸어담기가 들어오면 에이전트가 사용자의
    // 무관한 컨테이너를 죽인다 — 문서가 금지한 "가시적이지 않은 부수효과"다.
    const stub = createDockerStub(neverEndingContainer);
    await settlesWithin(
      executorWith(stub).exec(
        { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 50 },
        new AbortController().signal,
      ),
      5_000,
      "timeout 초과 후 exec",
    );

    const identifiers = containerIdentifiers(stub.lastRun().args);
    for (const invocation of stub.others()) {
      if (!TERMINATION_VERBS.has(invocation.args[0] ?? "")) continue;
      const joined = invocation.args.join(" ");
      expect(joined).not.toContain("$(");
      expect(invocation.args.includes("--all") || invocation.args.includes("-a")).toBe(false);
      expect(
        identifiers.some((identifier) => joined.includes(identifier)),
        `정리 명령이 특정 컨테이너를 지목하지 않았다: ${joined}`,
      ).toBe(true);
    }
  });
});

describe("abort 존중 — 컨테이너 너머 (TOOLS-INTERFACE §4)", () => {
  it("중단 요청 후 즉시 반환한다", async () => {
    const stub = createDockerStub(neverEndingContainer);
    const controller = new AbortController();
    const pending = executorWith(stub).exec(
      { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 600_000 },
      controller.signal,
    );

    setTimeout(() => controller.abort(), 20);

    // timeoutMs는 10분이다 — 반환했다면 abort 때문이지 timeout 때문이 아니다
    const result = await settlesWithin(pending, 5_000, "abort 후 exec");
    // 중단은 시간 초과가 아니다. `timedOut: true`로 보고하면 사용자·모델이 원인을
    // 오해한다.
    // [미규정 B-2] 중단·시간 초과 시 `ShellExecResult`의 **나머지 필드**(`exitCode`가
    // null인지, 그때까지의 부분 출력을 살리는지)는 정본이 정하지 않았다. 여기서
    // 못박지 않는다 — `timedOut`의 참·거짓만 본다.
    expect(result.timedOut).toBe(false);
  });

  it("abort 후에도 **컨테이너 종료 명령**이 나간다", async () => {
    const stub = createDockerStub(neverEndingContainer);
    const controller = new AbortController();
    const pending = executorWith(stub).exec(
      { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 600_000 },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 20);
    await settlesWithin(pending, 5_000, "abort 후 exec");

    expect(terminationOf(stub, stub.lastRun().args)).toBeDefined();
  });

  it("이미 abort된 signal이면 컨테이너를 아예 만들지 않는다", async () => {
    // 중단된 런이 컨테이너를 하나 띄우고 지우는 것은 낭비이자 고아의 씨앗이다.
    const stub = createDockerStub(neverEndingContainer);
    const controller = new AbortController();
    controller.abort();

    const result = await settlesWithin(
      executorWith(stub).exec(
        { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 600_000 },
        controller.signal,
      ),
      5_000,
      "선(先)중단 exec",
    );

    expect(result.timedOut).toBe(false);
    expect(stub.runs()).toHaveLength(0);
  });
});

describe("정리에도 상한이 있다 (TOOLS-INTERFACE §4 — 매달리지 않는다)", () => {
  it("클라이언트가 죽지 않고 정리 명령도 응답하지 않아도 `exec`는 반환한다", async () => {
    // 최악의 경우다: `docker run`이 시그널을 무시하고, `docker stop`도 매달린다.
    // 정리에 상한이 없으면 여기서 `exec`가 영원히 pending이 되고, 그것은 timeout
    // 계약을 우회하는 두 번째 무한 대기다 — 도구가 아니라 실행자가 매다는 형태라
    // 상위 계층의 어떤 타임아웃도 이것을 잡지 못한다.
    const stub = createDockerStub(() => {
      // 어떤 호출도 settle하지 않고, kill에도 반응하지 않는다
    });

    const result = await settlesWithin(
      executorWith(stub).exec(
        { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 50 },
        new AbortController().signal,
      ),
      15_000,
      "정리가 매달릴 때의 exec",
    );

    expect(result.timedOut).toBe(true);
  }, 20_000);
});
