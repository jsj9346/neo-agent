/**
 * `neo-agent doctor` — 축 독립(계약 4)과 cause 소유(계약 6)의 **독립 QA**.
 *
 * 기대값의 출처는 `neo-agent-main/docs/CLI-INTERFACE.md` §5.1 하나이고, 함께 걸리는 것은
 * 같은 문서 §1(`CliDeps`·`WiringFactories`)·§7(표시 문구의 지위) · `docs/SANDBOX.md` §3 ·
 * `docs/ARCHITECTURE.md` §2.6이다. **구현 코드에서 기대값을 읽지 않았다** — 축 여섯과
 * 검사기 배정은 계약 2의 표가, 판정 세 값과 skipped 사례 넷은 계약 3이, 축 독립은 계약 4가,
 * cause의 소유와 유일한 예외는 계약 6이 정본이다.
 *
 * **이 파일이 재는 것은 기존 스위트(`doctor.contract.test.ts`)가 안 재는 두 물음이다.**
 *   물음 A — 계약 4의 축 독립이 여섯 축 **전부**에 서는가. 기존 스위트의 계약 4 블록은
 *            결손을 **반환값·파일 부재**로 심는다(불가용 프로브·키 없음). 여기서는 축마다
 *            검사기·프로브가 **던지게** 만들고 나머지 다섯의 판정이 그대로 나는지 본다.
 *   물음 B — 계약 6의 유일한 예외가 실제로 하나인가. 기존 스위트의 동일성 단언은 프로브
 *            둘(반환값 갈래)에만 서 있다. 여기서는 여섯 축 전부에 대해 **테스트가 검사기를
 *            직접 불러 얻은 문면**과 doctor의 cause를 대조하고, 실리지 않는 축을 센다.
 *
 * **기대 문면을 리터럴로 적지 않는다**(§7 — 표시 문구는 세부다). 대조의 오른편은 전부
 * ① 이 테스트가 프로브에 주입한 값이거나 ② 이 테스트가 검사기를 직접 불러 받은 값이다.
 * 축 라벨·안내 문구는 이 파일이 한 번도 단언하지 않는다.
 *
 * **프로브 둘을 전 시나리오에서 주입한다**(`SANDBOX.md` §3의 진입점 표 — `runDoctor` 행).
 * 주입을 빠뜨리면 이 스위트가 이 머신의 docker 설치·데몬·이미지 캐시에 좌우되고 그 실패는
 * **통과로 나타난다**(`ARCHITECTURE.md` §2.6 — 침묵 실패). 다른 작성자의 하네스를 들이지
 * 않고 자체 스텁만 쓴다 — 독립 검증이 남의 하네스의 가정을 물려받으면 독립이 아니다.
 *
 * **명시 상한을 새로 걸지 않았다.** 프로브 스텁은 즉시 값을 돌려주거나 즉시 던진다.
 *
 * **인용 계약** — 이 파일은 정본 문면을 인용부호로 옮기지 않는다. 지목은 문서 이름 + 절
 * 번호 + 계약 번호로만 한다(`DOC-CITATION.md` §6 U-b의 대조 축이 걸릴 자리를 만들지
 * 않는다).
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { loadMemory } from "@neo-agent/memory";
import type { DockerAvailability, SandboxImageAvailability } from "@neo-agent/sandbox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfigPath, readConfigRecord, validateConfigRecord } from "../src/config.ts";
import { defaultCredentialsPath, loadCredentials } from "../src/credentials.ts";
import {
  type DoctorAxis,
  type DoctorReport,
  type DoctorVerdict,
  runDoctor,
} from "../src/doctor.ts";
import { defaultMemoryDir } from "../src/memory.ts";
import type { TerminalIo } from "../src/terminal.ts";
import type { CliDeps, WiringFactories } from "../src/wiring.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 정본에서 옮긴 기대값 — 이 아래로 구현에서 읽은 상수가 없다
// ─────────────────────────────────────────────────────────────────────────────

/** §5.1 계약 2의 축 표 여섯 행 (순서도 그 표의 행 순서다) */
const AXES_FROM_DOC = [
  "config",
  "model-credentials",
  "search-credentials",
  "memory",
  "docker",
  "sandbox-image",
] as const;

/** §5.1 계약 2 축 표의 두 키 이름 */
const MODEL_KEY_ENV = "ANTHROPIC_API_KEY";
const SEARCH_KEY_ENV = "TAVILY_API_KEY";

/** §3의 설정 파일 · §4의 크리덴셜 · `MEMORY.md` §2.1의 메모리 디렉터리 */
const HOME_DIR_NAME = ".neo-agent";

/**
 * §5.1 계약 6이 이름으로 든 유일한 예외. 이 축의 검사기(`loadCredentials`)는 그 축에
 * 대해 아무 문면도 내지 않는다 — 배정된 것이 반환값의 부재이기 때문이다.
 */
const DOCUMENTED_CAUSE_EXCEPTION: readonly DoctorAxis[] = ["search-credentials"];

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

interface ProbeCalls {
  docker: number;
  image: string[];
}

