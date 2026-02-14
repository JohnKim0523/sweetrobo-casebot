/**
 * Test script to query machine payment capabilities
 * This script queries both the MQTT service and the API to determine
 * what payment methods are available on the machines.
 */

const crypto = require('crypto');
const mqtt = require('mqtt');
const https = require('https');
const querystring = require('querystring');

// Load environment variables
require('dotenv').config();

const config = {
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
  mqttBroker: process.env.CHITU_MQTT_BROKER,
  mqttPassword: process.env.CHITU_MQTT_PASSWORD,
  apiUrl: process.env.CHITU_API_URL || 'https://www.gzchitu.cn',
  machines: (process.env.AVAILABLE_MACHINES || 'CT0700046').split(','),
};

console.log('='.repeat(60));
console.log('PAYMENT CAPABILITIES TEST');
console.log('='.repeat(60));
console.log(`App ID: ${config.appId}`);
console.log(`Machines to test: ${config.machines.join(', ')}`);
console.log('');

// ============================================
// PART 1: Query via MQTT
// ============================================

function queryViaMQTT(machineId, deviceId) {
  return new Promise((resolve, reject) => {
    console.log(`\n[MQTT] Querying machine info for ${machineId}...`);

    const clientId = 'test_' + Math.random().toString(16).substr(2, 8);
    const host = `wss://${config.mqttBroker}`;

    // Create MD5 hash of deviceId for subscription topic
    const md5Hash = crypto.createHash('md5').update(deviceId).digest('hex');
    const subscribeTopic = `ct/platform/${md5Hash}`;
    const publishTopic = 'ct/machine/common';

    console.log(`   Subscribe topic: ${subscribeTopic}`);
    console.log(`   Publish topic: ${publishTopic}`);

    const client = mqtt.connect(host, {
      clientId: clientId,
      password: config.mqttPassword,
      connectTimeout: 10000,
      reconnectPeriod: 0, // Don't auto-reconnect
    });

    let timeout = setTimeout(() => {
      console.log(`   [MQTT] Timeout - no response received`);
      client.end();
      resolve({ success: false, error: 'timeout' });
    }, 15000);

    client.on('connect', () => {
      console.log(`   [MQTT] Connected as ${clientId}`);

      client.subscribe(subscribeTopic, (err) => {
        if (err) {
          console.log(`   [MQTT] Subscribe error: ${err.message}`);
          clearTimeout(timeout);
          client.end();
          resolve({ success: false, error: err.message });
          return;
        }

        console.log(`   [MQTT] Subscribed, sending machineInfo request...`);

        // Send the machineInfo request
        const message = JSON.stringify({
          data: {
            msgType: 'machineInfo',
            machineId: deviceId
          }
        });

        client.publish(publishTopic, message, (err) => {
          if (err) {
            console.log(`   [MQTT] Publish error: ${err.message}`);
          } else {
            console.log(`   [MQTT] Request sent, waiting for response...`);
          }
        });
      });
    });

    client.on('message', (topic, message) => {
      clearTimeout(timeout);
      try {
        const data = JSON.parse(message.toString());
        console.log(`   [MQTT] Received response:`);
        console.log(JSON.stringify(data, null, 2));
        client.end();
        resolve({ success: true, data });
      } catch (e) {
        console.log(`   [MQTT] Parse error: ${e.message}`);
        console.log(`   Raw message: ${message.toString()}`);
        client.end();
        resolve({ success: false, error: 'parse_error', raw: message.toString() });
      }
    });

    client.on('error', (err) => {
      console.log(`   [MQTT] Error: ${err.message}`);
      clearTimeout(timeout);
      client.end();
      resolve({ success: false, error: err.message });
    });
  });
}

// ============================================
// PART 2: Query via API
// ============================================

function generateSign(params, appSecret) {
  // Sort keys alphabetically and create query string
  const sortedKeys = Object.keys(params).sort();
  const queryParts = sortedKeys.map(key => `${key}=${params[key]}`);
  const queryString = queryParts.join('&') + `&access_token=${appSecret}`;

  // SHA256 hash
  return crypto.createHash('sha256').update(queryString).digest('hex');
}

function apiRequest(endpoint, params) {
  return new Promise((resolve, reject) => {
    const fullParams = {
      appid: config.appId,
      ...params,
    };
    fullParams.sign = generateSign(fullParams, config.appSecret);

    const postData = querystring.stringify(fullParams);

    const url = new URL(endpoint, config.apiUrl);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'parse_error', raw: data });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

async function getMachineDetails(deviceCode) {
  console.log(`\n[API] Getting machine details for ${deviceCode}...`);
  const result = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: deviceCode,
  });
  return result;
}

