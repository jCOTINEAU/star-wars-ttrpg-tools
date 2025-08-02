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
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        const img = document.getElementById('display-img');
        const iframe = document.getElementById('display-iframe');

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

        // Add click handler to image
        img.addEventListener('click', (e) => {
          if (img.style.display !== 'none') {
            const rect = img.getBoundingClientRect();
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

        socket.emit('getCurrent');
      </script>
    </body>
    </html>
  `);
});

module.exports = router;

