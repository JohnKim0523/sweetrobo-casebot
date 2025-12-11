/**
 * Script to fetch all machines registered under the Chitu appID
 */

const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const config = {
  baseUrl: process.env.CHITU_API_URL || 'https://www.gzchitu.cn',
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
};

console.log('='.repeat(60));
console.log('Fetching All Machines from Chitu API');
console.log('='.repeat(60));
console.log(`App ID: ${config.appId}`);
console.log(`Base URL: ${config.baseUrl}`);
console.log('');

function generateSignature(params) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys
    .map(key => `${key}=${paramsWithoutSign[key]}`)
    .join('&');
  const signString = `${paramString}&access_token=${config.appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

async function getMachineList(page = 1, limit = 100) {
  const params = {
    appid: config.appId,
    page,
    limit,
  };
  params.sign = generateSignature(params);

  console.log(`Fetching page ${page} (limit: ${limit})...`);

  const response = await axios.post(
    `${config.baseUrl}/api/openApi/machineList`,
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );

  return response.data;
}

async function getMachineDetails(deviceId) {
  const params = {
    appid: config.appId,
    device_id: deviceId,
  };
  params.sign = generateSignature(params);

  const response = await axios.post(
    `${config.baseUrl}/api/openApi/machineDetails`,
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );

  return response.data;
}

async function main() {
  try {
    // Fetch all machines (using high limit to get all at once)
    const result = await getMachineList(1, 100);

    if (result.status !== 200) {
      console.error('API Error:', result.msg);
      return;
    }

    const machines = result.data?.list || [];
    console.log(`\nTotal machines found: ${machines.length}`);
    console.log('='.repeat(60));

    if (machines.length === 0) {
      console.log('No machines registered under this appID');
      return;
    }

    // Display all machines in a table format
    console.log('\nMachine List:');
    console.log('-'.repeat(100));
    console.log(
      'Device Code'.padEnd(15) +
      'Name'.padEnd(30) +
      'Model'.padEnd(15) +
      'Status'.padEnd(10) +
      'Device ID (encrypted)'
    );
    console.log('-'.repeat(100));

    for (const machine of machines) {
      const status = machine.online_status === 'online' ? 'ONLINE' : 'offline';
      console.log(
        (machine.device_code || 'N/A').padEnd(15) +
        (machine.name || 'N/A').substring(0, 28).padEnd(30) +
        (machine.machine_model || 'N/A').padEnd(15) +
        status.padEnd(10) +
        (machine.device_id || 'N/A')
      );
    }

    console.log('-'.repeat(100));

    // Output as JSON for easy copy-paste
    console.log('\n\nJSON Output (for programmatic use):');
    console.log(JSON.stringify(machines.map(m => ({
      device_code: m.device_code,
      device_id: m.device_id,
      name: m.name,
      machine_model: m.machine_model,
      online_status: m.online_status,
    })), null, 2));

    // Summary
    console.log('\n\nSummary:');
    console.log(`- Total machines: ${machines.length}`);
    console.log(`- Online: ${machines.filter(m => m.online_status === 'online').length}`);
    console.log(`- Offline: ${machines.filter(m => m.online_status !== 'online').length}`);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

main();
