/**
 * Race2Win Optimal Racing Line & Velocity Profile Optimizer
 * Computes minimum-curvature trajectory, braking points, apex speeds, and optimal boost windows.
 */

export function optimizeRacingLine(track, carSpec) {
  const points = track.points;
  const n = points.length;
  // Keep the racing line within 75% of half-width so car geometry (1.8m wide) stays securely on-track
  const halfW = (track.width / 2) * 0.75;

  // Step 1: Iterative minimum-curvature line solver
  // alpha[i] is lateral offset from centerline: +left, -right
  const alpha = new Float64Array(n);

  // Initialize: outside-inside-outside bias based on corner curvature
  for (let i = 0; i < n; i++) {
    const cur = points[i].curvature;
    if (cur > 0.01) {
      // Right turn -> apex is on inside (right = negative alpha)
      alpha[i] = -halfW * 0.80;
    } else if (cur < -0.01) {
      // Left turn -> apex is on inside (left = positive alpha)
      alpha[i] = halfW * 0.80;
    } else {
      alpha[i] = 0;
    }
  }

  // Smooth relaxation passes to minimize local curvature (Laplacian smoothing with boundary projection)
  const iterations = 120;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const prev = alpha[(i - 1 + n) % n];
      const next = alpha[(i + 1) % n];
      let smooth = 0.5 * (prev + next);

      // Late-apex bias: favor hugging the apex later in the corner to maximize exit speed
      const p = points[i];
      if (p.isCorner) {
        const nextCur = points[(i + 4) % n].curvature;
        // As corner unwinds into a straight, track out to the outside
        if (Math.abs(nextCur) < Math.abs(p.curvature)) {
          const outsideSign = p.curvature > 0 ? 1 : -1;
          smooth += outsideSign * 0.03 * halfW;
        }
      }

      // Clamp within track boundaries
      alpha[i] = Math.max(-halfW, Math.min(halfW, smooth));
    }
  }

  // Step 2: Compute 2D coordinates and curvature of the optimal line
  const linePoints = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const off = alpha[i];
    // Lateral unit vector: nx = -sin(heading), ny = cos(heading)
    const lx = p.x + p.nx * off;
    const ly = p.y + p.ny * off;
    linePoints.push({
      index: i,
      x: lx,
      y: ly,
      offset: off,
      curvature: 0,
      heading: 0,
      targetSpeed: 0,
      state: 'accel' // 'accel', 'brake', 'apex'
    });
  }

  // Compute tangent headings and curvature along the racing line
  for (let i = 0; i < n; i++) {
    const prev = linePoints[(i - 1 + n) % n];
    const curr = linePoints[i];
    const next = linePoints[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const h1 = Math.atan2(dy1, dx1);
    const h2 = Math.atan2(dy2, dx2);
    curr.heading = h2;

    const ds = Math.hypot(dx2, dy2);
    let dh = h2 - h1;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;

    curr.curvature = ds > 1e-4 ? dh / ds : 0;
  }

  // Step 3: Forward-Backward Velocity Profile (Dynamic Programming)
  // Use 75% grip safety margin to operate right below the quadratic scrub bleed threshold (xU * u^2)
  const latGrip = carSpec.latGrip * 0.75;
  const topSpeed = carSpec.topSpeed;
  const brakeDecel = carSpec.brakeDecel;
  const launchAccel = carSpec.launchAccel;

  // Pass 3a: Maximum cornering speed at every node (Centripetal grip limit + Chicane transition penalty)
  for (let i = 0; i < n; i++) {
    const prev = linePoints[(i - 1 + n) % n];
    const curr = linePoints[i];
    const next = linePoints[(i + 1) % n];
    const k = Math.abs(curr.curvature);
    const dK = Math.abs(next.curvature - prev.curvature);
    // Penalize rapid steering reversals (chicanes/esses) due to steerResponse lag
    const effK = k + 0.6 * dK;

    if (effK > 0.005) {
      curr.targetSpeed = Math.min(topSpeed, Math.sqrt(latGrip / effK));
    } else {
      curr.targetSpeed = topSpeed;
    }
  }

  // Pass 3b: Backward Pass (Braking zones with safety margin)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const curr = linePoints[i];
      const next = linePoints[(i + 1) % n];
      const ds = Math.hypot(next.x - curr.x, next.y - curr.y);

      // v_curr^2 <= v_next^2 + 2 * a_brake * ds
      const maxEntrySpeed = Math.sqrt(next.targetSpeed * next.targetSpeed + 2 * (brakeDecel * 0.88) * ds);
      if (curr.targetSpeed > maxEntrySpeed) {
        curr.targetSpeed = maxEntrySpeed;
        curr.state = 'brake';
      }
    }
  }

  // Pass 3c: Forward Pass (Acceleration out of corners with engine power curve)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      const prev = linePoints[(i - 1 + n) % n];
      const curr = linePoints[i];
      const ds = Math.hypot(curr.x - prev.x, curr.y - prev.y);

      // Tapered acceleration based on current speed
      const speedRatio = prev.targetSpeed / topSpeed;
      const taper = speedRatio < 0.7 ? 1.0 : Math.pow(Math.max(0, (1 - speedRatio) / 0.3), 0.55);
      const effectiveAccel = launchAccel * taper;

      const maxExitSpeed = Math.sqrt(prev.targetSpeed * prev.targetSpeed + 2 * effectiveAccel * ds);
      if (curr.targetSpeed > maxExitSpeed) {
        curr.targetSpeed = maxExitSpeed;
        curr.state = 'accel';
      } else if (curr.state !== 'brake') {
        curr.state = Math.abs(curr.curvature) > 0.04 ? 'apex' : 'accel';
      }
    }
  }

  // Step 4: Identify Optimal Boost Window
  // Find longest straight following the slowest corner
  let bestBoostIdx = 0;
  let maxStraightLen = 0;
  let currStraightLen = 0;
  let straightStartIdx = 0;

  for (let i = 0; i < n * 2; i++) {
    const idx = i % n;
    const p = linePoints[idx];
    if (Math.abs(p.curvature) < 0.012) {
      if (currStraightLen === 0) straightStartIdx = idx;
      currStraightLen++;
      if (currStraightLen > maxStraightLen) {
        maxStraightLen = currStraightLen;
        bestBoostIdx = straightStartIdx;
      }
    } else {
      currStraightLen = 0;
    }
  }

  // Step 5: Theoretical Perfect Lap Time
  let theoreticalLapTime = 0;
  for (let i = 0; i < n; i++) {
    const curr = linePoints[i];
    const next = linePoints[(i + 1) % n];
    const ds = Math.hypot(next.x - curr.x, next.y - curr.y);
    const avgV = Math.max(1.0, (curr.targetSpeed + next.targetSpeed) / 2);
    theoreticalLapTime += ds / avgV;
  }

  return {
    linePoints,
    theoreticalLapTime: Math.round(theoreticalLapTime * 1000) / 1000,
    optimalBoostIndex: bestBoostIdx,
    apexCount: linePoints.filter(p => p.state === 'apex').length
  };
}
