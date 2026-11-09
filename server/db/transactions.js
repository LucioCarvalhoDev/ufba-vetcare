export function withTransaction(connection, callback) {
  connection.exec("BEGIN IMMEDIATE;");

  try {
    const result = callback();
    connection.exec("COMMIT;");
    return result;
  } catch (error) {
    connection.exec("ROLLBACK;");
    throw error;
  }
}