async function queryPaymentConfig(deviceId) {
  console.log(`\n[API] Querying payment config for device_id: ${deviceId}...`);
  const result = await apiRequest('/api/openApi/machineQueryPaymentConfig', {
    device_id: deviceId,
  });
  return result;
}

async function getMachineList() {
  console.log(`\n[API] Getting machine list...`);
  const result = await apiRequest('/api/openApi/machineList', {});
  return result;
}

// ============================================
// MAIN
// ============================================

async function main() {
  const results = {
    machines: [],
    paymentCapabilities: [],
  };

  // First, get the machine list to get device_id and machineId
  console.log('\n' + '='.repeat(60));
  console.log('STEP 1: Get Machine List');
  console.log('='.repeat(60));

  const machineList = await getMachineList();
  console.log('\nMachine List Response:');
  console.log(JSON.stringify(machineList, null, 2));

  if (machineList.status === 200 && machineList.data) {
    results.machines = machineList.data;
  }

  // For each machine, get details and payment config
  for (const machineCode of config.machines) {
    console.log('\n' + '='.repeat(60));
    console.log(`STEP 2: Query Machine ${machineCode}`);
    console.log('='.repeat(60));

    // Get machine details (includes device_id)
    const details = await getMachineDetails(machineCode);
    console.log('\nMachine Details Response:');
    console.log(JSON.stringify(details, null, 2));

    if (details.status === 200 && details.data?.data) {
      const machineData = details.data.data;
      const deviceId = machineData.device_id;
      const machineId = machineData.machineId; // For MQTT

      console.log(`\n   device_id: ${deviceId}`);
      console.log(`   machineId: ${machineId}`);

      // Query payment config via API
      console.log('\n' + '-'.repeat(40));
      console.log('STEP 2a: Query Payment Config via API');
      console.log('-'.repeat(40));

      const paymentConfig = await queryPaymentConfig(deviceId);
      console.log('\nPayment Config Response:');
      console.log(JSON.stringify(paymentConfig, null, 2));

      // Query via MQTT for payWayList
      console.log('\n' + '-'.repeat(40));
      console.log('STEP 2b: Query Payment Methods via MQTT');
      console.log('-'.repeat(40));

      if (machineId) {
        const mqttResult = await queryViaMQTT(machineCode, machineId);

        if (mqttResult.success && mqttResult.data) {
          results.paymentCapabilities.push({
            machineCode,
            deviceId,
            machineId,
            payWayList: mqttResult.data.payWayList || [],
            isNormal: mqttResult.data.isNormal,
            apiPaymentConfig: paymentConfig,
          });
        } else {
          results.paymentCapabilities.push({
            machineCode,
            deviceId,
            machineId,
            mqttError: mqttResult.error,
            apiPaymentConfig: paymentConfig,
          });
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY: PAYMENT CAPABILITIES');
  console.log('='.repeat(60));

  for (const cap of results.paymentCapabilities) {
    console.log(`\nMachine: ${cap.machineCode}`);
    console.log(`  Device ID: ${cap.deviceId}`);

    if (cap.payWayList) {
      console.log(`  Payment Methods (payWayList): ${JSON.stringify(cap.payWayList)}`);

      const hasNayax = cap.payWayList.includes('nayax');
      const hasICT = cap.payWayList.includes('ict');
      const hasVPOS = cap.payWayList.includes('vpos');

      console.log(`  - Nayax (Credit Card): ${hasNayax ? '✅ YES' : '❌ NO'}`);
      console.log(`  - ICT (Cash/Bills): ${hasICT ? '✅ YES' : '❌ NO'}`);
      console.log(`  - VPOS (QR/Mobile): ${hasVPOS ? '✅ YES' : '❌ NO'}`);

      if (hasNayax) {
        console.log(`\n  🎉 CREDIT CARD PAYMENTS ARE SUPPORTED!`);
      } else {
        console.log(`\n  ⚠️  No Nayax terminal detected - credit cards NOT supported`);
      }
    } else if (cap.mqttError) {
      console.log(`  MQTT Error: ${cap.mqttError}`);
    }

    if (cap.apiPaymentConfig) {
      console.log(`  API Payment Config: ${JSON.stringify(cap.apiPaymentConfig)}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
