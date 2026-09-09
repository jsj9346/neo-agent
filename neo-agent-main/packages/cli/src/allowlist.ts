/**
 * AllowlistStore 파일 구현 — `docs/CLI-INTERFACE.md` §10 (`APPROVAL-GATE.md` §7의 해소).
 *
 * 위치가 `~/.neo-agent/allowlist`인 것의 부수 효과는 **우연이 아니라 확인한 것이다**:
 * 도구의 denylist가 `~/.neo-agent/**` 전체이므로 **에이전트가 도구로 자기 allowlist를
 * 넓힐 수 없다**(게이트 §5의 "프로그래밍적 확대 경로를 만들지 않는다"가 파일 수준에서도
 * 성립). 파일을 옮기면 이 보호가 조용히 사라진다.
 *
 * 시작 시 1회 로드하고 **재읽기하지 않는다**(게이트 §5 — 재읽기는 세션 중 설정 변경
 * 경로다). 외부 편집의 적용 시점은 다음 프로세스 시작이다.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AllowlistStore } from "@neo-agent/gate";

/** allowlist 파일도 크리덴셜과 같은 디렉터리 규율을 따른다 */
const FILE_MODE = 0o600;

/**
 * 경고 수신자. 콜백인 이유는 저장소의 전례와 같다(SESSION-STORE §7) — 이 모듈은
 * UI를 모르고, CLI는 자기 렌더러(라인 안전 출력)로 보여야 한다.
 */
export type AllowlistWarningHandler = (message: string) => void;

export interface AllowlistStoreOptions {
  onWarning?: AllowlistWarningHandler;
}

export function defaultAllowlistPath(home?: string): string {
  return join(home ?? homedir(), ".neo-agent", "allowlist");
}

/**
 * 파일 기반 allowlist를 만든다. **생성 시점에 1회 읽는다.**
 *
 * 포맷은 한 줄 = 키 하나(UTF-8, §10). 주석 문법은 없다 — 계약이 "한 줄 = 키 하나"라
 * 서, `#`으로 시작하는 줄을 주석으로 삼으면 그런 모양의 키를 표현할 수 없게 된다.
 * 빈 줄만 건너뛴다.
 */
export function createAllowlistStore(
  filePath: string,
  options: AllowlistStoreOptions = {},
): AllowlistStore {
  const warn = options.onWarning ?? defaultAllowlistWarningHandler;
  const { keys, endsWithNewline } = loadKeys(filePath);
  let needsLeadingNewline = !endsWithNewline;

  return {
    has(key: string): boolean {
      return keys.has(key);
    },

    add(key: string): void {
      if (keys.has(key)) return;
      // 메모리를 먼저 채운다 — 이번 세션의 판정은 파일 결과와 무관하게 유효해야 한다.
      keys.add(key);

      try {
        appendFileSync(filePath, `${needsLeadingNewline ? "\n" : ""}${key}\n`, {
          mode: FILE_MODE,
        });
        needsLeadingNewline = false;
      } catch (error) {
        // **append 실패는 조용히 넘기지 않는다**(§10). 메모리 반영은 유지하되
        // 다음 세션에 남지 않는다는 사실을 알린다 — 안내 없는 부분 성공은
        // 침묵 실패다(ARCHITECTURE §2.6).
        warn(
          `허용 규칙을 ${filePath}에 기록하지 못했다 (${describeError(error)}).\n` +
            `  "${key}"는 이번 세션에서만 유효하고 다음 세션에는 남지 않는다.`,
        );
      }
    },
  };
}

/**
 * 기본 경고 수신자. `console.warn`으로 나가는 것이 계약이 아니라 **어딘가로는
 * 나가는 것**이 계약이다 — CLI가 라인 안전 출력을 주입하면 그쪽으로 간다.
 */
export function defaultAllowlistWarningHandler(message: string): void {
  console.warn(message);
}

/**
 * 파일이 없으면 빈 집합. 그 밖의 읽기 실패는 **던진다** — 학습해 둔 허용이 통째로
 * 사라진 채 기동하면 사용자는 이유 없이 늘어난 승인 프롬프트만 보게 된다.
 * 시작 단계의 실패는 원인과 다음 행동을 담은 에러로 종료한다(§2).
 */
function loadKeys(filePath: string): { keys: Set<string>; endsWithNewline: boolean } {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { keys: new Set(), endsWithNewline: true };
    }
    throw new Error(
      `${filePath}를 읽을 수 없다 (${(error as NodeJS.ErrnoException).code ?? "unknown"}). ` +
        "파일 권한을 확인하거나 파일을 지우면 빈 allowlist로 시작한다.",
    );
  }

  // **이 트림이 왕복을 깨지 않는 근거는 `APPROVAL-GATE.md` §4의 트림 불변 보장이다** —
  // 게이트가 양끝이 트림으로 변하는 경로에 키를 주지 않으므로, 여기서 줄을 트림해 읽어도
  // 학습한 키를 잃지 않는다(`CLI-INTERFACE.md` §10). 트림 자체는 **손편집 관용**이고
  // 그것이 계약인 이유는 게이트가 파일을 재읽기하지 않아(§5) 파일을 고치는 것이 학습을
  // 회수하는 유일한 수단이기 때문이다 — BOM으로 시작하는 파일·CRLF 줄·들여쓴 줄이
  // 그대로 읽힌다. **이 자리를 만지는 사람에게**: 트림을 넓히거나 좁히면 그 보장의
  // 정의역(`String.prototype.trim`)과 갈리고, 갈린 것을 잡을 검사가 이 파일에는 없다
  // — 붉어지는 곳은 `packages/gate`의 키 발급 쪽이다.
  const keys = new Set(
    content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  );
  return { keys, endsWithNewline: content === "" || content.endsWith("\n") };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
