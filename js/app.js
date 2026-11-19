/**
 * Race2Win Apex Pro - Main Application Controller
 */

import { TRACK_DEFINITIONS, buildTrack } from './tracks.js';
import { CAR_SPECS, CarPhysics } from './physics.js';
import { optimizeRacingLine } from './racing_line.js';
import { AutopilotController } from './autopilot.js';
import { TelemetryManager } from './telemetry.js';
import { USERSCRIPT_CODE, generateBookmarklet } from './userscript.js';

class ApexProApp {
  constructor() {
    // Canvas & Context
    this.canvas = document.getElementById('sim-canvas');
    this.ctx = this.canvas.getContext('2d');

    // State
    this.currentTrackId = 'solana-circuit';
    this.currentCarClass = 'formula-a';
    this.cameraMode = 'follow'; // 'follow' | 'overview'
    this.drivingMode = 'bot';   // 'bot' | 'manual' | 'versus'
    this.showRacingLine = true;
    this.showBrakingZones = true;
    this.showApexMarkers = true;

    // Simulation
    this.track = null;
    this.racingLineData = null;
    this.car = new CarPhysics(this.currentCarClass);
    this.ghostCar = new CarPhysics(this.currentCarClass);
    this.autopilot = null;
    this.ghostAutopilot = null;

    // Telemetry & Timing
    this.telemetry = new TelemetryManager('telemetry-canvas');
    this.lapStartTime = 0;
    this.currentLapTime = 0;
    this.bestLapTime = null;
    this.lastLapTime = null;
    this.currentSector = 0;
    this.sectorTimes = [null, null, null];
    this.sectorSplitDeltas = [null, null, null];
    this.hasCrossedStart = false;
    this.lastTrackIndex = 0;

    // Manual controls state
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      boost: false
    };

    // Camera
    this.camera = { x: 0, y: 0, zoom: 18 };

