const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const { readJsonFile, writeJsonFile } = require('./jsonStore');
const { validatePaymentReference } = require('./paymentValidation');
const { sortByLatest } = require('./sortLatest');

// File paths for resilient local storage and offline ERP operations
const CONFIG_DIR = path.join(__dirname, '../config');
const PRODUCTS_DATA_PATH = path.join(CONFIG_DIR, 'products_data.json');
const STOCK_MOVEMENTS_PATH = path.join(CONFIG_DIR, 'stock_movements.json');
const SERVICE_REQUESTS_PATH = path.join(CONFIG_DIR, 'service_requests.json');
const DISPATCHES_PATH = path.join(CONFIG_DIR, 'dispatches.json');
const BOOKINGS_PATH = path.join(CONFIG_DIR, 'bookings_data.json');
const CASHIER_ORDERS_PATH = path.join(CONFIG_DIR, 'cashier_orders.json');
const FINANCE_RECORDS_PATH = path.join(CONFIG_DIR, 'finance_records.json');
const SYSTEM_SETTINGS_PATH = path.join(CONFIG_DIR, 'system_settings.json');
const CUSTOMER_CARE_TASKS_PATH = path.join(CONFIG_DIR, 'customer_care_tasks.json');
const CUSTOMER_FEEDBACK_PATH = path.join(CONFIG_DIR, 'customer_feedback.json');
const MATERIAL_REQUESTS_PATH = path.join(CONFIG_DIR, 'service_material_requests.json');

