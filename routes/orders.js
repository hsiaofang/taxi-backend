// routes/orders.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Driver = require('../models/Driver');
const redisClient = require('../utils/redis');

// Haversine 公式計算距離
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // 地球半徑(km)
  const dLat = (lat2 - lat1) * Math.PI / 180; // 轉成弧度
  const dLng = (lng2 - lng1) * Math.PI / 180; 
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 叫車
router.post('/', async (req, res) => {
  const { passengerId, startLat, startLng, endLat, endLng } = req.body;
  const cacheKey = `drivers:online:${Math.floor(startLat*10)}:${Math.floor(startLng*10)}`;

  let cachedDrivers = await redisClient.get(cacheKey);
  if (cachedDrivers) {
    return res.json(JSON.parse(cachedDrivers));
  }

  // 找附近司機 (5km 內、在線)
  const drivers = await Driver.findAll({ where: { status: 'online' } });
  const nearby = drivers
    .map(d => ({ driver: d, distance: getDistance(startLat, startLng, d.lat, d.lng) }))
    .filter(d => d.distance <= 5)
    .sort((a, b) => a.distance - b.distance);

  await redisClient.set(cacheKey, JSON.stringify(nearby), { EX: 10 }); //存進redis，設10秒有效
  
  if (nearby.length === 0) return res.status(200).json({ message: 'No driver, please retry', retry: true });

  const assignedDriver = nearby[0].driver;

  // 建立訂單
  const order = await Order.create({
    passengerId,
    driverId: assignedDriver.id,
    startLat,
    startLng,
    endLat,
    endLng,
    status: 'pending'
  });

  // 廣播給司機
  req.app.get('io').emit('orderNotification', order);

  res.json({ order, driver: assignedDriver });
});

// 更新訂單狀態
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  await Order.update({ status }, { where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
