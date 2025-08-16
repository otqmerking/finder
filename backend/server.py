from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import json
import asyncio
from io import BytesIO
import pandas as pd

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Factory Fault System API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBasic()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

# Pydantic Models
class Location(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    x_position: float = 0.0
    y_position: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LocationCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    x_position: float = 0.0
    y_position: float = 0.0

class Worker(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    worker_uuid: str
    default_location: str
    name: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WorkerCreate(BaseModel):
    worker_uuid: str
    default_location: str
    name: Optional[str] = ""

class Fault(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    worker_uuid: str
    location_name: str
    fault_start: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fault_end: Optional[datetime] = None
    duration_minutes: Optional[float] = None
    status: str = "open"  # open, resolved
    description: Optional[str] = ""

class FaultCreate(BaseModel):
    worker_uuid: str
    location_name: str
    description: Optional[str] = ""

class FaultResolve(BaseModel):
    fault_id: str

class AdminCredentials(BaseModel):
    username: str
    password: str

class DashboardStats(BaseModel):
    total_faults: int
    active_faults: int
    resolved_faults: int
    total_locations: int
    avg_resolution_time: float

# Initialize default data
async def initialize_default_data():
    """Initialize default locations and admin data"""
    try:
        # Check if locations exist
        location_count = await db.locations.count_documents({})
        if location_count == 0:
            default_locations = [
                {"name": "1A", "description": "Assembly Line 1A", "x_position": 100, "y_position": 100},
                {"name": "2B", "description": "Assembly Line 2B", "x_position": 300, "y_position": 100},
                {"name": "3C", "description": "Assembly Line 3C", "x_position": 500, "y_position": 100},
                {"name": "4D", "description": "Quality Check 4D", "x_position": 700, "y_position": 100},
                {"name": "5E", "description": "Packaging 5E", "x_position": 100, "y_position": 300},
                {"name": "6F", "description": "Shipping 6F", "x_position": 300, "y_position": 300},
                {"name": "7G", "description": "Storage 7G", "x_position": 500, "y_position": 300},
                {"name": "8H", "description": "Maintenance 8H", "x_position": 700, "y_position": 300},
                {"name": "9I", "description": "Production 9I", "x_position": 100, "y_position": 500},
                {"name": "10J", "description": "Testing 10J", "x_position": 300, "y_position": 500},
                {"name": "11K", "description": "Final Check 11K", "x_position": 500, "y_position": 500},
                {"name": "12L", "description": "Dispatch 12L", "x_position": 700, "y_position": 500},
            ]
            
            for loc_data in default_locations:
                location = Location(**loc_data)
                await db.locations.insert_one(location.dict())
            
            logger.info("Default locations initialized")
    except Exception as e:
        logger.error(f"Error initializing default data: {e}")

# Authentication helper
def verify_admin(credentials: HTTPBasicCredentials):
    """Simple admin verification"""
    if credentials.username == "admin" and credentials.password == "admin123":
        return True
    return False

# API Routes

@api_router.get("/")
async def root():
    return {"message": "Factory Fault System API", "version": "1.0.0"}

# Location Management
@api_router.get("/locations", response_model=List[Location])
async def get_locations():
    locations = await db.locations.find().to_list(1000)
    return [Location(**location) for location in locations]

@api_router.post("/locations", response_model=Location)
async def create_location(location_data: LocationCreate):
    location = Location(**location_data.dict())
    await db.locations.insert_one(location.dict())
    await manager.broadcast({
        "type": "location_created",
        "data": location.dict()
    })
    return location

@api_router.delete("/locations/{location_name}")
async def delete_location(location_name: str):
    result = await db.locations.delete_one({"name": location_name})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    
    await manager.broadcast({
        "type": "location_deleted",
        "data": {"name": location_name}
    })
    return {"message": "Location deleted successfully"}

# Worker Management
@api_router.get("/workers", response_model=List[Worker])
async def get_workers():
    workers = await db.workers.find().to_list(1000)
    return [Worker(**worker) for worker in workers]

@api_router.post("/workers", response_model=Worker)
async def create_worker(worker_data: WorkerCreate):
    # Check if worker UUID already exists
    existing = await db.workers.find_one({"worker_uuid": worker_data.worker_uuid})
    if existing:
        return Worker(**existing)
    
    worker = Worker(**worker_data.dict())
    await db.workers.insert_one(worker.dict())
    return worker

# Fault Management
@api_router.post("/faults/report", response_model=Fault)
async def report_fault(fault_data: FaultCreate):
    # Check if there's already an open fault for this location
    existing_fault = await db.faults.find_one({
        "location_name": fault_data.location_name,
        "status": "open"
    })
    
    if existing_fault:
        raise HTTPException(
            status_code=400, 
            detail="There is already an active fault at this location"
        )
    
    fault = Fault(**fault_data.dict())
    await db.faults.insert_one(fault.dict())
    
    # Broadcast real-time update
    await manager.broadcast({
        "type": "fault_reported",
        "data": fault.dict()
    })
    
    return fault

@api_router.post("/faults/resolve", response_model=Fault)
async def resolve_fault(resolve_data: FaultResolve):
    fault = await db.faults.find_one({"id": resolve_data.fault_id})
    if not fault:
        raise HTTPException(status_code=404, detail="Fault not found")
    
    if fault["status"] == "resolved":
        raise HTTPException(status_code=400, detail="Fault is already resolved")
    
    fault_end = datetime.now(timezone.utc)
    fault_start = fault["fault_start"]
    if isinstance(fault_start, str):
        fault_start = datetime.fromisoformat(fault_start.replace('Z', '+00:00'))
    elif isinstance(fault_start, datetime) and fault_start.tzinfo is None:
        fault_start = fault_start.replace(tzinfo=timezone.utc)
    
    duration = (fault_end - fault_start).total_seconds() / 60.0
    
    updated_fault = await db.faults.find_one_and_update(
        {"id": resolve_data.fault_id},
        {
            "$set": {
                "fault_end": fault_end,
                "duration_minutes": duration,
                "status": "resolved"
            }
        },
        return_document=True
    )
    
    # Broadcast real-time update
    await manager.broadcast({
        "type": "fault_resolved",
        "data": Fault(**updated_fault).dict()
    })
    
    return Fault(**updated_fault)

@api_router.get("/faults", response_model=List[Fault])
async def get_faults(status: Optional[str] = None, location: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if location:
        query["location_name"] = location
    
    faults = await db.faults.find(query).sort("fault_start", -1).to_list(1000)
    return [Fault(**fault) for fault in faults]

@api_router.get("/faults/active")
async def get_active_faults():
    """Get all currently active faults by location"""
    faults = await db.faults.find({"status": "open"}).to_list(1000)
    active_by_location = {}
    for fault in faults:
        active_by_location[fault["location_name"]] = Fault(**fault).dict()
    return active_by_location

# Dashboard Stats
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats():
    total_faults = await db.faults.count_documents({})
    active_faults = await db.faults.count_documents({"status": "open"})
    resolved_faults = await db.faults.count_documents({"status": "resolved"})
    total_locations = await db.locations.count_documents({})
    
    # Calculate average resolution time
    resolved_faults_data = await db.faults.find({"status": "resolved", "duration_minutes": {"$exists": True}}).to_list(1000)
    avg_resolution_time = 0.0
    if resolved_faults_data:
        total_duration = sum(fault.get("duration_minutes", 0) for fault in resolved_faults_data)
        avg_resolution_time = total_duration / len(resolved_faults_data)
    
    return DashboardStats(
        total_faults=total_faults,
        active_faults=active_faults,
        resolved_faults=resolved_faults,
        total_locations=total_locations,
        avg_resolution_time=avg_resolution_time
    )

# Export functionality
@api_router.get("/export/faults")
async def export_faults():
    """Export fault history to Excel"""
    faults = await db.faults.find().sort("fault_start", -1).to_list(1000)
    
    # Convert to DataFrame
    df_data = []
    for fault in faults:
        df_data.append({
            "Fault ID": fault["id"],
            "Worker UUID": fault["worker_uuid"],
            "Location": fault["location_name"],
            "Fault Start": fault["fault_start"],
            "Fault End": fault.get("fault_end", ""),
            "Duration (Minutes)": fault.get("duration_minutes", ""),
            "Status": fault["status"],
            "Description": fault.get("description", "")
        })
    
    df = pd.DataFrame(df_data)
    
    # Create Excel file in memory
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Fault History', index=False)
    
    output.seek(0)
    
    # Save temporarily
    temp_file = f"/tmp/fault_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    with open(temp_file, 'wb') as f:
        f.write(output.read())
    
    return FileResponse(
        temp_file,
        filename=f"fault_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    await initialize_default_data()
    logger.info("Factory Fault System API started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()