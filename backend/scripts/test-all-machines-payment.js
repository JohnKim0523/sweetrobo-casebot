/**
 * Test all known machines for payment capabilities
 */

const crypto = require('crypto');
const https = require('https');

require('dotenv').config();

const config = {
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
};

// Known machines from various contexts
const MACHINES_TO_TEST = [
  'CT0700046',  // From .env
  'CT0700055',  // Mentioned in conversation
  'CT0700047',  // Common pattern
];

function generateSignature(params, appSecret) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map((key) => `${key}=${paramsWithoutSign[key]}`).join('&');
  const signString = `${paramString}&access_token=${appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

function apiRequest(endpoint, params) {
  return new Promise((resolve, reject) => {
    const fullParams = {
      appid: config.appId,
      ...params,
    };
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'parse_error', raw: data });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.write(postData);
    req.end();
  });
}

async function testMachine(deviceCode) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing Machine: ${deviceCode}`);
  console.log('='.repeat(50));

  // Get machine details
  const details = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: deviceCode,
  });

  if (details.status !== 200) {
    console.log(`❌ Failed to get details: ${details.msg}`);
    return null;
  }

  const machine = details.data.data;
  console.log(`✅ Machine found: ${machine.name}`);
  console.log(`   Model: ${machine.machine_model}`);
  console.log(`   Status: ${machine.online_status}`);
  console.log(`   Device ID: ${machine.device_id}`);
  console.log(`   Shopping Mode: ${machine.shopping_mode}`);
  console.log(`   Coin Inventory: ${machine.coin_inventory}`);

  // Query payment config
  const paymentConfig = await apiRequest('/api/openApi/machineQueryPaymentConfig', {
    device_id: machine.device_id,
  });

  console.log(`\n   Payment Config Status: ${paymentConfig.status}`);
  console.log(`   Payment Config Message: ${paymentConfig.msg}`);

  if (paymentConfig.status === 200 && paymentConfig.data) {
    console.log(`   Payment Config Data: ${JSON.stringify(paymentConfig.data, null, 2)}`);
  }

  return {
    deviceCode,
    name: machine.name,
    model: machine.machine_model,
    status: machine.online_status,
    deviceId: machine.device_id,
    machineId: machine.machineId,
    shoppingMode: machine.shopping_mode,
    coinInventory: machine.coin_inventory,
    paymentConfigured: paymentConfig.status === 200,
    paymentConfigMsg: paymentConfig.msg,
    paymentData: paymentConfig.data || null,
  };
}

async function main() {
  console.log('TESTING ALL MACHINES FOR PAYMENT CAPABILITIES');
  console.log(`App ID: ${config.appId}`);

  const results = [];

  for (const machine of MACHINES_TO_TEST) {
    const result = await testMachine(machine);
    if (result) {
      results.push(result);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));

  console.log('\n| Machine | Model | Status | Payment Configured |');
  console.log('|---------|-------|--------|-------------------|');
  for (const r of results) {
    const payStatus = r.paymentConfigured ? '✅ Yes' : `❌ ${r.paymentConfigMsg}`;
    console.log(`| ${r.deviceCode} | ${r.model} | ${r.status} | ${payStatus} |`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('CONCLUSION');
  console.log('='.repeat(60));

  const configuredMachines = results.filter(r => r.paymentConfigured);
  const unconfiguredMachines = results.filter(r => !r.paymentConfigured);

  if (configuredMachines.length > 0) {
    console.log('\n✅ Machines WITH payment configuration:');
    for (const m of configuredMachines) {
      console.log(`   - ${m.deviceCode}: ${JSON.stringify(m.paymentData)}`);
    }
  }

  if (unconfiguredMachines.length > 0) {
    console.log('\n❌ Machines WITHOUT payment configuration:');
    for (const m of unconfiguredMachines) {
      console.log(`   - ${m.deviceCode}: ${m.paymentConfigMsg}`);
    }
  }

  console.log(`
WHAT THIS MEANS:

1. Payment Config "未设置" (Not Set) means:
   - No electronic payment terminal is configured via the Chitu API
   - The machine MIGHT still have physical hardware (ICT bill acceptor, Nayax terminal)
   - But it hasn't been linked to the Chitu platform for tracking

2. To accept credit cards, you need:
   a) Hardware: A Nayax payment terminal physically installed on the machine
   b) Merchant Account: Nayax merchant credentials
   c) Configuration: Use /api/openApi/machinePaymentConfig to link the terminal

3. Current Default Pay Type in your .env: ${process.env.CHITU_DEFAULT_PAY_TYPE || 'not set'}
   - 'ict' = Bill acceptor (cash only)
   - 'nayax' = Nayax terminal (credit cards, contactless)
   - 'vpos' = Virtual POS (QR codes for mobile payment)

RECOMMENDED ACTION:
Contact Chitu support to clarify:
1. Does the CT-sjk380 machine support Nayax terminals?
2. What hardware modifications are needed?
3. How to obtain Nayax merchant credentials?
`);
}

main().catch(console.error);
