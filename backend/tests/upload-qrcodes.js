/**
 * Script to upload QR codes to all phone case machines
 * Each machine gets a unique URL with its machineId
 */

const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const config = {
  baseUrl: process.env.CHITU_API_URL || 'https://www.gzchitu.cn',
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
};

// Phone case machines to update
const phoneCaseMachines = [
  { device_code: 'CT0700059', device_id: '9yDO7y9lN288Pc0Wz0hUSg==', name: 'phone case print59' },
  { device_code: 'CT0700055', device_id: 'ZvbaTRhuX7lezn2yqXI2Nw==', name: 'phone case print55' },
  { device_code: 'CT0700053', device_id: 'eZkBkSfxkjiXGu2A/rpZ8w==', name: 'phone case print53' },
  { device_code: 'CT0700047', device_id: 'MG1YKh+PMxbunVQbJwvFqA==', name: 'phone case print47' },
  { device_code: 'CT0700046', device_id: '+l9++jK4VI7z2cHdhcoFpw==', name: 'phone case print46' },
  { device_code: 'CT0700026', device_id: 'Veg9SyJvSNdW4q3bLS/MuA==', name: 'phone case print26' },
];

// Base URL for QR codes
const QR_BASE_URL = 'https://casebot.sweetrobtracking.com/select-model';

console.log('='.repeat(60));
console.log('Uploading QR Codes to Phone Case Machines');
console.log('='.repeat(60));
console.log(`App ID: ${config.appId}`);
console.log(`Base URL: ${config.baseUrl}`);
console.log('');

function generateSignature(params) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys
    .map(key => `${key}=${paramsWithoutSign[key]}`)
    .join('&');
  const signString = `${paramString}&access_token=${config.appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

async function uploadQRCode(deviceId, qrcodeUrl) {
  const params = {
    appid: config.appId,
    device_id: deviceId,
    qrcode: qrcodeUrl,
  };
  params.sign = generateSignature(params);

  const response = await axios.post(
    `${config.baseUrl}/api/openApi/machineQRCode`,
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );

  return response.data;
}

async function main() {
  const results = [];

  for (const machine of phoneCaseMachines) {
    const qrcodeUrl = `${QR_BASE_URL}?machineId=${machine.device_code}`;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Machine: ${machine.name} (${machine.device_code})`);
    console.log(`Device ID: ${machine.device_id}`);
    console.log(`QR Code URL: ${qrcodeUrl}`);

    try {
      const result = await uploadQRCode(machine.device_id, qrcodeUrl);

      if (result.status === 200) {
        console.log(`✅ SUCCESS: ${result.msg}`);
        results.push({ machine: machine.device_code, success: true, message: result.msg });
      } else {
        console.log(`❌ FAILED: ${result.msg}`);
        results.push({ machine: machine.device_code, success: false, message: result.msg });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message;
      console.log(`❌ ERROR: ${errorMsg}`);
      results.push({ machine: machine.device_code, success: false, message: errorMsg });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\nTotal: ${results.length} machines`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);

  console.log('\nDetailed Results:');
  console.log('-'.repeat(60));
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.machine}: ${r.message}`);
  });
}

main();
