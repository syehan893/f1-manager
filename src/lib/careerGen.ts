import { SUZUKA } from '../data/circuits.ts';
import type { Point } from '../types/index.ts';
import type {
  ComponentCategory,
  ComponentGroup,
  ComponentVariant,
  DesignPhilosophy,
  EngineComponent,
  PerformanceDelta,
  Track,
  TrackCharacteristics,
  TrackLayout,
  TrackProfile,
} from '../types/career.ts';

/* =====================================================================
 * Deterministic career-mode content generation.
 *
 * Imported by BOTH the Express/Mongo backend (to seed the catalog) and
 * the browser, so a save looks identical either way. Everything here is pure: no DOM, no network, no timers. Runtime
 * imports use explicit `.ts` extensions so Node's type-stripping loader
 * can resolve them without a build step.
 * ===================================================================== */

export const USER_TEAM_ID = 'kaizen';
export const STARTING_SEASON = 2026;
export const SEASONAL_CAP_TOKENS = 48;
export const STARTING_DEV_TOKENS = 60;
export const STARTING_BUDGET = 12_500_000;
export const CALENDAR_SIZE = 12;

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const round = (v: number) => Math.round(v);

/* ====================================================================== *
 * Circuit layouts
 * ====================================================================== */

/**
 * Build a closed circuit from radial harmonics. Two sine terms of
 * different frequency create lobes, hairpins and long straights while
 * the radius stays strictly positive — so the shape never crosses
 * itself and always reads as a plausible track.
 */
export function generateTrackLayout(seed: number): TrackLayout {
  const rng = mulberry32(seed);
  const count = 26 + Math.floor(rng() * 8);

  const cx = 500;
  const cy = 320;
  const rx = 350;
  const ry = 205;

  // Radial harmonics carve lobes and hairpins out of the base ellipse.
  const h1 = 0.16 + rng() * 0.18;
  const h2 = 0.10 + rng() * 0.13;
  const h3 = 0.04 + rng() * 0.06;
  const k1 = 2 + Math.floor(rng() * 3);
  const k2 = 3 + Math.floor(rng() * 4);
  const k3 = 6 + Math.floor(rng() * 5);
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const skew = 0.85 + rng() * 0.3;

  // Angular warp: samples bunch through the corners and stretch across the
  // fast sections, which is what gives a layout its straights.
  const warp = 0.22 + rng() * 0.2;
  const warpK = 1 + Math.floor(rng() * 3);
  const warpPhase = rng() * Math.PI * 2;

  const anchors: Point[] = [];
  for (let i = 0; i < count; i++) {
    const base = (i / count) * Math.PI * 2;
    const theta = base + warp * Math.sin(warpK * base + warpPhase);

    const r =
      1 +
      h1 * Math.sin(k1 * theta + p1) +
      h2 * Math.sin(k2 * theta + p2) +
      h3 * Math.sin(k3 * theta + p3) +
      (rng() - 0.5) * 0.02;

    anchors.push({
      x: Math.round(cx + Math.cos(theta) * rx * r * skew),
      y: Math.round(cy + Math.sin(theta) * ry * r),
    });
  }

  return { anchors, viewBox: frameAnchors(anchors, 34) };
}

/** Tight viewBox around a set of anchors, with padding for the ribbon. */
export function frameAnchors(anchors: Point[], padding = 30): TrackLayout['viewBox'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of anchors) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return {
    x: Math.round(minX - padding),
    y: Math.round(minY - padding),
    width: Math.round(maxX - minX + padding * 2),
    height: Math.round(maxY - minY + padding * 2),
  };
}

/* ====================================================================== *
 * Tracks
 * ====================================================================== */

interface TrackSeed {
  id: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  profile: TrackProfile;
  isBaseTrack?: boolean;
}

