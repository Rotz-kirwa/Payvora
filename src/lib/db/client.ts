import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  console.log("[db] createDb called, DATABASE_URL present:", !!url, "keys:", Object.keys(process.env).filter(k => k.startsWith("DATABASE") || k.startsWith("JWT") || k.startsWith("MPESA_S")).join(","));
  if (!url) throw new Error("DATABASE_URL environment variable is required");

  const client = postgres(url, {
    max: 1, // single connection per worker instance
    types: {
      // parse NUMERIC columns as JS numbers instead of strings
      numeric: {
        to: 0,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => parseFloat(x),
      },
    },
  });

  return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop, receiver) {
    if (!_db) _db = createDb();
    return Reflect.get(_db, prop, receiver);
  },
});
