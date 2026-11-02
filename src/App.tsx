import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import {
  Building2,
  Navigation,
  Camera,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Compass,
  Crosshair,
  Move,
  Target,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  ArrowUpLeft,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Trash2,
  Calculator,
  Heart,
  Accessibility,
  Footprints,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Layers,
  MapPin,
  Scan,
  Shield,
  UserCheck,
  FileCheck2,
  Clock,
  Sliders,
  GitCompare,
  TrendingDown,
  Split,
  Ban,
  ArrowUpDown,
  Zap,
  Wifi,
  WifiOff,
  Radio,
  Bell,
  Volume2,
  VolumeX,
  Terminal,
  Activity,
  Globe,
  Link2,
} from 'lucide-react';
import {
  DLF_MALL_PRESET,
  SRM_UNIVERSITY_PRESET,
  PRESET_VENUES,
  type SynthesizedVenue,
} from './services/venueSynthesizer';
import {
  SRM_CAMPUS_REAL_IMAGES,
  SRM_LANDMARK_REAL_PHOTOS,
  SRM_CAMPUS_PHOTO_LIST,
  type CampusLandmarkPhoto,
} from './assets/campusImages';

// =============================================================================
// 1. MULTI-LEVEL 3D SPATIAL GRAPH: LEVEL 0 & LEVEL 1
// =============================================================================

export type MobilityProfile = 'wheelchair' | 'crutches' | 'standard';

export interface MallZone3D {
  id: string;
  name: string;
  shortName: string;
  category: 'anchor' | 'store' | 'elevator' | 'escalator' | 'entrance' | 'dining' | 'junction';
  floor: 0 | 1;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  description: string;
  isAccessible?: boolean;
  imageUrl?: string;
}

export interface MallEdgeWithCost {
  id: string;
  from: string;
  to: string;
  dist: number;
  slope: number;
  has_stairs: boolean;
  stairs_penalty: number;
  base_obstacle_severity: number;
  isElevator?: boolean;
  isEscalator?: boolean;
  isRamp?: boolean;
  description?: string;
  waypoints?: [number, number, number][]; // Explicit 3D points ensuring physical path separation!
}

