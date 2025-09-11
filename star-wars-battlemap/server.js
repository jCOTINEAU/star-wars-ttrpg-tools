const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const BattleState = require('./src/state');

const PORT = process.env.PORT || 3010;
const GLOBAL_RANGE_BANDS = [200, 400, 800, 1600];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// State
const state = new BattleState();
state.loadInitialShips(path.join(__dirname, 'config', 'ships.json'));

// Middleware & static assets
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'public')));

// API endpoints
app.get('/api/state', (req, res) => {
  res.json({ ...state.getState(), rangeBands: GLOBAL_RANGE_BANDS });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Root -> serve UI
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket events
io.on('connection', socket => {
  // Initial full sync
  socket.emit('fullState', { ...state.getState(), rangeBands: GLOBAL_RANGE_BANDS });

  socket.on('moveShip', ({ id, x, y }) => {
    if (typeof id !== 'string') return;
    const updated = state.moveShip(id, x, y);
    if (updated) {
      // Broadcast authoritative update
      io.emit('shipMoved', updated);
    }
  });

  socket.on('manualAttack', ({ attackerId, targetId, damage }) => {
    const result = state.manualAttack(attackerId, targetId, damage);
    if (result.error) return socket.emit('attackResult', result);
    io.emit('attackResult', result);
  });

  socket.on('updateShip', ({ id, patch }) => {
    if (typeof id !== 'string' || typeof patch !== 'object') return;
    const updated = state.updateShip(id, patch);
    if (updated.error) return socket.emit('shipUpdateResult', updated);
    io.emit('shipMoved', updated); // reuse existing handler to refresh position/hp/name
    socket.emit('shipUpdateResult', { ok: true, ship: updated });
  });

  socket.on('undoMove', () => {
    const undone = state.undoMove();
    if (undone) io.emit('shipMoved', undone);
  });
});

server.listen(PORT, () => {
  console.log(`Battlemap server running http://localhost:${PORT}`);
});
