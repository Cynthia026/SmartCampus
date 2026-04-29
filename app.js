/* ══════════════════════════════════════════════
   SMARTCAMPUS v2 — APP.JS
   Full frontend logic, all functionality
══════════════════════════════════════════════ */

const API = "http://localhost:3001/api";

/* ─────────────────────
   VOTER ID (persisted)
───────────────────────*/
const VOTER_ID = (() => {
  let id = localStorage.getItem("sc_v2_voter");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("sc_v2_voter", id); }
  return id;
})();

/* ─────────────────────
   STATE
───────────────────────*/
const state = {
  current: "library",
  library: null,
  bathrooms: [],
  outlets: null,
  wifi: null,
};

/* ══════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════ */

function navigate(view) {
  state.current = view;

  // Update tabs
  document.querySelectorAll(".nav-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.view === view);
  });

  // Update sections
  document.querySelectorAll(".view").forEach(s => {
    s.classList.toggle("active", s.id === `view-${view}`);
  });

  fetchCurrent();
}

document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => navigate(tab.dataset.view));
});

/* ══════════════════════════════════════════════
   API HEALTH
══════════════════════════════════════════════ */

async function checkHealth() {
  const dot  = document.getElementById("api-dot");
  const lbl  = document.getElementById("api-label");
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      dot.className = "api-dot online";
      lbl.textContent = "En línea";
    } else throw new Error();
  } catch {
    dot.className = "api-dot offline";
    lbl.textContent = "Sin conexión";
  }
}

/* ══════════════════════════════════════════════
   FETCH ROUTER
══════════════════════════════════════════════ */

function fetchCurrent() {
  const map = { library: fetchLibrary, bathrooms: fetchBathrooms, outlets: fetchOutlets, wifi: fetchWifi };
  map[state.current]?.();
}

/* ══════════════════════════════════════════════
   LIBRARY
══════════════════════════════════════════════ */

async function fetchLibrary() {
  try {
    const r = await fetch(`${API}/library`);
    state.library = await r.json();
    renderLibrary(state.library);
  } catch { /* silent */ }
}

function renderLibrary(d) {
  const { currentOccupancy: occ, capacity: cap, percentage: pct, level, floors, history, lastUpdated } = d;

  // Numbers
  set("occ-number", occ);
  set("occ-capacity", cap);
  set("lib-free", cap - occ);
  set("lib-cap", cap);
  set("lib-time", new Date(lastUpdated).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));

  // Semaphore
  document.getElementById("sem-red").className    = "sem-bulb" + (level === "high" ? " on-red" : "");
  document.getElementById("sem-yellow").className = "sem-bulb" + (level === "medium" ? " on-yellow" : "");
  document.getElementById("sem-green").className  = "sem-bulb" + (level === "low" ? " on-green" : "");

  // Badge
  const badge = document.getElementById("occ-badge");
  const labels = { low: "🟢 Baja ocupación", medium: "🟡 Media ocupación", high: "🔴 Alta ocupación" };
  badge.textContent = labels[level] || "";
  badge.className = `sem-badge ${level}`;

  // Donut
  const CIRC = 188.5;
  const fill = document.getElementById("donut-fill");
  const colors = { low: "var(--green)", medium: "var(--yellow-mid)", high: "var(--red-mid)" };
  fill.style.strokeDashoffset = CIRC - (pct / 100) * CIRC;
  fill.style.stroke = colors[level] || "var(--green)";
  set("donut-pct", pct + "%");

  // Floors
  const barColors = { low: "var(--green)", medium: "var(--yellow-mid)", high: "var(--red-mid)" };
  const floorsEl = document.getElementById("floors-list");
  floorsEl.innerHTML = floors.map(f => `
    <div class="floor-row">
      <div class="floor-header">
        <span class="floor-name">${esc(f.name)}</span>
        <span class="floor-nums">${f.occupancy}/${f.capacity}</span>
      </div>
      <div class="floor-track">
        <div class="floor-fill" style="width:${f.percentage}%; background:${barColors[f.level]}"></div>
      </div>
    </div>
  `).join("");

  // Chart
  if (history) drawChart(history);
}

