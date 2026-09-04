const { generateCheckMacValue, verifyCheckMacValue } = require('../utils/ecpayCrypto');

const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID;
const HASH_KEY = process.env.ECPAY_HASH_KEY;
const HASH_IV = process.env.ECPAY_HASH_IV;
const IS_PRODUCTION = process.env.ECPAY_ENV === 'production';
const AIO_BASE_URL = IS_PRODUCTION
  ? 'https://payment.ecpay.com.tw'
  : 'https://payment-stage.ecpay.com.tw';

function getMerchantTradeDate() {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(/-/g, '/');
}

function generateMerchantTradeNo() {
  return `T${Date.now()}`; // 英數字，最長 20 碼
}

// 建立導向綠界 AIO 付款頁所需的表單參數
// Source: .claude/skills/ecpay/guides/01-payment-aio.md §信用卡範例
function buildCheckoutParams(order, orderItems) {
  const itemName = orderItems
    .map((item) => item.product_name)
    .join('#')
    .slice(0, 200);

  const merchantTradeNo = generateMerchantTradeNo();

  const params = {
    MerchantID: MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: getMerchantTradeDate(),
    PaymentType: 'aio',
    TotalAmount: order.total_amount,
    TradeDesc: '花卉商城訂單付款',
    ItemName: itemName,
    ReturnURL: `${process.env.BASE_URL}/api/ecpay/notify`,
    ClientBackURL: `${process.env.FRONTEND_URL}/orders/${order.id}`,
    // ChoosePayment 無法同時指定多種付款方式，改用 ALL 讓消費者在綠界頁面自選，
    // 並以 IgnorePayment 排除掉信用卡、WebATM 以外的方式（DigitalPayment 依規格不可被排除）。
    // Source: .claude/skills/ecpay/guides/01-payment-aio.md §AIO 共用必填參數 / 各付款方式一覽
    ChoosePayment: 'ALL',
    IgnorePayment: 'ATM#CVS#BARCODE#ApplePay#TWQR#BNPL#WeiXin',
    EncryptType: 1,
  };

  // 注意：官方文件記載測試環境可加 SimulatePaid=1 略過刷卡，但實測共用測試帳號
  // 3002607 對此參數回傳 10100050 Parameter Error（該帳號未開通此功能）。
  // 因此一律走真實付款頁流程，測試時用官方測試卡 4311-9522-2222-2222 +
  // 任意 3 碼安全碼 + 未來到期日 + 3D 驗證碼 1234 完成付款。

  params.CheckMacValue = generateCheckMacValue(params, HASH_KEY, HASH_IV);

  return {
    actionUrl: `${AIO_BASE_URL}/Cashier/AioCheckOut/V5`,
    params,
    merchantTradeNo,
  };
}

// 主動查詢訂單付款狀態（本地端無法接收 ReturnURL，改用此 API 驗證）
// Source: .claude/skills/ecpay/guides/01-payment-aio.md §主動查詢訂單狀態
async function queryTradeInfo(merchantTradeNo) {
  const params = {
    MerchantID: MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: Math.floor(Date.now() / 1000), // 3 分鐘內有效，每次呼叫重新產生
  };
  params.CheckMacValue = generateCheckMacValue(params, HASH_KEY, HASH_IV);

  const body = new URLSearchParams(params);
  const resp = await fetch(`${AIO_BASE_URL}/Cashier/QueryTradeInfo/V5`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`ECPay QueryTradeInfo HTTP ${resp.status}`);
  }

  const text = await resp.text();
  const result = Object.fromEntries(new URLSearchParams(text));

  if (!result.CheckMacValue || !verifyCheckMacValue(result, HASH_KEY, HASH_IV)) {
    throw new Error('ECPay QueryTradeInfo CheckMacValue 驗證失敗');
  }

  return {
    tradeStatus: result.TradeStatus,
    tradeNo: result.TradeNo,
    paymentType: result.PaymentType,
    tradeAmt: result.TradeAmt,
    paymentDate: result.PaymentDate,
  };
}

module.exports = { buildCheckoutParams, queryTradeInfo };
