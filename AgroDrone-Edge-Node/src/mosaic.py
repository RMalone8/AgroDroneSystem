import json
import os
import io
from dotenv import load_dotenv
import requests
from PIL import Image
import image_registration
import ndvi

load_dotenv()

BACKEND_URL  = os.getenv("BACKEND_URL")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN")
DEVICE_ID    = os.getenv("DEVICE_ID")
DATA_PATH    = os.getenv("DATA_PATH")

def main():
    with open(DATA_PATH + "/metadata.json") as f:
        metadata = json.load(f)

    fpid = metadata["fpid"]
    mid  = metadata["mid"]

    auth_headers = {
        "Authorization": "Bearer " + DEVICE_TOKEN,
        "X-Device-Id": DEVICE_ID,
    }

    for i, image_data in enumerate(metadata["images"]):
        # align NIR to RGB perspective
        aligned_nir_path = image_registration.register_images(
            image_data["rgb_path"], image_data["nir_path"], i
        )

        # compute NDVI
        ndvi_path = ndvi.process_ndvi(image_data["rgb_path"], aligned_nir_path, i)

        # compress to smaller JPEG (half resolution, quality 60)
        img = Image.open(ndvi_path).convert("RGB")
        img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=60)
        buf.seek(0)

        # upload image + geo metadata to the backend
        response = requests.post(
            BACKEND_URL + "/sensor-image",
            headers=auth_headers,
            data={
                "fpid":      fpid,
                "mid":       mid,
                "index":     str(i),
                "lat":       str(image_data.get("lat", 0)),
                "lng":       str(image_data.get("lng", 0)),
                "heading":   str(image_data.get("heading", 0)),
                "altitude":  str(image_data.get("altitude", 0)),
                "timestamp": image_data.get("timestamp", ""),
            },
            files={"image": (f"ndvi_{i}.jpg", buf, "image/jpeg")},
        )
        print(f"Image {i}: {response.status_code} {response.text}")

    # cleanup: remove flag file only after all images have been uploaded
    if os.path.exists(DATA_PATH + "/SUCCESS.txt"):
        os.remove(DATA_PATH + "/SUCCESS.txt")

if __name__ == '__main__':
    main()
