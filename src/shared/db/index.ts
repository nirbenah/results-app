import knex, { Knex } from 'knex';
import { config } from '../config';

let db: Knex;

export function getDb(): Knex {
  if (!db) {
    // DATABASE_URL takes priority (Railway and other cloud providers)
    const connection = config.db.connectionString
      ? config.db.connectionString
      : {
          host: config.db.host,
          port: config.db.port,
          database: config.db.database,
          user: config.db.user,
          password: config.db.password,
        };

    db = knex({
      client: 'pg',
      connection,
      pool: { min: 2, max: 10 },
    });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
  }
}
