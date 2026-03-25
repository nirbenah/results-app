import dotenv from 'dotenv';
import { Knex } from 'knex';

dotenv.config();

function getConnection(): Knex.StaticConnectionConfig | string {
  // DATABASE_URL takes priority (Railway, Heroku, Render, etc.)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'results_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };
}

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: getConnection(),
    migrations: {
      directory: './src/shared/db/migrations',
      extension: 'ts',
    },
    pool: {
      min: 2,
      max: 10,
    },
  },

  production: {
    client: 'pg',
    connection: (() => {
      const conn = getConnection();
      // If it's a connection string, append SSL param
      if (typeof conn === 'string') {
        return conn;
      }
      return { ...conn, ssl: { rejectUnauthorized: false } };
    })(),
    migrations: {
      directory: './src/shared/db/migrations',
      extension: 'ts',
    },
    pool: {
      min: 2,
      max: 20,
    },
  },
};

export default config;
