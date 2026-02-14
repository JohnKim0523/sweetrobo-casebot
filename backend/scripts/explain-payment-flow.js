/**
 * This script demonstrates and explains the complete payment flow
 */

const crypto = require('crypto');
const https = require('https');
require('dotenv').config();

const config = {
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
  defaultPayType: process.env.CHITU_DEFAULT_PAY_TYPE || 'ict',
};

function generateSignature(params, appSecret) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map((key) => `${key}=${paramsWithoutSign[key]}`).join('&');
  const signString = `${paramString}&access_token=${appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

function apiRequest(endpoint, params) {
  return new Promise((resolve, reject) => {
    const fullParams = { appid: config.appId, ...params };
    fullParams.sign = generateSignature(fullParams, config.appSecret);

    const postData = JSON.stringify(fullParams);
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
  console.log(`
${'='.repeat(70)}
HOW PAYMENT CURRENTLY WORKS - COMPLETE EXPLANATION
${'='.repeat(70)}

Your current configuration:
  CHITU_DEFAULT_PAY_TYPE = "${config.defaultPayType}"

This means orders are created with pay_type: "${config.defaultPayType}"
`);

  // Get machine details first
  const machineDetails = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: 'CT0700046',
  });

  const deviceId = machineDetails.data?.data?.device_id;

  console.log(`
${'='.repeat(70)}
STEP 1: ORDER CREATION - What JSON is sent to Chitu API
${'='.repeat(70)}

When you submit an order from the webapp, the backend sends this to Chitu:

POST https://www.gzchitu.cn/api/openApi/machineCreateOrder

Request Body (JSON):
{
  "appid": "${config.appId}",
  "device_id": "${deviceId}",
  "product_id": "dZesWMYqBIuCwV1qr6Ugxw==",        // Phone model ID
  "pay_type": "${config.defaultPayType}",                               // <-- THIS IS THE KEY FIELD
  "image_url": "https://s3.amazonaws.com/.../design.tif",  // Your design
  "sign": "sha256_hash..."
}

THE pay_type FIELD EXPLAINED:
┌─────────────┬──────────────────────────────────────────────────────┐
│ pay_type    │ What it means                                        │
├─────────────┼──────────────────────────────────────────────────────┤
│ "ict"       │ ICT Bill Acceptor - CASH ONLY (bills/coins)          │
│ "nayax"     │ Nayax Terminal - Credit cards, Apple Pay, Google Pay │
│ "vpos"      │ Virtual POS - QR code for mobile payment apps        │
│ "saobei"    │ Saobei (扫呗) - WeChat Pay / Alipay (China)          │
└─────────────┴──────────────────────────────────────────────────────┘

Your current setting "${config.defaultPayType}" means: ${
  config.defaultPayType === 'ict' ? '💵 CASH ONLY - The machine expects paper bills or coins' :
  config.defaultPayType === 'nayax' ? '💳 CREDIT CARDS - Nayax terminal will process the payment' :
  config.defaultPayType === 'vpos' ? '📱 QR CODE - Customer scans QR to pay via mobile' :
  '❓ Unknown payment type'
}
`);

  console.log(`
${'='.repeat(70)}
STEP 2: WHAT HAPPENS AT THE MACHINE
${'='.repeat(70)}

After order is created, the PHYSICAL MACHINE:

1. Receives the order from Chitu servers
2. Displays the design on screen
3. Shows payment screen based on pay_type:

   If pay_type = "ict" (your current setting):
   ┌────────────────────────────────────┐
   │    INSERT CASH TO PAY             │
   │                                    │
   │    Total: $XX.XX                   │
   │                                    │
   │    [Insert bills here ↓]          │
   │    ═══════════════════            │
   │                                    │
   │    Inserted: $0.00                 │
   └────────────────────────────────────┘

   If pay_type = "nayax" (credit card):
   ┌────────────────────────────────────┐
   │    TAP OR INSERT CARD             │
   │                                    │
   │    Total: $XX.XX                   │
   │                                    │
   │    [Card reader terminal]         │
   │    ┌─────────────────┐            │
   │    │ 💳 TAP HERE     │            │
   │    └─────────────────┘            │
   └────────────────────────────────────┘

