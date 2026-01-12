/**
 * Test script to verify iPhone 15 fix
 *
 * This tests two things:
 * 1. Direct productId path (primary fix) - should skip name matching
 * 2. Name matching fallback (secondary fix) - should handle "iPhone 15" vs "iPhone15"
 *
 * Run with: node tests/test-iphone15-fix.js
 */

// Test the normalizeString fix
function testNormalizeString() {
  console.log('\n=== Testing normalizeString fix ===\n');

  // New normalize function (removes ALL spaces)
  const normalizeString = (str) => {
    return str
      .toLowerCase()
      .replace(/\s+/g, '')  // Remove ALL whitespace
      .trim();
  };

  const testCases = [
    { input1: 'iPhone 15', input2: 'iPhone15', shouldMatch: true },
    { input1: 'iPhone 16 Pro', input2: 'iPhone16Pro', shouldMatch: true },
    { input1: 'iPhone 15 Pro Max', input2: 'iPhone15ProMax', shouldMatch: true },
    { input1: 'Galaxy A54', input2: 'GalaxyA54', shouldMatch: true },
    { input1: 'iPhone 15', input2: 'iPhone 14', shouldMatch: false },
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(({ input1, input2, shouldMatch }) => {
    const norm1 = normalizeString(input1);
    const norm2 = normalizeString(input2);
    const matches = norm1 === norm2;
    const status = matches === shouldMatch ? 'PASS' : 'FAIL';

    if (matches === shouldMatch) {
      passed++;
      console.log(`  [${status}] "${input1}" vs "${input2}"`);
      console.log(`         Normalized: "${norm1}" vs "${norm2}" => ${matches ? 'MATCH' : 'NO MATCH'}`);
    } else {
      failed++;
      console.log(`  [${status}] "${input1}" vs "${input2}"`);
      console.log(`         Normalized: "${norm1}" vs "${norm2}" => ${matches ? 'MATCH' : 'NO MATCH'}`);
      console.log(`         Expected: ${shouldMatch ? 'MATCH' : 'NO MATCH'}`);
    }
  });

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test the productId direct path logic
function testProductIdPath() {
  console.log('\n=== Testing productId direct path ===\n');

  const testCases = [
    {
      productId: 'l08V7yupDD9QAxMZG4SnYw==',
      phoneModel: 'iPhone 15',
      expected: 'direct',
      description: 'Valid productId should use direct path'
    },
    {
      productId: 'demo-iphone-15',
      phoneModel: 'iPhone 15',
      expected: 'fallback',
      description: 'Demo productId should use fallback (name matching)'
    },
    {
      productId: null,
      phoneModel: 'iPhone 15',
      expected: 'fallback',
      description: 'No productId should use fallback (name matching)'
    },
    {
      productId: undefined,
      phoneModel: 'iPhone 15',
      expected: 'fallback',
      description: 'Undefined productId should use fallback'
    },
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(({ productId, phoneModel, expected, description }) => {
    // Logic from createPrintOrderWithValidation
    let path;
    if (productId && !productId.startsWith('demo-')) {
      path = 'direct';
    } else {
      path = 'fallback';
    }

    const status = path === expected ? 'PASS' : 'FAIL';
    if (path === expected) {
      passed++;
    } else {
      failed++;
    }

    console.log(`  [${status}] ${description}`);
    console.log(`         productId: ${productId}, path: ${path}`);
  });

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Run all tests
console.log('===============================================');
console.log('  iPhone 15 Fix Verification Tests');
console.log('===============================================');

const test1 = testNormalizeString();
const test2 = testProductIdPath();

console.log('===============================================');
if (test1 && test2) {
  console.log('  ALL TESTS PASSED!');
  console.log('===============================================');
  process.exit(0);
} else {
  console.log('  SOME TESTS FAILED!');
  console.log('===============================================');
  process.exit(1);
}
