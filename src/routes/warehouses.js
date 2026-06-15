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
  const warehouses = store.listWarehouses({
    district: req.query.district,
    type: req.query.type,
    keyword: req.query.keyword,
  });
  return sendData(res, 200, warehouses, { total: warehouses.length });
});

router.get('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const warehouse = store.getWarehouseById(id);
    if (!warehouse) return sendError(res, 404, '仓库不存在');
    return sendData(res, 200, warehouse);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.post('/', requireRole('admin', 'operator'), (req, res) => {
  try {
    const data = parseWarehouseBody(req.body, { isCreate: true });
    if (store.getWarehouseByCode(data.code)) {
      return sendError(res, 409, '仓库编号已存在');
    }
    const warehouse = store.createWarehouse(data);
    return sendData(res, 201, warehouse);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.put('/:id', requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getWarehouseById(id)) return sendError(res, 404, '仓库不存在');
    const data = parseWarehouseBody(req.body, { isCreate: false });
    const warehouse = store.updateWarehouse(id, data);
    return sendData(res, 200, warehouse);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getWarehouseById(id)) return sendError(res, 404, '仓库不存在');
    store.deleteWarehouse(id);
    return sendData(res, 200, { id });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

function parseWarehouseBody(body, { isCreate }) {
  const data = {};
  if (isCreate) {
    data.code = requireString(body, 'code', { max: 64 });
    data.name = requireString(body, 'name', { max: 128 });
    data.district = requireString(body, 'district', { max: 64 });
    data.type = parseEnum(body, 'type', store.WAREHOUSE_TYPES, { fallback: 'warehouse' });
  } else {
    if (body.name !== undefined) data.name = requireString(body, 'name', { max: 128 });
    if (body.district !== undefined) data.district = requireString(body, 'district', { max: 64 });
    if (body.type !== undefined) data.type = parseEnum(body, 'type', store.WAREHOUSE_TYPES, { required: true });
  }
  if (isCreate || body.location !== undefined) {
    data.location = optionalString(body, 'location', { max: 255 });
  }
  if (isCreate || body.stationId !== undefined) {
    const n = parseNumber(body, 'stationId', { integer: true, min: 1 });
    data.stationId = n;
  }
  if (isCreate || body.remark !== undefined) {
    data.remark = optionalString(body, 'remark', { max: 500 });
  }
  return data;
}

module.exports = router;