4. Customer pays at the machine
5. Machine confirms payment
6. Machine starts printing the case
`);

  console.log(`
${'='.repeat(70)}
STEP 3: PAYMENT CONFIRMATION (via MQTT)
${'='.repeat(70)}

When customer pays, the machine sends this message via MQTT:

Topic: ct/platform/{md5_hash_of_machineId}

Message JSON:
{
  "msgType": "orderStatus",
  "machineId": "${machineDetails.data?.data?.machineId || 'DOPLGC9k8sLZXupi9uz5liupq/SxHHuPo2pimPazT/k='}",
  "orderId": "ct176585326524736658",     // Chitu's order ID
  "orderNo": "job_1234567890_abc",        // Your internal job ID
  "status": "paid",                       // Order status
  "payStatus": "paid",                    // Payment confirmed!
  "payType": "${config.defaultPayType}",                        // How they paid
  "amount": 25.99,                        // Amount paid
  "timestamp": 1765853282000
}

Your backend receives this and broadcasts to frontend via WebSocket.
`);

  console.log(`
${'='.repeat(70)}
CURRENT STATE: CAN YOUR MACHINES ACCEPT CREDIT CARDS?
${'='.repeat(70)}
`);

  // Check payment config
  const paymentConfig = await apiRequest('/api/openApi/machineQueryPaymentConfig', {
    device_id: deviceId,
  });

  console.log(`API Check - machineQueryPaymentConfig response:
${JSON.stringify(paymentConfig, null, 2)}

INTERPRETATION:
`);

  if (paymentConfig.msg === '未设置') {
    console.log(`❌ Payment Config: NOT SET (未设置)

This means:
- NO electronic payment terminal is configured in the Chitu system
- The machine might have physical hardware, but it's not linked to the API
- You're likely using cash-only (ICT bill acceptors)

CURRENT SITUATION:
┌────────────────────────────────────────────────────────────────────┐
│ ✅ Cash (bills/coins) - WORKS (if ICT hardware is installed)      │
│ ❌ Credit Cards       - NOT POSSIBLE (no Nayax terminal configured)│
│ ❓ QR/Mobile Payment  - Unknown (needs VPOS configuration)         │
└────────────────────────────────────────────────────────────────────┘
`);
  } else if (paymentConfig.status === 200) {
    console.log(`✅ Payment Config: CONFIGURED
${JSON.stringify(paymentConfig.data, null, 2)}
`);
  }

  console.log(`
${'='.repeat(70)}
TO ACCEPT CREDIT CARDS, YOU NEED:
${'='.repeat(70)}

1. HARDWARE: Nayax payment terminal physically installed on machine
   - This is a separate device that attaches to the machine
   - Costs ~$300-500 per terminal
   - Handles card swipe, chip, and contactless (Apple Pay, etc.)

2. MERCHANT ACCOUNT: Nayax merchant credentials
   - merchant_no: Your Nayax merchant number
   - terminal_id: The specific terminal ID
   - token: API authentication token

3. API CONFIGURATION: Call machinePaymentConfig to link terminal
   POST /api/openApi/machinePaymentConfig
   {
     "appid": "${config.appId}",
     "device_id": "${deviceId}",
     "merchant_no": "YOUR_NAYAX_MERCHANT_NO",
     "terminal_id": "YOUR_TERMINAL_ID",
     "token": "YOUR_NAYAX_TOKEN",
     "sign": "..."
   }

4. UPDATE PAY_TYPE: Change CHITU_DEFAULT_PAY_TYPE to "nayax" in .env

${'='.repeat(70)}
SUMMARY
${'='.repeat(70)}

Q: Does the machine currently accept credit cards?
A: NO - Payment config is not set, and pay_type is "${config.defaultPayType}"

Q: Does the machine accept cash?
A: ${config.defaultPayType === 'ict' ? 'PROBABLY YES - if ICT hardware is installed' : 'Unknown - depends on hardware'}

Q: What's needed for credit cards?
A: Hardware (Nayax terminal) + Merchant account + API configuration

Q: Can this be done in software only?
A: NO - Physical Nayax hardware must be installed on each machine
`);
}

main().catch(console.error);
