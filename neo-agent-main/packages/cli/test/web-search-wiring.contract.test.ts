/**
 * `web_search` 배선 계약 — 독립 검증(T-012 ⑵).
 *
 * **기대값의 출처는 정본 문서뿐이다.** 구현 소스에서 기대값을 읽지 않았다 —
 * 아래 절 번호가 이 파일의 모든 단정의 출처다.
 *
 *   `docs/CLI-INTERFACE.md` §2  — 도구 열거·등록 순서 고정·시작 화면의 도구 집합 표시 ·
 *                                 **부재 사유 줄**(2026-09-07 신설 — 자리·문면·조건·쌍조건)
 *   `docs/CLI-INTERFACE.md` §4  — 키별 독립 우선순위(2026-09-02 개정) · 600 fail-closed의 자리 ·
 *                                 `secretValues` 합집합 · 키 부재 안내의 범위
 *   `docs/CLI-INTERFACE.md` §5.1 계약 6
 *                               — `cause`와 `nextAction`의 소유가 갈린다. 「축 정의가 든다」는
 *                                 그 문면을 다른 화면이 옮겨 적지 않는 근거다
 *   `docs/CLI-INTERFACE.md` §7  — 표시 문구 규약. 리터럴 금지와 그 예외(대비쌍·비침묵 프로브·
 *                                 주입 데이터 확인)
 *   `docs/CLI-INTERFACE.md` §12 — 표시 세부의 위임. 문면 자체는 세부이고 계약은 구성요소다
 *   `docs/WEB-ACCESS.md` §3.2   — 「등록」(조건부 등록·자리 고정·시스템 프롬프트 금지 ·
 *                                 2026-09-07 개정의 쌍조건) · 「시크릿」(키마다 독립)
 *   `docs/WEB-ACCESS.md` §4     — 허용되는 주입점 3개 · CLI는 채우지 않는다 · 주입이 상수를 못 바꾼다
 *   `docs/SAFE-DEFAULTS.md` §3  — 보호 계약 1(600 fail-closed) · 3(자식 프로세스 env 스크러빙)
 *
 * **구현에서 임포트한 값이 하나 있고, 그것은 기대값이 아니라 대조 대상이다**
 * (2026-09-07 개정 — 위 선언의 층위를 정정한다). 이 파일은 이제 `../src/doctor.ts`의
 * `DOCTOR_AXES`를 임포트한다. 그 값이 여기 오는 이유는 §5.1 계약 6이 복구 문면의 소유를
 * 축 정의에 두었고(*"축 정의가 든다"*), §2가 배너에 대해 *"그 줄이 드는 것은 부재와
 * 원인까지다. 「다음 행동」은 `neo-agent doctor`를 가리키고 옮겨 적지 않는다"*로 **그
 * 문면이 화면에 없어야 한다**를 계약으로 걸었기 때문이다 — 즉 이 임포트가 주는 것은
 * 「무엇이어야 하는가」가 아니라 **「무엇과 같으면 안 되는가」**다.
 *
 * **층위 규율 — 구현에서 임포트한 값은 대조 대상으로만 쓴다.** 기대값으로 쓰는 자리가
 * 생기면 그 축은 구현이 스스로를 채점하는 형태가 된다. 반대로 이 문면을 리터럴로 베껴
 * 오는 것도 안 된다 — 그러면 문면을 다듬는 날 배너가 아무것도 안 고쳤는데 축이 초록으로
 * 남는다(복제본만 낡기 때문이다). 같은 규율의 선례가 아래 §1의 첫 축이다: 키 **이름**은
 * 문서가 든 리터럴로 쓰고, 구현 상수와의 일치는 별도 축이 잰다.
 *
 * **역검증** (2026-09-02 수행): 「없어야 한다」 축 셋 — 프롬프트의 `web_search` 부재(§6),
 * 배선 소스의 심 주입 부재(§5), 주석 제거 술어 — 에 일부러 위반을 심어 술어가 실제로
 * 붉어지는 것을 확인했다. 그 확인은 이 파일 안의 `역검증` 단정으로 상주한다(일회 실험이
 * 아니라 축이다): 술어가 나중에 무뎌지면 그 자리가 먼저 붉어진다.
 *
 * **2026-09-07 — 소스 술어의 역검증이 셋 더 붙었다**(§7 역검증 ①②③). 그 절은 「없어야
 * 한다」가 아니라 **「형태가 이것뿐이어야 한다」**를 재므로 두 방향을 함께 세운다:
 * 위반을 심은 표본에서 붉어지는가(①③)와, 술어가 **못 맞추는** 표본에서 「통과」가
 * 아니라 **「대조군 실패」**로 끝나는가(②). 뒤쪽이 없으면 등록 자리를 리팩터링한 날
 * 그 절 전체가 조용한 그린이 된다.
 *
 * **대조군은 내용 독립 술어다** (2026-09-02 개정). 「없어야 한다」 축이 조용한 그린이 되지
 * 않게 하는 §6의 대조군은 길이 하한과 구조적 표지 — 모듈의 export 이름, 프롬프트에 실린
 * 워크스페이스 루트 — 로 잰다. 다른 도구 이름의 존재로 재던 이전 형태는 대조군을 프롬프트
 * 내용에 결합시켰고, 스캐폴드가 어느 도구도 이름으로 적지 않게 되면서 대상이 멀쩡한데도
 * 함께 무너졌다. **프롬프트가 도구 이름을 안 적는다는 일반 계약은 이 파일의 축이 아니다** —
 * 정본은 `CLI-INTERFACE.md` §3.1이고 별도 파일이 잰다. 여기 §6이 지는 것은 검색 도구
 * 하나의 재발 경로뿐이고, 그 소유는 `WEB-ACCESS.md` §3.2 「등록」이다.
 *
 * **네트워크를 쓰지 않는다.** 검색 도구는 생성만 하고 호출하지 않으며, 모델은 대역이다.
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
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_KEY_ENV, loadCredentials, SEARCH_API_KEY_ENV } from "../src/credentials.ts";
import { DOCTOR_AXES, type DoctorContext } from "../src/doctor.ts";
import { buildSystemPrompt } from "../src/system-prompt.ts";
import type { CliApp, CliDeps, WiringFactories } from "../src/wiring.ts";
import { startCli } from "../src/wiring.ts";
import { dockerAvailable, dockerProbeForbidden, dockerUnavailable } from "./probe-docker.ts";

/**
 * 키 이름은 **문서가 든 리터럴**이다 — 구현의 상수를 그대로 쓰면 이름이 바뀌어도
 * 아무것도 붉어지지 않는다(`CLI-INTERFACE.md` §4 「대상 키 둘」). 상수와의 일치는
 * 아래 첫 축이 따로 잰다.
 */
const MODEL_KEY = "ANTHROPIC_API_KEY";
const SEARCH_KEY = "TAVILY_API_KEY";

/** §2 등록 순서 — 파일 3종 → (shell) → web_fetch → web_search → remember */
const TOOLS_WITH_SEARCH = [
  "read_file",
  "write_file",
  "edit_file",
  "shell",
  "web_fetch",
  "web_search",
  "remember",
] as const;
const TOOLS_WITHOUT_SEARCH = [
  "read_file",
  "write_file",
  "edit_file",
  "shell",
  "web_fetch",
  "remember",
] as const;
const TOOLS_NO_SHELL_WITH_SEARCH = [
  "read_file",
  "write_file",
  "edit_file",
  "web_fetch",
  "web_search",
  "remember",
] as const;

let root: string;
let home: string;
let workspace: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neo-cli-search-wiring-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  mkdirSync(workspace, { recursive: true });
  // 3c 첫 기동 관문(§2.1)을 이미 지난 홈. 판정은 `sessions.db`의 부재 하나뿐이라
  // 빈 파일 하나면 «returning»이다. 모드를 명시하는 것은 umask가 깎은 권한이
  // 엉뚱한 경고를 화면에 올려 배너 단정을 깨뜨리는 것을 막기 위해서다.
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  chmodSync(join(home, ".neo-agent"), 0o700);
  writeFileSync(join(home, ".neo-agent", "sessions.db"), "");
  chmodSync(join(home, ".neo-agent", "sessions.db"), 0o600);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(settings: Record<string, unknown>): void {
  writeFileSync(join(home, ".neo-agent", "config.json"), JSON.stringify(settings));
}

/**
 * `~/.neo-agent/memory/MEMORY.md`를 **`startCli` 전에** 쓴다(`MEMORY.md` §3.1 — 3b는 1회 읽는다).
 *
 * 배너의 메모리 줄은 **블록이 붙을 때만** 선다(`MEMORY.md` §7.4 A-8b). §2의 자리 계약이
 * *"메모리 줄 위"*를 든 이상, 그 줄이 없는 구성에서는 잴 대상 자체가 없다 — 그래서 자리 축은
 * 이 헬퍼로 메모리 줄을 실물로 세운 기동에서만 돈다.
 */
