import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  Activity,
  ArrowRight,
  Battery,
  Bell,
  CheckCircle2,
  Cloud,
  CloudRain,
  CloudSun,
  Droplets,
  FlaskConical,
  Gauge,
  Home,
  MapPin,
  Monitor,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Router,
  Save,
  Settings,
  ShieldCheck,
  Signal,
  Sprout,
  Sun,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Wifi,
  Wind,
  X,
  Zap,
  Clock,
  AlertTriangle,
  ChevronDown,
  Maximize2,
  BookOpen,
  ChevronRight,
  Eye,
  BarChart2,
  Cpu,
  Power,
  PowerOff,
  Wrench,
  Info,
} from "lucide-react";
import { askGemini, fetchDevices, fetchFromFirebase, fetchLatestLocation, fetchNodeControl, fetchOverview, fetchWeather, getDefaultBackendUrl, getEnsoData, writeNodeControl } from "./api.js";
import { demoDevices, demoOverview, demoWeather, fallbackLocation } from "./mockData.js";
import { t, setLang, getCurrentLang, ensoLabel, ensoImpacts, ensoOutlook } from "./i18n.js";

const LangContext = createContext({ lang: "th", toggleLang: () => {} });
function useLang() { return useContext(LangContext); }
function LangProvider({ children }) {
  const [lang, _set] = useState(getCurrentLang);
  const toggleLang = () => {
    const next = lang === "th" ? "en" : "th";
    setLang(next);
    _set(next);
  };
  return <LangContext.Provider value={{ lang, toggleLang }}>{children}</LangContext.Provider>;
}
import ThreeFarmScene from "./ThreeFarmScene.jsx";
import { marked } from "marked";

const pages = [
  { id: "landing",  label: "Overview",  icon: Home },
  { id: "monitor",  label: "Monitor",   icon: Monitor },
  { id: "devices",  label: "Nodes",     icon: Router },
  { id: "settings", label: "Settings",  icon: Settings },
  { id: "guide",    label: "Guide",     icon: BookOpen },
];

function sensorCatalog() {
  return {
    gps:            { label: "GPS",                          unit: "",       icon: MapPin },
    ph:             { label: "pH",                           unit: "",       icon: FlaskConical },
    ec:             { label: "EC",                           unit: "mS/cm",  icon: Zap },
    ec_ms_cm:       { label: "EC",                           unit: "mS/cm",  icon: Zap },
    ntu:            { label: t("sensor.ntu"),                unit: "NTU",    icon: Droplets },
    do_mgl:         { label: "DO",                           unit: "mg/L",   icon: Activity },
    do_sat:         { label: t("sensor.do_sat"),             unit: "%",      icon: Activity },
    tds:            { label: "TDS",                          unit: "ppm",    icon: Zap },
    water_level_cm: { label: t("sensor.water_level_cm"),     unit: "cm",     icon: Droplets },
    soil_moisture:  { label: t("sensor.soil_moisture"),      unit: "%",      icon: Droplets },
    water_temp:     { label: t("sensor.water_temp"),         unit: "°C",     icon: Thermometer },
    air_temp:       { label: t("sensor.air_temp"),           unit: "°C",     icon: Thermometer },
    humidity:       { label: t("sensor.humidity"),           unit: "%",      icon: Droplets },
    rain_mm:        { label: t("sensor.rain_mm"),            unit: "mm",     icon: CloudRain },
    wind_speed:     { label: t("sensor.wind_speed"),         unit: "km/h",   icon: Wind },
  };
}

// คำอธิบาย+ช่วงปกติของแต่ละเซนเซอร์ ให้เกษตรกรแตะดูตรงการ์ดได้เลย ไม่ต้องไปหน้า Guide
// ใช้ข้อความชุดเดียวกับหน้า Guide (guide.*Mean/guide.*Range) กันเนื้อหาสองชุดไม่ตรงกัน
function sensorMeaning(key) {
  const map = {
    ph:             { meaning: t("guide.phMean"), range: t("guide.phRange") },
    ec:             { meaning: t("guide.ecMean"), range: t("guide.ecRange") },
    ec_ms_cm:       { meaning: t("guide.ecMean"), range: t("guide.ecRange") },
    ntu:            { meaning: t("guide.ntuMean"), range: t("guide.ntuRange") },
    do_mgl:         { meaning: t("guide.doMean"), range: t("guide.doRange") },
    do_sat:         { meaning: t("guide.doMean"), range: t("guide.doRange") },
    tds:            { meaning: t("guide.tdsMean"), range: t("guide.tdsRange") },
    water_level_cm: { meaning: t("guide.wlMean"), range: t("guide.wlRange") },
    water_temp:     { meaning: t("guide.wtMean"), range: t("guide.wtRange") },
  };
  return map[key] || null;
}

function getSensorOptions() {
  return [
    { id: "gps",            label: "GPS" },
    { id: "ph",             label: "pH" },
    { id: "ec",             label: "EC" },
    { id: "water_level_cm", label: t("sensor.water_level_cm") },
    { id: "soil_moisture",  label: t("sensor.soil_moisture") },
    { id: "water_temp",     label: t("sensor.water_temp") },
  ];
}

const sceneModeIds = [
  { id: "growth", emoji: "🌱" },
  { id: "breeze", emoji: "🌦" },
  { id: "inspect", emoji: "🔍" },
];

const defaultSettings = {
  backendUrl: getDefaultBackendUrl(),
  firebaseUrl: "https://solarlora-baa83-default-rtdb.asia-southeast1.firebasedatabase.app/",
  updateInterval: 30,
  dataSource: "firebase",
};

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("ricefarm-settings") || "null");
    return saved ? { ...defaultSettings, ...saved } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function getHashPage() {
  const id = window.location.hash.replace("#/", "") || "landing";
  return pages.some((page) => page.id === id) ? id : "landing";
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function formatInt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Math.round(Number(value)).toString();
}

function formatTime(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function getNodeId(node) {
  return node?.nodeId || node?.id || node?.deviceId || "";
}

function getNodeName(node) {
  return node?.name || node?.fieldName || getNodeId(node) || "Unknown node";
}

function nodeToLocation(node) {
  if (!node || node.lat == null || node.lon == null) return null;
  const id = getNodeId(node);
  return {
    ...node,
    id,
    nodeId: id,
    deviceId: id,
    name: getNodeName(node),
    lat: Number(node.lat),
    lon: Number(node.lon),
    accuracy: node.accuracy ?? 50,
    battery: node.battery ?? null,
    sensors: node.latestSensors || node.sensors || {},
    updatedAt: node.updatedAt || node.lastSeen || node.latestReadingAt || null,
  };
}

function selectLocationFromNodes(nodes, selectedNodeId, fallback) {
  const selected = selectedNodeId ? nodes.find((node) => getNodeId(node) === selectedNodeId) : null;
  return nodeToLocation(selected) || nodeToLocation(fallback) || nodes.map(nodeToLocation).find(Boolean) || null;
}

function sensorMeta(key) {
  return sensorCatalog()[key] || { label: key.replace(/_/g, " "), unit: "", icon: Gauge };
}

function formatSensorValue(key, value) {
  if (value === null || value === undefined || value === "") return "--";
  const meta = sensorMeta(key);
  const number = Number(value);
  const rendered = Number.isFinite(number) ? (Math.abs(number) >= 10 ? formatNumber(number, 1) : formatNumber(number, 2)) : String(value);
  return meta.unit ? `${rendered} ${meta.unit}` : rendered;
}

function getSensorRows(source) {
  const sensors = source?.latestSensors || source?.sensors || {};
  return Object.entries(sensors)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && Number(value) >= 0)
    .map(([key, value]) => ({ key, value, ...sensorMeta(key) }));
}

