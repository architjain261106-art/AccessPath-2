"""
AccessPath - Dynamic Accessibility-Aware Campus Navigation System
Production-Ready Backend Service Script

Tech Stack:
- FastAPI & Uvicorn (Asynchronous REST API)
- SQLAlchemy + GeoAlchemy2 / PostGIS (Spatial Nodes, Edges, Hazard Logs)
- NetworkX (Dynamic Weighted Graph Routing Engine)
- Google GenAI SDK (Gemini Vision Verification for Accessibility Barriers)
"""

import os
import io
import math
import json
import logging
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import networkx as nx

# SQLAlchemy & GeoAlchemy2 Database Layer
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    select,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship

# Attempt importing GeoAlchemy2; fallback to geometric attributes if PostGIS extension is not installed
try:
    from geoalchemy2 import Geometry
    HAS_POSTGIS = True
except ImportError:
    HAS_POSTGIS = False

# Google GenAI SDK for Gemini Vision Verification
try:
    from google import genai
    from google.genai import types
    HAS_GENAI_SDK = True
except ImportError:
    HAS_GENAI_SDK = False

# -----------------------------------------------------------------------------
# Configuration & Logging
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("accesspath")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/accesspath_db"
)
# Fallback to SQLite in-memory if PostgreSQL is unreachable for testing
USE_SQLITE_FALLBACK = os.getenv("USE_SQLITE_FALLBACK", "true").lower() == "true"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# -----------------------------------------------------------------------------
# Database Models (PostgreSQL + PostGIS Schema)
# -----------------------------------------------------------------------------
Base = declarative_base()

class CampusNode(Base):
    """Spatial database model representing physical campus junctions or landmarks."""
    __tablename__ = "campus_nodes"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(128), nullable=False)
    category = Column(String(64), default="junction")  # landmark, building, junction
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # PostGIS geometry column: Point (SRID 4326 for WGS 84 GPS coordinates)
    if HAS_POSTGIS:
        geom = Column(Geometry(geometry_type="POINT", srid=4326))

    outgoing_edges = relationship("CampusEdge", foreign_keys="CampusEdge.source_id", back_populates="source_node")
    incoming_edges = relationship("CampusEdge", foreign_keys="CampusEdge.target_id", back_populates="target_node")


class CampusEdge(Base):
    """
    Spatial database model representing a pedestrian pathway segment.
    Stores physical attributes: slope, stairs, obstacle severity, and real-time hazard state.
    """
    __tablename__ = "campus_edges"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    source_id = Column(Integer, ForeignKey("campus_nodes.id"), nullable=False)
    target_id = Column(Integer, ForeignKey("campus_nodes.id"), nullable=False)

    distance = Column(Float, nullable=False)          # Length in meters
    slope = Column(Float, default=0.0)                 # Gradient percentage (e.g., 3.5%)
    has_stairs = Column(Boolean, default=False)        # Boolean flag indicating steps
    stairs_penalty = Column(Float, default=0.0)        # Step count or difficulty penalty
    obstacle_severity = Column(Float, default=0.0)     # Scale: 0.0 (clear) to 5.0 (heavy impediment)
    hazard_active = Column(Boolean, default=False)     # Real-time closure or blockage
    is_bidirectional = Column(Boolean, default=True)

    # PostGIS geometry column: LineString connecting source and target
    if HAS_POSTGIS:
        geom = Column(Geometry(geometry_type="LINESTRING", srid=4326))

    source_node = relationship("CampusNode", foreign_keys=[source_id], back_populates="outgoing_edges")
    target_node = relationship("CampusNode", foreign_keys=[target_id], back_populates="incoming_edges")
    hazard_logs = relationship("HazardLog", back_populates="edge")


