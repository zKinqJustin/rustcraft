const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const { seedDatabase } = require('./services/seed');
const { STORAGE_ROOT } = require('./services/storage');

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS for Website (localhost:3000) and Launcher
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files (storage)
app.use('/storage', express.static(STORAGE_ROOT));

// API v1 Routing
app.use('/api/v1', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Rustcraft Backend API',
    version: '1.0.0',
    documentation: '/api/v1/status'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start server
async function startServer() {
  await seedDatabase();
  const server = app.listen(PORT, () => {
    console.log(`[Rustcraft API] Running on http://localhost:${PORT}`);
    console.log(`[Rustcraft API] Health check at http://localhost:${PORT}/api/v1/status`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

