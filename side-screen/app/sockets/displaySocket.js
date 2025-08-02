const { getCurrentImage, getOverlayHidden, getRevealedAreas, addRevealedArea } = require("../utils/state");

function handleSockets(io) {
  io.on("connection", (socket) => {
    console.log("🧩 Nouveau client connecté");

    socket.on("getCurrent", () => {
      socket.emit("show", getCurrentImage());
    });

    socket.on("getOverlayState", () => {
      socket.emit("overlayToggle", { 
        hidden: getOverlayHidden(), 
        revealedAreas: getRevealedAreas() 
      });
    });

    socket.on("ping", (data) => {
      // Broadcast ping to all other clients (not the sender)
      socket.broadcast.emit("ping", data);
      console.log(`📍 Ping envoyé aux autres clients: x=${data.x}, y=${data.y}`);
    });

    socket.on("revealArea", (data) => {
      // Add to state and broadcast to all other clients
      addRevealedArea(data);
      socket.broadcast.emit("revealArea", data);
      console.log(`🎭 Zone révélée: x=${data.x}, y=${data.y}, radius=${data.radius}`);
    });

    socket.on("zoom", (data) => {
      // Broadcast zoom to all other clients
      socket.broadcast.emit("zoom", data);
      console.log(`🔍 Zoom appliqué: scale=${data.scale}, origin=${data.originX},${data.originY}`);
    });
  });
}

module.exports = handleSockets;

