const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const interModuleSync = require('../utils/interModuleSync');
const { readJsonFile, writeJsonFile } = require('../utils/jsonStore');
const { sortByLatest } = require('../utils/sortLatest');

const FEEDBACK_DATA_PATH = path.join(__dirname, '../config/feedback_data.json');

function readLocalFeedback() {
  const parsed = readJsonFile(FEEDBACK_DATA_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeLocalFeedback(list) {
  writeJsonFile(FEEDBACK_DATA_PATH, list);
}

// Static structured content for Help Module & About Us Module
const HELP_GUIDES = [
  {
    id: 'cust-1',
    audience: 'customer',
    icon: '🔎',
    title: 'Searching & Filtering Electrical Products',
    steps: [
      'Open the Product Catalog page from the navigation menu or use the Search bar on the Home page.',
      'Type any product name, brand, wattage, or category (e.g., "LED Bulb", "2.5mm Cable", "MCB", or "Chandelier").',
      'Narrow results using Category, Price Range (KES), Stock Status, or Sort filters.',
      'Click "+ Add to Cart" on any available item to add it to your shopping cart.'
    ]
  },
  {
    id: 'cust-2',
    audience: 'customer',
    icon: '🛒',
    title: 'Shopping Cart & M-Pesa Till / Cash Checkout',
    steps: [
      'Open "Cart" in the navigation menu to review selected electrical items and adjust quantities.',
      'Enter your Full Name, Phone Number, Meru County Delivery Location, and preferred Payment Method (M-Pesa Buy Goods Till 5894210 or Cash on Delivery).',
      'If paying via M-Pesa Till, enter your M-Pesa transaction reference code and submit your order for Cashier verification and stock reservation.'
    ]
  },
  {
    id: 'cust-3',
    audience: 'customer',
    icon: '📅',
    title: 'Booking Electrical Services or Product Reservations',
    steps: [
      'Navigate to the "Book" page from the navigation menu.',
      'Choose either "Book Electrical Service" (wiring, solar, chandelier mounting, fault repair) or "Reserve Product for Future Date".',
      'Pick your preferred future date, enter your contact details and Meru County location, and submit (our Service Manager assigns your arrival time slot upon review).',
      'Save your Booking Reference (e.g., BK-ELIGHT-XXXX) shown on the confirmation card to check your status anytime.'
    ]
  },
  {
    id: 'cust-4',
    audience: 'customer',
    icon: '🛡️',
    title: 'Customer Account, Order History & Warranties',
    steps: [
      'Click "Login" and sign in (or register a new customer account from the Sign-In page).',
      'Inside "My Account", view your personal contact profile, order history, scheduled bookings, and active product warranty expiry dates.',
      'Use "Feedback" or "Contact Us" anytime to leave a review, report an issue, or request a bulk contractor quotation.'
    ]
  },
  {
    id: 'att-1',
    audience: 'attendant',
    icon: '🧾',
    title: 'Cashier Guide: New Sale & Customer Payment Confirmation',
    steps: [
      'Sign in via /login with your Cashier credentials to open the Cashier Module and New Sale POS.',
      'Use "New Sale" to add showroom walk-in products, calculate totals in KES, and record Cash, M-Pesa Till, or Bank Transfer payments.',
      'In "Cashier Module", review online orders awaiting verification, confirm received M-Pesa or Cash payments, generate receipts, and forward paid delivery orders to Dispatch Manager.'
    ]
  },
  {
    id: 'att-2',
    audience: 'attendant',
    icon: '📦',
    title: 'Inventory Manager Guide: Stock Levels & Movements',
    steps: [
      'Sign in via /login using your Inventory Manager or Administrator credentials.',
      'Open "Inventory Manager" and use live search or the Low Stock filter to identify items at or below their Reorder Level.',
      'Click "+ Add New Product" or "+ Record Stock Movement" to log restock intake (Stock-In) or adjustments/damage write-offs (Stock-Out).'
    ]
  },
  {
    id: 'att-3',
    audience: 'attendant',
    icon: '📋',
    title: 'Service & Technician Guide: Jobs, Bookings & Time Slots',
    steps: [
      'Service Managers open "Booking Module" to review customer bookings and assign the official arrival time slot based on site location.',
      'In "Service Manager", log walk-in or booked electrical jobs and assign a certified Field Technician.',
      'Technicians log into "Technician Portal" to update job progress (In Progress / Completed) and log cables, breakers, or fittings used.'
    ]
  },
  {
    id: 'att-4',
    audience: 'attendant',
    icon: '🚚',
    title: 'Dispatch & Driver Guide: Delivery Scheduling & Handover',
    steps: [
      'Dispatch Managers view paid orders in "Dispatch Manager" and assign a delivery driver and vehicle across Meru County routes.',
      'Drivers open "Driver Deliveries" to inspect their active run sheet, site contacts, and delivery notes.',
      'Mark deliveries as "In Transit" upon departure and "Delivered" once handed over to the customer.'
    ]
  },
  {
    id: 'att-5',
    audience: 'attendant',
    icon: '💵',
    title: 'Finance & Admin Guide: Treasury, Permissions & Reports',
    steps: [
      'Finance Managers track Cash, M-Pesa, and Bank balances in "Finance Manager", record operational expenses, and review Profit & Loss or Sales reports.',
      'Administrators manage staff accounts in "User Management", configure shop parameters and role permissions in "System Settings", monitor live audit trails in "System Activities", and handle customer feedback/inquiries.'
    ]
  }
];

const HELP_FAQS = [
  {
    category: 'Orders & Payments',
    audience: 'customer',
    question: 'What payment methods does Elight Electrical Shop accept?',
    answer: 'We accept M-Pesa Buy Goods Till (5894210), Cash at our Meru Town showroom, Cash on Delivery within Meru County environs, and EFT/Bank Transfer for approved commercial contractor invoices in KES.'
  },
  {
    category: 'Bookings & Installations',
    audience: 'customer',
    question: 'How do appointment arrival time slots work for service bookings?',
    answer: 'When you submit a booking on the Book page (/booking), you choose your preferred date and location. Our Service Manager then reviews your Meru County location and assigns a confirmed arrival time slot.'
  },
  {
    category: 'Bookings & Installations',
    audience: 'customer',
    question: 'Can I reserve bulk electrical materials for a future construction phase?',
    answer: 'Yes! Select "Reserve Product for Future Date" on the Booking page (/booking), pick the item and quantity, and specify your target date so our warehouse holds the stock under your reference (BK-ELIGHT-XXXX).'
  },
  {
    category: 'Warranties & Returns',
    audience: 'customer',
    question: 'Do electrical appliances, LED panels, and voltage guards come with a warranty?',
    answer: 'Yes. Genuine Schneider, Philips, Chint, and Tronic products carry a 6-to-24 month manufacturer warranty tracked directly under your Customer Account (/customer).'
  },
  {
    category: 'Delivery & Pickup',
    audience: 'customer',
    question: 'Do you deliver outside Meru County?',
    answer: 'No — Elight Electrical Shop operates exclusively within Meru County. We offer same-day delivery across Meru Town and Makutano, plus scheduled dispatch across Nkubu, Maua, Timau, Kianjai, Laare, Mikinduri, and Mitunguu.'
  },
  {
    category: 'Attendant Operations',
    audience: 'attendant',
    question: 'How does a Cashier confirm an online M-Pesa order and trigger delivery?',
    answer: 'Open Cashier Module, click Confirm Payment on the pending order, verify the M-Pesa reference code or cash tendered, and submit. Once marked Paid, click Send to Dispatch so Dispatch Manager can assign a driver.'
  },
  {
    category: 'Attendant Operations',
    audience: 'attendant',
    question: 'What should a shop attendant do when stock drops below the reorder level?',
    answer: 'Open Inventory Manager, filter by Low Stock items highlighted in red/amber, and record incoming restock quantities via "+ Record Stock Movement" (Stock-In).'
  },
  {
    category: 'Attendant Operations',
    audience: 'attendant',
    question: 'How do attendants handle a customer complaint or inquiry submitted online?',
    answer: 'Complaints in Feedback Module and tickets in Contact Us Module are reviewed by management. Open the corresponding module in the ERP portal, log an official response, and mark the ticket Resolved/Replied.'
  },
  {
    category: 'Attendant Operations',
    audience: 'attendant',
    question: 'Where can Administrators customize which modules each staff role can access?',
    answer: 'Open System Settings & User Permissions in the ERP sidebar to toggle module access per role (Cashier, Technician, Inventory Manager, Service Manager, Finance Manager, Dispatch Manager, Driver) and click Save Role Permissions.'
  }
];

const SHOP_ABOUT_INFO = {
  shop_name: 'Elight Electrical Shop',
  tagline: 'Founded & Located in Meru County, Kenya — Powering Homes, Commercial Buildings & Contractors with Certified Electrical Supplies',
  established: '2018',
  certification_note: 'KEBS-Compliant & Authorized Distributor of Genuine Electrical Fittings',
  story: 'Founded and operating exclusively in Meru County, Kenya, Elight Electrical Shop connects genuine electrical manufacturers directly with Meru homeowners, electricians, institutions, and building contractors. Proudly located in Meru Town, from single LED bulbs and voltage protectors to complete 3-phase distribution boards and solar backup systems, every product in our catalog is tested for safety, durability, and fair wholesale pricing in KES.',
  mission: 'To supply safe, certified, and affordable electrical products from our Meru Town showroom backed by professional technical installation and transparent warranty support across Meru County.',
  vision: 'To be Meru County’s most trusted digital and showroom destination for modern lighting, power protection, and electrical engineering supplies.',
  location: {
    building: 'Elight Plaza, Ground & Mezzanine Floor',
    street: 'Njuri Ncheke Street, Meru Town',
    city: 'Meru, Meru County, Kenya',
    dispatch_hub: 'Makutano Commercial Warehouse, Meru',
    plus_code: '2JWX+RW Meru, Kenya',
    landmarks: 'Along Njuri Ncheke Street, Meru Town Centre, Meru County'
  },
  hours: [
    { days: 'Monday – Friday', time: '7:30 AM – 6:30 PM' },
    { days: 'Saturday', time: '8:00 AM – 5:30 PM' },
    { days: 'Sunday & Public Holidays', time: 'Closed (Online Bookings & Catalog Open 24/7)' }
  ],
  contacts: {
    sales_phone: '+254 700 123 456',
    whatsapp: '+254 712 345 678',
    technical_desk: '+254 722 111 002',
    sales_email: 'elightelectrical@ke.com',
    support_email: 'elightelectrical@ke.com',
    mpesa_till: '5894210 (ELIGHT ELECTRICAL SHOP)'
  },
  brands: ['Schneider Electric', 'Philips Lighting', 'Chint', 'Tronic Kenya', 'Havells', 'East African Cables'],
  highlights: [
    { label: 'Certified Products', value: '500+ SKUs' },
    { label: 'Service Coverage', value: 'Meru County Only' },
    { label: 'Licensed Technicians', value: 'EPRA Certified' },
    { label: 'Warranty Protection', value: 'Up to 24 Months' }
  ]
};

const engagementController = {
  // ========================================================
  // BOOKING MODULE
  // ========================================================
  getBookings: async (req, res) => {
    try {
      const { scope, email, phone, booking_ref } = req.query;

      let allBookings = [];
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .order('created_at', { ascending: false })
          .order('booking_id', { ascending: false });
        if (!error && Array.isArray(data) && data.length > 0) {
          allBookings = data;
        }
      } catch (e) {}

      if (allBookings.length === 0) {
        allBookings = await interModuleSync.getBookings();
      }
      allBookings = sortByLatest(allBookings, 'booking_id');

      if (scope === 'all') {
        // Administrator view: return all bookings
        return res.json({ success: true, bookings: allBookings });
      }

      if (booking_ref) {
        const cleanRef = String(booking_ref).trim().toUpperCase();
        const matched = allBookings.filter(b => String(b.booking_ref).toUpperCase() === cleanRef);
        return res.json({ success: true, bookings: matched });
      }

      const activeEmail = email ? String(email).trim().toLowerCase() : '';
      const activePhone = phone ? String(phone).trim() : '';

      if (!activeEmail && !activePhone) {
        // Protect customer privacy: never leak other customers' bookings without identifier or admin scope
        return res.json({ success: true, bookings: [] });
      }

      const matched = allBookings.filter(b => {
        const bEmail = String(b.customer_email || '').trim().toLowerCase();
        const bPhone = String(b.customer_phone || '').trim();
        const matchEmail = activeEmail && bEmail && bEmail === activeEmail;
        const matchPhone = activePhone && bPhone && (bPhone === activePhone || (activePhone.length >= 8 && bPhone.includes(activePhone.slice(-8))));
        return matchEmail || matchPhone;
      });

      return res.json({ success: true, bookings: matched });
    } catch (err) {
      console.error('getBookings error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve bookings: ' + err.message });
    }
  },

  createBooking: async (req, res) => {
    try {
      const {
        booking_type,
        customer_name,
        customer_email,
        customer_phone,
        product_id,
        item_or_service_name,
        quantity,
        preferred_date,
        preferred_time,
        location_or_notes,
        estimated_amount,
        services_list
      } = req.body;

      if (!customer_name || !customer_phone || !item_or_service_name || !preferred_date) {
        return res.status(400).json({
          success: false,
          message: 'Please fill in your name, phone number, selected service/product, and booking date.'
        });
      }

      // Validate future/today date (YYYY-MM-DD)
      const todayStr = new Date().toISOString().split('T')[0];
      if (String(preferred_date) < todayStr) {
        return res.status(400).json({
          success: false,
          message: 'Please select today or a future date for your booking.'
        });
      }

      const MAX_SINGLE_SERVICE_FEE = 1000;
      const CONSTANT_BOOKING_FEE = 200;
      const typeClean = booking_type === 'product' ? 'product' : 'service';
      const qtyNum = Math.max(1, parseInt(quantity, 10) || 1);
      let amountNum = Math.max(0, Number(estimated_amount) || 0);

      if (typeClean === 'service') {
        let servicesSubtotal = 0;
        if (Array.isArray(services_list) && services_list.length > 0) {
          for (const svc of services_list) {
            const svcFee = Number(svc?.unit_price ?? svc?.price ?? svc?.subtotal ?? 0);
            const subFee = Number(svc?.subtotal ?? svcFee);
            if (!Number.isFinite(svcFee) || !Number.isFinite(subFee) || svcFee < 0 || subFee < 0 || svcFee > MAX_SINGLE_SERVICE_FEE || subFee > MAX_SINGLE_SERVICE_FEE) {
              return res.status(400).json({
                success: false,
                message: `Each individual booking service fee cannot exceed KES ${MAX_SINGLE_SERVICE_FEE.toLocaleString('en-KE')}.`
              });
            }
            servicesSubtotal += subFee;
          }
        } else {
          const explicitServiceFee = req.body.service_fee !== undefined
            ? Number(req.body.service_fee)
            : (Number(req.body.booking_fee) === CONSTANT_BOOKING_FEE && amountNum >= CONSTANT_BOOKING_FEE
                ? amountNum - CONSTANT_BOOKING_FEE
                : amountNum);
          if (!Number.isFinite(explicitServiceFee) || explicitServiceFee < 0 || (explicitServiceFee / qtyNum) > MAX_SINGLE_SERVICE_FEE) {
            return res.status(400).json({
              success: false,
              message: `Each individual booking service fee cannot exceed KES ${MAX_SINGLE_SERVICE_FEE.toLocaleString('en-KE')}.`
            });
          }
          servicesSubtotal = explicitServiceFee;
        }
        amountNum = servicesSubtotal + CONSTANT_BOOKING_FEE;
      } else {
        const baseProductAmount = Number(req.body.booking_fee) === CONSTANT_BOOKING_FEE && amountNum >= CONSTANT_BOOKING_FEE
          ? amountNum - CONSTANT_BOOKING_FEE
          : amountNum;
        amountNum = baseProductAmount + CONSTANT_BOOKING_FEE;
      }
      const randCode = Math.floor(1000 + Math.random() * 9000);
      const bookingRef = `BK-ELIGHT-${randCode}`;

      let confirmationNote = '';
      const timeDisplay = (preferred_time && !preferred_time.includes('Pending')) ? preferred_time : 'Arrival time to be assigned by Service Manager';
      if (typeClean === 'product') {
        confirmationNote = `Confirmed! ${qtyNum}x "${item_or_service_name}" reserved for ${preferred_date} (${preferred_time || 'Business Hours'}). Present reference ${bookingRef} at Elight Electrical Shop.`;
      } else if (Array.isArray(services_list) && services_list.length > 1) {
        const serviceNames = services_list.map(s => s.name).join(', ');
        confirmationNote = `Confirmed! ${services_list.length} services (${serviceNames}) scheduled for ${preferred_date} (${timeDisplay}). Our technical desk will call ${customer_phone} prior to dispatch.`;
      } else {
        confirmationNote = `Confirmed! Service "${item_or_service_name}" scheduled for ${preferred_date} (${timeDisplay}). Our technical desk will call ${customer_phone} prior to dispatch.`;
      }

      const insertPayload = {
        booking_ref: bookingRef,
        booking_type: typeClean,
        customer_name: String(customer_name).trim(),
        customer_email: customer_email ? String(customer_email).trim() : null,
        customer_phone: String(customer_phone).trim(),
        product_id: product_id ? Number(product_id) : null,
        item_or_service_name: String(item_or_service_name).trim(),
        quantity: qtyNum,
        preferred_date,
        preferred_time: preferred_time || 'Pending Service Manager Assignment',
        location_or_notes: location_or_notes ? String(location_or_notes).trim() : '',
        booking_fee: CONSTANT_BOOKING_FEE,
        estimated_amount: amountNum,
        status: 'confirmed',
        confirmation_note: confirmationNote
      };

      // 1. Try Supabase insert
      let savedBooking = null;
      try {
        let { data, error } = await supabase
          .from('bookings')
          .insert([insertPayload])
          .select()
          .single();
        if (error && String(error.message || '').includes('booking_fee')) {
          const { booking_fee: _omit, ...fallbackPayload } = insertPayload;
          const retry = await supabase.from('bookings').insert([fallbackPayload]).select().single();
          data = retry.data;
          error = retry.error;
        }
        if (!error && data) {
          savedBooking = { booking_fee: CONSTANT_BOOKING_FEE, ...data };
        }
      } catch (e) {}

      if (!savedBooking) {
        savedBooking = {
          booking_id: randCode,
          ...insertPayload,
          created_at: new Date().toISOString()
        };
      }

      // Attach services_list if multiple services booked
      if (Array.isArray(services_list) && services_list.length > 0) {
        savedBooking.services_list = services_list;
      }

      // Also persist into bookings_data.json
      const localBookings = await interModuleSync.getBookings();
      localBookings.unshift(savedBooking);
      const BOOKINGS_PATH = path.join(__dirname, '../config/bookings_data.json');
      writeJsonFile(BOOKINGS_PATH, localBookings);

      // ========================================================
      // INTER-MODULE CONNECTION 1: Customer Service Booking -> Service Requests
      // Automatically creates a Service Request for Service Manager & Technicians
      // ========================================================
      if (typeClean === 'service') {
        await interModuleSync.createServiceRequestFromBooking(savedBooking);
      }

      // ========================================================
      // INTER-MODULE CONNECTION 2: Customer Product Booking -> Cashier Desk
      // Automatically queues reservation into Cashier pending orders
      // ========================================================
      if (typeClean === 'product') {
        await interModuleSync.createCashierOrderFromBooking(savedBooking);
      }

      return res.status(201).json({
        success: true,
        message: 'Booking confirmed successfully!',
        booking: savedBooking
      });
    } catch (err) {
      console.error('createBooking error:', err);
      res.status(500).json({ success: false, message: 'Could not complete booking: ' + err.message });
    }
  },

  updateBookingStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, confirmation_note } = req.body;
      const validStatuses = ['confirmed', 'pending', 'completed', 'cancelled'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid booking status.' });
      }

      const updates = {};
      if (status) updates.status = status;
      if (confirmation_note !== undefined) updates.confirmation_note = confirmation_note;

      let updatedBooking = null;
      try {
        const { data, error } = await supabase
          .from('bookings')
          .update(updates)
          .eq('booking_id', Number(id))
          .select()
          .single();
        if (!error && data) updatedBooking = data;
      } catch (e) {}

      // Update in bookings_data.json
      const localBookings = await interModuleSync.getBookings();
      const b = localBookings.find(item => Number(item.booking_id) === Number(id));
      if (b) {
        if (status) b.status = status;
        if (confirmation_note !== undefined) b.confirmation_note = confirmation_note;
        const BOOKINGS_PATH = path.join(__dirname, '../config/bookings_data.json');
        writeJsonFile(BOOKINGS_PATH, localBookings);
        if (!updatedBooking) updatedBooking = b;
      }

      res.json({ success: true, booking: updatedBooking || { booking_id: id, ...updates } });
    } catch (err) {
      console.error('updateBookingStatus error:', err);
      res.status(500).json({ success: false, message: 'Failed to update booking.' });
    }
  },

  assignBookingTime: async (req, res) => {
    try {
      const { id } = req.params;
      const { assigned_time, user_role, actor } = req.body;
      const callerRole = String(user_role || req.headers['x-user-role'] || '').trim().toLowerCase();

      // Only Service Manager or Admin/Owner can assign appointment times
      const authorizedRoles = ['service_manager', 'service', 'admin', 'administrator', 'owner', 'superadmin'];
      if (callerRole && !authorizedRoles.includes(callerRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only the Service Manager (Peter Otieno) can assign service appointment times.'
        });
      }

      if (!assigned_time || !String(assigned_time).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid assigned time window.'
        });
      }

      const updated = await interModuleSync.assignTimeToBooking(id, String(assigned_time).trim(), actor || 'Service Manager');
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }

      res.json({ success: true, booking: updated });
    } catch (err) {
      console.error('assignBookingTime error:', err);
      res.status(500).json({ success: false, message: 'Failed to assign booking time: ' + err.message });
    }
  },

  // ========================================================
  // HELP MODULE
  // ========================================================
  getHelpContent: async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const audience = String(req.query.audience || 'all').trim().toLowerCase();

    let guides = HELP_GUIDES;
    let faqs = HELP_FAQS;

    if (audience === 'customer' || audience === 'attendant') {
      guides = guides.filter(g => g.audience === audience);
      faqs = faqs.filter(f => f.audience === audience);
    }

    if (q) {
      guides = guides.filter(g =>
        g.title.toLowerCase().includes(q) ||
        g.steps.some(s => s.toLowerCase().includes(q))
      );
      faqs = faqs.filter(f =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      guides,
      faqs
    });
  },

  // ========================================================
  // ABOUT US MODULE
  // ========================================================
  getAboutInfo: async (req, res) => {
    res.json({
      success: true,
      about: SHOP_ABOUT_INFO
    });
  },

  // ========================================================
  // FEEDBACK MODULE
  // ========================================================
  getFeedback: async (req, res) => {
    try {
      const { scope, department, role } = req.query;
      let list = [];

      try {
        let query = supabase
          .from('customer_feedback')
          .select('*')
          .order('created_at', { ascending: false });

        if (scope === 'all') {
          const { data, error } = await query;
          if (!error && Array.isArray(data) && data.length > 0) list = data;
        } else {
          const { data, error } = await query
            .eq('feedback_type', 'review')
            .eq('status', 'published');
          if (!error && Array.isArray(data) && data.length > 0) list = data;
        }
      } catch (e) {}

      const localList = readLocalFeedback();

      // Fallback to persistent local feedback data
      if (list.length === 0) {
        if (scope === 'all') {
          list = localList;
        } else {
          list = localList.filter(f => f.feedback_type === 'review' && f.status === 'published');
        }
      } else {
        // Preserve department tag (module_tag) recorded in local store when Supabase schema omits module_tag
        list = list.map(row => {
          if (row.module_tag) return row;
          const match = localList.find(l =>
            String(l.customer_name || '').trim() === String(row.customer_name || '').trim() &&
            String(l.subject || '').trim() === String(row.subject || '').trim()
          );
          return match && match.module_tag ? { ...row, module_tag: match.module_tag } : row;
        });
      }

      // Department-level strict isolation:
      // If a specific department or role is requested, filter feedback strictly to that department
      let targetDept = department ? String(department).trim().toLowerCase() : null;
      if (!targetDept && role) {
        const r = String(role).trim().toLowerCase();
        if (r !== 'admin' && r !== 'owner' && r !== 'superadmin' && r !== 'administrator') {
          if (r.includes('inventory') || r.includes('store') || r.includes('stock')) targetDept = 'inventory';
          else if (r.includes('dispatch') || r.includes('driver') || r.includes('rider') || r.includes('delivery')) targetDept = 'dispatch';
          else if (r.includes('cashier') || r.includes('sale')) targetDept = 'cashier';
          else if (r.includes('service') || r.includes('tech')) targetDept = 'services';
          else if (r.includes('finance') || r.includes('account')) targetDept = 'finance';
        }
      }

      if (targetDept && targetDept !== 'all') {
        list = list.filter(f => {
          const tag = String(f.module_tag || 'general').trim().toLowerCase();
          return tag === targetDept;
        });
      }

      list = sortByLatest(list, 'feedback_id');

      if (scope === 'all') {
        return res.json({ success: true, count: list.length, feedback: list, department_filter: targetDept || 'all' });
      }

      const totalReviews = list.length;
      const avgRating = totalReviews > 0
        ? Number((list.reduce((sum, r) => sum + Number(r.rating || 5), 0) / totalReviews).toFixed(1))
        : 5.0;

      res.json({
        success: true,
        summary: {
          averageRating: avgRating,
          totalReviews
        },
        feedback: list
      });
    } catch (err) {
      console.error('getFeedback error:', err);
      let localList = readLocalFeedback();
      const targetDept = req.query.department ? String(req.query.department).trim().toLowerCase() : null;
      if (targetDept && targetDept !== 'all') {
        localList = localList.filter(f => String(f.module_tag || 'general').trim().toLowerCase() === targetDept);
      }
      res.json({ success: true, feedback: localList });
    }
  },

  createFeedback: async (req, res) => {
    try {
      const { customer_name, customer_email, customer_phone, feedback_type, rating, subject, message, module_tag } = req.body;

      if (!customer_name || !subject || !message) {
        return res.status(400).json({
          success: false,
          message: 'Please provide your name, subject, and feedback details.'
        });
      }

      const cleanType = ['review', 'complaint', 'suggestion'].includes(feedback_type)
        ? feedback_type
        : 'review';
      const allowedDepts = ['general', 'cashier', 'inventory', 'services', 'dispatch', 'finance'];
      const rawDept = String(module_tag || 'general').trim().toLowerCase();
      const cleanDept = allowedDepts.includes(rawDept) ? rawDept : 'general';
      const cleanRating = Math.min(5, Math.max(1, parseInt(rating, 10) || 5));
      const initialStatus = cleanType === 'review' ? 'published' : 'pending_review';

      const localList = readLocalFeedback();
      const nextId = localList.length > 0 ? Math.max(...localList.map(f => Number(f.feedback_id) || 0)) + 1 : 1;

      const newFeedback = {
        feedback_id: nextId,
        customer_name: String(customer_name).trim(),
        customer_email: customer_email ? String(customer_email).trim() : null,
        customer_phone: customer_phone ? String(customer_phone).trim() : null,
        feedback_type: cleanType,
        module_tag: cleanDept,
        rating: cleanRating,
        subject: String(subject).trim(),
        message: String(message).trim(),
        status: initialStatus,
        admin_reply: null,
        created_at: new Date().toISOString()
      };

      localList.unshift(newFeedback);
      writeLocalFeedback(localList);

      try {
        await supabase.from('customer_feedback').insert([{
          customer_name: newFeedback.customer_name,
          customer_email: newFeedback.customer_email,
          feedback_type: newFeedback.feedback_type,
          rating: newFeedback.rating,
          subject: newFeedback.subject,
          message: newFeedback.message,
          status: newFeedback.status
        }]);
      } catch (e) {}

      const responseMsg = cleanType === 'complaint'
        ? 'Thank you for reporting this issue. Your complaint has been logged with Elight Management for priority resolution.'
        : cleanType === 'suggestion'
          ? 'Thank you! Your suggestion has been received by our shop management team.'
          : 'Thank you for your review! Your feedback is now live.';

      res.status(201).json({
        success: true,
        message: responseMsg,
        feedback: newFeedback
      });
    } catch (err) {
      console.error('createFeedback error:', err);
      res.status(500).json({ success: false, message: 'Failed to submit feedback.' });
    }
  },

  updateFeedback: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, admin_reply, user_role, user_department } = req.body;

      const localList = readLocalFeedback();
      const item = localList.find(f => String(f.feedback_id) === String(id));

      if (item && user_role) {
        const r = String(user_role).trim().toLowerCase();
        const isAdmin = r === 'admin' || r === 'owner' || r === 'superadmin' || r === 'administrator';
        if (!isAdmin) {
          let userDept = user_department ? String(user_department).trim().toLowerCase() : null;
          if (!userDept) {
            if (r.includes('inventory') || r.includes('store')) userDept = 'inventory';
            else if (r.includes('dispatch') || r.includes('driver') || r.includes('rider')) userDept = 'dispatch';
            else if (r.includes('cashier')) userDept = 'cashier';
            else if (r.includes('service') || r.includes('tech')) userDept = 'services';
            else if (r.includes('finance')) userDept = 'finance';
          }
          const itemDept = String(item.module_tag || 'general').trim().toLowerCase();
          if (userDept && itemDept !== userDept) {
            return res.status(403).json({
              success: false,
              message: `Access denied. You can only manage feedback for your own department (${userDept}). This entry belongs to ${itemDept}.`
            });
          }
        }
      }

      if (item) {
        if (status) item.status = status;
        if (admin_reply !== undefined) item.admin_reply = admin_reply;
        writeLocalFeedback(localList);
      }

      try {
        const updates = {};
        if (status) updates.status = status;
        if (admin_reply !== undefined) updates.admin_reply = admin_reply;
        await supabase
          .from('customer_feedback')
          .update(updates)
          .eq('feedback_id', Number(id));
      } catch (e) {}

      res.json({ success: true, feedback: item || { feedback_id: id, status, admin_reply } });
    } catch (err) {
      console.error('updateFeedback error:', err);
      res.status(500).json({ success: false, message: 'Failed to update feedback.' });
    }
  },

  // ========================================================
  // CONTACT US MODULE
  // ========================================================
  createContactInquiry: async (req, res) => {
    try {
      const { full_name, email, phone, subject, message } = req.body;
      if (!full_name || !email || !subject || !message) {
        return res.status(400).json({
          success: false,
          message: 'Please complete your name, email address, subject, and inquiry message.'
        });
      }

      const ticketRef = `INQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const { data, error } = await supabase
        .from('contact_inquiries')
        .insert([{
          ticket_ref: ticketRef,
          full_name: String(full_name).trim(),
          email: String(email).trim(),
          phone: phone ? String(phone).trim() : null,
          subject: String(subject).trim(),
          message: String(message).trim(),
          status: 'unread'
        }])
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: `Thank you, ${data.full_name}! Your inquiry (${ticketRef}) has been sent to Elight Electrical Shop. We will respond via ${data.email}.`,
        inquiry: data
      });
    } catch (err) {
      console.error('createContactInquiry error:', err);
      res.status(500).json({ success: false, message: 'Failed to send inquiry.' });
    }
  },

  getContactInquiries: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, inquiries: sortByLatest(data || [], 'inquiry_id') });
    } catch (err) {
      console.error('getContactInquiries error:', err);
      res.status(500).json({ success: false, message: 'Failed to load inquiries.' });
    }
  },

  updateContactInquiry: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, admin_response } = req.body;
      const updates = {};
      if (status) updates.status = status;
      if (admin_response !== undefined) updates.admin_response = admin_response;

      const { data, error } = await supabase
        .from('contact_inquiries')
        .update(updates)
        .eq('inquiry_id', Number(id))
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, inquiry: data });
    } catch (err) {
      console.error('updateContactInquiry error:', err);
      res.status(500).json({ success: false, message: 'Failed to update inquiry.' });
    }
  }
};

module.exports = engagementController;

