const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startWebsite() {
  return app.listen(PORT, () => {
    console.log(`[Rustcraft Web Platform] Running on http://localhost:${PORT}`);
    console.log(`[Rustcraft Web Platform] Connected with Rustcraft API (4000) and Launcher (5000)`);
  });
}

if (require.main === module) {
  startWebsite();
}

module.exports = { app, startWebsite };
