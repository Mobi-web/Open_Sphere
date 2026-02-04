// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Подключение к MySQL
const pool = mysql.createPool({
  host: 'localhost',     // замените на ваш хост
  user: 'root',          // замените на вашего пользователя
  password: 'qwerty',          // замените на ваш пароль
  database: 'messages',   // имя базы данных
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Проверка подключения к базе
pool.getConnection()
  .then(conn => {
    console.log('Подключено к MySQL');
    conn.release();
  })
  .catch(err => {
    console.error('Ошибка подключения к MySQL:', err);
  });

// Создание таблиц (если не существуют)
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        from_user VARCHAR(50) NOT NULL,
        to_user VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('text', 'image', 'video', 'gif') NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX (from_user, to_user)
      )
    `);
    console.log('Таблицы созданы или уже существуют');
  } catch (err) {
    console.error('Ошибка инициализации базы:', err);
  }
}
initDB();

// Маршруты
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    res.json({ success: true, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  try {
    const [messages] = await pool.query(
      'SELECT * FROM messages WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) ORDER BY timestamp',
      [user1, user2, user2, user1]
    );
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('Новый пользователь подключился');

  socket.on('join', (username) => {
    socket.username = username;
    updateUserList();
  });

  socket.on('privateMessage', async ({ to, message, type }) => {
    if (!socket.username) return;
    try {
      await pool.query(
        'INSERT INTO messages (from_user, to_user, message, type) VALUES (?, ?, ?, ?)',
        [socket.username, to, message, type]
      );
      io.sockets.sockets.forEach(s => {
        if (s.username === to || s.username === socket.username) {
          s.emit('privateMessage', {
            from: socket.username,
            message,
            type
          });
        }
      });
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Пользователь отключился');
    updateUserList();
  });

  function updateUserList() {
    const connectedUsers = [];
    io.sockets.sockets.forEach(s => {
      if (s.username) {
        connectedUsers.push(s.username);
      }
    });
    io.emit('userList', connectedUsers);
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
