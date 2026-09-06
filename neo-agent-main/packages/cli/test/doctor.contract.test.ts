/**
 * `neo-agent doctor` 계약 테스트 — **독립 QA(T-009)**.
 *
 * 기대값의 출처는 `neo-agent-main/docs/CLI-INTERFACE.md` §5.1 하나이고, 함께 걸리는
 * 것은 같은 문서 §1(경계 · `CliDeps` · `WiringFactories`)·§2.2(TTY 면제)·§7(표시 문구의
 * 지위) · `docs/SANDBOX.md` §3 · `docs/MEMORY.md` §2.2다. **구현 코드에서 기대값을 읽지
 * 않았다** — 축 여섯의 목록과 각 축의 `problem` 조건은 §5.1 계약 2의 표가, 판정 세 값과
 * `skipped` 사례 넷은 계약 3이, 종료 코드 셋은 계약 7의 표가 정본이다.
 *
 * **`describe` 이름이 계약 번호를 그대로 든다.** 실패한 이름 하나가 어느 계약이 깨졌는지를
 * 바로 가리켜야 리포트의 매핑 표와 화면이 어긋나지 않는다.
 *
 * **`probeDocker`와 이미지 프로브를 전 시나리오에서 주입한다**(`SANDBOX.md` §3). 주입을
 * 잊으면 이 스위트가 이 머신의 docker 설치·데몬 상태·이미지 캐시에 좌우되고, 그 실패는
 * 통과로 나타나므로 사람 눈에 안 보인다(`ARCHITECTURE.md` §2.6 — 침묵 실패). 이 파일은
 * 다른 작성자의 하네스에 기대지 않고 자체 스텁을 `factories`에 넣는다 — 계약은 「주입했는가」
 * 이지 「어느 헬퍼를 들였는가」가 아니고(`SANDBOX.md` §3), 독립 검증이 목적인 파일이
 * 수행자 쪽 하네스를 물려받으면 그 하네스의 가정까지 함께 물려받는다.
 *
 * **표시 문구를 리터럴로 고정하지 않는다**(§7 — 2026-08-17 확정 · `K-010`/`K-148`).
 * 문면을 보는 단언은 전부 ① 테스트가 주입한 데이터가 그대로 통과했는가(대비쌍의 프로브)
 * 또는 ② 구별과 비침묵(서로 다른 상태가 서로 다른, 비어 있지 않은 출력을 낳는가)이다.
 * 축 라벨을 볼 때도 상수를 손으로 적지 않고 `DOCTOR_AXES[axis].label`에서 읽는다.
 *
 * **명시 상한을 새로 걸지 않았다**(`ARCHITECTURE.md` §2.21). 이 파일에는 타임아웃·재시도
 * 상한이 없고, 프로브는 전부 즉시 값을 돌려주는 스텁이라 대기가 존재하지 않는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { PassThrough, Writable } from "node:stream";
import type { DockerAvailability, SandboxImageAvailability } from "@neo-agent/sandbox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliArgs, parseArgs } from "../src/args.ts";
import { defaultConfigPath } from "../src/config.ts";
import { defaultCredentialsPath } from "../src/credentials.ts";
import {
  DOCTOR_AXES,
  type DoctorAxis,
  type DoctorReport,
  type DoctorVerdict,
  renderDoctorReport,
  runDoctor,
} from "../src/doctor.ts";
import { defaultMemoryDir } from "../src/memory.ts";
import type { TerminalIo } from "../src/terminal.ts";
import * as wiringModule from "../src/wiring.ts";
import {
  type CliDeps,
  describeShellRecoveryChoices,
  EXIT_OK,
  EXIT_STARTUP_FAILED,
  EXIT_USAGE,
  runCli,
  type WiringFactories,
} from "../src/wiring.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 정본에서 그대로 옮긴 기대값 — 여기 아래로는 구현에서 읽은 것이 없다
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §5.1 계약 2의 축 표 여섯 행. 순서도 그 표의 행 순서다 — 「타입」 블록의
 * `DoctorReport.findings`가 축 순서를 `DOCTOR_AXES`의 선언 순서로 고정하므로,
 * 그 선언 순서는 이 표의 행 순서와 같아야 한다.
 */
const AXES_FROM_DOC = [
  "config",
  "model-credentials",
  "search-credentials",
  "memory",
  "docker",
  "sandbox-image",
] as const;

/** §5.1 계약 3 — `ok` · `problem` · `skipped` 셋뿐이다 */
const STATUSES_FROM_DOC: readonly string[] = ["ok", "problem", "skipped"];

/** §5.1 계약 7의 표 — 셋 그대로이고 새 종료 코드를 만들지 않는다 */
const EXIT_CODES_FROM_DOC = new Map<string, number>([
  ["EXIT_OK", 0],
  ["EXIT_STARTUP_FAILED", 1],
  ["EXIT_USAGE", 2],
]);

/** §3의 설정 파일 경로 · §4의 크리덴셜 경로 · `MEMORY.md` §2.1의 메모리 디렉터리 */
const CONFIG_RELATIVE = [".neo-agent", "config.json"] as const;
const CREDENTIALS_RELATIVE = [".neo-agent", "credentials"] as const;
const MEMORY_RELATIVE = [".neo-agent", "memory"] as const;

/** §4 「대상 키 둘」 */
const MODEL_KEY_ENV = "ANTHROPIC_API_KEY";
const SEARCH_KEY_ENV = "TAVILY_API_KEY";

/** ANSI CSI 시퀀스 — 계약 8이 이 명령의 정상 경로를 파이프로 두었다 */
const ANSI_CSI = new RegExp(`${String.fromCharCode(27)}\\[`);

// ─────────────────────────────────────────────────────────────────────────────
// 하네스 — 자체 스텁만 쓴다
// ─────────────────────────────────────────────────────────────────────────────

class Capture extends Writable {
  #chunks: string[] = [];
  override _write(chunk: unknown, _encoding: unknown, done: (error?: Error | null) => void): void {
    this.#chunks.push(String(chunk));
    done();
  }
  get text(): string {
    return this.#chunks.join("");
  }
}

/** 진단이 사람에게 묻지 않았음을 관측하려고 rawMode 요청을 센다(계약 5 — 3c를 열지 않는다) */
interface SpyInput extends PassThrough {
  isTTY?: boolean | undefined;
  setRawMode?: ((mode: boolean) => unknown) | undefined;
  rawModeCalls: number;
}

function makeInput(): SpyInput {
  const stream = new PassThrough() as SpyInput;
  stream.rawModeCalls = 0;
  stream.setRawMode = (_mode: boolean) => {
    stream.rawModeCalls += 1;
    return stream;
  };
  return stream;
}

