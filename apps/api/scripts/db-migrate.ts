import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/db';
import { logger } from '../src/config/logger';

async function run() {
    const migrationsDir = path.resolve(__dirname, '../db/migrations');
    const files = fs
        .readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort();

    if (!files.length) {
        logger.warn({ migrationsDir }, 'No migration files found');
        return;
    }

    logger.info({ count: files.length }, 'Starting database migrations');

    for (const file of files) {
        const sqlPath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(sqlPath, 'utf8');
        logger.info({ file }, 'Applying migration');
        await pool.query(sql);
        logger.info({ file }, 'Migration applied');
    }

    logger.info('All migrations applied successfully');
}

run()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async (err) => {
        logger.error({ err }, 'Migration failed');
        await pool.end().catch(() => undefined);
        process.exit(1);
    });

