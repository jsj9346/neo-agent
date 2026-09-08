/**
 * `0a` 선행 검증의 **독립 QA 축** — `docs/CLI-INTERFACE.md` §2.3(「`0a` 선행 검증」 표 ·
 * 「계약 표면」 · 「이미 있는 값은 묻지 않는다」) · §2 말미(시작 실패 갈래) · §4.
 *
 * **이 파일은 기존 QA 축이 재지 못하는 것만 잰다.** 2026-09-08 독립 검증에서
 * `test/onboarding-startup.qa.test.ts`의 `0a` 축 넷에 구현 변이를 걸어 판별력을 실측했고
 * (노출 비트 · 읽기 실패 · dotenv 형식 · config 파싱 — 넷 다 red가 났고, `0a` 블록을
 * 관문 뒤로 옮기는 변이에도 넷 다 red가 났다), **red가 나지 않은 자리**가 아래 축들이다.
 * 재현·근거·등급은 `plans/20260908-s4f-qa-report.md`가 든다.
 *
 * ── 이 파일이 더하는 축 ──────────────────────────────────────────────────
 *
 *   P-1  `0a` 표 `credentials` 행의 **첫째** 겹 — 「권한 확인 가능성」. 기존 축 없음.
 *        (`stat`이 ENOENT 아닌 이유로 실패하는 갈래. 자기참조 심링크로 ELOOP를 만든다)
 *   P-2  `0a` 표 `config.json` 행의 **둘째** 겹 — 「레코드 검증」. 기존 축 없음.
 *        (`onboarding-startup.qa.test.ts`는 파싱 실패만 잰다 — 검증 호출을 죽이는 변이가
 *         그 파일에서 red를 내지 않았다)
 *   P-3  실패 문면이 **그 파일의 경로**를 든다(§2 말미 *"원인과 다음 행동을 담은 에러"*).
 *        기존 축의 「원인이 화면에 있다」는 `raw.trim() !== ""`이라 원인 없는 한 줄도 통과한다
 *        (실측: config 파싱 에러 문면을 *"설정을 불러오지 못했습니다."*로 바꿔도 전부 green).
 *   P-4  `0a` 모집단의 **상한** — 메모리가 깨져도 관문은 선다(§2.3: *"3b(메모리)는 이
 *        모집단 밖이다"*). 모집단이 넓어지면 붉어진다.
 *   P-5  「값이 있으면 출처도 있다」의 **런타임 성질** — 프로브가 네 조합에서 값과 출처를
 *        함께 싣거나 함께 뺀다(§2.3 계약 표면 `FoundSecret`).
 *   P-6  같은 계약의 **타입 폐쇄** — `FoundSecret`의 키가 둘로 닫혀 있다. 짝을 나란한
 *        옵셔널로 되돌리면 여기가 깨진다(형태는 같은 파일의 `RunOnboardingOptions` 폐쇄).
 *   P-7  완주가 **안 받은 값을 파일에 쓰지 않는다** — env의 시크릿이 `credentials`로
 *        복사되지 않고, 이미 있던 줄·주석은 그대로 남는다(§2.3 계약 표면 · 얹기 규율).
 *        엔진 층 축은 있으나 실 프로세스 층에는 없었다.
 *   D-1  **[문서 부정확 후보]** `config.json` 행이 「읽기 가능성」을 안 드는데 구현은
 *        읽기 실패로도 죽는다 — `credentials` 행이 2026-09-08(`K-583`)에 정정된 것과
 *        같은 형태다. 이 축은 구현의 오늘을 고정하고 판정은 리포트가 「판정 필요」로 올린다.
 *
 * **네트워크에 나가지 않는다** — 값을 제출하기 전에 죽거나(P-1~P-4·D-1), 키가 env·파일에서
 * 온 갈래다(P-7. §2.3: *"모델 키가 env·파일에서 왔다(= 안 물었다) → 모델도 확인하지 않는다"*).
 *
 * **하네스를 재사용하지 않는다** — 독립 검증의 결론이 다른 작성자의 하네스에 기대면 둘이
 * 같은 오해를 공유하는 경우를 못 잡는다. 자기 검사를 첫 축으로 둔다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 지목은 절 번호와 필드 이름으로 한다.
 */

