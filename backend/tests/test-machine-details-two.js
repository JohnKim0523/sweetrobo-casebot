const axios = require('axios');

// Test the new machineDetailsTwo endpoint
async function testMachineDetailsTwo() {
  console.log('Testing /api/openApi/machineDetailsTwo endpoint\n');

  // Test with different machine codes
  const testCodes = [
    'CT0700026',  // Your original code
    'CT0300026',  // Found in API
    'CT0302763',  // Example from documentation (cotton candy)
  ];

  for (const deviceCode of testCodes) {
    console.log(`\n📱 Testing device_code: ${deviceCode}`);

    const params = {
      appid: 'ct0feee2e5ad8b1913',
      device_code: deviceCode,
      sign: 'b0d57d8da8dd79581911f11f2544c8f5c725bb9f34d732839409a59ec3ac6ad1' // Test signature
    };

    try {
      const response = await axios.post(
        'https://www.gzchitu.cn/api/openApi/machineDetailsTwo',
        params,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      if (response.data.status === 200) {
        const machine = response.data.data?.data;
        console.log(`✅ Found: ${machine.name}`);
        console.log(`   Model: ${machine.machine_model}`);
        console.log(`   Status: ${machine.online_status}`);

        // Check what type of machine it is
        if (machine.machine_model.includes('202')) {
          console.log(`   Type: Cotton Candy Machine`);
          console.log(`   Sugar levels: White=${machine.white_sugar}%, Blue=${machine.blue_sugar}%`);
        } else if (machine.machine_model.includes('sjk')) {
          console.log(`   Type: Phone Case Printer`);
        } else if (machine.machine_model.includes('XG')) {
          console.log(`   Type: Ice Cream/Slush Machine`);
        }
      } else {
        console.log(`❌ Error: ${response.data.msg}`);
      }
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`);
    }
  }
}

testMachineDetailsTwo();