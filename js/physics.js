/**
 * Race2Win Authoritative Physics Simulation Engine
 * Reconstructed 1:1 from official Race2Win source code (Formula A, Kart, GT Class A)
 */

export const CAR_SPECS = {
  'formula-a': {
    name: 'Formula A',
    topSpeed: 14.6,       // Max speed on asphalt (m/s) -> ~52.5 km/h base
    launchAccel: 6.36,    // Launch acceleration (m/s²)
    accelFadeStart: 0.7,  // Point at which acceleration tapers
    brakeDecel: 8.37,     // Braking deceleration (m/s²)
    maxSteerRate: (120 * Math.PI) / 180, // 120 deg/s max steer rate = 2.094 rad/s
    steerResponse: 0.08,  // Steering lag / responsiveness (s)
    latGrip: 24.0,        // Lateral grip limit (m/s²) ~ 2.45 G!
    mass: 0.7,
    boostSpeedMul: 1.3,   // 30% top speed boost (19.0 m/s ~ 68.4 km/h)
    boostAccelMul: 1.5,   // 50% extra launch acceleration
    boostDuration: 4.8,   // Boost time in seconds
    body: { length: 3.8, width: 1.8 }
  },
  'go-kart': {
    name: 'Go-Kart',
    topSpeed: 14.0,
    launchAccel: 6.1,
    accelFadeStart: 0.7,
    brakeDecel: 7.25,
    maxSteerRate: (112 * Math.PI) / 180,
    steerResponse: 0.08,
    latGrip: 20.0,
    mass: 0.5,
    boostSpeedMul: 1.3,
    boostAccelMul: 1.5,
    boostDuration: 4.5,
    body: { length: 2.2, width: 1.4 }
  },
  'gt-class-a': {
    name: 'GT Class A',
    topSpeed: 13.4,
    launchAccel: 5.7,
    accelFadeStart: 0.7,
    brakeDecel: 6.65,
    maxSteerRate: (105 * Math.PI) / 180,
    steerResponse: 0.08,
    latGrip: 20.5,
    mass: 1.0,
    boostSpeedMul: 1.3,
    boostAccelMul: 1.5,
    boostDuration: 5.0,
    body: { length: 4.4, width: 1.9 }
  }
};

export const SURFACES = {
  asphalt: { grip: 1.0, drag: 0.0, topSpeedMul: 1.0, onTrack: true },
  kerb:    { grip: 1.0, drag: 0.1, topSpeedMul: 1.0, onTrack: true },
  grass:   { grip: 0.55, drag: 6.0, topSpeedMul: 0.45, onTrack: false },
  sand:    { grip: 0.45, drag: 9.0, topSpeedMul: 0.45, onTrack: false }
};

// Physics constants from Race2Win engine
const fU = 1.5;   // Low-speed steer scaling factor
const mU = 0.55;  // Acceleration taper exponent
const gU = 0.8;   // Natural aerodynamic drag
const _U = 2.0;   // High-speed over-cap drag
const vU = 3.0;   // Reverse / braking roll drag
const bU = 20.0;  // Boost recharge duration (20s)
const xU = 1.0;   // Steering scrub penalty coefficient

export class CarPhysics {
  constructor(classId = 'formula-a') {
    this.spec = CAR_SPECS[classId] || CAR_SPECS['formula-a'];
    this.classId = classId;
    this.reset();
  }

  reset(x = 0, y = 0, heading = 0) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.heading = heading;
    this.speed = 0;       // Scalar velocity along heading (m/s)
    this.vx = 0;
    this.vy = 0;
    this.yawRate = 0;     // Angular velocity (rad/s)
    this.steer = 0;       // Current steering filter state [-1, 1]
    this.throttle = 0;    // [0, 1]
    this.brake = 0;       // [0, 1]

    // Boost state
    this.boost = {
      charge: 1.0,        // [0, 1]
      active: false
    };

