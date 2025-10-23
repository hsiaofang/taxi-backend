const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/line/login', authController.lineLogin);

module.exports = router;