function drawChart(history) {
  const canvas = document.getElementById("history-chart");
  if (!canvas) return;
  const W = canvas.parentElement.offsetWidth - 40 || 500;
  const H = 90;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const pad = { l: 4, r: 4, t: 6, b: 20 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const max = 100;

  const pts = history.map((h, i) => ({
    x: pad.l + (i / (history.length - 1)) * cW,
    y: pad.t + cH - (h.occupancy / max) * cH,
    lbl: h.hour,
  }));

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  grad.addColorStop(0, "rgba(22,163,74,0.18)");
  grad.addColorStop(1, "rgba(22,163,74,0)");
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, pad.t + cH);
  ctx.lineTo(pts[0].x, pad.t + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = "var(--green)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Labels
  ctx.fillStyle = "#9a9893";
  ctx.font = `500 9px 'DM Mono', monospace`;
  ctx.textAlign = "center";
  pts.forEach((p, i) => { if (i % 3 === 0) ctx.fillText(p.lbl, p.x, H - 4); });

  // Dots
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "var(--green)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
  });
}

/* ══════════════════════════════════════════════
   BATHROOMS
══════════════════════════════════════════════ */

async function fetchBathrooms() {
  try {
    const r = await fetch(`${API}/bathrooms`);
    state.bathrooms = await r.json();
    renderBathrooms(state.bathrooms);
  } catch {
    document.getElementById("reports-list").innerHTML =
      `<div class="loading-card">Error al cargar los reportes.<br>Verifica que el servidor esté corriendo.</div>`;
  }
}

function renderBathrooms(reports) {
  const pending  = reports.filter(r => r.status !== "resolved");
  const inProg   = reports.filter(r => r.status === "in_progress");
  const allVotes = reports.reduce((s, r) => s + r.votes, 0);

  set("bath-total", pending.length);
  set("bath-progress", inProg.length);
  set("bath-votes", allVotes);

  // Badge in nav
  const badge = document.getElementById("bath-nav-badge");
  badge.textContent = pending.length;
  badge.classList.toggle("show", pending.length > 0);

  const list = document.getElementById("reports-list");
  if (!reports.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">✅</div>
      <div>Sin reportes activos — ¡todo limpio!</div>
    </div>`;
    return;
  }

  const priority = r => r.votes > 10 ? "p-high" : r.votes > 4 ? "p-medium" : "p-low";
  const voted    = r => r.voters?.includes(VOTER_ID);

  list.innerHTML = reports.map(r => `
    <div class="report-card ${priority(r)}" data-id="${r.id}">
      <div>
        <div class="report-location">📍 ${esc(r.location)}</div>
        <div class="report-desc">${esc(r.description)}</div>
        <div class="report-meta">
          <span class="report-time">${timeAgo(r.reportedAt)}</span>
          <span class="status-tag ${r.status}">${statusLabel(r.status)}</span>
        </div>
        <div class="report-actions">
          ${r.status !== "in_progress" && r.status !== "resolved"
            ? `<button class="action-btn" onclick="markStatus('${r.id}','in_progress')">En proceso</button>` : ""}
          ${r.status !== "resolved"
            ? `<button class="action-btn" onclick="markStatus('${r.id}','resolved')">Resuelto ✓</button>` : ""}
          <button class="action-btn danger" onclick="deleteReport('${r.id}')">Eliminar</button>
        </div>
      </div>
      <div class="vote-col">
        <button class="vote-btn ${voted(r) ? "voted" : ""}" onclick="vote('${r.id}')">▲</button>
        <span class="vote-count">${r.votes}</span>
      </div>
    </div>
  `).join("");
}

async function vote(id) {
  try {
    const r = await fetch(`${API}/bathrooms/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: VOTER_ID }),
    });
    if (r.status === 409) { toast("Ya votaste en este reporte", "error"); return; }
    if (!r.ok) throw new Error();
    fetchBathrooms();
  } catch { toast("Error al votar", "error"); }
}

