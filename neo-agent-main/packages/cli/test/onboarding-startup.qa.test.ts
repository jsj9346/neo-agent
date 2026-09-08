/**
 * 첫 실행 온보딩의 **실 pty 시작 시퀀스 축** — `docs/CLI-INTERFACE.md` §2·§2.1·§2.3.
 *
 * 기대값은 정본 둘에서만 뽑았다 — `docs/CLI-INTERFACE.md`의 §2(시작 시퀀스 `0`~`0d`) ·
 * §2.1(자리 `0b` · 선택의 귀결 · 도입 연출 · 중단 입력과 응답 키) · §2.3(전문), 그리고
 * `plans/20260908-firstrun-onboarding-interview.md`(상태: 결정됨)의 성공 기준 S-1·S-2·S-4·S-5.
 * **`src/wiring.ts`·`src/onboarding.ts`·`src/first-run.ts`는 이 파일을 쓰는 동안 열지 않았고**,
 * 이 파일은 `src/`에서 아무것도 임포트하지 않는다. 여는 문은 설치 형태 그대로의 bin 하나이고
 * 나머지는 전부 **화면·종료 코드·파일 시스템**이라는 관측 가능한 결과다.
 *
 * ── 선언 여섯 ─────────────────────────────────────────────────────────────
 *
 * **1. 왜 실 pty인가.** 재는 것이 화면·종료 코드·파일 상태 셋이고, 그 셋은 실 tty 없이는
 *    갈리지 않는다(`first-run-exit.contract.test.ts` 머리의 같은 근거 — 대역 스트림에서
 *    「끝났다」는 프라미스가 풀렸다는 뜻이지 프로세스가 죽었다는 뜻이 아니다). 수단의
 *    선례는 그 파일이고 **하네스는 재사용하지 않는다** — 독립 검증의 결론이 다른 작성자의
 *    하네스 정확성에 의존하면 둘이 같은 오해를 공유하는 경우를 못 잡는다. 대신 하네스
 *    자기 검사를 첫 축으로 둔다.
 *
 * **2. 이 층은 응답 키를 안다 — §2.1이 요구한 선언이다.** 그 절은 응답 키를 §12가 위임한
 *    표시 세부로 두면서 *"단위 층은 키를 안다"*와 그 층이 자기가 세부를 고정한다는 것을
 *    *"파일 머리에 선언한다"*를 함께 요구했다. 이 파일이 그 선언이다. 아래 `PROCEED_KEY`·
 *    `ANY_KEY`·`ACCEPT_DEFAULT`는 **자극이지 계약이 아니다** — 관문의 라벨 키나 온보딩의
 *    수용 방식이 바뀌면 이 상수를 고치는 것이 옳고 그 변경은 계약 변경이 아니다.
 *    제어문자 둘(Ctrl+C·Ctrl+D)은 사정이 다르다: §2.1이 중단 입력 셋을 **이름으로** 들었으므로
 *    그 둘은 세부가 아니라 계약이다.
 *
 * **3. 화면 리터럴은 넷뿐이고 전부 대비쌍으로만 쓴다**(§7 말미의 기준 — 재는 것은 *"서로
 *    다른 상태가 서로 다른 출력을 낳는가, 그 출력이 비어 있지 않은가"*). ① §2.1 귀결 표가
 *    「화면의 이름 ↔ 코드의 값」의 정본이라 못박은 이름 둘 ② 주입한 홈의 절대 경로(§2.1
 *    문면 ① — *"조립이 쓸 홈으로 해석한 실제 절대 경로"*, 주입 데이터 확인) ③ 온보딩이
 *    고른 모델 문자열(주입 데이터 확인) ④ 출처 표지와 재실행 지시 — 이 둘만 문면에 가까운데,
 *    **둘 다 짝 있는 대조군과 함께**만 단정한다(있어야 할 화면과 없어야 할 화면을 같은
 *    정규식으로 함께 잰다). 짝 없는 단독 리터럴은 이 파일에 없다.
 *
 * **4. 원시 출력 단정의 한계 — 축이 통과해도 사용자가 봤다는 증거는 아니다.** §12 미결
 *    (*"온보딩 화면이 `0b`의 지움 규율을 상속하는가"*)이 열려 있어 **지워진 뒤에도 원시
 *    출력에는 남는다.** 이 층은 pty 스트림의 바이트를 보므로 화면 지움을 걷어내지 못한다.
 *    아래 「있다」 계열 축 전부에 이 한계가 걸린다 — 그 미결이 닫히기 전까지 이 파일의
 *    초록은 「스트림에 있었다」까지다.
 *
 * **5. 네트워크에 나가지 않는다.** 값을 제출하기 전의 중단이거나(S-2) 키가 env·파일에서 온
 *    갈래다 — §2.3: *"모델 키가 env·파일에서 왔다(= 안 물었다) → 모델도 확인하지 않는다."*
 *    확인 호출이 실제로 도는 갈래(인터뷰 S-6 · 확인 실패 뒤 포기)는 **이 파일에 없다.**
 *
 * **6. 이 파일이 재지 않는 것**(커버리지 구멍이 아니라 층·범위의 경계다. 리포트가 든다):
 *    - **중단 입력 셋의 셋째(입력 스트림 종료)** — §2.1이 스스로 근거를 든다: raw 모드의
 *      살아 있는 TTY에서는 스트림 끝이 오지 않는다. 이 층에서 원리적으로 안 잡힌다.
 *    - **확인 실패 뒤 포기(S-2′)·틀린 키(S-6)** — 확인 호출을 요구하므로 선언 5에 걸린다.
 *    - **S-3(완주가 남기는 세 파일과 모드)** — 이 사이클의 모집단 밖. 아래 S-4 축이
 *      `sessions.db`의 존재만 완주의 표지로 쓴다.
 *    - **되묻기·건너뛰기의 문면** — §12가 위임한 표시 세부.
 *
 * ── 재는 축 ───────────────────────────────────────────────────────────────
 *
 *   S-1  키 없이도 관문까지 간다 · 전환 화면 둘 · 관문 문면 · 한 청크 입력 유실 없음
 *   S-2  중단점 넷 × 중단 입력 둘 — 종료 코드 0 · 홈 미생성
 *   S-4  완주한 세션이 그 값으로 돈다 · 재실행 지시 0건
 *   S-5  두 번째 기동은 안 묻는다
 *   0a   관문 앞에서 죽는다 — credentials 0644 · config.json 파손
 *   출처 고지  건너뛴 단계가 값을 어디서 찾았는지 화면에 있다 (env · file · 대조군)
 *
 * **모든 축은 관측 레코드(`Obs`) 위의 순수 판정으로 쓴다.** 그래야 아래 「역검증」 블록이
 * 같은 판정에 **일부러 위반을 심어** red가 나는지 확인할 수 있다 — 헛도는 축(무엇을 심어도
 * 초록인 축)을 이 파일 안에서 상시로 막는다.
 *
 * `ARCHITECTURE.md` §2.21 판별 — 아래 명시 상한은 **자리 한정**이고 근거는 *"그 작업이
 * 본래 오래 걸린다"*(실 bin 스폰 + 유사 터미널 + 반응 관측)이지 부하가 아니다. 그래서 그
 * 절이 부하를 근거로 한 상한에 요구하는 각인 4항은 이 자리에 안 걸린다. 여유 배수는 그래도
 * 지켜야 하므로 실측을 리포트가 든다(`plans/20260908-onboarding-wiring-qa-report.md`).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 지목은 절 번호와 필드 이름으로 한다(줄번호로 가리키지 않는다).
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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// 하네스 — 이 파일 전용. 아무 하네스도 임포트하지 않는다
// ───────────────────────────────────────────────────────────────────────────

/** 유사 터미널을 만들 수단. 없으면 이 축을 세울 수 없으므로 **건너뛴다** */
const PTY_TOOL = "/usr/bin/script";
const hasPty = existsSync(PTY_TOOL);

