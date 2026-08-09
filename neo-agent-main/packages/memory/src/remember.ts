/**
 * `remember` 도구 — `docs/MEMORY.md` §4·§5, `docs/CORE-INTERFACE.md` §6.
 *
 * **모델에게 노출되는 유일한 메모리 표면이고, 1종·1액션이다.** 추가만 있고
 * `replace`/`remove`/`batch`/`target`은 없다(§4.1·§8) — 정리는 판단이 필요한 일이고,
 * 무엇을 기억할 가치가 있는지는 사용자가 안다. 모델에게 큐레이션을 맡긴 hermes가
 * 재시도 루프로 사용자 턴을 삼킨 사고(#42405)가 이 판정의 근거다.
 *
 * **읽기 표면이 없는 것도 의도다** (§2.1). 스냅샷이 이미 시스템 프롬프트에 실려 있으므로
 * 모델은 도구를 부르지 않고 메모리 전체를 보고 있다. 도구로 읽게 하면 라이브 상태가
 * 보여 프롬프트(동결된 스냅샷)와 어긋난다.
 *
 * **경로 인자가 없어 traversal 표면 자체가 없다** (§4.1). 대상 파일은 `deps.dir`로
 * 고정이고 모델 입력에서 파생되지 않는다 — `packages/tools`의 `resolve()` 봉쇄 판정이
 * 여기 없는 이유이고, 없어도 되는 이유다.
 */

import type { AgentTool, ToolResult } from "@neo-agent/core";
import { z } from "zod";
import {
  appendMemoryEntry,
  MEMORY_ENTRY_MAX_CHARS,
  MEMORY_FILE_MAX_CHARS,
  MemoryBudgetError,
} from "./store.ts";

const params = z.strictObject({
  content: z
    .string()
    .min(1)
    .max(MEMORY_ENTRY_MAX_CHARS)
    .describe(
      "One short fact worth keeping across conversations, written as a single self-contained sentence. It is stored verbatim as one bullet.",
    ),
});

export interface MemoryToolDeps {
  /** 메모리 디렉터리. CLI가 배선한다 — 설정 표면이 아니다 (§9 M-2 닫힘) */
  readonly dir: string;
  /**
   * 이 런이 오염됐는가. 호스트가 `() => gate.isTainted()`로 배선한다. 설정 키가 아니라
   * **호스트가 배선하는 함수 인자**이며, `WEB-ACCESS.md` §4가 `verify`·`resolveHostname`
   * 주입을 승인한 것과 같은 성격이다.
   */
  readonly isRunTainted: () => boolean;
}

export interface RememberDetails {
  readonly status: "stored" | "duplicate";
  /** 반영 후 파일 전체 문자 수 */
  readonly chars: number;
  readonly limit: number;
}

/**
 * §4.2가 계약으로 요구하는 **세 사실**이 전부 여기 있다. 문구는 재량이지만 사실은
 * 아니다 — 빠지면 모델이 예측 가능한 방식으로 오작동한다:
 *
 * 1. 저장된 내용은 다음 세션부터 프롬프트에 나타난다 → 없으면 모델이 프롬프트에서
 *    자기 메모를 찾다 실패하고 같은 것을 반복 저장한다.
 * 2. 수정·삭제는 사용자가 한다 → 없으면 존재하지 않는 `forget`·`replace`를 부른다.
 * 3. 예산이 유계이고 가득 차면 실패한다. 실패는 정상 상태다 → 없으면 모델이 실패를
 *    자기 잘못으로 읽고 재시도 루프에 들어간다(hermes #42405).
 *
 * 여기에 EM-1이 요구하는 **선제 고지**가 하나 더 붙는다: 항목은 언제나 한 줄이다.
 * 결과로 알리는 것만으로는 부족하다 — 모델이 여러 줄을 넣고 나서야 알게 되면
 * 그것은 이미 놀란 뒤이고, 놀란 모델은 재시도한다.
 *
 * 언어가 영어인 것은 취향이 아니라 수신자 규칙이다(§7.4 A-14): 설명문을 읽는 것은
 * 모델이고, 사용자에게 보이는 표시(`/memory`·시작 줄)는 CLI가 사용자 언어로 낸다.
 */
const DESCRIPTION = [
  "Save one short note to the user's long-term memory file, which is loaded into the system prompt at the start of every session.",
  "A saved note takes effect from the next session onward: it does not appear in the system prompt of this conversation, so do not go looking for it here after saving, and do not save it again.",
  "Each note is stored as a single line, so write it as one sentence; if the text contains line breaks they are joined with spaces before it is saved.",
  "Only the user edits or deletes memory. There is no way for you to change or remove what is already stored, so when something is wrong or stale, say so and let the user decide.",
  "The file has a bounded size limit; once it is full, saving fails until the user frees space. That failure is a normal state, not something to work around, so mention it and carry on with the conversation.",
  "Save sparingly: durable facts and preferences the user would want remembered later, not the details of the current task.",
].join(" ");

