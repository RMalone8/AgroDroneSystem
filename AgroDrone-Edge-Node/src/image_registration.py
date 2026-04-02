import cv2
import numpy as np

MAX_NUM_FEATURES = 500

def register_images(rgb_path, nir_path, num_image):
    '''
    Function that warps image 2 to the perspective of image 1.
    Image 1 should always be the RGB image.
    '''
    im1 = cv2.imread(rgb_path)
    im2 = cv2.imread(nir_path)

    im1_gray = cv2.cvtColor(im1, cv2.COLOR_BGR2GRAY)
    im2_gray = cv2.cvtColor(im2, cv2.COLOR_BGR2GRAY)

    # detecting ORB key features and computing descriptors
    '''
    Key points are interesting features in each image that are usually associated
    with some sharp edge or corner, described by pixel coords / size / orientation.

    descriptors are vectors describing region around the key point, acting as a
    signature for the key point. If we're looking for the same key point in
    different images, we can use the descriptors to mathc them up
    '''

    fast = cv2.FastFeatureDetector_create(threshold=40, nonmaxSuppression=True)
    kfa = cv2.ORB_create(MAX_NUM_FEATURES)

    keypoints1 = fast.detect(im1_gray, None)
    keypoints2 = fast.detect(im2_gray, None)
    keypoints1, descriptors1 = kfa.compute(im1_gray, keypoints1)
    keypoints2, descriptors2 = kfa.compute(im2_gray, keypoints2)

    # matching features through brute force matching algorithm, and metric to compute 'distance'
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

    # find the best two matches for each descriptor
    knn_matches = bf.knnMatch(descriptors1, descriptors2, k=2)

    # Lowe's ratio test to determine valuable matches
    good_matches = [m for m, n in knn_matches if m.distance < 0.75 * n.distance]
    print("We have this many good matches: ", len(good_matches))
    if len(good_matches) < 4:
        good_matches = [m for m, n in knn_matches]

    pts1 = np.float32([keypoints1[m.queryIdx].pt for m in good_matches])
    pts2 = np.float32([keypoints2[m.trainIdx].pt for m in good_matches])

    M, _ = cv2.estimateAffinePartial2D(pts2, pts1, method=cv2.RANSAC, ransacReprojThreshold=3.0)

    height, width = im1.shape[:2]
    im2_reg = cv2.warpAffine(im2, M, (width, height))

    out_path = f"data/aligned/output_test_align_{num_image}.jpg"

    cv2.imwrite(out_path, im2_reg)

    return out_path