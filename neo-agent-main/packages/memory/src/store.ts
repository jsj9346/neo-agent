/**
 * 메모리 파일의 디스크 계층 — `docs/MEMORY.md` §2.2·§4.3·§6·§7.2·§7.4.
 *
 * 이 패키지는 `~/.neo-agent/` 안에 쓰는 **유일한 코드**다(`packages/tools`의 크리덴셜
 * denylist가 거부하는 바로 그 영역). 그 특권의 대가로 표면이 가장 좁아야 하므로 여기서
 * 쓰는 내장 모듈은 `node:fs`·`node:path` 둘뿐이다.
 *
 * 세 가지가 이 모듈의 계약이다:
 *
 * 1. **읽기 실패 ≠ 빈 메모리** (§2.2). 못 읽으면 던진다. 빈 것으로 읽고 첫 쓰기에서
 *    전체를 덮으면 메모리가 조용히 소실된다 — 이 패키지가 막아야 할 가장 나쁜 결과다.
 * 2. **로드는 파일을 고치지 않는다** (§7.3). 정렬·중복 제거·형식 교정·파일 생성 전부
 *    없다. 사용자의 파일을 우리가 다시 쓰는 경로를 만들지 않는 것이 규칙이다.
 * 3. **쓰기는 원자적이다** (§4.3). 임시 파일 + rename이고, 임시 파일은 **반드시 대상
 *    디렉터리 안**에 만든다 — 다른 파일시스템(`os.tmpdir()`)에 만들면 rename이
 *    cross-device가 되어 복사+삭제로 격하되고 원자성이 사라진다.
 *
 * **언어의 분할선은 계층이다 — 경고/에러가 아니라 로드 계층/도구 계층** (판정 B-7,
 * 2026-08-09). §7.4 A-14의 규칙은 *"텍스트의 수신자가 언어를 정한다"*이고, 그 기준으로
 * 이 모듈의 로드·삭제 실패는 **수신자가 사용자뿐**이다:
 *
 * - 기동 3b의 로드 실패는 **모델이 생기기도 전**에 화면으로 나가 종료 사유가 된다.
 * - `/memory` 경로의 실패도 화면 직행이다.
 * - **모델은 메모리 로드 에러를 볼 경로가 아예 없다** — 메모리를 도구로 읽지 못하므로
 *   (§2.1의 의도된 비대칭), 로드 실패가 모델에게 도달하는 통로 자체가 없다.
 *
 * 그래서 `loadMemory`·`removeMemoryEntry`의 실패와 `onWarning`은 **한국어**이고, 반대로
 * `createRememberTool`이 모델에게 돌려주는 것(설명문·예산 초과·오염 거부)은 **영어**다.
 * `MemoryBudgetError`가 영어인 것도 같은 이유다 — 그것은 `remember`가 모델에게 주는
 * 실패이지 사용자에게 주는 실패가 아니다.
 */

import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  countChars,
  isEntryLine,
  type MemorySnapshot,
  normalizeEntry,
  parseEntries,
} from "./format.ts";

/** 메모리 정본 파일 이름 (§2) */
export const MEMORY_FILE_NAME = "MEMORY.md";

/**
 * 파일 전체 예산 (§6). 설계값 4,000자 — hermes 2,200(+user 1,375)과 OpenClaw
 * ~12KB/파일 사이다. 매 API 호출에 실리는 비용이므로 작게 시작한다.
 * **T-009 실측이 확정한다**(§9 M-1). 단위는 UTF-16 코드 유닛(§7.4 A-1).
 */
export const MEMORY_FILE_MAX_CHARS = 4000;

/**
 * 항목 하나의 예산 (§6). 설계값 400자 — 한 항목이 예산의 10%를 넘으면 그건
 * 메모리가 아니라 문서다. 이 상한은 zod 스키마가 강제한다(`remember.ts`).
 */
export const MEMORY_ENTRY_MAX_CHARS = 400;

/** 새로 만드는 메모리 디렉터리·파일의 권한. 기존 파일의 권한은 보존한다 */
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

/** 노출 비트(group·other) — 이것이 있으면 경고한다. `0400`처럼 더 좁은 권한은 통과 */
const EXPOSED_BITS = 0o077;

export interface LoadMemoryOptions {
  readonly dir: string;
  /** 권한 경고 등. 없으면 경고를 버린다 — **경고가 나온다는 사실이 계약**이다 (§2.2) */
  readonly onWarning?: (message: string) => void;
}

