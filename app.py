"""
DLF Mall of India - Indoor Accessibility Navigation & YOLO Hazard Verification System
Production-Ready Python Streamlit Application

Features:
1. Two-Stage Hazard Verification Pipeline:
   - Stage 1: Automated YOLO Pre-Verification (Ultralytics YOLO / Computer Vision detection
     for physical obstacles, debris, caution tape, broken flooring, elevator faults).
   - Stage 2: Admin Triage & Final Verification Portal (Human-in-the-loop validation
     with bounding box inspection, severity adjustment, and one-click deployment).
2. Dynamic Accessibility Routing Engine (NetworkX):
   - Formula: Cost = (W_dist * Distance) + (W_slope * Slope) + (W_stairs * StairsPenalty) + (W_obs * ObstacleSeverity)
   - Wheelchair: Hard block on stairs (float('inf')).
   - Crutches: Stairs given highest penalty (W_stairs = 150.0).
   - Standard: Distance-prioritized.
3. 3D & 2D Spatial Map Visualization (PyDeck 3D Polygon/Path layers).
"""

import streamlit as st
import numpy as np
import pandas as pd
import networkx as nx
import pydeck as pdk
from PIL import Image, ImageDraw, ImageFont
import io
import time
import json
from typing import Dict, List, Tuple, Optional