const testDir = dirname(fileURLToPath(import.meta.url));
/** `package.json`의 `bin` 필드가 가리키는 그 파일 */
const binPath = realpathSync(join(testDir, "..", "bin", "neo-agent.mjs"));

/** §4가 정한 이름 둘. 구현 상수를 임포트하지 않고 문서에서 옮겨 적는다 */
const MODEL_KEY_ENV = "ANTHROPIC_API_KEY";
const SEARCH_KEY_ENV = "TAVILY_API_KEY";
/** 값은 쓰이지 않는다 — 확인 호출이 도는 갈래가 이 파일에 없다(머리 선언 5) */
const DUMMY_MODEL_KEY = "sk-ant-qa-dummy";
const DUMMY_SEARCH_KEY = "tvly-qa-dummy";

/** §2.3 「이미 있는 값은 묻지 않는다」의 파일 갈래를 세우는 형식 — §4: *"dotenv형 (KEY=value, # 주석 허용)"* */
const SEEDED_CREDENTIALS = `${MODEL_KEY_ENV}=sk-ant-seeded-dummy\n`;

/** 홈 아래 이름 둘. §2.1 자리 소절·§2.3 전부-아니면-전무가 이름으로 든다 */
const HOME_DIR_NAME = ".neo-agent";
const SESSIONS_DB = "sessions.db";
const CONFIG_JSON = "config.json";
const CREDENTIALS = "credentials";

/** 자극 — 세부다(머리 선언 2) */
const PROCEED_KEY = "r";
/** §2.1 도입 연출: 전환 대기는 *"키 하나를 기다린 뒤 화면을 지운다"* — 어떤 키여도 같다 */
const ANY_KEY = " ";
/** 온보딩 `model` 단계의 기본값 수용. `OnboardingPrompt.defaultValue`가 있는 유일한 단계다 */
const ACCEPT_DEFAULT = String.fromCharCode(13);
/** Ctrl+C — §2.1이 중단 입력 셋을 이름으로 들었으므로 세부가 아니다 */
const CTRL_C = String.fromCharCode(3);
/** Ctrl+D — 같은 자리 */
const CTRL_D = String.fromCharCode(4);

/** §2.1 귀결 표가 든 화면의 이름 둘. 전부 대비쌍으로만 쓴다(머리 선언 3) */
const NAME_PROCEED = "Red Pill";
const NAME_CANCEL = "Blue Pill";
/** 알약 어휘는 관문 문면에만 사는 층이다(§2.1 · `LORE.md` §6) — S-5의 대비쌍이 이것을 쓴다 */
const PILL_VOCAB = /Red Pill|Blue Pill/;

/**
 * S-4가 주입하는 모델 문자열. **주입 데이터 확인이지 문면 고정이 아니다.**
 * §2.3은 *"손으로 유지되는 모델 목록"*을 두지 않기로 했고 §3은 `model`을 기본값 있는
 * 문자열 키로 두므로, 임의의 문자열이 거부되는 것 자체가 계약 밖이다.
 */
const CHOSEN_MODEL = "qa-probe-model-20260908";

/**
 * 출처 표지 — §2.3: *"건너뛴 단계마다 그 사실과 값을 어디서 찾았는지가 화면에 있다"*.
 * `OnboardingIo.noteSkipped`의 `source: "env" | "file"`이 그 두 값이다.
 *
 * **어느 낱말로 쓰는가는 §12가 위임한 표시 세부**이므로 영문 토큰과 우리말을 함께 받는다.
 * 계약으로 재는 것은 **건너뛴 갈래에는 있고 안 건너뛴 갈래에는 없다**는 대비다.
 */
const SOURCE_ENV = /\benv\b|환경/i;
const SOURCE_FILE = /\bfile\b|파일/i;

/**
 * §2.3 「결과는 그 프로세스에 실린다」: *"「끝났으니 다시 실행하세요」를 두지 않는다"*.
 * 짝 없는 부정 단정이 되지 않게 **대조군(`0a` 실패 화면)에서 같은 정규식이 걸리는지를
 * 같은 축에서 함께 잰다** — 걸리지 않으면 붉은 것은 앱이 아니라 이 정규식이다.
 */
const RERUN_INSTRUCTION = /다시 실행|재실행|다시 한 번 실행/;

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g");

