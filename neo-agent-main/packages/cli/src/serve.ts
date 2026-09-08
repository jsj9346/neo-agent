/**
 * `neo-agent serve` — 웹 UI 서버의 배선. 계약 정본은 `docs/WEB-UI.md` §3·§3.1·§3.2다.
 *
 * **이 파일은 두 번째 호스트다.** `CLI-INTERFACE.md` §1이 *"두 번째 호스트는 조립을
 * **부르는** 쪽이지 조립하는 쪽이 아니다"*로 연 자리이고, 그래서 여기서 하는 일은 셋뿐이다:
 * `CliDeps`에 값 셋(고지 싱크·승인 프롬프트·추가 구독자)을 채워 조립을 부르고, 조립이
 * 돌려준 부품에 `packages/serve`의 부품을 물리고, 신호를 기다린다.
 *
 * ## `run()`을 부르지 않는다
 *
 * `startCli`가 돌려주는 `run()`은 §2 단계 8(REPL 진입)이다. `serve`의 8단계는 그것이
 * 아니라 **서버 바인드**이므로 이 파일은 `run()`을 부르지 않는다 — REPL 객체는 조립
 * 안에서 만들어지되 `repl.start()`가 `run()` 안에 있어 readline이 붙지 않는다. 조립에서
 * REPL을 걷어내는 것은 `CLI-INTERFACE.md` §7.1이 요구하지 않는다: 그 호스트의 요구는
 * «조립이 완주하고 화면 부작용이 없다»까지다.
 *
 * **`assembleRuntime`류를 새로 만들지 않는다.** 조립을 둘로 가르면 시작 시퀀스의 순서
 * 계약이 두 곳에 살게 되고, `WEB-UI.md` §3이 *"기동 시퀀스의 순서가 계약이다"*로 상속을
 * 선언한 문장이 그 순간 거짓이 된다.
 *
 * ## 순서 — §3이 상속에 둘을 더한다
 *
 * **`0` 존재 검사(§3.1)** → 설정 동결 → 크리덴셜 → 경계 → 저장소 → 세션 → Agent →
 * **저장소 구독** → **서버 바인드** → 대기. 앞의 여덟은 `startCli` 안이고 이 파일이
 * 소유하는 것은 뒤의 둘이다. **바인드가 구독보다 뒤인 것이 계약이므로**(§3) 이 파일에서
 * `server.listen()`은 `await startCli(...)` **뒤**에만 나타난다 — 구독은 조립이 반환하는
 * 시점에 이미 서 있다.
 *
 * ## 이 파일이 `node:http`를 임포트하지 않는다
 *
 * 예산 게이트가 `cli`에 대해 그것을 금지한다(`ARCHITECTURE.md` §2.5의 의존성 예산).
 * 요청·응답은 `@neo-agent/serve`가 좁혀 내보낸 표면(`PlainRequest`)으로만 만진다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 문서를 줄번호로
 * 가리키는 자리는 이 규약의 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호로 한다.
 */

import type {
  AgentEvent,
  AgentEventListener,
  AgentMessage,
  Unsubscribe,
  UserMessageInput,
} from "@neo-agent/core";
import type { ApprovalPrompt } from "@neo-agent/gate";
import {
  type AgentEventSource,
  type ApprovalRegistry,
  type AssetHandler,
  createApprovalRegistry,
  createAssetHandler,
  createDispatcher,
  createMethodTable,
  createServeServer,
  createStreamHub,
  type Dispatcher,
  decodeRequest,
  encodeResponse,
  installShutdownSignals,
  LOOPBACK_HOST,
  METHOD_PATH,
  type MethodDeps,
  type PlainRequest,
  type RunControl,
  readRequestBody,
  type ServeAddress,
  type SessionSnapshot,
  type ShutdownPorts,
  type SignalHost,
  type StreamHubOptions,
  type StreamOpen,
  type TranscriptReader,
} from "@neo-agent/serve";
import type { CliConfig } from "./config.ts";
import type { OutputSink } from "./terminal.ts";
import { type CliApp, type CliDeps, EXIT_STARTUP_FAILED, startCli } from "./wiring.ts";

