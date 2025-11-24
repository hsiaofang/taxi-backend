const express = require('express');
const router = express.Router();
// 引入服務
const orderService = require('../services/OrderService.js'); 
const { io } = require('../websocket.js'); // 假設您的 io 實例可以這樣獲取

router.post('/', async (req, res) => {
    const { passengerId, startLat, startLng, endLat, endLng } = req.body;
    
    // 🚨 這裡需要身份驗證邏輯，但為了演示，暫時跳過
    if (!passengerId) return res.status(401).json({ message: 'Authentication required.' });

    try {
        // 委派給 OrderService 處理完整的派單流程
        const result = await orderService.processOrderRequest({
            passengerId,
            pickup: { lat: startLat, lng: startLng },
            dropoff: { lat: endLat, lng: endLng },
        });

        // 由於這是 HTTP 請求，立即響應給前端 (告知正在等待司機接單)
        res.json({ 
            orderId: result.order.id,
            message: 'Order placed, searching for driver.',
            driverInfo: result.driver // 這裡可以返回指派的司機信息
        });
        
    } catch (error) {
        if (error.message.includes('No driver')) {
            return res.status(200).json({ message: error.message, retry: true });
        }
        res.status(500).json({ message: 'Internal server error during dispatch.' });
    }
});

// 移除 /:id/status，狀態更新應改由 Socket.IO 處理
// ... 

module.exports = router;