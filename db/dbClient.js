// db/dbClient.js: 資料庫客戶端，用於獲取長期持久性數據（模擬 MySQL 後端 API 呼叫）

/**
 * 🚨 正式上線提醒：
 * 瀏覽器端 JavaScript (前端) 無法直接連接 MySQL。
 * 此處必須透過呼叫一個安全的後端服務 (例如 Node.js/Express) 來間接查詢 MySQL。
 */

// 替換為您的後端 API 基礎 URL，該後端服務負責連接 MySQL
const API_BASE_URL = 'https://your-production-backend.com/api/v1'; 

const dbClient = {
    /**
     * 從後端 API 服務獲取司機的永久檔案 (MySQL 資料庫)。
     * 該後端服務內部應執行 SQL 查詢：SELECT * FROM driver_profiles WHERE driver_id = $1;
     * @param {string} driverId - 司機 ID
     * @returns {Promise<object>} - 司機檔案物件
     */
    async getDriverProfile(driverId) {
        const endpoint = `${API_BASE_URL}/drivers/profile/${driverId}`;

        console.log(`[DB Client] 模擬向後端 API (${endpoint}) 請求 MySQL 數據...`);

        try {
            // ----------------------------------------------------
            // 🚨 實際生產代碼應在此處替換為 Fetch 或 Axios 呼叫：
            /*
            const response = await fetch(endpoint, {
                method: 'GET',
                // 必須包含認證標頭，例如 JWT
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` 
                },
            });
            
            if (!response.ok) {
                // 處理 4xx 或 5xx 錯誤
                throw new Error(`API 錯誤: ${response.status} - 無法獲取司機檔案。`);
            }
            const data = await response.json();
            // ----------------------------------------------------
            */

            // --- 模擬 API 呼叫結果（直到部署真實後端為止） ---
            await new Promise(resolve => setTimeout(resolve, 50)); 
            
            // 模擬 MySQL 返回的數據結構
            const data = {
                id: driverId,
                name: `正式上線司機 ${driverId}`,
                rating: 4.8, 
                cancellationRate: 0.03, // 3%
                dutyFactor: 1.1, // 略微優先
                carModel: 'Luxury Sedan',
            };
            
            // 確保返回的數據包含派單演算法所需的所有關鍵字段，並提供預設值作為最終防線
            return {
                id: driverId,
                name: data.name || `Driver ${driverId}`,
                rating: data.rating || 4.5,
                cancellationRate: data.cancellationRate || 0.05,
                dutyFactor: data.dutyFactor || 1.0, 
                carModel: data.carModel || 'Sedan',
            };

        } catch (error) {
            console.error(`[DB Client] 請求司機 ${driverId} 檔案時發生錯誤:`, error);
            
            // 發生錯誤時的容錯處理：使用安全預設值，避免系統崩潰，但給予較低的派單分數
            return { 
                id: driverId, 
                name: `API 錯誤回退司機 ${driverId}`, 
                rating: 4.0, 
                cancellationRate: 0.15, // 較高取消率懲罰
                dutyFactor: 0.9, // 較低排班係數懲罰
                carModel: "Unknown",
            };
        }
    }
};

export default dbClient;
