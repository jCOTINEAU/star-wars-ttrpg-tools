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
        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: none;
          cursor: crosshair;
          user-select: none;
        }
        iframe {
          border: none;
          display: none;
          user-select: none;
          width: 100%;
          height: 100%;
        }
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
  let localRevealedAreas = [];
  let currentZoom = 1;
  let zoomOriginX = 0.5;
  let zoomOriginY = 0.5;

        function resizeCanvas() {
          overlayCanvas.width = window.innerWidth;
          overlayCanvas.height = window.innerHeight;
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
          const x = area.nx * overlayCanvas.width;
          const y = area.ny * overlayCanvas.height;
          const radius = area.rBase; // wrapper scaling applies
          revealAreaAbsolute(x, y, radius);
        }

        function repaintOverlay() {
          if (!overlayVisible) return;
          clearCanvas();
          drawFullOverlay();
          localRevealedAreas.forEach(applyArea);
        }

        // Ping functionality
        function createPing(x, y) {
          const ping = document.createElement('div');
          ping.className = 'ping';
          ping.style.left = (x - 20) + 'px'; // Center the ping circle
          ping.style.top = (y - 20) + 'px';
          document.body.appendChild(ping);
          
          // Remove the ping element after animation
          setTimeout(() => {
            if (ping.parentNode) {
              ping.parentNode.removeChild(ping);
            }
          }, 1500);
        }

        // Universal click handler for pings (works on any content)
        document.addEventListener('click', (e) => {
          // Check if we have visible content (image or iframe)
          const hasVisibleImage = img.style.display !== 'none';
          const hasVisibleIframe = iframe.style.display !== 'none';
          
          if (hasVisibleImage || hasVisibleIframe) {
            const x = e.clientX;
            const y = e.clientY;
            
            // Create ping locally
            createPing(x, y);
            
            // Send ping to other clients
            socket.emit('ping', { x, y });
          }
        });

        // Listen for pings from other clients
        socket.on('ping', (data) => {
          createPing(data.x, data.y);
        });

        // Listen for overlay events
        socket.on('overlayToggle', (data) => {
          overlayVisible = data.hidden;
          localRevealedAreas = data.revealedAreas.map(a => {
            if (a.nx !== undefined) return a;
            if (a.wx !== undefined) return { nx: a.wx, ny: a.wy, rBase: a.wr * overlayCanvas.width };
            if (a.relX !== undefined) return { nx: a.relX, ny: a.relY, rBase: a.relRadius * overlayCanvas.width };
            if (a.x !== undefined) return { nx: a.x / overlayCanvas.width, ny: a.y / overlayCanvas.height, rBase: a.radius };
            return a;
          });
          resizeCanvas();
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

