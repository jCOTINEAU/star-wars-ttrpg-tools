const express = require("express");
const { setCurrentImage } = require("../utils/state");

const router = express.Router();

router.post("/set", (req, res) => {
  let selected = req.body.img;

  if (req.body.imgUrl) {
    selected = `url:${req.body.imgUrl}`;
  }

  setCurrentImage(selected);
  res.redirect("/admin");
});

module.exports = router;

