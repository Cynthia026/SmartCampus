/* ══════════════════════════════════════════════
   SMARTCAMPUS v3 — APP.JS
   Auth · Notifications · History · Profile
══════════════════════════════════════════════ */

const API = "http://localhost:3001/api";

// ══════════════════════════════════════════════
// AUTH STATE
// ══════════════════════════════════════════════

const auth = {
  token: localStorage.getItem("sc_token") || null,
  user:  JSON.parse(localStorage.getItem("sc_user") || "null"),

  get isLoggedIn()  { return !!this.token && !!this.user; },
  get isGuest()     { return !this.token; },

  set(token, user) {
    this.token = token;
    this.user  = user;
    localStorage.setItem("sc_token", token);
    localStorage.setItem("sc_user", JSON.stringify(user));
  },

  clear() {
    this.token = null;
    this.user  = null;
    localStorage.removeItem("sc_token");
    localStorage.removeItem("sc_user");
  },

  headers() {
    const h = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  },
};

// Legacy voter id for anonymous voting
const VOTER_ID = (() => {
  let id = localStorage.getItem("sc_voter_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("sc_voter_id", id); }
  return id;
})();

// ══════════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════════

const state = {
  current: "library",
  library: null,
  bathrooms: [],
  outlets: null,
  wifi: null,
  notifications: [],
  unreadCount: 0,
};

// ══════════════════════════════════════════════
// BOOT — decide auth vs app
// ══════════════════════════════════════════════

async function boot() {
  if (auth.isLoggedIn) {
    // Verify token is still valid
    try {
      const r = await fetch(`${API}/auth/me`, { headers: auth.headers() });
      if (!r.ok) { auth.clear(); showAuthScreen(); return; }
      auth.user = await r.json();
      localStorage.setItem("sc_user", JSON.stringify(auth.user));
    } catch {
      // API down — allow offline access if we have cached user
    }
    showApp();
  } else {
    showAuthScreen();
  }
}

function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app-shell").style.display = "none";
}

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-shell").style.display = "";
  initApp();
}

// ══════════════════════════════════════════════
// AUTH SCREEN LOGIC
// ══════════════════════════════════════════════

// Tab switching
document.querySelectorAll(".auth-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".auth-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
    document.getElementById(`form-${tab}`).classList.add("active");
  });
});

// Password visibility toggles
setupEye("login-eye", "login-password", "eye-icon-login");
setupEye("reg-eye",   "reg-password",   "eye-icon-reg");

function setupEye(btnId, inputId, iconId) {
  document.getElementById(btnId)?.addEventListener("click", () => {
    const inp  = document.getElementById(inputId);
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    document.getElementById(iconId).style.opacity = show ? "0.4" : "1";
  });
}

// LOGIN
document.getElementById("btn-login")?.addEventListener("click", async () => {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || !password) { authError("Completa todos los campos"); return; }

  setBtnLoading("btn-login", true);
  try {
    const r = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) { authError(data.error || "Error al iniciar sesión"); return; }
    auth.set(data.token, data.user);
    showApp();
  } catch { authError("Sin conexión al servidor"); }
  finally { setBtnLoading("btn-login", false); }
});

// REGISTER
document.getElementById("btn-register")?.addEventListener("click", async () => {
  const username = document.getElementById("reg-username").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  if (!username || !email || !password) { authError("Completa todos los campos"); return; }

  setBtnLoading("btn-register", true);
  try {
    const r = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await r.json();
    if (!r.ok) { authError(data.error || "Error al registrarse"); return; }
    auth.set(data.token, data.user);
    showApp();
  } catch { authError("Sin conexión al servidor"); }
  finally { setBtnLoading("btn-register", false); }
});

// SKIP (guest)
document.getElementById("btn-skip-login")?.addEventListener("click", enterAsGuest);
document.getElementById("btn-skip-register")?.addEventListener("click", enterAsGuest);
function enterAsGuest() { showApp(); }

function authError(msg) {
  toast(msg, "error");
}

function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "…" : (id === "btn-login" ? "Entrar" : "Crear cuenta");
}

// ══════════════════════════════════════════════
// APP INIT
// ══════════════════════════════════════════════

function initApp() {
  updateTopbar();
  checkHealth();
  fetchCurrent();
  if (auth.isLoggedIn) {
    document.getElementById("notif-bell").style.display = "flex";
    pollNotifications();
    setInterval(pollNotifications, 15000);
  }
}

