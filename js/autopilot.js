/**
 * Race2Win Autonomous Perfect-Lap Driver (Stanley + Pure Pursuit + Lookahead Braking Governor)
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
      return { steer: 0, throttle: 1, brake: 0, boost: false, targetSpeed: 0, targetIdx: 0 };
    }

    const v = Math.max(0.1, car.speed);

    // 1. Find nearest point on the optimal racing line (local window search)
    let closestIdx = this.lastClosestIdx;
    let minDistSq = Infinity;
    const window = 50;

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

    // 2. Dynamic lookahead point based on speed (Pure Pursuit preview)
    const lookaheadDist = Math.max(1.8, 0.22 * v);
    let targetIdx = closestIdx;
    let accumDist = 0;

    while (accumDist < lookaheadDist) {
      const nextIdx = (targetIdx + 1) % this.n;
      accumDist += Math.hypot(
        this.linePoints[nextIdx].x - this.linePoints[targetIdx].x,
        this.linePoints[nextIdx].y - this.linePoints[targetIdx].y
      );
      targetIdx = nextIdx;
    }

    const targetPt = this.linePoints[targetIdx];
    const closestPt = this.linePoints[closestIdx];

    // 3. Lateral Dynamics: Feedforward curvature + Stanley/Pure-Pursuit feedback
    // Feedforward: yaw rate needed to sustain upcoming trajectory curvature
    const feedforwardYaw = v * targetPt.curvature;

    // Cross-track error relative to closest point on optimal line
    const lineHeading = closestPt.heading;
    const dx = car.x - closestPt.x;
    const dy = car.y - closestPt.y;
    // Cross track error (+ left of line, - right of line)
    const crossTrack = -Math.sin(lineHeading) * dx + Math.cos(lineHeading) * dy;

    // Heading error to preview point
    const targetAngle = Math.atan2(targetPt.y - car.y, targetPt.x - car.x);
    let headingErr = targetAngle - car.heading;
    while (headingErr > Math.PI) headingErr -= Math.PI * 2;
    while (headingErr < -Math.PI) headingErr += Math.PI * 2;

    // Combined desired angular velocity
    const desiredYawRate = feedforwardYaw + 3.2 * headingErr - 2.0 * crossTrack;

    // Normalize to [-1, 1] steer input using physical yaw authority
    const effectiveLatGrip = car.spec.latGrip;
    const effectiveMaxYaw = Math.min(car.spec.maxSteerRate, effectiveLatGrip / v);
    let desiredSteer = Math.max(-1.0, Math.min(1.0, desiredYawRate / Math.max(0.1, effectiveMaxYaw)));

    // 4. Longitudinal Control: Proactive Lookahead Braking Governor
    // Look ahead to detect upcoming braking points before entering the corner
    let brakeTargetIdx = closestIdx;
    let brakeDist = 0;
    const brakeLookaheadDist = Math.max(2.8, 0.40 * v);
    let minFutureTargetSpeed = closestPt.targetSpeed;

    while (brakeDist < brakeLookaheadDist) {
      const nextIdx = (brakeTargetIdx + 1) % this.n;
      brakeDist += Math.hypot(
        this.linePoints[nextIdx].x - this.linePoints[brakeTargetIdx].x,
        this.linePoints[nextIdx].y - this.linePoints[brakeTargetIdx].y
      );
      brakeTargetIdx = nextIdx;
      if (this.linePoints[brakeTargetIdx].targetSpeed < minFutureTargetSpeed) {
        minFutureTargetSpeed = this.linePoints[brakeTargetIdx].targetSpeed;
      }
    }

    const speedDelta = v - minFutureTargetSpeed;
    let throttle = 0;
    let brake = 0;

    if (speedDelta > 0.05) {
      // Over upcoming target speed: threshold braking to apex target
      throttle = 0.0;
      brake = Math.min(1.0, speedDelta / 0.35);
    } else if (speedDelta < -0.15) {
      // Below target speed: 100% full throttle
      throttle = 1.0;
      brake = 0.0;
    } else {
      // At corner speed: maintain balanced momentum
      throttle = Math.max(0.2, 1.0 - (v / car.spec.topSpeed) * 0.3);
      brake = 0.0;
    }

    // 5. Intelligent Boost Triggering
    // Fire boost when pointed straight down a high-speed acceleration corridor
    let boost = false;
    const onLongStraight = targetPt.state === 'accel' &&
      Math.abs(targetPt.curvature) < 0.005 &&
      Math.abs(closestPt.curvature) < 0.005 &&
      v > 11.5;

    if (onLongStraight && Math.abs(headingErr) < 0.06 && car.boost.charge >= 0.98) {
      boost = true;
    }

    return {
      steer: desiredSteer,
      throttle,
      brake,
      boost,
      targetSpeed: Math.round(minFutureTargetSpeed * 3.6 * 10) / 10,
      targetIdx
    };
  }
}
