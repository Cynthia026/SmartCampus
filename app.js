/* ─────────────────────────────────────────────
   SMARTCAMPUS — APP.JS
   Complete frontend logic
───────────────────────────────────────────── */

const API = "http://localhost:3001/api";
const VOTER_ID = (() => {
  let id = localStorage.getItem("sc_voter_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("sc_voter_id", id); }
  return id;
})();

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const state = {
  currentSection: "library",
  library: null,
  bathrooms: [],
  outlets: null,
  wifi: null,
  apiOnline: false,
  historyChart: null,
};

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────

function navigate(section) {
  state.currentSection = section;

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === section);
  });

  document.querySelectorAll(".section").forEach((s) => {
    s.classList.toggle("active", s.id === `section-${section}`);
  });

  closeSidebar();
  fetchSection(section);
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.section));
});

// ─────────────────────────────────────────────
// MOBILE SIDEBAR
// ─────────────────────────────────────────────

const overlay = document.createElement("div");
overlay.className = "sidebar-overlay";
document.body.appendChild(overlay);

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  overlay.classList.add("open");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  overlay.classList.remove("open");
}

document.getElementById("menuBtn")?.addEventListener("click", openSidebar);
overlay.addEventListener("click", closeSidebar);

// ─────────────────────────────────────────────
// API HEALTH
// ─────────────────────────────────────────────

async function checkHealth() {
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    const ok = r.ok;
    state.apiOnline = ok;
    setApiStatus(ok);
  } catch {
    state.apiOnline = false;
    setApiStatus(false);
  }
}

function setApiStatus(online) {
  const dots = [document.getElementById("api-status-dot"), document.getElementById("api-status-dot-mobile")];
  const text = document.getElementById("api-status-text");
  dots.forEach((d) => {
    if (!d) return;
    d.className = `status-dot${d.classList.contains("small") ? " small" : ""} ${online ? "online" : "offline"}`;
  });
  if (text) text.textContent = online ? "API conectada" : "Sin conexión";
}

// ─────────────────────────────────────────────
// FETCH ROUTER
// ─────────────────────────────────────────────

async function fetchSection(section) {
  switch (section) {
    case "library": return fetchLibrary();
    case "bathrooms": return fetchBathrooms();
    case "outlets": return fetchOutlets();
    case "wifi": return fetchWifi();
  }
}

// ─────────────────────────────────────────────
// LIBRARY
// ─────────────────────────────────────────────

async function fetchLibrary() {
  try {
    const r = await fetch(`${API}/library`);
    state.library = await r.json();
    renderLibrary(state.library);
  } catch {
    renderLibraryOffline();
  }
}

function renderLibrary(d) {
  // Semaphore
  document.getElementById("sem-green").className = "sem-light" + (d.level === "low" ? " active-green" : "");
  document.getElementById("sem-yellow").className = "sem-light" + (d.level === "medium" ? " active-yellow" : "");
  document.getElementById("sem-red").className = "sem-light" + (d.level === "high" ? " active-red" : "");

  document.getElementById("occ-number").textContent = d.currentOccupancy;
  document.getElementById("lib-capacity").textContent = d.capacity;
  document.getElementById("lib-available").textContent = d.capacity - d.currentOccupancy;
  document.getElementById("occ-capacity-label").textContent = `/ ${d.capacity}`;

  const badge = document.getElementById("occ-status-badge");
  const labels = { low: "🟢 Baja ocupación", medium: "🟡 Media ocupación", high: "🔴 Alta ocupación" };
  badge.textContent = labels[d.level];
  badge.className = `occ-status-badge ${d.level}`;

  const barColors = { low: "#00e5a0", medium: "#f5c518", high: "#ff2d55" };
  const bar = document.getElementById("occ-bar");
  bar.style.width = d.percentage + "%";
  bar.style.background = barColors[d.level];

  document.getElementById("library-updated").textContent =
    "Actualizado: " + new Date(d.lastUpdated).toLocaleTimeString("es-MX");

  // Floors
  const floorsEl = document.getElementById("floors-list");
  floorsEl.innerHTML = d.floors.map((f) => `
    <div class="floor-row">
      <div class="floor-name">${f.name}</div>
      <div class="floor-bar-track">
        <div class="floor-bar-fill" style="width:${f.percentage}%; background:${barColors[f.level]}"></div>
      </div>
      <div class="floor-pct">${f.occupancy}/${f.capacity}</div>
    </div>
  `).join("");

  // History chart
  if (d.history) renderHistoryChart(d.history);
}

function renderLibraryOffline() {
  document.getElementById("occ-number").textContent = "—";
  document.getElementById("occ-status-badge").textContent = "Sin datos";
}

