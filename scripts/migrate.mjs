import { readFileSync } from "node:fs";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
await sql.unsafe(schema);
await sql.end();
console.log("Schema applied.");
