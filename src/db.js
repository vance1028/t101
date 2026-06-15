'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/**
 * SQLite 连接管理。
 *
 * - 默认持久化到 data/app.db；
 * - 设置环境变量 DB_FILE=':memory:' 可用内存库（测试用，进程内不落盘）。
 *
 * 全程使用 better-sqlite3（同步 API），并开启外键约束。
 */

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'app.db');

let db = null;

function getDb() {
  if (db) return db;

  if (DB_FILE !== ':memory:') {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  }

  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipe_segments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL UNIQUE,
      district     TEXT NOT NULL,
      type         TEXT NOT NULL,
      material     TEXT,
      diameter_mm  INTEGER,
      length_m     REAL,
      status       TEXT NOT NULL DEFAULT 'normal',
      installed_at TEXT,
      remark       TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pump_stations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      district     TEXT NOT NULL,
      capacity_m3h REAL,
      pump_count   INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'standby',
      location     TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pipe_district ON pipe_segments(district);
    CREATE INDEX IF NOT EXISTS idx_pipe_status   ON pipe_segments(status);
    CREATE INDEX IF NOT EXISTS idx_station_district ON pump_stations(district);
    CREATE INDEX IF NOT EXISTS idx_station_status   ON pump_stations(status);

    -- 防汛物资目录
    CREATE TABLE IF NOT EXISTS flood_materials (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      spec       TEXT,
      unit       TEXT NOT NULL,
      remark     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 仓库/库存点
    CREATE TABLE IF NOT EXISTS warehouses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      code          TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'warehouse',
      district      TEXT NOT NULL,
      location      TEXT,
      station_id    INTEGER,
      remark        TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (station_id) REFERENCES pump_stations(id)
    );

    -- 库存
    CREATE TABLE IF NOT EXISTS inventory (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id  INTEGER NOT NULL,
      material_id   INTEGER NOT NULL,
      quantity      INTEGER NOT NULL DEFAULT 0,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (warehouse_id, material_id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (material_id) REFERENCES flood_materials(id)
    );

    -- 调拨单
    CREATE TABLE IF NOT EXISTS transfer_orders (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no            TEXT NOT NULL UNIQUE,
      status              TEXT NOT NULL DEFAULT 'draft',
      source_warehouse_id INTEGER NOT NULL,
      target_warehouse_id INTEGER NOT NULL,
      remark              TEXT,
      created_by          INTEGER,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
      outbound_at         TEXT,
      received_at         TEXT,
      FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (target_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- 调拨单明细
    CREATE TABLE IF NOT EXISTS transfer_order_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id    INTEGER NOT NULL,
      material_id INTEGER NOT NULL,
      quantity    INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES transfer_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES flood_materials(id)
    );

    -- 库存流水
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id    INTEGER NOT NULL,
      material_id     INTEGER NOT NULL,
      change_quantity INTEGER NOT NULL,
      balance_quantity INTEGER NOT NULL,
      biz_type        TEXT NOT NULL,
      biz_id          INTEGER,
      remark          TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (material_id) REFERENCES flood_materials(id)
    );

    CREATE INDEX IF NOT EXISTS idx_warehouses_district ON warehouses(district);
    CREATE INDEX IF NOT EXISTS idx_warehouses_type ON warehouses(type);
    CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_material ON inventory(material_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_status ON transfer_orders(status);
    CREATE INDEX IF NOT EXISTS idx_transfer_source ON transfer_orders(source_warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_target ON transfer_orders(target_warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_items_order ON transfer_order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_logs_warehouse ON inventory_logs(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_logs_material ON inventory_logs(material_id);
    CREATE INDEX IF NOT EXISTS idx_logs_biz ON inventory_logs(biz_type, biz_id);
  `);
}

/** 清空所有业务数据（测试用）。 */
function resetAll() {
  const conn = getDb();
  conn.exec(`
    DELETE FROM inventory_logs;
    DELETE FROM transfer_order_items;
    DELETE FROM transfer_orders;
    DELETE FROM inventory;
    DELETE FROM warehouses;
    DELETE FROM flood_materials;
    DELETE FROM pipe_segments;
    DELETE FROM pump_stations;
    DELETE FROM users;
  `);
  conn.exec(`
    DELETE FROM sqlite_sequence WHERE name IN (
      'inventory_logs','transfer_order_items','transfer_orders',
      'inventory','warehouses','flood_materials',
      'pipe_segments','pump_stations','users'
    );
  `);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, resetAll, close, DB_FILE };