function plain(text: string): string {
  return text.replace(ANSI, "").split(String.fromCharCode(13)).join("\n");
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 출력이 이만큼 조용하면 그 단계가 다 그려졌다고 본다 — 고정 대기가 아니라 반응 관측이다 */
const QUIET_MS = 300;
/** 한 단계가 그려지기까지의 상한. 넘기면 시행 자체가 실패다 */
const STEP_WAIT_MS = 10_000;
/** 마지막 자극 뒤 종료를 기다리는 상한 */
const EXIT_WAIT_MS = 3_000;
/**
 * 단일 시행 축의 명시 상한. 실측(2026-09-08 단독 런)의 최악값은 **4291ms**이고
 * 20000 ÷ 4291 = **4.66배**다(문턱 3배). 종료하지 않는 시행이 위 `EXIT_WAIT_MS`를
 * 통째로 쓰는 것이 그 값의 대부분이다.
 */
const AXIS_TIMEOUT_MS = 20_000;
/**
 * 시행 둘을 엮는 축의 상한 (S-5는 S-4의 홈을 이어받는다). 실측 최악 **3985ms** ·
 * 45000 ÷ 3985 = **11.3배**. 한 축이 두 시행을 세울 수 있으므로 배수를 크게 잡는다.
 */
const CHAIN_TIMEOUT_MS = 45_000;

const roots: string[] = [];

afterAll(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

interface SeedFile {
  readonly name: string;
  readonly content: string;
  readonly mode: number;
}

interface TrialSpec {
  /** 순서대로 넣는 자극. 각각의 뒤에 반응이 멎을 때까지 기다린다 */
  readonly steps: readonly string[];
  readonly argv?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  /** 홈 `<home>/.neo-agent`(0700)에 미리 심는 파일들 — `0a`의 모집단을 세운다 */
  readonly seed?: readonly SeedFile[];
  /** 이 홈을 그대로 다시 쓴다 — S-5가 S-4의 홈을 이어받는 수단 */
  readonly reuseHome?: string;
}

/**
 * 한 시행에서 관측된 것 전부. **축은 이 레코드 위에서만 판정한다** — 그래야 역검증
 * 블록이 같은 판정에 위반을 심을 수 있다.
 */
interface Obs {
  readonly home: string;
  /** 홈 디렉터리의 절대 경로 — §2.1 문면 ①의 대조 대상 */
  readonly homeMarker: string;
  /** `[기동 직후, 자극1 뒤, 자극2 뒤, …]` — 각 구간에 **새로 난** 출력만 담는다 */
  readonly screens: readonly string[];
  /** 각 구간이 끝난 시점에 프로세스가 이미 죽었는가 */
  readonly exitedAt: readonly boolean[];
  /** 전량(ANSI 제거) */
  readonly raw: string;
  readonly exitedWithinLimit: boolean;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  /** `<home>/.neo-agent` **디렉터리 자체**의 존재 */
  readonly homeExists: boolean;
  /** 그 디렉터리의 내용물 이름들. 없으면 빈 배열 */
  readonly entries: readonly string[];
  /** `credentials`가 있으면 그 내용. 「이미 있었다면 그 내용이 그대로여야 한다」(§2.1)의 대조 */
  readonly credentials: string | null;
}

async function land(spec: TrialSpec): Promise<Obs> {
  let home: string;
  let workspace: string;
  if (spec.reuseHome !== undefined) {
    home = spec.reuseHome;
    workspace = join(dirname(home), "ws");
  } else {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "neo-onboarding-qa-")));
    roots.push(root);
    home = join(root, "home");
    workspace = join(root, "ws");
    mkdirSync(home, { recursive: true });
    mkdirSync(workspace, { recursive: true });
  }

  const homeMarker = join(home, HOME_DIR_NAME);
  if (spec.seed !== undefined && spec.seed.length > 0) {
    mkdirSync(homeMarker, { recursive: true, mode: 0o700 });
    for (const file of spec.seed) {
      const path = join(homeMarker, file.name);
      writeFileSync(path, file.content);
      chmodSync(path, file.mode);
    }
  }

  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  // 이 런을 띄운 셸의 키가 새는 것을 막는다 — 키의 유무가 이 파일의 갈래를 가른다.
  delete env[MODEL_KEY_ENV];
  delete env[SEARCH_KEY_ENV];
  for (const [key, value] of Object.entries(spec.env ?? {})) env[key] = value;

  const argv = spec.argv ?? [];
  const child = spawn(PTY_TOOL, ["-qec", [binPath, ...argv].join(" "), "/dev/null"], {
    cwd: workspace,
    env,
    detached: true,
  });

  let raw = "";
  let lastChunkAt = 0;
  const collect = (chunk: Buffer): void => {
    raw += chunk.toString("utf8");
    lastChunkAt = Date.now();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  let exited = false;
  let code: number | null = null;
  let signal: NodeJS.Signals | null = null;
  const closed = new Promise<void>((resolve) => {
    child.on("close", (exitCode, exitSignal) => {
      exited = true;
      code = exitCode;
      signal = exitSignal;
      resolve();
    });
  });

  /** 반응이 멎을 때까지. 종료가 먼저 오면 그것도 종단이다 */
  const settle = async (): Promise<void> => {
    const deadline = Date.now() + STEP_WAIT_MS;
    while (Date.now() < deadline && !exited) {
      if (lastChunkAt !== 0 && Date.now() - lastChunkAt >= QUIET_MS) break;
      await sleep(10);
    }
  };

  const screens: string[] = [];
  const exitedAt: boolean[] = [];
  await settle();
  screens.push(plain(raw));
  exitedAt.push(exited);
  let mark = raw.length;

  for (const step of spec.steps) {
    if (exited) break;
    child.stdin.write(step);
    lastChunkAt = Date.now();
    // 자극이 pty를 왕복할 최소 시간. 이 뒤는 전부 반응 관측이다.
    await sleep(60);
    await settle();
    screens.push(plain(raw.slice(mark)));
    exitedAt.push(exited);
    mark = raw.length;
  }

  await Promise.race([closed, sleep(EXIT_WAIT_MS)]);
  const exitedWithinLimit = exited;
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

  // 관측 전에 시드 파일의 권한을 되돌린다. **앱은 이미 끝났으므로 관측 대상이 안 바뀐다**
  // — 아래 어느 필드도 모드를 안 든다. 이것이 없으면 「읽을 수 없는 파일」 시드에서
  // 하네스 자신이 EACCES로 죽어, 앱이 무엇을 했는지 볼 수 없다.
  for (const file of spec.seed ?? []) {
    const path = join(homeMarker, file.name);
    if (!existsSync(path)) continue;
    try {
      chmodSync(path, 0o600);
    } catch {
      // 되돌리기는 최선 노력이다. 실패하면 아래 읽기가 그 사실을 스스로 드러낸다.
    }
  }

  const homeExists = existsSync(homeMarker);
  return {
    home,
    homeMarker,
    screens,
    exitedAt,
    raw: plain(raw),
    exitedWithinLimit,
    code,
    signal,
    homeExists,
    entries: homeExists ? readdirSync(homeMarker).sort() : [],
    credentials: existsSync(join(homeMarker, CREDENTIALS))
      ? readFileSync(join(homeMarker, CREDENTIALS), "utf8")
      : null,
  };
}

/** 시행은 이름마다 한 번만 세운다. 여러 축이 같은 착지를 다시 본다 */
const trials = new Map<string, Promise<Obs>>();

function trial(name: string, build: () => Promise<Obs>): Promise<Obs> {
  let existing = trials.get(name);
  if (existing === undefined) {
    existing = build();
    trials.set(name, existing);
  }
  return existing;
}

// ───────────────────────────────────────────────────────────────────────────
// 시행 정의 — 자극과 환경만 든다. 판정은 아래 축이 한다
// ───────────────────────────────────────────────────────────────────────────

/** 하네스 자기 검사 — 시작 시퀀스를 타지 않는 조회 갈래(§5) */
const selfCheck = (): Promise<Obs> =>
  trial("자기검사", () => land({ steps: [], argv: ["--version"] }));

/** S-1 — 빈 홈 · 키 없음. 전환 대기용 키 둘을 차례로 넣는다 */
const gateTrial = (): Promise<Obs> => trial("S-1 관문", () => land({ steps: [ANY_KEY, ANY_KEY] }));

/** S-1 — 전환 키들과 선택 키를 **한 청크로** 넣는다(§2.1 「한 청크로 온 입력이 …」) */
const chunkTrial = (): Promise<Obs> =>
  trial("S-1 한 청크", () => land({ steps: [`${ANY_KEY}${ANY_KEY}${PROCEED_KEY}`] }));

/**
 * S-2 — 중단점 넷. 자극의 길이가 그 자리를 고른다.
 *
 * **단계의 동일성은 자극의 깊이로 세운다** — 어느 화면이 어느 단계인지의 문면은 §12가
 * 위임한 표시 세부라 이 층이 리터럴로 고정하지 않는다. 깊이의 근거는 §2.3의 닫힌 셋과
 * 그 순서(`model` → `model-key` → `search-key`)이며, `search-key` 갈래는 모델 키를 env로
 * 줘서 §2.3 「이미 있는 값은 묻지 않는다」로 한 단계를 접는다(그 접힘 자체는 아래 출처
 * 고지 축이 따로 잰다).
 */
const ABORT_POINTS: ReadonlyArray<{
  readonly id: string;
  readonly lead: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}> = [
  { id: "0b 관문", lead: [] },
  { id: "0c model", lead: [PROCEED_KEY] },
  { id: "0c model-key", lead: [PROCEED_KEY, ACCEPT_DEFAULT] },
  {
    id: "0c search-key",
    lead: [PROCEED_KEY, ACCEPT_DEFAULT],
    env: { [MODEL_KEY_ENV]: DUMMY_MODEL_KEY },
  },
];

const ABORT_INPUTS: ReadonlyArray<readonly [string, string]> = [
  ["Ctrl+C", CTRL_C],
  ["Ctrl+D", CTRL_D],
];

const abortTrial = (pointId: string, inputName: string): Promise<Obs> => {
  const point = ABORT_POINTS.find((candidate) => candidate.id === pointId);
  const input = ABORT_INPUTS.find(([name]) => name === inputName);
  if (point === undefined || input === undefined) throw new Error(`알 수 없는 중단점: ${pointId}`);
  const steps = [...point.lead, input[1]];
  return trial(`S-2 ${pointId} / ${inputName}`, () =>
    point.env === undefined ? land({ steps }) : land({ steps, env: point.env }),
  );
};

