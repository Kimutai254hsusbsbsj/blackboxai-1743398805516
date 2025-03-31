const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get chat rooms
router.get('/rooms', authenticateToken, (req, res) => {
  const rooms = [
    { id: 'global', name: 'Global Chat', type: 'public' },
    { id: 'crypto', name: 'Crypto Discussion', type: 'public' },
    { id: 'fiat', name: 'Fiat Transactions', type: 'public' }
  ];
  res.json(rooms);
});

// Get message history
router.get('/messages/:roomId', authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  db.all(
    `SELECT m.id, m.content, m.timestamp, u.email as sender 
     FROM messages m
     JOIN users u ON m.user_id = u.id
     WHERE m.room_id = ?
     ORDER BY m.timestamp DESC
     LIMIT ?`,
    [roomId, limit],
    (err, messages) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(messages.reverse());
    }
  );
});

// Store message (called via WebSocket)
const storeMessage = (userId, roomId, content) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO messages (user_id, room_id, content) 
       VALUES (?, ?, ?)`,
      [userId, roomId, content],
      function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
};

module.exports = {
  router,
  storeMessage
};