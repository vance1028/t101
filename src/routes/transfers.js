'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const {
  sendData,
  sendError,
  requireString,
  optionalString,
  parseNumber,
  parseEnum,
  parseId,
  HttpError,
} = require('../utils/http');

const router = express.Router();

router.use(authRequired);

router.get('/', (req, res) => {
  try {
    const params = {};
    if (req.query.status) {
      params.status = parseEnum(req.query, 'status', store.TRANSFER_STATUS, { required: true });
    }
    if (req.query.sourceWarehouseId) {
      params.sourceWarehouseId = parseNumber(req.query, 'sourceWarehouseId', { integer: true, min: 1, required: true });
    }
    if (req.query.targetWarehouseId) {
      params.targetWarehouseId = parseNumber(req.query, 'targetWarehouseId', { integer: true, min: 1, required: true });
    }
    if (req.query.keyword) params.keyword = req.query.keyword;
    const orders = store.listTransferOrders(params);
    return sendData(res, 200, orders, { total: orders.length });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const order = store.getTransferOrderDetail(id);
    if (!order) return sendError(res, 404, '调拨单不存在');
    return sendData(res, 200, order);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.post('/', requireRole('admin', 'operator'), (req, res) => {
  try {
    const data = parseTransferBody(req.body, { isCreate: true });
    if (store.getTransferOrderByNo(data.orderNo)) {
      return sendError(res, 409, '调拨单号已存在');
    }
    if (!store.getWarehouseById(data.sourceWarehouseId)) {
      return sendError(res, 400, '来源仓库不存在');
    }
    if (!store.getWarehouseById(data.targetWarehouseId)) {
      return sendError(res, 400, '目标仓库不存在');
    }
    if (data.sourceWarehouseId === data.targetWarehouseId) {
      return sendError(res, 400, '来源仓库和目标仓库不能相同');
    }
    if (!data.items || data.items.length === 0) {
      return sendError(res, 400, '调拨单至少需要一条物资明细');
    }
    for (const item of data.items) {
      if (!store.getMaterialById(item.materialId)) {
        return sendError(res, 400, `物资 ID ${item.materialId} 不存在`);
      }
    }
    const order = store.createTransferOrder({
      ...data,
      createdBy: req.user.id,
    });
    return sendData(res, 201, order);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.put('/:id', requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    const order = store.getTransferOrderById(id);
    if (!order) return sendError(res, 404, '调拨单不存在');
    if (order.status !== 'draft') {
      return sendError(res, 400, '仅草稿状态的调拨单可编辑');
    }
    const data = parseTransferBody(req.body, { isCreate: false });
    if (data.sourceWarehouseId !== undefined && !store.getWarehouseById(data.sourceWarehouseId)) {
      return sendError(res, 400, '来源仓库不存在');
    }
    if (data.targetWarehouseId !== undefined && !store.getWarehouseById(data.targetWarehouseId)) {
      return sendError(res, 400, '目标仓库不存在');
    }
    const sourceId = data.sourceWarehouseId !== undefined ? data.sourceWarehouseId : order.sourceWarehouseId;
    const targetId = data.targetWarehouseId !== undefined ? data.targetWarehouseId : order.targetWarehouseId;
    if (sourceId === targetId) {
      return sendError(res, 400, '来源仓库和目标仓库不能相同');
    }
    if (data.items) {
      if (data.items.length === 0) {
        return sendError(res, 400, '调拨单至少需要一条物资明细');
      }
      for (const item of data.items) {
        if (!store.getMaterialById(item.materialId)) {
          return sendError(res, 400, `物资 ID ${item.materialId} 不存在`);
        }
      }
    }
    const updated = store.updateTransferOrder(id, data);
    return sendData(res, 200, updated);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.post('/:id/outbound', requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    const order = store.getTransferOrderById(id);
    if (!order) return sendError(res, 404, '调拨单不存在');
    const result = store.outboundTransferOrder(id);
    return sendData(res, 200, result);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    if (err.message && err.message.startsWith('出库失败')) {
      return sendError(res, 400, err.message);
    }
    if (err.message && err.message.includes('库存不足')) {
      return sendError(res, 400, err.message);
    }
    if (err.message && err.message.includes('仅草稿状态')) {
      return sendError(res, 400, err.message);
    }
    throw err;
  }
});

router.post('/:id/receive', requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    const order = store.getTransferOrderById(id);
    if (!order) return sendError(res, 404, '调拨单不存在');
    const result = store.receiveTransferOrder(id);
    return sendData(res, 200, result);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    if (err.message && err.message.includes('仅已出库状态')) {
      return sendError(res, 400, err.message);
    }
    throw err;
  }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    const order = store.getTransferOrderById(id);
    if (!order) return sendError(res, 404, '调拨单不存在');
    store.deleteTransferOrder(id);
    return sendData(res, 200, { id });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    if (err.message && err.message.includes('仅草稿状态')) {
      return sendError(res, 400, err.message);
    }
    throw err;
  }
});

function parseTransferBody(body, { isCreate }) {
  const data = {};
  if (isCreate) {
    data.orderNo = requireString(body, 'orderNo', { max: 64 });
    data.sourceWarehouseId = parseNumber(body, 'sourceWarehouseId', { integer: true, min: 1, required: true });
    data.targetWarehouseId = parseNumber(body, 'targetWarehouseId', { integer: true, min: 1, required: true });
    data.items = parseItems(body.items);
    data.remark = optionalString(body, 'remark', { max: 500 });
  } else {
    if (body.sourceWarehouseId !== undefined) {
      data.sourceWarehouseId = parseNumber(body, 'sourceWarehouseId', { integer: true, min: 1, required: true });
    }
    if (body.targetWarehouseId !== undefined) {
      data.targetWarehouseId = parseNumber(body, 'targetWarehouseId', { integer: true, min: 1, required: true });
    }
    if (body.items !== undefined) {
      data.items = parseItems(body.items);
    }
    if (body.remark !== undefined) {
      data.remark = optionalString(body, 'remark', { max: 500 });
    }
  }
  return data;
}

function parseItems(items) {
  if (!Array.isArray(items)) {
    throw new HttpError(400, 'items 必须是数组');
  }
  const result = [];
  const materialIds = new Set();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') {
      throw new HttpError(400, `第 ${i + 1} 条明细格式错误`);
    }
    const materialId = parseNumber(item, 'materialId', { integer: true, min: 1, required: true });
    const quantity = parseNumber(item, 'quantity', { integer: true, min: 1, required: true });
    if (materialIds.has(materialId)) {
      throw new HttpError(400, `物资 ID ${materialId} 在明细中重复`);
    }
    materialIds.add(materialId);
    result.push({ materialId, quantity });
  }
  return result;
}

module.exports = router;