/**
 * `runServe`의 주입 표면.
 *
 * **`CliDeps`와 성격이 같다** — 이 파일이 만들지 않고 그대로 쓰는 값이다. 전부 선택적인
 * 것은 기본 갈래가 전부 실물이기 때문이고, 여는 이유는 검사가 실물 소켓·실물 신호 없이
 * 이 배선을 구동할 수 있어야 하기 때문이다.
 */
export type ServeOptions = {
  /** 바인드 포트. 생략하면 `packages/serve`의 기본값. 0이면 커널이 고른다(검사가 쓴다) */
  readonly port?: number;
  /** §3.2 4·5의 유예(ms). 생략하면 `packages/serve`의 기본값 */
  readonly graceMs?: number;
  /**
   * 신호 리스너를 다는 자리. 생략하면 프로세스 전역.
   *
   * 검사가 실제 `SIGINT`을 보내지 않고 종료 시퀀스를 구동할 수 있어야 한다 — 실신호를
   * 쓰면 vitest 워커가 함께 죽는다.
   */
  readonly signals?: SignalHost;
  /** 종료 코드를 싣는 자리. 생략하면 `process.exitCode`(그 기본값은 `packages/serve`가 든다) */
  readonly setExitCode?: (code: number) => void;
  /**
   * 서버 로그로 향하는 고지 싱크.
   *
   * `CliDeps.out`에 그대로 흘러가고, §3.2 8단계의 표시와 §3.1의 거부 문면도 여기로
   * 나간다. 생략하면 호스트가 준 출력 스트림을 뿌리로 하는 싱크를 만든다 —
   * §3.2가 *"`serve`의 표준 출력은 대개 저널로 간다"*고 적었으므로 이 싱크의 실물을
   * 고르는 것은 배선의 몫이다.
   */
  readonly out?: OutputSink;
  /**
   * 이벤트 팬아웃에 붙는 **추가** 구독자.
   *
   * **검사가 실패 구독자를 심는 자리다.** §8의 *"클라이언트 연결이 끊겨도 진행 중인 런은
   * 계속된다"*를 배선이 지키는 수단은 웹 리스너가 자기 예외를 삼키는 것인데, 삼킬 예외가
   * 실제로 나야 그 계약이 관측된다 — 자리를 안 열면 그 계약을 어느 기계도 못 잰다
   * (`ARCHITECTURE.md` §2.6).
   *
   * **`CliDeps.listeners`와 다른 자리다.** 그쪽은 코어에 직접 붙어 예외가 런을 끝내고
   * (§1 — 조립이 감싸지 않는다), 이쪽은 웹 리스너 **뒤**라 예외가 삼켜진다.
   */
  readonly subscribers?: readonly AgentEventListener[];
  /** 바인드된 뒤 실주소를 받는 자리. 검사가 포트를 잡는다 */
  readonly onListening?: (address: ServeAddress) => void;
};

/**
 * 코어 구독 하나를 여럿에게 나누는 팬아웃.
 *
 * **`CliDeps.listeners`에 리스너 하나만 넣는 것이 계약이다**(`CLI-INTERFACE.md` §1 —
 * 두 번째 호스트가 붙는 형태는 팬아웃 리스너 하나). 브라우저 연결마다 코어 구독을 늘리면
 * §7.1이 든 대가(*"리스너 수가 곧 런의 실패 표면"*)가 탭 수만큼 자란다.
 *
 * 전달 규율은 코어 이미터를 그대로 물려받는다 — 구독 순서대로 순차 await하고, 한
 * 구독자의 예외가 나머지 전달을 취소하지 않으며, 삼키지 않는다. 삼키는 자리는 **이
 * 팬아웃이 아니라 코어에 붙는 웹 리스너 하나**다.
 */
