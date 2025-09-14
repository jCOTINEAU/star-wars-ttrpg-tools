const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const BattleState = require('./src/state');

const PORT = process.env.PORT || 3010;
const GLOBAL_RANGE_BANDS = [200, 400, 800, 1600, 3200];
// Initial shared view centered roughly on logical coordinate 500:500
// Centering: translate so that 500,500 appears near middle of viewport. We store offsets; client applies translate(offsetX, offsetY) then scale.
// Positive offsetX moves map right; to bring (500,500) to center we shift left by 500*scale etc. We'll approximate; clients can re-center locally if viewport differs.
let sharedView = { scale: 0.5, offsetX: 0, offsetY: 0 };

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
  res.json({ ...state.getState(), rangeBands: GLOBAL_RANGE_BANDS, view: sharedView });
});

// Save current state (ships) to a file (admin action expected client-side)
app.post('/api/save-state', (req, res) => {
  // Simple admin gate: require ?admin=true
  if (req.query.admin !== 'true') return res.status(403).json({ error: 'Forbidden' });
  const outPath = path.join(__dirname, 'config', 'ships_ongoing.json');
  try {
    const shipsArr = Array.from(state.ships.values()).map(s => {
      const { id, name, icon, x, y, hp, maxHp, speed, silhouette, heading, showHp, showSpeed, showShield, shield, numberOf, hideFromViewer } = s;
      return { id, name, icon, x, y, hp, maxHp, speed, silhouette, heading, showHp, showSpeed, showShield, shield, numberOf, hideFromViewer };
    });
    fs.writeFileSync(outPath, JSON.stringify(shipsArr, null, 2), 'utf-8');
    res.json({ ok: true, file: 'config/ships_ongoing.json' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Root -> serve UI
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket events
io.on('connection', socket => {
  // Initial full sync
  socket.emit('fullState', { ...state.getState(), rangeBands: GLOBAL_RANGE_BANDS, view: sharedView });

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
  socket.on('setView', (view) => {
    if (!view || typeof view !== 'object') return;
    const s = Math.min(2.5, Math.max(0.15, Number(view.scale)));
    const ox = Number(view.offsetX) || 0;
    const oy = Number(view.offsetY) || 0;
    sharedView = { scale: s, offsetX: ox, offsetY: oy };
    io.emit('viewUpdated', sharedView);
  });
});

server.listen(PORT, () => {
  console.log(`Battlemap server running http://localhost:${PORT}`);
});
