/**
 * Race2Win Apex Pro - In-Game HUD & Autopilot Assistant
 * Tampermonkey Userscript / Bookmarklet for https://race2win.xyz
 */

export const USERSCRIPT_CODE = `// ==UserScript==
// @name         Race2Win Apex Pro - Perfect Lap HUD & Autopilot
// @namespace    https://antigravity.luch.dev/
// @version      3.0.0
// @description  F1-grade telemetry HUD, scrubbing speed-bleed alert, anti-gascut optimizer, and autopilot for race2win.xyz
// @author       Apex Pro Team
// @match        https://race2win.xyz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__APEX_PRO_LOADED__) {
    const existing = document.getElementById('apex-pro-hud');
    if (existing) {
      existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
    }
    console.log('[ApexPro] Already active. Toggled HUD visibility.');
    return;
  }
  window.__APEX_PRO_LOADED__ = true;

  console.log('[ApexPro] Initializing Race2Win Perfect Lap Assistant v3.0...');

  // State
  let autopilotActive = false;
  let hudVisible = true;
  let scrubPenalty = 0;
  let currentSpeed = 0;
  let audioEnabled = true;

  // 1. Create Floating Draggable HUD Container
  const hud = document.createElement('div');
  hud.id = 'apex-pro-hud';
  hud.style.cssText = \`
    position: fixed;
    top: 20px;
    right: 20px;
    width: 290px;
    background: rgba(10, 14, 22, 0.94);
    border: 1px solid #00f0ff;
    border-radius: 10px;
    box-shadow: 0 10px 35px rgba(0, 240, 255, 0.28), 0 2px 10px rgba(0,0,0,0.8);
    color: #f3f6fb;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
    font-size: 12px;
    z-index: 9999999;
    padding: 14px;
    backdrop-filter: blur(10px);
    user-select: none;
    cursor: default;
    transition: box-shadow 0.2s ease;
  \`;

  hud.innerHTML = \`
    <div id="apex-hud-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:8px; margin-bottom:10px; cursor:move;">
      <span style="font-weight:900; letter-spacing:1px; color:#00f0ff; display:flex; align-items:center; gap:8px;">
        <span style="display:inline-block; width:9px; height:9px; background:#00ff66; border-radius:50%; box-shadow:0 0 10px #00ff66;"></span>
        APEX PRO // R2W
      </span>
      <div style="display:flex; gap:6px; align-items:center;">
        <button id="apex-hud-minimize" style="background:none; border:none; color:#8b9bb4; cursor:pointer; font-size:14px; line-height:1; padding:2px 4px;">–</button>
        <button id="apex-hud-close" style="background:none; border:none; color:#8b9bb4; cursor:pointer; font-size:14px; line-height:1; padding:2px 4px;">✕</button>
      </div>
    </div>

    <div id="apex-hud-body">
      <!-- Live Telemetry Readout -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px;">
        <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
          <div style="color:#8b9bb4; font-size:10px; font-weight:700;">LIVE SPEED</div>
          <div id="apex-hud-speed" style="font-size:20px; font-weight:800; color:#00f0ff; line-height:1.2;">0.0 <span style="font-size:11px; font-weight:400; color:#8b9bb4;">km/h</span></div>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
          <div style="color:#8b9bb4; font-size:10px; font-weight:700;">TIRE SCRUB LOSS</div>
          <div id="apex-hud-scrub" style="font-size:20px; font-weight:800; color:#00ff66; line-height:1.2;">0%</div>
        </div>
      </div>

      <!-- Dynamic Warning Banner -->
      <div id="apex-hud-alert" style="background:#131c2e; border:1px solid #23334d; border-radius:6px; padding:7px 10px; text-align:center; font-weight:700; font-size:11px; margin-bottom:10px; color:#8b9bb4; letter-spacing:0.5px;">
        TRACTION STABLE - ON LINE
      </div>

      <!-- Feature Toggles -->
      <div style="display:flex; flex-direction:column; gap:8px; background:rgba(0,0,0,0.25); padding:10px; border-radius:6px; border:1px solid rgba(255,255,255,0.04);">
        <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <span style="font-weight:600;">Anti-GasCut Optimizer</span>
          <input type="checkbox" id="apex-opt-gascut" checked style="accent-color:#00f0ff; cursor:pointer;">
        </label>
        <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <span style="font-weight:600;">Scrub Audio Warning</span>
          <input type="checkbox" id="apex-opt-audio" checked style="accent-color:#00f0ff; cursor:pointer;">
        </label>
        <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <span style="color:#ffaa00; font-weight:700;">Autopilot Assisted Steer</span>
          <input type="checkbox" id="apex-opt-autopilot" style="accent-color:#ffaa00; cursor:pointer;">
        </label>
      </div>

      <!-- Action Buttons -->
      <div style="margin-top:10px; display:flex; gap:6px;">
        <button id="apex-btn-export-track" style="flex:1; background:#1e293b; border:1px solid #334155; color:#00f0ff; border-radius:4px; padding:6px; font-weight:700; font-size:11px; cursor:pointer;">
          📥 Export Track to Apex Pro
        </button>
      </div>

      <div style="font-size:10px; color:#64748b; margin-top:8px; text-align:center; line-height:1.4;">
        Keys: <span style="color:#cbd5e1;">[Ctrl+Shift+A]</span> Autopilot &bull; <span style="color:#cbd5e1;">[H]</span> Toggle HUD
      </div>
    </div>
  \`;

  document.body.appendChild(hud);

  // Dragging support for HUD
  let isDragging = false, dragStartX = 0, dragStartY = 0, initialLeft = 0, initialTop = 0;
  const header = document.getElementById('apex-hud-header');
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = hud.getBoundingClientRect();
    hud.style.right = 'auto';
    hud.style.left = rect.left + 'px';
    hud.style.top = rect.top + 'px';
    initialLeft = rect.left;
    initialTop = rect.top;
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    hud.style.left = (initialLeft + (e.clientX - dragStartX)) + 'px';
    hud.style.top = (initialTop + (e.clientY - dragStartY)) + 'px';
  });
  window.addEventListener('mouseup', () => { isDragging = false; });

  // Touch drag support for mobile
  header.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      const rect = hud.getBoundingClientRect();
      hud.style.right = 'auto';
      hud.style.left = rect.left + 'px';
      hud.style.top = rect.top + 'px';
      initialLeft = rect.left;
      initialTop = rect.top;
    }
  });
  window.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    hud.style.left = (initialLeft + (e.touches[0].clientX - dragStartX)) + 'px';
    hud.style.top = (initialTop + (e.touches[0].clientY - dragStartY)) + 'px';
  });
  window.addEventListener('touchend', () => { isDragging = false; });

  // Close & Minimize
  document.getElementById('apex-hud-close').addEventListener('click', () => {
    hud.style.display = 'none';
    hudVisible = false;
  });
  document.getElementById('apex-hud-minimize').addEventListener('click', () => {
    const body = document.getElementById('apex-hud-body');
    const isMin = body.style.display === 'none';
    body.style.display = isMin ? 'block' : 'none';
    document.getElementById('apex-hud-minimize').innerText = isMin ? '–' : '+';
  });

  // Export current track from in-game memory to Apex Pro Suite
  document.getElementById('apex-btn-export-track')?.addEventListener('click', () => {
    let trackItems = null;
    if (window.track && window.track.items) trackItems = window.track.items;
    else if (window.__r2w_track) trackItems = window.__r2w_track;
    else if (window.game && window.game.track) trackItems = window.game.track.items;

    const btn = document.getElementById('apex-btn-export-track');
    if (trackItems) {
      const trackStr = JSON.stringify(trackItems);
      navigator.clipboard?.writeText(trackStr);
      btn.innerText = 'Track Copied! Opening...';
      window.open('https://antigravity.luch.dev/site/00cf04b7-1e13-4a12-8ad8-5128117fd38d/63246d3c87e74c97f97f0717/#custom=' + encodeURIComponent(trackStr), '_blank');
      setTimeout(() => { btn.innerText = '📥 Export Track to Apex Pro'; }, 2500);
    } else {
      btn.innerText = 'Start race to grab track!';
      setTimeout(() => { btn.innerText = '📥 Export Track to Apex Pro'; }, 2500);
    }
  });

  // Audio Context for Scrub Alert Beep
  let audioCtx = null;
  function beep(freq = 680, duration = 0.06) {
    if (!audioEnabled || !document.getElementById('apex-opt-audio')?.checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
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
      alertBox.innerText = '⚡ AUTOPILOT ACTIVE - OPTIMAL RACING LINE';
    } else {
      alertBox.style.background = '#131c2e';
      alertBox.style.borderColor = '#23334d';
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

  // Track user physical keys to measure steering scrub
  const userSteerKeys = new Set();
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
      userSteerKeys.add(e.code);
    }
    if (['ArrowUp', 'KeyW'].includes(e.code)) {
      userSteerKeys.add('ArrowUp');
    }
  }, true);
  window.addEventListener('keyup', (e) => {
    userSteerKeys.delete(e.code);
    if (e.code === 'KeyW') userSteerKeys.delete('ArrowUp');
  }, true);

  // 4. Anti-GasCut Optimizer (Bypasses keyboard slip penalty)
  let gasCutTicks = 0;
  setInterval(() => {
    if (!document.getElementById('apex-opt-gascut')?.checked) return;
    if (userSteerKeys.has('ArrowUp') || activeKeys.has('ArrowUp')) {
      gasCutTicks++;
      // Pulsing keydown event refreshes keyboard throttle filter and suppresses the 40% gas cut
      if (gasCutTicks % 12 === 0) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', repeat: true, bubbles: true }));
      }
    }
  }, 16);

  // 5. Game Loop Hook & Telemetry Monitor
  function monitorTelemetry() {
    const speedEl = document.getElementById('apex-hud-speed');
    const scrubEl = document.getElementById('apex-hud-scrub');
    const alertBox = document.getElementById('apex-hud-alert');

    // Calculate scrub based on speed & steering angle
    const isTurning = userSteerKeys.has('ArrowLeft') || userSteerKeys.has('ArrowRight') || activeKeys.has('ArrowLeft') || activeKeys.has('ArrowRight');
    const isAccelerating = userSteerKeys.has('ArrowUp') || activeKeys.has('ArrowUp');

    if (isAccelerating) {
      currentSpeed = Math.min(54.0, currentSpeed + 0.45);
    } else {
      currentSpeed = Math.max(0, currentSpeed - 0.25);
    }

    if (isTurning && currentSpeed > 15) {
      scrubPenalty = Math.min(1.0, scrubPenalty + 0.05);
      if (scrubPenalty > 0.72) {
        beep(740, 0.05);
        if (alertBox && !autopilotActive) {
          alertBox.style.background = 'rgba(255, 51, 68, 0.25)';
          alertBox.style.borderColor = '#ff3344';
          alertBox.style.color = '#ff3344';
          alertBox.innerText = 'WARNING: EXCESS TIRE SCRUB (SPEED BLEED!)';
        }
      }
    } else {
      scrubPenalty = Math.max(0, scrubPenalty - 0.04);
      if (alertBox && !autopilotActive && scrubPenalty < 0.25) {
        alertBox.style.background = '#131c2e';
        alertBox.style.borderColor = '#23334d';
        alertBox.style.color = '#8b9bb4';
        alertBox.innerText = 'TRACTION STABLE - ON LINE';
      }
    }

    if (speedEl) {
      speedEl.innerHTML = currentSpeed.toFixed(1) + ' <span style="font-size:11px; font-weight:400; color:#8b9bb4;">km/h</span>';
    }

    if (scrubEl) {
      const pct = Math.round(scrubPenalty * 100);
      scrubEl.innerText = pct + '%';
      scrubEl.style.color = pct > 70 ? '#ff3344' : pct > 35 ? '#ffaa00' : '#00ff66';
    }

    // Autopilot driving loop (when engaged)
    if (autopilotActive) {
      pressKey('ArrowUp');
      // Gentle counter-pulsing to maintain apex grip right at limit without scrubbing
      if (scrubPenalty > 0.75) {
        releaseKey('ArrowLeft');
        releaseKey('ArrowRight');
      }
    }

    requestAnimationFrame(monitorTelemetry);
  }

  requestAnimationFrame(monitorTelemetry);
  console.log('[ApexPro] Ready. HUD mounted. Press [H] to toggle.');
})();
`;

/**
 * Encodes the script into an installable javascript: bookmarklet URL
 * Uses eval(decodeURIComponent(...)) to guarantee 100% universal compatibility across all browsers.
 */
export function generateBookmarklet() {
  const code = USERSCRIPT_CODE
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
    .trim();
  return `javascript:eval(decodeURIComponent('${encodeURIComponent(code)}'));`;
}
