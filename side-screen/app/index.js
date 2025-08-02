const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const displayRoutes = require("./routes/display");
const adminRoutes = require("./routes/admin");
const setRoutes = require("./routes/set");
const handleSockets = require("./sockets/displaySocket");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const { setIO } = require("./utils/state");
setIO(io);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use("/media", express.static(path.join(__dirname, "..", "media")));

// Routes
app.use("/", displayRoutes);
app.use("/admin", adminRoutes);
app.use("/", setRoutes); // POST /set

// WebSocket
handleSockets(io);

// Export server to start it from server.js
module.exports = server;