/** 출처 고지 — env 갈래(모델 키를 env로 준다). 온보딩에 들어간 뒤 중단한다 */
const sourceEnvTrial = (): Promise<Obs> =>
  trial("출처 env", () =>
    land({ steps: [PROCEED_KEY, CTRL_C], env: { [MODEL_KEY_ENV]: DUMMY_MODEL_KEY } }),
  );

/** 출처 고지 — file 갈래(`credentials` 0600을 미리 심는다). `0a`의 통과 갈래이기도 하다 */
const sourceFileTrial = (): Promise<Obs> =>
  trial("출처 file", () =>
    land({
      steps: [PROCEED_KEY, CTRL_C],
      seed: [{ name: CREDENTIALS, content: SEEDED_CREDENTIALS, mode: 0o600 }],
    }),
  );

/** 출처 고지 — 대조군. 건너뛸 값이 하나도 없다(S-2의 `0c model` 시행을 그대로 쓴다) */
const sourceNoneTrial = (): Promise<Obs> => abortTrial("0c model", "Ctrl+C");

/**
 * S-4 — 완주. 키 둘을 env로 줘서 **묻는 단계가 `model` 하나만 남게** 한다
 * (§2.3: *"세 단계가 전부 건너뛰어지는 조합은 없다"*). 그래서 확인 호출이 없고
 * 네트워크에 나가지 않는다(머리 선언 5). 마지막 Ctrl+D는 REPL을 정상 종료시켜
 * S-5가 이어받을 홈을 남기기 위한 것이다.
 */
const completionTrial = (): Promise<Obs> =>
  trial("S-4 완주", () =>
    land({
      steps: [PROCEED_KEY, `${CHOSEN_MODEL}${ACCEPT_DEFAULT}`, CTRL_D],
      env: { [MODEL_KEY_ENV]: DUMMY_MODEL_KEY, [SEARCH_KEY_ENV]: DUMMY_SEARCH_KEY },
    }),
  );

/** S-5 — 같은 홈으로 재기동. 자극은 REPL이 실제로 입력을 받는지 보는 슬래시 명령 하나(§5) */
const secondLaunchTrial = async (): Promise<Obs> => {
  const first = await completionTrial();
  return trial("S-5 재기동", () =>
    land({
      steps: [`/help${ACCEPT_DEFAULT}`],
      env: { [MODEL_KEY_ENV]: DUMMY_MODEL_KEY, [SEARCH_KEY_ENV]: DUMMY_SEARCH_KEY },
      reuseHome: first.home,
    }),
  );
};

/** `0a` ① — `credentials`가 0644. §4 보호 계약 1의 모집단 */
const preflightPermTrial = (): Promise<Obs> =>
  trial("0a credentials 0644", () =>
    land({
      steps: [],
      seed: [{ name: CREDENTIALS, content: SEEDED_CREDENTIALS, mode: 0o644 }],
    }),
  );

/** `0a` ② — `config.json`이 파손. §3의 파싱·레코드 검증 모집단 */
const preflightConfigTrial = (): Promise<Obs> =>
  trial("0a config 파손", () =>
    land({
      steps: [],
      seed: [{ name: CONFIG_JSON, content: "{ 이것은 JSON이 아니다", mode: 0o600 }],
    }),
  );

/**
 * `0a` ③ — `credentials`를 **읽을 수 없다**. 노출 비트가 0이라 보호 계약 1은 통과하고
 * (§4 — 판정 기준은 group·other 비트의 존재이지 600과의 상등이 아니다), 죽는 자리는
 * §4 「읽기」 반쪽의 파일 읽기다. 이 갈래가 §2.3 `0a` 표의 모집단에 든다는 것은
 * 2026-09-08 문면 정정이 명시했다(`K-583`).
 *
 * **uid 0으로 돌리면 읽기가 성공해 관문까지 간다.** 그때 이 축은 조용히 초록이 되는 것이
 * 아니라 「관문 문면이 화면에 없다」에서 붉어진다 — 침묵 실패가 아니다.
 */
const preflightUnreadableTrial = (): Promise<Obs> =>
  trial("0a credentials 읽기 실패", () =>
    land({
      steps: [],
      seed: [{ name: CREDENTIALS, content: SEEDED_CREDENTIALS, mode: 0o000 }],
    }),
  );

/**
 * `0a` ④ — `credentials`의 **dotenv 형식 오류**. 권한도 읽기도 통과하고 파싱에서 죽는다.
 * 시드는 `=`가 없는 줄 하나다 — 형식이 어긋난 줄을 조용히 건너뛰면 그 키가 없는 것으로
 * 보여 「키가 없다」는 엉뚱한 안내로 이어지므로 파서가 던지는 것이 계약이다(§4).
 */
const preflightMalformedTrial = (): Promise<Obs> =>
  trial("0a credentials 형식 오류", () =>
    land({
      steps: [],
      seed: [{ name: CREDENTIALS, content: `${MODEL_KEY_ENV}\n`, mode: 0o600 }],
    }),
  );

// ───────────────────────────────────────────────────────────────────────────
// 판정 — 전부 `Obs` 위의 순수 함수다. 역검증 블록이 같은 함수에 위반을 심는다
// ───────────────────────────────────────────────────────────────────────────

/** 관문이 화면에 섰는가의 표지 — §2.1 문면 ①이 요구하는 **해석된 절대 경로**의 등장 */
const gateShown = (screen: string, obs: Obs): boolean => screen.includes(obs.homeMarker);

const judgeS1Reach = (obs: Obs): Record<string, boolean> => ({
  "기동 직후 화면이 비어 있지 않다": obs.screens[0]?.trim() !== "",
  "키 없이도 죽지 않는다": obs.exitedAt[0] === false,
});

const judgeS1Transitions = (obs: Obs): Record<string, boolean> => ({
  "키 0개 — 관문이 아직 아니다": !gateShown(obs.screens[0] ?? "", obs),
  "키 1개 — 관문이 아직 아니다": !gateShown(`${obs.screens[0] ?? ""}${obs.screens[1] ?? ""}`, obs),
  "키 2개 — 관문이 섰다": gateShown(obs.raw, obs),
});

const judgeS1GateText = (obs: Obs): Record<string, boolean> => ({
  "주입한 홈의 절대 경로가 문면에 있다": obs.raw.includes(obs.homeMarker),
  "진행 쪽 이름이 있다": obs.raw.includes(NAME_PROCEED),
  "취소 쪽 이름이 있다": obs.raw.includes(NAME_CANCEL),
});

/**
 * 한 청크에서 선택이 읽혔는가 — §2.1: *"전환 키들과 선택 키를 함께 넣으면 선택이 읽힌다"*.
 *
 * 무효 키의 재프롬프트는 선택을 읽기 **전**이라 두 이름을 함께 들어도 위반이 아니므로
 * (§2.1 하한 항), 재는 것은 **마지막 등장의 순서**다: 확인이 존재하고(진행 이름이 있고)
 * 그 뒤로 선택지가 다시 제시되지 않았다면 진행 이름의 마지막 등장이 취소 이름의 그것보다
 * 뒤에 온다. §2.1이 함께 계약으로 든 *"선택을 읽은 뒤 관문은 선택지를 다시 제시하지
 * 않는다"*가 이 판정을 성립시킨다.
 */
const judgeS1Chunk = (obs: Obs): Record<string, boolean> => {
  const seen = obs.screens.slice(1).join("");
  return {
    "확인에 진행 쪽 이름이 있다": seen.includes(NAME_PROCEED),
    "그 뒤로 선택지가 다시 제시되지 않았다":
      seen.lastIndexOf(NAME_PROCEED) > seen.lastIndexOf(NAME_CANCEL),
  };
};

const judgeS2 = (obs: Obs): Record<string, unknown> => ({
  종료했다: obs.exitedWithinLimit,
  "종료 코드": obs.code,
  시그널: obs.signal,
  "홈이 없다": obs.homeExists === false,
});

