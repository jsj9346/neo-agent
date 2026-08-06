#!/usr/bin/env node
/**
 * `neo-agent` bin 엔트리 — `docs/CLI-INTERFACE.md` §2.
 *
 * **`process.*`를 만지는 유일한 곳이다.** argv·env·cwd·home·표준 스트림을 여기서
 * 읽어 조립(`wiring.ts`)에 넘긴다. 조립부터 아래로는 전부 주입된 값만 쓰므로
 * 모의 스트림과 임시 디렉터리로 검증할 수 있다.
 *
 * 이 파일에는 **정적 `import`가 없다.** 아래 경고 필터가 `node:sqlite`가 로드되기
 * 전에 설치돼야 하는데, 정적 임포트는 모듈 본문보다 먼저 평가되기 때문이다 —
 * `@neo-agent/store`를 정적으로 끌어오는 순간 필터는 항상 한 발 늦는다(실측:
 * ExperimentalWarning은 `node:sqlite` 임포트 시점에 방출된다).
 */

import { homedir } from "node:os";

installSqliteWarningFilter();

const { runCli, CLI_VERSION } = await import("./wiring.ts");

// [미규정] R-3 — TTY 없이 기동했을 때(파이프·CI)의 동작. 계약이 정하지 않았고 여기서
// 임의로 닫지 않는다. 지금은 그대로 진행한다: readline은 `terminal: true`로 동작하고
// 라인 단위 입력도 받지만, 라인 가드가 이스케이프 시퀀스를 파이프로 흘려보내고
// 승인 프롬프트의 단일 키 읽기는 raw 모드 없이 Enter를 기다리게 된다.
// **제안: 명시적 에러로 거부한다** — `process.stdin.isTTY`가 아닌 채로 승인 게이트가
// 도는 것은 "물어볼 사람이 없는데 묻는" 상태이고, 그 조합은 조용한 대기(행)로
// 끝난다. 무인 실행이 필요해지면 그때 승인 모드와 함께 설계할 문제다(§12).
process.exitCode = await runCli({
  argv: process.argv.slice(2),
  env: process.env,
  cwd: process.cwd(),
  home: homedir(),
  io: { input: process.stdin, output: process.stdout },
  version: CLI_VERSION,
});

/**
 * `node:sqlite`의 ExperimentalWarning만 걸러낸다 (§12 미결의 해소).
 *
 * 계약은 **"정상 기동 시 stderr에 sqlite 경고가 없다"**이지 경고 전역 억제가 아니다.
 * `--no-warnings`류는 다른 경고(폐기 예정 API, 미처리 rejection 등)까지 함께 삼켜서
 * 침묵 실패를 만든다 — 지금 안 보이게 하려는 것 하나만 걸러야 한다.
 *
 * Node의 기본 경고 출력은 `process.on("warning")` 리스너 하나다. 그것을 떼어 보관한
 * 뒤 우리 필터를 끼우고, 통과한 경고는 **보관한 기본 리스너에게 그대로 넘긴다** —
 * 우리가 다시 찍으면 스택 트레이스 형식이 달라진다.
 */
function installSqliteWarningFilter(): void {
  const defaults = process.listeners("warning");
  process.removeAllListeners("warning");

  process.on("warning", (warning: Error) => {
    if (warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")) return;
    for (const listener of defaults) listener(warning);
  });
}
