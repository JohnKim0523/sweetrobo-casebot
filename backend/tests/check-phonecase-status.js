const axios = require('axios');
const crypto = require('crypto');

/**
 * Check Phone Case Printer Status
 * Following the exact cotton candy machine integration pattern
 */
async function checkPhoneCaseStatus() {
  console.log('\n' + '='.repeat(70));
  console.log('📱 PHONE CASE PRINTER (CT0700046) STATUS CHECK');
  console.log('='.repeat(70));

  const config = {
    appId: 'ct0feee2e5ad8b1913',
    appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
    baseUrl: 'https://www.gzchitu.cn/api/openApi',
    machineCode: 'CT0700046'
  };

  // Generate signature following EXACT cotton candy pattern
  function generateSignature(params) {
    // Remove sign if exists
    const data = { ...params };
    delete data.sign;

    // 1. Sort alphabetically
    const keys = Object.keys(data).sort();

    // 2. Create query string
    const signStr = keys.map(key => `${key}=${data[key]}`).join('&');

    // 3. Append access_token
    const fullSignStr = signStr + '&access_token=' + config.appSecret;

    // 4. Generate SHA256
    const hash = crypto.createHash('sha256');
    hash.update(fullSignStr);

    // 5. Return hex
    return hash.digest('hex');
  }

  // Make API request
  async function apiRequest(endpoint, params) {
    params.appid = config.appId;
    params.sign = generateSignature(params);

    console.log(`\n📤 Request to ${endpoint}`);
    console.log(`   Parameters: ${JSON.stringify(params, null, 2)}`);

    try {
      const response = await axios.post(
        `${config.baseUrl}${endpoint}`,
        params,
        {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      console.log(`   Status: ${response.status}`);
      return response.data;
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      return null;
    }
  }

  // STEP 1: Check Machine List
  console.log('\n' + '-'.repeat(70));
  console.log('STEP 1: Checking if machine is in your list');
  console.log('-'.repeat(70));

  const listResponse = await apiRequest('/machineList', {
    page: 1,
    limit: 100
  });

  let machineInList = false;
  if (listResponse && listResponse.status === 200) {
    const machines = listResponse.data?.list || [];
    console.log(`\n✅ API call successful. Found ${machines.length} machine(s)`);

    const ourMachine = machines.find(m => m.device_code === config.machineCode);

    if (ourMachine) {
      machineInList = true;
      console.log(`\n🎉 MACHINE FOUND IN YOUR LIST!`);
      console.log(`   Name: ${ourMachine.name}`);
      console.log(`   Status: ${ourMachine.online_status}`);
      console.log(`   Model: ${ourMachine.machine_model}`);
      console.log(`   Device ID: ${ourMachine.device_id}`);
    } else {
      console.log(`\n⚠️ Machine ${config.machineCode} NOT in your list`);

      if (machines.length > 0) {
        console.log('\nMachines in your account:');
        machines.forEach(m => {
          console.log(`   - ${m.device_code}: ${m.name} (${m.online_status})`);
        });
      }
    }
  } else {
    console.log('\n❌ Failed to get machine list');
    if (listResponse) {
      console.log(`   Error: ${JSON.stringify(listResponse, null, 2)}`);
    }
  }

  // STEP 2: Check Machine Details Directly
  console.log('\n' + '-'.repeat(70));
  console.log('STEP 2: Checking machine details directly');
  console.log('-'.repeat(70));

  const detailsResponse = await apiRequest('/machineDetailsTwo', {
    device_code: config.machineCode
  });

  if (detailsResponse && detailsResponse.status === 200) {
    const machine = detailsResponse.data?.data;
    if (machine) {
      console.log('\n✅ Machine details accessible:');
      console.log(`   Name: ${machine.name}`);
      console.log(`   Model: ${machine.machine_model}`);
      console.log(`   Status: ${machine.online_status}`);
      console.log(`   Merchant ID: ${machine.mer_id}`);

      console.log('\n   Ink Levels:');
      console.log(`   - Cyan: ${machine.white_sugar || 0}%`);
      console.log(`   - Magenta: ${machine.blue_sugar || 0}%`);
      console.log(`   - Yellow: ${machine.yellow_sugar || 0}%`);
      console.log(`   - Black: ${machine.red_sugar || 0}%`);
    }
  } else {
    console.log('\n❌ Cannot access machine details');
    if (detailsResponse) {
      console.log(`   Response: ${JSON.stringify(detailsResponse, null, 2)}`);
    }
  }

  // STEP 3: Diagnosis and Next Steps
  console.log('\n' + '='.repeat(70));
  console.log('📋 DIAGNOSIS & NEXT STEPS');
  console.log('='.repeat(70));

  if (!machineInList) {
    console.log('\n❗ MACHINE NOT BOUND TO YOUR ACCOUNT\n');
    console.log('The machine exists in Chitu\'s system but is not linked to your appId.');
    console.log('\nRequired Actions:');
    console.log('1. Contact Chitu support (customer service or technical support)');
    console.log('2. Provide them with:');
    console.log(`   - Your App ID: ${config.appId}`);
    console.log(`   - Machine Code: ${config.machineCode}`);
    console.log('3. Request: "Please bind machine CT0700046 to our appId"');
    console.log('4. They may ask for merchant verification');
    console.log('\nAlternatively:');
    console.log('- Check if there\'s a merchant portal at www.gzchitu.cn');
    console.log('- Look for "Add Machine" or "Bind Machine" option');
    console.log('- The process should be similar to cotton candy machine setup');
  } else if (detailsResponse?.data?.data?.online_status === 'offline') {
    console.log('\n⚠️ MACHINE IS BOUND BUT OFFLINE\n');
    console.log('Required Actions:');
    console.log('1. Ensure machine is powered ON');
    console.log('2. Check internet connection');
    console.log('3. Verify network settings on the machine');
    console.log('4. May need to restart the machine');
  } else if (machineInList) {
    console.log('\n✅ MACHINE IS READY!\n');
    console.log('The machine is properly bound and accessible.');
    console.log('You can now:');
    console.log('1. Send print jobs');
    console.log('2. Monitor status');
    console.log('3. Check ink levels');
  }

  console.log('\n' + '='.repeat(70));
  console.log('Chinese Support Message Translation:');
  console.log('"开发对接流程你们应该按照棉花糖机器一样进行就可以了"');
  console.log('→ "The development integration process should be the same as the cotton candy machine"');
  console.log('\nThis confirms you should use the same API endpoints and signature method.');
  console.log('='.repeat(70) + '\n');
}

// Run the check
checkPhoneCaseStatus().catch(console.error);