/**
 * 설치 트리 자기 편집 고지 — `docs/DISTRIBUTION.md` §6.
 *
 * 검증하는 것은 셋이다:
 *
 *   1. **계산이 실제 레이아웃과 맞는가** — `resolveInstallRoot`가 짚은 곳에
 *      `pnpm-workspace.yaml`이 있는지 단정한다. §6이 *"레이아웃 변경이 조용히 고지를
 *      죽이는 것을 막는 유일한 수단"*이라고 지목한 검사이며, 이 파일에서 가장 중요한
 *      한 줄이다. 계산이 틀리면 고지는 **아무 소리 없이** 사라진다.
 *   2. **판정이 세그먼트 단위인가** — `…/neo-agent-2`가 `…/neo-agent`의 하위로 잡히면
 *      상관없는 저장소에서 매번 거짓 고지가 나간다.
 *   3. **두 사실을 모두 말하는가** — ① 겹친다 ② 다음 기동부터 적용된다. §6은 ②의
 *      누락을 명시적으로 금지했으므로 부분 통과가 없다.
 *
 * 고지가 **경계가 아니라 고지**라는 것도 여기서 관측된다 — 겹친 상태에서 기동이
 * 정상적으로 끝난다(막지 않는다).
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
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_KEY_ENV } from "../src/credentials.ts";
import { type CliDeps, resolveInstallRoot, startCli } from "../src/wiring.ts";
import { stripAnsi } from "./harness.ts";
import { dockerAvailable } from "./probe-docker.ts";

/** 이 테스트 파일이 있는 곳 — `packages/cli/test` */
const testDir = dirname(fileURLToPath(import.meta.url));
/** `main.ts`가 있는 곳. 실행 시 `import.meta.dirname`이 갖는 값과 같은 디렉터리다 */
const cliSrcDir = realpathSync(join(testDir, "..", "src"));

function fakeModel(): ModelClient {
  return {
    modelId: "fake-model",
    async *stream(): AsyncIterable<ModelStreamEvent> {
      yield { type: "text_delta", text: "." };
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

let root: string;
let home: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "neo-cli-install-")));
  home = join(root, "home");
  mkdirSync(home, { recursive: true });
  // 3c 첫 기동 관문(`CLI-INTERFACE.md` §2.1)을 이미 지난 홈으로 만든다 — 판정은
  // `~/.neo-agent/sessions.db`의 부재 하나뿐이라 빈 파일 하나면 «returning»이 된다
  // (0바이트는 SQLite가 유효한 빈 DB로 취급한다). 없으면 조립이 관문에서 키를
  // 기다리며 끝나지 않는다. 모드를 명시하는 것은 umask가 writeFileSync의 mode를
  // 깎아 `loose-file-permissions` 경고가 새로 나가는 것을 막기 위해서다.
  // 디렉터리도 여기서 처음 생기므로 700을 명시한다 — 세션 저장소는 남이 만든
  // 느슨한 디렉터리를 고치지 않고 경고하며, 그 경고는 화면을 단정하는 테스트를
  // 엉뚱한 이유로 깨뜨린다.
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  chmodSync(join(home, ".neo-agent"), 0o700);
  writeFileSync(join(home, ".neo-agent", "sessions.db"), "");
  chmodSync(join(home, ".neo-agent", "sessions.db"), 0o600);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * 조립을 세우고 그때까지의 화면을 돌려준다.
 *
 * `run()`을 부르지 않는다 — 고지가 **배너가 아니라 판정 단계에서** 나가는지가 함께
 * 관측된다. 배너에 실려 있다면 이 시점의 출력에는 아무것도 없다.
 */
async function startAndCapture(options: { cwd: string; installRoot?: string }): Promise<string> {
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const deps: CliDeps = {
    argv: [],
    env: { [API_KEY_ENV]: "sk-ant-테스트" },
    cwd: options.cwd,
    home,
    io: { input: new PassThrough(), output },
    version: "0.0.0-test",
    // `exactOptionalPropertyTypes`가 켜져 있어 `installRoot: undefined`를 그대로 실을
    // 수 없다 — "주지 않는다"와 "undefined를 준다"를 구분하는 설정이고, 여기서 하려는
    // 것은 전자다(주입 없는 경로의 관측).
    ...(options.installRoot === undefined ? {} : { installRoot: options.installRoot }),
    factories: {
      probeDocker: dockerAvailable(),
      createModelClient: () => fakeModel(),
    },
  };

  const app = await startCli(deps, { kind: "run" });
  await app.shutdown();
  return stripAnsi(chunks.join(""));
}

