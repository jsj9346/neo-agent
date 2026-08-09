/**
 * `packages/memory` 계약 테스트 공용 헬퍼 — QA-A 소유.
 *
 * **1급 안전 규율**: 이 파일과 이 디렉터리의 어떤 테스트도 실제 사용자 홈을 읽거나
 * 쓰지 않는다. 메모리 디렉터리는 언제나 `mkdtempSync(join(tmpdir(), "neo-memory-"))`로
 * 만든 임시 경로를 주입하고, 테스트가 끝나면 지운다. 주입을 한 번이라도 빠뜨리면
 * 테스트가 사용자의 실사용 메모리 파일을 덮어쓴다 — 결과가 데이터 손실이라 등급이 다르다.
 *
 * 이 파일은 `*.test.ts`가 아니므로 vitest 수집 대상이 아니다.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 파일 이름은 `MEMORY_FILE_NAME` 상수가 정본이고(`MEMORY.md` §2), 그 값이 `"MEMORY.md"`
 * 라는 것은 별도 테스트가 고정한다. 헬퍼가 상수를 임포트하지 않는 이유는, 상수 자체가
 * 계약 검사 대상이라 헬퍼가 그것에 의존하면 검사가 자기참조가 되기 때문이다.
 */
export const MEMORY_FILE = "MEMORY.md";

const roots: string[] = [];

/** 테스트마다 새 임시 루트. 이 밑에서만 파일을 만든다 */
export function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "neo-memory-"));
  roots.push(root);
  return root;
}

/** 루트 밑에 메모리 디렉터리를 만들어 돌려준다 */
export function newMemoryDir(root: string, name = "memory"): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function memoryPath(dir: string): string {
  return join(dir, MEMORY_FILE);
}

export function writeMemory(dir: string, text: string, mode = 0o600): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(memoryPath(dir), text, { encoding: "utf8", mode });
  chmodSync(memoryPath(dir), mode);
}

export function readMemory(dir: string): string {
  return readFileSync(memoryPath(dir), "utf8");
}

export function memoryExists(dir: string): boolean {
  return existsSync(memoryPath(dir));
}

/** 권한을 되돌린 뒤 통째로 지운다 — 000으로 만든 픽스처가 남으면 rm이 실패한다 */
function restorePermissions(path: string): void {
  try {
    const stat = statSync(path, { throwIfNoEntry: false });
    if (stat === undefined) return;
    chmodSync(path, stat.isDirectory() ? 0o700 : 0o600);
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(path)) {
      restorePermissions(join(path, entry));
    }
  } catch {
    // 지우기 위한 최선 노력이다. 실패해도 rmSync의 force가 남은 것을 정리한다.
  }
}

/** afterEach에서 부른다 — 이 프로세스가 만든 임시 루트를 전부 지운다 */
export function cleanupRoots(): void {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root === undefined) continue;
    restorePermissions(root);
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * root로 돌면 chmod 000도 읽히므로 "못 읽음" 계약을 재현할 수 없다.
 * 재현 가능 여부를 한 번만 실측해 두고, 불가하면 해당 테스트를 건너뛴다
 * (건너뛴 사실이 보이는 것이 조용히 통과하는 것보다 낫다).
 */
export const CAN_ENFORCE_PERMISSIONS: boolean = (() => {
  const probeRoot = mkdtempSync(join(tmpdir(), "neo-memory-probe-"));
  try {
    const probe = join(probeRoot, "probe.txt");
    writeFileSync(probe, "probe", "utf8");
    chmodSync(probe, 0o000);
    try {
      readFileSync(probe, "utf8");
      return false;
    } catch {
      return true;
    }
  } finally {
    restorePermissions(probeRoot);
    rmSync(probeRoot, { recursive: true, force: true });
  }
})();

/** 정확히 `total` 문자인 최상위 불릿 블록. 첫 줄은 회전 여부를 보기 위한 표식이다 */
export function bulletBlockOfLength(total: number, marker = "오래된 항목"): string {
  const first = `- ${marker}\n`;
  const rest = total - first.length;
  if (rest < 4) {
    throw new Error(`bulletBlockOfLength: total=${total}이 너무 짧다`);
  }
  return `${first}- ${"x".repeat(rest - 3)}\n`;
}

/** 도구 결과의 텍스트 파트만 이어 붙인다 — 모델이 실제로 보는 것 */
export function textOf(result: { content: readonly { type: string }[] }): string {
  return result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function toolContext(signal: AbortSignal = new AbortController().signal): {
  toolCallId: string;
  signal: AbortSignal;
} {
  return { toolCallId: "call-1", signal };
}

/**
 * 실패의 표현이 throw인지 에러 결과인지는 이 패키지의 문서가 직접 정하지 않았다.
 * `CORE-INTERFACE.md` §6은 "실패는 throw, 루프가 `isError`로 변환"이고 배치 스케치도
 * 그렇게 고정했지만, `MEMORY.md` §4.3 표는 `isError: true`로 적는다 — **모델이 사유를
 * 읽을 수 있다**는 결과만 고정하고 표현에는 중립인 헬퍼를 쓴다.
 */
export async function runExpectingFailure(
  tool: {
    execute(params: unknown, ctx: ReturnType<typeof toolContext>): Promise<unknown>;
  },
  args: unknown,
): Promise<string> {
  try {
    const result = (await tool.execute(args, toolContext())) as {
      content: readonly { type: string }[];
    };
    return textOf(result);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** 설명문의 "사실" 검사 — 문구가 아니라 사실을 본다(§4.2). 각 조각이 전부 걸려야 한다 */
export function assertsAllMatch(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.every((pattern) => pattern.test(text));
}
