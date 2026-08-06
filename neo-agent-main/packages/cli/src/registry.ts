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
 * 내용을 정하지 않는다. 명령 6종이 실제로 필요로 하는 것(출력 싱크 + 동작 5개)만
 * 넣어 닫았다. 반환이 전부 `Promise<void>`인 것은 표시 책임까지 동작 쪽에 있기
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
  /** 종료 시퀀스 (§2) */
  exit(): Promise<void>;
}

export interface CliContext {
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
 * 6개짜리 목록에 필요가 실측되지 않았다. `aliases` 필드 자체는 계약이 정한
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