/** One circuit carried over from the base game, plus eleven new venues. */
const TRACK_SEEDS: TrackSeed[] = [
  { id: 'suzuka', name: 'Suzuka International', city: 'Suzuka', country: 'Japan', countryCode: 'JP', profile: 'BALANCED', isBaseTrack: true },
  { id: 'valcanto', name: 'Autodromo di Valcanto', city: 'Valcanto', country: 'Italy', countryCode: 'IT', profile: 'POWER' },
  { id: 'kallang', name: 'Kallang Bay Street Circuit', city: 'Singapore', country: 'Singapore', countryCode: 'SG', profile: 'STREET' },
  { id: 'meridian', name: 'Cape Meridian Raceway', city: 'Cape Town', country: 'South Africa', countryCode: 'ZA', profile: 'BALANCED' },
  { id: 'nordhavn', name: 'Nordhavn Ring', city: 'Aalborg', country: 'Denmark', countryCode: 'DK', profile: 'HIGH_DOWNFORCE' },
  { id: 'sierraalta', name: 'Sierra Alta International', city: 'Toluca', country: 'Mexico', countryCode: 'MX', profile: 'POWER' },
  { id: 'rannoch', name: 'Loch Rannoch Circuit', city: 'Perthshire', country: 'United Kingdom', countryCode: 'GB', profile: 'HIGH_DOWNFORCE' },
  { id: 'bahiadorada', name: 'Bahia Dorada Street Circuit', city: 'Valparaiso', country: 'Chile', countryCode: 'CL', profile: 'STREET' },
  { id: 'gulfpearl', name: 'Gulf Pearl Circuit', city: 'Lusail', country: 'Qatar', countryCode: 'QA', profile: 'POWER' },
  { id: 'silverpine', name: 'Silverpine Park', city: 'Mont-Tremblant', country: 'Canada', countryCode: 'CA', profile: 'BALANCED' },
  { id: 'kaimai', name: 'Mount Kaimai Raceway', city: 'Tauranga', country: 'New Zealand', countryCode: 'NZ', profile: 'HIGH_DOWNFORCE' },
  { id: 'anatolia', name: 'Anatolia Coastal Circuit', city: 'Antalya', country: 'Turkiye', countryCode: 'TR', profile: 'BALANCED' },
];

/** Characteristic mix implied by a track's profile, with per-track jitter. */
function characteristicsFor(profile: TrackProfile, rng: () => number): TrackCharacteristics {
  const jitter = (base: number, spread = 10) =>
    clamp(round(base + (rng() - 0.5) * spread), 5, 98);

  switch (profile) {
    case 'POWER':
      return {
        downforce: jitter(34),
        power: jitter(88),
        tyreStress: jitter(52),
        braking: jitter(64),
        overtaking: jitter(82),
      };
    case 'HIGH_DOWNFORCE':
      return {
        downforce: jitter(89),
        power: jitter(38),
        tyreStress: jitter(78),
        braking: jitter(56),
        overtaking: jitter(34),
      };
    case 'STREET':
      return {
        downforce: jitter(76),
        power: jitter(48),
        tyreStress: jitter(58),
        braking: jitter(88),
        overtaking: jitter(22),
      };
    default:
      return {
        downforce: jitter(62),
        power: jitter(60),
        tyreStress: jitter(64),
        braking: jitter(62),
        overtaking: jitter(55),
      };
  }
}

const WEATHER_POOL = ['DRY', 'DRY', 'CLOUDY', 'CLOUDY', 'LIGHT_RAIN', 'HEAVY_RAIN'] as const;

export function buildTracks(): Track[] {
  return TRACK_SEEDS.map((seed, index) => {
    const rng = mulberry32(0x5eed + index * 7919);
    const characteristics = characteristicsFor(seed.profile, rng);
    // The base circuit keeps its real dimensions; new venues are generated.
    const lengthKm = seed.isBaseTrack
      ? SUZUKA.lengthKm
      : Number((3.9 + rng() * 2.5).toFixed(3));
    const kind = WEATHER_POOL[Math.floor(rng() * WEATHER_POOL.length)]!;
    const airTempC = round(14 + rng() * 20);

    return {
      id: seed.id,
      name: seed.name,
      city: seed.city,
      country: seed.country,
      countryCode: seed.countryCode,
      lengthKm,
      // Championship distance is a fixed ~305km, as in the real regulations.
      laps: seed.isBaseTrack ? SUZUKA.laps : Math.max(38, Math.round(305 / lengthKm)),
      cornerCount: seed.isBaseTrack ? SUZUKA.corners.length + 7 : 10 + Math.floor(rng() * 12),
      drsZones: seed.isBaseTrack ? SUZUKA.drsZones.length : 1 + Math.floor(rng() * 3),
      lapRecordMs: seed.isBaseTrack
        ? SUZUKA.lapRecordMs
        : round(62_000 + lengthKm * 8_600 + rng() * 4_000),
      profile: seed.profile,
      characteristics,
      forecast: {
        kind,
        airTempC,
        trackTempC: airTempC + round(8 + rng() * 12),
        rainChancePct:
          kind === 'HEAVY_RAIN' ? 70 + round(rng() * 25)
          : kind === 'LIGHT_RAIN' ? 40 + round(rng() * 25)
          : kind === 'CLOUDY' ? 12 + round(rng() * 20)
          : round(rng() * 12),
        windKph: round(3 + rng() * 22),
      },
      layout: seed.isBaseTrack
        ? { anchors: SUZUKA.anchors, viewBox: SUZUKA.viewBox }
        : generateTrackLayout(0xc0ffee + index * 104729),
      isBaseTrack: Boolean(seed.isBaseTrack),
    };
  });
}

