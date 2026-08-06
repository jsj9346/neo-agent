/**
 * 바인딩 파라미터의 타입 보장.
 *
 * **STRICT가 잡아주리라 기대하지 않는다.** `node:sqlite`는 JS `number`를 언제나
 * SQLite REAL로 바인딩하고, STRICT는 그 위에서 **무손실 변환을 허용한다**.
 * 2026-08-06 Node 25.2.1 실측:
 *
 * | 바인딩 | INTEGER 컬럼 | TEXT 컬럼 |
 * |---|---|---|
 * | `1`, `2.0` (정수값)  | 통과 — `integer` 1, 2 | **통과 — `"1.0"`, `"2.0"`** |
 * | `1.5` (비정수)       | 거부 — "cannot store REAL value in INTEGER column" | 통과 — `"1.5"` |
 * | `"abc"`              | 거부 — "cannot store TEXT value in INTEGER column" | 통과 |
 * | `true` / `undefined` | **거부 — "Provided value cannot be bound"** (예외) | 동일 |
 *
 * 즉 STRICT가 막아주는 것은 `string → INTEGER`와 `비정수 → INTEGER`뿐이다.
 * `number → TEXT`는 조용히 `"42.0"`으로 들어간다 — 타임스탬프를 TEXT 컬럼에
 * 잘못 넣어도 DB는 아무 말도 하지 않는다. 그래서 이 단계가 필요하다.
 *
 * boolean은 아예 바인딩되지 않으므로(예외) `active` 같은 0/1 컬럼에는 숫자를
 * 넘겨야 한다 — 타입 시스템이 아니라 런타임 예외로 드러나는 함정이라 적어 둔다.
 */

/**
 * INTEGER 컬럼에 넣을 값임을 보장한다. 비정수·NaN·Infinity는 여기서 막는다 —
 * DB까지 내려가면 비정수만 걸러지고 `Number.MAX_SAFE_INTEGER` 초과는 조용히
 * 정밀도를 잃는다.
 */
export function integerParam(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer for an INTEGER column, got ${value}.`);
  }
  return value;
}

/** TEXT 컬럼에 넣을 값임을 보장한다 — number가 새어 들어가면 `"42.0"`이 된다 */
export function textParam(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string for a TEXT column, got ${typeof value}.`);
  }
  return value;
}
