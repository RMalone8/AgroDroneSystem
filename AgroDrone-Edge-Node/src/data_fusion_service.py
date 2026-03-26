import os
import math
from PIL import Image
from metadata_handler import load_metadata

def fuse_images():
    """
    Spatially stitches raw and NDVI images using GPS coordinates from metadata.
    Each image is placed according to its latitude and longitude.
    Returns paths to final stitched raw and NDVI mosaics.
    """
    os.makedirs("data/stitched", exist_ok=True)

    metadata = load_metadata()
    if not metadata:
        print("[Fusion] No metadata found — cannot perform spatial fusion.")
        return None, None

    latitudes = [entry["gps"][0] for entry in metadata]
    longitudes = [entry["gps"][1] for entry in metadata]
    max_lat, min_lat = max(latitudes), min(latitudes)
    max_lon, min_lon = max(longitudes), min(longitudes)
    lat_range = max_lat - min_lat
    lon_range = max_lon - min_lon

    print(f"[Fusion] Field bounding box:")
    print(f"   Latitude:  {min_lat:.6f} → {max_lat:.6f}")
    print(f"   Longitude: {min_lon:.6f} → {max_lon:.6f}")

    PIXELS_PER_DEGREE = 20000  # we will have to calculate this, or have a predefined scale
    field_width_px = max(1, int(lon_range * PIXELS_PER_DEGREE))
    field_height_px = max(1, int(lat_range * PIXELS_PER_DEGREE))

    print(f"[Fusion] Estimated stitched image size: {field_width_px}x{field_height_px}px")

    raw_stitched = Image.new("RGB", (field_width_px, field_height_px), color=(0, 0, 0))
    ndvi_stitched = Image.new("RGB", (field_width_px, field_height_px), color=(0, 0, 0))

    for entry in metadata:
        lat, lon = entry["gps"]
        raw_path = entry["raw_image_path"]
        ndvi_path = entry["ndvi_image_path"]

        if not os.path.exists(raw_path) or not os.path.exists(ndvi_path):
            print(f"[Fusion] Skipping, missing image at {raw_path} or {ndvi_path}")
            continue

        # Load both raw and NDVI images
        raw_img = Image.open(raw_path)
        ndvi_img = Image.open(ndvi_path)

        x_offset = int((lon - min_lon) * PIXELS_PER_DEGREE)
        y_offset = int((max_lat - lat) * PIXELS_PER_DEGREE)

        # Paste images onto the stitched canvases
        raw_stitched.paste(raw_img, (x_offset, y_offset))
        ndvi_stitched.paste(ndvi_img, (x_offset, y_offset))

        raw_img.close()
        ndvi_img.close()

    raw_path_out = "data/stitched/raw_stitched.jpg"
    ndvi_path_out = "data/stitched/ndvi_stitched.jpg"
    raw_stitched.save(raw_path_out)
    ndvi_stitched.save(ndvi_path_out)

    print(f"[Fusion] Created stitched mosaics:\n - {raw_path_out}\n - {ndvi_path_out}")
    return raw_path_out, ndvi_path_out
