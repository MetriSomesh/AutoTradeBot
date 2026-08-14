type MysqlConnection = { query: (sql: string) => unknown };
type MysqlPool = { on: (event: "connection", listener: (connection: MysqlConnection) => void) => unknown };

/** Ensures TIMESTAMP values are selected as UTC before browser-side IST rendering. */
export function configureMysqlUtcSession<T extends MysqlPool>(pool: T): T {
  pool.on("connection", connection => {
    connection.query("SET time_zone = '+00:00'");
  });
  return pool;
}
