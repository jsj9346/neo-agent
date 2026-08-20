/**
 * 입력 상태 머신 + REPL — `docs/CLI-INTERFACE.md` §8.
 *
 * 입력 스트림의 소유자는 상태에 따라 하나뿐이다. 닫힌 목록이며 §8이 정본이다
 * (수를 여기 적지 않는다 — 압축이 넷째를 더했을 때 이 자리에 적혀 있던 수가 늙었다):
 *
 * ```
 * idle-input      활성 런 없음. 슬래시면 명령 디스패치, 아니면 prompt()
 * run-active      활성 런 진행 중. 제출은 steer() — 슬래시는 거부 + 안내
 * approval-wait   프롬프트가 입력을 소유 (§8·§9) — 게이트 승인만이 아니다
 * compacting      압축 진행 중. 제출은 전부 거부 + 안내, Ctrl+C는 요약 취소
 * ```
 *
 * **`compacting`이 닫힌 목록의 독립 상태인 것은 계약이다**(판정 E-44) — `CLI-INTERFACE.md`
 * §8이 그 목록에 싣고 `COMPACTION.md` §10이 미결을 해소로 닫았다. `approval-wait`에
 * 얹지 않은 이유는 §8이 그 상태를 "**REPL에게서 입력 소유권을 넘겨받는 프롬프트**"로
 * 명문화했기 때문이다 — 압축은 무엇도 묻지 않으므로 그 사이에 친 글자는 어떤 물음의
 * 답도 아니고, Ctrl+C의 의미도 다르다(승인 대기에서는 런 abort, 압축 중에는 요약 호출
 * 취소이며 대화는 유지된다). 이름이 두 번째 방식으로 거짓말하게 두지 않는다.
 *
 * ---
 * **R-1(readline + 스트리밍 출력 동시성) 실측 결과** — 2026-08-06, Node v25.2.1,
 * `terminal: true`를 강제한 모의 스트림과 실제 pty에서 측정:
 *
 * 1. 출력을 끼워 넣어도 `rl.line`은 보존된다. 클리어→출력→재그리기 사이에 도착한
 *    키 입력도 유실되지 않는다("타이핑 유실 없음" 계약 충족).
 * 2. `rl.prompt(true)`는 쓰지 않는다. 내부 `prevRows`가 **평문 에코 후 갱신되지
 *    않아**(readline이 일반 타이핑에서는 전체 재그리기를 하지 않는다) 감싸인
 *    입력 라인의 두 번째 재그리기부터 `\e[1A`가 한 번 더 붙어 출력 위로 겹쳐
 *    그린다(실측). 그래서 재그리기를 직접 조립한다 — 감싸이지 않은 라인에서는
 *    `rl.prompt(true)`와 **바이트가 같고**, 감싸인 라인에서는 어긋나지 않는다.
 * 3. 감싸인 라인에 대한 readline 자체의 재그리기(backspace·←)도 같은 이유로
 *    어긋난다 — 우리 개입이 없어도 그렇다(선재 결함, 실측). MVP 입력이 단일
 *    라인이라 노출 면적이 작고, 넓어지는 시점은 §11의 멀티라인 트리거와 같다.
 * 4. `rl.close()`는 keypress 리스너를 떼고 raw 모드를 되돌린다(실측). 승인 대기의
 *    입력 소유권 이양을 이것으로 구현한다 — `rl.pause()`는 스트림만 멈춰서 우리가
 *    직접 붙인 리스너까지 굶는다(실측).
 * 5. Enter가 출력하는 것은 `\r\n` 하나뿐이다 — 제출된 원시 라인을 지우려면 행 수를
 *    직접 계산해야 한다(§7 "제출 시 원시 입력 라인은 포맷된 메시지로 대체").
 * ---
 *
 * **하단 고정 영역** — `docs/CLI-INTERFACE.md` §7.1. 화면은 세 층이고 순서가 계약이다:
 * 트랜스크립트(append-only) → 상태줄(정확히 1행) → 입력 라인(최하단). 상태줄은 입력
 * 라인 **위**다 — 아래에 붙이면 §7의 *"스트리밍 중에도 입력 라인은 최하단에 유지"*가
 * 거짓이 된다.
 *
 * **한 단위로 지워지고 그려진다.** 입력 라인을 걷는 경로가 상태줄을 함께 걷고, 되그리는
 * 경로가 함께 되그린다 — 두 영역에 각자의 클리어 경로를 주면 지운 행 수와 그린 행 수가
 * 어긋나 겹쳐 그린다. 그 이행이 `statusRows()` **하나**다: 그리는 쪽(`showInput`)과 걷는
 * 쪽(`hideInput`·`eraseSubmittedLine`)이 같은 값을 본다. 이 값이 두 자리에서 계산되기
 * 시작하면 그 순간 단위성이 깨진다.
 *
 * 상태줄이 걷히는 자리 둘은 새 가드가 아니라 **기존 가드 위에 선다**: `approval-wait`은
 * `showInput`의 상태 검사가, 종료 시퀀스는 `shuttingDown`이 이미 막는다(§7.1 — 승인
 * 표시 무가공은 그 자리에 우리 것이 없을 때만 성립하고, 인사 위에 죽은 상태줄이 남으면
 * 안 된다).
 */

