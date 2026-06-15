'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const {
  sendData,
  sendError,
  requireString,
  optionalString,
  parseId,
  HttpError,
} = require('../utils/http');

const router = express.Router();

router.use(authRequired);

router.get('/', (req, res) => {
  const materials = store.listMaterials({
    keyword: req.query.keyword,
  });
  return sendData(res, 200, materials, { total: materials.length });
});

router.get('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const material = store.getMaterialById(id);
    if (!material) return sendError(res, 404, '物资不存在');
    return sendData(res, 200, material);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.post('/', requireRole('admin', 'operator'), (req, res) => {
  try {
    const data = parseMaterialBody(req.body, { isCreate: true });
    const material = store.createMaterial(data);
    return sendData(res, 201, material);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.put('/:id', requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getMaterialById(id)) return sendError(res, 404, '物资不存在');
    const data = parseMaterialBody(req.body, { isCreate: false });
    const material = store.updateMaterial(id, data);
    return sendData(res, 200, material);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getMaterialById(id)) return sendError(res, 404, '物资不存在');
    store.deleteMaterial(id);
    return sendData(res, 200, { id });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

function parseMaterialBody(body, { isCreate }) {
  const data = {};
  if (isCreate) {
    data.name = requireString(body, 'name', { max: 128 });
    data.unit = requireString(body, 'unit', { max: 32 });
    data.spec = optionalString(body, 'spec', { max: 255 });
    data.remark = optionalString(body, 'remark', { max: 500 });
  } else {
    if (body.name !== undefined) data.name = requireString(body, 'name', { max: 128 });
    if (body.unit !== undefined) data.unit = requireString(body, 'unit', { max: 32 });
    if (body.spec !== undefined) data.spec = optionalString(body, 'spec', { max: 255 });
    if (body.remark !== undefined) data.remark = optionalString(body, 'remark', { max: 500 });
  }
  return data;
}

module.exports = router;
