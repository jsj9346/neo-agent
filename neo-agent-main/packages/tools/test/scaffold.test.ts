/**
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { validateToolArgs } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * 스캐폴딩 스모크 — 워크스페이스 의존 해석·타입 스트리핑·Vitest 조합이 성립하는지.
 * 도구 계약 자체의 검증은 각 도구 테스트가 한다.
 */
describe("scaffold", () => {
  it("워크스페이스 의존(@neo-agent/core)을 임포트한다", () => {
    const tool = {
      name: "probe",
      label: "Probe",
      description: "scaffold probe",
      paramsSchema: z.strictObject({ value: z.string() }),
      execute: async () => ({ content: [], source: "local" as const }),
    };

    expect(validateToolArgs(tool, { value: "ok" }).ok).toBe(true);
    expect(validateToolArgs(tool, { unexpected: 1 }).ok).toBe(false);
  });
});
