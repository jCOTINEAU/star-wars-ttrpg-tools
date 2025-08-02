const express = require("express");
const { setCurrentImage, setOverlayHidden, clearRevealedAreas, addRevealedArea } = require("../utils/state");

const router = express.Router();

router.post("/set", (req, res) => {
  let selected = req.body.img;

  if (req.body.imgUrl) {
    selected = `url:${req.body.imgUrl}`;
  }

  setCurrentImage(selected);
  res.redirect("/admin");
});

// API routes for overlay functionality
router.post("/api/overlay-toggle", (req, res) => {
  try {
    const { hidden } = req.body;
    setOverlayHidden(hidden);
    res.json({ success: true, hidden });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle overlay" });
  }
});

router.post("/api/clear-revealed", (req, res) => {
  try {
    clearRevealedAreas();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear revealed areas" });
  }
});

router.post("/api/reveal-area", (req, res) => {
  try {
    const { area } = req.body;
    addRevealedArea(area);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add revealed area" });
  }
});

module.exports = router;

