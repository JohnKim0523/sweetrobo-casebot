const axios = require('axios');
const crypto = require('crypto');

/**
 * Test creating a phone case print order
 * Based on the released API documentation
 */
async function testCreateOrder() {
  console.log('\n' + '='.repeat(70));
  console.log('🖨️ TESTING PHONE CASE PRINT ORDER CREATION');
  console.log('='.repeat(70));

  const config = {
    appId: 'ct0feee2e5ad8b1913',
    appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
    baseUrl: 'https://www.gzchitu.cn'
  };

  // Generate signature
  function generateSignature(params) {
    const data = { ...params };
    delete data.sign;

    const keys = Object.keys(data).sort();
    const signStr = keys.map(key => `${key}=${data[key]}`).join('&');
    const fullSignStr = signStr + '&access_token=' + config.appSecret;

    const hash = crypto.createHash('sha256');
    hash.update(fullSignStr);
    return hash.digest('hex');
  }

  // Order parameters
  const orderParams = {
    appid: config.appId,
    device_id: 'Veg9SyJvSNdW4q3bLS/MuA==',  // CT0700046's encrypted ID from machineList
    product_id: 'dZesWMYqBIuCwV1qr6Ugxw==',  // From API example
    pay_type: 'nayax',  // or 'ict' based on machine config
    image_url: 'https://print-gz.oss-accelerate.aliyuncs.com/20250918005929722424.tif'  // Test TIF image
  };

  // Generate signature
  orderParams.sign = generateSignature(orderParams);

  console.log('\n📤 Creating print order...');
  console.log('Parameters:');
  console.log(`  appid: ${orderParams.appid}`);
  console.log(`  device_id: ${orderParams.device_id} (CT0700046)`);
  console.log(`  product_id: ${orderParams.product_id}`);
  console.log(`  pay_type: ${orderParams.pay_type}`);
  console.log(`  image_url: ${orderParams.image_url}`);
  console.log(`  sign: ${orderParams.sign.substring(0, 20)}...`);

  try {
    // Use multipart/form-data as specified in API docs
    const FormData = require('form-data');
    const formData = new FormData();
    Object.keys(orderParams).forEach(key => {
      formData.append(key, orderParams[key]);
    });

    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineCreateOrder`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 15000,
        validateStatus: () => true
      }
    );

    console.log(`\n📥 Response Status: ${response.status}`);

    if (response.data) {
      console.log('Response Data:', JSON.stringify(response.data, null, 2));

      if (response.data.status === 200) {
        console.log('\n✅ ORDER CREATED SUCCESSFULLY!');
        console.log(`Order ID: ${response.data.data?.result?.orderId}`);
        console.log(`Status: ${response.data.data?.status}`);
        console.log(`Message: ${response.data.msg}`);
      } else if (response.data.msg?.includes('功能开发中')) {
        console.log('\n⚠️ API still under development');
        console.log('The machineCreateOrder API is not yet active');
      } else if (response.data.msg?.includes('机器离线')) {
        console.log('\n⚠️ Machine is offline');
        console.log('Turn on machine CT0700046 to test orders');
      } else if (response.data.msg?.includes('签名错误')) {
        console.log('\n❌ Signature error');
        console.log('Check signature generation algorithm');
      } else {
        console.log('\n⚠️ Order creation failed');
        console.log(`Error: ${response.data.msg}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
    if (error.response?.data) {
      console.log('Error response:', error.response.data);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  console.log('If you see:');
  console.log('- "功能开发中" = API not ready yet');
  console.log('- "机器离线" = Machine needs to be online');
  console.log('- "签名错误" = Signature calculation issue');
  console.log('- Order ID returned = Success! API is working');
  console.log('='.repeat(70) + '\n');
}

// Run test
testCreateOrder().catch(console.error);