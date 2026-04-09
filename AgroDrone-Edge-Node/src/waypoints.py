# Latitude is X 
# Longitude is Y 

import json
import math
import csv

MAX_WAYPOINTS = 120
H_MAX = 70
MAX_ITERS = 6

def _point_in_polygon(lat, lon, poly):
    """
    lat, lon: point
    poly: list of (lat, lon) vertices, in order (clockwise or ccw)
    Returns True if point is inside polygon (or on edge).
    """
    inside = False
    n = len(poly)

    for i in range(n):
        lat1, lon1 = poly[i]
        lat2, lon2 = poly[(i + 1) % n]

        # Check if point is on an edge (optional but nice)
        # Colinearity + within bounding box
        eps = 1e-15
        cross = (lon - lon1) * (lat2 - lat1) - (lat - lat1) * (lon2 - lon1)
        if abs(cross) < eps:
            if (min(lat1, lat2) - eps <= lat <= max(lat1, lat2) + eps and
                min(lon1, lon2) - eps <= lon <= max(lon1, lon2) + eps):
                return True

        # Ray casting
        intersects = ((lon1 > lon) != (lon2 > lon))
        if intersects:
            # latitude where the edge crosses this lon
            lat_at_cross = lat1 + (lat2 - lat1) * (lon - lon1) / (lon2 - lon1)
            if lat_at_cross > lat:
                inside = not inside

    return inside


def _meters_to_latlon(dx_m, dy_m, lat_deg):
    # dx_m: east(+), west(-) in meters
    # dy_m: north(+), south(-) in meters
    deg_per_m_lat = 1.0 / 111111.0
    deg_per_m_lon = 1.0 / (111111.0 * math.cos(math.radians(lat_deg)))

    dlat = dy_m * deg_per_m_lat
    dlon = dx_m * deg_per_m_lon
    return dlat, dlon


def _fov_corners(lat, lon, cam_W_m, cam_H_m, yaw_deg=0.0):
    # cam_W_m = footprint width in meters
    # cam_H_m = footprint height in meters
    half_w = cam_W_m / 2.0
    half_h = cam_H_m / 2.0

    # corners around center BEFORE rotation (dx, dy) meters
    corners = [
        (-half_w, -half_h),  # bottom-left
        ( half_w, -half_h),  # bottom-right
        ( half_w,  half_h),  # top-right
        (-half_w,  half_h),  # top-left
    ]

    yaw = math.radians(yaw_deg)
    cos_y = math.cos(yaw)
    sin_y = math.sin(yaw)

    out = []
    for (dx, dy) in corners:
        # rotate around center
        rx = dx * cos_y - dy * sin_y
        ry = dx * sin_y + dy * cos_y

        dlat, dlon = _meters_to_latlon(rx, ry, lat)
        out.append((lat + dlat, lon + dlon))

    return out

def _compute_camera_footprint(altitude, horiz_FOV_deg, vert_FOV_deg):
    """
    Computes ground-projected camera footprint dimensions in meters.
    """
    cam_W = 2 * altitude * math.tan(math.radians(horiz_FOV_deg / 2.0))
    cam_H = 2 * altitude * math.tan(math.radians(vert_FOV_deg / 2.0))
    return cam_W, cam_H

def _compute_bounding_square(coordinates):
    """
    Builds square that encloses the user define area using max distance 
    Returns 
        center_x, center_y,
        x_min_square, x_max_square,
        y_min_square, y_max_square
    """
    list_of_x, list_of_y = zip(*coordinates)

    x_min, x_max = min(list_of_x), max(list_of_x)
    y_min, y_max = min(list_of_y), max(list_of_y)

    # print(x_min, x_max)
    # print(y_min, y_max)

    # Finding center point 
    center_x = (x_max + x_min) / 2.0
    center_y = (y_max + y_min) / 2.0
    center = (center_x, center_y)

    dist = []
    print(len(coordinates))
    for i in range(len(coordinates)):
        d = math.dist(center, coordinates[i])
        dist.append(abs(d))
    
    max_dist_from_center = max(dist)

    # Big square bounds 
    x_min_square = center_x - max_dist_from_center
    x_max_square = center_x + max_dist_from_center
    y_min_square = center_y - max_dist_from_center
    y_max_square = center_y + max_dist_from_center 

    return center_x, center_y, x_min_square, x_max_square, y_min_square, y_max_square

