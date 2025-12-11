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

async function getMachineByCode(deviceCode) {
  const params = {
    appid: config.appId,
    device_code: deviceCode,
  };
  params.sign = generateSignature(params);

  const response = await axios.post(
    config.baseUrl + '/api/openApi/getMachineDetailByCode',
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

getMachineByCode('CT0700059').then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e.message));
