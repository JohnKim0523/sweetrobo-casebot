import time
import requests
import json

API_URL = "https://h5.colorpark.cn/api/userphoneapplets/index"
TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwOlwvXC93d3cucmVmaW5lY29sb3IuY29tIiwiYXVkIjoicmVmaW5lY29sb3IiLCJpYXQiOjE3NTQzMTgzNTMsIm5iZiI6MTc1NDMxODM1MywiZXhwIjoxNzYyOTU4MzUzLCJ1aWQiOjM3MTc4NX0.2RGL6TYYf8eZSI_I6Nt6JkbmRKhgDOn9yn84InY9_g8"

HEADERS = {
    "Content-Type": "application/json;charset=utf-8",
    "token": TOKEN,
    "Origin": "https://h5.colorpark.cn",
    "Referer": "https://h5.colorpark.cn/pages/print/index"
}

# === STEP 1: Works.save ===
print("📤 Sending Works.save...")

works_payload = {
    "s": "Works.save",
    "components": [{
        "is_under": 0,
        "is_discount": 0,
        "id": None,
        "type": 0,
        "material_id": 0,
        "works_id": None,
        "original_id": 0,
        "index": 100,
        "font_family": ".ttf",
        "font_style": "regular",
        "font_size": 0,
        "font_color": "",
        "under_color": "#00000000",
        "width": 162.80127198402892,
        "height": 150.52885572139306,
        "top": 17.23557213930348,
        "left": -31.400635992014465,
        "zoom": 1,
        "rotate": 0,
        "content": "https://img.colorpark.cn/api/render/1754320363505.jpeg",
        "upper_left_x": -31.40063599199751,
        "upper_left_y": 17.235572139291047,
        "upper_right_x": 131.400635992,
        "upper_right_y": 17.235572139291047,
        "lower_left_x": -31.40063599199751,
        "lower_left_y": 167.76442786071144,
        "lower_right_x": 131.400635992,
        "lower_right_y": 167.76442786071144,
        "center_x": 50,
        "center_y": 92.5,
        "image_left": -31.400635992014465,
        "image_top": 17.23557213930348,
        "image_width": 162.80127198402892,
        "image_height": 150.52885572139306
    }],
    "works_id": None,
    "goods_id": "4159",
    "template": None,
    "template_price": None,
    "template_user_id": None,
    "user_id": None,
    "platform": 4,
    "shape_image": "",
    "shape_id": "",
    "shape_price": "",
    "machine_id": "11025496",
    "terminal": 2,
    "background_color": None
}

try:
    resp1 = requests.post(API_URL, headers=HEADERS, json=works_payload, timeout=10)
    resp1_json = resp1.json()
    print("✅ Works.save response:", json.dumps(resp1_json, indent=2))
except Exception as e:
    print("❌ Error during Works.save:", e)
    exit(1)

# === Extract works_id ===
works_id = resp1_json.get("data", {}).get("id")
if not works_id:
    print("❌ No works_id returned. Exiting.")
    exit(1)

time.sleep(0.5)

# === STEP 2: Order.create ===
print("\n📤 Sending Order.create...")

order_payload = {
    "s": "Order.create",
    "type": 2,
    "machine_id": "11025496",
    "goods_id": "4159",
    "works_id": str(works_id),
    "channel_no": None,
    "dict_id": None,
    "goods_size": None,
    "works_num": None,
    "shop_id": None,
    "sn": None,
    "coupon_id": None,
    "user_address": None,
    "surface_type": 0,
    "surface_id": 0,
    "surface_color_series_id": 0,
    "surface_color_id": 0,
    "language": "en-us",
    "support_paypal": "",
    "promoter_id": "",
    "terminal": 4,
    "customize_size_id": "",
    "create_time": int(time.time()),
    "user_id": 371785
}

try:
    resp2 = requests.post(API_URL, headers=HEADERS, json=order_payload, timeout=10)
    print("✅ Order.create response:", json.dumps(resp2.json(), indent=2))
except Exception as e:
    print("❌ Error during Order.create:", e)

time.sleep(0.5)

# === STEP 3: Machine.wait ===
print("\n📤 Sending Machine.wait...")

machine_wait_payload = {
    "s": "Machine.wait",
    "machine_id": "11025496",
    "page": 1,
    "per_page": 20,
    "total": 0
}

try:
    resp3 = requests.post(API_URL, headers=HEADERS, json=machine_wait_payload, timeout=10)
    print("✅ Machine.wait response:", json.dumps(resp3.json(), indent=2))
except Exception as e:
    print("❌ Error during Machine.wait:", e)
