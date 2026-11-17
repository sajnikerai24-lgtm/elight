/**
 * In-process Automated Verification Script for the 5 Official Fulfillment & Dispatch/Installation Workflows:
 * 1. Product only: Cashier → Finance → Delivery
 * 2. Product + installation: Cashier → Finance → Delivery → Installation
 * 3. Product collected from shop: Cashier → Finance → Collection
 * 4. Product + installation booked later: Cashier → Finance → Delivery → Scheduled installation
 * 5. Product with unpaid balance: Finance checks credit/payment policy before release
 */

const erpController = require('../controllers/erpController');
const interModuleSync = require('../utils/interModuleSync');

function createMockReqRes(body = {}, params = {}, query = {}) {
  let statusCode = 200;
  let responseData = null;

  const req = {
    body,
    params,
    query,
    headers: {}
  };

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
    send(data) {
      responseData = data;
      return res;
    },
    getStatus() {
      return statusCode;
    },
    getData() {
      return responseData;
    }
  };

  return { req, res };
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 STARTING IN-PROCESS VERIFICATION FOR 5 FULFILLMENT WORKFLOWS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // WORKFLOW 1: Product only: Cashier → Finance → Delivery
    // -------------------------------------------------------------
    console.log('--- TEST 1: Product only (Cashier → Finance → Delivery) ---');
    const { req: req1, res: res1 } = createMockReqRes({
      customer_name: 'Test Customer 1',
      customer_phone: '0711000001',
      fulfillment_type: 'product_delivery',
      payment_method: 'Cash',
      amount_paid: 2500,
      cashier_name: 'Alice Muthoni',
      items: [{ id: 1, name: 'Phillips LED Bulb 9W', quantity: 5, unit_price: 500, total_price: 2500 }]
    });

    await erpController.recordCashierSale(req1, res1);
    const data1 = res1.getData();
    assert(data1 && data1.success, `Order 1 created: ${data1?.order?.order_no || data1?.order?.order_number}`);
    const order1 = data1.order;
    const order1No = order1.order_number || order1.order_no;

    assert(order1.fulfillment_type === 'product_delivery', 'Order 1 fulfillment_type is product_delivery');
    assert(order1.finance_release_status === 'pending_finance', 'Order 1 is locked in pending_finance');
    assert(order1.fulfillment_stage === 'finance', 'Order 1 fulfillment stage is finance');

    // Rule enforcement: Attempt to send to dispatch before Finance release MUST BE BLOCKED (403)
    const { req: blkReq1, res: blkRes1 } = createMockReqRes(
      { cashier_name: 'Alice Muthoni', action: 'send_delivery' },
      { orderNo: order1No }
    );
    await erpController.sendPaidOrderFulfillment(blkReq1, blkRes1);
    assert(blkRes1.getStatus() === 403, 'Delivery blocked: Unreleased order cannot proceed to Dispatch');

    // Finance releases Order 1
    const { req: relReq1, res: relRes1 } = createMockReqRes(
      { action: 'release', cashier_name: 'Alice Muthoni' },
      { orderNo: order1No }
    );
    await erpController.releaseOrderByFinance(relReq1, relRes1);
    const relData1 = relRes1.getData();
    assert(relData1 && relData1.success, 'Finance releases Order 1');
    assert(relData1?.order?.finance_release_status === 'released', 'Order 1 release status is now released');
    assert(relData1?.order?.fulfillment_stage === 'delivery', 'Order 1 has routed to delivery stage');

    // -------------------------------------------------------------
    // WORKFLOW 2: Product + installation: Cashier → Finance → Delivery → Installation
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Product + installation (Cashier → Finance → Delivery → Installation) ---');
    const { req: req2, res: res2 } = createMockReqRes({
      customer_name: 'Test Customer 2',
      customer_phone: '0711000002',
      fulfillment_type: 'product_delivery_install',
      payment_method: 'M-Pesa',
      payment_reference: 'MPESA_TEST_002',
      amount_paid: 6000,
      cashier_name: 'Alice Muthoni',
      items: [{ id: 2, name: 'Water Heater 30L', quantity: 1, unit_price: 6000, total_price: 6000 }]
    });

    await erpController.recordCashierSale(req2, res2);
    const data2 = res2.getData();
    const order2 = data2.order;
    const order2No = order2.order_number || order2.order_no;
    assert(order2.fulfillment_type === 'product_delivery_install', 'Order 2 is product_delivery_install');
    assert(order2.finance_release_status === 'pending_finance', 'Order 2 requires Finance release');

    // Finance releases Order 2
    const { req: relReq2, res: relRes2 } = createMockReqRes(
      { action: 'release', cashier_name: 'Alice Muthoni' },
      { orderNo: order2No }
    );
    await erpController.releaseOrderByFinance(relReq2, relRes2);
    const relData2 = relRes2.getData();
    assert(relData2 && relData2.success, 'Finance releases Order 2 to delivery');
    assert(relData2?.order?.fulfillment_stage === 'delivery', 'Order 2 routed to delivery stage');

    // Locate auto-created dispatch record
    const dispatches2 = await interModuleSync.getDispatches();
    const disp2 = dispatches2.find(d => String(d.order_no).toUpperCase() === order2No.toUpperCase());
    assert(disp2 && disp2.needs_installation === true, 'Dispatch record generated with needs_installation flag');

    // Simulate driver marking delivery as 'delivered'
    const syncRes2 = await interModuleSync.updateDispatchStatus(
      disp2.dispatch_id,
      'delivered',
      'Goods delivered safely to site',
      'Driver Peter'
    );
    assert(syncRes2 !== null, 'Driver marked delivery as delivered');

    // Verify order 2 transitioned to installation_pending and installation ticket generated
    const { req: chkReq2, res: chkRes2 } = createMockReqRes();
    await erpController.getCashierOrders(chkReq2, chkRes2);
    const allOrders2 = chkRes2.getData()?.orders || [];
    const refreshedOrder2 = allOrders2.find(o => (o.order_no || o.order_number) === order2No);
    assert(
      refreshedOrder2 && refreshedOrder2.fulfillment_stage === 'installation',
      'Order 2 transitioned to installation stage upon delivery'
    );

    // Locate auto-generated installation ticket
    const sRequests = await interModuleSync.getServiceRequests();
    const instReq = sRequests.find(r => r.booking_ref === `INS-${order2No}`);
    assert(instReq !== undefined, `Installation service ticket auto-created (#SR-${instReq?.request_id})`);

    // Verify service ticket completion triggers final order completion
    if (instReq) {
      const syncInstRes2 = await interModuleSync.updateServiceRequestStatus(
        instReq.request_id,
        'completed',
        'Installed 30L Water Heater with 32A DP switch',
        'Technician John'
      );
      assert(syncInstRes2 !== null, 'Technician completed field installation');

      // Verify cashier order status updated
      const { req: finChkReq, res: finChkRes } = createMockReqRes();
      await erpController.getCashierOrders(finChkReq, finChkRes);
      const finalOrder2 = (finChkRes.getData()?.orders || []).find(o => (o.order_no || o.order_number) === order2No);
      assert(
        finalOrder2 && finalOrder2.fulfillment_status === 'installed_and_completed',
        'Order 2 final status marked installed_and_completed'
      );
    }

    // -------------------------------------------------------------
    // WORKFLOW 3: Product collected from shop: Cashier → Finance → Collection
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Product collected from shop (Cashier → Finance → Collection) ---');
    const { req: req3, res: res3 } = createMockReqRes({
      customer_name: 'Test Customer 3',
      customer_phone: '0711000003',
      fulfillment_type: 'product_collection',
      payment_method: 'Cash',
      amount_paid: 1200,
      cashier_name: 'Alice Muthoni',
      items: [{ id: 3, name: 'Extension Cable 5m', quantity: 1, unit_price: 1200, total_price: 1200 }]
    });

    await erpController.recordCashierSale(req3, res3);
    const data3 = res3.getData();
    const order3 = data3.order;
    const order3No = order3.order_number || order3.order_no;
    assert(order3.fulfillment_type === 'product_collection', 'Order 3 is product_collection');

    // Finance releases Order 3
    const { req: relReq3, res: relRes3 } = createMockReqRes(
      { action: 'release', cashier_name: 'Alice Muthoni' },
      { orderNo: order3No }
    );
    await erpController.releaseOrderByFinance(relReq3, relRes3);
    const relData3 = relRes3.getData();
    assert(relData3 && relData3.success, 'Finance releases Order 3');
    assert(relData3?.order?.fulfillment_status === 'ready_for_collection', 'Order 3 is ready_for_collection');
    assert(relData3?.order?.fulfillment_stage === 'collection', 'Order 3 stage is collection');

    // Cashier marks order collected at counter
    const { req: colReq3, res: colRes3 } = createMockReqRes(
      { cashier_name: 'Alice Muthoni', action: 'mark_collected' },
      { orderNo: order3No }
    );
    await erpController.sendPaidOrderFulfillment(colReq3, colRes3);
    const colData3 = colRes3.getData();
    assert(colData3 && colData3.success, 'Cashier marks Order 3 as collected');
    assert(colData3?.order?.fulfillment_status === 'collected', 'Order 3 final status is collected');

    // -------------------------------------------------------------
    // WORKFLOW 4: Product + installation booked later
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Product + installation booked later (Cashier → Finance → Delivery → Scheduled installation) ---');
    const { req: req4, res: res4 } = createMockReqRes({
      customer_name: 'Test Customer 4',
      customer_phone: '0711000004',
      fulfillment_type: 'product_install_later',
      payment_method: 'Bank Transfer',
      amount_paid: 15000,
      cashier_name: 'Alice Muthoni',
      items: [{ id: 4, name: 'Solar Inverter 1.5kVA', quantity: 1, unit_price: 15000, total_price: 15000 }]
    });

    await erpController.recordCashierSale(req4, res4);
    const data4 = res4.getData();
    const order4 = data4.order;
    const order4No = order4.order_number || order4.order_no;
    assert(order4.fulfillment_type === 'product_install_later', 'Order 4 is product_install_later');

    // Finance release creates dispatch and scheduled booking standby
    const { req: relReq4, res: relRes4 } = createMockReqRes(
      { action: 'release', cashier_name: 'Alice Muthoni' },
      { orderNo: order4No }
    );
    await erpController.releaseOrderByFinance(relReq4, relRes4);
    const relData4 = relRes4.getData();
    assert(relData4 && relData4.success, 'Finance releases Order 4');
    assert(relData4?.order?.fulfillment_stage === 'delivery', 'Order 4 routed to delivery');

    // Locate dispatch for order 4
    const dispatches4 = await interModuleSync.getDispatches();
    const disp4 = dispatches4.find(d => String(d.order_no).toUpperCase() === order4No.toUpperCase());
    assert(disp4 && disp4.booked_later === true, 'Dispatch record flagged booked_later === true');

    // Driver delivers goods
    const syncRes4 = await interModuleSync.updateDispatchStatus(
      disp4.dispatch_id,
      'delivered',
      'Solar Inverter delivered to client premises',
      'Driver Peter'
    );
    assert(syncRes4 !== null, 'Driver marked goods as delivered for install later order');

    const { req: chkReq4, res: chkRes4 } = createMockReqRes();
    await erpController.getCashierOrders(chkReq4, chkRes4);
    const allOrders4 = chkRes4.getData()?.orders || [];
    const refreshedOrder4 = allOrders4.find(o => (o.order_no || o.order_number) === order4No);
    assert(
      refreshedOrder4 && refreshedOrder4.fulfillment_stage === 'scheduled_installation',
      'Order 4 transitioned to scheduled_installation stage awaiting customer booking date'
    );

    // -------------------------------------------------------------
    // WORKFLOW 5: Product with unpaid balance (Finance checks credit/payment policy before release)
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Product with unpaid balance (Rule 5: Finance checks credit/payment policy) ---');
    const { req: req5, res: res5 } = createMockReqRes({
      customer_name: 'Meru Construction Ltd',
      customer_phone: '0711999999',
      fulfillment_type: 'product_delivery',
      payment_method: 'Partial M-Pesa Deposit',
      payment_reference: 'DEP_MPESA_789',
      total_amount: 50000,
      amount_paid: 20000, // Balance: 30,000
      credit_policy_notes: 'Initial 40% deposit paid; requested 30-day corporate trade credit for balance',
      cashier_name: 'Alice Muthoni',
      items: [{ id: 5, name: 'Armoured Cable 100m', quantity: 1, unit_price: 50000, total_price: 50000 }]
    });

    await erpController.recordCashierSale(req5, res5);
    const data5 = res5.getData();
    const order5 = data5.order;
    const order5No = order5.order_number || order5.order_no;

    assert(order5.unpaid_balance === true, 'Order 5 flagged unpaid_balance === true');
    assert(order5.balance_due === 30000, 'Order 5 balance_due calculated as 30,000');
    assert(order5.finance_release_status === 'pending_credit_review', 'Order 5 status is pending_credit_review');

    // Rule 5 Enforcement: Attempt release WITHOUT credit notes MUST FAIL (400)
    const { req: badRelReq5, res: badRelRes5 } = createMockReqRes(
      { action: 'release', cashier_name: 'Alice Muthoni', credit_notes: '', credit_policy_type: '' },
      { orderNo: order5No }
    );
    await erpController.releaseOrderByFinance(badRelReq5, badRelRes5);
    assert(
      badRelRes5.getStatus() === 400 && !badRelRes5.getData()?.success,
      'Rule 5 Enforced: Release without credit policy verification terms is strictly rejected (400)'
    );

    // Finance verifies and approves credit terms
    const { req: goodRelReq5, res: goodRelRes5 } = createMockReqRes(
      {
        action: 'release',
        credit_policy_type: 'Approved 30-Day Trade Credit',
        credit_notes: 'Credit limit KES 100,000 verified against Corporate Trade Account #CTA-4402',
        cashier_name: 'Alice Muthoni'
      },
      { orderNo: order5No }
    );
    await erpController.releaseOrderByFinance(goodRelReq5, goodRelRes5);
    const goodRelData5 = goodRelRes5.getData();
    assert(goodRelData5 && goodRelData5.success, 'Finance approved credit policy terms and released Order 5');
    assert(goodRelData5?.order?.finance_release_status === 'released', 'Order 5 status is now released');
    assert(goodRelData5?.order?.credit_policy_type === 'Approved 30-Day Trade Credit', 'Credit policy type saved');

    // Later: Customer clears balance at Finance Desk
    const { req: payBalReq5, res: payBalRes5 } = createMockReqRes(
      {
        action: 'record_balance_payment',
        amount: 30000,
        payment_method: 'Bank Transfer',
        reference_no: 'BANK_EQUITY_8829',
        cashier_name: 'Alice Muthoni'
      },
      { orderNo: order5No }
    );
    await erpController.releaseOrderByFinance(payBalReq5, payBalRes5);
    const payBalData5 = payBalRes5.getData();
    assert(payBalData5 && payBalData5.success, 'Finance recorded balance payment');
    assert(payBalData5?.order?.balance_due === 0, 'Balance due is now 0');
    assert(payBalData5?.order?.unpaid_balance === false, 'Order unpaid_balance is false');

    // Check pending releases endpoint KPIs
    console.log('\n--- TEST KPI Endpoint: GET /api/finance/pending-releases ---');
    const { req: kpiReq, res: kpiRes } = createMockReqRes();
    await erpController.getPendingFinanceReleases(kpiReq, kpiRes);
    const kpiData = kpiRes.getData();
    assert(kpiData && kpiData.success, 'GET /api/finance/pending-releases responded successfully');
    assert(typeof kpiData.counts?.pending_finance === 'number', 'pending_finance count is numeric');
    assert(typeof kpiData.counts?.pending_credit_review === 'number', 'pending_credit_review count is numeric');
    assert(typeof kpiData.counts?.released === 'number', 'released count is numeric');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    console.log('\n================================================================');
    console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
