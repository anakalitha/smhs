// src\lib\db.ts
import mysql from "mysql2/promise";

declare global {
  var __dbPool: mysql.Pool | undefined;
}

export const db =
  global.__dbPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    waitForConnections: true,
    namedPlaceholders: true,
  });

if (process.env.NODE_ENV !== "production") global.__dbPool = db;
