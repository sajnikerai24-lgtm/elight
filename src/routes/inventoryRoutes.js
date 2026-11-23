const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { blockSuppliersFromStaff } = require('../middleware/supplierAuth');

// Test connection
router.get('/db-test', inventoryController.testConnection);

// Inventory routes (mutations blocked for supplier accounts)
router.get('/inventory', inventoryController.getAllProducts);
router.get('/inventory/search', inventoryController.searchProducts);
router.get('/inventory/low-stock', inventoryController.getLowStockProducts);
router.get('/inventory/:id/details', inventoryController.getProductDetails);
router.post('/inventory/:id/reviews', inventoryController.createProductReview);
router.post('/inventory', blockSuppliersFromStaff, inventoryController.createProduct);
router.put('/inventory/:id', blockSuppliersFromStaff, inventoryController.updateProduct);
router.delete('/inventory/:id', blockSuppliersFromStaff, inventoryController.deleteProduct);

module.exports = router;

