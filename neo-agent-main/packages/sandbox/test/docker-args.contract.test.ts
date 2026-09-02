/**
 * 컨테이너 하드닝 인자 — 계약 독립 검증 (QA-B, 구현보다 먼저 작성).
 *
 * 기대값의 출처:
 *   - `docs/SANDBOX.md` §4 하드닝 표(network none·read-only·cap-drop ALL·
 *     no-new-privileges·호스트 uid:gid·pids/메모리 유계·/tmp tmpfs)
 *   - `docs/SANDBOX.md` §4 "워크스페이스는 호스트와 같은 절대 경로로 마운트한다"
 *   - `docs/SANDBOX.md` §4 "env는 화이트리스트다", "이미지 — 고정 태그, latest 금지"
 *   - `docs/SANDBOX.md` §4 "컨테이너 수명 — 명령 1회당 1개"(`--rm`)
 *   - `docs/SAFE-DEFAULTS.md` §2 약속 3, §3 계약 3
 *
 * **왜 인자를 보는가**: 하드닝이 빠져도 명령은 성공한다. `--network none`이 없는
 * 실행자로 `echo hi`를 돌리면 결과는 똑같이 정상이다. 결과만 보는 테스트는 하드닝
 * 누락을 영원히 못 잡으므로, 이 파일만은 `docker` 호출 인자를 직접 읽는다.
 *
 * 수치(메모리 1g·pids 256 등)는 `SANDBOX.md` §8이 미결로 남긴 `[추정]`이다.
 * **계약은 "유계"이지 수치가 아니므로** 테스트는 값을 주입하고 그 값이 인자에
 * 도달하는지만 본다 — 수치를 여기서 못박으면 실측(T-013)이 문서가 아니라 테스트에
 * 막힌다.
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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDockerShellExecutor } from "../src/index.ts";
import {
  containerIdentifiers,
  createDockerStub,
  type DockerStub,
  envNames,
  flagValues,
  hasFlag,
  labels,
  mounts,
} from "./support.ts";

/** 고정 태그. `latest`가 아닌 것 자체가 계약이다(SANDBOX §4) */
const PINNED_IMAGE = "debian:bookworm-slim";
const UID = 1234;
const GID = 5678;

let workspaceRoot: string;
let scratch: string;

beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "neo-qa-sandbox-args-")));
  workspaceRoot = join(scratch, "ws");
  mkdirSync(join(workspaceRoot, "sub", "dir"), { recursive: true });
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface RunFixture {
  stub: DockerStub;
  args: readonly string[];
  stdin: string | undefined;
}

/** 수치는 계약이 아니므로(§8) 필요할 때만 주입한다 */
interface Tuning {
  memoryLimit?: string;
  pidsLimit?: number;
  maxOutputBytes?: number;
}

async function runOnce(
  tuning: Tuning = {},
  request: { command?: string; cwd?: string; timeoutMs?: number } = {},
): Promise<RunFixture> {
  const stub = createDockerStub();
  const executor = createDockerShellExecutor({
    image: PINNED_IMAGE,
    workspaceRoot,
    uid: UID,
    gid: GID,
    docker: stub.runner,
    ...(tuning.memoryLimit !== undefined && { memoryLimit: tuning.memoryLimit }),
    ...(tuning.pidsLimit !== undefined && { pidsLimit: tuning.pidsLimit }),
    ...(tuning.maxOutputBytes !== undefined && { maxOutputBytes: tuning.maxOutputBytes }),
  });

  await executor.exec(
    {
      command: request.command ?? "echo hi",
      cwd: request.cwd ?? workspaceRoot,
      timeoutMs: request.timeoutMs ?? 5_000,
    },
    new AbortController().signal,
  );

  const run = stub.lastRun();
  return { stub, args: run.args, stdin: run.stdin };
}

