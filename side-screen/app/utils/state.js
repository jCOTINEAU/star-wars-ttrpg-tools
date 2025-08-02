let currentImage = null;
let ioInstance = null;
let overlayHidden = false;
let revealedAreas = [];

function setIO(io) {
  ioInstance = io;
}

function getIO() {
  return ioInstance;
}

function setCurrentImage(value) {
  currentImage = value || null;
  if (ioInstance) {
    ioInstance.emit("show", currentImage);
  }
}

function getCurrentImage() {
  return currentImage;
}

function setOverlayHidden(hidden) {
  overlayHidden = hidden;
  if (ioInstance) {
    ioInstance.emit("overlayToggle", { hidden: overlayHidden, revealedAreas });
  }
}

function getOverlayHidden() {
  return overlayHidden;
}

function addRevealedArea(area) {
  revealedAreas.push(area);
  if (ioInstance) {
    ioInstance.emit("revealArea", area);
  }
}

function clearRevealedAreas() {
  revealedAreas = [];
  if (ioInstance) {
    ioInstance.emit("overlayToggle", { hidden: overlayHidden, revealedAreas });
  }
}

function getRevealedAreas() {
  return revealedAreas;
}

module.exports = {
  setIO,
  getIO,
  setCurrentImage,
  getCurrentImage,
  setOverlayHidden,
  getOverlayHidden,
  addRevealedArea,
  clearRevealedAreas,
  getRevealedAreas
};

