import { describe, expect, it, vi } from "vitest";
import { configureMysqlUtcSession } from "./mysql-timezone";

describe("MySQL UTC session configuration", () => {
  it("sets the database session timezone to UTC for every new pooled connection", () => {
    let listener: ((connection: { query: (sql: string) => unknown }) => void) | undefined;
    const pool = { on: vi.fn((_event: "connection", callback: (connection: { query: (sql: string) => unknown }) => void) => { listener = callback; }) };
    const query = vi.fn();
    configureMysqlUtcSession(pool);
    expect(pool.on).toHaveBeenCalledWith("connection", expect.any(Function));
    listener?.({ query });
    expect(query).toHaveBeenCalledWith("SET time_zone = '+00:00'");
  });
});