import { createInterface, type Interface } from "node:readline";
import { completeSlashCommand, isSlashCommand } from "./registry.ts";
import { formatStatus, type StatusFields } from "./status.ts";
import {
  advanceColumn,
  CLEAR_TO_END,
  cursorToColumn,
  cursorUp,
  displayWidth,
  style,
  type TerminalIo,
  wrappedColumn,
  wrappedRows,
} from "./terminal.ts";

export type InputState = "idle-input" | "run-active" | "approval-wait" | "compacting";

/** 프롬프트 문자는 조정 가능한 세부다(문서 머리말) */
export const PROMPT = "> ";

/** 입력 히스토리는 프로세스 메모리만 — 영속화는 §8의 트리거 대상 */
const HISTORY_SIZE = 100;

export interface ReplHandlers {
  /** 새 런 시작. 반환 프로미스는 런 종료(리스너 settlement 포함)에 settle한다 */
  prompt(text: string): Promise<void>;
  /** 진행 중 끼어들기. 런이 닫히는 구간이면 throw한다(CORE-INTERFACE §4) */
  steer(text: string): void;
  /** Ctrl+C — 진행 중인 것과 예약한 것 전부 취소 */
  abort(): void;
  /** 슬래시 명령 한 줄 */
  dispatch(line: string): Promise<void>;
  /** idle에서의 Ctrl+C·EOF — 종료 시퀀스(§2) */
  requestExit(): void;
}

