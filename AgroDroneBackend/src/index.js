import { connect as tcpConnect } from "cloudflare:sockets";
import storage from "./storage";
import {
  hashPassword,
  verifyPassword,
  signJWT,
  verifyJWT,
  createUser,
  getUserByEmail,
  createDeviceToken,
  verifyDeviceToken,
  listAllUsers,
  deleteUser,
  listDevicesForUser,
  listAllDevices,
  storeAccessToken,
  validateAndConsumeAccessToken,
} from "./auth";

// ── Minimal MQTT 3.1.1 publisher over raw TCP ─────────────────────────────────

function varInt(n) {
    const out = [];
    do {
        let b = n & 0x7f;
        n >>>= 7;
        if (n > 0) b |= 0x80;
        out.push(b);
    } while (n > 0);
    return new Uint8Array(out);
}

function cat(...arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
}

function strField(s) {
    const b = new TextEncoder().encode(s);
    return cat(new Uint8Array([b.length >> 8, b.length & 0xff]), b);
}

function mqttConnect(clientId, username = null, password = null) {
    // Connect flags: username(7) | password(6) | clean-session(1)
    const flags = (username ? 0x80 : 0) | (password ? 0x40 : 0) | 0x02;
    const hdr = new Uint8Array([
        0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
        0x04,       // protocol level 3.1.1
        flags,
        0x00, 0x3c, // keep-alive 60 s
    ]);
    let remaining = cat(hdr, strField(clientId));
    if (username) remaining = cat(remaining, strField(username));
    if (password) remaining = cat(remaining, strField(password));
    return cat(new Uint8Array([0x10]), varInt(remaining.length), remaining);
}

function mqttPublish(topic, payload) {
    const remaining = cat(strField(topic), new TextEncoder().encode(payload));
    return cat(new Uint8Array([0x30]), varInt(remaining.length), remaining);
}

// Opens a raw MQTT TCP connection, publishes one message, then disconnects.
// username/password are optional — omit for brokers with allow_anonymous true.
async function mqttPublishOnce(host, port, topic, payload, username = null, password = null) {
    const socket = tcpConnect({ hostname: host, port: Number(port) });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    try {
        await writer.write(mqttConnect("agrodrone-backend", username, password));

        const { value: connack } = await Promise.race([
            reader.read(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("CONNACK timeout")), 5000)),
        ]);
        if (!connack || connack[0] !== 0x20) {
            throw new Error(`Expected CONNACK, got 0x${connack?.[0]?.toString(16) ?? "nothing"}`);
        }
        if (connack[3] !== 0x00) {
            throw new Error(`CONNACK refused, code 0x${connack[3].toString(16)}`);
        }

        await writer.write(mqttPublish(topic, payload));
        await new Promise(r => setTimeout(r, 50));
        await writer.write(new Uint8Array([0xe0, 0x00])); // DISCONNECT
    } finally {
        try { reader.releaseLock(); } catch (_) {}
        try { writer.releaseLock(); } catch (_) {}
        await socket.close().catch(() => {});
    }
}

async function publishFlightPlan(host, port, userId, flightplan, adminUser, adminPass) {
    const topic = `${userId}/flightplan`;
    await mqttPublishOnce(host, port, topic, JSON.stringify(flightplan), adminUser, adminPass);
}

// Fire-and-forget: send Dynamic Security commands to Mosquitto's control channel.
// The broker processes commands asynchronously; we don't wait for a response.
async function publishDynsecCommand(host, port, adminUser, adminPass, commands) {
    const payload = JSON.stringify({ commands });
    await mqttPublishOnce(
        host, port,
        "$CONTROL/dynamic-security/v1",
        payload,
        adminUser, adminPass,
    );
}

// ── JWT duration ──────────────────────────────────────────────────────────────

