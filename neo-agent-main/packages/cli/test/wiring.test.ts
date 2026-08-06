/**
 * 조립 단위 테스트 — `docs/CLI-INTERFACE.md` §2·§5·§6.
 *
 * 배선의 계약은 **결과물이 아니라 전달 인자와 호출 순서**에 있다. 그래서 생성자
 * 주입점(`WiringFactories`)으로 실물을 감싸 관찰한다 — 저장소는 진짜 sqlite를 쓰되
 * `attach` 호출 시점만 기록하는 식이다. 모델만 가짜다(네트워크 금지).
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});

afterEach(() => {
  rmSync(join(home, ".."), { recursive: true, force: true });
});

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
    gateConfigs: Parameters<WiringFactories["createGate"]>[0][];
    toolOptions: Parameters<WiringFactories["createTools"]>[0][];
    stores: SessionStore[];
  };
}

function createHarness(options: { argv?: string[]; model?: ModelClient } = {}): Harness {
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

  it("executor는 로드된 시크릿 값 목록을 받는다 (env 스크러빙)", async () => {
    const harness = createHarness();
    const app = await startCli(harness.deps, { kind: "run" });

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
    expect(Object.keys(gateConfig?.toolProfiles ?? {})).toEqual([
      "read_file",
      "write_file",
      "edit_file",
      "shell",
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