/**
 * 예산 초과. `remember`가 이것을 잡아 모델용 안내로 번역한다 — 사용량·상한·`/memory`·
 * 재시도 금지가 §4.3이 요구하는 사실이고, 그 문장을 쓰는 곳은 도구다.
 */
export class MemoryBudgetError extends Error {
  readonly used: number;
  readonly limit: number;
  /** 이 항목을 저장하면 도달했을 총 문자 수 */
  readonly wouldBe: number;

  constructor(used: number, wouldBe: number, limit: number) {
    super(
      `Memory is full: the file uses ${used} of ${limit} characters and this note would take it to ${wouldBe}. Nothing was saved.`,
    );
    this.name = "MemoryBudgetError";
    this.used = used;
    this.wouldBe = wouldBe;
    this.limit = limit;
  }
}

export interface AppendResult {
  readonly status: "stored" | "duplicate";
  /** 반영 후 파일 전체 문자 수 */
  readonly chars: number;
  /**
   * 개행을 접어 한 줄로 만들었는가 (§7.4 EM-1). **호출자가 이것을 결과에 밝힐 수
   * 있게 하려고 돌려준다** — 접는 것 자체는 형식의 소유자가 자기 형식으로 정규화하는
   * 정당한 일이지만, 조용하면 `ARCHITECTURE.md` §2.6이 금지하는 침묵 변형이 된다.
   */
  readonly folded: boolean;
}

function memoryPathOf(dir: string): string {
  return join(dir, MEMORY_FILE_NAME);
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException)?.code ?? "unknown";
}

/**
 * 심볼릭 링크 거부 (§2.2 · §7.4 A-3). denylist는 **경로로** 판정하므로, 링크로 밖을
 * 가리키면 "denylist 안에 있으면서 실체는 밖"이 되어 §2.1의 격리가 통째로 깨진다.
 * 디렉터리만 막고 파일을 열어두면 막으려던 것을 막지 못하므로 **둘 다** 거부한다.
 */
function assertNotSymlink(path: string, what: "directory" | "file"): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return;
  if (stat.isSymbolicLink()) {
    const noun = what === "directory" ? "디렉터리" : "파일";
    // A-3이 "링크로 관리하던 사용자는 막힌다"를 수용한 대가가 **에러가 이유를 밝히는
    // 것**이다. 언어를 바꾸되 경로와 다음 행동은 그대로 남긴다.
    throw new Error(
      `메모리 ${noun} ${path}가 심볼릭 링크다.\n` +
        `neo-agent는 파일 도구가 닿지 못하도록 메모리를 ~/.neo-agent/ 안에 두는데, ` +
        `링크는 실체를 그 경계 밖으로 내보내므로 거부한다.\n` +
        `링크를 실제 ${noun}로 바꾼 뒤 다시 실행하라 — 링크가 가리키던 내용을 그 자리로 옮기면 된다.`,
    );
  }
}

interface RawMemory {
  readonly text: string;
  readonly exists: boolean;
}

/**
 * 파일을 읽되 **만들지 않는다**. 없으면 `exists: false`이고, 있는데 못 읽으면 던진다
 * (§2.2 3행 — 읽기 실패를 빈 메모리로 강등하지 않는다).
 */
function readMemoryFile(dir: string, onWarning?: (message: string) => void): RawMemory {
  const dirStat = lstatSync(dir, { throwIfNoEntry: false });
  if (dirStat === undefined) return { text: "", exists: false };
  if (dirStat.isSymbolicLink()) assertNotSymlink(dir, "directory");

  const path = memoryPathOf(dir);
  const fileStat = lstatSync(path, { throwIfNoEntry: false });
  if (fileStat === undefined) return { text: "", exists: false };
  if (fileStat.isSymbolicLink()) assertNotSymlink(path, "file");

  // 권한이 600이 아니면 **경고만 하고 진행한다** (§2.2 4행). 메모리는 시크릿이 아니라
  // 크리덴셜의 fail-closed와 의도적으로 다르다 — 같게 다루면 노출 위험이 다른 것에
  // 같은 마찰을 물린다. 판정 기준은 노출 비트의 존재이므로 `0400`은 통과한다(§7.4 A-2).
  if (onWarning !== undefined && (fileStat.mode & EXPOSED_BITS) !== 0) {
    const octal = (fileStat.mode & 0o777).toString(8).padStart(3, "0");
    onWarning(
      `${path}가 다른 사용자에게 열려 있다 (권한 ${octal}). 메모리는 시크릿이 아니라 그대로 진행하지만, ` +
        `의도한 것이 아니면 \`chmod 600 ${path}\`로 좁히면 된다.`,
    );
  }

  try {
    return { text: readFileSync(path, "utf8"), exists: true };
  } catch (error) {
    throw new Error(
      `메모리 파일 ${path}를 읽지 못했다 (${errorCode(error)}).\n` +
        `파일은 있는데 읽히지 않는다. 이것을 빈 메모리로 취급하면 다음 저장이 전체를 덮어 ` +
        `기록이 조용히 사라지므로 여기서 멈춘다.\n` +
        `\`chmod 600 ${path}\`로 권한을 고치거나 파일 소유자를 확인한 뒤 다시 실행하라.`,
    );
  }
}