/**
 * 「불리면 안 되는」 팩토리 — **불린 사실을 기록하고 던진다**.
 *
 * 던지기만 하면 부족하다(2026-09-06 역검증 M7): `runCli`는 조립 단계의 실패를 잡아
 * 종료 코드로 옮기므로, 조립을 타 버린 기동도 「숫자를 돌려주고 화면에 뭔가 썼다」로
 * 보인다. **불렸는가 자체를 값으로 남겨야** 계약 1이 재어진다.
 */
function forbidden(name: string, calls: ProbeCalls): () => never {
  return () => {
    calls.forbidden.push(name);
    throw new Error(`[QA] ${name}가 불렸다 — doctor는 조립을 부르지 않는다(§5.1 계약 1·5).`);
  };
}

interface ProbeCalls {
  docker: number;
  image: { image: string }[];
  /** 조립 팩토리가 불린 이름들. doctor 경로에서는 항상 비어 있어야 한다 */
  forbidden: string[];
}

interface Scenario {
  config?: Record<string, unknown> | string;
  credentialsFile?: { text: string; mode: number };
  memoryFile?: { text: string; mode: number };
  env?: NodeJS.ProcessEnv;
  docker?: DockerAvailability;
  image?: SandboxImageAvailability;
  argv?: readonly string[];
}

interface Rig {
  home: string;
  cwd: string;
  deps: CliDeps;
  out: Capture;
  input: SpyInput;
  calls: ProbeCalls;
}

let temporaries: string[] = [];

function makeTemporary(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaries.push(path);
  return path;
}

function makeRig(scenario: Scenario = {}): Rig {
  const home = makeTemporary("neo-doctor-home-");
  const cwd = makeTemporary("neo-doctor-cwd-");
  const calls: ProbeCalls = { docker: 0, image: [], forbidden: [] };

  if (scenario.config !== undefined) {
    mkdirSync(join(home, CONFIG_RELATIVE[0]), { recursive: true });
    writeFileSync(
      join(home, ...CONFIG_RELATIVE),
      typeof scenario.config === "string" ? scenario.config : JSON.stringify(scenario.config),
      "utf8",
    );
  }
  if (scenario.credentialsFile !== undefined) {
    mkdirSync(join(home, CREDENTIALS_RELATIVE[0]), { recursive: true });
    const path = join(home, ...CREDENTIALS_RELATIVE);
    writeFileSync(path, scenario.credentialsFile.text, "utf8");
    chmodSync(path, scenario.credentialsFile.mode);
  }
  if (scenario.memoryFile !== undefined) {
    const dir = join(home, ...MEMORY_RELATIVE);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "MEMORY.md");
    writeFileSync(path, scenario.memoryFile.text, "utf8");
    chmodSync(path, scenario.memoryFile.mode);
  }

  const out = new Capture();
  const input = makeInput();
  const io: TerminalIo = { input, output: out };

  const docker: DockerAvailability = scenario.docker ?? {
    available: false,
    reason: "[QA-주입] probeDocker 스텁의 불가용 사유",
  };
  const image: SandboxImageAvailability = scenario.image ?? {
    kind: "unknown",
    image: "qa/unset:0",
    reason: "[QA-주입] 이미지 프로브 스텁이 판정하지 못했다",
  };

  const factories: Partial<WiringFactories> = {
    probeDocker: async () => {
      calls.docker += 1;
      return docker;
    },
    probeSandboxImage: async (options: { image: string }) => {
      calls.image.push({ image: options.image });
      return image;
    },
    // 아래 전부 doctor 경로에서 불리면 안 된다 — 계약 1(조립을 안 탄다)·계약 5
    // (상태를 안 바꾼다)·계약 8(승인이 부재하다는 것이 면제의 근거다).
    openStore: forbidden("openStore", calls),
    createGate: forbidden("createGate", calls),
    createBoundary: forbidden("createBoundary", calls),
    createModelClient: forbidden("createModelClient", calls),
    createTools: forbidden("createTools", calls),
    createExecutor: forbidden("createExecutor", calls),
    createSandboxExecutor: forbidden("createSandboxExecutor", calls),
    createWebTool: forbidden("createWebTool", calls),
    createSearchTool: forbidden("createSearchTool", calls),
    createMemoryTool: forbidden("createMemoryTool", calls),
  };

  const deps: CliDeps = {
    argv: scenario.argv ?? ["doctor"],
    env: scenario.env ?? {},
    cwd,
    home,
    io,
    version: "0.0.0-qa",
    factories,
  };

  return { home, cwd, deps, out, input, calls };
}

/** 설정 축이 통과하는 최소 설정. `sandbox: "on"`은 §3의 기본값이고 태그는 고정이다(§3 표) */
const VALID_CONFIG = { sandbox: "on", sandboxImage: "qa-registry/neo-sandbox:qa-1" } as const;

/** 축 정의의 「다음 행동」이 받는 자리 — 경로는 이 테스트가 고른 표식이다 */
const PROBE_CONTEXT = {
  configPath: "/qa/config.json",
  credentialsPath: "/qa/credentials",
  memoryDir: "/qa/memory",
} as const;

function verdictOf(report: DoctorReport, axis: DoctorAxis): DoctorVerdict {
  const finding = report.findings.find((candidate) => candidate.axis === axis);
  if (finding === undefined) throw new Error(`축 ${axis}가 보고서에 없다`);
  return finding.verdict;
}

function statusesOf(report: DoctorReport): Record<string, string> {
  return Object.fromEntries(
    report.findings.map((finding) => [finding.axis, finding.verdict.status]),
  );
}

function axesWith(report: DoctorReport, status: string): string[] {
  return report.findings
    .filter((finding) => finding.verdict.status === status)
    .map((finding) => String(finding.axis))
    .sort();
}

/** 홈 아래에 실제로 존재하는 상대 경로 전부 — 계약 5의 상태 불변을 재는 스냅샷 */
function treeOf(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      found.push(relative(root, full).split(sep).join("/"));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return found.sort();
}

beforeEach(() => {
  temporaries = [];
});

