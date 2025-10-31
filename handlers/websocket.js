import { Server } from 'socket.io';
import * as orderService from '../services/orderService.js';
import * as driverService from '../services/driverService.js'; 

const userSocketMap = new Map(); 

/**
 * 初始化 Socket.IO 伺服器並設定事件監聽器
 * @param {object} httpServer 
 */
export const initWebSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: "*", 
            methods: ["GET", "POST"]
        }
    });

    console.log('WebSocket 服務器已初始化。');

    io.on('connection', (socket) => {
        /*
        * 身分驗證與加入房間
        */  
        socket.on('authenticate', async (token) => {
            try {
                // 實際應用中：通過 JWT 或其他方式驗證 Token，並從中解析出 userId
                const userId = await orderService.verifyUserToken(token); // 假設的驗證函數
                
                socket.data.userId = userId;
                socket.join(`user_${userId}`);
                userSocketMap.set(socket.id, userId);

                socket.emit('status_update', { success: true, message: `歡迎，用戶 ${userId} 連線成功。` });
            } catch (error) {
                console.error('身份驗證失敗:', error.message);
                socket.emit('auth_error', { success: false, message: '身份驗證失敗，請重新登入。' });
                socket.disconnect(true);
            }
        });
        
        socket.on('request_order', async (orderData, callback) => {
            const userId = socket.data.userId;
            if (!userId) return callback({ success: false, message: '請先進行身份驗證。' });

            try {
                //  呼叫核心業務服務，處理叫車、派單、存資料庫等所有複雜步驟
                const { order, driver } = await orderService.createAndDispatchOrder({ userId, ...orderData });
                socket.emit('order_confirmed', { orderId: order.id, driver });

                // 🚨 向附近所有可用司機推播新訂單（這通常由另一個系統完成，這裡模擬）
                driverService.notifyNearbyDrivers(order);

                callback({ success: true, orderId: order.id, message: '叫車成功，正在等待司機接單...' });
            } catch (error) {
                console.error(`用戶 ${userId} 叫車失敗:`, error.message);
                callback({ success: false, message: error.message || '叫車服務暫時不可用。' });
            }
        });

    
        /*
        * 司機即時位置
        */
        socket.on('driver_location', (locationData) => {
            const passengerId = driverService.getPassengerIdByOrder(locationData.orderId);
            
            if (passengerId) {
                // 精準推播給等待這趟車的乘客
                io.to(`user_${passengerId}`).emit('driver_location', locationData);
            }
        }); 
        
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