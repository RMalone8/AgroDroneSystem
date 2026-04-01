export default {
    // mosaic functions
    async mosaicRetrieval(env, user_id) {
        const path = `data/${user_id}/mosaic/mosaic1.jpg`;
    
        return await env.BUCKET.get(path);
    },

    async mosaicUpload(env, user_id, content) {
        const path = `data/${user_id}/mosaic/mosaic1.jpg`;
    
        const object = await env.BUCKET.put(path, content, {
            httpMetadata: { contentType: "image/jpeg"}
        });
    
        console.log(`Successfully uploaded ${object.key} to R2`);
        return object;
    },

    //flight plan functions
    async flightPlanUpload(env, user_id, content) {
        // getting metadata file
        const metadata_path = `data/${user_id}/fp/.metadata`;
        const meta_obj = await env.BUCKET.get(metadata_path);
        const now = new Date().toISOString();

        let metadata = {};

        if (!meta_obj) // creating the metadata file for the first time
        {
            metadata = {
                "createdAt": now,
                "lastUpdatedAt": now,
                "currentFlightPlan": null,
                "totalFlightPlans": 0,
                "flightPlanPaths": []
            }
        } else {
            metadata = await meta_obj.json();
        }

        // adjust metadata for new flight plan
        metadata["lastUpdatedAt"] = now;
        metadata["currentFlightPlan"] = `${content.missionId}`;
        const fp_path = `data/${user_id}/fp/${metadata["currentFlightPlan"]}.json`;
        if (!metadata["flightPlanPaths"].includes(fp_path)) {
            metadata["flightPlanPaths"].push(fp_path);
            metadata["totalFlightPlans"]++;
        }

        // write flight plan to storage
        const fp_object = await env.BUCKET.put(fp_path, JSON.stringify(content), {
            httpMetadata: { contentType: "application/json"}
        });
    
        console.log(`Successfully uploaded ${fp_object.key} to R2`);
        
        // save metadata
        const meta_obj2 = await env.BUCKET.put(metadata_path, JSON.stringify(metadata), {
            httpMetadata: { contentType: "application/json"}
        });

        console.log(`Successfully updated metadata ${meta_obj2.key}`)

        return fp_object;
    },

    async flightPlanRetrieval(env, user_id) {
        // getting metadata file
        const metadata_path = `data/${user_id}/fp/.metadata`;
        const meta_obj = await env.BUCKET.get(metadata_path);
        
        if (!meta_obj) // we don't have any flight plans
        {
            console.error("No Flight Plans to Retrieve");
            return null;
        }

        const metadata = await meta_obj.json();

        // get active flight plan
        const fp_path = [metadata["currentFlightPlan"]];
    
        const data = await env.BUCKET.get(fp_path);

        return await data.json();
    },

    async flightPlanDeletion(env, user_id, mission_Id) {
        // getting metadata file
        const fp_path = `data/${user_id}/fp/${mission_Id}.json`;
        const metadata_path = `data/${user_id}/fp/.metadata`;
        const meta_obj = await env.BUCKET.get(metadata_path);
        const now = new Date().toISOString();

        if (!meta_obj) // we don't have any flight plans
        {
            console.error("No Flight Plans to Retrieve");
            return null;
        }

        const metadata = await meta_obj.json();

        try {
            let check = await env.BUCKET.head(fp_path)
            if (check) {
                console.log(fp_path);

                await env.BUCKET.delete(fp_path);
                metadata["lastUpdatedAt"] = now;
                metadata["flightPlanPaths"] = metadata["flightPlanPaths"].filter((p) => p !== fp_path);
                metadata["totalFlightPlans"] = metadata["flightPlanPaths"].length;
                metadata["currentFlightPlan"] = null;
                await env.BUCKET.put(metadata_path, JSON.stringify(metadata), {
            httpMetadata: { contentType: "application/json"}
        });
            } else {
                console.log("This Flight Plan does not Exist / Was Already Deleted");
            }
        } catch (e) {
            console.log("Error deleting this flight plan: ", e);
        }
    },

    async setActiveFlightPlan(env, user_id, mission_id) {
        const metadata_path = `data/${user_id}/fp/.metadata`;
        const meta_obj = await env.BUCKET.get(metadata_path);

        if (!meta_obj) {
            console.error("No Flight Plans to Retrieve");
            return null;
        }

        const metadata = await meta_obj.json();
        const fp_path = `data/${user_id}/fp/${mission_id}.json`;

        const fp_obj = await env.BUCKET.get(fp_path);
        if (!fp_obj) {
            console.error("Flight plan not found:", mission_id);
            return null;
        }

        const flightplan = await fp_obj.json();

        metadata["lastUpdatedAt"] = new Date().toISOString();
        metadata["currentFlightPlan"] = mission_id;

        await env.BUCKET.put(metadata_path, JSON.stringify(metadata), {
            httpMetadata: { contentType: "application/json" }
        });

        return flightplan;
    },

    // ── Base station position ─────────────────────────────────────────────────

    async getBaseStationPosition(env, user_id) {
        const metadata_path = `data/${user_id}/fp/.metadata`;
        const meta_obj = await env.BUCKET.get(metadata_path);
        if (!meta_obj) return null;
        const metadata = await meta_obj.json();
        return metadata["lastBaseStationPosition"] ?? null;
    },

    async updateBaseStationPosition(env, user_id, lat, lng) {
        const metadata_path = `data/${user_id}/fp/.metadata`;
        const meta_obj = await env.BUCKET.get(metadata_path);
        const now = new Date().toISOString();

        let metadata = {};
        if (!meta_obj) {
            // Create minimal metadata if none exists yet
            metadata = {
                "createdAt": now,
                "lastUpdatedAt": now,
                "currentFlightPlan": null,
                "totalFlightPlans": 0,
                "flightPlanPaths": [],
            };
        } else {
            metadata = await meta_obj.json();
        }

        metadata["lastBaseStationPosition"] = [lat, lng];
        metadata["lastUpdatedAt"] = now;

        await env.BUCKET.put(metadata_path, JSON.stringify(metadata), {
            httpMetadata: { contentType: "application/json" }
        });
    },

    async allFlightPlanRetrieval(env, user_id) {
        // getting metadata file
        const metadata_path = `data/${user_id}/fp/.metadata`;
        const meta_obj = await env.BUCKET.get(metadata_path);

        if (!meta_obj) // we don't have any flight plans
        {
            console.error("No Flight Plans to Retrieve");
            return null;
        }

        const metadata = await meta_obj.json();

        console.log(metadata);

        // get all of the flight plans
        const promises = metadata["flightPlanPaths"].map(fp_path => env.BUCKET.get(fp_path));
        const responses = await Promise.all(promises);
        const flightplans = await Promise.all(responses.filter(res => res !== null).map(res => res.json()));

        return {"metadata": metadata,
            "flightplans": flightplans};
    },

    async waypointsUpload(env, user_id, mission_id, waypoints) {
        const path = `data/${user_id}/fp/${mission_id}_waypoints.json`;
        await env.BUCKET.put(path, JSON.stringify(waypoints), {
            httpMetadata: { contentType: "application/json" }
        });
    },

    async waypointsRetrieval(env, user_id, mission_id) {
        const path = `data/${user_id}/fp/${mission_id}_waypoints.json`;
        const obj = await env.BUCKET.get(path);
        if (!obj) return null;
        return await obj.json();
    },

}