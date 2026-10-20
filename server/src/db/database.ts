import { CompiledQuery, Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import { config } from '../config.ts';
import type { Database } from './schema.ts';


export function createDatabase(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new MysqlDialect({
      pool: createPool({
        uri: config.databaseUrl(),
        dateStrings: true,
        timezone: 'Z',
        charset: 'utf8mb4',
        connectionLimit: 5,
      }),
      // DATETIME columns are kept in UTC, including CURRENT_TIMESTAMP defaults.
      onCreateConnection: async (connection) => {
        await connection.executeQuery(CompiledQuery.raw(`SET time_zone = '+00:00'`));
      },
    }),
  });
}