interface Fixture {
  /** `config.json`의 내용. 없으면 파일을 만들지 않는다 */
  configText?: string;
  credentialsFile?: { text: string; mode: number };
  memoryFile?: { text: string; mode: number };
  /**
   * 메모리 파일 자리(`<memoryDir>/MEMORY.md`)를 **디렉터리**로 만들고 노출 비트를 `mode`로
   * **명시로** 건다. `memoryFile`과 배타적으로 쓴다 — 기존 필드의 의미는 안 바뀐다.
   *
   * 이 필드가 여는 것은 **uid에도 umask에도 걸리지 않는** 「경고 + 던짐」 갈래다.
   *   - 던짐: 그 자리를 읽으면 디렉터리이므로 실패한다. 이 실패는 소유자·권한과 무관해
   *     root에서도 난다 — `0o044`로 만드는 읽기 거부는 root가 통과해 버린다.
   *   - 경고: `mkdirSync`의 mode는 **umask에 마스킹**되므로 만든 직후의 권한은 호스트마다
   *     다르다. 그대로 두면 노출 비트가 안 서는 호스트에서 경고가 아예 안 나고, 그러면
   *     아래 단언이 계약 위반이 아니라 **환경 때문에** 붉어진다. 그래서 `chmodSync`로
   *     다시 건다 — uid 의존을 umask 의존으로 바꾸면 얻은 것이 없다.
   */
  memoryFileAsDirectory?: { mode: number };
  /** 메모리 디렉터리를 심볼릭 링크로 만든다 — `loadMemory`가 uid와 무관하게 던진다 */
  memoryDirAsSymlink?: boolean;
  env?: NodeJS.ProcessEnv;
  docker?: DockerAvailability;
  /** 주입한 `probeDocker`가 이 오류를 던진다 */
  dockerThrows?: Error;
  image?: SandboxImageAvailability;
  /** 주입한 `probeSandboxImage`가 이 오류를 던진다 */
  imageThrows?: Error;
}

interface Rig {
  home: string;
  deps: CliDeps;
  calls: ProbeCalls;
  configPath: string;
  credentialsPath: string;
  memoryDir: string;
  env: NodeJS.ProcessEnv;
}

let temporaries: string[] = [];

function makeTemporary(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaries.push(path);
  return path;
}

/** 이 테스트만 쓰는 표식 — 주입한 값이 그대로 실렸는지를 재는 프로브다(§7의 허용 갈래) */
let markerSeed = 0;
function marker(what: string): string {
  markerSeed += 1;
  return `[QA-축독립-${what}-${markerSeed}]`;
}

function makeRig(fixture: Fixture = {}): Rig {
  const home = makeTemporary("neo-doctor-axis-home-");
  const cwd = makeTemporary("neo-doctor-axis-cwd-");
  const calls: ProbeCalls = { docker: 0, image: [] };

  if (fixture.configText !== undefined) {
    mkdirSync(join(home, HOME_DIR_NAME), { recursive: true });
    writeFileSync(join(home, HOME_DIR_NAME, "config.json"), fixture.configText, "utf8");
  }
  if (fixture.credentialsFile !== undefined) {
    mkdirSync(join(home, HOME_DIR_NAME), { recursive: true });
    const path = join(home, HOME_DIR_NAME, "credentials");
    writeFileSync(path, fixture.credentialsFile.text, "utf8");
    chmodSync(path, fixture.credentialsFile.mode);
  }
  if (fixture.memoryDirAsSymlink === true) {
    // 링크의 실체는 홈 밖에 둔다 — 링크 거부는 실체의 유무와 무관하게 선다.
    const target = makeTemporary("neo-doctor-axis-memtarget-");
    mkdirSync(join(home, HOME_DIR_NAME), { recursive: true });
    symlinkSync(target, join(home, HOME_DIR_NAME, "memory"));
  }
  if (fixture.memoryFile !== undefined) {
    const dir = join(home, HOME_DIR_NAME, "memory");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "MEMORY.md");
    writeFileSync(path, fixture.memoryFile.text, "utf8");
    chmodSync(path, fixture.memoryFile.mode);
  }
  if (fixture.memoryFileAsDirectory !== undefined) {
    const dir = join(home, HOME_DIR_NAME, "memory");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "MEMORY.md");
    mkdirSync(path);
    // 여기서 다시 거는 것이 이 픽스처의 요점이다 — 위 JSDoc의 「경고」 항목이 근거다.
    chmodSync(path, fixture.memoryFileAsDirectory.mode);
  }

  const input = new PassThrough();
  const io: TerminalIo = { input, output: new Capture() };

  const docker = fixture.docker;
  const image = fixture.image;

  const factories: Partial<WiringFactories> = {
    probeDocker: async (): Promise<DockerAvailability> => {
      calls.docker += 1;
      if (fixture.dockerThrows !== undefined) throw fixture.dockerThrows;
      if (docker === undefined) throw new Error("[QA] docker 스텁에 값을 안 줬다 — 시나리오 결함");
      return docker;
    },
    probeSandboxImage: async (options: { image: string }): Promise<SandboxImageAvailability> => {
      calls.image.push(options.image);
      if (fixture.imageThrows !== undefined) throw fixture.imageThrows;
      if (image === undefined) throw new Error("[QA] image 스텁에 값을 안 줬다 — 시나리오 결함");
      return image;
    },
  };

  const env = fixture.env ?? {};

  return {
    home,
    deps: {
      argv: ["doctor"],
      env,
      cwd,
      home,
      io,
      version: "0.0.0-qa",
      factories,
    },
    calls,
    configPath: defaultConfigPath(home),
    credentialsPath: defaultCredentialsPath(home),
    memoryDir: defaultMemoryDir(home),
    env,
  };
}

