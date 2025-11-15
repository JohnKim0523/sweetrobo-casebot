#!/bin/bash

# Chitu API Testing Script for Exhibition Machine
# Machine: CT0700046 (CT-sjk360)

API_URL="http://localhost:3001"

echo "🧪 Starting Chitu API Tests with Exhibition Machine"
echo "================================================="

# 1. Test Authentication & Connection
echo -e "\n1️⃣ Testing Authentication..."
curl -X GET "$API_URL/api/chitu/test" \
  -H "Content-Type: application/json" | jq .

# 2. Get Machine List
echo -e "\n2️⃣ Getting Machine List..."
curl -X GET "$API_URL/api/chitu/machines" \
  -H "Content-Type: application/json" | jq .

# 3. Get Specific Machine Details
echo -e "\n3️⃣ Getting CT0700046 Details..."
curl -X GET "$API_URL/api/chitu/machines/CT0700046" \
  -H "Content-Type: application/json" | jq .

# 4. Test File Upload (without printing)
echo -e "\n4️⃣ Testing File Upload..."
# Create a small test image (base64)
TEST_IMAGE="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

curl -X POST "$API_URL/api/chitu/upload" \
  -H "Content-Type: application/json" \
  -d "{
    \"file\": \"data:image/png;base64,$TEST_IMAGE\",
    \"filename\": \"test-design.png\"
  }" | jq .

# 5. Test Print Job Submission (TEST MODE)
echo -e "\n5️⃣ Testing Print Job Submission (TEST MODE)..."
curl -X POST "$API_URL/api/chitu/print" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,'$TEST_IMAGE'",
    "machineId": "CT0700046",
    "phoneModel": "iPhone 15 Pro",
    "sessionId": "test-session-001",
    "dimensions": {
      "widthPX": 1181,
      "heightPX": 2556,
      "widthMM": 100,
      "heightMM": 216
    }
  }' | jq .

echo -e "\n✅ Test Complete!"