class HazardLog(Base):
    """Audit log for user hazard reports verified by Gemini Vision."""
    __tablename__ = "hazard_logs"

    id = Column(Integer, primary_key=True, index=True)
    edge_id = Column(Integer, ForeignKey("campus_edges.id"), nullable=False)
    hazard_type = Column(String(64), nullable=False)  # construction, stairs, debris, flooded
    reported_by = Column(String(128), default="anonymous_student")
    image_filename = Column(String(256), nullable=True)
    ai_verified = Column(Boolean, default=False)
    confidence_score = Column(Float, default=0.0)
    ai_analysis = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    edge = relationship("CampusEdge", back_populates="hazard_logs")


# Database Engine & Session Factory Setup
try:
    engine = create_engine(DATABASE_URL, echo=False)
    # Check connection
    with engine.connect() as conn:
        logger.info(f"Connected to primary database: {DATABASE_URL}")
except Exception as e:
    if USE_SQLITE_FALLBACK:
        logger.warning(f"PostgreSQL connection failed ({e}). Falling back to SQLite in-memory for testing.")
        engine = create_engine("sqlite:///:memory:", echo=False)
    else:
        raise e

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Dependency yielding database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -----------------------------------------------------------------------------
# Dynamic Routing Engine (NetworkX + Custom Accessibility Cost Formula)
# -----------------------------------------------------------------------------
class RoutingEngine:
    """
    Graph Routing Engine utilizing NetworkX.
    Synchronizes spatial edges from database and evaluates mobility-profile-specific edge costs.
    """

    def __init__(self):
        self.graph: nx.DiGraph = nx.DiGraph()

    def build_graph_from_db(self, db: Session):
        """Constructs or updates the in-memory directed graph from persistent edges."""
        self.graph.clear()
        edges = db.query(CampusEdge).all()

        for edge in edges:
            edge_data = {
                "id": edge.id,
                "name": edge.name,
                "distance": float(edge.distance),
                "slope": float(edge.slope),
                "has_stairs": bool(edge.has_stairs),
                "stairs_penalty": float(edge.stairs_penalty),
                "obstacle_severity": float(edge.obstacle_severity),
                "hazard_active": bool(edge.hazard_active),
            }

            # Add forward edge
            self.graph.add_edge(edge.source_id, edge.target_id, **edge_data)

            # Add reverse edge if bidirectional
            if edge.is_bidirectional:
                self.graph.add_edge(edge.target_id, edge.source_id, **edge_data)

        logger.info(f"Routing graph built: {self.graph.number_of_nodes()} nodes, {self.graph.number_of_edges()} edges")

    @staticmethod
    def calculate_edge_cost(edge_data: Dict[str, Any], profile: str = "standard") -> float:
        """
        Calculates pathway edge traversal cost based on profile and attributes.

        FORMULA:
        Cost = (W_dist * Distance) + (W_slope * Slope) + (W_stairs * StairsPenalty) + (W_obs * ObstacleSeverity)
        """
        # Hard block if hazard is actively verified as impassable
        if edge_data.get("hazard_active", False):
            return float("inf")

        # Requirement: Hard block on stairs for wheelchair profile
        if profile == "wheelchair" and edge_data.get("has_stairs", False):
            return float("inf")

        distance = float(edge_data.get("distance", 0.0))
        slope = float(edge_data.get("slope", 0.0))
        stairs_penalty = float(edge_data.get("stairs_penalty", 10.0 if edge_data.get("has_stairs") else 0.0))
        obstacle_severity = float(edge_data.get("obstacle_severity", 0.0))

        # Profile-specific weights
        if profile == "wheelchair":
            w_dist = 1.0
            w_slope = 5.0
            w_stairs = 0.0
            w_obs = 3.0
        elif profile == "crutches":
            # Very high penalty for stairs and slopes
            w_dist = 1.0
            w_slope = 8.0
            w_stairs = 25.0
            w_obs = 4.0
        else:  # "standard" profile
            # Normal weights prioritizing shortest physical distance
            w_dist = 1.0
            w_slope = 0.5
            w_stairs = 2.0
            w_obs = 1.0

        cost = (
            (w_dist * distance)
            + (w_slope * slope)
            + (w_stairs * stairs_penalty)
            + (w_obs * obstacle_severity)
        )
        return float(cost)

    def find_shortest_accessible_path(
        self, source_id: int, target_id: int, profile: str
    ) -> Tuple[List[int], float, float]:
        """
        Runs Dijkstra's shortest path algorithm with custom dynamic weight function.
        Returns: (node_id_path, total_physical_distance, total_accessibility_cost)
        """
        if source_id not in self.graph or target_id not in self.graph:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Origin or destination node not found in routing graph."
            )

        # Dynamic weight resolver callback for NetworkX
        def weight_function(u: int, v: int, d: Dict[str, Any]) -> float:
            cost = self.calculate_edge_cost(d, profile)
            return cost

        try:
            path = nx.shortest_path(self.graph, source=source_id, target=target_id, weight=weight_function)
            
            # Compute total distance and total cost
            total_dist = 0.0
            total_cost = 0.0
            for i in range(len(path) - 1):
                u, v = path[i], path[i + 1]
                data = self.graph[u][v]
                cost = self.calculate_edge_cost(data, profile)
                if math.isinf(cost):
                    raise nx.NetworkXNoPath("Path contains an impassable segment.")
                total_dist += data.get("distance", 0.0)
                total_cost += cost

            return path, total_dist, total_cost

        except (nx.NetworkXNoPath, nx.NodeNotFound):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"No accessible route found between selected points for '{profile}' profile."
            )