/* ====================================================================== *
 * Engineering tech tree
 * ====================================================================== */

interface VariantSeed {
  name: string;
  description: string;
  philosophy: DesignPhilosophy;
  delta: PerformanceDelta;
}

interface ComponentSeed {
  id: string;
  category: ComponentCategory;
  group: ComponentGroup;
  name: string;
  description: string;
  baseRating: number;
  root: VariantSeed;
  branchA: VariantSeed;
  branchB: VariantSeed;
  evoA: VariantSeed;
  evoB: VariantSeed;
}

const d = (
  power: number,
  aero: number,
  reliability: number,
  fuelEfficiency: number,
  driveability: number,
): PerformanceDelta => ({ power, aero, reliability, fuelEfficiency, driveability });

/**
 * Every component follows the same shape: a shared root, then two
 * mutually exclusive philosophies, each with its own evolution. Picking
 * a branch permanently rules out the other for the season.
 */
const COMPONENT_SEEDS: ComponentSeed[] = [
  {
    id: 'ice',
    category: 'ICE',
    group: 'POWER_UNIT',
    name: 'Internal Combustion Engine',
    description: 'The 1.6L V6 core. Sets the ceiling for straight-line performance.',
    baseRating: 71,
    root: { name: 'ICE Spec B', description: 'Revised combustion chamber and updated cam profile.', philosophy: 'BALANCED', delta: d(4, 0, 1, 1, 1) },
    branchA: { name: 'High-Rev ICE', description: 'Raises the rev ceiling for peak power at the cost of engine life.', philosophy: 'HIGH_REV', delta: d(9, 0, -4, -3, 0) },
    branchB: { name: 'Fuel-Efficient ICE', description: 'Lean-burn mapping. Less peak power, far better race-stint economy.', philosophy: 'FUEL_EFFICIENT', delta: d(3, 0, 3, 9, 2) },
    evoA: { name: 'High-Rev ICE Evo', description: 'Lightweight valvetrain pushes the ceiling further still.', philosophy: 'HIGH_REV', delta: d(8, 0, -3, -2, 1) },
    evoB: { name: 'Lean-Burn ICE Evo', description: 'Pre-chamber ignition converts economy into a lighter fuel load.', philosophy: 'FUEL_EFFICIENT', delta: d(4, 0, 4, 7, 2) },
  },
  {
    id: 'turbo',
    category: 'TURBOCHARGER',
    group: 'POWER_UNIT',
    name: 'Turbocharger',
    description: 'Split-turbo layout. Governs throttle response and top-end boost.',
    baseRating: 68,
    root: { name: 'Compressor Revision 2', description: 'Tighter blade clearances and a reworked housing.', philosophy: 'BALANCED', delta: d(3, 0, 2, 1, 2) },
    branchA: { name: 'Large-Plenum Turbo', description: 'Maximum boost on the straights, softer off the apex.', philosophy: 'HIGH_REV', delta: d(8, 0, -2, -2, -3) },
    branchB: { name: 'Quick-Spool Turbo', description: 'Smaller inertia for near-instant response out of slow corners.', philosophy: 'BALANCED', delta: d(4, 0, 1, 2, 7) },
    evoA: { name: 'Variable-Geometry Turbo', description: 'Actuated vanes recover part of the lost response.', philosophy: 'HIGH_REV', delta: d(6, 0, -1, 1, 4) },
    evoB: { name: 'Twin-Scroll Evo', description: 'Separated exhaust pulses sharpen throttle pickup again.', philosophy: 'BALANCED', delta: d(3, 0, 3, 3, 6) },
  },
  {
    id: 'mguk',
    category: 'MGU_K',
    group: 'POWER_UNIT',
    name: 'MGU-K',
    description: 'Kinetic recovery on the driveshaft. 120kW deployment and harvesting.',
    baseRating: 74,
    root: { name: 'MGU-K Stator Update', description: 'Higher-grade windings cut resistive losses.', philosophy: 'BALANCED', delta: d(3, 0, 2, 2, 1) },
    branchA: { name: 'Max-Deployment K', description: 'Aggressive deployment maps. Empties the store faster.', philosophy: 'HIGH_REV', delta: d(9, 0, -3, -5, 1) },
    branchB: { name: 'Harvest-Biased K', description: 'Recovers more under braking to sustain deployment all lap.', philosophy: 'FUEL_EFFICIENT', delta: d(4, 0, 2, 8, 3) },
    evoA: { name: 'Overboost K Evo', description: 'A short overboost window for attacking and defending.', philosophy: 'HIGH_REV', delta: d(7, 0, -2, -3, 2) },
    evoB: { name: 'Regen Cascade Evo', description: 'Multi-stage regen smooths braking and refills the store.', philosophy: 'FUEL_EFFICIENT', delta: d(3, 0, 3, 7, 5) },
  },
  {
    id: 'mguh',
    category: 'MGU_H',
    group: 'POWER_UNIT',
    name: 'MGU-H',
    description: 'Heat recovery off the turbo shaft. Feeds the store and kills lag.',
    baseRating: 66,
    root: { name: 'MGU-H Bearing Pack', description: 'Ceramic bearings raise the safe shaft speed.', philosophy: 'BALANCED', delta: d(2, 0, 4, 2, 2) },
    branchA: { name: 'High-Speed H', description: 'Spins far harder for maximum harvest — thermally marginal.', philosophy: 'HIGH_REV', delta: d(7, 0, -5, 4, 2) },
    branchB: { name: 'Thermal-Stable H', description: 'Conservative shaft speeds that survive a full season.', philosophy: 'FUEL_EFFICIENT', delta: d(3, 0, 7, 3, 2) },
    evoA: { name: 'Ceramic Rotor Evo', description: 'Lighter rotor recovers reliability without losing harvest.', philosophy: 'HIGH_REV', delta: d(6, 0, 2, 3, 2) },
    evoB: { name: 'Cooled Winding Evo', description: 'Oil-cooled windings unlock more harvest safely.', philosophy: 'FUEL_EFFICIENT', delta: d(4, 0, 5, 5, 1) },
  },
  {
    id: 'store',
    category: 'ENERGY_STORE',
    group: 'POWER_UNIT',
    name: 'Energy Store',
    description: 'The battery pack. Capacity versus mass is the central trade.',
    baseRating: 70,
    root: { name: 'Cell Chemistry Rev 2', description: 'Higher energy density at the same pack mass.', philosophy: 'BALANCED', delta: d(2, 0, 3, 3, 1) },
    branchA: { name: 'High-Capacity Pack', description: 'More usable energy per lap, at a weight penalty.', philosophy: 'HIGH_REV', delta: d(7, -3, 0, 4, 0) },
    branchB: { name: 'Lightweight Pack', description: 'Sheds mass for cornering at the cost of deployment length.', philosophy: 'LOW_DRAG', delta: d(2, 5, 1, 2, 4) },
    evoA: { name: 'Dense-Cell Evo', description: 'Denser cells claw back the mass penalty.', philosophy: 'HIGH_REV', delta: d(6, 1, -1, 3, 1) },
    evoB: { name: 'Structural Pack Evo', description: 'The pack becomes a stressed member, freeing chassis mass.', philosophy: 'LOW_DRAG', delta: d(2, 6, 2, 1, 4) },
  },
  {
    id: 'chassis',
    category: 'CHASSIS',
    group: 'AERODYNAMICS',
    name: 'Chassis',
    description: 'Monocoque and suspension kinematics. Sets the platform window.',
    baseRating: 72,
    root: { name: 'Monocoque Rev B', description: 'Stiffer layup improves aero platform control.', philosophy: 'BALANCED', delta: d(0, 4, 2, 0, 2) },
    branchA: { name: 'Stiff-Platform Chassis', description: 'Low ride height, huge peak load — punishing over kerbs.', philosophy: 'STIFF', delta: d(0, 9, -2, 0, -4) },
    branchB: { name: 'Compliant Chassis', description: 'Softer platform that works on bumpy street venues.', philosophy: 'COMPLIANT', delta: d(0, 4, 3, 0, 7) },
    evoA: { name: 'Anti-Dive Geometry Evo', description: 'Revised kinematics restore some kerb tolerance.', philosophy: 'STIFF', delta: d(0, 7, 1, 0, 2) },
    evoB: { name: 'Adaptive Damping Evo', description: 'Wider working window across every circuit type.', philosophy: 'COMPLIANT', delta: d(0, 5, 3, 0, 6) },
  },
  {
    id: 'frontwing',
    category: 'FRONT_WING',
    group: 'AERODYNAMICS',
    name: 'Front Wing',
    description: 'Sets front load and, critically, the outwash feeding the floor.',
    baseRating: 69,
    root: { name: 'Front Wing C2', description: 'Reprofiled endplate and revised flap gurney.', philosophy: 'BALANCED', delta: d(0, 5, 1, 0, 1) },
    branchA: { name: 'High-Load Front Wing', description: 'Maximum front grip for high-downforce venues.', philosophy: 'HIGH_DOWNFORCE', delta: d(-2, 10, 0, -2, 2) },
    branchB: { name: 'Low-Drag Front Wing', description: 'Trimmed for the power circuits and the top-speed traps.', philosophy: 'LOW_DRAG', delta: d(5, 3, 0, 3, -1) },
    evoA: { name: 'Outwash Evo', description: 'Better wake control feeds the floor more cleanly.', philosophy: 'HIGH_DOWNFORCE', delta: d(-1, 9, 1, -1, 3) },
    evoB: { name: 'Slim-Chord Evo', description: 'Less chord, less drag, and a lighter nose assembly.', philosophy: 'LOW_DRAG', delta: d(4, 4, 1, 3, 0) },
  },
  {
    id: 'rearwing',
    category: 'REAR_WING',
    group: 'AERODYNAMICS',
    name: 'Rear Wing',
    description: 'The main drag lever, and the DRS delta on the straights.',
    baseRating: 67,
    root: { name: 'Rear Wing MK3', description: 'New mainplane profile with a cleaner DRS transition.', philosophy: 'BALANCED', delta: d(1, 5, 1, 1, 1) },
    branchA: { name: 'High-Downforce Rear Wing', description: 'Steep mainplane for maximum rear stability.', philosophy: 'HIGH_DOWNFORCE', delta: d(-3, 11, 1, -3, 4) },
    branchB: { name: 'Skinny Rear Wing', description: 'Minimal drag for the lowest-downforce venues.', philosophy: 'LOW_DRAG', delta: d(7, 2, 1, 4, -2) },
    evoA: { name: 'Swan-Neck Evo', description: 'Cleaner underside flow lifts load without adding drag.', philosophy: 'HIGH_DOWNFORCE', delta: d(-1, 9, 1, -1, 3) },
    evoB: { name: 'Mono-Pylon Evo', description: 'Further drag reduction and a stronger DRS effect.', philosophy: 'LOW_DRAG', delta: d(6, 3, 1, 3, 0) },
  },
  {
    id: 'floor',
    category: 'FLOOR',
    group: 'AERODYNAMICS',
    name: 'Floor & Diffuser',
    description: 'Ground effect. The single largest source of downforce on the car.',
    baseRating: 73,
    root: { name: 'Floor Edge Revision B', description: 'Reshaped edge wing and revised fence spacing.', philosophy: 'BALANCED', delta: d(0, 6, 1, 0, 1) },
    branchA: { name: 'Aggressive Venturi Floor', description: 'Enormous peak load, but a narrow ride-height window.', philosophy: 'HIGH_DOWNFORCE', delta: d(0, 13, -3, 0, -4) },
    branchB: { name: 'Stable Underfloor', description: 'Slightly less peak load, far more forgiving in traffic.', philosophy: 'COMPLIANT', delta: d(0, 7, 4, 0, 6) },
    evoA: { name: 'Sealed-Edge Evo', description: 'Better edge sealing recovers stability at low ride height.', philosophy: 'HIGH_DOWNFORCE', delta: d(0, 11, 1, 0, 1) },
    evoB: { name: 'Wide-Window Evo', description: 'Performs across every circuit and every fuel load.', philosophy: 'COMPLIANT', delta: d(0, 8, 4, 0, 5) },
  },
  {
    id: 'brakes',
    category: 'BRAKES',
    group: 'MECHANICAL',
    name: 'Brake System',
    description: 'Carbon discs, calipers and the brake-by-wire blend. Decides where the car can attack.',
    baseRating: 70,
    root: { name: 'Caliper Revision 2', description: 'Stiffer caliper body and a reworked pad compound.', philosophy: 'BALANCED', delta: d(0, 1, 2, 1, 4) },
    branchA: { name: 'Bite-Point Brakes', description: 'Aggressive initial bite for late-braking moves, at the cost of disc life.', philosophy: 'AGGRESSIVE', delta: d(0, 0, -4, 0, 9) },
    branchB: { name: 'Long-Life Brakes', description: 'Thicker discs and gentler ducting. Consistent from lap one to lap sixty.', philosophy: 'ENDURANT', delta: d(0, -1, 8, 2, 3) },
    evoA: { name: 'Bite-Point Evo', description: 'Titanium pistons cut mass exactly where it matters most.', philosophy: 'AGGRESSIVE', delta: d(0, 1, -3, 0, 8) },
    evoB: { name: 'Long-Life Evo', description: 'Improved cooling drums hold temperature through a stint-long defence.', philosophy: 'ENDURANT', delta: d(0, 0, 7, 3, 4) },
  },
  {
    id: 'suspension',
    category: 'SUSPENSION',
    group: 'MECHANICAL',
    name: 'Suspension',
    description: 'Wishbones, dampers and ride-height control. The car relationship with the kerbs.',
    baseRating: 69,
    root: { name: 'Damper Package 2', description: 'Revalved dampers and a stiffer front upright.', philosophy: 'BALANCED', delta: d(0, 2, 2, 0, 4) },
    branchA: { name: 'Stiff Platform', description: 'Locks the ride height for aerodynamic stability. Brutal over kerbs.', philosophy: 'STIFF', delta: d(0, 8, -2, 0, -3) },
    branchB: { name: 'Compliant Platform', description: 'Rides the kerbs and looks after the tyres over a long stint.', philosophy: 'COMPLIANT', delta: d(0, 2, 4, 2, 8) },
    evoA: { name: 'Stiff Platform Evo', description: 'An inerter-assisted heave element pins the floor to the track.', philosophy: 'STIFF', delta: d(0, 8, -1, 0, -2) },
    evoB: { name: 'Compliant Platform Evo', description: 'Third-element tuning turns mechanical grip into tyre life.', philosophy: 'COMPLIANT', delta: d(0, 3, 4, 2, 7) },
  },
  {
    id: 'gearbox',
    category: 'GEARBOX',
    group: 'MECHANICAL',
    name: 'Gearbox',
    description: 'Eight-speed cassette and the differential behind it. Every shift is time.',
    baseRating: 72,
    root: { name: 'Cassette Revision 2', description: 'Reprofiled dogs shave milliseconds off every upshift.', philosophy: 'BALANCED', delta: d(2, 0, 2, 1, 3) },
    branchA: { name: 'Short-Ratio Cassette', description: 'Acceleration out of slow corners, less top end down the straight.', philosophy: 'AGGRESSIVE', delta: d(6, 0, -2, -3, 5) },
    branchB: { name: 'Long-Ratio Cassette', description: 'Taller gearing for terminal speed and a kinder duty cycle.', philosophy: 'ENDURANT', delta: d(5, 0, 5, 4, -1) },
    evoA: { name: 'Short-Ratio Evo', description: 'Lightweight internals cut rotating mass across the whole range.', philosophy: 'AGGRESSIVE', delta: d(5, 0, -1, -2, 6) },
    evoB: { name: 'Long-Ratio Evo', description: 'Reduced-friction bearings turn duty cycle into free horsepower.', philosophy: 'ENDURANT', delta: d(5, 0, 6, 5, 0) },
  },
  {
    id: 'cooling',
    category: 'COOLING',
    group: 'MECHANICAL',
    name: 'Cooling Package',
    description: 'Sidepod inlets, radiators and bodywork exits. Thermal headroom traded against drag.',
    baseRating: 67,
    root: { name: 'Radiator Layout 2', description: 'Repacked cores free a little volume inside the sidepod.', philosophy: 'BALANCED', delta: d(1, 2, 3, 1, 1) },
    branchA: { name: 'Tight-Bodywork Cooling', description: 'Minimal inlets for maximum aerodynamic gain. Runs on the edge.', philosophy: 'LOW_DRAG', delta: d(2, 9, -6, 1, 0) },
    branchB: { name: 'Open-Cooling Package', description: 'Generous inlets buy the thermal margin to push all race.', philosophy: 'ENDURANT', delta: d(0, -3, 11, 2, 2) },
    evoA: { name: 'Tight-Bodywork Evo', description: 'Louvred exits recover some margin without reopening the inlet.', philosophy: 'LOW_DRAG', delta: d(2, 8, -3, 1, 1) },
    evoB: { name: 'Open-Cooling Evo', description: 'Vapour-chamber cores hold temperature at a smaller drag penalty.', philosophy: 'ENDURANT', delta: d(1, -1, 10, 3, 2) },
  },
  {
    id: 'activeaero',
    category: 'ACTIVE_AERO',
    group: 'AERODYNAMICS',
    name: 'Active Aerodynamics',
    description: 'The 2026 movable-wing system. Governs how much of the lap is spent in low drag.',
    baseRating: 66,
    root: { name: 'Actuator Package 2', description: 'Faster, more repeatable transitions between the two modes.', philosophy: 'BALANCED', delta: d(2, 4, 1, 2, 2) },
    branchA: { name: 'Straight-Line Bias', description: 'Holds the low-drag mode longer for outright top speed.', philosophy: 'LOW_DRAG', delta: d(4, 8, -2, 3, -3) },
    branchB: { name: 'Corner-Exit Bias', description: 'Reverts to downforce early, planting the car on exit.', philosophy: 'HIGH_DOWNFORCE', delta: d(0, 10, 1, -2, 6) },
    evoA: { name: 'Straight-Line Evo', description: 'Predictive mapping opens the wing before the driver asks.', philosophy: 'LOW_DRAG', delta: d(4, 7, -1, 3, -1) },
    evoB: { name: 'Corner-Exit Evo', description: 'Load-sensing closure trades a hair of speed for traction.', philosophy: 'HIGH_DOWNFORCE', delta: d(0, 9, 2, -1, 6) },
  },
];

