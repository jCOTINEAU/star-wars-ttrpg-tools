const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const mediaDir = path.join(__dirname, "media");
let currentImage = null;

// Serve static images
app.use("/media", express.static(mediaDir));

// Serve client display page
app.get("/", (req, res) => {
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

// Serve admin panel
app.get("/admin", (req, res) => {
  fs.readdir(mediaDir, (err, files) => {
    const images = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    const buttons = images.map(img => `
      <div>
        <img src="/media/${img}" style="max-width:150px" />
        <form method="POST" action="/set" style="margin-top:5px;">
          <input type="hidden" name="img" value="${img}" />
          <button type="submit">Afficher</button>
        </form>
      </div>
    `).join("");

    res.send(`
      <html>
      <head>
        <title>Contrôle</title>
        <style>
          body { font-family: sans-serif; }
          form { margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <h1>Sélectionne une image ou une URL à afficher</h1>

        <div>
          <form method="POST" action="/set">
            <input type="text" name="imgUrl" placeholder="Entrez une URL (ex: https://example.com)" style="width:300px;" required />
            <button type="submit" style="background: #4caf50; color: white; padding: 10px; font-size: 16px;">Afficher l’URL</button>
          </form>
        </div>

        <div>
          <form method="POST" action="/set">
            <input type="hidden" name="img" value="" />
            <button type="submit" style="background: #f44336; color: white; padding: 10px; font-size: 16px;">Vider l’écran</button>
          </form>
        </div>

        <hr/>

        <div style="display: flex; flex-wrap: wrap; gap: 20px;">
          ${buttons}
        </div>
      </body>
      </html>
    `);
  });
});

// Handle selection (image, URL, or clear)
app.use(express.urlencoded({ extended: true }));
app.post("/set", (req, res) => {
  let selected = req.body.img;

  if (req.body.imgUrl) {
    selected = `url:${req.body.imgUrl}`;
  }

  currentImage = selected || null;
  io.emit("show", currentImage);
  res.redirect("/admin");
});

// Handle WebSocket connections
io.on("connection", (socket) => {
  socket.on("getCurrent", () => {
    socket.emit("show", currentImage);
  });
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log("Serveur sur http://localhost:" + PORT);
});