describe("하드닝 인자 (SANDBOX §4 표)", () => {
  it("`docker run`으로 컨테이너를 만든다 — 명령 1회당 1개", async () => {
    const { stub, args } = await runOnce();
    expect(args[0]).toBe("run");
    // 명령 하나에 컨테이너 하나. 영속 셸 세션이 없다는 계약의 인자 수준 귀결이다
    expect(stub.runs()).toHaveLength(1);
  });

  it("`--network none` — 셸에서 네트워크에 닿을 수 없다", async () => {
    // §5의 귀결(npm install·curl 불가)이 실제로 성립하는 유일한 근거가 이 인자다.
    // 빠지면 `source: "local"` 고정(TOOLS-INTERFACE §2)까지 조용히 거짓이 된다.
    const { args } = await runOnce();
    expect(flagValues(args, "--network", "--net")).toContain("none");
  });

  it("`--read-only` — 루트 파일시스템은 읽기 전용", async () => {
    const { args } = await runOnce();
    expect(hasFlag(args, "--read-only")).toBe(true);
  });

  it("`--cap-drop ALL` — 리눅스 capability를 전부 버린다", async () => {
    const { args } = await runOnce();
    const dropped = flagValues(args, "--cap-drop").map((value) => value.toUpperCase());
    expect(dropped).toContain("ALL");
    // 버린 뒤 일부를 되돌리면 계약이 무의미해진다
    expect(flagValues(args, "--cap-add")).toEqual([]);
  });

  it("`--security-opt no-new-privileges` — setuid 경유 권한상승 차단", async () => {
    const { args } = await runOnce();
    const options = flagValues(args, "--security-opt");
    // 표기는 `no-new-privileges` / `no-new-privileges:true` 둘 다 통용된다
    expect(options.some((option) => option.startsWith("no-new-privileges"))).toBe(true);
    // 하드닝을 되돌리는 값이 섞이면 안 된다 — OpenClaw 검증기가 거부하는 조합이다
    expect(options.some((option) => option.includes("unconfined"))).toBe(false);
  });

  it("`--user <uid>:<gid>` — 컨테이너가 만든 파일이 root 소유가 되지 않는다", async () => {
    // 사용성이자 안전(§4). root 소유 파일은 호스트에서 사용자가 고칠 수 없다.
    const { args } = await runOnce();
    expect(flagValues(args, "--user", "-u")).toContain(`${UID}:${GID}`);
  });

  it("메모리 상한과 `--pids-limit`이 유계다 — 주입한 값이 그대로 인자에 실린다", async () => {
    // 수치는 §8 미결이므로 값을 주입해 검증한다. 계약은 "상한이 존재한다"이다.
    const { args } = await runOnce({ memoryLimit: "512m", pidsLimit: 64 });
    expect(flagValues(args, "--memory", "-m")).toContain("512m");
    expect(flagValues(args, "--pids-limit")).toContain("64");
  });

  it("옵션을 주지 않아도 메모리·pids 상한이 붙는다 — 기본값이 무제한이면 안 된다", async () => {
    // 포크 폭탄·메모리 고갈이 호스트를 끌고 내려가지 않게 하는 것이 목적이므로,
    // "사용자가 설정했을 때만 유계"는 계약 미달이다.
    const { args } = await runOnce();
    expect(flagValues(args, "--memory", "-m").length).toBeGreaterThan(0);
    expect(flagValues(args, "--pids-limit").length).toBeGreaterThan(0);
  });

  it("`/tmp`가 tmpfs다 — 읽기 전용 루트의 보완이자 컨테이너와 함께 사라진다", async () => {
    const { args } = await runOnce();
    const tmpfsFlags = flagValues(args, "--tmpfs");
    const tmpfsMounts = flagValues(args, "--mount").filter((value) => value.includes("type=tmpfs"));
    const coversTmp =
      tmpfsFlags.some((value) => value === "/tmp" || value.startsWith("/tmp:")) ||
      tmpfsMounts.some((value) => value.includes("/tmp"));
    expect(coversTmp, `tmpfs로 /tmp를 덮지 않았다: ${args.join(" ")}`).toBe(true);
  });

  it("`--rm` — 컨테이너가 정상 종료 경로에서 제거된다", async () => {
    // `--rm`은 **정상 종료** 경로만 덮는다. timeout·abort의 고아 방지는 별도 계약이며
    // `executor-lifecycle.contract.test.ts`가 따로 고정한다.
    const { args } = await runOnce();
    expect(hasFlag(args, "--rm")).toBe(true);
  });

  it("`--privileged`·`--cap-add`·docker 소켓 마운트 같은 탈출 경로가 없다", async () => {
    // 설정으로 마운트를 추가할 수 없게 해서 검증기 자체를 없앴다는 것이 §7의 판정이다.
    // 그 전제(고정 마운트 하나뿐)가 인자 수준에서 참인지 여기서 고정한다.
    const { args } = await runOnce();
    const joined = args.join(" ");
    expect(hasFlag(args, "--privileged")).toBe(false);
    expect(hasFlag(args, "--pid")).toBe(false);
    expect(hasFlag(args, "--ipc")).toBe(false);
    expect(joined).not.toContain("docker.sock");
    expect(joined).not.toContain("/var/run/docker");
  });

  it("실행 식별 라벨이 붙는다 — 나중에 컨테이너를 지목할 수단", async () => {
    // 라벨이 없으면 `docker ps --filter label=…`로 고아를 조회할 수 없고,
    // 고아 방지 계약(§4)이 실측 불가가 된다.
    const first = await runOnce();
    const second = await runOnce();

    const firstLabels = labels(first.args);
    const secondLabels = labels(second.args);
    expect(firstLabels.length).toBeGreaterThan(0);

    // 키는 안정적이어야 조회 필터를 쓸 수 있고, 값은 실행마다 달라야 지목이 된다
    expect(secondLabels.map((label) => label.key)).toEqual(firstLabels.map((label) => label.key));
    const firstIds = containerIdentifiers(first.args);
    const secondIds = containerIdentifiers(second.args);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });
});

