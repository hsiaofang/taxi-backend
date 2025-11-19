const express = require('express');
const app = express();
// 確保您在環境變數中設定了 PORT，否則預設為 3000
const port = process.env.PORT || 3000; 

// 引入 log 函式和 setLogFilePath 函式
const { log, setLogFilePath } = require('./utils/logger'); 


try {
    setLogFilePath('/path/to/your/app.log');
    // 使用 logger 模組記錄啟動信息，這條日誌會寫入檔案
    log('info', { message: '日誌檔案路徑已設定完成。' }); 
} catch (error) {
    // 如果設定失敗（例如權限不足），則輸出錯誤
    console.error('日誌檔案路徑設定失敗:', error.message);
}


// Middleware
const httpLogger = (req, res, next) => {
    // 使用您匯入的 log 函式來記錄，確保日誌能寫入檔案
    log('info', {
        message: `${req.method} ${req.url} - 請求開始`,
        meta: {
            // 記錄請求的元數據。這裡不會自動遮蔽 PII (如 IP)，但會遮蔽通用密鑰。
            ip_address: req.ip, 
            user_agent: req.get('User-Agent'),
            // 如果請求包含敏感信息，通用密鑰遮蔽會在這裡作用：
            // secret_key: req.headers['authorization'] 
        }
    });

    next();
};



app.use(httpLogger);


app.get('/', (req, res) => {
    log('verbose', { message: '處理根目錄請求成功。' });
    res.send('Hello World! 檢查您的 app.log 檔案。');
});

app.get('/test-error', (req, res) => {
    try {
        // 模擬一個錯誤
        throw new Error('模擬服務處理失敗：CODE-123');
    } catch (error) {
        // 直接將 Error 物件傳入 log 函式，會自動記錄 stack trace
        log(error); 
        res.status(500).send('內部伺服器錯誤，已記錄。');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});