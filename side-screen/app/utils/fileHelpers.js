const fs = require("fs/promises");
const path = require("path");

async function getImageFiles(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  } catch (err) {
    console.error("Erreur de lecture du dossier media:", err);
    return [];
  }
}

module.exports = { getImageFiles };

