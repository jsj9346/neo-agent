/**
 * 조립 단위 테스트 — `docs/CLI-INTERFACE.md` §2·§5·§6.
 *
 * 배선의 계약은 **결과물이 아니라 전달 인자와 호출 순서**에 있다. 그래서 생성자
 * 주입점(`WiringFactories`)으로 실물을 감싸 관찰한다 — 저장소는 진짜 sqlite를 쓰되
 * `attach` 호출 시점만 기록하는 식이다. 모델만 가짜다(네트워크 금지).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { Agent, type ModelClient, type ModelStreamEvent } from "@neo-agent/core";
import { openSessionStore, type SessionStore } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY_ENV } from "../src/credentials.ts";
import type { CliDeps, WiringFactories } from "../src/wiring.ts";
import { EXIT_OK, EXIT_STARTUP_FAILED, EXIT_USAGE, runCli, startCli } from "../src/wiring.ts";
import {
  dockerAvailable,
  dockerProbeForbidden,
  sandboxImageProbeForbidden,
} from "./probe-docker.ts";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * 화면에 표시가 나타날 때까지 기다린다.
 *
 * `waitForIdle()`을 곧바로 부르면 **런이 시작되기 전**일 수 있어 즉시 resolve한다
 * (제출은 readline 이벤트를 거쳐 비동기로 런이 된다). 관찰 가능한 표시를 기다리는
 * 쪽이 그 경합에 걸리지 않는다.
 */
async function waitFor(harness: Harness, needle: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (harness.text().includes(needle)) return;
    await tick();
  }
  throw new Error(`"${needle}"가 화면에 나타나지 않았다. 지금까지의 출력:\n${harness.text()}`);
}

let home: string;
let workspace: string;

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "neo-cli-wiring-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  await mkdir(home, { recursive: true });
  await mkdir(workspace, { recursive: true });
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
  rmSync(join(home, ".."), { recursive: true, force: true });
});

/** `~/.neo-agent/config.json`을 써 둔다 — 설정은 시작 시 1회 읽히므로 startCli 전에 */
function writeConfig(settings: Record<string, unknown>): void {
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  writeFileSync(join(home, ".neo-agent", "config.json"), JSON.stringify(settings));
}

