const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const config = {
  baseUrl: process.env.CHITU_API_URL || 'https://www.gzchitu.cn',
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
};

function generateSignature(params) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map(key => key + '=' + paramsWithoutSign[key]).join('&');
  const signString = paramString + '&access_token=' + config.appSecret;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

async function getMachineList() {
  const params = { appid: config.appId, page: 1, limit: 100 };
  params.sign = generateSignature(params);
  const response = await axios.post(
    config.baseUrl + '/api/openApi/machineList',
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

async function uploadQRCode(deviceId, qrcodeUrl) {
  const params = {
    appid: config.appId,
    device_id: deviceId,
    qrcode: qrcodeUrl,
  };
  params.sign = generateSignature(params);

  // Use multipart/form-data as per API documentation
  const formData = new FormData();
  formData.append('appid', params.appid);
  formData.append('device_id', params.device_id);
  formData.append('qrcode', params.qrcode);
  formData.append('sign', params.sign);

  const response = await axios.post(
    config.baseUrl + '/api/openApi/machineQRCode',
    formData,
    { headers: formData.getHeaders() }
  );
  return response.data;
}

async function main() {
  const deviceCodes = process.argv.slice(2);

  if (deviceCodes.length === 0) {
    console.log('Usage: node upload-qr.js <device_code> [device_code2] ...');
    console.log('Example: node upload-qr.js CT0700059');
    console.log('Example: node upload-qr.js CT0700059 CT0700060 CT0700047');
    process.exit(1);
  }

  console.log('Fetching machine list...');
  const machineList = await getMachineList();
  const machines = machineList.data?.list || [];

  for (const deviceCode of deviceCodes) {
    const machine = machines.find(m => m.device_code === deviceCode);

    if (!machine) {
      console.log(`\n❌ ${deviceCode}: Machine not found`);
      continue;
    }

    const qrcodeUrl = 'https://casebot.sweetrobotracking.com/select-model?machineId=' + deviceCode;
    console.log(`\n${deviceCode}:`);
    console.log(`  Device ID: ${machine.device_id}`);
    console.log(`  QR Code: ${qrcodeUrl}`);

    try {
      const result = await uploadQRCode(machine.device_id, qrcodeUrl);
      if (result.status === 200) {
        console.log(`  ✅ SUCCESS`);
      } else {
        console.log(`  ❌ FAILED: ${result.msg}`);
      }
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.response?.data?.msg || error.message}`);
    }
  }
}

main();
