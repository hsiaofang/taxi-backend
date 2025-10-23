require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

const sequelize = require('./config/db');
const User = require('./models/User');
const Driver = require('./models/Driver');
const Order = require('./models/Order');


async function startServer() {
  try {
    app.use('/users', require('./routes/users'));
    app.use('/drivers', require('./routes/drivers'));
    app.use('/orders', require('./routes/orders'));
    app.use('/line', require('./routes/line'));

    const http = require('http').createServer(app);
    const { Server } = require('socket.io');
    const io = new Server(http, { cors: { origin: '*' } });

    // 存到 app 上，方便路由呼叫
    app.set('io', io);

    io.on('connection', (socket) => {
      socket.on('driverLocation', async(data) => {
        await redisClient.set(`driver:${data.driverId}`, JSON.stringify({ lat: data.lat, lng: data.lng, status: data.status, updatedAt: Date.now() }));
        socket.broadcast.emit('driverUpdate', data);
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
      });
    });

    const PORT = process.env.PORT || 3000;
    http.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer();
