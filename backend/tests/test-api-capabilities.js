const axios = require('axios');

// Test what APIs are actually available and working
async function testAPICapabilities() {
  console.log('🔍 TESTING API CAPABILITIES\n');
  console.log('=' .repeat(60));

  const config = {
    appId: 'ct0feee2e5ad8b1913',
    baseUrl: 'https://www.gzchitu.cn'
  };

  // List of all possible API endpoints to test
  const endpoints = [
    // Machine Management
    { path: '/api/openApi/machineList', desc: 'List all machines' },
    { path: '/api/openApi/machineDetails', desc: 'Machine details (encrypted ID)' },
    { path: '/api/openApi/machineDetailsTwo', desc: 'Machine details (device code)' },
    { path: '/api/openApi/machineStatus', desc: 'Machine status' },

    // Order Management
    { path: '/api/openApi/machineCreateOrder', desc: 'Create order' },
    { path: '/api/openApi/machineOrderList', desc: 'List orders' },
    { path: '/api/openApi/orderStatus', desc: 'Order status' },
    { path: '/api/openApi/cancelOrder', desc: 'Cancel order' },

    // File/Image Management
    { path: '/api/openApi/uploadFile', desc: 'Upload file' },
    { path: '/api/openApi/uploadImage', desc: 'Upload image' },
    { path: '/api/openApi/machineQRCode', desc: 'Upload QR code' },

    // Product Management
    { path: '/api/openApi/productList', desc: 'Product list' },
    { path: '/api/openApi/productDetails', desc: 'Product details' },
    { path: '/api/openApi/updatePrice', desc: 'Update price' },

    // Payment
    { path: '/api/openApi/paymentMethods', desc: 'Payment methods' },
    { path: '/api/openApi/refund', desc: 'Process refund' },

    // Statistics
    { path: '/api/openApi/statistics', desc: 'Statistics' },
    { path: '/api/openApi/salesReport', desc: 'Sales report' },

    // MQTT/Realtime
    { path: '/api/openApi/mqttConfig', desc: 'MQTT configuration' },
    { path: '/api/openApi/subscribe', desc: 'Subscribe to updates' }
  ];

  console.log('Testing ' + endpoints.length + ' endpoints...\n');

  const results = {
    working: [],
    auth_required: [],
    not_found: [],
    under_development: []
  };

  for (const endpoint of endpoints) {
    process.stdout.write(`Testing ${endpoint.desc}...`);

    const params = {
      appid: config.appId,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      nonce_str: 'test',
      sign: 'b0d57d8da8dd79581911f11f2544c8f5c725bb9f34d732839409a59ec3ac6ad1'
    };

    try {
      const response = await axios.post(
        `${config.baseUrl}${endpoint.path}`,
        params,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
          validateStatus: () => true
        }
      );

      if (response.status === 404) {
        process.stdout.write(' ❌ Not Found\n');
        results.not_found.push(endpoint.path);
      } else if (response.data?.status === 200) {
        process.stdout.write(' ✅ Working\n');
        results.working.push(endpoint.path);
      } else if (response.data?.msg === '功能开发中...') {
        process.stdout.write(' 🚧 Under Development\n');
        results.under_development.push(endpoint.path);
      } else if (response.data?.msg && response.data.msg.includes('签名错误')) {
        process.stdout.write(' 🔐 Exists (needs auth)\n');
        results.auth_required.push(endpoint.path);
      } else {
        process.stdout.write(` ⚠️ ${response.data?.msg || 'Unknown'}\n`);
      }
    } catch (error) {
      process.stdout.write(' ❌ Error\n');
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('📊 API CAPABILITY SUMMARY\n');

  console.log(`✅ Working APIs (${results.working.length}):`);
  results.working.forEach(api => console.log(`   ${api}`));

  console.log(`\n🔐 Exist but need proper auth (${results.auth_required.length}):`);
  results.auth_required.forEach(api => console.log(`   ${api}`));

  console.log(`\n🚧 Under Development (${results.under_development.length}):`);
  results.under_development.forEach(api => console.log(`   ${api}`));

  console.log(`\n❌ Not Found (${results.not_found.length}):`);
  results.not_found.forEach(api => console.log(`   ${api}`));

  console.log('\n' + '=' .repeat(60));
}

testAPICapabilities();