/**
 * 테스트용 주입 협력자. 게이트가 파일시스템·사용자 대화·경로 판정을 전부
 * 주입받는 설계라서, 테스트는 실제 I/O 없이 판정 로직만 정확히 겨눌 수 있다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type {
  AllowlistStore,
  ApprovalPrompt,
  ApprovalRequest,
  ApprovalResponse,
  GateToolProfile,
  PathClassifier,
  PathScope,
} from "../src/types.ts";

export const WORKSPACE_ROOT = "/ws";

export interface FakeClassifierOptions {
  /** 이 절대 경로들은 "denied"로 판정한다 (크리덴셜 보호 경로) */
  denied?: readonly string[];
  /** 이 입력이 오면 throw — classifier 실패의 fail-closed 경로 검증용 */
  throwOn?: string;
}

/**
 * `packages/tools`의 `WorkspaceBoundary`를 구조적으로 흉내 낸다.
 * 임포트가 아니라 형태로만 만나는 것이 계약이므로(APPROVAL-GATE §1), 테스트도
 * 같은 방식으로 만난다.
 */
export function makeClassifier(options: FakeClassifierOptions = {}): PathClassifier {
  const denied = new Set(options.denied ?? []);
  return {
    resolve(input: string): { path: string; scope: PathScope } {
      if (options.throwOn !== undefined && input === options.throwOn) {
        throw new Error(`realpath 실패: ${input}`);
      }
      const path =
        input === "." || input === ""
          ? WORKSPACE_ROOT
          : input.startsWith("/")
            ? input
            : `${WORKSPACE_ROOT}/${input}`;
      if (denied.has(path)) return { path, scope: "denied" };
      const inside = path === WORKSPACE_ROOT || path.startsWith(`${WORKSPACE_ROOT}/`);
      return { path, scope: inside ? "inside" : "outside" };
    },
  };
}

export interface FakeAllowlist extends AllowlistStore {
  readonly added: readonly string[];
}

export function makeAllowlist(initial: readonly string[] = []): FakeAllowlist {
  const keys = new Set(initial);
  const added: string[] = [];
  return {
    has: (key) => keys.has(key),
    add: (key) => {
      keys.add(key);
      added.push(key);
    },
    get added() {
      return added;
    },
  };
}

export interface FakePrompt extends ApprovalPrompt {
  readonly calls: readonly ApprovalRequest[];
  readonly last: ApprovalRequest | undefined;
}

export interface FakePromptOptions {
  response?: ApprovalResponse;
  /** 응답하지 않고 매달린다 — abort 경주 검증용 */
  hang?: boolean;
  /** 프롬프트 구현이 터지는 경우 */
  throws?: Error;
  /** 프롬프트에 진입한 순간 호출된다 (abort를 이 시점에 걸기 위해) */
  onAsk?: () => void;
}

export function makePrompt(options: FakePromptOptions = {}): FakePrompt {
  const calls: ApprovalRequest[] = [];
  return {
    async ask(request) {
      calls.push(request);
      options.onAsk?.();
      if (options.throws !== undefined) throw options.throws;
      if (options.hang === true) return await new Promise<ApprovalResponse>(() => {});
      return options.response ?? "allow-once";
    },
    get calls() {
      return calls;
    },
    get last() {
      return calls[calls.length - 1];
    },
  };
}

/** `packages/tools`가 export할 `TOOL_GATE_PROFILES`의 테스트용 등가물 */
export const PROFILES: Record<string, GateToolProfile> = {
  read_file: { kind: "fileRead", pathParam: "path" },
  write_file: { kind: "fileWrite", pathParam: "path" },
  edit_file: { kind: "fileEdit", pathParam: "path" },
  shell: { kind: "shellExec", commandParam: "command", cwdParam: "cwd" },
};

/** 비가시 문자를 소스에 리터럴로 박지 않는다 — 테스트가 무엇을 검사하는지 보여야 한다 */
export function ch(codePoint: number): string {
  return String.fromCodePoint(codePoint);
}

export const ZERO_WIDTH_SPACE = ch(0x200b);
export const HANGUL_FILLER = ch(0x3164);
export const RIGHT_TO_LEFT_OVERRIDE = ch(0x202e);
