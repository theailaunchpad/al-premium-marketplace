import { execSync } from "node:child_process";

export interface PgContainer {
  containerId: string;
  port: number;
  databaseUrl: string;
}

export function startPostgres(runId: string): PgContainer {
  const containerName = `test-pg-${runId}`;

  // Start container with random host port
  const containerId = execSync(
    `docker run -d --name ${containerName} ` +
      `-e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=testdb ` +
      `-p 0:5432 postgres:16-alpine`,
    { encoding: "utf-8" }
  ).trim();

  // Get the mapped host port
  const port = parseInt(
    execSync(
      `docker port ${containerId} 5432 | head -1 | cut -d: -f2`,
      { encoding: "utf-8" }
    ).trim(),
    10
  );

  const databaseUrl = `postgresql://test:test@localhost:${port}/testdb`;

  // Wait for postgres to be ready (up to 30s)
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      execSync(
        `docker exec ${containerId} pg_isready -U test -d testdb`,
        { stdio: "pipe" }
      );
      break;
    } catch {
      execSync("sleep 1");
    }
  }

  return { containerId, port, databaseUrl };
}

export function stopPostgres(containerId: string): void {
  try {
    execSync(`docker rm -f ${containerId}`, { stdio: "pipe" });
  } catch (err) {
    console.warn(`Warning: Failed to stop container ${containerId}:`, (err as Error).message);
  }
}
