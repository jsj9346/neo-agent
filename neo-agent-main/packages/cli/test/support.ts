/**
 * 계약 테스트 공용 지원 — 시그니처 관용(tolerance) 규약.
 *
 * T-009는 구현 선행 테스트다. **계약(결과)은 문서가 정하지만 시그니처(호출 형태)는
 * 구현 세부**이므로(팀 리드 지시), 호출 형태 차이 때문에 계약 위반으로 오판하지
 * 않도록 다음 규약을 쓴다:
 *
 *   1. `beforeAll`에서 **성공해야 마땅한 입력**(유효한 설정 파일 등)으로 여러 호출
 *      형태를 시도해 통하는 것 하나를 고른다(`probeCallStyle`).
 *   2. 이후 모든 테스트는 그 형태로만 호출한다.
 *
 * 이 순서가 중요하다. 매 테스트에서 형태를 재탐색하면 "계약대로 throw한 것"과
 * "형태가 틀려서 throw한 것"이 구별되지 않아, fail-closed로 던진 에러를 다른 형태로
 * 재시도해 통과시키는 최악의 오판이 생긴다.
 *
 * 이 파일은 테스트가 아니다(`*.test.ts`가 아니므로 vitest가 수집하지 않는다).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 호출 형태 — 인자는 그때의 홈/파일 경로로 만들어진다(경로가 테스트마다 다르므로) */
export interface CallStyle<TCtx> {
  label: string;
  args: (ctx: TCtx) => readonly unknown[];
}

/**
 * 유효 입력으로 호출 형태를 결정한다. 전부 실패하면 시도 목록과 함께 throw —
 * "시그니처 불일치"임을 보고에서 구분할 수 있게 한다.
 */
export function probeCallStyle<TCtx>(
  fn: unknown,
  ctx: TCtx,
  candidates: readonly CallStyle<TCtx>[],
  what: string,
): CallStyle<TCtx> {
  if (typeof fn !== "function") {
    throw new Error(`[구현 미완] ${what}가 함수가 아니다 (실제: ${typeof fn})`);
  }
  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      (fn as (...args: unknown[]) => unknown)(...candidate.args(ctx));
      return candidate;
    } catch (error) {
      failures.push(
        `${candidate.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(
    `[시그니처 불일치 가능] ${what}의 호출 형태를 찾지 못했다 — 유효 입력으로도 전부 실패했다.\n` +
      failures.map((line) => `  - ${line}`).join("\n"),
  );
}

/** 결정된 형태로 호출한다 */
export function callWith<TCtx, TResult>(fn: unknown, style: CallStyle<TCtx>, ctx: TCtx): TResult {
  return (fn as (...args: unknown[]) => TResult)(...style.args(ctx));
}

/** 테스트마다 격리된 임시 홈 디렉터리 */
export function makeTempHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "neo-agent-qa-a-"));
  return {
    home,
    cleanup: () => {
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {
        // 권한 테스트에서 잠근 디렉터리는 정리에 실패할 수 있다 — 테스트가 스스로
        // 되돌리므로 여기서는 삼킨다.
      }
    },
  };
}

/**
 * 콘솔·stderr로 나가는 경고를 수집한다.
 *
 * [미규정] 경고 전달 수단이 계약에 없다(`CLI-INTERFACE.md` §10은 "경고를 표시한다"만
 * 규정). 주입 콜백일 수도, console일 수도, stderr 직접 쓰기일 수도 있어 셋 다 본다.
 */
export function captureWarnings(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalLog = console.log;
  const originalWrite = process.stderr.write.bind(process.stderr);

  console.warn = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };
  console.log = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };
  process.stderr.write = ((chunk: unknown) => {
    messages.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  return {
    messages,
    restore: () => {
      console.warn = originalWarn;
      console.error = originalError;
      console.log = originalLog;
      process.stderr.write = originalWrite;
    },
  };
}

/** 깊은 동결 여부 — SAFE-DEFAULTS §4 동결 계약의 관찰 */
export function frozenReport(value: unknown, path = "$"): string[] {
  const unfrozen: string[] = [];
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return unfrozen;
  if (!Object.isFrozen(value)) unfrozen.push(path);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    unfrozen.push(...frozenReport(child, `${path}.${key}`));
  }
  return unfrozen;
}
