import cv2
import numpy as np
import os

def process_ndvi(rgb_path, aligned_nir_path, num_image):
    """
    Placeholder NDVI computation.
    Real NDVI uses NIR and VIS bands; this simulates a color overlay.
    """
    rgb = cv2.imread(rgb_path)
    rgb = cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB)
    nir = cv2.imread(aligned_nir_path)

    red, nir = rgb[:, :, 2].astype(np.float32), nir[:, :, 2].astype(np.float32)

    with np.errstate(divide='ignore', invalid='ignore'):
        ndvi = (nir - red) / (nir + red)
        ndvi[ndvi == np.inf] = 0
        ndvi = np.nan_to_num(ndvi, nan=0.0, posinf=1.0, neginf=0.0)

    print(f'NDVI Min: {ndvi.min()}')
    print(f'NDVI Mean: {round(ndvi.mean(),2)}')
    print(f'NDVI Max: {ndvi.max()}')

    ndvi = np.clip(ndvi * 127.5 + 127.5, 0, 255).astype(np.uint8)

    ndvi = cv2.applyColorMap(ndvi, cv2.COLORMAP_DEEPGREEN)

    out_path = f"data/processed/output_test_ndvi_{num_image}.png"
    os.makedirs("data/processed", exist_ok=True)
    cv2.imwrite(out_path, ndvi)
    return out_path