describe("워크스페이스 마운트 — 경로 번역 흔적 0 (SANDBOX §4)", () => {
  it("호스트와 **같은 절대 경로**로 마운트한다", async () => {
    // 번역 테이블이 생기면 그것이 두 번째 판정기가 되고, 판정기가 둘이면 어긋난다.
    const { args } = await runOnce();
    const specs = mounts(args);
    const workspaceMount = specs.find((spec) => spec.source === workspaceRoot);
    expect(workspaceMount, `워크스페이스 마운트가 없다: ${args.join(" ")}`).toBeDefined();
    expect(workspaceMount?.target).toBe(workspaceRoot);
  });

  it("마운트는 워크스페이스 하나뿐이다 — 추가 마운트 설정이 없다는 §7 전제", async () => {
    // 소비자 — MEMORY.md §2.1 「한계」 표 1행(`sandbox: "on"` + Docker 가용)도 이 단언에
    // 기댄다: 마운트가 워크스페이스 루트 하나뿐이라 `~/.neo-agent/`가 컨테이너 안에
    // 존재하지 않고, 그래서 셸이 그 상태에서는 메모리 파일에 원리적으로 도달할 수 없다.
    // 이 단언이 깨지면(마운트가 는다) MEMORY.md §2.1 표 1행도 다시 열어야 한다(`K-428`).
    const { args } = await runOnce();
    const bindSources = mounts(args).map((spec) => spec.source);
    // tmpfs는 source가 없으므로 여기 잡히지 않는다
    expect(bindSources).toEqual([workspaceRoot]);
  });

  it("`cwd`는 도구가 넘긴 호스트 절대 경로 그대로다", async () => {
    const cwd = join(workspaceRoot, "sub", "dir");
    const { args } = await runOnce({}, { cwd });
    expect(flagValues(args, "-w", "--workdir")).toContain(cwd);
  });

  it("컨테이너 전용 경로(`/workspace` 류)가 인자 어디에도 없다", async () => {
    // 번역 흔적을 직접 찾는다. 하나라도 생기면 셸 출력의 경로를 사용자가 호스트에서
    // 그대로 열 수 없게 되고, 그것이 번역 계층 도입의 첫 징후다.
    const { args, stdin } = await runOnce({}, { cwd: join(workspaceRoot, "sub") });
    const joined = `${args.join(" ")} ${stdin ?? ""}`;
    for (const marker of ["/workspace", "/sandbox", "/app", "/neo-agent"]) {
      expect(joined.includes(marker), `경로 번역 흔적: ${marker}`).toBe(false);
    }
  });
});

