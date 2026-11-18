const supabase = require('../config/supabase');
const interModuleSync = require('../utils/interModuleSync');
const { sortByLatest } = require('../utils/sortLatest');

// Sample initial products for fallback preview when table is not yet created in Supabase
const sampleProducts = [
  {
    product_id: 1,
    product_name: 'Philips 9W LED Bulb',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 180.00,
    selling_price: 250.00,
    quantity_in_stock: 45,
    reorder_level: 10
  },
  {
    product_id: 2,
    product_name: 'Schneider 1-Way Light Switch',
    category_id: 2,
    category_name: 'Switches & Sockets',
    buying_price: 150.00,
    selling_price: 220.00,
    quantity_in_stock: 30,
    reorder_level: 8
  },
  {
    product_id: 3,
    product_name: 'Twin with Earth 2.5mm Cable (100m)',
    category_id: 3,
    category_name: 'Cables & Wiring',
    buying_price: 4500.00,
    selling_price: 5800.00,
    quantity_in_stock: 12,
    reorder_level: 3
  },
  {
    product_id: 4,
    product_name: 'Double Socket Outlet with USB',
    category_id: 2,
    category_name: 'Switches & Sockets',
    buying_price: 650.00,
    selling_price: 950.00,
    quantity_in_stock: 18,
    reorder_level: 5
  },
  {
    product_id: 5,
    product_name: 'Circuit Breaker (MCB) 20A Single Pole',
    category_id: 4,
    category_name: 'Circuit Protection',
    buying_price: 320.00,
    selling_price: 450.00,
    quantity_in_stock: 25,
    reorder_level: 6
  },
  {
    product_id: 6,
    product_name: 'LED Ceiling Panel Light 18W',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 700.00,
    selling_price: 1100.00,
    quantity_in_stock: 15,
    reorder_level: 4
  },
  {
    product_id: 7,
    product_name: 'Crystal Chandelier Light',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 12000.00,
    selling_price: 16500.00,
    quantity_in_stock: 4,
    reorder_level: 2
  },
  {
    product_id: 8,
    product_name: 'RGB LED Strip Light 5M',
    category_id: 1,
    category_name: 'Lighting',
    buying_price: 1200.00,
    selling_price: 1800.00,
    quantity_in_stock: 20,
    reorder_level: 5
  },
  {
    product_id: 9,
    product_name: 'Electric Cordless Kettle 1.8L',
    category_id: 5,
    category_name: 'Appliances',
    buying_price: 1500.00,
    selling_price: 2200.00,
    quantity_in_stock: 8,
    reorder_level: 3
  }
];

// Helper to check if error is table missing in Supabase schema cache
function isTableMissingError(error) {
  if (!error) return false;
  return error.code === 'PGRST205' || 
         String(error.message || '').includes('Could not find the table');
}

// Timeout wrapper to ensure fast response and quick fallback if Supabase is slow/offline
function withTimeout(promise, ms = 1200) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Supabase request timed out')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