/** 임시 트리 안에 디렉터리를 만들고 realpath로 돌려준다 */
function makeDir(...segments: string[]): string {
  const path = join(root, ...segments);
  mkdirSync(path, { recursive: true });
  return realpathSync(path);
}

describe("설치 루트 계산 (§6)", () => {
  it("`packages/cli/src`의 상위 3단계가 저장소 루트다 — 그 자리에 pnpm-workspace.yaml이 있다", () => {
    const installRoot = resolveInstallRoot(cliSrcDir);

    // **이 단정이 §6의 요구다.** 레이아웃이 바뀌면(패키지를 한 겹 더 넣는다든지)
    // 계산은 조용히 엉뚱한 곳을 짚고 고지는 아무 소리 없이 사라진다. 그때 깨지는
    // 곳이 여기여야 한다.
    expect(existsSync(join(installRoot, "pnpm-workspace.yaml"))).toBe(true);
    // 워크스페이스 루트의 다른 표지도 함께 본다 — 우연히 상위 어딘가에 같은 이름의
    // 파일이 있어 통과하는 일을 막는다.
    expect(existsSync(join(installRoot, "packages", "cli", "src", "main.ts"))).toBe(true);
  });

  it("파일시스템을 건드리지 않는 순수 산술이다 — 존재하지 않는 경로도 센다", () => {
    expect(resolveInstallRoot("/nowhere/packages/cli/src")).toBe("/nowhere");
  });
});

describe("겹칠 때 — 고지한다 (§6)", () => {
  it("워크스페이스가 설치 트리 자신이면 두 사실을 모두 말한다", async () => {
    const installRoot = makeDir("neo-agent");
    const text = await startAndCapture({ cwd: installRoot, installRoot });

    // ① 겹친다
    expect(text).toContain("설치 트리");
    // ② 다음 기동부터 적용된다 — §6이 누락을 금지한 사실
    expect(text).toContain("다음 기동부터");
  });

  it("워크스페이스가 설치 트리 하위여도 말한다", async () => {
    const installRoot = makeDir("neo-agent");
    const inside = makeDir("neo-agent", "packages", "cli");

    const text = await startAndCapture({ cwd: inside, installRoot });
    expect(text).toContain("설치 트리");
    expect(text).toContain("다음 기동부터");
  });

  it("설치 트리를 품는 상위에서 기동해도 말한다 — 그 아래를 고치면 돌고 있는 코드다", async () => {
    const outer = makeDir("work");
    const installRoot = makeDir("work", "neo-agent-main");

    const text = await startAndCapture({ cwd: outer, installRoot });
    expect(text).toContain("설치 트리");
    expect(text).toContain(installRoot);
    expect(text).toContain("다음 기동부터");
  });

  it("**막지 않는다** — 겹쳐도 기동은 끝까지 간다", async () => {
    const installRoot = makeDir("neo-agent");
    const text = await startAndCapture({ cwd: installRoot, installRoot });

    // 종료 시퀀스의 인사까지 나왔다면 시작 시퀀스가 전부 통과한 것이다.
    expect(text).toContain("세션이 저장됐다");
  });
});

describe("겹치지 않을 때 — 말하지 않는다 (§6)", () => {
  it("설치 트리 밖에서 기동하면 고지가 없다", async () => {
    const installRoot = makeDir("neo-agent");
    const elsewhere = makeDir("somewhere-else");

    const text = await startAndCapture({ cwd: elsewhere, installRoot });
    expect(text).not.toContain("설치 트리");
  });

  it("형제 디렉터리 `neo-agent-2`를 하위로 오판하지 않는다 — 세그먼트 비교", async () => {
    const installRoot = makeDir("neo-agent");
    const sibling = makeDir("neo-agent-2");

    const text = await startAndCapture({ cwd: sibling, installRoot });
    expect(text).not.toContain("설치 트리");
  });

  it("이름이 접두인 상위(`neo-agent-2`가 설치 트리를 품는 것처럼 보이는 경우)도 오판하지 않는다", async () => {
    const installRoot = makeDir("neo-agent-2");
    const prefixNamed = makeDir("neo-agent");

    const text = await startAndCapture({ cwd: prefixNamed, installRoot });
    expect(text).not.toContain("설치 트리");
  });

  it("설치 루트가 주입되지 않으면 판정하지 않는다 — 모르는 것은 말하지 않는다", async () => {
    const workspace = makeDir("ws");

    const text = await startAndCapture({ cwd: workspace });
    expect(text).not.toContain("설치 트리");
  });
});