/** 스트리밍 텍스트 한 덩어리만 돌려주는 모델. 네트워크 없음 */
function fakeModel(text = "안녕하세요"): ModelClient {
  return {
    modelId: "fake-model",
    async *stream(): AsyncIterable<ModelStreamEvent> {
      yield { type: "text_delta", text };
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          stopReason: "end_turn",
          usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

interface Harness {
  deps: CliDeps;
  input: PassThrough;
  /** 지금까지의 출력 전부 (ANSI 제거) */
  text(): string;
  calls: string[];
  seen: {
    boundaryRoots: string[];
    modelConfigs: { apiKey: string; model: string }[];
    executorSecrets: (readonly string[] | undefined)[];
    sandboxOptions: Parameters<WiringFactories["createSandboxExecutor"]>[0][];
    gateConfigs: Parameters<WiringFactories["createGate"]>[0][];
    toolOptions: Parameters<WiringFactories["createTools"]>[0][];
    stores: SessionStore[];
  };
}

/**
 * @param options.probeDocker 시작 시퀀스 5b의 Docker 판정. **기본값은 "가용"이다** —
 *   주입을 생략하면 실물 `probeDocker`가 돌아 실제 `docker version` 프로세스가 뜨고,
 *   그러면 이 파일의 결과가 테스트 머신 상태에 좌우된다(`./probe-docker.ts` 머리말).
 */
function createHarness(
  options: {
    argv?: string[];
    model?: ModelClient;
    probeDocker?: WiringFactories["probeDocker"];
  } = {},
): Harness {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const calls: string[] = [];
  const seen: Harness["seen"] = {
    boundaryRoots: [],
    modelConfigs: [],
    executorSecrets: [],
    sandboxOptions: [],
    gateConfigs: [],
    toolOptions: [],
    stores: [],
  };

  const deps: CliDeps = {
    argv: options.argv ?? [],
    env: { [API_KEY_ENV]: "sk-ant-테스트" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-test",
    factories: {
      createBoundary: (opts) => {
        calls.push("createBoundary");
        seen.boundaryRoots.push(opts.root);
        return realFactories.createBoundary(opts);
      },
      createExecutor: (opts) => {
        calls.push("createExecutor");
        seen.executorSecrets.push(opts.secretValues);
        return realFactories.createExecutor(opts);
      },
      createSandboxExecutor: (opts) => {
        calls.push("createSandboxExecutor");
        seen.sandboxOptions.push(opts);
        return realFactories.createSandboxExecutor(opts);
      },
      probeDocker: options.probeDocker ?? dockerAvailable(),
      probeSandboxImage: sandboxImageProbeForbidden(),
      createTools: (opts) => {
        calls.push("createTools");
        seen.toolOptions.push(opts);
        return realFactories.createTools(opts);
      },
      createModelClient: (config) => {
        calls.push("createModelClient");
        seen.modelConfigs.push(config);
        return options.model ?? fakeModel();
      },
      createGate: (config) => {
        calls.push("createGate");
        seen.gateConfigs.push(config);
        return realFactories.createGate(config);
      },
      openStore: (opts) => {
        calls.push("openStore");
        const store = openSessionStore(opts);
        const wrapped: SessionStore = {
          ...store,
          attach: (agent, sessionId) => {
            calls.push("store.attach");
            return store.attach(agent, sessionId);
          },
          close: () => {
            calls.push("store.close");
            store.close();
          },
        };
        seen.stores.push(wrapped);
        return wrapped;
      },
    },
  };

  return { deps, input, calls, seen, text: () => stripAnsi(chunks.join("")) };
}

// 기본 구현을 그대로 쓰기 위한 참조 — 감싸기만 하고 동작은 실물이다.
const realFactories = await (async () => {
  const { resolveFactories } = await import("../src/wiring.ts");
  return resolveFactories();
})();

describe("시작 시퀀스 (§2)", () => {
  it("8단계가 계약 순서대로 일어난다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });

    // 경계 → 저장소 → (도구·모델·게이트) → 구독
    expect(harness.calls.indexOf("createBoundary")).toBeLessThan(
      harness.calls.indexOf("openStore"),
    );
    expect(harness.calls.indexOf("openStore")).toBeLessThan(harness.calls.indexOf("createTools"));
    expect(harness.calls.indexOf("createTools")).toBeLessThan(
      harness.calls.indexOf("store.attach"),
    );
    await app.shutdown();
  });

  it("워크스페이스는 주입된 cwd에서 나오고 realpath로 동결된다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });

    expect(harness.seen.boundaryRoots).toEqual([workspace]);
    // 세션에 기록되는 것은 realpath다 — 저장소의 재개 검증이 이 값을 비교한다
    expect(app.parts.session.workspaceRoot).toBe(app.parts.boundary.root);
    await app.shutdown();
  });

  it("도구와 게이트 classifier가 **같은** WorkspaceBoundary 인스턴스를 받는다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });

    const [toolOptions] = harness.seen.toolOptions;
    const [gateConfig] = harness.seen.gateConfigs;
    expect(toolOptions?.boundary).toBe(app.parts.boundary);
    expect(gateConfig?.classifier).toBe(app.parts.boundary);
    // 판정기가 둘이면 "게이트는 안이라 했는데 도구는 밖을 읽는" 불일치가 생긴다
    expect(gateConfig?.classifier).toBe(toolOptions?.boundary);
    await app.shutdown();
  });

  it("모델 클라이언트에는 apiKey·model만 넘어간다 — fetch를 채우지 않는다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });

    const [config] = harness.seen.modelConfigs;
    expect(config).toEqual({ apiKey: "sk-ant-테스트", model: app.parts.config.model });
    expect(Object.keys(config ?? {})).not.toContain("fetch");
    await app.shutdown();
  });

  /**
   * `SAFE-DEFAULTS.md` §3 계약 3 — 자식 프로세스 env 스크러빙. **값 기반 제거가
   * 성립하려면 실행자가 값을 알아야 하므로**(`CLI-INTERFACE.md` §4.3) 로더가 로드한
   * 시크릿 값 목록이 실행자 생성 시 전달돼야 한다.
   *
   * **경로를 고정한다.** 이 계약의 주체는 **호스트 실행자**이고, 기본값이
   * `sandbox: "on"`이 된 뒤로 그 경로는 명시적 옵트아웃에서만 열린다 —
   * 컨테이너 실행자는 env가 비어서 시작하는 화이트리스트라 시크릿을 **애초에 받지
   * 않는 것이 계약**이다(`SANDBOX.md` §4). 그래서 계약을 지우는 대신 `"off"`로
   * 갈래를 고정해 검사한다. 컨테이너 쪽의 대응 단언(시크릿을 **안** 받는다)은
   * `sandbox-web-integration.test.ts`에 있다.
   */
  it('sandbox "off"의 호스트 실행자는 로드된 시크릿 값 목록을 받는다 (env 스크러빙)', async () => {
    writeConfig({ sandbox: "off" });
    // §2 5b: `"off"`면 Docker 판정 자체를 하지 않는다 — 불리면 여기서 기동이 깨진다.
    const harness = createHarness({ probeDocker: dockerProbeForbidden() });
    const app = await startCli(harness.deps, { kind: "run" });

    expect(harness.calls).toContain("createExecutor");
    expect(harness.calls).not.toContain("createSandboxExecutor");
    expect(harness.seen.executorSecrets[0]).toEqual(["sk-ant-테스트"]);
    expect(app.parts.credentials.secretValues).toEqual(["sk-ant-테스트"]);
    await app.shutdown();
  });

  it("게이트는 동결된 설정과 allowlist·프롬프트를 받는다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });

    const [gateConfig] = harness.seen.gateConfigs;
    expect(gateConfig?.mode).toBe(app.parts.config.approvalMode);
    expect(gateConfig?.denyRules).toBe(app.parts.config.denyRules);
    expect(gateConfig?.allowlist).toBe(app.parts.allowlist);
    /**
     * **프로필 테이블은 도구 패키지별 소유 + 호스트 병합이다**(`TOOLS-INTERFACE.md`
     * §5, 2026-08-09 신설): `packages/tools` → 파일 3종 + `shell`,
     * `packages/web` → `web_fetch`. 배선은 `{ ...TOOL_GATE_PROFILES,
     * ...WEB_TOOL_GATE_PROFILES }`이므로 5개가 **맞다** — 이 단정의 이전 판(4개)은
     * `web_fetch` 이전의 계약을 굳혀 놓은 것이었다.
     *
     * 개수가 아니라 **키 집합**을 단정한다. 개수만 세면 `web_fetch`가 빠지고 엉뚱한
     * 이름이 들어와도 통과하고, 그때 `web_fetch`는 프로필 미등록이 되어 fail-closed로
     * 조용히 항상 프롬프트가 된다(동작은 안전하되 계약과 다르다).
     *
     * 2026-08-09: `packages/memory` → `MEMORY_TOOL_GATE_PROFILES`(`remember` 1종)가
     * 병합에 더해져 6개다. **이 단정의 이전 판(5개)은 메모리 이전의 계약을 굳혀 놓은
     * 것**이고, 바로 위 주석이 기록한 4→5(web_fetch)와 같은 종류의 확장이다.
     * `remember`가 빠지면 메모리 저장마다 승인 프롬프트가 뜬다 —
     * `APPROVAL-GATE.md` §2 계층 5가 "등록하지 않는 것은 중립이 아니다"라 부른 상태다.
     *
     * 2026-09-02: `packages/web`이 자기 테이블에 `web_search`를 더해 7개다
     * (`WEB-ACCESS.md` §6 — 새 테이블을 만들지 않고 같은 테이블의 두 번째 엔트리다).
     * **이 축은 도구 등록이 아니라 프로필 병합을 잰다** — 검색 키가 없는 이 하네스에서
     * 도구는 등록되지 않지만 병합 지점은 무변경이라 프로필은 그대로 실린다. 그 둘이
     * 갈리는 것이 계약이고, 등록 쪽은 `web-search-wiring.contract.test.ts`가 잰다.
     * **`toContain`으로 무르지 않는다** — 이 축이 하는 일이 테이블 내용의 무단 변경을
     * 잡는 것이고, 부분 포함으로 바꾸면 엉뚱한 이름이 늘어도 조용히 통과한다.
     */
    expect(Object.keys(gateConfig?.toolProfiles ?? {}).sort()).toEqual([
      "edit_file",
      "read_file",
      "remember",
      "shell",
      "web_fetch",
      "web_search",
      "write_file",
    ]);
    await app.shutdown();
  });

  it("저장소 구독이 렌더러 구독보다 먼저다 (SESSION-STORE §4)", async () => {
    const harness = createHarness();
    const order: string[] = [];
    const original = Agent.prototype.subscribe;
    const spy = vi.spyOn(Agent.prototype, "subscribe").mockImplementation(function (
      this: Agent,
      listener,
    ) {
      order.push("subscribe");
      return original.call(this, listener);
    });

    const wrappedStore = harness.deps.factories?.openStore;
    harness.deps.factories = {
      ...harness.deps.factories,
      openStore: (opts) => {
        const store = wrappedStore?.(opts) as SessionStore;
        return {
          ...store,
          attach: (agent, sessionId) => {
            order.push("attach");
            return store.attach(agent, sessionId);
          },
        };
      },
    };

    const app = await startCli(harness.deps, { kind: "run" });
    // `store.attach`가 자기 리스너를 구독하고(두 번째 항목), 렌더러가 그 뒤다.
    // 리스너는 구독 순서대로 await되므로(코어 §3) 이 순서가 곧 전달 순서다.
    expect(order).toEqual(["attach", "subscribe", "subscribe"]);
    spy.mockRestore();
    await app.shutdown();
  });

  it("화면에 턴이 마감될 때 그 응답은 이미 저장돼 있다", async () => {
    const harness = createHarness({ model: fakeModel("저장 먼저") });
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    // usage 한 줄(turn_end)이 찍히는 순간 DB를 들여다본다 — 구독 순서의 관찰 가능한 결과다.
    let rolesAtTurnEnd: string[] | undefined;
    harness.deps.io.output.on("data", (chunk: Buffer) => {
      if (rolesAtTurnEnd !== undefined || !chunk.toString("utf8").includes("↑")) return;
      rolesAtTurnEnd = app.parts.store
        .loadSession(app.parts.session.id, {
          workspaceRoot: app.parts.boundary.root,
          systemPrompt: app.parts.session.systemPrompt,
          model: app.parts.session.model,
        })
        .messages.map((message) => message.role);
    });

    harness.input.write("확인\r");
    await waitFor(harness, "↑");

    expect(rolesAtTurnEnd).toEqual(["user", "assistant"]);
    await app.shutdown();
    await running;
  });

  it("크리덴셜이 없으면 저장소를 열지 않는다 — 부분 기동 금지", async () => {
    const harness = createHarness();
    harness.deps.env = {};

    await expect(startCli(harness.deps, { kind: "run" })).rejects.toThrow(/API 키/);
    expect(harness.calls).not.toContain("openStore");
  });

  it("5~7단계에서 실패하면 이미 연 저장소를 닫는다", async () => {
    const harness = createHarness();
    harness.deps.factories = {
      ...harness.deps.factories,
      createTools: () => {
        throw new Error("도구 등록 실패");
      },
    };

    await expect(startCli(harness.deps, { kind: "run" })).rejects.toThrow("도구 등록 실패");
    expect(harness.calls).toContain("openStore");
    expect(harness.calls).toContain("store.close");
  });

  it("느슨한 크리덴셜 파일이면 기동을 거부한다 (fail-closed)", async () => {
    const credentials = join(home, ".neo-agent", "credentials");
    await mkdir(join(home, ".neo-agent"), { recursive: true });
    writeFileSync(credentials, `${API_KEY_ENV}=k\n`);
    chmodSync(credentials, 0o644);

    const harness = createHarness();
    await expect(startCli(harness.deps, { kind: "run" })).rejects.toThrow(/chmod 0600/);
  });
});