/**
 * 세션 시작 시 한 번 읽어 **동결**하는 스냅샷 (§3.1). 이 값은 시스템 프롬프트가
 * 소비하고, 세션 중 `remember`가 디스크를 바꿔도 여기 담긴 값은 변하지 않는다.
 *
 * **실패는 throw다.** 종료는 CLI가 한다(§2.2, 2026-08-09 명확화) — 라이브러리가
 * 프로세스를 끝내면 호스트가 시작 실패를 자기 형식으로 알릴 방법이 없다.
 */
export function loadMemory(options: LoadMemoryOptions): MemorySnapshot {
  const raw = readMemoryFile(options.dir, options.onWarning);
  return {
    entries: parseEntries(raw.text),
    text: raw.text,
    chars: countChars(raw.text),
    exists: raw.exists,
  };
}

/**
 * 임시 파일 + rename (§4.3). 임시 파일 이름을 무작위로 두는 이유는 동시 실행 충돌
 * 회피이고, **대상 디렉터리 안**이라는 것이 원자성의 전제다.
 *
 * 이전 크래시가 남긴 임시 파일은 **정리하지 않는다** (§7.4 A-11). 정리하려면
 * "무엇이 우리 임시 파일인가"를 판정해야 하고 그 판정이 새 표면이다 — 오판하면
 * 도구가 사용자 파일을 지운다.
 *
 * **여기의 메시지는 영어로 남긴다** (판정 B-7의 경계). 이 헬퍼는 두 계층이 함께 쓰는
 * 유일한 지점이고, 실제로 도달하는 쪽은 `appendMemoryEntry` → `remember` → **모델**이다
 * (`removeMemoryEntry`의 쓰기 실패는 사용자에게 가지만, 그 경로는 로드가 이미 성공한
 * 뒤라야 도달한다). 계층별로 언어를 가르려면 인자를 하나 더 받아야 하는데, 그것은
 * 판정이 요구한 것이 아니라 **새 표면**이다 — 남은 비일관은 보고 대상으로 둔다.
 */
function writeAtomically(dir: string, text: string, mode: number): void {
  const path = memoryPathOf(dir);
  const temporary = join(dir, `.${MEMORY_FILE_NAME}.tmp-${crypto.randomUUID()}`);

  try {
    writeFileSync(temporary, text, { encoding: "utf8", mode });
  } catch (error) {
    throw new Error(
      `Could not write the memory file ${path} (${errorCode(error)}). Nothing was saved and the existing memory is unchanged.`,
    );
  }

  try {
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // 임시 파일 정리는 최선 노력이다. 실패해도 원본은 그대로이므로 계약은 지켜진다.
    }
    throw new Error(
      `Could not replace the memory file ${path} (${errorCode(error)}). Nothing was saved and the existing memory is unchanged.`,
    );
  }
}

/** 기존 파일의 권한을 보존한다 — 우리가 사용자의 선택을 되돌리지 않는다 */
function fileModeOf(dir: string): number {
  const stat = statSync(memoryPathOf(dir), { throwIfNoEntry: false });
  return stat === undefined ? FILE_MODE : stat.mode & 0o777;
}

/**
 * 항목 하나를 파일 말미에 append한다 (§7.3). 추가만 있고 수정·삭제·회전은 없다.
 *
 * - **중복은 성공이다** (§4.3) — 결과 상태가 의도와 같다. 판정은 앞뒤 공백만 떼고
 *   완전 일치(§7.4 A-9)이며, 사용자가 에디터로 쓴 항목과도 똑같이 비교한다.
 * - **예산 초과는 실패다** (§6) — 회전하지 않는다. 사용자가 적은 항목이 예고 없이
 *   사라지는 것이 가장 나쁜 경로다. 경계는 `<=`이므로 정확히 상한이면 허용한다(A-10).
 * - 디렉터리가 없으면 **여기서** 만든다. 로드는 만들지 않는다 (§2.2).
 */