export interface Repl {
  /** readline을 붙이고 입력 라인을 그린다 */
  start(): void;
  readonly state: InputState;
  /**
   * 라인 안전 출력 싱크. 렌더러·경고 핸들러가 전부 이 함수로 쓴다 —
   * 입력 라인을 걷어내고 쓴 뒤 다시 그리므로 타이핑 중인 입력이 유실되지 않는다(§7).
   */
  write(text: string): void;
  /**
   * 상태줄 값을 병합하고, 그려져 있으면 되그린다 — `docs/CLI-INTERFACE.md` §7.1.
   *
   * 되그리기는 **단위 경로**로만 한다(`hideInput` → `showInput`). 상태줄만 따로 지우는
   * 경로를 만들지 않는 것이 §7.1의 단위성이고, 만들면 지운 행 수와 그린 행 수가
   * 어긋나는 자리를 우리가 새로 여는 것이 된다.
   *
   * **갱신은 이벤트로만 일어난다**(§7.1 — 시계를 두지 않는다). 이 함수를 부르는 쪽은
   * 동결값 배선과 구독 중인 이벤트뿐이고, 여기에도 호출자 쪽에도 타이머가 없다.
   */
  setStatus(patch: Partial<StatusFields>): void;
  /**
   * 승인 대기 — **입력 소유권을 넘겨받는 프롬프트**에게 넘긴다(§8·§9).
   *
   * **게이트 승인 전용이 아니다.** §8은 이 상태의 소유자를 *REPL에게서 입력 소유권을
   * 넘겨받는 모든 프롬프트*로 정의하고 `/delete`의 확인을 예로 든다 — 실제로 배선의
   * 확인 프롬프트가 이 함수를 부른다. 이 이름을 게이트 쪽으로 좁혀 읽으면 그 호출이
   * 규칙 밖처럼 보인다.
   *
   * [미규정] 계약은 상태와 "프롬프트가 입력을 소유"까지만 정하고 이양 **수단**을
   * 정하지 않는다. readline을 떼었다 다시 붙이는 것으로 닫았다(R-1 실측 4).
   * 이양 중에도 Ctrl+C는 이 REPL이 감시한다 — 승인 대기의 Ctrl+C가 `abort()`인 것은
   * 계약이고(§8), 승인 UI는 그 의미론을 모르기 때문이다.
   *
   * 이양 구간의 출력은 승인 UI가 직접 한다. **블록을 개행으로 끝내는 것이 전제**이며,
   * 복귀 시 출력 커서를 행 처음으로 간주한다.
   */
  withApprovalWait<T>(run: () => Promise<T>): Promise<T>;
  /**
   * 압축 구간 — 입력을 받지 않고 Ctrl+C를 요약 취소로 돌린다(`COMPACTION.md` §6).
   *
   * `withApprovalWait`와 달리 **readline을 떼지 않는다.** 압축은 키를 읽지 않으므로
   * 소유권을 가져갈 이유가 없고, 붙여 둔 채로 두면 타이핑 중이던 입력이 압축 출력에
   * 밀리지 않고 그대로 남는다(§7 "타이핑 중인 입력은 출력에 의해 유실되지 않는다").
   * 제출만 막으면 "입력을 받지 않는다"가 성립한다 — 그 거부는 안내와 함께 보인다.
   */
  withCompaction<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T>;
  /**
   * REPL을 닫고 입력 라인을 화면에서 걷어낸다 — 터미널 반납.
   *
   * **종료 시퀀스의 마지막 항목(세션 id와 재개 방법 표시)은 이 호출 뒤에 나가는 것이
   * 계약이다**(`CLI-INTERFACE.md` §2). 열려 있는 동안의 출력은 `write`가 입력 라인을
   * 걷어냈다 다시 그리는 것을 감싸므로, 반납 전에 인사를 내면 걷어내기에 지워지거나
   * 인사 아래에 죽은 프롬프트 행이 남는다 — 둘 다 §2.6 가시성이 금하는 결과다.
   */
  close(): void;
}