const inventoryController = {
  // Test connection to Supabase database
  testConnection: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('count', { count: 'exact', head: true });

      if (error && !isTableMissingError(error)) {
        return res.status(500).json({
          success: false,
          message: 'Supabase connection error: ' + error.message,
          error
        });
      }

      const tableExists = !error;

      res.json({
        success: true,
        connected: true,
        tableExists,
        message: tableExists 
          ? 'Connected to Supabase database successfully!' 
          : 'Connected to Supabase, but the "inventory" table has not been created yet. Run supabase_setup.sql in your Supabase SQL editor.'
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: 'Server error testing connection: ' + err.message
      });
    }
  },

  // Fetch all products (Connected to Inter-Module Synchronization Engine)
  getAllProducts: async (req, res) => {
    try {
      let products = [];
      try {
        const { data, error } = await withTimeout(
          supabase.from('inventory').select('*').order('product_id', { ascending: false })
        );
        if (!error && Array.isArray(data) && data.length > 0) {
          products = data;
        }
      } catch (e) {}

      if (products.length === 0) {
        products = await interModuleSync.getProducts();
      }
      products = sortByLatest(products, 'product_id');

      res.json({
        success: true,
        isFallback: false,
        count: products.length,
        products
      });
    } catch (err) {
      console.error('Error fetching inventory:', err.message);
      const fallbackProducts = await interModuleSync.getProducts();
      res.json({
        success: true,
        isFallback: true,
        count: fallbackProducts.length,
        products: fallbackProducts
      });
    }
  },

  // Search and filter products across name, category, ID, price range, and stock status
  searchProducts: async (req, res) => {
    try {
      const rawQuery = String(req.query.q || '').trim();
      const queryLower = rawQuery.toLowerCase();
      const tokens = queryLower.split(/\s+/).filter(Boolean);
      const category = String(req.query.category || '').trim();
      const stockStatus = String(req.query.stockStatus || req.query.inStock || 'all').trim().toLowerCase();
      const minPrice = req.query.minPrice !== undefined && req.query.minPrice !== '' ? Number(req.query.minPrice) : null;
      const maxPrice = req.query.maxPrice !== undefined && req.query.maxPrice !== '' ? Number(req.query.maxPrice) : null;
      const sort = String(req.query.sort || (rawQuery ? 'relevance' : 'name-asc')).trim().toLowerCase();
      const limit = req.query.limit ? Math.max(1, Math.min(100, Number(req.query.limit))) : null;

      let sourceProducts = [];
      let isFallback = false;
      try {
        const { data, error } = await withTimeout(
          supabase.from('inventory').select('*')
        );
        if (!error && Array.isArray(data) && data.length > 0) {
          sourceProducts = data;
        }
      } catch (e) {}

      if (sourceProducts.length === 0) {
        sourceProducts = await interModuleSync.getProducts();
        isFallback = true;
      }

      const categories = [...new Set(sourceProducts.map(p => p.category_name || 'General'))].sort();

      // Filter & compute relevance score
      const scored = [];
      for (const item of sourceProducts) {
        const name = String(item.product_name || '');
        const nameLower = name.toLowerCase();
        const cat = String(item.category_name || 'General');
        const catLower = cat.toLowerCase();
        const idStr = String(item.product_id || '');
        const price = Number(item.selling_price || 0);
        const stock = Number(item.quantity_in_stock || 0);
        const reorder = Number(item.reorder_level || 5);

        // Category filter
        if (category && category.toLowerCase() !== 'all' && catLower !== category.toLowerCase()) {
          continue;
        }

        // Price range filter
        if (minPrice !== null && !Number.isNaN(minPrice) && price < minPrice) {
          continue;
        }
        if (maxPrice !== null && !Number.isNaN(maxPrice) && price > maxPrice) {
          continue;
        }

        // Stock status filter
        if (stockStatus === 'in-stock' || stockStatus === 'true' || stockStatus === '1') {
          if (stock <= 0) continue;
        } else if (stockStatus === 'low-stock') {
          if (stock <= 0 || stock > reorder) continue;
        } else if (stockStatus === 'out-of-stock') {
          if (stock > 0) continue;
        }

        // Keyword matching & relevance scoring
        let score = 0;
        if (tokens.length > 0) {
          const searchable = `${nameLower} ${catLower} #${idStr} ${idStr}`;
          const allTokensMatch = tokens.every(tok => searchable.includes(tok));
          if (!allTokensMatch) continue;

          if (nameLower === queryLower || `#${idStr}` === queryLower || idStr === queryLower) {
            score += 120;
          } else if (nameLower.startsWith(queryLower)) {
            score += 90;
          } else if (nameLower.includes(queryLower)) {
            score += 70;
          }

          for (const tok of tokens) {
            if (nameLower.startsWith(tok)) score += 25;
            else if (nameLower.includes(tok)) score += 15;
            if (catLower.includes(tok)) score += 8;
          }

          if (stock > 0) score += 3; // Slight boost for in-stock items
        }

        scored.push({ item, score });
      }

      // Sort results
      scored.sort((a, b) => {
        const priceA = Number(a.item.selling_price || 0);
        const priceB = Number(b.item.selling_price || 0);
        const stockA = Number(a.item.quantity_in_stock || 0);
        const stockB = Number(b.item.quantity_in_stock || 0);
        const nameA = String(a.item.product_name || '').toLowerCase();
        const nameB = String(b.item.product_name || '').toLowerCase();

        if (sort === 'relevance' && tokens.length > 0 && b.score !== a.score) {
          return b.score - a.score;
        }
        if (sort === 'price-asc') return priceA - priceB;
        if (sort === 'price-desc') return priceB - priceA;
        if (sort === 'stock-desc') return stockB - stockA;
        if (sort === 'name-desc') return nameB.localeCompare(nameA);
        if (sort === 'name-asc') return nameA.localeCompare(nameB);
        return Number(b.item.product_id || 0) - Number(a.item.product_id || 0);
      });

      const totalMatches = scored.length;
      const finalProducts = (limit ? scored.slice(0, limit) : scored).map(entry => entry.item);

      res.json({
        success: true,
        isFallback,
        query: rawQuery,
        totalMatches,
        count: finalProducts.length,
        categories,
        products: finalProducts
      });
    } catch (err) {
      console.error('Error searching inventory:', err.message);
      res.status(500).json({
        success: false,
        message: 'Product search failed: ' + err.message
      });
    }
  },

  // Fetch low-stock products
  getLowStockProducts: async (req, res) => {
    try {
      let products = [];
      try {
        const { data, error } = await withTimeout(
          supabase.from('inventory').select('*').order('quantity_in_stock', { ascending: true })
        );
        if (!error && Array.isArray(data)) {
          products = data;
        }
      } catch (e) {}

      if (products.length === 0) {
        products = await interModuleSync.getProducts();
      }

      const lowStock = products.filter(
        item => Number(item.quantity_in_stock) <= Number(item.reorder_level || 5)
      );

      res.json({
        success: true,
        isFallback: false,
        count: lowStock.length,
        products: lowStock
      });
    } catch (err) {
      console.error('Error fetching low-stock items:', err.message);
      res.status(500).json({
        success: false,
        message: 'Unable to retrieve low-stock items: ' + err.message
      });
    }
  },

  // Insert a new product into inventory (Write Access)
  createProduct: async (req, res) => {
    try {
      const {
        product_name,
        category_id,
        category_name,
        buying_price,
        selling_price,
        quantity_in_stock,
        reorder_level,
        image_url
      } = req.body;

      if (!product_name || selling_price === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Product name and selling price are required.'
        });
      }

      // Check caller role: Inventory Manager cannot manually add products (products are added via received supplier invoices)
      const callerRole = String(req.body?.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      const allowedRoles = ['admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !allowedRoles.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Inventory Manager cannot manually add products. Products are added automatically when supplier invoices are received.'
        });
      }

      const fs = require('fs');
      const path = require('path');
      const prodPath = path.join(__dirname, '../config/products_data.json');
      const allProds = await interModuleSync.getProducts();
      const maxId = allProds.reduce((max, p) => Math.max(max, Number(p.product_id) || 0), 0);
      const newProduct = {
        product_id: maxId + 1,
        product_name: product_name.trim(),
        category_id: category_id ? Number(category_id) : 1,
        category_name: category_name ? category_name.trim() : 'General',
        buying_price: Number(buying_price || 0),
        selling_price: Number(selling_price),
        quantity_in_stock: Number(quantity_in_stock || 0),
        reorder_level: Number(reorder_level || 5),
        image_url: image_url ? image_url.trim() : 'images/bulb.jpg'
      };

      // Add to local products_data.json
      allProds.push(newProduct);
      try {
        fs.writeFileSync(prodPath, JSON.stringify(allProds, null, 2), 'utf8');
      } catch (e) {
        console.error('Failed to write local products_data.json:', e);
      }

      // Try inserting into Supabase
      let savedProduct = newProduct;
      try {
        const { data, error } = await withTimeout(
          supabase.from('inventory').insert([newProduct]).select()
        );
        if (!error && data && data.length > 0) {
          savedProduct = data[0];
        }
      } catch (e) {}

      // If initial stock > 0, log movement
      if (newProduct.quantity_in_stock > 0) {
        await interModuleSync.adjustProductStock({
          productId: newProduct.product_id,
          productName: newProduct.product_name,
          deltaQuantity: newProduct.quantity_in_stock,
          type: 'STOCK_IN',
          reason: 'Initial stock intake upon product creation',
          actor: req.body.actor || (callerRole.includes('admin') ? 'Administrator' : 'Grace Kerubo (Inventory Manager)')
        });
      }

      res.status(201).json({
        success: true,
        message: 'Product added successfully.',
        product: savedProduct
      });
    } catch (err) {
      console.error('Error creating product:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to create product: ' + err.message
      });
    }
  },

  // Update existing product by ID (Write Access)
  updateProduct: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = { ...req.body };

      // Governance Rule: Allow Inventory Manager and Admin roles
      if (updates.quantity_in_stock !== undefined && !req.body.is_automatic_adjustment) {
        const callerRole = String(req.body?.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
        const allowedRoles = ['inventory_manager', 'inventory', 'storekeeper', 'admin', 'administrator', 'owner', 'superadmin'];
        if (callerRole && !allowedRoles.includes(callerRole)) {
          return res.status(403).json({
            success: false,
            message: 'Access Denied: Only the Inventory Manager or Administrator should update stock quantities.'
          });
        }
      }

      if (updates.selling_price !== undefined) updates.selling_price = Number(updates.selling_price);
      if (updates.buying_price !== undefined) updates.buying_price = Number(updates.buying_price);
      if (updates.quantity_in_stock !== undefined) updates.quantity_in_stock = Number(updates.quantity_in_stock);
      if (updates.reorder_level !== undefined) updates.reorder_level = Number(updates.reorder_level);
      if (updates.category_id !== undefined) updates.category_id = Number(updates.category_id);

      let updatedProduct = null;
      try {
        const { data, error } = await withTimeout(
          supabase.from('inventory').update(updates).eq('product_id', id).select()
        );
        if (!error && data && data.length > 0) {
          updatedProduct = data[0];
        }
      } catch (e) {}

      // Update in local products_data.json
      const fs = require('fs');
      const path = require('path');
      const prodPath = path.join(__dirname, '../config/products_data.json');
      const allProds = await interModuleSync.getProducts();
      const target = allProds.find(p => Number(p.product_id) === Number(id));
      if (target) {
        const oldStock = target.quantity_in_stock;
        Object.assign(target, updates);
        try {
          fs.writeFileSync(prodPath, JSON.stringify(allProds, null, 2), 'utf8');
        } catch (e) {}
        if (!updatedProduct) updatedProduct = target;

        // If stock changed manually, log movement
        if (updates.quantity_in_stock !== undefined && updates.quantity_in_stock !== oldStock) {
          const delta = updates.quantity_in_stock - oldStock;
          const type = delta > 0 ? 'STOCK_IN' : 'STOCK_OUT';
          await interModuleSync.adjustProductStock({
            productId: target.product_id,
            productName: target.product_name,
            deltaQuantity: delta,
            type,
            reason: req.body.reason || 'Manual stock level adjustment',
            actor: req.body.actor || 'Inventory Manager'
          });
        }
      }

      if (!updatedProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found.'
        });
      }

      res.json({
        success: true,
        message: 'Product updated successfully.',
        product: updatedProduct
      });
    } catch (err) {
      console.error('Error updating product:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to update product: ' + err.message
      });
    }
  },

  // Delete product by ID (Write Access)
  deleteProduct: async (req, res) => {
    try {
      const { id } = req.params;
      const callerRole = String(req.body?.user_role || req.headers['x-user-role'] || '').trim().toLowerCase();
      const allowedRoles = ['admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !allowedRoles.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Inventory Manager cannot manually remove products.'
        });
      }

      // Update in local products_data.json
      const fs = require('fs');
      const path = require('path');
      const prodPath = path.join(__dirname, '../config/products_data.json');
      const allProds = await interModuleSync.getProducts();
      const updated = allProds.filter(p => Number(p.product_id) !== Number(id));
      try {
        fs.writeFileSync(prodPath, JSON.stringify(updated, null, 2), 'utf8');
      } catch (e) {}

      // Try Supabase delete
      try {
        await withTimeout(
          supabase.from('inventory').delete().eq('product_id', id)
        );
      } catch (e) {}

      res.json({
        success: true,
        message: 'Product deleted successfully.'
      });
    } catch (err) {
      console.error('Error deleting product:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to delete product: ' + err.message
      });
    }
  }
};

module.exports = inventoryController;
