/**
 * 파일 도구의 공통 경로 검사 — `docs/TOOLS-INTERFACE.md` §3.
 *
 * **`denied` 차단은 게이트가 아니라 도구가 강제한다.** SAFE-DEFAULTS §1 매트릭스의
 * "승인으로도 불가" 행은 여기가 최종 보장 지점이다 — 게이트가 꺼져 있어도(`off`),
 * 훅이 배선되지 않았어도 동작해야 한다. 게이트 파이프라인의 denied 단계는 이것의
 * 이중화이지 대체물이 아니다.
 *
 * `outside`는 여기서 막지 않는다 — 워크스페이스 밖 접근의 허용 여부는 게이트의
 * 정책 판단이고, 도구가 미리 막으면 승인으로 열 수 있어야 할 경로가 닫힌다.
 */

import type { ResolvedPath, WorkspaceBoundary } from "./workspace.ts";

/**
 * 경로를 해석하고 접근 금지 대상이면 throw한다.
 *
 * 에러 텍스트는 모델이 읽는다(루프가 `isError` 결과로 변환) — 무엇이 막혔고 왜
 * 막혔는지를 담아 다음 행동을 정정할 수 있게 한다. 침묵 거부는 금지(§2.6).
 */
export function resolveAccessiblePath(boundary: WorkspaceBoundary, input: string): ResolvedPath {
  const resolved = boundary.resolve(input);
  if (resolved.scope === "denied") {
    throw new Error(
      `Access to "${input}" is blocked: it resolves to a protected credential path (${resolved.path}). ` +
        "This block cannot be lifted by approval. If you need a value from it, ask the user directly.",
    );
  }
  return resolved;
}