export interface YOLOBox {
  id: string;
  label: string;
  confidence: number;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface Hazard3D {
  id: string;
  locationId: string;
  locationName: string;
  title: string;
  hazardType: 'broken_elevator' | 'broken_escalator' | 'broken_flooring' | 'blocked_corridor' | 'wet_surface';
  floor: 0 | 1;
  x: number;
  y: number;
  z: number;
  severity: 'critical' | 'high' | 'moderate';
  yoloConfidence: number;
  yoloPreVerified: boolean;
  adminVerified: boolean;
  yoloBoxes: YOLOBox[];
  description: string;
  imageUrl: string;
  reportedAt: string;
  reportedBy: string;
  affectsWheelchairs: boolean;
  active: boolean;
}

export interface AdminQueueItem {
  id: string;
  locationId: string;
  locationName: string;
  title: string;
  hazardType: 'broken_elevator' | 'broken_escalator' | 'broken_flooring' | 'blocked_corridor' | 'wet_surface';
  floor: 0 | 1;
  x: number;
  y: number;
  z: number;
  severity: 'critical' | 'high' | 'moderate';
  yoloConfidence: number;
  yoloPreVerified: boolean;
  yoloBoxes: YOLOBox[];
  description: string;
  imageUrl: string;
  submittedAt: string;
  submittedBy: string;
  affectsWheelchairs: boolean;
  primaryDetection: string;
}

export interface TurnStep {
  id: number;
  action: 'start' | 'straight' | 'left' | 'right' | 'elevator' | 'escalator' | 'stairs' | 'arrive';
  instruction: string;
  distanceMeters: number;
  landmark: string;
  nodeId: string;
  progressStart: number;
  progressEnd: number;
  stepCost: number;
  hasStairs: boolean;
  stairsCount: number;
  obstacleSeverity: number;
  isDetour?: boolean;
  detourNote?: string;
}

export interface WebSocketEventLogItem {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  type: string;
  summary: string;
  data?: any;
}

export interface UrgentRerouteAlert {
  id: string;
  blockageLocationName: string;
  blockageTitle: string;
  hazardType: string;
  severity: 'critical' | 'high' | 'moderate';
  previousMeters: number;
  newMeters: number;
  timestamp: number;
  reason: string;
  isNoSafePath: boolean;
}

// -----------------------------------------------------------------------------
// 3D Nodes across TWO FLOORS: Level 0 (Ground) and Level 1 (Upper)
// -----------------------------------------------------------------------------
export const MALL_ZONES_3D: MallZone3D[] = SRM_UNIVERSITY_PRESET.zones;

// -----------------------------------------------------------------------------
// Rich Graph Edges with Explicit 3D Waypoints (Ensures physical path separation!)
// -----------------------------------------------------------------------------
export const MALL_EDGES_RICH: MallEdgeWithCost[] = SRM_UNIVERSITY_PRESET.edges;

// Presets for YOLO verification testing
export const PRESET_HAZARD_TESTS = [
  {
    id: 'test-1',
    title: 'Out of Order Panoramic Lift',
    type: 'broken_elevator',
    locationId: 'srm_elev_ground',
    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?auto=format&fit=crop&w=600&q=80',
    description: 'Panoramic glass elevator doors taped shut with maintenance barrier.',
    isRealHazard: true,
    yoloConfidence: 98.4,
    yoloBoxes: [
      { id: 'b1', label: 'barrier_tape', confidence: 98.4, topPercent: 25, leftPercent: 20, widthPercent: 60, heightPercent: 55 },
      { id: 'b2', label: 'elevator_out_of_service', confidence: 96.1, topPercent: 15, leftPercent: 30, widthPercent: 40, heightPercent: 25 },
    ],
  },
  {
    id: 'test-2',
    title: 'Broken Moving Escalator',
    type: 'broken_escalator',
    locationId: 'srm_escala_ground',
    imageUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=600&q=80',
    description: 'Central escalator steps jammed and blocked with warning cones.',
    isRealHazard: true,
    yoloConfidence: 97.2,
    yoloBoxes: [
      { id: 'b3', label: 'escalator_jammed', confidence: 97.2, topPercent: 30, leftPercent: 22, widthPercent: 55, heightPercent: 50 },
      { id: 'b4', label: 'warning_cone', confidence: 94.6, topPercent: 65, leftPercent: 40, widthPercent: 20, heightPercent: 25 },
    ],
  },
  {
    id: 'test-3',
    title: 'Flooded / Slippery Marble Floor',
    type: 'wet_surface',
    locationId: 'srm_atrium_concourse',
    imageUrl: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=600&q=80',
    description: 'High spill hazard near central quadrangle crossroads.',
    isRealHazard: true,
    yoloConfidence: 95.1,
    yoloBoxes: [
      { id: 'b5', label: 'liquid_spill', confidence: 95.1, topPercent: 40, leftPercent: 25, widthPercent: 50, heightPercent: 40 },
    ],
  },
  {
    id: 'test-4',
    title: 'Clean Main Concourse',
    type: 'clean_storefront',
    locationId: 'srm_central_boulevard',
    imageUrl: 'https://images.unsplash.com/photo-1567449303078-57ad995bd301?auto=format&fit=crop&w=600&q=80',
    description: 'Normal unblocked corridor in Palm Boulevard.',
    isRealHazard: false,
    yoloConfidence: 12.0,
    yoloBoxes: [],
  },
];

export const INITIAL_APPROVED_HAZARDS: Hazard3D[] = [];

export const INITIAL_ADMIN_QUEUE: AdminQueueItem[] = [
  {
    id: 'queue-init-1',
    locationId: 'srm_elev_ground',
    locationName: 'Central Accessible Glass Elevator Bank [L0]',
    title: 'Central Glass Elevator Mechanical Service Outage',
    hazardType: 'broken_elevator',
    floor: 0,
    x: -22,
    y: 9,
    z: 15,
    severity: 'critical',
    yoloConfidence: 98.4,
    yoloPreVerified: true,
    yoloBoxes: [
      { id: 'b1', label: 'barrier_tape', confidence: 98.4, topPercent: 25, leftPercent: 20, widthPercent: 60, heightPercent: 55 },
      { id: 'b2', label: 'elevator_out_of_service', confidence: 96.1, topPercent: 15, leftPercent: 30, widthPercent: 40, heightPercent: 25 },
    ],
    description: 'YOLOv8 flagged out-of-order barrier on central lift. Awaiting Admin confirmation to stream WebSocket reroute.',
    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?auto=format&fit=crop&w=600&q=80',
    submittedAt: '2 mins ago',
    submittedBy: 'Crowdsourced Patron Report',
    affectsWheelchairs: true,
    primaryDetection: 'elevator_out_of_service (98.4% conf)',
  },
];

// -----------------------------------------------------------------------------
// Cost Calculation Formula:
// Cost = (W_dist * Distance) + (W_slope * Slope) + (W_stairs * StairsPenalty) + (W_obs * ObstacleSeverity)
// -----------------------------------------------------------------------------
export interface ProfileWeights {
  W_dist: number;
  W_slope: number;
  W_stairs: number;
  W_obs: number;
  name: string;
  notes: string;
}

export const PROFILE_FORMULA_WEIGHTS: Record<MobilityProfile, ProfileWeights> = {
  wheelchair: {
    W_dist: 1.0,
    W_slope: 12.0,
    W_stairs: Infinity, // Hard block! Infinite penalty for stairs
    W_obs: 80.0,
    name: 'Wheelchair / Electric Chair',
    notes: 'Strict step-free requirement (Stairs = ∞). Only Elevator & gentle ramps.',
  },
  crutches: {
    W_dist: 1.0,
    W_slope: 4.0,
    W_stairs: 150.0, // Highest penalty per step for crutches!
    W_obs: 40.0,
    name: 'Crutches / Walking Cane',
    notes: 'Stairs carry the HIGHEST penalty (150.0/step). Heavy avoidance of physical steps.',
  },
  standard: {
    W_dist: 1.0,
    W_slope: 0.5,
    W_stairs: 2.0,
    W_obs: 15.0,
    name: 'Standard Able-Bodied Pedestrian',
    notes: 'Shortest Euclidean path; readily takes escalators or monumental stairs.',
  },
};

export function calculateEdgeCost(
  edge: MallEdgeWithCost,
  profile: MobilityProfile,
  activeHazards: Hazard3D[]
): { cost: number; isHardBlocked: boolean; blockReason?: string; obstacleCost: number; stairsCost: number } {
  const weights = PROFILE_FORMULA_WEIGHTS[profile];

  // 1. Check if edge has an active hazard (e.g. broken elevator, broken escalator, flooded floor)
  const edgeHazard = activeHazards.find(
    (h) => h.active && (h.locationId === edge.from || h.locationId === edge.to || (edge.isElevator && h.hazardType === 'broken_elevator') || (edge.isEscalator && h.hazardType === 'broken_escalator'))
  );

  // Hard block for Wheelchair on stairs or escalators
  if (profile === 'wheelchair') {
    if (edge.has_stairs || edge.isEscalator) {
      return { cost: Infinity, isHardBlocked: true, blockReason: 'Stairs & escalators are physically impassable for wheelchairs (Cost = ∞)', obstacleCost: 0, stairsCost: Infinity };
    }
    if (edge.isElevator && edgeHazard) {
      return { cost: Infinity, isHardBlocked: true, blockReason: 'Glass elevator is currently out of service (Cost = ∞)', obstacleCost: 0, stairsCost: 0 };
    }
  }

  // Hard block for Crutches on broken elevator if no escalator
  if (profile === 'crutches') {
    if (edge.isElevator && edgeHazard) {
      return { cost: Infinity, isHardBlocked: true, blockReason: 'Glass elevator is broken (Cost = ∞ for crutches)', obstacleCost: 0, stairsCost: 0 };
    }
  }

  // Escalator out of service is hard blocked for escalator edge
  if (edge.isEscalator && edgeHazard) {
    return { cost: Infinity, isHardBlocked: true, blockReason: 'Escalator is jammed/broken (Cost = ∞)', obstacleCost: 0, stairsCost: 0 };
  }

  // Hazard severity on edges
  let obstacleSeverity = edge.base_obstacle_severity;
  if (edgeHazard) {
    if (edgeHazard.severity === 'critical') obstacleSeverity += 100;
    else if (edgeHazard.severity === 'high') obstacleSeverity += 50;
    else obstacleSeverity += 25;
  }

  // Formula application
  const distCost = weights.W_dist * edge.dist;
  const slopeCost = weights.W_slope * (edge.slope / 10.0);
  const stairsCost = edge.has_stairs ? weights.W_stairs * edge.stairs_penalty : 0;
  const obstacleCost = weights.W_obs * obstacleSeverity;

  const totalCost = distCost + slopeCost + stairsCost + obstacleCost;

  return { cost: totalCost, isHardBlocked: totalCost === Infinity, obstacleCost, stairsCost };
}

export interface RouteComputationResult {
  success: boolean;
  errorMessage?: string;
  pathNodeIds: string[];
  totalMeters: number;
  totalCost: number;
  totalStairs: number;
  stairsAvoided: number;
  usedElevator: boolean;
  usedEscalator: boolean;
  usedStairs: boolean;
  turnSteps: TurnStep[];
  points3D: THREE.Vector3[];
  routeEdges: MallEdgeWithCost[];
  divergenceSummary: string;
}

// Dijkstra Path Solver based on formula with True 3D Waypoints
function solveDijkstraPathWithFormula(
  startId: string,
  targetId: string,
  profile: MobilityProfile,
  hazards: Hazard3D[],
  zones: MallZone3D[] = MALL_ZONES_3D,
  edges: MallEdgeWithCost[] = MALL_EDGES_RICH
): RouteComputationResult {
  if (startId === targetId) {
    const node = zones.find((z) => z.id === startId);
    if (!node) {
      return { success: false, errorMessage: 'Location not found', pathNodeIds: [], totalMeters: 0, totalCost: 0, totalStairs: 0, stairsAvoided: 0, usedElevator: false, usedEscalator: false, usedStairs: false, turnSteps: [], points3D: [], routeEdges: [], divergenceSummary: '' };
    }
    return {
      success: true,
      pathNodeIds: [startId],
      totalMeters: 0,
      totalCost: 0,
      totalStairs: 0,
      stairsAvoided: 0,
      usedElevator: false,
      usedEscalator: false,
      usedStairs: false,
      turnSteps: [
        {
          id: 1,
          action: 'arrive',
          instruction: `You are at ${node.name}.`,
          distanceMeters: 0,
          landmark: node.name,
          nodeId: startId,
          progressStart: 0,
          progressEnd: 1,
          stepCost: 0,
          hasStairs: false,
          stairsCount: 0,
          obstacleSeverity: 0,
        },
      ],
      points3D: [new THREE.Vector3(node.x, node.y, node.z), new THREE.Vector3(node.x + 0.1, node.y, node.z + 0.1)],
      routeEdges: [],
      divergenceSummary: 'Origin and destination are identical.',
    };
  }

  const costToNode: Record<string, number> = { [startId]: 0 };
  const prevNode: Record<string, { from: string; edge: MallEdgeWithCost; cost: number }> = {};
  const unvisited = new Set(zones.map((z) => z.id));

  while (unvisited.size > 0) {
    let curr: string | null = null;
    let minCost = Infinity;

    for (const id of unvisited) {
      if ((costToNode[id] ?? Infinity) < minCost) {
        minCost = costToNode[id];
        curr = id;
      }
    }

    if (!curr || minCost === Infinity) break;
    unvisited.delete(curr);

    if (curr === targetId) break;

    // Outgoing edges
    const outgoing = edges.filter((e) => e.from === curr || e.to === curr);
    for (const edge of outgoing) {
      const neighbor = edge.from === curr ? edge.to : edge.from;
      if (!unvisited.has(neighbor)) continue;

      const { cost: edgeCost, isHardBlocked } = calculateEdgeCost(edge, profile, hazards);
      if (isHardBlocked || edgeCost === Infinity) continue;

      const newCost = costToNode[curr] + edgeCost;
      if (newCost < (costToNode[neighbor] ?? Infinity)) {
        costToNode[neighbor] = newCost;
        prevNode[neighbor] = { from: curr, edge, cost: edgeCost };
      }
    }
  }

  if (costToNode[targetId] === undefined || costToNode[targetId] === Infinity) {
    const isElevatorDown = hazards.some((h) => h.active && h.hazardType === 'broken_elevator');
    const isEscalatorDown = hazards.some((h) => h.active && h.hazardType === 'broken_escalator');

    let msg = 'No safe accessible path found for this route.';
    if (profile === 'wheelchair') {
      if (isElevatorDown && isEscalatorDown) {
        msg = '⛔ NO SAFE PATH: Both Elevator and Escalator are blocked! Wheelchair users cannot transit between floors.';
      } else if (isElevatorDown) {
        msg = '⛔ NO SAFE PATH: Glass Elevator is out of service! Escalators and stairs are prohibited for wheelchairs.';
      }
    } else if (profile === 'crutches') {
      if (isElevatorDown && isEscalatorDown) {
        msg = '⛔ NO SAFE PATH: Both Elevator and Escalator are down! Monumental grand staircase is impassable for crutches.';
      }
    }

    return {
      success: false,
      errorMessage: msg,
      pathNodeIds: [],
      totalMeters: 0,
      totalCost: 0,
      totalStairs: 0,
      stairsAvoided: 0,
      usedElevator: false,
      usedEscalator: false,
      usedStairs: false,
      turnSteps: [],
      points3D: [],
      routeEdges: [],
      divergenceSummary: 'No accessible path exists under current hazard blocks.',
    };
  }

  // Reconstruct path
  const pathNodeIds: string[] = [targetId];
  const routeEdges: MallEdgeWithCost[] = [];
  let curr = targetId;

  while (curr !== startId) {
    const info = prevNode[curr];
    if (!info) break;
    routeEdges.unshift(info.edge);
    pathNodeIds.unshift(info.from);
    curr = info.from;
  }

  // Construct true 3D points
  const points3D: THREE.Vector3[] = [];
  let totalMeters = 0;
  let totalStairs = 0;
  let usedElevator = false;
  let usedEscalator = false;
  let usedStairs = false;

  for (let i = 0; i < routeEdges.length; i++) {
    const edge = routeEdges[i];
    const fromId = pathNodeIds[i];
    const isForward = edge.from === fromId;

    totalMeters += edge.dist;
    if (edge.has_stairs) totalStairs += edge.stairs_penalty;
    if (edge.isElevator) usedElevator = true;
    if (edge.isEscalator) usedEscalator = true;
    if (edge.id.includes('stairs')) usedStairs = true;

    if (edge.waypoints && edge.waypoints.length > 0) {
      const orderedPts = isForward ? edge.waypoints : [...edge.waypoints].reverse();
      orderedPts.forEach((pt, ptIdx) => {
        if (points3D.length > 0 && ptIdx === 0) return;
        points3D.push(new THREE.Vector3(pt[0], pt[1], pt[2]));
      });
    } else {
      const nodeA = zones.find((z) => z.id === (isForward ? edge.from : edge.to))!;
      const nodeB = zones.find((z) => z.id === (isForward ? edge.to : edge.from))!;
      if (points3D.length === 0) {
        points3D.push(new THREE.Vector3(nodeA.x, nodeA.y, nodeA.z));
      }
      points3D.push(new THREE.Vector3(nodeB.x, nodeB.y, nodeB.z));
    }
  }

  if (points3D.length < 2) {
    const z1 = zones.find((z) => z.id === startId)!;
    const z2 = zones.find((z) => z.id === targetId)!;
    points3D.push(new THREE.Vector3(z1.x, z1.y, z1.z), new THREE.Vector3(z2.x, z2.y, z2.z));
  }

  const totalCost = Math.round(costToNode[targetId] || 0);
  const stairsAvoided = profile !== 'standard' ? Math.max(0, 32 - totalStairs) : 0;

  // Divergence explanation summary
  let divergenceSummary = '';
  if (profile === 'wheelchair') {
    if (usedElevator) divergenceSummary = 'Takes Panoramic Glass Elevator to Level 1. Zero stairs, 100% step-free.';
    if (routeEdges.some((e) => e.isRamp)) divergenceSummary += ' Uses perimeter 1.5% gentle ramp (70m detour).';
  } else if (profile === 'crutches') {
    if (usedElevator) divergenceSummary = 'Avoids stairs (W_stairs = 150.0/step) by taking Panoramic Glass Elevator.';
    else if (usedEscalator) divergenceSummary = 'Takes central moving escalator (low exertion) to bypass grand stairs.';
  } else {
    if (usedEscalator) divergenceSummary = 'Standard direct path taking central high-speed escalator to Level 1.';
    else if (usedStairs) divergenceSummary = 'Standard direct path taking central grand staircase.';
  }

  // Turn steps
  const turnSteps: TurnStep[] = [];
  let accumulatedDist = 0;

  for (let i = 0; i < pathNodeIds.length; i++) {
    const nodeId = pathNodeIds[i];
    const node = zones.find((z) => z.id === nodeId)!;
    const isStart = i === 0;
    const isEnd = i === pathNodeIds.length - 1;
    const currentEdge = isEnd ? null : routeEdges[i];

    const progressStart = totalMeters > 0 ? accumulatedDist / totalMeters : 0;
    const stepDist = currentEdge ? currentEdge.dist : 0;
    accumulatedDist += stepDist;
    const progressEnd = totalMeters > 0 ? accumulatedDist / totalMeters : 1;

    let action: TurnStep['action'] = 'straight';
    let instruction = `Proceed along concourse to ${node.name}.`;

    if (isStart) {
      action = 'start';
      instruction = `Begin at ${node.name} [Floor ${node.floor}].`;
    } else if (isEnd) {
      action = 'arrive';
      instruction = `Arrived at your destination: ${node.name} [Floor ${node.floor}].`;
    } else if (node.category === 'elevator') {
      action = 'elevator';
      instruction = `Take Panoramic Glass Elevator to Floor ${pathNodeIds[i + 1] ? zones.find((z) => z.id === pathNodeIds[i + 1])?.floor : 1}.`;
    } else if (node.category === 'escalator') {
      action = 'escalator';
      instruction = `Take Central Moving Escalator to Floor 1.`;
    } else if (nodeId.includes('stairs')) {
      action = 'stairs';
      instruction = `Ascend Monumental Grand Staircase.`;
    }

    turnSteps.push({
      id: i + 1,
      action,
      instruction,
      distanceMeters: stepDist,
      landmark: node.name,
      nodeId,
      progressStart,
      progressEnd,
      stepCost: Math.round(currentEdge?.dist || 0),
      hasStairs: currentEdge?.has_stairs || false,
      stairsCount: currentEdge?.stairs_penalty || 0,
      obstacleSeverity: currentEdge?.base_obstacle_severity || 0,
      isDetour: currentEdge?.isRamp || (profile !== 'standard' && currentEdge?.isElevator),
      detourNote: currentEdge?.isRamp ? 'Accessible gentle ramp' : undefined,
    });
  }

  return {
    success: true,
    pathNodeIds,
    totalMeters,
    totalCost,
    totalStairs,
    stairsAvoided,
    usedElevator,
    usedEscalator,
    usedStairs,
    turnSteps,
    points3D,
    routeEdges,
    divergenceSummary: divergenceSummary.trim(),
  };
}

// =============================================================================
// 3. MAIN REACT COMPONENT WITH 3D TWO-FLOOR DLF MALL & WEBSOCKET REROUTING
// =============================================================================

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);

  // Active Approved Hazards (Visible on 3D Map)
  const [hazards, setHazards] = useState<Hazard3D[]>(INITIAL_APPROVED_HAZARDS);

  // Admin Final Verification Queue (Waiting for Admin Approval)
  const [adminQueue, setAdminQueue] = useState<AdminQueueItem[]>(INITIAL_ADMIN_QUEUE);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);

  // Active Venue State (Constructed from YouTube or Selected from Presets)
  const [currentVenue, setCurrentVenue] = useState<SynthesizedVenue>(SRM_UNIVERSITY_PRESET);
  const activeZones = currentVenue.zones;
  const activeEdges = currentVenue.edges;
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState<boolean>(false);
  const [youtubeInputUrl, setYoutubeInputUrl] = useState<string>('https://youtu.be/SXHhJwz9tcw?si=1_IQGCuhxj6ICUl_');
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [synthesisStage, setSynthesisStage] = useState<string>('');
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [availableVenues, setAvailableVenues] = useState<any[]>(Object.values(PRESET_VENUES));
  const [venueDropdownOpen, setVenueDropdownOpen] = useState<boolean>(false);

  // Navigation Endpoints (Level 0 to Level 1 default!)
  const [startZone, setStartZone] = useState<string>('srm_main_gate');
  const [endZone, setEndZone] = useState<string>('srm_central_library'); // Upper level library!
  const [mobilityProfile, setMobilityProfile] = useState<MobilityProfile>('wheelchair');
  const [isDirectionsDrawerOpen, setIsDirectionsDrawerOpen] = useState<boolean>(true);
  const [isFormulaCardOpen, setIsFormulaCardOpen] = useState<boolean>(true);

  // Multi-Disability Route Comparison Overlay
  const [showComparisonOverlay, setShowComparisonOverlay] = useState<boolean>(true);

  // 3D Pointer & Walker Navigation State
  const [showPointer, setShowPointer] = useState<boolean>(true);
  const [navProgress, setNavProgress] = useState<number>(0);
  const [isWalking, setIsWalking] = useState<boolean>(false);
  const [walkSpeed, setWalkSpeed] = useState<number>(1);
  const [cameraFollowMode, setCameraFollowMode] = useState<'orbit' | 'third_person' | 'first_person'>('third_person');
  const [selectedZoneInfo, setSelectedZoneInfo] = useState<MallZone3D | null>(null);
  const [inspectedPhotoLandmark, setInspectedPhotoLandmark] = useState<CampusLandmarkPhoto | null>(null);
  const [firstPersonViewMode, setFirstPersonViewMode] = useState<'real_photo' | '3d_mesh'>('real_photo');

  // WebSocket Live State
  const sessionIdRef = useRef<string>(`sess-${Math.random().toString(36).substring(2, 8)}`);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [wsLatency, setWsLatency] = useState<number>(12);
  const [connectedClientsCount, setConnectedClientsCount] = useState<number>(1);
  const [activeSessionsCount, setActiveSessionsCount] = useState<number>(1);
  const [wsEventLog, setWsEventLog] = useState<WebSocketEventLogItem[]>([]);
  const [isWsModalOpen, setIsWsModalOpen] = useState<boolean>(false);
  const [isAudioAlertEnabled, setIsAudioAlertEnabled] = useState<boolean>(true);
  const [routeFlashActive, setRouteFlashActive] = useState<boolean>(false);
  const [urgentRerouteAlert, setUrgentRerouteAlert] = useState<UrgentRerouteAlert | null>(null);

  // Ref mirrors
  const navProgressRef = useRef<number>(0);
  const isWalkingRef = useRef<boolean>(false);
  const walkSpeedRef = useRef<number>(1);
  const showPointerRef = useRef<boolean>(true);
  const cameraFollowModeRef = useRef<'orbit' | 'third_person' | 'first_person'>('third_person');

  useEffect(() => { isWalkingRef.current = isWalking; }, [isWalking]);
  useEffect(() => { walkSpeedRef.current = walkSpeed; }, [walkSpeed]);
  useEffect(() => { showPointerRef.current = showPointer; }, [showPointer]);
  useEffect(() => { cameraFollowModeRef.current = cameraFollowMode; }, [cameraFollowMode]);

  // First-Person View Advanced Telemetry & Controls
  const firstPersonLookAngle = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const [firstPersonHeading, setFirstPersonHeading] = useState<number>(0);
  const [facingLandmark, setFacingLandmark] = useState<{
    name: string;
    category: string;
    floor: number;
    distance: number;
  } | null>(null);
  const [firstPersonEyeLevel, setFirstPersonEyeLevel] = useState<'profile' | 'sitting' | 'standing'>('profile');
  const frameCounterRef = useRef<number>(0);

  const getCardinalDirection = useCallback((deg: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round((deg % 360) / 45) % 8;
    return directions[index];
  }, []);

  // User Upload & YOLO Pre-Verification Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [selectedTargetLocation, setSelectedTargetLocation] = useState<string>('elev_ground');
  const [selectedPresetType, setSelectedPresetType] = useState<string>('broken_elevator');
  const [isYoloScanning, setIsYoloScanning] = useState<boolean>(false);

  // YOLO Pre-Verification Result
  const [yoloResult, setYoloResult] = useState<{
    status: 'passed' | 'rejected' | 'idle';
    confidence: number;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'moderate';
    boxes: YOLOBox[];
    affectsWheelchairs: boolean;
    primaryClass: string;
  } | null>(null);

  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsTarget = useRef<THREE.Vector3>(new THREE.Vector3(0, 10, 0));
  const cameraAngle = useRef({ theta: Math.PI / 4, phi: Math.PI / 3.2, radius: 190 });
  const isPointerDown = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const dragDistance = useRef(0);

  // 3D Visual Objects
  const hazardGroupRef = useRef<THREE.Group | null>(null);
  const activeRouteTubeRef = useRef<THREE.Mesh | null>(null);
  const activeRouteLineRef = useRef<THREE.Line | null>(null);
  const overlayGroupRef = useRef<THREE.Group | null>(null);
  const avatarMeshRef = useRef<THREE.Group | null>(null);
  const fpLeadPointerRef = useRef<THREE.Group | null>(null);
  const mallGroupRef = useRef<THREE.Group | null>(null);
  const venueMeshGroupRef = useRef<THREE.Group | null>(null);
  const splineCurveRef = useRef<THREE.CatmullRomCurve3 | null>(null);
  const storeMeshesRef = useRef<{ mesh: THREE.Mesh; zone: MallZone3D }[]>([]);
  const startBeaconRef = useRef<THREE.Group | null>(null);
  const endBeaconRef = useRef<THREE.Group | null>(null);

  // Show transient toast
  const triggerToast = (msg: string) => {
    setNotificationToast(msg);
    setTimeout(() => setNotificationToast(null), 4500);
  };

  // Web Audio Alert Chimes
  const playRerouteAudioAlert = useCallback(() => {
    if (!isAudioAlertEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.14); // A5

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio playback might be restricted before user interaction
    }
  }, [isAudioAlertEnabled]);

  const playRestoredAudioAlert = useCallback(() => {
    if (!isAudioAlertEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.25); // G5

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // Audio playback might be restricted
    }
  }, [isAudioAlertEnabled]);

  // WebSocket Event Logger
  const logWsEvent = useCallback((direction: 'inbound' | 'outbound', type: string, summary: string, data?: any) => {
    const item: WebSocketEventLogItem = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      direction,
      type,
      summary,
      data,
    };
    setWsEventLog((prev) => [item, ...prev.slice(0, 49)]);
  }, []);

  // Send message over WebSocket
  const sendWsMessage = useCallback((msg: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      logWsEvent('outbound', msg.type, `Dispatched ${msg.type}`, msg);
      return true;
    }
    return false;
  }, [logWsEvent]);

  // Compute Routes for ALL THREE Mobility Profiles
  const wheelchairRoute = useMemo(() => {
    return solveDijkstraPathWithFormula(startZone, endZone, 'wheelchair', hazards, activeZones, activeEdges);
  }, [startZone, endZone, hazards, activeZones, activeEdges]);

  const crutchesRoute = useMemo(() => {
    return solveDijkstraPathWithFormula(startZone, endZone, 'crutches', hazards, activeZones, activeEdges);
  }, [startZone, endZone, hazards, activeZones, activeEdges]);

  const standardRoute = useMemo(() => {
    return solveDijkstraPathWithFormula(startZone, endZone, 'standard', hazards, activeZones, activeEdges);
  }, [startZone, endZone, hazards, activeZones, activeEdges]);

  // Active Route
  const routeResult = useMemo(() => {
    if (mobilityProfile === 'wheelchair') return wheelchairRoute;
    if (mobilityProfile === 'crutches') return crutchesRoute;
    return standardRoute;
  }, [mobilityProfile, wheelchairRoute, crutchesRoute, standardRoute]);

  // Active step
  const activeStep = useMemo(() => {
    if (!routeResult || !routeResult.success || routeResult.turnSteps.length === 0) return null;
    const step = routeResult.turnSteps.find(
      (s) => navProgress >= s.progressStart && navProgress <= s.progressEnd
    );
    return step || routeResult.turnSteps[routeResult.turnSteps.length - 1];
  }, [routeResult, navProgress]);

  // =============================================================================
  // WEBSOCKET CLIENT LIFECYCLE HOOK
  // =============================================================================
  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: number | null = null;
    let pingInterval: number | null = null;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      setWsStatus('connecting');
      logWsEvent('outbound', 'ws:connect', `Connecting to WebSocket at ${wsUrl}`);

      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (!isMounted) return;
          setWsStatus('connected');
          logWsEvent('inbound', 'ws:open', `🟢 Live WebSocket stream connected!`);

          // Register active navigation session
          const initPayload = {
            type: 'session:init',
            sessionId: sessionIdRef.current,
            device: 'DLF Mall Navigator',
            origin: startZone,
            destination: endZone,
            mobilityProfile,
            currentProgress: navProgressRef.current,
          };
          socket.send(JSON.stringify(initPayload));
          logWsEvent('outbound', 'session:init', `Registered active session #${sessionIdRef.current}`, initPayload);

          // Ping heartbeat every 6 seconds to measure latency
          pingInterval = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
            }
          }, 6000);
        };

        socket.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'session:ack': {
                setConnectedClientsCount(data.connectedClientsCount || 1);
                logWsEvent('inbound', 'session:ack', `Session acknowledged by Mall Server`);
                break;
              }

              case 'pong': {
                const now = Date.now();
                const latency = Math.max(1, now - (data.clientTime || now));
                setWsLatency(latency);
                break;
              }

              case 'stats:update': {
                if (data.connectedClientsCount !== undefined) {
                  setConnectedClientsCount(data.connectedClientsCount);
                }
                if (data.activeSessionsCount !== undefined) {
                  setActiveSessionsCount(data.activeSessionsCount);
                }
                break;
              }

              case 'reroute:urgent': {
                // CORE LIVE WEBSOCKET REROUTE STREAM HANDLER
                const blk = data.blockage;
                logWsEvent('inbound', 'reroute:urgent', `🚨 Live Reroute: Admin confirmed blockage at ${blk.locationName}`, data);

                playRerouteAudioAlert();

                // Add or activate hazard in local state
                setHazards((prev) => {
                  const exists = prev.find((h) => h.locationId === blk.locationId);
                  if (exists) {
                    return prev.map((h) => (h.locationId === blk.locationId ? { ...h, active: true, severity: blk.severity } : h));
                  }
                  const newHaz: Hazard3D = {
                    id: blk.id || `ws-${Date.now()}`,
                    locationId: blk.locationId,
                    locationName: blk.locationName,
                    title: blk.title,
                    hazardType: blk.hazardType,
                    floor: blk.floor ?? 0,
                    x: blk.x ?? (MALL_ZONES_3D.find((z) => z.id === blk.locationId)?.x || 0),
                    y: blk.y ?? (MALL_ZONES_3D.find((z) => z.id === blk.locationId)?.y || 2) + 4,
                    z: blk.z ?? (MALL_ZONES_3D.find((z) => z.id === blk.locationId)?.z || 0),
                    severity: blk.severity,
                    yoloConfidence: 98.6,
                    yoloPreVerified: true,
                    adminVerified: true,
                    yoloBoxes: [],
                    description: blk.description,
                    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?auto=format&fit=crop&w=600&q=80',
                    reportedAt: 'Just now (Live WS Stream)',
                    reportedBy: `${blk.confirmedBy} (WebSocket Stream)`,
                    affectsWheelchairs: blk.affectsWheelchairs ?? true,
                    active: true,
                  };
                  return [newHaz, ...prev];
                });

                // Visual flash on 3D path line
                setRouteFlashActive(true);
                setTimeout(() => setRouteFlashActive(false), 3800);

                const currentDistance = routeResult?.totalMeters || 0;
                setUrgentRerouteAlert({
                  id: `alert-${Date.now()}`,
                  blockageLocationName: blk.locationName,
                  blockageTitle: blk.title,
                  hazardType: blk.hazardType,
                  severity: blk.severity,
                  previousMeters: currentDistance,
                  newMeters: 0,
                  timestamp: Date.now(),
                  reason: data.alertMessage || `Admin confirmed temporary blockage at ${blk.locationName}. Active session dynamically rerouted!`,
                  isNoSafePath: false,
                });
                break;
              }

              case 'reroute:restored': {
                logWsEvent('inbound', 'reroute:restored', `✨ Path Restored: Obstruction at ${data.clearedItem?.locationName || data.clearedLocationId} cleared`, data);
                playRestoredAudioAlert();

                if (data.clearedLocationId || data.clearedBlockageId) {
                  setHazards((prev) => prev.filter((h) => h.id !== data.clearedBlockageId && h.locationId !== data.clearedLocationId));
                }
                setUrgentRerouteAlert(null);
                triggerToast(`✨ Live WebSocket Stream: Obstruction cleared by Administrator. Path restored to optimal route.`);
                break;
              }

              default:
                break;
            }
          } catch (err) {
            console.error('[WS] Parse error:', err);
          }
        };

        socket.onerror = () => {
          if (!isMounted) return;
          setWsStatus('disconnected');
        };

        socket.onclose = () => {
          if (!isMounted) return;
          setWsStatus('disconnected');
          if (pingInterval) clearInterval(pingInterval);
          reconnectTimeout = window.setTimeout(connectWebSocket, 2000);
        };
      } catch (err) {
        setWsStatus('disconnected');
        reconnectTimeout = window.setTimeout(connectWebSocket, 2500);
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [playRerouteAudioAlert, playRestoredAudioAlert, logWsEvent]);

  // Synchronize active session updates to WebSocket server
  useEffect(() => {
    if (wsStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'session:update',
          sessionId: sessionIdRef.current,
          origin: startZone,
          destination: endZone,
          mobilityProfile,
          currentProgress: navProgress,
        })
      );
    }
  }, [startZone, endZone, mobilityProfile, navProgress, wsStatus]);

  // Synchronized pointer progress updater
  const setPointerProgress = useCallback((progressVal: number) => {
    const clamped = Math.max(0, Math.min(1, progressVal));
    navProgressRef.current = clamped;
    setNavProgress(clamped);

    if (!showPointerRef.current) {
      showPointerRef.current = true;
      setShowPointer(true);
      if (avatarMeshRef.current) {
        avatarMeshRef.current.visible = cameraFollowModeRef.current !== 'first_person';
      }
    }

    if (avatarMeshRef.current) {
      avatarMeshRef.current.visible = showPointerRef.current && cameraFollowModeRef.current !== 'first_person';
    }

    if (avatarMeshRef.current && splineCurveRef.current) {
      const p = splineCurveRef.current.getPointAt(clamped);
      avatarMeshRef.current.position.set(p.x, p.y, p.z);
      if (clamped < 0.99) {
        const tangent = splineCurveRef.current.getTangentAt(clamped);
        avatarMeshRef.current.lookAt(p.x + tangent.x, p.y, p.z + tangent.z);
      }
    }

    if (fpLeadPointerRef.current && splineCurveRef.current) {
      const leadProgress = Math.min(1.0, Math.max(0.0, clamped + 0.04));
      const leadPt = splineCurveRef.current.getPointAt(leadProgress);
      fpLeadPointerRef.current.position.set(leadPt.x, leadPt.y, leadPt.z);
      if (leadProgress < 0.999) {
        const tangent = splineCurveRef.current.getTangentAt(leadProgress);
        fpLeadPointerRef.current.lookAt(leadPt.x + tangent.x, leadPt.y, leadPt.z + tangent.z);
      }
      fpLeadPointerRef.current.visible = showPointerRef.current;
    }
  }, []);

  const stepPointer = useCallback((delta: number) => {
    const nextProgress = Math.max(0, Math.min(1, navProgressRef.current + delta));
    setPointerProgress(nextProgress);
    setIsWalking(false);
  }, [setPointerProgress]);

  // Reset pointer on route change
  useEffect(() => {
    setPointerProgress(0);
    setIsWalking(false);
  }, [startZone, endZone, mobilityProfile, setPointerProgress]);

  // Continuous walking hold timers
  const holdIntervalRef = useRef<number | null>(null);
  const startHoldingMove = (direction: 1 | -1) => {
    stepPointer(direction * 0.03);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdIntervalRef.current = window.setInterval(() => {
      stepPointer(direction * 0.02);
    }, 50);
  };

  const stopHoldingMove = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  // Keyboard navigation controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (cameraFollowModeRef.current === 'first_person') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          firstPersonLookAngle.current.yaw += 0.09;
          return;
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          firstPersonLookAngle.current.yaw -= 0.09;
          return;
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          firstPersonLookAngle.current.yaw = 0;
          firstPersonLookAngle.current.pitch = 0;
          triggerToast('🎯 View recentered ahead along navigation path');
          return;
        }
      }

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        stepPointer(cameraFollowModeRef.current === 'first_person' ? 0.02 : 0.04);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        stepPointer(cameraFollowModeRef.current === 'first_person' ? -0.02 : -0.04);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsWalking((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepPointer]);

  // Quick Vertical Transit Hazard Simulators via WebSocket Stream
  const isElevatorDown = hazards.some((h) => h.active && h.hazardType === 'broken_elevator');
  const isEscalatorDown = hazards.some((h) => h.active && h.hazardType === 'broken_escalator');

  const triggerAdminWebSocketBlockage = (
    locationId: string,
    locationName: string,
    title: string,
    hazardType: 'broken_elevator' | 'broken_escalator' | 'broken_flooring' | 'blocked_corridor' | 'wet_surface',
    floor: 0 | 1
  ) => {
    sendWsMessage({
      type: 'admin:confirm_blockage',
      id: `blk-${Date.now()}`,
      locationId,
      locationName,
      title,
      hazardType,
      floor,
      severity: 'critical',
      affectsWheelchairs: true,
      confirmedBy: 'Mall Operations Console',
      description: `Administrator confirmed temporary blockage at ${locationName}. Emergency reroute streamed to active navigation sessions.`,
    });
  };

  const clearAdminWebSocketBlockage = (hazardType?: string, locationId?: string) => {
    sendWsMessage({
      type: 'admin:clear_blockage',
      blockageId: `sim-elev-down`,
      locationId: locationId || (hazardType === 'broken_elevator' ? activeElevatorId : activeEscalatorId),
    });
  };

  // Fetch available venues from server on mount
  useEffect(() => {
    fetch('/api/venues')
      .then((res) => res.json())
      .then((data) => {
        if (data.venues && data.venues.length > 0) {
          setAvailableVenues(data.venues);
        }
      })
      .catch((err) => console.warn('Could not fetch venues:', err));
  }, []);

  // Dynamic vertical transit references for active venue
  const activeElevator = activeZones.find((z) => z.category === 'elevator' && z.floor === 0) || activeZones.find((z) => z.category === 'elevator');
  const activeEscalator = activeZones.find((z) => z.category === 'escalator' && z.floor === 0) || activeZones.find((z) => z.category === 'escalator');
  const activeElevatorId = activeElevator?.id || 'elev_ground';
  const activeElevatorName = activeElevator?.name || 'Panoramic Glass Elevator [L0]';
  const activeEscalatorId = activeEscalator?.id || 'escala_ground';
  const activeEscalatorName = activeEscalator?.name || 'Central Escalator Landing [L0]';

  // Switch to an existing or preset venue
  const handleSelectVenue = async (venueId: string) => {
    try {
      const res = await fetch(`/api/venues/${venueId}`);
      if (!res.ok) throw new Error('Venue not found');
      const data = await res.json();
      if (data.venue) {
        setCurrentVenue(data.venue);
        setStartZone(data.venue.defaultOrigin || data.venue.zones[0]?.id);
        setEndZone(data.venue.defaultDestination || data.venue.zones[data.venue.zones.length - 1]?.id);
        setPointerProgress(0);
        setIsWalking(false);
        triggerToast(`📍 Loaded 3D Map: ${data.venue.venueName}`);
      }
    } catch {
      if (PRESET_VENUES[venueId]) {
        const v = PRESET_VENUES[venueId];
        setCurrentVenue(v);
        setStartZone(v.defaultOrigin || v.zones[0]?.id);
        setEndZone(v.defaultDestination || v.zones[v.zones.length - 1]?.id);
        setPointerProgress(0);
        setIsWalking(false);
        triggerToast(`📍 Loaded 3D Map: ${v.venueName}`);
      }
    }
  };

  // Synthesize new 3D spatial map from YouTube URL
  const handleSynthesizeFromYouTube = async (urlOverride?: string) => {
    const url = (urlOverride || youtubeInputUrl).trim();
    if (!url) {
      setSynthesisError('Please enter a YouTube video URL or select one of the verified tour presets below.');
      return;
    }

    setIsSynthesizing(true);
    setSynthesisError(null);
    setSynthesisStage('Connecting to YouTube stream & fetching tour video telemetry...');

    const t1 = setTimeout(() => {
      setSynthesisStage('Analyzing architectural walkthrough layout & multi-level floor plan with Gemini...');
    }, 1100);

    const t2 = setTimeout(() => {
      setSynthesisStage('Synthesizing 3D store volumes, accessible lifts, and Dijkstra navigation graph...');
    }, 2200);

    try {
      const res = await fetch('/api/generate-venue-from-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: url }),
      });

      clearTimeout(t1);
      clearTimeout(t2);

      const data = await res.json();
      if (!res.ok || !data.success || !data.venue) {
        throw new Error(data.error || 'Failed to synthesize 3D venue map from YouTube tour');
      }

      const newVenue: SynthesizedVenue = data.venue;
      setCurrentVenue(newVenue);
      setStartZone(newVenue.defaultOrigin || newVenue.zones[0]?.id || 'entry');
      setEndZone(newVenue.defaultDestination || newVenue.zones[newVenue.zones.length - 1]?.id || 'dest');
      setPointerProgress(0);
      setIsWalking(false);
      setIsYoutubeModalOpen(false);
      setYoutubeInputUrl('');

      setAvailableVenues((prev) => {
        const exists = prev.find((v) => v.id === newVenue.id);
        return exists ? prev : [newVenue, ...prev];
      });

      triggerToast(`🎉 3D Map Synthesized: ${newVenue.venueName}!`);
    } catch (err: any) {
      clearTimeout(t1);
      clearTimeout(t2);
      console.error('Synthesis error:', err);
      setSynthesisError(err.message || 'Failed to synthesize venue from YouTube. Please try another URL.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const toggleElevatorFault = () => {
    if (isElevatorDown) {
      clearAdminWebSocketBlockage('broken_elevator', activeElevatorId);
      setHazards((prev) => prev.filter((h) => h.hazardType !== 'broken_elevator'));
    } else {
      triggerAdminWebSocketBlockage(activeElevatorId, activeElevatorName, 'Elevator Bank Out Of Service', 'broken_elevator', 0);
    }
  };

  const toggleEscalatorFault = () => {
    if (isEscalatorDown) {
      clearAdminWebSocketBlockage('broken_escalator', activeEscalatorId);
      setHazards((prev) => prev.filter((h) => h.hazardType !== 'broken_escalator'));
    } else {
      triggerAdminWebSocketBlockage(activeEscalatorId, activeEscalatorName, 'Escalator Steps Jammed', 'broken_escalator', 0);
    }
  };

  const toggleBothTransitFault = () => {
    if (isElevatorDown && isEscalatorDown) {
      sendWsMessage({ type: 'admin:clear_blockage', locationId: activeElevatorId });
      sendWsMessage({ type: 'admin:clear_blockage', locationId: activeEscalatorId });
      setHazards((prev) => prev.filter((h) => h.hazardType !== 'broken_elevator' && h.hazardType !== 'broken_escalator'));
    } else {
      triggerAdminWebSocketBlockage(activeElevatorId, activeElevatorName, 'Elevator Bank Out Of Service', 'broken_elevator', 0);
      setTimeout(() => {
        triggerAdminWebSocketBlockage(activeEscalatorId, activeEscalatorName, 'Escalator Steps Jammed', 'broken_escalator', 0);
      }, 250);
    }
  };

  const restoreAllVerticalTransit = () => {
    sendWsMessage({ type: 'admin:clear_blockage', locationId: activeElevatorId });
    sendWsMessage({ type: 'admin:clear_blockage', locationId: activeEscalatorId });
    setHazards((prev) => prev.filter((h) => h.hazardType !== 'broken_elevator' && h.hazardType !== 'broken_escalator'));
    triggerToast('🟢 All vertical transit options restored. Live path recalculated!');
  };

  // Toggle pointer
  const togglePointer = () => {
    setShowPointer((prev) => {
      const next = !prev;
      showPointerRef.current = next;
      if (avatarMeshRef.current) {
        avatarMeshRef.current.visible = next;
      }
      return next;
    });
  };

  // =============================================================================
  // 4. THREE.JS 3D SCENE INITIALIZATION (TWO FLOORS: L0 & L1)
  // =============================================================================
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;

    // Scene - Light architectural daylight ambience
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8fafc');
    scene.fog = new THREE.FogExp2('#f8fafc', 0.0022);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 1, 1200);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Architectural Daylight & Ambient Lighting
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.95);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight('#ffffff', '#e2e8f0', 0.7);
    hemiLight.position.set(0, 150, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight('#fffcf2', 1.35);
    dirLight.position.set(70, 150, 90);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 400;
    dirLight.shadow.camera.left = -160;
    dirLight.shadow.camera.right = 160;
    dirLight.shadow.camera.top = 160;
    dirLight.shadow.camera.bottom = -160;
    scene.add(dirLight);

    const mallGroup = new THREE.Group();
    mallGroupRef.current = mallGroup;
    scene.add(mallGroup);

    // Dynamic Venue Container Group (Reconstructed on venue change)
    const venueMeshGroup = new THREE.Group();
    venueMeshGroupRef.current = venueMeshGroup;
    mallGroup.add(venueMeshGroup);

    // Hazard Marker Group
    const hazardGroup = new THREE.Group();
    hazardGroupRef.current = hazardGroup;
    mallGroup.add(hazardGroup);

    // Multi-Profile Route Comparison Group
    const overlayGroup = new THREE.Group();
    overlayGroupRef.current = overlayGroup;
    mallGroup.add(overlayGroup);

    // Beacons for Start and Destination
    const startGroup = new THREE.Group();
    startBeaconRef.current = startGroup;
    mallGroup.add(startGroup);

    const endGroup = new THREE.Group();
    endBeaconRef.current = endGroup;
    mallGroup.add(endGroup);

    // 3D Animated Avatar / Pointer (Smooth cylinder walker + glowing locator cone)
    const avatarGroup = new THREE.Group();
    avatarMeshRef.current = avatarGroup;

    // Walker body
    const bodyGeo = new THREE.CapsuleGeometry(1.2, 2.2, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#4f46e5',
      roughness: 0.3,
      metalness: 0.5,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 2.2;
    avatarGroup.add(bodyMesh);

    // Walker head
    const headGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.3 });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 4.2;
    avatarGroup.add(headMesh);

    // Floating overhead directional pointer cone
    const pointerGeo = new THREE.ConeGeometry(1.4, 3.2, 16);
    const pointerMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.9,
    });
    const pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
    pointerMesh.rotation.x = Math.PI; // point downward
    pointerMesh.position.y = 7.5;
    avatarGroup.add(pointerMesh);

    // Pulsing ground locator ring
    const groundRingGeo = new THREE.RingGeometry(1.8, 2.4, 32);
    const groundRingMat = new THREE.MeshBasicMaterial({ color: '#6366f1', side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.2;
    avatarGroup.add(groundRing);

    avatarGroup.position.set(0, 2, -92);
    mallGroup.add(avatarGroup);

    // 3D Animated Forward Navigation Lead Pointer (illuminated ground directional guide arrow + pulsing concentric rings + floating rotating gem)
    const leadPointerGroup = new THREE.Group();
    leadPointerGroup.name = 'fp_lead_pointer';

    // Directional chevron arrow flat on ground
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 3.2); // forward tip
    arrowShape.lineTo(1.8, 0);
    arrowShape.lineTo(0.7, 0.4);
    arrowShape.lineTo(0.7, -2.4);
    arrowShape.lineTo(-0.7, -2.4);
    arrowShape.lineTo(-0.7, 0.4);
    arrowShape.lineTo(-1.8, 0);
    arrowShape.closePath();

    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.rotation.x = -Math.PI / 2;
    arrowMesh.position.y = 0.28;
    leadPointerGroup.add(arrowMesh);

    // Glowing locator beacon ring
    const leadRingGeo = new THREE.RingGeometry(2.6, 3.2, 32);
    const leadRingMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const leadRing = new THREE.Mesh(leadRingGeo, leadRingMat);
    leadRing.name = 'fp_pulse_ring';
    leadRing.rotation.x = -Math.PI / 2;
    leadRing.position.y = 0.22;
    leadPointerGroup.add(leadRing);

    // Floating rotating diamond gem
    const gemGeo = new THREE.OctahedronGeometry(1.2, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.8,
    });
    const gemMesh = new THREE.Mesh(gemGeo, gemMat);
    gemMesh.name = 'fp_gem';
    gemMesh.position.y = 2.4;
    leadPointerGroup.add(gemMesh);

    leadPointerGroup.position.set(0, 2, -92);
    mallGroup.add(leadPointerGroup);
    fpLeadPointerRef.current = leadPointerGroup;

    // Animation Loop
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const elapsedTime = now * 0.001;

      // Auto-Walking progression
      if (isWalkingRef.current && splineCurveRef.current) {
        const speedMultiplier = walkSpeedRef.current;
        const distDelta = (delta * 14 * speedMultiplier) / Math.max(10, routeResult?.totalMeters || 100);
        const nextProgress = navProgressRef.current + distDelta;
        if (nextProgress >= 1) {
          navProgressRef.current = 1;
          setNavProgress(1);
          setIsWalking(false);
        } else {
          navProgressRef.current = nextProgress;
          setNavProgress(nextProgress);
        }
      }

      const curProgress = navProgressRef.current;

      // Pointer visibility: ALWAYS hide avatar in first-person mode to prevent camera clipping
      if (avatarMeshRef.current) {
        avatarMeshRef.current.visible = showPointerRef.current && cameraFollowModeRef.current !== 'first_person';
      }

      // Move avatar and update camera along 3D route spline
      if (splineCurveRef.current) {
        const curve = splineCurveRef.current;
        const currentPos = curve.getPointAt(curProgress);

        if (avatarMeshRef.current) {
          avatarMeshRef.current.position.set(currentPos.x, currentPos.y, currentPos.z);
          pointerMesh.position.y = 7.5 + Math.sin(elapsedTime * 4) * 0.4;

          if (curProgress < 0.99) {
            const tangent = curve.getTangentAt(curProgress);
            const lookAtTarget = currentPos.clone().add(tangent);
            avatarMeshRef.current.lookAt(lookAtTarget.x, currentPos.y, lookAtTarget.z);
          }
        }

        // Update animated 3D Lead Pointer
        if (fpLeadPointerRef.current) {
          const leadPointer = fpLeadPointerRef.current;
          const leadProgress = Math.min(1.0, Math.max(0.0, curProgress + 0.04));
          const leadPos = curve.getPointAt(leadProgress);
          leadPointer.position.set(leadPos.x, leadPos.y, leadPos.z);

          if (leadProgress < 0.999) {
            const tangent = curve.getTangentAt(leadProgress);
            const lookTarget = leadPos.clone().add(tangent);
            leadPointer.lookAt(lookTarget.x, leadPos.y, lookTarget.z);
          }

          const gem = leadPointer.getObjectByName('fp_gem');
          if (gem) {
            gem.rotation.y = elapsedTime * 3.0;
            gem.position.y = 2.4 + Math.sin(elapsedTime * 4.5) * 0.35;
          }
          const ring = leadPointer.getObjectByName('fp_pulse_ring');
          if (ring) {
            const s = 1.0 + Math.sin(elapsedTime * 4.0) * 0.25;
            ring.scale.set(s, s, 1);
          }
          leadPointer.visible = showPointerRef.current;
        }

        // Camera Follow Modes
        if (cameraRef.current) {
          const followMode = cameraFollowModeRef.current;

          // Dynamic Field of View: Expands to 74° in First-Person for immersive human vision, returns to 48° in Orbit/3rd-Person
          const targetFov = followMode === 'first_person' ? 74 : 48;
          if (Math.abs(cameraRef.current.fov - targetFov) > 0.1) {
            cameraRef.current.fov += (targetFov - cameraRef.current.fov) * 0.1;
            cameraRef.current.updateProjectionMatrix();
          }

          if (followMode === 'third_person') {
            const tangent = curProgress < 0.98 ? curve.getTangentAt(curProgress) : new THREE.Vector3(0, 0, 1);
            const chaseCamPos = currentPos.clone().sub(tangent.clone().multiplyScalar(35)).add(new THREE.Vector3(0, 24, 0));
            cameraRef.current.position.lerp(chaseCamPos, 0.08);
            controlsTarget.current.lerp(currentPos.clone().add(new THREE.Vector3(0, 3, 0)), 0.08);
            cameraRef.current.lookAt(controlsTarget.current);
          } else if (followMode === 'first_person') {
            // Human and Accessible Eye-Level Simulation
            let eyeHeight = 4.8;
            if (firstPersonEyeLevel === 'sitting' || (firstPersonEyeLevel === 'profile' && mobilityProfile === 'wheelchair')) {
              eyeHeight = 3.2; // Wheelchair seated eye-level
            } else if (firstPersonEyeLevel === 'profile' && mobilityProfile === 'crutches') {
              eyeHeight = 4.2; // Crutches mobility eye-level
            } else {
              eyeHeight = 4.8; // Standing pedestrian eye-level
            }

            // Authentic Locomotion Immersion (Step bobbing for pedestrians / wheel glide vibration for wheelchair)
            let bobY = 0;
            let bobTilt = 0;
            if (isWalkingRef.current) {
              if (mobilityProfile === 'wheelchair' && firstPersonEyeLevel !== 'standing') {
                bobY = Math.sin(elapsedTime * 18) * 0.035; // Fine-grained floor tile wheel vibration
              } else {
                bobY = Math.sin(elapsedTime * 9) * 0.15; // Natural human walking stride bob
                bobTilt = Math.sin(elapsedTime * 4.5) * 0.007; // Natural head sway
              }
            }

            const tangent = curProgress < 0.99 ? curve.getTangentAt(curProgress).normalize() : new THREE.Vector3(0, 0, 1);
            const baseYaw = Math.atan2(tangent.x, tangent.z);
            const totalYaw = baseYaw + firstPersonLookAngle.current.yaw;
            const totalPitch = firstPersonLookAngle.current.pitch;

            // 3D Forward Gaze Vector
            const forwardDir = new THREE.Vector3(
              Math.sin(totalYaw) * Math.cos(totalPitch),
              Math.sin(totalPitch),
              Math.cos(totalYaw) * Math.cos(totalPitch)
            ).normalize();

            const eyePos = currentPos.clone().add(new THREE.Vector3(0, eyeHeight + bobY, 0));
            const lookPos = eyePos.clone().add(forwardDir.clone().multiplyScalar(38));

            cameraRef.current.position.lerp(eyePos, 0.25);
            controlsTarget.current.lerp(lookPos, 0.25);
            cameraRef.current.lookAt(controlsTarget.current);
            if (bobTilt !== 0) {
              cameraRef.current.rotation.z += bobTilt;
            }

            // Periodic raycasting for forward landmark / store identification & compass heading
            frameCounterRef.current = (frameCounterRef.current + 1) % 60;
            if (frameCounterRef.current % 6 === 0) {
              const headingDeg = Math.round(((totalYaw * 180 / Math.PI) % 360 + 360) % 360);
              setFirstPersonHeading(headingDeg);

              if (storeMeshesRef.current.length > 0) {
                const forwardRay = new THREE.Raycaster(eyePos, forwardDir, 0.5, 60);
                const hits = forwardRay.intersectObjects(storeMeshesRef.current.map((s) => s.mesh), false);
                if (hits.length > 0) {
                  const zId = hits[0].object.userData.zoneId;
                  const foundZone = MALL_ZONES_3D.find((z) => z.id === zId);
                  if (foundZone) {
                    setFacingLandmark({
                      name: foundZone.name,
                      category: foundZone.category,
                      floor: foundZone.floor,
                      distance: Math.max(1, Math.round(hits[0].distance)),
                    });
                  }
                } else {
                  setFacingLandmark(null);
                }
              }
            }
          } else {
            // Free Orbit
            const { theta, phi, radius } = cameraAngle.current;
            const targetCamX = controlsTarget.current.x + radius * Math.sin(phi) * Math.sin(theta);
            const targetCamY = controlsTarget.current.y + radius * Math.cos(phi);
            const targetCamZ = controlsTarget.current.z + radius * Math.sin(phi) * Math.cos(theta);
            cameraRef.current.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.06);
            cameraRef.current.lookAt(controlsTarget.current);
          }
        }
      }

      // Animate 3D Hazard Beacons
      if (hazardGroupRef.current) {
        hazardGroupRef.current.children.forEach((child, idx) => {
          if (child.name === 'hazard_beacon') {
            child.position.y = (child.userData.baseY || 10) + Math.sin(elapsedTime * 3 + idx) * 0.8;
            child.rotation.y += 0.025;
          }
          if (child.name === 'hazard_pulse_ring') {
            const scale = 1 + (Math.sin(elapsedTime * 4 + idx) + 1) * 0.25;
            child.scale.set(scale, scale, scale);
          }
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update 3D Active Route Line AND Multi-Profile Comparison Overlay
  useEffect(() => {
    if (!mallGroupRef.current) return;
    const mallGroup = mallGroupRef.current;

    // Clean up old active route
    if (activeRouteLineRef.current) {
      mallGroup.remove(activeRouteLineRef.current);
      activeRouteLineRef.current.geometry.dispose();
      activeRouteLineRef.current = null;
    }
    if (activeRouteTubeRef.current) {
      mallGroup.remove(activeRouteTubeRef.current);
      activeRouteTubeRef.current.geometry.dispose();
      activeRouteTubeRef.current = null;
    }

    // Clean up old overlay lines
    if (overlayGroupRef.current) {
      while (overlayGroupRef.current.children.length > 0) {
        const obj = overlayGroupRef.current.children[0] as THREE.Mesh;
        overlayGroupRef.current.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
      }
    }

    if (!routeResult || !routeResult.success || routeResult.points3D.length < 2) {
      splineCurveRef.current = null;
      return;
    }

    // Spline curve for active navigation
    const curve = new THREE.CatmullRomCurve3(routeResult.points3D, false, 'catmullrom', 0.2);
    splineCurveRef.current = curve;

    const profileColor =
      mobilityProfile === 'wheelchair' ? '#2563eb' : mobilityProfile === 'crutches' ? '#059669' : '#d97706';

    // 3D Tube for Active Path (Crisp high-contrast on light architectural floor)
    const tubeGeo = new THREE.TubeGeometry(curve, Math.max(20, routeResult.points3D.length * 12), 0.9, 10, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: routeFlashActive ? '#eab308' : profileColor,
      roughness: 0.25,
      metalness: 0.2,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.position.y = 0.25; // elevated cleanly above floor
    mallGroup.add(tubeMesh);
    activeRouteTubeRef.current = tubeMesh;

    // Multi-Profile Route Comparison Overlay
    if (showComparisonOverlay && overlayGroupRef.current) {
      const renderComparisonPath = (res: RouteComputationResult, colorHex: string, yOffset: number) => {
        if (!res.success || res.points3D.length < 2) return;
        const elevatedPts = res.points3D.map((pt) => new THREE.Vector3(pt.x, pt.y + yOffset, pt.z));
        const subCurve = new THREE.CatmullRomCurve3(elevatedPts, false, 'catmullrom', 0.2);
        const subTubeGeo = new THREE.TubeGeometry(subCurve, Math.max(16, res.points3D.length * 8), 0.35, 6, false);
        const subTubeMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.65,
        });
        const subMesh = new THREE.Mesh(subTubeGeo, subTubeMat);
        overlayGroupRef.current!.add(subMesh);
      };

      if (mobilityProfile !== 'wheelchair' && wheelchairRoute.success) {
        renderComparisonPath(wheelchairRoute, '#06b6d4', 0.6); // Cyan for wheelchair
      }
      if (mobilityProfile !== 'crutches' && crutchesRoute.success) {
        renderComparisonPath(crutchesRoute, '#10b981', 0.9); // Green for crutches
      }
      if (mobilityProfile !== 'standard' && standardRoute.success) {
        renderComparisonPath(standardRoute, '#f59e0b', 1.2); // Amber for standard
      }
    }

    // Start Beacon
    if (startBeaconRef.current && routeResult.points3D.length > 0) {
      const startGroup = startBeaconRef.current;
      while (startGroup.children.length > 0) startGroup.remove(startGroup.children[0]);
      const firstPt = routeResult.points3D[0];

      const startRing = new THREE.RingGeometry(2.5, 3.5, 32);
      const startRingMat = new THREE.MeshBasicMaterial({ color: '#22c55e', side: THREE.DoubleSide });
      const ringM = new THREE.Mesh(startRing, startRingMat);
      ringM.rotation.x = -Math.PI / 2;
      ringM.position.set(firstPt.x, firstPt.y + 0.3, firstPt.z);
      startGroup.add(ringM);
    }

    // Destination Ground Target (Clean static floor ring, NO red flag)
    if (endBeaconRef.current && routeResult.points3D.length > 0) {
      const endGroup = endBeaconRef.current;
      while (endGroup.children.length > 0) endGroup.remove(endGroup.children[0]);
      const lastPt = routeResult.points3D[routeResult.points3D.length - 1];

      const endRing = new THREE.RingGeometry(1.8, 2.6, 32);
      const endRingMat = new THREE.MeshBasicMaterial({ color: '#10b981', side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const ringM = new THREE.Mesh(endRing, endRingMat);
      ringM.rotation.x = -Math.PI / 2;
      ringM.position.set(lastPt.x, lastPt.y + 0.2, lastPt.z);
      endGroup.add(ringM);

      const centerDot = new THREE.CircleGeometry(0.8, 24);
      const centerDotMat = new THREE.MeshBasicMaterial({ color: '#10b981', side: THREE.DoubleSide });
      const dotM = new THREE.Mesh(centerDot, centerDotMat);
      dotM.rotation.x = -Math.PI / 2;
      dotM.position.set(lastPt.x, lastPt.y + 0.21, lastPt.z);
      endGroup.add(dotM);
    }

    // Position pointer and lead guidance arrow
    if (avatarMeshRef.current && splineCurveRef.current && showPointerRef.current) {
      const p = splineCurveRef.current.getPointAt(navProgressRef.current);
      avatarMeshRef.current.position.set(p.x, p.y, p.z);
    }
    if (fpLeadPointerRef.current && splineCurveRef.current && showPointerRef.current) {
      const leadProgress = Math.min(1.0, Math.max(0.0, navProgressRef.current + 0.04));
      const leadPt = splineCurveRef.current.getPointAt(leadProgress);
      fpLeadPointerRef.current.position.set(leadPt.x, leadPt.y, leadPt.z);
      if (leadProgress < 0.999) {
        const tangent = splineCurveRef.current.getTangentAt(leadProgress);
        fpLeadPointerRef.current.lookAt(leadPt.x + tangent.x, leadPt.y, leadPt.z + tangent.z);
      }
      fpLeadPointerRef.current.visible = true;
    }
  }, [routeResult, wheelchairRoute, crutchesRoute, standardRoute, mobilityProfile, showComparisonOverlay, routeFlashActive]);

  // Update 3D Hazard Markers
  useEffect(() => {
    if (!hazardGroupRef.current) return;
    const group = hazardGroupRef.current;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    hazards
      .filter((h) => h.active)
      .forEach((haz) => {
        const beaconGeo = new THREE.OctahedronGeometry(2.6, 0);
        const beaconMat = new THREE.MeshStandardMaterial({
          color: haz.severity === 'critical' ? '#ef4444' : '#f59e0b',
          emissive: haz.severity === 'critical' ? '#dc2626' : '#d97706',
          emissiveIntensity: 0.8,
        });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.name = 'hazard_beacon';
        beaconMesh.userData = { hazardId: haz.id, baseY: haz.y + 5 };
        beaconMesh.position.set(haz.x, haz.y + 5, haz.z);
        group.add(beaconMesh);

        const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, haz.y + 5, 8);
        const beamMat = new THREE.MeshBasicMaterial({ color: haz.severity === 'critical' ? '#ef4444' : '#f59e0b', transparent: true, opacity: 0.5 });
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.set(haz.x, (haz.y + 5) / 2, haz.z);
        group.add(beamMesh);

        const ringGeo = new THREE.RingGeometry(2.5, 3.2, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: haz.severity === 'critical' ? '#ef4444' : '#f59e0b', side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.name = 'hazard_pulse_ring';
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(haz.x, haz.y + 0.3, haz.z);
        group.add(ringMesh);
      });
  }, [hazards]);

  // Reconstruct 3D Venue Meshes (Floors, Transit Hubs, Stores) whenever currentVenue changes
  useEffect(() => {
    if (!venueMeshGroupRef.current) return;
    const group = venueMeshGroupRef.current;

    // Clear previous venue geometry
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    // Locate vertical transit coordinates in active venue
    const elevL0 = currentVenue.zones.find((z) => z.category === 'elevator' && z.floor === 0) || currentVenue.zones.find((z) => z.category === 'elevator');
    const escaL0 = currentVenue.zones.find((z) => z.category === 'escalator' && z.floor === 0) || currentVenue.zones.find((z) => z.category === 'escalator');
    const stairsL0 = currentVenue.zones.find((z) => (z.id.includes('stairs') || z.shortName.toLowerCase().includes('stairs')) && z.floor === 0);

    const liftX = elevL0 ? elevL0.x : -22;
    const liftZ = elevL0 ? elevL0.z : 15;
    const escaX = escaL0 ? escaL0.x : 22;
    const escaZ = escaL0 ? escaL0.z : 15;
    const stairsX = stairsL0 ? stairsL0.x : 0;
    const stairsZ = stairsL0 ? stairsL0.z : 25;

    // 1. Level 0 Floor Plate & Architectural Terrazzo
    const floorL0Geo = new THREE.BoxGeometry(240, 2, 240);
    const floorL0Mat = new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.45,
      metalness: 0.08,
    });
    const floorL0Mesh = new THREE.Mesh(floorL0Geo, floorL0Mat);
    floorL0Mesh.position.set(0, -1, 0);
    floorL0Mesh.receiveShadow = true;
    group.add(floorL0Mesh);

    // Landscaped collegiate green lawns (SRM campus gardens)
    const lawnMat = new THREE.MeshStandardMaterial({ color: '#dcfce7', roughness: 0.85 });
    const lawnL = new THREE.Mesh(new THREE.BoxGeometry(64, 0.1, 48), lawnMat);
    lawnL.position.set(-52, 0.06, -60);
    lawnL.receiveShadow = true;
    group.add(lawnL);
    const lawnR = new THREE.Mesh(new THREE.BoxGeometry(64, 0.1, 48), lawnMat);
    lawnR.position.set(52, 0.06, -60);
    lawnR.receiveShadow = true;
    group.add(lawnR);

    // Clean Architectural Pavement Grid
    const gridL0 = new THREE.GridHelper(240, 24, '#94a3b8', '#cbd5e1');
    gridL0.position.set(0, 0.08, 0);
    group.add(gridL0);

    // 2. Level 1 Floor Plate (Upper Architectural Gallery Ring with open central atrium)
    const floorL1Shape = new THREE.Shape();
    floorL1Shape.moveTo(-100, -100);
    floorL1Shape.lineTo(100, -100);
    floorL1Shape.lineTo(100, 100);
    floorL1Shape.lineTo(-100, 100);
    floorL1Shape.lineTo(-100, -100);

    const atriumHole = new THREE.Path();
    atriumHole.absarc(0, 0, 28, 0, Math.PI * 2, true);
    floorL1Shape.holes.push(atriumHole);

    const extrudeSettings = { depth: 1.5, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.3, bevelThickness: 0.3 };
    const floorL1Geo = new THREE.ExtrudeGeometry(floorL1Shape, extrudeSettings);
    const floorL1Mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.3,
      metalness: 0.05,
      transparent: true,
      opacity: 0.94,
    });
    const floorL1Mesh = new THREE.Mesh(floorL1Geo, floorL1Mat);
    floorL1Mesh.rotation.x = Math.PI / 2;
    floorL1Mesh.position.set(0, 18, 0);
    floorL1Mesh.receiveShadow = true;
    group.add(floorL1Mesh);

    // Tempered Glass Balustrade railing around upper central opening
    const railingGeo = new THREE.CylinderGeometry(28, 28, 2.5, 48, 1, true);
    const railingMat = new THREE.MeshPhysicalMaterial({
      color: '#93c5fd',
      transparent: true,
      opacity: 0.35,
      roughness: 0.05,
      transmission: 0.88,
    });
    const railingMesh = new THREE.Mesh(railingGeo, railingMat);
    railingMesh.position.set(0, 19.5, 0);
    group.add(railingMesh);

    const gridL1 = new THREE.GridHelper(200, 20, '#64748b', '#cbd5e1');
    gridL1.position.set(0, 18.05, 0);
    group.add(gridL1);

    // Support Architectural Columns (Brushed aluminum / polished concrete)
    const colCoords = [
      [-40, -40], [40, -40], [-40, 40], [40, 40],
      [-75, 0], [75, 0], [0, -75], [0, 75],
    ];
    colCoords.forEach(([cx, cz]) => {
      const colGeo = new THREE.CylinderGeometry(1.6, 1.8, 18, 16);
      const colMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4, metalness: 0.2 });
      const colMesh = new THREE.Mesh(colGeo, colMat);
      colMesh.position.set(cx, 9, cz);
      colMesh.castShadow = true;
      colMesh.receiveShadow = true;
      group.add(colMesh);
    });

    // 3. Panoramic Glass Elevator Shaft (Clean transparent architectural glass)
    const liftShaftGeo = new THREE.BoxGeometry(10, 26, 10);
    const liftShaftMat = new THREE.MeshPhysicalMaterial({
      color: '#93c5fd',
      transparent: true,
      opacity: 0.3,
      roughness: 0.08,
      transmission: 0.9,
    });
    const liftShaftMesh = new THREE.Mesh(liftShaftGeo, liftShaftMat);
    liftShaftMesh.position.set(liftX, 13, liftZ);
    group.add(liftShaftMesh);

    const liftCabGeo = new THREE.BoxGeometry(8, 6, 8);
    const liftCabMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', metalness: 0.7, roughness: 0.2 });
    const liftCabMesh = new THREE.Mesh(liftCabGeo, liftCabMat);
    liftCabMesh.position.set(liftX, 5, liftZ);
    group.add(liftCabMesh);

    const cableGeo = new THREE.CylinderGeometry(0.1, 0.1, 26, 8);
    const cableMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 });
    const cableMesh = new THREE.Mesh(cableGeo, cableMat);
    cableMesh.position.set(liftX, 13, liftZ);
    group.add(cableMesh);

    // 4. Escalator Trusses & Steps
    const escaTrussGeo = new THREE.BoxGeometry(6, 2, 28);
    const escaTrussMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.5, roughness: 0.3 });
    const escaTrussMesh = new THREE.Mesh(escaTrussGeo, escaTrussMat);
    escaTrussMesh.rotation.x = Math.atan2(18, 24);
    escaTrussMesh.position.set(escaX, 9, escaZ - 7);
    group.add(escaTrussMesh);

    const handrailGeo = new THREE.BoxGeometry(0.4, 1.2, 28);
    const handrailMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.3 });
    const handrailL = new THREE.Mesh(handrailGeo, handrailMat);
    handrailL.rotation.x = Math.atan2(18, 24);
    handrailL.position.set(escaX - 2.8, 10.2, escaZ - 7);
    group.add(handrailL);
    const handrailR = new THREE.Mesh(handrailGeo, handrailMat);
    handrailR.rotation.x = Math.atan2(18, 24);
    handrailR.position.set(escaX + 2.8, 10.2, escaZ - 7);
    group.add(handrailR);

    // 5. Monumental Grand Staircase Steps
    const numStairs = 18;
    for (let s = 0; s < numStairs; s++) {
      const stepGeo = new THREE.BoxGeometry(12, 1, 1.6);
      const stepMat = new THREE.MeshStandardMaterial({ color: s % 2 === 0 ? '#e2e8f0' : '#cbd5e1' });
      const stepMesh = new THREE.Mesh(stepGeo, stepMat);
      stepMesh.position.set(stairsX, s * 1.0 + 0.5, stairsZ - s * 1.1);
      stepMesh.castShadow = true;
      group.add(stepMesh);
    }

    // 6. Render Architectural Building Volumes & REAL-WORLD CAMPUS PHOTO BILLBOARDS
    const newStoreMeshes: { mesh: THREE.Mesh; zone: MallZone3D }[] = [];
    const texLoader = new THREE.TextureLoader();

    currentVenue.zones.forEach((zone) => {
      const geo = new THREE.BoxGeometry(zone.width, zone.height, zone.depth);
      const isConcourse = zone.category === 'junction' || zone.category === 'entrance';
      
      // Crisp white / soft stone architectural masonry
      const mat = new THREE.MeshStandardMaterial({
        color: isConcourse ? '#f8fafc' : '#ffffff',
        roughness: 0.35,
        metalness: 0.08,
        transparent: true,
        opacity: isConcourse ? 0.5 : 0.92,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(zone.x, zone.y + zone.height / 2, zone.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { zoneId: zone.id, zoneName: zone.name, floor: zone.floor };
      group.add(mesh);
      newStoreMeshes.push({ mesh, zone });

      // Clean architectural edge outlines
      const edgesGeo = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.5 })
      );
      mesh.add(line);

      // REAL-WORLD CAMPUS PHOTOGRAPHIC BILLBOARD
      const photoUrl = zone.imageUrl || SRM_LANDMARK_REAL_PHOTOS[zone.id]?.imageUrl;
      if (photoUrl && !isConcourse) {
        try {
          const tex = texLoader.load(photoUrl);
          tex.colorSpace = THREE.SRGBColorSpace;

          const bbWidth = Math.max(16, zone.width * 0.78);
          const bbHeight = bbWidth * 0.5625; // 16:9 ratio

          // White architectural backplate frame with subtle shadow
          const frameGeo = new THREE.BoxGeometry(bbWidth + 0.6, bbHeight + 0.6, 0.4);
          const frameMat = new THREE.MeshStandardMaterial({
            color: '#ffffff',
            roughness: 0.25,
            metalness: 0.05,
          });
          const frameMesh = new THREE.Mesh(frameGeo, frameMat);
          frameMesh.position.set(zone.x, zone.y + zone.height + bbHeight / 2 + 1.2, zone.z);
          frameMesh.castShadow = true;
          group.add(frameMesh);

          // Front-facing photo plane
          const photoGeo = new THREE.PlaneGeometry(bbWidth, bbHeight);
          const photoMat = new THREE.MeshBasicMaterial({
            map: tex,
            side: THREE.DoubleSide,
          });
          const photoMesh = new THREE.Mesh(photoGeo, photoMat);
          photoMesh.position.set(zone.x, zone.y + zone.height + bbHeight / 2 + 1.2, zone.z + 0.23);
          group.add(photoMesh);

          // Back-facing photo plane (visible from behind too!)
          const photoBackMesh = new THREE.Mesh(photoGeo, photoMat);
          photoBackMesh.position.set(zone.x, zone.y + zone.height + bbHeight / 2 + 1.2, zone.z - 0.23);
          photoBackMesh.rotation.y = Math.PI;
          group.add(photoBackMesh);

          // Support aluminum mounting posts
          const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8);
          const poleMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 });
          const p1 = new THREE.Mesh(poleGeo, poleMat);
          p1.position.set(zone.x - bbWidth * 0.35, zone.y + zone.height + 0.6, zone.z);
          group.add(p1);
          const p2 = new THREE.Mesh(poleGeo, poleMat);
          p2.position.set(zone.x + bbWidth * 0.35, zone.y + zone.height + 0.6, zone.z);
          group.add(p2);
        } catch {
          // Fallback gracefully if texture loading encounters an issue
        }
      }
    });

    storeMeshesRef.current = newStoreMeshes;
  }, [currentVenue]);

  // Pointer drag controls for 360 rotation & Click Raycasting
  const onPointerDown = (e: React.PointerEvent) => {
    isPointerDown.current = true;
    dragDistance.current = 0;
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isPointerDown.current) return;
    const deltaX = e.clientX - pointerStart.current.x;
    const deltaY = e.clientY - pointerStart.current.y;
    dragDistance.current += Math.abs(deltaX) + Math.abs(deltaY);
    pointerStart.current = { x: e.clientX, y: e.clientY };

    if (cameraFollowMode === 'orbit') {
      cameraAngle.current.theta -= deltaX * 0.006;
      cameraAngle.current.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, cameraAngle.current.phi - deltaY * 0.006));
    } else if (cameraFollowMode === 'first_person') {
      // 360° Interactive Look Around
      firstPersonLookAngle.current.yaw -= deltaX * 0.005;
      firstPersonLookAngle.current.pitch = Math.max(
        -Math.PI / 3.2,
        Math.min(Math.PI / 3.2, firstPersonLookAngle.current.pitch + deltaY * 0.005)
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    isPointerDown.current = false;
    if (dragDistance.current > 6) return;

    if (!mountRef.current || !cameraRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

    // 1. Check Route Tube Click -> Jump Pointer
    if (activeRouteTubeRef.current && splineCurveRef.current) {
      const tubeIntersects = raycaster.intersectObject(activeRouteTubeRef.current, false);
      if (tubeIntersects.length > 0) {
        const hitPt = tubeIntersects[0].point;
        let bestT = 0;
        let bestDist = Infinity;
        for (let i = 0; i <= 60; i++) {
          const t = i / 60;
          const p = splineCurveRef.current.getPointAt(t);
          const d = p.distanceTo(hitPt);
          if (d < bestDist) {
            bestDist = d;
            bestT = t;
          }
        }
        setPointerProgress(bestT);
        triggerToast(`📍 Pointer moved to ${(bestT * 100).toFixed(0)}% of route`);
        return;
      }
    }

    // 2. Check Store Click
    const meshes = storeMeshesRef.current.map((item) => item.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const zoneId = hit.userData.zoneId;
      const zone = MALL_ZONES_3D.find((z) => z.id === zoneId);
      if (zone) {
        setSelectedZoneInfo(zone);
        if (zone.id !== startZone) {
          setEndZone(zone.id);
          triggerToast(`🎯 Destination set to ${zone.name} [Floor ${zone.floor}]`);
        }
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (cameraFollowMode === 'orbit') {
      cameraAngle.current.radius = Math.max(40, Math.min(320, cameraAngle.current.radius + e.deltaY * 0.12));
    } else if (cameraFollowMode === 'first_person') {
      // Natural walking forward / backward with mouse scroll wheel
      stepPointer(e.deltaY > 0 ? -0.015 : 0.015);
    }
  };

  // Run Simulated YOLO Pre-Verification (Stage 1)
  const runYoloPreVerification = (imgUrl: string, preset?: (typeof PRESET_HAZARD_TESTS)[0]) => {
    setIsYoloScanning(true);
    setYoloResult(null);

    setTimeout(() => {
      if (preset) {
        setYoloResult({
          status: preset.isRealHazard ? 'passed' : 'rejected',
          confidence: preset.yoloConfidence,
          title: preset.title,
          description: preset.description,
          severity: preset.isRealHazard ? 'critical' : 'moderate',
          boxes: preset.yoloBoxes,
          affectsWheelchairs: (preset.type as string) === 'broken_elevator' || (preset.type as string) === 'broken_escalator',
          primaryClass: preset.yoloBoxes[0]?.label || 'clear_passage',
        });
      } else {
        const isHazard = selectedPresetType !== 'clean_storefront';
        const boxes: YOLOBox[] = isHazard
          ? [
              { id: 'c1', label: selectedPresetType, confidence: 95.8, topPercent: 22, leftPercent: 18, widthPercent: 64, heightPercent: 56 },
              { id: 'c2', label: 'physical_obstruction', confidence: 92.4, topPercent: 40, leftPercent: 28, widthPercent: 44, heightPercent: 36 },
            ]
          : [];

        setYoloResult({
          status: isHazard ? 'passed' : 'rejected',
          confidence: isHazard ? 95.8 : 14.2,
          title: isHazard ? `Physical Barrier (${selectedPresetType.replace('_', ' ')})` : 'Clean Storefront',
          description: isHazard
            ? 'YOLOv8 detected high-confidence physical barrier and localized obstacle bounding boxes.'
            : 'YOLOv8 detected no physical hazard or obstacle in the submitted image.',
          severity: isHazard ? 'high' : 'moderate',
          boxes,
          affectsWheelchairs: isHazard,
          primaryClass: isHazard ? selectedPresetType : 'none',
        });
      }
      setIsYoloScanning(false);
    }, 1100);
  };

  const submitToAdminQueue = () => {
    if (!yoloResult || yoloResult.status !== 'passed' || !uploadedImagePreview) return;
    const target = MALL_ZONES_3D.find((z) => z.id === selectedTargetLocation) || MALL_ZONES_3D[0];

    const newQueueItem: AdminQueueItem = {
      id: `queue-${Date.now()}`,
      locationId: target.id,
      locationName: target.name,
      title: yoloResult.title,
      hazardType: (selectedPresetType as any) || 'broken_elevator',
      floor: target.floor,
      x: target.x,
      y: target.y + 4,
      z: target.z,
      severity: yoloResult.severity,
      yoloConfidence: yoloResult.confidence,
      yoloPreVerified: true,
      yoloBoxes: yoloResult.boxes,
      description: yoloResult.description,
      imageUrl: uploadedImagePreview,
      submittedAt: 'Just now',
      submittedBy: 'Visitor Report (App)',
      affectsWheelchairs: yoloResult.affectsWheelchairs,
      primaryDetection: `${yoloResult.primaryClass} (${yoloResult.confidence.toFixed(1)}% conf)`,
    };

    setAdminQueue((prev) => [newQueueItem, ...prev]);
    setIsUploadModalOpen(false);
    setUploadedImagePreview(null);
    setYoloResult(null);

    triggerToast(`✅ Pre-verified by YOLO! Submitted to Admin Queue for final verification.`);
  };

  // Administrator Confirms Blockage -> STREAMS LIVE REROUTE OVER WEBSOCKET!
  const adminApproveAndDeploy = (item: AdminQueueItem, overriddenSeverity?: 'critical' | 'high' | 'moderate') => {
    const approvedHazard: Hazard3D = {
      id: `haz-${Date.now()}`,
      locationId: item.locationId,
      locationName: item.locationName,
      title: item.title,
      hazardType: item.hazardType,
      floor: item.floor,
      x: item.x,
      y: item.y,
      z: item.z,
      severity: overriddenSeverity || item.severity,
      yoloConfidence: item.yoloConfidence,
      yoloPreVerified: true,
      adminVerified: true,
      yoloBoxes: item.yoloBoxes,
      description: item.description,
      imageUrl: item.imageUrl,
      reportedAt: 'Just now (Admin Approved)',
      reportedBy: `${item.submittedBy} (Verified by Mall Admin)`,
      affectsWheelchairs: item.affectsWheelchairs,
      active: true,
    };

    setHazards((prev) => [approvedHazard, ...prev]);
    setAdminQueue((prev) => prev.filter((q) => q.id !== item.id));

    // STREAMS LIVE VIA WEBSOCKET TO ALL ACTIVE SESSIONS!
    sendWsMessage({
      type: 'admin:confirm_blockage',
      id: approvedHazard.id,
      locationId: item.locationId,
      locationName: item.locationName,
      title: item.title,
      hazardType: item.hazardType,
      floor: item.floor,
      severity: overriddenSeverity || item.severity,
      affectsWheelchairs: item.affectsWheelchairs,
      confirmedBy: 'Operations Admin (Console)',
      description: item.description,
    });

    triggerToast(`🛡️ Admin Approved! Streamed live blockage confirmation to all active sessions via WebSocket.`);
  };

  const adminRejectItem = (itemId: string) => {
    setAdminQueue((prev) => prev.filter((q) => q.id !== itemId));
    triggerToast(`❌ Report rejected by Admin.`);
  };

  const clearActiveHazard = (hazardId: string) => {
    const target = hazards.find((h) => h.id === hazardId);
    setHazards((prev) => prev.filter((h) => h.id !== hazardId));

    // Stream clearance to active sessions via WebSocket
    sendWsMessage({
      type: 'admin:clear_blockage',
      blockageId: hazardId,
      locationId: target?.locationId,
    });

    triggerToast(`✨ Hazard resolved and cleared from live map.`);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 select-none">
      {/* --------------------------------------------------------------------- */}
      {/* 1. THREE.JS 3D VIEWPORT */}
      {/* --------------------------------------------------------------------- */}
      <div
        ref={mountRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
      />

      {/* --------------------------------------------------------------------- */}
      {/* 2. TOP HUD: BRANDING, REAL CAMPUS PHOTOS & WEBSOCKET STATUS */}
      {/* --------------------------------------------------------------------- */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="relative">
          <div
            onClick={() => setVenueDropdownOpen((v) => !v)}
            className="flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-200/90 shadow-md cursor-pointer hover:border-indigo-400 transition-all"
          >
            <div className="size-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow shrink-0">
              <Building2 className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 max-w-[200px] truncate">{currentVenue.venueName}</span>
                <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                  {currentVenue.floors.length} Floors · 3D
                </span>
                <ChevronDown className="size-3.5 text-slate-400" />
              </div>
              <p className="text-[11px] text-slate-500 max-w-[240px] truncate">{currentVenue.venueSubtitle || 'Active 3D Spatial Navigation Twin'}</p>
            </div>
          </div>

          {venueDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-400 px-3 py-1">Available 3D Venues</div>
              {availableVenues.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    handleSelectVenue(v.id);
                    setVenueDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                    currentVenue.id === v.id ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="truncate mr-2">
                    <div className="truncate">{v.venueName}</div>
                    <div className="text-[10px] opacity-75">{v.floorsCount || v.floors?.length || 2} Floors · {v.zonesCount || v.zones?.length} Zones</div>
                  </div>
                  {currentVenue.id === v.id && <Check className="size-4 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Real Campus Photos Gallery Trigger Button */}
        <button
          onClick={() => setInspectedPhotoLandmark(SRM_LANDMARK_REAL_PHOTOS['srm_university_building'] || Object.values(SRM_LANDMARK_REAL_PHOTOS)[0])}
          className="flex items-center gap-2 bg-white/95 hover:bg-white text-slate-800 px-3.5 py-2.5 rounded-2xl border border-slate-200/90 shadow-md transition-all cursor-pointer font-semibold text-xs"
          title="View verified real-world photographs of SRM University campus landmarks"
        >
          <Camera className="size-4 text-indigo-600" />
          <span className="hidden sm:inline">Real Campus Photos</span>
          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-mono px-1.5 py-0.5 rounded border border-indigo-200">
            6 HD
          </span>
        </button>

        {/* YouTube 3D Map Synthesizer Trigger Button */}
        <button
          onClick={() => setIsYoutubeModalOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white px-3.5 py-2.5 rounded-2xl shadow-md transition-all cursor-pointer font-semibold text-xs"
          title="Construct a 3D indoor map from any YouTube walkthrough tour URL"
        >
          <Play className="size-3.5 fill-white" />
          <span className="hidden sm:inline">YouTube 3D Map</span>
          <Sparkles className="size-3.5 text-amber-200 animate-pulse" />
        </button>
      </div>

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Live WebSocket Status & Stream Telemetry Button */}
        <button
          onClick={() => setIsWsModalOpen(true)}
          className={`px-3 py-2 rounded-2xl flex items-center gap-2 text-xs font-semibold border transition-all shadow-md ${
            wsStatus === 'connected'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              : wsStatus === 'connecting'
              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 animate-pulse'
              : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
          }`}
          title="Open Live WebSocket Stream & Admin Security Console"
        >
          <div className="relative flex items-center justify-center">
            {wsStatus === 'connected' ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
              </span>
            ) : wsStatus === 'connecting' ? (
              <Radio className="size-3.5 text-amber-600 animate-spin" />
            ) : (
              <WifiOff className="size-3.5 text-rose-600" />
            )}
          </div>
          <span className="font-mono font-bold">
            {wsStatus === 'connected' ? `WS Live (${wsLatency}ms)` : wsStatus === 'connecting' ? 'WS Connecting...' : 'WS Offline'}
          </span>
          <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200 hidden md:inline">
            {activeSessionsCount} Active {activeSessionsCount === 1 ? 'Session' : 'Sessions'}
          </span>
        </button>

        {/* Audio Alert Toggle */}
        <button
          onClick={() => setIsAudioAlertEnabled((v) => !v)}
          className={`p-2 rounded-2xl border transition-all shadow-md ${
            isAudioAlertEnabled ? 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
          }`}
          title={isAudioAlertEnabled ? 'WebSocket Reroute Audio Chimes Enabled' : 'Mute Audio Chimes'}
        >
          {isAudioAlertEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>

        {/* Toggle Multi-Route Overlay on Map */}
        <button
          onClick={() => setShowComparisonOverlay((v) => !v)}
          className={`px-3 py-2 rounded-2xl flex items-center gap-2 text-xs font-semibold border transition-all shadow-md ${
            showComparisonOverlay
              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title="Toggle side-by-side multi-disability path comparison on 3D map"
        >
          <Split className="size-4" />
          <span className="hidden sm:inline">Compare 3 Routes</span>
        </button>

        {/* Admin Portal Queue Button */}
        <button
          onClick={() => setIsAdminModalOpen(true)}
          className={`px-3.5 py-2.5 rounded-2xl flex items-center gap-2 text-xs font-semibold border transition-all shadow-md ${
            adminQueue.length > 0
              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 animate-pulse'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title="Open Admin Final Verification Portal"
        >
          <Shield className="size-4 text-amber-600" />
          <span>Admin Portal</span>
          {adminQueue.length > 0 && (
            <span className="size-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {adminQueue.length}
            </span>
          )}
        </button>

        {/* Toggle Pointer (Show / Hide / Remove) */}
        <button
          onClick={togglePointer}
          className={`px-3.5 py-2.5 rounded-2xl flex items-center gap-2 text-xs font-semibold border transition-all shadow-md ${
            showPointer
              ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
          }`}
          title={showPointer ? 'Remove 3D Pointer from Map' : 'Restore 3D Pointer on Map'}
        >
          {showPointer ? <EyeOff className="size-4 text-rose-500" /> : <Eye className="size-4 text-emerald-600" />}
          <span className="hidden sm:inline">{showPointer ? 'Remove Pointer' : 'Restore Pointer'}</span>
        </button>

        {/* Report Hazard Modal Trigger */}
        <button
          onClick={() => {
            setIsUploadModalOpen(true);
            setUploadedImagePreview(null);
            setYoloResult(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-semibold text-xs sm:text-sm shadow-md transition-all"
        >
          <Camera className="size-4" />
          <span>Report Hazard (YOLO)</span>
        </button>
      </div>

      {/* Transient Notification Toast */}
      {notificationToast && (
        <div className="absolute top-18 right-4 z-50 bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-2xl shadow-xl text-xs flex items-center gap-2.5">
          <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{notificationToast}</span>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3. URGENT WEBSOCKET LIVE REROUTE STREAM BANNER */}
      {/* --------------------------------------------------------------------- */}
      {urgentRerouteAlert && (
        <div className="absolute top-18 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-red-950/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-md border-2 border-amber-400/80 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-bounce max-w-2xl">
          <div className="size-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-bold shadow-lg">
            <Radio className="size-6 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full font-bold tracking-wider">
                WEBSOCKET LIVE REROUTE STREAM
              </span>
              <span className="text-[10px] text-slate-400">Received Just Now</span>
            </div>
            <p className="text-xs font-semibold text-white mt-0.5 truncate">
              Admin confirmed temporary blockage at <b>{urgentRerouteAlert.blockageLocationName}</b> ({urgentRerouteAlert.blockageTitle}).
            </p>
            <p className="text-[11px] text-emerald-300 mt-0.5">
              Active session path automatically recalculated: {routeResult?.totalMeters}m (via safe accessible detour).
            </p>
          </div>
          <button
            onClick={() => setUrgentRerouteAlert(null)}
            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 4. PROMINENT "NO SAFE PATH" WARNING BANNER */}
      {/* --------------------------------------------------------------------- */}
      {routeResult && !routeResult.success && (
        <div className="absolute top-18 left-1/2 -translate-x-1/2 z-40 bg-red-950/90 backdrop-blur-md border-2 border-red-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-pulse">
          <div className="size-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
            <Ban className="size-6" />
          </div>
          <div>
            <span className="font-extrabold text-sm uppercase text-red-400 tracking-wide block">
              NO SAFE PATH FOUND
            </span>
            <p className="text-xs text-red-100 max-w-md">
              {routeResult.errorMessage || 'Both Elevator and Escalator between Level 0 and Level 1 are currently out of service. No accessible route exists.'}
            </p>
          </div>
          <button
            onClick={restoreAllVerticalTransit}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold border border-white/30 shrink-0"
          >
            Restore Lifts
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 5. LEFT DOCK: DESTINATION SELECTION & DYNAMIC MULTI-FLOOR COMPARISON */}
      {/* --------------------------------------------------------------------- */}
      {isDirectionsDrawerOpen ? (
        <div className="absolute top-20 left-4 z-20 w-96 max-w-[calc(100vw-32px)] bg-white/95 backdrop-blur-md p-4 rounded-3xl border border-slate-200/90 shadow-xl space-y-3.5 text-xs max-h-[calc(100vh-230px)] overflow-y-auto text-slate-800">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <Navigation className="size-4 text-indigo-600" />
              Route Planning & Waypoints
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-indigo-600">
                {routeResult?.success ? `${routeResult.totalMeters}m · Cost: ${routeResult.totalCost}` : '⚠️ NO SAFE PATH'}
              </span>
              <button
                onClick={() => setIsDirectionsDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                title="Collapse route panel"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
          </div>

          {/* Quick 1-Click Landmark Presets Bar */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Quick Destination Route:</span>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => {
                  setStartZone('srm_main_gate');
                  setEndZone('srm_admin_block');
                  setPointerProgress(0);
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                  endZone === 'srm_admin_block' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                🏛️ Admin Block
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartZone('srm_main_gate');
                  setEndZone('srm_engineering_block');
                  setPointerProgress(0);
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                  endZone === 'srm_engineering_block' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                ⚙️ Engineering Bldg
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartZone('srm_main_gate');
                  setEndZone('srm_hospital');
                  setPointerProgress(0);
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                  endZone === 'srm_hospital' ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                🏥 Hospital
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartZone('srm_main_gate');
                  setEndZone('srm_hostel');
                  setPointerProgress(0);
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                  endZone === 'srm_hostel' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                🏢 Hostel
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartZone('srm_engineering_block');
                  setEndZone('srm_engg_inside_robotics');
                  setPointerProgress(0);
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                  endZone.startsWith('srm_engg_inside') ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                }`}
              >
                🔬 Engg Inside Map (Robotics Lab)
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {/* Origin selector */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Origin (Start Point)</label>
              <select
                value={startZone}
                onChange={(e) => setStartZone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              >
                <optgroup label="⭐ Requested Main Campus Hubs">
                  {['srm_main_gate', 'srm_hostel', 'srm_admin_block', 'srm_engineering_block', 'srm_hospital'].map((id) => {
                    const z = activeZones.find((node) => node.id === id);
                    if (!z) return null;
                    return (
                      <option key={z.id} value={z.id} disabled={z.id === endZone}>
                        {z.name}
                      </option>
                    );
                  })}
                </optgroup>
                <optgroup label="🔬 Engineering Block Inside Map (Rooms & Labs)">
                  {activeZones.filter((z) => z.id.startsWith('srm_engg_inside')).map((z) => (
                    <option key={z.id} value={z.id} disabled={z.id === endZone}>
                      {z.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🏫 Other Campus Facilities & Upper Skywalk">
                  {activeZones.filter((z) => !['srm_main_gate', 'srm_hostel', 'srm_admin_block', 'srm_engineering_block', 'srm_hospital'].includes(z.id) && !z.id.startsWith('srm_engg_inside')).map((z) => (
                    <option key={z.id} value={z.id} disabled={z.id === endZone}>
                      {z.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Destination selector */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Destination</label>
              <select
                value={endZone}
                onChange={(e) => setEndZone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              >
                <optgroup label="⭐ Requested Main Campus Hubs">
                  {['srm_main_gate', 'srm_hostel', 'srm_admin_block', 'srm_engineering_block', 'srm_hospital'].map((id) => {
                    const z = activeZones.find((node) => node.id === id);
                    if (!z) return null;
                    return (
                      <option key={z.id} value={z.id} disabled={z.id === startZone}>
                        {z.name}
                      </option>
                    );
                  })}
                </optgroup>
                <optgroup label="🔬 Engineering Block Inside Map (Rooms & Labs)">
                  {activeZones.filter((z) => z.id.startsWith('srm_engg_inside')).map((z) => (
                    <option key={z.id} value={z.id} disabled={z.id === startZone}>
                      {z.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🏫 Other Campus Facilities & Upper Skywalk">
                  {activeZones.filter((z) => !['srm_main_gate', 'srm_hostel', 'srm_admin_block', 'srm_engineering_block', 'srm_hospital'].includes(z.id) && !z.id.startsWith('srm_engg_inside')).map((z) => (
                    <option key={z.id} value={z.id} disabled={z.id === startZone}>
                      {z.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Mobility Profile Selector with Real-time Weight & Formula Preview */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
              Active Mobility Profile
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setMobilityProfile('wheelchair')}
                className={`p-2 rounded-xl text-center border transition-all ${
                  mobilityProfile === 'wheelchair'
                    ? 'bg-sky-50 text-sky-800 border-sky-300 shadow-sm font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Accessibility className="size-4 mx-auto mb-1 text-sky-600" />
                <div className="font-bold text-[11px]">Wheelchair</div>
                <div className="text-[9px] text-sky-700">Stairs = ∞</div>
              </button>

              <button
                onClick={() => setMobilityProfile('crutches')}
                className={`p-2 rounded-xl text-center border transition-all ${
                  mobilityProfile === 'crutches'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Heart className="size-4 mx-auto mb-1 text-emerald-600" />
                <div className="font-bold text-[11px]">Crutches</div>
                <div className="text-[9px] text-emerald-700">W_stairs = 150</div>
              </button>

              <button
                onClick={() => setMobilityProfile('standard')}
                className={`p-2 rounded-xl text-center border transition-all ${
                  mobilityProfile === 'standard'
                    ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-sm font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Footprints className="size-4 mx-auto mb-1 text-amber-600" />
                <div className="font-bold text-[11px]">Standard</div>
                <div className="text-[9px] text-amber-700">Shortest Direct</div>
              </button>
            </div>
          </div>

          {/* Real Campus Photos of Journey Waypoints */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Camera className="size-3 text-indigo-600" />
                Campus Waypoints & Real Photos
              </span>
              <span className="text-[9px] text-indigo-600 font-normal">Click photo to zoom</span>
            </span>

            <div className="grid grid-cols-2 gap-2">
              {/* Origin Landmark Real Photo Card */}
              {SRM_LANDMARK_REAL_PHOTOS[startZone] && (
                <div
                  onClick={() => setInspectedPhotoLandmark(SRM_LANDMARK_REAL_PHOTOS[startZone])}
                  className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 hover:border-indigo-400 cursor-pointer transition-all shadow-sm"
                >
                  <img
                    src={SRM_LANDMARK_REAL_PHOTOS[startZone].imageUrl}
                    alt={SRM_LANDMARK_REAL_PHOTOS[startZone].name}
                    className="w-full h-16 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="p-1.5">
                    <span className="text-[9px] font-bold uppercase text-indigo-600 block">Origin Point</span>
                    <span className="text-[10px] font-semibold text-slate-800 truncate block">
                      {SRM_LANDMARK_REAL_PHOTOS[startZone].name}
                    </span>
                  </div>
                </div>
              )}

              {/* Destination Landmark Real Photo Card */}
              {SRM_LANDMARK_REAL_PHOTOS[endZone] && (
                <div
                  onClick={() => setInspectedPhotoLandmark(SRM_LANDMARK_REAL_PHOTOS[endZone])}
                  className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 hover:border-indigo-400 cursor-pointer transition-all shadow-sm"
                >
                  <img
                    src={SRM_LANDMARK_REAL_PHOTOS[endZone].imageUrl}
                    alt={SRM_LANDMARK_REAL_PHOTOS[endZone].name}
                    className="w-full h-16 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="p-1.5">
                    <span className="text-[9px] font-bold uppercase text-emerald-600 block">Target Landmark</span>
                    <span className="text-[10px] font-semibold text-slate-800 truncate block">
                      {SRM_LANDMARK_REAL_PHOTOS[endZone].name}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Route Divergence Explanation Banner */}
          {routeResult.divergenceSummary && (
            <div className="p-2.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                <Zap className="size-3.5 text-indigo-600" />
                <span>Multi-Level Navigation Strategy</span>
              </div>
              <p className="text-slate-700 text-[11px] leading-relaxed">
                {routeResult.divergenceSummary}
              </p>
            </div>
          )}

          {/* Pathway Status & Admin Blockage Simulator */}
          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                <ShieldAlert className="size-3 text-amber-600" />
                Transit Status & Controls
              </span>
              <span className="text-[9px] text-emerald-700 font-mono font-semibold">
                {hazards.filter((h) => h.active).length === 0 ? '🟢 All Paths Cleared' : `🚨 ${hazards.filter((h) => h.active).length} Closed`}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px]">
              {hazards.filter((h) => h.active).length === 0 ? (
                <span className="text-emerald-800 flex items-center gap-1.5 font-medium">
                  <span className="size-2 rounded-full bg-emerald-500 shrink-0"></span>
                  All paths are cleared at start. Only closes when confirmed by Admin.
                </span>
              ) : (
                <span className="text-amber-800 flex items-center gap-1.5 font-medium">
                  <span className="size-2 rounded-full bg-amber-500 shrink-0"></span>
                  Temporary blockage confirmed by Admin. Active session live-rerouted.
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <button
                onClick={toggleElevatorFault}
                className={`p-2 rounded-xl border text-left font-medium transition-all ${
                  isElevatorDown
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Glass Elevator</span>
                  <span className={`size-2 rounded-full ${isElevatorDown ? 'bg-rose-600 animate-ping' : 'bg-emerald-600'}`} />
                </div>
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  {isElevatorDown ? '🚨 Blocked (WS Active)' : 'Operational'}
                </span>
              </button>

              <button
                onClick={toggleEscalatorFault}
                className={`p-2 rounded-xl border text-left font-medium transition-all ${
                  isEscalatorDown
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Escalator Ascent</span>
                  <span className={`size-2 rounded-full ${isEscalatorDown ? 'bg-rose-600 animate-ping' : 'bg-emerald-600'}`} />
                </div>
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  {isEscalatorDown ? '🚨 Jammed (WS Active)' : 'Operational'}
                </span>
              </button>
            </div>

            <button
              onClick={toggleBothTransitFault}
              className={`w-full py-1.5 px-2 rounded-xl border text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                isElevatorDown && isEscalatorDown
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
              }`}
            >
              <Ban className="size-3" />
              <span>
                {isElevatorDown && isEscalatorDown
                  ? '✨ Clear Both Transit Hubs (Restore Safe Paths)'
                  : '🚨 Simulate Both Lifts Down (Test No Safe Path)'}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsDirectionsDrawerOpen(true)}
          className="absolute top-20 left-4 z-20 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-2 shadow-xl hover:bg-white transition-all hover:scale-105 active:scale-95"
        >
          <Navigation className="size-4 text-indigo-600" />
          <span>Route & Destinations</span>
          <span className="text-[10px] font-mono font-bold text-indigo-600 ml-0.5">({routeResult?.totalMeters || 0}m)</span>
        </button>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 6. RIGHT TOP: ACCESSIBILITY FORMULA BREAKDOWN CARD */}
      {/* --------------------------------------------------------------------- */}
      <div className="absolute top-20 right-4 z-20 w-80 max-w-[calc(100vw-32px)] bg-white/95 backdrop-blur-md p-4 rounded-3xl border border-slate-200/90 shadow-xl space-y-3 text-xs text-slate-800">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <span className="font-bold text-slate-900 flex items-center gap-1.5">
            <Calculator className="size-4 text-emerald-600" />
            Formula & Cost Engine
          </span>
          <button onClick={() => setIsFormulaCardOpen(!isFormulaCardOpen)} className="text-slate-400 hover:text-slate-700">
            <ChevronDown className={`size-4 transition-transform ${isFormulaCardOpen ? '' : '-rotate-90'}`} />
          </button>
        </div>

        {isFormulaCardOpen && (
          <div className="space-y-2.5">
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[10px] text-indigo-700 font-semibold">
              Cost = (W_dist × Dist) + (W_slope × Slope) + (W_stairs × Stairs) + (W_obs × Obs)
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>Active Profile:</span>
                <span className="font-bold text-slate-900">{PROFILE_FORMULA_WEIGHTS[mobilityProfile].name}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Stairs Penalty (W_stairs):</span>
                <span className={`font-mono font-bold ${mobilityProfile === 'crutches' ? 'text-emerald-600' : mobilityProfile === 'wheelchair' ? 'text-rose-600' : 'text-amber-600'}`}>
                  {PROFILE_FORMULA_WEIGHTS[mobilityProfile].W_stairs === Infinity ? '∞ (Hard Block)' : `${PROFILE_FORMULA_WEIGHTS[mobilityProfile].W_stairs}`}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Stair Steps in Route:</span>
                <span className="font-mono font-bold text-slate-900">{routeResult.totalStairs} steps</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Stairs Avoided:</span>
                <span className="font-mono font-bold text-emerald-600">{routeResult.stairsAvoided} steps</span>
              </div>
            </div>

            {/* Profile Comparison Mini-Table */}
            <div className="pt-2 border-t border-slate-200 space-y-1.5 text-[10px]">
              <span className="font-bold text-slate-500 block">Comparison Across Mobility Profiles:</span>
              <div className="grid grid-cols-3 gap-1">
                <div className={`p-1.5 rounded-lg border text-center ${mobilityProfile === 'wheelchair' ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  <div className="font-bold">Wheelchair</div>
                  <div className="font-mono">{wheelchairRoute.success ? `${wheelchairRoute.totalMeters}m` : '⛔ Blocked'}</div>
                </div>
                <div className={`p-1.5 rounded-lg border text-center ${mobilityProfile === 'crutches' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  <div className="font-bold">Crutches</div>
                  <div className="font-mono">{crutchesRoute.success ? `${crutchesRoute.totalMeters}m` : '⛔ Blocked'}</div>
                </div>
                <div className={`p-1.5 rounded-lg border text-center ${mobilityProfile === 'standard' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  <div className="font-bold">Standard</div>
                  <div className="font-mono">{standardRoute.success ? `${standardRoute.totalMeters}m` : '⛔ Blocked'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 6.5. FIRST-PERSON VIEWPORT HUD OVERLAY & REAL CAMPUS PHOTO STREET VIEW */}
      {/* --------------------------------------------------------------------- */}
      {cameraFollowMode === 'first_person' && (
        <div className="absolute inset-0 z-30 flex flex-col justify-between p-4 select-none pointer-events-none">
          {/* Live SRM Sonepat Campus Street View Floating HUD Card (Moving Photo) */}
          <div className="pointer-events-auto absolute top-20 right-4 z-40 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden text-slate-800">
            {(() => {
              const currentTurn = routeResult?.turnSteps.find((s) => navProgress >= s.progressStart && navProgress <= s.progressEnd) || routeResult?.turnSteps[0];
              const activeLandmarkId = currentTurn?.nodeId || startZone;
              const activeLandmarkPhoto =
                SRM_LANDMARK_REAL_PHOTOS[activeLandmarkId] ||
                (facingLandmark?.name ? Object.values(SRM_LANDMARK_REAL_PHOTOS).find((p) => p.name.includes(facingLandmark.name)) : null) ||
                SRM_LANDMARK_REAL_PHOTOS['srm_engineering_block'] ||
                SRM_LANDMARK_REAL_PHOTOS['srm_main_gate'];

              // Moving photo pan & zoom motion parallax synchronized with walking and progress
              const panX = Math.cos(navProgress * Math.PI * 4) * 10;
              const panY = Math.sin(navProgress * Math.PI * 3) * 6;
              const zoomScale = isWalking ? 1.08 + Math.sin(navProgress * Math.PI * 6) * 0.05 : 1.05;

              return (
                <div className="flex flex-col">
                  {/* Street View Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                      </span>
                      <span className="text-[11px] font-bold text-slate-900 truncate flex items-center gap-1">
                        <Camera className="size-3.5 text-indigo-600 shrink-0" />
                        SRM Sonepat Street View
                      </span>
                    </div>
                    <span className="text-[9px] bg-emerald-50 text-emerald-700 font-mono px-2 py-0.5 rounded-full border border-emerald-200 font-bold shrink-0">
                      Moving Photo Pan
                    </span>
                  </div>

                  {/* Dynamic Moving Photo Container */}
                  <div className="relative h-44 w-full overflow-hidden bg-slate-950">
                    <img
                      src={activeLandmarkPhoto.imageUrl}
                      alt={activeLandmarkPhoto.name}
                      style={{
                        transform: `scale(${zoomScale}) translate(${panX}px, ${panY}px)`,
                        transition: 'transform 0.35s ease-out',
                      }}
                      className="w-full h-full object-cover brightness-95"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />

                    {/* Moving Compass Radar Pointer on Photo */}
                    <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl text-[10px] text-white font-mono flex items-center gap-1.5 border border-white/20 shadow">
                      <Navigation
                        className="size-3 text-emerald-400 transition-transform"
                        style={{ transform: `rotate(${firstPersonHeading}deg)` }}
                      />
                      <span>{firstPersonHeading}° {getCardinalDirection(firstPersonHeading)}</span>
                    </div>

                    {/* Ground Pointer Status Badge */}
                    <div className="absolute top-2.5 left-2.5 bg-indigo-900/80 backdrop-blur-md px-2 py-0.5 rounded-lg text-[9px] text-indigo-200 font-semibold flex items-center gap-1 border border-indigo-400/30">
                      <ArrowUp className="size-3 text-emerald-400 animate-bounce" />
                      <span>3D Pointer Moving Ahead</span>
                    </div>

                    {/* Bottom Photo Overlay */}
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between">
                      <div className="min-w-0 pr-2">
                        <h4 className="font-bold text-xs text-white truncate drop-shadow">
                          {activeLandmarkPhoto.name}
                        </h4>
                        <p className="text-[10px] text-slate-200 truncate drop-shadow">
                          {activeLandmarkPhoto.subtitle}
                        </p>
                      </div>
                      <button
                        onClick={() => setInspectedPhotoLandmark(activeLandmarkPhoto)}
                        className="px-2.5 py-1 bg-white/95 hover:bg-white text-slate-900 rounded-xl text-[10px] font-bold shadow-md shrink-0 transition-all active:scale-95 border border-white/40"
                        title="View Full High-Resolution Photo and Accessibility Details"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>

                  {/* Accessibility & Distance Footer */}
                  <div className="px-3 py-1.5 bg-white flex items-center justify-between text-[10px] border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-600 truncate">
                      <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{activeLandmarkPhoto.accessibilityFeatures[0] || 'Wheelchair Verified'}</span>
                    </div>
                    <span className="font-mono text-indigo-600 font-bold shrink-0 ml-2">
                      {((navProgress) * 100).toFixed(0)}% Complete
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Top Compass Strip & Quick Actions */}
          <div className="relative z-10 flex items-start justify-between gap-4 w-full">
            {/* Step & Level Badge */}
            <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200/90 px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-3 text-slate-800">
              <div className="size-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow">
                {activeStep?.id || 1}
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-600">
                  Level {navProgress > 0.45 && (routeResult?.usedElevator || routeResult?.usedEscalator || routeResult?.usedStairs) ? '1 (Mezzanine)' : '0 (Ground)'}
                </div>
                <div className="text-xs font-semibold text-slate-900 max-w-[220px] truncate">
                  {activeStep?.instruction || 'Following route'}
                </div>
              </div>
            </div>

            {/* Dynamic Digital Compass Ribbon */}
            <div className="pointer-events-auto flex flex-col items-center">
              <div className="relative bg-white/95 backdrop-blur-md border border-slate-200/90 px-4 py-1.5 rounded-2xl shadow-xl flex items-center gap-2 overflow-hidden w-64 justify-center text-slate-800">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-indigo-600 z-10" />
                <Compass className="size-4 text-indigo-600 shrink-0 animate-spin-slow" />
                <div className="font-mono font-bold text-xs text-indigo-700 tracking-wider">
                  {firstPersonHeading}° {getCardinalDirection(firstPersonHeading)}
                </div>
                <div className="text-[10px] text-slate-400 border-l border-slate-200 pl-2">
                  360° Walk
                </div>
              </div>

              {facingLandmark ? (
                <div className="mt-1.5 px-3 py-1 bg-white/95 backdrop-blur-md border border-indigo-200 rounded-full text-[11px] font-medium text-slate-800 flex items-center gap-1.5 shadow-md">
                  <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Facing: <strong className="text-slate-900">{facingLandmark.name}</strong> · {facingLandmark.distance}m</span>
                </div>
              ) : (
                <div className="mt-1.5 px-3 py-1 bg-white/90 backdrop-blur-md border border-slate-200 rounded-full text-[10px] text-slate-500 flex items-center gap-1.5 shadow-sm">
                  <Move className="size-3 text-slate-400" />
                  <span>Drag or WASD / Arrow keys to turn</span>
                </div>
              )}
            </div>

            {/* FPV Mode Toggle (Real Photos vs 3D Model) & Controls */}
            <div className="pointer-events-auto flex items-center gap-2">
              {/* Real Photo vs 3D Mode Switcher */}
              <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-2xl border border-slate-200 shadow-md">
                <button
                  onClick={() => setFirstPersonViewMode('real_photo')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                    firstPersonViewMode === 'real_photo'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Show Real Campus Photographs"
                >
                  <Camera className="size-3.5" />
                  <span>Real Campus View</span>
                </button>
                <button
                  onClick={() => setFirstPersonViewMode('3d_mesh')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                    firstPersonViewMode === '3d_mesh'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Show 3D Architectural CAD View"
                >
                  <Building2 className="size-3.5" />
                  <span>3D CAD</span>
                </button>
              </div>

              <button
                onClick={() => {
                  firstPersonLookAngle.current.yaw = 0;
                  firstPersonLookAngle.current.pitch = 0;
                  triggerToast('🎯 View recentered ahead along path');
                }}
                className="px-3 py-1.5 rounded-xl bg-white/95 hover:bg-white border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                title="Recenter forward direction (Hotkey: R)"
              >
                <RotateCcw className="size-3.5 text-indigo-600" />
                <span>Center (R)</span>
              </button>

              <button
                onClick={() => {
                  setCameraFollowMode('third_person');
                  setIsDirectionsDrawerOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1 shadow-md transition-all active:scale-95"
                title="Exit First-Person mode"
              >
                <X className="size-3.5" />
                <span>Exit FPV</span>
              </button>
            </div>
          </div>

          {/* Center AR Crosshair Reticle & Lead Pointer Tracking */}
          <div className="relative z-10 flex flex-col items-center justify-center my-auto pointer-events-none">
            <div className="relative size-12 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
              <div className="size-2 rounded-full bg-emerald-500 shadow animate-pulse" />
              <div className="absolute inset-0 border border-emerald-500/40 rounded-full" />
              <div className="absolute top-0 w-2 h-0.5 bg-emerald-600" />
              <div className="absolute bottom-0 w-2 h-0.5 bg-emerald-600" />
              <div className="absolute left-0 w-0.5 h-2 bg-emerald-600" />
              <div className="absolute right-0 w-0.5 h-2 bg-emerald-600" />
            </div>
            <div className="mt-2 text-[9px] font-mono font-bold text-slate-700 bg-white/85 px-2.5 py-0.5 rounded-full backdrop-blur-md border border-slate-200 shadow-sm flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>Lead Navigation Pointer Active Ahead</span>
            </div>
          </div>

          {/* Bottom Cockpit & Movement Bar */}
          <div className="relative z-10 flex flex-col items-center gap-2 w-full pb-20">
            {mobilityProfile === 'wheelchair' ? (
              <div className="pointer-events-auto mx-auto max-w-lg w-full bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3 shadow-xl flex items-center justify-between text-xs text-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-xl bg-sky-50 border border-sky-300 flex items-center justify-center text-sky-700 font-bold">
                    🦽
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Wheelchair Accessible View</div>
                    <div className="text-[10px] text-slate-500">Barrier-Free Gradient · Step-Free Lifts Verified</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-slate-900">
                      {(isWalking ? 1.4 * walkSpeed : 0).toFixed(1)} m/s
                    </div>
                    <div className="text-[10px] text-slate-500">Speed</div>
                  </div>

                  <div className="h-6 w-px bg-slate-200" />

                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-emerald-600">
                      {((navProgress) * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-slate-500">Progress</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pointer-events-auto mx-auto max-w-lg w-full bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-2.5 shadow-xl flex items-center justify-between text-xs text-slate-800">
                <div className="flex items-center gap-2">
                  <Footprints className="size-4 text-indigo-600" />
                  <span className="font-semibold text-slate-900">
                    {mobilityProfile === 'crutches' ? 'Crutches Stride Navigation' : 'Pedestrian Campus Walkthrough'}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-indigo-600">{(isWalking ? 1.3 * walkSpeed : 0).toFixed(1)} m/s</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-700 font-bold">{((navProgress) * 100).toFixed(0)}% complete</span>
                </div>
              </div>
            )}

            {/* Quick Touch / Mouse Movement Bar */}
            <div className="pointer-events-auto mx-auto flex items-center gap-2 bg-white/95 backdrop-blur-md border border-slate-200 px-3 py-1.5 rounded-2xl shadow-xl">
              <button
                onClick={() => {
                  firstPersonLookAngle.current.yaw += 0.35;
                }}
                className="size-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all active:scale-95 border border-slate-200"
                title="Turn Look Left (Key: A or Left Arrow)"
              >
                <ArrowLeft className="size-4" />
              </button>

              <button
                onClick={() => stepPointer(-0.02)}
                className="size-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all active:scale-95 border border-slate-200"
                title="Step Backward (Key: S or Down Arrow)"
              >
                <ArrowDown className="size-4" />
              </button>

              <button
                onClick={() => {
                  if (navProgress >= 0.99) setPointerProgress(0);
                  setIsWalking(!isWalking);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition-all active:scale-95 ${
                  isWalking ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
                title="Toggle Auto Walking (Key: Space)"
              >
                {isWalking ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                <span>{isWalking ? 'Pause' : 'Auto Walk'}</span>
              </button>

              <button
                onClick={() => stepPointer(0.02)}
                className="size-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center font-bold transition-all active:scale-95 shadow"
                title="Step Forward (Key: W or Up Arrow)"
              >
                <ArrowUp className="size-4" />
              </button>

              <button
                onClick={() => {
                  firstPersonLookAngle.current.yaw -= 0.35;
                }}
                className="size-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all active:scale-95 border border-slate-200"
                title="Turn Look Right (Key: D or Right Arrow)"
              >
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 7. BOTTOM NAVIGATION BAR & POINTER CONTROLS */}
      {/* --------------------------------------------------------------------- */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-3xl bg-white/95 backdrop-blur-md p-3.5 sm:p-4 rounded-3xl border border-slate-200/90 shadow-xl space-y-3 text-slate-800">
        {/* Step progress & Current Turn Instruction */}
        <div className="flex items-center justify-between text-xs pb-1">
          <div className="flex items-center gap-2 truncate">
            <span className="size-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              {activeStep?.id || 1}
            </span>
            <span className="font-bold text-sm text-slate-900 truncate">{activeStep?.instruction || 'Ready'}</span>
          </div>
          <div className="font-mono text-xs text-indigo-600 font-semibold shrink-0">
            {((navProgress) * 100).toFixed(0)}% Complete · {routeResult?.totalMeters || 0}m
          </div>
        </div>

        {/* Scrub Bar */}
        <div className="relative w-full h-2.5 bg-slate-100 border border-slate-200 rounded-full cursor-pointer overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-75"
            style={{ width: `${navProgress * 100}%` }}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={navProgress}
            onChange={(e) => setPointerProgress(parseFloat(e.target.value))}
            className="absolute inset-0 opacity-0 cursor-pointer w-full"
          />
        </div>

        {/* Direction buttons & Movement Controls */}
        <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => stepPointer(-0.04)}
              disabled={!routeResult?.success}
              className="size-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 disabled:opacity-40 transition-colors border border-slate-200"
              title="Step Backward"
            >
              <SkipBack className="size-3.5" />
            </button>

            <button
              onMouseDown={() => startHoldingMove(1)}
              onMouseUp={stopHoldingMove}
              onMouseLeave={stopHoldingMove}
              onTouchStart={() => startHoldingMove(1)}
              onTouchEnd={stopHoldingMove}
              disabled={!routeResult?.success}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold flex items-center gap-1 shadow transition-all disabled:opacity-40"
              title="Step Forward in Direction"
            >
              <ArrowUp className="size-3.5" />
              <span>Step Forward</span>
            </button>

            <button
              onClick={() => {
                if (navProgress >= 0.99) setPointerProgress(0);
                setIsWalking(!isWalking);
              }}
              disabled={!routeResult?.success}
              className={`px-3 py-1.5 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow transition-all disabled:opacity-40 ${
                isWalking ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isWalking ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              <span>{isWalking ? 'Pause' : navProgress >= 0.99 ? 'Restart' : 'Auto Walk'}</span>
            </button>

            <button
              onClick={() => {
                const next = Math.min(1, (activeStep?.progressEnd || 0) + 0.05);
                setPointerProgress(next);
                setIsWalking(false);
              }}
              disabled={!routeResult?.success}
              className="size-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 disabled:opacity-40 transition-colors border border-slate-200"
              title="Jump to Next Turn"
            >
              <SkipForward className="size-3.5" />
            </button>

            <button
              onClick={() => {
                setPointerProgress(0);
                setIsWalking(false);
              }}
              className="size-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors border border-slate-200"
              title="Reset Pointer to Start"
            >
              <RotateCcw className="size-3.5" />
            </button>

            <button
              onClick={() => {
                setIsWalking(false);
                setShowPointer(false);
                showPointerRef.current = false;
                if (avatarMeshRef.current) {
                  avatarMeshRef.current.visible = false;
                }
              }}
              className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1 transition-all"
              title="Remove Pointer from Map"
            >
              <Trash2 className="size-3.5" />
              <span>Remove</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Camera View Mode */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {(['third_person', 'first_person', 'orbit'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setCameraFollowMode(mode);
                    if (mode === 'first_person') {
                      setIsDirectionsDrawerOpen(false);
                      setIsFormulaCardOpen(false);
                      triggerToast('🎥 Entered First-Person View. Drag to look 360°, scroll/WASD to walk.');
                    }
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all ${
                    cameraFollowMode === mode ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'third_person' ? '3rd Person' : mode === 'first_person' ? '1st Person' : 'Orbit'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500 mr-1 text-[11px]">Speed:</span>
              {[1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setWalkSpeed(spd)}
                  className={`px-2 py-0.5 rounded-md font-mono font-bold transition-colors ${
                    walkSpeed === spd ? 'bg-indigo-600 text-white' : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 7.5 REAL CAMPUS PHOTO & ACCESSIBILITY INSPECTOR MODAL */}
      {/* --------------------------------------------------------------------- */}
      {inspectedPhotoLandmark && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold">
                  <Camera className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                    <span>{inspectedPhotoLandmark.name}</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                      Floor {inspectedPhotoLandmark.floor}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Official High-Resolution Campus Landmark Survey</p>
                </div>
              </div>
              <button
                onClick={() => setInspectedPhotoLandmark(null)}
                className="size-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Photo & Specs body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm aspect-video">
                <img
                  src={inspectedPhotoLandmark.imageUrl}
                  alt={inspectedPhotoLandmark.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] text-white font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  <span>Real SRM Campus Photographic Capture</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-xs uppercase tracking-wide text-slate-400 mb-1">Architectural Overview</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{inspectedPhotoLandmark.description}</p>
              </div>

              <div>
                <h4 className="font-bold text-xs uppercase tracking-wide text-slate-400 mb-2">Verified Accessibility Features</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {inspectedPhotoLandmark.accessibilityFeatures.map((feat, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2"
                    >
                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Other Campus Landmarks Quick Switcher */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-700 block mb-2">
                  Explore other SRM Campus Landmarks:
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {SRM_CAMPUS_PHOTO_LIST.slice(0, 6).map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setInspectedPhotoLandmark(img)}
                      className={`group rounded-xl overflow-hidden border text-left transition-all ${
                        inspectedPhotoLandmark.id === img.id
                          ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                          : 'border-slate-200 hover:border-slate-400 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img src={img.imageUrl} alt={img.name} className="w-full h-12 object-cover" />
                      <div className="p-1 bg-white text-[9px] font-semibold text-slate-800 truncate">
                        {img.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Landmark is represented as a 3D billboard and in 1st-Person Campus View.
              </span>
              <button
                onClick={() => setInspectedPhotoLandmark(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 8. LIVE WEBSOCKET TELEMETRY & ADMIN DISPATCHER MODAL */}
      {/* --------------------------------------------------------------------- */}
      {isWsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <Radio className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2 text-slate-900">
                    <span>Active Session WebSocket Rerouting Console</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                      {wsStatus.toUpperCase()} · {wsLatency}ms
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Real-time bidirectional WebSocket stream pushes instant path recalculations the moment an administrator confirms a temporary blockage.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsWsModalOpen(false)} className="size-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
                <X className="size-5" />
              </button>
            </div>

            {/* Session & Connection Telemetry Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 block uppercase">Client Session ID</span>
                <span className="font-mono text-sm text-indigo-700 font-bold">#{sessionIdRef.current}</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 block uppercase">Socket Latency</span>
                <span className="font-mono text-sm text-emerald-700 font-bold">{wsLatency} ms</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 block uppercase">Connected Clients</span>
                <span className="font-mono text-sm text-sky-700 font-bold">{connectedClientsCount} Active</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 block uppercase">Monitored Route</span>
                <span className="font-mono text-sm text-amber-700 font-bold">{routeResult.totalMeters}m</span>
              </div>
            </div>

            {/* Admin Security Operations Trigger Suite (Test Live Stream Broadcast!) */}
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-amber-700" />
                  <span className="font-bold text-xs text-amber-900 uppercase tracking-wide">
                    Admin Emergency Blockage Dispatcher (Interactive Test)
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">Clicking broadcasts live to all connected sessions</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() =>
                    triggerAdminWebSocketBlockage('elev_ground', 'Panoramic Glass Elevator [L0]', 'Elevator Motor Fault', 'broken_elevator', 0)
                  }
                  className="p-3 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-left transition-all shadow-sm group"
                >
                  <span className="font-bold text-xs text-rose-800 block group-hover:text-rose-900">🚨 Block Glass Elevator</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Streams live reroute for Wheelchair & Crutches
                  </span>
                </button>

                <button
                  onClick={() =>
                    triggerAdminWebSocketBlockage('escala_ground', 'Central Escalator Landing [L0]', 'Escalator Mechanical Jam', 'broken_escalator', 0)
                  }
                  className="p-3 rounded-xl bg-white hover:bg-amber-50 border border-amber-200 text-left transition-all shadow-sm group"
                >
                  <span className="font-bold text-xs text-amber-800 block group-hover:text-amber-900">🚨 Block Central Escalator</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Reroutes standard walkers to stairs or elevator
                  </span>
                </button>

                <button
                  onClick={() => {
                    triggerAdminWebSocketBlockage('elev_ground', 'Panoramic Glass Elevator [L0]', 'Elevator Bank Out Of Service', 'broken_elevator', 0);
                    setTimeout(() => {
                      triggerAdminWebSocketBlockage('escala_ground', 'Central Escalator Landing [L0]', 'Escalator Jammed', 'broken_escalator', 0);
                    }, 200);
                  }}
                  className="p-3 rounded-xl bg-white hover:bg-purple-50 border border-purple-200 text-left transition-all shadow-sm group"
                >
                  <span className="font-bold text-xs text-purple-800 block group-hover:text-purple-900">🚨 Dual Block (Elevator + Escalator)</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Broadcasts instant &quot;NO SAFE PATH&quot; alert
                  </span>
                </button>
              </div>

              <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-600">
                  Active confirmed blockages in campus database: <b className="text-slate-900">{hazards.filter((h) => h.active).length}</b>
                </span>
                <button
                  onClick={restoreAllVerticalTransit}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className="size-3.5" />
                  <span>Clear All Blockages (Broadcast Restoration)</span>
                </button>
              </div>
            </div>

            {/* Live WebSocket Event Stream Log */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Terminal className="size-3.5 text-indigo-600" />
                  Live WebSocket Frame Log (Recent 50 Frames)
                </span>
                <button onClick={() => setWsEventLog([])} className="text-[10px] text-slate-400 hover:text-slate-700">
                  Clear Log
                </button>
              </div>

              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-3 max-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px] text-slate-200">
                {wsEventLog.length === 0 ? (
                  <div className="text-slate-400 text-center py-4">Awaiting WebSocket messages...</div>
                ) : (
                  wsEventLog.map((evt) => (
                    <div key={evt.id} className="flex items-start gap-2 py-0.5 border-b border-slate-800">
                      <span className="text-slate-400 text-[10px] shrink-0">{evt.timestamp}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                          evt.direction === 'inbound'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-indigo-500/20 text-indigo-300'
                        }`}
                      >
                        {evt.direction === 'inbound' ? '← IN' : '→ OUT'}
                      </span>
                      <span className="text-amber-300 shrink-0">[{evt.type}]</span>
                      <span className="text-slate-200 truncate">{evt.summary}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 9. STAGE 1: USER HAZARD UPLOAD & YOLO PRE-VERIFICATION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                  <Scan className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2 text-slate-900">
                    <span>Stage 1: YOLO Hazard Pre-Verification</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                      YOLOv8 Pre-Screen
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    YOLO object detection inspects the image for physical barriers before forwarding to Admin for final review.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="size-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
                <X className="size-5" />
              </button>
            </div>

            {/* Quick Test Presets */}
            <div>
              <span className="text-xs font-semibold text-slate-700 block mb-2">
                Select Test Image to Pre-Verify with YOLO (or upload custom photo below):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESET_HAZARD_TESTS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setUploadedImagePreview(preset.imageUrl);
                      setSelectedTargetLocation(preset.locationId);
                      setSelectedPresetType(preset.type);
                      runYoloPreVerification(preset.imageUrl, preset);
                    }}
                    className="p-2 rounded-xl border border-slate-200 hover:border-indigo-500 bg-slate-50 hover:bg-white text-left transition-all space-y-1.5 shadow-sm"
                  >
                    <div className="h-16 w-full rounded-lg overflow-hidden bg-slate-100 relative">
                      <img src={preset.imageUrl} alt={preset.title} className="w-full h-full object-cover" />
                    </div>
                    <span className="font-bold text-slate-800 block text-[11px] line-clamp-1">{preset.title}</span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded block text-center ${
                        preset.isRealHazard ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {preset.isRealHazard ? 'Hazard Photo' : 'Clean / Normal'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Upload */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const res = reader.result as string;
                    setUploadedImagePreview(res);
                    runYoloPreVerification(res);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="hidden"
            />

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">Or capture photo directly from mobile camera:</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Upload className="size-3.5" />
                <span>Upload Custom Image</span>
              </button>
            </div>

            {/* Scanning Indicator */}
            {isYoloScanning && (
              <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-200 text-center space-y-3">
                <RefreshCw className="size-8 text-indigo-600 animate-spin mx-auto" />
                <div className="font-bold text-sm text-indigo-900">
                  Running YOLOv8 Neural Inference...
                </div>
                <p className="text-xs text-indigo-600/80 max-w-sm mx-auto">
                  Localizing bounding boxes for construction barriers, caution tapes, broken elevators, and floor obstructions.
                </p>
              </div>
            )}

            {/* YOLO Pre-Verification Output Card */}
            {yoloResult && !isYoloScanning && (
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  yoloResult.status === 'passed'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {yoloResult.status === 'passed' ? (
                      <CheckCircle2 className="size-5 text-emerald-600" />
                    ) : (
                      <XCircle className="size-5 text-rose-600" />
                    )}
                    <span className="font-bold text-sm">
                      {yoloResult.status === 'passed'
                        ? 'YOLO PRE-VERIFICATION PASSED'
                        : 'YOLO PRE-VERIFICATION REJECTED: NO HAZARD FOUND'}
                    </span>
                  </div>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-white border border-slate-200 shadow-sm font-semibold">
                    {yoloResult.confidence.toFixed(1)}% Confidence
                  </span>
                </div>

                <p className="text-xs text-slate-600">
                  {yoloResult.status === 'passed'
                    ? `${yoloResult.description} Obstacle localized with ${yoloResult.boxes.length} bounding box(es). Eligible for Admin final verification.`
                    : 'YOLO detected normal, clear passage with zero physical obstruction. Auto-rejected to protect Admin from false reports.'}
                </p>

                {yoloResult.status === 'passed' && (
                  <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-emerald-800 font-medium">
                      Ready to queue for <b>Admin Final Verification</b> (Stage 2)
                    </span>
                    <button
                      onClick={submitToAdminQueue}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow flex items-center gap-1.5 transition-all"
                    >
                      <Shield className="size-3.5" />
                      <span>Forward to Admin Queue</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 10. STAGE 2: ADMIN FINAL VERIFICATION QUEUE & TRIAGE PORTAL */}
      {/* --------------------------------------------------------------------- */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-sm font-bold">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2 text-slate-900">
                    <span>Stage 2: Admin Final Verification Portal</span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                      {adminQueue.length} Pending
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    All paths are cleared &amp; operational by default at start. Review candidate hazards below. Clicking &quot;Approve &amp; Stream WebSocket Reroute&quot; confirms a blockage, closes the pathway, and streams live reroutes to active sessions.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsAdminModalOpen(false)} className="size-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
                <X className="size-5" />
              </button>
            </div>

            {adminQueue.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 className="size-10 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-base text-slate-900">All Clear! No Pending Items</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  All candidate hazards pre-screened by YOLO have been reviewed. To test the workflow, submit a new hazard report in Stage 1 or use the Emergency Blockage Dispatcher.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {adminQueue.map((item) => (
                  <div key={item.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold">
                            YOLO Pre-Verified ({item.yoloConfidence.toFixed(1)}%)
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3 text-amber-600" />
                            {item.locationName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {item.submittedAt} by {item.submittedBy}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase shrink-0 ${
                        item.severity === 'critical' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {item.severity} Severity
                      </span>
                    </div>

                    <div className="relative rounded-xl overflow-hidden max-h-48 bg-slate-900 border border-slate-200">
                      <img src={item.imageUrl} alt={item.title} className="w-full h-48 object-cover" />
                      {item.yoloBoxes.map((box) => (
                        <div
                          key={box.id}
                          style={{
                            top: `${box.topPercent}%`,
                            left: `${box.leftPercent}%`,
                            width: `${box.widthPercent}%`,
                            height: `${box.heightPercent}%`,
                          }}
                          className="absolute border-2 border-red-500 bg-red-500/20 pointer-events-none"
                        >
                          <span className="absolute -top-4 left-0 bg-red-600 text-white text-[8px] font-mono px-1 rounded font-bold whitespace-nowrap">
                            YOLO: {box.label} ({box.confidence.toFixed(1)}%)
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-[11px] space-y-1">
                      <span className="font-semibold text-slate-700 block">Accessibility Impact if Approved:</span>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="text-sky-800">
                          ♿ <b>Wheelchair Profile:</b> Will detour around this zone ({item.affectsWheelchairs ? 'Hard blocked: inf' : 'Standard'}).
                        </div>
                        <div className="text-emerald-800">
                          🦯 <b>Crutches Profile:</b> Will assign high penalty (W_stairs = 150.0 / W_obs = 40.0).
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-800">
                      <span className="size-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span><b>Current Live Map Status:</b> Path is <b>OPEN &amp; CLEARED</b>. It will only show closed once confirmed via the button below.</span>
                    </div>

                    <div className="pt-1 flex items-center justify-between">
                      <button
                        onClick={() => adminRejectItem(item.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <X className="size-3.5" />
                        <span>Reject (False Positive)</span>
                      </button>

                      <button
                        onClick={() => adminApproveAndDeploy(item)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow transition-all"
                      >
                        <UserCheck className="size-4" />
                        <span>Approve & Stream WebSocket Reroute</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 11. YOUTUBE 3D MAP SYNTHESIZER MODAL */}
      {/* --------------------------------------------------------------------- */}
      {isYoutubeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-slate-900 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl bg-gradient-to-br from-red-600 to-rose-600 text-white flex items-center justify-center shadow font-bold">
                  <Play className="size-5 fill-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2 text-slate-900">
                    <span>Construct 3D Map from YouTube Walkthrough</span>
                    <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                      Gemini Spatial AI
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Enter any YouTube walkthrough tour URL to reconstruct an interactive 3D spatial map with multi-level floors, accessible elevators, escalators, and route planning.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isSynthesizing) setIsYoutubeModalOpen(false);
                }}
                disabled={isSynthesizing}
                className="size-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* URL Input Form */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-700 block">
                YouTube Tour Video URL (e.g. SRM Campus Tour, DLF Mall, Dubai Mall, Airport, or any indoor tour):
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Link2 className="size-4 text-red-500" />
                  </div>
                  <input
                    type="text"
                    value={youtubeInputUrl}
                    onChange={(e) => setYoutubeInputUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSynthesizing && youtubeInputUrl.trim()) {
                        handleSynthesizeFromYouTube();
                      }
                    }}
                    placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
                    disabled={isSynthesizing}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 font-mono shadow-sm"
                  />
                </div>
                <button
                  onClick={() => handleSynthesizeFromYouTube()}
                  disabled={isSynthesizing || !youtubeInputUrl.trim()}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow ${
                    isSynthesizing || !youtubeInputUrl.trim()
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer active:scale-95'
                  }`}
                >
                  {isSynthesizing ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4 text-amber-300" />}
                  <span>{isSynthesizing ? 'Synthesizing...' : 'Build 3D Map'}</span>
                </button>
              </div>

              {synthesisError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="size-4 text-rose-600 shrink-0" />
                  <span>{synthesisError}</span>
                </div>
              )}
            </div>

            {/* Synthesis Active Progress Status */}
            {isSynthesizing && (
              <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-3 text-center">
                <RefreshCw className="size-8 text-indigo-600 animate-spin mx-auto" />
                <div>
                  <h4 className="font-bold text-sm text-indigo-950">Constructing 3D Digital Twin...</h4>
                  <p className="text-xs text-indigo-700 mt-1 font-mono">{synthesisStage}</p>
                </div>
                <div className="w-full bg-indigo-100 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-500 via-indigo-500 to-emerald-500 animate-pulse w-3/4"></div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Mapping store positions, vertical elevation planes, step-free glass lifts, escalators, and wheelchair clearance rules.
                </p>
              </div>
            )}

            {/* Quick 1-Click Popular YouTube Walkthrough Tours */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Globe className="size-3.5 text-indigo-600" />
                  Or Select a Popular Verified Walkthrough Tour:
                </span>
                <span className="text-[10px] text-slate-500">1-Click Instant 3D Reconstruction</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.values(PRESET_VENUES).map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => {
                      if (!isSynthesizing) {
                        setYoutubeInputUrl(preset.youtubeUrl);
                        handleSynthesizeFromYouTube(preset.youtubeUrl);
                      }
                    }}
                    className={`group p-3 rounded-2xl border text-left cursor-pointer transition-all shadow-sm ${
                      currentVenue.id === preset.id
                        ? 'bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500'
                        : 'bg-white border-slate-200 hover:border-slate-400 hover:shadow-md'
                    }`}
                  >
                    <div className="relative rounded-xl overflow-hidden h-24 mb-2 bg-slate-100">
                      <img
                        src={preset.thumbnailUrl}
                        alt={preset.venueName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2">
                        <div className="flex items-center gap-1 text-[10px] text-white font-mono bg-red-600 px-1.5 py-0.5 rounded shadow-sm">
                          <Play className="size-2.5 fill-white" />
                          <span>YouTube Tour</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {preset.venueName}
                      </h4>
                      {currentVenue.id === preset.id && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-mono shrink-0 font-semibold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{preset.venueSubtitle}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-2 font-mono">
                      <span>{preset.zones.length} Zones</span>
                      <span>•</span>
                      <span>{preset.floors.length} Floors</span>
                      <span>•</span>
                      <span className="text-emerald-600 font-semibold">Step-free Lift</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How it Works Footer Note */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="size-3 text-amber-500" />
                How YouTube to 3D Navigation Works:
              </div>
              <p>
                Our backend analyzes the tour video stream, timestamps, and architectural waypoints using Gemini 3.8 Flash to synthesize a connected multi-floor spatial graph. Once built, you can pick any source &amp; destination to calculate paths for Wheelchairs, Crutches, or Able-bodied visitors.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