/** 축 표의 `sandboxImage` 계약(고정 태그)을 지키는 최소 설정. `sandbox: "on"`은 §3의 기본값 */
function healthyConfigText(image: string): string {
  return JSON.stringify({ sandbox: "on", sandboxImage: image });
}

/** 여섯 축이 전부 통과하는 홈 — 축 독립을 재는 대조군(양성 대조)이다 */
function healthyFixture(): Fixture & { dockerVersion: string; imageRef: string; imageId: string } {
  const dockerVersion = marker("docker판");
  // 이미지 참조는 §3의 고정 태그 계약을 지켜야 하므로 표식을 태그에 섞지 않는다 — 이
  // 축의 대조는 아래 `imageId`·`reason`이 진다.
  markerSeed += 1;
  const imageRef = `qa-registry/neo-sandbox:qa-${markerSeed}`;
  const imageId = marker("이미지id");
  return {
    configText: healthyConfigText(imageRef),
    env: { [MODEL_KEY_ENV]: "qa-model", [SEARCH_KEY_ENV]: "qa-search" },
    memoryFile: { text: "- qa 메모\n", mode: 0o600 },
    docker: { available: true, version: dockerVersion },
    image: { kind: "present", image: imageRef, imageId },
    dockerVersion,
    imageRef,
    imageId,
  };
}

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

/** 판정에 실린 사람 문면 — `ok`·`problem`·`skipped`가 각각 다른 필드에 든다(계약 3의 타입) */
function textOf(verdict: DoctorVerdict): string {
  if (verdict.status === "ok") return verdict.observed;
  if (verdict.status === "problem") return verdict.cause;
  return verdict.reason;
}

/** 검사기를 직접 불러 그것이 내는 문면을 받는다 — 대조의 오른편은 항상 이 값이다 */
function messageOfThrow(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("[QA] 검사기가 던질 줄 알았는데 던지지 않았다 — 시나리오 결함");
}

beforeEach(() => {
  temporaries = [];
});

afterEach(() => {
  for (const path of temporaries) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // 링크·권한 픽스처는 정리에 실패할 수 있다 — 임시 디렉터리이므로 삼킨다.
    }
  }
  temporaries = [];
});

// ═════════════════════════════════════════════════════════════════════════════
// 양성 대조군 — 이것이 초록이 아니면 아래 전부가 아무것도 재지 않는다
// ═════════════════════════════════════════════════════════════════════════════