/** Tier pricing. The tree gets meaningfully more expensive with depth. */

/* ---------------------------------------------------------------------
 * Tier-4 apex upgrades.
 *
 * The end of a branch, and the reason committing to a philosophy early
 * is worth the exclusions it costs. These are expensive, slow to build,
 * and unambiguously better than anything on the other side of the tree.
 * ------------------------------------------------------------------- */

const APEX_SEEDS: Record<string, { a: VariantSeed; b: VariantSeed }> = {
  ice: {
    a: { name: 'High-Rev ICE Ultimate', description: 'Race-only calibration wrung out to the last available revolution.', philosophy: 'HIGH_REV', delta: d(11, 0, -5, -3, 1) },
    b: { name: 'Lean-Burn ICE Ultimate', description: 'A fuel load light enough to be worth two tenths on its own.', philosophy: 'FUEL_EFFICIENT', delta: d(6, 0, 5, 11, 3) },
  },
  turbo: {
    a: { name: 'Large-Plenum Ultimate', description: 'Peak boost held right to the limiter, in every gear.', philosophy: 'HIGH_REV', delta: d(10, 0, -3, -2, -2) },
    b: { name: 'Fast-Spool Ultimate', description: 'There is effectively no lag left to remove.', philosophy: 'FUEL_EFFICIENT', delta: d(6, 0, 5, 6, 8) },
  },
  mguk: {
    a: { name: 'Max-Harvest K Ultimate', description: 'Recovers under braking at a rate the regulations barely allow.', philosophy: 'HIGH_REV', delta: d(10, 0, -3, 4, 0) },
    b: { name: 'Deployment K Ultimate', description: 'Full deployment where it wins positions, and nowhere else.', philosophy: 'FUEL_EFFICIENT', delta: d(8, 0, 4, 7, 4) },
  },
  mguh: {
    a: { name: 'Turbine-Coupled Ultimate', description: 'Heat recovery pushed to the edge of thermal viability.', philosophy: 'HIGH_REV', delta: d(11, 0, -5, 5, 0) },
    b: { name: 'Low-Stress H Ultimate', description: 'A unit that will finish every race on the calendar.', philosophy: 'FUEL_EFFICIENT', delta: d(5, 0, 10, 8, 3) },
  },
  store: {
    a: { name: 'High-Density Store Ultimate', description: 'Every usable joule the cell chemistry can be made to hold.', philosophy: 'HIGH_REV', delta: d(10, 0, -4, 3, 1) },
    b: { name: 'Thermal-Stable Store Ultimate', description: 'Full deployment on lap one and lap fifty alike.', philosophy: 'FUEL_EFFICIENT', delta: d(6, 0, 9, 6, 3) },
  },
  chassis: {
    a: { name: 'Stiff Chassis Ultimate', description: 'A torsional figure that makes the aero map mean something.', philosophy: 'STIFF', delta: d(0, 11, 2, 0, -2) },
    b: { name: 'Compliant Chassis Ultimate', description: 'Rides anything a circuit can put underneath it.', philosophy: 'COMPLIANT', delta: d(0, 5, 6, 2, 10) },
  },
  frontwing: {
    a: { name: 'High-Downforce Wing Ultimate', description: 'Outwash that works with the floor rather than against it.', philosophy: 'HIGH_DOWNFORCE', delta: d(0, 13, -1, -3, 4) },
    b: { name: 'Low-Drag Wing Ultimate', description: 'Straight-line efficiency nobody else on the grid has.', philosophy: 'LOW_DRAG', delta: d(4, 7, 2, 6, 0) },
  },
  rearwing: {
    a: { name: 'High-Downforce Rear Ultimate', description: 'Rear-limited circuits stop being rear-limited.', philosophy: 'HIGH_DOWNFORCE', delta: d(0, 12, 0, -3, 5) },
    b: { name: 'Low-Drag Rear Ultimate', description: 'The fastest thing through a speed trap, by some margin.', philosophy: 'LOW_DRAG', delta: d(5, 7, 1, 6, -1) },
  },
  floor: {
    a: { name: 'Peak-Load Floor Ultimate', description: 'Maximum ground effect, and a ride height to match.', philosophy: 'HIGH_DOWNFORCE', delta: d(0, 14, -2, -1, 2) },
    b: { name: 'Stable-Platform Floor Ultimate', description: 'Downforce that does not care what the ride height is doing.', philosophy: 'COMPLIANT', delta: d(0, 9, 5, 1, 8) },
  },
  brakes: {
    a: { name: 'Bite-Point Ultimate', description: 'A braking point nobody following can match.', philosophy: 'AGGRESSIVE', delta: d(0, 1, -4, 0, 12) },
    b: { name: 'Long-Life Ultimate', description: 'Identical pedal feel from lights out to chequered flag.', philosophy: 'ENDURANT', delta: d(0, 0, 11, 4, 6) },
  },
  suspension: {
    a: { name: 'Stiff Platform Ultimate', description: 'The aerodynamic platform is now effectively fixed.', philosophy: 'STIFF', delta: d(0, 11, 0, 0, -1) },
    b: { name: 'Compliant Platform Ultimate', description: 'Tyre life that turns a two-stop into a one-stop.', philosophy: 'COMPLIANT', delta: d(0, 4, 6, 3, 11) },
  },
  gearbox: {
    a: { name: 'Short-Ratio Ultimate', description: 'Traction out of every slow corner on the calendar.', philosophy: 'AGGRESSIVE', delta: d(8, 0, -1, -2, 9) },
    b: { name: 'Long-Ratio Ultimate', description: 'Terminal speed and a gearbox that never worries you.', philosophy: 'ENDURANT', delta: d(7, 0, 9, 7, 1) },
  },
  cooling: {
    a: { name: 'Tight-Bodywork Ultimate', description: 'Bodywork this close to the engine should not work. It does.', philosophy: 'LOW_DRAG', delta: d(3, 11, -2, 2, 1) },
    b: { name: 'Open-Cooling Ultimate', description: 'Thermal margin to run flat out for an entire race.', philosophy: 'ENDURANT', delta: d(2, 0, 14, 4, 3) },
  },
  activeaero: {
    a: { name: 'Straight-Line Ultimate', description: 'Low drag for more of the lap than the rules were meant to allow.', philosophy: 'LOW_DRAG', delta: d(6, 10, -1, 4, 0) },
    b: { name: 'Corner-Exit Ultimate', description: 'Downforce restored before the driver has finished the apex.', philosophy: 'HIGH_DOWNFORCE', delta: d(0, 13, 2, -1, 8) },
  },
};

