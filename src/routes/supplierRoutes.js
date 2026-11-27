const express = require('express');
const router = express.Router();
const controller = require('../controllers/supplierPortalController');
const { authenticateSupplier, requireErpRoles } = require('../middleware/supplierAuth');

// --- Public / Auth endpoints for Supplier Login & Recovery ---
router.post('/supplier/auth/login', controller.supplierLogin);
router.post('/supplier/auth/refresh', controller.supplierRefreshSession);
router.post('/supplier/auth/forgot-password', controller.supplierForgotPassword);

// --- Authenticated Supplier Account Endpoints ---
router.get('/supplier/auth/me', authenticateSupplier, controller.getSupplierMe);
router.post('/supplier/auth/change-password', authenticateSupplier, controller.supplierChangePassword);

// --- Supplier Portal Core Endpoints (Strictly Isolated per Authenticated Supplier) ---
router.get('/supplier/dashboard', authenticateSupplier, controller.getSupplierDashboard);
router.get('/supplier/purchase-orders', authenticateSupplier, controller.getSupplierPurchaseOrders);
router.get('/supplier/purchase-orders/:poId', authenticateSupplier, controller.getSupplierPurchaseOrderById);
router.post('/supplier/purchase-orders/:poId/acknowledge', authenticateSupplier, controller.acknowledgeSupplierPO);

router.get('/supplier/quotations', authenticateSupplier, controller.getSupplierQuotations);
router.post('/supplier/quotations', authenticateSupplier, controller.submitSupplierQuotation);

router.get('/supplier/deliveries', authenticateSupplier, controller.getSupplierDeliveries);
router.post('/supplier/deliveries', authenticateSupplier, controller.createSupplierDelivery);
router.put('/supplier/deliveries/:deliveryId', authenticateSupplier, controller.updateSupplierDelivery);

router.get('/supplier/invoices', authenticateSupplier, controller.getSupplierInvoices);
router.post('/supplier/invoices', authenticateSupplier, controller.uploadSupplierInvoice);

router.get('/supplier/payments', authenticateSupplier, controller.getSupplierPayments);
router.post('/supplier/payments/:paymentId/confirm', authenticateSupplier, controller.confirmSupplierPaymentReceived);
router.get('/supplier/payments/:paymentId/receipt', authenticateSupplier, controller.downloadSupplierPaymentReceipt);

router.get('/supplier/notifications', authenticateSupplier, controller.getSupplierNotifications);
router.post('/supplier/notifications/read-all', authenticateSupplier, controller.markAllNotificationsRead);
router.post('/supplier/notifications/:id/read', authenticateSupplier, controller.markNotificationRead);

router.get('/supplier/documents/:docType/:id', authenticateSupplier, controller.downloadOwnSupplierDocument);

// --- Internal ERP Staff Endpoints (Suppliers STRICTLY Blocked -> 403) ---
const ADMIN_ROLES = ['admin', 'owner', 'super_admin', 'administrator'];
const INVENTORY_ROLES = ['admin', 'owner', 'super_admin', 'administrator', 'inventory_manager', 'inventory'];
const FINANCE_ROLES = ['admin', 'owner', 'super_admin', 'administrator', 'finance_manager', 'finance'];
const STAFF_DOC_ROLES = ['admin', 'owner', 'super_admin', 'administrator', 'inventory_manager', 'inventory', 'finance_manager', 'finance'];

// Admin Supplier Account Governance
router.get('/erp/suppliers', ...requireErpRoles(ADMIN_ROLES), controller.erpListSuppliers);
router.post('/erp/suppliers', ...requireErpRoles(ADMIN_ROLES), controller.erpRegisterSupplier);

// Inventory Manager Procurement & Delivery Confirmation
router.get('/erp/suppliers/procurement/overview', ...requireErpRoles(INVENTORY_ROLES), controller.erpGetProcurementOverview);
router.post('/erp/suppliers/purchase-orders', ...requireErpRoles(INVENTORY_ROLES), controller.erpCreatePurchaseOrder);
router.put('/erp/suppliers/quotations/:quotationId/review', ...requireErpRoles(INVENTORY_ROLES), controller.erpReviewQuotation);
router.post('/erp/suppliers/deliveries/:deliveryId/confirm', ...requireErpRoles(INVENTORY_ROLES), controller.erpConfirmDeliveryReceived);

// Finance & Inventory Invoice Verification + Finance Payments
router.get('/erp/suppliers/finance/overview', ...requireErpRoles(FINANCE_ROLES), controller.erpGetFinanceOverview);
router.put('/erp/suppliers/invoices/:invoiceId/review', ...requireErpRoles(STAFF_DOC_ROLES), controller.erpReviewInvoice);
router.post('/erp/suppliers/invoices/:invoiceId/pay', ...requireErpRoles(FINANCE_ROLES), controller.erpPaySupplierInvoice);
router.post('/erp/suppliers/purchase-orders/:poId/pay', ...requireErpRoles(FINANCE_ROLES), controller.erpPayForwardedPO);
router.get('/erp/suppliers/payments/:paymentId/receipt', ...requireErpRoles(FINANCE_ROLES), controller.erpDownloadSupplierPaymentReceipt);

// Internal Staff Document Preview
router.get('/erp/suppliers/documents/:docType/:id', ...requireErpRoles(STAFF_DOC_ROLES), controller.erpDownloadSupplierDocument);

// Admin Parameterized Supplier Routes (kept after specific /procurement, /finance, /documents paths)
router.get('/erp/suppliers/:supplierId', ...requireErpRoles(ADMIN_ROLES), controller.erpGetSupplierDetails);
router.put('/erp/suppliers/:supplierId', ...requireErpRoles(ADMIN_ROLES), controller.erpUpdateSupplier);
router.post('/erp/suppliers/:supplierId/toggle-status', ...requireErpRoles(ADMIN_ROLES), controller.erpToggleSupplierStatus);
router.post('/erp/suppliers/:supplierId/reset-password', ...requireErpRoles(ADMIN_ROLES), controller.erpResetSupplierPassword);

module.exports = router;