describe("대조군 — 결손 없는 홈에서 여섯 축이 전부 ok다", () => {
  it("건강한 홈의 판정이 전부 ok이고 프로브 둘이 각각 한 번 불린다", async () => {
    const fixture = healthyFixture();
    const rig = makeRig(fixture);
    const report = await runDoctor(rig.deps);

    expect(statusesOf(report)).toEqual({
      config: "ok",
      "model-credentials": "ok",
      "search-credentials": "ok",
      memory: "ok",
      docker: "ok",
      "sandbox-image": "ok",
    });
    expect(rig.calls.docker).toBe(1);
    expect(rig.calls.image).toEqual([fixture.imageRef]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 물음 A — 계약 4: 한 축의 던짐이 나머지 다섯을 멈추지 않는다 (여섯 축 각각)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 던짐을 유도하는 자리가 축마다 갈린다. 프로브 둘은 `WiringFactories`로 주입하고(§1),
 * 나머지 넷은 파일 상태로 몬다 — 계약 2가 그 축들에 배정한 검사기가 주입점을 갖지 않기
 * 때문이고, 그 사실 자체를 리포트가 「수단」 열로 든다.
 */
interface ThrowScenario {
  readonly axis: DoctorAxis;
  readonly how: string;
  readonly fixture: () => Fixture;
  /** 계약 3이 이 축의 실패에 걸어 둔 의존 축 — 이들만 `skipped`로 갈린다 */
  readonly dependents: readonly DoctorAxis[];
  /** 이 시나리오에서 프로브가 불릴 수 있는가 (계약 3 둘째 사례가 막으면 false) */
  readonly probesReachable: boolean;
}

function throwScenarios(): readonly ThrowScenario[] {
  return [
    {
      axis: "config",
      how: "config.json이 JSON이 아니다 — readConfigRecord가 던진다",
      fixture: () => ({ ...healthyFixture(), configText: "{ 이건 JSON이 아니다" }),
      dependents: ["docker", "sandbox-image"],
      probesReachable: false,
    },
    {
      axis: "model-credentials",
      how: "모델 열쇠가 env에도 파일에도 없다 — loadCredentials가 던진다",
      fixture: () => ({ ...healthyFixture(), env: {} }),
      dependents: ["search-credentials"],
      probesReachable: true,
    },
    {
      axis: "memory",
      how: "메모리 디렉터리가 심볼릭 링크다 — loadMemory가 던진다",
      fixture: () => {
        const base = healthyFixture();
        // 링크 거부는 파일보다 먼저 걸리므로 메모리 파일 픽스처는 빼고 링크만 남긴다.
        const { memoryFile: _memoryFile, ...rest } = base;
        return { ...rest, memoryDirAsSymlink: true };
      },
      dependents: [],
      probesReachable: true,
    },
    {
      axis: "docker",
      how: "주입한 probeDocker가 던진다",
      fixture: () => ({ ...healthyFixture(), dockerThrows: new Error(marker("도커던짐")) }),
      dependents: [],
      probesReachable: true,
    },
    {
      axis: "sandbox-image",
      how: "주입한 probeSandboxImage가 던진다",
      fixture: () => ({ ...healthyFixture(), imageThrows: new Error(marker("이미지던짐")) }),
      dependents: [],
      probesReachable: true,
    },
    {
      axis: "search-credentials",
      how: "[수단 부재] 이 축의 검사기는 이 축에 대해 던지지 않는다 — 계약 2가 배정한 것이 반환값이다",
      fixture: () => ({ ...healthyFixture(), env: { [MODEL_KEY_ENV]: "qa-model" } }),
      dependents: [],
      probesReachable: true,
    },
  ];
}

describe("계약 4 — 축 하나가 던져도 나머지 다섯의 판정이 그대로 난다", () => {
  for (const scenario of throwScenarios()) {
    it(`${scenario.axis} — ${scenario.how}`, async () => {
      const rig = makeRig(scenario.fixture());

      // ① 던짐이 밖으로 새지 않는다 — 새면 축 하나의 사고가 여섯 전부를 삼킨다.
      const report = await runDoctor(rig.deps);

      // ② 축 여섯이 전부 판정을 갖는다 (완전 레코드 — 계약 2).
      expect(report.findings.map((finding) => finding.axis)).toEqual([...AXES_FROM_DOC]);

      // ③ 판정마다 사람이 읽을 문면이 비어 있지 않다 — 빈 판정은 화면에서 「괜찮다」로
      //    읽히고 그것이 `ARCHITECTURE.md` §2.6이 최상위로 든 방향이다.
      for (const finding of report.findings) {
        expect(textOf(finding.verdict).trim()).not.toBe("");
      }

      // ④ 실패한 축과 계약 3이 든 그 축의 의존 축을 **뺀** 나머지는 대조군과 같은 판정이다.
      //    이것이 「멈추지 않는다」의 기계적 형태다 — 존재만 보면 전부 skipped로 접어도
      //    통과하므로, 다른 축이 자기 입력대로 판정됐는지까지 본다.
      const affected = new Set<string>([scenario.axis, ...scenario.dependents]);
      for (const axis of AXES_FROM_DOC) {
        if (affected.has(axis)) continue;
        expect({ axis, status: verdictOf(report, axis).status }).toEqual({ axis, status: "ok" });
      }

      // ⑤ 의존 축은 계약 3대로 `skipped`다 — 실패로 번지지 않는다.
      for (const axis of scenario.dependents) {
        expect({ axis, status: verdictOf(report, axis).status }).toEqual({
          axis,
          status: "skipped",
        });
      }

      // ⑥ 프로브가 닿는 시나리오에서는 실제로 불렸다 — 「다른 축이 돌았다」의 직접 증거다.
      //    설정 축이 무너진 시나리오는 계약 3 둘째 사례가 두 축을 모집단 밖으로 내므로 0이다.
      expect(rig.calls.docker).toBe(scenario.probesReachable ? 1 : 0);
      expect(rig.calls.image.length).toBe(scenario.probesReachable ? 1 : 0);
    });
  }

  it("던진 축의 판정이 ok가 아니다 — 못 잰 것이 「괜찮다」로 접히지 않는다", async () => {
    // 계약 4는 나머지가 멈추지 않을 것만 요구하지만, 던진 축 자신이 ok로 접히면 그것은
    // `ARCHITECTURE.md` §2.6이 이름 붙인 침묵 실패다. 계약 2·3이 그 축에 어느 값을 주는지는
    // 아래 [미규정 QA-B1]이 따로 든다 — 여기서는 ok가 아님만 잰다.
    for (const scenario of throwScenarios()) {
      if (scenario.axis === "search-credentials") continue; // 수단 부재 — 던질 수 없다
      const rig = makeRig(scenario.fixture());
      const verdict = verdictOf(await runDoctor(rig.deps), scenario.axis);
      expect({ axis: scenario.axis, status: verdict.status }).not.toEqual({
        axis: scenario.axis,
        status: "ok",
      });
    }
  });

  it("여섯 자리가 한꺼번에 무너져도 축 여섯이 전부 판정을 갖는다", async () => {
    const rig = makeRig({
      configText: "{ 동시에 무너뜨린다",
      env: {},
      memoryDirAsSymlink: true,
      dockerThrows: new Error(marker("동시-도커")),
      imageThrows: new Error(marker("동시-이미지")),
    });
    const report = await runDoctor(rig.deps);
    expect(report.findings.map((finding) => finding.axis)).toEqual([...AXES_FROM_DOC]);
    for (const finding of report.findings) {
      expect(textOf(finding.verdict).trim()).not.toBe("");
    }
    // 계약 3: 설정이 무너지면 프로브 둘은 모집단 밖이다. 그래서 이 홈의 problem은
    // 설정·모델 열쇠·메모리 셋이고, 나머지 셋은 skipped다.
    expect(statusesOf(report)).toEqual({
      config: "problem",
      "model-credentials": "problem",
      "search-credentials": "skipped",
      memory: "problem",
      docker: "skipped",
      "sandbox-image": "skipped",
    });
    expect(report.problemCount).toBe(3);
  });

  it("[문서 부정확 QA-A1] sandbox: off의 skipped는 다른 축의 실패에 걸린 것이 아니다", async () => {
    // 계약 3은 네 사례를 소개하며 앞의 셋을 「다른 축의 실패에 걸린 의존」으로 묶고, 계약
    // 4는 그 넷을 축 독립의 예외로 든다. 그런데 첫째 사례(sandbox: off)에서는 **어떤 축도
    // 실패하지 않는다** — 설정 축은 ok이고 skipped의 근거는 설정의 값이다. 축 독립의
    // 예외로 셀 자리도 아니다. 아래가 그 사실의 실측이다.
    const base = healthyFixture();
    const rig = makeRig({
      ...base,
      configText: JSON.stringify({ sandbox: "off", sandboxImage: base.imageRef }),
    });
    const report = await runDoctor(rig.deps);
    expect(statusesOf(report)).toEqual({
      config: "ok",
      "model-credentials": "ok",
      "search-credentials": "ok",
      memory: "ok",
      docker: "skipped",
      "sandbox-image": "skipped",
    });
    expect(report.problemCount).toBe(0);
  });

  it("[미규정 QA-B1] 프로브가 던졌을 때의 판정값을 §5.1이 정하지 않았다", async () => {
    // 계약 2는 docker의 problem 조건을 `available: false`로, sandbox-image의 그것을
    // 「데몬이 답했고 이미지가 없다」로 연다. 계약 3 넷째 사례는 skipped를 「프로브가
    // 판정하지 못했다고 **답한** 경우」로 연다. **프로브가 던진 갈래는 셋 중 어디에도
    // 문면이 없다** — 계약 4가 요구하는 것은 나머지 축이 멈추지 않는 것뿐이므로 위 축들이
    // 그것을 재고, 이 축은 오늘의 값을 기록만 한다. 판정 필요.
    const dockerRig = makeRig({ ...healthyFixture(), dockerThrows: new Error(marker("판정없음")) });
    const imageRig = makeRig({ ...healthyFixture(), imageThrows: new Error(marker("판정없음")) });
    const dockerVerdict = verdictOf(await runDoctor(dockerRig.deps), "docker");
    const imageVerdict = verdictOf(await runDoctor(imageRig.deps), "sandbox-image");
    // 같은 성질의 사고(프로브가 던졌다)가 두 축에서 서로 다른 값으로 나타난다는 사실을
    // 고정해 둔다 — 계약이 정한 것이 아니라 오늘의 관측이다.
    expect([dockerVerdict.status, imageVerdict.status]).toEqual(["problem", "skipped"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 물음 B — 계약 6: cause는 검사기가 낸 문면 그대로이고, 예외는 하나다
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 축마다 ① problem을 유도하고 ② **테스트가 검사기를 직접 불러** 그 축의 문면을 받아
 * ③ doctor의 cause와 대조한다. 오른편이 리터럴이 아니라 검사기의 실제 산출이므로 §7의
 * 표시 문구 고정에 해당하지 않는다.
 *
 * `checkerText`가 `undefined`인 축이 「검사기가 그 축에 대해 아무 문면도 내지 않는」 축이고,
 * 계약 6은 그런 축이 `search-credentials` 하나라고 이름으로 든다.
 */
interface CauseProbe {
  readonly axis: DoctorAxis;
  readonly how: string;
  readonly fixture: () => Fixture;
  /** 검사기를 직접 불러 받은 문면. 검사기가 아무 문면도 안 내면 `undefined` */
  readonly checkerText: (rig: Rig) => string | undefined;
}

function causeProbes(): readonly CauseProbe[] {
  const brokenConfig = "{ 이것도 JSON이 아니다";
  return [
    {
      axis: "config",
      how: "readConfigRecord가 던진 문면",
      fixture: () => ({ ...healthyFixture(), configText: brokenConfig }),
      checkerText: (rig) => messageOfThrow(() => readConfigRecord(rig.configPath)),
    },
    {
      axis: "config",
      how: "validateConfigRecord가 던진 문면 (미지 키)",
      fixture: () => {
        const base = healthyFixture();
        const parsed = JSON.parse(base.configText ?? "{}") as Record<string, unknown>;
        parsed[`qaUnknown${markerSeed}`] = 1;
        return { ...base, configText: JSON.stringify(parsed) };
      },
      checkerText: (rig) =>
        messageOfThrow(() =>
          validateConfigRecord(readConfigRecord(rig.configPath) ?? {}, rig.configPath),
        ),
    },
    {
      axis: "model-credentials",
      how: "loadCredentials가 던진 문면 (키 부재)",
      fixture: () => ({ ...healthyFixture(), env: {} }),
      checkerText: (rig) => messageOfThrow(() => loadCredentials(rig.env, rig.credentialsPath)),
    },
    {
      axis: "model-credentials",
      how: "loadCredentials가 던진 문면 (파일 권한 노출)",
      fixture: () => ({
        ...healthyFixture(),
        credentialsFile: { text: `${MODEL_KEY_ENV}=qa\n`, mode: 0o644 },
      }),
      checkerText: (rig) => messageOfThrow(() => loadCredentials(rig.env, rig.credentialsPath)),
    },
    {
      axis: "memory",
      how: "loadMemory가 던진 문면 (심볼릭 링크 거부)",
      fixture: () => {
        const { memoryFile: _memoryFile, ...rest } = healthyFixture();
        return { ...rest, memoryDirAsSymlink: true };
      },
      checkerText: (rig) => messageOfThrow(() => loadMemory({ dir: rig.memoryDir })),
    },
    {
      axis: "docker",
      how: "프로브가 반환값으로 낸 문면 (불가용)",
      fixture: () => ({
        ...healthyFixture(),
        docker: { available: false, reason: marker("도커사유") },
      }),
      checkerText: (rig) => reasonInjectedFor(rig, "docker"),
    },
    {
      axis: "docker",
      how: "프로브가 던진 문면",
      fixture: () => ({ ...healthyFixture(), dockerThrows: new Error(marker("도커던짐사유")) }),
      checkerText: (rig) => reasonInjectedFor(rig, "docker"),
    },
    {
      axis: "sandbox-image",
      how: "프로브가 반환값으로 낸 문면 (이미지 없음)",
      fixture: () => {
        const base = healthyFixture();
        return {
          ...base,
          image: { kind: "absent", image: base.imageRef, reason: marker("이미지사유") },
        };
      },
      checkerText: (rig) => reasonInjectedFor(rig, "sandbox-image"),
    },
    {
      axis: "search-credentials",
      how: "검사기가 이 축에 대해 아무 문면도 내지 않는다 (계약 6의 이름 든 예외)",
      fixture: () => ({ ...healthyFixture(), env: { [MODEL_KEY_ENV]: "qa-model" } }),
      checkerText: (rig) => {
        // 검사기를 직접 불러 확인한다: 검색 열쇠가 없어도 **던지지 않고**, 반환값에
        // 그 키가 없을 뿐이다. 그래서 이 축에는 옮겨 실을 검사기 문면이 애초에 없다.
        const loaded = loadCredentials(rig.env, rig.credentialsPath);
        expect(loaded.searchApiKey).toBeUndefined();
        return undefined;
      },
    },
  ];
}

/**
 * 프로브 축의 「검사기가 낸 문면」은 이 테스트가 스텁에 주입한 값 자체다. 픽스처를 다시
 * 만들지 않고 rig에 실린 스텁을 실제로 불러 받는다 — 던지는 스텁이면 그 문면을 받는다.
 */
function reasonInjectedFor(rig: Rig, axis: "docker" | "sandbox-image"): string {
  const injected = INJECTED_REASONS.get(rig);
  const text = injected?.[axis];
  if (text === undefined) throw new Error(`[QA] ${axis}에 주입한 문면을 못 찾았다 — 하네스 결함`);
  return text;
}

/** rig별로 이 테스트가 프로브에 주입한 문면 — 대조의 오른편이 된다 */
const INJECTED_REASONS = new WeakMap<Rig, { docker?: string; "sandbox-image"?: string }>();

function makeRigTracked(fixture: Fixture): Rig {
  const rig = makeRig(fixture);
  const injected: { docker?: string; "sandbox-image"?: string } = {};
  if (fixture.dockerThrows !== undefined) injected.docker = fixture.dockerThrows.message;
  else if (fixture.docker !== undefined && fixture.docker.available === false)
    injected.docker = fixture.docker.reason;
  if (fixture.imageThrows !== undefined) injected["sandbox-image"] = fixture.imageThrows.message;
  else if (fixture.image !== undefined && fixture.image.kind !== "present")
    injected["sandbox-image"] = fixture.image.reason;
  INJECTED_REASONS.set(rig, injected);
  return rig;
}

describe("계약 6 — cause가 검사기의 문면을 그대로 든다", () => {
  for (const probe of causeProbes()) {
    it(`${probe.axis} — ${probe.how}`, async () => {
      const rig = makeRigTracked(probe.fixture());
      const expected = probe.checkerText(rig);
      const verdict = verdictOf(await runDoctor(rig.deps), probe.axis);

      expect({ axis: probe.axis, status: verdict.status }).toEqual({
        axis: probe.axis,
        status: "problem",
      });
      if (verdict.status !== "problem") return;

      if (expected === undefined) {
        // 계약 6의 예외 — 원인이 검사기에 없으므로 doctor가 관측 사실로 채운다.
        // 비어 있으면 문제 축이 원인 없이 화면에 서므로 그것만 잰다.
        expect(verdict.cause.trim()).not.toBe("");
        return;
      }
      expect(verdict.cause).toBe(expected);
    });
  }

  it("memory 축의 권한 경고도 doctor가 고쳐 쓰지 않는다", async () => {
    // 계약 2가 이 축의 problem 조건에 「권한 경고가 나온다」를 함께 열었고, 그 갈래에서
    // 검사기가 낸 문면은 `onWarning`으로 나온 경고다. 여러 줄을 잇는 것은 doctor의 자유이되
    // (형식은 §7의 세부다) 문면을 보태거나 줄이는 것은 계약 6 위반이다.
    const { memoryFile: _memoryFile, ...rest } = healthyFixture();
    const rig = makeRig({ ...rest, memoryFile: { text: "- qa 메모\n", mode: 0o644 } });

    const warnings: string[] = [];
    loadMemory({ dir: rig.memoryDir, onWarning: (message) => warnings.push(message) });
    expect(warnings.length).toBeGreaterThan(0);

    const verdict = verdictOf(await runDoctor(rig.deps), "memory");
    expect(verdict.status).toBe("problem");
    if (verdict.status !== "problem") return;

    for (const warning of warnings) expect(verdict.cause).toContain(warning);
    // 이은 자리의 공백 말고는 보탠 것이 없다 — 안내 문장을 덧붙이면 여기서 갈린다.
    const squeeze = (text: string): string => text.replace(/\s+/g, "");
    expect(squeeze(verdict.cause)).toBe(squeeze(warnings.join("")));
  });

  it("계약 6의 예외가 정확히 하나다 — 검사기 문면이 없는 축을 전수로 센다", async () => {
    // 물음 B의 답이 이 한 줄이다. 축마다 problem을 유도하고, 검사기를 직접 불러 얻은
    // 문면이 cause에 그대로 실렸는지 본다. 실리지 않는 축의 목록이 계약 6이 이름으로 든
    // 예외 목록과 같아야 한다.
    const missing: DoctorAxis[] = [];
    const mismatched: { axis: DoctorAxis; how: string }[] = [];

    for (const probe of causeProbes()) {
      const rig = makeRigTracked(probe.fixture());
      const expected = probe.checkerText(rig);
      const verdict = verdictOf(await runDoctor(rig.deps), probe.axis);
      if (verdict.status !== "problem") {
        mismatched.push({ axis: probe.axis, how: `${probe.how} — problem이 아니다` });
        continue;
      }
      if (expected === undefined) {
        if (!missing.includes(probe.axis)) missing.push(probe.axis);
        continue;
      }
      if (!verdict.cause.includes(expected)) mismatched.push({ axis: probe.axis, how: probe.how });
    }

    expect(mismatched).toEqual([]);
    expect(missing).toEqual([...DOCUMENTED_CAUSE_EXCEPTION]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 계약 4 — 경고와 던짐이 함께 난 memory 축. 재는 `it`이 **둘이고 몫이 다르다**
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 아래 두 `it`이 공유하는 본문. **둘은 중복이 아니라 분업이다** — 각 `it`의 첫 주석이
   * 자기 몫을 든다. 하나를 지우면 잃는 것이 있으므로 합치지 않는다.
   *
   * 여기서 재는 것은 전부 `CLI-INTERFACE.md` §5.1 계약 4·계약 6에서만 도출했고 구현을
   * 읽지 않았다. `MEMORY.md` §2.2가 권한 갈래와 못 읽는 갈래를 **따로 있는 두 행**으로
   * 규정한 것이 계약 4가 이 자리에 서는 근거다.
   *
   *   ① 그 실행에서 검사기가 낸 문면이 **둘 다** cause에 실린다 (계약 4).
   *   ② 순서는 경고가 앞, 던짐이 뒤다 — 계약 4가 실물의 형태를 그 순서로 든다.
   *   ③ 잇는 공백 말고는 보탠 것도 뺀 것도 없다 (계약 6 — doctor가 다시 쓰지 않는다).
   *
   * 대조의 오른편은 전부 **이 테스트가 검사기를 직접 불러 받은 값**이다 — §7의 표시 문구
   * 고정에 해당하지 않는다.
   */
  async function expectMemoryCauseCarriesBothChannels(rig: Rig): Promise<void> {
    const warnings: string[] = [];
    const thrown = messageOfThrow(() =>
      loadMemory({ dir: rig.memoryDir, onWarning: (message) => warnings.push(message) }),
    );
    // 픽스처 자기검사 — 아래가 붉을 때 「경고가 애초에 안 났다」(픽스처 결함)와 계약
    // 위반을 가른다. 이 줄이 붉으면 그것은 doctor의 문제가 아니라 이 하네스의 문제다.
    expect({ 검사기가_낸_경고: warnings.length > 0 }).toEqual({ 검사기가_낸_경고: true });

    const verdict = verdictOf(await runDoctor(rig.deps), "memory");
    expect(verdict.status).toBe("problem");
    if (verdict.status !== "problem") return;

    // ① 두 채널의 문면이 둘 다 실린다.
    for (const warning of warnings) expect(verdict.cause).toContain(warning);
    expect(verdict.cause).toContain(thrown);

    // ② 경고가 던짐보다 앞이다.
    const first = warnings[0] ?? "";
    expect(verdict.cause.indexOf(first)).toBeLessThan(verdict.cause.indexOf(thrown));

    // ③ 잇기만 했다 — 형식(줄바꿈·들여쓰기)은 §7의 세부이므로 공백을 지우고 대조한다.
    const squeeze = (text: string): string => text.replace(/\s+/g, "");
    expect(squeeze(verdict.cause)).toBe(squeeze([...warnings, thrown].join("")));
  }

  it("[계약 가드 · 조건 없이 돈다] memory 축의 cause가 경고와 던짐을 함께 든다 (§5.1 계약 4)", async () => {
    // **이 `it`의 몫은 계약을 재는 것이다.** 그래서 `skipIf`를 달지 않는다 — 어느 호스트에서나
    // 돈다. 아래 정경 증인과 재는 계약은 같고 **만드는 상황이 다르다**: 이쪽은 uid·umask·
    // 소유자 어디에도 걸리지 않는 자리를 골라 두 채널을 함께 낸다(`memoryFileAsDirectory`의
    // JSDoc이 근거를 든다).
    //
    // 그전까지 이 갈래는 root에서 건너뛰어졌다. 계약을 재는 단언이 조건에 걸려 있으면
    // root로 도는 자동 점검에서 **재지 않은 채 초록**이 되고, 그 방향이 `ARCHITECTURE.md`
    // §2.6이 최상위로 든 것이다.
    //
    // **아래 정경 증인과 중복이 아니다.** 여기를 지우면 계약의 관측이 호스트에 좌우되고,
    // 아래를 지우면 `MEMORY.md` §2.2가 이름으로 든 권한 갈래의 관측이 0이 된다.
    const { memoryFile: _memoryFile, ...rest } = healthyFixture();
    // 600이 아닌 권한이 경고 갈래를 연다(`MEMORY.md` §2.2 4행). 노출 비트를 명시로 건다.
    const rig = makeRig({ ...rest, memoryFileAsDirectory: { mode: 0o755 } });
    await expectMemoryCauseCarriesBothChannels(rig);
  });

  it.skipIf(process.getuid?.() === 0)(
    "[정경 증인 · root에서는 만들 수 없다] 권한으로 못 읽는 memory 파일에서도 같은 계약이 선다 (§5.1 계약 4)",
    async () => {
      // **이 `it`의 몫은 계약이 이름으로 든 상황을 실제로 만드는 것이다.** `MEMORY.md` §2.2의
      // 두 행이 함께 성립하는 호스트가 실재한다는 것이 계약 4가 서는 근거이고, 0o044가
      // 정확히 그 형태다 — 권한이 노출됐고 소유자가 못 읽는다. 위 가드의 디렉터리 자리는
      // 그 형태가 **아니다**(권한으로 막힌 것이 아니다).
      //
      // **`skipIf`를 유지한다.** root는 읽기 권한을 지워도 읽으므로 이 상황을 만들 수 없고,
      // 조건을 떼면 아무것도 안 재면서 초록이 된다. 계약을 재는 몫은 위 가드가 이미 졌으므로
      // 이 조건이 계약의 관측을 호스트에 매지 않는다 — **그래서 이 조건은 위 가드가 있는
      // 동안만 정당하다.** 위를 지우면 이 파일에서 계약 4가 root CI에서 사라진다.
      const { memoryFile: _memoryFile, ...rest } = healthyFixture();
      const rig = makeRig({ ...rest, memoryFile: { text: "- qa 메모\n", mode: 0o044 } });
      await expectMemoryCauseCarriesBothChannels(rig);
    },
  );

  it("[미규정 QA-B2] skipped의 reason에는 계약 6이 걸리지 않는다", async () => {
    // 프로브가 던지면 sandbox-image는 skipped가 되고(위 QA-B1), 그 자리의 이유는 계약 3의
    // 「skipped는 이유를 반드시 낸다」가 요구하는 값이다. 그 이유도 검사기 문면 그대로여야
    // 하는지는 §5.1이 정하지 않는다 — 계약 6은 `cause`만 든다. 오늘의 값을 기록한다.
    const thrown = new Error(marker("이미지던짐이유"));
    const rig = makeRig({ ...healthyFixture(), imageThrows: thrown });
    const verdict = verdictOf(await runDoctor(rig.deps), "sandbox-image");
    expect(verdict.status).toBe("skipped");
    if (verdict.status !== "skipped") return;
    expect(verdict.reason).toContain(thrown.message);
  });
});