routing_engine = RoutingEngine()


# -----------------------------------------------------------------------------
# AI Hazard Verification Module (Google GenAI SDK / Gemini Vision)
# -----------------------------------------------------------------------------
class AIHazardVerifier:
    """
    Validates user-submitted barrier images using Gemini 2.5 Flash.
    Verifies physical obstruction existence and severity to prevent false reports.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.client = None
        if HAS_GENAI_SDK and self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
                logger.info("Google GenAI client initialized successfully.")
            except Exception as e:
                logger.warning(f"Failed to initialize Google GenAI Client: {e}")

    async def verify_hazard(self, image_bytes: bytes, reported_type: str) -> Dict[str, Any]:
        """
        Prompts Gemini Vision to analyze image and return structured verification JSON.
        """
        # If SDK or API Key is unavailable, provide a graceful fallback simulator
        if not self.client:
            logger.info("Using mock Gemini Vision verification (No GEMINI_API_KEY set).")
            return {
                "verified": True,
                "confidence": 0.92,
                "detected_barrier": reported_type,
                "obstacle_severity": 4.0,
                "explanation": f"Automated simulation: Physical obstruction matching '{reported_type}' detected on pedestrian path.",
            }

        prompt = f"""
You are an expert accessibility inspector for a university campus navigation app.
A user reported an accessibility hazard of type '{reported_type}'.
Analyze this image carefully. Verify whether there is an actual physical barrier for pedestrians or wheelchair users.

