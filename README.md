# SmartCampus

Dashboard inteligente para mejorar la experiencia universitaria. Muestra ocupación de biblioteca en tiempo real, reportes de baños, mapa de enchufes y zonas WiFi.

## 🚀 Cómo ejecutar

### 1. Iniciar el Backend

```bash
npm install
npm start
# → API corriendo en http://localhost:3001
```

Para desarrollo con recarga automática:
```bash
npm run dev
```

### 2. Iniciar el Frontend

**Extensión Live Server (VS Code)**  
Abre `index.html` → clic derecho → "Open with Live Server"


## ✨ Funcionalidades

### 📚 Biblioteca
- Semáforo visual 🟢🟡🔴 con ocupación en tiempo real
- Desglose por piso con barras de progreso
- Histórico del día con gráfica

### 🚻 Baños
- Reportes creados por usuarios con ubicación y descripción
- Sistema de votos para priorizar problemas
- Estados: Pendiente → En proceso → Resuelto
- Ordenamiento automático por votos

### 🔌 Enchufes
- Mapa SVG del campus con puntos interactivos
- Animación pulsante en enchufes disponibles
- Toggle de disponibilidad con clic

### 📶 WiFi
- Mapa de cobertura con intensidad de señal
- Clasificación: Excelente / Buena / Regular / Débil
- Actualización automática cada 6 segundos

---

## 🔄 Simulación en tiempo real

El backend simula cambios automáticamente cada 5 segundos:
- Ocupación de biblioteca fluctúa naturalmente
- Señal WiFi varía ligeramente
- Enchufes pueden cambiar estado aleatoriamente

---

## 🛠 Tecnologías

**Backend:** Node.js · Express · CORS · UUID  
**Frontend:** HTML5 · CSS3 · JavaScript Vanilla  
**Diseño:** Dark theme · Responsive · Animaciones CSS
