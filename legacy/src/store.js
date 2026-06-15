const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./config');

function ensure() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]');
}

function listar() {
  ensure();
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (e) { return []; }
}

function salvarTodos(arr) {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(arr, null, 2));
}

function adicionar(bilhete) {
  const arr = listar();
  arr.unshift(bilhete);
  salvarTodos(arr);
  return bilhete;
}

module.exports = { listar, adicionar, salvarTodos };
