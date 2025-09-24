const axios = require('axios');

async function testSystem() {
  console.log('🧪 TESTING COMPLETE SYSTEM\n');
  console.log('=' .repeat(60));

  const results = {
    backend: false,
    frontend: false,
    s3: false,
    ai: false,
    chitu: false
  };

  // Test 1: Backend API
  console.log('\n1️⃣ Testing Backend API...');
  try {
    const response = await axios.get('http://localhost:3001/');
    if (response.data.message === 'Hello World! This is the backend service!') {
      console.log('✅ Backend is running');
      results.backend = true;
    }
  } catch (error) {
    console.log('❌ Backend not accessible:', error.message);
  }

  // Test 2: Frontend
  console.log('\n2️⃣ Testing Frontend...');
  try {
    const response = await axios.get('http://localhost:3000/api/health');
    console.log('✅ Frontend is running');
    results.frontend = true;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('✅ Frontend is running (no health endpoint but server responds)');
      results.frontend = true;
    } else {
      console.log('❌ Frontend not accessible:', error.message);
    }
  }

  // Test 3: AI Image Generation
  console.log('\n3️⃣ Testing AI Image Generation...');
  try {
    const response = await axios.post('http://localhost:3001/api/ai-create', {
      prompt: 'cute cat in space',
      phoneModel: 'iPhone 15'
    });

    if (response.data.imageUrls) {
      console.log('✅ AI generation works');
      console.log('   Generated images:', response.data.imageUrls.length);
      results.ai = true;
    }
  } catch (error) {
    console.log('❌ AI generation failed:', error.response?.data?.message || error.message);
  }

  // Test 4: Chitu Machine API
  console.log('\n4️⃣ Testing Chitu Machine API...');
  try {
    const response = await axios.get('http://localhost:3001/api/chitu/machines');
    console.log('✅ Chitu API works');
    console.log('   Machines found:', response.data.length);
    results.chitu = true;
  } catch (error) {
    console.log('❌ Chitu API failed:', error.response?.data?.message || error.message);
  }

  // Test 5: S3 Configuration
  console.log('\n5️⃣ Checking S3 Configuration...');
  try {
    // Check if S3 credentials are configured
    const response = await axios.get('http://localhost:3001/api/admin/s3-images', {
      headers: {
        'X-Admin-Token': process.env.ADMIN_AUTH_TOKEN || '1e969f1c6a953a9e188c09ffff181be22c42b40966089c04377db4d1600a28f5'
      }
    });
    console.log('✅ S3 is configured');
    console.log('   Images in bucket:', response.data.images?.length || 0);
    results.s3 = true;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('⚠️  S3 endpoint exists but needs correct admin token');
    } else {
      console.log('❌ S3 not configured:', error.response?.data?.message || error.message);
    }
  }

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 SYSTEM STATUS SUMMARY\n');

  const statuses = [
    { name: 'Backend API', status: results.backend },
    { name: 'Frontend', status: results.frontend },
    { name: 'S3 Storage', status: results.s3 },
    { name: 'AI Services', status: results.ai },
    { name: 'Chitu Machine API', status: results.chitu }
  ];

  statuses.forEach(item => {
    console.log(`${item.status ? '✅' : '❌'} ${item.name}`);
  });

  const working = Object.values(results).filter(v => v).length;
  const total = Object.values(results).length;

  console.log(`\n🎯 Overall: ${working}/${total} services working`);

  if (working === total) {
    console.log('🎉 All systems operational! Ready for phone case printing tomorrow.');
  } else {
    console.log('⚠️  Some services need attention before phone case printing.');
  }

  console.log('=' .repeat(60));
}

// Add environment variable for admin token
process.env.ADMIN_AUTH_TOKEN = '1e969f1c6a953a9e188c09ffff181be22c42b40966089c04377db4d1600a28f5';

testSystem();