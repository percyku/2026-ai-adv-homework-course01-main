const { generateCheckMacValue, verifyCheckMacValue } = require('../src/utils/ecpayCrypto');

describe('ECPay CheckMacValue', () => {
  const HASH_KEY = 'pwFHCqoQZGmho4w6';
  const HASH_IV = 'EkRm7iFT261dpevs';

  // 測試向量來源：.claude/skills/ecpay/guides/13-checkmacvalue.md §SHA256 測試向量
  it('matches the official SHA256 test vector', () => {
    const params = {
      MerchantID: '3002607',
      MerchantTradeNo: 'Test1234567890',
      MerchantTradeDate: '2025/01/01 12:00:00',
      PaymentType: 'aio',
      TotalAmount: '100',
      TradeDesc: '測試',
      ItemName: '測試商品',
      ReturnURL: 'https://example.com/notify',
      ChoosePayment: 'ALL',
      EncryptType: '1',
    };

    const result = generateCheckMacValue(params, HASH_KEY, HASH_IV);

    expect(result).toBe('291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2');
  });

  it('verifies a matching CheckMacValue', () => {
    const params = {
      MerchantID: '3002607',
      ItemName: "Tom's Shop",
      TotalAmount: '100',
    };
    params.CheckMacValue = generateCheckMacValue(params, HASH_KEY, HASH_IV);

    expect(verifyCheckMacValue(params, HASH_KEY, HASH_IV)).toBe(true);
  });

  it('rejects a tampered CheckMacValue', () => {
    const params = {
      MerchantID: '3002607',
      TotalAmount: '100',
      CheckMacValue: 'NOT_A_VALID_HASH',
    };

    expect(verifyCheckMacValue(params, HASH_KEY, HASH_IV)).toBe(false);
  });
});
