/**
 * `@neo-agent/tools` 공개 배럴.
 *
 * 파일·셸 도구와 워크스페이스 경계 판정. 계약 정본은 `docs/TOOLS-INTERFACE.md`.
 *
 * 이 패키지는 승인 게이트를 모른다(`packages/gate`와 상호 무의존) — 결합은
 * 호스트(CLI)의 배선 한 곳에서 일어난다. 단 크리덴셜 denylist만은 게이트가
 * 아니라 도구 자체가 강제한다(§3) — 게이트가 꺼져 있어도 동작해야 하기 때문이다.
 */

import type { AgentTool } from "@neo-agent/core";
import { createEditFileTool } from "./edit-file.ts";
import type { ShellExecutor } from "./executor.ts";
import { createReadFileTool } from "./read-file.ts";
import { createShellTool } from "./shell.ts";
import type { WorkspaceBoundary } from "./workspace.ts";
import { createWriteFileTool } from "./write-file.ts";

// §2 도구 4종
export { createEditFileTool, type EditFileDetails } from "./edit-file.ts";

// §4 실행자 경계 — 샌드박스 도입은 이 구현의 교체다
export {
  createHostShellExecutor,
  type HostShellExecutorOptions,
  type ShellExecRequest,
  type ShellExecResult,
  type ShellExecutor,
  scrubEnv,
} from "./executor.ts";
// §5 게이트 접점
export { TOOL_GATE_PROFILES, type ToolGateProfile } from "./gate-profiles.ts";
export { createReadFileTool, type ReadFileDetails } from "./read-file.ts";
export { createShellTool, type ShellDetails, type ShellToolOptions } from "./shell.ts";
// 출력 유계 — 도구 저작·테스트에서 같은 상한을 쓸 수 있게 공개한다
export {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type TruncationOptions,
  type TruncationResult,
  truncateTailBytes,
  truncateText,
} from "./truncate.ts";
// §3 워크스페이스 경계 — 도구와 게이트가 **같은 인스턴스**를 공유해야 한다
export {
  createWorkspaceBoundary,
  type PathScope,
  type ResolvedPath,
  type WorkspaceBoundary,
  type WorkspaceBoundaryOptions,
} from "./workspace.ts";
export { createWriteFileTool, type WriteFileDetails } from "./write-file.ts";

export interface StandardToolsOptions {
  boundary: WorkspaceBoundary;
  executor: ShellExecutor;
  defaultTimeoutSeconds?: number;
}

/**
 * MVP 도구 4종을 등록 순서 그대로 만든다.
 *
 * 등록은 명시적 배열이다(CORE-INTERFACE §6 — AST 디스커버리 없음). 순서를 고정하는
 * 이유는 모델 페이로드의 바이트 안정성(프롬프트 캐시 적중)이다(불변 조건 6).
 */
export function createStandardTools(options: StandardToolsOptions): AgentTool[] {
  const { boundary, executor } = options;
  return [
    createReadFileTool(boundary),
    createWriteFileTool(boundary),
    createEditFileTool(boundary),
    createShellTool({
      boundary,
      executor,
      ...(options.defaultTimeoutSeconds === undefined
        ? {}
        : { defaultTimeoutSeconds: options.defaultTimeoutSeconds }),
    }),
  ];
}
