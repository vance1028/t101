'use strict';

// 用内存库跑测试：必须在 require 任何会加载 db.js 的模块之前设置。
process.env.DB_FILE = ':memory:';
process.env.SEED_ON_START = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { getDb, resetAll } = require('../src/db');
const { seed } = require('../src/seed');

getDb();
const app = createApp();

/** 登录并返回 token。 */
async function login(username, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  assert.equal(res.status, 200, `登录应成功: ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

test.beforeEach(() => {
  resetAll();
  seed({ force: true });
});

test('健康检查返回 ok 且服务名为中文', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, '城市排水管网防汛运维管理平台');
});

test('正确的用户名密码可以登录并拿到 token 与用户信息', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token, '应返回 token');
  assert.equal(res.body.data.user.username, 'admin');
  assert.equal(res.body.data.user.role, 'admin');
  assert.equal(res.body.data.user.name, '系统管理员');
});

test('错误密码登录返回 401', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.message, '用户名或密码错误');
});

test('缺少用户名返回 400', async () => {
  const res = await request(app).post('/api/auth/login').send({ password: 'x' });
  assert.equal(res.status, 400);
});

test('未携带 token 访问受保护接口返回 401', async () => {
  const res = await request(app).get('/api/pipes');
  assert.equal(res.status, 401);
});

test('GET /api/auth/me 返回当前用户', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.username, 'operator');
  assert.equal(res.body.data.name, '运维员·张工');
});

test('种子数据：管段与泵站列表非空', async () => {
  const token = await login('viewer', 'viewer123');
  const pipes = await request(app).get('/api/pipes').set('Authorization', `Bearer ${token}`);
  assert.equal(pipes.status, 200);
  assert.equal(pipes.body.total, 3);

  const stations = await request(app).get('/api/stations').set('Authorization', `Bearer ${token}`);
  assert.equal(stations.status, 200);
  assert.equal(stations.body.total, 2);
});

test('operator 可以新建管段，中文字段正确存取', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .post('/api/pipes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: 'YS-NEW-100',
      district: '江北新区',
      type: 'rain',
      material: '钢筋混凝土',
      diameterMm: 1500,
      lengthM: 88.8,
      remark: '新建主干管，迎峰度汛重点',
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.code, 'YS-NEW-100');
  assert.equal(res.body.data.district, '江北新区');
  assert.equal(res.body.data.material, '钢筋混凝土');
  assert.equal(res.body.data.status, 'normal');
  assert.equal(res.body.data.diameterMm, 1500);
  assert.equal(res.body.data.remark, '新建主干管，迎峰度汛重点');
});

test('重复管段编号返回 409', async () => {
  const token = await login('admin', 'admin123');
  const res = await request(app)
    .post('/api/pipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'YS-DX-001', district: '东湖区', type: 'rain' });
  assert.equal(res.status, 409);
});

test('非法 type 返回 400', async () => {
  const token = await login('admin', 'admin123');
  const res = await request(app)
    .post('/api/pipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'X-1', district: '东湖区', type: '雨水' });
  assert.equal(res.status, 400);
});

test('管段过滤：按 status=warning 只返回预警管段', async () => {
  const token = await login('viewer', 'viewer123');
  const res = await request(app)
    .get('/api/pipes?status=warning')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].code, 'WS-XH-014');
});

test('管段关键字过滤 keyword 命中 remark', async () => {
  const token = await login('viewer', 'viewer123');
  const res = await request(app)
    .get('/api/pipes?keyword=清淤')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].code, 'HL-NG-027');
});

test('更新管段状态', async () => {
  const token = await login('operator', 'operator123');
  const list = await request(app).get('/api/pipes?status=warning').set('Authorization', `Bearer ${token}`);
  const id = list.body.data[0].id;
  const res = await request(app)
    .put(`/api/pipes/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'normal', remark: '已修复' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'normal');
  assert.equal(res.body.data.remark, '已修复');
});