const JWT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        const requestOrigin = request.headers.get("Origin") ?? "";
        const allowedOrigins = (env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:5174").split(",");
        const allowedOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
        const corsHeaders = {
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE, PUT",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Id",
            "Vary": "Origin",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const contentLength = parseInt(request.headers.get("content-length") || "0");
        if (request.method === "POST" && contentLength > 10 * 1024 * 1024) {
            return new Response("Payload too large", { status: 413, headers: corsHeaders });
        }

        // ── Public auth routes (no JWT required) ──────────────────────────────

        if (url.pathname === "/auth/register" && request.method === "POST") {
            try {
                const { email, password, accessToken } = await request.json();

                if (!email || !password || !accessToken) {
                    return new Response("Missing fields", { status: 400, headers: corsHeaders });
                }

                // Validate access token — determines role ('admin' | 'client' | null)
                const role = await validateAndConsumeAccessToken(
                    env.USERS_KV,
                    accessToken,
                    env.VALID_ACCESS_TOKENS,
                    env.VALID_ADMIN_ACCESS_TOKENS,
                );
                if (!role) {
                    return new Response("Invalid access token", { status: 403, headers: corsHeaders });
                }

                const passwordHash = await hashPassword(password);
                const userId = crypto.randomUUID();

                await createUser(env.USERS_KV, { email, passwordHash, userId, role });

                const token = await signJWT({ userId, email, role }, env.JWT_SECRET, JWT_TTL_SECONDS);

                // Issue an MQTT token and provision the broker client immediately,
                // same as login — so the frontend can subscribe to telemetry right away.
                const mqttToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');

                if (env.MQTT_BROKER_HOST && role === 'client') {
                    try {
                        await publishDynsecCommand(
                            env.MQTT_BROKER_HOST, env.MQTT_BROKER_PORT ?? 1883,
                            env.MQTT_ADMIN_USERNAME, env.MQTT_ADMIN_PASSWORD,
                            [
                                {
                                    command: "createRole",
                                    rolename: `frontend-${userId}`,
                                    acls: [
                                        { acltype: "subscribePattern",  topic: `${userId}/telemetry`,  allow: true },
                                        { acltype: "subscribePattern",  topic: `${userId}/flightplan`, allow: true },
                                        { acltype: "publishClientSend", topic: `${userId}/emergency`,  allow: true },
                                    ],
                                },
                                {
                                    command: "createClient",
                                    username: userId,
                                    password: mqttToken,
                                    roles: [{ rolename: `frontend-${userId}` }],
                                },
                            ],
                        );
                    } catch (e) {
                        console.error("Dynsec register setup failed:", e.message);
                        return Response.json(
                            { error: "MQTT broker provisioning failed", detail: e.message },
                            { status: 502, headers: corsHeaders },
                        );
                    }
                }

                return Response.json({ token, userId, role, mqttToken }, { headers: corsHeaders });
            } catch (e) {
                if (e.message === "EMAIL_TAKEN") {
                    return new Response("Email already registered", { status: 409, headers: corsHeaders });
                }
                console.error("Register error:", e.message);
                return new Response("Internal error", { status: 500, headers: corsHeaders });
            }
        }

        if (url.pathname === "/auth/login" && request.method === "POST") {
            try {
                const { email, password } = await request.json();

                if (!email || !password) {
                    return new Response("Missing fields", { status: 400, headers: corsHeaders });
                }

                const user = await getUserByEmail(env.USERS_KV, email);
                if (!user) {
                    return new Response("Invalid credentials", { status: 401, headers: corsHeaders });
                }

                const ok = await verifyPassword(password, user.passwordHash);
                if (!ok) {
                    return new Response("Invalid credentials", { status: 401, headers: corsHeaders });
                }

                const role = user.role ?? 'client';
                const token = await signJWT({ userId: user.userId, email, role }, env.JWT_SECRET, JWT_TTL_SECONDS);

                // Issue a short-lived MQTT password for the frontend's broker connection.
                const mqttToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');

                // Provision / refresh the frontend client in Mosquitto Dynamic Security.
                // Must complete before returning so the frontend can connect immediately.
                if (env.MQTT_BROKER_HOST) {
                    const { userId: uid } = user;
                    await publishDynsecCommand(
                        env.MQTT_BROKER_HOST, env.MQTT_BROKER_PORT ?? 1883,
                        env.MQTT_ADMIN_USERNAME, env.MQTT_ADMIN_PASSWORD,
                        [
                            // Create the per-user frontend role (idempotent — ignored if exists)
                            {
                                command: "createRole",
                                rolename: `frontend-${uid}`,
                                acls: [
                                    { acltype: "subscribePattern",   topic: `${uid}/telemetry`,  allow: true },
                                    { acltype: "subscribePattern",   topic: `${uid}/flightplan`, allow: true },
                                    { acltype: "publishClientSend",  topic: `${uid}/emergency`,  allow: true },
                                ],
                            },
                            // Create if new (no-op if exists), then always refresh the password.
                            {
                                command: "createClient",
                                username: uid,
                                password: mqttToken,
                                roles: [{ rolename: `frontend-${uid}` }],
                            },
                            { command: "setClientPassword", username: uid, password: mqttToken },
                        ],
                    );
                }

                return Response.json({ token, userId: user.userId, role, mqttToken }, { headers: corsHeaders });
            } catch (e) {
                console.error("Login error:", e.message);
                return new Response("Internal error", { status: 500, headers: corsHeaders });
            }
        }

        // ── Auth middleware: accepts JWT (frontend) or device token (edge node) ──

        const bearerToken = request.headers.get("Authorization")?.replace("Bearer ", "");
        let userId = null;
        let userRole = null;

        const jwtClaims = await verifyJWT(bearerToken, env.JWT_SECRET);
        if (jwtClaims) {
            userId   = jwtClaims.userId;
            userRole = jwtClaims.role ?? 'client';
        } else {
            // Try device token — edge nodes send X-Device-Id header alongside Bearer token
            const deviceId = request.headers.get("X-Device-Id");
            const device = await verifyDeviceToken(env.DEVICE_TOKENS_KV, deviceId, bearerToken);
            if (device) {
                userId   = device.userId;
                userRole = 'device';
            } else {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }
        }

        // ── Admin-only routes ─────────────────────────────────────────────────

        if (url.pathname.startsWith("/admin")) {
            if (userRole !== 'admin') {
                return new Response("Forbidden", { status: 403, headers: corsHeaders });
            }

            // Register a new edge node device for a client user
            if (url.pathname === "/admin/device/register" && request.method === "POST") {
                const { targetUserId } = await request.json();
                if (!targetUserId) {
                    return new Response("Missing targetUserId", { status: 400, headers: corsHeaders });
                }
                const deviceId = crypto.randomUUID();
                const deviceToken = await createDeviceToken(env.DEVICE_TOKENS_KV, { deviceId, userId: targetUserId });

                // Register the device credentials in Mosquitto Dynamic Security.
                // If this fails the device cannot connect to the broker — treat as a hard error.
                if (env.MQTT_BROKER_HOST) {
                    try {
                        await publishDynsecCommand(
                            env.MQTT_BROKER_HOST, env.MQTT_BROKER_PORT ?? 1883,
                            env.MQTT_ADMIN_USERNAME, env.MQTT_ADMIN_PASSWORD,
                            [
                                {
                                    command: "createRole",
                                    rolename: `device-${deviceId}`,
                                    acls: [
                                        { acltype: "publishClientSend", topic: `${targetUserId}/telemetry`,  allow: true },
                                        { acltype: "subscribePattern",  topic: `${targetUserId}/flightplan`, allow: true },
                                        { acltype: "subscribePattern",  topic: `${targetUserId}/emergency`,  allow: true },
                                    ],
                                },
                                {
                                    command: "createClient",
                                    username: `device-${deviceId}`,
                                    password: deviceToken,
                                    roles: [{ rolename: `device-${deviceId}` }],
                                },
                            ],
                        );
                    } catch (e) {
                        console.error("Dynsec device register failed:", e.message);
                        return Response.json(
                            { error: "MQTT broker provisioning failed — device credentials not created", detail: e.message },
                            { status: 502, headers: corsHeaders },
                        );
                    }
                }

                // Return token only once — it is never retrievable again
                return Response.json({ deviceId, deviceToken }, { headers: corsHeaders });
            }

            // Issue a new single-use client access token
            if (url.pathname === "/admin/access-token" && request.method === "POST") {
                const token = `AGRO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
                await storeAccessToken(env.USERS_KV, token, 'client');
                return Response.json({ accessToken: token }, { headers: corsHeaders });
            }

            // List all users (admin + client) — or filter by ?role=client for dropdowns
            if (url.pathname === "/admin/users" && request.method === "GET") {
                const all = await listAllUsers(env.USERS_KV);
                const roleFilter = url.searchParams.get("role");
                const result = roleFilter ? all.filter((u) => u.role === roleFilter) : all;
                return Response.json(result, { headers: corsHeaders });
            }

            // Delete a user account and all their devices
            if (url.pathname.startsWith("/admin/users/") && request.method === "DELETE") {
                const targetUserId = url.pathname.split("/")[3];
                if (!targetUserId) return new Response("Missing userId", { status: 400, headers: corsHeaders });
                await deleteUser(env.USERS_KV, env.DEVICE_TOKENS_KV, targetUserId);
                return new Response(null, { status: 204, headers: corsHeaders });
            }

            // List registered devices — all devices when no userId param, or filtered by userId
            if (url.pathname === "/admin/devices" && request.method === "GET") {
                const targetUserId = url.searchParams.get("userId");
                const devices = targetUserId
                    ? await listDevicesForUser(env.DEVICE_TOKENS_KV, targetUserId)
                    : await listAllDevices(env.DEVICE_TOKENS_KV);
                return Response.json(devices, { headers: corsHeaders });
            }
        }

        // ── Flight plan routes ────────────────────────────────────────────────

        if (url.pathname.startsWith("/flightplan")) {

            if (url.pathname === "/flightplan/waypoints" && request.method === "POST") {
                if (userRole !== 'device') {
                    return new Response("Forbidden", { status: 403, headers: corsHeaders });
                }
                const { fpid, waypoints } = await request.json();
                if (!fpid || !Array.isArray(waypoints)) {
                    return new Response("Missing fields", { status: 400, headers: corsHeaders });
                }
                await storage.waypointsUpload(env, userId, fpid, waypoints);
                return new Response("Waypoints saved", { headers: corsHeaders });
            }

            if (url.pathname.endsWith("/waypoints") && request.method === "GET") {
                const fpid = url.pathname.split("/")[2];
                const waypoints = await storage.waypointsRetrieval(env, userId, fpid);
                return Response.json(waypoints, { headers: corsHeaders });
            }

            if (request.method === "POST") {
                const flightplan = await request.json();
                console.log(flightplan);
                await storage.flightPlanUpload(env, userId, flightplan);
                if (env.MQTT_BROKER_HOST) {
                    await publishFlightPlan(
                        env.MQTT_BROKER_HOST, env.MQTT_BROKER_PORT ?? 1883,
                        userId, flightplan,
                        env.MQTT_ADMIN_USERNAME, env.MQTT_ADMIN_PASSWORD,
                    ).catch((e) => console.error("MQTT publish failed:", e.message));
                }
                return new Response("Flight Plan Saved", { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            if (request.method === "DELETE") {
                const id = url.pathname.split("/")[2];
                try {
                    await storage.flightPlanDeletion(env, userId, id);
                    return new Response("Flight Plan Deleted", { headers: corsHeaders });
                } catch (e) {
                    console.log(e);
                }
                return new Response("Not Found", { status: 404, headers: corsHeaders });
            }

            if (request.method === "PUT" && url.pathname.endsWith("/activate")) {
                const id = url.pathname.split("/")[2];
                const flightplan = await storage.setActiveFlightPlan(env, userId, id);
                if (!flightplan) {
                    return new Response("Not Found", { status: 404, headers: corsHeaders });
                }
                if (env.MQTT_BROKER_HOST) {
                    await publishFlightPlan(
                        env.MQTT_BROKER_HOST, env.MQTT_BROKER_PORT ?? 1883,
                        userId, flightplan,
                        env.MQTT_ADMIN_USERNAME, env.MQTT_ADMIN_PASSWORD,
                    ).catch((e) => console.error("MQTT publish failed:", e.message));
                }
                return new Response("Flight Plan Activated", { headers: corsHeaders });
            }

            if (url.pathname === "/flightplan/latest") {
                const flightplan = await storage.flightPlanRetrieval(env, userId);
                return Response.json(flightplan || "[]", { headers: corsHeaders });
            }

            if (url.pathname === "/flightplan/all") {
                const flightplans = await storage.allFlightPlanRetrieval(env, userId);
                return Response.json(flightplans || "[]", { headers: corsHeaders });
            }
        }

        // ── Base station position routes ──────────────────────────────────────────

        if (url.pathname === "/basestation/position") {
            if (request.method === "GET") {
                const pos = await storage.getBaseStationPosition(env, userId);
                return Response.json(pos, { headers: corsHeaders });
            }
            if (request.method === "PUT") {
                const { lat, lng } = await request.json();
                if (typeof lat !== "number" || typeof lng !== "number") {
                    return new Response("Invalid coordinates", { status: 400, headers: corsHeaders });
                }
                await storage.updateBaseStationPosition(env, userId, lat, lng);
                return new Response("Base station position saved", { headers: corsHeaders });
            }
        }

        // ── Sensor image routes ───────────────────────────────────────────────

        if (url.pathname === "/sensor-image" && request.method === "POST") {
            const form = await request.formData();
            const imageFile = form.get("image");
            const fpid      = form.get("fpid");
            const mid       = form.get("mid");
            const index     = parseInt(form.get("index") ?? "0", 10);
            const lat       = parseFloat(form.get("lat") ?? "0");
            const lng       = parseFloat(form.get("lng") ?? "0");
            const heading   = parseFloat(form.get("heading") ?? "0");
            const altitude  = parseFloat(form.get("altitude") ?? "0");
            const timestamp = form.get("timestamp") ?? new Date().toISOString();
            if (!fpid || !mid || !imageFile) {
                return new Response("Missing fields", { status: 400, headers: corsHeaders });
            }
            await storage.sensorImageUpload(env, userId, fpid, mid, index, imageFile,
                { lat, lng, heading, altitude, timestamp });
            return new Response("Sensor image saved", { headers: corsHeaders });
        }

    }
};