const S2_EXPECTED = { 종료했다: true, "종료 코드": 0, 시그널: null, "홈이 없다": true };

/**
 * `ARCHITECTURE.md` §2.6 — *"보이는 결과 또는 기록된 의도적 비결과"*. 중단은 홈에
 * 아무것도 남기지 않으므로 파일 시스템에 흔적이 없고, 화면에도 없으면 그 상태는
 * 「키가 안 먹었다」와 구별되지 않는다(§2.1이 관문에 대해 같은 근거로 확인을 계약으로
 * 올린 자리).
 *
 * **[미규정] §2.1 중단 입력 소절은 *"이 소절은 넓혀지지 않는다"*로 자기 확인 계약을
 * 온보딩까지 넓히지 않았고, §2.3도 중단 시 화면을 정하지 않는다.** 그래서 이 축이 재는
 * 것은 §2.1의 확인 계약이 아니라 §2.6의 금지다 — 등급 판정은 리포트가 「판정 필요」로
 * 올린다.
 */
const judgeAbortNotice = (obs: Obs): Record<string, boolean> => ({
  "중단 뒤 화면이 비어 있지 않다": (obs.screens.at(-1) ?? "").trim() !== "",
});

const judgeSourceNotice = (skipped: Obs, control: Obs, marker: RegExp): Record<string, boolean> => {
  const skippedSegment = skipped.screens.slice(1).join("");
  const controlSegment = control.screens.slice(1).join("");
  return {
    "건너뛴 갈래의 화면이 출처를 든다": marker.test(skippedSegment),
    "건너뛴 것이 없는 갈래에는 그 표지가 없다": !marker.test(controlSegment),
  };
};

/**
 * 완주 시행의 구간 색인 — `screens`는 `[기동 직후, 진행 키 뒤, **모델 답 뒤**, Ctrl+D 뒤]`다.
 * 2에서 재는 것이 계약의 자리다: `0c`의 마지막 답이 들어간 뒤 `0d`·1~8이 이어지는 구간.
 */
const COMPLETION_INDEX = 2;

const judgeS4 = (obs: Obs): Record<string, unknown> => ({
  "고른 모델이 완주 뒤 화면에 있다": (obs.screens[COMPLETION_INDEX] ?? "").includes(CHOSEN_MODEL),
  "완주 뒤에도 프로세스가 살아 있다": obs.exitedAt[COMPLETION_INDEX] === false,
  "세션이 열렸다": obs.entries.includes(SESSIONS_DB),
  "설정이 쓰였다": obs.entries.includes(CONFIG_JSON),
});

const judgeS4NoRerun = (completion: Obs, control: Obs): Record<string, boolean> => ({
  "완주 화면에 재실행 지시가 없다": !RERUN_INSTRUCTION.test(
    completion.screens[COMPLETION_INDEX] ?? "",
  ),
  "대조군(0a 실패 화면)에는 걸린다": RERUN_INSTRUCTION.test(control.raw),
});

const judgeS5 = (second: Obs, control: Obs): Record<string, boolean> => ({
  "재기동 화면에 알약 어휘가 없다": !PILL_VOCAB.test(second.raw),
  "대조군(첫 기동)에는 있다": PILL_VOCAB.test(control.raw),
  "REPL이 입력을 받았다": (second.screens[1] ?? "").trim() !== "",
});

/**
 * `0a` — §2.3: *"부재는 통과이고, 실패는 기동 실패다"*, §2.1: *"관문 앞에 fail-closed
 * 검증이 서야 한다"*.
 *
 * **[미규정] 실패 갈래의 종료 코드 수치를 정본이 들지 않는다.** §2 말미는 *"원인과 다음
 * 행동을 담은 에러로 종료"*까지이고, §2.1이 취소에 0을 준 근거가 *"0이 아닌 코드를 주면
 * 취소를 감싼 스크립트가 그것을 오류로 읽는다"*이므로 여기서는 **「0이 아니다」까지만**
 * 잰다. 정확한 값은 리포트가 관측값으로 든다.
 */
const judgePreflight = (obs: Obs): Record<string, boolean> => ({
  종료했다: obs.exitedWithinLimit,
  "종료 코드가 0이 아니다": obs.code !== 0,
  "원인이 화면에 있다": obs.raw.trim() !== "",
  "관문 문면이 화면에 없다": !PILL_VOCAB.test(obs.raw),
});

// ───────────────────────────────────────────────────────────────────────────
// 축
// ───────────────────────────────────────────────────────────────────────────

