
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost', // или ваш хост
  user: 'root',      // ваш пользователь
  password: 'qwerty',      // ваш пароль
  database: 'messages', // имя базы данных
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
