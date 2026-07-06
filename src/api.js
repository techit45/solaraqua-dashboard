const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// ============================================================
//  ENSO (El Niño / La Niña) — ONI index
//  ONI = Oceanic Niño Index, 3-month rolling avg Niño 3.4 SST anomaly (°C)
//  El Niño >= +0.5 / La Niña <= -0.5 / Neutral in between
//
//  ค่าจริงจาก https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt (ดึงล่าสุด 2026-07-03)
//  ค่าเดิมก่อนหน้าคลาดเคลื่อนจากของจริงมาก และมี 2 ฤดูท้าย (AMJ/MJJ 2026) ที่ NOAA ยังไม่เผยแพร่
//  จริง (ถูกใส่เลขเดาไว้) ทำให้ระบบเคยฟันธงว่าเป็น "เอลนีโย" (+0.7) ทั้งที่ของจริงล่าสุด
//  (MAM 2026 = +0.48) คือเป็นกลาง — ไม่มีระบบดึงสดอัตโนมัติ ต้องอัปเดต array นี้เองเป็นระยะ
// ============================================================
const ENSO_SERIES = [
  { s: "MJJ 2025", v: -0.04 },
  { s: "JAS 2025", v: -0.28 },
  { s: "ASO 2025", v: -0.40 },
  { s: "SON 2025", v: -0.51 },
  { s: "OND 2025", v: -0.55 },
  { s: "NDJ 2025", v: -0.54 },
  { s: "DJF 2026", v: -0.37 },
  { s: "JFM 2026", v: -0.14 },
  { s: "FMA 2026", v:  0.13 },
  { s: "MAM 2026", v:  0.48 },
];

// คืนเฉพาะข้อมูล/การจำแนกดิบ — ข้อความแสดงผล (label/impacts/outlook) อยู่ใน i18n.js
// เพื่อให้เปลี่ยนตามภาษาที่เลือกได้ (ดู ensoLabel/ensoImpacts/ensoOutlook ใน i18n.js)
export function getEnsoData() {
  const latest = ENSO_SERIES[ENSO_SERIES.length - 1];
  const prev   = ENSO_SERIES[ENSO_SERIES.length - 4] || ENSO_SERIES[0];
  const oni    = latest.v;

  let phase, phaseTone;
  if      (oni >=  0.5) { phase = "el-nino";  phaseTone = "amber"; }
  else if (oni <= -0.5) { phase = "la-nina";  phaseTone = "blue";  }
  else                  { phase = "neutral";  phaseTone = "green"; }

  const trend = oni > prev.v + 0.15 ? "warming" : oni < prev.v - 0.15 ? "cooling" : "stable";

  return {
    oni,
    phase,
    phaseTone,
    trend,
    series: ENSO_SERIES,
    lastSeason: latest.s,
  };
}

export function getDefaultBackendUrl() {
  const host = window.location.hostname || "192.168.1.164";
  const isLocal = host === "localhost" || /^192\.168\./.test(host) || /^10\./.test(host);
  if (isLocal) return `http://${host}:3001`;
  return ""; // production — ไม่มี backend server, Gemini ใช้ไม่ได้บน Vercel
}

export async function fetchLatestLocation(backendUrl) {
  const res = await fetch(`${backendUrl}/api/location/latest`);
  if (!res.ok) throw new Error(`Location API ${res.status}`);
  return res.json();
}

export async function fetchDevices(backendUrl) {
  const res = await fetch(`${backendUrl}/api/devices`);
  if (!res.ok) throw new Error(`Devices API ${res.status}`);
  return res.json();
}

export async function fetchOverview(backendUrl) {
  const res = await fetch(`${backendUrl}/api/overview`);
  if (!res.ok) throw new Error(`Overview API ${res.status}`);
  return res.json();
}

export async function fetchNodes(backendUrl) {
  const res = await fetch(`${backendUrl}/api/nodes`);
  if (!res.ok) throw new Error(`Nodes API ${res.status}`);
  return res.json();
}

