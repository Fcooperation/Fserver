const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Root route
app.get('/', (req, res) => {
  res.send('🚀 Hello from Fserver!');
});

// Optional: handle undefined routes
app.use((req, res) => {
  res.status(404).send('❌ Route not found');
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
