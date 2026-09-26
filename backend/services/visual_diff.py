"""
AetherPact — Phase 6: Visual Change Detection Service.

Uses OpenCV to detect structural changes between two images (check-in vs check-out).
Technique: grayscale → Gaussian blur → absolute difference → threshold → contour detection.

IMPORTANT: This detects VISUAL STRUCTURAL CHANGES only — it is NOT a damage classifier,
NOT a hygiene classifier, and NOT a trained model of any kind. Lighting-only differences
are suppressed by blurring before differencing. All code comments and UI text must use
the label "visual change detection" exclusively.
"""

import cv2
import json
import numpy as np
from pathlib import Path
from typing import List, Dict, Optional, Tuple


# Minimum contour area (px²) to count as a significant change region.
# Smaller regions are lighting noise or JPEG artefacts.
MIN_CONTOUR_AREA = 500

# Gaussian blur kernel — large enough to suppress lighting variation.
BLUR_KERNEL = (21, 21)

# Binary threshold value (0-255). After blurring, only pixel differences
# above this value are counted as structural changes.
THRESHOLD_VALUE = 25


def detect_changes(
    image_a_path: str,
    image_b_path: str,
) -> Tuple[bool, List[Dict]]:
    """
    Compare two images for visual structural changes.

    Args:
        image_a_path: Check-in image path.
        image_b_path: Check-out image path.

    Returns:
        (change_detected, bounding_boxes)
        bounding_boxes: list of {"x", "y", "w", "h"} for each significant change region.
    """
    img_a = cv2.imread(str(image_a_path))
    img_b = cv2.imread(str(image_b_path))

    if img_a is None or img_b is None:
        raise ValueError("Could not read one or both images.")

    # Resize B to match A's dimensions if they differ
    if img_a.shape != img_b.shape:
        img_b = cv2.resize(img_b, (img_a.shape[1], img_a.shape[0]))

    # Convert to grayscale
    gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2GRAY)

    # Apply Gaussian blur — suppresses lighting-only differences
    blur_a = cv2.GaussianBlur(gray_a, BLUR_KERNEL, 0)
    blur_b = cv2.GaussianBlur(gray_b, BLUR_KERNEL, 0)

    # Absolute difference
    diff = cv2.absdiff(blur_a, blur_b)

    # Binary threshold
    _, thresh = cv2.threshold(diff, THRESHOLD_VALUE, 255, cv2.THRESH_BINARY)

    # Morphological close to merge nearby regions
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    boxes = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area >= MIN_CONTOUR_AREA:
            x, y, w, h = cv2.boundingRect(cnt)
            boxes.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h)})

    return len(boxes) > 0, boxes
