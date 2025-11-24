import axios from 'axios';
import dbClient from '../db/dbClient.js';
// 假設 dbClient 包含 findUserByLineId, createUser, createLineBinding 等方法

const LINE_PROFILE_API = 'https://api.line.me/v2/profile';

/**
 * 核心：根據 LINE Token 驗證身份，並查找/創建系統用戶。
 * @param {string} lineToken - 從 LIFF 前端傳來的 LINE Access Token。
 * @returns {Promise<number>} - 系統中的 userId。
 * @throws {Error} - 驗證失敗或無效 Token。
 */
async function userToken(lineToken) {
    try {
        const response = await axios.get(LINE_PROFILE_API, {
            headers: { 'Authorization': `Bearer ${lineToken}` },
        });
        const lineUserId = response.data.userId;
        const systemUserId = await findOrCreateSystemUser(lineUserId);

        return systemUserId;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            throw new Error('LINE Token 無效或已過期。');
        }
        console.error('LINE API 驗證失敗:', error.message);
        throw new Error('LINE 身份驗證失敗。');
    }
}

/**
 * 查找或創建系統用戶 (這是您之前簡化的 findUserId 的生產級擴展)
 * @param {string} lineUserId
 * @returns {Promise<number>}
 */
async function findOrCreateSystemUser(lineUserId) {
    let user = await dbClient.findUserByLineId(lineUserId);

    if (user) {
        return user.userId;
    }

    try {
        const newUserId = await dbClient.transaction(async (t) => {
            const newUser = await dbClient.createUser({
                username: `LINE_${lineUserId}`,
                userType: 'PASSENGER',
                // ... 其他必要欄位
            }, t);

            await dbClient.createLineBinding({
                userId: newUser.userId,
                lineUserId: lineUserId,
            }, t);

            return newUser.userId;
        });
        return newUserId;
    } catch (e) {
        console.error('自動註冊失敗:', e);
        throw new Error('自動註冊失敗，請聯繫客服。');
    }
}

export default {
    userToken,
};