'use strict';

const store = require('./data/store');

/**
 * 写入初始种子数据：一个管理员、一个运维、一个只读账号，
 * 外加若干排水管段与泵站，方便本地起步与「功能迭代」类任务直接有数据可用。
 *
 * 幂等：若库中已存在用户则跳过，避免重复播种。
 */
function seed({ force = false } = {}) {
  if (!force && store.countUsers() > 0) {
    return { skipped: true };
  }

  store.createUser({ username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin' });
  store.createUser({ username: 'operator', password: 'operator123', name: '运维员·张工', role: 'operator' });
  store.createUser({ username: 'viewer', password: 'viewer123', name: '值班观察员', role: 'viewer' });

  const pipes = [
    { code: 'YS-DX-001', district: '东湖区', type: 'rain', material: '钢筋混凝土', diameterMm: 1200, lengthM: 320.5, status: 'normal', installedAt: '2018-06-01', remark: '主干雨水管，汛期重点监控' },
    { code: 'WS-XH-014', district: '西湖区', type: 'sewage', material: 'HDPE', diameterMm: 800, lengthM: 156.0, status: 'warning', installedAt: '2015-09-12', remark: '局部沉降，已列入巡检计划' },
    { code: 'HL-NG-027', district: '南岗区', type: 'combined', material: '球墨铸铁', diameterMm: 1000, lengthM: 210.8, status: 'maintenance', installedAt: '2012-03-20', remark: '清淤检修中' },
  ];
  for (const p of pipes) store.createPipe(p);

  const stations = [
    { code: 'PZ-001', name: '滨江一号泵站', district: '东湖区', capacityM3h: 5400, pumpCount: 4, status: 'running', location: '滨江路与解放大道交叉口' },
    { code: 'PZ-002', name: '新城排涝泵站', district: '南岗区', capacityM3h: 3200, pumpCount: 3, status: 'standby', location: '新城北路 88 号' },
  ];
  for (const s of stations) store.createStation(s);

  const materials = [
    { name: '编织沙袋', spec: '50cm×80cm 加厚', unit: '袋', remark: '防汛常备物资' },
    { name: '移动抽水泵', spec: '150mm口径 15kW', unit: '台', remark: '便携式排水泵' },
    { name: '柴油发电机', spec: '50kW 静音型', unit: '台', remark: '应急供电' },
    { name: '应急照明灯', spec: 'LED 充电式', unit: '盏', remark: '夜间作业照明' },
    { name: '救生衣', spec: '成人型 浮力≥75N', unit: '件', remark: '水上作业防护' },
    { name: '铁锹', spec: '方头木柄', unit: '把', remark: '抢险作业工具' },
    { name: '排水软管', spec: 'DN200 20m/卷', unit: '卷', remark: '抽水泵配套' },
    { name: '警示带', spec: '反光型 100m/卷', unit: '卷', remark: '现场警戒隔离' },
  ];
  for (const m of materials) store.createMaterial(m);

  const station1 = store.getStationByCode('PZ-001');
  const station2 = store.getStationByCode('PZ-002');
  const warehouses = [
    { code: 'WH-DH-01', name: '东湖中心仓库', type: 'warehouse', district: '东湖区', location: '东湖区防汛路 1 号', remark: '区级中心储备库' },
    { code: 'WH-NG-01', name: '南岗中心仓库', type: 'warehouse', district: '南岗区', location: '南岗区工业大道 66 号', remark: '区级中心储备库' },
    { code: 'WH-XH-01', name: '西湖物资站', type: 'warehouse', district: '西湖区', location: '西湖区文化路 32 号', remark: '街道级物资站' },
    { code: 'ST-PZ-001', name: '滨江一号泵站-现场库', type: 'station', district: '东湖区', location: '滨江路与解放大道交叉口', stationId: station1 ? station1.id : null, remark: '泵站现场物资存放点' },
    { code: 'ST-PZ-002', name: '新城排涝泵站-现场库', type: 'station', district: '南岗区', location: '新城北路 88 号', stationId: station2 ? station2.id : null, remark: '泵站现场物资存放点' },
  ];
  for (const w of warehouses) store.createWarehouse(w);

  const whDH = store.getWarehouseByCode('WH-DH-01');
  const whNG = store.getWarehouseByCode('WH-NG-01');
  const matList = store.listMaterials();
  const matMap = {};
  for (const m of matList) matMap[m.name] = m.id;

  const dhStock = [
    { name: '编织沙袋', qty: 2000 },
    { name: '移动抽水泵', qty: 8 },
    { name: '柴油发电机', qty: 3 },
    { name: '应急照明灯', qty: 30 },
    { name: '救生衣', qty: 50 },
    { name: '铁锹', qty: 40 },
    { name: '排水软管', qty: 15 },
    { name: '警示带', qty: 20 },
  ];
  for (const s of dhStock) {
    store.adjustInventory(whDH.id, matMap[s.name], s.qty, '初始库存');
  }

  const ngStock = [
    { name: '编织沙袋', qty: 1500 },
    { name: '移动抽水泵', qty: 6 },
    { name: '柴油发电机', qty: 2 },
    { name: '应急照明灯', qty: 25 },
    { name: '救生衣', qty: 40 },
    { name: '铁锹', qty: 30 },
    { name: '排水软管', qty: 10 },
    { name: '警示带', qty: 15 },
  ];
  for (const s of ngStock) {
    store.adjustInventory(whNG.id, matMap[s.name], s.qty, '初始库存');
  }

  return {
    skipped: false,
    users: 3,
    pipes: pipes.length,
    stations: stations.length,
    materials: materials.length,
    warehouses: warehouses.length,
  };
}

module.exports = { seed };
