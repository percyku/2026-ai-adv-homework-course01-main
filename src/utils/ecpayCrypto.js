const crypto = require('crypto');

// ECPay 專用 URL Encode：urlencode -> 轉小寫 -> .NET 特殊字元還原
// Source: .claude/skills/ecpay/guides/13-checkmacvalue.md §Node.js
function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27');
  encoded = encoded.toLowerCase();
  const replacements = {
    '%2d': '-', '%5f': '_', '%2e': '.', '%21': '!',
    '%2a': '*', '%28': '(', '%29': ')',
  };
  for (const [from, to] of Object.entries(replacements)) {
    encoded = encoded.split(from).join(to);
  }
  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIv) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );
  const sorted = Object.keys(filtered)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramStr = sorted.map((k) => `${k}=${filtered[k]}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

function verifyCheckMacValue(params, hashKey, hashIv) {
  const received = params.CheckMacValue || '';
  const calculated = generateCheckMacValue(params, hashKey, hashIv);
  const a = Buffer.from(received);
  const b = Buffer.from(calculated);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { ecpayUrlEncode, generateCheckMacValue, verifyCheckMacValue };
