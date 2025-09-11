const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Affichage</title>
      <meta charset="utf-8" />
      <style>
        html, body {
          margin: 0;
          padding: 0;
          width: 100vw;
          height: 100vh;
          background: black;
          position: relative;
          overflow: hidden;
        }
        #content-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          transform-origin: center center;
        }
        #content-wrapper img, #content-wrapper iframe, #content-wrapper canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
        img, iframe {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: none;
          user-select: none;
        }
        img { cursor: crosshair; }
        iframe { border: none; }
        #overlay-canvas {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 500;
          pointer-events: none;
          display: block;
        }
        .ping {
          position: absolute;
          width: 40px;
          height: 40px;
          border: 3px solid #ff6b35;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1000;
          animation: pingAnimation 1.5s ease-out forwards;
        }
        @keyframes pingAnimation {
          0% {
            transform: scale(0.5);
            opacity: 1;
            box-shadow: 0 0 20px #ff6b35;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
            box-shadow: 0 0 40px #ff6b35;
          }
          100% {
            transform: scale(2);
            opacity: 0;
            box-shadow: 0 0 60px #ff6b35;
          }
        }
      </style>
    </head>
    <body>
      <div id="content-wrapper">
        <img id="display-img" />
        <iframe id="display-iframe"></iframe>
        <canvas id="overlay-canvas"></canvas>
      </div>
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
  const wrapper = document.getElementById('content-wrapper');
  const img = document.getElementById('display-img');
        const iframe = document.getElementById('display-iframe');
        const overlayCanvas = document.getElementById('overlay-canvas');
        const ctx = overlayCanvas.getContext('2d');

  let overlayVisible = false;
  let localRevealedAreas = []; // {vx,vy,vr}
  let currentZoom = 1;
  let zoomOriginX = 0.5;
  let zoomOriginY = 0.5;

        function resizeCanvas() {
          // Keep canvas tied to wrapper base dimensions for consistent coordinate mapping
          overlayCanvas.width = wrapper.clientWidth;
          overlayCanvas.height = wrapper.clientHeight;
          if (overlayVisible) repaintOverlay();
        }

        function drawFullOverlay() {
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        function clearCanvas() {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        function revealAreaAbsolute(x, y, radius) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }

        function getContentRect() { return overlayCanvas.getBoundingClientRect(); }

        function applyArea(area) {
          let vx, vy, vr;
          if (area.vx !== undefined) { vx = area.vx; vy = area.vy; vr = area.vr; }
          else if (area.nx !== undefined) { vx = area.nx; vy = area.ny; vr = area.rBase / overlayCanvas.width; }
          else if (area.relX !== undefined) { vx = area.relX; vy = area.relY; vr = area.relRadius; }
          else if (area.x !== undefined) { vx = area.x / overlayCanvas.width; vy = area.y / overlayCanvas.height; vr = area.radius / overlayCanvas.width; }
          if (vx === undefined) return;
          const x = vx * overlayCanvas.width;
          const y = vy * overlayCanvas.height;
          const radius = vr * overlayCanvas.width;
          revealAreaAbsolute(x, y, radius);
        }

        function repaintOverlay() {
          if (!overlayVisible) return;
          clearCanvas();
          drawFullOverlay();
          localRevealedAreas.forEach(applyArea);
        }

        // Ping functionality (normalized & rendered inside wrapper)
        const _pingPool = [];
        const MAX_PINGS = 40;
        function createPingNormalized(vx, vy) {
          const rect = wrapper.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const baseW = rect.width / currentZoom;
          const baseH = rect.height / currentZoom;
          const ping = document.createElement('div');
          ping.className = 'ping';
          const px = vx * baseW;
          const py = vy * baseH;
          ping.style.left = (px - 20) + 'px';
          ping.style.top = (py - 20) + 'px';
          wrapper.appendChild(ping);
          _pingPool.push(ping);
          if (_pingPool.length > MAX_PINGS) {
            const old = _pingPool.shift();
            if (old && old.parentNode) old.remove();
          }
          // Remove only the ping element after animation
          setTimeout(() => { if (ping.isConnected) ping.remove(); }, 1500);
        }

        // Ping only inside active content element
        wrapper.addEventListener('click', (e) => {
          const activeEl = img.style.display !== 'none' ? img : (iframe.style.display !== 'none' ? iframe : null);
          if (!activeEl) return;
          const rect = activeEl.getBoundingClientRect();
          if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
          if (!rect.width || !rect.height) return;
          const vx = (e.clientX - rect.left) / rect.width;
          const vy = (e.clientY - rect.top) / rect.height;
          createPingNormalized(vx, vy);
          socket.emit('ping', { vx, vy, origin: 'display' });
        });

        // Listen for pings from other clients (normalized)
        socket.on('ping', (data) => {
          if (!data) return;
          if (data.vx !== undefined) {
            createPingNormalized(data.vx, data.vy);
          } else if (data.x !== undefined) {
            const rect = wrapper.getBoundingClientRect();
            const vx = (data.x - rect.left) / rect.width;
            const vy = (data.y - rect.top) / rect.height;
            if (vx >=0 && vx <=1 && vy >=0 && vy <=1) createPingNormalized(vx, vy);
          }
        });

        // --- Report viewport to server so admin can mimic dimensions ---
        function reportViewport() {
          socket.emit('displayViewport', { width: window.innerWidth, height: window.innerHeight });
        }
        window.addEventListener('load', reportViewport);
        let resizeTO;
        window.addEventListener('resize', () => {
          clearTimeout(resizeTO);
          resizeTO = setTimeout(reportViewport, 200);
        });
  socket.on('requestViewport', () => { reportViewport(); });

        // Listen for overlay events
        socket.on('overlayToggle', (data) => {
          overlayVisible = data.hidden;
          localRevealedAreas = data.revealedAreas.map(a => {
            if (a.vx !== undefined) return a;
            if (a.nx !== undefined) return { vx: a.nx, vy: a.ny, vr: a.rBase / overlayCanvas.width };
            if (a.relX !== undefined) return { vx: a.relX, vy: a.relY, vr: a.relRadius };
            if (a.x !== undefined) return { vx: a.x / overlayCanvas.width, vy: a.y / overlayCanvas.height, vr: a.radius / overlayCanvas.width };
            return a;
          });
          resizeCanvas();
        });

        socket.on('revealArea', (data) => {
          if (!overlayVisible) return;
          let area = data;
          if (data.vx === undefined) {
            if (data.nx !== undefined) area = { vx: data.nx, vy: data.ny, vr: data.rBase / overlayCanvas.width };
            else if (data.relX !== undefined) area = { vx: data.relX, vy: data.relY, vr: data.relRadius };
            else if (data.x !== undefined) area = { vx: data.x / overlayCanvas.width, vy: data.y / overlayCanvas.height, vr: data.radius / overlayCanvas.width };
          }
          localRevealedAreas.push(area);
          applyArea(area);
        });

        socket.on('zoom', (data) => {
          currentZoom = data.scale;
          zoomOriginX = data.originX;
          zoomOriginY = data.originY;
          const transformOrigin = (data.originX * 100) + '% ' + (data.originY * 100) + '%';
          wrapper.style.transformOrigin = transformOrigin;
          wrapper.style.transform = 'scale(' + currentZoom + ')';
        });

  socket.on('show', data => {
          if (!data) {
            img.style.display = "none";
            iframe.style.display = "none";
            iframe.src = "";
            img.src = "";
            return;
          }

          if (data.startsWith("url:")) {
            const url = data.substring(4);
            img.style.display = "none";
            iframe.src = url;
            iframe.style.display = "block";
          } else {
            iframe.style.display = "none";
            iframe.src = "";
            img.src = '/media/' + data;
            img.style.display = "block";
          }
          // (Pending ping queue removed in revert)
        });

        // Initialize canvas and get current state
  window.addEventListener('resize', () => { resizeCanvas(); repaintOverlay(); });
        resizeCanvas();
        socket.emit('getCurrent');
        socket.emit('getOverlayState');
      </script>
    </body>
    </html>
  `);
});

module.exports = router;