function renderHistoryChart(history) {
  const canvas = document.getElementById("history-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = canvas.offsetWidth || 600;
  const H = 120;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  const max = 100;
  const pad = { l: 8, r: 8, t: 10, b: 24 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;

  const points = history.map((h, i) => ({
    x: pad.l + (i / (history.length - 1)) * chartW,
    y: pad.t + chartH - (h.occupancy / max) * chartH,
    label: h.hour,
    val: h.occupancy,
  }));

  // Fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + chartH);
  grad.addColorStop(0, "rgba(0,229,160,0.25)");
  grad.addColorStop(1, "rgba(0,229,160,0)");
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x, p.y); });
  ctx.lineTo(points[points.length - 1].x, pad.t + chartH);
  ctx.lineTo(points[0].x, pad.t + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x, p.y); });
  ctx.strokeStyle = "#00e5a0";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Labels (every 3 hours)
  ctx.fillStyle = "rgba(74,85,104,0.9)";
  ctx.font = "9px 'Space Mono'";
  ctx.textAlign = "center";
  points.forEach((p, i) => {
    if (i % 3 === 0) ctx.fillText(p.label, p.x, H - 6);
  });

  // Dots
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#00e5a0";
    ctx.fill();
  });
}

// ─────────────────────────────────────────────
// BATHROOMS
// ─────────────────────────────────────────────

async function fetchBathrooms() {
  try {
    const r = await fetch(`${API}/bathrooms`);
    state.bathrooms = await r.json();
    renderBathrooms(state.bathrooms);
  } catch {
    document.getElementById("reports-list").innerHTML =
      '<div class="loading-state">Error al cargar. Verifica la conexión.</div>';
  }
}

function renderBathrooms(reports) {
  const pending = reports.filter((r) => r.status !== "resolved");
  const inProg = reports.filter((r) => r.status === "in_progress");
  const votes = reports.reduce((s, r) => s + r.votes, 0);

  document.getElementById("bath-total").textContent = pending.length;
  document.getElementById("bath-inprogress").textContent = inProg.length;
  document.getElementById("bath-votes").textContent = votes;

  const badge = document.getElementById("bath-badge");
  if (pending.length > 0) {
    badge.textContent = pending.length;
    badge.classList.add("visible");
  } else {
    badge.classList.remove("visible");
  }

  const list = document.getElementById("reports-list");

  if (reports.length === 0) {
    list.innerHTML = '<div class="loading-state">✅ No hay reportes activos. ¡El campus está limpio!</div>';
    return;
  }

  const priority = (r) => (r.votes > 10 ? "high" : r.votes > 4 ? "medium" : "low");

  list.innerHTML = reports.map((r) => {
    const voted = r.voters?.includes(VOTER_ID);
    const ago = timeAgo(r.reportedAt);
    return `
      <div class="report-card priority-${priority(r)}" data-id="${r.id}">
        <div>
          <div class="report-location">📍 ${esc(r.location)}</div>
          <div class="report-description">${esc(r.description)}</div>
          <div class="report-meta">
            <span class="report-time">Hace ${ago}</span>
            <span class="status-pill ${r.status}">${statusLabel(r.status)}</span>
          </div>
          <div class="report-actions">
            ${r.status !== "in_progress" ? `<button class="btn-xs" onclick="markStatus('${r.id}','in_progress')">En proceso</button>` : ""}
            ${r.status !== "resolved" ? `<button class="btn-xs" onclick="markStatus('${r.id}','resolved')">Resuelto</button>` : ""}
            <button class="btn-xs danger" onclick="deleteReport('${r.id}')">Eliminar</button>
          </div>
        </div>
        <div class="vote-col">
          <button class="vote-btn ${voted ? "voted" : ""}" onclick="vote('${r.id}')">▲</button>
          <span class="vote-count">${r.votes}</span>
        </div>
      </div>
    `;
  }).join("");
}

