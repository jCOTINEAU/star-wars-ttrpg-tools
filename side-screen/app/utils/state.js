let currentImage = null;
let ioInstance = null;

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

module.exports = {
  setIO,
  getIO,
  setCurrentImage,
  getCurrentImage
};

