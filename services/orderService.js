import AuthService from './AuthService.js';
import DispatchService from './DispatchService.js';
import dbClient from '../db/dbClient.js';
import { io } from '../websocket.js';

const ORDER_STATUS = {
    SEARCHING: 'SEARCHING',
    ACCEPTED: 'ACCEPTED',
    COMPLETED: 'COMPLETED',
    CANCELED: 'CANCELED',
    NO_DRIVER: 'NO_DRIVER_FOUND',
};

/**
 * 處理完整的叫車請求流程：驗證 -> 創建 -> 派單 -> 更新狀態。
 * 這是從 Controller/Router 層調用的主要入口。
 * * @param {string} lineToken - 乘客的 LINE Access Token。
 * @param {object} orderData - 訂單數據 (包含 pickup/dropoff 座標等)。
 * @returns {Promise<{orderId: number, driver: object}>} - 派單成功的結果。
 */
async function orderRequest(lineToken, orderData) {
    let passengerId;
    let orderRecord = null;

    try {
        passengerId = await AuthService.userToken(lineToken);
        orderRecord = await dbClient.createOrder({ 
            passengerId, 
            status: ORDER_STATUS.SEARCHING, 
            ...orderData 
        });

        // 3. 派單：執行複雜的匹配演算法 (DispatchService 職責)
        const assignedDriverInfo = await DispatchService.assignDriver({
            id: orderRecord.id, // 傳遞訂單 ID
            passengerId,
            ...orderData,
        });

        // 4. 流程成功：更新訂單狀態為 ACCEPTED
        await dbClient.updateOrderRecord(orderRecord.id, {
            status: ORDER_STATUS.ACCEPTED,
            driverId: assignedDriverInfo.id,
            acceptedAt: new Date(),
        });

        // 5. 即時通知乘客 (如果 Socket.IO 連線還在)
        // 乘客應在 Socket.IO 中監聽 'order_accepted' 事件
        io.to(`user_${passengerId}`).emit('order_accepted', {
            orderId: orderRecord.id,
            driver: assignedDriverInfo,
            etaMin: assignedDriverInfo.etaToPassenger,
        });
        
        // 返回成功結果給 HTTP 響應
        return {
            orderId: orderRecord.id,
            driver: assignedDriverInfo,
        };

    } catch (error) {
        console.error(`訂單處理失敗 (用戶 ${passengerId}):`, error.message);
        
        // 6. 流程失敗：清理狀態並通知乘客
        if (orderRecord && orderRecord.id) {
            // 更新訂單狀態為失敗原因
             await dbClient.updateOrderRecord(orderRecord.id, {
                status: ORDER_STATUS.NO_DRIVER, // 或 CANCELED
                cancellationReason: error.message,
            });

            // 即時通知乘客訂單失敗
             io.to(`user_${passengerId}`).emit('order_failed', { 
                orderId: orderRecord.id,
                message: error.message 
            });
        }
        
        // 拋出錯誤供上層（Router/Controller）捕捉並響應 HTTP
        throw error;
    }
}

/**
 * 處理司機確認到達乘客上車點的事件。
 * @param {number} orderId
 */
async function driverArrived(orderId) {
    const order = await dbClient.getOrderById(orderId);
    
    if (!order || order.status !== ORDER_STATUS.ACCEPTED) {
        throw new Error('訂單狀態不正確，無法確認到達。');
    }

    await dbClient.updateOrderRecord(orderId, {
        status: 'ARRIVED', // 假設您的訂單狀態有 ARRIVED
        arrivedAt: new Date(),
    });

    // 推播給乘客：司機已到達
    io.to(`user_${order.passengerId}`).emit('driver_arrived', {
        orderId: orderId,
        message: '您的司機已到達上車地點。'
    });
}


export default {
    processOrderRequest,
    driverArrived,
    // ... 更多訂單管理方法，如 cancelOrder, completeOrder
};