const crypto = require('crypto');
const axios = require('axios');
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

async function uploadQRCode(deviceId, qrcodeUrl) {
  const params = {
    appid: config.appId,
    device_id: deviceId,
    qrcode: qrcodeUrl,
  };
  params.sign = generateSignature(params);

  const response = await axios.post(
    config.baseUrl + '/api/openApi/machineQRCode',
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );

  return response.data;
}

async function main() {
  const deviceId = '9yDO7y9lN288Pc0Wz0hUSg==';
  const deviceCode = 'CT0700059';
  const qrcodeUrl = 'https://casebot.sweetrobotracking.com/select-model?machineId=' + deviceCode;

  console.log('Uploading QR code for CT0700059');
  console.log('Device ID:', deviceId);
  console.log('QR Code URL:', qrcodeUrl);

  try {
    const result = await uploadQRCode(deviceId, qrcodeUrl);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.status === 200) {
      console.log('✅ SUCCESS!');
    } else {
      console.log('❌ FAILED:', result.msg);
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

main();