export async function createNode(backendUrl, payload) {
  const res = await fetch(`${backendUrl}/api/nodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Create node ${res.status}`);
  return data.node;
}

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,pressure_msl",
    hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "Asia/Bangkok",
    forecast_days: 5,
  });

  const res = await fetch(`${OPEN_METEO_URL}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

export async function askGemini(backendUrl, prompt) {
  // backendUrl ว่างตอน production -> fetch("/api/gemini") เป็น relative path ชี้ไปที่
  // Vercel serverless function (weather/api/gemini.js) โดยอัตโนมัติ ไม่ต้องรัน backend เอง
  // ส่วน localhost/LAN ยังใช้ backend/server.js ตัวเดิมตาม getDefaultBackendUrl()
  const res = await fetch(`${backendUrl}/api/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Gemini API ${res.status}`);
  return data.result;
}

// Web API key ของโปรเจกต์ solarlora-baa83 — ค่านี้เป็น public identifier ตามมาตรฐาน Firebase
// (ผูกกับ Security Rules/Anonymous Auth ด้านล่าง) ไม่ใช่ secret แบบ database secret ที่เคยฝังไว้ก่อนหน้า
const FIREBASE_API_KEY = "AIzaSyCqq4Iuq-z5Goc_RoT2UOTWr8N-ziM9U50";

// ================= Firebase Anonymous Auth =================
// ใช้แทน database secret เดิม: sign-in anonymous เพื่อผ่านเงื่อนไข "auth != null"
// ใน Security Rules สำหรับเขียน /cmds/{nodeId} เท่านั้น — อ่านข้อมูล sensor ไม่ต้องใช้ token
let cachedIdToken = null;
let cachedIdTokenExpiry = 0;

async function getAuthToken() {
  if (cachedIdToken && Date.now() < cachedIdTokenExpiry) return cachedIdToken;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`Firebase anonymous auth ${res.status}`);
  const data = await res.json();

  cachedIdToken = data.idToken;
  cachedIdTokenExpiry = Date.now() + (Number(data.expiresIn) - 60) * 1000; // กันชนหมดอายุ 60 วิ
  return cachedIdToken;
}

// ================= Firebase RTDB =================
// อ่านข้อมูล sensor ล่าสุดจาก Firebase RTDB /nodes/{nodeId} — read สาธารณะตาม Security Rules
export async function fetchFromFirebase(dbUrl) {
  const base = dbUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/nodes.json`);
  if (!res.ok) throw new Error(`Firebase RTDB ${res.status}`);
  const data = await res.json();

  if (!data) {
    return {
      nodes: [],
      latestLocation: null,
      alerts: [],
      summary: { gateways: 0, nodes: 0, onlineNodes: 0, warningNodes: 0, offlineNodes: 0, activeAlerts: 0, sensorTypes: [], latestAt: null },
    };
  }

  const nodes = Object.entries(data).map(([nodeId, node]) => {
    const ts = node.ts ?? null;  // Firebase server timestamp (Unix ms)
    const updatedAt = ts ? new Date(ts).toISOString() : null;
    const ageMinutes = ts ? Math.round((Date.now() - ts) / 60000) : null;

    const tone =
      ageMinutes === null ? "warning"
      : ageMinutes <= 15 ? "success"
      : ageMinutes <= 120 ? "warning"
      : "danger";

    const sensorKeys = ["ph", "ntu", "ec_ms_cm", "do_mgl", "do_sat", "tds", "water_level_cm", "soil_moisture", "water_temp", "air_temp"];
    const sensors = {};
    sensorKeys.forEach((k) => { if (node[k] != null) sensors[k] = node[k]; });

    return {
      nodeId,
      id: nodeId,
      deviceId: nodeId,
      name: node.name || nodeId,
      fieldName: node.fieldName || "",
      gatewayId: "home-gateway-001",
      lat: node.lat ?? null,
      lon: node.lon ?? null,
      rssi: node.rssi ?? null,
      snr: node.snr ?? null,
      battery: node.battery ?? null,
      latestSensors: sensors,
      sensors,
      sensorConfig: Object.keys(sensors),
      updatedAt,
      lastSeen: updatedAt,
      tone,
      status: tone === "success" ? "online" : tone === "danger" ? "offline" : "stale",
    };
  });

  const withLocation = nodes.find((n) => n.lat != null && n.lon != null);
  const latestLocation = withLocation || nodes[0] || null;
  const latestAt = nodes.reduce((best, n) => {
    if (!n.updatedAt) return best;
    return !best || n.updatedAt > best ? n.updatedAt : best;
  }, null);

  return {
    nodes,
    latestLocation,
    alerts: [],
    summary: {
      gateways: 1,
      nodes: nodes.length,
      onlineNodes: nodes.filter((n) => n.tone === "success").length,
      warningNodes: nodes.filter((n) => n.tone === "warning").length,
      offlineNodes: nodes.filter((n) => n.tone === "danger").length,
      activeAlerts: 0,
      sensorTypes: [...new Set(nodes.flatMap((n) => n.sensorConfig))],
      latestAt,
    },
  };
}

