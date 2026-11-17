/**
 * Comprehensive End-to-End Business Workflow Integration Test
 * Elite / Elight Electrical Shop
 *
 * Tests the complete integration between:
 * - Cashier Desk
 * - Finance Desk (Verification & Credit Release)
 * - Dispatch Desk (Stock readiness, Driver assignment, Rescheduling)
 * - Driver Delivery Run Sheet (Out for delivery, Delivery failure, Confirmed delivery)
 * - Service Manager Desk (Scheduling, Technician assignment, Completion approval)
 * - Technician Field Job (Strict site readiness gate, Materials logging, Inspection submission)
 * - Customer Care Desk (Post-fulfillment tasks, Ratings, Complaints)
 * - Status Independence (order_status, payment_status, delivery_status, installation_status)
 */

const erpController = require('../controllers/erpController');
const interModuleSync = require('../utils/interModuleSync');

function mockReqRes(body = {}, params = {}, query = {}) {
  const req = { body, params, query, headers: {} };
  let statusCode = 200;
  let jsonResult = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResult = data;
      return this;
    },
    send(data) {
      jsonResult = data;
      return this;
    }
  };
  return { req, res, getResult: () => ({ statusCode, jsonResult }) };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING COMPLETE BUSINESS WORKFLOW INTEGRATION TESTS');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST SUITE 1: PRODUCT ONLY (NO INSTALLATION)
  // Cashier -> Invoice -> M-Pesa -> Finance -> Dispatch -> Driver -> Delivered -> Customer Care
  // -------------------------------------------------------------
  console.log('--- TEST SUITE 1: Product Only (Cashier -> Finance -> Delivery -> Customer Care) ---');
  let order1No = null;

  // 1. Cashier creates order & records payment
  {
    const { req, res, getResult } = mockReqRes({
      customer_name: 'David Mwangi',
      customer_phone: '0711223344',
      customer_location: 'Makutano, Meru',
      fulfillment_mode: 'delivery',
      payment_method: 'M-Pesa',
      payment_ref: 'MPESA-TEST-P1',
      requires_installation: false,
      items: [
        { product_id: 1, product_name: 'Philips LED Bulb 9W', quantity: 4, unit_price: 350 }
      ],
      amount_paid: 1400,
      total_amount: 1400
    });

    await erpController.recordCashierSale(req, res);
    const r = getResult();
    assert(r.statusCode === 201 && r.jsonResult.success, 'Stage 1.1: Cashier sale recorded successfully');
    order1No = r.jsonResult.order.order_no || r.jsonResult.order.order_number;
    assert(Boolean(order1No), `Stage 1.2: Order created with number: ${order1No}`);
    assert(Boolean(r.jsonResult.order.invoice_no), `Stage 1.3: Invoice generated: ${r.jsonResult.order.invoice_no}`);
    assert(r.jsonResult.order.payment_status === 'pending_verification', 'Stage 1.4: Payment status initialized to pending_verification');
    assert(r.jsonResult.order.installation_status === 'not_requested', 'Stage 1.5: Installation status set to not_requested');
  }

  // 2. Fetch formal invoice
  {
    const { req, res, getResult } = mockReqRes({}, { orderNo: order1No });
    await erpController.getOrderInvoice(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 1.6: Invoice details retrieved successfully');
    assert(r.jsonResult.invoice.total_amount === 1400, 'Stage 1.7: Invoice total matches order total');
  }

  // 3. Finance Manager verifies payment and releases order
  {
    const { req, res, getResult } = mockReqRes({
      action: 'release',
      cashier_name: 'Alice Muthoni (Finance)'
    }, { orderNo: order1No });

    await erpController.releaseOrderByFinance(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 2.1: Finance verified and released order');
    assert(r.jsonResult.order.payment_status === 'paid', 'Stage 2.2: Payment status marked as paid');
    assert(r.jsonResult.order.delivery_status === 'scheduled', 'Stage 2.3: Delivery status transitioned to scheduled');
  }

  // 4. Dispatch Manager checks packing and packs order
  let dispatch1Id = null;
  {
    const dispatches = await interModuleSync.getDispatches();
    const d = dispatches.find(x => x.order_no === order1No);
    assert(Boolean(d), 'Stage 3.1: Order routed to Dispatch queue automatically upon finance release');
    dispatch1Id = d ? d.dispatch_id : null;

    if (dispatch1Id) {
      const { req, res, getResult } = mockReqRes({ packing_status: 'ready' }, { id: dispatch1Id });
      await erpController.updateDispatchPacking(req, res);
      const r = getResult();
      assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 3.2: Dispatch packing status updated to ready');
    }
  }

  // 5. Driver takes delivery out for delivery and completes delivery
  {
    if (dispatch1Id) {
      await interModuleSync.updateDispatchStatus(dispatch1Id, 'out_for_delivery');
      let d = (await interModuleSync.getDispatches()).find(x => x.dispatch_id === dispatch1Id);
      assert(d.status === 'out_for_delivery', 'Stage 3.3: Driver marked dispatch as out_for_delivery');

      await interModuleSync.updateDispatchStatus(dispatch1Id, 'delivered', {
        driver_notes: 'Delivered directly to customer gate. Customer verified goods.'
      });
      d = (await interModuleSync.getDispatches()).find(x => x.dispatch_id === dispatch1Id);
      assert(d.status === 'delivered', 'Stage 3.4: Driver confirmed successful delivery');

      const orders = interModuleSync.getCashierOrders();
      const updatedOrder = orders.find(o => o.order_no === order1No);
      assert(updatedOrder.delivery_status === 'delivered', 'Stage 3.5: Order delivery status updated to delivered');
      assert(updatedOrder.order_status === 'completed', 'Stage 3.6: Product-only order automatically completed upon delivery');
    }
  }

  // 6. Verify Customer Care follow-up task created
  {
    const { req, res, getResult } = mockReqRes();
    await erpController.getCustomerCareTasks(req, res);
    const r = getResult();
    const task = (r.jsonResult.tasks || []).find(t => t.order_no === order1No);
    assert(Boolean(task), `Stage 6.1: Customer Care follow-up task created automatically: ${task ? task.task_id : 'none'}`);

    if (task) {
      const { req: cReq, res: cRes, getResult: cResult } = mockReqRes({
        product_condition: 'Good Condition',
        delivery_satisfaction: 5,
        delivery_notes: 'Driver was punctual and polite',
        feedback: 'Very happy with prompt delivery!',
        is_complaint: false,
        agent_name: 'Grace (Customer Care)'
      }, { taskId: task.task_id });

      await erpController.completeCustomerCareTask(cReq, cRes);
      const cr = cResult();
      assert(cr.statusCode === 200 && cr.jsonResult.success, 'Stage 6.2: Customer Care completed follow-up and logged review');
    }
  }

  console.log('\n--- TEST SUITE 2: Product + Installation Workflow with Strict Site Gate ---');
  let order2No = null;

  // 1. Customer buys water heater with installation requested
  {
    const { req, res, getResult } = mockReqRes({
      customer_name: 'Beatrice Njeri',
      customer_phone: '0722334455',
      customer_location: 'Kinoru, Meru',
      fulfillment_mode: 'delivery',
      payment_method: 'M-Pesa',
      payment_ref: 'MPESA-TEST-P2',
      requires_installation: true,
      service_type: 'Water Heater Installation',
      installation_fee: 1500,
      scheduled_date: '2026-11-20',
      items: [
        { product_id: 15, product_name: 'Ariston Instant Water Heater 3kW', quantity: 1, unit_price: 12500 }
      ],
      amount_paid: 14000,
      total_amount: 14000
    });

    await erpController.recordCashierSale(req, res);
    const r = getResult();
    order2No = r.jsonResult.order.order_no || r.jsonResult.order.order_number;
    assert(Boolean(order2No), `Stage 4.1: Product + installation order created: ${order2No}`);
    assert(r.jsonResult.order.installation_status === 'requested', 'Stage 4.2: Installation status set to requested');
  }

  // 2. Finance releases order & approves installation charges
  {
    const { req, res, getResult } = mockReqRes({
      action: 'release',
      cashier_name: 'Alice Muthoni (Finance)'
    }, { orderNo: order2No });

    await erpController.releaseOrderByFinance(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 4.3: Finance approved financial clearance for product & installation');
    assert(r.jsonResult.order.installation_status === 'approved', 'Stage 4.4: Installation status transitioned to approved');
  }

  // 3. Service Manager schedules and assigns technician
  let serviceRequestId = null;
  {
    const servs = await interModuleSync.getServiceRequests();
    const s = servs.find(x => x.order_no === order2No);
    assert(Boolean(s), 'Stage 4.5: Linked service ticket created in Service Manager queue');
    serviceRequestId = s ? s.request_id : null;

    if (serviceRequestId) {
      await interModuleSync.assignTechnicianToRequest(serviceRequestId, 5, 'Dennis Kimathi');
      await interModuleSync.assignTimeToServiceRequest(serviceRequestId, '10:00 AM - 12:00 PM', 'Service Manager');

      const sUpdated = (await interModuleSync.getServiceRequests()).find(x => x.request_id === serviceRequestId);
      assert(sUpdated.assigned_technician_name === 'Dennis Kimathi', 'Stage 4.6: Technician assigned: Dennis Kimathi');
      assert(sUpdated.assigned_time === '10:00 AM - 12:00 PM', 'Stage 4.7: Service arrival window scheduled');
    }
  }

  // 4. CRITICAL GATE TEST: Prevent technician from starting installation before product delivery
  {
    let gateBlocked = false;
    try {
      await interModuleSync.updateServiceRequestStatus(serviceRequestId, 'in_progress', {
        actorRole: 'technician'
      });
    } catch (err) {
      gateBlocked = true;
      assert(err.message.includes('Site Not Ready') || err.message.includes('cannot be started until goods arrive on site'), `Stage 4.8 [GATE ENFORCED]: ${err.message}`);
    }
    assert(gateBlocked, 'Stage 4.9: STRICT GATE: Technician job was blocked from starting because product was still in transit!');
  }

  // 5. Driver delivers product to customer residence
  {
    const dispatches = await interModuleSync.getDispatches();
    const d = dispatches.find(x => x.order_no === order2No);
    assert(Boolean(d), 'Stage 5.1: Delivery run verified');

    await interModuleSync.updateDispatchStatus(d.dispatch_id, 'delivered');
    const orderCheck = interModuleSync.getCashierOrders().find(o => o.order_no === order2No);
    assert(orderCheck.delivery_status === 'delivered', 'Stage 5.2: Product successfully delivered to site');
    assert(orderCheck.site_ready_for_installation === true, 'Stage 5.3: site_ready_for_installation flag set to true');

    const sReqCheck = (await interModuleSync.getServiceRequests()).find(s => s.request_id === serviceRequestId);
    assert(sReqCheck.site_ready_for_installation === true, 'Stage 5.4: Service request site readiness unlocked for technician');
  }

  // 6. Technician can now start installation, record materials, and submit completion report
  {
    await interModuleSync.updateServiceRequestStatus(serviceRequestId, 'in_progress', {
      materialsUsed: '25m 4.0mm twin+earth cable, 32A DP switch, flexible pipe'
    });
    let s = (await interModuleSync.getServiceRequests()).find(x => x.request_id === serviceRequestId);
    assert(s.status === 'in_progress', 'Stage 4.10: Technician started installation work on site');

    // Technician submits for inspection
    await interModuleSync.updateServiceRequestStatus(serviceRequestId, 'awaiting_inspection', {
      materialsUsed: '25m 4.0mm twin+earth cable, 32A DP switch, flexible pipe, earthing rod',
      completionNotes: 'Water heater installed, earthed, and tested at full 3kW load. Pressure relief valve operational.'
    });
    s = (await interModuleSync.getServiceRequests()).find(x => x.request_id === serviceRequestId);
    assert(s.status === 'awaiting_inspection', 'Stage 4.11: Technician submitted completion report awaiting inspection');
  }

  // 7. Service Manager reviews inspection and approves completion
  {
    const { req, res, getResult } = mockReqRes({
      approved_by: 'Service Manager (Eng. Joseph)',
      inspection_notes: 'Installation inspected per Kenya Electrical Safety Code. Pressure tested OK.'
    }, { id: serviceRequestId });

    await erpController.approveServiceCompletion(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 4.12: Service Manager approved installation completion');

    const orders = interModuleSync.getCashierOrders();
    const finishedOrder = orders.find(o => o.order_no === order2No);
    assert(finishedOrder.installation_status === 'completed', 'Stage 4.13: Installation status marked completed');
    assert(finishedOrder.order_status === 'completed', 'Stage 4.14: Overall order status marked completed');
  }

  // 8. Verify Customer Care task for Product + Installation
  {
    const { req, res, getResult } = mockReqRes();
    await erpController.getCustomerCareTasks(req, res);
    const r = getResult();
    const task = (r.jsonResult.tasks || []).find(t => t.order_no === order2No);
    assert(Boolean(task), `Stage 6.3: Customer Care task created after installation signoff: ${task ? task.task_id : 'none'}`);

    if (task) {
      const { req: cReq, res: cRes, getResult: cResult } = mockReqRes({
        product_condition: 'Good Condition',
        delivery_satisfaction: 5,
        installation_satisfaction: 5,
        delivery_notes: 'Fast delivery',
        feedback: 'Technician Dennis was very skilled and clean. Hot water works great!',
        is_complaint: false,
        agent_name: 'Grace (Customer Care)'
      }, { taskId: task.task_id });

      await erpController.completeCustomerCareTask(cReq, cRes);
      const cr = cResult();
      assert(cr.statusCode === 200 && cr.jsonResult.success, 'Stage 6.4: Product + Installation follow-up saved');
    }
  }

  console.log('\n--- TEST SUITE 3: Partial Payment & Credit Policy Review (Rule 5) ---');
  let order3No = null;

  // 1. Customer buys product with partial payment
  {
    const { req, res, getResult } = mockReqRes({
      customer_name: 'Meru Central Dairy Co-op',
      customer_phone: '0700112233',
      customer_location: 'Meru Town',
      fulfillment_mode: 'delivery',
      payment_method: 'Bank Transfer',
      payment_ref: 'BANK-TRF-001',
      requires_installation: false,
      items: [
        { product_id: 10, product_name: 'Schneider 3-Phase Distribution Board', quantity: 2, unit_price: 25000 }
      ],
      amount_paid: 20000,
      total_amount: 50000 // 30,000 balance due
    });

    await erpController.recordCashierSale(req, res);
    const r = getResult();
    order3No = r.jsonResult.order.order_no || r.jsonResult.order.order_number;
    assert(r.jsonResult.order.balance_due === 30000 && Boolean(r.jsonResult.order.unpaid_balance), 'Stage 2.4: Partial payment recorded with KES 30,000 unpaid balance');
    assert(r.jsonResult.order.finance_release_status === 'pending_credit_review', 'Stage 2.5: Order placed in pending_credit_review gate');
  }

  // 2. Finance Manager reviews credit policy and releases with terms
  {
    const { req, res, getResult } = mockReqRes({
      action: 'release',
      credit_policy_type: 'Approved 30-Day Corporate Trade Credit',
      credit_notes: 'Verified corporate credit facility agreement ref CC-2026-99. 30 days due date.',
      cashier_name: 'Alice Muthoni (Finance)'
    }, { orderNo: order3No });

    await erpController.releaseOrderByFinance(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 2.6: Finance released partial order under Rule 5 credit terms');
    assert(r.jsonResult.order.payment_status === 'partially_paid', 'Stage 2.7: Payment status marked partially_paid');
  }

  // 3. Receive remaining balance later
  {
    const { req, res, getResult } = mockReqRes({
      action: 'record_balance_payment',
      amount: 30000,
      payment_method: 'M-Pesa',
      reference_no: 'MPESA-BAL-CLEAR',
      cashier_name: 'Alice Muthoni (Finance)'
    }, { orderNo: order3No });

    await erpController.releaseOrderByFinance(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 2.8: Finance recorded remaining balance settlement');
    assert(r.jsonResult.order.payment_status === 'paid', 'Stage 2.9: Payment status transitioned from partially_paid to paid');
  }

  console.log('\n--- TEST SUITE 4: Failed Payment Flagging ---');
  let order4No = null;

  // 1. Order created with pending payment
  {
    const { req, res, getResult } = mockReqRes({
      customer_name: 'Simon Gikundi',
      customer_phone: '0712345678',
      customer_location: 'Nkubu',
      fulfillment_mode: 'delivery',
      payment_method: 'M-Pesa',
      payment_ref: 'MPESA-FAKE-REF',
      requires_installation: false,
      items: [
        { product_id: 2, product_name: 'Havells 16A MCB Single Pole', quantity: 5, unit_price: 450 }
      ],
      amount_paid: 2250,
      total_amount: 2250
    });

    await erpController.recordCashierSale(req, res);
    const r = getResult();
    order4No = r.jsonResult.order.order_no || r.jsonResult.order.order_number;
  }

  // 2. Finance flags payment as failed/unmatched
  {
    const { req, res, getResult } = mockReqRes({
      action: 'flag_failed',
      reason: 'Transaction code MPESA-FAKE-REF not found on Safaricom statement',
      cashier_name: 'Alice Muthoni (Finance)'
    }, { orderNo: order4No });

    await erpController.releaseOrderByFinance(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 2.10: Finance flagged failed payment');
    assert(r.jsonResult.order.payment_status === 'failed', 'Stage 2.11: Payment status set to failed');
    assert(r.jsonResult.order.finance_release_status === 'payment_failed', 'Stage 2.12: Finance release status set to payment_failed');
  }

  console.log('\n--- TEST SUITE 5: Order Cancellation Across Modules ---');
  let order5No = null;

  // 1. Create order
  {
    const { req, res, getResult } = mockReqRes({
      customer_name: 'Cancel Test Customer',
      customer_phone: '0799887766',
      customer_location: 'Meru',
      fulfillment_mode: 'delivery',
      payment_method: 'Cash',
      items: [{ product_id: 1, product_name: 'Cable 10m', quantity: 1, unit_price: 1000 }],
      amount_paid: 1000,
      total_amount: 1000
    });
    await erpController.recordCashierSale(req, res);
    const r = getResult();
    order5No = r.jsonResult.order.order_no || r.jsonResult.order.order_number;
  }

  // 2. Cashier cancels order
  {
    const { req, res, getResult } = mockReqRes({
      reason: 'Customer decided not to proceed with purchase',
      actor: 'Cashier Desk'
    }, { orderNo: order5No });

    await erpController.cancelCashierOrder(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 7.1: Cashier cancelled order');
    assert(r.jsonResult.order.order_status === 'cancelled', 'Stage 7.2: Order status marked cancelled');
  }

  console.log('\n--- TEST SUITE 6: Delivery Failure & Rescheduling ---');
  let order6No = null;
  let dispatch6Id = null;

  // 1. Create order and release to dispatch
  {
    const { req, res, getResult } = mockReqRes({
      customer_name: 'Faith Kinya',
      customer_phone: '0733445566',
      customer_location: 'Timau, Meru',
      fulfillment_mode: 'delivery',
      payment_method: 'Cash',
      items: [{ product_id: 3, product_name: 'Chint Contactor 25A', quantity: 1, unit_price: 3200 }],
      amount_paid: 3200,
      total_amount: 3200
    });
    await erpController.recordCashierSale(req, res);
    order6No = getResult().jsonResult.order.order_no;

    await erpController.releaseOrderByFinance(
      mockReqRes({ action: 'release', cashier_name: 'Alice Muthoni' }, { orderNo: order6No }).req,
      mockReqRes().res
    );

    const d = (await interModuleSync.getDispatches()).find(x => x.order_no === order6No);
    dispatch6Id = d.dispatch_id;
  }

  // 2. Driver reports delivery failure
  {
    await interModuleSync.updateDispatchStatus(dispatch6Id, 'failed', {
      driver_notes: 'Customer gate locked and phone unreachable after 3 attempts'
    });
    const d = (await interModuleSync.getDispatches()).find(x => x.dispatch_id === dispatch6Id);
    assert(d.status === 'failed', 'Stage 3.7: Driver reported delivery failure');

    const o = interModuleSync.getCashierOrders().find(x => x.order_no === order6No);
    assert(o.delivery_status === 'failed', 'Stage 3.8: Order delivery_status updated to failed');
  }

  // 3. Dispatch Manager reschedules delivery run
  {
    const { req, res, getResult } = mockReqRes({
      new_date: '2026-11-22',
      reason: 'Customer contacted and agreed on weekend delivery',
      actor: 'Dispatch Manager'
    }, { id: dispatch6Id });

    await erpController.rescheduleDispatchRun(req, res);
    const r = getResult();
    assert(r.statusCode === 200 && r.jsonResult.success, 'Stage 3.9: Dispatch Manager rescheduled delivery run');
    assert(r.jsonResult.dispatch.status === 'rescheduled', 'Stage 3.10: Dispatch status set to rescheduled');

    const o = interModuleSync.getCashierOrders().find(x => x.order_no === order6No);
    assert(o.delivery_status === 'rescheduled', 'Stage 3.11: Order delivery_status updated to rescheduled');
  }

  // 4. Driver delivers on rescheduled date
  {
    await interModuleSync.updateDispatchStatus(dispatch6Id, 'delivered', {
      driver_notes: 'Delivered successfully on rescheduled appointment'
    });
    const o = interModuleSync.getCashierOrders().find(x => x.order_no === order6No);
    assert(o.delivery_status === 'delivered', 'Stage 3.12: Final rescheduled delivery completed');
  }

  console.log('\n--- TEST SUITE 7: Cashier Zero-Amount Sale & Payment Rejection ---');
  {
    const { req, res, getResult } = mockReqRes({
      customer_name: 'Zero Item Price Customer',
      fulfillment_mode: 'collection',
      payment_method: 'Cash',
      items: [{ product_id: 1, product_name: 'Cable 10m', quantity: 1, unit_price: 0 }],
      amount_paid: 0
    });
    await erpController.recordCashierSale(req, res);
    const r = getResult();
    assert(r.statusCode === 400 && !r.jsonResult.success, 'Stage 8.1: Cashier rejected sale with KSh 0 item price');
  }
  {
    const { req, res, getResult } = mockReqRes({
      customer_name: 'Zero Payment Customer',
      fulfillment_mode: 'collection',
      payment_method: 'Cash',
      items: [{ product_id: 1, product_name: 'Cable 10m', quantity: 1, unit_price: 1000 }],
      amount_paid: 0
    });
    await erpController.recordCashierSale(req, res);
    const r = getResult();
    assert(r.statusCode === 400 && !r.jsonResult.success, 'Stage 8.2: Cashier rejected sale with KSh 0 payment amount');
  }
  {
    const { req, res, getResult } = mockReqRes({
      payment_method: 'Cash',
      amount_paid: 0
    }, { orderNo: order5No });
    await erpController.confirmOrderPayment(req, res);
    const r = getResult();
    assert(r.statusCode === 400 && !r.jsonResult.success, 'Stage 8.3: Cashier rejected order payment confirmation with KSh 0 amount');
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
