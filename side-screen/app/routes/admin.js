const express = require("express");
const path = require("path");
const { getImageFiles } = require("../utils/fileHelpers");

const router = express.Router();
const mediaDir = path.join(__dirname, "..", "..", "media");

router.get("/", async (req, res) => {
  const images = await getImageFiles(mediaDir);

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
        body { font-family: sans-serif; padding: 20px; }
        form { margin-bottom: 10px; }
        input[type="text"], input[type="number"] {
          padding: 5px;
          font-size: 16px;
        }
      </style>
    </head>
    <body>
      <h1>Sélectionne une image ou une URL à afficher</h1>

      <!-- Base URL Input -->
      <div style="margin-bottom: 20px;">
        <label>Base URL:&nbsp;</label>
        <input type="text" id="baseUrlInput" placeholder="https://example.com" style="width:300px;" />
      </div>

      <!-- Timer Block -->
      <div style="margin-bottom: 20px;">
        <form id="timerForm" method="POST" action="/set">
          <label>Durée (secondes):&nbsp;</label>
          <input type="number" id="durationInput" value="60" min="1" style="width:80px;" />
          <input type="hidden" name="imgUrl" id="hiddenImgUrl" />
          <button type="submit" style="background: #2196f3; color: white; padding: 10px; font-size: 16px;">Afficher Timer</button>
        </form>
      </div>

      <!-- Intro Block -->
      <div style="margin-bottom: 20px;">
        <form id="introForm" method="POST" action="/set">
          <input type="hidden" name="imgUrl" id="hiddenIntroUrl" />
          <button type="submit" style="background: #ff9800; color: white; padding: 10px; font-size: 16px;">Afficher Intro</button>
        </form>
      </div>

      <!-- Aurebesh Block -->
      <div style="margin-bottom: 20px;">
        <form id="aurebeshForm" method="POST" action="/set">
          <input type="hidden" name="imgUrl" id="hiddenAurebeshUrl" />
          <button type="submit" style="background: #9c27b0; color: white; padding: 10px; font-size: 16px;">Afficher Aurebesh</button>
        </form>
      </div>

      <!-- URL Form -->
      <div>
        <form method="POST" action="/set">
          <input type="text" name="imgUrl" placeholder="Entrez une URL (ex: https://example.com)" style="width:300px;" required />
          <button type="submit" style="background: #4caf50; color: white; padding: 10px; font-size: 16px;">Afficher l’URL</button>
        </form>
      </div>

      <!-- Clear Button -->
      <div>
        <form method="POST" action="/set">
          <input type="hidden" name="img" value="" />
          <button type="submit" style="background: #f44336; color: white; padding: 10px; font-size: 16px;">Vider l’écran</button>
        </form>
      </div>

      <hr/>

      <!-- Image Buttons -->
      <div style="display: flex; flex-wrap: wrap; gap: 20px;">
        ${buttons}
      </div>

      <!-- JS for Timer, Intro, Aurebesh -->
      <script>
        const baseUrlInput = document.getElementById("baseUrlInput");
        const durationInput = document.getElementById("durationInput");
        const timerForm = document.getElementById("timerForm");
        const hiddenImgUrl = document.getElementById("hiddenImgUrl");

        const introForm = document.getElementById("introForm");
        const hiddenIntroUrl = document.getElementById("hiddenIntroUrl");

        const aurebeshForm = document.getElementById("aurebeshForm");
        const hiddenAurebeshUrl = document.getElementById("hiddenAurebeshUrl");

        const BASE_URL_KEY = "myApp_baseUrl";
        const DEFAULT_BASE_URL = "http://192.168.1.73";

        // On page load, prefill baseUrl
        window.addEventListener("DOMContentLoaded", () => {
          const savedBaseUrl = localStorage.getItem(BASE_URL_KEY);
          baseUrlInput.value = savedBaseUrl || DEFAULT_BASE_URL;
        });

        // Save baseUrl when user types
        baseUrlInput.addEventListener("input", () => {
          localStorage.setItem(BASE_URL_KEY, baseUrlInput.value.trim());
        });

        // Timer form submit
        timerForm.addEventListener("submit", function (e) {
          const baseUrl = baseUrlInput.value.trim();
          const duration = durationInput.value.trim() || "60";

          if (!baseUrl) {
            alert("Veuillez entrer une base URL.");
            e.preventDefault();
            return;
          }

          const finalUrl = \`\${baseUrl.replace(/\\/$/, "")}:3001/clock-timer?duration=\${encodeURIComponent(duration)}\`;
          hiddenImgUrl.value = finalUrl;
        });

        // Intro form submit
        introForm.addEventListener("submit", function (e) {
          const baseUrl = baseUrlInput.value.trim();

          if (!baseUrl) {
            alert("Veuillez entrer une base URL.");
            e.preventDefault();
            return;
          }

          const finalUrl = \`\${baseUrl.replace(/\\/$/, "")}:8080\`;
          hiddenIntroUrl.value = finalUrl;
        });

        // Aurebesh form submit
        aurebeshForm.addEventListener("submit", function (e) {
          const baseUrl = baseUrlInput.value.trim();

          if (!baseUrl) {
            alert("Veuillez entrer une base URL.");
            e.preventDefault();
            return;
          }

          const finalUrl = \`\${baseUrl.replace(/\\/$/, "")}:3001/aurebesh\`;
          hiddenAurebeshUrl.value = finalUrl;
        });
      </script>
    </body>
    </html>
  `);
});

module.exports = router;
