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
        img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: none;
          cursor: crosshair;
        }
        iframe {
          width: 100vw;
          height: 100vh;
          border: none;
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
          pointer-events: none;
          opacity: 0.5;
        }
        #overlay-canvas.revealing {
          pointer-events: all;
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
      <img id="display-img" />
      <iframe id="display-iframe"></iframe>
      <canvas id="overlay-canvas"></canvas>
      
      <div class="admin-controls">
        <div>Vue Admin - Masquage d'image</div>
        <div>
          <label>Taille du pinceau: 
            <input type="range" id="brush-size" min="10" max="100" value="30" class="brush-size">
            <span id="brush-size-display">30</span>px
          </label>
        </div>
        <button id="reset-overlay" style="background: #f44336; color: white;">Réinitialiser</button>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        const img = document.getElementById('display-img');
        const iframe = document.getElementById('display-iframe');
        const overlayCanvas = document.getElementById('overlay-canvas');
        const ctx = overlayCanvas.getContext('2d');
        const brushSizeSlider = document.getElementById('brush-size');
        const brushSizeDisplay = document.getElementById('brush-size-display');
        const resetOverlayBtn = document.getElementById('reset-overlay');

        let isDrawing = false;
        let brushSize = 30;
        let overlayVisible = false;

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

        function resizeCanvas() {
          overlayCanvas.width = window.innerWidth;
          overlayCanvas.height = window.innerHeight;
          if (overlayVisible) {
            drawFullOverlay();
          }
        }

        function drawFullOverlay() {
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        function clearCanvas() {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          if (overlayVisible) {
            drawFullOverlay();
          }
        }

        function revealArea(x, y, radius) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }

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
          const rect = overlayCanvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          revealArea(x, y, brushSize / 2);
          
          // Send to other clients
          socket.emit('revealArea', { x, y, radius: brushSize / 2 });
        }

        function draw(e) {
          if (!isDrawing || !overlayVisible) return;
          const rect = overlayCanvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          revealArea(x, y, brushSize / 2);
          
          // Send to other clients
          socket.emit('revealArea', { x, y, radius: brushSize / 2 });
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

        // Image click for pings (when not revealing)
        img.addEventListener('click', (e) => {
          if (img.style.display !== 'none' && !overlayVisible) {
            const x = e.clientX;
            const y = e.clientY;
            createPing(x, y);
            socket.emit('ping', { x, y });
          }
        });

        // Socket events
        socket.on('ping', (data) => {
          createPing(data.x, data.y);
        });

        socket.on('overlayToggle', (data) => {
          overlayVisible = data.hidden;
          if (overlayVisible) {
            overlayCanvas.classList.add('revealing');
            resizeCanvas();
            drawFullOverlay();
            // Apply existing revealed areas
            data.revealedAreas.forEach(area => {
              revealArea(area.x, area.y, area.radius);
            });
          } else {
            overlayCanvas.classList.remove('revealing');
            clearCanvas();
          }
        });

        socket.on('revealArea', (data) => {
          if (overlayVisible) {
            revealArea(data.x, data.y, data.radius);
          }
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
        });

        // Initialize
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        socket.emit('getCurrent');
        socket.emit('getOverlayState');
      </script>
    </body>
    </html>
  `);
});

module.exports = router;