// Initial seed products (matches showroom catalog & supabase_setup.sql)
const DEFAULT_PRODUCTS = [
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

// Initial seed service requests
const DEFAULT_SERVICE_REQUESTS = [
  {
    request_id: 101,
    booking_ref: 'BK-ELIGHT-1001',
    customer_name: 'Dr. Anthony Njoroge',
    phone: '0712345678',
    location: 'Makutano, Meru',
    service_type: 'Solar Hybrid System Inverter Installation',
    description: 'Online Booking [BK-ELIGHT-1001]: Solar Inverter & Battery Bank Setup (09:00 AM - 12:00 PM). Notes: Residential home behind Makutano Mall.',
    scheduled_date: '2026-11-05',
    status: 'assigned',
    assigned_technician_id: 4,
    assigned_technician_name: 'Brian Kipchumba',
    technician_name: 'Brian Kipchumba',
    materials_used: '',
    created_at: '2026-11-03T08:30:00Z'
  },
  {
    request_id: 102,
    booking_ref: 'BK-ELIGHT-1003',
    customer_name: 'Mercy Mwenda',
    phone: '0722334455',
    location: 'Nkubu Town, Meru County',
    service_type: 'Residential 3-Phase Consumer Unit Wiring',
    description: 'Online Booking [BK-ELIGHT-1003]: Main distribution board replacement with surge protection. Urgent before weekend.',
    scheduled_date: '2026-11-06',
    status: 'pending',
    assigned_technician_id: null,
    assigned_technician_name: '',
    technician_name: '',
    materials_used: '',
    created_at: '2026-11-04T07:15:00Z'
  },
  {
    request_id: 103,
    booking_ref: 'BK-ELIGHT-1004',
    customer_name: 'James Murithi',
    phone: '0733445566',
    location: 'Maua Town, Meru County',
    service_type: 'Crystal Chandelier High-Ceiling Mounting',
    description: 'Living room double-height ceiling installation with reinforced anchor bracket.',
    scheduled_date: '2026-11-03',
    status: 'completed',
    assigned_technician_id: 4,
    assigned_technician_name: 'Brian Kipchumba',
    technician_name: 'Brian Kipchumba',
    materials_used: '1x Crystal Chandelier Light, 12m Twin with Earth 2.5mm Cable',
    created_at: '2026-11-02T10:00:00Z'
  }
];

// Initial seed dispatches
const DEFAULT_DISPATCHES = [
  {
    dispatch_id: 101,
    order_no: 'EL-884210',
    customer_name: 'Wanjiru Kamau',
    customer_phone: '0712445890',
    delivery_address: 'Makutano, Meru County',
    driver_name: 'Francis Mutua',
    scheduled_date: '2026-11-05',
    status: 'pending_dispatch',
    driver_notes: 'Fragile: Crystal Chandelier Light • Deliver between 10am-1pm',
    created_at: '2026-11-04T08:00:00Z'
  },
  {
    dispatch_id: 102,
    order_no: 'EL-268014',
    customer_name: 'George Mutwiri',
    customer_phone: '0798765432',
    delivery_address: 'Meru Town Showroom Area',
    driver_name: 'Francis Mutua',
    scheduled_date: '2026-11-04',
    status: 'delivered',
    driver_notes: 'Delivered & signed off by customer',
    created_at: '2026-11-04T08:58:00Z'
  }
];

// Initial seed bookings
const DEFAULT_BOOKINGS = [
  {
    booking_id: 101,
    booking_ref: 'BK-ELIGHT-1001',
    booking_type: 'service',
    customer_name: 'Dr. Anthony Njoroge',
    customer_email: 'anthony@gmail.com',
    customer_phone: '0712345678',
    item_or_service_name: 'Solar Hybrid System Inverter Installation',
    quantity: 1,
    preferred_date: '2026-11-05',
    preferred_time: '09:00 AM - 12:00 PM',
    location_or_notes: 'Residential home behind Makutano Mall',
    estimated_amount: 8500,
    status: 'confirmed',
    confirmation_note: 'Assigned to certified technician Brian Kipchumba. Our technical desk will call prior to dispatch.',
    created_at: '2026-11-03T08:30:00Z'
  },
  {
    booking_id: 102,
    booking_ref: 'BK-ELIGHT-1002',
    booking_type: 'product',
    customer_name: 'Wanjiru Kamau',
    customer_email: 'wanjiru@gmail.com',
    customer_phone: '0712445890',
    product_id: 7,
    item_or_service_name: 'Crystal Chandelier Light',
    quantity: 1,
    preferred_date: '2026-11-05',
    preferred_time: 'Business Hours',
    location_or_notes: 'Makutano, Meru County',
    estimated_amount: 16500,
    status: 'pending',
    confirmation_note: 'Reserved for collection at Elight Electrical Shop. Present booking ref BK-ELIGHT-1002 to Cashier.',
    created_at: '2026-11-04T07:45:00Z'
  }
];

// Seed stock movements
const DEFAULT_MOVEMENTS = [
  {
    movement_id: 1,
    product_id: 1,
    product_name: 'Philips 9W LED Bulb',
    type: 'STOCK_IN',
    quantity: 50,
    reason: 'Initial Showroom Restock from Philips Lighting Kenya',
    recorded_by: 'Grace Kerubo (Inventory Manager)',
    created_at: '2026-11-01T08:00:00Z'
  },
  {
    movement_id: 2,
    product_id: 3,
    product_name: 'Twin with Earth 2.5mm Cable (100m)',
    type: 'STOCK_IN',
    quantity: 15,
    reason: 'Purchase Order #PO-2026-0101 receipt from KenBright Cables',
    recorded_by: 'Grace Kerubo (Inventory Manager)',
    created_at: '2026-11-02T10:30:00Z'
  }
];

// Helper read & write functions (Vercel /tmp fallback aware)
function readJson(filePath, defaultData) {
  const parsed = readJsonFile(filePath, null);
  if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  writeJsonFile(filePath, defaultData);
  return defaultData;
}

function writeJson(filePath, data) {
  return writeJsonFile(filePath, data);
}

// Append an activity to audit log
function appendSystemAudit(department, actor, action, details) {
  try {
    let cfg = readJsonFile(SYSTEM_SETTINGS_PATH, {});
    if (!cfg || typeof cfg !== 'object') cfg = {};
    if (!Array.isArray(cfg.audit_log)) cfg.audit_log = [];
    cfg.audit_log.unshift({
      timestamp: new Date().toISOString(),
      department: department || 'Operations',
      actor: actor || 'System Sync Engine',
      action: action || 'Cross-Module Action',
      details: details || ''
    });
    if (cfg.audit_log.length > 500) cfg.audit_log = cfg.audit_log.slice(0, 500);
    writeJsonFile(SYSTEM_SETTINGS_PATH, cfg);
  } catch (e) {}
}

// Fast timeout wrapper to keep inter-module sync responsive even if Supabase is slow
function withTimeout(promise, ms = 1200) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Supabase request timed out')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

const interModuleSync = {
  // ========================================================
  // 1. PRODUCTS & INVENTORY CONNECTION (Stock Updates & Movements)
  // ========================================================
  getProducts: async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.from('inventory').select('*').order('product_id', { ascending: false })
      );
      if (!error && Array.isArray(data) && data.length > 0) {
        const sorted = sortByLatest(data, 'product_id');
        writeJson(PRODUCTS_DATA_PATH, sorted);
        return sorted;
      }
    } catch (e) {}
    return sortByLatest(readJson(PRODUCTS_DATA_PATH, DEFAULT_PRODUCTS), 'product_id');
  },

  getStockMovements: async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.from('stock_movements').select('*').order('movement_id', { ascending: false })
      );
      if (!error && Array.isArray(data) && data.length > 0) {
        const sorted = sortByLatest(data, 'movement_id');
        writeJson(STOCK_MOVEMENTS_PATH, sorted);
        return sorted;
      }
    } catch (e) {}
    return sortByLatest(readJson(STOCK_MOVEMENTS_PATH, DEFAULT_MOVEMENTS), 'movement_id');
  },

  adjustProductStock: async ({
    productId,
    productName,
    deltaQuantity,
    type,
    reason,
    actor
  }) => {
    const qtyNum = Math.abs(Number(deltaQuantity) || 1);
    const movementType = type || (deltaQuantity < 0 ? 'STOCK_OUT' : 'STOCK_IN');
    const cleanActor = actor || (movementType === 'STOCK_OUT' ? 'Cashier Counter' : 'Inventory Manager');
    const cleanReason = reason || `${movementType} adjustment`;

    const products = readJson(PRODUCTS_DATA_PATH, DEFAULT_PRODUCTS);
    let target = null;

    if (productId) {
      target = products.find(p => Number(p.product_id) === Number(productId));
    }
    if (!target && productName) {
      const cleanName = String(productName).trim().toLowerCase();
      target = products.find(p => {
        const pName = String(p.product_name).trim().toLowerCase();
        return pName === cleanName || pName.includes(cleanName) || cleanName.includes(pName);
      });
    }

    if (!target) {
      console.warn(`[interModuleSync] Product "${productName || productId}" not found for stock adjustment.`);
      return { success: false, message: 'Product not found for stock adjustment.' };
    }

    const previousStock = Number(target.quantity_in_stock || 0);
    const nextStock = movementType === 'STOCK_OUT'
      ? Math.max(0, previousStock - qtyNum)
      : previousStock + qtyNum;

    target.quantity_in_stock = nextStock;
    writeJson(PRODUCTS_DATA_PATH, products);

    // Record local stock movement
    const movements = readJson(STOCK_MOVEMENTS_PATH, DEFAULT_MOVEMENTS);
    const newMovement = {
      movement_id: movements.length > 0 ? Math.max(...movements.map(m => m.movement_id || 0)) + 1 : 1,
      product_id: target.product_id,
      product_name: target.product_name,
      type: movementType,
      quantity: qtyNum,
      reason: cleanReason,
      recorded_by: cleanActor,
      created_at: new Date().toISOString()
    };
    movements.unshift(newMovement);
    writeJson(STOCK_MOVEMENTS_PATH, movements);

    // Check low stock alert
    const isLowStock = nextStock <= Number(target.reorder_level || 5);
    if (isLowStock && movementType === 'STOCK_OUT') {
      appendSystemAudit(
        'Inventory',
        'System Stock Guard',
        'Low Stock Warning Triggered',
        `Product "${target.product_name}" is down to ${nextStock} units (Reorder level: ${target.reorder_level}). Restock recommended.`
      );
    }

    // Attempt to update Supabase in background
    try {
      await supabase
        .from('inventory')
        .update({ quantity_in_stock: nextStock })
        .eq('product_id', target.product_id);

      await supabase
        .from('stock_movements')
        .insert([{
          product_id: target.product_id,
          product_name: target.product_name,
          type: movementType,
          quantity: qtyNum,
          reason: cleanReason,
          recorded_by: cleanActor
        }]);
    } catch (dbErr) {
      // Offline / sandbox fallback is fully handled by local files
    }

    return {
      success: true,
      product: target,
      movement: newMovement,
      previous_stock: previousStock,
      current_stock: nextStock,
      is_low_stock: isLowStock
    };
  },

  // ========================================================
  // 2. CUSTOMER BOOKINGS & SERVICE REQUESTS CONNECTION
  // ========================================================
  getBookings: async (filter = {}) => {
    try {
      let query = supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .order('booking_id', { ascending: false });

      if (filter.booking_ref) {
        query = query.ilike('booking_ref', filter.booking_ref);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        const sorted = sortByLatest(data, 'booking_id');
        writeJson(BOOKINGS_PATH, sorted);
        return sorted;
      }
    } catch (e) {}
    return sortByLatest(readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS), 'booking_id');
  },

  getServiceRequests: async (technicianFilter = null, technicianId = null) => {
    let requests = [];
    const localRequests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
    try {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .order('request_id', { ascending: false });
      if (!error && Array.isArray(data) && data.length > 0) {
        const matchedDbIds = new Set();
        requests = data.map(sr => {
          const local = localRequests.find(l => Number(l.request_id) === Number(sr.request_id))
            || (sr.booking_ref && localRequests.find(l => l.booking_ref === sr.booking_ref));
          if (local) matchedDbIds.add(local);
          const extractedRef = sr.booking_ref || (local && local.booking_ref) || (sr.description && sr.description.match(/\[(BK-ELIGHT-[^\]]+)\]/i)?.[1]) || null;
          const assignedTime = sr.assigned_time || (local && local.assigned_time) || 'Pending Service Manager Assignment';
          return {
            ...(local || {}),
            ...sr,
            booking_ref: extractedRef,
            assigned_time: assignedTime,
            customer_email: sr.customer_email || (local && local.customer_email) || null,
            service_fee: Number(sr.service_fee ?? local?.service_fee ?? 0),
            billing_status: sr.billing_status || local?.billing_status || (Number(sr.service_fee ?? local?.service_fee ?? 0) > 0 && sr.status === 'completed' ? 'pending_payment' : 'not_billed'),
            payment_status: sr.payment_status || local?.payment_status || 'unpaid'
          };
        });
        for (const loc of localRequests) {
          if (!matchedDbIds.has(loc) && !requests.some(r => (r.booking_ref && loc.booking_ref && r.booking_ref === loc.booking_ref) || Number(r.request_id) === Number(loc.request_id))) {
            requests.push(loc);
          }
        }
        requests = sortByLatest(requests, 'request_id');
        writeJson(SERVICE_REQUESTS_PATH, requests);
      }
    } catch (e) {}

    if (requests.length === 0) {
      requests = localRequests;
    }

    // Role governance: technician only sees assigned jobs
    if (technicianFilter && technicianFilter !== 'all') {
      const filterLower = String(technicianFilter).toLowerCase().trim();
      requests = requests.filter(j => {
        const tName = String(j.assigned_technician_name || j.technician_name || '').toLowerCase();
        const matchName = tName.includes(filterLower) || filterLower.includes(tName);
        const matchId = technicianId && Number(j.assigned_technician_id) === Number(technicianId);
        return matchName || matchId;
      });
    }

    return requests;
  },

  createServiceRequestFromBooking: async (booking) => {
    const requests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
    const nextId = requests.length > 0 ? Math.max(...requests.map(r => r.request_id || 0)) + 1 : 101;

    let servicesDetail = '';
    if (Array.isArray(booking.services_list) && booking.services_list.length > 1) {
      servicesDetail = `Included Services: ${booking.services_list.map(s => `${s.name} (x${s.quantity})`).join(', ')}. `;
    }

    const newReq = {
      request_id: nextId,
      booking_ref: booking.booking_ref || `BK-ELIGHT-${nextId}`,
      customer_name: booking.customer_name || 'Customer',
      customer_email: booking.customer_email || null,
      phone: booking.customer_phone || '',
      location: booking.location_or_notes || 'Meru County',
      service_type: booking.item_or_service_name || 'Electrical Installation / Repair',
      description: booking.description
        ? booking.description
        : `Customer Booking [${booking.booking_ref}]: ${booking.item_or_service_name} (${booking.preferred_time || 'Pending Service Manager Assignment'}). ${servicesDetail}Notes: ${booking.location_or_notes || 'Standard booking'}`,
      scheduled_date: booking.preferred_date || new Date().toISOString().split('T')[0],
      assigned_time: booking.preferred_time && !booking.preferred_time.includes('Pending') ? booking.preferred_time : 'Pending Service Manager Assignment',
      status: booking.technician_id ? 'assigned' : 'pending',
      assigned_technician_id: booking.technician_id ? Number(booking.technician_id) : null,
      assigned_technician_name: booking.technician_name || '',
      technician_name: booking.technician_name || '',
      materials_used: '',
      services_list: booking.services_list || null,
      service_fee: Number(booking.service_fee ?? booking.estimated_amount ?? 0),
      billing_status: 'not_billed',
      payment_status: 'unpaid',
      created_at: new Date().toISOString()
    };

    try {
      const { data: insertedRow } = await supabase.from('service_requests').insert([{
        booking_ref: newReq.booking_ref,
        customer_name: newReq.customer_name,
        customer_email: newReq.customer_email,
        phone: newReq.phone,
        location: newReq.location,
        service_type: newReq.service_type,
        description: newReq.description,
        scheduled_date: newReq.scheduled_date,
        assigned_time: newReq.assigned_time,
        assigned_technician_id: newReq.assigned_technician_id,
        technician_name: newReq.technician_name || null,
        status: newReq.status,
        service_fee: newReq.service_fee,
        billing_status: newReq.billing_status,
        payment_status: newReq.payment_status
      }]).select('*').single();
      if (insertedRow?.request_id) {
        newReq.request_id = insertedRow.request_id;
      }
    } catch (e) {}

    requests.unshift(newReq);
    writeJson(SERVICE_REQUESTS_PATH, requests);

    appendSystemAudit(
      'Service & Field Operations',
      booking.technician_id ? 'Service Manager' : 'Booking Synchronization Engine',
      'Service Request Created',
      `Created Service Request #SR-${newReq.request_id} for ${newReq.customer_name}${newReq.technician_name ? ` (Assigned: ${newReq.technician_name})` : ''}.`
    );

    return newReq;
  },

  assignTechnicianToRequest: async (requestId, technicianId, technicianName) => {
    const requests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
    const req = requests.find(r => Number(r.request_id) === Number(requestId));
    if (!req) return null;

    req.assigned_technician_id = Number(technicianId);
    req.assigned_technician_name = technicianName;
    req.technician_name = technicianName;
    req.status = 'assigned';
    writeJson(SERVICE_REQUESTS_PATH, requests);

    // Inter-module connection: update corresponding booking if exists
    if (req.booking_ref) {
      const bookings = readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS);
      const b = bookings.find(item => String(item.booking_ref).toUpperCase() === String(req.booking_ref).toUpperCase());
      if (b) {
        b.status = 'confirmed';
        b.confirmation_note = `Assigned to certified Field Technician ${technicianName}. Our technical desk will contact you at ${req.phone} before dispatch.`;
        writeJson(BOOKINGS_PATH, bookings);
      }
    }

    appendSystemAudit(
      'Service & Field Operations',
      'Service Manager',
      'Technician Job Assigned',
      `Assigned ${technicianName} to Service Request #SR-${requestId} (${req.customer_name}). Customer booking synchronized.`
    );

    try {
      await supabase
        .from('service_requests')
        .update({
          assigned_technician_id: Number(technicianId),
          technician_name: technicianName,
          status: 'assigned'
        })
        .eq('request_id', requestId);
    } catch (e) {}

    return req;
  },

  assignTimeToServiceRequest: async (requestId, assignedTime, actor) => {
    const requests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
    const req = requests.find(r => Number(r.request_id) === Number(requestId));
    if (!req) return null;

    req.assigned_time = assignedTime;
    writeJson(SERVICE_REQUESTS_PATH, requests);

    // Bidirectional sync: update corresponding booking if exists
    const bRef = req.booking_ref || (req.description && req.description.match(/\[(BK-ELIGHT-[^\]]+)\]/i)?.[1]);
    if (bRef) {
      req.booking_ref = bRef;
      const bookings = readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS);
      const b = bookings.find(item => String(item.booking_ref).toUpperCase() === String(bRef).toUpperCase());
      if (b) {
        b.preferred_time = assignedTime;
        b.confirmation_note = `Appointment arrival time confirmed for ${assignedTime} on ${b.preferred_date}. Assigned by Service Manager.`;
        writeJson(BOOKINGS_PATH, bookings);
        try {
          await supabase
            .from('bookings')
            .update({ preferred_time: assignedTime, confirmation_note: b.confirmation_note })
            .eq('booking_ref', bRef);
        } catch (e) {}
      }
    }

    appendSystemAudit(
      'Service & Field Operations',
      actor || 'Service Manager',
      'Arrival Time Assigned',
      `Assigned arrival time window "${assignedTime}" to Service Request #SR-${requestId} (${req.customer_name}). Customer booking synchronized.`
    );

    try {
      await supabase
        .from('service_requests')
        .update({ assigned_time: assignedTime })
        .eq('request_id', requestId);
    } catch (e) {}

    return req;
  },

  assignTimeToBooking: async (bookingId, assignedTime, actor) => {
    const bookings = readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS);
    const b = bookings.find(item => Number(item.booking_id) === Number(bookingId));
    if (!b) return null;

    b.preferred_time = assignedTime;
    b.confirmation_note = `Appointment arrival time confirmed for ${assignedTime} on ${b.preferred_date}. Assigned by Service Manager.`;
    writeJson(BOOKINGS_PATH, bookings);

    // Bidirectional sync: update matching service request if exists
    if (b.booking_ref) {
      const requests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
      const req = requests.find(r => 
        (r.booking_ref && String(r.booking_ref).toUpperCase() === String(b.booking_ref).toUpperCase()) ||
        (r.description && r.description.toUpperCase().includes(String(b.booking_ref).toUpperCase()))
      );
      if (req) {
        req.assigned_time = assignedTime;
        req.booking_ref = b.booking_ref;
        writeJson(SERVICE_REQUESTS_PATH, requests);
        try {
          await supabase
            .from('service_requests')
            .update({ assigned_time: assignedTime })
            .eq('request_id', req.request_id);
        } catch (e) {}
      }
    }

    appendSystemAudit(
      'Booking Management',
      actor || 'Service Manager',
      'Booking Time Assigned',
      `Service Manager assigned arrival time window "${assignedTime}" to Customer Booking [${b.booking_ref} - ${b.customer_name}].`
    );

    try {
      await supabase
        .from('bookings')
        .update({ preferred_time: assignedTime, confirmation_note: b.confirmation_note })
        .eq('booking_id', Number(bookingId));
    } catch (e) {}

    return b;
  },

  updateServiceRequestStatus: async (requestId, status, materialsUsed, actor) => {
    const requests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
    const req = requests.find(r => Number(r.request_id) === Number(requestId));
    if (!req) return null;

    let matText = materialsUsed;
    let completionNotesVal = undefined;
    let actorVal = actor;
    let skipAutoDeduct = false;
    if (materialsUsed && typeof materialsUsed === 'object' && !Array.isArray(materialsUsed)) {
      matText = materialsUsed.materialsUsed ?? materialsUsed.materials_used;
      completionNotesVal = materialsUsed.completionNotes ?? materialsUsed.completion_notes;
      actorVal = materialsUsed.actor || actorVal;
      skipAutoDeduct = Boolean(materialsUsed.skipAutoStockDeduct);
    }

    // Site readiness gate check: Prevent technician installation from starting before product is delivered/collected
    if (status === 'in_progress') {
      if (req.booking_ref && (req.booking_ref.startsWith('INS-') || req.booking_ref.startsWith('SCH-'))) {
        const orderNo = req.booking_ref.replace(/^INS-|^SCH-/, '');
        const orders = readJson(CASHIER_ORDERS_PATH, []);
        const order = orders.find(o => String(o.order_no || o.order_number).toUpperCase() === String(orderNo).toUpperCase());
        if (order) {
          const isCollected = order.fulfillment_mode === 'collection' && (order.delivery_status === 'delivered' || order.status === 'collected' || order.fulfillment_status === 'collected');
          const isDelivered = order.delivery_status === 'delivered' || order.fulfillment_status === 'delivered';
          if (!isCollected && !isDelivered) {
            throw new Error(`Site Not Ready: Product for Order ${order.order_no} has not been delivered to customer site yet (Current delivery status: ${order.delivery_status || 'scheduled'}). Installation work cannot be started until goods arrive on site.`);
          }
        }
      }
    }

    if (status) req.status = status;
    if (matText !== undefined) req.materials_used = matText;
    if (completionNotesVal !== undefined) req.completion_notes = String(completionNotesVal).trim();
    if (status === 'awaiting_inspection') {
      req.completed_at = new Date().toISOString();
    }
    if (status === 'completed') {
      req.approved_by = actorVal || 'Service Manager';
      req.approved_at = new Date().toISOString();
    }
    writeJson(SERVICE_REQUESTS_PATH, requests);

    // Avoid double-deducting if materials were already issued officially via Material Request workflow
    const existingMRs = readJson(MATERIAL_REQUESTS_PATH, []).filter(
      m => Number(m.service_request_id) === Number(requestId) && m.status === 'issued'
    );
    if (!skipAutoDeduct && existingMRs.length === 0 && matText && String(matText).trim()) {
      const matStr = String(matText).toLowerCase();
      const products = readJson(PRODUCTS_DATA_PATH, DEFAULT_PRODUCTS);

      for (const prod of products) {
        const prodLower = String(prod.product_name).toLowerCase();
        const shortName = prodLower.replace(/\(.*?\)/g, '').trim();
        if (matStr.includes(shortName) || shortName.split(' ').slice(0, 3).every(w => matStr.includes(w))) {
          let qtyToDeduct = 1;
          const match = matStr.match(new RegExp(`(\\d+)\\s*(?:x|units?|rolls?|pcs?|m)?\\s*${shortName.slice(0, 8)}`, 'i'));
          if (match && match[1]) {
            qtyToDeduct = Math.max(1, parseInt(match[1], 10));
          }
          await interModuleSync.adjustProductStock({
            productId: prod.product_id,
            productName: prod.product_name,
            deltaQuantity: -qtyToDeduct,
            type: 'STOCK_OUT',
            reason: `Field Service #SR-${requestId} Materials: ${matText}`,
            actor: actorVal || req.assigned_technician_name || 'Field Technician'
          });
        }
      }
    }

    // Inter-module connection: update customer booking or linked order status
    if (req.booking_ref) {
      if (req.booking_ref.startsWith('INS-') || req.booking_ref.startsWith('SCH-')) {
        const orderNo = req.booking_ref.replace(/^INS-|^SCH-/, '');
        const orders = readJson(CASHIER_ORDERS_PATH, []);
        const order = orders.find(o => String(o.order_no || o.order_number).toUpperCase() === String(orderNo).toUpperCase());
        if (order) {
          if (status === 'in_progress') {
            order.installation_status = 'in_progress';
          } else if (status === 'awaiting_inspection') {
            order.installation_status = 'awaiting_inspection';
          } else if (status === 'returned_for_rework') {
            order.installation_status = 'returned_for_rework';
          } else if (status === 'completed') {
            order.fulfillment_stage = 'completed';
            order.fulfillment_status = 'installed_and_completed';
            order.installation_status = 'completed';
            order.order_status = 'completed';
            order.status = 'completed';
            writeJson(CASHIER_ORDERS_PATH, orders);

            // Stage 6: Trigger Customer Care Follow-Up Task for Product + Installation
            await interModuleSync.createCustomerCareTaskForOrder(order, {
              technician_name: req.assigned_technician_name || req.technician_name || actorVal
            });
          }
          writeJson(CASHIER_ORDERS_PATH, orders);
        }
      }

      const bookings = readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS);
      const b = bookings.find(item => String(item.booking_ref).toUpperCase() === String(req.booking_ref).toUpperCase());
      if (b) {
        b.status = status === 'completed' ? 'completed' : 'confirmed';
        if (status === 'completed') {
          b.confirmation_note = `Service completed by technician ${req.assigned_technician_name || 'Elight Service Desk'}. Thank you for choosing Elight Electrical Shop!`;
        }
        writeJson(BOOKINGS_PATH, bookings);
      }
    }

    appendSystemAudit(
      'Service & Field Operations',
      actorVal || req.assigned_technician_name || 'Technician',
      `Service Status Updated: ${status}`,
      `Service Job #SR-${requestId} marked ${status}. Materials: "${matText || req.materials_used || 'None'}".`
    );

    try {
      const updates = {};
      if (status) updates.status = status;
      if (matText !== undefined) updates.materials_used = matText;
      if (completionNotesVal !== undefined) updates.completion_notes = String(completionNotesVal).trim();
      if (status === 'awaiting_inspection') updates.completed_at = req.completed_at;
      if (status === 'completed') {
        updates.approved_by = req.approved_by;
        updates.approved_at = req.approved_at;
      }
      await supabase.from('service_requests').update(updates).eq('request_id', requestId);
    } catch (e) {}

    return req;
  },

  // ========================================================
  // 2B. TECHNICIAN MATERIAL REQUESTS & INVENTORY ISSUE FLOW
  // ========================================================
  getLiveInventoryProducts: async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('product_id', { ascending: false });
      if (!error && Array.isArray(data) && data.length > 0) {
        const sorted = sortByLatest(data, 'product_id');
        writeJson(PRODUCTS_DATA_PATH, sorted);
        return sorted;
      }
    } catch (e) {}
    return sortByLatest(readJson(PRODUCTS_DATA_PATH, DEFAULT_PRODUCTS), 'product_id');
  },

  getMaterialRequests: async (filter = {}) => {
    let rows = [];
    const localRows = readJson(MATERIAL_REQUESTS_PATH, []);
    try {
      const { data, error } = await supabase
        .from('service_material_requests')
        .select('*')
        .order('material_request_id', { ascending: false });
      if (!error && Array.isArray(data)) {
        rows = data;
        writeJson(MATERIAL_REQUESTS_PATH, rows);
      }
    } catch (e) {}

    if (rows.length === 0 && localRows.length > 0) {
      rows = localRows;
    }

    const [products, serviceReqs] = await Promise.all([
      interModuleSync.getLiveInventoryProducts(),
      interModuleSync.getServiceRequests()
    ]);

    const prodMap = {};
    for (const p of products) prodMap[Number(p.product_id)] = p;
    const srMap = {};
    for (const sr of serviceReqs) srMap[Number(sr.request_id)] = sr;

    let enriched = rows.map(mr => {
      const sr = srMap[Number(mr.service_request_id)] || {};
      const items = (Array.isArray(mr.items) ? mr.items : []).map(it => {
        const liveProd = prodMap[Number(it.product_id)];
        return {
          ...it,
          current_stock: liveProd ? Number(liveProd.quantity_in_stock || 0) : 0,
          category_name: liveProd?.category_name || it.category_name || 'General'
        };
      });
      return {
        ...mr,
        items,
        customer_name: sr.customer_name || mr.customer_name || 'Customer',
        service_type: sr.service_type || mr.service_type || 'Electrical Service',
        location: sr.location || ''
      };
    });

    if (filter.service_request_id) {
      enriched = enriched.filter(m => Number(m.service_request_id) === Number(filter.service_request_id));
    }
    if (filter.status && filter.status !== 'all') {
      enriched = enriched.filter(m => String(m.status).toLowerCase() === String(filter.status).toLowerCase());
    }
    if (filter.technician) {
      const tLow = String(filter.technician).toLowerCase().trim();
      enriched = enriched.filter(m => String(m.technician_name || '').toLowerCase().includes(tLow));
    }

    return sortByLatest(enriched, 'material_request_id');
  },

  createMaterialRequest: async ({ service_request_id, technician_id, technician_name, items, notes }) => {
    const srId = Number(service_request_id);
    if (!srId) throw new Error('Valid service job (#SR) ID is required.');

    const requests = await interModuleSync.getServiceRequests();
    const job = requests.find(r => Number(r.request_id) === srId);
    if (!job) throw new Error(`Service job #SR-${srId} not found.`);

    const rawItems = Array.isArray(items) ? items : [];
    if (rawItems.length === 0) throw new Error('Please select at least one material item and quantity.');

    const products = await interModuleSync.getLiveInventoryProducts();
    const normalizedItems = [];

    for (const row of rawItems) {
      const pid = Number(row.product_id);
      const qty = Math.max(0, parseInt(row.requested_qty ?? row.quantity ?? 0, 10) || 0);
      if (!pid || qty <= 0) continue;

      const prod = products.find(p => Number(p.product_id) === pid);
      if (!prod) throw new Error(`Product #${pid} does not exist in inventory.`);

      normalizedItems.push({
        product_id: Number(prod.product_id),
        product_name: prod.product_name,
        requested_qty: qty,
        approved_qty: 0,
        issued_qty: 0,
        item_status: 'pending'
      });
    }

    if (normalizedItems.length === 0) {
      throw new Error('Each material item must specify a valid product and quantity greater than 0.');
    }

    const mrList = readJson(MATERIAL_REQUESTS_PATH, []);
    const nextId = mrList.length > 0 ? Math.max(...mrList.map(m => Number(m.material_request_id || 0))) + 1 : 1;
    const reqNum = `MR-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const techName = String(technician_name || job.technician_name || job.assigned_technician_name || 'Field Technician').trim();

    const record = {
      material_request_id: nextId,
      request_number: reqNum,
      service_request_id: srId,
      technician_id: technician_id ? Number(technician_id) : (job.assigned_technician_id || null),
      technician_name: techName,
      items: normalizedItems,
      notes: String(notes || '').trim(),
      status: 'pending',
      reviewed_by: null,
      review_notes: null,
      reviewed_at: null,
      issued_by: null,
      issued_at: null,
      created_at: new Date().toISOString()
    };

    try {
      const { data: inserted, error } = await supabase
        .from('service_material_requests')
        .insert([{
          request_number: record.request_number,
          service_request_id: record.service_request_id,
          technician_id: record.technician_id,
          technician_name: record.technician_name,
          items: record.items,
          notes: record.notes,
          status: 'pending'
        }])
        .select('*')
        .single();
      if (!error && inserted?.material_request_id) {
        record.material_request_id = inserted.material_request_id;
        record.created_at = inserted.created_at;
      }
    } catch (e) {}

    mrList.unshift(record);
    writeJson(MATERIAL_REQUESTS_PATH, mrList);

    appendSystemAudit(
      'Service & Field Operations',
      techName,
      'Material Request Submitted',
      `Technician ${techName} submitted Material Request ${reqNum} for #SR-${srId} (${normalizedItems.map(i => `${i.requested_qty}x ${i.product_name}`).join(', ')}).`
    );

    return record;
  },

  reviewMaterialRequest: async (mrId, { action, items, review_notes, actor }) => {
    const idNum = Number(mrId);
    const cleanAction = String(action || '').trim().toLowerCase();
    if (!['approve', 'partial_approve', 'reject'].includes(cleanAction)) {
      throw new Error('Review action must be approve, partial_approve, or reject.');
    }

    const mrList = await interModuleSync.getMaterialRequests();
    const mr = mrList.find(m => Number(m.material_request_id) === idNum);
    if (!mr) throw new Error(`Material Request #${idNum} not found.`);
    if (mr.status === 'issued') {
      throw new Error(`Material Request ${mr.request_number} has already been issued.`);
    }

    const products = await interModuleSync.getLiveInventoryProducts();
    const prodMap = {};
    for (const p of products) prodMap[Number(p.product_id)] = p;

    const overrideMap = {};
    if (Array.isArray(items)) {
      for (const row of items) {
        if (row.product_id) {
          overrideMap[Number(row.product_id)] = Math.max(0, parseInt(row.approved_qty ?? row.quantity ?? 0, 10) || 0);
        }
      }
    }

    const updatedItems = [];
    let anyPositive = false;
    let allFull = true;

    for (const item of (mr.items || [])) {
      const liveProd = prodMap[Number(item.product_id)];
      const liveStock = liveProd ? Number(liveProd.quantity_in_stock || 0) : 0;
      const reqQty = Number(item.requested_qty || 0);

      if (cleanAction === 'reject') {
        allFull = false;
        updatedItems.push({
          ...item,
          approved_qty: 0,
          issued_qty: 0,
          item_status: 'rejected'
        });
      } else if (cleanAction === 'approve') {
        if (liveStock < reqQty) {
          throw new Error(`Insufficient stock for "${item.product_name}": Requested ${reqQty}, Available ${liveStock}. Use Partial Approve or Restock first.`);
        }
        anyPositive = true;
        updatedItems.push({
          ...item,
          approved_qty: reqQty,
          issued_qty: 0,
          item_status: 'approved'
        });
      } else {
        const chosenQty = overrideMap[Number(item.product_id)] !== undefined
          ? overrideMap[Number(item.product_id)]
          : Math.min(reqQty, liveStock);
        if (chosenQty > reqQty) {
          throw new Error(`Approved quantity (${chosenQty}) cannot exceed requested quantity (${reqQty}) for "${item.product_name}".`);
        }
        if (chosenQty > liveStock) {
          throw new Error(`Approved quantity (${chosenQty}) exceeds live stock (${liveStock}) for "${item.product_name}".`);
        }
        if (chosenQty > 0) anyPositive = true;
        if (chosenQty < reqQty) allFull = false;
        updatedItems.push({
          ...item,
          approved_qty: chosenQty,
          issued_qty: 0,
          item_status: chosenQty === reqQty ? 'approved' : (chosenQty > 0 ? 'partially_approved' : 'rejected')
        });
      }
    }

    if (cleanAction === 'partial_approve' && !anyPositive) {
      throw new Error('At least one material item must have an approved quantity greater than 0 for partial approval (otherwise reject the request).');
    }
    if (cleanAction === 'reject' && !String(review_notes || '').trim()) {
      throw new Error('Please provide a reason in review notes when rejecting a material request.');
    }

    const nextStatus = cleanAction === 'reject'
      ? 'rejected'
      : (cleanAction === 'partial_approve' && !allFull ? 'partially_approved' : 'approved');

    const reviewer = String(actor || 'Inventory Manager').trim();
    const reviewedAt = new Date().toISOString();
    const cleanNotes = String(review_notes || '').trim();

    const localList = readJson(MATERIAL_REQUESTS_PATH, []);
    const localIdx = localList.findIndex(m => Number(m.material_request_id) === idNum);
    const updatedRecord = {
      ...mr,
      items: updatedItems,
      status: nextStatus,
      reviewed_by: reviewer,
      review_notes: cleanNotes,
      reviewed_at: reviewedAt
    };
    if (localIdx >= 0) localList[localIdx] = updatedRecord;
    else localList.unshift(updatedRecord);
    writeJson(MATERIAL_REQUESTS_PATH, localList);

    try {
      await supabase
        .from('service_material_requests')
        .update({
          items: updatedItems,
          status: nextStatus,
          reviewed_by: reviewer,
          review_notes: cleanNotes,
          reviewed_at: reviewedAt
        })
        .eq('material_request_id', idNum);
    } catch (e) {}

    appendSystemAudit(
      'Inventory',
      reviewer,
      `Material Request ${nextStatus.replace(/_/g, ' ').toUpperCase()}`,
      `${reviewer} marked Material Request ${mr.request_number} (#SR-${mr.service_request_id}) as ${nextStatus}. Notes: ${cleanNotes || 'None'}.`
    );

    return updatedRecord;
  },

  issueMaterialRequest: async (mrId, { actor }) => {
    const idNum = Number(mrId);
    const mrList = await interModuleSync.getMaterialRequests();
    const mr = mrList.find(m => Number(m.material_request_id) === idNum);
    if (!mr) throw new Error(`Material Request #${idNum} not found.`);
    if (mr.status === 'issued') {
      throw new Error(`Materials for ${mr.request_number} have already been issued.`);
    }
    if (!['approved', 'partially_approved'].includes(String(mr.status || '').toLowerCase())) {
      throw new Error(`Material Request ${mr.request_number} must be approved or partially approved before materials can be issued (Current status: ${mr.status}).`);
    }

    const products = await interModuleSync.getLiveInventoryProducts();
    const itemsToIssue = (mr.items || []).filter(it => Number(it.approved_qty || 0) > 0);
    if (itemsToIssue.length === 0) {
      throw new Error('No approved material quantities available to issue.');
    }

    // Verify all stock levels before deducting any item
    for (const item of itemsToIssue) {
      const prod = products.find(p => Number(p.product_id) === Number(item.product_id));
      const available = prod ? Number(prod.quantity_in_stock || 0) : 0;
      if (available < Number(item.approved_qty)) {
        throw new Error(`Cannot issue "${item.product_name}": Approved ${item.approved_qty}, available stock is now only ${available}.`);
      }
    }

    const issuer = String(actor || 'Inventory Manager').trim();
    const issuedAt = new Date().toISOString();
    const movements = [];

    for (const item of itemsToIssue) {
      const qty = Number(item.approved_qty);
      const resAdj = await interModuleSync.adjustProductStock({
        productId: item.product_id,
        productName: item.product_name,
        deltaQuantity: -qty,
        type: 'STOCK_OUT',
        reason: `Material Issue ${mr.request_number} for Service #SR-${mr.service_request_id} (Tech: ${mr.technician_name})`,
        actor: issuer
      });
      if (resAdj?.movement) movements.push(resAdj.movement);
    }

    const issuedItems = (mr.items || []).map(it => ({
      ...it,
      issued_qty: Number(it.approved_qty || 0),
      item_status: Number(it.approved_qty || 0) > 0 ? 'issued' : it.item_status
    }));

    const localList = readJson(MATERIAL_REQUESTS_PATH, []);
    const localIdx = localList.findIndex(m => Number(m.material_request_id) === idNum);
    const updatedRecord = {
      ...mr,
      items: issuedItems,
      status: 'issued',
      issued_by: issuer,
      issued_at: issuedAt
    };
    if (localIdx >= 0) localList[localIdx] = updatedRecord;
    else localList.unshift(updatedRecord);
    writeJson(MATERIAL_REQUESTS_PATH, localList);

    try {
      await supabase
        .from('service_material_requests')
        .update({
          items: issuedItems,
          status: 'issued',
          issued_by: issuer,
          issued_at: issuedAt
        })
        .eq('material_request_id', idNum);
    } catch (e) {}

    // Append summary of officially issued materials to the service request without double-deducting
    const issuedSummary = itemsToIssue.map(i => `${i.approved_qty}x ${i.product_name}`).join(', ');
    const requests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
    const sr = requests.find(r => Number(r.request_id) === Number(mr.service_request_id));
    if (sr) {
      sr.materials_used = sr.materials_used
        ? `${sr.materials_used}; Issued (${mr.request_number}): ${issuedSummary}`
        : `Issued (${mr.request_number}): ${issuedSummary}`;
      writeJson(SERVICE_REQUESTS_PATH, requests);
      try {
        await supabase
          .from('service_requests')
          .update({ materials_used: sr.materials_used })
          .eq('request_id', sr.request_id);
      } catch (e) {}
    }

    appendSystemAudit(
      'Inventory',
      issuer,
      'Service Materials Issued',
      `${issuer} issued materials [${issuedSummary}] to ${mr.technician_name} (${mr.request_number}, #SR-${mr.service_request_id}). Inventory deducted and stock movements logged.`
    );

    return { material_request: updatedRecord, movements };
  },

  reviewServiceCompletion: async (requestId, { action = 'approve', approval_notes, return_reason, service_fee, actor }) => {
    const srId = Number(requestId);
    const cleanAction = String(action || 'approve').trim().toLowerCase();
    if (!['approve', 'return'].includes(cleanAction)) {
      throw new Error('Inspection decision must be either approve or return.');
    }

    await interModuleSync.getServiceRequests(); // Ensure cache hydrated
    const requests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
    const req = requests.find(r => Number(r.request_id) === srId);
    if (!req) return null;

    const actorName = String(actor || 'Service Manager').trim();

    if (cleanAction === 'return') {
      const reason = String(return_reason || approval_notes || '').trim();
      if (!reason) {
        throw new Error('Please specify a clear reason / rework instructions when returning the job.');
      }

      req.status = 'returned_for_rework';
      req.return_reason = reason;
      req.approved_by = actorName;
      writeJson(SERVICE_REQUESTS_PATH, requests);

      if (req.booking_ref) {
        const bookings = readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS);
        const b = bookings.find(item => String(item.booking_ref).toUpperCase() === String(req.booking_ref).toUpperCase());
        if (b) {
          b.status = 'confirmed';
          writeJson(BOOKINGS_PATH, bookings);
        }
      }

      try {
        await supabase
          .from('service_requests')
          .update({
            status: 'returned_for_rework',
            return_reason: reason,
            approved_by: actorName
          })
          .eq('request_id', srId);
      } catch (e) {}

      appendSystemAudit(
        'Service & Field Operations',
        actorName,
        'Service Job Returned for Further Work',
        `Service Manager ${actorName} returned Service #SR-${srId} (${req.customer_name}) to technician ${req.technician_name || ''} for rework: "${reason}".`
      );

      return req;
    }

    // Action: approve completion and charge service fee
    let chargedFee = Number(service_fee ?? req.service_fee ?? 0);
    if (Number.isNaN(chargedFee) || chargedFee < 0) chargedFee = 0;

    if (chargedFee === 0 && req.booking_ref) {
      const bookings = readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS);
      const linkedB = bookings.find(item => String(item.booking_ref).toUpperCase() === String(req.booking_ref).toUpperCase());
      if (linkedB && Number(linkedB.estimated_amount || 0) > 0) {
        chargedFee = Number(linkedB.estimated_amount);
      }
    }

    const billingStatus = chargedFee > 0 ? 'pending_payment' : 'paid';
    const paymentStatus = chargedFee > 0 ? 'unpaid' : 'paid';

    req.status = 'completed';
    req.approved_by = actorName;
    req.approved_at = new Date().toISOString();
    req.return_reason = null;
    req.service_fee = Number(chargedFee.toFixed(2));
    req.billing_status = billingStatus;
    req.payment_status = paymentStatus;
    if (approval_notes) {
      req.approval_notes = String(approval_notes).trim();
    }
    writeJson(SERVICE_REQUESTS_PATH, requests);

    // Trigger downstream booking & linked order updates without re-deducting stock
    await interModuleSync.updateServiceRequestStatus(srId, 'completed', {
      materialsUsed: req.materials_used,
      actor: actorName,
      skipAutoStockDeduct: true
    });

    if (req.booking_ref && chargedFee > 0) {
      const bookings = readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS);
      const b = bookings.find(item => String(item.booking_ref).toUpperCase() === String(req.booking_ref).toUpperCase());
      if (b) {
        b.estimated_amount = req.service_fee;
        b.status = 'completed';
        b.confirmation_note = `Work completed & approved by ${actorName}. Service Fee of KES ${req.service_fee.toLocaleString()} is ready for settlement with Finance.`;
        writeJson(BOOKINGS_PATH, bookings);
        try {
          await supabase
            .from('bookings')
            .update({ estimated_amount: req.service_fee, status: 'completed', confirmation_note: b.confirmation_note })
            .eq('booking_ref', req.booking_ref);
        } catch (e) {}
      }
    }

    try {
      await supabase
        .from('service_requests')
        .update({
          status: 'completed',
          approved_by: req.approved_by,
          approved_at: req.approved_at,
          return_reason: null,
          service_fee: req.service_fee,
          billing_status: req.billing_status,
          payment_status: req.payment_status
        })
        .eq('request_id', srId);
    } catch (e) {}

    appendSystemAudit(
      'Service & Field Operations',
      actorName,
      'Service Completion Approved & Billed',
      `Service Manager ${actorName} approved #SR-${srId} (${req.customer_name}). Service fee charged: KES ${req.service_fee.toLocaleString()} (${billingStatus}).`
    );

    return req;
  },

  confirmServiceFeePayment: async (requestId, { amount_paid, payment_method, transaction_ref, actor }) => {
    const srId = Number(requestId);
    await interModuleSync.getServiceRequests();
    const requests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
    const req = requests.find(r => Number(r.request_id) === srId);
    if (!req) throw new Error(`Service Request #SR-${srId} not found.`);
    if (String(req.status).toLowerCase() !== 'completed') {
      throw new Error('Service fee payment can only be confirmed after Service Manager approves completion.');
    }
    if (String(req.payment_status).toLowerCase() === 'paid') {
      throw new Error(`Service fee for #SR-${srId} has already been confirmed paid (${req.service_receipt_no || 'Paid'}).`);
    }

    const paidAmt = Number(amount_paid ?? req.service_fee ?? 0);
    if (Number.isNaN(paidAmt) || paidAmt <= 0) {
      throw new Error('A valid positive service fee amount is required.');
    }
    const cleanMethod = String(payment_method || 'M-Pesa').trim();
    const refCheck = validatePaymentReference(cleanMethod, transaction_ref, { required: true, label: 'Transaction reference' });
    if (!refCheck.valid) {
      throw new Error(refCheck.message);
    }
    const cleanRef = refCheck.value;

    const actorName = String(actor || 'Finance Manager').trim();
    const receiptNo = `RCP-SR-${srId}-${String(Date.now()).slice(-4)}`;
    const paidAt = new Date().toISOString();

    req.service_fee = Number(paidAmt.toFixed(2));
    req.billing_status = 'paid';
    req.payment_status = 'paid';
    req.service_payment_method = cleanMethod;
    req.service_payment_ref = cleanRef;
    req.service_receipt_no = receiptNo;
    req.service_paid_at = paidAt;
    req.service_payment_confirmed_by = actorName;
    writeJson(SERVICE_REQUESTS_PATH, requests);

    try {
      await supabase
        .from('service_requests')
        .update({
          service_fee: req.service_fee,
          billing_status: 'paid',
          payment_status: 'paid',
          service_payment_method: cleanMethod,
          service_payment_ref: cleanRef,
          service_receipt_no: receiptNo,
          service_paid_at: paidAt,
          service_payment_confirmed_by: actorName
        })
        .eq('request_id', srId);
    } catch (e) {}

    // Record revenue in Finance Treasury & P&L
    const finDesc = `Service Fee Payment #SR-${srId} (${req.customer_name}) - ${req.service_type} [Receipt: ${receiptNo}] [Finance: ${actorName}]`;
    let financeRecId = Date.now();
    try {
      const { data: finRow } = await supabase
        .from('finance_records')
        .insert([{
          type: 'sale',
          category: 'Service Fee Payment',
          description: finDesc,
          amount: req.service_fee,
          payment_method: cleanMethod,
          reference_no: cleanRef,
          status: 'confirmed'
        }])
        .select('*')
        .single();
      if (finRow?.record_id) financeRecId = finRow.record_id;
    } catch (e) {}

    const finRecords = readJson(FINANCE_RECORDS_PATH, []);
    finRecords.unshift({
      record_id: financeRecId,
      type: 'sale',
      category: 'Service Fee Payment',
      description: finDesc,
      amount: req.service_fee,
      payment_method: cleanMethod,
      reference_no: cleanRef,
      status: 'confirmed',
      created_at: paidAt
    });
    writeJson(FINANCE_RECORDS_PATH, finRecords);

    if (req.booking_ref) {
      const bookings = readJson(BOOKINGS_PATH, DEFAULT_BOOKINGS);
      const b = bookings.find(item => String(item.booking_ref).toUpperCase() === String(req.booking_ref).toUpperCase());
      if (b) {
        b.status = 'completed';
        b.confirmation_note = `Service fee KES ${req.service_fee.toLocaleString()} confirmed paid by ${actorName}. Official Receipt: ${receiptNo}.`;
        writeJson(BOOKINGS_PATH, bookings);
        try {
          await supabase.from('bookings').update({ status: 'completed', confirmation_note: b.confirmation_note }).eq('booking_ref', req.booking_ref);
        } catch (e) {}
      }
    }

    appendSystemAudit(
      'Finance & Accounting',
      actorName,
      'Service Fee Payment Confirmed',
      `${actorName} confirmed KES ${req.service_fee.toLocaleString()} (${cleanMethod}, Ref: ${cleanRef}) for Service #SR-${srId} (${req.customer_name}). Receipt issued: ${receiptNo}.`
    );

    return req;
  },

  // ========================================================
  // 3. PRODUCT BOOKINGS & CASHIER ORDERS CONNECTION
  // ========================================================
  getCashierOrders: () => readJson(CASHIER_ORDERS_PATH, []),

  createCashierOrderFromBooking: async (booking) => {
    const orders = readJson(CASHIER_ORDERS_PATH, []);
    const refNo = booking.booking_ref || `BK-ELIGHT-${Date.now().toString().slice(-4)}`;

    // Avoid duplicate booking orders
    const exists = orders.some(o => String(o.order_no).toUpperCase() === refNo.toUpperCase());
    if (exists) return null;

    const amt = Number(booking.estimated_amount || 0);
    const qty = Math.max(1, Number(booking.quantity || 1));
    const unitPrice = qty > 0 ? (amt / qty) : amt;

    const newOrder = {
      order_no: refNo,
      receipt_no: '',
      source: 'Customer Product Booking',
      customer_name: booking.customer_name || 'Customer',
      customer_phone: booking.customer_phone || '',
      customer_location: booking.location_or_notes || 'Meru County Showroom Collection',
      items: [{
        product_id: booking.product_id ? Number(booking.product_id) : null,
        product_name: booking.item_or_service_name || 'Booked Electrical Item',
        quantity: qty,
        unit_price: unitPrice
      }],
      subtotal: amt,
      delivery_fee: 0,
      total_amount: amt,
      payment_status: 'pending',
      payment_method: 'Pay on Collection (Cash/M-Pesa)',
      payment_ref: '',
      cash_tendered: 0,
      change_due: 0,
      fulfillment_mode: 'collection',
      fulfillment_status: 'awaiting_payment',
      cashier_name: '',
      stock_deducted: false,
      booking_id: booking.booking_id,
      booking_ref: refNo,
      created_at: new Date().toISOString()
    };

    orders.unshift(newOrder);
    writeJson(CASHIER_ORDERS_PATH, orders);

    appendSystemAudit(
      'Cashier Desk',
      'Booking Synchronization Engine',
      'Product Booking Queued for Cashier',
      `Queued Product Reservation ${refNo} (${booking.item_or_service_name}) for ${booking.customer_name} into Cashier payment queue.`
    );

    return newOrder;
  },

  // ========================================================
  // 4. DISPATCHES & DRIVER DELIVERIES CONNECTION
  // ========================================================
  getDispatches: async (driverFilter = null) => {
    let dispatches = [];
    try {
      const { data, error } = await supabase
        .from('dispatches')
        .select('*')
        .order('dispatch_id', { ascending: false });
      if (!error && Array.isArray(data) && data.length > 0) {
        dispatches = data;
        writeJson(DISPATCHES_PATH, data);
      }
    } catch (e) {}

    if (dispatches.length === 0) {
      dispatches = readJson(DISPATCHES_PATH, DEFAULT_DISPATCHES);
    }

    if (driverFilter && driverFilter !== 'all') {
      const filterLower = String(driverFilter).toLowerCase().trim();
      dispatches = dispatches.filter(d => {
        const dName = String(d.driver_name || '').toLowerCase();
        return dName.includes(filterLower) || filterLower.includes(dName);
      });
    }

    return sortByLatest(dispatches, 'dispatch_id');
  },

  createDispatchForOrder: async (order, options = {}) => {
    const dispatches = readJson(DISPATCHES_PATH, DEFAULT_DISPATCHES);
    const nextId = dispatches.length > 0 ? Math.max(...dispatches.map(d => d.dispatch_id || 0)) + 1 : 101;

    const fType = order.fulfillment_type || (order.fulfillment_mode === 'collection' ? 'product_collection' : 'product_delivery');
    const needsInstall = Boolean(options.needs_installation || fType === 'product_delivery_install');
    const bookedLater = Boolean(options.booked_later || fType === 'product_install_later');

    // Check if dispatch already exists for this order
    const existing = dispatches.find(d => String(d.order_no).toUpperCase() === String(order.order_no).toUpperCase());
    if (existing) {
      existing.fulfillment_type = fType;
      existing.needs_installation = needsInstall;
      existing.booked_later = bookedLater;
      writeJson(DISPATCHES_PATH, dispatches);
      return existing;
    }

    let driverNote = `PAID Order (${order.payment_method || 'M-Pesa'} Ref: ${order.payment_ref || 'N/A'}). Cashier: ${order.cashier_name || 'Esther Karimi'}`;
    if (needsInstall) {
      driverNote = `[DELIVER & INSTALL] Deliver goods to site; immediate technician installation required upon delivery. (${order.payment_method || 'M-Pesa'}).`;
    } else if (bookedLater) {
      driverNote = `[DELIVER NOW - INSTALL BOOKED LATER] Deliver goods to customer site. Installation date will be booked later by customer.`;
    }

    const newDisp = {
      dispatch_id: nextId,
      order_no: order.order_no,
      customer_name: order.customer_name || 'Customer',
      customer_phone: order.customer_phone || 'N/A',
      delivery_address: order.customer_location || 'Meru County Delivery Area',
      driver_name: 'Unassigned',
      scheduled_date: new Date().toISOString().split('T')[0],
      status: 'pending_dispatch',
      fulfillment_type: fType,
      needs_installation: needsInstall,
      booked_later: bookedLater,
      driver_notes: driverNote,
      created_at: new Date().toISOString()
    };

    dispatches.unshift(newDisp);
    writeJson(DISPATCHES_PATH, dispatches);

    appendSystemAudit(
      'Dispatch & Deliveries',
      'Order Fulfillment Sync',
      'Delivery Dispatch Run Created',
      `Auto-created Delivery Run #DSP-${nextId} for Order ${order.order_no} to ${newDisp.delivery_address}. Queued for driver assignment.`
    );

    try {
      await supabase.from('dispatches').insert([{
        order_no: newDisp.order_no,
        customer_name: newDisp.customer_name,
        customer_phone: newDisp.customer_phone,
        delivery_address: newDisp.delivery_address,
        driver_name: newDisp.driver_name,
        scheduled_date: newDisp.scheduled_date,
        status: newDisp.status,
        driver_notes: newDisp.driver_notes
      }]);
    } catch (e) {}

    return newDisp;
  },

  updateDispatchStatus: async (dispatchId, status, driverNotes, driverName) => {
    const dispatches = readJson(DISPATCHES_PATH, DEFAULT_DISPATCHES);
    const disp = dispatches.find(d => Number(d.dispatch_id) === Number(dispatchId));
    if (!disp) return null;

    if (status) disp.status = status;
    if (driverNotes !== undefined) disp.driver_notes = driverNotes;
    if (driverName) disp.driver_name = driverName;
    writeJson(DISPATCHES_PATH, dispatches);

    // If delivered, sync order fulfillment status in cashier orders according to pipeline
    if (status === 'delivered' && disp.order_no) {
      const orders = readJson(CASHIER_ORDERS_PATH, []);
      const order = orders.find(o => String(o.order_no || o.order_number).toUpperCase() === String(disp.order_no).toUpperCase());
      if (order) {
        order.delivery_status = 'delivered';
        const isInstallNow = order.fulfillment_type === 'product_delivery_install' || disp.needs_installation;
        const isInstallLater = order.fulfillment_type === 'product_install_later' || disp.booked_later;
        const hasRequestedInst = Boolean(
          order.requires_installation ||
          isInstallNow ||
          isInstallLater ||
          (order.installation_status && !['not_requested', 'completed', 'cancelled'].includes(order.installation_status))
        );

        if (hasRequestedInst && (isInstallNow || (!isInstallLater && order.requires_installation))) {
          // Product + immediate installation -> Delivery finished (delivered), Installation stays independent
          order.fulfillment_stage = 'installation';
          order.fulfillment_status = 'installation_pending';
          order.installation_status = order.installation_status && order.installation_status !== 'not_requested' ? order.installation_status : 'approved';
          order.site_ready_for_installation = true;

          // Trigger/unlock linked product installation ticket for Service Manager & Field Technicians
          const serviceRequests = readJson(SERVICE_REQUESTS_PATH, DEFAULT_SERVICE_REQUESTS);
          const existingReq = serviceRequests.find(r => r.booking_ref === `INS-${order.order_no}` || (r.description && r.description.includes(order.order_no)));
          if (!existingReq) {
            const nextReqId = serviceRequests.length > 0 ? Math.max(...serviceRequests.map(s => s.request_id || 0)) + 1 : 101;
            const itemsSummary = (order.items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ');
            const installReq = {
              request_id: nextReqId,
              booking_ref: `INS-${order.order_no}`,
              customer_name: order.customer_name || 'Customer',
              phone: order.customer_phone || 'N/A',
              location: disp.delivery_address || order.customer_location || 'Meru County',
              service_type: 'Product Installation',
              description: `Immediate Product Installation for Delivered Order ${order.order_no} (${itemsSummary || 'Electrical Products'}). Goods delivered to site; ready for technician installation.`,
              scheduled_date: new Date().toISOString().split('T')[0],
              status: 'pending',
              site_ready: true,
              site_ready_for_installation: true,
              assigned_technician_id: null,
              assigned_technician_name: '',
              technician_name: '',
              materials_used: '',
              created_at: new Date().toISOString()
            };
            serviceRequests.unshift(installReq);
            writeJson(SERVICE_REQUESTS_PATH, serviceRequests);
            try {
              const { data: insertedInst } = await supabase.from('service_requests').insert([{
                booking_ref: installReq.booking_ref,
                customer_name: installReq.customer_name,
                phone: installReq.phone,
                location: installReq.location,
                service_type: installReq.service_type,
                description: installReq.description,
                scheduled_date: installReq.scheduled_date,
                status: installReq.status
              }]).select('*').single();
              if (insertedInst?.request_id) {
                installReq.request_id = insertedInst.request_id;
                writeJson(SERVICE_REQUESTS_PATH, serviceRequests);
              }
            } catch (e) {}
          } else {
            existingReq.site_ready = true;
            existingReq.site_ready_for_installation = true;
            writeJson(SERVICE_REQUESTS_PATH, serviceRequests);
          }
        } else if (hasRequestedInst && isInstallLater) {
          // Product delivered; scheduled installation remains independent until booked/completed
          order.fulfillment_stage = 'scheduled_installation';
          order.fulfillment_status = 'scheduled_installation_pending';
          order.installation_status = order.installation_status && order.installation_status !== 'not_requested' ? order.installation_status : 'approved';
          order.site_ready_for_installation = true;
        } else {
          // Product only (no installation requested): Delivery completed, Installation explicitly remains not_requested
          order.installation_status = 'not_requested';
          order.requires_installation = false;
          order.fulfillment_stage = 'completed';
          order.fulfillment_status = 'delivered';
          order.order_status = 'completed';
          order.status = 'completed';

          // Trigger Customer Care Follow-Up Task for Product-Only Delivery
          await interModuleSync.createCustomerCareTaskForOrder(order, {
            driver_name: driverName || disp.driver_name
          });
        }
        writeJson(CASHIER_ORDERS_PATH, orders);
      }
    } else if (status === 'failed' && disp.order_no) {
      const orders = readJson(CASHIER_ORDERS_PATH, []);
      const order = orders.find(o => String(o.order_no || o.order_number).toUpperCase() === String(disp.order_no).toUpperCase());
      if (order) {
        order.delivery_status = 'failed';
        order.delivery_failed_reason = driverNotes || 'Customer unavailable / delivery attempt failed';
        writeJson(CASHIER_ORDERS_PATH, orders);
      }
    } else if (status === 'out_for_delivery' && disp.order_no) {
      const orders = readJson(CASHIER_ORDERS_PATH, []);
      const order = orders.find(o => String(o.order_no || o.order_number).toUpperCase() === String(disp.order_no).toUpperCase());
      if (order) {
        order.delivery_status = 'out_for_delivery';
        writeJson(CASHIER_ORDERS_PATH, orders);
      }
    }

    appendSystemAudit(
      'Dispatch & Deliveries',
      driverName || disp.driver_name || 'Delivery Driver',
      `Delivery Run Status: ${status}`,
      `Dispatch #DSP-${dispatchId} (${disp.order_no}) marked ${status}. Customer: ${disp.customer_name}.`
    );

    try {
      const updates = {};
      if (status) updates.status = status;
      if (driverNotes !== undefined) updates.driver_notes = driverNotes;
      if (driverName) updates.driver_name = driverName;
      await supabase.from('dispatches').update(updates).eq('dispatch_id', dispatchId);
    } catch (e) {}

    return disp;
  },

  rescheduleDispatch: async (dispatchId, newScheduledDate, reason, actor) => {
    const dispatches = readJson(DISPATCHES_PATH, DEFAULT_DISPATCHES);
    const disp = dispatches.find(d => Number(d.dispatch_id) === Number(dispatchId));
    if (!disp) return null;

    disp.status = 'rescheduled';
    disp.scheduled_date = newScheduledDate;
    disp.driver_notes = `Rescheduled to ${newScheduledDate}. Reason: ${reason || 'Customer request / access delay'}`;
    writeJson(DISPATCHES_PATH, dispatches);

    if (disp.order_no) {
      const orders = readJson(CASHIER_ORDERS_PATH, []);
      const order = orders.find(o => String(o.order_no || o.order_number).toUpperCase() === String(disp.order_no).toUpperCase());
      if (order) {
        order.delivery_status = 'rescheduled';
        order.delivery_failed_reason = reason;
        order.rescheduled_date = newScheduledDate;
        writeJson(CASHIER_ORDERS_PATH, orders);
      }
    }

    appendSystemAudit(
      'Dispatch & Deliveries',
      actor || 'Dispatch Manager',
      'Delivery Rescheduled',
      `Dispatch #DSP-${dispatchId} (${disp.order_no}) rescheduled to ${newScheduledDate}. Reason: ${reason}`
    );

    try {
      await supabase.from('dispatches').update({
        status: 'rescheduled',
        scheduled_date: newScheduledDate,
        driver_notes: disp.driver_notes
      }).eq('dispatch_id', dispatchId);
    } catch (e) {}

    return disp;
  },

  // ========================================================
  // 5. CUSTOMER CARE FOLLOW-UP MODULE (Stage 6)
  // ========================================================
  getCustomerCareTasks: async () => {
    return sortByLatest(readJson(CUSTOMER_CARE_TASKS_PATH, []), 'created_at');
  },

  createCustomerCareTaskForOrder: async (order, extra = {}) => {
    const tasks = readJson(CUSTOMER_CARE_TASKS_PATH, []);
    const orderNo = order.order_no || order.order_number;

    // Prevent duplicate follow-up tasks
    const existing = tasks.find(t => String(t.order_no).toUpperCase() === String(orderNo).toUpperCase());
    if (existing) return existing;

    const newTask = {
      task_id: `CCT-${orderNo}`,
      order_no: orderNo,
      customer_name: order.customer_name || 'Valued Customer',
      customer_phone: order.customer_phone || '',
      customer_location: order.customer_location || 'Meru County',
      fulfillment_type: order.fulfillment_type || 'product_delivery',
      product_summary: (order.items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ') || 'Electrical Supplies',
      driver_name: extra.driver_name || order.driver_name || 'Assigned Driver',
      technician_name: extra.technician_name || order.technician_name || null,
      delivery_status: order.delivery_status || 'delivered',
      installation_status: order.installation_status || 'not_requested',
      status: 'pending_followup', // 'pending_followup', 'completed'
      product_condition: '', // 'Good Condition', 'Damaged / Defect', 'Missing Parts'
      delivery_satisfaction: null, // 1 to 5
      delivery_notes: '',
      installation_satisfaction: null, // 1 to 5
      installation_notes: '',
      feedback_or_complaint: '',
      is_complaint: false,
      followup_agent: '',
      completed_at: null,
      created_at: new Date().toISOString()
    };

    tasks.unshift(newTask);
    writeJson(CUSTOMER_CARE_TASKS_PATH, tasks);

    appendSystemAudit(
      'Customer Care',
      'Fulfillment Completion Engine',
      'Follow-Up Task Created',
      `Queued Customer Care follow-up task ${newTask.task_id} for Order #${orderNo} (${newTask.customer_name}).`
    );

    return newTask;
  },

  completeCustomerCareTask: async (taskId, details = {}) => {
    const tasks = readJson(CUSTOMER_CARE_TASKS_PATH, []);
    const task = tasks.find(t => String(t.task_id).toUpperCase() === String(taskId).toUpperCase() || String(t.order_no).toUpperCase() === String(taskId).toUpperCase());
    if (!task) return null;

    task.status = 'completed';
    task.product_condition = details.product_condition || 'Good Condition';
    task.delivery_satisfaction = Number(details.delivery_satisfaction || 5);
    task.delivery_notes = String(details.delivery_notes || '').trim();
    task.installation_satisfaction = details.installation_satisfaction ? Number(details.installation_satisfaction) : null;
    task.installation_notes = String(details.installation_notes || '').trim();
    task.feedback_or_complaint = String(details.feedback_or_complaint || '').trim();
    task.is_complaint = Boolean(details.is_complaint);
    task.followup_agent = details.agent_name || 'Customer Care Agent';
    task.completed_at = new Date().toISOString();

    writeJson(CUSTOMER_CARE_TASKS_PATH, tasks);

    // Synchronize into customer feedback store & Supabase
    try {
      const feedbacks = readJson(CUSTOMER_FEEDBACK_PATH, []);
      const newFeedback = {
        feedback_id: Date.now(),
        customer_name: task.customer_name,
        customer_email: task.customer_phone ? `${task.customer_phone}@customer.elight.co.ke` : 'customer@elight.co.ke',
        feedback_type: task.is_complaint ? 'complaint' : 'service_review',
        rating: task.delivery_satisfaction || 5,
        subject: `Order #${task.order_no} Post-Fulfillment Follow-Up`,
        message: `Product Condition: ${task.product_condition}. Delivery: ${task.delivery_satisfaction}/5 (${task.delivery_notes || 'Satisfied'}). ${task.installation_satisfaction ? 'Installation: ' + task.installation_satisfaction + '/5 (' + (task.installation_notes || 'Satisfied') + '). ' : ''}Customer Feedback: ${task.feedback_or_complaint || 'No issues reported.'}`,
        status: 'published',
        created_at: new Date().toISOString()
      };
      feedbacks.unshift(newFeedback);
      writeJson(CUSTOMER_FEEDBACK_PATH, feedbacks);

      await supabase.from('customer_feedback').insert([{
        customer_name: newFeedback.customer_name,
        customer_email: newFeedback.customer_email,
        feedback_type: newFeedback.feedback_type,
        rating: newFeedback.rating,
        subject: newFeedback.subject,
        message: newFeedback.message,
        status: 'published'
      }]);
    } catch (e) {}

    appendSystemAudit(
      'Customer Care',
      task.followup_agent,
      'Follow-Up Call Logged',
      `Logged post-fulfillment review for Order #${task.order_no} (${task.customer_name}). Condition: ${task.product_condition}, Delivery: ${task.delivery_satisfaction}/5.`
    );

    return task;
  }
};

module.exports = interModuleSync;
