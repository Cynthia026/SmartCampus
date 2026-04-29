const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// IN-MEMORY DATA STORE
// ─────────────────────────────────────────────

let libraryData = {
  currentOccupancy: 42,
  capacity: 100,
  lastUpdated: new Date().toISOString(),
  floors: [
    { id: 1, name: "Planta Baja", occupancy: 18, capacity: 30 },
    { id: 2, name: "Primer Piso", occupancy: 14, capacity: 35 },
    { id: 3, name: "Segundo Piso", occupancy: 10, capacity: 35 },
  ],
  history: Array.from({ length: 12 }, (_, i) => ({
    hour: `${8 + i}:00`,
    occupancy: Math.floor(Math.random() * 80) + 10,
  })),
};

let bathroomReports = [
  {
    id: uuidv4(),
    location: "Edificio A – Planta Baja",
    description: "Jabón agotado y falta papel",
    votes: 12,
    status: "pending",
    reportedAt: new Date(Date.now() - 3600000).toISOString(),
    voters: [],
  },
  {
    id: uuidv4(),
    location: "Biblioteca – Primer Piso",
    description: "Inodoro atascado",
    votes: 8,
    status: "pending",
    reportedAt: new Date(Date.now() - 7200000).toISOString(),
    voters: [],
  },
  {
    id: uuidv4(),
    location: "Cafetería – Mujeres",
    description: "Piso mojado y resbaladizo",
    votes: 5,
    status: "in_progress",
    reportedAt: new Date(Date.now() - 1800000).toISOString(),
    voters: [],
  },
];

let outlets = [
  { id: 1, x: 18, y: 25, zone: "Sala A", available: true, type: "double" },
  { id: 2, x: 35, y: 20, zone: "Sala A", available: false, type: "triple" },
  { id: 3, x: 55, y: 22, zone: "Sala B", available: true, type: "double" },
  { id: 4, x: 72, y: 28, zone: "Sala B", available: true, type: "usb" },
  { id: 5, x: 25, y: 55, zone: "Cafetería", available: true, type: "double" },
  { id: 6, x: 45, y: 60, zone: "Cafetería", available: false, type: "double" },
  { id: 7, x: 65, y: 58, zone: "Pasillo Central", available: true, type: "triple" },
  { id: 8, x: 80, y: 45, zone: "Biblioteca", available: true, type: "usb" },
  { id: 9, x: 82, y: 62, zone: "Biblioteca", available: false, type: "double" },
  { id: 10, x: 15, y: 78, zone: "Jardín", available: true, type: "weatherproof" },
  { id: 11, x: 50, y: 80, zone: "Jardín", available: true, type: "weatherproof" },
  { id: 12, x: 35, y: 40, zone: "Aula 101", available: true, type: "triple" },
];

let wifiZones = [
  { id: 1, x: 20, y: 22, name: "Biblioteca", signal: 95, band: "5GHz", ssid: "Campus-5G" },
  { id: 2, x: 50, y: 18, name: "Sala Cómputo", signal: 92, band: "5GHz", ssid: "Campus-5G" },
  { id: 3, x: 78, y: 25, name: "Laboratorio", signal: 78, band: "2.4GHz", ssid: "Campus-Lab" },
  { id: 4, x: 28, y: 55, name: "Cafetería", signal: 65, band: "2.4GHz", ssid: "Campus-Free" },
  { id: 5, x: 55, y: 52, name: "Plaza Central", signal: 45, band: "2.4GHz", ssid: "Campus-Free" },
  { id: 6, x: 78, y: 58, name: "Edificio A", signal: 88, band: "5GHz", ssid: "Campus-5G" },
  { id: 7, x: 15, y: 78, name: "Jardín Norte", signal: 30, band: "2.4GHz", ssid: "Campus-Free" },
  { id: 8, x: 50, y: 80, name: "Estacionamiento", signal: 20, band: "2.4GHz", ssid: "Campus-Free" },
];

// ─────────────────────────────────────────────
// REAL-TIME SIMULATION
// ─────────────────────────────────────────────