    // Performance & Loop
    this.lastTime = performance.now();
    this.animFrameId = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadTrack(this.currentTrackId);
    this.setupBookmarklet();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Start simulation loop
    this.loop = this.loop.bind(this);
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = container.clientWidth * dpr;
    this.canvas.height = container.clientHeight * dpr;
    this.canvas.style.width = `${container.clientWidth}px`;
    this.canvas.style.height = `${container.clientHeight}px`;
    this.ctx.scale(dpr, dpr);
  }

  loadTrack(trackId) {
    this.currentTrackId = trackId;
    const def = TRACK_DEFINITIONS[trackId] || TRACK_DEFINITIONS['solana-circuit'];
    this.track = buildTrack(def);

    // Compute optimal racing line and velocity profile
    this.racingLineData = optimizeRacingLine(this.track, CAR_SPECS[this.currentCarClass]);

    // Setup autopilots
    this.autopilot = new AutopilotController(this.racingLineData);
    this.ghostAutopilot = new AutopilotController(this.racingLineData);

    // Reset cars at start grid
    this.resetSimulation();

    // Update UI labels
    document.getElementById('ui-track-name').innerText = def.name;
    document.getElementById('ui-track-length').innerText = `${Math.round(this.track.length)}m`;
    document.getElementById('ui-theoretical-lap').innerText = `${this.racingLineData.theoreticalLapTime.toFixed(3)}s`;
    document.getElementById('ui-apex-count').innerText = `${this.racingLineData.apexCount} corners`;
    const intelTheo = document.getElementById('ui-intel-theoretical');
    if (intelTheo) intelTheo.innerText = `${this.racingLineData.theoreticalLapTime.toFixed(3)}s`;
  }

  resetSimulation() {
    const startPt = this.track.points[0];
    const heading = startPt.heading;

    this.car.reset(startPt.x, startPt.y, heading);
    this.ghostCar.reset(startPt.x, startPt.y, heading);

    this.lapStartTime = performance.now();
    this.currentLapTime = 0;
    this.currentSector = 0;
    this.sectorTimes = [null, null, null];
    this.lastTrackIndex = 0;
    this.hasCrossedStart = false;

    // Reset sector UI
    for (let s = 1; s <= 3; s++) {
      const el = document.getElementById(`ui-s${s}-time`);
      if (el) el.innerText = '--.---s';
      const box = document.getElementById(`ui-sector-box-${s}`);
      if (box) box.className = 'sector-box';
    }
  }

  setupBookmarklet() {
    const link = document.getElementById('bookmarklet-link');
    if (link) {
      link.href = generateBookmarklet();
    }
    const codeArea = document.getElementById('userscript-code-display');
    if (codeArea) {
      codeArea.value = USERSCRIPT_CODE;
    }
  }

  bindEvents() {
    // Keyboard inputs for manual driving
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) this.keys.up = true;
      if (['ArrowDown', 'KeyS'].includes(e.code)) this.keys.down = true;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) this.keys.left = true;
      if (['ArrowRight', 'KeyD'].includes(e.code)) this.keys.right = true;
      if (e.code === 'Space') this.keys.boost = true;
    });

    window.addEventListener('keyup', (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) this.keys.up = false;
      if (['ArrowDown', 'KeyS'].includes(e.code)) this.keys.down = false;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) this.keys.left = false;
      if (['ArrowRight', 'KeyD'].includes(e.code)) this.keys.right = false;
      if (e.code === 'Space') this.keys.boost = false;
    });

    // Track selector
    document.getElementById('track-select')?.addEventListener('change', (e) => {
      this.loadTrack(e.target.value);
    });

    // Car selector
    document.getElementById('car-select')?.addEventListener('change', (e) => {
      this.currentCarClass = e.target.value;
      this.car = new CarPhysics(this.currentCarClass);
      this.ghostCar = new CarPhysics(this.currentCarClass);
      this.racingLineData = optimizeRacingLine(this.track, CAR_SPECS[this.currentCarClass]);
      this.autopilot.setData(this.racingLineData);
      this.ghostAutopilot.setData(this.racingLineData);
      this.resetSimulation();
      document.getElementById('ui-theoretical-lap').innerText = `${this.racingLineData.theoreticalLapTime.toFixed(3)}s`;
      const intelTheo = document.getElementById('ui-intel-theoretical');
      if (intelTheo) intelTheo.innerText = `${this.racingLineData.theoreticalLapTime.toFixed(3)}s`;
    });

    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.drivingMode = e.currentTarget.dataset.mode;
        this.resetSimulation();
      });
    });

    // Camera toggle
    document.getElementById('btn-cam-toggle')?.addEventListener('click', () => {
      this.cameraMode = this.cameraMode === 'follow' ? 'overview' : 'follow';
      const label = this.cameraMode === 'follow' ? 'Follow Car' : 'Full Track';
      document.getElementById('btn-cam-toggle').innerText = `Camera: ${label}`;
    });

    // Reset button
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.resetSimulation();
    });

    // Toggle checkboxes
    document.getElementById('chk-racing-line')?.addEventListener('change', (e) => {
      this.showRacingLine = e.target.checked;
    });
    document.getElementById('chk-braking-zones')?.addEventListener('change', (e) => {
      this.showBrakingZones = e.target.checked;
    });
    document.getElementById('chk-apex-markers')?.addEventListener('change', (e) => {
      this.showApexMarkers = e.target.checked;
    });

    // Copy bookmarklet button (Mobile / iOS)
    document.getElementById('btn-copy-bookmarklet')?.addEventListener('click', () => {
      const code = generateBookmarklet();
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copy-bookmarklet');
        btn.innerText = 'Copied Code to Clipboard!';
        setTimeout(() => { btn.innerText = '📋 Copy Bookmarklet (Mobile / iOS)'; }, 2000);
      });
    });

    // Copy userscript button
    document.getElementById('btn-copy-userscript')?.addEventListener('click', () => {
      navigator.clipboard.writeText(USERSCRIPT_CODE).then(() => {
        const btn = document.getElementById('btn-copy-userscript');
        btn.innerText = 'Copied to Clipboard!';
        setTimeout(() => { btn.innerText = '📋 Copy Tampermonkey Script'; }, 2000);
      });
    });

    // Navigation Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const targetId = e.currentTarget.dataset.tab;
        document.getElementById(targetId)?.classList.add('active');
      });
    });
  }

  loop(timestamp) {
    const dt = Math.min(0.033, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();
    this.updateUI();

    this.animFrameId = requestAnimationFrame(this.loop);
  }

  update(dt) {
    let carInput = { steer: 0, throttle: 0, brake: 0, boost: false };

    // 1. Determine player input based on driving mode
    if (this.drivingMode === 'bot') {
      // Autonomous perfect lap
      carInput = this.autopilot.computeControls(this.car);
    } else {
      // Manual control
      const steer = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      const throttle = this.keys.up ? 1 : 0;
      const brake = this.keys.down ? 1 : 0;
      const boost = this.keys.boost;
      carInput = { steer, throttle, brake, boost };
    }

    // Step primary car physics (60Hz step)
    this.car.step(carInput, dt, this.track);

    // If versus mode, step the AI ghost car
    if (this.drivingMode === 'versus') {
      const ghostInput = this.ghostAutopilot.computeControls(this.ghostCar);
      this.ghostCar.step(ghostInput, dt, this.track);
    }

    // 2. Track lap timing & sector splits
    const currIdx = this.car.currentTrackIndex;
    const n = this.track.points.length;

    // Detect start/finish line crossing (wrap around from end to 0)
    if (this.lastTrackIndex > n * 0.8 && currIdx < n * 0.2) {
      if (this.hasCrossedStart) {
        this.lastLapTime = this.currentLapTime;
        if (!this.bestLapTime || this.lastLapTime < this.bestLapTime) {
          this.bestLapTime = this.lastLapTime;
        }
        // Record final S3 split
        if (this.sectorTimes[0] !== null && this.sectorTimes[1] !== null) {
          this.sectorTimes[2] = Math.max(0, this.lastLapTime - (this.sectorTimes[0] + this.sectorTimes[1]));
        }
      }
      this.hasCrossedStart = true;
      this.lapStartTime = performance.now();
      this.currentSector = 0;
      this.sectorTimes = [null, null, null];
    }
    this.lastTrackIndex = currIdx;

    if (this.hasCrossedStart) {
      this.currentLapTime = (performance.now() - this.lapStartTime) / 1000;
      // Record sector splits
      const s1End = this.track.sectors[0].endIndex;
      const s2End = this.track.sectors[1].endIndex;

      if (currIdx >= s1End && this.sectorTimes[0] === null) {
        this.sectorTimes[0] = this.currentLapTime;
      }
      if (currIdx >= s2End && this.sectorTimes[1] === null) {
        this.sectorTimes[1] = this.currentLapTime - (this.sectorTimes[0] || 0);
      }
    }

    // 3. Telemetry recording
    this.telemetry.recordTick(this.car, carInput, dt);
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.parentElement.clientWidth;
    const h = this.canvas.parentElement.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Save context for camera transformation
    ctx.save();

    // 1. Camera setup
    if (this.cameraMode === 'follow') {
      // Smooth camera interpolation
      const targetX = this.car.x;
      const targetY = this.car.y;
      this.camera.x += (targetX - this.camera.x) * 0.1;
      this.camera.y += (targetY - this.camera.y) * 0.1;
      this.camera.zoom = 22; // 22 pixels per meter

      ctx.translate(w / 2, h / 2);
      ctx.scale(this.camera.zoom, this.camera.zoom);
      ctx.translate(-this.camera.x, -this.camera.y);
    } else {
      // Overview mode: fit entire circuit inside viewport
      const bounds = this.track.bounds;
      const padding = 1.3;
      const scaleX = w / (bounds.width * padding);
      const scaleY = h / (bounds.height * padding);
      const zoom = Math.min(scaleX, scaleY);

      ctx.translate(w / 2, h / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-bounds.centerX, -bounds.centerY);
    }

    // 2. Render Track Background (Grass field)
    this.renderTrackSurfaces(ctx);

    // 3. Render Optimal Racing Line & Overlays
    if (this.showRacingLine) {
      this.renderRacingLine(ctx);
    }

    // 4. Render Start/Finish Line & Sector lines
    this.renderTrackMarkers(ctx);

    // 5. Render Ghost Car (if in versus mode)
    if (this.drivingMode === 'versus') {
      this.renderCar(ctx, this.ghostCar, 'rgba(0, 240, 255, 0.45)', true);
    }

    // 6. Render Primary Car
    this.renderCar(ctx, this.car, '#e10600', false);

    ctx.restore();

    // 7. Render Telemetry Charts
    this.telemetry.drawGraphs();
    this.telemetry.drawGGDiagram('gg-canvas', this.car);
  }

  renderTrackSurfaces(ctx) {
    const points = this.track.points;
    const n = points.length;

    // Outer grass / asphalt runoff
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Track surface (Dark Asphalt)
    ctx.beginPath();
    ctx.strokeStyle = '#2d3340';
    ctx.lineWidth = this.track.width + 1.2;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Main asphalt ribbon
    ctx.beginPath();
    ctx.strokeStyle = '#181e29';
    ctx.lineWidth = this.track.width;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Red & White Striped Kerbs on Corner Apexes
    const kerbThickness = 0.55;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (!p.kerbLeft && !p.kerbRight) continue;

      const next = points[(i + 1) % n];
      const isRed = (Math.floor(p.dist * 1.5) % 2) === 0;
      ctx.strokeStyle = isRed ? '#e10600' : '#ffffff';
      ctx.lineWidth = kerbThickness;

      if (p.kerbLeft) {
        ctx.beginPath();
        ctx.moveTo(p.leftX, p.leftY);
        ctx.lineTo(next.leftX, next.leftY);
        ctx.stroke();
      }
      if (p.kerbRight) {
        ctx.beginPath();
        ctx.moveTo(p.rightX, p.rightY);
        ctx.lineTo(next.rightX, next.rightY);
        ctx.stroke();
      }
    }

    // White Track Boundary Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 0.12;

    // Left line
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (i === 0) ctx.moveTo(p.leftX, p.leftY);
      else ctx.lineTo(p.leftX, p.leftY);
    }
    ctx.closePath();
    ctx.stroke();

    // Right line
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (i === 0) ctx.moveTo(p.rightX, p.rightY);
      else ctx.lineTo(p.rightX, p.rightY);
    }
    ctx.closePath();
    ctx.stroke();
  }

  renderRacingLine(ctx) {
    const lpts = this.racingLineData.linePoints;
    const n = lpts.length;

    ctx.lineWidth = 0.22;
    ctx.lineCap = 'round';

    for (let i = 0; i < n; i++) {
      const p1 = lpts[i];
      const p2 = lpts[(i + 1) % n];

      // Color based on telemetry state
      if (p1.state === 'brake' && this.showBrakingZones) {
        ctx.strokeStyle = '#ff3344'; // Red for threshold braking
      } else if (p1.state === 'apex' && this.showApexMarkers) {
        ctx.strokeStyle = '#ffaa00'; // Amber for apex clipping
      } else {
        ctx.strokeStyle = '#00f0ff'; // Cyan for acceleration
      }

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Highlight Optimal Boost Activation Point (Cyan Pulse)
    const boostIdx = this.racingLineData.optimalBoostIndex;
    const bpt = lpts[boostIdx];
    if (bpt) {
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(bpt.x, bpt.y, 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  renderTrackMarkers(ctx) {
    const p0 = this.track.points[0];
    const halfW = this.track.width / 2;

    // Start / Finish Line (Checkered Pattern)
    ctx.save();
    ctx.translate(p0.x, p0.y);
    ctx.rotate(p0.heading + Math.PI / 2);

    const barW = this.track.width;
    const blocks = 8;
    const bw = barW / blocks;
    for (let b = 0; b < blocks; b++) {
      ctx.fillStyle = b % 2 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(-barW / 2 + b * bw, -0.25, bw, 0.5);
    }
    ctx.restore();
  }

  renderCar(ctx, car, color, isGhost) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);

    const length = car.spec.body.length;
    const width = car.spec.body.width;

    if (isGhost) {
      ctx.globalAlpha = 0.5;
    }

    // Tire Skid / Scrub Smoke
    if (car.scrubPenalty > 0.6 && car.speed > 4.0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(-length * 0.4, width * 0.45, 0.45, 0, Math.PI * 2);
      ctx.arc(-length * 0.4, -width * 0.45, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Boost Exhaust Flames
    if (car.boost.active) {
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(-length / 2, -width * 0.2);
      ctx.lineTo(-length / 2 - 1.2 - Math.random() * 0.4, 0);
      ctx.lineTo(-length / 2, width * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 4 Wheels
    ctx.fillStyle = '#111115';
    const wheelL = length * 0.22;
    const wheelW = width * 0.2;
    // Front wheels (steered)
    ctx.save();
    ctx.translate(length * 0.32, -width * 0.42);
    ctx.rotate(car.steer * 0.4);
    ctx.fillRect(-wheelL / 2, -wheelW / 2, wheelL, wheelW);
    ctx.restore();

    ctx.save();
    ctx.translate(length * 0.32, width * 0.42);
    ctx.rotate(car.steer * 0.4);
    ctx.fillRect(-wheelL / 2, -wheelW / 2, wheelL, wheelW);
    ctx.restore();

    // Rear wheels (fixed)
    ctx.fillRect(-length * 0.32 - wheelL / 2, -width * 0.45 - wheelW / 2, wheelL, wheelW);
    ctx.fillRect(-length * 0.32 - wheelL / 2, width * 0.45 - wheelW / 2, wheelL, wheelW);

    // Car Body / Hull
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(length * 0.48, 0); // Nose tip
    ctx.lineTo(length * 0.25, width * 0.35); // Front wing outer
    ctx.lineTo(-length * 0.3, width * 0.38); // Sidepod
    ctx.lineTo(-length * 0.46, width * 0.4); // Rear wing
    ctx.lineTo(-length * 0.46, -width * 0.4);
    ctx.lineTo(-length * 0.3, -width * 0.38);
    ctx.lineTo(length * 0.25, -width * 0.35);
    ctx.closePath();
    ctx.fill();

    // Front Wing
    ctx.fillStyle = '#1e2638';
    ctx.fillRect(length * 0.32, -width * 0.45, length * 0.12, width * 0.9);

    // Rear Wing
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(-length * 0.48, -width * 0.46, length * 0.1, width * 0.92);

    // Cockpit & Driver Helmet
    ctx.fillStyle = '#11151f';
    ctx.beginPath();
    ctx.ellipse(0, 0, length * 0.18, width * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffaa00'; // Yellow helmet
    ctx.beginPath();
    ctx.arc(-length * 0.04, 0, 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  updateUI() {
    // Speedometer
    const speedMs = this.car.speed;
    const speedKmh = Math.round(speedMs * 3.6);
    document.getElementById('ui-speed-kmh').innerText = speedKmh;
    document.getElementById('ui-speed-ms').innerText = `${speedMs.toFixed(1)} m/s`;

    // Speed bar fill
    const topKmh = this.car.spec.topSpeed * 1.3 * 3.6;
    const pct = Math.min(100, Math.round((speedKmh / topKmh) * 100));
    const speedBar = document.getElementById('ui-speed-bar');
    if (speedBar) speedBar.style.width = `${pct}%`;

    // G-Force & Scrub
    document.getElementById('ui-lateral-g').innerText = `${this.car.lateralG.toFixed(2)}G`;
    const scrubPct = Math.round(this.car.scrubPenalty * 100);
    const scrubEl = document.getElementById('ui-scrub-pct');
    scrubEl.innerText = `${scrubPct}%`;
    scrubEl.style.color = scrubPct > 70 ? '#ff3344' : scrubPct > 30 ? '#ffaa00' : '#00ff66';

    // Boost Charge Bar
    const boostBar = document.getElementById('ui-boost-bar');
    const boostPct = Math.round(this.car.boost.charge * 100);
    if (boostBar) {
      boostBar.style.width = `${boostPct}%`;
      boostBar.style.background = this.car.boost.active ? '#00f0ff' : '#00a19b';
    }
    document.getElementById('ui-boost-pct').innerText = `${boostPct}%`;

    // Lap Timer
    const lapEl = document.getElementById('ui-current-lap');
    if (this.hasCrossedStart) {
      lapEl.innerText = `${this.currentLapTime.toFixed(3)}s`;
    } else {
      lapEl.innerText = '0.000s';
    }

    if (this.bestLapTime) {
      document.getElementById('ui-best-lap').innerText = `${this.bestLapTime.toFixed(3)}s`;
    }

    // Sector Splits
    for (let s = 0; s < 3; s++) {
      const sIdx = s + 1;
      const time = this.sectorTimes[s];
      const el = document.getElementById(`ui-s${sIdx}-time`);
      const box = document.getElementById(`ui-sector-box-${sIdx}`);
      if (el && time !== null) {
        el.innerText = `${time.toFixed(3)}s`;
        if (box && !box.classList.contains('sector-pb')) {
          box.classList.add('sector-pb');
        }
      }
    }

    // Delta vs Theoretical Optimal
    if (this.hasCrossedStart && this.racingLineData) {
      const theoTotal = this.racingLineData.theoreticalLapTime;
      const progressFrac = this.car.currentTrackIndex / this.track.points.length;
      const expectedTime = theoTotal * progressFrac;
      const delta = this.currentLapTime - expectedTime;
      const deltaEl = document.getElementById('ui-lap-delta');
      if (deltaEl) {
        const sign = delta >= 0 ? '+' : '';
        deltaEl.innerText = `${sign}${delta.toFixed(3)}s vs Theo`;
        deltaEl.style.color = delta <= 0.2 ? '#00ff66' : '#ff3344';
      }
    }
  }
}

// Start app once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new ApexProApp();
});