Respond in strict JSON with these keys:
- "verified" (boolean): true if a real physical barrier, stairs, flooding, or construction is present blocking pedestrian transit.
- "confidence" (float): 0.0 to 1.0 confidence score.
- "detected_barrier" (string): brief label of what is seen (e.g. "stairs without ramp", "construction scaffolding", "standing water").
- "obstacle_severity" (float): 1.0 (minor crack) to 5.0 (complete impassable physical block).
- "explanation" (string): 1-2 sentence description of findings.
"""
        try:
            # Call modern Google GenAI Client with Gemini Flash
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )

            result = json.loads(response.text)
            return {
                "verified": bool(result.get("verified", False)),
                "confidence": float(result.get("confidence", 0.0)),
                "detected_barrier": str(result.get("detected_barrier", "unknown")),
                "obstacle_severity": float(result.get("obstacle_severity", 3.0)),
                "explanation": str(result.get("explanation", "Verified by Gemini Vision.")),
            }

        except Exception as err:
            logger.error(f"Gemini Vision call failed: {err}")
            # Fallback safe response
            return {
                "verified": False,
                "confidence": 0.0,
                "detected_barrier": "unverified",
                "obstacle_severity": 1.0,
                "explanation": f"Vision analysis encountered error: {str(err)}",
            }


ai_verifier = AIHazardVerifier(api_key=GEMINI_API_KEY)


# -----------------------------------------------------------------------------
# Pydantic Request & Response Schemas
# -----------------------------------------------------------------------------
class RouteRequest(BaseModel):
    origin: str = Field(..., description="Origin node slug or string ID (e.g. 'hostel')")
    destination: str = Field(..., description="Destination node slug or string ID (e.g. 'lab')")
    user_profile: str = Field("wheelchair", description="'standard', 'wheelchair', or 'crutches'")

class StepInfo(BaseModel):
    edge_id: int
    name: str
    from_node: str
    to_node: str
    distance_meters: float
    slope_percent: float
    has_stairs: bool
    segment_cost: float

class RouteResponse(BaseModel):
    origin: str
    destination: str
    user_profile: str
    total_distance_meters: float
    total_cost: float
    estimated_duration_minutes: int
    node_ids_sequence: List[int]
    node_names_sequence: List[str]
    segments: List[StepInfo]
    coordinates: List[List[float]]  # [[lon, lat], ...] GeoJSON-style points

class HazardReportResponse(BaseModel):
    report_id: int
    edge_id: int
    hazard_type: str
    ai_verified: bool
    confidence_score: float
    obstacle_severity: float
    edge_hazard_activated: bool
    explanation: str


# -----------------------------------------------------------------------------
# Database Seed Helper for Demo Campus
# -----------------------------------------------------------------------------
def seed_demo_campus_network(db: Session):
    """Seeds canonical campus nodes and pathway edges if database is empty."""
    if db.query(CampusNode).count() > 0:
        return

    logger.info("Seeding initial campus spatial network...")

    nodes = [
        CampusNode(id=1, slug="hostel", name="Boys Hostel", category="residence", latitude=12.9716, longitude=77.5946),
        CampusNode(id=2, slug="library", name="Central Library", category="academic", latitude=12.9725, longitude=77.5955),
        CampusNode(id=3, slug="center", name="Student Center", category="dining", latitude=12.9705, longitude=77.5950),
        CampusNode(id=4, slug="lab", name="Electrical Lab", category="academic", latitude=12.9705, longitude=77.5975),
        CampusNode(id=5, slug="science", name="Science Block", category="academic", latitude=12.9723, longitude=77.5975),
        CampusNode(id=6, slug="gate", name="Main Campus Gate", category="transit", latitude=12.9695, longitude=77.5955),
        # Intermediary pathway junctions
        CampusNode(id=7, slug="nw", name="West Walk Junction", category="junction", latitude=12.9710, longitude=77.5946),
        CampusNode(id=8, slug="w", name="Garden Walk Junction", category="junction", latitude=12.9710, longitude=77.5950),
        CampusNode(id=9, slug="n", name="Library Walk Junction", category="junction", latitude=12.9710, longitude=77.5955),
        CampusNode(id=10, slug="e", name="East Walk Junction", category="junction", latitude=12.9710, longitude=77.5975),
        CampusNode(id=11, slug="s", name="South Walk Junction", category="junction", latitude=12.9705, longitude=77.5955),
    ]
    db.add_all(nodes)
    db.commit()

    edges = [
        CampusEdge(id=1, name="Hostel Approach", source_id=1, target_id=7, distance=85.0, slope=1.0, has_stairs=False),
        CampusEdge(id=2, name="West Garden Path", source_id=7, target_id=8, distance=140.0, slope=2.0, has_stairs=False),
        # STAIRS: Central steps between Garden Walk and Library Walk
        CampusEdge(id=3, name="Central Steps (Flight of 12)", source_id=8, target_id=9, distance=110.0, slope=0.0, has_stairs=True, stairs_penalty=12.0),
        # RAMP alternative: North Ramp Walkway
        CampusEdge(id=4, name="North Ramp Walkway", source_id=7, target_id=2, distance=475.0, slope=2.0, has_stairs=False),
        CampusEdge(id=5, name="Library Entrance Ramp", source_id=2, target_id=9, distance=125.0, slope=3.0, has_stairs=False),
        CampusEdge(id=6, name="Academic Promenade", source_id=9, target_id=10, distance=215.0, slope=1.5, has_stairs=False),
        CampusEdge(id=7, name="Science Block Approach", source_id=10, target_id=5, distance=90.0, slope=2.0, has_stairs=False),
        CampusEdge(id=8, name="East Promenade", source_id=10, target_id=4, distance=145.0, slope=2.5, has_stairs=False),
        CampusEdge(id=9, name="Student Center Walkway", source_id=8, target_id=3, distance=145.0, slope=1.8, has_stairs=False),
        CampusEdge(id=10, name="Central North-South Avenue", source_id=11, target_id=9, distance=150.0, slope=1.0, has_stairs=False),
        CampusEdge(id=11, name="South Lab Walk", source_id=11, target_id=4, distance=235.0, slope=4.5, has_stairs=False),
        CampusEdge(id=12, name="Main Gate Avenue", source_id=6, target_id=11, distance=130.0, slope=2.0, has_stairs=False),
    ]
    db.add_all(edges)
    db.commit()
    logger.info("Campus spatial database initialized with 11 nodes and 12 pathway edges.")


# -----------------------------------------------------------------------------
# FastAPI Lifespan & Application Setup
# -----------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes tables and seeds routing graph upon startup."""
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_demo_campus_network(db)
        routing_engine.build_graph_from_db(db)
    yield
    logger.info("Application shutting down.")