    // Telemetry & metrics
    this.surface = 'asphalt';
    this.onTrack = true;
    this.scrubPenalty = 0; // Speed bleed from oversteering
    this.lateralG = 0;     // Lateral acceleration in Gs
    this.gripLimit = this.spec.latGrip;
    this.slipAngle = 0;
    this.currentTrackIndex = 0;
    this.lapProgress = 0;
  }

  /**
   * Evaluates surface type and track projection for position (x, y)
   */
  getTrackSurface(x, y, track) {
    if (!track || !track.points || track.points.length === 0) {
      return { surface: 'asphalt', onTrack: true, nearestIndex: 0, distToCenter: 0 };
    }

    let nearestIdx = this.currentTrackIndex;
    let minDistSq = Infinity;
    const n = track.points.length;

    // Search local neighborhood of track points
    const searchWindow = 40;
    for (let offset = -searchWindow; offset <= searchWindow; offset++) {
      const idx = (this.currentTrackIndex + offset + n) % n;
      const p = track.points[idx];
      const dx = x - p.x;
      const dy = y - p.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearestIdx = idx;
      }
    }
    this.currentTrackIndex = nearestIdx;

    const p = track.points[nearestIdx];
    const dx = x - p.x;
    const dy = y - p.y;
    // Cross product to get lateral distance from track centerline
    // nx = -sin(heading), ny = cos(heading)
    const latDist = dx * p.nx + dy * p.ny;
    const absLatDist = Math.abs(latDist);
    const halfW = track.width / 2;
    const kerbW = halfW + 0.6; // Kerbs extend 0.6m beyond track boundary

    let surface = 'asphalt';
    let onTrack = true;

    if (absLatDist <= halfW) {
      surface = 'asphalt';
      onTrack = true;
    } else if (absLatDist <= kerbW) {
      surface = 'kerb';
      onTrack = true;
    } else {
      surface = 'grass';
      onTrack = false;
    }

    return {
      surface,
      onTrack,
      nearestIndex: nearestIdx,
      distToCenter: latDist
    };
  }

  /**
   * 60Hz Authoritative Physics Step (matches eW.integrate)
   */
  step(input, dt, track) {
    // 1. Clamp inputs
    const targetSteer = Math.max(-1, Math.min(1, input.steer || 0));
    const targetThrottle = Math.max(0, Math.min(1, input.throttle || 0));
    const targetBrake = Math.max(0, Math.min(1, input.brake || 0));
    const requestBoost = !!input.boost;

    // 2. Steer responsiveness filter
    const steerK = 1 - Math.exp(-dt / Math.max(0.001, this.spec.steerResponse));
    this.steer += (targetSteer - this.steer) * steerK;
    this.throttle = targetThrottle;
    this.brake = targetBrake;

    // 3. Surface & track boundaries
    const surfInfo = this.getTrackSurface(this.x, this.y, track);
    this.surface = surfInfo.surface;
    this.onTrack = surfInfo.onTrack;
    const surf = SURFACES[this.surface] || SURFACES.asphalt;

    // 4. Boost logic
    if (requestBoost && !this.boost.active && this.boost.charge >= 0.99) {
      this.boost.active = true;
    }
    if (this.boost.active) {
      this.boost.charge -= dt / Math.max(0.1, this.spec.boostDuration);
      if (this.boost.charge <= 0) {
        this.boost.charge = 0;
        this.boost.active = false;
      }
    } else if (this.boost.charge < 1.0) {
      this.boost.charge = Math.min(1.0, this.boost.charge + dt / bU);
    }

    // 5. Effective lateral grip
    const effectiveLatGrip = this.spec.latGrip * surf.grip;
    this.gripLimit = effectiveLatGrip;

    // 6. Top speed calculation
    let maxSpeed = this.spec.topSpeed * surf.topSpeedMul;
    if (this.boost.active) {
      maxSpeed *= this.spec.boostSpeedMul;
    }
    const naturalTop = maxSpeed;

    // 7. Longitudinal acceleration
    let accel = 0;
    let v = this.speed;

    if (v >= 0) {
      // Forward drive
      if (this.throttle > 0 && v < maxSpeed) {
        const speedRatio = v / naturalTop;
        const fade = this.spec.accelFadeStart;
        const taper = speedRatio < fade ? 1.0 : Math.pow(Math.max(0, (1 - speedRatio) / (1 - fade)), mU);
        let driveForce = this.spec.launchAccel * taper * this.throttle;
        if (this.boost.active) driveForce *= this.spec.boostAccelMul;
        accel += driveForce;
      }

      // Braking deceleration
      if (this.brake > 0) {
        accel -= this.spec.brakeDecel * this.brake;
      }

      // Aerodynamic / engine drag
      if (this.throttle < 1) {
        const midSpeed = Math.max(0.5, this.spec.topSpeed * surf.topSpeedMul);
        const norm = v >= 0.5 * midSpeed ? 1.0 : v / (0.5 * midSpeed);
        accel -= (gU + surf.drag * norm * norm) * (1 - this.throttle) * (v > 0.05 ? 1 : 0);
      }

      v += accel * dt;
      if (v > maxSpeed) {
        v = Math.max(maxSpeed, v - (_U + surf.drag) * dt);
      }
      if (v < 0) v = 0;
    } else {
      // Reverse
      if (this.throttle > 0) v += this.spec.launchAccel * dt;
      else if (this.brake > 0) v = Math.max(-2.5, v - vU * dt);
      else v += 2.3 * dt;
      if (v > 0) v = 0;
    }

    // 8. Yaw & Steering Dynamics (Cornering limit & Scrub equation)
    const absV = Math.abs(v);
    let targetYawRate = 0;
    let scrubFactor = 0;

    if (absV > 0.01) {
      // Centripetal limit: max yaw rate omega = latGrip / v
      const gripYawLimit = effectiveLatGrip / absV;
      const effectiveMaxYaw = Math.min(this.spec.maxSteerRate, gripYawLimit);
      const lowSpeedFactor = Math.min(1.0, absV / fU);

      targetYawRate = this.steer * effectiveMaxYaw * lowSpeedFactor * (v < 0 ? -1 : 1);

      // Scrubbing calculation:
      // When driver tries to steer beyond what the tires can grip,
      // excess demand bleeds speed as heat/scrubbing drag!
      const lateralDemand = Math.abs(absV * targetYawRate);
      scrubFactor = Math.min(1.0, lateralDemand / Math.max(1e-6, effectiveLatGrip));
      this.scrubPenalty = scrubFactor;

      if (v > 0) {
        const scrubDrag = xU * scrubFactor * scrubFactor;
        v = Math.max(0, v - scrubDrag * dt);
      }
    }

    this.yawRate = targetYawRate;
    this.heading += this.yawRate * dt;
    this.speed = v;

    // 9. Update position
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = Math.cos(this.heading) * this.speed;
    this.vy = Math.sin(this.heading) * this.speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 10. Compute lateral acceleration (G-forces)
    this.lateralG = (this.speed * this.yawRate) / 9.81;

    return {
      x: this.x,
      y: this.y,
      heading: this.heading,
      speed: this.speed,
      speedKmh: Math.round(this.speed * 3.6 * 10) / 10,
      lateralG: Math.round(this.lateralG * 100) / 100,
      scrub: this.scrubPenalty,
      boostActive: this.boost.active,
      boostCharge: this.boost.charge,
      surface: this.surface,
      onTrack: this.onTrack
    };
  }
}