describe("대화 왕복", () => {
  it("입력이 모델까지 가고, 저장된 뒤 화면에 남는다", async () => {
    const harness = createHarness({ model: fakeModel("모델 응답이다") });
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    harness.input.write("질문이다\r");
    await waitFor(harness, "모델 응답이다");
    await app.parts.agent.waitForIdle();

    expect(harness.text()).toContain("질문이다");
    expect(harness.text()).toContain("모델 응답이다");
    // 화면에 보인 것은 이미 저장된 것이다
    const stored = app.parts.store.loadSession(app.parts.session.id, {
      workspaceRoot: app.parts.boundary.root,
      systemPrompt: app.parts.session.systemPrompt,
      model: app.parts.session.model,
    });
    expect(stored.messages.map((message) => message.role)).toEqual(["user", "assistant"]);

    await app.shutdown();
    await running;
  });

  it("turn_end의 usage가 화면에 나온다 — 비용 가시성", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    harness.input.write("비용 확인\r");
    await waitFor(harness, "↑1");

    expect(harness.text()).toMatch(/↑1/);
    await app.shutdown();
    await running;
  });
});

describe("승인 게이트 배선 (§9·APPROVAL-GATE §4)", () => {
  /** 첫 턴에 도구를 부르고, 두 번째 턴에 마무리하는 모델 */
  function toolCallingModel(path: string): ModelClient {
    let turn = 0;
    return {
      modelId: "fake-tool-model",
      async *stream(): AsyncIterable<ModelStreamEvent> {
        turn += 1;
        if (turn === 1) {
          yield { type: "toolcall", toolCallId: "call-1", toolName: "read_file", args: { path } };
          yield {
            type: "done",
            message: {
              role: "assistant",
              content: [
                { type: "toolCall", toolCallId: "call-1", toolName: "read_file", args: { path } },
              ],
              stopReason: "tool_use",
              usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
              timestamp: Date.now(),
            },
          };
          return;
        }
        yield { type: "text_delta", text: "다 읽었다" };
        yield {
          type: "done",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "다 읽었다" }],
            stopReason: "end_turn",
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
            timestamp: Date.now(),
          },
        };
      },
    };
  }

  it("워크스페이스 밖 읽기는 승인을 묻고, 허용하면 실행된다", async () => {
    const outside = join(home, "밖의-파일.txt");
    writeFileSync(outside, "바깥 내용");

    const harness = createHarness({ model: toolCallingModel(outside) });
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    harness.input.write("그 파일 읽어줘\r");
    await waitFor(harness, "승인 필요");

    // 승인 대기 중이면 입력 소유권이 프롬프트에 있다(§8)
    expect(app.parts.repl.state).toBe("approval-wait");

    harness.input.write("y");
    await waitFor(harness, "다 읽었다");
    await app.parts.agent.waitForIdle();

    expect(harness.text()).toContain("한 번 허용");
    expect(harness.text()).toContain("바깥 내용");
    expect(app.parts.repl.state).toBe("idle-input");

    await app.shutdown();
    await running;
  });

  it("거부하면 도구가 실행되지 않고 모델이 사유를 받는다", async () => {
    const outside = join(home, "안-읽힐-파일.txt");
    writeFileSync(outside, "비밀 내용");

    const harness = createHarness({ model: toolCallingModel(outside) });
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    harness.input.write("그 파일 읽어줘\r");
    await waitFor(harness, "승인 필요");
    harness.input.write("n");
    await waitFor(harness, "다 읽었다");
    await app.parts.agent.waitForIdle();

    expect(harness.text()).not.toContain("비밀 내용");
    // 침묵 거부 금지 — 모델에게 도구 에러로 전달된다(코어 §7)
    const transcript = app.parts.agent.state.messages;
    const toolResult = transcript.find((message) => message.role === "toolResult");
    expect(toolResult?.role === "toolResult" && toolResult.isError).toBe(true);

    await app.shutdown();
    await running;
  });

  it("워크스페이스 안 읽기는 묻지 않는다 (SAFE-DEFAULTS §1 매트릭스)", async () => {
    const inside = join(workspace, "안의-파일.txt");
    writeFileSync(inside, "워크스페이스 내용");

    const harness = createHarness({ model: toolCallingModel(inside) });
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    harness.input.write("읽어줘\r");
    await waitFor(harness, "다 읽었다");
    await app.parts.agent.waitForIdle();

    expect(harness.text()).not.toContain("승인 필요");
    expect(harness.text()).toContain("워크스페이스 내용");

    await app.shutdown();
    await running;
  });
});