describe("env는 화이트리스트다 (SANDBOX §4 · SAFE-DEFAULTS §3 계약 3)", () => {
  /**
   * 최소 집합의 **상한**. 문서는 "`PATH`·`HOME`·`LANG` 류"라고만 말하므로 정확한
   * 목록은 구현 재량이지만, 이 상한을 넘는 순간 "화이트리스트"라는 성질 자체가
   * 흐려진다. 여기 없는 이름을 넣고 싶으면 `SANDBOX.md`를 먼저 고쳐야 한다.
   *
   * [미규정 B-7] 정확한 이름 집합과 **`HOME`의 값**이 미확정이다. 읽기 전용 루트에서
   * 홈이 쓰기 불가면 많은 도구가 조용히 실패하므로 tmpfs `/tmp` 안을 가리키게 하는
   * 안이 플랜에 있다(`ES` 계열 미규정 마커와 같은 사안). 이 테스트는 **이름**만 보고 값은
   * 보지 않는다 — 어느 판정으로 가든 통과한다.
   */
  const ALLOWED = new Set([
    "PATH",
    "HOME",
    "LANG",
    "LANGUAGE",
    "LC_ALL",
    "TERM",
    "TZ",
    "USER",
    "LOGNAME",
    "SHELL",
    "PWD",
  ]);

  it("호스트의 시크릿이 컨테이너 인자·stdin 어디에도 나타나지 않는다", async () => {
    vi.stubEnv("SECRET_X", "sk-neo-qa-secret-value");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-neo-qa-value");
    try {
      const { args, stdin } = await runOnce();
      const joined = `${args.join(" ")} ${stdin ?? ""}`;
      expect(joined).not.toContain("sk-neo-qa-secret-value");
      expect(joined).not.toContain("sk-ant-neo-qa-value");
      expect(joined).not.toContain("SECRET_X");
      expect(joined).not.toContain("ANTHROPIC_API_KEY");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("**이름 패턴에 안 걸리는** 호스트 변수도 새지 않는다 — denylist가 아니라 화이트리스트", async () => {
    // 이 테스트가 denylist 구현과 화이트리스트 구현을 가른다. `MY_NOTES` 같은 이름은
    // 어떤 시크릿 패턴에도 걸리지 않으므로 denylist를 옮겨 온 구현은 여기서만 깨진다.
    vi.stubEnv("MY_NOTES", "neo-qa-harmless-value");
    vi.stubEnv("PROJECT_ROOT", "/home/someone/private");
    try {
      const { args, stdin } = await runOnce();
      const joined = `${args.join(" ")} ${stdin ?? ""}`;
      expect(joined).not.toContain("MY_NOTES");
      expect(joined).not.toContain("neo-qa-harmless-value");
      expect(joined).not.toContain("PROJECT_ROOT");
      expect(envNames(args).every((name) => ALLOWED.has(name))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("전달하는 env 이름이 최소 집합 안에 있다", async () => {
    const { args } = await runOnce();
    for (const name of envNames(args)) {
      expect(ALLOWED.has(name), `화이트리스트 밖 변수: ${name}`).toBe(true);
    }
  });

  it("`--env-file`을 쓰지 않는다 — 파일 경유는 화이트리스트를 우회한다", async () => {
    // 파일로 넘기면 무엇이 들어갔는지 인자에 안 보이고, 이 패키지는 `node:fs`가
    // 금지라 파일을 만들 수도 없다(SANDBOX §2).
    const { args } = await runOnce();
    expect(hasFlag(args, "--env-file")).toBe(false);
  });
});

describe("이미지 — 고정 태그, `latest` 금지 (SANDBOX §4)", () => {
  it("주입한 고정 태그가 그대로 실행 인자에 실린다", async () => {
    const { args } = await runOnce();
    expect(args).toContain(PINNED_IMAGE);
  });

  /**
   * `latest` 거부의 **강제 지점은 CLI의 설정 검증 하나**다 — 실행자는 겸하지 않는다
   * (`SANDBOX.md` §4 이미지 절, 2026-08-09 판정).
   *
   * 이 테스트를 처음 쓸 때는 정본이 강제 지점을 정하지 않아 `B-1` 미규정 마커로 올렸고
   * "어느 층이 막든 `latest`가 인자에 도달하지 않으면 통과"로 중립하게 썼다. 판정이
   * 그 뒤에 나왔으므로 **실행자의 확정된 동작을 단언하는 형태로 바꾼다.**
   *
   * 여기서 검증하는 것은 "실행자가 이미지를 **손대지 않는다**"이다. 실행자가 조용히
   * 고정 태그로 갈아치우면 사용자의 설정 오류가 숨겨지고(§2.6 가시적 결과 위반),
   * 거부하면 도구 실행 시점에야 터져 시작 시 에러보다 나쁜 UX가 된다.
   * `latest` 자체의 거부는 T-014(QA-C) 통합 시나리오가 `sandboxImage` → 시작 에러로
   * 커버한다.
   *
   * **트리거**: 두 번째 호스트(웹 UI 등)가 실행자를 직접 조립하게 되면 검증이 함께
   * 옮겨가거나 실행자로 내려와야 한다 — 그때 이 테스트도 함께 뒤집힌다.
   */
  for (const image of ["debian:latest", "debian"]) {
    it(`\`${image}\`를 줘도 실행자는 그대로 싣는다 — 거부는 CLI 설정 검증의 몫`, async () => {
      const stub = createDockerStub();
      const executor = createDockerShellExecutor({
        image,
        workspaceRoot,
        uid: UID,
        gid: GID,
        docker: stub.runner,
      });

      // 실행자는 이미지 값을 판정하지 않는다 — 던지지 않는다
      await executor.exec(
        { command: "echo hi", cwd: workspaceRoot, timeoutMs: 5_000 },
        new AbortController().signal,
      );

      const args = stub.lastRun().args;
      // 받은 그대로. 다시 쓰지도(silent rewrite) 거부하지도 않는다
      expect(args).toContain(image);
      expect(args.filter((arg) => arg.startsWith("debian"))).toEqual([image]);
    });
  }
});
