const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// ============================================================
//  ENSO (El Niño / La Niña) — ONI index
//  ONI = Oceanic Niño Index, 3-month rolling avg Niño 3.4 SST anomaly (°C)
//  El Niño >= +0.5 / La Niña <= -0.5 / Neutral in between
//  อัปเดตเดือนละครั้งจาก: https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
// ============================================================
const ENSO_SERIES = [
  { s: "ASO 2025", v: -0.8 },
  { s: "SON 2025", v: -0.6 },
  { s: "OND 2025", v: -0.3 },
  { s: "NDJ 2026", v: -0.1 },
  { s: "DJF 2026", v:  0.1 },
  { s: "JFM 2026", v:  0.3 },
  { s: "FMA 2026", v:  0.4 },
  { s: "MAM 2026", v:  0.5 },
  { s: "AMJ 2026", v:  0.6 },
  { s: "MJJ 2026", v:  0.7 },
];

export function getEnsoData() {
  const latest = ENSO_SERIES[ENSO_SERIES.length - 1];
  const prev   = ENSO_SERIES[ENSO_SERIES.length - 4] || ENSO_SERIES[0];
  const oni    = latest.v;

  let phase, phaseLabel, phaseTone;
  if      (oni >=  0.5) { phase = "el-nino";  phaseLabel = "เอลนีโย";  phaseTone = "amber"; }
  else if (oni <= -0.5) { phase = "la-nina";  phaseLabel = "ลานีญา";   phaseTone = "blue";  }
  else                  { phase = "neutral";  phaseLabel = "เป็นกลาง"; phaseTone = "green"; }

  const trend = oni > prev.v + 0.15 ? "warming" : oni < prev.v - 0.15 ? "cooling" : "stable";

  const IMPACT = {
    "el-nino": [
      "ฝนน้อยกว่าปกติ เสี่ยงภัยแล้งช่วงปลูก",
      "อุณหภูมิสูง ระเหยน้ำเร็ว ควรเพิ่มรอบสูบน้ำ",
      "ชะลอปลูกข้าวนาปีหาก ONI สูงต่อเนื่อง",
    ],
    "la-nina": [
      "ฝนมากกว่าปกติ เสี่ยงน้ำท่วมช่วง ส.ค.–ต.ค.",
      "ระวังโรคเชื้อราและแมลงศัตรูพืช",
      "เตรียมระบบระบายน้ำและคันนาให้แข็งแรง",
    ],
    neutral: [
      "สภาพอากาศตามฤดูกาลปกติ",
      "วางแผนปลูกตามปฏิทินข้าวมาตรฐาน",
      "ติดตาม ONI ต่อเนื่องทุกเดือน",
    ],
  };

  const OUTLOOK = {
    "el-nino": "คาดว่า ONI จะทรงตัวหรือสูงขึ้นใน 3 เดือนข้างหน้า แนะนำเฝ้าระวังภัยแล้ง",
    "la-nina": "คาดว่า ONI จะค่อย ๆ เพิ่มขึ้นสู่เป็นกลางใน 3 เดือนข้างหน้า",
    neutral:   "ONI อยู่ในช่วงเปลี่ยนผ่าน ติดตามใกล้ชิด",
  };

  return {
    oni,
    phase,
    phaseLabel,
    phaseTone,
    trend,
    impacts: IMPACT[phase],
    outlook: OUTLOOK[phase],
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
  if (!backendUrl) throw new Error("ฟีเจอร์ AI ใช้ได้เฉพาะบนเครือข่ายท้องถิ่น (localhost/192.168.x.x) เท่านั้น");
  const res = await fetch(`${backendUrl}/api/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Gemini API ${res.status}`);
  return data.result;
}

const FIREBASE_SECRET = "ClMqCWXviR5t0OnaVAuEkjhHCCXlY6hUpszQnCjh";

// ================= Firebase RTDB =================
// อ่านข้อมูล sensor ล่าสุดจาก Firebase RTDB /nodes/{nodeId}
// ใช้ Database Secret (legacy token) ผ่าน ?auth= parameter
export async function fetchFromFirebase(dbUrl) {
  const base = dbUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/nodes.json?auth=${FIREBASE_SECRET}`);
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

    const statusLabel = tone === "success" ? "ออนไลน์" : tone === "warning" ? "ข้อมูลเก่า" : "ออฟไลน์";

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
      statusLabel,
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

// ================= NODE Control (cmds/NODE1) =================
const DEFAULT_CTRL = { machineOn: false, pump1: false, pump2: false, autoPhMode: false, phMin: 6.5, phMax: 7.5 };

export async function fetchNodeControl(dbUrl, nodeId) {
  const base = dbUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/cmds/${nodeId}.json?auth=${FIREBASE_SECRET}`);
  if (!res.ok) throw new Error(`Firebase cmds read ${res.status}`);
  const data = await res.json();
  return data ? { ...DEFAULT_CTRL, ...data } : { ...DEFAULT_CTRL };
}

export async function writeNodeControl(dbUrl, nodeId, patch) {
  const base = dbUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/cmds/${nodeId}.json?auth=${FIREBASE_SECRET}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...patch, ts: { ".sv": "timestamp" } }),
  });
  if (!res.ok) throw new Error(`Firebase cmds write ${res.status}`);
  return res.json();
}