function updateTopbar() {
  const sub = document.getElementById("topbar-username");
  if (auth.isLoggedIn) {
    sub.textContent = auth.user.username;
  } else {
    sub.textContent = "Invitado";
  }
}

// ══════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════

function navigate(view) {
  state.current = view;
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  document.querySelectorAll(".view").forEach(s => s.classList.toggle("active", s.id === `view-${view}`));
  fetchCurrent();
}

document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => navigate(tab.dataset.view));
});

// ══════════════════════════════════════════════
// API HEALTH
// ══════════════════════════════════════════════

async function checkHealth() {
  const dot = document.getElementById("api-dot");
  const lbl = document.getElementById("api-label");
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) { dot.className = "api-dot online"; lbl.textContent = "En línea"; }
    else throw new Error();
  } catch { dot.className = "api-dot offline"; lbl.textContent = "Sin conexión"; }
}

// ══════════════════════════════════════════════
// FETCH ROUTER
// ══════════════════════════════════════════════

function fetchCurrent() {
  const map = { library: fetchLibrary, bathrooms: fetchBathrooms, outlets: fetchOutlets, wifi: fetchWifi, profile: fetchProfile };
  map[state.current]?.();
}

setInterval(fetchCurrent, 6000);
setInterval(checkHealth, 12000);

// ══════════════════════════════════════════════
// LIBRARY
// ══════════════════════════════════════════════

async function fetchLibrary() {
  try {
    const r = await fetch(`${API}/library`);
    state.library = await r.json();
    renderLibrary(state.library);
  } catch {}
}

function renderLibrary(d) {
  const { currentOccupancy: occ, capacity: cap, percentage: pct, level, floors, history, lastUpdated } = d;
  set("occ-number", occ);
  set("occ-capacity", cap);
  set("lib-free", cap - occ);
  set("lib-cap", cap);
  set("lib-time", new Date(lastUpdated).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));

  document.getElementById("sem-red").className    = "sem-bulb" + (level === "high"   ? " on-red"    : "");
  document.getElementById("sem-yellow").className = "sem-bulb" + (level === "medium" ? " on-yellow" : "");
  document.getElementById("sem-green").className  = "sem-bulb" + (level === "low"    ? " on-green"  : "");

  const badge = document.getElementById("occ-badge");
  badge.textContent = { low: "🟢 Baja ocupación", medium: "🟡 Media ocupación", high: "🔴 Alta ocupación" }[level];
  badge.className = `sem-badge ${level}`;

  const CIRC = 188.5;
  const fill = document.getElementById("donut-fill");
  fill.style.strokeDashoffset = CIRC - (pct / 100) * CIRC;
  fill.style.stroke = { low: "var(--green)", medium: "var(--yellow-mid)", high: "var(--red-mid)" }[level];
  set("donut-pct", pct + "%");

  const barC = { low: "var(--green)", medium: "var(--yellow-mid)", high: "var(--red-mid)" };
  document.getElementById("floors-list").innerHTML = floors.map(f => `
    <div class="floor-row">
      <div class="floor-header">
        <span class="floor-name">${esc(f.name)}</span>
        <span class="floor-nums">${f.occupancy}/${f.capacity}</span>
      </div>
      <div class="floor-track">
        <div class="floor-fill" style="width:${f.percentage}%; background:${barC[f.level]}"></div>
      </div>
    </div>
  `).join("");

  if (history) drawChart(history);
}

function drawChart(history) {
  const canvas = document.getElementById("history-chart");
  if (!canvas) return;
  const W = canvas.parentElement.offsetWidth - 40 || 500;
  const H = 90;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  const pad = { l: 4, r: 4, t: 6, b: 20 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const pts = history.map((h, i) => ({
    x: pad.l + (i / (history.length - 1)) * cW,
    y: pad.t + cH - (h.occupancy / 100) * cH,
    lbl: h.hour,
  }));
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  grad.addColorStop(0, "rgba(22,163,74,0.18)");
  grad.addColorStop(1, "rgba(22,163,74,0)");
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, pad.t + cH);
  ctx.lineTo(pts[0].x, pad.t + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = "var(--green)"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
  ctx.fillStyle = "#9a9893"; ctx.font = `500 9px 'DM Mono',monospace`; ctx.textAlign = "center";
  pts.forEach((p, i) => { if (i % 3 === 0) ctx.fillText(p.lbl, p.x, H - 4); });
  pts.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "var(--green)"; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "white"; ctx.fill();
  });
}

