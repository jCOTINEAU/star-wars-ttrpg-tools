/* global io */
(function(){
  const socket = io();
  const query = new URLSearchParams(location.search);
  const isAdmin = query.get('admin') === 'true';
  if (!isAdmin) document.body.classList.add('viewer');
  const mapEl = document.getElementById('map');
  const selectedInfo = document.getElementById('selectedInfo');
  const attackModal = document.getElementById('attackModal');
  // Ship edit panel elements
  const shipPanel = document.getElementById('shipPanel');
  const shipForm = document.getElementById('shipForm');
  const closePanelBtn = document.getElementById('closePanel');
  const shipFormStatus = document.getElementById('shipFormStatus');
  let panelShipId = null;
  const attackForm = document.getElementById('attackForm');
  const damageInput = document.getElementById('damageInput');
  const cancelAttackBtn = document.getElementById('cancelAttack');
  const attackResultBox = document.getElementById('attackResult');
  let pendingAttack = null; // { attackerId, targetId }

  let ships = new Map(); // id -> ship data
  let globalRangeBands = [200,400,800,1600];
  let selectedShipId = null;
  // Track previous selection so user can: click attacker, then double-click target
  let previousSelectedShipId = null;
  let lastSelectionTimestamp = 0;
  let scale = 0.5; // default starting zoom (fit bigger map)
  let offsetX = 0; // panning
  let offsetY = 0;
  const ZOOM_STEP = 0.1;
  const PAN_STEP = 200;
  const LONG_PRESS_MS = 1000; // 1 second hold for attack
  const DRAG_THRESHOLD = 4;   // px before starting drag cancels long press

  function applyView() {
    mapEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  // Adjust ring stroke so it stays visible at small scales
  const rings = mapEl.querySelectorAll('.range-ring');
  const base = 2; // matches CSS base border width
  const adjusted = Math.min(6, base / scale); // thicker when zoomed out
  rings.forEach(r => { r.style.borderWidth = adjusted + 'px'; });
  }

  function clampScale(v){ return Math.min(2.5, Math.max(0.15, v)); }

  function createShipElement(ship) {
    let el = document.getElementById('ship-'+ship.id);
    if (!el) {
      el = document.createElement('div');
      el.id = 'ship-'+ship.id;
      el.className = 'ship';
      el.innerHTML = `<div class="icon ${ship.icon}" title="${ship.name}">${ship.name}</div>` +
        `<div class="hpbar"><div class="hp"></div></div>` +
        `<div class="speed"></div>` +
        `<div class="range-rings"></div>`;
      mapEl.appendChild(el);
      wireShipEvents(el, ship.id);
    }
    positionShipEl(el, ship);
    updateHpBar(el, ship);
    updateSpeed(el, ship);
  applyVisibilityFlags(el, ship);
    return el;
  }

  function positionShipEl(el, ship) {
    el.style.left = ship.x + 'px';
    el.style.top = ship.y + 'px';
  }

  function updateHpBar(el, ship) {
    const hpPct = Math.max(0, ship.hp) / ship.maxHp;
    el.querySelector('.hp').style.width = (hpPct*100)+'%';
    el.querySelector('.hp').style.background = hpPct < 0.3 ? '#ff4242' : hpPct < 0.6 ? '#ffc107' : '#3df969';
  }

  function updateSpeed(el, ship) {
    const speedEl = el.querySelector('.speed');
    if (!speedEl) return;
    const s = Math.max(0, Math.min(5, ship.speed || 0));
    speedEl.textContent = '>' .repeat ? '>'.repeat(s) : Array(s).fill('>').join('');
  }

  function applyVisibilityFlags(el, ship) {
    if (!el) return;
    if (ship.showHp) el.setAttribute('data-show-hp', 'true'); else el.removeAttribute('data-show-hp');
    if (ship.showSpeed) el.setAttribute('data-show-speed', 'true'); else el.removeAttribute('data-show-speed');
  }

  function selectShip(id) {
    if (selectedShipId === id) { // toggle off
      clearSelection();
      return;
    }
    // Remember the previously selected (attacker candidate)
    previousSelectedShipId = selectedShipId;
    clearSelection();
    selectedShipId = id;
    lastSelectionTimestamp = Date.now();
    const ship = ships.get(id);
    if (!ship) return;
    const el = document.getElementById('ship-'+id);
    if (el) {
      el.classList.add('selected');
      renderRangeRings(el, ship);
    }
    selectedInfo.textContent = `Selected: ${ship.name} (HP ${ship.hp}/${ship.maxHp})`;
  if (isAdmin) openShipPanel(ship);
  }

  function clearSelection() {
    if (!selectedShipId) return;
    const prev = document.getElementById('ship-'+selectedShipId);
    if (prev) {
      prev.classList.remove('selected');
      const rings = prev.querySelector('.range-rings');
      if (rings) rings.innerHTML = '';
    }
    selectedShipId = null;
    selectedInfo.textContent = 'No selection';
  if (isAdmin) hideShipPanel();
  }

  function renderRangeRings(el, ship) {
    const container = el.querySelector('.range-rings');
    container.innerHTML = '';
    (globalRangeBands || []).forEach((r, idx) => {
      const ring = document.createElement('div');
      ring.className = 'range-ring band-'+idx;
      ring.style.width = (r*2)+'px';
      ring.style.height = (r*2)+'px';
  // Immediate border width set based on current scale
  const base = 2;
  ring.style.borderWidth = Math.min(6, base / scale) + 'px';
      container.appendChild(ring);
    });
  }

  // Drag logic with coordinate transform
  function wireShipEvents(el, id) {
    let dragging = false;
    let dragStart = null;
    let pressTimer = null;
    let longPressTriggered = false;
    let startPos = null;

    const clearTimers = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };

    function pointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return; // only left / primary
      e.stopPropagation();
      longPressTriggered = false;
      dragging = false;
      startPos = { x: e.clientX, y: e.clientY };
      dragStart = { mx: e.clientX, my: e.clientY };
      // Don't immediately select; wait to see if it's a drag, tap, or long press
      clearTimers();
      pressTimer = setTimeout(() => {
        // Long press path (attack attempt) if attacker selected and target different
        if (!dragging && selectedShipId && selectedShipId !== id) {
          longPressTriggered = true;
          pendingAttack = { attackerId: selectedShipId, targetId: id };
          damageInput.value = '0';
          attackResultBox.textContent = '';
          attackModal.classList.remove('hidden');
          damageInput.focus();
        } else if (!dragging) {
          // Otherwise treat as selecting this ship after long press if no attacker
          selectShip(id);
        }
      }, LONG_PRESS_MS);
      el.classList.add('pressing');
    }

    function pointerMove(e) {
      if (!startPos) return;
      const dx0 = e.clientX - startPos.x;
      const dy0 = e.clientY - startPos.y;
      const distSq = dx0*dx0 + dy0*dy0;
      if (!dragging && distSq > DRAG_THRESHOLD*DRAG_THRESHOLD) {
        // Initiate drag: cancel long press, select ship (for move)
        clearTimers();
        if (selectedShipId !== id) selectShip(id);
        dragging = true;
        el.classList.add('dragging');
      }
      if (dragging) {
        const ship = ships.get(id);
        const dx = (e.clientX - dragStart.mx) / scale;
        const dy = (e.clientY - dragStart.my) / scale;
        dragStart.mx = e.clientX; dragStart.my = e.clientY;
        ship.x += dx; ship.y += dy;
        positionShipEl(el, ship);
      }
    }

    function pointerUp(e) {
      if (!startPos) return;
      clearTimers();
      el.classList.remove('pressing');
      if (dragging) {
        dragging = false;
        el.classList.remove('dragging');
        const ship = ships.get(id);
        socket.emit('moveShip', { id, x: ship.x, y: ship.y });
      } else if (!longPressTriggered) {
        // Simple tap selection (no drag, no long press)
        selectShip(id);
      }
      startPos = null;
    }

    el.addEventListener('mousedown', pointerDown);
    window.addEventListener('mousemove', pointerMove);
    window.addEventListener('mouseup', pointerUp);
    // Touch / stylus support
    el.addEventListener('touchstart', (e) => pointerDown(e.touches[0]), { passive: true });
    window.addEventListener('touchmove', (e) => pointerMove(e.touches[0]), { passive: true });
    window.addEventListener('touchend', pointerUp, { passive: true });
  }

  function handleFullState(data) {
    if (Array.isArray(data.rangeBands)) globalRangeBands = data.rangeBands.slice();
    ships = new Map(data.ships.map(s => [s.id, s]));
    mapEl.style.width = data.map.width + 'px';
    mapEl.style.height = data.map.height + 'px';
    ships.forEach(ship => createShipElement(ship));
    applyView();
  }

  // Socket listeners
  socket.on('fullState', handleFullState);
  socket.on('shipMoved', (ship) => {
    ships.set(ship.id, ship);
    const el = createShipElement(ship);
  if (ship.id === selectedShipId) {
      renderRangeRings(el, ship);
      selectedInfo.textContent = `Selected: ${ship.name} (HP ${ship.hp}/${ship.maxHp})`;
    }
  });
  socket.on('attackResult', (res) => {
    if (res.error) return;
    const target = ships.get(res.targetId);
    if (target) {
      target.hp = res.remainingHp;
      const el = document.getElementById('ship-'+target.id);
      if (el) updateHpBar(el, target);
      if (target.id === selectedShipId) {
        selectedInfo.textContent = `Selected: ${target.name} (HP ${target.hp}/${target.maxHp})`;
      }
    }
    // Show result summary inside modal (if still open) else ephemeral
    attackResultBox.textContent = `Applied Damage: ${res.damage}`;
    if (res.damage > 0) animateLaser(res.attackerId, res.targetId);
  });

  // UI controls
  document.getElementById('zoomIn').onclick = () => { scale = clampScale(scale + ZOOM_STEP); applyView(); };
  document.getElementById('zoomOut').onclick = () => { scale = clampScale(scale - ZOOM_STEP); applyView(); };
  document.getElementById('resetView').onclick = () => { scale = 0.5; offsetX = 0; offsetY = 0; applyView(); };
  document.getElementById('panLeft').onclick = () => { offsetX += PAN_STEP; applyView(); };
  document.getElementById('panRight').onclick = () => { offsetX -= PAN_STEP; applyView(); };
  document.getElementById('panUp').onclick = () => { offsetY += PAN_STEP; applyView(); };
  document.getElementById('panDown').onclick = () => { offsetY -= PAN_STEP; applyView(); };

  // Background click clears selection
  mapEl.addEventListener('mousedown', () => { clearSelection(); });

  // Modal handling
  cancelAttackBtn.addEventListener('click', () => { attackModal.classList.add('hidden'); pendingAttack = null; });
  attackForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pendingAttack) return;
    const damage = Number(damageInput.value)||0;
    socket.emit('manualAttack', { ...pendingAttack, damage });
    if (damage === 0) {
      // If no damage just close right away
      attackModal.classList.add('hidden');
      pendingAttack = null;
    } else {
      // Keep modal shortly then auto close
      setTimeout(() => { attackModal.classList.add('hidden'); pendingAttack = null; }, 900);
    }
  });

  function animateLaser(attackerId, targetId) {
    const aEl = document.getElementById('ship-'+attackerId);
    const tEl = document.getElementById('ship-'+targetId);
    if (!aEl || !tEl) return;
    const laser = document.createElement('div');
    laser.className = 'laser';
    // Center coordinates (ships are visually centered due to translate(-50%,-50%) on themselves)
    const ax = aEl.offsetLeft, ay = aEl.offsetTop;
    const tx = tEl.offsetLeft, ty = tEl.offsetTop;
    const dx = tx - ax, dy = ty - ay;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const angle = Math.atan2(dy, dx) * 180/Math.PI;
    Object.assign(laser.style, {
      position: 'absolute',
      left: ax + 'px',
      top: ay + 'px',
      width: dist + 'px',
      height: '4px',
      transformOrigin: '0 50%',
      transform: `rotate(${angle}deg)`,
      background: 'linear-gradient(90deg,#fff,#f00 60%,#800)',
      boxShadow: '0 0 6px 2px #f33',
      borderRadius: '2px',
      opacity: '1',
      transition: 'opacity 0.35s ease',
      pointerEvents: 'none',
      zIndex: 50
    });
    mapEl.appendChild(laser);
    // Brief flash effect by shrinking via scale after a frame
    requestAnimationFrame(() => {
      laser.style.opacity = '0';
    });
    setTimeout(() => { laser.remove(); }, 400);
  }

  // ----- Ship Panel (Admin) -----
  function openShipPanel(ship) {
    panelShipId = ship.id;
    shipPanel.classList.remove('hidden');
    shipForm.name.value = ship.name;
    shipForm.hp.value = ship.hp;
    shipForm.maxHp.value = ship.maxHp;
    shipForm.speed.value = ship.speed ?? 0;
  shipForm.showHp.checked = !!ship.showHp;
  shipForm.showSpeed.checked = !!ship.showSpeed;
    shipFormStatus.textContent = '';
  }
  function hideShipPanel() {
    panelShipId = null;
    shipPanel.classList.add('hidden');
  }
  if (isAdmin) {
    shipForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!panelShipId) return;
      const patch = {
        name: shipForm.name.value.trim(),
        hp: Number(shipForm.hp.value),
        maxHp: Number(shipForm.maxHp.value),
        speed: Number(shipForm.speed.value)
  ,showHp: shipForm.showHp.checked
  ,showSpeed: shipForm.showSpeed.checked
      };
      socket.emit('updateShip', { id: panelShipId, patch });
      shipFormStatus.textContent = 'Saving...';
      shipFormStatus.style.color = '#8bc34a';
    });
    closePanelBtn.addEventListener('click', hideShipPanel);
    socket.on('shipUpdateResult', (res) => {
      if (res.error) {
        shipFormStatus.textContent = res.error;
        shipFormStatus.style.color = '#ff6666';
      } else if (res.ok && res.ship) {
        const s = res.ship;
        ships.set(s.id, s);
        if (panelShipId === s.id) {
          shipFormStatus.textContent = 'Saved';
          shipForm.name.value = s.name;
          shipForm.hp.value = s.hp;
          shipForm.maxHp.value = s.maxHp;
          shipForm.speed.value = s.speed ?? 0;
          shipForm.showHp.checked = !!s.showHp;
          shipForm.showSpeed.checked = !!s.showSpeed;
        }
        if (selectedShipId === s.id) {
          selectedInfo.textContent = `Selected: ${s.name} (HP ${s.hp}/${s.maxHp})`;
        }
  const el = document.getElementById('ship-'+s.id);
        if (el) { updateSpeed(el, s); applyVisibilityFlags(el, s); }
        setTimeout(() => { if (shipFormStatus.textContent === 'Saved') shipFormStatus.textContent=''; }, 1500);
      }
    });
  }

})();
