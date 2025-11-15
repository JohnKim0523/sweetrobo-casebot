const axios = require('axios');

// Test with the signatures the API expects
async function testWithExpectedSignatures() {
  console.log('Testing with expected signatures from error messages\n');

  // Each machine code expects a different signature
  const tests = [
    {
      device_code: 'CT0700046',
      sign: 'fed77c49526f543a9085b725af8b3537580e12d3334284bb013b9a915528e907'
    },
    {
      device_code: 'CT0300026',
      sign: '8d9aad030c40641ab3098c4676245a1cb0d1a0d7558be5244af173cd0fea61b0'
    },
    {
      device_code: 'CT0302763',
      sign: '0e5292a61ce5756fde2b889e0e88b0c35d69c8d9337507f5b8b3bb78b62bd17c'
    }
  ];

  for (const test of tests) {
    console.log(`\n📱 Testing device_code: ${test.device_code}`);

    const params = {
      appid: 'ct0feee2e5ad8b1913',
      device_code: test.device_code,
      sign: test.sign
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
        console.log(`✅ MACHINE FOUND!`);
        console.log(`   Name: ${machine.name}`);
        console.log(`   Model: ${machine.machine_model}`);
        console.log(`   Status: ${machine.online_status}`);
        console.log(`   Address: ${machine.address || 'N/A'}`);

        // Identify machine type
        if (machine.machine_model.includes('202')) {
          console.log(`   Type: COTTON CANDY MACHINE`);
          if (machine.white_sugar) {
            console.log(`   Sugar inventory:`);
            console.log(`     - White: ${machine.white_sugar}%`);
            console.log(`     - Blue: ${machine.blue_sugar}%`);
            console.log(`     - Yellow: ${machine.yellow_sugar}%`);
            console.log(`     - Red: ${machine.red_sugar}%`);
          }
        } else if (machine.machine_model.includes('sjk')) {
          console.log(`   Type: PHONE CASE PRINTER`);
          // Check for ink levels if available
          if (machine.white_sugar !== undefined) {
            console.log(`   Ink levels (using sugar fields):`);
            console.log(`     - Cyan: ${machine.white_sugar}`);
            console.log(`     - Magenta: ${machine.blue_sugar}`);
            console.log(`     - Yellow: ${machine.yellow_sugar}`);
            console.log(`     - Black: ${machine.red_sugar}`);
          }
        } else if (machine.machine_model.includes('XG')) {
          console.log(`   Type: ICE CREAM/SLUSH MACHINE`);
        } else {
          console.log(`   Type: Unknown (${machine.machine_model})`);
        }
      } else {
        console.log(`❌ Error: ${response.data.msg}`);
        console.log(`   This machine code may not exist or is not accessible`);
      }
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY:');
  console.log('Testing complete. Check results above to see which machines exist.');
  console.log('='.repeat(60));
}

testWithExpectedSignatures();