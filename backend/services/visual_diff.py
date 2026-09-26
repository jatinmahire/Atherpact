"""
AetherPact — Phase 6: Visual Change Detection Service.
Phase 11 (Addendum 2): ORB feature-alignment hardening.

Uses OpenCV to detect structural changes between two images (check-in vs check-out).
Technique: ORB feature alignment -> grayscale -> Gaussian blur -> absolute difference
-> threshold -> contour detection.

IMPORTANT: This detects VISUAL STRUCTURAL CHANGES only — it is NOT a damage classifier,
NOT a hygiene classifier, and NOT a trained model of any kind. Lighting-only differences
are suppressed by blurring before differencing, and small camera-angle differences are
suppressed by feature alignment before differencing. All code comments and UI text must
use the label "visual change detection" exclusively.
"""

import logging
import cv2
import numpy as np
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)

# Minimum contour area (px²) to count as a significant change region.
# Smaller regions are lighting noise or JPEG artefacts.
MIN_CONTOUR_AREA = 500

# Gaussian blur kernel — large enough to suppress lighting variation.
BLUR_KERNEL = (21, 21)

# Binary threshold value (0-255). After blurring, only pixel differences
# above this value are counted as structural changes.
THRESHOLD_VALUE = 25

# Minimum good ORB matches required to trust the estimated homography.
# Below this, alignment is skipped rather than risking a bogus warp.
MIN_GOOD_MATCHES = 10


def align_images(img1: np.ndarray, img2: np.ndarray) -> Tuple[np.ndarray, bool]:
    """
    Align img2 onto img1's frame using ORB features + homography (RANSAC).

    Without this, even a few degrees of phone tilt/rotation between the check-in
    and check-out shot shifts every pixel and can flag the entire frame as
    "changed" — a false alarm that has nothing to do with the resource itself.

    Returns:
        (aligned_img2, alignment_ok). If alignment_ok is False (too few matches,
        or homography estimation failed), img2 is returned unchanged and the
        caller should record this so it's visible, not silently hidden.
    """
    try:
        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

        orb = cv2.ORB_create(500)
        kp1, des1 = orb.detectAndCompute(gray1, None)
        kp2, des2 = orb.detectAndCompute(gray2, None)

        if des1 is None or des2 is None or len(kp1) < MIN_GOOD_MATCHES or len(kp2) < MIN_GOOD_MATCHES:
            return img2, False

        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = sorted(matcher.match(des1, des2), key=lambda m: m.distance)
        good_matches = matches[: max(10, int(len(matches) * 0.15))]

        if len(good_matches) < MIN_GOOD_MATCHES:
            return img2, False

        src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        homography, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

        if homography is None:
            return img2, False

        aligned = cv2.warpPerspective(img2, homography, (img1.shape[1], img1.shape[0]))
        return aligned, True
    except Exception as exc:
        logger.warning("Image alignment failed, proceeding unaligned: %s", exc)
        return img2, False


def detect_changes(
    image_a_path: str,
    image_b_path: str,
) -> Tuple[bool, List[Dict], bool]:
    """
    Compare two images for visual structural changes.

    Args:
        image_a_path: Check-in image path.
        image_b_path: Check-out image path.

    Returns:
        (change_detected, bounding_boxes, alignment_unavailable)
        bounding_boxes: list of {"x", "y", "w", "h"} for each significant change region.
        alignment_unavailable: True if ORB found too few matches to align safely —
            the caller should surface this rather than silently proceeding unaligned.
    """
    img_a = cv2.imread(str(image_a_path))
    img_b = cv2.imread(str(image_b_path))

    if img_a is None or img_b is None:
        raise ValueError("Could not read one or both images.")

    # Resize B to match A's dimensions if they differ
    if img_a.shape != img_b.shape:
        img_b = cv2.resize(img_b, (img_a.shape[1], img_a.shape[0]))

    # Align check-out onto check-in's frame before differencing
    aligned_b, alignment_ok = align_images(img_a, img_b)

    # Convert to grayscale
    gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(aligned_b, cv2.COLOR_BGR2GRAY)

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

    return len(boxes) > 0, boxes, not alignment_ok
