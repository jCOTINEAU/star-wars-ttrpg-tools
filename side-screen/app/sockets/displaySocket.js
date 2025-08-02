const { getCurrentImage } = require("../utils/state");

function handleSockets(io) {
  io.on("connection", (socket) => {
    console.log("🧩 Nouveau client connecté");

    socket.on("getCurrent", () => {
      socket.emit("show", getCurrentImage());
    });

    socket.on("ping", (data) => {
      // Broadcast ping to all other clients (not the sender)
      socket.broadcast.emit("ping", data);
      console.log(`📍 Ping envoyé aux autres clients: x=${data.x}, y=${data.y}`);
    });
  });
}

module.exports = handleSockets;