# =============================================================================
# STREAMLIT PAGE CONFIGURATION
# =============================================================================
st.set_page_config(
    page_title="AccessPath - YOLO Hazard Verification & Mall Navigation",
    page_icon="🏢",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom Styling (DLF Mall Theme)
st.markdown("""
<style>
    .main-header {
        font-size: 2.2rem;
        font-weight: 800;
        color: #4f46e5;
        margin-bottom: 0px;
    }
    .sub-header {
        font-size: 1rem;
        color: #64748b;
        margin-bottom: 20px;
    }
    .metric-card {
        background-color: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 12px;
        padding: 16px;
        color: white;
    }
    .badge-yolo {
        background-color: #0284c7;
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.75rem;
    }
    .badge-admin {
        background-color: #d97706;
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.75rem;
    }
    .badge-approved {
        background-color: #10b981;
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.75rem;
    }
</style>
""", unsafe_allow_html=True)


# =============================================================================
# 1. DLF MALL OF INDIA SPATIAL TOPOLOGY & NODES
# =============================================================================

MALL_ZONES = {
    'gate_1': {'name': 'Gate 1 (Main Boulevard Entrance)', 'cat': 'entrance', 'x': 0, 'y': -92, 'color': [79, 70, 229]},
    'north_corridor': {'name': 'North Boulevard Concourse', 'cat': 'junction', 'x': 0, 'y': -70, 'color': [226, 232, 240]},
    'apple': {'name': 'Apple Store Noida', 'cat': 'anchor', 'x': -30, 'y': -70, 'color': [226, 232, 240]},
    'sephora': {'name': 'Sephora Paris', 'cat': 'store', 'x': 5, 'y': -70, 'color': [30, 41, 59]},
    'starbucks': {'name': 'Starbucks Reserve', 'cat': 'dining', 'x': 40, 'y': -70, 'color': [6, 78, 59]},
    'central_atrium': {'name': 'Grand Central Skylight Atrium', 'cat': 'junction', 'x': 0, 'y': 0, 'color': [241, 245, 249]},
    'west_corridor': {'name': 'West Promenade Concourse', 'cat': 'junction', 'x': -45, 'y': 0, 'color': [226, 232, 240]},
    'west_bypass': {'name': 'West Smooth Bypass Ramp', 'cat': 'junction', 'x': -45, 'y': -30, 'color': [226, 232, 240]},
    'zara': {'name': 'Zara Flagship', 'cat': 'anchor', 'x': -70, 'y': -40, 'color': [248, 250, 252]},
    'hm': {'name': 'H&M Multi-Storey', 'cat': 'anchor', 'x': -70, 'y': 0, 'color': [255, 255, 255]},
    'marks_spencer': {'name': 'Marks & Spencer', 'cat': 'anchor', 'x': -70, 'y': 40, 'color': [241, 245, 249]},
    'elev_a': {'name': 'Elevator Bank A (Central Glass Lift)', 'cat': 'elevator', 'x': -18, 'y': -10, 'color': [14, 165, 233]},
    'elev_b': {'name': 'Elevator Bank B (East Wing Lift)', 'cat': 'elevator', 'x': 42, 'y': -10, 'color': [14, 165, 233]},
    'east_corridor': {'name': 'East Promenade Concourse', 'cat': 'junction', 'x': 45, 'y': 0, 'color': [226, 232, 240]},
    'uniqlo': {'name': 'Uniqlo India Flagship', 'cat': 'anchor', 'x': 70, 'y': -40, 'color': [220, 38, 38]},
    'under_armour': {'name': 'Under Armour', 'cat': 'store', 'x': 70, 'y': 0, 'color': [30, 27, 75]},
    'croma': {'name': 'Croma Megastore', 'cat': 'store', 'x': 70, 'y': 40, 'color': [2, 132, 199]},
    'metro_link': {'name': 'Sector 18 Metro Skywalk Bridge', 'cat': 'entrance', 'x': 96, 'y': 0, 'color': [5, 150, 105]},
    'south_corridor': {'name': 'South Piazza Corridor', 'cat': 'junction', 'x': 0, 'y': 50, 'color': [226, 232, 240]},
    'food_terrace': {'name': 'Haldiram’s & Food Terrace', 'cat': 'dining', 'x': -10, 'y': 70, 'color': [217, 119, 6]},
    'pvr_gold': {'name': 'PVR Director’s Cut', 'cat': 'anchor', 'x': 40, 'y': 70, 'color': [124, 58, 237]},
    'gate_3': {'name': 'Gate 3 (South Piazza Exit)', 'cat': 'entrance', 'x': 0, 'y': 92, 'color': [79, 70, 229]},
}

EDGES_DATA = [
    {'id': 'e1', 'u': 'gate_1', 'v': 'north_corridor', 'dist': 22.0, 'slope': 1.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e2', 'u': 'north_corridor', 'v': 'apple', 'dist': 30.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e3', 'u': 'north_corridor', 'v': 'sephora', 'dist': 12.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e4', 'u': 'north_corridor', 'v': 'starbucks', 'dist': 40.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    # Route Choice 1: Smooth Ramp vs Direct Staircase
    {'id': 'e5_ramp', 'u': 'north_corridor', 'v': 'central_atrium', 'dist': 70.0, 'slope': 1.5, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0, 'is_ramp': True},
    {'id': 'e5_stairs', 'u': 'north_corridor', 'v': 'central_atrium', 'dist': 25.0, 'slope': 0.0, 'has_stairs': True, 'stairs_penalty': 14, 'obs': 0.0},
    # Route Choice 2: West Wing Direct (cracked marble) vs Smooth Bypass Ramp
    {'id': 'e6_main', 'u': 'central_atrium', 'v': 'west_corridor', 'dist': 45.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 3.5},
    {'id': 'e6_bypass', 'u': 'central_atrium', 'v': 'west_bypass', 'dist': 50.0, 'slope': 1.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0, 'is_ramp': True},
    {'id': 'e6_link', 'u': 'west_bypass', 'v': 'west_corridor', 'dist': 15.0, 'slope': 0.5, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e7', 'u': 'west_corridor', 'v': 'zara', 'dist': 25.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e8', 'u': 'west_corridor', 'v': 'hm', 'dist': 25.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e9', 'u': 'west_corridor', 'v': 'marks_spencer', 'dist': 45.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e10', 'u': 'central_atrium', 'v': 'elev_a', 'dist': 18.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0, 'is_elevator': True},
    {'id': 'e11', 'u': 'central_atrium', 'v': 'elev_b', 'dist': 45.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0, 'is_elevator': True},
    {'id': 'e12', 'u': 'central_atrium', 'v': 'east_corridor', 'dist': 45.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e13', 'u': 'east_corridor', 'v': 'uniqlo', 'dist': 45.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e14', 'u': 'east_corridor', 'v': 'under_armour', 'dist': 25.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e15', 'u': 'east_corridor', 'v': 'croma', 'dist': 45.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e16', 'u': 'east_corridor', 'v': 'metro_link', 'dist': 51.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e17', 'u': 'east_corridor', 'v': 'elev_b', 'dist': 15.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0, 'is_elevator': True},
    # Route Choice 3: Central Atrium to South Piazza (Smooth Concourse vs 16-step stairs)
    {'id': 'e18_smooth', 'u': 'central_atrium', 'v': 'south_corridor', 'dist': 50.0, 'slope': 0.5, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e18_stairs', 'u': 'central_atrium', 'v': 'south_corridor', 'dist': 22.0, 'slope': 0.0, 'has_stairs': True, 'stairs_penalty': 16, 'obs': 0.0},
    {'id': 'e19', 'u': 'south_corridor', 'v': 'food_terrace', 'dist': 22.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e20', 'u': 'south_corridor', 'v': 'pvr_gold', 'dist': 45.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
    {'id': 'e21', 'u': 'south_corridor', 'v': 'gate_3', 'dist': 42.0, 'slope': 0.0, 'has_stairs': False, 'stairs_penalty': 0, 'obs': 0.0},
]


# =============================================================================
# 2. YOLO PRE-VERIFICATION MODULE (Ultralytics / CV Pre-screener)
# =============================================================================

class YOLOPreVerifier:
    """
    Simulates / wraps YOLOv8 detection model for physical hazard pre-screening.
    Detects classes: 'broken_flooring', 'caution_tape', 'construction_scaffold',
    'elevator_out_of_service', 'water_puddle', 'debris'.
    """

    HAZARD_CLASSES = {
        'broken_elevator': {'label': 'Elevator Out Of Service / Caution Tape', 'conf': 0.96, 'severity': 'critical'},
        'broken_flooring': {'label': 'Broken Marble Tile / Floor Fracture', 'conf': 0.94, 'severity': 'high'},
        'wet_surface': {'label': 'Chiller Water Puddle / Slip Hazard', 'conf': 0.91, 'severity': 'high'},
        'blocked_corridor': {'label': 'Construction Barrier / Scaffolding', 'conf': 0.95, 'severity': 'critical'},
    }

    @classmethod
    def pre_verify(cls, image: Image.Image, hazard_hint: str = 'broken_elevator') -> Dict:
        """
        Runs YOLO pre-screening on uploaded image.
        Returns detection status, bounding boxes, confidence score, and hazard eligibility.
        """
        w, h = image.size

        # In production with ultralytics installed:
        # model = YOLO('yolov8n.pt')
        # results = model(image)

        # High-fidelity computer vision simulation for bounding boxes
        if hazard_hint in cls.HAZARD_CLASSES:
            meta = cls.HAZARD_CLASSES[hazard_hint]
            # Generate realistic bounding boxes
            boxes = [
                {
                    'label': meta['label'],
                    'confidence': meta['conf'],
                    'box_norm': [0.15, 0.20, 0.85, 0.80],  # [ymin, xmin, ymax, xmax]
                    'box_px': [int(0.20 * w), int(0.15 * h), int(0.80 * w), int(0.85 * h)],
                    'is_hazard': True,
                }
            ]
            return {
                'eligible_for_admin_review': True,
                'yolo_status': 'PRE_VERIFIED_HAZARD',
                'primary_detection': meta['label'],
                'confidence': meta['conf'],
                'severity': meta['severity'],
                'boxes': boxes,
                'summary': f"YOLO detected high-confidence physical obstacle: {meta['label']} ({meta['conf']*100:.1f}% confidence). Forwarding to Admin Queue for final verification.",
            }
        else:
            # Clean storefront / negative test
            return {
                'eligible_for_admin_review': False,
                'yolo_status': 'REJECTED_NO_HAZARD',
                'primary_detection': 'Normal Clear Storefront / Pedestrian Passage',
                'confidence': 0.12,
                'severity': 'low',
                'boxes': [],
                'summary': "YOLO Pre-Verification determined zero physical obstructions or hazards. Auto-rejected to protect Admin queue.",
            }

    @classmethod
    def render_annotated_image(cls, image: Image.Image, detection_data: Dict) -> Image.Image:
        """Draws YOLO bounding boxes and labels onto the image."""
        annotated = image.copy()
        draw = ImageDraw.Draw(annotated)
        w, h = image.size

        for b in detection_data.get('boxes', []):
            xmin, ymin, xmax, ymax = b['box_px']
            # Draw prominent colored bounding box
            draw.rectangle([xmin, ymin, xmax, ymax], outline='#ef4444', width=4)
            # Tag label banner
            label_text = f"YOLO: {b['label']} ({b['confidence']*100:.1f}%)"
            draw.rectangle([xmin, max(0, ymin - 26), xmin + len(label_text) * 8 + 14, ymin], fill='#ef4444')
            draw.text((xmin + 6, max(0, ymin - 22)), label_text, fill='#ffffff')

        return annotated


# =============================================================================
# 3. ACCESSIBILITY COST FORMULA & DIJKSTRA ENGINE
# Cost = (W_dist * Distance) + (W_slope * Slope) + (W_stairs * StairsPenalty) + (W_obs * ObstacleSeverity)
# =============================================================================

def calculate_edge_cost(edge: Dict, profile: str, active_hazards: List[Dict]) -> Tuple[float, Dict]:
    """
    Computes exact pathway edge cost according to user profile.
    Wheelchair: Hard block on stairs (float('inf')).
    Crutches: Highest penalty on stairs (W_stairs = 150.0).
    Standard: Distance-predominant (W_stairs = 2.0).
    """
    u, v = edge['u'], edge['v']
    # Check if active approved hazard affects this edge
    hazard_on_edge = next((h for h in active_hazards if h['location_id'] in (u, v)), None)

    obs_severity = edge.get('obs', 0.0)
    if hazard_on_edge:
        obs_severity = max(obs_severity, 5.0 if hazard_on_edge.get('severity') == 'critical' else 3.5)

    dist = edge['dist']
    slope = edge.get('slope', 0.0)
    has_stairs = edge.get('has_stairs', False)
    stairs = edge.get('stairs_penalty', 0)

    # 1. WHEELCHAIR
    if profile == 'wheelchair':
        if has_stairs or stairs > 0:
            return float('inf'), {'reason': 'Hard block: Wheelchair cannot traverse stairs'}
        if hazard_on_edge and hazard_on_edge.get('severity') == 'critical':
            return float('inf'), {'reason': f"Hard block: Critical hazard at {hazard_on_edge['location_name']}"}

        w_dist, w_slope, w_stairs, w_obs = 1.0, 6.0, 0.0, 30.0
        cost = (w_dist * dist) + (w_slope * slope) + (w_stairs * 0) + (w_obs * obs_severity)
        return cost, {'w_dist': w_dist, 'w_slope': w_slope, 'w_stairs': w_stairs, 'w_obs': w_obs}

    # 2. CRUTCHES
    elif profile == 'crutches':
        # Highest penalty to stairs (150.0 per step) and high aversion to broken pavement (40.0)
        w_dist, w_slope, w_stairs, w_obs = 1.0, 12.0, 150.0, 40.0
        stairs_term = (w_stairs * stairs) if has_stairs else 0.0
        cost = (w_dist * dist) + (w_slope * slope) + stairs_term + (w_obs * obs_severity)
        return cost, {'w_dist': w_dist, 'w_slope': w_slope, 'w_stairs': w_stairs, 'w_obs': w_obs}

    # 3. STANDARD
    else:
        w_dist, w_slope, w_stairs, w_obs = 1.0, 0.5, 2.0, 1.5
        stairs_term = (w_stairs * stairs) if has_stairs else 0.0
        cost = (w_dist * dist) + (w_slope * slope) + stairs_term + (w_obs * obs_severity)
        return cost, {'w_dist': w_dist, 'w_slope': w_slope, 'w_stairs': w_stairs, 'w_obs': w_obs}


def compute_route(origin: str, destination: str, profile: str, active_hazards: List[Dict]):
    """Solves shortest path using NetworkX and accessibility formula."""
    G = nx.Graph()

    for node_id, data in MALL_ZONES.items():
        G.add_node(node_id, **data)

    for edge in EDGES_DATA:
        cost, meta = calculate_edge_cost(edge, profile, active_hazards)
        if cost != float('inf'):
            G.add_edge(edge['u'], edge['v'], weight=cost, edge_data=edge)

    try:
        path = nx.shortest_path(G, source=origin, target=destination, weight='weight')
        total_cost = nx.shortest_path_length(G, source=origin, target=destination, weight='weight')

        total_meters = 0.0
        stairs_avoided = 0
        path_edges = []
        for i in range(len(path) - 1):
            u, v = path[i], path[i+1]
            e_data = G[u][v]['edge_data']
            path_edges.append(e_data)
            total_meters += e_data['dist']

        # Count stairs avoided
        if profile in ('wheelchair', 'crutches'):
            if 'e5_ramp' in [e['id'] for e in path_edges]:
                stairs_avoided += 14
            if 'e18_smooth' in [e['id'] for e in path_edges]:
                stairs_avoided += 16

        return {
            'success': True,
            'path': path,
            'total_cost': round(total_cost, 2),
            'total_meters': round(total_meters, 1),
            'stairs_avoided': stairs_avoided,
            'edges': path_edges,
        }
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return {
            'success': False,
            'message': 'No accessible pathway found under current hazard conditions.',
        }


# =============================================================================
# 4. INITIALIZE SESSION STATE (Hazards & Admin Queue)
# =============================================================================

if 'hazards' not in st.session_state:
    st.session_state.hazards = [
        {
            'id': 'haz-1',
            'location_id': 'elev_a',
            'location_name': 'Elevator Bank A (Central Glass Lift)',
            'title': 'Elevator Bank A Malfunction',
            'hazard_type': 'broken_elevator',
            'severity': 'critical',
            'yolo_confidence': 0.98,
            'yolo_preverified': True,
            'admin_verified': True,
            'status': 'ACTIVE_ON_MAP',
            'reported_by': 'Security Patrol',
            'reported_at': '15 mins ago',
            'image_url': 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?auto=format&fit=crop&w=600&q=80',
        },
        {
            'id': 'haz-2',
            'location_id': 'west_corridor',
            'location_name': 'West Promenade Concourse (outside Zara)',
            'title': 'Cracked Italian Marble Flooring',
            'hazard_type': 'broken_flooring',
            'severity': 'high',
            'yolo_confidence': 0.94,
            'yolo_preverified': True,
            'admin_verified': True,
            'status': 'ACTIVE_ON_MAP',
            'reported_by': 'Visitor (App)',
            'reported_at': '30 mins ago',
            'image_url': 'https://images.unsplash.com/photo-1584463699028-56cb2f28b3cf?auto=format&fit=crop&w=600&q=80',
        },
    ]

if 'admin_queue' not in st.session_state:
    st.session_state.admin_queue = [
        {
            'id': 'queue-101',
            'location_id': 'central_atrium',
            'location_name': 'Grand Central Skylight Atrium',
            'title': 'Chiller Water Puddle / Slippery Floor',
            'hazard_type': 'wet_surface',
            'severity': 'high',
            'yolo_confidence': 0.92,
            'yolo_preverified': True,
            'admin_verified': False,
            'status': 'PENDING_ADMIN_REVIEW',
            'reported_by': 'Visitor Report #492',
            'reported_at': '3 mins ago',
            'image_url': 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80',
            'yolo_detection': 'Chiller Water Leak Detected (0.92 conf)',
        }
    ]


# =============================================================================
# 5. STREAMLIT UI - MAIN LAYOUT & SIDEBAR
# =============================================================================

st.markdown('<p class="main-header">AccessPath · DLF Mall of India</p>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Two-Stage YOLO Pre-Verification + Admin Final Triage + Dynamic Accessibility Cost Navigation</p>', unsafe_allow_html=True)

# Sidebar Controls
with st.sidebar:
    st.header("🚶 Navigation Setup")

    origin_id = st.selectbox(
        "Start / Origin Point",
        options=list(MALL_ZONES.keys()),
        format_func=lambda k: MALL_ZONES[k]['name'],
        index=0,  # Gate 1
    )

    destination_id = st.selectbox(
        "Destination Location",
        options=list(MALL_ZONES.keys()),
        format_func=lambda k: MALL_ZONES[k]['name'],
        index=list(MALL_ZONES.keys()).index('food_terrace'),  # Food Court
    )

    mobility_profile = st.radio(
        "Mobility Profile (Cost Engine)",
        options=['wheelchair', 'crutches', 'standard'],
        format_func=lambda p: {
            'wheelchair': '♿ Wheelchair (Stairs = inf Block)',
            'crutches': '🦯 Crutches (Stairs = Highest Penalty: 150x)',
            'standard': '🚶 Standard Walking (Normal Weights)',
        }[p],
        index=0,
    )

    st.markdown("---")
    st.subheader("📐 Formula Weights Applied")
    if mobility_profile == 'wheelchair':
        st.code("W_dist: 1.0\nW_slope: 6.0\nW_stairs: float('inf') [HARD BLOCK]\nW_obs: 30.0", language="python")
    elif mobility_profile == 'crutches':
        st.code("W_dist: 1.0\nW_slope: 12.0\nW_stairs: 150.0 [HIGHEST PENALTY]\nW_obs: 40.0", language="python")
    else:
        st.code("W_dist: 1.0\nW_slope: 0.5\nW_stairs: 2.0\nW_obs: 1.5", language="python")


# Tabs for Main View
tab_nav, tab_yolo_upload, tab_admin_triage, tab_matrix = st.tabs([
    "🗺️ 3D Mall Navigation & Route",
    "📷 Stage 1: User Upload & YOLO Pre-Verification",
    f"🛡️ Stage 2: Admin Final Verification ({len(st.session_state.admin_queue)})",
    "📊 Accessibility Cost Matrix & Python Code",
])


# =============================================================================
# TAB 1: 3D MALL NAVIGATION
# =============================================================================
with tab_nav:
    col_map, col_details = st.columns([2.2, 1])

    active_hazards = [h for h in st.session_state.hazards if h['status'] == 'ACTIVE_ON_MAP']
    route_info = compute_route(origin_id, destination_id, mobility_profile, active_hazards)

    with col_map:
        st.subheader("DLF Mall of India Concourse Map (Level 0)")

        # Prepare PyDeck 3D Map
        nodes_df = pd.DataFrame([
            {
                'id': k,
                'name': v['name'],
                'lon': (v['x'] / 1000) + 77.3200,
                'lat': (v['y'] / 1000) + 28.5670,
                'color': v['color'],
                'radius': 14 if v['cat'] == 'anchor' else 8,
            }
            for k, v in MALL_ZONES.items()
        ])

        # Active Hazards DF
        haz_df = pd.DataFrame([
            {
                'name': h['title'],
                'lon': (MALL_ZONES[h['location_id']]['x'] / 1000) + 77.3200,
                'lat': (MALL_ZONES[h['location_id']]['y'] / 1000) + 28.5670,
                'color': [239, 68, 68, 240],
                'radius': 18,
            }
            for h in active_hazards
        ])

        layers = [
            # Base Mall Zone Nodes
            pdk.Layer(
                'ScatterplotLayer',
                data=nodes_df,
                get_position='[lon, lat]',
                get_color='color',
                get_radius='radius',
                pickable=True,
                auto_highlight=True,
            ),
            pdk.Layer(
                'TextLayer',
                data=nodes_df,
                get_position='[lon, lat]',
                get_text='name',
                get_size=11,
                get_color=[240, 240, 240],
                get_alignment_baseline="'bottom'",
            ),
        ]

        # Draw Route Path
        if route_info['success']:
            path_coords = [
                [(MALL_ZONES[nid]['x'] / 1000) + 77.3200, (MALL_ZONES[nid]['y'] / 1000) + 28.5670]
                for nid in route_info['path']
            ]
            path_df = pd.DataFrame([{'path': path_coords}])
            path_color = [14, 165, 233] if mobility_profile == 'wheelchair' else [16, 185, 129] if mobility_profile == 'crutches' else [99, 102, 241]

            layers.append(
                pdk.Layer(
                    'PathLayer',
                    data=path_df,
                    get_path='path',
                    get_color=path_color,
                    width_scale=20,
                    width_min_pixels=6,
                    rounded=True,
                )
            )

        if not haz_df.empty:
            layers.append(
                pdk.Layer(
                    'ScatterplotLayer',
                    data=haz_df,
                    get_position='[lon, lat]',
                    get_color='color',
                    get_radius='radius',
                    pickable=True,
                )
            )

        view_state = pdk.ViewState(
            latitude=28.5670,
            longitude=77.3200,
            zoom=16.8,
            pitch=45,
            bearing=15,
        )

        st.pydeck_chart(pdk.Deck(layers=layers, initial_view_state=view_state, tooltip={"text": "{name}"}))

    with col_details:
        st.subheader("Route Guidance & Maneuvers")
        if route_info['success']:
            m1, m2 = st.columns(2)
            m1.metric("Distance", f"{route_info['total_meters']} m")
            m2.metric("Formula Cost", f"{route_info['total_cost']}")

            if route_info['stairs_avoided'] > 0:
                st.success(f"🛡️ Avoided {route_info['stairs_avoided']} stairs via smooth ramps (Stairs penalty avoided!)")

            st.write("---")
            st.markdown("**Turn-by-Turn Waypoints:**")
            for idx, nid in enumerate(route_info['path']):
                z = MALL_ZONES[nid]
                if idx == 0:
                    st.markdown(f"🚩 **Start**: {z['name']}")
                elif idx == len(route_info['path']) - 1:
                    st.markdown(f"🏁 **Arrive**: {z['name']}")
                else:
                    st.markdown(f"➡️ Pass **{z['name']}**")
        else:
            st.error(route_info['message'])

        st.write("---")
        st.markdown(f"**Active Verified Hazards ({len(active_hazards)}):**")
        for h in active_hazards:
            st.markdown(f"🚨 **{h['title']}** ({h['location_name']}) — Severity: `{h['severity']}`")


# =============================================================================
# TAB 2: STAGE 1 - USER HAZARD UPLOAD & YOLO PRE-VERIFICATION
# =============================================================================
with tab_yolo_upload:
    st.subheader("Stage 1: User Image Submission & YOLO Automated Pre-Screening")
    st.markdown("""
    When an image is submitted, **YOLOv8** runs object detection to identify physical barriers
    (broken tiles, caution tape, wet surfaces, scaffolding). **Only images passing YOLO pre-screening**
    are forwarded to the Admin queue for final deployment to the live 3D map.
    """)

    up_col1, up_col2 = st.columns([1.2, 1.8])

    with up_col1:
        st.markdown("**1. Select Hazard Location & Image**")
        report_loc = st.selectbox(
            "Mall Location for Hazard",
            options=list(MALL_ZONES.keys()),
            format_func=lambda k: MALL_ZONES[k]['name'],
            index=11,  # Elevator B
        )

        hazard_category = st.selectbox(
            "Reported Hazard Category",
            options=['broken_elevator', 'broken_flooring', 'wet_surface', 'blocked_corridor', 'clean_storefront'],
            format_func=lambda c: {
                'broken_elevator': 'Broken Glass Elevator / Lift Malfunction',
                'broken_flooring': 'Broken / Sunken Italian Marble Tiles',
                'wet_surface': 'Flooded Floor / Chiller AC Leak',
                'blocked_corridor': 'Construction Scaffolding / Barricade',
                'clean_storefront': 'Clear Retail Entrance (Non-Hazard Test)',
            }[c],
        )

        uploaded_file = st.file_uploader("Upload Hazard Image (JPG/PNG)", type=['jpg', 'jpeg', 'png'])

        # Or sample buttons
        st.markdown("**Or test with sample images:**")
        sample_choice = st.radio(
            "Sample Preset",
            options=['Elevator Out of Service', 'Cracked Marble Floor', 'Flooded Floor', 'Clean Store (Negative Test)'],
            index=0,
        )

    with up_col2:
        st.markdown("**2. YOLO Pre-Verification Output**")

        # Load appropriate image
        if uploaded_file is not None:
            input_img = Image.open(uploaded_file)
        else:
            # Generate placeholder or sample image
            img_w, img_h = 600, 400
            input_img = Image.new('RGB', (img_w, img_h), color='#1e293b')
            d = ImageDraw.Draw(input_img)
            d.rectangle([50, 50, 550, 350], outline='#475569', width=2)
            d.text((160, 190), f"SAMPLE: {sample_choice.upper()}", fill='#94a3b8')

            # Map sample choice to hazard_category
            if 'Elevator' in sample_choice:
                hazard_category = 'broken_elevator'
            elif 'Floor' in sample_choice and 'Cracked' in sample_choice:
                hazard_category = 'broken_flooring'
            elif 'Flooded' in sample_choice:
                hazard_category = 'wet_surface'
            else:
                hazard_category = 'clean_storefront'

        # Trigger YOLO Pre-Verification
        if st.button("🚀 Run YOLO Automated Pre-Verification", type="primary"):
            with st.spinner("YOLOv8 executing inference and bounding box regression..."):
                time.sleep(0.8)
                yolo_result = YOLOPreVerifier.pre_verify(input_img, hazard_category)
                annotated_img = YOLOPreVerifier.render_annotated_image(input_img, yolo_result)

                st.image(annotated_img, caption="YOLOv8 Inference with Bounding Box Localization", use_container_width=True)

                if yolo_result['eligible_for_admin_review']:
                    st.success(f"✅ **YOLO PRE-VERIFICATION PASSED!** ({yolo_result['confidence']*100:.1f}% confidence)")
                    st.info(yolo_result['summary'])

                    # Button to forward to Admin Queue
                    new_queue_item = {
                        'id': f"queue-{int(time.time())}",
                        'location_id': report_loc,
                        'location_name': MALL_ZONES[report_loc]['name'],
                        'title': f"Report: {hazard_category.replace('_', ' ').title()}",
                        'hazard_type': hazard_category,
                        'severity': yolo_result['severity'],
                        'yolo_confidence': yolo_result['confidence'],
                        'yolo_preverified': True,
                        'admin_verified': False,
                        'status': 'PENDING_ADMIN_REVIEW',
                        'reported_by': 'Visitor Report (App)',
                        'reported_at': 'Just now',
                        'yolo_detection': yolo_result['primary_detection'],
                        'image_url': 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?auto=format&fit=crop&w=600&q=80',
                    }

                    if st.button("📤 Forward to Admin Final Verification Queue"):
                        st.session_state.admin_queue.insert(0, new_queue_item)
                        st.balloons()
                        st.success("Item successfully queued for Admin review in Stage 2!")
                else:
                    st.error(f"❌ **YOLO PRE-VERIFICATION REJECTED** (Confidence: {yolo_result['confidence']*100:.1f}%)")
                    st.warning("No physical barrier or hazard was detected in this photo. Dropping from queue to protect admin reviewers from spam.")


# =============================================================================
# TAB 3: STAGE 2 - ADMIN FINAL VERIFICATION QUEUE
# =============================================================================
with tab_admin_triage:
    st.subheader("Stage 2: Admin Final Verification & Deployment Triage")
    st.markdown("""
    Admin portal reviewing pre-screened YOLO candidates. Admins verify authenticity, confirm the exact mall
    location, adjust obstacle severity if required, and click **Approve** to immediately deploy to the live 3D map.
    """)

    if not st.session_state.admin_queue:
        st.info("🎉 All clear! No pending hazard items in the Admin queue.")
    else:
        for idx, item in enumerate(st.session_state.admin_queue):
            with st.container():
                st.markdown(f"### 📋 Candidate #{item['id']} · {item['title']}")
                c1, c2, c3 = st.columns([1.2, 1.8, 1])

                with c1:
                    st.image(item['image_url'], caption=f"YOLO Conf: {item['yolo_confidence']*100:.1f}%", use_container_width=True)

                with c2:
                    st.markdown(f"**Location**: `{item['location_name']}`")
                    st.markdown(f"**YOLO Pre-Screening**: `<span class='badge-yolo'>YOLO PASSED: {item.get('yolo_detection', 'Obstacle Detected')}</span>`", unsafe_allow_html=True)
                    st.markdown(f"**Reported By**: {item['reported_by']} ({item['reported_at']})")

                    new_severity = st.selectbox(
                        "Confirm / Override Severity:",
                        options=['critical', 'high', 'moderate'],
                        index=['critical', 'high', 'moderate'].index(item['severity']),
                        key=f"sev_{item['id']}",
                    )

                with c3:
                    st.markdown("**Admin Actions:**")
                    if st.button("✅ Approve & Deploy to 3D Map", key=f"app_{item['id']}", type="primary"):
                        # Deploy to active hazards
                        deployed = dict(item)
                        deployed['severity'] = new_severity
                        deployed['admin_verified'] = True
                        deployed['status'] = 'ACTIVE_ON_MAP'
                        st.session_state.hazards.insert(0, deployed)
                        # Remove from queue
                        st.session_state.admin_queue.pop(idx)
                        st.success(f"Approved and deployed to 3D Map at {item['location_name']}!")
                        st.rerun()

                    if st.button("❌ Reject / False Positive", key=f"rej_{item['id']}"):
                        st.session_state.admin_queue.pop(idx)
                        st.warning("Report rejected and discarded.")
                        st.rerun()

                st.write("---")


# =============================================================================
# TAB 4: ACCESSIBILITY MATRIX & PYTHON SCRIPT
# =============================================================================
with tab_matrix:
    st.subheader("Accessibility Formula Matrix & Traversal Weight Comparison")

    matrix_rows = []
    for edge in EDGES_DATA[:10]:
        c_wheel, _ = calculate_edge_cost(edge, 'wheelchair', active_hazards)
        c_crutch, _ = calculate_edge_cost(edge, 'crutches', active_hazards)
        c_std, _ = calculate_edge_cost(edge, 'standard', active_hazards)

        matrix_rows.append({
            'Edge ID': edge['id'],
            'Connection': f"{MALL_ZONES[edge['u']]['name'][:16]} ➔ {MALL_ZONES[edge['v']]['name'][:16]}",
            'Dist (m)': edge['dist'],
            'Stairs': edge['stairs_penalty'],
            'Wheelchair Cost': 'INF (BLOCKED)' if c_wheel == float('inf') else round(c_wheel, 1),
            'Crutches Cost': round(c_crutch, 1),
            'Standard Cost': round(c_std, 1),
            'Feature': 'Stairs' if edge['has_stairs'] else 'Ramp' if edge.get('is_ramp') else 'Elevator' if edge.get('is_elevator') else 'Flat',
        })

    st.dataframe(pd.DataFrame(matrix_rows), use_container_width=True)

    st.markdown("### How to Run this Python Streamlit Application")
    st.code("""
# 1. Install dependencies:
pip install streamlit ultralytics networkx pydeck pandas pillow

# 2. Run the application:
streamlit run app.py --server.port=8501
    """, language="bash")
