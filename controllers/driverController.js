import { estimateRouteAndFare } from '../services/taxiService.js';

// 搬移計算邏輯到這裡
const calculateFare = (serviceType, distanceKm, durationMin) => {
    // 保持原有的車資計算邏輯
    const BASE_FARE = 70;
    const PER_KM_RATE = 15;
    const PER_MIN_RATE = 3;
    
    

    // ... (calculateFare 的內容不變，只是位置變了)
    let baseMultiplier = 1; 
    let fareType = 'FIXED';
    let range = 0;

    switch (serviceType) {
        case 'Luxury':
            baseMultiplier = 1.8;
            break;
        case 'Taxi':
            fareType = 'RANGE';
            range = 30;
            break;
        case 'Standard':
        default:
            baseMultiplier = 1.0;
            break;
    }

    const calculatedFare = (
        BASE_FARE + 
        (distanceKm * PER_KM_RATE) + 
        (durationMin * PER_MIN_RATE)
    ) * baseMultiplier;

    const minFare = fareType === 'RANGE' 
        ? Math.floor(calculatedFare - range / 2) 
        : Math.floor(calculatedFare);

    const maxFare = fareType === 'RANGE' 
        ? Math.ceil(calculatedFare + range / 2) 
        : Math.floor(calculatedFare);

    return { 
        minFare: Math.max(minFare, BASE_FARE),
        maxFare: Math.max(maxFare, BASE_FARE),
        fareType 
    };
};


/**
 * 處理 API A87 請求：獲取路線與車資估算。
 */
export const estimateRouteAndFare = async (req, res) => {
    const { pickup, dropoff } = req.body;

    if (!pickup || !dropoff || !pickup.lat || !dropoff.lat) {
        return res.status(400).json({ error: '請提供完整的起點和終點座標。' });
    }

    try {
        // 1. 呼叫服務層獲取路徑細節
        const routeDetails = await getRouteDetails(pickup, dropoff);

        const { totalDistanceKm, totalDurationMin, polyline } = routeDetails;

        // 2. 業務邏輯：生成車資估算列表
        const serviceTypes = [
            // ... 服務類型定義不變
            { id: 'A', name: '多元計程車', type: 'Standard', etaMin: '3-7分鐘' },
            { id: 'B', name: '豪華多元', type: 'Luxury', etaMin: '5-10分鐘' },
            { id: 'C', name: '小黃計程車', type: 'Taxi', etaMin: '2-5分鐘' }
        ];

        const estimatedRoutes = serviceTypes.map(service => {
            const fare = calculateFare(service.type, totalDistanceKm, totalDurationMin);
            
            return {
                routeId: service.id,
                serviceName: service.name,
                iconUrl: `/assets/car_${service.type.toLowerCase()}.png`,
                fareType: fare.fareType,
                minFare: fare.minFare,
                maxFare: fare.maxFare,
                arrivalTimeMin: service.etaMin,
            };
        });

        // 3. 返回響應
        res.json({
            polyline,
            totalDistanceKm: parseFloat(totalDistanceKm.toFixed(2)),
            totalDurationMin: parseFloat(totalDurationMin.toFixed(1)),
            estimatedRoutes,
        });

    } catch (error) {
        // 捕獲服務層拋出的錯誤（例如 Google API 錯誤）
        console.error('API 錯誤:', error.message);
        const statusCode = error.message.includes('找不到') ? 404 : 500;
        res.status(statusCode).json({ 
            error: '路線規劃服務失敗，請稍後再試。',
            details: error.message
        });
    }
};