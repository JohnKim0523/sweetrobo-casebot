// Script to discover available GOODS_IDs from ColorPark API

const PRINTER_API_URL = "https://h5.colorpark.cn/api/userphoneapplets/index";
const MACHINE_ID = "11025496";

async function getToken() {
  const randomPhone = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
  
  const formData = new URLSearchParams({
    's': 'User.webLogin',
    'phone': randomPhone,
    'password': '',
    'type': '2',
    'applets_type': '7',
    'machine_id': MACHINE_ID
  });

  const response = await fetch(PRINTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      'Accept': '*/*',
      'Origin': 'https://h5.colorpark.cn',
      'Referer': 'https://h5.colorpark.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: formData.toString()
  });

  const data = await response.json();
  if ((data.code === 0 || data.ret === 200) && data.data?.token) {
    return data.data.token;
  }
  throw new Error('Failed to get token');
}

async function getProducts(token) {
  console.log('\n=== Getting Customization Products ===');
  
  // Try Product.getCustomize
  const customizeResponse = await fetch(PRINTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'token': token,
      'Origin': 'https://h5.colorpark.cn',
      'Referer': 'https://h5.colorpark.cn/pages/print/index'
    },
    body: JSON.stringify({
      's': 'Product.getCustomize',
      'machine_id': MACHINE_ID,
      'goods_category_id': 57
    })
  });
  
  const customizeData = await customizeResponse.json();
  console.log('Product.getCustomize response:', JSON.stringify(customizeData, null, 2));
  
  // Try Product.getBrands
  console.log('\n=== Getting Product Brands ===');
  const brandsResponse = await fetch(PRINTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'token': token,
      'Origin': 'https://h5.colorpark.cn',
      'Referer': 'https://h5.colorpark.cn/pages/print/index'
    },
    body: JSON.stringify({
      's': 'Product.getBrands',
      'machine_id': MACHINE_ID,
      'key': ''
    })
  });
  
  const brandsData = await brandsResponse.json();
  console.log('Product.getBrands response:', JSON.stringify(brandsData, null, 2));
  
  // Try Machine.getBaseSetting
  console.log('\n=== Getting Machine Settings ===');
  const machineResponse = await fetch(PRINTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'token': token,
      'Origin': 'https://h5.colorpark.cn',
      'Referer': 'https://h5.colorpark.cn/pages/print/index'
    },
    body: JSON.stringify({
      's': 'Machine.getBaseSetting',
      'machine_id': MACHINE_ID
    })
  });
  
  const machineData = await machineResponse.json();
  console.log('Machine.getBaseSetting response:', JSON.stringify(machineData, null, 2));
  
  // Try to get specific product details for known IDs
  const knownIds = ['993', '951', '1682', '4159'];
  console.log('\n=== Testing Known Product IDs ===');
  
  for (const id of knownIds) {
    try {
      const detailResponse = await fetch(PRINTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          'token': token,
          'Origin': 'https://h5.colorpark.cn',
          'Referer': 'https://h5.colorpark.cn/pages/print/index'
        },
        body: JSON.stringify({
          's': 'Product.detail',
          'id': id
        })
      });
      
      const detailData = await detailResponse.json();
      if (detailData.data) {
        console.log(`\nProduct ID ${id}:`);
        console.log(`  Name: ${detailData.data.name || detailData.data.goods_name || 'N/A'}`);
        console.log(`  Type: ${detailData.data.type || 'N/A'}`);
        console.log(`  Size: ${detailData.data.width || detailData.data.goods_width || 'N/A'} x ${detailData.data.height || detailData.data.goods_height || 'N/A'}`);
      }
    } catch (err) {
      console.log(`Product ID ${id}: Error - ${err.message}`);
    }
  }
}

async function main() {
  try {
    console.log('Getting authentication token...');
    const token = await getToken();
    console.log('Token obtained successfully');
    
    await getProducts(token);
    
    console.log('\n=== Summary of Known GOODS_IDs ===');
    console.log('993  - Custom Model (自定义型号) - Flexible dimensions, no template');
    console.log('951  - iPhone 14 Pro - Has phone template overlay');
    console.log('1682 - OnePlus Nord 2T 5G - Has phone template overlay');
    console.log('4159 - iPhone 16E - Has phone template overlay (from working example)');
    console.log('\nNote: For edge-to-edge printing without margins, goods_id selection matters.');
    console.log('The working example uses 4159 which may handle full-bleed printing differently.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();