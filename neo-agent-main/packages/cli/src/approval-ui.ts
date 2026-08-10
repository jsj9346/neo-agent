/**
 * 승인 프롬프트 UI — `docs/CLI-INTERFACE.md` §9 (`APPROVAL-GATE.md` §4의 소비 지점).
 *
 * **`display`는 가공 없이 그대로 표시한다.** 색상·테두리 장식은 문자열 **밖**에만
 * 붙인다 — 자르거나 정규화하거나 재포맷하면 게이트의 위조 탐지(비가시·동형이의
 * 문자 이스케이프)가 무의미해진다. 승인 UI가 거짓말하면 게이트 전체가 무의미하다.
 *
 * deny 사유 문자열은 여기서 만들지 않는다 — 모델에게 가는 `reason`은 게이트가
 * 만든다(게이트 §4의 수신자 규칙: `reason`은 영어, `display`·`warnings`는 사용자 언어).
 */

import type { ApprovalPrompt, ApprovalRequest, ApprovalResponse } from "@neo-agent/gate";
import { style, type TerminalIo } from "./terminal.ts";

/**
 * 응답 키. **기본 선택(그냥 Enter)은 존재하지 않는다** — 승인은 명시적이어야 한다(§9).
 * 키 자체는 조정 가능한 세부다.
 */
const KEYS: Readonly<Record<string, ApprovalResponse>> = {
  y: "allow-once",
  a: "allow-always",
  n: "deny",
};

/**
 * 승인 프롬프트를 만든다. 입력·출력은 주입받는다(터미널 직접 참조 금지 계약).
 *
 * 입력 소유권은 호출자가 넘겨준 상태여야 한다 — REPL의 `withApprovalWait`가
 * readline을 떼고 부르는 것이 조립 방식이다(§8). 그래서 이 모듈은 readline을 쓰지
 * 않고 **키 하나**를 직접 읽는다. 여러 응답이 한 줄에 몰려 오는 파이프 입력에서도
 * 첫 유효 문자만 취한다.
 */
export function createApprovalPrompt(io: TerminalIo): ApprovalPrompt {
  const { input, output } = io;

  return {
    ask(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalResponse> {
      const allowAlways = request.allowAlwaysKey !== undefined;
      output.write(renderRequest(request, allowAlways));

      return new Promise<ApprovalResponse>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("승인 프롬프트가 중단으로 취소됐다."));
          return;
        }

        const rawMode = enterRawMode(input);

        const finish = (): void => {
          input.off("data", onData);
          signal.removeEventListener("abort", onAbort);
          rawMode?.();
        };

        const onAbort = (): void => {
          finish();
          // 프롬프트 취소는 게이트가 block으로 옮긴다(게이트 §2). 여기서 deny를
          // 지어내지 않는다 — 사용자가 거부한 것과 런이 끊긴 것은 다른 사실이다.
          output.write(`${style.dim("  중단 — 승인 대기를 취소했다.")}\n`);
          reject(new Error("승인 프롬프트가 중단으로 취소됐다."));
        };

        const onData = (chunk: Buffer | string): void => {
          const key = firstMeaningfulKey(chunk.toString());
          if (key === undefined) return; // 여기 오는 것은 Ctrl+C와 빈 청크뿐 — 아래 참조

          const response = KEYS[key.toLowerCase()];
          if (response === undefined || (response === "allow-always" && !allowAlways)) {
            // 유효 응답만 수리한다. 그 외는 재프롬프트(§9) — Enter도 여기로 온다.
            output.write(renderRetry(key, allowAlways));
            return;
          }

          finish();
          output.write(`${style.dim(`  → ${DECISION_LABEL[response]}`)}\n`);
          resolve(response);
        };

        signal.addEventListener("abort", onAbort, { once: true });
        input.on("data", onData);
        // REPL이 readline을 떼면서 스트림이 멈춰 있을 수 있다(실측).
        input.resume();
      });
    },
  };
}

const DECISION_LABEL: Readonly<Record<ApprovalResponse, string>> = {
  "allow-once": "한 번 허용",
  "allow-always": "항상 허용 (allowlist에 학습)",
  deny: "거부",
};

function renderRequest(request: ApprovalRequest, allowAlways: boolean): string {
  const parts: string[] = [];
  parts.push(`\n${style.yellow("● 승인 필요")} ${style.dim(`— ${request.toolName}`)}\n`);

  // 여기서부터 한 줄은 게이트가 만든 문자열 그대로다. 앞뒤의 개행만 우리 것이다.
  parts.push(request.display);
  if (!request.display.endsWith("\n")) parts.push("\n");

  for (const warning of request.warnings) {
    parts.push(`${style.red("⚠")} ${style.bold(warning)}\n`);
  }

  parts.push(renderChoices(allowAlways));
  return parts.join("");
}

