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
      // Prefer normalized viewport coords {vx,vy}; still relay legacy absolute {x,y}
      socket.broadcast.emit("ping", data);
      if (data && data.vx !== undefined) {
        console.log(`📍 Ping (norm) vx=${data.vx.toFixed(3)}, vy=${data.vy.toFixed(3)}`);
      } else {
        console.log(`📍 Ping (legacy) x=${data.x}, y=${data.y}`);
      }
    });

    // --- Viewport synchronization ---
    // Keep a base viewport (first display that connects defines it unless reset logic added)
    if (!handleSockets.baseViewport) handleSockets.baseViewport = null;

    socket.on('displayViewport', (vp) => {
      if (!vp || !vp.width || !vp.height) return;
      if (!handleSockets.baseViewport) {
        handleSockets.baseViewport = { width: vp.width, height: vp.height };
        io.emit('baseViewport', handleSockets.baseViewport);
        console.log(`�️ Base viewport définie: ${vp.width}x${vp.height}`);
      }
    });

    socket.on('getBaseViewport', () => {
      if (handleSockets.baseViewport) {
        socket.emit('baseViewport', handleSockets.baseViewport);
      }
    });

    socket.on('resetBaseViewport', () => {
      handleSockets.baseViewport = null;
      console.log('🔄 Base viewport reset demandé. Requête aux displays.');
      io.emit('requestViewport');
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

