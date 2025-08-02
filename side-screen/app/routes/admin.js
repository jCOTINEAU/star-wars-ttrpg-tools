const express = require("express");
const path = require("path");
const { getImageFiles } = require("../utils/fileHelpers");
const { getOverlayHidden, setOverlayHidden, clearRevealedAreas } = require("../utils/state");

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
      <h1>Contrôle</h1>

      <!-- Overlay Controls -->
      <div style="margin-bottom: 30px; padding: 15px; border: 2px solid #ddd; border-radius: 5px;">
        <h3>🎭 Contrôles de masquage</h3>
        <div style="margin-bottom: 10px;">
          <label style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" id="hideImagesToggle" ${getOverlayHidden() ? 'checked' : ''} 
                   style="transform: scale(1.5);" />
            <span style="font-size: 18px; font-weight: bold;">Masquer les images</span>
          </label>
        </div>
        <div style="margin-top: 10px;">
          <button id="clearRevealedBtn" style="background: #ff5722; color: white; padding: 8px 16px; border: none; border-radius: 3px; cursor: pointer;">
            🗑️ Réinitialiser les zones révélées
          </button>
          <a href="/view-admin" target="_blank" style="margin-left: 15px; background: #3f51b5; color: white; padding: 8px 16px; text-decoration: none; border-radius: 3px;">
            👁️ Ouvrir la vue Admin
          </a>
        </div>
      </div>

      <h2>Sélectionne une image ou une URL à afficher</h2>

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

        // Overlay controls
        const hideImagesToggle = document.getElementById("hideImagesToggle");
        const clearRevealedBtn = document.getElementById("clearRevealedBtn");

        const BASE_URL_KEY = "myApp_baseUrl";
        const DEFAULT_BASE_URL = "http://192.168.1.73";

        // Overlay functionality
        hideImagesToggle.addEventListener("change", async () => {
          try {
            const response = await fetch("/api/overlay-toggle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ hidden: hideImagesToggle.checked })
            });
            if (!response.ok) {
              throw new Error("Failed to toggle overlay");
            }
          } catch (error) {
            console.error("Error toggling overlay:", error);
            hideImagesToggle.checked = !hideImagesToggle.checked; // Revert on error
          }
        });

        clearRevealedBtn.addEventListener("click", async () => {
          try {
            const response = await fetch("/api/clear-revealed", {
              method: "POST"
            });
            if (!response.ok) {
              throw new Error("Failed to clear revealed areas");
            }
          } catch (error) {
            console.error("Error clearing revealed areas:", error);
          }
        });

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