async function markStatus(id, status) {
  try {
    await fetch(`${API}/bathrooms/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchBathrooms();
    toast(status === "resolved" ? "¡Marcado como resuelto!" : "Estado actualizado", "success");
  } catch { toast("Error al actualizar", "error"); }
}

async function deleteReport(id) {
  if (!confirm("¿Eliminar este reporte?")) return;
  try {
    await fetch(`${API}/bathrooms/${id}`, { method: "DELETE" });
    fetchBathrooms();
    toast("Reporte eliminado", "success");
  } catch { toast("Error al eliminar", "error"); }
}

/* ── MODAL ── */
const backdrop = document.getElementById("modal-backdrop");

document.getElementById("openModal").addEventListener("click", () => {
  backdrop.classList.add("open");
});
document.getElementById("cancelModal").addEventListener("click", closeModal);
backdrop.addEventListener("click", e => { if (e.target === backdrop) closeModal(); });

function closeModal() {
  backdrop.classList.remove("open");
  document.getElementById("r-location").value = "";
  document.getElementById("r-desc").value = "";
}

document.getElementById("submitReport").addEventListener("click", async () => {
  const location    = document.getElementById("r-location").value.trim();
  const description = document.getElementById("r-desc").value.trim();
  if (!location || !description) { toast("Completa todos los campos", "error"); return; }
  try {
    const r = await fetch(`${API}/bathrooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, description }),
    });
    if (!r.ok) throw new Error();
    closeModal();
    fetchBathrooms();
    toast("Reporte enviado correctamente ✓", "success");
  } catch { toast("Error al enviar reporte", "error"); }
});

/* ══════════════════════════════════════════════
   OUTLETS
══════════════════════════════════════════════ */

async function fetchOutlets() {
  try {
    const r = await fetch(`${API}/outlets`);
    state.outlets = await r.json();
    renderOutlets(state.outlets);
  } catch {
    document.getElementById("outlets-grid").innerHTML =
      `<div class="loading-card">Error al cargar enchufes</div>`;
  }
}

function renderOutlets({ outlets, summary }) {
  set("out-avail", summary.available);
  set("out-occ", summary.occupied);
  set("out-total", summary.total);

  renderOutletsMap(outlets);

  const typeMap = { double: "Doble", triple: "Triple", usb: "USB", weatherproof: "Exterior" };
  document.getElementById("outlets-grid").innerHTML = outlets.map(o => `
    <div class="outlet-card ${o.available ? "available" : "occupied"}" onclick="toggleOutlet(${o.id})">
      <div class="outlet-dot-row">
        <div class="outlet-indicator ${o.available ? "available" : "occupied"}"></div>
        <span style="font-size:.68rem;font-weight:600;color:${o.available ? "var(--green)" : "var(--red)"}">
          ${o.available ? "Libre" : "Ocupado"}
        </span>
      </div>
      <div class="outlet-zone">${esc(o.zone)}</div>
      <div class="outlet-type-lbl">${typeMap[o.type] || o.type} · #${o.id}</div>
    </div>
  `).join("");
}

function renderOutletsMap(outlets) {
  document.getElementById("outlets-map").innerHTML = `
    <svg viewBox="0 0 100 52" xmlns="http://www.w3.org/2000/svg">
      ${campusBase()}
      ${outlets.map(o => `
        <g style="cursor:pointer" onclick="toggleOutlet(${o.id})" transform="translate(${o.x},${o.y})">
          ${o.available
            ? `<circle r="3.5" fill="var(--green)" opacity="0.2">
                 <animate attributeName="r" values="3.5;5.5;3.5" dur="2s" repeatCount="indefinite"/>
                 <animate attributeName="opacity" values="0.2;0;0.2" dur="2s" repeatCount="indefinite"/>
               </circle>` : ""}
          <circle r="3" fill="${o.available ? "#16a34a" : "#dc2626"}" opacity="0.9"/>
          <circle r="1.3" fill="white" opacity="0.9"/>
        </g>
      `).join("")}
    </svg>
  `;
}

async function toggleOutlet(id) {
  try {
    await fetch(`${API}/outlets/${id}`, { method: "PATCH" });
    fetchOutlets();
    toast("Estado actualizado ✓", "success");
  } catch { toast("Error al actualizar", "error"); }
}

/* ══════════════════════════════════════════════
   WIFI
══════════════════════════════════════════════ */

async function fetchWifi() {
  try {
    const r = await fetch(`${API}/wifi`);
    state.wifi = await r.json();
    renderWifi(state.wifi);
  } catch {
    document.getElementById("wifi-grid").innerHTML =
      `<div class="loading-card">Error al cargar zonas WiFi</div>`;
  }
}

