const configStore = {
    verbose: false,
    quiet: false,
    silent: false,
    logToFile: true,
    logFilePath: null,
    isInitialized: () => true
};

module.exports = {
    /**
     * 從配置中獲取一個值
     * @param {string} key 
     */
    get: (key) => {
        return configStore[key];
    },

    /**
     * 設定一個配置值
     * @param {string} key 
     * @param {*} value 
     */
    set: (key, value) => {
        configStore[key] = value;
    },
    
    isInitialized: configStore.isInitialized,

};