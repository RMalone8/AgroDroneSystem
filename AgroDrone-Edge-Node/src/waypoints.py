import json
import math
import time

def point_in_polygon(lat, lon, poly):
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

        # Ray casting: does the edge cross the horizontal ray to the right of the point?
        intersects = ((lon1 > lon) != (lon2 > lon))
        if intersects:
            # latitude where the edge crosses this lon
            lat_at_cross = lat1 + (lat2 - lat1) * (lon - lon1) / (lon2 - lon1)
            if lat_at_cross > lat:
                inside = not inside

    return inside


def create_waypoints(flight_plan: dict):
    # Extract (x, y) = (lng, lat)
    coordinates = []
    wps = flight_plan["vertices"]
    # all but the last (duplicate)
    for i in range(len(flight_plan["vertices"]) - 1):
        x = wps[i]["lat"]
        y = wps[i]["lng"]
        coordinates.append((x, y))

    #print(coordinates)

    # Find the max and min x and y 
    list_of_x, list_of_y = zip(*coordinates) 

    x_min, x_max = min(list_of_x), max(list_of_x)
    y_min, y_max = min(list_of_y), max(list_of_y)

    #print(x_min, x_max)
    #print(y_min, y_max)

    big_square_length = x_min + x_max 

    # Finding center point 
    center_x = (x_max + x_min) / 2.0
    center_y = (y_max + y_min) / 2.0

    width  = x_max - x_min   # total width of square (meters)
    height = y_max - y_min

    # Defining Bounds of Big Square 
    side_length = min(width, height)
    half_side = side_length / 2.0

    x_left   = center_x - half_side
    x_right  = center_x + half_side
    y_bottom = center_y - half_side
    y_top    = center_y + half_side

    center = (center_x, center_y)
    #print("the center is", center)

    dist = []
    #print(len(coordinates))
    for i in range(len(coordinates)):
        d = math.dist(center, coordinates[i])
        dist.append(abs(d))

    max_dist_from_center = max(dist)
    #print(max_dist_from_center)

    # Big square bounds 
    x_min_square = center_x - max_dist_from_center
    #print("x_left", x_min_square, "\n")
    x_max_square = center_x + max_dist_from_center
    y_min_square = center_y - max_dist_from_center
    y_max_square = center_y + max_dist_from_center 

    # Convert the FOV of camera into change in lat and change in long 
    horiz_FOV = 62.2
    vert_FOV = 48.8
    altitude = 30  #in meters 

    cam_W = 2 * altitude * math.tan(math.radians(horiz_FOV/2)) 
    cam_H = 2 * altitude * math.tan(math.radians(vert_FOV/2)) 

    deg_per_m_lat = 1.0 / 111111.0
    deg_per_m_lon = 1.0 / (111111.0 * math.cos(math.radians(center_x)))

    # print("Change in Latitude:", change_in_lat)
    # print("Change in Longitude:", change_in_long)

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

    order = 1
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

    #print("Generated waypoints:", len(waypoints_out))
    #print(waypoints_out, "\n")

    # Bounds checking 

    waypoints_filtered = []
    count = 0
    for (order,x,y) in waypoints_out:
        if x > x_min and x < x_max and y > y_min and y < y_max: 
            waypoints_filtered.append({"order": count, "lat": x, "lng": y})
            count += 1

    #print("Filtered waypoints:", len(waypoints_filtered))
    #print(waypoints_filtered)

    return {
            "missionId": flight_plan["missionId"],
            "createdAt": flight_plan["createdAt"], 
            "totalWaypoints": len(waypoints_filtered),
            "waypoints": waypoints_filtered
        }