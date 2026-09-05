/**
 * 슬래시 명령 중앙 레지스트리 — `docs/CLI-INTERFACE.md` §5.
 *
 * hermes `COMMAND_REGISTRY`의 축소 재작성(REUSE-MAP §2.6 채택). **디스패치·`/help`
 * 출력·탭 자동완성이 전부 이 테이블 하나에서 파생된다** — 정의 한 곳 원칙이다.
 * 소비 표면이 3개인 것도 판정된 축소다(레퍼런스는 6표면).
 *
 * 명령의 **실제 동작**은 여기 없다. `CliContext.actions`로 주입받는다 — 저장소
 * 호출과 Agent 재생성은 조립 지점(T-008)의 일이고, 레지스트리가 그것을 알기
 * 시작하면 "CLI가 유일한 조립 지점"(§1)이 두 곳으로 갈린다.
 */

import type { OutputSink } from "./terminal.ts";
import { style } from "./terminal.ts";

/**
 * 명령이 부를 수 있는 동작. 구현은 조립 지점이 채운다.
 *
 * [미규정] 계약(§5)은 `run(args, ctx: CliContext)`까지만 정하고 `CliContext`의
 * 내용을 정하지 않는다. **등록된 명령이 실제로 필요로 하는 것**(출력 싱크 + 그 명령들이
 * 부르는 동작)만 넣어 닫았다 — 명령이 늘면 이 목록도 함께 는다. 반환이 전부
 * `Promise<void>`인 것은 표시 책임까지 동작 쪽에 있기
 * 때문이다 — 세션 목록의 표시 형식은 §12가 미결로 남긴 "표시 세부"다.
 */
export interface CliActions {
  /** `listSessions()` 결과 표시 — id 접두·title·갱신 시각 (§5) */
  listSessions(): Promise<void>;
  /** 세션 재개. 현재 Agent 폐기 후 재생성 (§5·§6) */
  resumeSession(prefix: string): Promise<void>;
  /** 새 세션. 현재 Agent 폐기 후 재생성 (§5) */
  newSession(): Promise<void>;
  /** soft-delete. **실행 전 대상 표시 + 확인 1회**가 계약이다(§6) */
  deleteSession(prefix: string): Promise<void>;
  /**
   * 과거 대화 전문 검색 — **표시 전용**이다 (`SEARCH.md` §1·§5).
   *
   * 인자는 질의 문자열 하나뿐이고 반환도 없다. 결과가 모델 컨텍스트로 돌아가는
   * 경로를 만들지 않으려면 이 표면에 결과 타입이 없어야 한다 — 값을 돌려주면
   * 호출부가 그것을 대화에 실을 수 있고, 그 순간 §1의 불변이 배선에 의존하게 된다.
   */
  search(query: string): Promise<void>;
  /** 수동 압축 — 자동과 같은 경로, 임계 미달이어도 실행 (`COMPACTION.md` §3·§6) */
  compact(): Promise<void>;
  /**
   * 인자 없는 `/memory` — **디스크 현재 상태**를 항목 번호·사용량·파일 경로와 함께
   * 표시한다 (`MEMORY.md` §7.2). 시작 시 동결된 스냅샷이 아니다: 세션 중 `remember`가
   * 저장한 것이 여기서는 보이고 프롬프트에는 없으며, 그 차이가 §3.1의 두 상태다.
   */
  showMemory(): Promise<void>;
  /**
   * `/memory remove <n>` — n은 1-기반이고 파일 순서를 따른다 (`MEMORY.md` §7.2).
   *
   * **범위 판정은 동작 쪽이 한다.** 레지스트리는 "숫자인가"까지만 보고(파일을 읽지
   * 않으므로 몇 개가 있는지 모른다), 범위 밖은 여기서 사용법 에러가 된다.
   */
  forgetMemory(index: number): Promise<void>;
  /**
   * 인자 없는 `/config` — 설정 **여덟 키 전부**를 낸다 (§3.2 계약 3).
   *
   * 두 상태를 구별해 낸다: 이 세션이 시작 시 동결한 값과 파일의 현재 값. 둘이 같으면
   * 한 열이고 다르면 둘 다 보인다 — 합치면 `set` 직후의 조회가 옛 값을 내고 사용자는
   * 쓰기가 실패한 것으로 읽는다. 파일 경로와 적용 시점(다음 시작)도 함께 낸다.
   *
   * **이 동작은 죽지 않는다**(같은 계약). 파일이 유효하지 않아도 세션 값을 그대로
   * 보이고 그 사실을 함께 낸다 — 시작 로더를 그대로 재사용할 수 없는 자리가 여기다.
   *
   * 반환이 `Promise<void>`인 것은 계약 2를 지키기 위해서다 — 값을 돌려주면 호출부가
   * 그것을 대화에 실을 수 있고, 그 순간 불변이 배선에 의존하게 된다(`search`와 같은
   * 근거이고 §3.2가 그 형태를 이름으로 든다).
   */
  showConfig(): Promise<void>;
  /**
   * `/config set <키> <값>` — 값이 한 토큰인 일곱 키만 쓸 수 있다 (§3.2 계약 5).
   *
   * **키도 값도 문자열 그대로 받는다.** 레지스트리는 설정 키 집합을 모르고(그것을 알면
   * 명령 표면이 설정 계약을 겸한다) 토큰을 무슨 타입으로 읽는지도 모른다 — `/memory
   * remove <번호>`의 범위 판정이 동작 쪽에 있는 것과 같은 자리다.
   *
   * **모르는 키·조회 전용 키(`denyRules`)·읽을 수 없는 토큰은 전부 사용법 에러다**
   * — 조용한 수리가 없다(§5). 거부·실패 고지는 무엇이 막혔는지만이 아니라 다음 한 수를
   * 함께 든다(§3.2 계약 7).
   *
   * **보안 방향을 낮추는 값에도 확인을 묻지 않는다**(계약 6) — 값이 즉시 효력을 갖지
   * 않고 다음 시작부터 상태줄이 그 상태를 지속 표시하므로 은폐되지 않는다. 대신 결과
   * 고지가 낮아짐을 명시한다. `/delete`의 확인 1회와 성격이 다른 자리다.
   */
  setConfigValue(key: string, value: string): Promise<void>;
  /** 종료 시퀀스 (§2) */
  exit(): Promise<void>;
}