// ══════════════════════════════════════════════
// BATHROOMS
// ══════════════════════════════════════════════

async function fetchBathrooms() {
  try {
    const r = await fetch(`${API}/bathrooms`);
    state.bathrooms = await r.json();
    renderBathrooms(state.bathrooms);
  } catch {
    document.getElementById("reports-list").innerHTML =
      `<div class="loading-card">Error al cargar reportes. Verifica el servidor.</div>`;
  }
}

function renderBathrooms(reports) {
  const pending = reports.filter(r => r.status !== "resolved");
  const inProg  = reports.filter(r => r.status === "in_progress");
  set("bath-total", pending.length);
  set("bath-progress", inProg.length);
  set("bath-votes", reports.reduce((s, r) => s + r.votes, 0));

  const badge = document.getElementById("bath-nav-badge");
  badge.textContent = pending.length;
  badge.classList.toggle("show", pending.length > 0);

  const list = document.getElementById("reports-list");

  // Guest banner
  const guestBanner = auth.isGuest
    ? `<div class="guest-banner">⚠️ Inicia sesión para que tus reportes queden registrados a tu nombre. <a onclick="showAuthScreen()">Entrar</a></div>` : "";

  if (!reports.length) {
    list.innerHTML = guestBanner + `<div class="empty-state"><div class="empty-state-icon">✅</div><div>Sin reportes activos — ¡todo limpio!</div></div>`;
    return;
  }

  const priority = r => r.votes > 10 ? "p-high" : r.votes > 4 ? "p-medium" : "p-low";
  const isMyReport = r => auth.isLoggedIn && r.reportedBy === auth.user?.id;
  const hasVoted   = r => {
    const vid = auth.isLoggedIn ? auth.user.id : VOTER_ID;
    return r.voters?.includes(vid);
  };

  list.innerHTML = guestBanner + reports.map(r => `
    <div class="report-card ${priority(r)}">
      <div>
        <div class="report-location">
          📍 ${esc(r.location)}
          ${isMyReport(r) ? '<span class="mine-tag" style="margin-left:6px">Mío</span>' : ""}
        </div>
        <div class="report-desc">${esc(r.description)}</div>
        ${r.reporterName && r.reporterName !== "Anónimo"
          ? `<div class="report-reporter">por ${esc(r.reporterName)}</div>` : ""}
        <div class="report-meta">
          <span class="report-time">${timeAgo(r.reportedAt)}</span>
          <span class="status-tag ${r.status}">${statusLabel(r.status)}</span>
          ${r.resolvedAt ? `<span class="report-time">Resuelto ${timeAgo(r.resolvedAt)}</span>` : ""}
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
        <button class="vote-btn ${hasVoted(r) ? "voted" : ""}" onclick="vote('${r.id}')">▲</button>
        <span class="vote-count">${r.votes}</span>
      </div>
    </div>
  `).join("");
}

async function vote(id) {
  try {
    const vid = auth.isLoggedIn ? auth.user.id : VOTER_ID;
    const r = await fetch(`${API}/bathrooms/${id}/vote`, {
      method: "POST",
      headers: auth.headers(),
      body: JSON.stringify({ voterId: vid }),
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
      headers: auth.headers(),
      body: JSON.stringify({ status }),
    });
    fetchBathrooms();
    toast(status === "resolved" ? "¡Marcado como resuelto! ✓" : "Estado actualizado", "success");
    if (auth.isLoggedIn) setTimeout(pollNotifications, 1000);
  } catch { toast("Error al actualizar", "error"); }
}

async function deleteReport(id) {
  if (!confirm("¿Eliminar este reporte?")) return;
  try {
    await fetch(`${API}/bathrooms/${id}`, { method: "DELETE", headers: auth.headers() });
    fetchBathrooms();
    toast("Reporte eliminado", "success");
  } catch { toast("Error al eliminar", "error"); }
}

// ── MODAL ──
const backdrop = document.getElementById("modal-backdrop");
document.getElementById("openModal")?.addEventListener("click", () => backdrop.classList.add("open"));
document.getElementById("cancelModal")?.addEventListener("click", closeModal);
backdrop?.addEventListener("click", e => { if (e.target === backdrop) closeModal(); });
function closeModal() {
  backdrop.classList.remove("open");
  document.getElementById("r-location").value = "";
  document.getElementById("r-desc").value = "";
}

