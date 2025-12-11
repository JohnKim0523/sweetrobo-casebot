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

async function getProducts(deviceId, type) {
  const params = {
    appid: config.appId,
    device_id: deviceId,
    type: type,
    status: 1,
    page: 1,
    limit: 100,
  };
  params.sign = generateSignature(params);

  const response = await axios.post(config.baseUrl + '/api/openApi/productList', params, { headers: { 'Content-Type': 'application/json' } });
  return response.data;
}

async function main() {
  const deviceId = '9yDO7y9lN288Pc0Wz0hUSg=='; // CT0700059

  console.log('Fetching products for CT0700059...\n');

  // Get default products
  console.log('=== DEFAULT PRODUCTS ===');
  try {
    const defaultProducts = await getProducts(deviceId, 'default');
    if (defaultProducts.data && defaultProducts.data.list) {
      defaultProducts.data.list.forEach(brand => {
        console.log('\nBrand:', brand.name);
        brand.modelList.forEach(model => {
          console.log('  -', model.name_en || model.name, '| Stock:', model.stock, '| ID:', model.product_id);
        });
      });
    } else {
      console.log('No default products found');
    }
  } catch (e) {
    console.log('Error fetching default:', e.message);
  }

  // Get DIY products
  console.log('\n=== DIY PRODUCTS ===');
  try {
    const diyProducts = await getProducts(deviceId, 'diy');
    if (diyProducts.data && diyProducts.data.list) {
      diyProducts.data.list.forEach(brand => {
        console.log('\nBrand:', brand.name);
        brand.modelList.forEach(model => {
          console.log('  -', model.name_en || model.name, '| Stock:', model.stock, '| ID:', model.product_id);
        });
      });
    } else {
      console.log('No DIY products found');
    }
  } catch (e) {
    console.log('Error fetching DIY:', e.message);
  }
}

main().catch(e => console.error('Error:', e.message));
