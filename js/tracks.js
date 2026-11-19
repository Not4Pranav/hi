/**
 * Official Race2Win Track Data and Geometry Generator
 * Reconstructed from race2win.xyz source code
 */

export const RADIUS_PRESETS = {
  hairpin: 4.2,
  tight: 6.0,
  medium: 9.0,
  fast: 14.0,
  sweeper: 22.0,
  kink: 40.0
};

export const TRACK_DEFINITIONS = {
  'solana-circuit': {
    id: 'solana-circuit',
    name: 'Solana Circuit',
    theme: 'meadow',
    blurb: 'A long start straight, a big round right, a fast back straight to a tight lobe and long rights home.',
    family: 'gp-modern',
    width: 3.4,
    items: [40, 'R74x2:7.5', 24.8, 'R107x2:12', 2.5, 'L70:8.6', 2.5, 'R96x2:8.6', 5, 'L35:8.6~2.6', 40.7, 'R58:6', 17.3, 'L79x2:6', 22, 'R47:8.6~3.5', 12.7, 'R10:8~0.7', 13.9, 'R62:20', 15.5, 'R90x2:8.6']
  },
  'mirrormere': {
    id: 'mirrormere',
    name: 'Mirrormere',
    theme: 'lakeside',
    blurb: 'Lakeside: a shore straight, a hairpin, and a chicane before the line.',
    family: 'gp-modern',
    width: 3.4,
    items: [45, 'R37:8~2.6', 8.7, 'L37:8.6~2.8', 9.3, 'R63x2:16', 2.5, 'R135x2:10', 2.5, 'L94x2:8.6', 2.5, 'R94x2:8.6', 5, 'L40:8.6~3', 25.5, 'R13:24~2.6', 46.8, 'R121:4.5~3', 10.5, 'L98x2:10', 2.5, 'R51:10', 13.2, 'R114x2:8']
  },
  'bluff-point-gp': {
    id: 'bluff-point-gp',
    name: 'Bluff Point GP',
    theme: 'steppe',
    blurb: 'A steep hairpin, a run of esses up the hill, a long ridge straight and a double-apex curve.',
    family: 'gp-modern',
    width: 3.4,
    items: [13.5, 'L128:5.2~3', 13.5, 'R50:8.6', 6, 'L30:8.6', 6, 'R50:8.6', 6, 'L30:8.6', 9, 'R48:22~8', 11, 'L158:5', 65, 'R30:8', 5, 'L30:8', 42, 'L110:6', 14, 'R50:8', 5, 'L50:8', 5, 'R40:8', 4, 'L92x2:9', 3, 'R25:9', 5, 'L25:9', 3]
  },
  'islemont-circuit': {
    id: 'islemont-circuit',
    name: 'Islemont Circuit',
    theme: 'lakeside',
    blurb: 'A narrow island circuit: long straights, a hairpin at one end and chicanes between.',
    family: 'gp-modern',
    width: 3.2,
    items: [40, 'L147:4.5~3', 10.6, 'L42:8.6~3.2', 8.7, 'R70:8.6', 8.1, 'L49:8.6', 13.2, 'L25:8.6~1.9', 8.2, 'R76x2:8.6', 5.3, 'L58:8.6', 48.4, 'L66:8', 2.5, 'R91x2:8', 2.5, 'L88x2:8', 18, 'L33x2:10~2.9', 10.2, 'L90x2:8.6']
  },
  'kestrel-loop': {
    id: 'kestrel-loop',
    name: 'Kestrel Loop',
    theme: 'highland',
    blurb: 'Three straights up and down the hill, joined by tight, busy corners.',
    family: 'club',
    width: 3.0,
    items: [100, 'R161:9~3', 2.5, 'L66:11', 2.5, 'R91x2:11', 2.5, 'L60:11', 20.4, 'R120x2:7', 2.5, 'L76x2:8', 2.5, 'R95x2:8', 2.6, 'L41:8~2.8', 11.5, 'L38:8~2.6', 13.9, 'R63:8', 3.1, 'R112:5~3']
  }
};

/**
 * Parses corner string format like 'R74x2:7.5', 'L147:4.5~3'
 */
export function parseCorner(itemStr) {
  const match = /^([LR])(\d+(?:\.\d+)?)(?:x(\d))?(?::([a-z]+|\d+(?:\.\d+)?))?(?:~(\d+(?:\.\d+)?))?$/.exec(itemStr);
  if (!match) {
    return { dir: 'R', deg: 90, r: 8.6, apexes: 1 };
  }
  const dir = match[1];
  const deg = parseFloat(match[2]);
  const apexes = match[3] ? parseInt(match[3], 10) : 1;
  let r = 8.6;
  if (match[4]) {
    r = RADIUS_PRESETS[match[4]] !== undefined ? RADIUS_PRESETS[match[4]] : parseFloat(match[4]);
  }
  return { dir, deg, r, apexes };
}