test('viewer 无权新建管段，返回 403', async () => {
  const token = await login('viewer', 'viewer123');
  const res = await request(app)
    .post('/api/pipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'V-1', district: '东湖区', type: 'rain' });
  assert.equal(res.status, 403);
});

test('viewer 无权删除管段（需要 admin），返回 403', async () => {
  const token = await login('operator', 'operator123');
  const list = await request(app).get('/api/pipes').set('Authorization', `Bearer ${token}`);
  const id = list.body.data[0].id;
  const res = await request(app)
    .delete(`/api/pipes/${id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
});

test('admin 可以删除管段', async () => {
  const token = await login('admin', 'admin123');
  const list = await request(app).get('/api/pipes').set('Authorization', `Bearer ${token}`);
  const id = list.body.data[0].id;
  const del = await request(app).delete(`/api/pipes/${id}`).set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200);
  const after = await request(app).get(`/api/pipes/${id}`).set('Authorization', `Bearer ${token}`);
  assert.equal(after.status, 404);
});

test('泵站 CRUD：新建并查询', async () => {
  const token = await login('operator', 'operator123');
  const create = await request(app)
    .post('/api/stations')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'PZ-100', name: '高新区排涝泵站', district: '高新区', capacityM3h: 4000, pumpCount: 3, status: 'running' });
  assert.equal(create.status, 201);
  assert.equal(create.body.data.name, '高新区排涝泵站');
  assert.equal(create.body.data.pumpCount, 3);

  const get = await request(app)
    .get(`/api/stations/${create.body.data.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(get.status, 200);
  assert.equal(get.body.data.code, 'PZ-100');
});

test('用户管理：admin 新建用户后可用其登录；普通用户访问用户管理被拒', async () => {
  const adminToken = await login('admin', 'admin123');

  const create = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'wanggong', password: 'pass1234', name: '王工', role: 'operator' });
  assert.equal(create.status, 201);
  assert.equal(create.body.data.username, 'wanggong');

  const newLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'wanggong', password: 'pass1234' });
  assert.equal(newLogin.status, 200);

  // operator 无权访问用户管理
  const forbidden = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${newLogin.body.data.token}`);
  assert.equal(forbidden.status, 403);
});

test('admin 不能删除自己', async () => {
  const token = await login('admin', 'admin123');
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  const res = await request(app)
    .delete(`/api/users/${me.body.data.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 400);
});

