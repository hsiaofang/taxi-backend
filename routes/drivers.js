const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');

// 新增司機
router.post('/', async (req, res) => {
  const driver = await Driver.create(req.body);
  res.json(driver);
});

// 更新位置
router.post('/:id/location', async (req, res) => {
  const { lat, lng, status } = req.body;
  await Driver.update(
    { lat, lng, status, updatedAt: new Date() },
    { where: { id: req.params.id } }
  );
  res.json({ success: true });
});

module.exports = router;
