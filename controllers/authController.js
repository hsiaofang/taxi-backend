const User = require('../models/User');
const tokenService = require('../services/tokenService');
const axios = require('axios');

// 假設 Line Channel ID/Secret 在環境變數中
const LINE_CLIENT_ID = process.env.LINE_CLIENT_ID;

/**
 * 加入使用者
 */
exports.lineLogin = async (req, res) => {
    const { lineId, lineName, linePicture } = req.body;

    if (!lineUserId) {
        return res.status(400).json({ message: 'Line User ID is required' });
    }

    try {
        let user = await User.findOne({ where: { lineUserId } });

        let isNewUser = false;
        
        if (!user) {
            isNewUser = true;
            console.log(`New user detected: Creating account for Line ID ${lineUserId}`);
            
            user = await User.create({
                lineId: lineId,
                lineName: lineName || 'Line User',
                linePicture: linePicture || null
        });
        } else {
            await user.update({ 
                lineDisplayName: lineDisplayName || user.lineDisplayName,
                linePictureUrl: linePictureUrl || user.linePictureUrl
            });
        }
        
        const token = tokenService.generateToken(user.id);

        res.status(200).json({
            message: isNewUser ? 'Registration successful' : 'Login successful',
            token: token,
            user: {
                id: user.id,
                lineDisplayName: user.lineDisplayName,
                userType: user.userType,
                isNewUser: isNewUser
            }
        });

    } catch (error) {
        console.error('Line Login/Registration error:', error);
        res.status(500).json({ message: 'Internal server error during authentication' });
    }
};

/**
 * [API: GET /users/me]
 * 獲取當前登入用戶的資訊
 * 假設這個 Controller 會被前置的 Middleware (如 authMiddleware) 保護，
 * 並且 req.user 中包含了用戶 ID。
 */
exports.getCurrentUser = async (req, res) => {
    // 假設 authMiddleware 已經從 JWT 中解析出用戶
    const userId = req.user.id; 

    try {
        const user = await User.findByPk(userId, {
            attributes: ['id', 'lineDisplayName', 'linePictureUrl', 'phone', 'userType'] // 僅返回需要的欄位
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ message: 'Failed to retrieve user data' });
    }
};

// ... 您可以繼續添加 updateUser 等其他 Controller 函式