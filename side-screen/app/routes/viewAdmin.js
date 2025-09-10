const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Vue Admin</title>
      <meta charset="utf-8" />
      <style>
        html, body {
          margin: 0;
          padding: 0;
          width: 100vw;
          height: 100vh;
          background: black;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        #content-wrapper {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          transform-origin: center center;
        }
        #content-wrapper img, #content-wrapper iframe, #content-wrapper canvas, #content-wrapper #iframe-overlay {
          position: absolute;
          top: 0;
          left: 0;
        }
        img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: none;
          cursor: crosshair;
          user-select: none;
        }
        iframe {
          width: 100vw;
          height: 100vh;
          border: none;
          display: none;
          user-select: none;
        }
        #iframe-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 100;
          pointer-events: all;
          display: none;
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
        #overlay-canvas {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 500;
          pointer-events: all;
          opacity: 0.01;
          display: block;
          transition: opacity 0.3s ease;
        }
        #overlay-canvas.hide-mode {
          opacity: 0.5;
        }
        #overlay-canvas.revealing {
          cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="white" stroke-width="2"/></svg>') 12 12, auto;
        }
        .admin-controls {
          position: fixed;
          top: 10px;
          right: 10px;
          z-index: 1001;
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 10px;
          border-radius: 5px;
          font-family: sans-serif;
          font-size: 14px;
        }
        .admin-controls button {
          margin: 5px;
          padding: 5px 10px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        .brush-size {
          margin: 5px;
        }
      </style>
    </head>
    <body>
      <div id="content-wrapper">
        <img id="display-img" />
        <iframe id="display-iframe"></iframe>
        <div id="iframe-overlay"></div>
        <canvas id="overlay-canvas"></canvas>
      </div>
      
      <div class="admin-controls">
        <div>Vue Admin - Masquage d'image</div>
        <div>
          <label>Taille du pinceau: 
            <input type="range" id="brush-size" min="10" max="100" value="30" class="brush-size">
            <span id="brush-size-display">30</span>px
          </label>
        </div>
        <div style="margin-top: 10px;">
          <label>Zoom: 
            <span id="zoom-display">100</span>%
          </label>
          <div style="margin-top: 5px;">
            <button id="zoom-out" style="background: #2196f3; color: white;">-</button>
            <button id="zoom-reset" style="background: #4caf50; color: white;">Reset</button>
            <button id="zoom-in" style="background: #2196f3; color: white;">+</button>
          </div>
        </div>
        <button id="reset-overlay" style="background: #f44336; color: white;">Réinitialiser</button>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
  const wrapper = document.getElementById('content-wrapper');
  const img = document.getElementById('display-img');
        const iframe = document.getElementById('display-iframe');
        const iframeOverlay = document.getElementById('iframe-overlay');
        const overlayCanvas = document.getElementById('overlay-canvas');
        const ctx = overlayCanvas.getContext('2d');
        const brushSizeSlider = document.getElementById('brush-size');
        const brushSizeDisplay = document.getElementById('brush-size-display');
        const resetOverlayBtn = document.getElementById('reset-overlay');
        const zoomDisplay = document.getElementById('zoom-display');
        const zoomInBtn = document.getElementById('zoom-in');
        const zoomOutBtn = document.getElementById('zoom-out');
        const zoomResetBtn = document.getElementById('zoom-reset');

        let isDrawing = false;
        let brushSize = 30;
        let overlayVisible = false;
  let currentZoom = 1;
  let zoomOriginX = 0.5; // 0.5 = center
  let zoomOriginY = 0.5;
  // Store strokes normalized to base canvas (viewport) size so wrapper scaling keeps alignment
  // Each area: { nx, ny, rBase }
  let localRevealedAreas = [];

        // Update brush size display
        brushSizeSlider.addEventListener('input', () => {
          brushSize = parseInt(brushSizeSlider.value);
          brushSizeDisplay.textContent = brushSize;
        });

        // Reset overlay button
        resetOverlayBtn.addEventListener('click', () => {
          fetch('/api/clear-revealed', { method: 'POST' })
            .then(() => {
              clearCanvas();
            })
            .catch(console.error);
        });

        // Zoom functionality
        function updateZoom(newZoom, originX = 0.5, originY = 0.5) {
          currentZoom = Math.max(0.1, Math.min(5, newZoom));
          zoomOriginX = originX;
          zoomOriginY = originY;
          const transformOrigin = (originX * 100) + '% ' + (originY * 100) + '%';
          wrapper.style.transformOrigin = transformOrigin;
          wrapper.style.transform = 'scale(' + currentZoom + ')';
          zoomDisplay.textContent = Math.round(currentZoom * 100);
          repaintOverlay();
          socket.emit('zoom', { scale: currentZoom, originX: zoomOriginX, originY: zoomOriginY });
        }

        // Zoom controls
        zoomInBtn.addEventListener('click', () => {
          updateZoom(currentZoom * 1.2);
        });

        zoomOutBtn.addEventListener('click', () => {
          updateZoom(currentZoom / 1.2);
        });

        zoomResetBtn.addEventListener('click', () => {
          updateZoom(1, 0.5, 0.5);
        });

        // Mouse wheel zoom
        document.addEventListener('wheel', (e) => {
          if (e.ctrlKey || e.metaKey) { // Ctrl/Cmd + wheel for zoom
            e.preventDefault();
            const rect = img.style.display !== 'none' ? 
              img.getBoundingClientRect() : 
              iframe.getBoundingClientRect();
            
            if (rect.width > 0 && rect.height > 0) {
              // Calculate zoom origin based on mouse position
              const originX = (e.clientX - rect.left) / rect.width;
              const originY = (e.clientY - rect.top) / rect.height;
              
              const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
              updateZoom(currentZoom * zoomFactor, originX, originY);
            }
          }
        });

        function resizeCanvas() {
          overlayCanvas.width = window.innerWidth;
          overlayCanvas.height = window.innerHeight;
          repaintOverlay();
        }

        function drawFullOverlay() {
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        function clearCanvas() {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          if (overlayVisible) drawFullOverlay();
        }

        function revealAreaAbsolute(x, y, radius) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }

        function applyArea(area) {
          const x = area.nx * overlayCanvas.width;
          const y = area.ny * overlayCanvas.height;
          const radius = area.rBase; // scales visually via wrapper zoom
          revealAreaAbsolute(x, y, radius);
        }

        function repaintOverlay() {
          if (!overlayVisible) return;
          clearCanvas();
          drawFullOverlay();
          localRevealedAreas.forEach(applyArea);
        }

  function getContentRect() { return overlayCanvas.getBoundingClientRect(); }

        // Mouse/touch drawing events
        overlayCanvas.addEventListener('mousedown', startDrawing);
        overlayCanvas.addEventListener('mousemove', draw);
        overlayCanvas.addEventListener('mouseup', stopDrawing);
        overlayCanvas.addEventListener('mouseout', stopDrawing);

        overlayCanvas.addEventListener('touchstart', handleTouch);
        overlayCanvas.addEventListener('touchmove', handleTouch);
        overlayCanvas.addEventListener('touchend', stopDrawing);

        function startDrawing(e) {
          if (!overlayVisible) return;
          isDrawing = true;
          e.stopPropagation(); // Prevent ping when drawing
          drawBrush(e);
        }

        function draw(e) {
          if (!isDrawing || !overlayVisible) return;
          e.stopPropagation();
          drawBrush(e);
        }

        function drawBrush(e) {
          const rect = overlayCanvas.getBoundingClientRect();
          if (rect.width === 0) return;
          const nx = (e.clientX - rect.left) / rect.width;
          const ny = (e.clientY - rect.top) / rect.height;
          const rBase = (brushSize / 2) / currentZoom; // constant on-screen size while painting
          const area = { nx, ny, rBase };
          localRevealedAreas.push(area);
          applyArea(area);
          socket.emit('revealArea', area);
        }

        function stopDrawing() {
          isDrawing = false;
        }

        function handleTouch(e) {
          e.preventDefault();
          const touch = e.touches[0];
          if (touch) {
            const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 
                                           e.type === 'touchmove' ? 'mousemove' : 'mouseup', {
              clientX: touch.clientX,
              clientY: touch.clientY
            });
            overlayCanvas.dispatchEvent(mouseEvent);
          }
        }

        // Ping functionality
        function createPing(x, y) {
          const ping = document.createElement('div');
          ping.className = 'ping';
          ping.style.left = (x - 20) + 'px';
          ping.style.top = (y - 20) + 'px';
          document.body.appendChild(ping);
          
          setTimeout(() => {
            if (ping.parentNode) {
              ping.parentNode.removeChild(ping);
            }
          }, 1500);
        }

        // Universal click handler for pings (works on any content when not revealing)
        document.addEventListener('click', (e) => {
          // Only ping if we're not in the middle of drawing/revealing
          if (!isDrawing) {
            const hasVisibleImage = img.style.display !== 'none';
            const hasVisibleIframe = iframe.style.display !== 'none';
            
            if (hasVisibleImage || hasVisibleIframe) {
              const x = e.clientX;
              const y = e.clientY;
              createPing(x, y);
              socket.emit('ping', { x, y });
            }
          }
        });

        // Socket events
        socket.on('ping', (data) => {
          createPing(data.x, data.y);
        });

  socket.on('overlayToggle', (data) => {
          overlayVisible = data.hidden;
          if (overlayVisible) {
            overlayCanvas.classList.add('hide-mode');
            overlayCanvas.classList.add('revealing');
            localRevealedAreas = data.revealedAreas.map(a => {
              if (a.nx !== undefined) return a;
              if (a.wx !== undefined) return { nx: a.wx, ny: a.wy, rBase: a.wr * overlayCanvas.width };
              if (a.relX !== undefined) return { nx: a.relX, ny: a.relY, rBase: a.relRadius * overlayCanvas.width };
              if (a.x !== undefined) return { nx: a.x / overlayCanvas.width, ny: a.y / overlayCanvas.height, rBase: a.radius };
              return a;
            });
            resizeCanvas();
            repaintOverlay();
          } else {
            overlayCanvas.classList.remove('hide-mode');
            overlayCanvas.classList.remove('revealing');
            clearCanvas();
          }
        });

  socket.on('revealArea', (data) => {
          if (!overlayVisible) return;
          let area = data;
          if (data.wx !== undefined) area = { nx: data.wx, ny: data.wy, rBase: data.wr * overlayCanvas.width };
          else if (data.relX !== undefined) area = { nx: data.relX, ny: data.relY, rBase: data.relRadius * overlayCanvas.width };
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
          zoomDisplay.textContent = Math.round(data.scale * 100);
        });

        socket.on('show', data => {
          if (!data) {
            img.style.display = "none";
            iframe.style.display = "none";
            iframe.src = "";
            img.src = "";
            iframeOverlay.style.display = "none";
            return;
          }

          if (data.startsWith("url:")) {
            const url = data.substring(4);
            img.style.display = "none";
            iframe.src = url;
            iframe.style.display = "block";
            // Show iframe overlay for iframe content
            iframeOverlay.style.display = "block";
          } else {
            iframe.style.display = "none";
            iframe.src = "";
            img.src = '/media/' + data;
            img.style.display = "block";
            // Hide iframe overlay for image content
            iframeOverlay.style.display = "none";
          }
        });

        // Initialize
        window.addEventListener('resize', () => {
          resizeCanvas();
          repaintOverlay();
        });
        resizeCanvas();
        socket.emit('getCurrent');
        socket.emit('getOverlayState');
      </script>
    </body>
    </html>
  `);
});

module.exports = router;