export function createRememberTool(deps: MemoryToolDeps): AgentTool<typeof params> {
  return {
    name: "remember",
    label: "Save to memory",
    description: DESCRIPTION,
    paramsSchema: params,

    async execute(args): Promise<ToolResult<RememberDetails>> {
      // **오염 검사가 첫 분기다** (§5) — 디스크를 읽기도 전에 거부한다. 뒤에 두면
      // 쓰기 실패·중복 같은 다른 사정이 오염 사유를 밀어내 모델이 "권한 문제구나"로
      // 읽고 재시도한다. 그리고 이 거부는 게이트가 아니라 **도구 자신**이 하므로
      // 게이트 모드가 `off`여도 유효하다 — 크리덴셜 denylist와 같은 자리다.
      //
      // 왜 승인이 아니라 거부인가: 승인 단위(호출 1회)와 효과 범위(이후 모든 세션의
      // 시스템 프롬프트)가 어긋난다. 웹 페이지가 "이것을 기억해 두라"고 지시했을 때
      // 누르는 승인 버튼은 자기가 무엇을 승인했는지 알 수 없는 승인이다.
      if (deps.isRunTainted()) {
        throw new Error(
          "This run is tainted: content from an external, untrusted source entered the conversation, so nothing was written to memory. Memory is loaded into every future session, and a note planted by a web page would outlive this conversation. If the fact is worth keeping, tell the user what you would save and let them decide.",
        );
      }

      let outcome: ReturnType<typeof appendMemoryEntry>;
      try {
        outcome = appendMemoryEntry(deps.dir, args.content);
      } catch (error) {
        // 예산 초과는 §4.3이 결과 텍스트의 내용을 정한 유일한 실패다: 사용량·상한,
        // 사용자가 정리하는 경로(`/memory`), 그리고 **재시도하지 말라**.
        if (error instanceof MemoryBudgetError) {
          throw new Error(
            `Memory is full: the file already uses ${error.used} of ${error.limit} characters and this note needs ${error.wouldBe - error.used} more, so nothing was saved. Do not retry — the limit will not move on its own and repeating the call will fail the same way. Only the user can free space, with the /memory command (/memory remove <n>) or by editing the file directly; say so once and carry on.`,
          );
        }
        throw error;
      }

      // 결과는 **디스크 상태**를 반영하고 시스템 프롬프트는 스냅샷을 반영한다 (§3.1).
      // 그 분리가 프롬프트 캐시 불변식의 실체이므로, 여기서 지연 반영을 다시 말한다.
      const remaining = MEMORY_FILE_MAX_CHARS - outcome.chars;
      const parts = [
        outcome.status === "duplicate"
          ? `That note is already in memory, so nothing was added. Memory now uses ${outcome.chars} of ${MEMORY_FILE_MAX_CHARS} characters (${remaining} left). It is already part of what you will see from the next session onward.`
          : `Saved. Memory now uses ${outcome.chars} of ${MEMORY_FILE_MAX_CHARS} characters (${remaining} left). It will appear in your system prompt from the next session onward, not in this conversation.`,
      ];
      // **접었으면 접었다고 말한다** (§7.4 EM-1 · `ARCHITECTURE.md` §2.6). 변형을
      // 알리지 않으면 모델은 자기 두 줄이 한 줄이 된 것을 알 방법이 없다. 반대로
      // 접지 않았을 때 이 문장을 붙이면 그것도 부정확한 표시이므로 **조건부**다 —
      // 모든 호출에 붙는 안내는 곧 아무것도 알리지 않는 안내와 같다.
      if (outcome.folded) {
        parts.push(
          "The note contained line breaks; they were joined with spaces so that it is stored as a single line.",
        );
      }

      return {
        content: [{ type: "text", text: parts.join(" ") }],
        details: { status: outcome.status, chars: outcome.chars, limit: MEMORY_FILE_MAX_CHARS },
        // 메모리는 디스크에서 온다 — 오염 전파의 방향은 반대다(오염이 메모리 쓰기를
        // 막지, 메모리가 런을 오염시키지 않는다). `"network"`로 두면 자기가 저장한
        // 내용을 읽은 것만으로 런이 오염된다.
        source: "local",
      };
    },
  };
}