async function vote(id) {
  try {
    const r = await fetch(`${API}/bathrooms/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: VOTER_ID }),
    });
    if (r.status === 409) { showToast("Ya votaste en este reporte", "error"); return; }
    if (!r.ok) throw new Error();
    fetchBathrooms();
  } catch { showToast("Error al votar", "error"); }
}

async function markStatus(id, status) {
  try {
    await fetch(`${API}/bathrooms/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchBathrooms();
    showToast("Estado actualizado ✓", "success");
  } catch { showToast("Error al actualizar", "error"); }
}

async function deleteReport(id) {
  if (!confirm("¿Eliminar este reporte?")) return;
  try {
    await fetch(`${API}/bathrooms/${id}`, { method: "DELETE" });
    fetchBathrooms();
    showToast("Reporte eliminado", "success");
  } catch { showToast("Error al eliminar", "error"); }
}

// MODAL
document.getElementById("openReportModal").addEventListener("click", () => {
  document.getElementById("reportModal").classList.add("open");
});
document.getElementById("closeReportModal").addEventListener("click", closeModal);
document.getElementById("cancelReport").addEventListener("click", closeModal);
document.getElementById("reportModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function closeModal() {
  document.getElementById("reportModal").classList.remove("open");
  document.getElementById("report-location").value = "";
  document.getElementById("report-description").value = "";
}

document.getElementById("submitReport").addEventListener("click", async () => {
  const location = document.getElementById("report-location").value.trim();
  const description = document.getElementById("report-description").value.trim();
  if (!location || !description) { showToast("Completa todos los campos", "error"); return; }

  try {
    const r = await fetch(`${API}/bathrooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, description }),
    });
    if (!r.ok) throw new Error();
    closeModal();
    fetchBathrooms();
    showToast("¡Reporte enviado! ✓", "success");
  } catch { showToast("Error al enviar reporte", "error"); }
});

// ─────────────────────────────────────────────
// OUTLETS
// ─────────────────────────────────────────────

async function fetchOutlets() {
  try {
    const r = await fetch(`${API}/outlets`);
    state.outlets = await r.json();
    renderOutlets(state.outlets);
  } catch {
    document.getElementById("outlets-list").innerHTML =
      '<div class="loading-state">Error al cargar enchufes</div>';
  }
}

function renderOutlets(data) {
  const { outlets, summary } = data;
  document.getElementById("out-available").textContent = summary.available;
  document.getElementById("out-occupied").textContent = summary.occupied;
  document.getElementById("out-total").textContent = summary.total;

  // Map
  renderOutletsMap(outlets);

  // List
  const typeLabel = { double: "Doble", triple: "Triple", usb: "USB", weatherproof: "Exterior" };
  document.getElementById("outlets-list").innerHTML = outlets.map((o) => `
    <div class="outlet-item" onclick="toggleOutlet(${o.id})" title="Clic para cambiar estado">
      <div class="outlet-dot ${o.available ? "available" : "occupied"}"></div>
      <div>
        <div class="outlet-name">${o.zone}</div>
        <div class="outlet-type">${typeLabel[o.type] || o.type} · #${o.id}</div>
      </div>
    </div>
  `).join("");
}

function renderOutletsMap(outlets) {
  const container = document.getElementById("outlets-map");
  container.innerHTML = `
    <svg viewBox="0 0 100 55" xmlns="http://www.w3.org/2000/svg">
      ${campusSVGBase()}
      ${outlets.map((o) => `
        <g class="map-pin" onclick="toggleOutlet(${o.id})" transform="translate(${o.x},${o.y})">
          <circle r="2.4" fill="${o.available ? "#00e5a0" : "#ff2d55"}"
            opacity="0.9"/>
          <circle r="1.2" fill="white" opacity="0.8"/>
          ${o.available ? `<circle r="2.4" fill="#00e5a0" opacity="0.3"><animate attributeName="r" values="2.4;4;2.4" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite"/></circle>` : ""}
        </g>
      `).join("")}
    </svg>
  `;
}

async function toggleOutlet(id) {
  try {
    await fetch(`${API}/outlets/${id}`, { method: "PATCH" });
    fetchOutlets();
    showToast("Estado del enchufe actualizado ✓", "success");
  } catch { showToast("Error al actualizar", "error"); }
}

// ─────────────────────────────────────────────
// WIFI
// ─────────────────────────────────────────────

async function fetchWifi() {
  try {
    const r = await fetch(`${API}/wifi`);
    state.wifi = await r.json();
    renderWifi(state.wifi);
  } catch {
    document.getElementById("wifi-zones-list").innerHTML =
      '<div class="loading-state">Error al cargar zonas WiFi</div>';
  }
}

function renderWifi(data) {
  const { zones } = data;

  document.getElementById("wifi-excellent").textContent = zones.filter((z) => z.quality === "excellent").length;
  document.getElementById("wifi-good").textContent = zones.filter((z) => z.quality === "good").length;
  document.getElementById("wifi-poor").textContent = zones.filter((z) => z.quality === "poor").length;

  // Map
  renderWifiMap(zones);

  // Cards
  const qualityColors = {
    excellent: "#00e5a0",
    good: "#f5c518",
    fair: "#ff6b35",
    poor: "#ff2d55",
  };
  const qualityLabels = { excellent: "Excelente", good: "Buena", fair: "Regular", poor: "Débil" };

  document.getElementById("wifi-zones-list").innerHTML = zones.map((z) => {
    const color = qualityColors[z.quality];
    return `
      <div class="wifi-zone-card">
        <div class="wifi-zone-name">📡 ${z.name}</div>
        <div class="wifi-signal-pct" style="color:${color}">${z.signal}%</div>
        <div class="wifi-signal-bar">
          <div class="wifi-signal-fill" style="width:${z.signal}%; background:${color}"></div>
        </div>
        <div class="wifi-ssid">${z.ssid} · ${z.band}</div>
        <div class="wifi-quality-badge" style="color:${color}; border-color:${color}; background:${color}18">
          ${qualityLabels[z.quality]}
        </div>
      </div>
    `;
  }).join("");
}

function renderWifiMap(zones) {
  const container = document.getElementById("wifi-map");
  const qualityColors = {
    excellent: "#00e5a0",
    good: "#f5c518",
    fair: "#ff6b35",
    poor: "#ff2d55",
  };

  container.innerHTML = `
    <svg viewBox="0 0 100 55" xmlns="http://www.w3.org/2000/svg">
      ${campusSVGBase()}
      ${zones.map((z) => {
        const color = qualityColors[z.quality];
        return `
          <g class="map-pin" transform="translate(${z.x},${z.y})">
            <circle r="${5 + (z.signal / 100) * 4}" fill="${color}" opacity="0.12"/>
            <circle r="2.5" fill="${color}" opacity="0.85"/>
            <circle r="1.2" fill="white" opacity="0.9"/>
            <text x="0" y="-4" text-anchor="middle" font-size="1.8" fill="${color}" font-family="Space Mono">${z.signal}%</text>
          </g>
        `;
      }).join("")}
    </svg>
  `;
}

// ─────────────────────────────────────────────
// CAMPUS SVG BASE MAP
// ─────────────────────────────────────────────

function campusSVGBase() {
  return `
    <!-- Background -->
    <rect width="100" height="55" fill="#080b0f"/>

    <!-- Paths / grass -->
    <rect x="5" y="5" width="90" height="45" rx="1" fill="#0c1018" stroke="#1e2530" stroke-width="0.3"/>

    <!-- Buildings -->
    <rect x="8" y="8" width="28" height="18" rx="0.5" fill="#111820" stroke="#1e2530" stroke-width="0.4"/>
    <text x="22" y="17.5" text-anchor="middle" font-size="2.2" fill="#4a5568" font-family="Syne">Biblioteca</text>
    <text x="22" y="21" text-anchor="middle" font-size="1.6" fill="#2d3748" font-family="Space Mono">Edificio B</text>

    <rect x="42" y="8" width="24" height="14" rx="0.5" fill="#111820" stroke="#1e2530" stroke-width="0.4"/>
    <text x="54" y="15.5" text-anchor="middle" font-size="2" fill="#4a5568" font-family="Syne">Sala Cómputo</text>

    <rect x="72" y="8" width="20" height="26" rx="0.5" fill="#111820" stroke="#1e2530" stroke-width="0.4"/>
    <text x="82" y="21.5" text-anchor="middle" font-size="2" fill="#4a5568" font-family="Syne">Edificio</text>
    <text x="82" y="25" text-anchor="middle" font-size="2" fill="#4a5568" font-family="Syne">A</text>

    <rect x="8" y="38" width="30" height="12" rx="0.5" fill="#111820" stroke="#1e2530" stroke-width="0.4"/>
    <text x="23" y="44.5" text-anchor="middle" font-size="2.2" fill="#4a5568" font-family="Syne">Jardín Norte</text>

    <rect x="44" y="38" width="22" height="12" rx="0.5" fill="#111820" stroke="#1e2530" stroke-width="0.4"/>
    <text x="55" y="44.5" text-anchor="middle" font-size="2" fill="#4a5568" font-family="Syne">Cafetería</text>

    <rect x="72" y="40" width="20" height="10" rx="0.5" fill="#111820" stroke="#1e2530" stroke-width="0.4"/>
    <text x="82" y="45.5" text-anchor="middle" font-size="2" fill="#4a5568" font-family="Syne">Estac.</text>

    <!-- Paths -->
    <line x1="38" y1="5" x2="38" y2="50" stroke="#0f1520" stroke-width="1.5"/>
    <line x1="5" y1="30" x2="95" y2="30" stroke="#0f1520" stroke-width="1.5"/>
    <line x1="68" y1="5" x2="68" y2="50" stroke="#0f1520" stroke-width="1"/>
  `;
}

// ─────────────────────────────────────────────
// AUTO-REFRESH
// ─────────────────────────────────────────────

setInterval(() => {
  fetchSection(state.currentSection);
}, 6000);

setInterval(checkHealth, 10000);

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function statusLabel(s) {
  return { pending: "Pendiente", in_progress: "En proceso", resolved: "Resuelto" }[s] || s;
}

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min`;
  return `${Math.floor(secs / 3600)} h`;
}

let toastTimer;
function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast"; }, 3000);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

async function init() {
  await checkHealth();
  await fetchLibrary();
}

init();
