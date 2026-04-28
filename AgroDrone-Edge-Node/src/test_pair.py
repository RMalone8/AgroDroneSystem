import image_registration
import ndvi
BASE_IMG_PATH = "/Users/ryanmalone/Desktop/flightplans/9ec1bbbb-6c47-4dd1-8f7d-740d14d00c11/a711db20-3073-4755-a097-e2c8a31261a0"
RGB_PATH = BASE_IMG_PATH + "/" + "20260427_201809_047301_cam1.jpg"
NIR_PATH = BASE_IMG_PATH + "/" + "20260427_201809_047301_cam0.jpg"
OUT_DIR  = "/Users/ryanmalone/Desktop/SeniorDesign/AgroDroneSystem/AgroDrone-Edge-Node/src/test"

def main():
    aligned_nir_path = image_registration.register_images(RGB_PATH, NIR_PATH, 0, out_dir=OUT_DIR)
    ndvi.process_ndvi(RGB_PATH, aligned_nir_path, 0, out_dir=OUT_DIR)

if __name__ == "__main__":
    main()