/**
 * Generates smooth 2D track path, boundaries, kerbs, and sectors
 */
export function buildTrack(trackDef) {
  const rawPoints = [];
  let currX = 0;
  let currY = 0;
  let currHeading = 0; // In radians, 0 = pointing East (+x)
  let totalDist = 0;

  const trackWidth = trackDef.width || 3.4;
  const halfW = trackWidth / 2;

  // Step 1: Walk the circuit definition
  for (const item of trackDef.items) {
    if (typeof item === 'number') {
      // Straight segment
      const len = item;
      const step = 0.5; // sample every 0.5m
      const steps = Math.max(1, Math.round(len / step));
      const actualStep = len / steps;

      for (let s = 0; s < steps; s++) {
        rawPoints.push({
          x: currX,
          y: currY,
          heading: currHeading,
          dist: totalDist,
          curvature: 0,
          isCorner: false,
          radius: 9999
        });
        currX += Math.cos(currHeading) * actualStep;
        currY += Math.sin(currHeading) * actualStep;
        totalDist += actualStep;
      }
    } else if (typeof item === 'string') {
      // Corner segment
      const corner = parseCorner(item);
      const sign = corner.dir === 'L' ? -1 : 1;
      const totalAngleRad = (corner.deg * Math.PI) / 180;
      const radius = corner.r;
      const arcLen = radius * totalAngleRad;

      const step = 0.5;
      const steps = Math.max(2, Math.round(arcLen / step));
      const dAngle = (totalAngleRad * sign) / steps;
      const dArc = arcLen / steps;

      for (let s = 0; s < steps; s++) {
        rawPoints.push({
          x: currX,
          y: currY,
          heading: currHeading,
          dist: totalDist,
          curvature: (1 / radius) * sign,
          isCorner: true,
          radius: radius,
          dir: corner.dir
        });
        currHeading += dAngle;
        currX += Math.cos(currHeading) * dArc;
        currY += Math.sin(currHeading) * dArc;
        totalDist += dArc;
      }
    }
  }

  // Step 2: Loop closure (adjust endpoints to seamlessly meet the origin)
  const endX = currX;
  const endY = currY;
  const endHeading = currHeading % (Math.PI * 2);
  const targetHeading = Math.round(endHeading / (Math.PI * 2)) * Math.PI * 2;
  const headingError = targetHeading - endHeading;

  const n = rawPoints.length;
  for (let i = 0; i < n; i++) {
    const frac = i / n;
    // Gradually compensate drift so track closes with exact continuity
    rawPoints[i].x -= frac * endX;
    rawPoints[i].y -= frac * endY;
    rawPoints[i].heading += frac * headingError;
  }

  // Recompute headings and smooth tangentials
  for (let i = 0; i < n; i++) {
    const next = rawPoints[(i + 1) % n];
    const prev = rawPoints[(i - 1 + n) % n];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    rawPoints[i].heading = Math.atan2(dy, dx);
  }

  // Step 3: Compute Left / Right boundaries and kerbs
  const points = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < n; i++) {
    const p = rawPoints[i];
    const nx = -Math.sin(p.heading);
    const ny = Math.cos(p.heading);

    const leftX = p.x + nx * halfW;
    const leftY = p.y + ny * halfW;
    const rightX = p.x - nx * halfW;
    const rightY = p.y - ny * halfW;

    // Kerbs on inside of corners
    let kerbLeft = false;
    let kerbRight = false;
    if (p.isCorner) {
      if (p.curvature < 0) kerbLeft = true; // turning left -> inside is left
      if (p.curvature > 0) kerbRight = true; // turning right -> inside is right
    }

    minX = Math.min(minX, leftX, rightX);
    maxX = Math.max(maxX, leftX, rightX);
    minY = Math.min(minY, leftY, rightY);
    maxY = Math.max(maxY, leftY, rightY);

    points.push({
      ...p,
      index: i,
      nx,
      ny,
      leftX,
      leftY,
      rightX,
      rightY,
      kerbLeft,
      kerbRight
    });
  }

  // Sector division (S1, S2, S3)
  const s1Idx = Math.floor(n * 0.33);
  const s2Idx = Math.floor(n * 0.66);

  return {
    def: trackDef,
    width: trackWidth,
    length: totalDist,
    points,
    sectors: [
      { name: 'S1', startIndex: 0, endIndex: s1Idx },
      { name: 'S2', startIndex: s1Idx, endIndex: s2Idx },
      { name: 'S3', startIndex: s2Idx, endIndex: n - 1 }
    ],
    bounds: {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    }
  };
}
