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
        }
        img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: none;
        }
        iframe {
          width: 100vw;
          height: 100vh;
          border: none;
          display: none;
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