export interface CliContext {
  /**
   * **화면 싱크**(`CLI-INTERFACE.md` §1 — 2026-08-24 확정). 명령이 **직접** 쓰는 것이
   * 이리로 가고, 그것은 `CliDeps.out`(고지 싱크)을 지나지 않는다.
   *
   * §1이 「슬래시 명령 출력」을 화면으로 보낸 것이 이 값이다: `/help`·목록 행·미등록
   * 명령 에러·명령 실행 실패가 여기 든다. 같은 명령 안에서 고지 헬퍼를 지나는 짧은
   * 안내는 반대쪽이며, 그것은 `CliActions` 구현이 쥔다 — 레지스트리는 모른다.
   *
   * **뿌리는 REPL이다.** 두 번째 호스트에는 슬래시 명령 자체가 없으므로(§1의 승인
   * 프롬프트 불릿이 같은 근거를 든다) 이 값에 주입 표면을 낼 자리가 없다.
   */
  readonly out: OutputSink;
  readonly actions: CliActions;
}

export interface SlashCommand {
  /** `/sessions` — 슬래시를 포함한다 */
  name: string;
  aliases?: readonly string[];
  /** 인자 표기. `/help` 출력에 이름과 함께 나간다 */
  argsLabel?: string;
  /** `/help`에 그대로 노출된다 */
  description: string;
  run(args: string, ctx: CliContext): Promise<void>;
}

/**
 * MVP 명령 집합 — **닫힌 목록**이다. 추가는 `CLI-INTERFACE.md` 개정을 거친다(§5).
 *
 * 별칭은 하나도 정의하지 않았다. 별칭은 닫힌 목록을 조용히 넓히는 표면이고,
 * 이 크기의 목록에 필요가 실측되지 않았다. `aliases` 필드 자체는 계약이 정한
 * 인터페이스라 남아 있고 조회 경로(`findSlashCommand`)도 별칭을 본다.
 */
