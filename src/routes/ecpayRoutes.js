const express = require('express');
const db = require('../database');
const { verifyCheckMacValue } = require('../utils/ecpayCrypto');

const router = express.Router();

const HASH_KEY = process.env.ECPAY_HASH_KEY;
const HASH_IV = process.env.ECPAY_HASH_IV;

/**
 * @openapi
 * /api/ecpay/notify:
 *   post:
 *     summary: 接收綠界 ECPay AIO 付款結果通知（Server-to-Server）
 *     description: >
 *       本機開發環境無法對外公開，綠界永遠打不到這支路由，實際確認流程改由前端主動呼叫
 *       POST /api/orders/{id}/confirm-payment 查詢。此路由僅為未來部署到公開網域時的完整實作。
 *     tags: [Ecpay]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             description: 綠界回傳欄位（含 MerchantTradeNo、RtnCode、TradeNo、PaymentType、CheckMacValue 等）
 *     responses:
 *       200:
 *         description: 一律回應純文字 1|OK（即使 CheckMacValue 驗證失敗也要回，避免綠界持續重試）
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: 1|OK
 */
router.post('/notify', (req, res) => {
  const params = req.body;

  if (!verifyCheckMacValue(params, HASH_KEY, HASH_IV)) {
    console.error('[ECPay] notify CheckMacValue 驗證失敗');
    return res.type('text/plain').send('1|OK');
  }

  const order = db.prepare('SELECT * FROM orders WHERE merchant_trade_no = ?').get(params.MerchantTradeNo);
  if (order && order.status !== 'paid') {
    if (params.RtnCode === '1') {
      db.prepare(
        `UPDATE orders SET status = 'paid', ecpay_trade_no = ?, payment_method = ?, paid_at = datetime('now')
         WHERE id = ?`
      ).run(params.TradeNo, params.PaymentType, order.id);
    } else {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('failed', order.id);
    }
  }

  res.type('text/plain').send('1|OK');
});

module.exports = router;
