const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // Render uses process.env.PORT

app.get('/', (req, res) => {
  res.send('🚀 Hello from Fweb via Render + GitHub!');
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
