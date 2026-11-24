const express = require('express');
const router = express.Router();
const erpController = require('../controllers/erpController');
const reportsController = require('../controllers/reportsController');
const { blockSuppliersFromStaff } = require('../middleware/supplierAuth');

// Enforce strict separation: Suppliers cannot access internal ERP, finance, inventory movement, or staff APIs
router.use(blockSuppliersFromStaff);

// Authentication & Demo Accounts
router.post('/auth/login', erpController.login);
router.post('/auth/register', erpController.registerCustomer);
router.get('/auth/demo-accounts', erpController.getDemoAccounts);

// Administrative Governance Module
router.get('/admin/users', erpController.getUsers);
router.post('/admin/users', erpController.createUser);
router.put('/admin/users/:id', erpController.updateUserRole);
router.delete('/admin/users/:id', erpController.deleteUser);
router.get('/admin/settings', erpController.getSystemSettings);
router.put('/admin/settings', erpController.updateSystemSettings);
router.get('/admin/activities', erpController.getSystemActivities);
router.get('/admin/backup', erpController.backupDatabase);

// Customer Module
router.get('/customers', erpController.getCustomers);
router.post('/customers', erpController.createCustomer);
router.get('/warranties', erpController.getWarranties);
router.post('/warranties', erpController.createWarranty);
router.get('/customer/my-portal', erpController.getCustomerPortal);
router.put('/customer/my-profile', erpController.updateCustomerProfile);
router.post('/customer/services/:id/confirm', erpController.confirmCustomerServiceCompletion);
router.post('/customer/services/:id/pay', erpController.payCustomerServiceFee);
router.get('/customer/services/:id/receipt', erpController.downloadCustomerServiceReceipt);
router.post('/customer/bookings/:id/pay', erpController.payCustomerBookingFee);
router.get('/customer/bookings/:id/receipt', erpController.downloadCustomerBookingReceipt);

// Service Manager & Technician Module
router.get('/services', erpController.getServiceRequests);
router.post('/services', erpController.createServiceRequest);
router.put('/services/:id/assign', erpController.assignTechnician);
router.put('/services/:id/time', erpController.assignServiceTime);
router.put('/services/:id/status', erpController.updateServiceStatus);
router.post('/services/:id/completion-report', erpController.submitServiceCompletionReport);
router.post('/services/:id/approve', erpController.approveServiceCompletion);
router.get('/services/:id/material-requests', erpController.getMaterialRequests);
router.post('/services/:id/material-requests', erpController.createMaterialRequest);

// Inventory Material Requests (Technician -> Inventory Manager)
router.get('/inventory/material-requests', erpController.getMaterialRequests);
router.put('/inventory/material-requests/:mrId/review', erpController.reviewMaterialRequest);
router.post('/inventory/material-requests/:mrId/issue', erpController.issueMaterialRequest);

// Cashier Module (Sales, Payments, Invoices, Receipts & Order Handoff)
router.get('/cashier/orders', erpController.getCashierOrders);
router.post('/cashier/sales', erpController.recordCashierSale);
router.get('/cashier/orders/:orderNo/invoice', erpController.getOrderInvoice);
router.post('/cashier/orders/:orderNo/cancel', erpController.cancelCashierOrder);
router.post('/cashier/orders/:orderNo/confirm-payment', erpController.confirmOrderPayment);
router.post('/cashier/orders/:orderNo/fulfillment', erpController.sendPaidOrderFulfillment);

// Finance Manager Module
router.get('/finance/records', erpController.getFinanceRecords);
router.post('/finance/records', erpController.createFinanceRecord);
router.get('/finance/summary', erpController.getFinanceSummary);
router.get('/finance/balances', erpController.getFinanceBalances);
router.post('/finance/balances/opening', erpController.updateOpeningBalances);
router.get('/finance/pending-releases', erpController.getPendingFinanceReleases);
router.post('/finance/orders/:orderNo/release', erpController.releaseOrderByFinance);
router.get('/finance/service-charges', erpController.getServiceFeeCharges);
router.post('/finance/services/:id/confirm-payment', erpController.confirmServiceFeePayment);

// Dispatch & Driver Module
router.get('/dispatches', erpController.getDispatches);
router.post('/dispatches', erpController.createDispatch);
router.put('/dispatches/:id/status', erpController.updateDispatchStatus);
router.post('/dispatches/:id/pack', erpController.updateDispatchPacking);
router.post('/dispatches/:id/reschedule', erpController.rescheduleDispatchRun);

// Customer Care Follow-Up Module
router.get('/customer-care/tasks', erpController.getCustomerCareTasks);
router.post('/customer-care/tasks/:taskId/complete', erpController.completeCustomerCareTask);

// Inventory Stock Movements
router.get('/inventory/movements', erpController.getStockMovements);
router.post('/inventory/movements', erpController.recordStockMovement);

// Module Notifications Inbox (cross-module handoffs & customer/staff inbox)
router.get('/notifications', erpController.getModuleNotifications);
router.post('/notifications/read-all', erpController.markAllModuleNotificationsRead);
router.post('/notifications/:id/read', erpController.markModuleNotificationRead);

// Real-Time Reports & Storefront Order Sync
router.get('/reports/realtime', reportsController.getRealtimeReports);
router.post('/orders/checkout', reportsController.recordStorefrontCheckout);

module.exports = router;