// ================= History (per-node time-series) =================
// gateway เขียนเข้า /history/{nodeId} ทุก 5 นาที/ตู้ (ดู gateway_receiver_ra02.ino) โดยใช้ Firebase
// push key ที่เรียงตามเวลาให้อัตโนมัติ — ดึงมาแค่ N รายการล่าสุดพอ ไม่โหลดประวัติทั้งหมดทีเดียว
export async function fetchNodeHistory(dbUrl, nodeId, limit = 50) {
  const base = dbUrl.replace(/\/$/, "");
  const query = `orderBy=${encodeURIComponent('"$key"')}&limitToLast=${limit}`;
  const res = await fetch(`${base}/history/${nodeId}.json?${query}`);
  if (!res.ok) throw new Error(`Firebase history ${res.status}`);
  const data = await res.json();
  if (!data) return [];

  // เอาทุกฟิลด์ที่ gateway เขียนจริง (ดู gateway_receiver_ra02.ino) ไม่ใช่แค่ชุดย่อยเหมือนเดิม —
  // รวมสัญญาณ LoRa (rssi/snr) และพิกัด GPS (DM01/DM02) ให้ตารางประวัติละเอียดขึ้น
  return Object.entries(data)
    .map(([key, entry]) => ({
      key,
      ts: entry.ts ?? null,
      ph: entry.ph ?? null,
      ec_ms_cm: entry.ec_ms_cm ?? null,
      do_mgl: entry.do_mgl ?? null,
      do_sat: entry.do_sat ?? null,
      ntu: entry.ntu ?? null,
      tds: entry.tds ?? null,
      rssi: entry.rssi ?? null,
      snr: entry.snr ?? null,
      lat: entry.lat ?? null,
      lon: entry.lon ?? null,
      seq: entry.seq ?? null,
    }))
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)); // ใหม่สุดขึ้นก่อน
}

// ================= NODE Control (cmds/NODE1) =================
const DEFAULT_CTRL = { machineOn: false, pump1: false, pump2: false, autoPhMode: false, phMin: 6.5, phMax: 7.5 };

export async function fetchNodeControl(dbUrl, nodeId) {
  const base = dbUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/cmds/${nodeId}.json`);
  if (!res.ok) throw new Error(`Firebase cmds read ${res.status}`);
  const data = await res.json();
  return data ? { ...DEFAULT_CTRL, ...data } : { ...DEFAULT_CTRL };
}

export async function writeNodeControl(dbUrl, nodeId, patch) {
  const base = dbUrl.replace(/\/$/, "");
  const token = await getAuthToken();
  const res = await fetch(`${base}/cmds/${nodeId}.json?auth=${token}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...patch, ts: { ".sv": "timestamp" } }),
  });
  if (!res.ok) throw new Error(`Firebase cmds write ${res.status}`);
  return res.json();
}
