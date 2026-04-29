import glob
import json
import os
from dotenv import load_dotenv
import requests
import image_registration
import ndvi

load_dotenv()

TRIGGER_PATH = "/tmp/process_start.json"
DATA_PATH    = os.getenv("DATA_PATH")
BACKEND_URL  = os.getenv("BACKEND_URL")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN")
DEVICE_ID    = os.getenv("DEVICE_ID")


def main():
    with open(TRIGGER_PATH) as f:
        trigger = json.load(f)

    fpid = trigger["fpid"]
    mid  = trigger["mid"]

    mission_dir = os.path.join(DATA_PATH, fpid, mid)
    out_dir     = os.path.join(mission_dir, "processed")
    os.makedirs(out_dir, exist_ok=True)

    # Discover all RGB captures; derive NIR and metadata paths from the same timestamp.
    rgb_files = sorted(glob.glob(os.path.join(mission_dir, "*_cam1.jpg")))

    pairs = []
    for rgb_path in rgb_files:
        basename  = os.path.basename(rgb_path)               # 20260427_201722_499064_cam1.jpg
        timestamp = basename.replace("_cam1.jpg", "")        # 20260427_201722_499064
        nir_path  = os.path.join(mission_dir, f"{timestamp}_cam0.jpg")
        meta_path = os.path.join(mission_dir, f"{timestamp}_metadata.json")

        if not os.path.exists(nir_path):
            print(f"Skipping {timestamp}: missing cam0 (NIR) image")
            continue
        if not os.path.exists(meta_path):
            print(f"Skipping {timestamp}: missing per-capture metadata JSON")
            continue

        pairs.append((timestamp, rgb_path, nir_path, meta_path))

    if not pairs:
        print(f"No complete image pairs found in {mission_dir}")
        return

    print(f"Processing {len(pairs)} image pair(s) for fpid={fpid} mid={mid}")

    for idx, (timestamp, rgb_path, nir_path, meta_path) in enumerate(pairs):
        with open(meta_path) as f:
            capture_meta = json.load(f)

        position = capture_meta.get("position", {})
        lat      = position.get("lat", 0)
        lng      = position.get("lon", 0)
        heading  = position.get("heading_deg", 0)
        altitude = position.get("alt_rel_m", 0)

        print(f"[{idx+1}/{len(pairs)}] {timestamp}  lat={lat}  lng={lng}  heading={heading}  alt={altitude}")

        aligned_nir_path = image_registration.register_images(
            rgb_path, nir_path, idx, out_dir=out_dir
        )
        ndvi.process_ndvi(rgb_path, aligned_nir_path, idx, out_dir=out_dir)

        image_meta = {
            "lat":       lat,
            "lng":       lng,
            "heading":   heading,
            "altitude":  altitude,
            "timestamp": timestamp,
        }
        meta_out = os.path.join(out_dir, f"ndvi_{idx}_metadata.json")
        with open(meta_out, "w") as f:
            json.dump(image_meta, f, indent=2)

    ndvi.save_legend(out_dir)
    print(f"\nDone. {len(pairs)} image(s) written to {out_dir}")

    if not BACKEND_URL:
        print("BACKEND_URL not set — skipping upload")
        return

    auth_headers = {
        "Authorization": f"Bearer {DEVICE_TOKEN}",
        "X-Device-Id": DEVICE_ID,
    }

    print(f"\nUploading to {BACKEND_URL}/mosaic ...")
    for idx, (timestamp, _, _, _) in enumerate(pairs):
        ndvi_path  = os.path.join(out_dir, f"ndvi_{idx}.png")
        meta_out   = os.path.join(out_dir, f"ndvi_{idx}_metadata.json")

        with open(meta_out) as f:
            image_meta = json.load(f)
        with open(ndvi_path, "rb") as f:
            png_bytes = f.read()

        response = requests.post(
            f"{BACKEND_URL}/mosaic",
            headers=auth_headers,
            data={
                "fpid":      fpid,
                "mid":       mid,
                "index":     str(idx),
                "lat":       str(image_meta["lat"]),
                "lng":       str(image_meta["lng"]),
                "heading":   str(image_meta["heading"]),
                "altitude":  str(image_meta["altitude"]),
                "timestamp": image_meta["timestamp"],
            },
            files={"image": (f"ndvi_{idx}.png", png_bytes, "image/png")},
        )
        print(f"  [{idx+1}/{len(pairs)}] {response.status_code} {response.text}")


if __name__ == "__main__":
    main()