export function createRepl(io: TerminalIo, handlers: ReplHandlers): Repl {
  const { input, output } = io;

  let state: InputState = "idle-input";
  let rl: Interface | undefined;
  /** 입력 라인이 지금 화면에 그려져 있는가 */
  let inputDrawn = false;
  /** 마지막 개행 이후 출력이 쓴 칸 수. 입력 라인을 걷어낸 뒤 이어 쓸 위치다 */
  let outputColumn = 0;
  /** 우리가 의도적으로 닫는 중 — `close` 이벤트를 종료 요청으로 오인하지 않는다 */
  let detaching = false;
  let shuttingDown = false;
  let runPromise: Promise<void> | undefined;
  /** 압축 진행 중일 때만 존재한다 — Ctrl+C가 요약 호출에 닿는 통로(COMPACTION §6) */
  let compactionAbort: AbortController | undefined;
  /** 제출 처리 직렬화. steer 경로만 이 줄을 타지 않는다(런 중 즉시성이 계약이다) */
  let queue: Promise<void> = Promise.resolve();
  /** 최신이 앞. readline에 넘기는 것은 항상 사본이다 — 인터페이스가 자기 배열을 변형한다(실측) */
  const history: string[] = [];

  /**
   * 상태줄에 실릴 값 — §7.1의 다섯 항목.
   *
   * 초기값은 **안전한 기본값**이다(`SAFE-DEFAULTS.md` §1·§2). 배선이 실값을 넣기 전까지
   * 이 상태로 그려지는데, 기본값에서는 계약 항목 둘이 아무것도 싣지 않으므로(§7.1)
   * 배선 전에 «보호가 꺼져 있다»가 화면에 뜨는 경로가 없다 — 반대로 초기값을 `"off"`로
   * 두면 그 짧은 창에서 표시가 거짓말을 한다.
   */
  const status: StatusFields = { approvalMode: "manual", shellOnHost: false, model: "" };

  /**
   * 상태줄을 그리는가 — 축이 둘이다.
   *
   * 1. `input.isTTY === true` — 커서 제어가 성립하는가(§7.1: *"TTY가 아니면 그리지
   *    않는다"*). 그러지 않은 곳에 고정 영역을 그리면 이스케이프가 그대로 섞여 나간다.
   * 2. `output.columns`가 유한한 양수 — 폭을 알아야 자를 수 있다(§7.1의 1행 제약).
   *
   * [미규정] §7.1은 첫 축의 **대상 스트림**을 정하지 않는다. 그 절이 선례로 든 둘
   * (`approval-ui.ts`·`wiring.ts`)은 **입력** 스트림을 보는데, 상태줄이 실제로 요구하는
   * 것은 «커서 제어가 성립하는가 + 폭을 아는가»이고 뒤엣것은 **출력** 스트림의 성질이다.
   * 두 축을 모두 요구하는 **더 좁은 쪽**으로 닫았다 — 좁은 해석은 계약을 어기지 않고
   * 넓은 해석은 어긴다. 실경로가 있어서 고른 것이지 이론이 아니다: `main.ts`가 막는
   * 것은 `process.stdin.isTTY`뿐이라 `neo-agent | tee log`는 기동하고, 그때 stdin은
   * TTY인데 stdout은 파이프라 `columns`가 없다. 그 조합에서 그리면 무제한 폭으로
   * 감싸이고 `statusRows()`가 그 즉시 틀어진다.
   * **이것을 정할 정본은 `docs/CLI-INTERFACE.md` §7.1이다.**
   *
   * **게이트가 검증한 폭을 그대로 돌려준다** — 통과 여부와 그릴 때 쓰는 폭이 갈리지
   * 않게 한다. 0은 «그리지 않는다»이고, 그리는 경우의 폭은 항상 여기서 나온 값이다.
   */
  const statusColumns = (): number => {
    if (input.isTTY !== true) return 0;
    const columns = output.columns;
    if (typeof columns !== "number" || !Number.isFinite(columns) || columns <= 0) return 0;
    return columns;
  };

  /**
   * 하단 고정 영역에서 상태줄이 차지하는 행 수 — **이 값은 여기서만 나온다**(§7.1 단위성).
   *
   * 내용이 비어도 행은 차지한다(플랜 §8.2 A-1 추정). 조건부 행으로 두면 «걷은 행 수 ==
   * 그린 행 수»를 매 호출 분기로 판정하게 되고, 그것이 정확히 §7.1이 «별도 클리어 경로»라
   * 부르며 금지한 형태다.
   */
  const statusRows = (): number => (statusColumns() > 0 ? 1 : 0);

  /** 제어 시퀀스 — 열 추적에 영향을 주지 않는다 */
  const control = (sequence: string): void => {
    if (sequence !== "") output.write(sequence);
  };

  /** 본문 — 출력 열을 추적한다 */
  const body = (text: string): void => {
    if (text === "") return;
    output.write(text);
    outputColumn = advanceColumn(outputColumn, text);
  };

  /**
   * 마지막 키 입력 시점의 커서 행 오프셋.
   *
   * readline의 `getCursorPos()`는 전각 문자를 제대로 세지만 `line` 이벤트 시점에는
   * 이미 버퍼가 비어 있어(실측) 그때 물어볼 수 없다. 그래서 키가 처리된 직후마다
   * 받아 둔다 — 우리 리스너는 readline의 처리 뒤에 불리므로(등록 순서) 항상 최신
   * 상태를 본다. 제출된 원시 라인을 몇 행 지워야 하는지가 여기서 나온다.
   */
  let cursorRows = 0;

  /** 출력 커서를 입력 라인 위쪽 제자리로 돌린다 */
  const restoreOutputCursor = (): void => {
    if (outputColumn > 0) {
      // 입력 라인을 그릴 때 우리가 넣은 개행이 한 행을 만들었다. 상대 이동이라
      // 화면이 스크롤됐어도 같은 자리로 돌아온다.
      control(cursorUp(1) + cursorToColumn(wrappedColumn(outputColumn, output.columns)));
    }
  };

  const hideInput = (): void => {
    if (!inputDrawn || rl === undefined) return;
    // 커서가 감싸인 입력의 아래 행에 있을 수 있다. **하단 고정 영역의 첫 행**으로
    // 올라가 화면 끝까지 지운다 — 상태줄이 있으면 그 행이 첫 행이다(§7.1 단위성).
    control(`${cursorUp(rl.getCursorPos().rows + statusRows())}\r${CLEAR_TO_END}`);
    inputDrawn = false;
    restoreOutputCursor();
  };

  const showInput = (): void => {
    if (inputDrawn || rl === undefined || state === "approval-wait" || shuttingDown) return;
    // 입력 라인은 항상 자기 행을 차지한다. 이 규칙이 없으면 스트리밍 중 타이핑한
    // 글자를 readline이 출력 뒤에 그대로 이어 붙인다(평문 에코, 실측).
    if (outputColumn > 0) control("\n");

    const prompt = rl.getPrompt();
    const text = rl.line;
    // 상태줄은 입력 라인 **위**다(§7.1 층 순서). 한 번의 write로 함께 나가므로 두
    // 영역에 각자의 그리기 경로가 생기지 않는다.
    // **`head`의 개행 수 == `statusRows()`** — 둘 다 `statusColumns() > 0` 하나에서
    // 나온다. 이 등식이 §7.1의 단위성이고, 여기를 고칠 때 깨뜨리기 가장 쉽다.
    const columns = statusColumns();
    const head = columns > 0 ? `${formatStatus(status, columns)}\n` : "";
    control(
      cursorToColumn(1) + CLEAR_TO_END + head + prompt + text + repositionCursor(prompt, text),
    );
    inputDrawn = true;
  };

  /**
   * 상태줄 갱신 — §7.1. 병합하고, 그려져 있으면 단위 경로로 되그린다.
   *
   * 그려져 있지 않으면 값만 병합하고 끝낸다. `approval-wait`과 종료 구간이 그 경우인데
   * 둘 다 이미 `inputDrawn === false`이므로 **여기에 새 가드를 두지 않는다** — 가드를
   * 하나 더 두면 «상태줄이 걷혀 있는가»의 판정이 둘이 되고, 그 둘이 갈리는 날 승인
   * 프롬프트 위에 상태줄이 겹친다.
   */
  const setStatus = (patch: Partial<StatusFields>): void => {
    Object.assign(status, patch);
    if (!inputDrawn) return;
    hideInput();
    showInput();
  };

  /**
   * 프롬프트+버퍼를 쓰고 난 커서를 편집 위치로 되돌린다.
   *
   * 커서가 버퍼 끝이면(타이핑 중의 정상 상태) **아무것도 하지 않는다** — 방금 쓴
   * 자리가 이미 정확한 위치이고, 폭 계산이 개입하지 않으니 전각 문자에서도 어긋날
   * 여지가 없다. 커서가 중간일 때만 근사 계산으로 되돌린다.
   */
  function repositionCursor(prompt: string, text: string): string {
    if (rl === undefined || rl.cursor === text.length) return "";
    const columns = output.columns;
    const endColumn = displayWidth(prompt) + displayWidth(text);
    const cursorColumn = displayWidth(prompt) + displayWidth(text.slice(0, rl.cursor));
    return (
      cursorUp(wrappedRows(endColumn, columns) - wrappedRows(cursorColumn, columns)) +
      cursorToColumn(wrappedColumn(cursorColumn, columns))
    );
  }

  const write = (text: string): void => {
    if (rl === undefined || state === "approval-wait") {
      body(text);
      return;
    }
    hideInput();
    body(text);
    showInput();
  };

  /**
   * readline이 이미 에코한 원시 라인을 지운다(§7).
   *
   * 포맷된 사용자 메시지는 렌더러가 `message_start`에서 그린다 — 직접 친 프롬프트와
   * steer 주입, 코어의 합성 메시지가 그 한 경로로 구분 없이 처리된다.
   */
  const eraseSubmittedLine = (): void => {
    if (!inputDrawn) return;
    // Enter가 출력한 것은 `\r\n` 하나뿐이다(실측) — 커서는 입력 표시의 마지막 행
    // 바로 아래에 있다. 행 수는 readline이 세어 둔 값을 쓴다(전각 문자 정확).
    // 상태줄은 readline이 모르므로 `statusRows()`가 더한다 — 걷는 쪽도 그린 쪽과
    // 같은 값을 본다(§7.1 단위성).
    control(`${cursorUp(cursorRows + 1 + statusRows())}\r${CLEAR_TO_END}`);
    inputDrawn = false;
    restoreOutputCursor();
  };

  const remember = (text: string): void => {
    if (history[0] === text) return;
    history.unshift(text);
    if (history.length > HISTORY_SIZE) history.length = HISTORY_SIZE;
  };

  const startRun = (text: string): void => {
    // 상태를 **동기적으로** 옮긴다 — 이 뒤에 도착하는 제출은 곧바로 steer 경로다.
    state = "run-active";
    showInput();
    const active = handlers.prompt(text);
    runPromise = active;
    void active
      .catch((error: unknown) => {
        write(`${style.red(`런 실패: ${describeError(error)}`)}\n`);
      })
      .finally(() => {
        if (runPromise !== active) return;
        runPromise = undefined;
        state = "idle-input";
        showInput();
      });
  };

  /**
   * 런 중 제출 — `steer()` 시도 후 throw면 `prompt()`로 재시도(§8).
   *
   * throw는 런이 닫히는 구간에 도착했다는 뜻이다(CORE-INTERFACE §4). 그 런에서는
   * 처리될 수 없으므로 진행 중이던 런이 끝나기를 기다렸다가 새 런으로 보낸다 —
   * 계약이 제시한 "catch해서 prompt()로 다시 보내면 된다"의 이행이다.
   */
  const steerOrRetry = async (text: string): Promise<void> => {
    try {
      handlers.steer(text);
      return;
    } catch {
      const closing = runPromise;
      if (closing !== undefined) await closing.catch(() => undefined);
    }
    startRun(text);
  };

  const submit = (text: string): void => {
    remember(text);

    // 압축 중에는 대화도 명령도 받지 않는다(COMPACTION §6).
    //
    // 거부를 어떻게 다룰지는 `CLI-INTERFACE.md` §8이 정한다(판정 E-46) — 거부 + 안내이고
    // **거부된 줄은 히스토리에 남는다**. 두 가지가 그 귀결이다: (1) **거부는 보인다** —
    // 조용히 삼키면 사용자는
    // 제출된 줄 알고 답을 기다린다(ARCHITECTURE §2.6). (2) 거부된 줄도 히스토리에는
    // 남는다 — ↑ 한 번으로 되살아나므로 압축을 기다리는 동안 친 문장을 다시 치지
    // 않아도 된다. 버리는 쪽이 더 "받지 않았다"에 충실하지만, 사용자가 잃는 것은
    // 계약이 지키려던 무엇도 아니다.
    if (state === "compacting") {
      write(
        `${style.yellow("압축 중에는 입력을 받지 않는다.")} ${style.dim("끝나면 다시 보내라 — Ctrl+C로 압축을 취소할 수도 있다.")}\n`,
      );
      showInput();
      return;
    }

    if (isSlashCommand(text)) {
      if (state === "run-active") {
        // 슬래시 명령은 런을 건드린다(/new·/resume은 Agent를 폐기한다). 중단 후
        // 쓰라고 안내하는 것이 계약이다(§8).
        write(
          `${style.yellow("실행 중에는 슬래시 명령을 쓸 수 없다.")} ${style.dim("Ctrl+C로 중단한 뒤 다시 시도하라.")}\n`,
        );
        showInput();
        return;
      }
      enqueue(async () => {
        write(`${style.dim(`${promptText()}${text}`)}\n`);
        await handlers.dispatch(text);
        showInput();
      });
      return;
    }

    if (state === "run-active") {
      void steerOrRetry(text);
      return;
    }

    // 디스패치가 진행 중일 수 있으므로 큐를 탄다. 큐 안에서 상태를 다시 본다.
    enqueue(async () => {
      if (state === "run-active") {
        await steerOrRetry(text);
        return;
      }
      startRun(text);
    });
  };

  function promptText(): string {
    return rl?.getPrompt() ?? PROMPT;
  }

  function enqueue(task: () => Promise<void>): void {
    queue = queue.then(task).catch((error: unknown) => {
      write(`${style.red(describeError(error))}\n`);
      showInput();
    });
  }

  const onLine = (raw: string): void => {
    eraseSubmittedLine();
    const text = raw.trim();
    if (text === "") {
      showInput();
      return;
    }
    submit(text);
  };

  const onSigint = (): void => {
    if (state === "idle-input") {
      handlers.requestExit();
      return;
    }
    // 압축 중의 Ctrl+C는 **요약 호출만** 끊는다(COMPACTION §6) — 구 세션은 그대로
    // 유지되고 런 abort와는 다른 일이다. 타이핑하던 버퍼도 건드리지 않는다: 취소
    // 대상은 압축이지 사용자가 쓰던 문장이 아니다.
    if (state === "compacting") {
      compactionAbort?.abort();
      return;
    }
    // run-active·approval-wait에서는 abort — 진행 중인 것과 예약한 것 전부 취소
    // (코어 §4의 의미론 그대로). 승인 대기 중이면 게이트가 프롬프트를 취소하고
    // block한다(게이트 §2).
    handlers.abort();
    clearInputBuffer();
  };

  /** 타이핑하던 것도 취소의 대상이다. `rl.write`는 키 시뮬레이션의 공개 API다 */
  const clearInputBuffer = (): void => {
    if (rl === undefined || rl.line === "") return;
    rl.write(null, { ctrl: true, name: "k" });
    rl.write(null, { ctrl: true, name: "u" });
  };

  const onKeypress = (): void => {
    if (rl !== undefined) cursorRows = rl.getCursorPos().rows;
  };

  const onClose = (): void => {
    // Ctrl+D(EOF)의 처분은 `docs/CLI-INTERFACE.md` §8 표가 정한다(2026-08-12 명문화).
    // EOF가 REPL에 도달하는 상태들은 그 표에서 전부 같은 칸 — 종료 시퀀스(§2)다.
    // 그래서 **여기에 상태 분기가 없는 것이 표의 이행**이지 빠뜨린 것이 아니다.
    // 원리는 "더 이상 입력하지 않겠다"이고, 진행 중인 것을 버리지 않는다 —
    // 중단이 목적인 키는 Ctrl+C다(`onSigint`).
    //
    // `approval-wait`만 표에서 다른 칸인데 여기서 갈라지지 않는 이유는 **구조**다:
    // 그 상태에서는 `detach()`가 readline을 떼고 승인 UI가 입력을 소유하므로 EOF가
    // 애초에 이 리스너에 오지 않는다. 아래 `detaching`이 그 이양의 이행 지점이고
    // (우리가 뗀 것을 사용자 EOF로 읽지 않는다), `shuttingDown`은 우리가 스스로
    // 닫는 경우다.
    if (detaching || shuttingDown) return;
    handlers.requestExit();
  };

  const attach = (): void => {
    rl = createInterface({
      input,
      output,
      terminal: true,
      prompt: PROMPT,
      history: [...history],
      historySize: HISTORY_SIZE,
      completer: (line: string): [string[], string] => {
        // 자동완성은 슬래시 명령에만 동작한다(§8). 런 중에는 슬래시 자체가
        // 거부되므로 후보를 내지 않는다 — 후보 목록 출력이 스트리밍 화면을
        // 가로지르는 경로이기도 하다.
        if (state === "run-active") return [[], line];
        return [completeSlashCommand(line), line];
      },
    });
    rl.on("line", onLine);
    rl.on("SIGINT", onSigint);
    rl.on("close", onClose);
    // readline이 자기 keypress 리스너를 먼저 등록하므로 우리 것은 항상 **처리 뒤**에
    // 불린다 — 그래서 여기서 읽는 커서 위치가 방금 처리된 키까지 반영한 값이다.
    input.on("keypress", onKeypress);
    cursorRows = 0;
    inputDrawn = false;
  };

  const detach = (): void => {
    if (rl === undefined) return;
    input.off("keypress", onKeypress);
    detaching = true;
    rl.close();
    detaching = false;
    rl = undefined;
    inputDrawn = false;
  };

  return {
    start(): void {
      if (rl === undefined) attach();
      showInput();
    },

    get state(): InputState {
      return state;
    },

    write,

    setStatus,

    async withApprovalWait<T>(run: () => Promise<T>): Promise<T> {
      const previous = state;
      hideInput();
      state = "approval-wait";
      detach();
      // close()가 입력 스트림을 pause한다(실측). 우리 리스너가 굶지 않게 되살린다.
      input.resume();

      const onData = (chunk: Buffer | string): void => {
        if (chunk.toString().includes("\x03")) onSigint();
      };
      input.on("data", onData);

      try {
        return await run();
      } finally {
        input.off("data", onData);
        state = previous;
        // 승인 UI가 자기 출력을 직접 했다. 열 추적을 리셋한다(블록은 개행으로 끝난다).
        outputColumn = 0;
        if (!shuttingDown) {
          attach();
          showInput();
        }
      }
    },

    async withCompaction<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
      // 이전 상태로 되돌린다 — 자동 압축은 런 종료 직후(`run-active`가 아직 걷히기
      // 전)와 재개 직후(`idle-input`) 양쪽에서 불린다. 한쪽으로 고정하면 다른 쪽의
      // 상태가 압축 한 번으로 바뀐다.
      const previous = state;
      const controller = new AbortController();
      state = "compacting";
      compactionAbort = controller;

      try {
        return await run(controller.signal);
      } finally {
        compactionAbort = undefined;
        state = previous;
      }
    },

    close(): void {
      shuttingDown = true;
      hideInput();
      detach();
    },
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
