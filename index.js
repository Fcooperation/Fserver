const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname)); // serves frontend.html

app.get('/api/results', (req, res) => {
  const filePath = path.join(__dirname, 'search_index.json');
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } else {
    res.json([]);
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Fweb server running on port ${PORT}`);
});