/**
 * `allowAlwaysKey`가 없으면 "항상 허용"을 **제공하지 않는다**(§9) — 연산자 포함
 * 복합 명령 등, 게이트가 학습을 거부한 요청이다.
 *
 * 왜 그 선택지가 없는지 설명하는 문구는 붙이지 않는다. 선택지가 빠진 쪽이 오히려
 * 더 길어지면 "제공하지 않는다"가 화면에서 관찰 불가능해진다(QA 계약 테스트가
 * 이 구조를 단정한다). 이유가 필요하면 게이트가 `warnings`에 실어 보내면 되고,
 * 그것이 수신자 규칙(§4)에도 맞다.
 */
function renderChoices(allowAlways: boolean): string {
  const options = allowAlways
    ? "[y] 한 번 허용  [a] 항상 허용  [n] 거부"
    : "[y] 한 번 허용  [n] 거부";
  return `${style.bold(options)}\n`;
}

function renderRetry(key: string, allowAlways: boolean): string {
  return `${style.dim(`  ${describeKey(key)}는 유효한 응답이 아니다.`)} ${renderChoices(allowAlways)}`;
}

/** 이름이 있는 키. 여기 없는 제어문자는 `Ctrl+<문자>` 또는 코드포인트로 떨어진다. */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  "\r": "Enter",
  "\n": "Enter",
  "\t": "Tab",
  "\x1b": "Esc",
  "\x7f": "Backspace",
  " ": "Space",
};

/** 제어·서식·구분·결합 문자 — 그대로 찍으면 보이지 않거나 줄을 망가뜨린다. */
const INVISIBLE = /[\p{C}\p{Z}\p{M}]/u;

/**
 * 무효 키를 사용자가 알아볼 수 있는 이름으로 바꾼다(§9).
 *
 * **`display` 무가공 규칙과 충돌하지 않는다** — 가공 대상이 게이트가 만든 문자열이
 * 아니라 사용자 자신의 키 입력이다. 위조 탐지가 지켜야 할 표면이 아니다.
 *
 * 원시 이스케이프(`""`)는 "무효였다"는 사실만 전하고 **무엇이** 무효였는지를
 * 감춘다(2026-08-10 실측 — 사용자는 Ctrl+D를 눌렀다는 건 알지만 그 표기가 그것인지
 * 모른다). 다만 **이름을 아는 키만 이름으로 바꾼다** — 추측한 이름을 붙이면 사용자가
 * 누르지 않은 키를 눌렀다고 읽게 되므로, 나머지는 코드포인트로 정직하게 보인다.
 */
function describeKey(key: string): string {
  const named = NAMED_KEYS[key];
  if (named !== undefined) return named;

  const code = key.codePointAt(0);
  if (code === undefined) return JSON.stringify(key);
  // C0 제어문자는 `Ctrl+<문자>`다(0x01 = Ctrl+A). 이름을 가진 것들은 위에서 이미 빠졌고
  // Ctrl+C는 여기까지 오지 않는다(`firstMeaningfulKey`가 걸러낸다).
  if (code <= 0x1a) return `Ctrl+${String.fromCharCode(code + 0x40)}`;
  if (INVISIBLE.test(key)) return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  return JSON.stringify(key);
}

/**
 * 청크에서 첫 유효 문자를 고른다.
 *
 * **걸러내는 것은 Ctrl+C(`\x03`) 하나뿐이다**(§9). 승인 대기의 Ctrl+C는 `abort()`이고
 * (§8) 그 의미론은 REPL이 소유한다 — 여기서 deny로 바꿔 버리면 "중단"이 "사용자가
 * 거부"로 둔갑한다.
 *
 * **다른 제어문자는 걸러지지 않는다.** Ctrl+D(`\x04`)도 평범한 키로 반환돼 `KEYS`
 * 조회에 실패하고 재프롬프트로 간다 — 승인 대기의 Ctrl+D는 EOF도 취소도 아니다
 * (2026-08-10 실측 → §9 명문화). Enter를 무시하지 않는 것과 같은 근거다: 사용자가
 * 하지 않은 결정을 입력에서 만들어내지 않는다.
 */
function firstMeaningfulKey(chunk: string): string | undefined {
  for (const char of chunk) {
    if (char === "\x03") continue;
    return char;
  }
  return undefined;
}

/** 실제 터미널이면 키 하나를 즉시 받도록 raw 모드로 바꾼다. 복원 함수를 돌려준다 */
function enterRawMode(input: TerminalIo["input"]): (() => void) | undefined {
  if (input.isTTY !== true || typeof input.setRawMode !== "function") return undefined;
  const setRawMode = input.setRawMode.bind(input);
  setRawMode(true);
  return () => {
    setRawMode(false);
  };
}