function minutesAgo(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function getDeviceState(device) {
  // เดิม fetchFromFirebase() ฝัง statusLabel เป็นข้อความไทยตรงๆ มาด้วย ทำให้ status
  // บน navbar ไม่เปลี่ยนตามภาษา — ดึง label จาก tone ผ่าน t() เสมอแทน
  if (device?.tone) {
    const label =
      device.tone === "success" ? t("st.online")
      : device.tone === "warning" ? t("st.stale")
      : device.tone === "danger" ? t("st.offline")
      : t("st.unknown");
    return { label, tone: device.tone };
  }
  if (!device || device.default) return { label: t("st.waitGps"), tone: "warning" };
  const age = minutesAgo(device.updatedAt);
  if (age === null) return { label: t("st.unknown"), tone: "warning" };
  if (age <= 15)  return { label: t("st.online"),  tone: "success" };
  if (age <= 120) return { label: t("st.stale"),   tone: "warning" };
  return { label: t("st.offline"), tone: "danger" };
}

function getWeatherInfo(code) {
  if (code === 0) return { text: t("wx.clear"),   Icon: Sun };
  if (code === 1 || code === 2) return { text: t("wx.partly"),  Icon: CloudSun };
  if (code === 3) return { text: t("wx.cloudy"),  Icon: Cloud };
  if (code === 45 || code === 48) return { text: t("wx.fog"),   Icon: Cloud };
  if (code >= 51 && code <= 65)   return { text: t("wx.rain"),  Icon: CloudRain };
  if (code >= 80 && code <= 82)   return { text: t("wx.showers"), Icon: CloudRain };
  if (code >= 95) return { text: t("wx.storm"),   Icon: Zap };
  return { text: t("wx.default"), Icon: CloudSun };
}

function parseHourly(weather) {
  const hourly = weather?.hourly;
  if (!hourly?.time?.length) return [];

  const now = new Date();
  const rows = [];
  for (let i = 0; i < hourly.time.length && rows.length < 8; i += 1) {
    const time = new Date(hourly.time[i]);
    if (time >= now || rows.length > 0) {
      rows.push({
        time: hourly.time[i].slice(11, 16),
        temp: hourly.temperature_2m?.[i],
        humidity: hourly.relative_humidity_2m?.[i],
        rain: hourly.precipitation_probability?.[i] ?? 0,
        wind: hourly.wind_speed_10m?.[i] ?? 0,
        code: hourly.weather_code?.[i],
      });
    }
  }

  if (rows.length) return rows;

  return hourly.time.slice(0, 8).map((time, index) => ({
    time: time.slice(11, 16),
    temp: hourly.temperature_2m?.[index],
    humidity: hourly.relative_humidity_2m?.[index],
    rain: hourly.precipitation_probability?.[index] ?? 0,
    wind: hourly.wind_speed_10m?.[index] ?? 0,
    code: hourly.weather_code?.[index],
  }));
}

function parseDaily(weather) {
  const daily = weather?.daily;
  if (!daily?.time?.length) return [];
  const labels = [t("day.0"), t("day.1"), t("day.2"), t("day.3"), t("day.4")];

  return daily.time.map((date, index) => ({
    date,
    label: labels[index] || date,
    min: daily.temperature_2m_min?.[index],
    max: daily.temperature_2m_max?.[index],
    rain: daily.precipitation_probability_max?.[index] ?? 0,
    amount: daily.precipitation_sum?.[index] ?? 0,
    wind: daily.wind_speed_10m_max?.[index] ?? 0,
    code: daily.weather_code?.[index],
  }));
}

function buildAdvisorText(location, weather) {
  const current = weather?.current || {};
  const sensors = location?.latestSensors || location?.sensors || {};
  const rain = weather?.daily?.precipitation_probability_max?.[0] ?? 0;
  const amount = weather?.daily?.precipitation_sum?.[0] ?? current.precipitation ?? 0;
  const temp = current.temperature_2m ?? 0;
  const humidity = current.relative_humidity_2m ?? 0;
  const ph = Number(sensors.ph);
  const ec = Number(sensors.ec ?? sensors.ec_ms_cm);
  const waterLevel = Number(sensors.water_level_cm);
  const doMgl = Number(sensors.do_mgl);
  const ntu = Number(sensors.ntu);
  const waterTemp = Number(sensors.water_temp);
  const tds = Number(sensors.tds);

  const notes = [];
  if (rain >= 60 || amount >= 8) {
    notes.push(t("note.heavyRain"));
  } else if (rain >= 35) {
    notes.push(t("note.possRain"));
  } else {
    notes.push(t("note.dryDay"));
  }

  if (humidity >= 78)  notes.push(t("note.humidity"));
  if (temp >= 34)      notes.push(t("note.hotTemp"));
  if (Number.isFinite(ph) && (ph < 5.5 || ph > 7.5)) notes.push(t("note.phOOR"));
  if (Number.isFinite(ec) && ec > 2)                  notes.push(t("note.highEC"));
  // เดิมไม่เช็ค DO/NTU เลยทั้งที่การ์ดสีบนหน้า Monitor (getSensorStatus) เตือนได้ —
  // checklist นี้เลยเงียบแม้ DO ต่ำวิกฤตหรือน้ำขุ่นมาก ใช้ threshold เดียวกับการ์ดสี
  if (Number.isFinite(doMgl) && doMgl < 5)            notes.push(t("note.lowDO"));
  if (Number.isFinite(ntu) && ntu > 50)               notes.push(t("note.highTurbidity"));
  // เดิมเช็คแค่ temp (อุณหภูมิอากาศจาก weather API) ไม่เคยเช็คอุณหภูมิน้ำจากเซนเซอร์จริงเลย
  if (Number.isFinite(waterTemp) && (waterTemp < 25 || waterTemp > 32)) notes.push(t("note.waterTempOOR"));
  if (Number.isFinite(tds) && tds > 500)              notes.push(t("note.highTds"));
  if (Number.isFinite(waterLevel) && waterLevel < 5)  notes.push(t("note.lowWater"));
  if (location?.default) notes.push(t("note.noGps"));

  return notes;
}

function App() {
  const [activePage, setActivePage] = useState(getHashPage);
  const [settings, setSettings] = useState(readSettings);
  const [location, setLocation] = useState(fallbackLocation);
  const [weather, setWeather] = useState(null);
  const [devices, setDevices] = useState([]);
  const [farmOverview, setFarmOverview] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(() => localStorage.getItem("ricefarm-selected-node") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [advisorLoading, setAdvisorLoading] = useState(false);

  useEffect(() => {
    const onHashChange = () => setActivePage(getHashPage());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    localStorage.setItem("ricefarm-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (selectedNodeId) localStorage.setItem("ricefarm-selected-node", selectedNodeId);
  }, [selectedNodeId]);

  const navigate = useCallback((pageId) => {
    window.location.hash = `/${pageId}`;
    setActivePage(pageId);
  }, []);

  const loadBrowserLocation = useCallback(async () => {
    if (!navigator.geolocation) throw new Error(t("err.noGpsBr"));

    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });

    const nextLocation = {
      deviceId: "browser",
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: Math.round(position.coords.accuracy),
      battery: null,
      updatedAt: new Date().toISOString(),
      browser: true,
    };

    return nextLocation;
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      let nextLocation;
      let nextDevices = [];
      let nextOverview = null;

      if (settings.dataSource === "demo") {
        nextOverview = demoOverview;
        nextDevices = demoDevices;
        nextLocation = selectLocationFromNodes(nextDevices, selectedNodeId, demoOverview.latestLocation) || demoDevices[0];
      } else if (settings.dataSource === "browser") {
        nextLocation = await loadBrowserLocation();
        nextDevices = [nextLocation];
        nextOverview = {
          gateways: [],
          latestLocation: nextLocation,
          nodes: nextDevices,
          summary: {
            gateways: 0,
            nodes: 1,
            onlineNodes: 1,
            warningNodes: 0,
            offlineNodes: 0,
            activeAlerts: 0,
            sensorTypes: ["browser-gps"],
            latestAt: nextLocation.updatedAt,
          },
          alerts: [],
        };
      } else if (settings.dataSource === "firebase") {
        nextOverview = await fetchFromFirebase(settings.firebaseUrl);
        nextDevices = nextOverview.nodes || [];
        nextLocation = selectLocationFromNodes(nextDevices, selectedNodeId, nextOverview.latestLocation);
      } else {
        try {
          nextOverview = await fetchOverview(settings.backendUrl);
          nextDevices = nextOverview.nodes || [];
          nextLocation = selectLocationFromNodes(nextDevices, selectedNodeId, nextOverview.latestLocation);
        } catch {
          nextLocation = await fetchLatestLocation(settings.backendUrl);
          nextDevices = await fetchDevices(settings.backendUrl);
          nextOverview = {
            gateways: [],
            latestLocation: nextLocation,
            nodes: nextDevices,
            alerts: [],
            summary: {
              gateways: 1,
              nodes: nextDevices.length,
              onlineNodes: nextDevices.filter((device) => getDeviceState(device).tone === "success").length,
              warningNodes: nextDevices.filter((device) => getDeviceState(device).tone === "warning").length,
              offlineNodes: nextDevices.filter((device) => getDeviceState(device).tone === "danger").length,
              activeAlerts: 0,
              sensorTypes: [],
              latestAt: nextLocation?.updatedAt || null,
            },
          };
        }
      }

      nextLocation = nextLocation || fallbackLocation;
      if (!selectedNodeId && nextLocation?.nodeId && !nextLocation.default) {
        setSelectedNodeId(nextLocation.nodeId);
      }

      const nextWeather = await fetchWeather(nextLocation.lat, nextLocation.lon);
      setLocation(nextLocation);
      setWeather(nextWeather);
      setDevices(nextDevices);
      setFarmOverview(nextOverview || null);

      if (nextLocation.default) {
        setError(t("err.noGpsHw"));
      }
    } catch (err) {
      setError(err.message || t("err.loadFail"));
      setLocation((current) => current || fallbackLocation);
      setWeather((current) => current || null);
      // ไม่ inject demoDevices เมื่อ error — แสดง empty state จริงแทน
    } finally {
      setLoading(false);
    }
  }, [devices.length, loadBrowserLocation, selectedNodeId, settings.backendUrl, settings.dataSource, settings.firebaseUrl]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    const intervalMs = Math.max(10, Number(settings.updateInterval) || 30) * 1000;
    const timer = window.setInterval(refreshData, intervalMs);
    return () => window.clearInterval(timer);
  }, [refreshData, settings.updateInterval]);

  const current = weather?.current || {};
  const weatherInfo = getWeatherInfo(current.weather_code);
  const hourly = useMemo(() => parseHourly(weather), [weather]);
  const daily = useMemo(() => parseDaily(weather), [weather]);
  // เดิม deviceState มาจาก getDeviceState(location) ตรงๆ — แต่ location คือ node "ที่มีพิกัด GPS"
  // (เลือกมาจาก selectLocationFromNodes เพื่อดึงพยากรณ์อากาศ) ไม่ใช่ node ที่ผู้ใช้เลือกดูจริง
  // ถ้า node ที่เลือก (เช่น NODE1 เซนเซอร์คุณภาพน้ำ) ไม่มี lat/lon เลย badge บน navbar จะไปโชว์
  // สถานะของ node อื่นแทน ทำให้ตัว node ที่กำลังดูอยู่จริงออนไลน์แต่ navbar ขึ้น Offline
  const selectedDevice = useMemo(() => {
    if (selectedNodeId && devices.length) {
      const found = devices.find((n) => getNodeId(n) === selectedNodeId);
      if (found) return found;
    }
    return location;
  }, [devices, location, selectedNodeId]);
  const deviceState = getDeviceState(selectedDevice);
  const recommendations = useMemo(() => buildAdvisorText(location, weather), [location, weather]);

  const runAdvisor = async (mode) => {
    const sensorRows = getSensorRows(location);
    const sensorText = sensorRows.length
      ? `ข้อมูลเซนเซอร์: ${sensorRows.map((row) => `${row.label} ${formatSensorValue(row.key, row.value)}`).join(", ")}\n`
      : t("ai.noSensor");
    // เดิม prompt ไม่มีข้อมูล ENSO เลยแม้หน้า UI จะโชว์ "Analyzed from: Forecast/ENSO/Sensor"
    // (อ้างว่าใช้ ENSO วิเคราะห์ทั้งที่ไม่ได้ส่งไปให้ AI จริง) เพิ่มเข้า prompt ให้ตรงกับที่ UI เคลม
    const enso = getEnsoData();
    const ensoText = `ENSO: ${ensoLabel(enso.phase)} (ONI ${enso.oni >= 0 ? "+" : ""}${enso.oni.toFixed(1)}) — ${ensoOutlook(enso.phase)}\n`;
    const basePrompt =
      `คุณเป็นผู้เชี่ยวชาญด้านนาข้าวในประเทศไทย วิเคราะห์ข้อมูลจากตู้ย่อย ${location.name || location.deviceId} (${location.deviceId})\n` +
      `พิกัด ${formatNumber(location.lat, 6)}, ${formatNumber(location.lon, 6)}\n` +
      sensorText +
      `อุณหภูมิ ${formatNumber(current.temperature_2m)} C, ความชื้น ${formatInt(current.relative_humidity_2m)}%, ` +
      `โอกาสฝนวันนี้ ${daily[0]?.rain ?? 0}%, ฝนสะสม ${formatNumber(daily[0]?.amount)} mm, ลม ${formatNumber(current.wind_speed_10m)} km/h\n` +
      ensoText;

    const prompt =
      mode === "risk"
        ? `${basePrompt}${t("ai.risk")}`
        : `${basePrompt}${t("ai.advice")}`;

    setAdvisorLoading(true);
    setAdvisor("");
    try {
      // ใช้ URL คำนวณสดเสมอ ไม่ใช่ settings.backendUrl ที่ผู้ใช้แก้ไข/ค้างจาก localStorage ได้
      // (แก้บั๊ก: ค่าเก่าที่เคย save ไว้ผิดๆ ทำให้ยิง Gemini ไปที่ host:3001 ของ production URL เอง)
      const result = await askGemini(getDefaultBackendUrl(), prompt);
      setAdvisor(result);
    } catch (err) {
      setAdvisor(`${t("err.aiFail")}${err.message}`);
    } finally {
      setAdvisorLoading(false);
    }
  };

  const pageProps = {
    current,
    daily,
    devices,
    deviceState,
    error,
    farmOverview,
    hourly,
    loading,
    location,
    navigate,
    recommendations,
    refreshData,
    runAdvisor,
    advisor,
    advisorLoading,
    selectedNodeId,
    setSelectedNodeId,
    settings,
    setSettings,
    weather,
    weatherInfo,
  };

  return (
    <div className={`app ${activePage === "landing" ? "immersive-app" : ""}`}>
      <AppShell activePage={activePage} current={current} deviceState={deviceState} devices={devices} navigate={navigate} selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId}>
        {activePage === "landing"  && <LandingPage {...pageProps} />}
        {activePage === "monitor"  && <MonitorPage {...pageProps} />}
        {activePage === "devices"  && <DevicesPage {...pageProps} />}
        {activePage === "settings" && <SettingsPage {...pageProps} />}
        {activePage === "guide"    && <GuidePage navigate={pageProps.navigate} />}
      </AppShell>
    </div>
  );
}