test('禁用账号无法登录', async () => {
  const adminToken = await login('admin', 'admin123');
  // 找到 viewer 用户
  const users = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
  const viewer = users.body.data.find((u) => u.username === 'viewer');
  // 禁用
  await request(app)
    .put(`/api/users/${viewer.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ active: false });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'viewer', password: 'viewer123' });
  assert.equal(res.status, 403);
});

test('不存在的接口返回 404', async () => {
  const res = await request(app).get('/api/not-exist');
  assert.equal(res.status, 404);
});

/* ================================ 防汛物资 ================================ */

test('种子数据：物资目录、仓库、库存非空', async () => {
  const token = await login('viewer', 'viewer123');

  const materials = await request(app).get('/api/materials').set('Authorization', `Bearer ${token}`);
  assert.equal(materials.status, 200);
  assert.ok(materials.body.total >= 8, '至少 8 种防汛物资');

  const warehouses = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${token}`);
  assert.equal(warehouses.status, 200);
  assert.ok(warehouses.body.total >= 5, '至少 5 个库存点');

  const whList = warehouses.body.data;
  const centerWh = whList.find((w) => w.code === 'WH-DH-01');
  assert.ok(centerWh, '应找到东湖中心仓库');

  const inv = await request(app)
    .get(`/api/inventory?warehouseId=${centerWh.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(inv.status, 200);
  assert.ok(inv.body.total >= 8, '中心仓库至少有 8 种物资库存');
});

test('物资 CRUD：operator 可新建物资', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .post('/api/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '防汛挡板', spec: '2m 铝合金', unit: '块', remark: '易拆装式防汛挡水板' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.name, '防汛挡板');
  assert.equal(res.body.data.unit, '块');
});

test('仓库 CRUD：operator 可新建仓库', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'WH-JB-01', name: '江北物资储备库', type: 'warehouse', district: '江北区', location: '江北大道 100 号' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.code, 'WH-JB-01');
  assert.equal(res.body.data.type, 'warehouse');
});

test('库存调整：operator 可调整库存并产生流水', async () => {
  const token = await login('operator', 'operator123');

  const materials = await request(app).get('/api/materials').set('Authorization', `Bearer ${token}`);
  const mat = materials.body.data[0];

  const warehouses = await request(app).get('/api/warehouses?type=warehouse').set('Authorization', `Bearer ${token}`);
  const wh = warehouses.body.data[0];

  const before = await request(app)
    .get(`/api/inventory?warehouseId=${wh.id}&materialId=${mat.id}`)
    .set('Authorization', `Bearer ${token}`);

  const adjust = await request(app)
    .post('/api/inventory/adjust')
    .set('Authorization', `Bearer ${token}`)
    .send({ warehouseId: wh.id, materialId: mat.id, changeQuantity: 100, remark: '测试盘点' });
  assert.equal(adjust.status, 200);

  const logs = await request(app)
    .get(`/api/inventory/logs?warehouseId=${wh.id}&materialId=${mat.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(logs.status, 200);
  assert.ok(logs.body.total >= 1, '应有至少一条流水');
  const latest = logs.body.data[0];
  assert.equal(latest.bizType, 'manual');
  assert.equal(latest.changeQuantity, 100);
});

test('调拨单：创建草稿 -> 出库 -> 签收 完整流程', async () => {
  const token = await login('admin', 'admin123');

  const warehouses = await request(app).get('/api/warehouses?type=warehouse').set('Authorization', `Bearer ${token}`);
  const sourceWh = warehouses.body.data.find((w) => w.code === 'WH-DH-01');
  const targetWh = warehouses.body.data.find((w) => w.code === 'WH-NG-01');

  const materials = await request(app).get('/api/materials').set('Authorization', `Bearer ${token}`);
  const sandBag = materials.body.data.find((m) => m.name === '编织沙袋');
  const pump = materials.body.data.find((m) => m.name === '移动抽水泵');

  const invBefore = await request(app)
    .get(`/api/inventory?warehouseId=${sourceWh.id}`)
    .set('Authorization', `Bearer ${token}`);
  const sourceBefore = {};
  for (const item of invBefore.body.data) {
    sourceBefore[item.materialId] = item.quantity;
  }

  const create = await request(app)
    .post('/api/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      orderNo: 'DB-2026-001',
      sourceWarehouseId: sourceWh.id,
      targetWarehouseId: targetWh.id,
      remark: '汛期前物资调度',
      items: [
        { materialId: sandBag.id, quantity: 500 },
        { materialId: pump.id, quantity: 2 },
      ],
    });
  assert.equal(create.status, 201);
  assert.equal(create.body.data.status, 'draft');
  assert.equal(create.body.data.items.length, 2);

  const orderId = create.body.data.id;

  const outbound = await request(app)
    .post(`/api/transfers/${orderId}/outbound`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(outbound.status, 200);
  assert.equal(outbound.body.data.status, 'outbound');
  assert.ok(outbound.body.data.outboundAt, '应有出库时间');

  const sourceAfter = await request(app)
    .get(`/api/inventory?warehouseId=${sourceWh.id}`)
    .set('Authorization', `Bearer ${token}`);
  const sourceQtyMap = {};
  for (const item of sourceAfter.body.data) {
    sourceQtyMap[item.materialId] = item.quantity;
  }
  assert.equal(sourceQtyMap[sandBag.id], sourceBefore[sandBag.id] - 500, '来源仓库沙袋应减少 500');
  assert.equal(sourceQtyMap[pump.id], sourceBefore[pump.id] - 2, '来源仓库水泵应减少 2 台');

  const targetAfter = await request(app)
    .get(`/api/inventory?warehouseId=${targetWh.id}`)
    .set('Authorization', `Bearer ${token}`);
  const targetQtyMap = {};
  for (const item of targetAfter.body.data) {
    targetQtyMap[item.materialId] = item.quantity;
  }
  assert.ok(targetQtyMap[sandBag.id] >= 500, '目标仓库沙袋应至少增加 500');
  assert.ok(targetQtyMap[pump.id] >= 2, '目标仓库水泵应至少增加 2 台');

  const receive = await request(app)
    .post(`/api/transfers/${orderId}/receive`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(receive.status, 200);
  assert.equal(receive.body.data.status, 'received');
  assert.ok(receive.body.data.receivedAt, '应有签收时间');

  const logs = await request(app)
    .get(`/api/inventory/logs?bizType=transfer_out`)
    .set('Authorization', `Bearer ${token}`);
  assert.ok(logs.body.total >= 2, '应有出库流水');
});

test('调拨单原子性：任一种物资库存不足则整张单子拒绝，库存不变', async () => {
  const token = await login('admin', 'admin123');

  const warehouses = await request(app).get('/api/warehouses?type=warehouse').set('Authorization', `Bearer ${token}`);
  const sourceWh = warehouses.body.data.find((w) => w.code === 'WH-DH-01');
  const targetWh = warehouses.body.data.find((w) => w.code === 'WH-NG-01');

  const materials = await request(app).get('/api/materials').set('Authorization', `Bearer ${token}`);
  const sandBag = materials.body.data.find((m) => m.name === '编织沙袋');
  const generator = materials.body.data.find((m) => m.name === '柴油发电机');

  const invBefore = await request(app)
    .get(`/api/inventory?warehouseId=${sourceWh.id}`)
    .set('Authorization', `Bearer ${token}`);
  const sourceBefore = {};
  for (const item of invBefore.body.data) {
    sourceBefore[item.materialId] = item.quantity;
  }

  const genQty = sourceBefore[generator.id] || 0;

  const create = await request(app)
    .post('/api/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      orderNo: 'DB-ATOMIC-001',
      sourceWarehouseId: sourceWh.id,
      targetWarehouseId: targetWh.id,
      remark: '原子性测试',
      items: [
        { materialId: sandBag.id, quantity: 10 },
        { materialId: generator.id, quantity: genQty + 100 },
      ],
    });
  assert.equal(create.status, 201);
  const orderId = create.body.data.id;

  const outbound = await request(app)
    .post(`/api/transfers/${orderId}/outbound`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(outbound.status, 400, '库存不足应返回 400');
  assert.ok(outbound.body.error.message.includes('库存不足'), '错误信息应包含库存不足');

  const order = await request(app)
    .get(`/api/transfers/${orderId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(order.body.data.status, 'draft', '出库失败后状态仍应为草稿');

  const invAfter = await request(app)
    .get(`/api/inventory?warehouseId=${sourceWh.id}`)
    .set('Authorization', `Bearer ${token}`);
  const sourceAfter = {};
  for (const item of invAfter.body.data) {
    sourceAfter[item.materialId] = item.quantity;
  }
  assert.deepEqual(sourceBefore, sourceAfter, '出库失败，来源仓库库存应保持不变');
});

test('调拨单状态流转约束：已出库的单子不能编辑或删除', async () => {
  const token = await login('admin', 'admin123');

  const warehouses = await request(app).get('/api/warehouses?type=warehouse').set('Authorization', `Bearer ${token}`);
  const sourceWh = warehouses.body.data.find((w) => w.code === 'WH-DH-01');
  const targetWh = warehouses.body.data.find((w) => w.code === 'WH-NG-01');

  const materials = await request(app).get('/api/materials').set('Authorization', `Bearer ${token}`);
  const mat = materials.body.data.find((m) => m.name === '编织沙袋');

  const create = await request(app)
    .post('/api/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      orderNo: 'DB-STATUS-001',
      sourceWarehouseId: sourceWh.id,
      targetWarehouseId: targetWh.id,
      items: [{ materialId: mat.id, quantity: 1 }],
    });
  const orderId = create.body.data.id;

  await request(app).post(`/api/transfers/${orderId}/outbound`).set('Authorization', `Bearer ${token}`);

  const update = await request(app)
    .put(`/api/transfers/${orderId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ remark: '试试修改' });
  assert.equal(update.status, 400, '已出库的单子不能编辑');

  const del = await request(app)
    .delete(`/api/transfers/${orderId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 400, '已出库的单子不能删除');

  const receive = await request(app)
    .post(`/api/transfers/${orderId}/receive`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(receive.status, 200, '已出库的单子可以签收');

  const receiveAgain = await request(app)
    .post(`/api/transfers/${orderId}/receive`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(receiveAgain.status, 400, '已签收的单子不能重复签收');
});

test('viewer 角色只能查看，不能新建调拨单', async () => {
  const token = await login('viewer', 'viewer123');

  const list = await request(app).get('/api/transfers').set('Authorization', `Bearer ${token}`);
  assert.equal(list.status, 200, 'viewer 可以查看调拨单列表');

  const create = await request(app)
    .post('/api/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      orderNo: 'DB-VIEWER-001',
      sourceWarehouseId: 1,
      targetWarehouseId: 2,
      items: [{ materialId: 1, quantity: 1 }],
    });
  assert.equal(create.status, 403, 'viewer 不能新建调拨单');
});
