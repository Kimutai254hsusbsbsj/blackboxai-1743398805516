const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const { authenticateToken } = require('./middleware/auth');

const activeUsers = new Map();

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Add JWT verification middleware
io.use((socket, next) => {
  authenticateToken(socket.request, {}, next);
});

// Database connection
const db = new sqlite3.Database('./db.sqlite3', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database');
});

const multer = require('multer');
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({
    fileName: req.file.originalname,
    fileType: req.file.mimetype,
    fileSize: req.file.size,
    filePath: req.file.path
  });
});

// Basic test route
const sharp = require('sharp');
const { generate } = require('pdf-thumbnail');
const fs = require('fs');

// File preview endpoint
app.get('/api/preview/:fileId', async (req, res) => {
  try {
    const file = await db.get(
      'SELECT file_path, file_type FROM messages WHERE id = ? AND deleted_at IS NULL',
      [req.params.fileId]
    );
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Image preview
    if (file.file_type.startsWith('image/')) {
      const buffer = await sharp(file.file_path)
        .resize(300, 300, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();
      
      res.type('image/jpeg').send(buffer);
    }
    // PDF preview
    else if (file.file_type === 'application/pdf') {
      try {
        const stream = fs.createReadStream(file.file_path);
        const thumbnail = await generate(stream, { width: 300 });
        thumbnail.pipe(res.type('image/jpeg'));
      } catch (err) {
        console.error('PDF preview error:', err);
        res.status(500).json({ error: 'Failed to generate PDF preview' });
      }
    }
    // Video preview
    else if (file.file_type.startsWith('video/')) {
      try {
        const ffmpeg = require('fluent-ffmpeg');
        const thumbPath = `/tmp/video-thumbnails/${Date.now()}.jpg`;
        
        ffmpeg(file.file_path)
          .screenshots({
            count: 1,
            folder: '/tmp/video-thumbnails',
            filename: 'thumbnail-%b.jpg',
            size: '300x?'
          })
          .on('end', () => {
            res.sendFile(thumbPath, () => {
              fs.unlink(thumbPath, () => {});
            });
          })
          .on('error', (err) => {
            console.error('Video preview error:', err);
            res.status(500).json({ error: 'Failed to generate video preview' });
          });
      } catch (err) {
        console.error('Video preview setup error:', err);
        res.status(500).json({ error: 'Failed to process video' });
      }
    }
    else {
      res.status(400).json({ error: 'Preview not available for this file type' });
    }
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// File download endpoint
app.get('/api/download/:fileId', (req, res) => {
  db.get(
    'SELECT file_path FROM messages WHERE id = ? AND deleted_at IS NULL',
    [req.params.fileId],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'File not found' });
      }
      res.download(row.file_path);
    }
  );
});

app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: 'Minimal app test route working' });
});

// Test database connection
app.get('/api/dbtest', (req, res) => {
  db.get("SELECT name FROM sqlite_master WHERE type='table'", (err, row) => {
    if (err) return res.status(500).json({ error: 'Database test failed' });
    res.json({ status: 'success', tables: row });
  });
});