export const SLASH_COMMANDS: readonly SlashCommand[] = Object.freeze([
  {
    name: "/help",
    description: "명령 목록",
    run: async (_args, ctx) => {
      ctx.out.write(formatSlashHelp());
    },
  },
  {
    name: "/sessions",
    description: "저장된 세션 목록",
    run: async (_args, ctx) => {
      await ctx.actions.listSessions();
    },
  },
  {
    name: "/resume",
    argsLabel: "<접두>",
    description: "세션 id 접두로 이전 대화를 이어간다",
    run: async (args, ctx) => {
      await ctx.actions.resumeSession(requireArgument(args, "/resume", "<접두>"));
    },
  },
  {
    name: "/new",
    description: "새 세션을 시작한다",
    run: async (_args, ctx) => {
      await ctx.actions.newSession();
    },
  },
  {
    name: "/delete",
    argsLabel: "<접두>",
    description: "세션을 삭제한다 (실행 전 확인)",
    run: async (args, ctx) => {
      await ctx.actions.deleteSession(requireArgument(args, "/delete", "<접두>"));
    },
  },
  {
    name: "/search",
    argsLabel: "<질의>",
    description: "과거 대화를 검색한다 (결과는 표시 전용)",
    /**
     * **인자는 첫 공백 뒤 전부다**(§5·SEARCH §5) — 질의에 공백이 들어가므로 토큰
     * 분리를 하지 않는다. 디스패처가 이미 그렇게 자르므로 여기서 추가로 쪼개는
     * 코드가 없는 것이 정상이고, `requireArgument`는 빈 질의만 걸러낸다.
     *
     * **앞뒤 공백 제거도 이 두 곳이 이미 한다**(SEARCH §5 — 질의 트림). 붙여넣기에
     * 딸려 온 공백이 리터럴 검색에서 0건을 만드는 것과, 공백만 친 입력이 store까지
     * 내려가는 것을 둘 다 막는다 — 후자는 트림하면 빈 질의가 되어 위의 사용법 에러로
     * 흡수된다. 안쪽 공백은 보존된다(그것을 정규화하면 토큰 분리 후 재결합이다).
     */
    run: async (args, ctx) => {
      await ctx.actions.search(requireArgument(args, "/search", "<질의>"));
    },
  },
  {
    name: "/compact",
    description: "대화를 요약해 압축한다 (임계 미달이어도 실행)",
    run: async (_args, ctx) => {
      await ctx.actions.compact();
    },
  },
  {
    name: "/memory",
    argsLabel: "[remove <번호>]",
    description: "메모리를 표시하고 항목을 지운다 (파일 경로도 함께 표시)",
    /**
     * **명령 1개 + 인자다**(§5·`MEMORY.md` §7.2). 하위 동작을 별도 명령으로 등록하지
     * 않는 이유는 닫힌 목록을 하나의 관심사로 셋 늘리면 `/help`가 길어지고 탭 완성이
     * 시끄러워지는데 얻는 것이 없기 때문이다.
     *
     * **모르는 하위 동작·비숫자 인자·범위 밖 번호는 전부 사용법 에러다** — 침묵
     * 무시가 없다(§5, 닫힌 목록 밖 argv와 같은 근거). 여기서 던진 에러는 디스패처가
     * `/memory 실패: …`로 표시하고 REPL은 계속된다.
     */
    run: async (args, ctx) => {
      const rest = args.trim();
      if (rest === "") {
        await ctx.actions.showMemory();
        return;
      }

      const [action, ...operands] = rest.split(/\s+/);
      if (action !== "remove" || operands.length !== 1) {
        throw new Error("알 수 없는 사용법 — /memory 또는 /memory remove <번호>");
      }

      const operand = operands[0] ?? "";
      // 1-기반 10진 정수만 받는다. `-1`·`1.5`·`1e3`·`٣`가 전부 여기서 걸린다 —
      // `Number()`에 그냥 넘기면 그중 일부가 조용히 수리되어 다른 항목을 지운다.
      if (!/^\d+$/.test(operand)) {
        throw new Error("번호는 숫자여야 한다 — /memory remove <번호> (예: /memory remove 1)");
      }
      await ctx.actions.forgetMemory(Number(operand));
    },
  },
  {
    name: "/config",
    argsLabel: "[set <키> <값>]",
    description: "설정을 표시하고 값을 바꾼다 (적용은 다음 시작)",
    /**
     * **여기도 명령 1개 + 인자다**(§5·§3.2). 하위 동작을 별도 명령으로 등록하지 않는
     * 이유는 `/memory`와 같다 — 닫힌 목록이 하나의 관심사로 여럿 늘면 `/help`가 길어지고
     * 탭 완성이 시끄러워지는데 얻는 것이 없다. 표의 `/config` 행이 `/memory`와 `/exit`
     * 사이인 것이 이 자리의 근거다.
     *
     * **레지스트리는 설정 키 집합도 토큰 타입도 모른다.** 키와 값을 문자열 그대로
     * 넘기고, 모르는 키·조회 전용 키·읽을 수 없는 토큰의 판정은 전부 동작 쪽이 한다
     * (`/memory remove <번호>`의 범위 판정과 같은 자리 — §3.2 계약 5).
     *
     * **모르는 하위 동작·피연산자 수가 둘이 아닌 입력은 전부 사용법 에러다** — 침묵
     * 무시가 없다(§5, 닫힌 목록 밖 argv와 같은 근거). 값이 한 토큰이라는 것이 계약이므로
     * (§3.2 계약 5) 공백이 든 값을 붙여 받는 관용은 두지 않는다 — 그것을 열면 토큰
     * 하나로 닫히지 않는 키가 이 표면으로 새어 들어온다.
     */
    run: async (args, ctx) => {
      const rest = args.trim();
      if (rest === "") {
        await ctx.actions.showConfig();
        return;
      }

      const [action, ...operands] = rest.split(/\s+/);
      if (action !== "set" || operands.length !== 2) {
        throw new Error("알 수 없는 사용법 — /config 또는 /config set <키> <값>");
      }

      await ctx.actions.setConfigValue(operands[0] ?? "", operands[1] ?? "");
    },
  },
  {
    name: "/exit",
    description: "종료한다",
    run: async (_args, ctx) => {
      await ctx.actions.exit();
    },
  },
]);

