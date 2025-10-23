// handlers/websocket.js

import { Server } from 'socket.io';
// 🚨 實際生產環境中，引入處理業務的 Service
import * as orderService from '../services/orderService.js';
import * as driverService from '../services/driverService.js'; 

// 這裡可以使用 Map 或 Redis/資料庫來儲存 Socket ID 和 User ID 的對應關係
const userSocketMap = new Map(); 

/**
 * 初始化 Socket.IO 伺服器並設定事件監聽器
 * @param {object} httpServer - 來自 Express 服務器的 HTTP 實例
 */
export const initWebSocket = (httpServer) => {
    // 初始化 Socket.IO 伺服器，設定 CORS
    const io = new Server(httpServer, {
        cors: {
            origin: "*", 
            methods: ["GET", "POST"]
        }
    });

    console.log('WebSocket 服務器已初始化。');

    // --- 核心連線監聽 ---
    io.on('connection', (socket) => {
        
        // 1. 身份驗證/加入房間 (取代 join_passenger_channel 事件)
        // 🚨 這是真實情境，通常在客戶端連線時，通過查詢參數或握手數據傳遞 Token
        socket.on('authenticate', async (token) => {
            try {
                // 實際應用中：通過 JWT 或其他方式驗證 Token，並從中解析出 userId
                const userId = await orderService.verifyUserToken(token); // 假設的驗證函數
                
                socket.data.userId = userId; // 將用戶ID綁定到 socket
                socket.join(`user_${userId}`); // 創建一個專屬房間，方便精準推播
                userSocketMap.set(socket.id, userId); // 記錄對應關係

                socket.emit('status_update', { success: true, message: `歡迎，用戶 ${userId} 連線成功。` });
            } catch (error) {
                console.error('身份驗證失敗:', error.message);
                socket.emit('auth_error', { success: false, message: '身份驗證失敗，請重新登入。' });
                socket.disconnect(true); // 驗證失敗直接斷開
            }
        });
        
        // 2. 乘客發出叫車請求 (Event: 'request_ride')
        socket.on('request_ride', async (orderData, callback) => {
            const userId = socket.data.userId;
            if (!userId) return callback({ success: false, message: '請先進行身份驗證。' });

            try {
                // 🚨 呼叫核心業務服務，處理叫車、派單、存資料庫等所有複雜步驟
                const { order, driver } = await orderService.createAndDispatchOrder({ userId, ...orderData });
                
                // 🚨 向乘客推播：訂單已確認，正在派車
                socket.emit('order_confirmed', { orderId: order.id, driver });

                // 🚨 向附近所有可用司機推播新訂單（這通常由另一個系統完成，這裡模擬）
                driverService.notifyNearbyDrivers(order);

                callback({ success: true, orderId: order.id, message: '叫車成功，正在等待司機接單...' });
            } catch (error) {
                console.error(`用戶 ${userId} 叫車失敗:`, error.message);
                callback({ success: false, message: error.message || '叫車服務暫時不可用。' });
            }
        });

        // 3. 司機即時位置更新 (Event: 'driver_location_update')
        // 🚨 這是從司機端連線收到的事件，需要廣播給特定乘客
        socket.on('driver_location_update', (locationData) => {
            // locationData 應包含 { orderId, lat, lng }
            const passengerId = driverService.getPassengerIdByOrder(locationData.orderId);
            
            if (passengerId) {
                // 精準推播給等待這趟車的乘客
                io.to(`user_${passengerId}`).emit('driver_location', locationData);
            }
        });
        
        // 4. 客戶端斷開連線
        socket.on('disconnect', () => {
            const userId = socket.data.userId;
            if (userId) {
                console.log(`用戶 ${userId} (${socket.id}) 已斷開連線。`);
                userSocketMap.delete(socket.id); 
                // 實際應用中：如果是司機斷線，需要將其狀態標記為離線
            }
        });
    });

    return io;
};