import dbClient from '../db/dbClient.js';
import redisGeoClient from '../cache/redisGeoClient.js';
import DriverService from './DriverService.js';
import { calculatePreciseEta } from '../utils/geoUtils.js'; // 外部地圖 API 服務

const SEARCH_RADIUS_KM = 5; // 搜索半徑

/**
 * 派單主入口：查找最佳司機並向其發送通知。
 * @param {object} order - 已創建的訂單紀錄 (包含 passengerId, pickup/dropoff 座標等)。
 * @returns {Promise<object>} - 指派的司機資訊。
 * @throws {Error} - 如果沒有找到司機或 ETA 無效。
 */
async function assignDriver(order) {
    const pickupLocation = `${order.pickup.lng},${order.pickup.lat}`;

    // 1. 查找附近可用司機 (Redis GeoSpatial)
    const nearbyDrivers = await redisGeoClient.getNearbyDrivers(
        order.pickup.lat,
        order.pickup.lng,
        SEARCH_RADIUS_KM,
        { status: 'AVAILABLE' }
    );

    if (nearbyDrivers.length === 0) {
        throw new Error('附近暫無可用車輛，請稍後再試。');
    }

    let candidateDrivers = [];
    const driverOrigins = nearbyDrivers.map(d => `${d.lng},${d.lat}`);

    // 2. 計算精確 ETA (外部地圖 API)
    // 假設 calculatePreciseEta 返回一個包含 distance 和 duration 的陣列
    const etas = await calculatePreciseEta(driverOrigins, pickupLocation); 

    for (let i = 0; i < nearbyDrivers.length; i++) {
        const driver = nearbyDrivers[i];
        const etaData = etas[i];

        if (etaData.status !== 'OK') continue; // 如果路線無法計算，跳過該司機
        
        // 3. 獲取司機檔案 (靜態數據)
        const driverProfile = await dbClient.getDriverProfile(driver.id); 

        // 4. 執行派單演算法：計算分數
        const score = _calculateScore({
            distance: etaData.distance.value, // 單位: 米
            duration: etaData.duration.value, // 單位: 秒
            rating: driverProfile.rating,
            cancellationRate: driverProfile.cancellationRate,
        });

        candidateDrivers.push({
            id: driver.id,
            etaSec: etaData.duration.value,
            etaMin: Math.ceil(etaData.duration.value / 60),
            score: score,
            profile: driverProfile,
            currentLocation: driver,
        });
    }

    if (candidateDrivers.length === 0) {
        throw new Error('儘管有司機，但無法計算出有效的路線和 ETA。');
    }

    // 5. 決策：選擇最佳司機 (分數最高者優先)
    candidateDrivers.sort((a, b) => b.score - a.score); // 分數高的在前
    
    const assignedDriver = candidateDrivers[0];

    // 6. 狀態更新與通知
    await redisGeoClient.updateDriverStatus(assignedDriver.id, 'PICKING_UP');
    
    // 使用 driverService 透過 Socket.IO 推播
    await DriverService.notifyDriverOfNewOrder(assignedDriver.id, order, assignedDriver.etaMin); 

    return {
        id: assignedDriver.id,
        name: assignedDriver.profile.name,
        etaToPassenger: assignedDriver.etaMin,
        currentLocation: assignedDriver.currentLocation,
    };
}

/**
 * 內部函數：核心加權分數演算法
 */
function _calculateScore({ distance, duration, rating, cancellationRate }) {
    // 權重設計：
    const BASE_SCORE = 1000;
    const DISTANCE_PENALTY_RATE = 0.01; // 每米扣分
    const DURATION_PENALTY_RATE = 0.1;  // 每秒扣分
    const RATING_BONUS_RATE = 50;       // 每星評分獎勵
    const CANCEL_PENALTY_RATE = 100;    // 每 1% 取消率扣分 (假設 cancellationRate 是 0 到 1)

    let score = BASE_SCORE;

    // 懲罰距離和時間（越近越好）
    score -= (distance * DISTANCE_PENALTY_RATE);
    score -= (duration * DURATION_PENALTY_RATE);

    // 獎勵高評分
    score += (rating * RATING_BONUS_RATE);

    // 懲罰高取消率
    score -= (cancellationRate * CANCEL_PENALTY_RATE);

    // 實際會加入：排班因素、動態價格溢價等
    return score;
}


export default {
    assignDriver
};