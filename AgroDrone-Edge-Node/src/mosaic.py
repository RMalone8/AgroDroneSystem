import json
from dotenv import load_dotenv
import os
import requests
#import image_registration_service
#import ndvi_processor
#import data_fusion_service

load_dotenv()

BACKEND_URL  = os.getenv("BACKEND_URL")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN")
DEVICE_ID    = os.getenv("DEVICE_ID")
DATA_PATH    = os.getenv("DATA_PATH")

def main():
    '''
    with open(DATA_PATH + "/metadata.json") as f:
        metadata = json.load(f)

    
    ndvi_images = []
    for i, image_data in enumerate(metadata["images"]):
        # align the rgb and nir images
        aligned_nir_path = image_registration_service.register_images(image_data["rgb_path"], image_data["nir_path"], i) # should be the image, not a path

        # process them for ndvi
        ndvi_path = ndvi_processor.process_ndvi(image_data["rgb_path"], aligned_nir_path, i)
        ndvi_images.append(ndvi_path)

    # fuse all of the ndvi images together
    data_fusion_service.fuse_images(ndvi_images) # honestly, should we even fuse? Maybe we'll just send them all up individually and have the frontend map them...

    # TODO: compress the images and then send the them to the cloud!
    '''

    # send the final mosaic to the cloud
    with open("/Users/ryanmalone/Desktop/SeniorDesign/AgroDrone-Edge-Node/ingest/agrodronelogo.png", "rb") as f: 
        files = {"mosaic": ( "test_image.jpg", f, "image/jpeg" )}
        response = requests.post(
            BACKEND_URL + "/mosaic",
            headers={
                "Authorization": "Bearer " + DEVICE_TOKEN,
                "X-Device-Id": DEVICE_ID,
            },
            files=files,
        )
        
    # cleanup: remove flag directory
    if os.path.exists(DATA_PATH + "/SUCCESS.txt"):
        os.remove(DATA_PATH + "/SUCCESS.txt")
        
    print(response.status_code, response.text)

if __name__ == '__main__':
    main()