/** 입력 한 줄이 슬래시 명령인가. 슬래시로 시작하지 않는 입력은 전부 대화 입력이다(§5) */
export function isSlashCommand(line: string): boolean {
  return line.trimStart().startsWith("/");
}

export function findSlashCommand(name: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find(
    (command) => command.name === name || (command.aliases?.includes(name) ?? false),
  );
}

/**
 * 슬래시 명령 한 줄을 실행한다.
 *
 * **미등록 명령은 에러 표시로 끝난다 — 대화로 흘려보내지 않는다**(§5). 오타 난
 * 명령이 조용히 모델에게 가면 사용자는 명령이 실행된 줄 안다(§2.6).
 *
 * [미규정] 명령 실행 중의 예외 처리. 여기서 잡아 표시하고 REPL을 계속한다 —
 * 모호한 세션 접두(§6)처럼 **사용자가 다시 시도하면 되는 실패**가 이 경로의
 * 대부분이고, 시작 단계가 아닌 실패로 프로세스를 죽이는 것은 과하다. 시작
 * 시퀀스의 실패가 기동 거부인 것(§2)과 다른 자리다.
 */
export async function dispatchSlashCommand(line: string, ctx: CliContext): Promise<void> {
  const trimmed = line.trim();
  const separator = trimmed.search(/\s/);
  const name = separator === -1 ? trimmed : trimmed.slice(0, separator);
  const args = separator === -1 ? "" : trimmed.slice(separator + 1).trim();

  const command = findSlashCommand(name);
  if (command === undefined) {
    ctx.out.write(
      `${style.red(`알 수 없는 명령: ${name}`)}\n${style.dim("  /help 로 쓸 수 있는 명령을 볼 수 있다.")}\n`,
    );
    return;
  }

  try {
    await command.run(args, ctx);
  } catch (error) {
    ctx.out.write(`${style.red(`${name} 실패: ${describeError(error)}`)}\n`);
  }
}

/** `/help` 출력 — 테이블에서 파생한다(§5) */
export function formatSlashHelp(): string {
  const labels = SLASH_COMMANDS.map((command) => commandLabel(command));
  const width = Math.max(...labels.map((label) => label.length));
  const lines = SLASH_COMMANDS.map(
    (command, index) =>
      `  ${style.cyan((labels[index] ?? "").padEnd(width))}  ${command.description}`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * 탭 자동완성 후보 — 같은 테이블에서 파생한다(§5·§8).
 *
 * **슬래시 명령에만 동작한다.** 인자 자리(첫 공백 뒤)는 완성하지 않는다 — 세션
 * 접두는 저장소를 봐야 알 수 있고, 그것은 레지스트리가 저장소를 아는 경로다.
 */
export function completeSlashCommand(line: string): string[] {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("/") || /\s/.test(trimmed)) return [];

  const names = SLASH_COMMANDS.flatMap((command) => [command.name, ...(command.aliases ?? [])]);
  return names.filter((name) => name.startsWith(trimmed));
}

function commandLabel(command: SlashCommand): string {
  return command.argsLabel === undefined ? command.name : `${command.name} ${command.argsLabel}`;
}

function requireArgument(args: string, name: string, label: string): string {
  const value = args.trim();
  if (value === "") {
    throw new Error(`인자가 필요하다 — ${name} ${label}`);
  }
  return value;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