function NodeDropdown({ devices, navigate, selectedNodeId, setSelectedNodeId }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const rows = devices.length ? devices : [];

  return (
    <div className="node-dropdown" ref={ref}>
      <button
        className={`nav-tab ${open ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Router size={16} />
        <span>{t("node.label")}</span>
        <ChevronDown className={`dropdown-chevron ${open ? "open" : ""}`} size={13} />
      </button>

      {open && (
        <div className="node-dropdown-menu">
          {rows.length === 0 && (
            <div className="node-dropdown-empty">{t("node.empty")}</div>
          )}
          {rows.map((node) => {
            const id = getNodeId(node);
            const state = getDeviceState(node);
            const isSelected = id === selectedNodeId;
            return (
              <button
                className={`node-dropdown-item ${isSelected ? "selected" : ""}`}
                key={id}
                onClick={() => { setSelectedNodeId(id); navigate("monitor"); setOpen(false); }}
                type="button"
              >
                <span className={`status-dot ${state.tone}`} />
                <div className="node-dropdown-info">
                  <strong>{getNodeName(node)}</strong>
                  <span>{state.label}</span>
                </div>
                {isSelected && <CheckCircle2 size={13} />}
              </button>
            );
          })}
          <div className="node-dropdown-footer">
            <button onClick={() => { navigate("devices"); setOpen(false); }} type="button">
              {t("node.manageAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const landingNavItems = [
  { id: "landing", labelKey: "nav.overview",     icon: Home },
  { id: "arch",    labelKey: "nav.architecture", icon: Network, scroll: ".arch-section" },
  { id: "ops",     labelKey: "nav.features",     icon: ShieldCheck, scroll: ".immersive-ops" },
  { id: "monitor", labelKey: "nav.monitor",      icon: Monitor },
];

const appNavItems = [
  { id: "monitor",  labelKey: "nav.monitor",  icon: Monitor },
  { id: "devices",  labelKey: "nav.devices",  icon: Router },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
  { id: "guide",    labelKey: "nav.guide",    icon: BookOpen },
];

function AppShell({ activePage, children, current, deviceState, devices, navigate, selectedNodeId, setSelectedNodeId }) {
  const { lang, toggleLang } = useLang();
  const isLanding = activePage === "landing";
  const navItems = isLanding ? landingNavItems : appNavItems;

  const handleNav = (item) => {
    if (item.scroll) {
      document.querySelector(item.scroll)?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate(item.id);
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("landing")} type="button">
          <span className="brand-mark">
            <Sprout size={19} />
          </span>
          <span>SolarAqua</span>
        </button>

        <nav className="nav-tabs" aria-label="Main navigation">
          {navItems.map((item) => {
            if (item.id === "devices") {
              return (
                <NodeDropdown
                  key="devices"
                  devices={devices}
                  navigate={navigate}
                  selectedNodeId={selectedNodeId}
                  setSelectedNodeId={setSelectedNodeId}
                />
              );
            }
            const Icon = item.icon;
            const isActive = !item.scroll && activePage === item.id;
            return (
              <button
                className={`nav-tab ${isActive ? "active" : ""}`}
                key={item.id}
                onClick={() => handleNav(item)}
                type="button"
              >
                <Icon size={16} />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <div className="topbar-status">
          <span className="weather-mini">
            <CloudSun size={18} />
            {formatInt(current.temperature_2m)} C
          </span>
          <StatusChip tone={deviceState.tone} icon={Signal}>
            {deviceState.label}
          </StatusChip>
          <button
            className="lang-toggle"
            onClick={toggleLang}
            title="Switch language / เปลี่ยนภาษา"
            type="button"
          >
            {lang === "th" ? "EN" : "TH"}
          </button>
          {activePage === "monitor" ? (
            <button
              className="secondary-action small"
              onClick={() => document.documentElement.requestFullscreen?.()}
              title={t("ui.fullscreen")}
              type="button"
            >
              <Maximize2 size={15} />
              <span>{t("ui.fullscreen")}</span>
            </button>
          ) : (
            <button className="primary-action small" onClick={() => navigate("monitor")} type="button">
              <span>{t("ui.openMonitor")}</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}

function LandingPage({ current, daily, deviceState, devices, farmOverview, hourly, location, navigate, recommendations, weatherInfo }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const WeatherIcon = weatherInfo.Icon;
  const [sceneMode, setSceneMode] = useState("growth");
  const summary = farmOverview?.summary || { gateways: 0, nodes: 0, onlineNodes: 0, warningNodes: 0, offlineNodes: 0, activeAlerts: 0, sensorTypes: [], latestAt: null };
  const sensorTypes = summary.sensorTypes?.length ? summary.sensorTypes : ["gps", "ph", "ec", "water_level_cm"];
  const chapters = [
    {
      index: "01",
      image: "/images/landing-chapters/gateway.webp",
      title: t("land.gwTitle"),
      text:  t("land.gwText"),
      stat: `${summary.gateways ?? 1} ${t("land.mGw")}`,
    },
    {
      index: "02",
      image: "/images/landing-chapters/lora-nodes.webp",
      title: t("land.ndTitle"),
      text:  t("land.ndText"),
      stat: `${summary.nodes || devices.length} nodes`,
    },
    {
      index: "03",
      image: "/images/landing-chapters/sensors.webp",
      title: "Sensor future-ready",
      text:  t("land.snText"),
      stat: `${sensorTypes.length} sensor types`,
    },
    {
      index: "04",
      image: "/images/landing-chapters/ai-forecast.webp",
      title: "AI decision layer",
      text:  t("land.aiText"),
      stat: `${summary.activeAlerts || 0} alerts`,
    },
  ];

  return (
    <div className="landing-page immersive-landing" data-scene-mode={sceneMode}>
      <section className="immersive-hero">
        <div className="immersive-backdrop" />
        <div className="field-depth" aria-hidden="true">
          <span className="field-horizon" />
          <span className="terrace-line terrace-1" />
          <span className="terrace-line terrace-2" />
          <span className="terrace-line terrace-3" />
          <span className="terrace-line terrace-4" />
          <span className="water-shimmer shimmer-a" />
          <span className="water-shimmer shimmer-b" />
          <span className="water-shimmer shimmer-c" />
          <span className="rice-blade blade-a" />
          <span className="rice-blade blade-b" />
          <span className="rice-blade blade-c" />
          <span className="rice-blade blade-d" />
        </div>
        <ThreeFarmScene className="hero-three" nodes={devices} sceneMode={sceneMode} />
        <div className="plant-orbit-ui" aria-hidden="true">
          <span className="growth-trace trace-a" />
          <span className="growth-trace trace-b" />
          <span className="growth-trace trace-c" />
          {(() => {
            const liveNode = devices.find(n => (n.latestSensors || n.sensors)?.ph != null)
              || devices.find(n => Object.keys(n.latestSensors || n.sensors || {}).length > 0);
            const s = liveNode?.latestSensors || liveNode?.sensors || {};
            return (<>
              {s.ph    != null && Number(s.ph)    >= 0 && <span className="sensor-float-chip chip-a">pH {Number(s.ph).toFixed(2)}</span>}
              {s.ec_ms_cm != null && Number(s.ec_ms_cm) >= 0 && <span className="sensor-float-chip chip-b">EC {Number(s.ec_ms_cm).toFixed(2)}</span>}
              {s.do_mgl != null && Number(s.do_mgl) >= 0 && <span className="sensor-float-chip chip-c">DO {Number(s.do_mgl).toFixed(1)} mg/L</span>}
            </>);
          })()}
        </div>
        <div className="immersive-hero-content">
          <div className="immersive-copy">
            <h1>{t("land.h1line1")}<br />{t("land.h1line2")}</h1>
            <p>{t("land.heroP")}</p>
            <div className="hero-actions">
              <button className="primary-action neon" onClick={() => navigate("monitor")} type="button">
                <span>{t("ui.openMonitor")}</span>
                <ArrowRight size={18} />
              </button>
              <button className="hero-text-link" onClick={() => document.querySelector(".arch-section")?.scrollIntoView({ behavior: "smooth" })} type="button">
                {t("land.archLink")}
              </button>
            </div>
            <div className="scene-mode-controls" aria-label={t("land.sceneModeAria")}>
              {sceneModeIds.map((mode) => (
                <button
                  className={`scene-mode-button ${sceneMode === mode.id ? "active" : ""}`}
                  key={mode.id}
                  onClick={() => setSceneMode(mode.id)}
                  type="button"
                >
                  {mode.emoji} {t(`scene.${mode.id}`)}
                </button>
              ))}
            </div>
            <SocialProofBar />
          </div>

          <div className="command-glass-panel">
            <div className="station-line">
              <StatusDot tone={deviceState.tone} pulse={deviceState.tone === "success"} />
              <span>{location.deviceId || "home-gateway-001"}</span>
              {deviceState.tone === "success" && <span className="live-badge">● Live</span>}
            </div>
            <div className="card-sync-footer">
              <TimeAgo iso={location.updatedAt} />
            </div>
            <div className="hero-temp">
              <WeatherIcon size={42} />
              <strong>{formatNumber(current.temperature_2m)} C</strong>
            </div>
            <p>{weatherInfo.text} · {t("mon.rainChance")} {daily[0]?.rain ?? "--"}%</p>
            <div className="hero-metrics">
              <InfoStat label="Nodes" value={`${summary.nodes || devices.length}`} />
              <InfoStat label="Online" value={`${summary.onlineNodes || 0}`} />
              <InfoStat label="Sensors" value={`${sensorTypes.length}`} />
              <InfoStat label="Alerts" value={`${summary.activeAlerts || 0}`} />
            </div>
            <div className="node-mini-list">
              {(devices.length ? devices : [{ nodeId: "DM01" }, { nodeId: "DM02" }, { nodeId: "NODE1" }])
                .slice(0, 4)
                .map((node) => {
                  const id = getNodeId(node) || node.nodeId;
                  const state = getDeviceState(node);
                  return (
                    <span className={`node-mini-item ${state.tone}`} key={id}>
                      <span className="node-mini-dot" />
                      {id}
                    </span>
                  );
                })}
              {devices.length > 4 && <span className="node-mini-more">+{devices.length - 4}</span>}
            </div>
          </div>
        </div>
        <div className="scroll-cue">Scroll down to rotate the rice plant</div>
      </section>

      <section className="arch-section">
        <div className="arch-section-intro">
          <h2>{t("land.archTitle")}</h2>
          <div className="arch-flow-bar">
            {["1 Gateway", "3 LoRa Nodes", "6 Sensors", "AI Analysis", "Dashboard"].map((step, i, arr) => (
              <span key={step} className="arch-flow-item">
                <span className="arch-flow-step">{step}</span>
                {i < arr.length - 1 && <span className="arch-flow-arrow" aria-hidden="true">→</span>}
              </span>
            ))}
          </div>
        </div>
        <div className="arch-card-grid">
          {chapters.map((chapter) => (
            <article className="arch-card" key={chapter.index}>
              <figure className="arch-card-visual">
                <img alt="" src={chapter.image} />
              </figure>
              <div className="arch-card-copy">
                <div className="arch-card-meta">
                  <span className="chapter-index">{chapter.index}</span>
                  <strong>{chapter.stat}</strong>
                </div>
                <h3>{chapter.title}</h3>
                <p>{chapter.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="immersive-ops">
        <div className="ops-heading">
          <h2>{t("land.dashH2")}</h2>
          <p>{t("land.dashP")}</p>
        </div>
        <div className="overview-grid">
          <MetricCard icon={Network} label={t("land.mNodes")} value={`${summary.nodes || devices.length}`} delta={`${summary.gateways ?? 1} ${t("land.mGw")}`} tone="blue" />
          <MetricCard icon={Wifi} label={t("land.mOnline")} value={`${summary.onlineNodes || 0}`} delta={t("land.mOnDelta")} tone="green" />
          <MetricCard icon={Bell} label={t("land.mAlerts")} value={`${summary.activeAlerts || 0}`} delta={t("land.mAlDelta")} tone={summary.activeAlerts ? "amber" : "green"} />
          <MetricCard icon={Thermometer} label={t("land.mWeather")} value={`${formatNumber(current.temperature_2m)} C`} delta={`${daily[0]?.rain ?? "--"}% rain`} tone="amber" />
        </div>
        <div className="landing-lower">
          <HourlyForecast rows={hourly.slice(0, 6)} compact />
          <RecommendationPanel recommendations={recommendations} />
        </div>
      </section>

      <section className="results-section">
        <div className="results-heading">
          <h2>{t("land.resH2")}</h2>
          <p>{t("land.resP")}</p>
        </div>
        <div className="results-grid">
          <ResultCard icon={Clock}          stat="70%"      label={t("land.r1label")} desc={t("land.r1desc")} />
          <ResultCard icon={AlertTriangle}  stat="24/7"     label={t("land.r2label")} desc={t("land.r2desc")} />
          <ResultCard icon={MapPin}         stat="∞"        label={t("land.r3label")} desc={t("land.r3desc")} />
          <ResultCard icon={TrendingUp}     stat="3×"       label={t("land.r4label")} desc={t("land.r4desc")} />
        </div>
      </section>
    </div>
  );
}

function calcRisk(daily, node, enso) {
  const rain = daily?.[0]?.rain ?? 0;
  const sensors = node?.latestSensors || node?.sensors || {};
  const ph = Number(sensors.ph);
  const ec = Number(sensors.ec ?? sensors.ec_ms_cm);
  const doMgl = Number(sensors.do_mgl);
  const ntu = Number(sensors.ntu);
  const waterTemp = Number(sensors.water_temp);
  const tds = Number(sensors.tds);
  const waterLevel = Number(sensors.water_level_cm);
  let score = 0;
  const reasons = [];
  if (rain >= 60) { score += 2; reasons.push(t("risk.heavyRain")); }
  else if (rain >= 35) { score += 1; reasons.push(t("risk.possRain")); }
  if (Number.isFinite(ph) && ph < 5.5) { score += 2; reasons.push(t("risk.phLow")); }
  else if (Number.isFinite(ph) && ph > 7.5) { score += 2; reasons.push(t("risk.phHigh")); }
  // เดิมเช็คแค่ฝนกับ pH เท่านั้น ทั้งที่ "ความเสี่ยงวันนี้" เป็น card หลักที่โชว์เด่นสุด
  // ทำให้ EC/DO/NTU/อุณหภูมิน้ำ/TDS/ระดับน้ำผิดปกติแค่ไหนก็ไม่กระทบคะแนนเสี่ยงเลย
  if (Number.isFinite(ec) && ec > 2)          { score += 2; reasons.push(t("risk.highEC")); }
  if (Number.isFinite(doMgl) && doMgl < 5)    { score += 2; reasons.push(t("risk.lowDO")); }
  if (Number.isFinite(waterLevel) && waterLevel < 5) { score += 2; reasons.push(t("risk.lowWater")); }
  if (Number.isFinite(ntu) && ntu > 50)       { score += 1; reasons.push(t("risk.highTurbidity")); }
  if (Number.isFinite(waterTemp) && (waterTemp < 25 || waterTemp > 32)) { score += 1; reasons.push(t("risk.waterTempOOR")); }
  if (Number.isFinite(tds) && tds > 500)      { score += 1; reasons.push(t("risk.highTds")); }
  if (enso?.phase === "el-nino" || enso?.phase === "la-nina") { score += 1; reasons.push(ensoLabel(enso.phase)); }
  if (score >= 3) return { label: t("risk.high"),   sub: reasons.slice(0, 2).join(" · "), tone: "danger" };
  if (score >= 1) return { label: t("risk.medium"), sub: reasons.slice(0, 2).join(" · ") || t("risk.watch"), tone: "amber" };
  return { label: t("risk.low"), sub: t("risk.normal"), tone: "success" };
}

function MissionCard({ icon: Icon, label, value, sub, tone = "neutral", primary = false }) {
  return (
    <article className={`mission-card ${tone}${primary ? " primary" : ""}`}>
      <span className="mission-card-icon"><Icon size={24} /></span>
      <div className="mission-card-body">
        <span className="mission-card-label">{label}</span>
        <strong className="mission-card-value">{value}</strong>
        <span className="mission-card-sub">{sub}</span>
      </div>
    </article>
  );
}

function MonitorAiPanel({ advisor, advisorLoading, nodeName, recommendations, runAdvisor }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const resultRef = useRef(null);

  useEffect(() => {
    if (advisor && !advisorLoading && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [advisor, advisorLoading]);

  const warnRx = new RegExp(t("mon.aiWarnRx"));
  const items = recommendations.map((text) => ({ text, warn: warnRx.test(text) }));
  return (
    <Panel className="monitor-ai-panel">
      <div className="monitor-ai-header">
        <div>
          <span className="panel-label" style={{ color: "rgba(255,255,255,0.65)" }}>{t("mon.aiTitle")}</span>
          <h2 style={{ color: "#fff", margin: "2px 0 4px", fontSize: "1.05rem", fontWeight: 700 }}>{t("mon.aiSummary")} {nodeName}</h2>
          <div className="monitor-ai-sources">
            <span>{t("mon.aiFrom")}</span>
            <span className="monitor-ai-source-tag">{t("mon.aiWeather")}</span>
            <span className="monitor-ai-source-tag">{t("mon.aiEnso")}</span>
            <span className="monitor-ai-source-tag">{t("mon.aiSensor")}</span>
          </div>
        </div>
        <div className="monitor-ai-btns">
          <button className="monitor-ai-btn" disabled={advisorLoading} onClick={() => runAdvisor("advice")} type="button">
            <Sprout size={15} /><span>{t("mon.aiAdvice")}</span>
          </button>
          <button className="monitor-ai-btn" disabled={advisorLoading} onClick={() => runAdvisor("risk")} type="button">
            <ShieldCheck size={15} /><span>{t("mon.aiRisk")}</span>
          </button>
        </div>
      </div>
      <div className="monitor-ai-items">
        {items.map((item, i) => (
          <div className={`monitor-ai-item ${item.warn ? "warn" : "ok"}`} key={i}>
            <span className="monitor-ai-icon">{item.warn ? "⚠" : "✓"}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
      {(advisor || advisorLoading) && (
        <div className={`monitor-ai-result ${advisorLoading ? "loading" : ""}`} ref={resultRef}>
          {advisorLoading ? t("mon.aiLoading") : <AiMarkdown text={advisor} />}
        </div>
      )}
    </Panel>
  );
}

function MiniLineChart({ data, color = "#2F7A45", height = 150 }) {
  if (data.length < 2) return <div className="chart-empty">{t("ui.noData")}</div>;

  const W = 440, H = height;
  const pL = 38, pR = 18, pT = 14, pB = 22;
  const cW = W - pL - pR, cH = H - pT - pB;

  const vals = data.map((d) => d.v);
  const rawMin = Math.min(...vals), rawMax = Math.max(...vals);
  const span = rawMax - rawMin || 2;
  const yMin = rawMin - span * 0.15, yMax = rawMax + span * 0.25;
  const ySpan = yMax - yMin;

  const px = (i) => pL + (i / (data.length - 1)) * cW;
  const py = (v) => pT + cH - ((v - yMin) / ySpan) * cH;
  const pts = data.map((d, i) => [px(i), py(d.v)]);

  let linePath = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = (pts[i - 1][0] + pts[i][0]) / 2;
    linePath += ` C${cx.toFixed(1)},${pts[i - 1][1].toFixed(1)} ${cx.toFixed(1)},${pts[i][1].toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
  }
  const floor = (pT + cH + 1).toFixed(1);
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${floor} L${pts[0][0].toFixed(1)},${floor}Z`;

  const ticks = Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    return { y: (pT + cH - frac * cH).toFixed(1), label: Math.round(yMin + frac * ySpan) };
  });

  const last = pts[pts.length - 1];
  const lastV = vals[vals.length - 1];

  return (
    <svg aria-hidden="true" className="pro-line-chart" preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="pro-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.7" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
        <linearGradient id="pro-area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {ticks.map((tick) => (
        <g key={tick.y}>
          <line x1={pL} y1={tick.y} x2={W - pR} y2={tick.y}
            stroke="rgba(0,0,0,0.055)" strokeWidth="1" strokeDasharray="4 4" />
          <text x={(pL - 5)} y={tick.y} fill="#a0af9e"
            fontSize="9.5" textAnchor="end" dominantBaseline="middle">{tick.label}°</text>
        </g>
      ))}

      <path d={areaPath} fill="url(#pro-area-grad)" />
      <path d={linePath} fill="none" stroke="url(#pro-line-grad)"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {pts.map((pt, i) => {
        const isLast = i === pts.length - 1;
        return (
          <g key={i}>
            {isLast && <circle cx={pt[0].toFixed(1)} cy={pt[1].toFixed(1)} r="9" fill={color} fillOpacity="0.13" />}
            <circle cx={pt[0].toFixed(1)} cy={pt[1].toFixed(1)} r={isLast ? 4.5 : 2.5}
              fill={isLast ? color : "#fff"} stroke={color} strokeWidth="1.8" />
          </g>
        );
      })}

      <text x={last[0].toFixed(1)} y={(last[1] - 15).toFixed(1)}
        fill={color} fontSize="11" fontWeight="800" textAnchor="middle">{lastV.toFixed(0)}°</text>
    </svg>
  );
}

function RainBarChart({ data }) {
  if (!data.length) return <div className="chart-empty">{t("ui.noData")}</div>;

  const W = 440, H = 120;
  const pL = 8, pR = 8, pT = 22, pB = 4;
  const cW = W - pL - pR, cH = H - pT - pB;
  const slot = cW / data.length;
  const bW = slot * 0.62;
  const bOff = slot * 0.19;
  const y50 = (pT + cH - 0.5 * cH).toFixed(1);

  return (
    <svg aria-hidden="true" className="pro-bar-chart" preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        {data.map((d, i) => {
          const [c0, c1] = d.v >= 60
            ? ["#60a5fa", "#1d4ed8"]
            : d.v >= 35
            ? ["#93c5fd", "#2563eb"]
            : ["#dbeafe", "#93c5fd"];
          return (
            <linearGradient key={i} id={`rg${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c0} stopOpacity="0.95" />
              <stop offset="100%" stopColor={c1} stopOpacity="0.75" />
            </linearGradient>
          );
        })}
      </defs>

      <line x1={pL} y1={y50} x2={W - pR} y2={y50}
        stroke="rgba(0,0,0,0.07)" strokeWidth="1" strokeDasharray="4 4" />

      {data.map((d, i) => {
        const x = pL + i * slot + bOff;
        const bH = Math.max(3, (d.v / 100) * cH);
        const y = pT + cH - bH;
        const labelColor = d.v >= 60 ? "#1e40af" : d.v >= 35 ? "#2563eb" : "#6b9ab8";
        return (
          <g key={d.label}>
            <rect x={x.toFixed(1)} y={y.toFixed(1)} width={bW.toFixed(1)} height={bH.toFixed(1)}
              rx="3.5" fill={`url(#rg${i})`} />
            {d.v > 5 && (
              <text x={(x + bW / 2).toFixed(1)} y={(y - 5).toFixed(1)}
                fill={labelColor} fontSize="9" fontWeight="800" textAnchor="middle">{d.v}%</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ForecastChartsPanel({ hourly }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const tempData = hourly.slice(0, 8).map((h) => ({ label: h.time, v: Number(h.temp) })).filter((d) => Number.isFinite(d.v));
  const rainData = hourly.slice(0, 8).map((h) => ({ label: h.time, v: Number(h.rain) })).filter((d) => Number.isFinite(d.v));
  return (
    <Panel className="forecast-charts-panel">
      <SectionHeading title={t("mon.forecast8h")} />
      <div className="chart-block">
        <span className="chart-label">{t("mon.tempLabel")}</span>
        <MiniLineChart color="#2F7A45" data={tempData} height={150} />
        <div className="chart-x-labels">{tempData.map((d) => <span key={d.label}>{d.label}</span>)}</div>
      </div>
      <div className="chart-block">
        <span className="chart-label">{t("mon.rainLabel")}</span>
        <RainBarChart data={rainData} />
        <div className="chart-x-labels">{rainData.map((d) => <span key={d.label}>{d.label}</span>)}</div>
      </div>
    </Panel>
  );
}

function CurrentConditionsPanel({ current, daily }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  return (
    <Panel className="current-conditions-panel">
      <SectionHeading title={t("mon.currCond")} />
      <div className="conditions-grid">
        <CleanMetric icon={CloudRain} label={t("mon.rainChance")} tone="amber" value={`${daily[0]?.rain ?? "--"}%`} />
        <CleanMetric icon={Droplets} label={t("mon.humidity")} tone="green" value={`${formatInt(current.relative_humidity_2m)}%`} />
        <CleanMetric icon={Wind} label={t("mon.wind")} tone="blue" value={`${formatNumber(current.wind_speed_10m)} km/h`} />
        <CleanMetric icon={Gauge} label={t("mon.pressure")} tone="neutral" value={`${formatInt(current.pressure_msl)} hPa`} />
      </div>
      <div className="daily-forecast-mini">
        {daily.slice(0, 4).map((row) => {
          const info = getWeatherInfo(row.code);
          const Icon = info.Icon;
          return (
            <div className="daily-mini-row" key={row.date}>
              <span>{row.label}</span>
              <Icon size={15} />
              <span className="daily-mini-temp">{formatInt(row.min)}/{formatInt(row.max)}°C</span>
              <span className={`rain-pct ${row.rain >= 60 ? "high" : row.rain >= 35 ? "mid" : ""}`}>{row.rain}%</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function CollapsibleEnso() {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const [open, setOpen] = useState(false);
  const enso = useMemo(() => getEnsoData(), [lang]);
  return (
    <div className="collapsible-enso">
      <button className="collapsible-enso-header" onClick={() => setOpen((o) => !o)} type="button">
        <span>{t("mon.enso")}</span>
        <span className={`enso-mini-badge ${enso.phaseTone}`}>{ensoLabel(enso.phase)} {enso.oni >= 0 ? "+" : ""}{enso.oni.toFixed(1)}</span>
        <ChevronDown className={`dropdown-chevron ${open ? "open" : ""}`} size={15} />
      </button>
      {open && <div className="collapsible-enso-body"><EnsoPanel /></div>}
    </div>
  );
}

function getSensorStatus(key, rawValue) {
  const v = Number(rawValue);
  if (!Number.isFinite(v)) return { tone: "neutral", label: t("st.noData") };
  switch (key) {
    case "ph":
      if (v >= 6.0 && v <= 7.5) return { tone: "success", label: t("st.normal") };
      if (v >= 5.5 && v <= 8.0) return { tone: "amber",   label: t("st.watch") };
      return { tone: "danger", label: t("st.abnormal") };
    case "do_mgl":
      if (v >= 5)  return { tone: "success", label: t("st.good") };
      if (v >= 3)  return { tone: "amber",   label: t("st.low") };
      return { tone: "danger", label: t("st.critical") };
    case "do_sat":
      if (v >= 70) return { tone: "success", label: t("st.good") };
      if (v >= 50) return { tone: "amber",   label: t("st.low") };
      return { tone: "danger", label: t("st.critical") };
    case "ntu":
      if (v <= 50)  return { tone: "success", label: t("st.clear") };
      if (v <= 100) return { tone: "amber",   label: t("st.turbid") };
      return { tone: "danger", label: t("st.vTurbid") };
    case "ec_ms_cm":
    case "ec":
      if (v <= 2) return { tone: "success", label: t("st.normal") };
      if (v <= 3) return { tone: "amber",   label: t("st.high") };
      return { tone: "danger", label: t("st.vHigh") };
    case "tds":
      if (v <= 500) return { tone: "success", label: t("st.normal") };
      if (v <= 800) return { tone: "amber",   label: t("st.high") };
      return { tone: "danger", label: t("st.vHigh") };
    case "water_level_cm":
      if (v >= 10) return { tone: "success", label: t("st.normal") };
      if (v >= 5)  return { tone: "amber",   label: t("st.low") };
      return { tone: "danger", label: t("st.critical") };
    case "water_temp":
      if (v >= 25 && v <= 32) return { tone: "success", label: t("st.normal") };
      if (v >= 20 && v <= 35) return { tone: "amber",   label: t("st.watch") };
      return { tone: "danger", label: t("st.abnormal") };
    case "air_temp":
      if (v >= 20 && v <= 35) return { tone: "success", label: t("st.normal") };
      if (v >= 15 && v <= 38) return { tone: "amber",   label: t("st.watch") };
      return { tone: "danger", label: t("st.abnormal") };
    case "humidity":
      if (v >= 60 && v <= 85) return { tone: "success", label: t("st.normal") };
      if (v >= 45 && v <= 92) return { tone: "amber",   label: t("st.watch") };
      return { tone: "danger", label: t("st.abnormal") };
    case "soil_moisture":
      if (v >= 40 && v <= 80) return { tone: "success", label: t("st.normal") };
      if (v >= 20 && v <= 85) return { tone: "amber",   label: t("st.watch") };
      return { tone: "danger", label: t("st.abnormal") };
    default:
      return { tone: "neutral", label: t("st.normal") };
  }
}

function SensorHeroRow({ node }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const rows = getSensorRows(node);
  // เกษตรกรแตะการ์ดเพื่อดูว่าค่านี้คืออะไร/ช่วงปกติเท่าไหร่ ไม่ต้องไปหน้า Guide แยก
  // เดิมโชว์แบบขยายในการ์ดเอง ทำให้การ์ดนั้นสูงกว่าเพื่อนจนแถวเพี้ยน เปลี่ยนเป็น popover ลอย
  // (fixed position คำนวณจากปุ่มที่กด) แทน ไม่กระทบความสูงการ์ดเลย
  const [openInfo, setOpenInfo] = useState(null); // { key, label, icon, tone, x, y, width }

  // popover ใช้ fixed position ที่จับพิกัดตอนกดไว้ครั้งเดียว — ถ้า scroll หน้าแล้วการ์ดขยับ
  // ตำแหน่ง popover จะไม่ตามไปด้วย ปิดทิ้งไปเลยง่ายกว่าไล่คำนวณตำแหน่งใหม่ทุกครั้งที่ scroll
  useEffect(() => {
    if (!openInfo) return;
    const close = () => setOpenInfo(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [openInfo]);

  if (!rows.length) {
    return (
      <div className="sensor-hero-empty">
        <Radio size={17} />
        <span>{getNodeName(node)} — {t("mon.sensorEmpty")}</span>
      </div>
    );
  }

  const POPOVER_HALF_WIDTH = 130; // ต้องตรงกับ max-width/2 ของ .sensor-info-popover ใน CSS
  const openPopover = (row, status, e) => {
    if (openInfo?.key === row.key) { setOpenInfo(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = rect.left + rect.width / 2;
    // กันโป่งล้นขอบจอซ้าย/ขวา โดยเฉพาะการ์ดริมสุดบนมือถือ
    const x = Math.min(Math.max(rawX, POPOVER_HALF_WIDTH + 12), window.innerWidth - POPOVER_HALF_WIDTH - 12);
    setOpenInfo({ key: row.key, label: row.label, icon: row.icon, tone: status.tone, x, y: rect.bottom + 8 });
  };

  const openRow = rows.find((r) => r.key === openInfo?.key);
  const openInfoContent = openRow ? sensorMeaning(openRow.key) : null;

  return (
    <div className="sensor-hero-row">
      {rows.map((row) => {
        const status = getSensorStatus(row.key, row.value);
        const Icon = row.icon;
        const v = Number(row.value);
        const displayVal = row.key === "tds"
          ? Math.round(v).toString()
          : (row.key === "ph" || row.key === "do_mgl" || row.key === "do_sat")
            ? v.toFixed(2)
            : v.toFixed(1);
        const info = sensorMeaning(row.key);
        return (
          <article className={`sensor-hero-card ${status.tone}`} key={row.key}>
            {info && (
              <button
                className="sensor-hero-info-btn"
                onClick={(e) => openPopover(row, status, e)}
                aria-label={t("mon.whatIsThis")}
                type="button"
              >
                <Info size={13} />
              </button>
            )}
            <span className="sensor-hero-icon"><Icon size={18} /></span>
            <span className="sensor-hero-label">{row.label}</span>
            <strong className="sensor-hero-value">{displayVal}</strong>
            {row.unit && <span className="sensor-hero-unit">{row.unit}</span>}
            <span className={`sensor-hero-status ${status.tone}`}>{status.label}</span>
          </article>
        );
      })}

      {openInfo && openInfoContent && (
        <>
          <div className="sensor-info-backdrop" onClick={() => setOpenInfo(null)} />
          <div
            className={`sensor-info-popover ${openInfo.tone}`}
            style={{ left: openInfo.x, top: openInfo.y }}
          >
            <div className="sensor-info-popover-head">
              <span className={`sensor-info-popover-icon ${openInfo.tone}`}>
                <openInfo.icon size={16} />
              </span>
              <strong>{openInfo.label}</strong>
              <button className="sensor-info-popover-close" onClick={() => setOpenInfo(null)} aria-label={t("ui.close")} type="button">
                <X size={14} />
              </button>
            </div>
            <p>{openInfoContent.meaning}</p>
            <span className="sensor-info-popover-range">{openInfoContent.range}</span>
          </div>
        </>
      )}
    </div>
  );
}

function NodeMetaBar({ node, location }) {
  return (
    <div className="node-meta-bar">
      <span><strong>Node:</strong> {getNodeId(node)}</span>
      <span><strong>Gateway:</strong> {node.gatewayId || "home-gateway-001"}</span>
      {node.battery != null && (
        <span><Battery size={12} /> {formatInt(node.battery)}%</span>
      )}
      {node.rssi != null && (
        <span><Signal size={12} /> {node.rssi} dBm</span>
      )}
      {location.lat != null && (
        <span><MapPin size={12} /> {formatNumber(location.lat, 4)}, {formatNumber(location.lon, 4)}</span>
      )}
    </div>
  );
}

const DEFAULT_CTRL = { machineOn: false, pump1: false, pump2: false, autoPhMode: false, phMin: 6.5, phMax: 7.5 };

function NodeControlPanel({ firebaseUrl, nodeId }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const [ctrl, setCtrl] = useState(DEFAULT_CTRL);
  const [ctrlLoading, setCtrlLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [phMin, setPhMin] = useState("6.50");
  const [phMax, setPhMax] = useState("7.50");

  useEffect(() => {
    if (!firebaseUrl) return;
    setCtrlLoading(true);
    fetchNodeControl(firebaseUrl, nodeId)
      .then((data) => {
        setCtrl(data);
        setPhMin(String(data.phMin ?? 6.5));
        setPhMax(String(data.phMax ?? 7.5));
      })
      .catch(() => {})
      .finally(() => setCtrlLoading(false));
  }, [firebaseUrl, nodeId]);

  const send = async (patch) => {
    if (!firebaseUrl) { setErrMsg(t("ctrl.errNoUrl")); return; }
    setSaving(true);
    setSavedMsg("");
    setErrMsg("");
    try {
      await writeNodeControl(firebaseUrl, nodeId, patch);
      const next = { ...ctrl, ...patch };
      setCtrl(next);
      setSavedMsg(t("ctrl.saved"));
      setTimeout(() => setSavedMsg(""), 2500);
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const applyPh = () => send({ autoPhMode: ctrl.autoPhMode, phMin: parseFloat(phMin) || 6.5, phMax: parseFloat(phMax) || 7.5 });

  if (!firebaseUrl) return (
    <div className="node-ctrl-panel">
      <p className="node-ctrl-err-msg">{t("ctrl.errNoUrl")}</p>
    </div>
  );

  return (
    <div className="node-ctrl-panel">
      <div className="node-ctrl-header">
        <div className="node-ctrl-icon"><Wrench size={18} /></div>
        <div className="node-ctrl-header-text">
          <h3>{t("ctrl.title")}</h3>
          <p>{t("ctrl.subtitle")}</p>
        </div>
        {saving && <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-3)" }}>{t("ctrl.saving")}</span>}
        {savedMsg && <span className="node-ctrl-saved-msg" style={{ marginLeft: "auto" }}>{savedMsg}</span>}
        {errMsg   && <span className="node-ctrl-err-msg"   style={{ marginLeft: "auto" }}>{errMsg}</span>}
      </div>

      {ctrlLoading ? (
        <p style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>{t("ctrl.loading")}</p>
      ) : (
        <>
          <div className="node-ctrl-grid">
            {/* System ON/OFF */}
            <div className="node-ctrl-card">
              <span className="node-ctrl-card-label">{t("ctrl.machine")}</span>
              <div className="node-ctrl-status">
                <span className={`node-ctrl-dot ${ctrl.machineOn ? "on" : "off"}`} />
                {ctrl.machineOn ? t("ctrl.machineOn") : t("ctrl.machineOff")}
              </div>
              <div className="node-ctrl-buttons">
                <button
                  className={`node-ctrl-btn ${ctrl.machineOn ? "active-on" : ""}`}
                  disabled={saving}
                  onClick={() => send({ machineOn: true })}
                  type="button"
                >{t("ctrl.start")}</button>
                <button
                  className={`node-ctrl-btn ${!ctrl.machineOn ? "active-off" : ""}`}
                  disabled={saving}
                  onClick={() => send({ machineOn: false })}
                  type="button"
                >{t("ctrl.stop")}</button>
              </div>
            </div>

            {/* Pump 1 */}
            <div className="node-ctrl-card">
              <span className="node-ctrl-card-label">{t("ctrl.pump1")}</span>
              <div className="node-ctrl-status">
                <span className={`node-ctrl-dot ${ctrl.pump1 ? "on" : "off"}`} />
                {ctrl.pump1 ? t("ctrl.on") : t("ctrl.off")}
              </div>
              <div className="node-ctrl-buttons">
                <button
                  className={`node-ctrl-btn ${ctrl.pump1 ? "active-on" : ""}`}
                  disabled={saving}
                  onClick={() => send({ pump1: true })}
                  type="button"
                >{t("ctrl.on")}</button>
                <button
                  className={`node-ctrl-btn ${!ctrl.pump1 ? "active-off" : ""}`}
                  disabled={saving}
                  onClick={() => send({ pump1: false })}
                  type="button"
                >{t("ctrl.off")}</button>
              </div>
            </div>

            {/* Pump 2 */}
            <div className="node-ctrl-card">
              <span className="node-ctrl-card-label">{t("ctrl.pump2")}</span>
              <div className="node-ctrl-status">
                <span className={`node-ctrl-dot ${ctrl.pump2 ? "on" : "off"}`} />
                {ctrl.pump2 ? t("ctrl.on") : t("ctrl.off")}
              </div>
              <div className="node-ctrl-buttons">
                <button
                  className={`node-ctrl-btn ${ctrl.pump2 ? "active-on" : ""}`}
                  disabled={saving}
                  onClick={() => send({ pump2: true })}
                  type="button"
                >{t("ctrl.on")}</button>
                <button
                  className={`node-ctrl-btn ${!ctrl.pump2 ? "active-off" : ""}`}
                  disabled={saving}
                  onClick={() => send({ pump2: false })}
                  type="button"
                >{t("ctrl.off")}</button>
              </div>
            </div>
          </div>

          {/* Auto pH */}
          <div className="node-ctrl-autopH">
            <div className="node-ctrl-autopH-header">
              <span>{t("ctrl.autoPh")}</span>
              <label className="node-ctrl-toggle">
                <input
                  checked={ctrl.autoPhMode}
                  disabled={saving}
                  onChange={(e) => send({ autoPhMode: e.target.checked })}
                  type="checkbox"
                />
                <span className="node-ctrl-toggle-track" />
                <span className="node-ctrl-toggle-thumb" />
              </label>
            </div>
            <div className="node-ctrl-ph-row">
              <label>{t("ctrl.phMin")}</label>
              <input max="14" min="0" onChange={(e) => setPhMin(e.target.value)} step="0.1" type="number" value={phMin} />
              <label>–</label>
              <label>{t("ctrl.phMax")}</label>
              <input max="14" min="0" onChange={(e) => setPhMax(e.target.value)} step="0.1" type="number" value={phMax} />
              <button className="node-ctrl-apply-btn" disabled={saving} onClick={applyPh} type="button">{t("ctrl.apply")}</button>
            </div>
          </div>
        </>
      )}

      <div className="node-ctrl-note">
        <Info size={13} />
        <span>{t("ctrl.note")}</span>
      </div>
    </div>
  );
}

function MonitorPage(props) {
  const {
    advisor,
    advisorLoading,
    current,
    daily,
    devices,
    error,
    farmOverview,
    hourly,
    loading,
    location,
    recommendations,
    refreshData,
    runAdvisor,
    selectedNodeId,
    setSelectedNodeId,
    settings,
    weatherInfo,
  } = props;

  const nodeForDisplay = useMemo(() => {
    if (selectedNodeId && devices.length) {
      const found = devices.find((n) => getNodeId(n) === selectedNodeId);
      if (found) return found;
    }
    return location;
  }, [devices, location, selectedNodeId]);

  const { lang } = useLang();
  const ensoData = useMemo(() => getEnsoData(), []);
  const risk = useMemo(() => calcRisk(daily, nodeForDisplay, ensoData), [daily, nodeForDisplay, ensoData, lang]);
  const displayDeviceState = getDeviceState(nodeForDisplay);
  const sensorRows = getSensorRows(nodeForDisplay);
  const summary = farmOverview?.summary || { gateways: 0, nodes: 0, onlineNodes: 0, warningNodes: 0, offlineNodes: 0, activeAlerts: 0, sensorTypes: [], latestAt: null };
  const onlineCount = summary.onlineNodes ?? 0;
  const totalCount = summary.nodes || devices.length;

  return (
    <div className="page page-monitor">

      {/* Header */}
      <div className="monitor-header-row">
        <div>
          <h1 className="monitor-title">{t("mon.title")}</h1>
          <div className="monitor-live-row">
            <span className={`live-dot-badge ${displayDeviceState.tone === "success" ? "online" : "dim"}`}>● LIVE</span>
            <TimeAgo iso={location.updatedAt} />
          </div>
        </div>
        <div className="monitor-header-actions">
          <select
            aria-label={t("mon.selectNode")}
            className="node-select"
            onChange={(e) => setSelectedNodeId(e.target.value)}
            value={selectedNodeId || location.nodeId || location.deviceId}
          >
            {devices.length ? devices.map((node) => (
              <option key={getNodeId(node)} value={getNodeId(node)}>{getNodeName(node)}</option>
            )) : (
              <option value={location.nodeId || location.deviceId}>{location.name || location.deviceId}</option>
            )}
          </select>
          <button className="secondary-action" onClick={refreshData} type="button">
            <RefreshCw className={loading ? "spinning" : ""} size={17} />
            <span>{t("ui.refresh")}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="notice warning">
          <Bell size={18} /><span>{error}</span>
        </div>
      )}

      {/* Row 1: Mission Control */}
      <div className="mission-control-row">
        <MissionCard icon={weatherInfo.Icon} label={t("mon.weather")} primary sub={weatherInfo.text} tone="blue" value={`${formatNumber(current.temperature_2m)}°C`} />
        <MissionCard
          icon={Router}
          label={t("mon.nodesOnline")}
          sub={`${summary.warningNodes ?? 0} ${t("mon.staleUnit")}`}
          tone={onlineCount === totalCount ? "success" : onlineCount > 0 ? "amber" : "danger"}
          value={`${onlineCount}/${totalCount}`}
        />
        <MissionCard
          icon={Bell}
          label={t("mon.alerts")}
          sub={summary.activeAlerts ? t("mon.alertAct") : t("mon.alertOk")}
          tone={summary.activeAlerts ? "danger" : "success"}
          value={`${summary.activeAlerts || 0}`}
        />
        <MissionCard icon={ShieldCheck} label={t("mon.riskToday")} sub={risk.sub} tone={risk.tone} value={risk.label} />
      </div>

      {/* Row 2: Sensor Values */}
      <SensorHeroRow node={nodeForDisplay} />
      <NodeMetaBar location={location} node={nodeForDisplay} />

      {/* Row 2.5: Node Control (NODE1 only) */}
      {getNodeId(nodeForDisplay) === "NODE1" && (
        <NodeControlPanel firebaseUrl={settings?.firebaseUrl} nodeId="NODE1" />
      )}

      {/* Row 3: AI Summary */}
      <MonitorAiPanel
        advisor={advisor}
        advisorLoading={advisorLoading}
        nodeName={getNodeName(nodeForDisplay)}
        recommendations={recommendations}
        runAdvisor={runAdvisor}
      />

      {/* Row 4: Forecast Charts + Current Conditions */}
      <div className="monitor-forecast-row">
        <ForecastChartsPanel hourly={hourly} />
        <CurrentConditionsPanel current={current} daily={daily} />
      </div>

      {/* Row 5: Map — full width */}
      <div className="monitor-map-full">
        <MapPanel location={location} nodes={devices} onSelectNode={setSelectedNodeId} selectedNodeId={selectedNodeId || location.nodeId || location.deviceId} />
      </div>

      {/* Row 6: Gateway Panel */}
      <GatewayPanel devices={devices} firebaseUrl={settings?.firebaseUrl} />

      {/* Row 7: ENSO */}
      <CollapsibleEnso />

    </div>
  );
}

function DevicesPage({ devices, location, navigate, refreshData, selectedNodeId, setSelectedNodeId, settings }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const rows = devices.length ? devices : settings.dataSource === "demo" ? demoDevices : [];

  const openNode = (node) => {
    setSelectedNodeId(getNodeId(node));
    navigate("monitor");
  };

  return (
    <div className="page">
      <PageHeader
        action={
          <button className="secondary-action" onClick={refreshData} type="button">
            <RefreshCw size={17} />
            <span>{t("dev.refresh")}</span>
          </button>
        }
        subtitle={t("dev.subtitle")}
        title={t("dev.title")}
      />

      <Panel className="device-table-panel">
        <div className="table-wrap">
          <table className="device-table">
            <thead>
              <tr>
                <th>{t("dev.colNode")}</th>
                <th>{t("dev.colStatus")}</th>
                <th>{t("dev.colSensor")}</th>
                <th>{t("dev.colPos")}</th>
                <th>LoRa/GPS</th>
                <th>{t("dev.colBatt")}</th>
                <th>{t("dev.colUpdated")}</th>
                <th>{t("dev.colAction")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((device) => {
                const state = getDeviceState(device);
                const nodeId = getNodeId(device);
                const selected = nodeId === (selectedNodeId || location.nodeId || location.deviceId);
                return (
                  <tr className={selected ? "selected-row" : ""} key={nodeId}>
                    <td>
                      <div className="device-name">
                        <span className="device-rail" />
                        <div>
                          <strong>{getNodeName(device)}</strong>
                          <span>{device.fieldName || nodeId}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusChip tone={state.tone}>{state.label}</StatusChip>
                    </td>
                    <td>
                      <SensorBadgeList sensors={device.sensorConfig || Object.keys(device.sensors || {})} />
                    </td>
                    <td>
                      <span className="mono">
                        {formatNumber(device.lat, 5)}, {formatNumber(device.lon, 5)}
                      </span>
                    </td>
                    <td>
                      <SignalMeter accuracy={device.accuracy} rssi={device.rssi} snr={device.snr} />
                    </td>
                    <td>
                      <BatteryMeter value={device.battery} />
                    </td>
                    <td>{formatTime(device.updatedAt)}</td>
                    <td>
                      <button className="icon-button" onClick={() => openNode(device)} title={t("dev.openBtn")} type="button">
                        <ArrowRight size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan="8">
                    <div className="empty-state">
                      <Radio size={24} />
                      <strong>{t("dev.empty")}</strong>
                      <span>{t("dev.emptyHint")}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function SettingsPage({ refreshData, settings, setSettings }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const [saved, setSaved] = useState(false);

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const saveSettings = () => {
    setSaved(true);
    refreshData();
  };

  return (
    <div className="page">
      <PageHeader subtitle={t("set.subtitle")} title={t("set.title")} />

      <div className="settings-layout">
        <Panel>
          <SectionHeading title={t("set.connTitle")} subtitle={t("set.connSubtitle")} />
          <div className="form-grid">
            {settings.dataSource === "firebase" ? (
              <label className="field full">
                <span>Firebase Database URL</span>
                <input
                  onChange={(event) => updateSetting("firebaseUrl", event.target.value)}
                  type="url"
                  value={settings.firebaseUrl || ""}
                />
              </label>
            ) : (
              <>
                <label className="field full">
                  <span>Backend URL</span>
                  <input
                    onChange={(event) => updateSetting("backendUrl", event.target.value)}
                    type="url"
                    value={settings.backendUrl}
                  />
                </label>
                <label className="field full">
                  <span>Device Token</span>
                  <div className="masked-input">
                    <input readOnly type="password" value="SECRET_DEVICE_TOKEN" />
                    <ShieldCheck size={18} />
                  </div>
                </label>
                <ConnectionState label={t("set.connOk")} />
                <ConnectionState label={t("set.connToken")} />
              </>
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeading title={t("set.dataTitle")} subtitle={t("set.dataSubtitle")} />
          <div className="form-grid">
            <label className="field">
              <span>{t("set.interval")}</span>
              <select
                onChange={(event) => updateSetting("updateInterval", Number(event.target.value))}
                value={settings.updateInterval}
              >
                <option value={10}>{t("set.sec10")}</option>
                <option value={30}>{t("set.sec30")}</option>
                <option value={60}>{t("set.min1")}</option>
                <option value={300}>{t("set.min5")}</option>
              </select>
            </label>
            <div className="field">
              <span>{t("set.source")}</span>
              <div className="segmented">
                <button
                  className={settings.dataSource === "firebase" ? "selected" : ""}
                  onClick={() => updateSetting("dataSource", "firebase")}
                  type="button"
                >
                  Firebase
                </button>
                <button
                  className={settings.dataSource === "esp32" ? "selected" : ""}
                  onClick={() => updateSetting("dataSource", "esp32")}
                  type="button"
                >
                  ESP32 Server
                </button>
                <button
                  className={settings.dataSource === "browser" ? "selected" : ""}
                  onClick={() => updateSetting("dataSource", "browser")}
                  type="button"
                >
                  {t("set.srcBrowser")}
                </button>
                <button
                  className={settings.dataSource === "demo" ? "selected" : ""}
                  onClick={() => updateSetting("dataSource", "demo")}
                  type="button"
                >
                  {t("set.srcDemo")}
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="save-row">
        {saved && (
          <span className="save-state">
            <CheckCircle2 size={17} />
            {t("set.saved")}
          </span>
        )}
        <button className="primary-action" onClick={saveSettings} type="button">
          <Save size={18} />
          <span>{t("set.saveBtn")}</span>
        </button>
      </div>
    </div>
  );
}

function PageHeader({ action, subtitle, title }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function SectionHeading({ subtitle, title }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function Panel({ children, className = "" }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

// เดิม advisor text (จาก AI) โชว์เป็น raw markdown (**bold**, ### ฯลฯ) ตรงๆ ไม่สวย
// escape HTML ก่อนแล้วค่อยผ่าน marked — กัน HTML แปลกปลอมจาก AI response โผล่มาเป็น element จริง
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function AiMarkdown({ text }) {
  const html = marked.parse(escapeHtml(text), { breaks: true });
  return <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function MetricCard({ delta, icon: Icon, label, tone = "neutral", value }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-head">
        <span className="metric-icon">
          <Icon size={18} />
        </span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{delta}</p>
      <Sparkline tone={tone} />
    </article>
  );
}

function CleanMetric({ icon: Icon, label, tone = "neutral", value }) {
  return (
    <div className={`clean-metric ${tone}`}>
      <span>
        <Icon size={17} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SensorReadoutGrid({ rows }) {
  if (!rows.length) {
    return (
      <div className="sensor-readout empty">
        <Radio size={17} />
        <span>{t("dev.noSensors")}</span>
      </div>
    );
  }

  return (
    <div className="sensor-readout">
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <div className="sensor-readout-card" key={row.key}>
            <span>
              <Icon size={17} />
            </span>
            <div>
              <small>{row.label}</small>
              <strong>{formatSensorValue(row.key, row.value)}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SensorBadgeList({ sensors }) {
  const rows = normalizeSensorBadges(sensors);
  if (!rows.length) return <span className="muted-text">{t("ui.noSensorConf")}</span>;

  return (
    <div className="sensor-badges">
      {rows.slice(0, 4).map((sensor) => (
        <span key={sensor}>{sensorMeta(sensor).label}</span>
      ))}
      {rows.length > 4 && <span>+{rows.length - 4}</span>}
    </div>
  );
}

function normalizeSensorBadges(sensors) {
  if (Array.isArray(sensors)) return sensors.filter(Boolean);
  if (typeof sensors === "string") return sensors.split(",").map((item) => item.trim()).filter(Boolean);
  if (sensors && typeof sensors === "object") return Object.keys(sensors);
  return [];
}

function Sparkline({ tone }) {
  const points = tone === "amber" ? "0,24 16,18 32,23 48,11 64,17 80,9 96,20" : "0,18 16,14 32,16 48,10 64,13 80,8 96,12";
  return (
    <svg aria-hidden="true" className="sparkline" viewBox="0 0 96 28">
      <polyline fill="none" points={points} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function StatusChip({ children, icon: Icon, tone = "neutral" }) {
  return (
    <span className={`status-chip ${tone}`}>
      {Icon && <Icon size={14} />}
      {children}
    </span>
  );
}

function StatusDot({ tone, pulse = false }) {
  return <span className={`status-dot ${tone}${pulse ? " pulse" : ""}`} />;
}

function TimeAgo({ iso }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      if (!iso) { setLabel(""); return; }
      const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
      if (sec < 60) setLabel(`${sec} ${t("ui.secAgo")}`);
      else setLabel(`${Math.round(sec / 60)} ${t("ui.minAgo")}`);
    };
    update();
    const timer = setInterval(update, 5000);
    return () => clearInterval(timer);
  }, [iso, lang]);
  return label ? <span className="time-ago">{label}</span> : null;
}

function ResultCard({ icon: Icon, stat, label, desc }) {
  return (
    <article className="result-card">
      <span className="result-icon"><Icon size={22} /></span>
      <strong className="result-stat">{stat}</strong>
      <p className="result-label">{label}</p>
      <p className="result-desc">{desc}</p>
    </article>
  );
}

function useCountUp(target, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let current = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      setValue(Math.round(current));
      if (current >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

function CountUp({ target, suffix = "" }) {
  const v = useCountUp(target);
  return <>{v}{suffix}</>;
}

function SocialProofBar() {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  return (
    <div className="social-proof-bar">
      <div className="proof-item">
        <strong><CountUp target={25} /></strong>
        <span>{t("land.proofFarms")}</span>
      </div>
      <div className="proof-sep" aria-hidden="true" />
      <div className="proof-item">
        <strong><CountUp target={120} /></strong>
        <span>LoRa Nodes</span>
      </div>
      <div className="proof-sep" aria-hidden="true" />
      <div className="proof-item">
        <strong><CountUp target={720} /></strong>
        <span>Sensors</span>
      </div>
      <div className="proof-sep" aria-hidden="true" />
      <div className="proof-item">
        <strong>99.2%</strong>
        <span>Uptime</span>
      </div>
    </div>
  );
}

function InfoStat({ label, value }) {
  return (
    <div className="info-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniMap({ location }) {
  return (
    <div className="mini-map">
      <div className="map-grid-lines" />
      <div className="mini-map-pin">
        <Radio size={18} />
      </div>
      <span className="mini-map-label">{location.deviceId}</span>
    </div>
  );
}

function MapPanel({ location, nodes = [], onSelectNode, selectedNodeId }) {
  const mapNode = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const circles = useRef(new Map());
  const visibleNodes = useMemo(() => {
    const mapped = nodes.map(nodeToLocation).filter(Boolean);
    return mapped.length ? mapped : [nodeToLocation(location) || location].filter(Boolean);
  }, [location, nodes]);

  useEffect(() => {
    if (!mapNode.current || map.current) return undefined;

    map.current = L.map(mapNode.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([location.lat, location.lon], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map.current);

    return () => {
      map.current?.remove();
      map.current = null;
      markers.current.clear();
      circles.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const activeIds = new Set();

    visibleNodes.forEach((node) => {
      const id = getNodeId(node);
      const state = getDeviceState(node);
      const selected = id === selectedNodeId || id === location.nodeId || id === location.deviceId;
      const latLng = [Number(node.lat), Number(node.lon)];
      activeIds.add(id);

      const icon = L.divIcon({
        className: "",
        html: `<div class="map-pin ${state.tone} ${selected ? "selected" : ""}"><span>${selected ? "ON" : "RF"}</span></div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 42],
      });

      let marker = markers.current.get(id);
      if (!marker) {
        marker = L.marker(latLng, { icon }).addTo(map.current);
        marker.on("click", () => onSelectNode?.(id));
        markers.current.set(id, marker);
      } else {
        marker.setLatLng(latLng);
        marker.setIcon(icon);
      }

      const popup = `<b>${getNodeName(node)}</b><br/>${node.fieldName || id}<br/>Lat ${formatNumber(node.lat, 6)}<br/>Lon ${formatNumber(node.lon, 6)}`;
      marker.bindPopup(popup);

      let circle = circles.current.get(id);
      if (!circle) {
        circle = L.circle(latLng, {
          radius: Number(node.accuracy) || 50,
          color: selected ? "#0d5f2a" : "#14843b",
          fillColor: selected ? "#76d58a" : "#a6d8b1",
          fillOpacity: selected ? 0.22 : 0.14,
          weight: selected ? 2 : 1,
        }).addTo(map.current);
        circles.current.set(id, circle);
      } else {
        circle.setLatLng(latLng);
        circle.setRadius(Number(node.accuracy) || 50);
        circle.setStyle({
          color: selected ? "#0d5f2a" : "#14843b",
          fillOpacity: selected ? 0.22 : 0.14,
          weight: selected ? 2 : 1,
        });
      }
    });

    markers.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
    circles.current.forEach((circle, id) => {
      if (!activeIds.has(id)) {
        circle.remove();
        circles.current.delete(id);
      }
    });

    const selected = visibleNodes.find((node) => getNodeId(node) === selectedNodeId) || nodeToLocation(location);
    if (selected?.lat != null && selected?.lon != null) {
      map.current.flyTo([Number(selected.lat), Number(selected.lon)], 14, { duration: 0.6 });
    } else if (visibleNodes.length > 1) {
      const bounds = L.latLngBounds(visibleNodes.map((node) => [Number(node.lat), Number(node.lon)]));
      map.current.fitBounds(bounds.pad(0.18));
    }
  }, [location, onSelectNode, selectedNodeId, visibleNodes]);

  return (
    <Panel className="map-panel">
      <div className="panel-title-row">
        <div>
          <span className="panel-label">{t("mon.mapTitle")}</span>
          <h2>{getNodeName(location)}</h2>
        </div>
        <StatusChip tone={location.default ? "warning" : "success"} icon={MapPin}>
          {visibleNodes.length} nodes
        </StatusChip>
      </div>
      <div className="map-canvas" ref={mapNode} />
    </Panel>
  );
}

function HourlyForecast({ compact = false, rows }) {
  return (
    <Panel className={compact ? "hourly-panel compact" : "hourly-panel"}>
      <SectionHeading title={t("fc.hourly")} />
      <div className="hourly-grid">
        {rows.map((row) => {
          const info = getWeatherInfo(row.code);
          const Icon = info.Icon;
          return (
            <div className="hourly-cell" key={row.time}>
              <strong>{row.time}</strong>
              <Icon size={22} />
              <span>{formatInt(row.temp)} C</span>
              <div className="rain-bar">
                <span style={{ width: `${Math.min(100, row.rain)}%` }} />
              </div>
              {!compact && <small>{row.rain}% rain</small>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function DailyForecast({ rows }) {
  return (
    <Panel className="daily-panel">
      <SectionHeading title={t("fc.daily")} />
      <div className="daily-list">
        {rows.map((row) => {
          const info = getWeatherInfo(row.code);
          const Icon = info.Icon;
          return (
            <div className="daily-row" key={row.date}>
              <span>{row.label}</span>
              <Icon size={20} />
              <strong>
                {formatInt(row.min)} / {formatInt(row.max)} C
              </strong>
              <small>{row.rain}% rain</small>
              <small>{formatNumber(row.amount)} mm</small>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function RecommendationPanel({ recommendations }) {
  return (
    <Panel className="recommend-panel">
      <SectionHeading title={t("fc.sysRec")} />
      <ul>
        {recommendations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Panel>
  );
}

function AiPanel({ advisor, advisorLoading, recommendations, runAdvisor }) {
  return (
    <Panel className="ai-panel">
      <div className="panel-title-row">
        <SectionHeading title={t("fc.aiTitle")} subtitle={t("fc.aiSub")} />
        <Activity size={20} />
      </div>
      <ul className="recommend-list">
        {recommendations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="ai-actions">
        <button className="secondary-action" disabled={advisorLoading} onClick={() => runAdvisor("advice")} type="button">
          <Sprout size={17} />
          <span>{t("fc.aiAdvice")}</span>
        </button>
        <button className="secondary-action" disabled={advisorLoading} onClick={() => runAdvisor("risk")} type="button">
          <ShieldCheck size={17} />
          <span>{t("fc.aiRisk")}</span>
        </button>
      </div>
      {(advisor || advisorLoading) && (
        <div className={`ai-result ${advisorLoading ? "loading" : ""}`}>
          {advisorLoading ? t("fc.aiLoading") : <AiMarkdown text={advisor} />}
        </div>
      )}
    </Panel>
  );
}

function SignalMeter({ accuracy, rssi, snr }) {
  const good = rssi != null ? Number(rssi) >= -75 : Number(accuracy) <= 10;
  const mid = rssi != null ? Number(rssi) >= -90 : Number(accuracy) <= 50;
  return (
    <div className="signal-meter">
      <Signal size={16} />
      <span className={good ? "good" : mid ? "mid" : "low"}>
        {rssi != null ? `${formatInt(rssi)} dBm` : accuracy ? `±${formatInt(accuracy)} m` : "--"}
      </span>
      {snr != null && <small>{formatNumber(snr, 1)} SNR</small>}
    </div>
  );
}

function BatteryMeter({ value }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, Number(value)));
  return (
    <div className="battery-meter">
      <Battery size={17} />
      <div>
        <span style={{ width: `${pct}%` }} />
      </div>
      <strong>{value == null ? "--" : `${formatInt(value)}%`}</strong>
    </div>
  );
}

function ConnectionState({ label }) {
  return (
    <div className="connection-state">
      <CheckCircle2 size={18} />
      <span>{label}</span>
    </div>
  );
}

/* ============================================================
   Gateway Panel — แสดงสถานะ ESP32 Gateway + Nodes ที่เชื่อมต่อ
   ============================================================ */
const NODE_DEFS = {
  NODE1: {
    label: "Water Quality Node",
    icon: Droplets,
    chip: "ESP32 Dev · SX1278",
    hasGps: false,
    sensors: ["ph","do_mgl","ntu","ec_ms_cm"],
  },
  DM01: {
    label: "Monitor Buoy 1",
    icon: MapPin,
    chip: "Heltec V4 · SX1262",
    hasGps: true,
    sensors: ["tds","lat","lon","sat"],
  },
  DM02: {
    label: "Monitor Buoy 2",
    icon: MapPin,
    chip: "Heltec V4 · SX1262",
    hasGps: true,
    sensors: ["tds","lat","lon","sat"],
  },
};

function RssiBar({ rssi }) {
  if (rssi == null) return <span className="gw-sig-na">—</span>;
  const tone = rssi >= -70 ? "success" : rssi >= -85 ? "amber" : rssi >= -100 ? "warn" : "danger";
  const label = rssi >= -70 ? t("sig.strong") : rssi >= -85 ? t("sig.good") : rssi >= -100 ? t("sig.weak") : t("sig.poor");
  const bars = rssi >= -70 ? 4 : rssi >= -85 ? 3 : rssi >= -100 ? 2 : 1;
  return (
    <span className={`gw-rssi tone-${tone}`} title={`RSSI ${rssi} dBm`}>
      {[1,2,3,4].map(b => <span key={b} className={b <= bars ? "bar-on" : "bar-off"} />)}
      <em>{rssi} dBm</em>
    </span>
  );
}

function GatewayPanel({ devices, firebaseUrl }) {
  const isConnected = !!firebaseUrl;
  const onlineCount = devices.filter(d => d.tone === "success").length;
  const displayNodes = devices.length
    ? devices
    : Object.keys(NODE_DEFS).map(id => ({ nodeId: id, tone: "dim", latestSensors: {}, updatedAt: null, rssi: null, snr: null }));

  return (
    <Panel className="gateway-panel">
      {/* Header */}
      <div className="gw-header">
        <div>
          <div className="gw-title-row">
            <Router size={18} className="gw-icon" />
            <span className="gw-title">LoRa Gateway</span>
            <span className={`gw-conn-badge ${isConnected ? "online" : "offline"}`}>
              <span className="gw-dot" />
              {isConnected ? "Firebase RTDB" : t("gw.notConnected")}
            </span>
          </div>
          <div className="gw-spec-row">
            <span><Cpu size={12} />ESP32</span>
            <span><Radio size={12} />Ra-02 · 433 MHz</span>
            <span>SF7 · BW125 kHz · 0x12</span>
            <span className="gw-gps-chip"><MapPin size={12} />GPS Module</span>
            <span className="gw-gps-pending">· firmware pending</span>
          </div>
        </div>
        <div className="gw-summary-chips">
          <div className="gw-chip"><strong>{displayNodes.length}</strong><span>Nodes</span></div>
          <div className="gw-chip success"><strong>{onlineCount}</strong><span>Online</span></div>
          <div className="gw-chip warn"><strong>{devices.filter(d => d.tone === "warning").length}</strong><span>{t("gw.staleShort")}</span></div>
          <div className="gw-chip danger"><strong>{devices.filter(d => d.tone === "danger").length}</strong><span>Offline</span></div>
        </div>
      </div>

      {/* Node cards */}
      <div className="gw-nodes-grid">
        {displayNodes.map(node => {
          const def  = NODE_DEFS[node.nodeId] || { label: node.nodeId, icon: Router, sensors: [] };
          const Icon = def.icon;
          const s    = node.latestSensors || node.sensors || {};
          const tone = node.tone || "dim";

          return (
            <div key={node.nodeId} className={`gw-node-card tone-${tone}`}>
              {/* Node header */}
              <div className="gw-node-header">
                <div className="gw-node-id-row">
                  <Icon size={14} />
                  <strong>{node.nodeId}</strong>
                </div>
                <span className={`gw-node-badge tone-${tone}`}>
                  {tone === "success" ? t("st.online") : tone === "danger" ? t("st.offline") : tone === "warning" ? t("gw.staleShort") : "—"}
                </span>
              </div>
              <div className="gw-node-type">
                {def.label}
                {def.chip && <span className="gw-node-chip">{def.chip}</span>}
                {def.hasGps && <span className="gw-gps-badge"><MapPin size={9} />GPS</span>}
              </div>

              {/* Sensors */}
              <div className="gw-node-sensors">
                {s.ph        != null && <div className="gw-s"><span>pH</span><strong>{s.ph.toFixed(2)}</strong></div>}
                {s.do_mgl    != null && <div className="gw-s"><span>DO</span><strong>{s.do_mgl.toFixed(1)}<em>mg/L</em></strong></div>}
                {s.ntu       != null && <div className="gw-s"><span>NTU</span><strong>{s.ntu.toFixed(1)}</strong></div>}
                {s.ec_ms_cm  != null && <div className="gw-s"><span>EC</span><strong>{s.ec_ms_cm.toFixed(2)}<em>mS</em></strong></div>}
                {s.tds       != null && <div className="gw-s"><span>TDS</span><strong>{Math.round(s.tds)}<em>ppm</em></strong></div>}
                {def.hasGps && (
                  s.lat != null && s.lon != null ? (
                    <>
                      <div className="gw-s">
                        <span>Satellites</span>
                        <strong>{s.sat != null ? `${s.sat} sat` : "—"}</strong>
                      </div>
                      <div className="gw-s gw-s-coord">
                        <span>Position</span>
                        <strong>{s.lat.toFixed(5)}, {s.lon.toFixed(5)}</strong>
                      </div>
                      {s.alt != null && s.alt !== -1 && (
                        <div className="gw-s"><span>Altitude</span><strong>{s.alt.toFixed(1)}<em>m</em></strong></div>
                      )}
                    </>
                  ) : (
                    <div className="gw-s gw-s-gps-wait">
                      <span><MapPin size={10} />GPS</span>
                      <strong className="dim">{t("gps.waitFix")}</strong>
                    </div>
                  )
                )}
                {Object.keys(s).length === 0 && !def.hasGps && <div className="gw-s-empty">{t("ui.noData")}</div>}
              </div>

              {/* Signal + timestamp */}
              <div className="gw-node-footer">
                <RssiBar rssi={node.rssi} />
                {node.snr != null && <span className="gw-snr">{node.snr.toFixed(1)} dB</span>}
                <span className="gw-ts"><TimeAgo iso={node.updatedAt} /></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* LoRa command channel info */}
      <div className="gw-cmd-info">
        <Signal size={13} />
        <span>{t("gw.cmdInfo")}</span>
      </div>
    </Panel>
  );
}

function EnsoPanel() {
  const enso = getEnsoData();
  const TrendIcon = enso.trend === "warming" ? TrendingUp : enso.trend === "cooling" ? TrendingDown : Activity;

  const W = 700, H = 180;
  const pL = 40, pR = 16, pT = 12, pB = 26;
  const cW = W - pL - pR, cH = H - pT - pB;

  const yMin = -1.8, yMax = 1.8, ySpan = yMax - yMin;
  const py = (v) => pT + cH - ((v - yMin) / ySpan) * cH;
  const px = (i) => pL + (i / (enso.series.length - 1)) * cW;
  const pts = enso.series.map((d, i) => [px(i), py(d.v)]);

  let linePath = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = (pts[i - 1][0] + pts[i][0]) / 2;
    linePath += ` C${cx.toFixed(1)},${pts[i - 1][1].toFixed(1)} ${cx.toFixed(1)},${pts[i][1].toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
  }

  const lineColor = enso.phaseTone === "amber" ? "#ea580c" : enso.phaseTone === "blue" ? "#2563eb" : "#16a34a";
  const last   = pts[pts.length - 1];
  const lastV  = enso.series[enso.series.length - 1].v;
  const y05    = py(0.5);
  const yn05   = py(-0.5);
  const y0     = py(0);
  const yTop   = pT;
  const yBot   = pT + cH;

  const areaPath = `${linePath} L${last[0].toFixed(1)},${y0.toFixed(1)} L${pts[0][0].toFixed(1)},${y0.toFixed(1)}Z`;

  const yTicks = [1.5, 0.5, 0, -0.5, -1.5];
  const step   = Math.max(1, Math.ceil(enso.series.length / 6));

  // pill label: above dot if room, else below
  const labelAbove = last[1] - 28 > yTop + 2;
  const pillCX = Math.min(last[0], W - pR - 23);

  return (
    <Panel className="enso-panel">
      <div className="panel-title-row">
        <SectionHeading title={t("mon.enso")} subtitle={`${t("enso.latestData")}: ${enso.lastSeason}`} />
        <TrendIcon size={20} />
      </div>

      <div className="enso-chart-wrap">
        <svg aria-hidden="true" className="enso-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="ez-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={lastV >= 0 ? "0.35" : "0.04"} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={lastV >= 0 ? "0.04" : "0.32"} />
            </linearGradient>
            <clipPath id="ez-clip">
              <rect x={pL} y={yTop} width={cW} height={cH} />
            </clipPath>
          </defs>

          {/* Chart background */}
          <rect x={pL} y={yTop} width={cW} height={cH} fill="#f7f9f7" rx="4" />

          {/* Zone bands */}
          <rect x={pL} y={yTop} width={cW} height={Math.max(0, y05 - yTop)}
            fill={enso.phaseTone === "amber" ? "rgba(234,88,12,0.11)" : "rgba(251,146,60,0.08)"} clipPath="url(#ez-clip)" />
          <rect x={pL} y={yn05} width={cW} height={Math.max(0, yBot - yn05)}
            fill={enso.phaseTone === "blue" ? "rgba(37,99,235,0.12)" : "rgba(96,165,250,0.08)"} clipPath="url(#ez-clip)" />

          {/* Zone labels inside chart */}
          <text x={pL + 8} y={yTop + 13}
            fill={enso.phaseTone === "amber" ? "rgba(234,88,12,0.65)" : "rgba(234,88,12,0.40)"}
            fontSize="8" fontWeight="700" letterSpacing="0.5">EL NIÑO ZONE</text>
          <text x={pL + 8} y={yBot - 6}
            fill={enso.phaseTone === "blue" ? "rgba(37,99,235,0.65)" : "rgba(37,99,235,0.40)"}
            fontSize="8" fontWeight="700" letterSpacing="0.5">LA NIÑA ZONE</text>

          {/* Grid lines */}
          {yTicks.map((v) => {
            const y  = py(v).toFixed(1);
            const isThr = Math.abs(v) === 0.5;
            const isZ   = v === 0;
            return (
              <g key={v}>
                <line x1={pL} y1={y} x2={W - pR} y2={y}
                  stroke={isThr ? (v > 0 ? "rgba(234,88,12,0.40)" : "rgba(37,99,235,0.40)")
                    : isZ ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.06)"}
                  strokeWidth={isThr || isZ ? "1.5" : "1"}
                  strokeDasharray={isThr || isZ ? "none" : "3 5"} />
                <text x={pL - 7} y={y}
                  fill={isThr ? (v > 0 ? "#ea580c" : "#2563eb") : "#c0c4bc"}
                  fontSize="9" textAnchor="end" dominantBaseline="middle"
                  fontWeight={isThr ? "700" : "400"}>
                  {v > 0 ? `+${v.toFixed(1)}` : v === 0 ? "0" : v.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#ez-area)" clipPath="url(#ez-clip)" />

          {/* "Now" vertical indicator */}
          <line x1={last[0].toFixed(1)} y1={yTop} x2={last[0].toFixed(1)} y2={yBot}
            stroke={lineColor} strokeOpacity="0.22" strokeWidth="1.5" strokeDasharray="4 3" />

          {/* Main line */}
          <path d={linePath} fill="none" stroke={lineColor}
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* End point — triple-ring glow + dot */}
          <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="16" fill={lineColor} fillOpacity="0.06" />
          <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="10" fill={lineColor} fillOpacity="0.14" />
          <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="5.5" fill={lineColor} />
          <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2"   fill="#fff" />

          {/* Value pill — solid colored, above or below dot */}
          <rect
            x={(pillCX - 22).toFixed(1)}
            y={(labelAbove ? last[1] - 32 : last[1] + 12).toFixed(1)}
            width="44" height="20" rx="10"
            fill={lineColor} />
          <text
            x={pillCX.toFixed(1)}
            y={(labelAbove ? last[1] - 22 : last[1] + 22).toFixed(1)}
            fill="#fff" fontSize="10.5" fontWeight="800" textAnchor="middle" dominantBaseline="middle">
            {lastV >= 0 ? `+${lastV.toFixed(1)}` : lastV.toFixed(1)}
          </text>

          {/* X labels */}
          {enso.series.map((d, i) => {
            if (i !== 0 && i !== enso.series.length - 1 && i % step !== 0) return null;
            return (
              <text key={d.s} x={px(i).toFixed(1)} y={(yBot + 17).toFixed(1)}
                fill="#c0c4bc" fontSize="9" textAnchor="middle">{d.s}</text>
            );
          })}
        </svg>
      </div>

      {/* Badge + impacts */}
      <div className="enso-summary-row">
        <div className={`enso-phase-badge ${enso.phaseTone}`}>
          <strong>{ensoLabel(enso.phase)}</strong>
          <span>ONI {enso.oni >= 0 ? "+" : ""}{enso.oni.toFixed(1)}</span>
        </div>
        <ul className="enso-impacts">
          {ensoImpacts(enso.phase).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <p className="enso-outlook">{ensoOutlook(enso.phase)}</p>
    </Panel>
  );
}

// ─── Guide Page ──────────────────────────────────────────────────────────────

function GuideSection({ icon: Icon, title, children }) {
  return (
    <section className="guide-section">
      <div className="guide-section-header">
        <span className="guide-section-icon"><Icon size={22} /></span>
        <h2>{title}</h2>
      </div>
      <div className="guide-section-body">{children}</div>
    </section>
  );
}

function GuideStep({ num, title, desc }) {
  return (
    <div className="guide-step">
      <span className="guide-step-num">{num}</span>
      <div>
        <strong>{title}</strong>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function GuideBadge({ color, label, desc }) {
  return (
    <div className="guide-badge-row">
      <span className={`guide-dot guide-dot-${color}`} />
      <div>
        <strong>{label}</strong>
        <span>{desc}</span>
      </div>
    </div>
  );
}

function GuideSensorCard({ icon: Icon, name, unit, range, meaning }) {
  return (
    <div className="guide-sensor-card">
      <span className="guide-sensor-icon"><Icon size={18} /></span>
      <div className="guide-sensor-info">
        <strong>{name} <span className="guide-sensor-unit">{unit}</span></strong>
        <span className="guide-sensor-range">{range}</span>
        <p>{meaning}</p>
      </div>
    </div>
  );
}

function GuidePage({ navigate }) {
  const { lang } = useLang(); // eslint-disable-line no-unused-vars
  return (
    <div className="page guide-page">
      <PageHeader title={t("guide.title")} subtitle={t("guide.subtitle")} />

      {/* ── ภาพรวมระบบ ── */}
      <GuideSection icon={Home} title={t("guide.s1title")}>
        <p className="guide-intro">{t("guide.s1intro")}</p>
        <div className="guide-nav-cards">
          <button className="guide-nav-card" onClick={() => navigate("monitor")} type="button">
            <Monitor size={26} />
            <strong>{t("nav.monitor")}</strong>
            <span>{t("guide.navMonDesc")}</span>
            <span className="guide-nav-go"><ChevronRight size={14} /> {t("guide.goBtn")}</span>
          </button>
          <button className="guide-nav-card" onClick={() => navigate("devices")} type="button">
            <Router size={26} />
            <strong>{t("nav.devices")}</strong>
            <span>{t("guide.navDevDesc")}</span>
            <span className="guide-nav-go"><ChevronRight size={14} /> {t("guide.goBtn")}</span>
          </button>
          <button className="guide-nav-card" onClick={() => navigate("settings")} type="button">
            <Settings size={26} />
            <strong>{t("nav.settings")}</strong>
            <span>{t("guide.navSetDesc")}</span>
            <span className="guide-nav-go"><ChevronRight size={14} /> {t("guide.goBtn")}</span>
          </button>
        </div>
      </GuideSection>

      {/* ── หน้า Monitor ── */}
      <GuideSection icon={Eye} title={t("guide.s2title")}>
        <div className="guide-steps">
          <GuideStep num="1" title={t("guide.monStep1t")} desc={t("guide.monStep1d")} />
          <GuideStep num="2" title={t("guide.monStep2t")} desc={t("guide.monStep2d")} />
          <GuideStep num="3" title={t("guide.monStep3t")} desc={t("guide.monStep3d")} />
          <GuideStep num="4" title={t("guide.monStep4t")} desc={t("guide.monStep4d")} />
        </div>

        <h3 className="guide-sub">{t("guide.statusTitle")}</h3>
        <div className="guide-badge-list">
          <GuideBadge color="green"  label={t("st.online")}  desc={t("guide.stOnlineD")} />
          <GuideBadge color="yellow" label={t("st.stale")}   desc={t("guide.stStaleD")} />
          <GuideBadge color="red"    label={t("st.offline")} desc={t("guide.stOfflineD")} />
        </div>
      </GuideSection>

      {/* ── ค่าเซนเซอร์ ── */}
      <GuideSection icon={BarChart2} title={t("guide.s3title")}>
        <p className="guide-intro">{t("guide.s3intro")}</p>
        <div className="guide-sensor-grid">
          <GuideSensorCard icon={FlaskConical} name="pH"           unit=""       range={t("guide.phRange")}  meaning={t("guide.phMean")} />
          <GuideSensorCard icon={Zap}          name="EC"           unit="mS/cm"  range={t("guide.ecRange")}  meaning={t("guide.ecMean")} />
          <GuideSensorCard icon={Activity}     name="DO"           unit="mg/L"   range={t("guide.doRange")}  meaning={t("guide.doMean")} />
          <GuideSensorCard icon={Droplets}     name={t("sensor.ntu")} unit="NTU" range={t("guide.ntuRange")} meaning={t("guide.ntuMean")} />
          <GuideSensorCard icon={Droplets}     name={t("sensor.water_level_cm")} unit="cm" range={t("guide.wlRange")} meaning={t("guide.wlMean")} />
          <GuideSensorCard icon={Thermometer}  name={t("sensor.water_temp")} unit="°C" range={t("guide.wtRange")} meaning={t("guide.wtMean")} />
        </div>

        <h3 className="guide-sub">{t("guide.colorTitle")}</h3>
        <div className="guide-badge-list">
          <GuideBadge color="green"  label={t("st.normal")}   desc={t("guide.colGreenD")} />
          <GuideBadge color="yellow" label={t("st.watch")}    desc={t("guide.colYellowD")} />
          <GuideBadge color="red"    label={t("st.abnormal")} desc={t("guide.colRedD")} />
        </div>
      </GuideSection>

      {/* ── AI & ความเสี่ยง ── */}
      <GuideSection icon={Cpu} title={t("guide.s4title")}>
        <p className="guide-intro">{t("guide.s4intro")}</p>
        <div className="guide-steps">
          <GuideStep num="1" title={t("guide.aiStep1t")} desc={t("guide.aiStep1d")} />
          <GuideStep num="2" title={t("guide.aiStep2t")} desc={t("guide.aiStep2d")} />
          <GuideStep num="3" title={t("guide.aiStep3t")} desc={t("guide.aiStep3d")} />
        </div>
        <div className="guide-badge-list" style={{ marginTop: "16px" }}>
          <GuideBadge color="red"    label={t("risk.high")}   desc={t("guide.riskHighD")} />
          <GuideBadge color="yellow" label={t("risk.medium")} desc={t("guide.riskMidD")} />
          <GuideBadge color="green"  label={t("risk.low")}    desc={t("guide.riskLowD")} />
        </div>
      </GuideSection>

      {/* ── ENSO ── */}
      <GuideSection icon={CloudRain} title={t("guide.s5title")}>
        <p className="guide-intro">{t("guide.s5intro")}</p>
        <div className="guide-badge-list">
          <GuideBadge color="yellow" label={t("guide.ensoEl")}  desc={t("guide.ensoElD")} />
          <GuideBadge color="blue"   label={t("guide.ensoLa")}  desc={t("guide.ensoLaD")} />
          <GuideBadge color="green"  label={t("guide.ensoNeu")} desc={t("guide.ensoNeuD")} />
        </div>
      </GuideSection>

      {/* ── ตั้งค่า ── */}
      <GuideSection icon={Settings} title={t("guide.s6title")}>
        <div className="guide-steps">
          <GuideStep num="1" title={t("guide.setStep1t")} desc={t("guide.setStep1d")} />
          <GuideStep num="2" title={t("guide.setStep2t")} desc={t("guide.setStep2d")} />
        </div>
      </GuideSection>

      {/* ── เปลี่ยนภาษา ── */}
      <GuideSection icon={BookOpen} title={t("guide.s7title")}>
        <p className="guide-intro">{t("guide.s7intro")}</p>
      </GuideSection>
    </div>
  );
}

export default function AppRoot() {
  return (
    <LangProvider>
      <App />
    </LangProvider>
  );
}
