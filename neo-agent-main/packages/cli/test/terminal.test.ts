/**
 * 터미널 좌표 계산 단위 테스트.
 *
 * 라인 가드가 입력 라인을 걷어내고 출력을 이어 쓰는 위치가 전부 이 세 함수에서
 * 나온다. 여기가 틀리면 스트리밍 중 재그리기가 출력 위를 덮는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import {
  advanceColumn,
  cursorToColumn,
  cursorUp,
  displayWidth,
  style,
  wrappedColumn,
  wrappedRows,
} from "../src/terminal.ts";

describe("displayWidth", () => {
  it("ANSI 이스케이프는 0칸이다 — 렌더러의 스타일 텍스트가 이 싱크로 나간다", () => {
    expect(displayWidth(style.dim("abc"))).toBe(3);
    expect(displayWidth(`${style.red("x")}${style.bold("y")}`)).toBe(2);
  });

  it("전각 문자는 2칸이다", () => {
    expect(displayWidth("가나다")).toBe(6);
    expect(displayWidth("한글abc")).toBe(7);
  });

  it("제어 문자·zero-width는 세지 않는다", () => {
    expect(displayWidth("a​b")).toBe(2);
  });
});

describe("advanceColumn", () => {
  it("개행이 없으면 길이만큼 나아간다", () => {
    expect(advanceColumn(3, "abc")).toBe(6);
  });

  it("스타일과 전각 문자를 표시 폭으로 센다", () => {
    expect(advanceColumn(0, style.dim("가나"))).toBe(4);
    expect(advanceColumn(2, "가\n나다")).toBe(4);
  });

  it("마지막 개행 뒤의 길이가 새 열이다", () => {
    expect(advanceColumn(10, "abc\ndef")).toBe(3);
  });

  it("개행으로 끝나면 열은 0이다", () => {
    expect(advanceColumn(10, "abc\n")).toBe(0);
  });
});

describe("wrappedRows / wrappedColumn", () => {
  it("폭 안이면 같은 행, 1-기반 열", () => {
    expect(wrappedRows(5, 80)).toBe(0);
    expect(wrappedColumn(5, 80)).toBe(6);
  });

  it("폭을 넘으면 행이 내려가고 열이 접힌다", () => {
    expect(wrappedRows(25, 20)).toBe(1);
    expect(wrappedColumn(25, 20)).toBe(6);
  });

  it("columns를 모르면 감싸지 않는 것으로 본다 — 모의 스트림의 기본 상태다", () => {
    expect(wrappedRows(120, undefined)).toBe(0);
    expect(wrappedColumn(120, undefined)).toBe(121);
    expect(wrappedRows(120, 0)).toBe(0);
  });
});

describe("커서 시퀀스", () => {
  it("0행 이동은 아무 바이트도 만들지 않는다", () => {
    expect(cursorUp(0)).toBe("");
    expect(cursorUp(2)).toBe("\x1b[2A");
  });

  it("열 이동은 1-기반이다", () => {
    expect(cursorToColumn(1)).toBe("\x1b[1G");
  });
});
