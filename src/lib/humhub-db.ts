import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.HUMHUB_DB_HOST || 'localhost',
      port: parseInt(process.env.HUMHUB_DB_PORT || '3306'),
      user: process.env.HUMHUB_DB_USER || 'humhub',
      password: process.env.HUMHUB_DB_PASS || '',
      database: process.env.HUMHUB_DB_NAME || 'humhub',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}
