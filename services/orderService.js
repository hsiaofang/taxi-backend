import dbClient from '../db/dbClient.js';
import redisGeoClient from '../cache/redisGeoClient.js';
import driverService from './driverService.js';
import { calculatePreciseEta } from '../utils/geoUtils.js';

const axios = require('axios');

/**
 * 透過 LINE Access Token 驗證其有效性，並取得用戶的 LINE userId。
 * @param {string} lineToken
 * @returns {Promise<string>}
 * @throws {Error}
 */
async function userToken(lineToken) {
    const LINE_PROFILE_API = 'https://api.line.me/v2/profile';
    
    try {
        const response = await axios.get(LINE_PROFILE_API, {
            headers: {
                'Authorization': `Bearer ${lineToken}`,
            },
        });

        const lineProfile = response.data;
        const lineUserId = lineProfile.userId; 

        const systemUserId = await findUserId(lineUserId); 
        if (!systemUserId) {
            // 引導用戶完成綁定流程
            throw new Error('用戶尚未在系統中註冊或綁定 LINE 帳號。');
        }

        return systemUserId; // 返回您系統中的 userId

    } catch (error) {
        if (error.response && error.response.status === 401) {
            throw new Error('LINE Token 無效或已過期。');
        }
        console.error('LINE API 驗證失敗:', error.message);
        throw new Error('LINE 身份驗證失敗。');
    }
}

// 模擬查找系統用戶 ID 的函數
async function findUserId(lineUserId) {
    // 💡 這裡應該是您的資料庫查找邏輯，根據 LINE User ID 找到您系統中的 User ID
    // 這裡我們假設 LINE ID 就是您系統中的 username (如您註冊邏輯所示)
    // 由於我們看不到您的資料庫模型，暫時返回 LINE ID 本身作為系統 ID
    // 實際應用中，請用 lineUserId 查找您的資料庫，並返回對應的 systemUserId
    return lineUserId; 
}

/**
 * 派單
 * @param {object} order
 * @returns {Promise<object>} - 指派的司機物件
 */
async function assignDriver(order) {
    const pickupLocation = `${order.pickup.lng},${order.pickup.lat}`;
    const SEARCH_RADIUS_KM = 5;

    const nearbyDrivers = await redisGeoClient.getNearbyDrivers(
        order.pickup.lat,
        order.pickup.lng,
        SEARCH_RADIUS_KM,
        { status: 'AVAILABLE' }
    );

    if (nearbyDrivers.length === 0) {
        console.warn(`[Dispatch] 5 km 內沒有可用司機。`);
        throw new Error('附近暫無可用車輛，請稍後再試。');
    }

    let allDrivers = [];
    const driverOrigins = nearbyDrivers.map(d => `${d.lng},${d.lat}`);
    const etas = await calculateEta(driverOrigins, pickupLocation);

    for (let i = 0; i < nearbyDrivers.length; i++) {
        const driver = nearbyDrivers[i];
        const etaData = etas[i];

        if (etaData.status !== 'OK') continue; 
        
        // 獲取司機數據 (評分、取消率等)
        const driverProfile = await dbClient.getDriverProfile(driver.id); 

        // 執行派單演算法
        const score = this._calculateScore({
            distance: etaData.distance.value,
            duration: etaData.duration.value,
            rating: driverProfile.rating,
            cancelRate: driverProfile.cancellationRate,
        });

        allDrivers.push({
            id: driver.id,
            etaMin: Math.ceil(etaData.duration.value / 60),
            score: score,
            profile: driverProfile,
            currentLocation: driver,
        });
    }

    if (candidateDrivers.length === 0) {
        throw new Error('儘管有司機，但無法計算出有效的路線和 ETA。');
    }

    // 選擇分數最高的司機（或最快到達的）
    allDrivers.sort((a, b) => a.etaMin - b.etaMin);
    
    const assignedDriver = allDrivers

    await redisGeoClient.updateDriverStatus(assignedDriver.id, 'PICKING_UP');
    
    await driverService.notifyDriverOfNewOrder(assignedDriver.id, order);

    console.log(`[Dispatch] 成功指派給司機 ${assignedDriver.id}。ETA: ${assignedDriver.etaMin} 分鐘。`);
    
    return {
        id: assignedDriver.id,
        name: assignedDriver.profile.name,
        etaToPassenger: assignedDriver.etaMin,
        currentLocation: assignedDriver.currentLocation,
    };
}

/**
 * 內部函數：計算派單分數
 * score = Base - (distance * 0.01)    // 距離懲罰
                - (duration * 0.1)          // 時間懲罰
                + (rating * 50)             // 評分獎勵
                - (cancellationRate * 100)  // 取消率懲罰
                + (dynamicPremiumRate * 150)// 溢價獎勵 (高權重)
                + (50 * dutyFactor)         // 排班獎勵 (中低權重)
 */
function _calculateScore({ distance, duration, rating, cancellRate }) {
    // 距離越近分數越高
    let score = 1000 - (distance * 0.1); 

    // 時間越長懲罰越大
    score -= (duration * 0.5);

    // 評分高則加分
    score += (rating * 50);

    // 取消率高則扣分
    score -= (cancellRate * 100);

    // 實際會加入：動態價格溢價、司機的排班時間等因素
    return score;
}


module.exports = {
    userToken,
    assignDriver
};