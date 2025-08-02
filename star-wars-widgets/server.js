const express = require('express');
const app = express();
const PORT = 3001;

// Serve static files
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
