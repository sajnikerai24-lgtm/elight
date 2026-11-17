require('dotenv').config();
const path = require('path');
const express = require('express');
const inventoryRoutes = require('./src/routes/inventoryRoutes');
const erpRoutes = require('./src/routes/erpRoutes');
const engagementRoutes = require('./src/routes/engagementRoutes');
const supplierRoutes = require('./src/routes/supplierRoutes');

const app = express();
const port = Number(process.env.PORT || 3000);

// Middleware (10mb JSON limit supports base64 supplier document uploads)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', inventoryRoutes);
app.use('/api', supplierRoutes);
app.use('/api', engagementRoutes);
app.use('/api', erpRoutes);

// Ensure unknown /api/* routes always return JSON instead of HTML 404 pages
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Root route - serve index.html (Home Landing Page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Products route - serve dedicated catalog page
app.get('/products', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'products.html'));
});

// Cart route - serve dedicated shopping cart & checkout page
app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});

// Login route - serve user authentication page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Customer Portal route - dedicated customer-only interface
app.get('/customer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});

// Booking Module route
app.get('/booking', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});

// Help Module route
app.get('/help', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'help.html'));
});

// About Us Module route
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

// Feedback Module route
app.get('/feedback', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feedback.html'));
});

// Contact Us Module route
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Admin route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Dedicated Supplier Portal routes (Separate pages for each stage)
app.get('/supplier-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'supplier-login.html'));
});

app.get(['/supplier-portal', '/supplier-dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'supplier-portal.html'));
});

app.get('/supplier-tenders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'supplier-tenders.html'));
});

app.get('/supplier-quote', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'supplier-quote.html'));
});

app.get(['/supplier-orders', '/supplier-deliveries'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'supplier-orders.html'));
});

app.get('/supplier-payments', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'supplier-payments.html'));
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? null : err.message
  });
});

const server = app.listen(port, () => {
  console.log(`⚡ Elight Electrical Shop running at: http://localhost:${port}`);
  console.log(`📦 Admin Dashboard available at:     http://localhost:${port}/admin`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${port} is already in use by another running instance of the server.`);
    console.error(`👉 To free port ${port} on Windows PowerShell, run:`);
    console.error(`   Get-NetTCPConnection -LocalPort ${port} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
