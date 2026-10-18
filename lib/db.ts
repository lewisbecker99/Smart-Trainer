import postgres from "postgres";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

type Sql = ReturnType<typeof postgres>;

// Reuse one pool across hot reloads / warm serverless invocations. Created on
// first use so `next build` works without DATABASE_URL.
function client(): Sql {
  return (globalThis.__sql ??= postgres(env("DATABASE_URL"), {
    max: 5,
    idle_timeout: 20,
    transform: { undefined: null },
  }));
}

export const sql = new Proxy(function () {} as unknown as Sql, {
  apply: (_target, _this, args) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_target, prop) => Reflect.get(client(), prop),
});

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await sql<{ value: T }[]>`SELECT value FROM settings WHERE key = ${key}`;
  return rows[0]?.value ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${sql.json(value as never)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}