afterEach(() => {
  for (const path of temporaries) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // 권한을 좁힌 픽스처는 정리에 실패할 수 있다 — 임시 디렉터리이므로 삼킨다.
    }
  }
  temporaries = [];
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 1 — 시작 시퀀스를 타지 않는다. 검사기만 공유한다
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 1 — 시작 시퀀스를 타지 않는다 (CLI-INTERFACE.md §5.1)", () => {
  it("runCli(doctor)가 조립 팩토리를 하나도 부르지 않고 끝난다", async () => {
    // doctor는 startCli를 부르지 않는다 — 조립이 부르는 팩토리 전부가 「불리면
    // 이름을 남기고 던진다」로 심겨 있고, 조립을 탔다면 그 목록이 빈 채로 남지 않는다.
    // 이 호출이 R-1(`wiring.ts` ↔ `doctor.ts` 순환 임포트)의 실측이기도 하다.
    //
    // **시나리오가 「조립이 실제로 그 자리까지 갈 수 있는」 홈이어야 한다**
    // (2026-09-06 역검증 M7): 설정과 모델 열쇠가 성해야 시퀀스가 3단계(경계 생성)에
    // 닿는다. 결손이 있는 홈은 조립이 그 앞에서 죽어 「팩토리가 안 불렸다」가
    // 계약의 이행이 아니라 다른 실패의 부작용이 된다.
    const rig = makeRig({ config: VALID_CONFIG, env: { [MODEL_KEY_ENV]: "qa" } });
    const code = await runCli(rig.deps);
    expect(rig.calls.forbidden).toEqual([]);
    expect(typeof code).toBe("number");
    expect(rig.out.text).not.toBe("");
  });

  it("세션 저장소를 열지 않는다 — 홈의 트리가 그대로다", async () => {
    // 근거 3(시퀀스는 세션을 연다)과 계약 5의 「세션 저장소를 열지 않는다」.
    // 조립이 4단계(저장소 열기)까지 갈 수 있는 홈으로 잰다 — 위 축과 같은 이유다.
    const rig = makeRig({ config: VALID_CONFIG, env: { [MODEL_KEY_ENV]: "qa" } });
    const before = treeOf(rig.home);
    await runCli(rig.deps);
    expect(rig.calls.forbidden).toEqual([]);
    expect(treeOf(rig.home)).toEqual(before);
  });

  it("첫 기동 관문을 열지 않는다 — 입력에 손대지 않고 rawMode도 요청하지 않는다", async () => {
    // 근거 2(시퀀스는 상태를 만든다 — 3c의 관문이 사용자에게 묻고 홈을 만든다)와
    // 계약 5의 「첫 기동 관문(3c)을 열지 않는다」. 관문이 열렸다면 답을 기다리며
    // 입력을 구독한다. 이 홈에는 `sessions.db`가 없으므로 시퀀스를 탔다면 3c가
    // 판정을 내리는 자리다.
    const rig = makeRig({ config: VALID_CONFIG, env: { [MODEL_KEY_ENV]: "qa" } });
    await runCli(rig.deps);
    expect(rig.calls.forbidden).toEqual([]);
    expect(rig.input.rawModeCalls).toBe(0);
    expect(rig.input.listenerCount("data")).toBe(0);
    expect(rig.input.listenerCount("keypress")).toBe(0);
  });

  it("검사기의 던짐을 축 판정으로 옮긴다 — 던짐이 밖으로 새지 않는다", async () => {
    // 검사기는 오늘 그대로 던지고, doctor가 축마다 그 던짐을 잡아 판정 한 줄로
    // 옮긴다 — 모델 열쇠가 없어 `loadCredentials`가 던지는 홈이다.
    const rig = makeRig({ config: VALID_CONFIG, env: {} });
    await expect(runDoctor(rig.deps)).resolves.toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 2 — 축은 닫힌 목록이고 완전 레코드다
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 2 — 축은 닫힌 목록이고 완전 레코드다", () => {
  it("DOCTOR_AXES의 키 집합이 §5.1 표의 축 여섯과 정확히 같다", () => {
    expect([...Object.keys(DOCTOR_AXES)].sort()).toEqual([...AXES_FROM_DOC].sort());
  });

  it("보고서의 축 순서가 DOCTOR_AXES의 선언 순서이고 그것이 표의 행 순서다", async () => {
    const rig = makeRig({ config: VALID_CONFIG });
    const report = await runDoctor(rig.deps);
    expect(report.findings.map((finding) => String(finding.axis))).toEqual(
      Object.keys(DOCTOR_AXES),
    );
    expect(report.findings.map((finding) => String(finding.axis))).toEqual([...AXES_FROM_DOC]);
  });

  it("완전 레코드다 — 축마다 라벨과 「다음 행동」이 있고 비어 있지 않다", () => {
    for (const axis of AXES_FROM_DOC) {
      const meta = DOCTOR_AXES[axis];
      expect(meta.label.trim()).not.toBe("");
      expect(meta.nextAction(PROBE_CONTEXT).trim()).not.toBe("");
    }
  });

  it("경로 해석 함수를 새로 쓰지 않는다 — 기동이 읽는 세 경로를 그대로 본다", async () => {
    // defaultConfigPath·defaultCredentialsPath·defaultMemoryDir를 그대로 부른다.
    // 정본이 §3·§4·`MEMORY.md`로 든 자리에 결손을 심고 그것이 관측되는지를 본다 —
    // 다른 경로를 봤다면 세 축이 전부 「이상 없음」으로 나온다.
    const home = makeTemporary("neo-doctor-path-");
    expect(defaultConfigPath(home)).toBe(join(home, ...CONFIG_RELATIVE));
    expect(defaultCredentialsPath(home)).toBe(join(home, ...CREDENTIALS_RELATIVE));
    expect(defaultMemoryDir(home)).toBe(join(home, ...MEMORY_RELATIVE));

    const rig = makeRig({
      config: { ...VALID_CONFIG, "qa-unknown-key": 1 },
      credentialsFile: { text: `${MODEL_KEY_ENV}=qa-from-file\n`, mode: 0o644 },
      memoryFile: { text: "- qa\n", mode: 0o644 },
    });
    const report = await runDoctor(rig.deps);
    expect(verdictOf(report, "config").status).toBe("problem");
    expect(verdictOf(report, "model-credentials").status).toBe("problem");
    expect(verdictOf(report, "memory").status).toBe("problem");
  });

  it("config — 파싱·미지 키·값 계약 중 하나가 던지면 problem이다", async () => {
    const unknownKey = await runDoctor(
      makeRig({ config: { ...VALID_CONFIG, "qa-unknown-key": true } }).deps,
    );
    expect(verdictOf(unknownKey, "config").status).toBe("problem");

    const broken = await runDoctor(makeRig({ config: "{not json" }).deps);
    expect(verdictOf(broken, "config").status).toBe("problem");

    const outOfRange = await runDoctor(
      makeRig({ config: { ...VALID_CONFIG, compactionThreshold: 5 } }).deps,
    );
    expect(verdictOf(outOfRange, "config").status).toBe("problem");
  });

  it("config — 파일 부재는 problem이 아니다 (§3: 파일이 없으면 전부 기본값)", async () => {
    // §3이 파일 없음을 유효한 상태로 두고 계약 2는 이 축의 problem 조건을 「둘 중
    // 하나가 던진다」로만 연다. 부재를 problem으로 접으면 계약 3 둘째 사례가 걸려
    // docker·sandbox-image까지 함께 skipped가 되고, **설정 파일이 없는 정상 호스트에서
    // 축 셋이 한꺼번에 무너진다.**
    const rig = makeRig({
      env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
      docker: { available: true, version: "qa-99.9.9" },
      image: { kind: "present", image: "qa/default:0", imageId: "sha256:qa" },
    });
    const report = await runDoctor(rig.deps);
    expect(verdictOf(report, "config").status).toBe("ok");
    expect(verdictOf(report, "docker").status).not.toBe("skipped");
    expect(verdictOf(report, "sandbox-image").status).not.toBe("skipped");
  });

  it.skipIf(process.getuid?.() === 0)(
    "memory — 파일이 있는데 못 읽으면 problem이다 (`MEMORY.md` §2.2 3행)",
    async () => {
      // 계약 2의 memory 행은 problem 조건을 「던진다 · 또는 권한 경고가 나온다」로
      // 둘로 연다. 위 축이 뒤엣것을, 이 축이 앞엣것을 잰다.
      //
      // **root로 돌면 이 갈래가 성립하지 않는다** — 읽기 권한을 지워도 읽히므로
      // 검사가 재려는 상태를 만들 수 없다. 조용히 통과시키는 대신 건너뛴다.
      const rig = makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa" },
        memoryFile: { text: "- qa 메모\n", mode: 0o000 },
      });
      const report = await runDoctor(rig.deps);
      expect(verdictOf(report, "memory").status).toBe("problem");
    },
  );

  it("model-credentials — loadCredentials가 던지면 problem이다", async () => {
    // §4 보호 계약 1: 파일이 존재하면 600이 아닌 권한은 기동 거부다. 그리고 키가
    // 두 경로 모두에 없어도 던진다.
    const noKey = await runDoctor(makeRig({ config: VALID_CONFIG, env: {} }).deps);
    expect(verdictOf(noKey, "model-credentials").status).toBe("problem");

    const loosePermissions = await runDoctor(
      makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa-key" },
        credentialsFile: { text: `${MODEL_KEY_ENV}=qa\n`, mode: 0o644 },
      }).deps,
    );
    expect(verdictOf(loosePermissions, "model-credentials").status).toBe("problem");
  });

  it("search-credentials — 같은 호출의 반환값에 검색 키가 없으면 problem이다", async () => {
    // 계약 2의 판정 조건은 「반환값에 없다」이고, 모델 열쇠가 있는데 검색 열쇠만
    // 없는 갈래는 계약 3 셋째 사례가 덮지 않는다 — §5.1이 그 문단에서 이 갈래는
    // 그대로 problem이라고 못박았다.
    const rig = makeRig({ config: VALID_CONFIG, env: { [MODEL_KEY_ENV]: "qa-key" } });
    const report = await runDoctor(rig.deps);
    expect(verdictOf(report, "model-credentials").status).toBe("ok");
    expect(verdictOf(report, "search-credentials").status).toBe("problem");
  });

  it("search-credentials — 검색 키가 있으면 ok다", async () => {
    const rig = makeRig({
      config: VALID_CONFIG,
      env: { [MODEL_KEY_ENV]: "qa-key", [SEARCH_KEY_ENV]: "qa-search" },
    });
    expect(verdictOf(await runDoctor(rig.deps), "search-credentials").status).toBe("ok");
  });

  it("memory — 권한 경고가 나오면 problem이다 (기동과 갈리는 유일한 자리)", async () => {
    // `MEMORY.md` §2.2 4행은 기동에 대해 「경고만, 진행」이고, §5.1 계약 2는 doctor가
    // 그것을 문제로 센다고 정한다. 판정 기준은 노출 비트의 존재다.
    const warned = await runDoctor(
      makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa-key" },
        memoryFile: { text: "- qa 메모\n", mode: 0o644 },
      }).deps,
    );
    expect(verdictOf(warned, "memory").status).toBe("problem");

    const tight = await runDoctor(
      makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa-key" },
        memoryFile: { text: "- qa 메모\n", mode: 0o600 },
      }).deps,
    );
    expect(verdictOf(tight, "memory").status).toBe("ok");
  });

  it("docker — available: false면 problem이다", async () => {
    const unavailable = await runDoctor(
      makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa-key" },
        docker: { available: false, reason: "[QA-주입] 데몬 소켓 접근 거부" },
      }).deps,
    );
    expect(verdictOf(unavailable, "docker").status).toBe("problem");

    const available = await runDoctor(
      makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa-key" },
        docker: { available: true, version: "qa-99.9.9" },
      }).deps,
    );
    expect(verdictOf(available, "docker").status).toBe("ok");
  });

  it("sandbox-image — 데몬이 답했고 그 이미지가 없을 때만 problem이다", async () => {
    const absent = await runDoctor(
      makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa-key" },
        docker: { available: true, version: "qa-99.9.9" },
        image: { kind: "absent", image: VALID_CONFIG.sandboxImage, reason: "[QA-주입] 없다" },
      }).deps,
    );
    expect(verdictOf(absent, "sandbox-image").status).toBe("problem");

    const present = await runDoctor(
      makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa-key" },
        docker: { available: true, version: "qa-99.9.9" },
        image: { kind: "present", image: VALID_CONFIG.sandboxImage, imageId: "sha256:qa" },
      }).deps,
    );
    expect(verdictOf(present, "sandbox-image").status).toBe("ok");
  });

  it("sandbox-image 축이 설정이 든 sandboxImage를 그대로 묻는다", async () => {
    const rig = makeRig({
      config: VALID_CONFIG,
      env: { [MODEL_KEY_ENV]: "qa-key" },
      docker: { available: true, version: "qa-99.9.9" },
      image: { kind: "present", image: VALID_CONFIG.sandboxImage, imageId: "sha256:qa" },
    });
    await runDoctor(rig.deps);
    expect(rig.calls.image).toEqual([{ image: VALID_CONFIG.sandboxImage }]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 3 — 판정은 세 값이고 `skipped`는 심각도가 아니다
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 3 — 판정 세 값과 skipped 사례 넷", () => {
  it("판정은 ok·problem·skipped 셋뿐이다", async () => {
    const reports = await Promise.all([
      runDoctor(makeRig().deps),
      runDoctor(makeRig({ config: VALID_CONFIG, env: { [MODEL_KEY_ENV]: "qa" } }).deps),
      runDoctor(makeRig({ config: { ...VALID_CONFIG, sandbox: "off" } }).deps),
    ]);
    for (const report of reports) {
      for (const finding of report.findings) {
        expect(STATUSES_FROM_DOC).toContain(finding.verdict.status);
      }
    }
  });

  it("사례 ① — sandbox: off면 docker·sandbox-image가 skipped다", async () => {
    // **[미규정 QA-3]** 이 갈래에서 프로브를 **불러도 되는가**를 §5.1이 정하지 않았다.
    // §2 5b는 기동에 대해 「판정 자체를 하지 않는다」를 계약으로 들지만, 계약 3은
    // 이 축들의 판정만 정하고 호출 여부는 말하지 않는다. 부르면 옵트아웃한 호스트에서
    // 진단이 docker에 닿게 되므로 무해하지 않다 — 임의 판정하지 않고 판정 필요로 올린다.
    const rig = makeRig({
      config: { ...VALID_CONFIG, sandbox: "off" },
      env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
    });
    const report = await runDoctor(rig.deps);
    expect(statusesOf(report)).toMatchObject({ docker: "skipped", "sandbox-image": "skipped" });
  });

  it("사례 ② — config 축이 problem이면 docker·sandbox-image가 skipped다", async () => {
    const rig = makeRig({
      config: { ...VALID_CONFIG, "qa-unknown-key": 1 },
      env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
    });
    const report = await runDoctor(rig.deps);
    expect(verdictOf(report, "config").status).toBe("problem");
    expect(statusesOf(report)).toMatchObject({ docker: "skipped", "sandbox-image": "skipped" });
  });

  it("사례 ③ — model-credentials가 problem이면 search-credentials가 skipped다", async () => {
    // 2026-09-06 신설. 크리덴셜 로더가 그 앞에서 던져 검색 열쇠를 읽지 못했기
    // 때문이지 열쇠가 없어서가 아니다 — 검색 열쇠를 env에 실제로 두고도 모델
    // 열쇠를 없애 이 갈래를 만든다. problem이면 「있는 열쇠를 없다고 말한」 것이다.
    const rig = makeRig({ config: VALID_CONFIG, env: { [SEARCH_KEY_ENV]: "qa-search" } });
    const report = await runDoctor(rig.deps);
    expect(verdictOf(report, "model-credentials").status).toBe("problem");
    expect(verdictOf(report, "search-credentials").status).toBe("skipped");
  });

  it("사례 ④ — 이미지 프로브가 판정하지 못하면 sandbox-image가 skipped다", async () => {
    const rig = makeRig({
      config: VALID_CONFIG,
      env: { [MODEL_KEY_ENV]: "qa" },
      docker: { available: true, version: "qa-99.9.9" },
      image: {
        kind: "unknown",
        image: VALID_CONFIG.sandboxImage,
        reason: "[QA-주입] 분류 밖 실패라 판정하지 못했다",
      },
    });
    const report = await runDoctor(rig.deps);
    // 이 항만 다른 축의 실패에 걸리지 않는다 — docker 축이 ok인데 이 축만 skipped인
    // 상태가 성립할 수 있다.
    expect(verdictOf(report, "docker").status).toBe("ok");
    expect(verdictOf(report, "sandbox-image").status).toBe("skipped");
  });

  it("skipped는 이유를 반드시 낸다 — 값에도, 화면에도", async () => {
    const rig = makeRig({
      config: { ...VALID_CONFIG, sandbox: "off" },
      env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
    });
    const report = await runDoctor(rig.deps);
    const rendered = renderDoctorReport(report);
    for (const finding of report.findings) {
      if (finding.verdict.status !== "skipped") continue;
      expect(finding.verdict.reason.trim()).not.toBe("");
      // 값에만 있고 화면에 안 나가면 「안 쟀다」가 화면에서 「괜찮다」로 읽힌다.
      expect(rendered).toContain(finding.verdict.reason);
    }
  });

  it("skipped는 종료 코드에 기여하지 않는다 — problemCount가 세는 것은 problem뿐이다", async () => {
    const rig = makeRig({
      config: { ...VALID_CONFIG, sandbox: "off" },
      env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
      memoryFile: { text: "- qa\n", mode: 0o600 },
    });
    const report = await runDoctor(rig.deps);
    expect(axesWith(report, "skipped").length).toBeGreaterThan(0);
    expect(report.problemCount).toBe(axesWith(report, "problem").length);
    expect(report.problemCount).toBe(0);
    expect(await runCli(rig.deps)).toBe(EXIT_OK);
  });

  it("ok의 observed는 빈 문자열이 아니다", async () => {
    // §5.1 「타입」이 ok 갈래에 observed를 두었으나 내용을 정하지 않았고, 타입은 빈
    // 문자열을 통과시킨다 — 그러면 「ok인데 화면에 아무것도 안 나오는 축」이 조용히
    // 성립한다(`ARCHITECTURE.md` §2.6). 플랜 §4가 이 좁힘을 T-009에 배정했다.
    const rig = makeRig({
      config: VALID_CONFIG,
      env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
      docker: { available: true, version: "qa-99.9.9" },
      image: { kind: "present", image: VALID_CONFIG.sandboxImage, imageId: "sha256:qa" },
      memoryFile: { text: "- qa\n", mode: 0o600 },
    });
    const report = await runDoctor(rig.deps);
    expect(axesWith(report, "ok")).toEqual([...AXES_FROM_DOC].sort());
    for (const finding of report.findings) {
      if (finding.verdict.status !== "ok") continue;
      expect(finding.verdict.observed.trim()).not.toBe("");
    }
  });

  it("불가능한 상태를 배제한다 — 판정마다 자기 필드만 갖는다", async () => {
    // problem에만 다음 행동이 있고, skipped에만 이유가 있으며, ok는 둘 다 갖지
    // 않는다(§5.1 「타입」). 타입이 배제하는 것을 값도 배제하는지 본다.
    const reports = await Promise.all([
      runDoctor(makeRig().deps),
      runDoctor(makeRig({ config: { ...VALID_CONFIG, sandbox: "off" } }).deps),
      runDoctor(
        makeRig({
          config: VALID_CONFIG,
          env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
          docker: { available: true, version: "qa-99.9.9" },
          image: { kind: "present", image: VALID_CONFIG.sandboxImage, imageId: "sha256:qa" },
        }).deps,
      ),
    ]);
    for (const report of reports) {
      for (const { verdict } of report.findings) {
        const keys = [...Object.keys(verdict)].sort();
        if (verdict.status === "ok") expect(keys).toEqual(["observed", "status"]);
        else if (verdict.status === "problem")
          expect(keys).toEqual(["cause", "nextAction", "status"]);
        else expect(keys).toEqual(["reason", "status"]);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 4 — 축 단위로 전량, 한 축 안에서는 첫 실패까지
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 4 — 축 전량 · 축 안은 첫 실패까지", () => {
  it("결손 넷을 동시에 심으면 1회 실행이 그 넷을 전부 낸다", async () => {
    // 인터뷰 성공 기준 1의 이행(플랜 S-5). 축 id로 재고 라벨 문자열로 재지 않는다.
    const rig = makeRig({
      config: VALID_CONFIG, // 설정은 성하게 둔다 — 무너지면 아래 둘이 skipped가 된다
      env: {}, //                                     → model-credentials 결손
      memoryFile: { text: "- qa\n", mode: 0o644 }, //  → memory 결손
      docker: { available: false, reason: "[QA-주입] 데몬 없음" }, // → docker 결손
      image: { kind: "absent", image: VALID_CONFIG.sandboxImage, reason: "[QA-주입] 없다" },
    });
    const report = await runDoctor(rig.deps);
    expect(axesWith(report, "problem")).toEqual(
      ["docker", "memory", "model-credentials", "sandbox-image"].sort(),
    );
    expect(report.problemCount).toBe(4);
    // 축 여섯이 전부 판정을 갖는다 — 하나가 실패해도 나머지가 멈추지 않는다.
    expect(report.findings).toHaveLength(AXES_FROM_DOC.length);
    expect(statusesOf(report)).toMatchObject({ config: "ok", "search-credentials": "skipped" });
  });

  it("결손 셋을 심어도 축 여섯 전부가 판정된다 (다른 조합)", async () => {
    const rig = makeRig({
      config: { ...VALID_CONFIG, "qa-unknown-key": 1 }, // → config 결손
      env: {}, //                                         → model-credentials 결손
      memoryFile: { text: "- qa\n", mode: 0o644 }, //      → memory 결손
    });
    const report = await runDoctor(rig.deps);
    expect(axesWith(report, "problem")).toEqual(["config", "memory", "model-credentials"].sort());
    expect(axesWith(report, "skipped")).toEqual(
      ["docker", "sandbox-image", "search-credentials"].sort(),
    );
    expect(report.findings).toHaveLength(AXES_FROM_DOC.length);
  });

  it("한 축 안에서는 첫 실패까지다 — 위반 둘을 넣어도 하나만 나온다", async () => {
    // config.json에 위반 둘이 함께 있으면 doctor는 먼저 걸리는 하나만 낸다. 어느
    // 쪽이 먼저인지는 §5.1이 정하지 않으므로 순서를 단정하지 않고 둘 중 정확히
    // 하나만 실린다는 것을 잰다. 문면 리터럴이 아니라 이 테스트가 주입한 데이터를
    // 프로브로 쓴다(§7의 허용 갈래).
    //
    // **프로브 토큰을 키 이름으로 잡으면 안 된다** (2026-09-06 실측). 미지 키 에러가
    // 「쓸 수 있는 키」 목록을 함께 내므로 `compactionThreshold` 같은 정규 키 이름은
    // 다른 위반의 문면에도 들어 있다 — 그 자리에서는 이 축이 거짓 위반을 낸다.
    // 그래서 양쪽 토큰을 이 테스트만 쓰는 값으로 잡는다.
    const rig = makeRig({
      config: { ...VALID_CONFIG, qaAlphaKey: 1, sandboxImage: "qa-bravo-image" },
    });
    const verdict = verdictOf(await runDoctor(rig.deps), "config");
    expect(verdict.status).toBe("problem");
    if (verdict.status !== "problem") return;
    const mentionsUnknownKey = verdict.cause.includes("qaAlphaKey") ? 1 : 0;
    const mentionsMovingTag = verdict.cause.includes("qa-bravo-image") ? 1 : 0;
    expect(mentionsUnknownKey + mentionsMovingTag).toBe(1);
  });

  it("여러 줄 cause가 렌더링에서 들여쓰기를 잃지 않는다", () => {
    // 계약 4는 이 축의 cause가 실물에서 여러 줄이 된다는 것과 함께 보고서 렌더링이 여러
    // 줄 원인을 들여쓴다는 것까지 형태로 단정한다. 앞쪽은 값에서 재지만 뒤쪽을 재는
    // 단언이 이 스위트에 없었다 — 여기의 다른 렌더링 단언은 skipped의 이유만 본다.
    //
    // **문면을 리터럴로 고정하지 않는다**(§7). 대조의 오른편은 전부 이 테스트가 보고서에
    // 주입한 값이고, 재는 것은 둘째 줄 이후에 선행 공백이 있다는 사실이지 그 공백의 수도
    // 축 라벨도 아니다. 들여쓰기가 사라지면 둘째 줄이 축 머리와 같은 열에 서서 다음 축의
    // 판정 줄로 읽힌다 — 화면이 조용히 거짓이 되는 방향이다(`ARCHITECTURE.md` §2.6).
    //
    // 보고서 값을 손으로 짓는 이유: 재는 대상이 renderDoctorReport 하나이고, 여러 줄
    // cause를 실제로 낳는 갈래는 uid·권한에 좌우된다(그 갈래의 관측은
    // `doctor-axis-independence.qa.test.ts`가 진다). 렌더러의 계약을 호스트에 매지 않는다.
    const head = "[QA-주입] 원인 첫 줄";
    const tail = "[QA-주입] 원인 둘째 줄";
    const report: DoctorReport = {
      findings: [
        {
          axis: "memory",
          verdict: {
            status: "problem",
            cause: `${head}\n${tail}`,
            nextAction: "[QA-주입] 다음 행동",
          },
        },
      ],
      problemCount: 1,
    };

    const lines = renderDoctorReport(report).split("\n");
    const headLine = lines.find((line) => line.includes(head));
    const tailLine = lines.find((line) => line.includes(tail));
    // 두 줄이 각자 한 줄로 살아 있다 — 뭉치거나 잘리면 여기서 갈린다.
    expect({ 첫줄: headLine !== undefined, 둘째줄: tailLine !== undefined }).toEqual({
      첫줄: true,
      둘째줄: true,
    });
    expect(headLine).not.toBe(tailLine);
    // 둘째 줄은 선행 공백을 갖고, 그 폭이 첫 줄보다 좁아지지 않는다. 공백의 수는 세지 않는다.
    const indentOf = (line: string): number => (/^(\s*)/.exec(line)?.[1] ?? "").length;
    expect({
      둘째줄이_들여써졌다: /^\s+\S/.test(tailLine ?? ""),
      첫줄보다_안좁다: indentOf(tailLine ?? "") >= indentOf(headLine ?? ""),
    }).toEqual({ 둘째줄이_들여써졌다: true, 첫줄보다_안좁다: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 5 — 진단만 한다. 상태를 바꾸지 않는다 (D-5)
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 5 — 진단만 한다. 상태를 바꾸지 않는다", () => {
  it("~/.neo-agent/를 만들지 않는다", async () => {
    const rig = makeRig();
    await runCli(rig.deps);
    expect(existsSync(join(rig.home, CONFIG_RELATIVE[0]))).toBe(false);
    expect(readdirSync(rig.home)).toEqual([]);
  });

  it("있는 파일도 건드리지 않는다 — 트리와 권한이 실행 전후로 같다", async () => {
    const rig = makeRig({
      config: VALID_CONFIG,
      credentialsFile: { text: `${MODEL_KEY_ENV}=qa\n`, mode: 0o600 },
      memoryFile: { text: "- qa 메모\n", mode: 0o600 },
      docker: { available: true, version: "qa-99.9.9" },
      image: { kind: "present", image: VALID_CONFIG.sandboxImage, imageId: "sha256:qa" },
    });
    const snapshot = (): [string, number][] =>
      treeOf(rig.home).map((path) => [path, statSync(join(rig.home, path)).mode]);
    const before = snapshot();
    await runCli(rig.deps);
    expect(snapshot()).toEqual(before);
  });

  it("승인 게이트를 세우지 않는다 — 도구를 실행하지 않으므로 물을 일이 없다", async () => {
    // 계약 8의 면제 근거(승인의 부재)가 값으로 서는 자리다. createGate·도구
    // 팩토리는 「불리면 던진다」로 심겨 있고, 이 호출이 그것을 지나 끝난다.
    const rig = makeRig({ config: VALID_CONFIG, env: { [MODEL_KEY_ENV]: "qa" } });
    await expect(runCli(rig.deps)).resolves.toBeTypeOf("number");
    expect(rig.calls.forbidden).toEqual([]);
  });

  it("열쇠로 서버에 묻지 않는다 — 진단 중 fetch가 한 번도 불리지 않는다", async () => {
    // D-6. 있는지만 본다 — 진단이 과금·레이트리밋·외부 호출을 유발하지 않는다.
    const original = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      throw new Error("[QA] doctor가 네트워크로 나갔다 — §5.1 계약 5 위반이다.");
    }) as typeof fetch;
    try {
      const rig = makeRig({
        config: VALID_CONFIG,
        env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
        docker: { available: true, version: "qa-99.9.9" },
        image: { kind: "present", image: VALID_CONFIG.sandboxImage, imageId: "sha256:qa" },
      });
      await runCli(rig.deps);
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("이미지를 내려받지 않는다 — 프로브는 로컬 조회 한 번뿐이다", async () => {
    // sandbox-image 축의 프로브는 로컬 조회이고 pull 경로를 갖지 않는다. 실행자
    // 팩토리(createSandboxExecutor)는 「불리면 던진다」이고, 프로브 호출 수를 함께 센다.
    const rig = makeRig({
      config: VALID_CONFIG,
      env: { [MODEL_KEY_ENV]: "qa" },
      docker: { available: true, version: "qa-99.9.9" },
      image: { kind: "absent", image: VALID_CONFIG.sandboxImage, reason: "[QA-주입] 없다" },
    });
    await runDoctor(rig.deps);
    expect(rig.calls.image).toHaveLength(1);
    expect(rig.calls.docker).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 6 — `problem`은 「다음 행동」 자리를 든다
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 6 — cause는 검사기가, nextAction은 축 정의가 소유한다", () => {
  it("모든 problem에 비어 있지 않은 cause와 nextAction이 있다", async () => {
    const rig = makeRig({
      config: VALID_CONFIG,
      env: {},
      memoryFile: { text: "- qa\n", mode: 0o644 },
      docker: { available: false, reason: "[QA-주입] 데몬 없음" },
      image: { kind: "absent", image: VALID_CONFIG.sandboxImage, reason: "[QA-주입] 없다" },
    });
    const report = await runDoctor(rig.deps);
    expect(report.problemCount).toBeGreaterThan(0);
    for (const { verdict } of report.findings) {
      if (verdict.status !== "problem") continue;
      expect(verdict.cause.trim()).not.toBe("");
      expect(verdict.nextAction.trim()).not.toBe("");
    }
  });

  it("cause가 검사기의 문면을 그대로 옮긴다 — doctor가 다시 쓰지 않는다", async () => {
    // 프로브 스텁이 돌려준 reason을 그대로 비교한다. 리터럴 고정이 아니라 이
    // 테스트가 주입한 데이터의 통과 여부를 보는 프로브다(§7의 허용 갈래).
    const dockerReason = "[QA-주입-도커] 이 문장이 그대로 실려야 한다";
    const imageReason = "[QA-주입-이미지] 이 문장이 그대로 실려야 한다";
    const rig = makeRig({
      config: VALID_CONFIG,
      env: { [MODEL_KEY_ENV]: "qa" },
      docker: { available: false, reason: dockerReason },
      image: { kind: "absent", image: VALID_CONFIG.sandboxImage, reason: imageReason },
    });
    const report = await runDoctor(rig.deps);
    const docker = verdictOf(report, "docker");
    const image = verdictOf(report, "sandbox-image");
    expect(docker.status).toBe("problem");
    expect(image.status).toBe("problem");
    if (docker.status === "problem") expect(docker.cause).toBe(dockerReason);
    if (image.status === "problem") expect(image.cause).toBe(imageReason);
  });

  it("nextAction은 축마다 다르다 — 축 정의가 소유한 문면이다", () => {
    const actions = AXES_FROM_DOC.map((axis) => DOCTOR_AXES[axis].nextAction(PROBE_CONTEXT));
    expect(new Set(actions).size).toBe(actions.length);
  });

  it("5b의 Docker 불가용 안내를 복제하지 않고 공유한다", () => {
    // 시작 시퀀스에 이미 그 문면이 있는 자리는 함수로 추출해 공유한다 — 실물은 5b의
    // Docker 불가용 안내 하나다. 축 정의가 그 함수의 값을 그대로 들어야 하고, 그
    // 문면이 소스 트리에 두 번 있으면 안 된다.
    const shared = describeShellRecoveryChoices();
    expect(shared.trim()).not.toBe("");
    expect(DOCTOR_AXES.docker.nextAction(PROBE_CONTEXT)).toBe(shared);

    // 소스 전체에서 그 문면의 한 줄이 나오는 파일 수를 센다. 술어의 문자열은
    // 하드코딩이 아니라 위 함수의 반환값에서 뽑는다.
    const probeLine = (shared.split("\n")[1] ?? "").trim();
    expect(probeLine).not.toBe("");
    const packagesRoot = join(import.meta.dirname, "..", "..");
    const holders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;
        if (full.includes(`${sep}test${sep}`)) continue;
        if (readFileSync(full, "utf8").includes(probeLine))
          holders.push(relative(packagesRoot, full));
      }
    };
    walk(packagesRoot);
    expect(holders).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 7 — 종료 코드는 셋 그대로다. 출력은 stdout이다
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 7 — 종료 코드 셋과 stdout", () => {
  it("problem 0건이면 EXIT_OK다", async () => {
    const rig = makeRig({
      config: VALID_CONFIG,
      env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
      docker: { available: true, version: "qa-99.9.9" },
      image: { kind: "present", image: VALID_CONFIG.sandboxImage, imageId: "sha256:qa" },
      memoryFile: { text: "- qa\n", mode: 0o600 },
    });
    expect(await runCli(rig.deps)).toBe(EXIT_OK);
    expect(EXIT_OK).toBe(0);
  });

  it("problem 1건 이상이면 EXIT_STARTUP_FAILED다", async () => {
    const rig = makeRig({ config: VALID_CONFIG, env: {} });
    expect(await runCli(rig.deps)).toBe(EXIT_STARTUP_FAILED);
    expect(EXIT_STARTUP_FAILED).toBe(1);
  });

  it("neo-agent doctor <남는 인자>는 EXIT_USAGE다 (파서가 던진다)", async () => {
    const rig = makeRig({ argv: ["doctor", "qa-extra"] });
    expect(await runCli(rig.deps)).toBe(EXIT_USAGE);
    expect(EXIT_USAGE).toBe(2);
  });

  it("새 종료 코드를 만들지 않는다 — 조립이 내보내는 EXIT_*가 셋 그대로다", () => {
    const exported = new Map(
      Object.entries(wiringModule)
        .filter(([name, value]) => name.startsWith("EXIT_") && typeof value === "number")
        .map(([name, value]) => [name, value as number]),
    );
    expect(exported).toEqual(EXIT_CODES_FROM_DOC);
  });

  it("출력은 stdout이다 — 보고서가 io.output으로 나가고 stderr는 조용하다", async () => {
    const rig = makeRig({ config: VALID_CONFIG, env: {} });
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      await runCli(rig.deps);
    } finally {
      process.stderr.write = originalWrite;
    }
    expect(rig.out.text.trim()).not.toBe("");
    expect(stderrChunks.join("")).toBe("");
  });

  it("보고서는 축마다 자기 자리를 갖고 ANSI를 섞지 않는다", async () => {
    // 계약 8이 이 명령을 TTY 없이 도는 것으로 두었으므로 정상 경로가 파이프다.
    // 축 라벨은 손으로 적지 않고 축 정의에서 읽는다(§7 — 문면은 세부다).
    const rig = makeRig({
      config: VALID_CONFIG,
      env: {},
      docker: { available: false, reason: "[QA-주입] 데몬 없음" },
    });
    await runCli(rig.deps);
    const text = rig.out.text;
    expect(ANSI_CSI.test(text)).toBe(false);
    for (const axis of AXES_FROM_DOC) {
      expect(text).toContain(DOCTOR_AXES[axis].label);
    }
  });

  it("판정이 갈리면 화면도 갈린다 — 구별과 비침묵", async () => {
    const clean = makeRig({
      config: VALID_CONFIG,
      env: { [MODEL_KEY_ENV]: "qa", [SEARCH_KEY_ENV]: "qa" },
      docker: { available: true, version: "qa-99.9.9" },
      image: { kind: "present", image: VALID_CONFIG.sandboxImage, imageId: "sha256:qa" },
      memoryFile: { text: "- qa\n", mode: 0o600 },
    });
    const broken = makeRig({ config: VALID_CONFIG, env: {} });
    await runCli(clean.deps);
    await runCli(broken.deps);
    expect(clean.out.text.trim()).not.toBe("");
    expect(broken.out.text.trim()).not.toBe("");
    expect(clean.out.text).not.toBe(broken.out.text);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 1의 반대 방향 — 조립에 닿으면 그 자체가 결함이다 (플랜 S-7)
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 1·5의 뒷문 — 조립이 doctor 갈래를 받으면 던진다", () => {
  it("startCli에 doctor 갈래를 넘기면 세션을 열지 않고 던진다", async () => {
    // 계약 1이 doctor를 시퀀스 밖으로 뺐으므로 조립이 이 갈래를 받는 일 자체가
    // 배선 결함이다. 조용한 기본값(= run과 같은 쪽으로 흐르기)으로 접히면 계약 5의
    // 「세션 저장소를 열지 않는다」가 그 순간 깨진다.
    //
    // 저장소는 스텁을 주입한다 — 실물을 열면 이 검증이 계약 5가 금지한 상태 변경을
    // 스스로 일으킨다. 스텁의 세션 메서드가 불리면 이름이 남는다.
    const rig = makeRig({ config: VALID_CONFIG, env: { [MODEL_KEY_ENV]: "qa" } });
    // 첫 기동 관문(3c)의 판정 재료는 `sessions.db`의 부재 하나뿐이다(§2.1). 이 축이
    // 재는 것은 5단계이므로 관문을 지나가게 파일을 놓아 둔다 — 관문에 걸리면 이
    // 테스트는 답을 기다리며 멈춘다(2026-09-06 실측).
    writeFileSync(join(rig.home, CONFIG_RELATIVE[0], "sessions.db"), "", "utf8");

    const storeCalls: string[] = [];
    const storeStub = new Proxy(
      {},
      {
        get: (_target, property) => {
          const name = String(property);
          // `close`는 조립이 실패 정리로 부른다 — 세션 조작이 아니므로 세지 않는다.
          if (name === "close") return () => {};
          return () => {
            storeCalls.push(name);
            throw new Error(`[QA] store.${name}가 불렸다`);
          };
        },
      },
    );

    // 조립 3단계의 경계 생성은 실물이 필요하므로 금지 스텁을 걷는다. 나머지 금지는
    // 그대로 두어 「5단계보다 뒤가 실행되지 않았다」도 함께 잰다.
    const { createBoundary: _boundary, ...keptFactories } = rig.deps.factories ?? {};
    const deps: CliDeps = {
      ...rig.deps,
      factories: { ...keptFactories, openStore: () => storeStub as never },
    };

    await expect(wiringModule.startCli(deps, { kind: "doctor" })).rejects.toThrow();
    expect(storeCalls).toEqual([]);
    expect(rig.calls.forbidden).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 계약 8 — TTY 없이 돈다
// ═════════════════════════════════════════════════════════════════════════════

describe("계약 8 — TTY 면제 (§2.2 계약 4의 갈래 이름)", () => {
  it("파서가 doctor를 자기 갈래로 답한다", () => {
    const parsed: CliArgs = parseArgs(["doctor"]);
    expect(parsed).toEqual({ kind: "doctor" });
  });

  it("면제가 파싱 실패까지 넓어지지 않는다 — 남는 인자는 던진다", () => {
    expect(() => parseArgs(["doctor", "qa-extra"])).toThrow();
    expect(() => parseArgs(["qa-doctor"])).toThrow();
  });

  it("isTTY가 없는 입력으로도 끝까지 돈다", async () => {
    const rig = makeRig({ config: VALID_CONFIG, env: { [MODEL_KEY_ENV]: "qa" } });
    expect(rig.deps.io.input.isTTY).toBeUndefined();
    await expect(runCli(rig.deps)).resolves.toBeTypeOf("number");
  });

  it("[미규정 QA-1] neo-agent doctor --help의 갈래를 정본이 정하지 않았다", () => {
    // §5는 --help를 독립 갈래로 두고 §5.1 계약 7은 doctor <남는 인자>를 EXIT_USAGE로
    // 둔다. `doctor --help`가 어느 쪽인지는 어느 절도 정하지 않는다. 임의 판정하지
    // 않고 면제가 서지 않는다는 것만 잰다 — 파싱이 던지든 help 갈래로 답하든 §2.2
    // 계약 4에서 결과가 같은 자리다. 판정 필요.
    let branch: string;
    try {
      branch = parseArgs(["doctor", "--help"]).kind;
    } catch {
      branch = "throws";
    }
    expect(["throws", "help"]).toContain(branch);
    expect(branch).not.toBe("doctor");
  });
});
