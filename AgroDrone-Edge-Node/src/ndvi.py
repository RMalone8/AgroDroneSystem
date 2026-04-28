import cv2
import numpy as np
import os
import matplotlib
matplotlib.use("Agg")  # headless — no display needed
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib import colormaps

# RdYlGn is the standard diverging colormap for NDVI: red (low/no vegetation)
# through neutral yellow at 0 to green (healthy vegetation).
# Swap to 'PiYG' or 'BrBG' for stricter perceptual uniformity.
COLORMAP = "RdYlGn"

def _build_lut(name: str) -> np.ndarray:
    """Convert a matplotlib diverging colormap into a (256, 1, 3) BGR LUT."""
    cmap = colormaps[name]
    lut = np.zeros((256, 1, 3), dtype=np.uint8)
    for i in range(256):
        r, g, b, _ = cmap(i / 255.0)
        lut[i, 0, :] = [int(b * 255), int(g * 255), int(r * 255)]  # BGR
    return lut

_LUT = _build_lut(COLORMAP)


def save_legend(out_dir: str, filename: str = "ndvi_legend.png") -> str:
    """
    Save a vertical NDVI colorbar legend to out_dir.
    The PNG has a transparent background so it can be overlaid directly
    on the frontend map.
    """
    cmap = colormaps[COLORMAP]
    norm = mcolors.Normalize(vmin=-1, vmax=1)

    fig, ax = plt.subplots(figsize=(1.2, 4))
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")

    cb = fig.colorbar(
        plt.cm.ScalarMappable(norm=norm, cmap=cmap),
        cax=ax,
        orientation="vertical",
    )
    cb.set_ticks([-1, -0.5, 0, 0.5, 1])
    cb.set_ticklabels([
        "-1  Water / shadow",
        "-0.5  Bare soil",
        " 0   Sparse cover",
        " 0.5  Moderate",
        " 1   Dense vegetation",
    ])
    cb.ax.tick_params(labelsize=7, colors="white")
    cb.set_label("NDVI", color="white", fontsize=8)
    cb.outline.set_edgecolor("white")

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, filename)
    fig.savefig(out_path, bbox_inches="tight", transparent=True, dpi=150)
    plt.close(fig)
    print(f"Legend saved to {out_path}")
    return out_path


def process_ndvi(rgb_path, aligned_nir_path, num_image, out_dir="data/processed"):
    """NDVI calculations with image pairs."""
    rgb = cv2.imread(rgb_path)
    rgb = cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB)
    nir_img = cv2.imread(aligned_nir_path)

    red = rgb[:, :, 2].astype(np.float32)
    nir = nir_img[:, :, 2].astype(np.float32)

    with np.errstate(divide='ignore', invalid='ignore'):
        ndvi = (nir - red) / (nir + red + 1e-8)
        ndvi = np.nan_to_num(ndvi, nan=0.0, posinf=1.0, neginf=0.0)

    print(f'NDVI Min: {ndvi.min():.3f}  Mean: {ndvi.mean():.3f}  Max: {ndvi.max():.3f}')

    # Map [-1, 1] -> [0, 255] then apply the diverging LUT
    ndvi_scaled = ((ndvi + 1.0) * 127.5).astype(np.uint8)
    ndvi_colored = cv2.LUT(cv2.merge([ndvi_scaled, ndvi_scaled, ndvi_scaled]), _LUT)

    # Pixels that computed to <= -0.70 are warpAffine fill (NIR=0, RED>0).
    # Make them transparent so the edge blends naturally.
    ndvi_rgba = cv2.cvtColor(ndvi_colored, cv2.COLOR_BGR2BGRA)
    ndvi_rgba[ndvi <= -0.70, 3] = 0

    os.makedirs(out_dir, exist_ok=True)
    out_path = f"{out_dir}/ndvi_{num_image}.png"
    cv2.imwrite(out_path, ndvi_rgba)
    return out_path