// WebSocket connection
io.on('connection', (socket) => {
  if (!socket.request.user) {
    console.log('Unauthorized connection attempt');
    return socket.disconnect(true);
  }

  const userId = socket.request.user.id;
  // Track active user
  activeUsers.set(userId, {
    socketId: socket.id,
    rooms: new Set(),
    lastActive: Date.now()
  });

  console.log(`New client connected (User ${userId}):`, socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Remove from active users
    activeUsers.delete(userId);
    // Notify room when user disconnects
    io.to(Array.from(socket.rooms)).emit('user_offline', { userId });
  });

  // Typing indicators
  socket.on('typing_start', (roomId) => {
    socket.to(roomId).emit('user_typing', { 
      userId,
      isTyping: true 
    });
  });

  socket.on('typing_stop', (roomId) => {
    socket.to(roomId).emit('user_typing', { 
      userId,
      isTyping: false 
    });
  });

  // Join room
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    // Update user's rooms
    if (activeUsers.has(userId)) {
      activeUsers.get(userId).rooms.add(roomId);
      activeUsers.get(userId).lastActive = Date.now();
    }
    console.log(`User ${userId} joined room ${roomId}`);
    
    // Notify room of new user
    socket.to(roomId).emit('user_online', { userId });
    // Send current online users
    const users = Array.from(activeUsers.keys())
      .filter(uid => activeUsers.get(uid).rooms.has(roomId));
    socket.emit('online_users', { roomId, users });
    
    // Get last 50 messages for the room
    db.all(
      `SELECT m.id, u.email as sender, m.content, m.timestamp 
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.room_id = ?
       ORDER BY m.timestamp DESC
       LIMIT 50`,
      [roomId],
      (err, messages) => {
        if (err) return console.error('Message history error:', err);
        socket.emit('room_history', messages.reverse());
      }
    );
  });

  // Handle messages
  socket.on('send_message', ({ roomId, content }) => {
    const message = {
      userId,
      roomId,
      content,
      timestamp: Date.now()
    };
    
    // Save to database
    db.run(
      'INSERT INTO messages (user_id, room_id, content) VALUES (?, ?, ?)',
      [userId, roomId, content],
      function(err) {
        if (err) return console.error('Message save error:', err);
        
        message.id = this.lastID;
        // Broadcast to room
        io.to(roomId).emit('new_message', message);
      }
    );
  });

  // Message read receipts
  socket.on('message_read', (messageId) => {
    db.run(
      'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE id = ?',
      [messageId],
      (err) => {
        if (err) return console.error('Read receipt error:', err);
        io.to(Array.from(socket.rooms)).emit('message_read', { 
          messageId, 
          userId,
          timestamp: Date.now() 
        });
      }
    );
  });

  // Message editing
  socket.on('edit_message', ({ messageId, newContent, roomId }) => {
    db.run(
      'UPDATE messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [newContent, messageId, userId],
      (err) => {
        if (err) return console.error('Message edit error:', err);
        io.to(roomId).emit('message_edited', {
          messageId,
          newContent,
          editorId: userId,
          editedAt: Date.now()
        });
      }
    );
  });

  // Message deletion
  socket.on('delete_message', ({ messageId, roomId }) => {
    db.run(
      `UPDATE messages 
       SET deleted_at = CURRENT_TIMESTAMP, 
           deleted_by = ?
       WHERE id = ? AND (user_id = ? OR ? IN (SELECT user_id FROM users WHERE is_admin = 1))`,
      [userId, messageId, userId, userId],
      function(err) {
        if (err) return console.error('Delete error:', err);
        if (this.changes > 0) {
          io.to(roomId).emit('message_deleted', { 
            messageId,
            deletedBy: userId,
            timestamp: Date.now()
          });
        }
      }
    );
  });

  // File attachments
  socket.on('send_file', ({ roomId, fileName, fileType, fileSize, filePath }) => {
    db.run(
      `INSERT INTO messages (user_id, room_id, content, file_name, file_type, file_size, file_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, roomId, '[FILE]', fileName, fileType, fileSize, filePath],
      function(err) {
        if (err) return console.error('File save error:', err);
        
        io.to(roomId).emit('new_file', {
          messageId: this.lastID,
          userId,
          fileName,
          fileType,
          fileSize,
          timestamp: Date.now()
        });
      }
    );
  });

  // Ping/pong test
  socket.on('ping', (data) => {
    socket.emit('pong', { ...data, serverTime: Date.now() });
  });
});

// Start server
const PORT = 8015;
httpServer.listen(PORT, () => {
  console.log(`Minimal test server running on port ${PORT}`);
  console.log(`Test routes:
  /api/test - Basic route test
  /api/dbtest - Database connection test
  ws://localhost:${PORT} - WebSocket endpoint`);
});