function writeMemory(text: string): void {
  mkdirSync(join(home, ".neo-agent", "memory"), { recursive: true });
  const path = join(home, ".neo-agent", "memory", "MEMORY.md");
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** `~/.neo-agent/credentials`를 쓴다. 모드 기본값은 계약이 요구하는 600이다 */
function writeCredentials(content: string, mode = 0o600): string {
  const path = join(home, ".neo-agent", "credentials");
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
  return path;
}

function fakeModel(): ModelClient {
  return {
    modelId: "fake-model",
    async *stream(): AsyncIterable<ModelStreamEvent> {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "." }],
          stopReason: "end_turn",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

interface Rig {
  deps: CliDeps;
  text(): string;
  /** `createSearchTool`이 받은 인자 — 부르지 않았으면 빈 배열이다 */
  searchToolDeps: Record<string, unknown>[];
  executorSecrets: (readonly string[] | undefined)[];
  /**
   * `deps.out`(§1 고지 싱크)로 나간 고지를 **한 건씩** 담는다. `captureNotices`를 켠
   * 리그에서만 찬다.
   *
   * **이것이 배너를 다른 고지와 가르는 유일한 수단이다.** 화면 전체 문자열로는 못 가른다 —
   * 5b의 셸 안내와 배너가 같은 스트림에 이어 붙으므로, 「배너 **안**에 있는가」를 묻는
   * 축(자리 계약 · 판정 C-7)은 경계를 알아야 성립한다. 배선이 이 싱크를 **주입 표면으로
   * 이미 열어 두었으므로**(`CliDeps.out`) 이 캡처는 구현을 고치지 않는다.
   */
  notices: string[];
}

function createRig(
  options: {
    env?: NodeJS.ProcessEnv;
    probeDocker?: WiringFactories["probeDocker"];
    /** 켜면 고지가 `deps.out`으로 나가고 `rig.notices`에 한 건씩 쌓인다. 기본은 오늘 그대로다 */
    captureNotices?: boolean;
  } = {},
): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 120;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const searchToolDeps: Record<string, unknown>[] = [];
  const executorSecrets: (readonly string[] | undefined)[] = [];
  const notices: string[] = [];

  const deps: CliDeps = {
    argv: [],
    env: options.env ?? { [MODEL_KEY]: "sk-ant-테스트" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-qa-search",
    factories: {
      createModelClient: () => fakeModel(),
      // Docker 판정은 **명시 주입**이다(`./probe-docker.ts`).
      probeDocker: options.probeDocker ?? dockerAvailable(),
      createExecutor: (opts) => {
        executorSecrets.push(opts.secretValues);
        return realFactories.createExecutor(opts);
      },
      createSearchTool: (searchDeps) => {
        searchToolDeps.push({ ...searchDeps });
        return realFactories.createSearchTool(searchDeps);
      },
    },
    // 싱크를 주면 조립이 **그대로 쓴다**(§1). 화면에도 흘려보내는 것은 기존 축들이
    // `rig.text()`로 배너를 계속 볼 수 있게 하기 위해서다 — 캡처가 다른 축의 모집단을
    // 줄이면 이 캡처 자체가 조용한 그린을 만든다.
    ...(options.captureNotices === true
      ? {
          out: {
            write(text: string): void {
              notices.push(text);
              output.write(text);
            },
          },
        }
      : {}),
  };

  return {
    deps,
    text: () => stripAnsi(chunks.join("")),
    searchToolDeps,
    executorSecrets,
    notices,
  };
}

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
  return text.replace(/\[[0-9;?]*[ -/]*[@-~]/g, "");
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function settle(rounds = 10): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

/** 배너는 `run()`에서 나간다 — 화면을 재는 축은 이것을 통해야 한다 */
async function start(rig: Rig): Promise<{ app: CliApp; running: Promise<void> }> {
  const app = await startCli(rig.deps, { kind: "run" });
  const running = app.run();
  await settle();
  return { app, running };
}

const realFactories = await (async () => {
  const { resolveFactories } = await import("../src/wiring.ts");
  return resolveFactories();
})();

function toolNames(app: CliApp): string[] {
  return app.parts.tools.map((tool) => tool.name);
}

/** 문자열에 needle이 몇 번 나오는가 — 「0건」 축의 술어 */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// ───────────────────────────────────────────────────────────────────────────
// 배너 술어 — §2의 자리·조건 계약을 재는 도구
//
// **앵커를 리터럴로 잡는 것이 §7의 금지에 걸리지 않는 근거.** 여기 쓰는 세 표기
// (`neo-agent · 세션` · `도구 N종:` · `메모리 N항목`)는 **문면을 고정하려는 단독
// 리터럴이 아니라 줄을 찾는 좌표**다. §7이 허용한 쪽 — *"서로 다른 상태가 서로 다른
// 출력을 낳는가, 그 출력이 비어 있지 않은가"* — 를 재기 위해 먼저 「어느 줄인가」를
// 정해야 하고, §2의 계약이 *"도구 줄"*·*"메모리 줄"*이라는 **줄의 정체**로 쓰였기
// 때문에 좌표 없이는 계약을 문장으로 옮길 수조차 없다. 문면이 다듬어져 이 앵커가
// 어긋나면 축은 통과가 아니라 **대조군 실패**로 붉어진다(아래 모든 축이 앵커 발견을
// 먼저 단정한다) — 그것이 「조용히 계약이 되는 것」과 갈리는 자리다.
// ───────────────────────────────────────────────────────────────────────────

/** 배너의 첫 줄(§2 시작 화면). 여러 고지 중 배너를 고르는 좌표다 */
const BANNER_HEAD = /^neo-agent · 세션 /;
/** §2 — "등록되는 도구 집합이 시작 화면에 보여야 한다"의 그 줄 */
const TOOL_LINE = /^도구 \d+종:/;
/** `MEMORY.md` §7.1의 규모 표시 줄. §2의 자리 계약이 이 줄을 아래 경계로 든다 */
const MEMORY_LINE = /^메모리 \d+항목/;

/** 고지 중 배너 한 건(ANSI 제거). 없으면 `undefined` — 부재는 통과가 아니라 대조군 실패다 */
function bannerNoticeOf(notices: readonly string[]): string | undefined {
  return notices.map(stripAnsi).find((notice) => BANNER_HEAD.test(notice));
}

/**
 * 배너의 줄 배열. **빈 줄을 걸러내지 않는다** — 걸러내면 도구 줄과 부재 줄 사이에 빈 줄이
 * 끼어도 「바로 아래」가 참으로 보인다. §2의 문면은 인접이고, 그래서 이 함수는 꼬리 개행만
 * 벗긴다.
 */
function bannerLinesOf(notices: readonly string[]): string[] {
  const notice = bannerNoticeOf(notices);
  if (notice === undefined) return [];
  return notice.replace(/\n+$/, "").split("\n");
}

function indexOfToolLine(lines: readonly string[]): number {
  return lines.findIndex((line) => TOOL_LINE.test(line));
}

function indexOfMemoryLine(lines: readonly string[]): number {
  return lines.findIndex((line) => MEMORY_LINE.test(line));
}

/**
 * 부재 사유 줄의 자리 — **도구 줄이 아닌 줄 중** 그 도구 이름을 든 줄.
 * §2가 그 줄을 「도구 줄의 주석」으로 규정했으므로 도구 줄 자신은 모집단 밖이다.
 */
function indexOfAbsenceLine(lines: readonly string[], toolIndex: number): number {
  return lines.findIndex((line, index) => index !== toolIndex && line.includes("web_search"));
}

/** §2가 그 줄에 요구한 **구성요소 넷**. 문장이 아니라 이 넷의 존재가 계약이다 */
interface AbsenceComponents {
  /** ㉠ 부재를 이름으로 말한다 */
  readonly tool: boolean;
  /** ㉡ 원인 — 못 찾은 열쇠의 이름 */
  readonly key: boolean;
  /** ㉢ 문면 — §2가 낱말 자체를 계약으로 든 유일한 자리 */
  readonly phrase: boolean;
  /** ㉣ 다음 행동은 **가리키기만** 한다 */
  readonly doctor: boolean;
}

function componentsOf(line: string): AbsenceComponents {
  return {
    tool: line.includes("web_search"),
    key: line.includes(SEARCH_KEY),
    // **이 한 낱말만 리터럴이다.** §2 2026-09-07: "문면은 「없다」가 아니라 「못 찾았다」다".
    // §7이 *"문구 자체가 계약이어야 하는 자리"*를 세부에서 떼어 이름으로 들라 했고 §2가
    // 정확히 그것을 했다 — 근거가 참·거짓이기 때문이다(로더가 빈 값을 부재로 접으므로
    // 「없다」는 열쇠를 적어 둔 사용자에게 거짓이다). 나머지 셋은 낱말이 아니라 **식별자**다.
    phrase: line.includes("못 찾았다"),
    doctor: /\bdoctor\b/.test(line),
  };
}

/**
 * 복구 문면을 **옮겨 적었는지**를 잴 조각들.
 *
 * 전체 문자열 하나로 `not.toContain` 하면 축이 장식이 된다 — 그 문면에는 크리덴셜 경로가
 * 박혀 있어 **어떤 구현에서도 초록**이다. §2가 금지한 것은 복제이고 그 금지는 부분 복제에도
 * 걸리므로(*"복구 문면은 이미 정확히 한 곳에 있고"* — 두 문면이 되는 것이 결함이다),
 * 주입된 값으로 먼저 자르고 문장 종결로 다시 잘라 **조각 단위**로 잰다.
 */
function copyFragments(nextAction: string, injected: string): string[] {
  return nextAction
    .split(injected)
    .flatMap((part) => part.split(/(?<=다\.)\s*/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 10);
}

/**
 * `DOCTOR_AXES`의 문면을 부르는 데 필요한 컨텍스트. **경로는 문서가 든 자리에서 짓는다** —
 * 구현의 경로 해석 함수를 임포트하면 이 파일이 대조 대상을 구현에서 두 번 읽게 된다.
 */
function doctorContext(): DoctorContext {
  return {
    configPath: join(home, ".neo-agent", "config.json"),
    credentialsPath: join(home, ".neo-agent", "credentials"),
    memoryDir: join(home, ".neo-agent", "memory"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. 크리덴셜 — 우선순위는 키마다 독립이다 (CLI-INTERFACE §4 · WEB-ACCESS §3.2)
// ═══════════════════════════════════════════════════════════════════════════

describe("1. 키별 독립 우선순위 (CLI-INTERFACE §4)", () => {
  /**
   * 근거: §4 「대상 키 둘」이 `ANTHROPIC_API_KEY`와 `TAVILY_API_KEY`를 이름으로 든다.
   * 상수 이름이 갈리면 사용자가 문서대로 파일을 써도 키가 안 읽힌다 — 조용한 실패다.
   */
  it("env 변수 이름 둘이 문서가 든 리터럴과 같다", () => {
    expect(API_KEY_ENV).toBe(MODEL_KEY);
    expect(SEARCH_API_KEY_ENV).toBe(SEARCH_KEY);
  });

  /**
   * **이 축이 개정의 이유 자체다.** 근거: §4 우선순위 블록 —
   * "있으면 그 키에 한해 파일 값을 쓰지 않는다".
   * `WEB-ACCESS.md` §3.2 시크릿 항이 같은 것을
   * "한 키를 env로 준 것이 다른 키의 파일 값을 가리지 않는다"로 든다.
   */
  it("모델 키를 env로 줘도 파일의 검색 키가 읽힌다", () => {
    const path = writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const loaded = loadCredentials({ [MODEL_KEY]: "모델-env" }, path);
    expect(loaded.apiKey).toBe("모델-env");
    expect(loaded.searchApiKey).toBe("검색-파일");
  });

  /** 반대 방향도 같다 — 검색 키를 env로 준 것이 모델 키의 파일 값을 가리지 않는다 */
  it("검색 키를 env로 줘도 파일의 모델 키가 읽힌다", () => {
    const path = writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const loaded = loadCredentials({ [SEARCH_KEY]: "검색-env" }, path);
    expect(loaded.apiKey).toBe("모델-파일");
    expect(loaded.searchApiKey).toBe("검색-env");
  });

  /** 키 단위로 env가 이긴다 — 검색 키가 양쪽에 있으면 env 값이다 */
  it("검색 키가 env와 파일 양쪽에 있으면 env가 이긴다", () => {
    const path = writeCredentials([`${MODEL_KEY}=모델-파일`, `${SEARCH_KEY}=검색-파일`].join("\n"));
    const loaded = loadCredentials({ [SEARCH_KEY]: "검색-env" }, path);
    expect(loaded.searchApiKey).toBe("검색-env");
  });

  /** 파일이 아예 없어도 두 키 모두 env로 로드된다 (일회 실행 경로 — §4 env 우선의 근거) */
  it("파일이 없어도 두 키가 env에서 로드된다", () => {
    const loaded = loadCredentials(
      { [MODEL_KEY]: "모델-env", [SEARCH_KEY]: "검색-env" },
      join(home, ".neo-agent", "credentials"),
    );
    expect(loaded.apiKey).toBe("모델-env");
    expect(loaded.searchApiKey).toBe("검색-env");
  });

  /**
   * 근거: §4 「대상 키 둘」 — 검색 키는
   * "없으면 web_search를 등록하지 않고 기동은 계속한다".
   * 로더 층에서 그것은 **던지지 않고 `searchApiKey`가 없는 채로 돌아간다**로 나타난다.
   */
  it("검색 키가 어디에도 없어도 로드는 성공한다", () => {
    const path = writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const loaded = loadCredentials({}, path);
    expect(loaded.apiKey).toBe("모델-파일");
    expect(loaded.searchApiKey).toBeUndefined();
  });

  /**
   * 근거: §4 키 부재 항 — "검색 키의 부재는 이 안내에 끼지 않는다".
   * 검색은 없어도 도는 것이 계약이므로 기동 실패 안내에 낄 자리가 아니다.
   */
  it("모델 키 부재 안내에 검색 키 이름이 끼지 않는다", () => {
    let message = "";
    try {
      loadCredentials({}, join(home, ".neo-agent", "credentials"));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain(MODEL_KEY);
    expect(message).not.toContain(SEARCH_KEY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. 600 fail-closed는 갈래와 무관하게 앞에 선다
//    (SAFE-DEFAULTS §3 보호 계약 1 · CLI-INTERFACE §4)
// ═══════════════════════════════════════════════════════════════════════════

describe("2. 600 fail-closed의 자리 (SAFE-DEFAULTS §3 보호 계약 1)", () => {
  /**
   * 근거: §4 — "600 fail-closed 검사는 갈래와 무관하게 앞에 선다".
   * 같은 절이 실패 양태까지 적는다: 키별 우선순위를 «env로 받은 키가 있으면 파일
   * 갈래로 안 간다»의 형태로 짜면 검사가 갈래 안으로 밀려 보호 계약 1이 함께 무너진다.
   */
  it("모델 키가 env에 있고 파일에 검색 키만 있어도 느슨한 파일은 기동을 거부한다", () => {
    const path = writeCredentials(`${SEARCH_KEY}=검색-파일\n`, 0o644);
    expect(() => loadCredentials({ [MODEL_KEY]: "모델-env" }, path)).toThrow(/chmod/);
  });

  /**
   * **두 키가 모두 env인 구성이 이 계약의 가장 얇은 자리다** — 파일의 어느 값도 쓰이지
   * 않으므로 「안 읽으면 그만」이 가장 자연스러운 최적화이고, 그때 노출된 파일이 영영
   * 보고되지 않는다. §4는 그 경우에도 검사가 앞이라고 정한다.
   */
  it("두 키가 모두 env여도 느슨한 파일은 기동을 거부한다", () => {
    const path = writeCredentials(`${SEARCH_KEY}=검색-파일\n`, 0o644);
    expect(() =>
      loadCredentials({ [MODEL_KEY]: "모델-env", [SEARCH_KEY]: "검색-env" }, path),
    ).toThrow(/chmod/);
  });

  /** 근거: SAFE-DEFAULTS §3-1 — 자동 chmod로 조용히 고치지 않는다. 거부 뒤에도 권한 그대로 */
  it("거부 뒤에도 파일 권한을 고치지 않는다", () => {
    const path = writeCredentials(`${SEARCH_KEY}=검색-파일\n`, 0o644);
    try {
      loadCredentials({ [MODEL_KEY]: "모델-env" }, path);
    } catch {
      // 거부는 기대된 결과다
    }
    expect((statSync(path).mode & 0o777).toString(8)).toBe("644");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. `secretValues`는 두 갈래의 합집합이다
//    (CLI-INTERFACE §4 · SAFE-DEFAULTS §3 보호 계약 3)
// ═══════════════════════════════════════════════════════════════════════════

describe("3. secretValues 합집합 (CLI-INTERFACE §4)", () => {
  /**
   * 근거: §4 — "파일을 읽었으면 키 이름과 무관하게 그 파일의 모든 값이 들어가고,
   * env로 온 값도 함께 들어간다". 그래야 보호 계약 3(자식 프로세스 env에서 시크릿
   * 제거)이 **env 갈래에서도** 참이 된다.
   */
  it("env로 온 값과 파일의 모든 값이 함께 실린다", () => {
    const path = writeCredentials(
      [`${MODEL_KEY}=모델-파일`, `${SEARCH_KEY}=검색-파일`, "OTHER_TOKEN=기타-파일"].join("\n"),
    );
    const loaded = loadCredentials({ [MODEL_KEY]: "모델-env" }, path);
    expect([...loaded.secretValues].sort()).toEqual(
      ["기타-파일", "검색-파일", "모델-env", "모델-파일"].sort(),
    );
  });

  /**
   * **가려진 파일 값이 빠지면 그 갈래에서만 시크릿이 자식 프로세스로 샌다.**
   * 위 축의 부분집합이지만 이름을 따로 세운다 — 실패했을 때 무엇이 깨졌는지가
   * 「집합이 다르다」보다 「가려진 값이 스크러빙 대상에서 빠졌다」로 읽혀야 한다.
   */
  it("env가 가린 파일의 모델 키 값도 스크러빙 대상에 남는다", () => {
    const path = writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const loaded = loadCredentials({ [MODEL_KEY]: "모델-env" }, path);
    expect(loaded.secretValues).toContain("모델-파일");
    expect(loaded.secretValues).toContain("모델-env");
  });

  /**
   * 통합 — 그 합집합이 실제로 호스트 실행자에게 간다(§2 시퀀스 6 ·
   * SAFE-DEFAULTS §3 보호 계약 3 「자식 프로세스 env에서 시크릿 제거」).
   * `sandbox: "off"`인 것은 호스트 실행자 갈래를 골라야 관측되기 때문이다.
   */
  it("호스트 실행자가 합집합을 그대로 받는다", async () => {
    writeConfig({ sandbox: "off" });
    writeCredentials([`${MODEL_KEY}=모델-파일`, `${SEARCH_KEY}=검색-파일`].join("\n"));
    const rig = createRig({
      env: { [MODEL_KEY]: "모델-env" },
      probeDocker: dockerProbeForbidden(),
    });
    const app = await startCli(rig.deps, { kind: "run" });

    expect(rig.executorSecrets).toHaveLength(1);
    expect([...(rig.executorSecrets[0] ?? [])].sort()).toEqual(
      ["검색-파일", "모델-env", "모델-파일"].sort(),
    );
    await app.shutdown();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. 등록 — 조건부이되 자리는 고정이다
//    (WEB-ACCESS §3.2 「등록」 · CLI-INTERFACE §2)
// ═══════════════════════════════════════════════════════════════════════════

describe("4. 조건부 등록과 자리 고정 (WEB-ACCESS §3.2 등록)", () => {
  /**
   * 근거: §2 — 등록 위치는 파일 3종 → (shell) → web_fetch → web_search → remember이고
   * "조건부인 것과 자리가 고정인 것은 모순이 아니며" 순서 계약이 그대로 걸린다.
   * 개수가 아니라 **순서 있는 이름 목록**을 단정한다 — 개수만 세면 자리가 바뀌어도 통과하고,
   * 그때 깨지는 것은 프롬프트 캐시의 바이트 안정성이라 화면에 아무것도 안 뜬다.
   */
  it("검색 키가 있으면 web_fetch 뒤·remember 앞에 등록된다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig();
    const { app, running } = await start(rig);

    expect(toolNames(app)).toEqual([...TOOLS_WITH_SEARCH]);
    await app.shutdown();
    await running;
  });

  /**
   * 근거: `WEB-ACCESS.md` §3.2 등록 항 —
   * "검색 키가 없으면 도구를 등록하지 않는다. 기동은 막지 않는다".
   * **기동이 성공한다는 것이 계약의 절반이다** — 여기서 죽으면 오늘 잘 도는 설치가
   * 업그레이드만으로 멈춘다.
   */
  it("검색 키가 없으면 등록하지 않고, 남은 도구의 순서는 변하지 않는다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const rig = createRig({ env: {} });
    const { app, running } = await start(rig);

    expect(toolNames(app)).toEqual([...TOOLS_WITHOUT_SEARCH]);
    expect(toolNames(app)).not.toContain("web_search");
    await app.shutdown();
    await running;
  });

  /** 검색 키가 없으면 검색 도구 팩토리가 **아예 불리지 않는다** */
  it("검색 키가 없으면 검색 도구 팩토리를 부르지 않는다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const rig = createRig({ env: {} });
    const { app, running } = await start(rig);

    expect(rig.searchToolDeps).toHaveLength(0);
    await app.shutdown();
    await running;
  });

  /**
   * 자리 고정이 **다른 조건부 도구의 부재와 겹칠 때도** 성립하는지 —
   * §2: shell이 빠져도 "남은 도구의 순서는 변하지 않는다".
   */
  it("shell이 빠져도 web_search의 자리는 그대로다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig({ probeDocker: dockerUnavailable() });
    const { app, running } = await start(rig);

    expect(toolNames(app)).toEqual([...TOOLS_NO_SHELL_WITH_SEARCH]);
    await app.shutdown();
    await running;
  });

  /**
   * 근거: §2 — "등록되는 도구 집합이 시작 화면에 보여야 한다"
   * (숨겨진 도구가 조용히 빠지면 사용자는 왜 안 되는지 모른다).
   * `WEB-ACCESS.md` §3.2가 이 도구를 그 계약의 새 소비 지점으로 든다.
   */
  it("배너가 등록된 도구 집합을 그대로 싣는다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig();
    const { app, running } = await start(rig);

    const screen = rig.text();
    for (const name of TOOLS_WITH_SEARCH) expect(screen).toContain(name);
    expect(screen).toContain(`도구 ${TOOLS_WITH_SEARCH.length}종`);
    await app.shutdown();
    await running;
  });

  /**
   * 반대 갈래 — 등록되지 않은 도구는 **도구 목록에** 없다(있다고 보이면 그것이 거짓 고지다).
   *
   * **2026-09-07 개정 — 대리를 좁혔다.** 이 축은 그날까지 화면 전체에서 그 이름이 0건임을
   * 단정했고, §2가 그 단정을 자기 손으로 깨뜨렸다: 같은 절이 신설한 부재 사유 줄이 **그
   * 이름을 화면에 싣는다**. 정본이 그 자리에서 밝힌 대로, 원래 재려던 계약은 「등록 안 된
   * 도구가 도구 목록에 있다고 보이면 거짓 고지다」이고 **화면 전수는 그 대리**였다. 대리를
   * 계약의 실제 모집단(도구 줄 하나)으로 좁힌다 — 새 줄의 단정은 아래 §4b가 따로 세운다.
   *
   * **좁히는 것이 커버리지 손실이 아닌 근거**: 화면 전수가 잡되 도구 줄이 못 잡는 형태는
   * 「배너 다른 자리가 그 도구를 등록된 것처럼 말한다」인데, §4b의 조건부 축이 검색 열쇠가
   * **있는** 기동에서 도구 줄 밖의 그 이름 0건을 재고, 없는 기동에서는 도구 줄 밖의 그
   * 이름이 **부재 줄 정확히 하나**임을 잰다. 두 축을 합치면 모집단이 다시 화면 전체다.
   */
  it("검색 키가 없으면 도구 줄에 web_search가 없다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    const rig = createRig({ env: {} });
    const { app, running } = await start(rig);

    const screen = rig.text();
    expect(screen).toContain(`도구 ${TOOLS_WITHOUT_SEARCH.length}종`);

    const toolLine = /^도구 \d+종:.*$/m.exec(screen)?.[0];
    // **대조군** — 줄 추출이 실패하면 아래 부정 단정이 공허하게 통과한다. 부재를 재는
    // 축에서 모집단이 `undefined`인 것과 「없다」는 구별되지 않는다.
    expect(toolLine).not.toBeUndefined();
    expect(toolLine).toContain("web_fetch");
    expect(toolLine).toContain("remember");

    expect(toolLine).not.toContain("web_search");
    await app.shutdown();
    await running;
  });

  /**
   * env로만 준 검색 키도 도구까지 간다 — 파일 생성 없는 일회 실행이 §4가 env 우선을
   * 정한 근거이고(라이브 스모크·CI), 그 경로가 도구 등록까지 닿는지는 여기서만 보인다.
   */
  it("크리덴셜 파일이 없어도 env의 검색 키로 등록된다", async () => {
    writeConfig({});
    const rig = createRig({ env: { [MODEL_KEY]: "모델-env", [SEARCH_KEY]: "검색-env" } });
    const { app, running } = await start(rig);

    expect(toolNames(app)).toEqual([...TOOLS_WITH_SEARCH]);
    expect(rig.searchToolDeps[0]?.apiKey).toBe("검색-env");
    await app.shutdown();
    await running;
  });

  /**
   * 키별 독립 우선순위의 **통합 귀결**: 모델 키를 env로 준 설치에서도 파일의 검색 키가
   * 도구까지 흘러간다. 로더 단위 축(§1)이 참이어도 배선이 다른 값을 넘기면 여기서만 보인다.
   */
  it("모델 키가 env여도 파일의 검색 키가 도구 배선까지 흘러간다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig({ env: { [MODEL_KEY]: "모델-env" } });
    const { app, running } = await start(rig);

    expect(toolNames(app)).toContain("web_search");
    expect(rig.searchToolDeps).toHaveLength(1);
    expect(rig.searchToolDeps[0]?.apiKey).toBe("검색-파일");
    await app.shutdown();
    await running;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4b. 부재 사유 줄 — 판정이 없는 조건부 도구의 「왜」는 배너가 진다
//     (CLI-INTERFACE §2 2026-09-07 신설 · §5.1 계약 6 · §7 · §12 ·
//      WEB-ACCESS §3.2 「등록」 2026-09-07 개정)
//
// **재는 것은 구성요소의 존재와 자리이지 문장이 아니다.** §12가 표시 세부(배치·라벨·
// 문구)를 위임했고 §7이 *"서로 다른 상태가 서로 다른 출력을 낳는가, 그 출력이 비어
// 있지 않은가"*를 테스트의 몫으로 정했다. 예외 하나가 「못 찾았다」이고 그 근거는
// `componentsOf`가 자기 자리에서 든다.
// ═══════════════════════════════════════════════════════════════════════════

describe("4b. 부재 사유 줄 (CLI-INTERFACE §2 2026-09-07)", () => {
  /**
   * 근거: §2 — "부재의 「이유」는 판정이 있으면 그 판정의 자리가, 없으면 배너가 진다" ·
   * "그 줄이 드는 것은 부재와 원인까지다. 「다음 행동」은 `neo-agent doctor`를 가리키고
   * 옮겨 적지 않는다" · "문면은 「없다」가 아니라 「못 찾았다」다".
   *
   * **넷이 한 줄에 선다.** §2가 그것을 "부재 줄" 하나로 부르고 자리 계약(도구 줄과 메모리
   * 줄 **사이**)이 그 수를 산술로 못박는다 — 두 줄이면 인접이 성립하지 않는다.
   */
  it("검색 키가 없으면 도구 줄 밖의 한 줄이 부재·원인·「못 찾았다」·doctor 지목을 함께 든다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    writeMemory("- 자리 계약을 재려면 메모리 줄이 실물로 있어야 한다\n");
    const rig = createRig({ env: {}, captureNotices: true });
    const { app, running } = await start(rig);

    const lines = bannerLinesOf(rig.notices);
    // **대조군 ①** — 배너 추출이 실패하면 아래가 전부 공허하다
    expect(lines.length).toBeGreaterThan(2);
    const toolIndex = indexOfToolLine(lines);
    expect(toolIndex).toBeGreaterThanOrEqual(0);
    // **대조군 ②** — 도구 줄이 실제로 도구를 싣는다(좌표를 잘못 잡은 것이 아니다)
    expect(lines[toolIndex]).toContain("web_fetch");

    const absence = lines.filter(
      (line, index) => index !== toolIndex && line.includes("web_search"),
    );
    // ㉠ 부재를 이름으로 말한다 — 그리고 **정확히 한 줄**이다
    expect(absence).toHaveLength(1);
    // ㉡㉢㉣ — 넷이 같은 줄에 있다
    expect(componentsOf(absence[0] ?? "")).toEqual({
      tool: true,
      key: true,
      phrase: true,
      doctor: true,
    });

    await app.shutdown();
    await running;
  });

  /**
   * 근거: §5.1 계약 6이 `cause`와 `nextAction`의 소유를 갈랐고("축 정의가 든다"),
   * §2가 그것을 한 겹 밖에 적용했다 — 배너는 `doctor`를 **가리키기만** 한다.
   * 계약 6이 같은 형태를 `shell`에 대해 이미 금지했다:
   * "그것을 doctor가 다시 쓰면 같은 상황의 안내가 두 문면이 된다".
   *
   * **대조 대상을 구현에서 임포트하는 것이 이 축의 성립 조건이다**(파일 머리 층위 규율).
   * 리터럴로 베껴 오면 그 문면이 다듬어지는 날 이 축만 낡아 초록으로 남는다.
   */
  it("그 줄이 doctor 축의 복구 문면을 조각으로도 옮겨 적지 않는다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    writeMemory("- 부재 줄과 복구 문면의 대조\n");
    const rig = createRig({ env: {}, captureNotices: true });
    const { app, running } = await start(rig);

    const context = doctorContext();
    const nextAction = DOCTOR_AXES["search-credentials"].nextAction(context);
    const fragments = copyFragments(nextAction, context.credentialsPath);
    // **대조군 ①** — 비교 대상이 비면 아래 부정 단정이 공허하다
    expect(nextAction).toContain(SEARCH_KEY);
    expect(fragments.length).toBeGreaterThanOrEqual(2);

    const banner = bannerLinesOf(rig.notices).join("\n");
    // **대조군 ②** — 배너가 실제로 부재 줄을 담고 있다. 줄이 없으면 「안 옮겨 적었다」는
    //   참이되 아무것도 재지 않는다(구현 전에는 이 대조군이 먼저 붉어지는 것이 정상이다).
    expect(banner).toContain("web_search");

    for (const fragment of fragments) expect(banner).not.toContain(fragment);

    await app.shutdown();
    await running;
  });

  /**
   * 근거: §2 「이 항이 낳는 실물 변경」 ① — 자리는 도구 줄 바로 아래이고 메모리 줄 위다.
   * 그 근거를 같은 자리가 든다: 그 줄이 **도구 줄의 주석**이기 때문이다.
   *
   * **부등호가 아니라 정확한 인접으로 잰다.** 「위/아래」로만 재면 사이에 무엇이 끼어도
   * 초록이고, 그러면 주석이 자기 대상에서 떨어져 나간다 — 정본의 문면은 「바로 아래」다.
   */
  it("부재 줄이 도구 줄 바로 아래·메모리 줄 바로 위에 선다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    writeMemory("- 자리 축의 아래 경계를 세운다\n");
    const rig = createRig({ env: {}, captureNotices: true });
    const { app, running } = await start(rig);

    const lines = bannerLinesOf(rig.notices);
    const toolIndex = indexOfToolLine(lines);
    const memoryIndex = indexOfMemoryLine(lines);
    // **대조군** — 두 앵커가 모두 잡혀야 인접을 잴 수 있다. 하나라도 -1이면 아래 산술은
    //   「어긋났다」가 아니라 「못 쟀다」이고, 이 단정이 그 둘을 가른다.
    expect(toolIndex).toBeGreaterThanOrEqual(0);
    expect(memoryIndex).toBeGreaterThanOrEqual(0);

    const absenceIndex = indexOfAbsenceLine(lines, toolIndex);
    expect(absenceIndex).toBeGreaterThanOrEqual(0);
    expect(absenceIndex - toolIndex).toBe(1);
    expect(memoryIndex - absenceIndex).toBe(1);

    await app.shutdown();
    await running;
  });

  /**
   * 근거: §2 — "줄은 조건부다 — 도구가 등록되면 줄이 없다." 같은 자리가 이유를 든다:
   * "등록되면 도구 줄이 이미 전부를 말한다".
   *
   * 이 축은 구현 **전에도 초록**이다. 그것이 정상이며, 그래서 대조군이 없으면 이 축은
   * 영영 아무것도 재지 않는 채로 초록을 낸다.
   */
  it("검색 키가 있으면 그 줄이 없다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    writeMemory("- 조건부 축의 대조군 모집단\n");
    const rig = createRig({ captureNotices: true });
    const { app, running } = await start(rig);

    const lines = bannerLinesOf(rig.notices);
    const toolIndex = indexOfToolLine(lines);
    expect(toolIndex).toBeGreaterThanOrEqual(0);
    const outside = lines.filter((_, index) => index !== toolIndex).join("\n");

    // **대조군** — 도구 줄 **밖** 모집단이 비어 있지 않다. 비면 아래 0건 셋이 공허하다.
    expect(outside.length).toBeGreaterThan(40);
    expect(indexOfMemoryLine(lines)).toBeGreaterThanOrEqual(0);
    // 등록됐으므로 도구 줄이 이미 전부를 말한다
    expect(lines[toolIndex]).toContain("web_search");

    expect(countOf(outside, "web_search")).toBe(0);
    expect(countOf(outside, SEARCH_KEY)).toBe(0);
    expect(countOf(outside, "못 찾았다")).toBe(0);

    await app.shutdown();
    await running;
  });

  /**
   * 근거: §2 — "`shell`은 그대로 5b다 — 이 항은 판정 C-7을 무르지 않는다". 규칙은
   * 「조건부 도구마다 배너 한 줄」이 아니라 "판정이 있으면 그 자리, 없으면 배너"이고,
   * 셸에는 판정 단계가 **있다**(5b). 조건부 도구를 순회하는 일반형으로 구현하면 이 축이
   * 붉어진다 — 그것이 이 축의 존재 이유다.
   *
   * 검색 열쇠도 Docker도 없는 기동으로 **두 부재가 겹치는 자리**를 만든다.
   */
  it("검색 키도 Docker도 없는 기동에서 셸 부재 사유가 배너로 새지 않는다", async () => {
    writeConfig({});
    writeCredentials(`${MODEL_KEY}=모델-파일\n`);
    writeMemory("- 두 부재가 겹치는 기동\n");
    const rig = createRig({
      env: {},
      probeDocker: dockerUnavailable(),
      captureNotices: true,
    });
    const { app, running } = await start(rig);

    const lines = bannerLinesOf(rig.notices);
    const toolIndex = indexOfToolLine(lines);
    // **대조군 ①** — 이 기동에서 셸은 실제로 안 등록됐다. 등록됐다면 아래 0건은
    //   「사유가 안 샜다」가 아니라 「부재가 없었다」다.
    expect(toolIndex).toBeGreaterThanOrEqual(0);
    expect(toolNames(app)).not.toContain("shell");
    expect(lines[toolIndex]).not.toContain("shell");

    // **대조군 ②** — 5b는 자기 자리에서 말했다. 배너 **밖** 고지가 비어 있으면 아래 0건은
    //   「배너에 없다」가 아니라 「어디에도 없다」와 구별되지 않고, 후자는 §2.6이 금지한
    //   침묵이다. 같은 낱말의 있음(밖)과 없음(안)을 재는 §7의 대비쌍이다.
    const banner = bannerNoticeOf(rig.notices);
    expect(banner).not.toBeUndefined();
    const elsewhere = rig.notices.map(stripAnsi).filter((notice) => notice !== banner);
    expect(elsewhere.some((notice) => notice.includes("shell"))).toBe(true);

    // 계약 — 셸의 「왜」는 배너에 오지 않는다
    expect(countOf(lines.join("\n"), "shell")).toBe(0);

    await app.shutdown();
    await running;
  });

  /**
   * **역검증** — 위 축들의 술어가 실제로 위반을 잡는가. 합성 배너 표본에 위반을 하나씩
   * 심어 술어가 반대 결과를 내는 것을 단정한다. 일회 실험이 아니라 **상주하는 축**이다:
   * 나중에 술어가 무뎌지면 이 자리가 먼저 붉어진다.
   *
   * 표본의 문면은 **이 파일이 지어낸 것이지 기대값이 아니다** — 재는 것은 술어의 감도이고,
   * 구현이 어떤 문장을 쓸지는 §12가 위임한 세부다.
   */
  it("역검증 — 자리·구성요소·복제 술어가 합성 위반을 전부 잡는다", () => {
    const HEAD = "neo-agent · 세션 abc12345 · 어떤-모델 · 승인 ask";
    const WORKSPACE = "/tmp/ws · /help";
    const TOOLS = "도구 6종: read_file, write_file, edit_file, web_fetch, remember";
    const ABSENCE = "web_search 없음 — TAVILY_API_KEY를 못 찾았다. neo-agent doctor가 자세히 본다";
    const MEMORY = "메모리 1항목 · 30/4,000자";

    const place = (lines: readonly string[]) => {
      const tool = indexOfToolLine(lines);
      const memory = indexOfMemoryLine(lines);
      const absence = indexOfAbsenceLine(lines, tool);
      return { belowTool: absence - tool === 1, aboveMemory: memory - absence === 1 };
    };

    // 정상 표본 — 술어가 참을 낸다(안 그러면 아래 위반 단정이 무의미하다)
    expect(place([HEAD, WORKSPACE, TOOLS, ABSENCE, MEMORY])).toEqual({
      belowTool: true,
      aboveMemory: true,
    });
    // ① 빈 줄이 끼면 「바로 아래」가 깨진다 — 빈 줄을 거르는 술어였다면 여기서 통과했다
    expect(place([HEAD, WORKSPACE, TOOLS, "", ABSENCE, MEMORY]).belowTool).toBe(false);
    // ② 메모리 줄 아래로 내려가면 「메모리 줄 위」가 깨진다
    expect(place([HEAD, WORKSPACE, TOOLS, MEMORY, ABSENCE]).aboveMemory).toBe(false);
    // ③ 배너가 없으면 대조군이 붉어진다 — 「0건」이 아니라 「못 쟀다」로 나타나야 한다
    expect(bannerLinesOf([])).toEqual([]);
    expect(indexOfToolLine([])).toBe(-1);
    expect(bannerLinesOf(["⚠ 배너가 아닌 고지\n"])).toEqual([]);

    // ④ 구성요소 — 하나씩 빠뜨린 표본에서 그 하나만 거짓이 된다
    expect(componentsOf(ABSENCE)).toEqual({ tool: true, key: true, phrase: true, doctor: true });
    expect(componentsOf(ABSENCE.replace("못 찾았다", "없다")).phrase).toBe(false);
    expect(componentsOf(ABSENCE.replace("neo-agent doctor", "확인이 필요하다")).doctor).toBe(false);
    expect(componentsOf(ABSENCE.replace(SEARCH_KEY, "검색 열쇠")).key).toBe(false);
    expect(componentsOf(ABSENCE.replace("web_search", "웹 검색")).tool).toBe(false);

    // ⑤ 복제 술어 — 전량 복제와 **부분 복제**를 둘 다 잡고, 정상 문면은 안 걸린다
    const context = doctorContext();
    const nextAction = DOCTOR_AXES["search-credentials"].nextAction(context);
    const fragments = copyFragments(nextAction, context.credentialsPath);
    expect(fragments.length).toBeGreaterThanOrEqual(2);
    const whole = `web_search 없음 — ${nextAction}`;
    const partial = `web_search 없음 — ${fragments[fragments.length - 1] ?? ""}`;
    expect(fragments.some((fragment) => whole.includes(fragment))).toBe(true);
    expect(fragments.some((fragment) => partial.includes(fragment))).toBe(true);
    expect(fragments.some((fragment) => ABSENCE.includes(fragment))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CLI는 전송 심을 채우지 않는다 (WEB-ACCESS §4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 주석 본문을 공백으로 지운다(줄 번호·열 폭 보존). **문자열 리터럴은 남긴다** —
 * 이 판정이 보는 것은 호출 형태와 시그니처이지 문자열이 아니지만, 문자열을 건너뛰지
 * 않으면 그 안의 `//`를 주석 시작으로 오독한다.
 *
 * **파일-로컬 복제다.** 같은 술어가 다른 CLI 테스트에도 있고 공유하지 않았다 —
 * 독립 검증이 검증 대상과 같은 도구를 공유하면 같은 오해를 함께 갖는다.
 *
 * **이것 없이는 아래 축이 주석 한 줄에 뒤집힌다**: 「없어야 한다」 축은 설명 주석이
 * 이름을 부르기만 해도 붉어지고, 「있어야 한다」 축은 주석에 그 형태를 적어 두면
 * 실물이 없어도 통과한다. 두 방향 모두 판정을 텍스트가 정하게 된다.
 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        cursor += 1;
      }
      out += source.slice(index, Math.min(cursor + 1, source.length));
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function readSource(name: string): string {
  return readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
}

/**
 * 검색 도구를 만드는 호출의 **인자 텍스트 전체**를 꺼낸다(공백은 한 칸으로 접는다).
 * 없으면 `undefined` — 부재는 통과가 아니라 대조군 실패로 다뤄야 한다.
 */
function searchToolCallArgs(strippedSource: string): string | undefined {
  return /createWebSearchTool\(([^)]*)\)/.exec(strippedSource)?.[1]?.replace(/\s+/g, " ").trim();
}

describe("5. CLI는 전송 심을 채우지 않는다 (WEB-ACCESS §4)", () => {
  /**
   * 근거: §4 — "허용되는 주입점 3개" 중 세 번째가 검색 전송의 `request` 심이고,
   * 그 항이 "같은 코드 리뷰 기준이고 같은 통합 테스트의 대상이다"로 위 둘과 같은
   * 규율을 건다(위 둘은 "CLI는 둘 중 어느 것도 채우지 않는다").
   *
   * **런타임 관측이 먼저다.** 배선이 넘기는 객체의 키가 정확히 하나여야 한다 —
   * 옵션 객체를 통째로 흘려보내면 호출자가 실은 값이 심으로 새는 경로가 열린다.
   */
  it("검색 도구 팩토리에 넘어가는 키가 apiKey 하나뿐이다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig();
    const { app, running } = await start(rig);

    expect(rig.searchToolDeps).toHaveLength(1);
    expect(Object.keys(rig.searchToolDeps[0] ?? {})).toEqual(["apiKey"]);
    await app.shutdown();
    await running;
  });

  /**
   * 소스 단정 — 런타임으로는 "채우지 않았다"를 관측할 수 없다(기본값이 실물이라
   * 채운 경우와 결과가 같다). §4의 주입점 이름이 배선 코드에 등장하지 않아야 한다.
   */
  it("배선 소스에 전송 심 주입이 없다", () => {
    const wiring = stripComments(readSource("wiring.ts"));

    // 대조군 — 읽는 대상이 비면 아래 부정 단정이 전부 공허하게 통과한다
    expect(wiring.length).toBeGreaterThan(1000);
    expect(searchToolCallArgs(wiring)).not.toBeUndefined();

    /**
     * **재는 것은 호출 인자 전체다.** 「금지된 이름이 콜론과 함께 나오지 않는다」로만
     * 재면 축약 프로퍼티(`{ apiKey, request }`)와 스프레드(`{ ...deps }`)가 그대로
     * 통과한다 — 둘 다 심을 채우는 실제 형태다. 아래 역검증 축이 그 셋을 전부 든다.
     */
    expect(searchToolCallArgs(wiring)).toBe("{ apiKey }");

    // 두 번째 그물 — 호출 밖(다른 자리)에서의 콜론 주입.
    // `request` 단독 토큰은 승인 프롬프트가 이미 쓰므로 이름만으로 재지 않는다.
    expect(wiring).not.toMatch(/\brequest\s*:/);
    expect(wiring).not.toMatch(/\bsearchTransport\b/);
    expect(wiring).not.toMatch(/\btransport\s*:/);
    // §4가 든 나머지 둘도 같은 자리에서 함께 잰다 — 같은 규율이기 때문이다
    expect(wiring).not.toMatch(/\bverify\s*:/);
    expect(wiring).not.toMatch(/\bfetch\s*:/);
  });

  /**
   * 근거: §4 — "주입이 상수를 바꾸지 못한다". CLI 쪽 이행은 **시그니처**다:
   * 심이 인자에 없으면 배선이 실수로 채울 방법이 구조적으로 없다.
   * 검색 도구 팩토리의 선언이 `apiKey` 하나만 받는지를 소스로 잰다.
   */
  it("검색 도구 팩토리의 시그니처에 심 자리가 없다", () => {
    const wiring = stripComments(readSource("wiring.ts"));
    const declaration = /createSearchTool\(\s*deps\s*:\s*\{([^}]*)\}\s*\)\s*:/.exec(wiring);

    expect(declaration).not.toBeNull();
    const fields = (declaration?.[1] ?? "")
      .split(";")
      .map((field) => field.trim())
      .filter((field) => field !== "");
    expect(fields).toEqual(["apiKey: string"]);
  });

  /**
   * **역검증** — 위 두 축의 술어가 실제로 위반을 잡는가. 실물 배선 소스에 위반을
   * 심은 사본에 같은 술어를 적용해 반대 결과가 나오는 것을 단정한다.
   *
   * **이 축이 초판의 구멍을 찾았다** (2026-09-02): 처음 쓴 술어는
   * `/\brequest\s*:/` 하나였는데, 심을 채우는 가장 자연스러운 형태인 **축약
   * 프로퍼티**(`{ apiKey, request }`)에는 콜론이 없어 조용히 통과했다. 스프레드
   * (`{ ...deps }`)도 같다. 그래서 위 축이 **호출 인자 전체**를 재는 형태로 바뀌었다.
   * 세 형태를 여기 전부 세워 둔다 — 다음에 술어가 무뎌지면 이 자리가 먼저 붉어진다.
   */
  it("역검증 — 심 주입 세 형태를 술어가 전부 잡는다", () => {
    const real = stripComments(readSource("wiring.ts"));
    const mutate = (replacement: string): string =>
      real.replace("createWebSearchTool({ apiKey })", replacement);

    // ① 콜론 주입 ② 축약 프로퍼티 ③ 스프레드 — 셋 다 심이 채워지는 실제 형태다
    expect(searchToolCallArgs(mutate("createWebSearchTool({ apiKey, request: fake })"))).not.toBe(
      "{ apiKey }",
    );
    expect(searchToolCallArgs(mutate("createWebSearchTool({ apiKey, request })"))).not.toBe(
      "{ apiKey }",
    );
    expect(searchToolCallArgs(mutate("createWebSearchTool({ ...deps })"))).not.toBe("{ apiKey }");

    // 주석 제거가 코드까지 지우지 않는다 — 지우면 위 부정 단정이 공허해진다
    const commented = stripComments(
      ["// request: 이것은 주석이라 잡히면 안 된다", "createWebSearchTool({ apiKey });"].join("\n"),
    );
    expect(commented).not.toMatch(/이것은 주석이라/);
    expect(searchToolCallArgs(commented)).toBe("{ apiKey }");

    // 시그니처 축 — 심 자리가 열리면 필드 목록이 갈린다
    const widened = stripComments(
      "createSearchTool(deps: { apiKey: string; request?: unknown }): AgentTool;",
    );
    const declaration = /createSearchTool\(\s*deps\s*:\s*\{([^}]*)\}\s*\)\s*:/.exec(widened);
    const fields = (declaration?.[1] ?? "")
      .split(";")
      .map((field) => field.trim())
      .filter((field) => field !== "");
    expect(fields).not.toEqual(["apiKey: string"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. 시스템 프롬프트가 검색의 존재를 전제하지 않는다 (WEB-ACCESS §3.2 등록)
// ═══════════════════════════════════════════════════════════════════════════

describe("6. 시스템 프롬프트 (WEB-ACCESS §3.2 등록)", () => {
  /**
   * 근거: §3.2 등록 항 —
   * "시스템 프롬프트가 검색의 존재를 전제하는 문장을 갖지 않는다".
   * 도구가 조건부인 이상 그런 문장은 키가 없는 설치에서
   * "있지도 않은 도구를 부르라는 지시"가 된다.
   */
  it("생성된 프롬프트에 web_search가 0건이다", () => {
    expect(countOf(buildSystemPrompt("/tmp/ws"), "web_search")).toBe(0);
    expect(countOf(buildSystemPrompt("/tmp/ws", "## 메모리\n- 항목"), "web_search")).toBe(0);
  });

  /** 소스 텍스트로도 잰다 — 주석에 들어가도 사람이 다음 사이클에 옮겨 적는다 */
  it("시스템 프롬프트 모듈 소스에 web_search가 0건이다", () => {
    const source = readSource("system-prompt.ts");
    // 대조군 — 읽은 것이 비었으면 아래 0건은 아무것도 재지 않는다. **내용 독립으로 잰다**:
    // 길이 하한 + 이 파일이 임포트하는 export 이름의 존재. 다른 도구 이름의 존재로 재면
    // 대조군이 그 모듈의 주석 내용에 결합해, 프롬프트 계약이 갈리는 날 함께 무너진다.
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain("buildSystemPrompt");
    expect(countOf(source, "web_search")).toBe(0);
  });

  /**
   * **검색 키가 있는 기동에서도** 프롬프트는 그대로다 — 세션에 기록되는 문자열로 잰다.
   * 도구가 실제로 등록된 갈래에서 프롬프트가 갈리면 프롬프트 캐시가 구성마다 나뉜다.
   */
  it("검색 키가 있는 기동에서도 세션 프롬프트에 web_search가 0건이다", async () => {
    writeConfig({});
    writeCredentials(`${SEARCH_KEY}=검색-파일\n`);
    const rig = createRig();
    const { app, running } = await start(rig);

    expect(toolNames(app)).toContain("web_search");
    // 대조군 — 세션에 실제로 프롬프트가 실려 있다. **내용 독립으로 잰다**: 길이 하한 +
    // 이 기동의 워크스페이스 루트가 실려 있다는 것. 후자는 「빌드된 프롬프트가 아니라
    // 남의 문자열을 보고 있다」까지 함께 배제한다. 기대값을 `realpathSync`로 정규화하는
    // 것은 경계가 realpath로 동결되기 때문이다(§6 · `WorkspaceBoundary.root`) — 그러지
    // 않으면 tmpdir이 심링크인 플랫폼에서 대조군만 거짓 레드가 된다.
    expect(app.parts.session.systemPrompt.length).toBeGreaterThan(200);
    expect(app.parts.session.systemPrompt).toContain(realpathSync(workspace));
    expect(countOf(app.parts.session.systemPrompt, "web_search")).toBe(0);
    await app.shutdown();
    await running;
  });

  /**
   * **역검증** — 부재 축은 「읽는 대상이 비면 조용히 그린」인 형태다. 술어가 실제로
   * 잡는지와, 재는 대상이 비어 있지 않은지를 함께 단정한다.
   */
  it("역검증 — 프롬프트에 web_search가 들어가면 술어가 잡는다", () => {
    const prompt = buildSystemPrompt("/tmp/ws");
    // 대상이 비어 있지 않다 — 빈 문자열이면 위 0건 축은 아무것도 재지 않는다
    expect(prompt.length).toBeGreaterThan(200);
    // 같은 술어가 위반을 잡는다. **증분으로 잰다** — 절대값으로 재면 이 축 자신이
    // 프롬프트의 현재 내용에 결합해, 실물이 오염된 날 부재 축과 함께 붉어지며
    // «술어가 살아 있는가»라는 이 축의 물음이 답을 잃는다.
    const injected = `${prompt}\nUse web_search when you need fresh information.`;
    expect(countOf(injected, "web_search")).toBe(countOf(prompt, "web_search") + 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. 쌍조건과 시그니처 — 소스 텍스트 축 (CLI-INTERFACE §2 · WEB-ACCESS §3.2 등록)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * **이 절이 재는 것은 동작이 아니라 형태다.** 목적은 방어가 아니라 트리거의 기계화다
 * (`WEB-ACCESS.md` §3.2가 다른 축에 대해 같은 말을 든다 —
 * *"축이 하는 일은 방어가 아니라 트리거의 기계화다"*).
 *
 * **소유가 갈린다 — 두 문서를 혼동하지 않는다.**
 *
 *   - **쌍조건의 소유는 `WEB-ACCESS.md` §3.2 「등록」이다** (2026-09-07 개정):
 *     *"이 도구의 등록 조건은 검색 키의 유무 하나뿐이며"*, 그리고
 *     *"그것이 시작 화면이 부재의 원인을 도구 목록만 보고 이름 부를 수 있는 근거다"*.
 *     같은 항이 *"조건이 둘이 되는 날 그 추론은 거짓이 되고"* 그때 §2의 계약 축이
 *     붉어진다고 적는다. **아래 축 1·2가 그 축이다.**
 *   - **이 화면 배너 줄의 자리·문면·조건·계약 축의 소유는 `CLI-INTERFACE.md` §2다**
 *     (2026-09-07 신설): *"부재의 근거는 등록된 도구 집합에서 읽는다 — 배선이 별도
 *     플래그를 넘기지 않는다"*, 수단은 *"시그니처에 없으면 실수로 채울 방법이 없다"*,
 *     얻는 것은 *"등록된 도구를 없다고 말하는 화면이 구조적으로 불가능"*.
 *     **아래 축 3이 그 시그니처를 잰다.** 같은 항이
 *     *"그 쌍조건이 이제 계약이고 계약 축이 그것을 잰다"*로 이 절 전체를 요구하고,
 *     조건이 둘이 되는 날을 *"사람의 기억이 아니라 붉어진 축"*이 알린다고 적는다.
 *
 * **왜 런타임이 아니라 소스인가.** 등록 조건이 둘이 돼도 둘째 항의 기본값이 오늘과
 * 같으면 이 파일의 런타임 축은 **전부 계속 초록이다** — 깨진 것은 「조건이 하나가 아니게
 * 된 것」이지 「오늘의 관측이 갈린 것」이 아니기 때문이다. 같은 근거의 선례가 위 §5의
 * 「소스 단정 — 런타임으로는 관측할 수 없다」 축이고 근거도 같다(기본값이 실물이라
 * 채운 경우와 결과가 같다).
 *
 * **주석을 벗기고 잰다** — `stripComments`가 없으면 이 절의 판정을 설명 주석이 정한다.
 *
 * **이 절은 구현 소스를 읽는다. 그래도 기대값은 구현에서 오지 않는다** — 위 두 문서가
 * 「항이 하나」와 「플래그 자리 없음」을 계약으로 들었고, 아래 술어는 그 둘을 텍스트로
 * 옮긴 것뿐이다. 실물에서 읽은 것은 **앵커의 철자**(`factories.createSearchTool(` ·
 * `function startupBanner(` · `resolveKey(`)이지 판정 기준이 아니다.
 */

/**
 * 등록을 **지배하는 조건식**의 텍스트를 꺼낸다. 오늘의 형태는 스프레드 삼항
 * `...(<조건> ? [] : [factories.createSearchTool(...)])`이고 이 함수는 `<조건>`만
 * 돌려준다(공백은 한 칸으로 접는다).
 *
 * **못 찾으면 `undefined`다 — 부재는 통과가 아니라 대조군 실패로 다뤄야 한다.** 스프레드
 * 그룹의 짝 괄호를 실제로 세어 **호출이 그 그룹 안일 때만** 돌려준다. 등록 자리가
 * 삼항에서 `if` 블록으로 바뀌는 리팩터링은 이 경로로 `undefined`가 되고, 그때 축 1은
 * 「조건이 하나다」로 통과하는 것이 아니라 대조군에서 붉어진다(아래 역검증 ②가 상주 축).
 *
 * **술어의 한계 셋 — 못 덮는 것을 이름으로 든다.**
 *   ① 앵커가 `factories.createSearchTool(` 리터럴이다. 팩토리 표면의 이름이 바뀌면
 *      추출이 `undefined`가 되고, 그것은 통과가 아니라 대조군 실패다.
 *   ② 괄호 세기는 문자열 리터럴 안의 괄호를 구별하지 않는다. 오늘 조건식과 두 가지에
 *      문자열이 없어 성립한다.
 *   ③ 조건식 안의 `?`(옵셔널 체이닝·중첩 삼항)는 자르는 자리를 앞당긴다. 잘린 조각은
 *      아래 술어를 통과하지 못하므로 방향은 안전한 쪽(붉어짐)이다.
 */
function searchRegistrationCondition(strippedSource: string): string | undefined {
  const call = strippedSource.indexOf("factories.createSearchTool(");
  if (call === -1) return undefined;
  const open = strippedSource.lastIndexOf("...(", call);
  if (open === -1) return undefined;

  let depth = 0;
  let close = -1;
  for (let index = open + 3; index < strippedSource.length; index += 1) {
    const char = strippedSource[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close === -1 || call > close) return undefined;

  const question = strippedSource.indexOf("?", open);
  if (question === -1 || question > call) return undefined;
  return strippedSource
    .slice(open + 4, question)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 조건식이 **검색 키 하나에만** 걸리는가. 항이 둘이 되는 순간 거짓이 된다.
 *
 * **극성은 안 잰다** — `=== undefined`와 `!== undefined`는 두 가지를 맞바꾸면 같은
 * 계약이라, 극성을 계약으로 올리면 의미 중립인 리팩터링이 거짓 레드를 낸다. 극성만
 * 뒤집힌 구현(키가 없는데 등록한다)은 이 파일 §4의 런타임 축이 이미 잡는다.
 * 여기서 재는 것은 오직 **항의 수**다.
 */
function isSingleSearchKeyCondition(condition: string | undefined): boolean {
  if (condition === undefined) return false;
  if (!condition.includes("credentials.searchApiKey")) return false;
  if (/&&|\|\|/.test(condition)) return false;
  if (/\bconfig\./.test(condition)) return false;
  // 알려진 조각을 걷어내고 **남는 것이 없어야** 한다. 「`&&`가 없다」만으로 재면
  // 함수 호출·쉼표 연산자 같은 형태가 그대로 통과한다.
  const residue = condition
    .replaceAll("credentials.searchApiKey", "")
    .replace(/!==|===|!=|==/g, "")
    .replace(/\bundefined\b/g, "")
    .replace(/[\s()!]/g, "");
  return residue === "";
}

/** `startupBanner` 선언의 인자 목록. 못 잡으면 `undefined` — 대조군 실패로 다룬다 */
function startupBannerParams(strippedSource: string): string[] | undefined {
  const declaration = /function\s+startupBanner\(([^)]*)\)/.exec(strippedSource);
  if (declaration === null) return undefined;
  return (declaration[1] ?? "")
    .split(",")
    .map((param) => param.trim())
    .filter((param) => param !== "");
}

/** `resolveKey(...)`의 인자 텍스트 전부(선언 포함). 공백은 한 칸으로 접는다 */
function resolveKeyCallArgs(strippedSource: string): string[] {
  return [...strippedSource.matchAll(/resolveKey\(([^)]*)\)/g)].map((match) =>
    (match[1] ?? "").replace(/\s+/g, " ").trim(),
  );
}

describe("7. 쌍조건·시그니처 소스 축 (CLI-INTERFACE §2 · WEB-ACCESS §3.2)", () => {
  /**
   * 축 1 — 근거: `WEB-ACCESS.md` §3.2 「등록」 *"이 도구의 등록 조건은 검색 키의 유무
   * 하나뿐이며"*. 그 사실이 오늘 참이라는 것이 배너 줄의 쌍조건을 성립시킨다.
   */
  it("축 1 — 등록 조건식이 검색 키 하나에만 걸린다", () => {
    const wiring = stripComments(readSource("wiring.ts"));

    // **대조군** — 읽은 것이 비었거나 앵커를 못 찾으면 아래 술어는 아무것도 재지 않는다
    expect(wiring.length).toBeGreaterThan(1000);
    const condition = searchRegistrationCondition(wiring);
    expect(condition).not.toBeUndefined();

    // 조각별 단정 — 붉어졌을 때 **무엇이 늘었는지**가 바로 보이게 한다
    expect(condition).toContain("credentials.searchApiKey");
    expect(condition).not.toMatch(/&&|\|\|/);
    expect(condition).not.toMatch(/\bconfig\./);
    // 합산 술어 — 아래 역검증 ①이 같은 함수를 위반 표본에 건다
    expect(isSingleSearchKeyCondition(condition)).toBe(true);
  });

  /**
   * 축 2 — **쌍조건이 기대는 값이 무엇에 걸리는지는 `credentials.ts`가 정한다.**
   * 축 1만으로는 구멍이 남는다: 로더가 `searchApiKey`를 둘째 조건에 걸도록 바뀌어도
   * `wiring.ts`의 조건식은 그대로여서 축 1이 **초록으로 남는다.**
   *
   * **이 축의 한계 — 재는 것은 산출 지점의 「수」이지 그 지점 「안」의 규칙이 아니다.**
   * `resolveKey`가 env→파일 우선순위를 바꾸거나, 빈 값·공백 값의 처리를 바꾸거나,
   * 새 자리를 우선순위에 끼워 넣는 변경은 호출 수를 안 늘리므로 이 축을 그대로
   * 지나간다(`backlog.md` `K-424` ①③이 정확히 그 파일을 열어 둔 상태다).
   * 그 층의 정본은 `CLI-INTERFACE.md` §4이고, 이 파일 §1의 런타임 축이 우선순위를
   * 잰다 — **이 축은 그것을 대체하지 않는다.**
   */
  it("축 2 — 검색 키를 산출하는 자리가 credentials.ts에 하나뿐이다", () => {
    const credentials = stripComments(readSource("credentials.ts"));

    // **대조군 ①** — 읽은 것이 비었거나 상수 이름이 갈리면 아래 필터가 공허하게 0을 낸다
    expect(credentials.length).toBeGreaterThan(500);
    expect(credentials).toContain("SEARCH_API_KEY_ENV");

    const calls = resolveKeyCallArgs(credentials);
    // **대조군 ②** — 호출을 하나도 못 찾으면 아래 「하나뿐」은 아무것도 재지 않는다
    expect(calls.length).toBeGreaterThan(0);

    expect(calls.filter((args) => args.includes("SEARCH_API_KEY_ENV"))).toHaveLength(1);

    // 산출된 값에 **다시 손대는 자리**도 없다 — 대입이 정확히 하나다.
    // (`searchApiKey ===`는 비교라 `(?!=)`가 걸러 낸다.)
    expect([...credentials.matchAll(/searchApiKey\s*=(?!=)/g)]).toHaveLength(1);
  });

  /**
   * 축 3 — 근거: `CLI-INTERFACE.md` §2 *"부재의 근거는 등록된 도구 집합에서 읽는다 —
   * 배선이 별도 플래그를 넘기지 않는다"*. 수단이 시그니처라는 것도 같은 항이 든다:
   * *"시그니처에 없으면 실수로 채울 방법이 없다"*. 같은 형태의 선례가 위 §5의
   * 「검색 도구 팩토리의 시그니처에 심 자리가 없다」이다.
   *
   * **사람이 눈으로 세지 않는다** — 이 계약의 유일한 검증이 구현 담당의 셀프 체크면
   * 다음 사이클에 플래그가 조용히 는다.
   */
  it("축 3 — startupBanner 인자에 검색 플래그 자리가 없다", () => {
    const wiring = stripComments(readSource("wiring.ts"));
    const params = startupBannerParams(wiring);

    // **대조군 ①** — 선언을 못 잡으면 아래 부정 단정이 전부 공허하다
    expect(params).not.toBeUndefined();
    expect((params ?? []).length).toBeGreaterThan(3);
    // **대조군 ②** — 부재의 근거를 **읽는 자리**가 실제로 인자에 있다. 이것이 없으면
    // 「플래그가 없다」는 참이 되면서 §2가 요구한 수단이 사라진 것을 못 잡는다.
    expect((params ?? []).filter((param) => /^tools\s*:/.test(param))).toHaveLength(1);

    // 플래그가 들어오는 세 경로 — 이름·불리언 타입·크리덴셜 통째 넘기기
    expect((params ?? []).filter((param) => /search/i.test(param))).toEqual([]);
    expect((params ?? []).filter((param) => /:\s*boolean\b/.test(param))).toEqual([]);
    expect((params ?? []).filter((param) => /credential/i.test(param))).toEqual([]);
  });

  /**
   * **역검증 ①** — 축 1의 술어가 실제로 위반을 잡는가. 실물 소스에 둘째 항을 심은
   * **문자열 표본**에 같은 함수를 걸어 반대 결과가 나오는 것을 단정한다.
   * **일회 실험이 아니라 축으로 상주한다** — 술어가 나중에 무뎌지면 여기가 먼저 붉어진다.
   */
  it("역검증 ① — 조건이 둘이 된 표본에서 축 1의 술어가 붉어진다", () => {
    const real = stripComments(readSource("wiring.ts"));
    const anchor = "credentials.searchApiKey === undefined";

    // 대조군 — 심을 자리를 못 찾으면 아래 표본이 실물과 같아져 단정이 통째로 뒤집힌다
    expect(real).toContain(anchor);
    expect(isSingleSearchKeyCondition(searchRegistrationCondition(real))).toBe(true);

    for (const injected of [
      `${anchor} && config.searchEnabled === false`,
      `${anchor} || flags.disableSearch`,
      `${anchor} && credentials.apiKey === undefined`,
      "config.search.enabled !== true",
    ]) {
      const sample = real.replace(anchor, injected);
      expect(sample).not.toBe(real);
      expect(isSingleSearchKeyCondition(searchRegistrationCondition(sample))).toBe(false);
    }
  });

  /**
   * **역검증 ②** — 추출 술어가 **못 맞추는** 표본에서 축 1이 「통과」가 아니라
   * 「대조군 실패」로 끝나는가. 등록 자리가 삼항에서 `if` 블록으로 바뀌는 리팩터링이
   * 그 경로이고, 이 축이 없으면 그 리팩터링 뒤로 축 1이 조용한 그린이 된다.
   */
  it("역검증 ② — 등록이 if 블록이 되면 통과가 아니라 대조군 실패다", () => {
    const ifShaped = stripComments(
      [
        "const searchTools: AgentTool[] = [];",
        "if (credentials.searchApiKey !== undefined) {",
        "  searchTools.push(factories.createSearchTool({ apiKey: credentials.searchApiKey }));",
        "}",
      ].join("\n"),
    );

    // 표본 자체는 비어 있지 않다 — 빈 문자열을 읽고 「못 찾았다」가 되는 것이 아니다
    expect(ifShaped).toContain("factories.createSearchTool(");
    // 추출이 `undefined`이므로 축 1은 `not.toBeUndefined()` 대조군에서 먼저 붉어진다
    expect(searchRegistrationCondition(ifShaped)).toBeUndefined();
    expect(isSingleSearchKeyCondition(searchRegistrationCondition(ifShaped))).toBe(false);
  });

  /** **역검증 ③** — 축 2·3의 술어에 위반을 심어 반대 결과가 나오는 것을 단정한다 */
  it("역검증 ③ — 산출 지점 둘·플래그 인자를 축 2·3의 술어가 잡는다", () => {
    // 축 2 — 검색 키를 읽는 자리가 둘이 된다(로더가 우선순위에 새 자리를 여는 형태)
    const twoSites = stripComments(
      [
        "const searchApiKey = resolveKey(env, entries, SEARCH_API_KEY_ENV, secretValues);",
        "const legacy = resolveKey(env, entries, SEARCH_API_KEY_ENV, secretValues);",
      ].join("\n"),
    );
    expect(
      resolveKeyCallArgs(twoSites).filter((args) => args.includes("SEARCH_API_KEY_ENV")),
    ).toHaveLength(2);
    // 대입이 둘이 되는 형태도 함께 — 값을 나중에 덮는 경로다
    const reassigned = stripComments(
      [
        "let searchApiKey = resolveKey(env, entries, SEARCH_API_KEY_ENV, secretValues);",
        "if (config.searchOff) searchApiKey = undefined;",
      ].join("\n"),
    );
    expect([...reassigned.matchAll(/searchApiKey\s*=(?!=)/g)]).toHaveLength(2);

    // 축 3 — 플래그 자리가 열린 시그니처
    const widened = stripComments(
      "function startupBanner(session: StoredSession, tools: readonly AgentTool[], hasSearch: boolean): string {",
    );
    const params = startupBannerParams(widened) ?? [];
    expect(params.filter((param) => /search/i.test(param))).not.toEqual([]);
    expect(params.filter((param) => /:\s*boolean\b/.test(param))).not.toEqual([]);
    // 크리덴셜 통째 넘기기도 잡는다
    const passedWhole = stripComments(
      "function startupBanner(session: StoredSession, credentials: LoadedCredentials): string {",
    );
    expect(
      (startupBannerParams(passedWhole) ?? []).filter((p) => /credential/i.test(p)),
    ).not.toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * [미규정] 판정 요청 — 이 파일이 임의로 정하지 않은 것 (T-012 독립 검증)
 *
 * ── U-1: 두 키가 **모두** env일 때 크리덴셜 파일을 파싱하는가 ────────────────
 *   `CLI-INTERFACE.md` §4는 600 검사가 갈래와 무관하게 앞이라는 것까지만 정하고,
 *   그 뒤 **파일 내용을 읽는지**는 정하지 않는다. 구현은 읽는다(그래야 `secretValues`
 *   합집합이 그 구성에서도 성립한다). 귀결: 두 키를 모두 env로 준 사용자의 홈에
 *   형식이 어긋난 `credentials`가 남아 있으면 **기동이 실패한다** — 개정 전(파일을
 *   아예 안 읽던 시절)에는 통과하던 구성이다.
 *   이 파일은 그 방향을 단정하지 않는다. fail-closed 방향이라 위반으로도 보지 않았다.
 *   판정: 회귀로 볼 것인가, 「형식 오류는 갈래와 무관하게 기동 실패」를 §4에 명문화할 것인가.
 *
 * ── U-2: 빈 문자열·공백뿐인 키 값 ───────────────────────────────────────────
 *   §4는 값의 형태를 정하지 않는다. 구현은 부재로 보고 다음 자리로 넘어간다.
 *   검색 키에서 그것은 키를 적었는데도 도구가 뜨지 않는 형태로 나타난다 — 도구 집합 표시가
 *   있으므로 완전한 침묵은 아니나(§2), **사유는 어디에도 안 보인다.**
 *   판정: 빈 값을 형식 오류로 볼 것인가, 부재로 두되 사유를 고지할 것인가.
 *
 * ── U-3: 크리덴셜 **객체**의 동결 범위 ──────────────────────────────────────
 *   `WEB-ACCESS.md` §3.2 시크릿 항이 검색 키를 «시작 시 1회 읽고 동결한다»
 *   (`SAFE-DEFAULTS.md` §4) 규율 안이라 든다. 그런데 §4의 문면이 드는 모집단은
 *   «보안에 영향을 주는 모든 설정(승인 모드, denylist, 샌드박스 방침)»이고,
 *   크리덴셜 객체를 `Object.freeze`할 것인지는 어느 절도 정하지 않는다. 구현은
 *   값 목록 배열만 동결한다(개정 전부터 그렇다 — 이 사이클의 변경이 아니다).
 *   설정은 `CLI-INTERFACE.md` §3이 깊은 동결을 명시로 받았으므로 둘이 비대칭이다.
 *   판정: 크리덴셜에도 같은 동결을 요구할 것인가(요구하면 그 자리는 로더다).
 *
 * ── U-4: 부재 줄이 **크리덴셜 파일 경로**를 실을 수 있는가 (T-001 등재) ─────
 *   §2는 그 줄이 드는 것을 «부재와 원인까지»로 정하고 「다음 행동」을 doctor로 밀었다.
 *   그런데 **「어디를 찾았는가」가 원인인지 다음 행동인지 갈리지 않는다** — 경로는
 *   §5.1 계약 6이 `nextAction` 쪽에 두었지만(그 축의 문면이 경로를 든다), 「환경 변수와
 *   크리덴셜 파일 둘 다 봤다」는 사실 자체는 부재의 원인 서술이다.
 *   이 파일은 그래서 **경로의 존재도 부재도 단정하지 않는다.** 위 복제 축은 경로를
 *   기준으로 문면을 자르므로 경로 자체는 조각에 들어가지 않는다 — 의도된 회피다.
 *   정할 문서: `CLI-INTERFACE.md` §2. 판정: 경로 표시를 허용할 것인가, 금지할 것인가.
 *
 * ── U-5: 부재 줄과 **다른 시작 고지의 상대 순서** (T-001 등재) ──────────────
 *   `sandbox: "off"` 또는 Docker 불가용 기동에서는 5b의 고지와 이 줄이 함께 나간다.
 *   §2는 배너 **안**의 자리만 정하고 배너와 다른 고지의 순서는 어느 절도 정하지 않는다
 *   (오늘 실물은 5b가 `startCli` 안, 배너가 `run()` 안이라 5b가 앞이지만 그것은 계약이
 *   아니라 조립 순서의 파생이다). 이 파일은 그 순서를 단정하지 않는다 — 판정 C-7 축은
 *   「배너 안인가 밖인가」만 재고 순서에는 걸리지 않는다.
 *   정할 문서: `CLI-INTERFACE.md` §2. 판정: 순서를 계약으로 둘 것인가.
 *
 * ── U-6: 부재 줄의 **ANSI** (T-001 등재 — 안 재는 것을 이름으로 든다) ───────
 *   §2는 *"배너 전체가 이미 dim이라 색 판단은 없다"*로 판단의 부재를 서술할 뿐,
 *   그 줄이 배너의 dim 밖에 별도 색을 갖지 않는다는 것을 계약으로 들지는 않는다.
 *   §12는 REPL 화면의 색을 **세부**로 두고, §5.1 계약 9의 ANSI 금지는 `doctor`의
 *   stdout에만 걸린다(같은 항이 2026-09-07에 그 한정을 명시했다). 그래서 이 파일은
 *   ANSI를 재지 않는다 — 위 축들은 전부 `stripAnsi` 뒤의 텍스트를 본다.
 *   정할 문서: `CLI-INTERFACE.md` §2 또는 §12. 판정: 세부로 둘 것인가, 계약으로
 *   올릴 것인가(올린다면 근거는 계약 9의 둘째 축이 아니라 첫째 축이어야 한다).
 * ═══════════════════════════════════════════════════════════════════════════ */
