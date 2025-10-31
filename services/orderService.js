import dbClient from '../db/dbClient.js';
import redisGeoClient from '../cache/redisGeoClient.js';
import driverService from './driverService.js';
import { calculatePreciseEta } from '../utils/geoUtils.js';

/**
 * 派單
 * @param {object} order - 待指派的訂單物件 (包含 pickup.lat/lng)
 * @returns {Promise<object>} - 指派的司機物件
 */
async function findAndAssignDriver(order) {
    const pickupLocation = `${order.pickup.lng},${order.pickup.lat}`;
    const SEARCH_RADIUS_KM = 5; // 初次搜索半徑：5 公里

    console.log(`[Dispatch] 開始在 ${SEARCH_RADIUS_KM} km 範圍內搜索可用司機...`);

    const nearbyDrivers = await redisGeoClient.getNearbyDrivers(
        order.pickup.lat,
        order.pickup.lng,
        SEARCH_RADIUS_KM,
        { status: 'AVAILABLE', type: order.vehicleType } // 必須是可用狀態且車型匹配
    );

    if (nearbyDrivers.length === 0) {
        console.warn(`[Dispatch] 5 km 內沒有可用司機。`);
        throw new Error('附近暫無可用車輛，請稍後再試。');
    }

    let candidateDrivers = [];
    const driverOrigins = nearbyDrivers.map(d => `${d.lng},${d.lat}`);
    const etas = await calculateEta(driverOrigins, pickupLocation);

    // 3. 整合數據並計算分數
    for (let i = 0; i < nearbyDrivers.length; i++) {
        const driver = nearbyDrivers[i];
        const etaData = etas[i];

        // 確保 ETA 有效，避免網路錯誤導致數據不全
        if (etaData.status !== 'OK') continue; 
        
        // 4. 獲取司機永久數據 (評分、取消率等)
        const driverProfile = await dbClient.getDriverProfile(driver.id); 

        // 5. 執行派單演算法 (Scoring Algorithm)
        const score = this._calculateDispatchScore({
            distanceMeters: etaData.distance.value,
            durationSeconds: etaData.duration.value,
            rating: driverProfile.rating,
            cancellationRate: driverProfile.cancellationRate,
            // 🚨 這裡會加入您業務邏輯中所有影響派單優先級的因素
        });

        candidateDrivers.push({
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

    // ----------------------------------------------------
    // III. 最終決策與通知 (Final Decision & Notification)
    // ----------------------------------------------------
    
    // 6. 選擇分數最高的司機（或最快到達的）
    // 🚨 最常見的策略是選擇 ETA 最短的
    candidateDrivers.sort((a, b) => a.etaMin - b.etaMin);
    const assignedDriver = candidateDrivers[0];

    // 7. 更新司機狀態為「ON_TRIP」或「PICKING_UP」 (原子操作)
    await redisGeoClient.updateDriverStatus(assignedDriver.id, 'PICKING_UP');
    
    // 8. 🔔 向該司機的 App 推播新訂單訊息 (使用 driverService)
    await driverService.notifyDriverOfNewOrder(assignedDriver.id, order);

    console.log(`[Dispatch] 成功指派給司機 ${assignedDriver.id}。ETA: ${assignedDriver.etaMin} 分鐘。`);
    
    // 9. 返回指派結果
    return {
        id: assignedDriver.id,
        name: assignedDriver.profile.name,
        etaToPassenger: assignedDriver.etaMin,
        currentLocation: assignedDriver.currentLocation,
        // 其他重要資訊...
    };
}

/**
 * 內部函數：計算派單分數 (Scoring Algorithm)
 * 🚨 這是業務競爭力的核心機密，邏輯非常複雜
 */
function _calculateDispatchScore({ distanceMeters, durationSeconds, rating, cancellationRate }) {
    // 基礎分：距離越近分數越高
    let score = 1000 - (distanceMeters * 0.1); 

    // 懲罰項：時間越長懲罰越大
    score -= (durationSeconds * 0.5);

    // 獎勵項：評分高則加分
    score += (rating * 50);

    // 懲罰項：取消率高則扣分
    score -= (cancellationRate * 100);

    // 實際會加入：動態價格溢價、司機的排班時間等因素
    return score;
}