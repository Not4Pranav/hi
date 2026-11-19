/**
 * Race2Win Real-Time F1 Telemetry, G-G Diagram & Lap Timing Dashboard
 */

export class TelemetryManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.historyLength = 120;
    this.speedHistory = new Float32Array(this.historyLength);
    this.throttleHistory = new Float32Array(this.historyLength);
    this.brakeHistory = new Float32Array(this.historyLength);
    this.steerHistory = new Float32Array(this.historyLength);
    this.scrubHistory = new Float32Array(this.historyLength);
    this.historyIdx = 0;

    this.lapStartTime = 0;
    this.currentLapTime = 0;
    this.bestLapTime = null;
    this.sectorTimes = [null, null, null];
    this.bestSectorTimes = [null, null, null];
    this.lastLapFinished = null;
  }

  recordTick(car, input, dt) {
    const idx = this.historyIdx % this.historyLength;
    this.speedHistory[idx] = car.speed * 3.6; // km/h
    this.throttleHistory[idx] = car.throttle;
    this.brakeHistory[idx] = car.brake;
    this.steerHistory[idx] = car.steer;
    this.scrubHistory[idx] = car.scrubPenalty;
    this.historyIdx++;
  }

  drawGraphs() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1e2638';
    ctx.lineWidth = 1;

    for (let y = 20; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const n = this.historyLength;
    const stepX = w / (n - 1);

    // 1. Draw Speed Trace (Cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const dataIdx = (this.historyIdx + i) % n;
      const speed = this.speedHistory[dataIdx];
      const y = h - 25 - (speed / 70) * (h - 40);
      const x = i * stepX;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Draw Throttle Trace (Green)
    ctx.beginPath();
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const dataIdx = (this.historyIdx + i) % n;
      const thr = this.throttleHistory[dataIdx];
      const y = h - 25 - thr * 35;
      const x = i * stepX;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 3. Draw Brake Trace (Red)
    ctx.beginPath();
    ctx.strokeStyle = '#ff3344';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const dataIdx = (this.historyIdx + i) % n;
      const brk = this.brakeHistory[dataIdx];
      const y = h - 25 - brk * 35;
      const x = i * stepX;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 4. Draw Scrub Warnings (Amber spikes)
    ctx.beginPath();
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const dataIdx = (this.historyIdx + i) % n;
      const scrub = this.scrubHistory[dataIdx];
      if (scrub > 0.3) {
        const y = h - 25 - scrub * 30;
        const x = i * stepX;
        ctx.moveTo(x, h - 25);
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Legend
    ctx.font = '10px monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('SPEED (km/h)', 10, 16);
    ctx.fillStyle = '#00ff66';
    ctx.fillText('THROTTLE', 100, 16);
    ctx.fillStyle = '#ff3344';
    ctx.fillText('BRAKE', 170, 16);
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('TIRE SCRUB LOSS', 230, 16);
  }

  drawGGDiagram(canvasId, car) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    // Friction circle background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, w, h);

    // Coordinate crosshairs
    ctx.strokeStyle = '#1e2638';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
    ctx.moveTo(0, cy); ctx.lineTo(w, cy);
    ctx.stroke();

    // 1G and 2G concentric rings
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#2a354d';
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    // Grip boundary (2.45G limit for Formula A)
    ctx.strokeStyle = '#e10600';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Live G-force point
    // Lateral G -> X axis, Longitudinal G -> Y axis
    const maxG = 2.5;
    const latG = car.lateralG || 0;
    const longG = (car.throttle * car.spec.launchAccel - car.brake * car.spec.brakeDecel) / 9.81;

    const px = cx + (latG / maxG) * r;
    const py = cy - (longG / maxG) * r;

    // Glowing dot
    ctx.fillStyle = car.scrubPenalty > 0.8 ? '#ff3344' : '#00f0ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Labels
    ctx.font = '9px monospace';
    ctx.fillStyle = '#8b9bb4';
    ctx.fillText('+2.5G LAT', w - 46, cy - 3);
    ctx.fillText('+2.0G ACCEL', cx + 4, 12);
  }
}
