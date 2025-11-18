import mysql from 'mysql2/promise'; 

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const dbClient = {
    /**
     * @param {string} driverId
     * @returns {Promise<object>}
     */
    async getDriverProfile(driverId) {
        let connection;

        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute(
                `SELECT 
                    name, 
                    rating, 
                    cancellation_rate, 
                    duty_factor, 
                    car_model 
                 FROM 
                    driver_profiles 
                 WHERE driver_id = ?`,
                [driverId]
            );

            if (rows.length === 0) {
                const notFoundError = new Error(`Driver profile not found for ID: ${driverId}`);
                notFoundError.code = 'DRIVER_NOT_FOUND';
                throw notFoundError;
            }

            const dbData = rows[0];
            
            return {
                id: driverId,
                name: dbData.name,
                rating: dbData.rating,
                cancellationRate: dbData.cancellation_rate,
                dutyFactor: dbData.duty_factor, 
                carModel: dbData.car_model,
            };

        } catch (error) {
            
            if (error.code === 'DRIVER_NOT_FOUND') {
                 throw error;
            }

            const dbError = new Error('Database connection or query failed.');
            dbError.code = 'DB_ERROR';
            throw dbError; 
        } finally {
            if (connection) connection.release();
        }
    }
};

export default dbClient;