def _generate_snaking_waypoints(
    x_min_square,
    x_max_square,
    y_min_square,
    y_max_square,
    altitude,
    horiz_FOV_deg,
    vert_FOV_deg,
    center_lat,
    start_order=1
):
    """
    Generates waypoints in a snaking pattern over the bounding box 
    Returns
        waypoints_out: list of (order, lat, lon)
        cam_W: footprint width in meters
        cam_H: footprint height in meters
        dlat: latitude step size in degrees
        dlon: longitude step size in degrees
    """
    cam_W, cam_H = _compute_camera_footprint(altitude, horiz_FOV_deg, vert_FOV_deg)

    deg_per_m_lat = 1.0 / 111111.0
    deg_per_m_lon = 1.0 / (111111.0 * math.cos(math.radians(center_lat)))

    dlat = cam_H * deg_per_m_lat
    dlon = cam_W * deg_per_m_lon

    # Finding big square bottom left 
    start_lat = x_min_square + dlat / 2.0
    end_lat   = x_max_square - dlat / 2.0
    start_lon = y_min_square + dlon / 2.0
    end_lon   = y_max_square - dlon / 2.0

    # Snaking algorithm 
    waypoints_out = []
    row = 0
    lat = start_lat

    order = start_order
    while lat <= end_lat + 1e-12:  
        if row % 2 == 0:
            # left -> right in longitude
            lon = start_lon
            while lon <= end_lon + 1e-12:
                waypoints_out.append((order,lat,lon))
                order += 1
                lon += dlon
        else:
            # right -> left in longitude
            lon = end_lon
            while lon >= start_lon - 1e-12:
                ##waypoints_out.append({"order": order, "lat": lat, "lng": lon})
                waypoints_out.append((order,lat,lon))
                order += 1
                lon -= dlon

        lat += dlat
        row += 1

    return waypoints_out, cam_W, cam_H, dlat, dlon

def _filter_waypoints_to_polygon(waypoints, poly):
    """
    Filters generated waypointsd so only thoses inside he user defined area are kept
    """
    filtered = []
    for (order, lat, lon) in waypoints:
        if _point_in_polygon(lat, lon, poly):
            filtered.append({"order": order, "lat": lat, "lng": lon})
    return filtered

def create_waypoints(data):

    # Accept either "vertices" (backend flight plan object) or "waypoints" (legacy)
    raw_vertices = data.get("vertices") or data.get("waypoints") or []

    # Extract (x, y) = (lat, lng)
    coordinates = [(wp["lat"], wp["lng"]) for wp in raw_vertices]

    print("Polygon coordinates:")
    print(coordinates) # print user defined input

    poly = [(wp["lat"], wp["lng"]) for wp in raw_vertices]
    center_x, center_y, x_min_square, x_max_square, y_min_square, y_max_square = _compute_bounding_square(coordinates)

    print("Center:", (center_x, center_y))
    print("Bounding square:")
    print(x_min_square, x_max_square, y_min_square, y_max_square)

    horiz_FOV = 62.2
    vert_FOV = 48.8
    altitude = 30 # default altitude in meters
    it = 0

    while True:
        waypoints_out, cam_W, cam_H, dlat, dlon = _generate_snaking_waypoints(
            x_min_square=x_min_square,
            x_max_square=x_max_square,
            y_min_square=y_min_square,
            y_max_square=y_max_square,
            altitude=altitude,
            horiz_FOV_deg=horiz_FOV,
            vert_FOV_deg=vert_FOV,
            center_lat=center_x,
            start_order=1
        )
        
        waypoints_filtered = _filter_waypoints_to_polygon(waypoints_out, poly)

        print(f"Iteration {it + 1}: altitude = {altitude:.2f} m, filtered waypoints = {len(waypoints_filtered)}")

        if len(waypoints_filtered) <= MAX_WAYPOINTS:
            break

        scale = math.sqrt(len(waypoints_filtered) / MAX_WAYPOINTS)
        altitude = min(altitude * scale, H_MAX)

        it += 1
        if it >= MAX_ITERS:
            print("Warning: reached iteration cap.")
            break

    print("Final altitude:", altitude)
    print("Final filtered waypoints:", len(waypoints_filtered))

    return {"waypoints": waypoints_filtered, "totalWaypoints": len(waypoints_filtered)}