/**
 * 게이트 분류 테이블 — `docs/TOOLS-INTERFACE.md` §5.
 *
 * 게이트는 도구 구현을 모른다. "어느 도구가 어떤 행동이고 어느 인자가 경로/명령인지"를
 * 이 테이블이 설정 데이터로 알려준다 — 두 패키지가 서로를 임포트하지 않고 만나는 지점이다.
 *
 * 타입을 여기서 다시 정의하는 이유: `packages/gate`를 임포트하면 무의존 계약이 깨진다.
 * 게이트의 `GateToolProfile`과 **구조적으로 호환**되므로 배선 시 그대로 넘어간다.
 *
 * **테이블에 없는 도구는 게이트가 fail-closed로 다룬다**(항상 승인 프롬프트). 새 도구를
 * 추가하면서 여기 등록을 잊어도 조용한 자동 허용이 되지 않는다.
 */

export type ToolGateProfile =
  | { kind: "fileRead" | "fileWrite" | "fileEdit"; pathParam: string }
  | { kind: "shellExec"; commandParam: string; cwdParam?: string };

export const TOOL_GATE_PROFILES: Readonly<Record<string, ToolGateProfile>> = {
  read_file: { kind: "fileRead", pathParam: "path" },
  write_file: { kind: "fileWrite", pathParam: "path" },
  edit_file: { kind: "fileEdit", pathParam: "path" },
  shell: { kind: "shellExec", commandParam: "command", cwdParam: "cwd" },
};
