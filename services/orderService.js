import dbClient from '../db/dbClient.js';
import redisGeoClient from '../cache/redisGeoClient.js';
import driverService from './driverService.js';
import { calculatePreciseEta } from '../utils/geoUtils.js';

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
 * 更新取消率
 */
async function updateCancellationRate(driverId, isCanceled) {
    // 1. 取得當前總訂單數和取消數
    // 2. 執行 SQL 事務更新這兩個計數器
    // 3. 重新計算新的 cancellationRate = (new_cancel_count / new_total_count)
    // 4. UPDATE driver_profiles SET cancellation_rate = [new_rate] WHERE driver_id = [Driver_ID];
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