export function appendMemoryEntry(dir: string, content: string): AppendResult {
  const existing = readMemoryFile(dir);

  // **개행은 공백으로 접는다** (§7.4 EM-1). 그대로 쓰면 한 항목이 여러 줄이 되어
  // §7.3의 "항목 = 최상위 불릿 하나"가 깨지고, 둘째 줄부터는 파싱에서 항목으로
  // 잡히지 않아 **중복 판정이 영영 성립하지 않는다** — 같은 메모가 호출마다 다시
  // 쌓여 예산을 태운다. 거부하는 대신 접는 이유는, 형식 기술상의 이유로 성공한
  // 저장을 실패시키는 것이 §4.2의 방향(모델이 메모리 도구와 싸우게 하지 않는다)과
  // 반대이기 때문이다. **형식의 소유자가 자기 형식으로 정규화하는 것**은 쓰기 경계
  // 에서 모델 입력을 받는 일이라, 이미 디스크에 있는 사용자 글을 건드리는 일
  // (§7.3이 금지한 것)과 다른 자리다. 연속 개행·홀로 선 `\r`까지 한 번에 접는다 —
  // 남기면 "항목에 개행이 없다"는 불변식이 입력 형태에 따라 갈린다.
  const trimmed = normalizeEntry(content);
  const normalized = trimmed.replaceAll(/[\r\n]+/g, " ");
  const folded = normalized !== trimmed;

  for (const entry of parseEntries(existing.text)) {
    if (normalizeEntry(entry.content) === normalized) {
      return { status: "duplicate", chars: countChars(existing.text), folded };
    }
  }

  // 마지막 줄이 개행으로 끝나지 않으면 새 불릿이 그 줄에 이어 붙는다 — 사용자가
  // 쓰던 줄을 우리가 훼손하는 유일한 경로라 여기서 막는다.
  const base =
    existing.text.length === 0 || existing.text.endsWith("\n")
      ? existing.text
      : `${existing.text}\n`;
  const next = `${base}- ${normalized}\n`;

  const chars = countChars(next);
  if (chars > MEMORY_FILE_MAX_CHARS) {
    throw new MemoryBudgetError(countChars(existing.text), chars, MEMORY_FILE_MAX_CHARS);
  }

  const mode = existing.exists ? fileModeOf(dir) : FILE_MODE;
  if (!existing.exists) mkdirSync(dir, { recursive: true, mode: DIRECTORY_MODE });
  writeAtomically(dir, next, mode);

  return { status: "stored", chars, folded };
}

/**
 * `/memory remove <n>`이 쓰는 삭제 (§7.2). 번호는 1-기반이고 파일 순서를 따른다.
 *
 * **해당 불릿 줄 하나만 지운다.** 딸린 중첩 줄은 남기고(§7.4 A-13), 마지막 항목을
 * 지워도 파일은 유지한다(A-12) — 사용자가 쓴 제목·문단이 남아 있을 수 있고 그것을
 * 지우는 것은 §7.3이 금지한 방향이다. 고아 줄이 생기는 것은 수용한다: 정리는 사용자다.
 */
export function removeMemoryEntry(dir: string, index: number): void {
  const existing = readMemoryFile(dir);
  if (!existing.exists) {
    throw new Error(
      `${memoryPathOf(dir)}에 메모리 파일이 없다. 아직 저장된 항목이 없으므로 ${index}번을 지울 수 없다.`,
    );
  }

  const lines = existing.text.split("\n");
  let seen = 0;
  let target = -1;
  for (const [position, line] of lines.entries()) {
    if (!isEntryLine(line)) continue;
    seen += 1;
    if (seen === index) {
      target = position;
      break;
    }
  }

  if (!Number.isInteger(index) || index < 1 || target === -1) {
    const total = parseEntries(existing.text).length;
    throw new Error(
      total === 0
        ? `${index}번 항목이 없다 — 메모리에 항목이 하나도 없다. \`/memory\`로 현재 상태를 확인하라.`
        : `${index}번 항목이 없다 — 메모리에 항목이 ${total}개 있고 번호는 1부터 ${total}까지다. \`/memory\`로 번호를 확인하라.`,
    );
  }

  lines.splice(target, 1);
  writeAtomically(dir, lines.join("\n"), fileModeOf(dir));
}
