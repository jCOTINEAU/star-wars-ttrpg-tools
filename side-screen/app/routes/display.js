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
      <img id="display-img" />
      <iframe id="display-iframe"></iframe>
      <canvas id="overlay-canvas"></canvas>
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        const img = document.getElementById('display-img');
        const iframe = document.getElementById('display-iframe');
        const overlayCanvas = document.getElementById('overlay-canvas');
        const ctx = overlayCanvas.getContext('2d');

        let overlayVisible = false;

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
        }

        function revealArea(x, y, radius) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
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
          resizeCanvas();
          if (overlayVisible) {
            // Hidden ON: Draw black overlay with revealed areas
            drawFullOverlay();
            data.revealedAreas.forEach(area => {
              revealArea(area.x, area.y, area.radius);
            });
          } else {
            // Hidden OFF: Clear everything (fully transparent)
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

        // Initialize canvas and get current state
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