import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { probeCredentials } from "../src/credentials.ts";
import {
  type FoundSecret,
  type OnboardingAnswer,
  type OnboardingPrompt,
  type OnboardingSkipSource,
  type OnboardingStepId,
  runOnboarding,
  type VerificationResult,
} from "../src/onboarding.ts";

const PTY_TOOL = "/usr/bin/script";
const hasPty = existsSync(PTY_TOOL);

const testDir = dirname(fileURLToPath(import.meta.url));
const binPath = realpathSync(join(testDir, "..", "bin", "neo-agent.mjs"));

/** §4가 정한 이름 둘. 구현 상수를 임포트하지 않고 문서에서 옮겨 적는다 */
const MODEL_KEY_ENV = "ANTHROPIC_API_KEY";
const SEARCH_KEY_ENV = "TAVILY_API_KEY";

const HOME_DIR_NAME = ".neo-agent";
const CREDENTIALS = "credentials";
const CONFIG_JSON = "config.json";

/** 알약 어휘는 관문 문면에만 사는 층이다(§2.1 · `LORE.md` §6) — 관문이 섰는지의 표지 */
const PILL_VOCAB = /Red Pill|Blue Pill/;

/** 자극 — 표시 세부다. 관문의 진행 키와 기본값 수용 */
const PROCEED_KEY = "r";
const ENTER = String.fromCharCode(13);
const CTRL_D = String.fromCharCode(4);

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g");
const plain = (text: string): string =>
  text.replace(ANSI, "").split(String.fromCharCode(13)).join("\n");

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 실 bin 스폰 + 유사 터미널. 자리 한정 상한이고 근거는 그 작업이 본래 오래 걸린다는 것이다 */
const AXIS_TIMEOUT_MS = 20_000;
const EXIT_WAIT_MS = 6_000;
const DRAW_WAIT_MS = 2_500;

const roots: string[] = [];
const restoreModes: Array<() => void> = [];

