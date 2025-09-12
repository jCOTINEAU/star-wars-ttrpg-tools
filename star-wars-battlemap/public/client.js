/* global io */
(function(){
  const socket = io();
  const query = new URLSearchParams(location.search);
  const isAdmin = query.get('admin') === 'true';
  const perfMode = query.get('perf') === '1';
  if (!isAdmin) document.body.classList.add('viewer');
  if (perfMode) document.body.classList.add('perf');
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
  const rangeOverlay = document.getElementById('rangeOverlay');
  let staticRangeOrigin = null; // {x,y,shipId}
  // Starfield
  let starCtx = null; let stars = null; let starAnimating = false; let starCanvas = null;
  function initStarfield(width, height) {
  if (perfMode) return; // disabled in performance mode
    if (!mapEl) return;
    if (starCanvas) {
      // If size changed, adjust
      if (starCanvas.width !== width || starCanvas.height !== height) {
        starCanvas.width = width; starCanvas.height = height;
      }
      return; // already initialized
    }
    starCanvas = document.createElement('canvas');
    starCanvas.id = 'starfield';
    starCanvas.width = width; starCanvas.height = height;
    mapEl.insertBefore(starCanvas, mapEl.firstChild);
    starCtx = starCanvas.getContext('2d');
    const starCount = Math.floor((width * height) / 20000); // slightly denser (~600 for 4000x3000)
    const palette = [
      '#ffffff', '#cfd9ff', '#ffe6c9', '#ffd2d2', '#d9f1ff', '#fff7e0'
    ];
    stars = new Array(starCount).fill(0).map(() => {
      // Size tiers
      const tierRand = Math.random();
      let r, amp, baseA;
      if (tierRand < 0.78) { // tiny distant
        r = Math.random()*0.7 + 0.35; baseA = Math.random()*0.35 + 0.10; amp = Math.random()*0.25 + 0.08;
      } else if (tierRand < 0.95) { // small/medium
        r = Math.random()*1.2 + 0.8; baseA = Math.random()*0.4 + 0.18; amp = Math.random()*0.35 + 0.15;
      } else { // rare bright
        r = Math.random()*1.6 + 1.2; baseA = Math.random()*0.5 + 0.30; amp = Math.random()*0.45 + 0.20;
      }
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r,
        baseA,
        amp,
        phase: Math.random()*Math.PI*2,
        speed: (Math.random()*0.7 + 0.15),
        color: palette[Math.floor(Math.random()*palette.length)]
      };
    });
    if (!starAnimating) {
      starAnimating = true;
      requestAnimationFrame(starLoop);
    }
  }

  function starLoop(ts) {
    if (!starCtx || !stars) return;
    starCtx.clearRect(0,0,starCanvas.width, starCanvas.height);
    // Slight background darken gradient (helps contrast) left subtle
    // Draw stars
    for (const s of stars) {
      const flicker = s.baseA + s.amp * Math.sin(s.phase + ts*0.001*s.speed);
      const a = Math.max(0, Math.min(1, flicker));
      // Core
      starCtx.fillStyle = hexToRgba(s.color, a);
      starCtx.beginPath();
      starCtx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      starCtx.fill();
      // Soft glow for brighter stars
      if (s.r > 1.0) {
        const glowA = a * 0.35;
        starCtx.fillStyle = hexToRgba(s.color, glowA);
        starCtx.beginPath();
        starCtx.arc(s.x, s.y, s.r*2.2, 0, Math.PI*2);
        starCtx.fill();
      }
    }
    if (starAnimating) requestAnimationFrame(starLoop);
  }

  function hexToRgba(hex, alpha) {
    let h = hex.replace('#','');
    if (h.length === 3) h = h.split('').map(c=>c+c).join('');
    const num = parseInt(h,16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function applyView() {
    mapEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  // Adjust ring stroke so it stays visible at small scales
  const rings = mapEl.querySelectorAll('.range-ring');
  const base = 2; // matches CSS base border width
  const adjusted = Math.min(6, base / scale); // thicker when zoomed out
  rings.forEach(r => { r.style.borderWidth = adjusted + 'px'; });
  // Range labels now scale with zoom (no inverse scaling)
  const labels = mapEl.querySelectorAll('.range-label');
  labels.forEach(l => { l.style.transform = 'translate(-50%, -120%)'; });
  }

  function clampScale(v){ return Math.min(2.5, Math.max(0.15, v)); }

  function createShipElement(ship) {
    let el = document.getElementById('ship-'+ship.id);
    if (!el) {
      el = document.createElement('div');
      el.id = 'ship-'+ship.id;
      el.className = 'ship';
      el.innerHTML = `<div class="rot">`+
        `<div class="icon ${ship.icon}" title="${ship.name}">${ship.name}</div>` +
        `<div class="hpbar"><div class="hp"></div></div>` +
        `<div class="speed"></div>` +
        `<div class="range-rings"></div>`+
      `</div>`;
      mapEl.appendChild(el);
      wireShipEvents(el, ship.id);
      const arrow = document.createElement('div');
      arrow.className = 'facing-arrow';
      const rotWrap = el.querySelector('.rot');
      (rotWrap||el).appendChild(arrow);
    }
    else {
      // Ensure arrow lives inside rotating wrapper for legacy nodes
      const rotWrap = el.querySelector('.rot');
      const arrow = el.querySelector('.facing-arrow');
      if (rotWrap && arrow && arrow.parentElement !== rotWrap) rotWrap.appendChild(arrow);
    }
    positionShipEl(el, ship);
  applySilhouette(el, ship);
    updateHpBar(el, ship);
    updateSpeed(el, ship);
  applyVisibilityFlags(el, ship);
  updateShieldArcs(el, ship);
    updateHeading(el, ship);
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
    if (ship.showShield) el.setAttribute('data-show-shield', 'true'); else el.removeAttribute('data-show-shield');
    if (ship.silhouette) el.setAttribute('data-silhouette', ship.silhouette);
  if (typeof ship.heading === 'number') el.setAttribute('data-heading', ship.heading);
  }

  const SIL_TABLE = { 3:{w:1,h:1},4:{w:1,h:1},5:{w:2,h:1},6:{w:2,h:1},7:{w:3,h:2},8:{w:4,h:2},9:{w:5,h:2},10:{w:6,h:3} };
  function applySilhouette(el, ship) {
    const s = SIL_TABLE[ship.silhouette] || SIL_TABLE[3];
    const base = 64; // px per square
    const wpx = s.w * base;
    const hpx = s.h * base;
    el.style.width = wpx + 'px';
    el.style.height = hpx + 'px';
    // Adjust directional shield depths so short edges project less
    // Depth as percentage of the perpendicular dimension
    const baseDepthPct = 32; // depth for long edges
    const shortDepth = 18;    // reduced depth for short edges
    if (wpx > hpx) {
      // Wider: top/bottom edges are the long edges (width); left/right are short
      el.style.setProperty('--shield-depth-up', baseDepthPct + '%');
      el.style.setProperty('--shield-depth-down', baseDepthPct + '%');
      el.style.setProperty('--shield-depth-left', shortDepth + '%');
      el.style.setProperty('--shield-depth-right', shortDepth + '%');
    } else if (hpx > wpx) {
      // Taller: left/right edges are the long edges (height); top/bottom are short
      el.style.setProperty('--shield-depth-left', baseDepthPct + '%');
      el.style.setProperty('--shield-depth-right', baseDepthPct + '%');
      el.style.setProperty('--shield-depth-up', shortDepth + '%');
      el.style.setProperty('--shield-depth-down', shortDepth + '%');
    } else {
      // Square
      el.style.setProperty('--shield-depth-up', baseDepthPct + '%');
      el.style.setProperty('--shield-depth-down', baseDepthPct + '%');
      el.style.setProperty('--shield-depth-left', baseDepthPct + '%');
      el.style.setProperty('--shield-depth-right', baseDepthPct + '%');
    }
    const hpBar = el.querySelector('.hpbar');
    if (hpBar) {
      const target = Math.max(50, Math.min(350, wpx - 4));
      hpBar.style.width = target + 'px';
    }
  }

  function updateHeading(el, ship) {
    if (!el) return;
    const rot = el.querySelector('.rot');
    if (rot && typeof ship.heading === 'number') {
      rot.style.transform = `rotate(${ship.heading}deg)`;
    }
  }

  function shieldIntensityClass(v) {
    const n = Math.max(0, Math.min(3, Number(v)||0));
    return 'int-' + n;
  }

  function updateShieldArcs(el, ship) {
    // Remove previous
    const container = el.querySelector('.rot') || el;
    const old = container.querySelector('.shield-arcs');
    const signature = ship.showShield ? JSON.stringify(ship.shield) : 'none';
    if (old && old.getAttribute('data-sig') === signature) return; // no change
    if (old) old.remove();
    if (!ship.showShield) return;
    const sh = ship.shield;
    if (!sh || !sh.type || sh.type === 'none') return;
    const wrap = document.createElement('div');
    wrap.className = 'shield-arcs';
    wrap.setAttribute('data-sig', signature);
    if (sh.type === 'full') {
      if (Number(sh.value) > 0) {
        const d = document.createElement('div');
        d.className = 'shield-arc full ' + shieldIntensityClass(sh.value) + (perfMode ? ' simple' : '');
        wrap.appendChild(d);
      }
    } else if (sh.type === 'directional') {
      // Mapping: arrow points to the screen-right side => front=right semicircle
      // Clockwise order starting from front (right): front (right edge), right (bottom), back (left edge), left (top)
      const dirs = [ ['front','dir-right'], ['right','dir-down'], ['back','dir-left'], ['left','dir-up'] ];
      dirs.forEach(([key, dirClass]) => {
        const val = sh[key];
        if (val == null || Number(val) <= 0) return; // skip zero/absent
        const d = document.createElement('div');
        d.className = 'shield-arc ' + dirClass + ' ' + shieldIntensityClass(val) + (perfMode ? ' simple' : '');
        wrap.appendChild(d);
      });
    }
    container.appendChild(wrap);
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
  if (el) el.classList.add('selected');
  staticRangeOrigin = { x: ship.x, y: ship.y, shipId: ship.id };
  renderRangeRings(el, ship);
    selectedInfo.textContent = `Selected: ${ship.name} (HP ${ship.hp}/${ship.maxHp})`;
  if (isAdmin) openShipPanel(ship);
  }

  function clearSelection() {
    if (!selectedShipId) return;
    const prev = document.getElementById('ship-'+selectedShipId);
  if (prev) prev.classList.remove('selected');
  rangeOverlay.innerHTML = '';
    selectedShipId = null;
    selectedInfo.textContent = 'No selection';
  if (isAdmin) hideShipPanel();
  }

  function renderRangeRings(el, ship) {
    rangeOverlay.innerHTML = '';
    if (!ship) return;
    const originX = staticRangeOrigin && staticRangeOrigin.shipId === ship.id ? staticRangeOrigin.x : ship.x;
    const originY = staticRangeOrigin && staticRangeOrigin.shipId === ship.id ? staticRangeOrigin.y : ship.y;
    const labels = ['CLOSE','SHORT','MEDIUM','LONG','EXTREME'];
    (globalRangeBands || []).forEach((r, idx) => {
      const ring = document.createElement('div');
      ring.className = 'range-ring band-'+idx;
      ring.style.width = (r*2)+'px';
      ring.style.height = (r*2)+'px';
      ring.style.left = originX + 'px';
      ring.style.top = originY + 'px';
      ring.style.transform = 'translate(-50%, -50%)';
      const base = 2;
      ring.style.borderWidth = Math.min(6, base / scale) + 'px';
      // Label
      const label = document.createElement('div');
      label.className = 'range-label';
      label.textContent = labels[idx] || '';
  // Inverse scale so it appears constant size
  label.style.transform = 'translate(-50%, -120%)';
      ring.appendChild(label);
      rangeOverlay.appendChild(ring);
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
        // Rings remain at original origin until drop
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
        if (selectedShipId === id) {
          staticRangeOrigin = { x: ship.x, y: ship.y, shipId: id };
          renderRangeRings(el, ship);
        }
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
  if (!perfMode) initStarfield(data.map.width, data.map.height);
    if (data.view) {
      if (typeof data.view.scale === 'number') scale = clampScale(data.view.scale);
      if (typeof data.view.offsetX === 'number') offsetX = data.view.offsetX;
      if (typeof data.view.offsetY === 'number') offsetY = data.view.offsetY;
    }
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
  updateHeading(el, ship);
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

  socket.on('viewUpdated', (v) => {
    if (!v) return;
    if (typeof v.scale === 'number') scale = clampScale(v.scale);
    if (typeof v.offsetX === 'number') offsetX = v.offsetX;
    if (typeof v.offsetY === 'number') offsetY = v.offsetY;
    applyView();
  });

  // UI controls
  function broadcastView(){ socket.emit('setView', { scale, offsetX, offsetY }); }
  document.getElementById('zoomIn').onclick = () => { scale = clampScale(scale + ZOOM_STEP); applyView(); broadcastView(); };
  document.getElementById('zoomOut').onclick = () => { scale = clampScale(scale - ZOOM_STEP); applyView(); broadcastView(); };
  document.getElementById('resetView').onclick = () => { scale = 0.5; offsetX = 0; offsetY = 0; applyView(); broadcastView(); };
  document.getElementById('panLeft').onclick = () => { offsetX += PAN_STEP; applyView(); broadcastView(); };
  document.getElementById('panRight').onclick = () => { offsetX -= PAN_STEP; applyView(); broadcastView(); };
  document.getElementById('panUp').onclick = () => { offsetY += PAN_STEP; applyView(); broadcastView(); };
  document.getElementById('panDown').onclick = () => { offsetY -= PAN_STEP; applyView(); broadcastView(); };
  const undoBtn = document.getElementById('undoMove');
  if (undoBtn) undoBtn.onclick = () => { socket.emit('undoMove'); };

  // Keyboard arrow key panning
  window.addEventListener('keydown', (e) => {
    const ROT_STEP = 15; // degrees per key press
    if (selectedShipId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const ship = ships.get(selectedShipId);
      if (ship) {
        let heading = ship.heading || 0;
        heading += (e.key === 'ArrowLeft' ? -ROT_STEP : ROT_STEP);
        heading = (heading % 360 + 360) % 360;
        ship.heading = heading; // optimistic update
        const el = document.getElementById('ship-'+ship.id);
        updateHeading(el, ship);
        socket.emit('updateShip', { id: ship.id, patch: { heading } });
        e.preventDefault();
      }
      return;
    }
    // Panning when no rotation triggered (or no selection)
    let used = false;
    if (e.key === 'ArrowLeft') { offsetX += PAN_STEP; used = true; }
    else if (e.key === 'ArrowRight') { offsetX -= PAN_STEP; used = true; }
    else if (e.key === 'ArrowUp') { offsetY += PAN_STEP; used = true; }
    else if (e.key === 'ArrowDown') { offsetY -= PAN_STEP; used = true; }
    if (used) { applyView(); broadcastView(); e.preventDefault(); }
  });

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
  if (shipForm.silhouette) shipForm.silhouette.value = ship.silhouette || 3;
  shipForm.showHp.checked = !!ship.showHp;
  shipForm.showSpeed.checked = !!ship.showSpeed;
  if (shipForm.showShield) shipForm.showShield.checked = !!ship.showShield;
    // Shield fields
    const st = ship.shield?.type || 'none';
    shipForm.shieldType.value = st;
    toggleShieldMode(st);
    if (st === 'full') {
      shipForm.shieldValue.value = ship.shield?.value ?? 0;
    } else if (st === 'directional') {
      shipForm.shieldFront.value = ship.shield?.front ?? ship.shield?.up ?? 0;
      shipForm.shieldBack.value = ship.shield?.back ?? ship.shield?.down ?? 0;
      shipForm.shieldLeft.value = ship.shield?.left ?? 0;
      shipForm.shieldRight.value = ship.shield?.right ?? 0;
    }
    shipFormStatus.textContent = '';
  }
  function hideShipPanel() {
    panelShipId = null;
    shipPanel.classList.add('hidden');
  }
  if (isAdmin) {
    function toggleShieldMode(mode) {
      const fullBox = shipForm.querySelector('[data-shield-mode="full"]');
      const dirBox = shipForm.querySelector('[data-shield-mode="directional"]');
      if (fullBox) fullBox.style.display = (mode === 'full') ? 'block' : 'none';
      if (dirBox) dirBox.style.display = (mode === 'directional') ? 'grid' : 'none';
    }
    shipForm.shieldType.addEventListener('change', () => {
      toggleShieldMode(shipForm.shieldType.value);
    });
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
  ,showShield: shipForm.showShield.checked
  ,silhouette: Number(shipForm.silhouette.value)||3
      };
      // Shield patch
      const st = shipForm.shieldType.value;
      if (st === 'full') {
  const val = Math.max(0, Math.min(3, Number(shipForm.shieldValue.value)||0));
  patch.shield = { type: 'full', value: val };
    } else if (st === 'directional') {
  const front = Math.max(0, Math.min(3, Number(shipForm.shieldFront.value)||0));
  const back = Math.max(0, Math.min(3, Number(shipForm.shieldBack.value)||0));
  const left = Math.max(0, Math.min(3, Number(shipForm.shieldLeft.value)||0));
  const right = Math.max(0, Math.min(3, Number(shipForm.shieldRight.value)||0));
  patch.shield = { type: 'directional', front, back, left, right };
      } else {
        patch.shield = null;
      }
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
          if (shipForm.showShield) shipForm.showShield.checked = !!s.showShield;
          if (shipForm.silhouette) shipForm.silhouette.value = s.silhouette || 3;
          const st2 = s.shield?.type || 'none';
          shipForm.shieldType.value = st2; toggleShieldMode(st2);
          if (st2 === 'full') {
            shipForm.shieldValue.value = s.shield?.value ?? 0;
          } else if (st2 === 'directional') {
            shipForm.shieldFront.value = s.shield?.front ?? s.shield?.up ?? 0;
            shipForm.shieldBack.value = s.shield?.back ?? s.shield?.down ?? 0;
            shipForm.shieldLeft.value = s.shield?.left ?? 0;
            shipForm.shieldRight.value = s.shield?.right ?? 0;
          }
        }
        if (selectedShipId === s.id) {
          selectedInfo.textContent = `Selected: ${s.name} (HP ${s.hp}/${s.maxHp})`;
        }
  const el = document.getElementById('ship-'+s.id);
        if (el) { updateSpeed(el, s); applyVisibilityFlags(el, s); }
  if (el) applySilhouette(el, s);
  if (el) updateShieldArcs(el, s);
        setTimeout(() => { if (shipFormStatus.textContent === 'Saved') shipFormStatus.textContent=''; }, 1500);
      }
    });

    // --- Cursor coordinate overlay ---
    const coordEl = document.getElementById('cursorCoords');
    const viewportEl = document.getElementById('viewport');
    if (coordEl && viewportEl) {
      function updateCoords(e) {
        const mapRect = mapEl.getBoundingClientRect();
        if (e.clientX < mapRect.left || e.clientX > mapRect.right || e.clientY < mapRect.top || e.clientY > mapRect.bottom) {
          coordEl.classList.add('hidden');
          return;
        }
        const lx = (e.clientX - mapRect.left) / scale;
        const ly = (e.clientY - mapRect.top) / scale;
        coordEl.textContent = `${Math.round(lx)} : ${Math.round(ly)}`;
        coordEl.classList.remove('hidden');
      }
      viewportEl.addEventListener('mousemove', updateCoords);
      viewportEl.addEventListener('mouseleave', () => coordEl.classList.add('hidden'));
    }
  }

})();