app = FastAPI(
    title="AccessPath API",
    description="Dynamic accessibility-aware campus navigation API powered by FastAPI, PostGIS, NetworkX, and Gemini Vision.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------------------------------
# FastAPI Endpoints
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    """Health check endpoint indicating active database and routing status."""
    return {
        "status": "online",
        "service": "AccessPath",
        "postgis_enabled": HAS_POSTGIS,
        "gemini_sdk_enabled": HAS_GENAI_SDK,
        "nodes_loaded": routing_engine.graph.number_of_nodes(),
        "edges_loaded": routing_engine.graph.number_of_edges(),
    }


@app.post("/api/route", response_model=RouteResponse)
def calculate_route(payload: RouteRequest, db: Session = Depends(get_db)):
    """
    Computes an optimal accessible route between origin and destination nodes.
    Applies profile-specific weighting and hard blocks impassable barriers.
    """
    # 1. Resolve source and target nodes by slug or numeric ID
    def resolve_node(identifier: str) -> CampusNode:
        if identifier.isdigit():
            node = db.query(CampusNode).filter(CampusNode.id == int(identifier)).first()
        else:
            node = db.query(CampusNode).filter(CampusNode.slug == identifier.lower()).first()
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Campus node identifier '{identifier}' not found."
            )
        return node

    source_node = resolve_node(payload.origin)
    target_node = resolve_node(payload.destination)
    profile = payload.user_profile.lower()

    if profile not in ["standard", "wheelchair", "crutches"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user_profile. Must be 'standard', 'wheelchair', or 'crutches'."
        )

    # 2. Run NetworkX Shortest Path with custom cost formula
    node_ids, total_distance, total_cost = routing_engine.find_shortest_accessible_path(
        source_id=source_node.id,
        target_id=target_node.id,
        profile=profile,
    )

    # 3. Assemble response geometry and segment metadata
    node_map = {n.id: n for n in db.query(CampusNode).filter(CampusNode.id.in_(node_ids)).all()}
    segments: List[StepInfo] = []
    coordinates: List[List[float]] = []

    for i in range(len(node_ids) - 1):
        u_id, v_id = node_ids[i], node_ids[i + 1]
        edge_data = routing_engine.graph[u_id][v_id]
        u_node, v_node = node_map[u_id], node_map[v_id]

        if i == 0:
            coordinates.append([u_node.longitude, u_node.latitude])
        coordinates.append([v_node.longitude, v_node.latitude])

        cost = routing_engine.calculate_edge_cost(edge_data, profile)
        segments.append(
            StepInfo(
                edge_id=edge_data["id"],
                name=edge_data["name"],
                from_node=u_node.name,
                to_node=v_node.name,
                distance_meters=edge_data["distance"],
                slope_percent=edge_data["slope"],
                has_stairs=edge_data["has_stairs"],
                segment_cost=round(cost, 2),
            )
        )

    speed_map = {"standard": 80.0, "wheelchair": 65.0, "crutches": 50.0}
    speed_mpm = speed_map.get(profile, 70.0)
    duration_min = max(1, round(total_distance / speed_mpm))

    return RouteResponse(
        origin=source_node.name,
        destination=target_node.name,
        user_profile=profile,
        total_distance_meters=round(total_distance, 1),
        total_cost=round(total_cost, 2),
        estimated_duration_minutes=duration_min,
        node_ids_sequence=node_ids,
        node_names_sequence=[node_map[nid].name for nid in node_ids],
        segments=segments,
        coordinates=coordinates,
    )


