/**
 * Test if API accepts multiple payment types at once
 */

const crypto = require('crypto');
const https = require('https');
require('dotenv').config();

const config = {
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
};

function generateSignature(params, appSecret) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map((key) => `${key}=${paramsWithoutSign[key]}`).join('&');
  const signString = `${paramString}&access_token=${appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

function apiRequest(endpoint, params) {
  return new Promise((resolve) => {
    const fullParams = { appid: config.appId, ...params };
    fullParams.sign = generateSignature(fullParams, config.appSecret);
    const postData = JSON.stringify(fullParams);

    console.log(`\nTesting pay_type: ${params.pay_type}`);

    const options = {
      hostname: 'www.gzchitu.cn',
      port: 443,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTING MULTIPLE PAYMENT TYPES');
  console.log('='.repeat(60));

  // Get machine details
  const machine = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: 'CT0700046',
  });
  const deviceId = machine.data.data.device_id;
  console.log(`\nDevice ID: ${deviceId}`);

  const testImageUrl = 'https://print-gz.oss-accelerate.aliyuncs.com/20250918005929722424.tif';
  const productId = 'dZesWMYqBIuCwV1qr6Ugxw=='; // Test product

  // Test different multi-payment formats
  const multiPaymentFormats = [
    'ict,vpos',           // Comma separated
    'ict|vpos',           // Pipe separated
    'ict+vpos',           // Plus separated
    'all',                // Maybe "all" is a keyword?
    'multi',              // Maybe "multi"?
    'any',                // Maybe "any"?
    JSON.stringify(['ict', 'vpos']),  // JSON array as string
  ];

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  for (const payType of multiPaymentFormats) {
    const result = await apiRequest('/api/openApi/machineCreateOrder', {
      device_id: deviceId,
      product_id: productId,
      pay_type: payType,
      image_url: testImageUrl,
    });

    const status = result.status;
    const msg = result.msg;

    // Check if error is about payment type or something else (like stock)
    const isPaymentError = msg?.includes('支付') || msg?.includes('pay');
    const isStockError = msg?.includes('库存');
    const isParamError = msg?.includes('参数');

    let interpretation = '';
    if (status === 200) {
      interpretation = '✅ ACCEPTED!';
    } else if (isStockError) {
      interpretation = '⚠️ Stock error (payment type accepted)';
    } else if (isPaymentError || isParamError) {
      interpretation = '❌ Payment type rejected';
    } else {
      interpretation = `❓ ${msg}`;
    }

    console.log(`  "${payType}": ${status} - ${msg} → ${interpretation}`);

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('CONCLUSION');
  console.log('='.repeat(60));
  console.log(`
If any format shows "Stock error" instead of "Payment type rejected",
it means the API accepts that format for multi-payment.

Otherwise, multi-payment needs to be:
1. A machine setting (configured in admin portal)
2. Or ask Chitu if there's a special pay_type value
`);
}

main().catch(console.error);
