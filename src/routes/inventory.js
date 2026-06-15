'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const {
  sendData,
  sendError,
  optionalString,
  parseNumber,
  parseId,
  HttpError,
} = require('../utils/http');

const router = express.Router();

router.use(authRequired);

router.get('/', (req, res) => {
  try {
    const { warehouseId, materialId } = req.query;
    let inventory = [];
    if (warehouseId) {
      const wid = parseNumber({ warehouseId }, 'warehouseId', { integer: true, min: 1, required: true });
      if (!store.getWarehouseById(wid)) return sendError(res, 404, '仓库不存在');
      inventory = store.listInventoryByWarehouse(wid);
    } else if (materialId) {
      const mid = parseNumber({ materialId }, 'materialId', { integer: true, min: 1, required: true });
      if (!store.getMaterialById(mid)) return sendError(res, 404, '物资不存在');
      inventory = store.listInventoryByMaterial(mid);
    } else {
      return sendError(res, 400, '请指定 warehouseId 或 materialId');
    }
    return sendData(res, 200, inventory, { total: inventory.length });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.get('/logs', (req, res) => {
  try {
    const params = {};
    if (req.query.warehouseId) {
      params.warehouseId = parseNumber(req.query, 'warehouseId', { integer: true, min: 1, required: true });
    }
    if (req.query.materialId) {
      params.materialId = parseNumber(req.query, 'materialId', { integer: true, min: 1, required: true });
    }
    if (req.query.bizType) {
      params.bizType = req.query.bizType;
    }
    if (req.query.bizId) {
      params.bizId = parseNumber(req.query, 'bizId', { integer: true, min: 1, required: true });
    }
    const logs = store.listInventoryLogs(params);
    return sendData(res, 200, logs, { total: logs.length });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.post('/adjust', requireRole('admin', 'operator'), (req, res) => {
  try {
    const warehouseId = parseNumber(req.body, 'warehouseId', { integer: true, min: 1, required: true });
    const materialId = parseNumber(req.body, 'materialId', { integer: true, min: 1, required: true });
    const changeQuantity = parseNumber(req.body, 'changeQuantity', { integer: true, required: true });
    const remark = optionalString(req.body, 'remark', { max: 500 });

    if (!store.getWarehouseById(warehouseId)) return sendError(res, 404, '仓库不存在');
    if (!store.getMaterialById(materialId)) return sendError(res, 404, '物资不存在');

    const inventory = store.adjustInventory(warehouseId, materialId, changeQuantity, remark);
    return sendData(res, 200, inventory);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    if (err.message && err.message.startsWith('库存不足')) {
      return sendError(res, 400, err.message);
    }
    throw err;
  }
});

module.exports = router;
