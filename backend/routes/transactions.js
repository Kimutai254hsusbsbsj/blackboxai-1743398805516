const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get all transactions for user
router.get('/', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM transactions 
     WHERE user_id = ? 
     ORDER BY timestamp DESC
     LIMIT 50`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// Create new transaction
router.post('/', authenticateToken, (req, res) => {
  const { amount, currency, transaction_type } = req.body;

  if (!amount || !currency || !transaction_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.get(
    `SELECT balance FROM wallets 
     WHERE user_id = ? AND currency_type = ?`,
    [req.user.id, currency],
    (err, wallet) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!wallet) return res.status(400).json({ error: 'Wallet not found' });
      if (transaction_type === 'send' && wallet.balance < amount) {
        return res.status(400).json({ error: 'Insufficient funds' });
      }

      const newBalance = transaction_type === 'send' 
        ? wallet.balance - amount 
        : wallet.balance + amount;

      db.serialize(() => {
        db.run(
          `UPDATE wallets SET balance = ? 
           WHERE user_id = ? AND currency_type = ?`,
          [newBalance, req.user.id, currency]
        );

        db.run(
          `INSERT INTO transactions 
           (user_id, transaction_type, amount, currency, status)
           VALUES (?, ?, ?, ?, ?)`,
          [req.user.id, transaction_type, amount, currency, 'completed'],
          function(err) {
            if (err) return res.status(500).json({ error: 'Transaction failed' });
            res.status(201).json({
              transactionId: this.lastID,
              newBalance,
              currency
            });
          }
        );
      });
    }
  );
});

module.exports = router;