function simulateData() {
  // Library occupancy fluctuates naturally
  const delta = Math.floor(Math.random() * 7) - 3;
  libraryData.currentOccupancy = Math.max(
    5,
    Math.min(libraryData.capacity - 2, libraryData.currentOccupancy + delta)
  );
  libraryData.lastUpdated = new Date().toISOString();

  libraryData.floors = libraryData.floors.map((f) => ({
    ...f,
    occupancy: Math.max(1, Math.min(f.capacity - 1, f.occupancy + (Math.floor(Math.random() * 5) - 2))),
  }));

  // Occasionally toggle outlet availability
  if (Math.random() < 0.1) {
    const idx = Math.floor(Math.random() * outlets.length);
    outlets[idx] = { ...outlets[idx], available: !outlets[idx].available };
  }

  // WiFi signal fluctuates slightly
  wifiZones = wifiZones.map((z) => ({
    ...z,
    signal: Math.max(5, Math.min(100, z.signal + (Math.floor(Math.random() * 5) - 2))),
  }));
}

setInterval(simulateData, 5000);

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getOccupancyLevel(occupancy, capacity) {
  const pct = (occupancy / capacity) * 100;
  if (pct < 40) return "low";
  if (pct < 75) return "medium";
  return "high";
}

// ─────────────────────────────────────────────
// LIBRARY ROUTES
// ─────────────────────────────────────────────

app.get("/api/library", (req, res) => {
  const pct = Math.round((libraryData.currentOccupancy / libraryData.capacity) * 100);
  res.json({
    ...libraryData,
    percentage: pct,
    level: getOccupancyLevel(libraryData.currentOccupancy, libraryData.capacity),
    floors: libraryData.floors.map((f) => ({
      ...f,
      percentage: Math.round((f.occupancy / f.capacity) * 100),
      level: getOccupancyLevel(f.occupancy, f.capacity),
    })),
  });
});

// ─────────────────────────────────────────────
// BATHROOM ROUTES
// ─────────────────────────────────────────────

app.get("/api/bathrooms", (req, res) => {
  const sorted = [...bathroomReports].sort((a, b) => b.votes - a.votes);
  res.json(sorted);
});

app.post("/api/bathrooms", (req, res) => {
  const { location, description } = req.body;
  if (!location || !description) {
    return res.status(400).json({ error: "Location and description are required" });
  }
  const newReport = {
    id: uuidv4(),
    location,
    description,
    votes: 0,
    status: "pending",
    reportedAt: new Date().toISOString(),
    voters: [],
  };
  bathroomReports.unshift(newReport);
  res.status(201).json(newReport);
});

app.post("/api/bathrooms/:id/vote", (req, res) => {
  const { id } = req.params;
  const { voterId } = req.body;
  const report = bathroomReports.find((r) => r.id === id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (voterId && report.voters.includes(voterId)) {
    return res.status(409).json({ error: "Already voted" });
  }
  report.votes += 1;
  if (voterId) report.voters.push(voterId);
  res.json(report);
});

app.patch("/api/bathrooms/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const report = bathroomReports.find((r) => r.id === id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  report.status = status;
  res.json(report);
});

app.delete("/api/bathrooms/:id", (req, res) => {
  const { id } = req.params;
  const idx = bathroomReports.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: "Report not found" });
  bathroomReports.splice(idx, 1);
  res.json({ message: "Deleted" });
});

// ─────────────────────────────────────────────
// OUTLETS ROUTES
// ─────────────────────────────────────────────

app.get("/api/outlets", (req, res) => {
  const available = outlets.filter((o) => o.available).length;
  res.json({
    outlets,
    summary: {
      total: outlets.length,
      available,
      occupied: outlets.length - available,
    },
  });
});

app.patch("/api/outlets/:id", (req, res) => {
  const { id } = req.params;
  const outlet = outlets.find((o) => o.id === parseInt(id));
  if (!outlet) return res.status(404).json({ error: "Outlet not found" });
  outlet.available = !outlet.available;
  res.json(outlet);
});

// ─────────────────────────────────────────────
// WIFI ROUTES
// ─────────────────────────────────────────────

app.get("/api/wifi", (req, res) => {
  res.json({
    zones: wifiZones.map((z) => ({
      ...z,
      quality: z.signal >= 80 ? "excellent" : z.signal >= 60 ? "good" : z.signal >= 40 ? "fair" : "poor",
    })),
  });
});

// ─────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 SmartCampus API running on http://localhost:${PORT}`);
});