describe.skipIf(!hasPty)("첫 실행 온보딩 — 시작 시퀀스 축 (CLI-INTERFACE §2·§2.1·§2.3)", () => {
  /**
   * 하네스 자기 검사. **이 축이 초록이어야 아래의 red가 앱의 것이 된다.**
   * 같은 스폰·같은 pty·같은 종료 감시로 도는 기동 하나가 실제로 끝나는 것을 보인다.
   */
  it(
    "하네스 자기 검사 — 이 하네스는 실제 프로세스 종료와 화면을 관측한다",
    async () => {
      const obs = await selfCheck();

      expect({
        종료했다: obs.exitedWithinLimit,
        시그널: obs.signal,
        "화면이 비어 있지 않다": obs.raw.trim() !== "",
      }).toEqual({ 종료했다: true, 시그널: null, "화면이 비어 있지 않다": true });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * S-1 — 인터뷰 성공 기준 S-1: *"홈이 비고 `ANTHROPIC_API_KEY`가 env에도 파일에도 없는
   * 상태로 기동하면, 프로세스가 **도입 연출과 알약 선택 화면을 낸다.**"* §2가 그 자리를
   * 정한다 — `0b`는 1·2보다 앞이므로 §4의 fail-closed가 이 경로에서 먼저 걸릴 수 없다
   * (§2.3: *"첫 실행 경로에서는 모델 키의 부재가 실패가 아니라 온보딩의 **입력**"*).
   */
  it(
    "S-1 · 키 없이도 관문까지 간다 — 크리덴셜 부재로 죽지 않는다",
    async () => {
      const obs = await gateTrial();

      expect(judgeS1Reach(obs)).toEqual({
        "기동 직후 화면이 비어 있지 않다": true,
        "키 없이도 죽지 않는다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * S-1 · 전환 화면 둘 — §2.1 도입 연출: *"관문 **앞**에 전환 화면 둘을 둔다. 각각 한
   * 줄의 문면과 계속 안내를 내고 키 하나를 기다린 뒤 화면을 지운다. 세 번째 화면이
   * 관문이고"*. 같은 소절이 *"정하는 것은 위 셋과 단계의 수(둘)뿐이다"*로 **수를 계약으로**
   * 들었다.
   *
   * 재는 수단은 문면이 아니라 **관문 표지의 등장 시점**이다 — 전환 화면은 사실을 하나도
   * 들지 않는 순수 은유이므로(같은 소절), §2.1 문면 ①이 관문에 요구한 해석된 절대 경로는
   * 세 번째 화면에서 처음 나타나야 한다.
   */
  /**
   * **`it.fails`인 이유 — 계약은 확정됐고 구현이 아직이다** (2026-09-08 · 유저 판정).
   *
   * 위 §2.1 인용이 이 축의 정본이고 그 판정은 **닫혀 있다**. 안 선 것은 화면 구현이며
   * 그 소유는 Codex다(`packages/cli/src/first-run.ts`) — 실측으로 빈 홈의 **첫 화면이
   * 곧 관문**이고, 전환 화면 자리에 넣은 키는 관문의 무효 응답으로 되묻힌다.
   *
   * **`it.todo`가 아닌 것이 이 표기의 전부다.** `todo`는 아직 안 정해졌다는 뜻인데
   * 여기서 정해지지 않은 것은 없다 — 미규정과 미착지를 같은 칸에 넣으면 다음 감사가
   * 둘을 구별하지 못한다(이 파일 아래쪽 `it.todo`가 진짜 미규정의 자리다).
   *
   * **그래서 이 축은 착지의 트리거다.** 도입 연출이 서는 날 이 `it.fails`가 스스로
   * 붉어져 갱신을 강제한다 — 사람의 기억이 아니라 붉어진 축이 그날을 알린다.
   * **다만 이 표기가 재는 것은 오늘 계약이 안 지켜진다는 것까지이고 어떻게 틀렸는지는
   * 아니다** — 부분적으로 잘못 착지해도 통과한다. 그때 이 자리를 단언으로 되돌린다.
   */
  it.fails(
    "S-1 · 도입 연출 — 관문 앞에 키를 기다리는 전환 화면이 둘이다 [미착지: 구현은 Codex 소유]",
    async () => {
      const obs = await gateTrial();

      expect(judgeS1Transitions(obs)).toEqual({
        "키 0개 — 관문이 아직 아니다": true,
        "키 1개 — 관문이 아직 아니다": true,
        "키 2개 — 관문이 섰다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * S-1 · 관문 문면 — §2.1 문면 ①(*"조립이 쓸 홈으로 해석한 실제 절대 경로"*)과 귀결 표의
   * 이름 둘. 선택 **전**이므로 둘이 함께 서 있어야 한다(§2.1: *"기본 선택을 두지 않는다"*).
   */
  it(
    "S-1 · 관문 문면이 주입한 홈의 절대 경로와 선택지 둘을 든다",
    async () => {
      const obs = await gateTrial();

      expect(judgeS1GateText(obs)).toEqual({
        "주입한 홈의 절대 경로가 문면에 있다": true,
        "진행 쪽 이름이 있다": true,
        "취소 쪽 이름이 있다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * S-1 · §2.1: *"한 청크로 온 입력이 단계 경계에서 유실되지 않는다."* 계약 표면은 키를
   * 알지 않으므로 재는 것은 *"전환 키들과 선택 키를 함께 넣으면 선택이 읽힌다"*이지 어느
   * 바이트인가가 아니다.
   */
  it(
    "S-1 · 한 청크로 온 전환 키와 선택 키가 유실되지 않는다",
    async () => {
      const obs = await chunkTrial();

      expect(judgeS1Chunk(obs)).toEqual({
        "확인에 진행 쪽 이름이 있다": true,
        "그 뒤로 선택지가 다시 제시되지 않았다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  for (const point of ABORT_POINTS) {
    for (const [inputName] of ABORT_INPUTS) {
      /**
       * S-2 — §2.3 전부-아니면-전무: *"온보딩의 어느 단계에서 중단해도 `~/.neo-agent/`가
       * 존재하지 않고 종료 코드는 `0`이다."* §2.1의 중단 입력 셋이 그 모집단이고, 관문
       * 갈래는 같은 절의 귀결 표(*"아무것도 만들지 않고 종료한다"* · 코드 0)가 든다.
       *
       * 재는 것은 **디렉터리 자체**의 부재다 — 이 시행의 홈은 갓 만든 빈 자리라 중단
       * 전에는 없었고, 아무것도 만들지 않았다면 여전히 없어야 한다.
       */
      it(
        `S-2 · ${point.id}에서 ${inputName} — 종료 코드 0 · 홈 미생성`,
        async () => {
          const obs = await abortTrial(point.id, inputName);

          expect(judgeS2(obs)).toEqual(S2_EXPECTED);
        },
        AXIS_TIMEOUT_MS,
      );
    }
  }

  /**
   * S-2 부속 — 중단이 화면에 남는가. 판정 근거와 미규정 선언은 `judgeAbortNotice`가 든다.
   * 관문 갈래(§2.1의 확인 계약이 명문으로 걸리는 자리)를 대조군으로 함께 잰다 — 같은
   * 프로그램의 같은 중단 입력이 한쪽에서는 말하고 다른 쪽에서는 침묵하는지가 이 축의 내용이다.
   */
  it(
    "S-2 · 관문에서 중단하면 그 사실이 화면에 남는다",
    async () => {
      const atGate = await abortTrial("0b 관문", "Ctrl+C");

      expect(judgeAbortNotice(atGate)).toEqual({ "중단 뒤 화면이 비어 있지 않다": true });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * **[미규정] 온보딩(`0c`) 쪽에는 이 계약의 정본이 없다** — 그래서 단언이 아니라 `it.todo`다.
   *
   * 실측(2026-09-08): `0c`의 세 단계 어디서든 Ctrl+C·Ctrl+D를 넣으면 **출력 0바이트로**
   * 끝난다. 종료 코드 0·홈 미생성은 계약대로이고 갈리는 것은 화면뿐이다 — 같은 프로그램의
   * 같은 입력이 관문(`0b`)에서는 위 축이 재는 대로 말한다.
   *
   * **위반으로 올리지 않는 이유는 소유자가 없다는 것이다.** §2.1의 중단 소절은 스스로
   * *"이 소절은 넓혀지지 않는다"*라 적었고, §2.3은 중단의 귀결을 종료 코드와 홈 미생성으로만
   * 든다. 어느 절도 온보딩 중단의 **화면**을 정하지 않는다. `ARCHITECTURE.md` §2.6이
   * 방향을 주지만(*"아무것도 만들지 않고 설명도 없는 행동이 가장 나쁜 버그다"*) 그것은
   * 이 자리의 계약이 아니라 계약을 만들 근거다.
   *
   * **판정 필요**: §2.3에 계약으로 올릴 것인가, §12 표시 세부로 위임할 것인가. 올린다면
   * 구현의 소유는 Codex다(`first-run.ts`의 `createOnboardingIo`).
   */
  it.todo("[미규정] S-2 · 온보딩(`0c`)에서 중단해도 그 사실이 화면에 남는가 — 정본 없음");

  /**
   * 출처 고지 — §2.3 「이미 있는 값은 묻지 않는다」: *"건너뛴 사실은 화면에 남는다."*
   * 계약은 *"건너뛴 단계마다 그 사실과 값을 어디서 찾았는지가 화면에 있다"*이고,
   * `OnboardingIo.noteSkipped`의 `source`가 그 「어디서」의 닫힌 둘이다.
   */
  it(
    "출처 고지 · env에서 찾은 키를 건너뛰면 화면이 그 출처를 든다",
    async () => {
      const skipped = await sourceEnvTrial();
      const control = await sourceNoneTrial();

      expect(judgeSourceNotice(skipped, control, SOURCE_ENV)).toEqual({
        "건너뛴 갈래의 화면이 출처를 든다": true,
        "건너뛴 것이 없는 갈래에는 그 표지가 없다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * 출처 고지 — 파일 갈래. §2.3: *"env에 있든 `credentials` 파일에 있든 같다."*
   * 같은 시행이 `0a`의 통과 갈래이기도 하다(0600은 §4 보호 계약 1을 통과한다).
   */
  it(
    "출처 고지 · credentials 파일에서 찾은 키를 건너뛰면 화면이 그 출처를 든다",
    async () => {
      const skipped = await sourceFileTrial();
      const control = await sourceNoneTrial();

      expect(judgeSourceNotice(skipped, control, SOURCE_FILE)).toEqual({
        "건너뛴 갈래의 화면이 출처를 든다": true,
        "건너뛴 것이 없는 갈래에는 그 표지가 없다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * 출처 고지의 짝 — §2.1: *"이미 있었다면 그 내용이 그대로여야 한다."* 중단은 이미 있던
   * 파일도 건드리지 않으며, `0d`에 닿지 않았으므로 `config.json`도 생기지 않는다
   * (§2.3: *"디스크에 쓰는 지점은 `0d` 하나뿐이고, 세 답이 전부 확정된 뒤에만 온다"*).
   */
  it(
    "S-2 · 이미 있던 credentials가 중단으로 바뀌지 않고 새 파일도 안 생긴다",
    async () => {
      const obs = await sourceFileTrial();

      expect({
        "credentials 내용이 그대로다": obs.credentials === SEEDED_CREDENTIALS,
        "홈 내용물": obs.entries,
        "종료 코드": obs.code,
      }).toEqual({
        "credentials 내용이 그대로다": true,
        "홈 내용물": [CREDENTIALS],
        "종료 코드": 0,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * S-4 — §2.3 「결과는 그 프로세스에 실린다」: *"온보딩을 마치면 그 값으로 이 세션이
   * 돈다."* 인터뷰 S-4가 그것을 *"온보딩에서 고른 모델이 그 프로세스의 동결된 설정에
   * 실려 있다"*로 잰다. 이 층이 볼 수 있는 것은 화면이므로 **주입한 모델 문자열이 완주
   * 뒤 화면에 그대로 나타나는가**로 재고(§7이 허용 형태로 든 주입 데이터 확인),
   * `sessions.db`·`config.json`의 존재로 `0d`와 4를 지났음을 함께 본다.
   */
  it(
    "S-4 · 완주한 세션이 온보딩에서 고른 모델로 돈다",
    async () => {
      const obs = await completionTrial();

      expect(judgeS4(obs)).toEqual({
        "고른 모델이 완주 뒤 화면에 있다": true,
        "완주 뒤에도 프로세스가 살아 있다": true,
        "세션이 열렸다": true,
        "설정이 쓰였다": true,
      });
    },
    CHAIN_TIMEOUT_MS,
  );

  /**
   * S-4 — §2.3: *"「끝났으니 다시 실행하세요」를 두지 않는다."* 짝 없는 부정 단정이 되지
   * 않게 **같은 정규식이 대조군(`0a` 실패 화면 — 거기서는 「고친 뒤 다시 실행하라」가
   * 정당하다)에서 걸리는지를 같은 축에서 함께 잰다.** 대조군 쪽이 붉으면 붉은 것은 앱이
   * 아니라 이 정규식이고, 그 구별이 이 축이 헛돌지 않는 근거다.
   */
  it(
    "S-4 · 완주 화면에 「다시 실행하세요」류가 없다",
    async () => {
      const completion = await completionTrial();
      const control = await preflightPermTrial();

      expect(judgeS4NoRerun(completion, control)).toEqual({
        "완주 화면에 재실행 지시가 없다": true,
        "대조군(0a 실패 화면)에는 걸린다": true,
      });
    },
    CHAIN_TIMEOUT_MS,
  );

  /**
   * S-5 — §2.3: *"두 번째 기동은 묻지 않는다. `sessions.db`가 있으므로 `0`이 `returning`으로
   * 갈리고 `0a~0d`가 통째로 없다."* 재는 것은 대비쌍이다 — 알약 어휘는 관문 문면에만 사는
   * 층이므로(§2.1 · `LORE.md` §6) 첫 기동에는 있고 재기동에는 없어야 한다. REPL이 실제로
   * 입력을 받는지는 §5의 슬래시 명령 하나로 본다.
   */
  it(
    "S-5 · 두 번째 기동은 관문도 온보딩도 없이 REPL로 간다",
    async () => {
      const second = await secondLaunchTrial();
      const control = await gateTrial();

      expect(judgeS5(second, control)).toEqual({
        "재기동 화면에 알약 어휘가 없다": true,
        "대조군(첫 기동)에는 있다": true,
        "REPL이 입력을 받았다": true,
      });
    },
    CHAIN_TIMEOUT_MS,
  );

  /**
   * `0a` ① — §2.3 선행 검증 표: `credentials`의 **노출 비트(group·other)의 부재**를 재고
   * 판정의 정본은 §4 보호 계약 1이다(*"600이 아니면 수정 명령 안내와 함께 기동 거부"*).
   * §2.1이 그 자리를 관문 **앞**으로 못박았다 — *"먼저 물으면 동의를 받아 놓고 그 다음
   * 단계에서 죽는 순서가 되고"*. 그래서 이 갈래에서 알약 문면은 화면에 0건이어야 한다.
   */
  it(
    "0a · credentials가 0644면 관문 앞에서 기동이 실패한다",
    async () => {
      const obs = await preflightPermTrial();

      expect(judgePreflight(obs)).toEqual({
        종료했다: true,
        "종료 코드가 0이 아니다": true,
        "원인이 화면에 있다": true,
        "관문 문면이 화면에 없다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /** `0a` ② — 같은 자리, `config.json`의 파싱·레코드 검증. 판정의 정본은 §3이다 */
  it(
    "0a · config.json이 파손이면 관문 앞에서 기동이 실패한다",
    async () => {
      const obs = await preflightConfigTrial();

      expect(judgePreflight(obs)).toEqual({
        종료했다: true,
        "종료 코드가 0이 아니다": true,
        "원인이 화면에 있다": true,
        "관문 문면이 화면에 없다": true,
      });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * `0a` ③ — §2.3 선행 검증 표의 「읽기 가능성」. 2026-09-08 정정 전까지 이 표가
   * 노출 비트 한 겹만 들어 **이 갈래에 축이 없었다**(`K-583`).
   */
  it(
    "0a · credentials를 읽을 수 없으면 관문 앞에서 기동이 실패한다",
    async () => {
      const obs = await preflightUnreadableTrial();

      expect(judgePreflight(obs)).toEqual({
        종료했다: true,
        "종료 코드가 0이 아니다": true,
        "원인이 화면에 있다": true,
        "관문 문면이 화면에 없다": true,
      });
      // §2 말미 — *"원인과 다음 행동을 담은 에러로 종료한다"*. 원인은 위 판정이
      // 지고, 다음 행동은 이 줄이 진다(문면 자체는 §12가 위임한 표시 세부라
      // 리터럴로 고정하지 않고 「다시 실행」 지시의 존재만 잰다).
      expect(RERUN_INSTRUCTION.test(obs.raw), "다음 행동이 화면에 있다").toBe(true);
    },
    AXIS_TIMEOUT_MS,
  );

  /** `0a` ④ — 같은 표의 「dotenv 형식」. 위와 같은 이유로 축이 없던 갈래다(`K-583`) */
  it(
    "0a · credentials의 형식이 어긋나면 관문 앞에서 기동이 실패한다",
    async () => {
      const obs = await preflightMalformedTrial();

      expect(judgePreflight(obs)).toEqual({
        종료했다: true,
        "종료 코드가 0이 아니다": true,
        "원인이 화면에 있다": true,
        "관문 문면이 화면에 없다": true,
      });
      expect(RERUN_INSTRUCTION.test(obs.raw), "다음 행동이 화면에 있다").toBe(true);
    },
    AXIS_TIMEOUT_MS,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 역검증 — 위 판정에 **일부러 위반을 심어** red가 나는지 본다
//
// 위 축이 전부 초록이어도 그것이 「잰다」의 증거는 아니다(2026-09-08 실증: 엔진 층 FS
// 단정이 무엇을 심어도 초록이었다). 아래는 같은 판정 함수에 계약을 어긴 관측을 먹여
// **기대값과 갈리는 것**을 확인한다. pty가 없는 환경에서도 돈다 — 순수 함수이기 때문이다.
// ───────────────────────────────────────────────────────────────────────────

const OBS_SEED: Obs = {
  home: "/tmp/qa-home",
  homeMarker: `/tmp/qa-home/${HOME_DIR_NAME}`,
  screens: [],
  exitedAt: [],
  raw: "",
  exitedWithinLimit: true,
  code: 0,
  signal: null,
  homeExists: false,
  entries: [],
  credentials: null,
};

const planted = (patch: Partial<Obs>): Obs => ({ ...OBS_SEED, ...patch });

describe("역검증 — 심은 위반이 실제로 red를 낸다", () => {
  it("S-1 도달 — 관문 전에 죽는 관측을 거절한다", () => {
    const violation = planted({ screens: ["크리덴셜이 없다"], exitedAt: [true] });

    expect(judgeS1Reach(violation)).not.toEqual({
      "기동 직후 화면이 비어 있지 않다": true,
      "키 없이도 죽지 않는다": true,
    });
  });

  it("S-1 전환 화면 둘 — 기동 직후 관문이 서는 관측을 거절한다", () => {
    const gate = `계속하면 이 경로에 상태가 생긴다: ${OBS_SEED.homeMarker}`;
    const violation = planted({ screens: [gate, "", ""], raw: gate });

    expect(judgeS1Transitions(violation)).not.toEqual({
      "키 0개 — 관문이 아직 아니다": true,
      "키 1개 — 관문이 아직 아니다": true,
      "키 2개 — 관문이 섰다": true,
    });
  });

  it("S-1 관문 문면 — 틸데 표기만 있고 절대 경로가 없는 관측을 거절한다", () => {
    const violation = planted({
      raw: `~/${HOME_DIR_NAME}에 상태가 생긴다 [r] ${NAME_PROCEED} [b] ${NAME_CANCEL}`,
    });

    expect(judgeS1GateText(violation)).not.toEqual({
      "주입한 홈의 절대 경로가 문면에 있다": true,
      "진행 쪽 이름이 있다": true,
      "취소 쪽 이름이 있다": true,
    });
  });

  it("S-1 한 청크 — 선택을 읽은 뒤 선택지를 다시 내미는 관측을 거절한다", () => {
    const violation = planted({
      screens: ["", `✓ ${NAME_PROCEED} — 계속한다  [r] ${NAME_PROCEED} [b] ${NAME_CANCEL}`],
    });

    expect(judgeS1Chunk(violation)).not.toEqual({
      "확인에 진행 쪽 이름이 있다": true,
      "그 뒤로 선택지가 다시 제시되지 않았다": true,
    });
  });

  it("S-2 — 홈을 남기는 중단과 비영 종료 코드를 각각 거절한다", () => {
    expect(judgeS2(planted({ homeExists: true }))).not.toEqual(S2_EXPECTED);
    expect(judgeS2(planted({ code: 1 }))).not.toEqual(S2_EXPECTED);
    expect(judgeS2(planted({ exitedWithinLimit: false }))).not.toEqual(S2_EXPECTED);
  });

  it("S-2 중단 고지 — 아무 말 없이 끝나는 관측을 거절한다", () => {
    expect(judgeAbortNotice(planted({ screens: ["관문", "   "] }))).not.toEqual({
      "중단 뒤 화면이 비어 있지 않다": true,
    });
  });

  it("출처 고지 — 조용히 건너뛴 관측과 대조군 오염을 각각 거절한다", () => {
    const silent = planted({ screens: ["", "쓸 모델"] });
    const control = planted({ screens: ["", "쓸 모델"] });
    expect(judgeSourceNotice(silent, control, SOURCE_ENV)).not.toEqual({
      "건너뛴 갈래의 화면이 출처를 든다": true,
      "건너뛴 것이 없는 갈래에는 그 표지가 없다": true,
    });

    const noisyControl = planted({ screens: ["", "환경 변수의 기존 값 사용"] });
    const good = planted({ screens: ["", "환경 변수의 기존 값 사용"] });
    expect(judgeSourceNotice(good, noisyControl, SOURCE_ENV)).not.toEqual({
      "건너뛴 갈래의 화면이 출처를 든다": true,
      "건너뛴 것이 없는 갈래에는 그 표지가 없다": true,
    });
  });

  it("S-4 — 다른 모델로 도는 관측과 완주 뒤 죽는 관측을 각각 거절한다", () => {
    const expected = {
      "고른 모델이 완주 뒤 화면에 있다": true,
      "완주 뒤에도 프로세스가 살아 있다": true,
      "세션이 열렸다": true,
      "설정이 쓰였다": true,
    };
    const otherModel = planted({
      screens: ["", "", "세션 abc · claude-haiku-4-5-20251001"],
      exitedAt: [false, false, false],
      entries: [CONFIG_JSON, SESSIONS_DB],
    });
    expect(judgeS4(otherModel)).not.toEqual(expected);

    const diedAfterOnboarding = planted({
      screens: ["", "", `설정을 저장했다 · ${CHOSEN_MODEL}`],
      exitedAt: [false, false, true],
      entries: [CONFIG_JSON, SESSIONS_DB],
    });
    expect(judgeS4(diedAfterOnboarding)).not.toEqual(expected);
  });

  it("S-4 재실행 지시 — 「다시 실행」을 낸 완주 화면과 죽은 대조군을 각각 거절한다", () => {
    const expected = {
      "완주 화면에 재실행 지시가 없다": true,
      "대조군(0a 실패 화면)에는 걸린다": true,
    };
    const control = planted({ raw: "chmod 0600 … 뒤 다시 실행하라" });
    expect(
      judgeS4NoRerun(planted({ screens: ["", "", "설정을 저장했다. 다시 실행하세요"] }), control),
    ).not.toEqual(expected);
    // 대조군이 안 걸리면 이 축은 아무것도 못 재는 상태다 — 그것도 red여야 한다.
    expect(judgeS4NoRerun(planted({ screens: ["", "", "준비됐다"] }), planted({}))).not.toEqual(
      expected,
    );
  });

  it("S-5 — 재기동이 다시 묻는 관측과 REPL 침묵을 각각 거절한다", () => {
    const expected = {
      "재기동 화면에 알약 어휘가 없다": true,
      "대조군(첫 기동)에는 있다": true,
      "REPL이 입력을 받았다": true,
    };
    const control = planted({ raw: `[r] ${NAME_PROCEED} [b] ${NAME_CANCEL}` });
    const asksAgain = planted({ raw: `[r] ${NAME_PROCEED}`, screens: ["", "…"] });
    expect(judgeS5(asksAgain, control)).not.toEqual(expected);

    const silentRepl = planted({ raw: "neo-agent · 세션 abc", screens: ["배너", "  "] });
    expect(judgeS5(silentRepl, control)).not.toEqual(expected);
  });

  it("0a — 관문을 띄운 뒤 죽는 관측과 0으로 끝나는 관측을 각각 거절한다", () => {
    const expected = {
      종료했다: true,
      "종료 코드가 0이 아니다": true,
      "원인이 화면에 있다": true,
      "관문 문면이 화면에 없다": true,
    };
    const gateShownFirst = planted({
      code: 1,
      raw: `[r] ${NAME_PROCEED} [b] ${NAME_CANCEL} … 권한이 0644다`,
    });
    expect(judgePreflight(gateShownFirst)).not.toEqual(expected);

    const quietZero = planted({ code: 0, raw: "권한이 0644다" });
    expect(judgePreflight(quietZero)).not.toEqual(expected);

    const silentDeath = planted({ code: 1, raw: "" });
    expect(judgePreflight(silentDeath)).not.toEqual(expected);
  });
});
