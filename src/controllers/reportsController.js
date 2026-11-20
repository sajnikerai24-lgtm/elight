const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const interModuleSync = require('../utils/interModuleSync');
const { readJsonFile, writeJsonFile } = require('../utils/jsonStore');
const { validatePaymentReference } = require('../utils/paymentValidation');

const CASHIER_ORDERS_PATH = path.join(__dirname, '../config/cashier_orders.json');
const FINANCE_RECORDS_PATH = path.join(__dirname, '../config/finance_records.json');

function isWithinPeriod(dateVal, period) {
  if (!period || period === 'all' || !dateVal) return true;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return true;

  const now = new Date();
  if (period === 'today') {
    return d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  }
  const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
  const days = daysMap[period];
  if (!days) return true;

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d >= cutoff;
}

const reportsController = {
  // ========================================================
  // REAL-TIME REPORTS & DECISION ANALYTICS
  // ========================================================
  getRealtimeReports: async (req, res) => {
    try {
      const period = String(req.query.period || 'all').toLowerCase();

      const [
        invRes,
        movRes,
        finRes,
        custRes,
        warrRes,
        servRes,
        dispRes,
        usersRes,
        bookRes,
        fbRes,
        inqRes
      ] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('stock_movements').select('*').order('movement_id', { ascending: false }),
        supabase.from('finance_records').select('*').order('record_id', { ascending: false }),
        supabase.from('customers').select('*'),
        supabase.from('warranties').select('*'),
        supabase.from('service_requests').select('*').order('request_id', { ascending: false }),
        supabase.from('dispatches').select('*').order('dispatch_id', { ascending: false }),
        supabase.from('users_accounts').select('*'),
        supabase.from('bookings').select('*').order('booking_id', { ascending: false }),
        supabase.from('customer_feedback').select('*').order('feedback_id', { ascending: false }),
        supabase.from('contact_inquiries').select('*').order('inquiry_id', { ascending: false })
      ]);

      const products = invRes.data || [];
      const movements = (movRes.data || []).filter(m => isWithinPeriod(m.created_at, period));
      const finance = (finRes.data || []).filter(f => isWithinPeriod(f.created_at || f.recorded_at, period));
      const customers = custRes.data || [];
      const warranties = warrRes.data || [];
      const services = (servRes.data || []).filter(s => isWithinPeriod(s.created_at || s.scheduled_date, period));
      const dispatches = (dispRes.data || []).filter(d => isWithinPeriod(d.created_at || d.scheduled_date, period));
      const users = usersRes.data || [];
      const bookings = (bookRes.data || []).filter(b => isWithinPeriod(b.created_at || b.preferred_date, period));
      const feedback = (fbRes.data || []).filter(f => isWithinPeriod(f.created_at, period));
      const inquiries = (inqRes.data || []).filter(i => isWithinPeriod(i.created_at, period));

      // --------------------------------------------------------
      // 1. SALES & FINANCIAL PERFORMANCE REPORT
      // --------------------------------------------------------
      const salesRecords = finance.filter(r => r.type === 'sale');
      const expenseRecords = finance.filter(r => r.type === 'expense');

      const totalSalesRevenue = salesRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const totalOperatingExpenses = expenseRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const netProfit = totalSalesRevenue - totalOperatingExpenses;
      const profitMarginPct = totalSalesRevenue > 0
        ? Number(((netProfit / totalSalesRevenue) * 100).toFixed(1))
        : 0;
      const avgSaleValue = salesRecords.length > 0
        ? totalSalesRevenue / salesRecords.length
        : 0;

      const paymentBreakdownMap = {};
      const salesByCategoryMap = {};
      salesRecords.forEach(r => {
        const pm = r.payment_method || 'M-Pesa';
        paymentBreakdownMap[pm] = (paymentBreakdownMap[pm] || 0) + Number(r.amount || 0);
        const cat = r.category || 'General Sales';
        salesByCategoryMap[cat] = (salesByCategoryMap[cat] || 0) + Number(r.amount || 0);
      });

      const paymentBreakdown = Object.entries(paymentBreakdownMap)
        .map(([method, amount]) => ({
          method,
          amount,
          sharePct: totalSalesRevenue > 0 ? Number(((amount / totalSalesRevenue) * 100).toFixed(1)) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      const salesByCategory = Object.entries(salesByCategoryMap)
        .map(([category, amount]) => ({
          category,
          amount,
          sharePct: totalSalesRevenue > 0 ? Number(((amount / totalSalesRevenue) * 100).toFixed(1)) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      // Expense breakdown for Profit & Loss Statement
      const expensesByCategoryMap = {};
      expenseRecords.forEach(r => {
        const cat = r.category || 'General Operating Expense';
        expensesByCategoryMap[cat] = (expensesByCategoryMap[cat] || 0) + Number(r.amount || 0);
      });
      const expensesByCategory = Object.entries(expensesByCategoryMap)
        .map(([category, amount]) => ({
          category,
          amount,
          sharePct: totalOperatingExpenses > 0 ? Number(((amount / totalOperatingExpenses) * 100).toFixed(1)) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      // Cashier Attribution (Sales by Cashier Detailed & Summary)
      const financeStaff = users.find(u => u.role === 'finance_manager');
      const adminStaff = users.find(u => u.role === 'admin');
      const defaultCounterCashier = financeStaff
        ? String(financeStaff.full_name).replace(/\s*\([^)]+\)\s*$/i, '').trim()
        : 'Alice Muthoni';
      const secondaryCashier = adminStaff
        ? String(adminStaff.full_name).replace(/\s*\([^)]+\)\s*$/i, '').trim()
        : 'Mercy Wanjiku';

      const cashierMap = {};
      const detailedCashierTransactions = salesRecords.map(r => {
        const rawDesc = String(r.description || '');
        const tagMatch = rawDesc.match(/\[Cashier:\s*([^\]]+)\]/i);
        const cleanDesc = rawDesc.replace(/\s*\[Cashier:\s*[^\]]+\]/i, '').trim();

        let cashierName = defaultCounterCashier;
        let cashierRole = 'Finance / Counter Cashier';

        if (tagMatch && tagMatch[1]) {
          cashierName = tagMatch[1].replace(/\s*\([^)]+\)\s*$/i, '').trim();
          const matchedUser = users.find(u =>
            String(u.full_name || '').toLowerCase().includes(cashierName.toLowerCase())
          );
          cashierRole = matchedUser
            ? String(matchedUser.role || 'cashier').replace(/_/g, ' ')
            : 'Shop Cashier';
        } else if (r.category === 'Home Online Order' || r.category === 'Storefront Order' || /^online order/i.test(cleanDesc)) {
          cashierName = 'Online Checkout (Web)';
          cashierRole = 'Self-Service Home';
        } else if (/installation/i.test(r.category || '')) {
          cashierName = secondaryCashier;
          cashierRole = 'Admin / Service Desk';
        }

        const amt = Number(r.amount || 0);
        const pm = r.payment_method || 'M-Pesa';
        const key = cashierName.toLowerCase();

        if (!cashierMap[key]) {
          cashierMap[key] = {
            cashier_name: cashierName,
            cashier_role: cashierRole,
            transactionCount: 0,
            mpesaSales: 0,
            cashOrBankSales: 0,
            totalSales: 0,
            transactions: []
          };
        }

        const txItem = {
          record_id: r.record_id,
          reference_no: r.reference_no || ('FIN-' + r.record_id),
          cashier_name: cashierName,
          cashier_role: cashierRole,
          category: r.category || 'Shop Sale',
          description: cleanDesc || '—',
          payment_method: pm,
          amount: amt,
          created_at: r.created_at || null
        };

        cashierMap[key].transactionCount += 1;
        if (/m-pesa|mpesa/i.test(pm)) {
          cashierMap[key].mpesaSales += amt;
        } else {
          cashierMap[key].cashOrBankSales += amt;
        }
        cashierMap[key].totalSales += amt;
        cashierMap[key].transactions.push(txItem);

        return txItem;
      });

      const cashierGroups = Object.values(cashierMap)
        .map(c => ({
          ...c,
          avgTicket: c.transactionCount > 0 ? c.totalSales / c.transactionCount : 0,
          sharePct: totalSalesRevenue > 0 ? Number(((c.totalSales / totalSalesRevenue) * 100).toFixed(1)) : 0
        }))
        .sort((a, b) => b.totalSales - a.totalSales);

      // --------------------------------------------------------
      // 2. INVENTORY VALUATION & STOCK MOVEMENT REPORT
      // --------------------------------------------------------
      let totalStockUnits = 0;
      let totalInventoryCostValue = 0;
      let totalInventoryRetailValue = 0;
      const lowStockItems = [];
      const outOfStockItems = [];
      const categoryInventoryMap = {};

      products.forEach(p => {
        const qty = Number(p.quantity_in_stock || 0);
        const buy = Number(p.buying_price || 0);
        const sell = Number(p.selling_price || 0);
        const reorder = Number(p.reorder_level || 5);
        const cat = p.category_name || 'Uncategorized';

        totalStockUnits += qty;
        totalInventoryCostValue += qty * buy;
        totalInventoryRetailValue += qty * sell;

        if (qty === 0) {
          outOfStockItems.push(p);
        } else if (qty <= reorder) {
          lowStockItems.push(p);
        }

        if (!categoryInventoryMap[cat]) {
          categoryInventoryMap[cat] = { category: cat, skuCount: 0, units: 0, costValue: 0, retailValue: 0 };
        }
        categoryInventoryMap[cat].skuCount += 1;
        categoryInventoryMap[cat].units += qty;
        categoryInventoryMap[cat].costValue += qty * buy;
        categoryInventoryMap[cat].retailValue += qty * sell;
      });

      const projectedInventoryMargin = totalInventoryRetailValue - totalInventoryCostValue;
      const stockInUnits = movements
        .filter(m => m.type === 'STOCK_IN')
        .reduce((sum, m) => sum + Number(m.quantity || 0), 0);
      const stockOutUnits = movements
        .filter(m => m.type === 'STOCK_OUT')
        .reduce((sum, m) => sum + Number(m.quantity || 0), 0);

      const categoryInventory = Object.values(categoryInventoryMap).sort((a, b) => b.retailValue - a.retailValue);
      const restockPriorityList = [...outOfStockItems, ...lowStockItems]
        .sort((a, b) => Number(a.quantity_in_stock || 0) - Number(b.quantity_in_stock || 0));

      // --------------------------------------------------------
      // 4. CUSTOMER ACTIVITY & ENGAGEMENT REPORT
      // --------------------------------------------------------
      const confirmedBookings = bookings.filter(b => b.status !== 'cancelled');
      const bookingPipelineValue = confirmedBookings.reduce((sum, b) => sum + Number(b.estimated_amount || 0), 0);
      const activeWarrantiesCount = warranties.filter(w => w.status === 'active').length;

      const reviewsOnly = feedback.filter(f => f.feedback_type === 'review');
      const complaintsOnly = feedback.filter(f => f.feedback_type === 'complaint');
      const unresolvedComplaints = complaintsOnly.filter(f => f.status !== 'resolved').length;
      const avgRating = reviewsOnly.length > 0
        ? Number((reviewsOnly.reduce((sum, r) => sum + Number(r.rating || 5), 0) / reviewsOnly.length).toFixed(1))
        : 5.0;
      const unreadInquiries = inquiries.filter(i => i.status === 'unread').length;

      // Aggregate per-customer activity score (Orders + Bookings + Warranties)
      const customerActivityMap = {};
      const ensureCust = (name, phone, location) => {
        const clean = String(name || 'Walk-In Customer').replace(/\s*\(customer\)\s*$/i, '').trim();
        const key = clean.toLowerCase();
        if (!customerActivityMap[key]) {
          customerActivityMap[key] = {
            customer_name: clean,
            phone: phone || '—',
            location: location || 'Meru',
            ordersCount: 0,
            bookingsCount: 0,
            warrantiesCount: 0,
            bookingValue: 0
          };
        }
        return customerActivityMap[key];
      };

      customers.forEach(c => ensureCust(c.full_name, c.phone, c.location));
      dispatches.forEach(d => {
        const entry = ensureCust(d.customer_name, d.customer_phone, d.delivery_address);
        entry.ordersCount += 1;
      });
      bookings.forEach(b => {
        const entry = ensureCust(b.customer_name, b.customer_phone, b.location_or_notes);
        entry.bookingsCount += 1;
        entry.bookingValue += Number(b.estimated_amount || 0);
      });
      warranties.forEach(w => {
        const matchedCust = customers.find(c => c.customer_id === w.customer_id);
        if (matchedCust) {
          const entry = ensureCust(matchedCust.full_name, matchedCust.phone, matchedCust.location);
          entry.warrantiesCount += 1;
        }
      });

      const topCustomers = Object.values(customerActivityMap)
        .map(c => ({
          ...c,
          totalInteractions: c.ordersCount + c.bookingsCount + c.warrantiesCount
        }))
        .sort((a, b) => b.totalInteractions - a.totalInteractions || b.bookingValue - a.bookingValue)
        .slice(0, 10);

      // --------------------------------------------------------
      // 5. STAFF PERFORMANCE & PRODUCTIVITY REPORT
      // --------------------------------------------------------
      const staffAccounts = users.filter(u => u.role && u.role !== 'customer');
      const staffPerformanceMap = {};

      staffAccounts.forEach(u => {
        const cleanName = String(u.full_name || u.username || 'Staff')
          .replace(/\s*\([^)]+\)\s*$/i, '')
          .trim();
        staffPerformanceMap[cleanName.toLowerCase()] = {
          user_id: u.user_id,
          full_name: cleanName,
          role: u.role,
          assignedTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          stockOpsLogged: 0,
          unitsHandled: 0
        };
      });

      const findOrCreateStaff = (rawName, fallbackRole) => {
        const clean = String(rawName || '').replace(/\s*\([^)]+\)\s*$/i, '').trim();
        if (!clean || clean.toLowerCase() === 'unassigned') return null;
        const key = clean.toLowerCase();
        // Match partial first+last name if needed
        let foundKey = Object.keys(staffPerformanceMap).find(k => k === key || k.includes(key) || key.includes(k));
        if (!foundKey) {
          staffPerformanceMap[key] = {
            user_id: null,
            full_name: clean,
            role: fallbackRole,
            assignedTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            stockOpsLogged: 0,
            unitsHandled: 0
          };
          foundKey = key;
        }
        return staffPerformanceMap[foundKey];
      };

      // Score Field Technicians via service_requests
      services.forEach(sr => {
        const tech = findOrCreateStaff(sr.technician_name, 'technician');
        if (tech) {
          tech.assignedTasks += 1;
          if (sr.status === 'completed') tech.completedTasks += 1;
          else if (sr.status === 'in_progress' || sr.status === 'assigned') tech.inProgressTasks += 1;
        }
      });

      // Score Delivery Drivers via dispatches
      dispatches.forEach(d => {
        const drv = findOrCreateStaff(d.driver_name, 'driver');
        if (drv) {
          drv.assignedTasks += 1;
          if (d.status === 'delivered') drv.completedTasks += 1;
          else if (d.status === 'in_transit' || d.status === 'pending_dispatch') drv.inProgressTasks += 1;
        }
      });

      // Score Warehouse / Inventory Staff via stock_movements
      movements.forEach(m => {
        const invStaff = findOrCreateStaff(m.recorded_by, 'inventory_manager');
        if (invStaff) {
          invStaff.stockOpsLogged += 1;
          invStaff.unitsHandled += Number(m.quantity || 0);
        }
      });

      const staffScorecard = Object.values(staffPerformanceMap)
        .map(s => {
          const totalWork = s.assignedTasks + s.stockOpsLogged;
          const completedWork = s.completedTasks + s.stockOpsLogged;
          const completionRate = s.assignedTasks > 0
            ? Number(((s.completedTasks / s.assignedTasks) * 100).toFixed(0))
            : (s.stockOpsLogged > 0 ? 100 : 0);

          let ratingLabel = 'Active Staff';
          if (completionRate >= 80 && totalWork >= 2) ratingLabel = 'Top Performer';
          else if (s.assignedTasks > 0 && completionRate < 50) ratingLabel = 'Follow-Up Needed';

          return {
            ...s,
            totalWork,
            completedWork,
            completionRate,
            ratingLabel
          };
        })
        .sort((a, b) => b.completedWork - a.completedWork || b.totalWork - a.totalWork);

      // --------------------------------------------------------
      // 6. AUTOMATED EXECUTIVE DECISION INSIGHTS
      // --------------------------------------------------------
      const insights = [];
      if (outOfStockItems.length > 0 || lowStockItems.length > 0) {
        const names = restockPriorityList.slice(0, 3).map(i => i.product_name).join(', ');
        insights.push({
          severity: outOfStockItems.length > 0 ? 'high' : 'medium',
          domain: 'Inventory & Purchasing',
          text: `${outOfStockItems.length} SKU(s) out of stock and ${lowStockItems.length} SKU(s) at/below reorder level (${names}). Restock inventory promptly to prevent lost sales.`
        });
      } else {
        insights.push({
          severity: 'positive',
          domain: 'Inventory Health',
          text: `All ${products.length} catalog SKUs (${totalStockUnits} total units) are currently stocked above minimum reorder thresholds.`
        });
      }

      insights.push({
        severity: netProfit >= 0 ? 'positive' : 'high',
        domain: 'Sales & Profitability',
        text: `Net profit is KES ${netProfit.toLocaleString('en-KE', { minimumFractionDigits: 2 })} (${profitMarginPct}% margin) across ${salesRecords.length} recorded sale(s), plus KES ${bookingPipelineValue.toLocaleString('en-KE', { minimumFractionDigits: 2 })} in confirmed future bookings.`
      });

      const unassignedServices = services.filter(s => !s.technician_name || s.status === 'pending').length;
      const pendingDeliveries = dispatches.filter(d => d.status !== 'delivered').length;
      if (unassignedServices > 0 || pendingDeliveries > 0) {
        insights.push({
          severity: 'medium',
          domain: 'Staff & Operations',
          text: `${unassignedServices} service request(s) await technician assignment and ${pendingDeliveries} order dispatch(es) are pending customer delivery.`
        });
      }

      if (unresolvedComplaints > 0 || unreadInquiries > 0) {
        insights.push({
          severity: 'medium',
          domain: 'Customer Experience',
          text: `${unresolvedComplaints} customer complaint(s) and ${unreadInquiries} unread contact inquiry(ies) require management response.`
        });
      }

      res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        period,
        decisionInsights: insights,
        sales: {
          totalRevenue: totalSalesRevenue,
          totalExpenses: totalOperatingExpenses,
          netProfit,
          profitMarginPct,
          transactionCount: salesRecords.length,
          avgTransactionValue: avgSaleValue,
          paymentBreakdown,
          salesByCategory,
          recentTransactions: salesRecords.slice(0, 25)
        },
        cashierSales: {
          totalRevenue: totalSalesRevenue,
          totalTransactions: detailedCashierTransactions.length,
          activeCashiersCount: cashierGroups.length,
          summary: cashierGroups.map(({ transactions, ...rest }) => rest),
          groups: cashierGroups,
          detailedTransactions: detailedCashierTransactions
        },
        profitAndLoss: {
          totalRevenue: totalSalesRevenue,
          totalExpenses: totalOperatingExpenses,
          netProfit,
          profitMarginPct,
          salesTransactionCount: salesRecords.length,
          expenseTransactionCount: expenseRecords.length,
          revenueByCategory: salesByCategory,
          expensesByCategory,
          expenseLedger: expenseRecords.slice(0, 25)
        },
        inventory: {
          totalSkus: products.length,
          totalUnits: totalStockUnits,
          costValuation: totalInventoryCostValue,
          retailValuation: totalInventoryRetailValue,
          projectedGrossMargin: projectedInventoryMargin,
          lowStockCount: lowStockItems.length,
          outOfStockCount: outOfStockItems.length,
          stockInUnits,
          stockOutUnits,
          categoryInventory,
          restockPriorityList: restockPriorityList.slice(0, 12),
          recentMovements: movements.slice(0, 10)
        },
        customerActivity: {
          registeredCustomers: customers.length,
          activeWarranties: activeWarrantiesCount,
          totalDispatches: dispatches.length,
          deliveredOrders: dispatches.filter(d => d.status === 'delivered').length,
          totalBookings: bookings.length,
          confirmedBookingsCount: confirmedBookings.length,
          bookingPipelineValue,
          averageRating: avgRating,
          totalReviews: reviewsOnly.length,
          unresolvedComplaints,
          unreadInquiries,
          topCustomers
        },
        staffPerformance: {
          totalStaffCount: staffScorecard.length,
          totalServiceJobs: services.length,
          completedServiceJobs: services.filter(s => s.status === 'completed').length,
          totalDeliveries: dispatches.length,
          completedDeliveries: dispatches.filter(d => d.status === 'delivered').length,
          totalStockMovements: movements.length,
          scorecard: staffScorecard
        }
      });
    } catch (err) {
      console.error('Realtime reports error:', err);
      res.status(500).json({ success: false, message: 'Failed to generate real-time reports: ' + err.message });
    }
  },

  // Live Storefront Checkout Recording so /cart orders immediately reflect in Cashier Queue & Real-Time Reports
  recordStorefrontCheckout: async (req, res) => {
    try {
      const { order_no, customer_name, customer_phone, delivery_address, payment_method, mpesa_receipt, total_amount, items } = req.body;
      const cleanAmount = Number(total_amount || 0);
      const refNo = order_no || ('EL-' + Math.floor(100000 + Math.random() * 900000));
      const cleanMethod = payment_method || 'M-Pesa';
      const refCheck = validatePaymentReference(cleanMethod, mpesa_receipt, { required: false, label: 'M-Pesa transaction code' });
      if (!refCheck.valid) {
        return res.status(400).json({ success: false, message: refCheck.message });
      }
      const cleanReceipt = refCheck.value;
      const isPaid = Boolean(cleanReceipt);
      const isPickup = req.body.fulfillment_mode === 'collection' || /pickup|collection/i.test(String(delivery_address || ''));
      const wantsInstallation = Boolean(req.body.requires_installation || req.body.installation_required);

      // 1. Save full itemized order into Cashier queue
      try {
        const existingOrders = readJsonFile(CASHIER_ORDERS_PATH, []);
        const normalizedItems = Array.isArray(items)
          ? items.map(it => ({
              product_id: it.product_id ? Number(it.product_id) : null,
              product_name: it.product_name || 'Electrical Item',
              quantity: Math.max(1, Number(it.quantity || 1)),
              unit_price: Number(it.selling_price || it.unit_price || 0)
            }))
          : [];
        const itemsSubtotal = normalizedItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const delivFee = Math.max(0, cleanAmount - itemsSubtotal);
        const nowIso = new Date().toISOString();
        const fType = isPickup
          ? 'product_collection'
          : (wantsInstallation ? 'product_delivery_install' : 'product_delivery');
        const cleanAmountPaid = isPaid ? cleanAmount : 0;
        const balanceDue = isPaid ? 0 : cleanAmount;
        const hasUnpaidBalance = balanceDue > 0;

        existingOrders.unshift({
          order_no: refNo,
          receipt_no: isPaid ? ('RCP-' + refNo.replace(/^EL-/i, '')) : '',
          source: 'Online Customer Order',
          customer_name: customer_name || 'Customer',
          customer_phone: customer_phone || '',
          customer_location: delivery_address || 'Meru County',
          items: normalizedItems,
          subtotal: itemsSubtotal || cleanAmount,
          delivery_fee: delivFee,
          total_amount: cleanAmount,
          amount_paid: cleanAmountPaid,
          balance_due: balanceDue,
          unpaid_balance: hasUnpaidBalance,
          order_status: 'processing',
          status: 'processing',
          payment_status: isPaid ? 'paid' : 'pending',
          delivery_status: 'not_scheduled',
          installation_status: wantsInstallation ? 'requested' : 'not_requested',
          requires_installation: wantsInstallation,
          site_ready_for_installation: isPickup,
          payment_method: cleanMethod,
          payment_ref: isPaid
            ? cleanReceipt
            : (cleanMethod === 'Cash' ? 'Pay on Collection / Delivery' : 'Pending M-Pesa Verification'),
          cash_tendered: isPaid ? cleanAmount : 0,
          change_due: 0,
          fulfillment_type: fType,
          fulfillment_mode: isPickup ? 'collection' : 'delivery',
          fulfillment_stage: 'finance',
          fulfillment_status: hasUnpaidBalance ? 'pending_credit_review' : 'pending_finance_release',
          finance_release_status: hasUnpaidBalance ? 'pending_credit_review' : 'pending_finance',
          finance_release_notes: '',
          finance_released_by: null,
          finance_released_at: null,
          cashier_name: isPaid ? 'M-Pesa Direct' : '',
          stock_deducted: true,
          created_at: nowIso,
          paid_at: isPaid ? nowIso : null
        });
        writeJsonFile(CASHIER_ORDERS_PATH, existingOrders);
      } catch (qErr) {
        console.warn('Cashier queue sync warning:', qErr.message);
      }

      // 2. Record sale in finance_records (both local and Supabase)
      const finDesc = `Online Order ${refNo} by ${customer_name || 'Customer'} (${Array.isArray(items) ? items.length : 1} item(s))${isPaid ? ' [M-Pesa Direct]' : ''}`;
      try {
        const localFin = readJsonFile(FINANCE_RECORDS_PATH, []);
        localFin.unshift({
          record_id: Date.now(),
          type: 'sale',
          category: 'Storefront Order',
          description: finDesc,
          amount: cleanAmount,
          payment_method: cleanMethod,
          reference_no: isPaid ? cleanReceipt : refNo,
          status: isPaid ? 'confirmed' : 'pending',
          created_at: nowIso
        });
        writeJsonFile(FINANCE_RECORDS_PATH, localFin);
      } catch (fErr) {}

      try {
        await supabase.from('finance_records').insert([{
          type: 'sale',
          category: 'Storefront Order',
          description: finDesc,
          amount: cleanAmount,
          payment_method: cleanMethod,
          reference_no: isPaid ? cleanReceipt : refNo,
          status: isPaid ? 'confirmed' : 'pending'
        }]);
      } catch (fDbErr) {}

      // 3. Deduct stock & log stock movements for ordered items (Inventory Manager connection)
      if (Array.isArray(items)) {
        for (const item of items) {
          const qty = Math.max(1, Number(item.quantity || 1));
          await interModuleSync.adjustProductStock({
            productId: item.product_id,
            productName: item.product_name,
            deltaQuantity: -qty,
            type: 'STOCK_OUT',
            reason: `Online Customer Order ${refNo}`,
            actor: 'Online Home Storefront'
          });
        }
      }

      // 4. Dispatch Manager Connection: If delivery, queue for driver
      if (!isPickup) {
        await interModuleSync.createDispatchForOrder({
          order_no: refNo,
          customer_name: customer_name || 'Customer',
          customer_phone: customer_phone || '',
          customer_location: delivery_address || 'Meru County Delivery Area',
          payment_method: cleanMethod,
          payment_ref: isPaid ? cleanReceipt : 'Pending Online Order',
          cashier_name: isPaid ? 'M-Pesa Direct' : 'Pending'
        });
      }

      res.status(201).json({ success: true, order_no: refNo });
    } catch (err) {
      console.error('Storefront checkout sync error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = reportsController;

