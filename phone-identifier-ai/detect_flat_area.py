import cv2
import numpy as np

# Load image
image = cv2.imread("phone_case.jpg")  # Replace with your image filename
if image is None:
    raise ValueError("Image not found. Check path and filename.")

# Resize for consistent processing (optional)
image = cv2.resize(image, (500, 1000))

# Convert to grayscale
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

# Apply Gaussian blur to smoothen
blurred = cv2.GaussianBlur(gray, (5, 5), 0)

# Detect edges
edges = cv2.Canny(blurred, 50, 150)

# Dilate edges to close gaps
dilated = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)

# Find contours
contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Create a mask starting as fully white
mask = np.ones_like(gray, dtype=np.uint8) * 255

# Black out raised areas (camera, bump, edges)
for cnt in contours:
    area = cv2.contourArea(cnt)
    if area < 30000:  # Tune this threshold if needed
        cv2.drawContours(mask, [cnt], -1, 0, -1)  # fill in black

# Apply mask to original image
result = cv2.bitwise_and(image, image, mask=mask)

# Show results
cv2.imshow("Original", image)
cv2.imshow("Edges", edges)
cv2.imshow("Flat Area Mask", mask)
cv2.imshow("Final Result (Safe to Print)", result)
cv2.waitKey(0)
cv2.destroyAllWindows()