document.getElementById("submitReport")?.addEventListener("click", async () => {
  const location    = document.getElementById("r-location").value.trim();
  const description = document.getElementById("r-desc").value.trim();
  if (!location || !description) { toast("Completa todos los campos", "error"); return; }
  try {
    const r = await fetch(`${API}/bathrooms`, {
      method: "POST",
      headers: auth.headers(),
      body: JSON.stringify({ location, description }),
    });
    if (!r.ok) throw new Error();
    closeModal();
    fetchBathrooms();
    toast("¡Reporte enviado! ✓", "success");
  } catch { toast("Error al enviar reporte", "error"); }
});

// ══════════════════════════════════════════════
// OUTLETS
// ══════════════════════════════════════════════

async function fetchOutlets() {
  try {
    const r = await fetch(`${API}/outlets`);
    state.outlets = await r.json();
    renderOutlets(state.outlets);
  } catch {
    document.getElementById("outlets-grid").innerHTML = `<div class="loading-card">Error al cargar enchufes</div>`;
  }
}

function renderOutlets({ outlets, summary }) {
  set("out-avail", summary.available);
  set("out-occ",   summary.occupied);
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
          ${o.available ? `<circle r="3.5" fill="var(--green)" opacity="0.2"><animate attributeName="r" values="3.5;5.5;3.5" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.2;0;0.2" dur="2s" repeatCount="indefinite"/></circle>` : ""}
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

// ══════════════════════════════════════════════
// WIFI
// ══════════════════════════════════════════════

async function fetchWifi() {
  try {
    const r = await fetch(`${API}/wifi`);
    state.wifi = await r.json();
    renderWifi(state.wifi);
  } catch {
    document.getElementById("wifi-grid").innerHTML = `<div class="loading-card">Error al cargar WiFi</div>`;
  }
}

function renderWifi({ zones }) {
  set("wifi-exc",  zones.filter(z => z.quality === "excellent").length);
  set("wifi-good", zones.filter(z => z.quality === "good").length);
  set("wifi-poor", zones.filter(z => z.quality === "poor").length);
  renderWifiMap(zones);
  const colorMap = { excellent: "var(--green)", good: "var(--yellow-mid)", fair: "var(--orange)", poor: "var(--red-mid)" };
  const qualLabel = { excellent: "Excelente", good: "Buena", fair: "Regular", poor: "Débil" };
  document.getElementById("wifi-grid").innerHTML = zones.map(z => {
    const fill = colorMap[z.quality] || "var(--red-mid)";
    return `
      <div class="wifi-card">
        <div class="wifi-name">${esc(z.name)}</div>
        <div class="wifi-pct" style="color:${fill}">${z.signal}%</div>
        <div class="wifi-bar-track"><div class="wifi-bar-fill" style="width:${z.signal}%; background:${fill}"></div></div>
        <div class="wifi-ssid">${esc(z.ssid)} · ${esc(z.band)}</div>
        <div class="wifi-quality ${z.quality}">${qualLabel[z.quality]}</div>
      </div>
    `;
  }).join("");
}

function renderWifiMap(zones) {
  const colorMap = { excellent: "#16a34a", good: "#ca8a04", fair: "#ea580c", poor: "#dc2626" };
  document.getElementById("wifi-map").innerHTML = `
    <svg viewBox="0 0 100 52" xmlns="http://www.w3.org/2000/svg">
      ${campusBase()}
      ${zones.map(z => {
        const color = colorMap[z.quality] || "#dc2626";
        const r = 4 + (z.signal / 100) * 5;
        return `<g transform="translate(${z.x},${z.y})">
          <circle r="${r}" fill="${color}" opacity="0.14"/>
          <circle r="2.8" fill="${color}" opacity="0.85"/>
          <circle r="1.2" fill="white" opacity="0.95"/>
          <text x="0" y="-4.5" text-anchor="middle" font-size="2" fill="${color}" font-family="DM Mono,monospace" font-weight="500">${z.signal}%</text>
        </g>`;
      }).join("")}
    </svg>
  `;
}

// ══════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════

async function fetchProfile() {
  if (auth.isGuest) {
    renderGuestProfile();
    return;
  }
  try {
    const [statsR, notifsR, myReportsR] = await Promise.all([
      fetch(`${API}/users/me/stats`,        { headers: auth.headers() }),
      fetch(`${API}/notifications`,         { headers: auth.headers() }),
      fetch(`${API}/users/me/reports`,      { headers: auth.headers() }),
    ]);
    const stats     = await statsR.json();
    const notifs    = await notifsR.json();
    const myReports = await myReportsR.json();
    state.notifications = notifs;
    renderProfileCard();
    renderImpactStats(stats);
    renderNotifList(notifs);
    renderMyReports(myReports);
  } catch { toast("Error al cargar perfil", "error"); }
}

function renderGuestProfile() {
  document.getElementById("profile-avatar").textContent = "?";
  document.getElementById("profile-name").textContent   = "Invitado";
  document.getElementById("profile-email").textContent  = "Sin cuenta";
  document.getElementById("profile-role").textContent   = "Modo invitado";
  set("stat-reports", "—");
  set("stat-resolved", "—");
  set("stat-score", "—");
  document.getElementById("notif-list").innerHTML =
    `<div class="empty-state"><div class="empty-state-icon">🔒</div><div>Inicia sesión para ver notificaciones</div></div>`;
  document.getElementById("my-reports-list").innerHTML =
    `<div class="empty-state"><div class="empty-state-icon">📋</div><div>Inicia sesión para ver tu historial</div></div>`;
}

function renderProfileCard() {
  const u = auth.user;
  if (!u) return;
  document.getElementById("profile-avatar").textContent = u.username[0].toUpperCase();
  document.getElementById("profile-name").textContent   = u.username;
  document.getElementById("profile-email").textContent  = u.email;
  const roleEl = document.getElementById("profile-role");
  roleEl.textContent = u.role === "admin" ? "Administrador" : "Estudiante";
  roleEl.className = `profile-role-badge${u.role === "admin" ? " admin" : ""}`;
}

function renderImpactStats(stats) {
  set("stat-reports",  stats.totalReports);
  set("stat-resolved", stats.resolvedReports);
  set("stat-score",    stats.impactScore);
}

function renderNotifList(notifs) {
  const el = document.getElementById("notif-list");
  if (!notifs.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔔</div><div>Sin notificaciones por ahora</div></div>`;
    return;
  }
  el.innerHTML = notifs.slice(0, 10).map(n => notifItem(n)).join("");
}

function renderMyReports(reports) {
  const el = document.getElementById("my-reports-list");
  if (!reports.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div>Aún no has creado reportes</div></div>`;
    return;
  }
  el.innerHTML = reports.map(r => `
    <div class="report-card ${r.votes > 10 ? "p-high" : r.votes > 4 ? "p-medium" : "p-low"}">
      <div>
        <div class="report-location">📍 ${esc(r.location)}</div>
        <div class="report-desc">${esc(r.description)}</div>
        <div class="report-meta">
          <span class="report-time">${timeAgo(r.reportedAt)}</span>
          <span class="status-tag ${r.status}">${statusLabel(r.status)}</span>
          ${r.resolvedAt ? `<span class="report-time">Resuelto ${timeAgo(r.resolvedAt)}</span>` : ""}
        </div>
      </div>
      <div class="vote-col">
        <span style="font-size:1rem">▲</span>
        <span class="vote-count">${r.votes}</span>
      </div>
    </div>
  `).join("");
}

// ── LOGOUT ──
document.getElementById("btn-logout")?.addEventListener("click", () => {
  if (!confirm("¿Cerrar sesión?")) return;
  auth.clear();
  state.notifications = [];
  state.unreadCount   = 0;
  showAuthScreen();
  toast("Sesión cerrada", "success");
});

// ── MARK ALL READ (profile tab) ──
document.getElementById("mark-all-read")?.addEventListener("click", markAllRead);

// ══════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════

async function pollNotifications() {
  if (!auth.isLoggedIn) return;
  try {
    const r = await fetch(`${API}/notifications/unread-count`, { headers: auth.headers() });
    const { count } = await r.json();
    state.unreadCount = count;
    updateNotifBadges(count);
  } catch {}
}

function updateNotifBadges(count) {
  const bell      = document.getElementById("notif-count");
  const navBadge  = document.getElementById("notif-nav-badge");
  if (count > 0) {
    bell.style.display = "flex";
    bell.textContent   = count > 9 ? "9+" : count;
    navBadge.textContent = count > 9 ? "9+" : count;
    navBadge.classList.add("show");
  } else {
    bell.style.display = "none";
    navBadge.classList.remove("show");
  }
}

// Notification bell → panel
const bellBtn   = document.getElementById("notif-bell");
const panelBack = document.getElementById("notif-panel-backdrop");
const panelBody = document.getElementById("notif-panel-body");

bellBtn?.addEventListener("click", async () => {
  panelBack.classList.add("open");
  await loadNotifPanel();
});
document.getElementById("notif-panel-close")?.addEventListener("click", () => panelBack.classList.remove("open"));
panelBack?.addEventListener("click", e => { if (e.target === panelBack) panelBack.classList.remove("open"); });
document.getElementById("panel-mark-all")?.addEventListener("click", async () => { await markAllRead(); await loadNotifPanel(); });

async function loadNotifPanel() {
  if (!auth.isLoggedIn) return;
  try {
    const r = await fetch(`${API}/notifications`, { headers: auth.headers() });
    state.notifications = await r.json();
    panelBody.innerHTML = state.notifications.length
      ? state.notifications.slice(0, 15).map(n => notifItem(n, true)).join("")
      : `<div class="empty-state" style="padding:24px"><div class="empty-state-icon">🔔</div><div>Sin notificaciones</div></div>`;
    updateNotifBadges(state.notifications.filter(n => !n.read).length);
  } catch {}
}

async function markAllRead() {
  if (!auth.isLoggedIn) return;
  try {
    await fetch(`${API}/notifications/read-all`, { method: "PATCH", headers: auth.headers() });
    updateNotifBadges(0);
    if (state.current === "profile") fetchProfile();
    toast("Todo marcado como leído ✓", "success");
  } catch {}
}

async function markNotifRead(id) {
  try {
    await fetch(`${API}/notifications/${id}/read`, { method: "PATCH", headers: auth.headers() });
    await pollNotifications();
  } catch {}
}

function notifItem(n, inPanel = false) {
  const iconMap = {
    report_resolved:    { emoji: "✅", cls: "resolved" },
    report_in_progress: { emoji: "🔧", cls: "in_progress" },
    vote_received:      { emoji: "👍", cls: "vote" },
    system:             { emoji: "🎓", cls: "system" },
  };
  const icon = iconMap[n.type] || { emoji: "🔔", cls: "system" };
  const clickHandler = !n.read ? `onclick="markNotifRead('${n.id}')"` : "";
  return `
    <div class="notif-item${n.read ? "" : " unread"}" ${clickHandler} style="${!n.read ? "cursor:pointer" : ""}">
      <div class="notif-icon ${icon.cls}">${icon.emoji}</div>
      <div class="notif-body">
        <div class="notif-message">${esc(n.message)}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
      ${!n.read ? '<div class="notif-unread-dot"></div>' : '<div></div>'}
    </div>
  `;
}

// ══════════════════════════════════════════════
// CAMPUS SVG BASE
// ══════════════════════════════════════════════

function campusBase() {
  return `
    <rect width="100" height="52" fill="#faf9f5"/>
    <rect x="0" y="28" width="100" height="1.5" fill="#e8e5e0"/>
    <rect x="40" y="0" width="1.5" height="52" fill="#e8e5e0"/>
    <rect x="70" y="0" width="1.5" height="52" fill="#e8e5e0"/>
    <rect x="4"  y="4" width="33" height="21" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="20.5" y="13" text-anchor="middle" font-size="2.4" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Biblioteca</text>
    <text x="20.5" y="17" text-anchor="middle" font-size="1.8" fill="#b8b5b0" font-family="DM Mono,monospace">Edificio B</text>
    <rect x="43" y="4" width="24" height="21" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="55"  y="13" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Cómputo</text>
    <rect x="73" y="4" width="22" height="21" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="84"  y="13" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Edificio A</text>
    <rect x="4"  y="32" width="33" height="16" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="20.5" y="41" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Jardín Norte</text>
    <rect x="43" y="32" width="24" height="16" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="55"  y="41" text-anchor="middle" font-size="2.2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Cafetería</text>
    <rect x="73" y="32" width="22" height="16" rx="1" fill="#eeecea" stroke="#d9d6d0" stroke-width="0.4"/>
    <text x="84"  y="41" text-anchor="middle" font-size="2" fill="#9a9893" font-family="Fraunces,serif" font-weight="600">Estac.</text>
  `;
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════

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
  if (s < 86400)return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

function toast(msg, type = "success") {
  const wrap = document.getElementById("toast-wrap");
  const el   = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

// ══════════════════════════════════════════════
// START
// ══════════════════════════════════════════════

boot();