class EventFanout implements AgentEventSource {
  readonly #listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  readonly deliver: AgentEventListener = async (
    event: AgentEvent,
    signal: AbortSignal,
  ): Promise<void> => {
    const failures: unknown[] = [];
    for (const listener of [...this.#listeners]) {
      // 전달 도중에 사라진 구독자는 건너뛴다 — 스냅샷을 뜬 뒤에 지워졌을 수 있다.
      if (!this.#listeners.has(listener)) continue;
      try {
        await listener(event, signal);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, `${String(failures.length)} 건의 이벤트 전달이 실패했다.`);
    }
  };
}

/**
 * `neo-agent serve`의 몸. **종료 코드를 돌려준다** — `process.exit`를 부르지 않는다.
 *
 * `runCli`가 `serve` 갈래에서 이것을 부르고 그 반환이 그대로 프로세스의 종료 코드가 된다.
 */
export async function runServe(deps: CliDeps, options: ServeOptions = {}): Promise<number> {
  // 서버 로그 싱크. **조립보다 먼저 선다** — 아래 catch가 쓰는 값이므로 조립 안에서
  // 만들어진 것으로는 닿을 수 없다(`runCli`가 고지 싱크에 대해 든 것과 같은 근거).
  // **호스트가 이미 고지 싱크를 줬으면 그것 하나를 쓴다**(`CLI-INTERFACE.md` §1). 갈래를
  // 셋으로 두는 것이 아니라, 이 옵션은 `serve`를 직접 부르는 쪽(검사·상주 하네스)이 쓰고
  // `runCli`를 지나온 기동은 `deps.out`이 이미 그 답이다. 둘 다 없을 때만 조립이 만든다.
  const log: OutputSink = options.out ??
    deps.out ?? {
      write: (text: string): void => {
        deps.io.output.write(text);
      },
    };
  const notify = (text: string): void => {
    log.write(text.endsWith("\n") ? text : `${text}\n`);
  };

  // ── 승인 레지스트리 — §7. **프로세스에 하나다.** `gate`의 프롬프트 자리에 그대로 앉는다.
  const registry = createApprovalRegistry({
    onSubscriberError: (error: unknown) => {
      notify(describeFailure("승인 구독자", error));
    },
  });

  /**
   * **`packages/serve`의 구조적 만족이 실제로 게이트의 계약을 만족한다는 증명.**
   *
   * `approvals.ts`가 `ApprovalPrompt`를 임포트로 구현할 수 없는 이유는 §2.2의 예산이고
   * (그 파일 머리가 근거를 든다), 그래서 그쪽은 구조만 지고 증명은 배선이 진다 —
   * `packages/cli`가 두 타입을 함께 보는 유일한 자리다. **이 대입이 그 증명이다**:
   * 게이트의 요청 타입이 레지스트리의 `ApprovalAsk`에 대입되지 않게 되거나 응답 유니온이
   * 갈리는 순간 여기서 컴파일이 멈춘다. 세우지 않으면 이 계약을 어느 기계도 안 잰다.
   */
  const approvalPrompt: ApprovalPrompt = registry satisfies ApprovalPrompt;
  // 위 대입은 **이 레지스트리 인스턴스**에 대한 것이고, 아래는 **타입**에 대한 것이다.
  // 갈래를 둘로 두는 이유는 값 쪽 배선이 바뀌어도(예: 어댑터를 끼우면) 타입 쪽 증명이
  // 남게 하기 위해서다 — `packages/serve`가 질 수 없는 증명이므로 여기서 두 겹으로 선다.
  const _approvalRegistryFitsPrompt: ApprovalRegistry extends ApprovalPrompt ? true : never = true;
  void _approvalRegistryFitsPrompt;

  // 조립이 돌려주는 부품은 아래 포트들이 **불리는 시점**에만 필요하다. 서버 바인드가
  // 조립 뒤이므로 그 시점에는 반드시 채워져 있고, 채워지기 전에 불리면 그것 자체가
  // 순서 위반이라 조용한 기본값으로 접지 않는다(`ARCHITECTURE.md` §2.6).
  let app: CliApp | undefined;
  const requireApp = (): CliApp => {
    if (app === undefined) {
      throw new Error(
        "조립이 끝나기 전에 서버 부품이 불렸다 — WEB-UI.md §3의 기동 순서(구독 → 바인드)가 깨졌다.",
      );
    }
    return app;
  };

  // ── 이벤트 팬아웃과 코어에 붙는 웹 리스너 하나.
  const fanout = new EventFanout();
  for (const subscriber of options.subscribers ?? []) fanout.subscribe(subscriber);

  /**
   * **웹 리스너는 자기 예외를 삼킨다** — 그리고 조용히 삼키지 않는다.
   *
   * `CLI-INTERFACE.md` §1이 추가 구독자의 예외를 조립이 감싸지 않기로 한 근거가 이
   * 자리를 열어 둔 것이다: 전파된 예외는 런을 끝내고 `prompt()`를 reject시키는데
   * (`CORE-INTERFACE.md` §3), `WEB-UI.md` §8은 클라이언트 사정이 런을 끊지 않는 것을
   * 계약으로 든다. 둘이 함께 서려면 전송 쪽 사정이 구독자 밖으로 나오지 않아야 한다.
   *
   * **렌더러와 규율이 반대인 것이 의도다.** 렌더러가 안 삼키는 것은 `CLI-INTERFACE.md`
   * §7의 계약이고, 여기서 삼키는 것은 §8의 계약이다 — 둘을 같은 규율로 묶으면 어느
   * 쪽을 골라도 다른 하나가 깨진다.
   */
  const webListener: AgentEventListener = async (
    event: AgentEvent,
    signal: AbortSignal,
  ): Promise<void> => {
    try {
      await fanout.deliver(event, signal);
    } catch (error) {
      notify(describeFailure("웹 이벤트 전달", error));
    }
  };

  // ── 조립. **`CliDeps`에 셋을 채운다**(§1이 연 표면 그대로) — 고지 싱크·완성된 승인
  // 프롬프트·추가 구독자. `deps.listeners`가 이미 있으면 그 뒤에 붙는다: 순서는 이
  // 목록이 아니라 구조가 정하므로(§1) 저장소·렌더러를 앞지를 자리가 없다.
  try {
    app = await startCli(
      {
        ...deps,
        out: log,
        approvalPrompt,
        listeners: [...(deps.listeners ?? []), webListener],
      },
      { kind: "serve" },
    );
  } catch (error) {
    // §3.1의 거부가 여기로 온다 — 그리고 §2 말미의 실패 갈래 전부가 같은 자리다.
    // **이 시점에 열린 포트가 0이다**: 서버 생성도 바인드도 이 줄 아래에 있다.
    notify(describeError(error));
    return EXIT_STARTUP_FAILED;
  }

  // ── 스트림 허브 — §6.1·§8. **조립 뒤에 만든다.**
  //
  // 세션 상태는 **두 값을 한 번에** 읽고(스냅샷이 두 세션을 담지 않게 하는 것이 그
  // 시그니처의 이유다), 안전 사실 둘은 **함수가 아니라 값으로** 넘긴다 — §6.1이 그 필드를
  // 갱신되지 않는다고 못박았으므로 연결마다 다시 읽는 소스가 있으면 안 되고, 값으로
  // 넘기면 그 상태가 표현 불가능하다(`stream.ts`의 선언부가 근거를 든다).
  //
  // **이 자리가 조립 뒤인 것은 §3의 기동 순서를 건드리지 않는다.** 그 절이 계약으로 든
  // 열거에서 이 파일이 소유하는 것은 «저장소 구독 → 서버 바인드» 둘이고, 바인드의 실물은
  // 아래 `server.listen()`이다 — **허브 생성은 그 열거의 항이 아니다.** 허브를 읽는 자리도
  // 둘 다 이 줄 아래다(`openStream` 콜백의 `hub.open`과 종료 포트의 `streams`). 즉 옮김이
  // 관측 가능한 순서를 바꾸지 않는다.
  const config: CliConfig = app.parts.config;

  /**
   * **`CliConfig`의 두 필드가 스냅샷의 안전 사실에 대입되는 컴파일 축이 여기 선다.**
   *
   * `packages/serve`는 §2.2의 예산 때문에 `packages/cli`를 임포트할 수 없어 값 도메인을
   * 옮겨 적은 리터럴로 든다(§6.1이 *"설정 유니온을 그대로 옮긴 것이고 이 문서가 넓히지
   * 않는다"*고 적었다). 두 유니온이 갈리는 것을 재는 자리는 **두 타입을 함께 보는 이 파일
   * 하나**이고, 위 `ApprovalPrompt` 대입이 같은 형태다 — `config.ts`가 유니온을 넓히면
   * 여기서 컴파일이 멈춘다.
   *
   * **두 호스트가 같은 계약 사실을 서로 다른 출처에서 읽는다.** `CLI-INTERFACE.md` §7.1의
   * 상태줄은 셸 갈래를 5b 판정에서 읽고(`wiring.ts`의 `repl.setStatus({ shellOnHost: … })`)
   * 이쪽은 설정에서 읽는다. 오늘 그 둘이 같은 것을 말하는 근거는 `wiring.ts`의 `selectShell`이
   * `config.sandbox === "off"`일 때만 호스트 실행자를 고른다는 것이다 — 나머지 둘
   * (`sandbox`·`unavailable`)에서는 호스트에서 도는 셸이 없다.
   *
   * **[미규정]** 두 출처가 **같은 것을 말해야 한다**는 요구를 어느 문서도 적지 않는다. §6.1은
   * 이 필드의 값 도메인만 못박고, §7.1은 자기 상태줄의 출처만 든다 — 그 사이의 동치는 오늘
   * `selectShell`의 구현에서 관측될 뿐이다. 그래서 여기가 그 사실을 든다: 깨지면 화면이
   * «격리 없이 도는 셸이 있다/없다»를 거짓으로 말하고, 그것은 §7.1이 이 항목을 계약으로
   * 올린 근거를 정확히 뒤집는 방향의 오보다. 동치가 깨지는 변경(예: `sandbox: "on"`에서도
   * 호스트로 폴백하는 갈래)이 생기면 열리는 것은 이 줄이 아니라 §6.1의 값 도메인이다.
   *
   * **`sandboxImage`·모델·세션 id를 싣지 않는다.** §7.1이 계약으로 든 것은 앞의 둘뿐이고
   * 나머지 셋은 세부다 — 세부를 계약 필드에 실으면 §6.1의 스냅샷이 상태줄의 사본이 된다.
   */
  const safety: StreamHubOptions["safety"] = {
    approvalMode: config.approvalMode,
    sandbox: config.sandbox,
  };
  // 위 대입은 **이 설정 값**에 대한 것이고, 아래는 **타입**에 대한 것이다. 값 쪽 배선이
  // 바뀌어도 타입 쪽 증명이 남게 두 겹으로 세운다 — `_approvalRegistryFitsPrompt`와 같은 근거.
  //
  // **축이 양방향인 것이 이 자리의 계약이다**(2026-08-26 — 독립 QA의 D-1). 한 방향만 두면
  // 재는 것이 부분집합이라 **§6.1이 정면으로 금한 방향**(스냅샷 쪽이 넓어지는 것)이 그린으로
  // 통과한다. §6.1이 든 것은 *"설정 유니온을 그대로 옮긴 것"*이므로 계약은 포함이 아니라
  // **집합 동일성**이고, 상호 대입이 리터럴 유니온에서 그것과 같다.
  type SnapshotSafety = StreamHubOptions["safety"];
  type CliSafety = Pick<CliConfig, "approvalMode" | "sandbox">;
  type CliSafetyFitsSnapshot = CliSafety extends SnapshotSafety ? true : never;
  type SnapshotSafetyFitsCli = SnapshotSafety extends CliSafety ? true : never;
  const _cliSafetyFitsSnapshot: CliSafetyFitsSnapshot = true;
  const _snapshotSafetyFitsCli: SnapshotSafetyFitsCli = true;
  void _cliSafetyFitsSnapshot;
  void _snapshotSafetyFitsCli;

  const hub = createStreamHub({
    session: (): SessionSnapshot => {
      const parts = requireApp().parts;
      return { sessionId: parts.session.id, messages: parts.agent.state.messages };
    },
    safety,
    approvals: registry,
    // **선택적이 아니다**(`stream.ts` 선언부). 여기 오는 것은 한 연결의 쓰기 실패와 배압
    // 초과이고, 런도 다른 연결도 이것으로 끊기지 않는다(§8).
    onConnectionError: (error: unknown) => {
      notify(describeFailure("스트림 연결", error));
    },
  });

  // ── 메서드 표 — §6·§11. 코어를 통째로 넘기지 않는다(§5 규칙 2): 표가 부르는 셋만.
  //
  // **런 제어가 게터를 지나는 것이 계약이다.** 압축이 Agent를 갈아치우므로(§6) 인스턴스를
  // 값으로 잡으면 교체 뒤 화면이 조용히 멈춘다 — `CliParts.agent`가 게터인 이유가 그것이다.
  const run: RunControl = {
    // **`agent.prompt()`가 아니라 `app.prompt()`다.** 자동 압축 판정 시점 (a)가 그 안에
    // 있고(`COMPACTION.md` §3), 코어를 직접 부르면 이 호스트에서만 압축이 영영 안 돈다.
    prompt: (text: string) => requireApp().prompt(text),
    steer: (message: UserMessageInput) => {
      requireApp().parts.agent.steer(message);
    },
    abort: (reason?: string) => {
      requireApp().parts.agent.abort(reason);
    },
  };

  /**
   * 세션 조회가 읽는 원본 — `methods.ts`가 포트로 열어 둔 자리의 판정.
   *
   * **[미규정]** §6.1은 조회가 읽는 것을 저장소가 이미 영속한 것이라고 적었고, 여기서
   * 무는 것은 **코어의 인메모리 트랜스크립트**다. 저장소를 무는 갈래를 오늘 고르지 못한
   * 이유는 실물 제약이다: `SessionStore`에서 메시지를 읽는 경로는 `loadSession`뿐인데
   * 그것은 재개 경로라 `ResumeContext`(워크스페이스·시스템 프롬프트·모델)를 요구하고,
   * 그 값은 조립 안에서 만들어져 `CliParts`에 오르지 않는다. 조회 하나 때문에 재개
   * 경로의 단정과 경고를 다시 도는 것도 그 함수의 용도가 아니다.
   *
   * **두 원본이 갈리는 자리는 하나다.** 저장소 구독이 렌더러보다 먼저이므로(§2 열거의 7)
   * 코어가 든 것은 저장소가 이미 영속한 것과 같고, 갈리는 것은 **압축 뒤**다 — 분기 전
   * 조상 세션의 메시지는 저장소에만 남는다. 그 자리를 닫으려면 저장소에 컨텍스트 없는
   * 읽기가 생기거나 `CliParts`가 재개 컨텍스트를 열어야 하고, 둘 다 이 파일의 판정이
   * 아니다(`SESSION-STORE.md`·`CLI-INTERFACE.md` §1의 소관).
   */
  const transcript: TranscriptReader = {
    read: async (): Promise<readonly AgentMessage[]> => requireApp().parts.agent.state.messages,
  };

  const methodDeps: MethodDeps = {
    run,
    approvals: registry,
    transcript,
    /**
     * **선택적이 아니다**(`methods.ts` 선언부). `run.prompt`가 돌려주는 Promise는 런
     * 전체의 수명인데 §8이 런을 프로세스에 귀속시켜 응답은 즉시 나간다 — 그 Promise의
     * 거절을 아무도 안 들면 unhandled rejection으로 프로세스가 통째로 죽고, 그것은
     * §3.2가 정한 어느 종료 경로도 아니다(6·7·8이 통째로 안 돈다).
     */
    onRunError: (error: unknown) => {
      notify(describeFailure("런", error));
    },
  };
  const dispatch = createDispatcher(createMethodTable(methodDeps));

  // ── 정적 자산 — §9.1. 매니페스트도 루트도 `packages/serve`가 든다.
  const serveAsset = createAssetHandler({
    onReadError: (error: unknown, pathname: string) => {
      notify(describeFailure(`자산 읽기(${pathname})`, error));
    },
  });

  // ── 서버 — §2.1·§4. 코어 자리에 오는 것은 **팬아웃**이지 `Agent`가 아니다: 코어 구독은
  // 조립이 `activate()` 수명에 걸어 둔 웹 리스너 하나이고(§6의 Agent 교체를 따라간다),
  // 서버는 그 뒤에서 자기 연결 집합을 관리한다.
  const server = createServeServer({
    host: LOOPBACK_HOST,
    ...(options.port === undefined ? {} : { port: options.port }),
    agent: fanout,
    openStream: (open: StreamOpen) => {
      hub.open(open);
    },
    handleRequest: (plain: PlainRequest) => {
      // 응답을 쓰다 실패해도 조용히 끝나지 않는다 — 여기서 안 잡으면 unhandled
      // rejection이 되고 그것은 §3.2가 정한 어느 종료 경로도 아니다.
      void handlePlain(plain, dispatch, serveAsset, notify).catch((error: unknown) => {
        notify(describeFailure("요청 처리", error));
      });
    },
  });

  // ── 종료 포트 — §3.2. 좁혀 받은 자리마다 조립이 소유한 실물을 문다.
  const ports: ShutdownPorts = {
    server,
    streams: hub,
    approvals: registry,
    run: {
      waitForIdle: () => requireApp().parts.agent.waitForIdle(),
      abort: (reason?: string) => {
        requireApp().parts.agent.abort(reason);
      },
    },
    // 5단계. **`waitForIdle()`이 이것을 대신하지 않는다** — 자동 압축은 런이 resolve된
    // 뒤에 돌아 그동안 코어는 이미 idle이다. 비우면 7이 압축의 쓰기보다 먼저 가고, 압축
    // 컨트롤러는 자기 실패를 삼키므로 요약이 조용히 사라진다.
    waitForInFlightCompaction: () => requireApp().waitForInFlightCompaction(),
    // 7단계. 저장소는 조립이 열었고 이 포트는 닫기 하나만 본다.
    //
    // **구독 해제는 이 자리에 없다.** 조립이 `activate()`에 건 구독을 떼는 함수는 조립
    // 안쪽에 있고 `CliApp`이 그것을 열지 않는다 — `shutdown()`을 통째로 쓰면 떼어지지만
    // 그것은 §3.2가 `serve`에서 죽는다고 적은 마지막 항목(세션 id와 재개 방법)까지 함께
    // 낸다. 4·5가 이미 지난 뒤라 더 도착할 이벤트가 없다는 것이 오늘 이 자리가 비어도
    // 되는 근거다.
    store: {
      close: () => {
        requireApp().parts.store.close();
      },
    },
    // 8단계의 표시. 중단된 것이 있을 때만 나간다 — 없으면 아무것도 남기지 않는 것이
    // §3.2의 판정이고, CLI의 마지막 항목(세션 id와 재개 방법)은 여기서 죽는다.
    notify,
    // **선택적이 아니다**(`shutdown.ts` 선언부). 던지는 기본값은 나머지 단계를 건너뛰고,
    // 삼키는 기본값은 종료가 절반만 돌았다는 사실을 아무 데도 안 남긴다.
    onStepError: (error: unknown) => {
      notify(describeFailure("종료 단계", error));
    },
  };

  // ── 8. 서버 바인드. **구독은 이미 서 있다** — `startCli`가 반환한 시점에 §2 열거의 7이
  // 끝나 있고, 이 줄이 그 뒤라는 것이 §3의 순서 계약이 실물에서 뜻하는 것이다.
  //
  // **바인드 실패는 기동 실패다**(§3.2의 종료 코드 표) — 포트가 이미 쓰이는 것이 가장
  // 흔한 형태이고, 그것을 안 잡으면 이 함수 밖으로 나가는 거절이 되어 `runCli`를 지나
  // 프로세스가 사유 없이 죽는다. 이 시점에 열린 자원은 저장소이므로 함께 닫는다.
  let address: ServeAddress;
  try {
    address = await server.listen();
  } catch (error) {
    notify(describeFailure("서버 바인드", error));
    // **`app.shutdown()`을 쓰지 않는다.** 그것은 §2 종료 열거의 마지막 항목(세션 id와 재개
    // 방법)까지 함께 내는데 §3.2가 그 항목이 `serve`에서 죽는다고 정했다. 이 시점에 연
    // 자원은 저장소 하나이고 아직 어떤 런도 없었으므로 4·5에 해당하는 대기도 대상이 없다.
    app.parts.store.close();
    return EXIT_STARTUP_FAILED;
  }
  options.onListening?.(address);
  notify(`웹 UI 서버가 http://${address.host}:${String(address.port)} 에서 대기 중이다.`);
  notify("종료는 SIGINT(Ctrl+C) 또는 SIGTERM이다 — 다른 개시 경로는 없다.");

  // ── 대기. **개시 경로는 신호 하나다**(§3.2). 서버를 내리는 메서드를 두지 않는다.
  //
  // **바인드 뒤에 다는 것이 의도다.** 1단계(수락 중지)가 부르는 것이 리스너 닫기라,
  // 바인드 전에 신호가 오면 그 단계가 아직 바인드되지 않은 서버를 닫으려 든다.
  const signals = installShutdownSignals(ports, {
    ...(options.graceMs === undefined ? {} : { graceMs: options.graceMs }),
    ...(options.signals === undefined ? {} : { host: options.signals }),
    ...(options.setExitCode === undefined ? {} : { setExitCode: options.setExitCode }),
  });

  try {
    const outcome = await signals.finished;
    return outcome.exitCode;
  } finally {
    // 걷지 않으면 신호 리스너가 이벤트 루프를 붙들어 종료 뒤에도 프로세스가 안 빠져나간다.
    // 정상 경로에서는 `installShutdownSignals`가 이미 걷었고, 이 줄은 그 앞에서 빠져나가는
    // 경로(예외)를 위한 것이다 — 두 번 불러도 안전하다.
    signals.dispose();
  }
}

/**
 * 스트림 밖의 요청 하나 — 메서드 POST(§11)와 정적 자산(§9.1)이 여기서 갈린다.
 *
 * **갈림이 경로 하나의 정확 일치다.** 접두 매칭을 두면 §9.1이 라우트를 고정 매니페스트로
 * 닫은 것이 이 층에서 새고, 그 순간 요청이 준 문자열이 갈림의 재료가 된다.
 */
async function handlePlain(
  plain: PlainRequest,
  dispatch: Dispatcher,
  serveAsset: AssetHandler,
  notify: (text: string) => void,
): Promise<void> {
  const { request, response } = plain;
  const pathname = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`).pathname;

  if (pathname !== METHOD_PATH) {
    serveAsset(plain);
    return;
  }

  // 메서드 표는 사용자 개입의 왕복이다(§2.1). 다른 메서드를 받아 주면 그 왕복이
  // 조회 표면을 겸하게 된다.
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST", "content-type": "text/plain; charset=utf-8" });
    response.end("메서드 호출은 POST다.");
    return;
  }

  let body: string;
  try {
    body = await readRequestBody(request);
  } catch (error) {
    // 본문을 못 읽었다. **조용히 끝내지 않는다**(§12의 비침묵) — 프레임을 만들 수 없는
    // 실패라 프로토콜이 아니라 HTTP 층에서 답한다.
    notify(describeFailure("요청 본문", error));
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("요청 본문을 읽지 못했다.");
    return;
  }

  // 디코딩 실패도 **응답 프레임 하나**로 나간다(§6 — 요청 하나에 정확히 하나).
  //
  // **이 배선은 프레임을 바이트로 옮기지 않는다**(§5 규칙 4). 직렬화 형식·헤더·상태 코드는
  // 전부 `encodeResponse`가 정하고 여기서 하는 일은 그 산물을 응답 객체에 옮겨 싣는 것뿐이다
  // — 그래야 §2.1 말미의 되돌림 문장(전송을 바꿔도 `cli`는 손대지 않는다)이 참이 된다.
  const decoded = decodeRequest(body);
  const encoded = encodeResponse(decoded.ok ? await dispatch(decoded.frame) : decoded.response);
  response.writeHead(encoded.status, encoded.headers);
  response.end(encoded.body);
}

/** 실패 하나의 문면. **어디서 났는지를 함께 든다** — 사유만 있으면 자리를 못 찾는다 */
function describeFailure(where: string, error: unknown): string {
  return `neo-agent serve: ${where} 실패 — ${describeError(error)}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
