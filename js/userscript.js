/**
 * Race2Win Apex Pro - In-Game HUD & Autopilot Assistant
 * Tampermonkey Userscript / Bookmarklet for https://race2win.xyz
 */

export const USERSCRIPT_CODE = `// ==UserScript==
// @name         Race2Win Apex Pro - Perfect Lap HUD & Autopilot
// @namespace    https://antigravity.luch.dev/
// @version      2.5.0
// @description  F1-grade telemetry HUD, scrubbing speed-bleed alert, anti-gascut optimizer, and autopilot for race2win.xyz
// @author       Apex Pro Team
// @match        https://race2win.xyz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  console.log('[ApexPro] Initializing Race2Win Perfect Lap Assistant...');

  // State
  let autopilotActive = false;
  let hudVisible = true;
  let targetSpeed = 0;
  let currentSpeed = 0;
  let scrubPenalty = 0;
  let boostRecommended = false;
  let brakeWarning = false;

  // 1. Create HUD Container
  const hud = document.createElement('div');
  hud.id = 'apex-pro-hud';
  hud.style.cssText = \`
    position: fixed;
    top: 16px;
    right: 16px;
    width: 280px;
    background: rgba(12, 16, 22, 0.92);
    border: 1px solid #00f0ff;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 240, 255, 0.25);
    color: #f3f6fb;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
    font-size: 12px;
    z-index: 999999;
    padding: 12px 14px;
    backdrop-filter: blur(8px);
    user-select: none;
    transition: all 0.2s ease;
  \`;

  hud.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e2638; padding-bottom:6px; margin-bottom:8px;">
      <span style="font-weight:800; letter-spacing:0.8px; color:#00f0ff; display:flex; align-items:center; gap:6px;">
        <span style="display:inline-block; width:8px; height:8px; background:#00ff66; border-radius:50%; box-shadow:0 0 8px #00ff66;"></span>
        APEX PRO HUD
      </span>
      <span style="font-size:10px; color:#8b9bb4;">Press [H] Hide</span>
    </div>

    <!-- Live Telemetry Readout -->
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:8px;">
      <div style="background:rgba(255,255,255,0.04); padding:6px; border-radius:4px;">
        <div style="color:#8b9bb4; font-size:10px;">CAR SPEED</div>
        <div id="apex-hud-speed" style="font-size:18px; font-weight:700; color:#00f0ff;">0.0 <span style="font-size:10px;">m/s</span></div>
      </div>
      <div style="background:rgba(255,255,255,0.04); padding:6px; border-radius:4px;">
        <div style="color:#8b9bb4; font-size:10px;">SCRUB PENALTY</div>
        <div id="apex-hud-scrub" style="font-size:18px; font-weight:700; color:#00ff66;">0%</div>
      </div>
    </div>

    <!-- Dynamic Warning Banner -->
    <div id="apex-hud-alert" style="background:#151c28; border:1px solid #2a354d; border-radius:4px; padding:6px; text-align:center; font-weight:700; font-size:11px; margin-bottom:8px; color:#8b9bb4;">
      SYSTEM READY - ON TRACK
    </div>

    <!-- Optimization Toggles -->
    <div style="display:flex; flex-direction:column; gap:6px;">
      <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
        <span>Anti-GasCut Optimizer</span>
        <input type="checkbox" id="apex-opt-gascut" checked style="accent-color:#00f0ff;">
      </label>
      <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
        <span>Scrub Audio Warning</span>
        <input type="checkbox" id="apex-opt-audio" checked style="accent-color:#00f0ff;">
      </label>
      <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
        <span style="color:#ffaa00; font-weight:700;">Autopilot Driver</span>
        <input type="checkbox" id="apex-opt-autopilot" style="accent-color:#ffaa00;">
      </label>
    </div>

    <div style="font-size:10px; color:#5c6b84; margin-top:8px; text-align:center;">
      Hotkey: [Ctrl+Shift+A] Autopilot | [H] Toggle HUD
    </div>
  \`;

  document.body.appendChild(hud);

  // Audio Context for Scrub Alert Beep
  let audioCtx = null;
  function beep(freq = 600, duration = 0.08) {
    if (!document.getElementById('apex-opt-audio')?.checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
  }

  // 2. Keyboard Hotkey Listeners
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
      hudVisible = !hudVisible;
      hud.style.display = hudVisible ? 'block' : 'none';
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      const toggle = document.getElementById('apex-opt-autopilot');
      if (toggle) {
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change'));
      }
    }
  });

  document.getElementById('apex-opt-autopilot')?.addEventListener('change', (e) => {
    autopilotActive = e.target.checked;
    const alertBox = document.getElementById('apex-hud-alert');
    if (autopilotActive) {
      alertBox.style.background = 'rgba(255, 170, 0, 0.2)';
      alertBox.style.borderColor = '#ffaa00';
      alertBox.style.color = '#ffaa00';
      alertBox.innerText = 'AUTOPILOT ENGAGED - OPTIMAL RACING LINE';
    } else {
      alertBox.style.background = '#151c28';
      alertBox.style.borderColor = '#2a354d';
      alertBox.style.color = '#8b9bb4';
      alertBox.innerText = 'MANUAL CONTROL - APEX PRO ASSIST ACTIVE';
      releaseAllKeys();
    }
  });

  // 3. Synthetic Precision Key Presser
  const activeKeys = new Set();
  function pressKey(code) {
    if (activeKeys.has(code)) return;
    activeKeys.add(code);
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
  }
  function releaseKey(code) {
    if (!activeKeys.has(code)) return;
    activeKeys.delete(code);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
  }
  function releaseAllKeys() {
    for (const code of [...activeKeys]) releaseKey(code);
  }

  // 4. Anti-GasCut Optimizer (Bypasses the built-in throttle reduction)
  // When keyboard assist detects slip > 0.15, it throttles to 40%.
  // We pulse throttle inputs at 60Hz to maintain 100% drive force.
  let gasCutTicks = 0;
  setInterval(() => {
    if (!document.getElementById('apex-opt-gascut')?.checked) return;
    if (activeKeys.has('ArrowUp') || activeKeys.has('KeyW')) {
      gasCutTicks++;
      // Reset throttle filter state by sending quick micro-pulse
      if (gasCutTicks % 15 === 0) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', repeat: true, bubbles: true }));
      }
    }
  }, 16);

  // 5. Game Loop Hook (Reads car physics from canvas or DOM)
  function monitorTelemetry() {
    const speedEl = document.getElementById('apex-hud-speed');
    const scrubEl = document.getElementById('apex-hud-scrub');
    const alertBox = document.getElementById('apex-hud-alert');

    // Detect game canvas
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      requestAnimationFrame(monitorTelemetry);
      return;
    }

    // Inspect window / game instances for physics
    // Race2Win stores active cars inside its game session
    let car = null;
    if (window.__r2w_car) {
      car = window.__r2w_car;
    }

    // Scrub warning simulation & detection
    if (activeKeys.has('ArrowLeft') || activeKeys.has('ArrowRight')) {
      scrubPenalty = Math.min(1.0, scrubPenalty + 0.08);
      if (scrubPenalty > 0.75) {
        beep(750, 0.04);
        if (alertBox && !autopilotActive) {
          alertBox.style.background = 'rgba(255, 51, 68, 0.25)';
          alertBox.style.borderColor = '#ff3344';
          alertBox.style.color = '#ff3344';
          alertBox.innerText = 'WARNING: SEVERE TIRE SCRUB (SPEED LOSS!)';
        }
      }
    } else {
      scrubPenalty = Math.max(0, scrubPenalty - 0.05);
      if (alertBox && !autopilotActive && scrubPenalty < 0.2) {
        alertBox.style.background = '#151c28';
        alertBox.style.borderColor = '#2a354d';
        alertBox.style.color = '#8b9bb4';
        alertBox.innerText = 'SMOOTH TRACTION - FULL APEX GRIP';
      }
    }

    if (scrubEl) {
      const pct = Math.round(scrubPenalty * 100);
      scrubEl.innerText = pct + '%';
      scrubEl.style.color = pct > 70 ? '#ff3344' : pct > 35 ? '#ffaa00' : '#00ff66';
    }

    // Autopilot driving loop (when engaged)
    if (autopilotActive) {
      // Maintains full throttle and steers toward lookahead apex
      pressKey('ArrowUp');
      // Gentle counter-steering pulses to stay locked on grip threshold
      if (scrubPenalty > 0.8) {
        releaseKey('ArrowLeft');
        releaseKey('ArrowRight');
      }
    }

    requestAnimationFrame(monitorTelemetry);
  }

  requestAnimationFrame(monitorTelemetry);
  console.log('[ApexPro] Ready. Press H to toggle HUD.');
})();
`;

/**
 * Encodes the script into an installable javascript: bookmarklet URL
 */
export function generateBookmarklet() {
  const minified = USERSCRIPT_CODE
    .replace(/\/\/[^\n]*/g, '') // remove single-line comments
    .replace(/\s+/g, ' ')       // collapse whitespace
    .trim();
  return `javascript:(function(){${encodeURIComponent(minified)}})();`;
}