const TIER_COST: Record<number, { tokens: number; weeks: number }> = {
  1: { tokens: 4, weeks: 3 },
  2: { tokens: 8, weeks: 5 },
  3: { tokens: 13, weeks: 8 },
  4: { tokens: 20, weeks: 12 },
};

export function buildComponents(): EngineComponent[] {
  return COMPONENT_SEEDS.map((seed) => {
    const rootId = `${seed.id}-root`;
    const aId = `${seed.id}-a1`;
    const bId = `${seed.id}-b1`;
    const aEvoId = `${seed.id}-a2`;
    const bEvoId = `${seed.id}-b2`;
    const aApexId = `${seed.id}-a3`;
    const bApexId = `${seed.id}-b3`;
    const apex = APEX_SEEDS[seed.id];

    const make = (
      id: string,
      tier: number,
      variant: VariantSeed,
      requires: string[],
      excludes: string[],
    ): ComponentVariant => ({
      id,
      componentId: seed.id,
      name: variant.name,
      description: variant.description,
      philosophy: variant.philosophy,
      tier,
      tokenCost: TIER_COST[tier]!.tokens,
      weeksRequired: TIER_COST[tier]!.weeks,
      delta: variant.delta,
      requires,
      excludes,
    });

    return {
      id: seed.id,
      category: seed.category,
      group: seed.group,
      name: seed.name,
      description: seed.description,
      baseRating: seed.baseRating,
      variants: [
        make(rootId, 1, seed.root, [], []),
        make(aId, 2, seed.branchA, [rootId], [bId, bEvoId, bApexId]),
        make(bId, 2, seed.branchB, [rootId], [aId, aEvoId, aApexId]),
        make(aEvoId, 3, seed.evoA, [aId], [bId, bEvoId, bApexId]),
        make(bEvoId, 3, seed.evoB, [bId], [aId, aEvoId, aApexId]),
        ...(apex
          ? [
              make(aApexId, 4, apex.a, [aEvoId], [bId, bEvoId, bApexId]),
              make(bApexId, 4, apex.b, [bEvoId], [aId, aEvoId, aApexId]),
            ]
          : []),
      ],
    };
  });
}

export const EMPTY_DELTA: PerformanceDelta = {
  power: 0,
  aero: 0,
  reliability: 0,
  fuelEfficiency: 0,
  driveability: 0,
};

/** Sum every installed variant into the car's running performance profile. */
export function recomputePerformance(
  components: EngineComponent[],
  installedVariantIds: string[],
): PerformanceDelta {
  const installed = new Set(installedVariantIds);
  const total: PerformanceDelta = { ...EMPTY_DELTA };

  for (const component of components) {
    for (const variant of component.variants) {
      if (!installed.has(variant.id)) continue;
      total.power += variant.delta.power;
      total.aero += variant.delta.aero;
      total.reliability += variant.delta.reliability;
      total.fuelEfficiency += variant.delta.fuelEfficiency;
      total.driveability += variant.delta.driveability;
    }
  }

  return total;
}
