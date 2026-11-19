/**
 * Race2Win Autonomous Perfect-Lap Driver (Stanley + Pure Pursuit + Dynamic Speed Governor)
 * Executes frame-perfect steering and throttle to achieve the mathematical minimum lap time.
 */

export class AutopilotController {
  constructor(racingLineData) {
    this.setData(racingLineData);
  }

  setData(racingLineData) {
    this.linePoints = racingLineData.linePoints;
    this.optimalBoostIdx = racingLineData.optimalBoostIndex;
    this.n = this.linePoints.length;
    this.lastClosestIdx = 0;
  }

  /**
   * Generates frame-perfect controls {steer, throttle, brake, boost}
   */
  computeControls(car) {
    if (!this.linePoints || this.n === 0) {
      return { steer: 0, throttle: 1, brake: 0, boost: false };
    }

    const v = Math.max(0.1, car.speed);

    // 1. Find nearest point on the optimal racing line
    let closestIdx = this.lastClosestIdx;
    let minDistSq = Infinity;
    const window = 40;

    for (let offset = -window; offset <= window; offset++) {
      const idx = (this.lastClosestIdx + offset + this.n) % this.n;
      const pt = this.linePoints[idx];
      const dx = car.x - pt.x;
      const dy = car.y - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minDistSq) {
        minDistSq = d2;
        closestIdx = idx;
      }
    }
    this.lastClosestIdx = closestIdx;

    // 2. Dynamic lookahead point based on speed
    // Higher speed requires looking further down the track
    const lookaheadDist = Math.max(1.8, 0.24 * v);
    let targetIdx = closestIdx;
    let accumDist = 0;

    while (accumDist < lookaheadDist) {
      const nextIdx = (targetIdx + 1) % this.n;
      const p1 = this.linePoints[targetIdx];
      const p2 = this.linePoints[nextIdx];
      accumDist += Math.hypot(p2.x - p1.x, p2.y - p1.y);
      targetIdx = nextIdx;
    }

    const targetPt = this.linePoints[targetIdx];

    // 3. Heading & Cross-Track Error (Stanley Formulation)
    const targetAngle = Math.atan2(targetPt.y - car.y, targetPt.x - car.x);
    let headingErr = targetAngle - car.heading;
    while (headingErr > Math.PI) headingErr -= Math.PI * 2;
    while (headingErr < -Math.PI) headingErr += Math.PI * 2;

    // Cross-track error (perpendicular distance to target trajectory)
    const lineHeading = targetPt.heading;
    const dx = car.x - targetPt.x;
    const dy = car.y - targetPt.y;
    // Cross track error sign (+ left, - right)
    const crossTrack = -Math.sin(lineHeading) * dx + Math.cos(lineHeading) * dy;

    // Stanley control law: delta = headingErr + atan(k * crossTrack / v)
    const kCross = 1.8;
    const stanleyAngle = headingErr + Math.atan2(kCross * crossTrack, v + 0.5);

    // Normalize to [-1, 1] for car steer input
    const maxSteerRad = car.spec.maxSteerRate;
    let desiredSteer = stanleyAngle / maxSteerRad;

    // Scrub Prevention Guard:
    // If steering demand exceeds lateral grip, clamp steer to avoid the quadratic speed bleed
    const maxGripSteer = (car.gripLimit / (v * v + 0.1)) * (maxSteerRad * 0.95);
    if (Math.abs(desiredSteer) > maxGripSteer) {
      desiredSteer = Math.sign(desiredSteer) * Math.min(1.0, maxGripSteer);
    }
    desiredSteer = Math.max(-1.0, Math.min(1.0, desiredSteer));

    // 4. Longitudinal Control (Speed Governor)
    const targetSpeed = targetPt.targetSpeed;
    const speedDelta = v - targetSpeed;

    let throttle = 0;
    let brake = 0;

    if (speedDelta < -0.3) {
      // Below target speed: 100% full throttle
      throttle = 1.0;
      brake = 0.0;
    } else if (speedDelta > 0.4) {
      // Overspeeding approaching corner: threshold braking
      throttle = 0.0;
      brake = Math.min(1.0, (speedDelta / 2.0));
    } else {
      // Balance speed at apex / exit
      throttle = Math.max(0.2, 1.0 - speedDelta);
      brake = 0.0;
    }

    // 5. Intelligent Boost Triggering
    // Fire boost when entering the optimal straight and aligned with track
    let boost = false;
    const distToBoost = Math.abs(closestIdx - this.optimalBoostIdx);
    const onLongStraight = targetPt.state === 'accel' && Math.abs(targetPt.curvature) < 0.008 && v > 10.0;

    if ((distToBoost <= 3 || onLongStraight) && Math.abs(headingErr) < 0.15 && car.boost.charge >= 0.98) {
      boost = true;
    }

    return {
      steer: desiredSteer,
      throttle,
      brake,
      boost,
      targetSpeed: Math.round(targetSpeed * 3.6 * 10) / 10,
      targetIdx
    };
  }
}