describe("세션 명령 (§5·§6)", () => {
  it("/new는 새 세션과 새 Agent 인스턴스를 만든다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    const first = { session: app.parts.session.id, agent: app.parts.agent };
    harness.input.write("/new\r");
    await waitFor(harness, "새 세션");

    expect(app.parts.session.id).not.toBe(first.session);
    expect(app.parts.agent).not.toBe(first.agent);
    await app.shutdown();
    await running;
  });

  it("/sessions는 저장된 세션을 보여준다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    harness.input.write("/new\r");
    await waitFor(harness, "새 세션");
    harness.input.write("/sessions\r");
    await waitFor(harness, app.parts.session.id.slice(0, 8));

    const shown = harness.text();
    expect(shown).toContain(app.parts.session.id.slice(0, 8));
    await app.shutdown();
    await running;
  });

  it("/resume은 과거 대화를 화면에 되그린다 (§6)", async () => {
    const harness = createHarness({ model: fakeModel("첫 세션의 답") });
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    harness.input.write("첫 세션의 질문\r");
    await waitFor(harness, "첫 세션의 답");
    await app.parts.agent.waitForIdle();
    const firstId = app.parts.session.id;

    harness.input.write("/new\r");
    await waitFor(harness, "새 세션");
    expect(app.parts.session.id).not.toBe(firstId);

    harness.input.write(`/resume ${firstId.slice(0, 8)}\r`);
    await waitFor(harness, "이어가기");

    expect(app.parts.session.id).toBe(firstId);
    // 재개 직후 "어디까지 진행된 세션인지"가 보여야 한다
    const tail = harness.text().slice(harness.text().lastIndexOf("이어가기"));
    expect(tail).toContain("첫 세션의 질문");
    expect(tail).toContain("첫 세션의 답");

    await app.shutdown();
    await running;
  });

  it("없는 접두는 한국어 안내로 실패하고 세션을 바꾸지 않는다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();
    const before = app.parts.session.id;

    harness.input.write("/resume zzzzzzzz\r");
    await waitFor(harness, "시작하는 세션이 없다");

    expect(harness.text()).toContain("시작하는 세션이 없다");
    expect(app.parts.session.id).toBe(before);
    await app.shutdown();
    await running;
  });

  it("/delete는 대상을 보여주고 확인을 받은 뒤에만 지운다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    const doomed = app.parts.session.id;
    harness.input.write("/new\r");
    await waitFor(harness, "새 세션");

    harness.input.write(`/delete ${doomed.slice(0, 8)}\r`);
    await waitFor(harness, "삭제 대상");

    // 아직 지워지지 않았다 — 확인 전이다
    expect(app.parts.store.listSessions().some((s) => s.id === doomed)).toBe(true);

    harness.input.write("y");
    await waitFor(harness, "삭제했다");

    expect(app.parts.store.listSessions().some((s) => s.id === doomed)).toBe(false);
    await app.shutdown();
    await running;
  });

  /**
   * §8 — `approval-wait`의 소유자는 **게이트 승인 프롬프트만이 아니다.** REPL에게서
   * 입력 소유권을 넘겨받는 모든 프롬프트가 이 상태를 쓰고, §8은 `/delete`의 확인을
   * 그 예로 직접 든다.
   *
   * 이 단언이 없어 계약이 6일간 무방비였다: 위 두 테스트는 확인 프롬프트의 **동작**을
   * 지나므로(`y`가 대화 입력으로 새면 "삭제했다"가 안 나온다) 실질은 잡지만, §8이
   * 계약으로 올린 것은 *"이 상태를 쓴다"*이고 그 문장을 붙잡는 것은 하나도 없었다.
   * 그래서 `wiring.ts`의 주석과 §8이 정반대를 말하는 동안에도 게이트는 계속 그린이었다.
   *
   * 게이트 승인 쪽 `approval-wait`은 §9 describe가 이미 잰다 — 이 테스트는 §8이
   * "승인 프롬프트만이 아니다"라고 말한 **나머지 절반**을 잰다.
   */
  it("/delete 확인 중에는 입력 소유권이 넘어가 approval-wait이다 (§8)", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    const target = app.parts.session.id;
    expect(app.parts.repl.state).toBe("idle-input");

    harness.input.write(`/delete ${target.slice(0, 8)}\r`);
    await waitFor(harness, "삭제 대상");

    // 확인을 기다리는 동안 REPL은 입력의 주인이 아니다
    expect(app.parts.repl.state).toBe("approval-wait");

    harness.input.write("n");
    await waitFor(harness, "취소했다");

    // 소유권은 돌아온다 — 이양은 그 구간에 한정된다
    expect(app.parts.repl.state).toBe("idle-input");

    await app.shutdown();
    await running;
  });

  it("확인에서 n을 누르면 지우지 않는다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    const target = app.parts.session.id;
    harness.input.write(`/delete ${target.slice(0, 8)}\r`);
    await waitFor(harness, "삭제 대상");
    harness.input.write("n");
    await waitFor(harness, "취소했다");

    expect(app.parts.store.listSessions().some((s) => s.id === target)).toBe(true);
    expect(harness.text()).toContain("취소했다");
    await app.shutdown();
    await running;
  });
});

