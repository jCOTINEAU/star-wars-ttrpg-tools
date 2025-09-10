const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const displayRoutes = require("./routes/display");
const adminRoutes = require("./routes/admin");
const setRoutes = require("./routes/set");
const viewAdminRoutes = require("./routes/viewAdmin");
const handleSockets = require("./sockets/displaySocket");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const { setIO } = require("./utils/state");
setIO(io);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Add JSON parsing for API routes
app.use("/media", express.static(path.join(__dirname, "..", "media")));
// Serve shared client assets
app.use("/static", express.static(path.join(__dirname, "public")));

// Routes
app.use("/", displayRoutes);
app.use("/admin", adminRoutes);
app.use("/view-admin", viewAdminRoutes);
app.use("/", setRoutes); // POST /set and API routes

// WebSocket
handleSockets(io);

// Export server to start it from server.js
module.exports = server;