afterAll(() => {
  for (const restore of restoreModes.splice(0)) restore();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

interface Obs {
  readonly homeMarker: string;
  readonly out: string;
  readonly exited: boolean;
  readonly code: number | null;
  readonly entries: readonly string[];
  readonly credentials: string | null;
}

interface Spec {
  /** 홈 `<home>/.neo-agent`(0700)를 만든 뒤 부르는 씨앗 */
  readonly seed?: (homeMarker: string) => void;
  readonly env?: Readonly<Record<string, string>>;
  readonly steps?: readonly string[];
  /** 자극을 다 넣은 뒤 종료를 기다린다(거짓이면 그리기만 기다리고 죽인다) */
  readonly expectExit: boolean;
}

async function land(spec: Spec): Promise<Obs> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "neo-0a-indep-")));
  roots.push(root);
  const home = join(root, "home");
  const workspace = join(root, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const homeMarker = join(home, HOME_DIR_NAME);

  if (spec.seed !== undefined) {
    mkdirSync(homeMarker, { recursive: true, mode: 0o700 });
    spec.seed(homeMarker);
  }

  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  // 이 런을 띄운 셸의 키가 새는 것을 막는다 — 키의 유무가 갈래를 가른다.
  delete env[MODEL_KEY_ENV];
  delete env[SEARCH_KEY_ENV];
  for (const [key, value] of Object.entries(spec.env ?? {})) env[key] = value;

  const child = spawn(PTY_TOOL, ["-qec", binPath, "/dev/null"], {
    cwd: workspace,
    env,
    detached: true,
  });

  let raw = "";
  const collect = (chunk: Buffer): void => {
    raw += chunk.toString("utf8");
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  let exited = false;
  let code: number | null = null;
  const closed = new Promise<void>((resolve) => {
    child.on("close", (exitCode) => {
      exited = true;
      code = exitCode;
      resolve();
    });
  });

  for (const step of spec.steps ?? []) {
    // 자극을 넣기 전에 그 단계가 그려질 시간을 준다. 죽었으면 더 넣지 않는다.
    await Promise.race([closed, sleep(DRAW_WAIT_MS)]);
    if (exited) break;
    child.stdin.write(step);
  }

  await Promise.race([closed, sleep(spec.expectExit ? EXIT_WAIT_MS : DRAW_WAIT_MS)]);
  // **죽이기 전에 굳힌다.** 아래 강제 종료가 `exited`를 참으로 만들므로, 그 뒤에 읽으면
  // 「스스로 끝났는가」와 「우리가 끝냈는가」가 구별되지 않는다 — 자기 검사 축이 이
  // 실수를 첫 시행에서 잡았다(2026-09-08).
  const exitedOnItsOwn = exited;
  if (!exited) {
    const pid = child.pid;
    try {
      if (pid === undefined) throw new Error("pid 없음");
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await Promise.race([closed, sleep(2_000)]);
  }

  // 관측 전에 읽을 수 있게 되돌린다. **앱은 이미 끝났으므로 관측 대상이 안 바뀐다** —
  // 아래 어느 필드도 모드를 안 든다.
  relax(homeMarker);

  const homeExists = existsSync(homeMarker);
  const credentialsPath = join(homeMarker, CREDENTIALS);
  return {
    homeMarker,
    out: plain(raw),
    exited: exitedOnItsOwn,
    code,
    entries: homeExists ? readdirSync(homeMarker).sort() : [],
    credentials: safeRead(credentialsPath),
  };
}

function relax(path: string): void {
  try {
    chmodSync(path, 0o700);
  } catch {
    // 최선 노력이다.
  }
  let names: string[];
  try {
    names = readdirSync(path);
  } catch {
    return;
  }
  for (const name of names) {
    const child = join(path, name);
    try {
      chmodSync(child, 0o600);
    } catch {
      // 심링크·디렉터리는 아래에서 다시 다룬다.
    }
    try {
      if (readdirSync(child).length >= 0) relax(child);
    } catch {
      // 디렉터리가 아니다.
    }
  }
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function write(path: string, text: string, mode: number): void {
  writeFileSync(path, text, { encoding: "utf8", mode });
  chmodSync(path, mode);
}

// ───────────────────────────────────────────────────────────────────────────
// 판정 — `Obs` 위의 순수 함수. 아래 역검증이 같은 함수에 위반을 심는다
// ───────────────────────────────────────────────────────────────────────────

/**
 * `0a`의 실패 갈래 — §2.3: *"부재는 통과이고, 실패는 기동 실패다"* · §2.1이 그 자리를
 * 관문 **앞**으로 못박았고 · §2 말미이 *"원인과 다음 행동을 담은 에러로 종료"*를 요구한다.
 *
 * **[미규정] 실패 갈래의 종료 코드 수치를 정본이 들지 않는다** — 「0이 아니다」까지만 잰다.
 *
 * 「원인」을 **문제 파일의 경로가 화면에 있는가**로 잰다. 어느 파일이 문제인지 없이는
 * 사용자가 고칠 자리를 못 찾고, 그것이 §2.6이 든 형태다. 문면 자체는 §12가 위임한 표시
 * 세부라 낱말을 고정하지 않는다 — 고정하는 것은 **주입한 경로**뿐이다.
 */
const judgePreflight = (obs: Obs, offendingPath: string): Record<string, boolean> => ({
  종료했다: obs.exited,
  "종료 코드가 0이 아니다": obs.code !== 0,
  "문제 파일의 경로가 화면에 있다": obs.out.includes(offendingPath),
  "관문 문면이 화면에 없다": !PILL_VOCAB.test(obs.out),
});

const PREFLIGHT_EXPECTED = {
  종료했다: true,
  "종료 코드가 0이 아니다": true,
  "문제 파일의 경로가 화면에 있다": true,
  "관문 문면이 화면에 없다": true,
};

/** `0a` 모집단의 상한 — 그 둘 밖의 파일은 관문을 막지 않는다(§2.3) */
const judgeGateStands = (obs: Obs): Record<string, boolean> => ({
  "관문 문면이 화면에 있다": PILL_VOCAB.test(obs.out),
  "관문 앞에서 죽지 않았다": !obs.exited,
});

/** §2.3 계약 표면 — 안 받은 값은 파일에 안 쓴다 · 이미 있던 것은 그대로 남는다 */
const judgeNoCopy = (
  obs: Obs,
  secrets: { readonly envSearchKey: string; readonly seededLine: string; readonly note: string },
): Record<string, boolean> => {
  const text = obs.credentials ?? "";
  return {
    "완주해서 홈이 생겼다": obs.entries.includes(CONFIG_JSON),
    "env의 검색 키가 파일에 없다": !text.includes(secrets.envSearchKey),
    "이미 있던 키 줄이 그대로다": text.includes(secrets.seededLine),
    "이미 있던 주석이 그대로다": text.includes(secrets.note),
  };
};

const NO_COPY_EXPECTED = {
  "완주해서 홈이 생겼다": true,
  "env의 검색 키가 파일에 없다": true,
  "이미 있던 키 줄이 그대로다": true,
  "이미 있던 주석이 그대로다": true,
};

/**
 * 「값이 있으면 출처도 있다」의 런타임 성질(§2.3 계약 표면 `FoundSecret` ·
 * `CredentialsProbe.apiKeySource`). **짝이 안 맞는 레코드가 나오지 않는 것**이 계약이고,
 * 조립이 그것을 `FoundSecret`으로 옮긴다.
 */
const judgePairing = (probe: {
  apiKey?: string;
  apiKeySource?: string;
  searchApiKey?: string;
  searchApiKeySource?: string;
}): Record<string, boolean> => ({
  "모델 키의 값과 출처가 함께 있거나 함께 없다":
    (probe.apiKey === undefined) === (probe.apiKeySource === undefined),
  "검색 키의 값과 출처가 함께 있거나 함께 없다":
    (probe.searchApiKey === undefined) === (probe.searchApiKeySource === undefined),
});

const PAIRING_EXPECTED = {
  "모델 키의 값과 출처가 함께 있거나 함께 없다": true,
  "검색 키의 값과 출처가 함께 있거나 함께 없다": true,
};

// ───────────────────────────────────────────────────────────────────────────
// 시행
// ───────────────────────────────────────────────────────────────────────────

const SEEDED_KEY_LINE = `${MODEL_KEY_ENV}=sk-ant-seeded-dummy`;
const SEEDED_NOTE = "# 내 메모 — 온보딩이 지우면 안 된다";
const ENV_SEARCH_KEY = "tvly-env-only-must-not-be-written";

describe.skipIf(!hasPty)("`0a` 선행 검증 — 독립 축 (CLI-INTERFACE §2·§2.3·§4)", () => {
  /** 하네스 자기 검사 — 이 축이 초록이어야 아래의 red가 앱의 것이 된다 */
  it(
    "하네스 자기 검사 — 빈 홈에서는 관문이 서고 프로세스가 살아 있다",
    async () => {
      const obs = await land({ expectExit: false });

      expect(judgeGateStands(obs)).toEqual({
        "관문 문면이 화면에 있다": true,
        "관문 앞에서 죽지 않았다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * P-1 — `0a` 표 `credentials` 행의 첫째 겹: **「권한 확인 가능성」**.
   *
   * 2026-09-08 `K-583` 정정이 이 행의 네 겹을 이름으로 들었고(*"권한 확인 가능성 · 노출
   * 비트(group·other)의 부재 · 읽기 가능성 · dotenv 형식"*), 그중 이 겹에는 어느 파일에도
   * 축이 없었다. 자기참조 심링크가 `stat`을 ENOENT 아닌 이유로 실패시킨다 — 부재로 접으면
   * 노출된 파일을 못 본 채 지나칠 수 있으므로 fail-closed가 계약이다(§4 보호 계약 1).
   */
  it(
    "P-1 · credentials의 권한을 확인할 수 없으면 관문 앞에서 기동이 실패한다",
    async () => {
      const obs = await land({
        expectExit: true,
        seed: (homeMarker) => {
          // 자기 자신을 가리키는 상대 심링크 → `statSync`가 ELOOP로 실패한다.
          symlinkSync(CREDENTIALS, join(homeMarker, CREDENTIALS));
        },
      });

      expect(judgePreflight(obs, join(obs.homeMarker, CREDENTIALS))).toEqual(PREFLIGHT_EXPECTED);
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * P-2 — `0a` 표 `config.json` 행의 둘째 겹: **「레코드 검증」**. 판정의 정본은 §3이고
   * 이 값은 그 표가 *"유효 구간 `0 < t <= 1` — 벗어나면 시작 에러"*로 든 것이다.
   *
   * 기존 축은 파싱 실패(깨진 JSON)만 재므로 **검증 호출이 사라져도 red가 나지 않는다**
   * (실측: `validateConfigRecord` 호출을 죽이는 변이에 `onboarding-startup.qa.test.ts`가
   * 전부 green이었다).
   */
  it(
    "P-2 · config.json이 파싱은 되나 레코드 검증에 걸리면 관문 앞에서 기동이 실패한다",
    async () => {
      const obs = await land({
        expectExit: true,
        seed: (homeMarker) => {
          write(join(homeMarker, CONFIG_JSON), JSON.stringify({ compactionThreshold: 5 }), 0o600);
        },
      });

      expect(judgePreflight(obs, join(obs.homeMarker, CONFIG_JSON))).toEqual(PREFLIGHT_EXPECTED);
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * P-2′ — 같은 겹의 다른 표면: §3의 미지 키(*"오타의 침묵 무시 차단"*). 한 값으로만 재면
   * 그 값에만 걸린 특수 판정이 통과할 수 있다.
   */
  it(
    "P-2′ · config.json에 모르는 키가 있으면 관문 앞에서 기동이 실패한다",
    async () => {
      const obs = await land({
        expectExit: true,
        seed: (homeMarker) => {
          write(join(homeMarker, CONFIG_JSON), JSON.stringify({ pill: "red" }), 0o600);
        },
      });

      expect(judgePreflight(obs, join(obs.homeMarker, CONFIG_JSON))).toEqual(PREFLIGHT_EXPECTED);
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * P-3 — 기존 네 갈래에도 **원인의 강한 형태**를 건다. 「화면이 비어 있지 않다」는
   * 원인 없는 한 줄도 통과시킨다(실측). 여기서는 **문제 파일의 경로**를 요구한다.
   */
  for (const scenario of [
    {
      id: "노출 비트 0644",
      file: CREDENTIALS,
      seed: (homeMarker: string): void => {
        write(join(homeMarker, CREDENTIALS), `${SEEDED_KEY_LINE}\n`, 0o644);
      },
    },
    {
      id: "읽기 실패 0000",
      file: CREDENTIALS,
      seed: (homeMarker: string): void => {
        write(join(homeMarker, CREDENTIALS), `${SEEDED_KEY_LINE}\n`, 0o000);
      },
    },
    {
      id: "dotenv 형식 오류",
      file: CREDENTIALS,
      seed: (homeMarker: string): void => {
        write(join(homeMarker, CREDENTIALS), `${MODEL_KEY_ENV}\n`, 0o600);
      },
    },
    {
      id: "config 파싱 실패",
      file: CONFIG_JSON,
      seed: (homeMarker: string): void => {
        write(join(homeMarker, CONFIG_JSON), "{ 이것은 JSON이 아니다", 0o600);
      },
    },
  ] as const) {
    it(
      `P-3 · ${scenario.id} — 실패 문면이 그 파일의 경로를 든다`,
      async () => {
        const obs = await land({ expectExit: true, seed: scenario.seed });

        expect(judgePreflight(obs, join(obs.homeMarker, scenario.file))).toEqual(
          PREFLIGHT_EXPECTED,
        );
      },
      AXIS_TIMEOUT_MS,
    );
  }

  /**
   * P-4 — 모집단의 **상한**. §2.3: *"3b(메모리)는 이 모집단 밖이다. 온보딩이 그 파일을
   * 안 쓰므로 위 근거가 안 걸리고, 그 실패는 «관문 뒤 단계의 실패»"*.
   *
   * 이 축은 「덜 잰다」가 아니라 **「더 재면 붉어진다」**를 든다 — `0a`가 온보딩이 안
   * 건드리는 파일까지 검사하기 시작하면 여기가 red가 되고, 그날을 사람의 기억이 아니라
   * 붉어진 축이 알린다.
   */
  it(
    "P-4 · 메모리 파일이 깨져 있어도 `0a`는 관문을 막지 않는다",
    async () => {
      const obs = await land({
        expectExit: false,
        seed: (homeMarker) => {
          const memory = join(homeMarker, "memory");
          mkdirSync(memory, { recursive: true, mode: 0o700 });
          write(join(memory, "MEMORY.md"), "- 못 읽는 메모\n", 0o000);
        },
      });

      expect(judgeGateStands(obs)).toEqual({
        "관문 문면이 화면에 있다": true,
        "관문 앞에서 죽지 않았다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * P-7 — §2.3 계약 표면: *"`OnboardingValues.apiKey`가 옵셔널인 것이 계약이다 … env
   * 갈래에서는 env의 값이 파일로 복사된다 — 시크릿이 원래 없던 자리에 생긴다"* ·
   * 얹기 규율(*"온보딩이 **받은 키만** 얹는다"*).
   *
   * 엔진 층에는 축이 있으나(`onboarding.contract.test.ts`) **실 프로세스 층에는 없었다** —
   * 조립이 `existing`을 잘못 채우거나 `0d`가 통째로 쓰면 그 층에서만 드러난다.
   *
   * 모델 키는 파일에서, 검색 키는 env에서 온다 → 묻는 것은 모델 하나이고 확인 호출이
   * 없다(§2.3: 안 물은 키는 확인하지 않는다). 그래서 네트워크에 안 나간다.
   */
  it(
    "P-7 · 완주해도 env의 시크릿이 credentials로 복사되지 않고 기존 줄이 남는다",
    async () => {
      const obs = await land({
        expectExit: true,
        env: { [SEARCH_KEY_ENV]: ENV_SEARCH_KEY },
        steps: [PROCEED_KEY, ENTER, CTRL_D],
        seed: (homeMarker) => {
          write(join(homeMarker, CREDENTIALS), `${SEEDED_NOTE}\n${SEEDED_KEY_LINE}\n`, 0o600);
        },
      });

      expect(
        judgeNoCopy(obs, {
          envSearchKey: ENV_SEARCH_KEY,
          seededLine: SEEDED_KEY_LINE,
          note: SEEDED_NOTE,
        }),
      ).toEqual(NO_COPY_EXPECTED);
    },
    AXIS_TIMEOUT_MS,
  );
});

describe("「값이 있으면 출처도 있다」 — 짝의 두 층 (CLI-INTERFACE §2.3 계약 표면)", () => {
  const homesForPairing: string[] = [];
  const makeHome = (): string => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "neo-pairing-")));
    homesForPairing.push(home);
    roots.push(home);
    return home;
  };

  /**
   * P-5 — 런타임 성질. 네 조합(둘 다 없음 · env만 · 파일만 · 섞임)에서 **값과 출처가
   * 함께 있거나 함께 없다**. 조립(`pairFoundSecret`)이 이 성질에 기대어 던짐 없이 도므로,
   * 이것이 깨지면 첫 실행 안내가 거짓이 되거나 기동이 멈춘다.
   */
  for (const combination of [
    { id: "둘 다 없다", env: {} as Record<string, string>, file: "" },
    { id: "둘 다 env", env: { [MODEL_KEY_ENV]: "e1", [SEARCH_KEY_ENV]: "e2" }, file: "" },
    {
      id: "둘 다 파일",
      env: {} as Record<string, string>,
      file: `${MODEL_KEY_ENV}=f1\n${SEARCH_KEY_ENV}=f2\n`,
    },
    {
      id: "모델은 env · 검색은 파일",
      env: { [MODEL_KEY_ENV]: "e1" },
      file: `${SEARCH_KEY_ENV}=f2\n`,
    },
    // 빈 값·공백은 부재로 접힌다(§4 로더의 [미규정] 판정) — 그 갈래에서도 짝이 맞아야 한다.
    { id: "env가 공백뿐이고 파일에도 없다", env: { [MODEL_KEY_ENV]: "   " }, file: "" },
  ] as const) {
    it(`P-5 · ${combination.id} — 값과 출처가 함께 있거나 함께 없다`, () => {
      const home = makeHome();
      const credentialsPath = join(home, HOME_DIR_NAME, CREDENTIALS);
      if (combination.file !== "") {
        mkdirSync(dirname(credentialsPath), { recursive: true, mode: 0o700 });
        write(credentialsPath, combination.file, 0o600);
      }

      expect(judgePairing(probeCredentials({ ...combination.env }, credentialsPath))).toEqual(
        PAIRING_EXPECTED,
      );
    });
  }

  /**
   * P-6 — 타입 폐쇄. §2.3: *"`existing`의 값과 출처가 한 쌍인 것이 계약이다"* ·
   * *"짝이 안 맞는 레코드가 표현 불가능한 것이 계약이다"*.
   *
   * **이 리터럴이 컴파일 시점 단정이다** — 짝을 나란한 옵셔널 넷으로 되돌리면
   * (`K-581`이 걷어낸 형태) `FoundSecret`의 키가 달라져 여기가 깨진다. 형태는
   * `onboarding.contract.test.ts`의 `Record<keyof RunOnboardingOptions, true>`와 같다.
   */
  it("P-6 · `FoundSecret`의 키가 값·출처 둘로 닫혀 있다", () => {
    const keys: Record<keyof FoundSecret, true> = { value: true, source: true };
    expect(Object.keys(keys).sort()).toEqual(["source", "value"]);
  });
});

describe.skipIf(!hasPty)("[문서 부정확 후보] `config.json` 행이 안 드는 겹", () => {
  /**
   * D-1 — `0a` 표의 `config.json` 행은 「재는 것」으로 *"파싱 + 레코드 검증"* 둘만 든다.
   * 구현은 **읽기 실패로도** 죽는다(`readConfigFile`의 ENOENT 외 던짐). `credentials`
   * 행이 2026-09-08 `K-583`에서 정정된 것과 **같은 형태의 좁은 문면**이다.
   *
   * **판정은 리포트가 「판정 필요」로 올린다** — 이 축은 구현의 오늘을 고정할 뿐이고,
   * 문면을 넓히든(정정) 실물을 좁히든(개정) 그날 이 축이 그 결정을 마주치게 한다.
   */
  it(
    "D-1 · config.json을 읽을 수 없으면 관문 앞에서 기동이 실패한다 [표에 없는 겹]",
    async () => {
      const obs = await land({
        expectExit: true,
        seed: (homeMarker) => {
          write(join(homeMarker, CONFIG_JSON), JSON.stringify({ model: "m" }), 0o000);
        },
      });

      expect(judgePreflight(obs, join(obs.homeMarker, CONFIG_JSON))).toEqual(PREFLIGHT_EXPECTED);
    },
    AXIS_TIMEOUT_MS,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 역검증 — 같은 판정 함수에 **일부러 위반을 심어** red가 나는지 본다.
// pty가 없는 환경에서도 돈다(순수 함수).
// ───────────────────────────────────────────────────────────────────────────

const OBS_SEED: Obs = {
  homeMarker: `/tmp/qa-home/${HOME_DIR_NAME}`,
  out: "",
  exited: true,
  code: 1,
  entries: [],
  credentials: null,
};

const planted = (patch: Partial<Obs>): Obs => ({ ...OBS_SEED, ...patch });

describe("역검증 — 심은 위반이 실제로 red를 낸다", () => {
  const offending = `${OBS_SEED.homeMarker}/${CREDENTIALS}`;

  it("P-1~P-3 — 관문을 띄운 뒤 죽는 관측을 거절한다", () => {
    const gateFirst = planted({ out: `[r] Red Pill [b] Blue Pill … ${offending} 권한 0644` });
    expect(judgePreflight(gateFirst, offending)).not.toEqual(PREFLIGHT_EXPECTED);
  });

  it("P-1~P-3 — 원인 없는 한 줄로 끝나는 관측을 거절한다(기존 축이 통과시키던 형태)", () => {
    const vague = planted({ out: "설정을 불러오지 못했습니다." });
    expect(judgePreflight(vague, offending)).not.toEqual(PREFLIGHT_EXPECTED);
  });

  it("P-1~P-3 — 0으로 끝나는 관측과 안 죽는 관측을 각각 거절한다", () => {
    expect(judgePreflight(planted({ code: 0, out: offending }), offending)).not.toEqual(
      PREFLIGHT_EXPECTED,
    );
    expect(judgePreflight(planted({ exited: false, out: offending }), offending)).not.toEqual(
      PREFLIGHT_EXPECTED,
    );
  });

  it("P-4 — 모집단이 넓어져 관문 앞에서 죽는 관측을 거절한다", () => {
    const died = planted({ out: "MEMORY.md를 읽을 수 없다", exited: true });
    expect(judgeGateStands(died)).not.toEqual({
      "관문 문면이 화면에 있다": true,
      "관문 앞에서 죽지 않았다": true,
    });
  });

  it("P-7 — env 시크릿이 파일에 실린 관측과 기존 줄이 사라진 관측을 각각 거절한다", () => {
    const secrets = {
      envSearchKey: ENV_SEARCH_KEY,
      seededLine: SEEDED_KEY_LINE,
      note: SEEDED_NOTE,
    };
    const copied = planted({
      entries: [CONFIG_JSON, CREDENTIALS],
      credentials: `${SEEDED_NOTE}\n${SEEDED_KEY_LINE}\n${SEARCH_KEY_ENV}=${ENV_SEARCH_KEY}\n`,
    });
    expect(judgeNoCopy(copied, secrets)).not.toEqual(NO_COPY_EXPECTED);

    const wholesale = planted({
      entries: [CONFIG_JSON, CREDENTIALS],
      credentials: `${MODEL_KEY_ENV}=sk-new\n`,
    });
    expect(judgeNoCopy(wholesale, secrets)).not.toEqual(NO_COPY_EXPECTED);
  });

  it("P-5 — 출처 없는 값과 값 없는 출처를 각각 거절한다", () => {
    expect(judgePairing({ apiKey: "v", secretValues: [] } as never)).not.toEqual(PAIRING_EXPECTED);
    expect(judgePairing({ searchApiKeySource: "file" } as never)).not.toEqual(PAIRING_EXPECTED);
  });
});

/**
 * P-8 — §2.3 「키 확인」: *"확인의 모집단은 온보딩이 받은 값이고, 확인이 온보딩이 못 고치는
 * 값에 의존하면 하지 않는다."*
 *
 * 기존 계약 축은 **모델 키**에 대해서만 이것을 잰다(`onboarding.contract.test.ts`의
 * *"이미 있는 모델 키는 확인하지 않는다"*). 검색 키 쪽에는 축이 없었다 — 그 갈래에서
 * 확인이 돌면 §2.3이 이름으로 든 결과가 그대로 난다: 우리가 못 고치는 키에 대고 재고,
 * 거부되면 되물을 자리가 없다. **검색 키는 그 위에 하나 더 걸린다** — 그 키의 실패가
 * 기동을 막지 않는 것이 §4·`WEB-ACCESS.md` §3.2의 계약이다.
 */
describe("§2.3 확인의 모집단 — 이미 있는 값은 재지 않는다", () => {
  it("P-8 · 이미 있는 검색 키에는 확인 호출이 가지 않는다", async () => {
    const asked: OnboardingStepId[] = [];
    const skipped: Array<{ step: OnboardingStepId; source: OnboardingSkipSource }> = [];
    let searchKeyCalls = 0;
    let modelKeyCalls = 0;
    const answers: OnboardingAnswer[] = [
      { kind: "value", value: "고른-모델" },
      { kind: "value", value: "sk-받은-키" },
    ];
    let index = 0;

    const outcome = await runOnboarding({
      io: {
        ask(prompt: OnboardingPrompt): Promise<OnboardingAnswer> {
          asked.push(prompt.step);
          const answer = answers[index++];
          if (answer === undefined) throw new Error(`대역 답이 모자란다 — ${index}번째 물음`);
          return Promise.resolve(answer);
        },
        noteSkipped(step: OnboardingStepId, source: OnboardingSkipSource): void {
          skipped.push({ step, source });
        },
      },
      verifier: {
        modelKey: (): Promise<VerificationResult> => {
          modelKeyCalls += 1;
          return Promise.resolve<VerificationResult>({ kind: "ok" });
        },
        // 이 갈래가 돌면 **거부**한다 — 돌았다는 사실 자체가 위반이므로, 조용히 ok를
        // 돌려주면 이 축이 호출 수를 세는 것 말고는 아무것도 못 재게 된다.
        searchKey: (): Promise<VerificationResult> => {
          searchKeyCalls += 1;
          return Promise.resolve<VerificationResult>({
            kind: "rejected",
            rejection: { kind: "invalid-key", cause: "이 갈래는 돌면 안 된다" },
          });
        },
      },
      defaultModel: "기본-모델",
      existing: { searchApiKey: { value: "이미-있는-검색-키", source: "file" } },
    });

    expect({
      "검색 키 확인 호출 수": searchKeyCalls,
      "모델 키 확인 호출 수": modelKeyCalls,
      "물은 단계": asked,
      "건너뛴 단계": skipped,
      결과: outcome.kind,
      "결과에 검색 키가 없다":
        outcome.kind === "completed" && outcome.values.searchApiKey === undefined,
    }).toEqual({
      "검색 키 확인 호출 수": 0,
      "모델 키 확인 호출 수": 1,
      "물은 단계": ["model", "model-key"],
      "건너뛴 단계": [{ step: "search-key", source: "file" }],
      결과: "completed",
      "결과에 검색 키가 없다": true,
    });
  });
});
