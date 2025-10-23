// routes/line.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const replyToken = event.replyToken;
      const text = event.message.text;

      if (text.includes('叫車')) {
        await axios.post(`${process.env.SERVER_URL}/orders`, {
          passengerId: 1,
          startLat: 25.0478,
          startLng: 121.5319,
          endLat: 25.0378,
          endLng: 121.565
        });

        await axios.post('https://api.line.me/v2/bot/message/reply', {
          replyToken,
          messages: [{ type: 'text', text: '已叫車，正在尋找附近司機' }]
        }, {
          headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }
        });
      }
    }
  }

  res.sendStatus(200);
});

module.exports = router;
