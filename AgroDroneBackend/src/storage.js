export default {
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
        const fp_path = `data/${user_id}/fp/${content.fpid}.json`;
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

    async flightPlanDeletion(env, user_id, fpid) {
        // getting metadata file
        const fp_path = `data/${user_id}/fp/${fpid}.json`;
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

    async setActiveFlightPlan(env, user_id, fpid) {
        const metadata_path = `data/${user_id}/fp/.metadata`;
        const meta_obj = await env.BUCKET.get(metadata_path);

        if (!meta_obj) {
            console.error("No Flight Plans to Retrieve");
            return null;
        }

        const metadata = await meta_obj.json();
        const fp_path = `data/${user_id}/fp/${fpid}.json`;

        const fp_obj = await env.BUCKET.get(fp_path);
        if (!fp_obj) {
            console.error("Flight plan not found:", fpid);
            return null;
        }

        const flightplan = await fp_obj.json();

        metadata["lastUpdatedAt"] = new Date().toISOString();
        metadata["currentFlightPlan"] = fpid;

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

    async waypointsUpload(env, user_id, fpid, waypoints) {
        const path = `data/${user_id}/fp/${fpid}_waypoints.json`;
        await env.BUCKET.put(path, JSON.stringify(waypoints), {
            httpMetadata: { contentType: "application/json" }
        });
    },

    async waypointsRetrieval(env, user_id, fpid) {
        const path = `data/${user_id}/fp/${fpid}_waypoints.json`;
        const obj = await env.BUCKET.get(path);
        if (!obj) return null;
        return await obj.json();
    },

    async sensorImageUpload(env, userId, fpid, mid, index, imageContent, imageMeta) {
        const imagePath = `data/${userId}/fp/${fpid}/${mid}/${index}_ndvi.png`;
        await env.BUCKET.put(imagePath, imageContent, {
            httpMetadata: { contentType: "image/png" }
        });

        // Check if this mission already has a .metadata file
        const missionMetaPath = `data/${userId}/fp/${fpid}/${mid}/.metadata`;
        const existing = await env.BUCKET.get(missionMetaPath);

        let missionMeta;
        if (!existing) {
            // First upload for this mid — create mission metadata
            const now = new Date().toISOString();
            missionMeta = { fpid, mid, createdAt: now, images: [] };

            // Append this mission to the flight plan's own .metadata
            const fpMetaPath = `data/${userId}/fp/${fpid}/.metadata`;
            const fpMetaObj = await env.BUCKET.get(fpMetaPath);
            const fpMeta = fpMetaObj ? await fpMetaObj.json() : { fpid, missions: [] };
            if (!fpMeta.missions) fpMeta.missions = [];
            fpMeta.missions.push({ mid, createdAt: now });
            await env.BUCKET.put(fpMetaPath, JSON.stringify(fpMeta), {
                httpMetadata: { contentType: "application/json" }
            });
        } else {
            missionMeta = await existing.json();
        }

        // Upsert by index — replace existing entry if re-uploaded, otherwise append
        const existing_idx = missionMeta.images.findIndex(img => img.index === index);
        if (existing_idx >= 0) {
            missionMeta.images[existing_idx] = { index, path: imagePath, ...imageMeta };
        } else {
            missionMeta.images.push({ index, path: imagePath, ...imageMeta });
        }
        await env.BUCKET.put(missionMetaPath, JSON.stringify(missionMeta), {
            httpMetadata: { contentType: "application/json" }
        });
    },

    async deleteMission(env, userId, fpid, mid) {
        const prefix = `data/${userId}/fp/${fpid}/${mid}/`;

        // Delete every R2 object under this mission prefix
        let cursor;
        do {
            const listed = await env.BUCKET.list({ prefix, cursor });
            await Promise.all(listed.objects.map(obj => env.BUCKET.delete(obj.key)));
            cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);

        // Remove this mid from the flight plan's mission list
        const fpMetaPath = `data/${userId}/fp/${fpid}/.metadata`;
        const fpMetaObj = await env.BUCKET.get(fpMetaPath);
        if (fpMetaObj) {
            const fpMeta = await fpMetaObj.json();
            if (fpMeta.missions) {
                fpMeta.missions = fpMeta.missions.filter(m => m.mid !== mid);
                await env.BUCKET.put(fpMetaPath, JSON.stringify(fpMeta), {
                    httpMetadata: { contentType: "application/json" }
                });
            }
        }
    },

    async getAllSensorData(env, userId) {
        const globalMetaObj = await env.BUCKET.get(`data/${userId}/fp/.metadata`);
        if (!globalMetaObj) return { flightPlans: [] };
        const globalMeta = await globalMetaObj.json();

        const flightPlans = await Promise.all(
            (globalMeta.flightPlanPaths ?? []).map(async (fpPath) => {
                const fpObj = await env.BUCKET.get(fpPath);
                if (!fpObj) return null;
                const fp = await fpObj.json();

                const fpMetaObj = await env.BUCKET.get(`data/${userId}/fp/${fp.fpid}/.metadata`);
                const missions = fpMetaObj ? (await fpMetaObj.json()).missions ?? [] : [];

                return {
                    fpid:        fp.fpid,
                    missionName: fp.missionName ?? null,
                    createdAt:   fp.createdAt,
                    frequency:   fp.frequency ?? null,
                    missions:    missions.slice().sort((a, b) =>
                        new Date(b.createdAt) - new Date(a.createdAt)),
                };
            })
        );
        return { flightPlans: flightPlans.filter(Boolean) };
    },

    async getMissionMetadata(env, userId, fpid, mid) {
        const path = `data/${userId}/fp/${fpid}/${mid}/.metadata`;
        const obj = await env.BUCKET.get(path);
        if (!obj) return null;
        return await obj.json();
    },

    async getSensorImageFile(env, userId, fpid, mid, index) {
        const path = `data/${userId}/fp/${fpid}/${mid}/${index}_ndvi.png`;
        return await env.BUCKET.get(path);
    },

}