'use strict';

const { getDb } = require('../db');
const { hashPassword } = require('../utils/password');

/**
 * 数据仓储层：所有 SQL 都集中在这里，路由层只调用这些方法。
 * 对外返回的对象统一用 camelCase 字段，便于前端消费。
 */

/* ----------------------------- 行 -> API 映射 ----------------------------- */

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPipe(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    district: row.district,
    type: row.type,
    material: row.material,
    diameterMm: row.diameter_mm,
    lengthM: row.length_m,
    status: row.status,
    installedAt: row.installed_at,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStation(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    district: row.district,
    capacityM3h: row.capacity_m3h,
    pumpCount: row.pump_count,
    status: row.status,
    location: row.location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* --------------------------------- 用户 --------------------------------- */

function getUserByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserById(id) {
  return mapUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

/** 内部使用：返回包含 password_hash 的原始行。 */
function getRawUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listUsers() {
  return getDb()
    .prepare('SELECT * FROM users ORDER BY id ASC')
    .all()
    .map(mapUser);
}

function createUser({ username, password, name, role = 'viewer', active = true }) {
  const info = getDb()
    .prepare(
      `INSERT INTO users (username, password_hash, name, role, active)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(username, hashPassword(password), name, role, active ? 1 : 0);
  return getUserById(info.lastInsertRowid);
}

function updateUser(id, fields) {
  const sets = [];
  const params = [];
  if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
  if (fields.role !== undefined) { sets.push('role = ?'); params.push(fields.role); }
  if (fields.active !== undefined) { sets.push('active = ?'); params.push(fields.active ? 1 : 0); }
  if (fields.password !== undefined) { sets.push('password_hash = ?'); params.push(hashPassword(fields.password)); }
  if (sets.length === 0) return getUserById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getUserById(id);
}

function deleteUser(id) {
  return getDb().prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

/* ------------------------------- 排水管段 ------------------------------- */

function listPipes({ district, type, status, keyword } = {}) {
  const where = [];
  const params = [];
  if (district) { where.push('district = ?'); params.push(district); }
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (keyword) {
    where.push('(code LIKE ? OR remark LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM pipe_segments ${clause} ORDER BY id DESC`)
    .all(...params)
    .map(mapPipe);
}

function getPipeById(id) {
  return mapPipe(getDb().prepare('SELECT * FROM pipe_segments WHERE id = ?').get(id));
}

function getPipeByCode(code) {
  return mapPipe(getDb().prepare('SELECT * FROM pipe_segments WHERE code = ?').get(code));
}

function createPipe(data) {
  const info = getDb()
    .prepare(
      `INSERT INTO pipe_segments
        (code, district, type, material, diameter_mm, length_m, status, installed_at, remark)
       VALUES (@code, @district, @type, @material, @diameterMm, @lengthM, @status, @installedAt, @remark)`,
    )
    .run({
      code: data.code,
      district: data.district,
      type: data.type,
      material: data.material,
      diameterMm: data.diameterMm,
      lengthM: data.lengthM,
      status: data.status,
      installedAt: data.installedAt,
      remark: data.remark,
    });
  return getPipeById(info.lastInsertRowid);
}

function updatePipe(id, data) {
  const allowed = {
    district: 'district',
    type: 'type',
    material: 'material',
    diameterMm: 'diameter_mm',
    lengthM: 'length_m',
    status: 'status',
    installedAt: 'installed_at',
    remark: 'remark',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(allowed)) {
    if (data[key] !== undefined) { sets.push(`${col} = ?`); params.push(data[key]); }
  }
  if (sets.length === 0) return getPipeById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE pipe_segments SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getPipeById(id);
}

function deletePipe(id) {
  return getDb().prepare('DELETE FROM pipe_segments WHERE id = ?').run(id).changes > 0;
}

/* -------------------------------- 泵站 -------------------------------- */

function listStations({ district, status, keyword } = {}) {
  const where = [];
  const params = [];
  if (district) { where.push('district = ?'); params.push(district); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (keyword) {
    where.push('(code LIKE ? OR name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM pump_stations ${clause} ORDER BY id DESC`)
    .all(...params)
    .map(mapStation);
}

function getStationById(id) {
  return mapStation(getDb().prepare('SELECT * FROM pump_stations WHERE id = ?').get(id));
}

function getStationByCode(code) {
  return mapStation(getDb().prepare('SELECT * FROM pump_stations WHERE code = ?').get(code));
}

function createStation(data) {
  const info = getDb()
    .prepare(
      `INSERT INTO pump_stations
        (code, name, district, capacity_m3h, pump_count, status, location)
       VALUES (@code, @name, @district, @capacityM3h, @pumpCount, @status, @location)`,
    )
    .run({
      code: data.code,
      name: data.name,
      district: data.district,
      capacityM3h: data.capacityM3h,
      pumpCount: data.pumpCount,
      status: data.status,
      location: data.location,
    });
  return getStationById(info.lastInsertRowid);
}

function updateStation(id, data) {
  const allowed = {
    name: 'name',
    district: 'district',
    capacityM3h: 'capacity_m3h',
    pumpCount: 'pump_count',
    status: 'status',
    location: 'location',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(allowed)) {
    if (data[key] !== undefined) { sets.push(`${col} = ?`); params.push(data[key]); }
  }
  if (sets.length === 0) return getStationById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE pump_stations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getStationById(id);
}

function deleteStation(id) {
  return getDb().prepare('DELETE FROM pump_stations WHERE id = ?').run(id).changes > 0;
}

/* -------------------------------- 计数 -------------------------------- */

/* ------------------------------- 物资目录 ------------------------------- */

function mapMaterial(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    spec: row.spec,
    unit: row.unit,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listMaterials({ keyword } = {}) {
  const where = [];
  const params = [];
  if (keyword) {
    where.push('(name LIKE ? OR spec LIKE ? OR remark LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM flood_materials ${clause} ORDER BY id DESC`)
    .all(...params)
    .map(mapMaterial);
}

function getMaterialById(id) {
  return mapMaterial(getDb().prepare('SELECT * FROM flood_materials WHERE id = ?').get(id));
}

function createMaterial(data) {
  const info = getDb()
    .prepare(
      `INSERT INTO flood_materials (name, spec, unit, remark)
       VALUES (@name, @spec, @unit, @remark)`,
    )
    .run({
      name: data.name,
      spec: data.spec || null,
      unit: data.unit,
      remark: data.remark || null,
    });
  return getMaterialById(info.lastInsertRowid);
}

function updateMaterial(id, data) {
  const allowed = { name: 'name', spec: 'spec', unit: 'unit', remark: 'remark' };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(allowed)) {
    if (data[key] !== undefined) { sets.push(`${col} = ?`); params.push(data[key]); }
  }
  if (sets.length === 0) return getMaterialById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE flood_materials SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getMaterialById(id);
}

function deleteMaterial(id) {
  return getDb().prepare('DELETE FROM flood_materials WHERE id = ?').run(id).changes > 0;
}

/* --------------------------------- 仓库 --------------------------------- */

function mapWarehouse(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    district: row.district,
    location: row.location,
    stationId: row.station_id,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const WAREHOUSE_TYPES = ['warehouse', 'station'];

function listWarehouses({ district, type, keyword } = {}) {
  const where = [];
  const params = [];
  if (district) { where.push('district = ?'); params.push(district); }
  if (type) { where.push('type = ?'); params.push(type); }
  if (keyword) {
    where.push('(code LIKE ? OR name LIKE ? OR location LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM warehouses ${clause} ORDER BY id DESC`)
    .all(...params)
    .map(mapWarehouse);
}

function getWarehouseById(id) {
  return mapWarehouse(getDb().prepare('SELECT * FROM warehouses WHERE id = ?').get(id));
}

function getWarehouseByCode(code) {
  return mapWarehouse(getDb().prepare('SELECT * FROM warehouses WHERE code = ?').get(code));
}

function createWarehouse(data) {
  const info = getDb()
    .prepare(
      `INSERT INTO warehouses (code, name, type, district, location, station_id, remark)
       VALUES (@code, @name, @type, @district, @location, @stationId, @remark)`,
    )
    .run({
      code: data.code,
      name: data.name,
      type: data.type || 'warehouse',
      district: data.district,
      location: data.location || null,
      stationId: data.stationId || null,
      remark: data.remark || null,
    });
  return getWarehouseById(info.lastInsertRowid);
}

function updateWarehouse(id, data) {
  const allowed = {
    name: 'name',
    type: 'type',
    district: 'district',
    location: 'location',
    stationId: 'station_id',
    remark: 'remark',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(allowed)) {
    if (data[key] !== undefined) { sets.push(`${col} = ?`); params.push(data[key]); }
  }
  if (sets.length === 0) return getWarehouseById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE warehouses SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getWarehouseById(id);
}

function deleteWarehouse(id) {
  return getDb().prepare('DELETE FROM warehouses WHERE id = ?').run(id).changes > 0;
}

/* --------------------------------- 库存 --------------------------------- */

function mapInventory(row) {
  if (!row) return null;
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    materialId: row.material_id,
    quantity: row.quantity,
    updatedAt: row.updated_at,
  };
}

function getInventory(warehouseId, materialId) {
  return mapInventory(
    getDb()
      .prepare('SELECT * FROM inventory WHERE warehouse_id = ? AND material_id = ?')
      .get(warehouseId, materialId),
  );
}

function listInventoryByWarehouse(warehouseId) {
  return getDb()
    .prepare('SELECT * FROM inventory WHERE warehouse_id = ? ORDER BY id DESC')
    .all(warehouseId)
    .map(mapInventory);
}

function listInventoryByMaterial(materialId) {
  return getDb()
    .prepare('SELECT * FROM inventory WHERE material_id = ? ORDER BY id DESC')
    .all(materialId)
    .map(mapInventory);
}

/** 设置库存数量（若不存在则插入），返回当前库存记录。内部方法，不记流水。 */
function _setInventoryQuantity(warehouseId, materialId, quantity) {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM inventory WHERE warehouse_id = ? AND material_id = ?')
    .get(warehouseId, materialId);
  if (existing) {
    db.prepare(
      `UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(quantity, existing.id);
  } else {
    db.prepare(
      `INSERT INTO inventory (warehouse_id, material_id, quantity) VALUES (?, ?, ?)`,
    ).run(warehouseId, materialId, quantity);
  }
  return getInventory(warehouseId, materialId);
}

/* ------------------------------- 库存流水 ------------------------------- */

function mapInventoryLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    materialId: row.material_id,
    changeQuantity: row.change_quantity,
    balanceQuantity: row.balance_quantity,
    bizType: row.biz_type,
    bizId: row.biz_id,
    remark: row.remark,
    createdAt: row.created_at,
  };
}

function listInventoryLogs({ warehouseId, materialId, bizType, bizId } = {}) {
  const where = [];
  const params = [];
  if (warehouseId) { where.push('warehouse_id = ?'); params.push(warehouseId); }
  if (materialId) { where.push('material_id = ?'); params.push(materialId); }
  if (bizType) { where.push('biz_type = ?'); params.push(bizType); }
  if (bizId !== undefined && bizId !== null) { where.push('biz_id = ?'); params.push(bizId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM inventory_logs ${clause} ORDER BY id DESC`)
    .all(...params)
    .map(mapInventoryLog);
}

/** 写入一条库存流水。内部方法。 */
function _addInventoryLog(warehouseId, materialId, changeQuantity, balanceQuantity, bizType, bizId, remark) {
  getDb()
    .prepare(
      `INSERT INTO inventory_logs
        (warehouse_id, material_id, change_quantity, balance_quantity, biz_type, biz_id, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(warehouseId, materialId, changeQuantity, balanceQuantity, bizType, bizId, remark || null);
}

/**
 * 手动调整库存（盘点/初始化），走事务，写流水。
 * @returns 新的库存记录
 */
function adjustInventory(warehouseId, materialId, changeQuantity, remark) {
  const db = getDb();
  const result = db.transaction(() => {
    const newQty = _adjustInventory(
      warehouseId,
      materialId,
      changeQuantity,
      'manual',
      null,
      remark || '手动调整',
    );
    return getInventory(warehouseId, materialId);
  })();
  return result;
}

/**
 * 调整库存数量（增加或减少），同时写流水。
 * 内部方法，调用方需保证在事务中。
 * @returns 新的库存数量
 */
function _adjustInventory(warehouseId, materialId, changeQuantity, bizType, bizId, remark) {
  const current = getInventory(warehouseId, materialId);
  const currentQty = current ? current.quantity : 0;
  const newQty = currentQty + changeQuantity;
  if (newQty < 0) {
    throw new Error(`库存不足：仓库 ${warehouseId} 物资 ${materialId} 当前 ${currentQty}，需变动 ${changeQuantity}`);
  }
  _setInventoryQuantity(warehouseId, materialId, newQty);
  _addInventoryLog(warehouseId, materialId, changeQuantity, newQty, bizType, bizId, remark);
  return newQty;
}

/* -------------------------------- 调拨单 -------------------------------- */

const TRANSFER_STATUS = ['draft', 'outbound', 'received']; // 草稿 / 已出库 / 已签收

function mapTransferOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    sourceWarehouseId: row.source_warehouse_id,
    targetWarehouseId: row.target_warehouse_id,
    remark: row.remark,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    outboundAt: row.outbound_at,
    receivedAt: row.received_at,
  };
}

function mapTransferItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    materialId: row.material_id,
    quantity: row.quantity,
  };
}

function listTransferOrders({ status, sourceWarehouseId, targetWarehouseId, keyword } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (sourceWarehouseId) { where.push('source_warehouse_id = ?'); params.push(sourceWarehouseId); }
  if (targetWarehouseId) { where.push('target_warehouse_id = ?'); params.push(targetWarehouseId); }
  if (keyword) {
    where.push('order_no LIKE ?');
    params.push(`%${keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM transfer_orders ${clause} ORDER BY id DESC`)
    .all(...params)
    .map(mapTransferOrder);
}

function getTransferOrderById(id) {
  return mapTransferOrder(getDb().prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id));
}

function getTransferOrderByNo(orderNo) {
  return mapTransferOrder(getDb().prepare('SELECT * FROM transfer_orders WHERE order_no = ?').get(orderNo));
}

function getTransferItems(orderId) {
  return getDb()
    .prepare('SELECT * FROM transfer_order_items WHERE order_id = ? ORDER BY id ASC')
    .all(orderId)
    .map(mapTransferItem);
}

/** 获取带明细的调拨单详情。 */
function getTransferOrderDetail(id) {
  const order = getTransferOrderById(id);
  if (!order) return null;
  const items = getTransferItems(id);
  return { ...order, items };
}

/** 创建草稿调拨单。items: [{ materialId, quantity }] */
function createTransferOrder({ orderNo, sourceWarehouseId, targetWarehouseId, remark, createdBy, items }) {
  const db = getDb();
  const createTx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO transfer_orders
          (order_no, status, source_warehouse_id, target_warehouse_id, remark, created_by)
         VALUES (?, 'draft', ?, ?, ?, ?)`,
      )
      .run(orderNo, sourceWarehouseId, targetWarehouseId, remark || null, createdBy || null);
    const orderId = info.lastInsertRowid;
    for (const item of items) {
      db.prepare(
        `INSERT INTO transfer_order_items (order_id, material_id, quantity) VALUES (?, ?, ?)`,
      ).run(orderId, item.materialId, item.quantity);
    }
    return orderId;
  });
  const orderId = createTx();
  return getTransferOrderDetail(orderId);
}

/** 更新草稿调拨单（基本信息 + 明细）。 */
function updateTransferOrder(id, { sourceWarehouseId, targetWarehouseId, remark, items }) {
  const db = getDb();
  const updateTx = db.transaction(() => {
    const sets = [];
    const params = [];
    if (sourceWarehouseId !== undefined) { sets.push('source_warehouse_id = ?'); params.push(sourceWarehouseId); }
    if (targetWarehouseId !== undefined) { sets.push('target_warehouse_id = ?'); params.push(targetWarehouseId); }
    if (remark !== undefined) { sets.push('remark = ?'); params.push(remark); }
    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      params.push(id);
      db.prepare(`UPDATE transfer_orders SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }
    if (items) {
      db.prepare('DELETE FROM transfer_order_items WHERE order_id = ?').run(id);
      for (const item of items) {
        db.prepare(
          `INSERT INTO transfer_order_items (order_id, material_id, quantity) VALUES (?, ?, ?)`,
        ).run(id, item.materialId, item.quantity);
      }
    }
  });
  updateTx();
  return getTransferOrderDetail(id);
}

/**
 * 出库：将调拨单状态从 draft 改为 outbound，扣减来源仓库库存，增加目标仓库库存。
 * 原子性：任何一种物资库存不足则整张单子拒绝。
 */
function outboundTransferOrder(id) {
  const db = getDb();
  const order = getTransferOrderById(id);
  if (!order) throw new Error('调拨单不存在');
  if (order.status !== 'draft') throw new Error('仅草稿状态的调拨单可出库');

  const items = getTransferItems(id);
  if (items.length === 0) throw new Error('调拨单没有明细物资');

  const outboundTx = db.transaction(() => {
    for (const item of items) {
      const inv = getInventory(order.sourceWarehouseId, item.materialId);
      const currentQty = inv ? inv.quantity : 0;
      if (currentQty < item.quantity) {
        const mat = getMaterialById(item.materialId);
        const matName = mat ? mat.name : `物资#${item.materialId}`;
        throw new Error(`物资「${matName}」库存不足，当前 ${currentQty}，需调出 ${item.quantity}`);
      }
    }
    for (const item of items) {
      _adjustInventory(
        order.sourceWarehouseId,
        item.materialId,
        -item.quantity,
        'transfer_out',
        id,
        `调拨出库: ${order.orderNo}`,
      );
      _adjustInventory(
        order.targetWarehouseId,
        item.materialId,
        item.quantity,
        'transfer_in',
        id,
        `调拨入库: ${order.orderNo}`,
      );
    }
    db.prepare(
      `UPDATE transfer_orders SET status = 'outbound', outbound_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).run(id);
  });

  try {
    outboundTx();
  } catch (err) {
    throw new Error(`出库失败：${err.message}`);
  }
  return getTransferOrderDetail(id);
}

/** 签收：将调拨单状态从 outbound 改为 received。 */
function receiveTransferOrder(id) {
  const order = getTransferOrderById(id);
  if (!order) throw new Error('调拨单不存在');
  if (order.status !== 'outbound') throw new Error('仅已出库状态的调拨单可签收');

  getDb().prepare(
    `UPDATE transfer_orders SET status = 'received', received_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
  ).run(id);
  return getTransferOrderDetail(id);
}

/** 删除调拨单（仅草稿状态可删）。 */
function deleteTransferOrder(id) {
  const order = getTransferOrderById(id);
  if (!order) return false;
  if (order.status !== 'draft') throw new Error('仅草稿状态的调拨单可删除');
  return getDb().prepare('DELETE FROM transfer_orders WHERE id = ?').run(id).changes > 0;
}

/* -------------------------------- 计数 -------------------------------- */

function countUsers() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

module.exports = {
  mapUser,
  getUserByUsername,
  getUserById,
  getRawUserById,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  countUsers,
  listPipes,
  getPipeById,
  getPipeByCode,
  createPipe,
  updatePipe,
  deletePipe,
  listStations,
  getStationById,
  getStationByCode,
  createStation,
  updateStation,
  deleteStation,
  // 物资目录
  mapMaterial,
  listMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  // 仓库
  WAREHOUSE_TYPES,
  mapWarehouse,
  listWarehouses,
  getWarehouseById,
  getWarehouseByCode,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  // 库存
  mapInventory,
  getInventory,
  listInventoryByWarehouse,
  listInventoryByMaterial,
  adjustInventory,
  // 库存流水
  mapInventoryLog,
  listInventoryLogs,
  // 调拨单
  TRANSFER_STATUS,
  listTransferOrders,
  getTransferOrderById,
  getTransferOrderByNo,
  getTransferOrderDetail,
  createTransferOrder,
  updateTransferOrder,
  outboundTransferOrder,
  receiveTransferOrder,
  deleteTransferOrder,
};