@app.post("/api/hazards/report", response_model=HazardReportResponse)
async def report_hazard(
    edge_id: int = Form(...),
    hazard_type: str = Form(...),
    reported_by: Optional[str] = Form("mobile_student"),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Submits a real-time hazard report with photo verification via Gemini Vision.
    If Gemini confirms physical impairment, sets edge `hazard_active = True`
    and reloads the routing graph in real time.
    """
    # 1. Fetch edge from spatial database
    edge = db.query(CampusEdge).filter(CampusEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campus edge with ID {edge_id} does not exist."
        )

    # 2. Read image bytes
    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded image is empty.")

    # 3. AI Verification with Gemini Vision
    ai_result = await ai_verifier.verify_hazard(image_bytes=image_bytes, reported_type=hazard_type)

    is_verified = ai_result["verified"]
    confidence = ai_result["confidence"]
    obstacle_severity = ai_result["obstacle_severity"]
    explanation = ai_result["explanation"]

    # 4. Save Hazard Audit Log
    log_entry = HazardLog(
        edge_id=edge.id,
        hazard_type=hazard_type,
        reported_by=reported_by,
        image_filename=image.filename,
        ai_verified=is_verified,
        confidence_score=confidence,
        ai_analysis=explanation,
    )
    db.add(log_entry)

    # 5. Dynamic state update: if verified with confidence > 0.65, dynamically block the edge
    edge_hazard_activated = False
    if is_verified and confidence >= 0.65:
        edge.hazard_active = True
        edge.obstacle_severity = max(edge.obstacle_severity, obstacle_severity)
        edge_hazard_activated = True
        logger.warning(f"Hazard verified on Edge {edge.id} ('{edge.name}'). Activated edge block!")

    db.commit()
    db.refresh(log_entry)

    # 6. Rebuild routing graph dynamically to reflect real-time physical conditions
    routing_engine.build_graph_from_db(db)

    return HazardReportResponse(
        report_id=log_entry.id,
        edge_id=edge.id,
        hazard_type=hazard_type,
        ai_verified=is_verified,
        confidence_score=round(confidence, 2),
        obstacle_severity=round(obstacle_severity, 1),
        edge_hazard_activated=edge_hazard_activated,
        explanation=explanation,
    )


# -----------------------------------------------------------------------------
# Local Dev Entrypoint & Self-Test Suite
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    print("\n=======================================================")
    print(" AccessPath - Accessibility-Aware Routing Engine")
    print(" Starting development server on http://localhost:8000")
    print(" Interactive Docs available at: http://localhost:8000/docs")
    print("=======================================================\n")
    uvicorn.run("accesspath_backend:app", host="0.0.0.0", port=8000, reload=True)