describe("종료 시퀀스 (§2)", () => {
  it("저장소를 닫고 재개 방법을 남긴다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();
    const id = app.parts.session.id;

    await app.shutdown();
    await running;

    expect(harness.calls).toContain("store.close");
    expect(harness.text()).toContain(`neo-agent --resume ${id.slice(0, 8)}`);
  });

  it("두 번 불러도 안전하다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    await app.shutdown();
    await app.shutdown();
    await running;

    expect(harness.calls.filter((call) => call === "store.close")).toHaveLength(1);
  });

  it("/exit도 같은 종료 시퀀스를 탄다", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });
    const running = app.run();

    harness.input.write("/exit\r");
    await running;

    expect(harness.calls).toContain("store.close");
  });
});

describe("runCli (§5)", () => {
  it("--help·--version은 시작 시퀀스를 타지 않는다", async () => {
    const help = createHarness({ argv: ["--help"] });
    help.deps.env = {}; // 크리덴셜이 없어도 안내는 나와야 한다
    expect(await runCli(help.deps)).toBe(EXIT_OK);
    expect(help.text()).toContain("사용법");
    expect(help.calls).not.toContain("openStore");

    const version = createHarness({ argv: ["--version"] });
    expect(await runCli(version.deps)).toBe(EXIT_OK);
    expect(version.text().trim()).toBe("0.0.0-test");
  });

  it("잘못된 인자는 사용법과 함께 종료 코드 2다", async () => {
    const harness = createHarness({ argv: ["--resmue", "abc"] });
    expect(await runCli(harness.deps)).toBe(EXIT_USAGE);
    expect(harness.text()).toContain("알 수 없는 인자");
  });

  it("기동 실패는 원인을 남기고 종료 코드 1이다", async () => {
    const harness = createHarness();
    harness.deps.env = {};
    expect(await runCli(harness.deps)).toBe(EXIT_STARTUP_FAILED);
    expect(harness.text()).toContain("API 키를 찾지 못했다");
  });
});

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 이스케이프를 벗기는 것이 목적이다
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}
