import { Client } from '@googlemaps/google-maps-services-js';
import dotenv from 'dotenv';

// 確保環境變數已載入
dotenv.config();

const googleMapsClient = new Client({});
const API_KEY = process.env.GOOGLE_MAPS_API_KEY; 

/**
 * 呼叫第三方 Google Directions API 獲取路徑資訊
 * @param {object} pickup 
 * @param {object} dropoff
 * @returns {object} 包含路線 Polyline, 距離, 時間的物件
 */
const getRouteDetails = async (pickup, dropoff) => {
    if (!API_KEY) {
        throw new Error("Google Maps API Key 未設置。");
    }
    
    const response = await googleMapsClient.directions({
        params: {
            origin: `${pickup.lat},${pickup.lng}`,
            destination: `${dropoff.lat},${dropoff.lng}`,
            mode: 'driving',
            key: API_KEY,
            language: 'zh-TW',
        },
        timeout: 2000,
    });

    const route = response.data.routes[0];
    const leg = route.legs[0];

    return {
        totalDistanceKm: leg.distance.value / 1000,
        totalDurationMin: leg.duration.value / 60,
        polyline: route.overview_polyline.points,
    };
};

/**
 * 車資計算，核心邏輯
 * @param {number} distanceKm 
 * @param {number} durationMin 
 * @returns {object} 包含 minFare, maxFare 的物件
 */
const calculateFee = (distanceKm, durationMin) => {
    const BASE_FEE = 70; //起跳價
    const PER_KM_RATE = 15; //每公里
    const PER_MIN_RATE = 3; //每分鐘

    const calculatedFee = (
        BASE_FEE + 
        (distanceKm * PER_KM_RATE) + 
        (durationMin * PER_MIN_RATE)
    );

    const fixedFee = Math.floor(calculatedFee);
    const finalFee = Math.floor(fixedFee, BASE_FEE);

    return { 
        minFare: Math.max(minFare, BASE_FARE),
        maxFare: Math.max(maxFare, BASE_FARE),
        fareType: 'FIXED'
    };
};

/**
 * 整合：呼叫路線服務 + 計算車資
 */
export const estimateRouteAndFare = async (pickup, dropoff) => {
    const routeDetails = await getRouteDetails(pickup, dropoff);
    const { totalDistanceKm, totalDurationMin, polyline } = routeDetails;
    
    const totalFee = calculateFee(totalDistanceKm, totalDurationMin);
    const arrivalTime = `${driverEtaMinutes}-${driverEtaMinutes + 3}分鐘`;

    const standardService = {
        fareType: totalFee.fareType,
        minFare: totalFee.minFare,
        maxFare: totalFee.maxFare,
        arrivalTime: arrivalTime,
    };
    const estimatedRoutes = [standardService];
    return {
        polyline,
        totalDistanceKm,
        totalDurationMin,
        estimatedRoutes,
    };
};