function renderWifi({ zones }) {
  set("wifi-exc",  zones.filter(z => z.quality === "excellent").length);
  set("wifi-good", zones.filter(z => z.quality === "good").length);
  set("wifi-poor", zones.filter(z => z.quality === "poor").length);

  renderWifiMap(zones);

  const colorMap = {
    excellent: { fill: "var(--green)", cls: "excellent" },
    good:      { fill: "var(--yellow-mid)", cls: "good" },
    fair:      { fill: "var(--orange)", cls: "fair" },
    poor:      { fill: "var(--red-mid)", cls: "poor" },
  };
  const qualLabel = { excellent: "Excelente", good: "Buena", fair: "Regular", poor: "Débil" };

  document.getElementById("wifi-grid").innerHTML = zones.map(z => {
    const { fill, cls } = colorMap[z.quality] || colorMap.poor;
    return `
      <div class="wifi-card">
        <div class="wifi-name">${esc(z.name)}</div>
        <div class="wifi-pct" style="color:${fill}">${z.signal}%</div>
        <div class="wifi-bar-track">
          <div class="wifi-bar-fill" style="width:${z.signal}%; background:${fill}"></div>
        </div>
        <div class="wifi-ssid">${esc(z.ssid)} · ${esc(z.band)}</div>
        <div class="wifi-quality ${cls}">${qualLabel[z.quality]}</div>
      </div>
    `;
  }).join("");
}

function renderWifiMap(zones) {
  const colorMap = {
    excellent: "#16a34a",
    good:      "#ca8a04",
    fair:      "#ea580c",
    poor:      "#dc2626",
  };

  document.getElementById("wifi-map").innerHTML = `
    <svg viewBox="0 0 100 52" xmlns="http://www.w3.org/2000/svg">
      ${campusBase()}
      ${zones.map(z => {
        const color = colorMap[z.quality] || "#dc2626";
        const r = 4 + (z.signal / 100) * 5;
        return `
          <g transform="translate(${z.x},${z.y})">
            <circle r="${r}" fill="${color}" opacity="0.14"/>
            <circle r="2.8" fill="${color}" opacity="0.85"/>
            <circle r="1.2" fill="white" opacity="0.95"/>
            <text x="0" y="-4.5" text-anchor="middle" font-size="2" fill="${color}"
              font-family="DM Mono,monospace" font-weight="500">${z.signal}%</text>
          </g>
        `;
      }).join("")}
    </svg>
  `;
}

/* ══════════════════════════════════════════════
   CAMPUS SVG BASE
══════════════════════════════════════════════ */

function campusBase() {
  return `
    <rect width="100" height="52" fill="#faf9f5"/>

    <!-- Paths -->
    <rect x="0" y="28" width="100" height="1.5" fill="#e8e5e0"/>
    <rect x="40" y="0" width="1.5" height="52" fill="#e8e5e0"/>
    <rect x="70" y="0" width="1.5" height="52" fill="#e8e5e0"/>

    <!-- Buildings -->
    <rect x="4" y="4" width="33" height="21" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="20.5" y="13" text-anchor="middle" font-size="2.4" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Biblioteca</text>
    <text x="20.5" y="17" text-anchor="middle" font-size="1.8" fill="#b8b5b0" font-family="DM Mono,monospace">Edificio B</text>

    <rect x="43" y="4" width="24" height="21" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="55" y="13" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Cómputo</text>
    <text x="55" y="17.5" text-anchor="middle" font-size="1.7" fill="#b8b5b0" font-family="DM Mono,monospace">Lab</text>

    <rect x="73" y="4" width="22" height="21" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="84" y="13" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Edificio</text>
    <text x="84" y="17.5" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">A</text>

    <rect x="4" y="32" width="33" height="16" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="20.5" y="41" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Jardín Norte</text>

    <rect x="43" y="32" width="24" height="16" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="55" y="41" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Cafetería</text>

    <rect x="73" y="32" width="22" height="16" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="84" y="41" text-anchor="middle" font-size="2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Estac.</text>
  `;
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function statusLabel(s) {
  return { pending: "Pendiente", in_progress: "En proceso", resolved: "Resuelto" }[s] || s;
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)   return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

function toast(msg, type = "success") {
  const wrap = document.getElementById("toast-wrap");
  const el   = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

/* ══════════════════════════════════════════════
   AUTO REFRESH
══════════════════════════════════════════════ */

setInterval(fetchCurrent, 6000);
setInterval(checkHealth, 12000);

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */

async function init() {
  await checkHealth();
  await fetchLibrary();
}

init();