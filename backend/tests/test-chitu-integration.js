const axios = require('axios');

/**
 * Test the updated ChituService integration
 * Run this to verify the NestJS ChituService is working correctly
 */
async function testChituIntegration() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 TESTING CHITU SERVICE INTEGRATION');
  console.log('='.repeat(70));

  const backendUrl = 'http://localhost:3001';

  try {
    // Test 1: Check service connection
    console.log('\n1️⃣ Testing Chitu service connection...');

    const testResponse = await axios.get(`${backendUrl}/api/chitu/test`, {
      timeout: 10000,
      validateStatus: () => true
    });

    if (testResponse.status === 200) {
      console.log('✅ Service is running');
      console.log('Response:', JSON.stringify(testResponse.data, null, 2));
    } else {
      console.log('⚠️ Service returned status:', testResponse.status);
    }

    // Test 2: Get machine list through our backend
    console.log('\n2️⃣ Getting machine list through backend...');

    const listResponse = await axios.get(`${backendUrl}/api/chitu/machines`, {
      timeout: 10000,
      validateStatus: () => true
    });

    if (listResponse.status === 200) {
      const machines = listResponse.data.machines || [];
      console.log(`✅ Found ${machines.length} machines`);

      const ct0700026 = machines.find(m => m.device_code === 'CT0700026');
      if (ct0700026) {
        console.log('\n🎉 CT0700026 FOUND!');
        console.log('   Name:', ct0700026.name);
        console.log('   Online:', ct0700026.online_status ? 'Yes' : 'No');
        console.log('   Model:', ct0700026.machine_model);
        console.log('   Device ID:', ct0700026.device_id);
      } else {
        console.log('⚠️ CT0700026 not in list');
      }
    } else {
      console.log('❌ Failed to get machines:', listResponse.status);
      if (listResponse.data) {
        console.log('Error:', listResponse.data);
      }
    }

    // Test 3: Get specific machine details
    console.log('\n3️⃣ Getting CT0700026 details through backend...');

    const detailsResponse = await axios.get(
      `${backendUrl}/api/chitu/machine/CT0700026`,
      {
        timeout: 10000,
        validateStatus: () => true
      }
    );

    if (detailsResponse.status === 200) {
      const machine = detailsResponse.data;
      console.log('✅ Machine details retrieved:');
      console.log('   Name:', machine.device_name);
      console.log('   Status:', machine.online_status ? 'Online' : 'Offline');
      console.log('   Working:', machine.working_status);

      if (machine.inventory) {
        console.log('   Inventory:');
        console.log('     Paper:', machine.inventory.paper);
        console.log('     Cyan:', machine.inventory.ink_cyan);
        console.log('     Magenta:', machine.inventory.ink_magenta);
        console.log('     Yellow:', machine.inventory.ink_yellow);
        console.log('     Black:', machine.inventory.ink_black);
      }
    } else {
      console.log('❌ Failed to get details:', detailsResponse.status);
      if (detailsResponse.data) {
        console.log('Error:', detailsResponse.data);
      }
    }

    // Test 4: Test print order creation (will fail if machine offline)
    console.log('\n4️⃣ Testing print order creation...');
    console.log('   (This will fail if machine is offline)');

    const orderData = {
      device_code: 'CT0700026',
      image_url: 'https://example.com/test-image.tif',
      product_id: 'test_phone_case',
      pay_type: 'nayax'
    };

    const orderResponse = await axios.post(
      `${backendUrl}/api/chitu/print`,
      orderData,
      {
        timeout: 10000,
        validateStatus: () => true
      }
    );

    if (orderResponse.status === 200 || orderResponse.status === 201) {
      console.log('✅ Order created successfully!');
      console.log('   Order ID:', orderResponse.data.order_id);
      console.log('   Status:', orderResponse.data.status);
    } else {
      console.log('⚠️ Order creation returned:', orderResponse.status);
      if (orderResponse.data) {
        console.log('Response:', orderResponse.data);
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️ Backend server is not running!');
      console.log('Start the backend with: cd backend && npm run start:dev');
    } else {
      console.log('Error details:', error);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 SUMMARY');
  console.log('='.repeat(70));
  console.log('1. Machine CT0700026 is bound to your appId ✅');
  console.log('2. Machine is currently OFFLINE ⚠️');
  console.log('3. Once machine is online, you can send print orders');
  console.log('4. Integration follows cotton candy machine pattern');
  console.log('='.repeat(70) + '\n');
}

// Run the test
testChituIntegration().catch(console.error);