#!/usr/bin/env python3
"""
Backend API Server for SmolVLM Caption App

This server acts as a bridge between the frontend and GPU worker.
- Receives images from frontend
- Forwards to GPU worker for processing  
- Returns captions back to frontend
"""

import os
import io
import base64
import logging
import asyncio
import aiohttp
from typing import Optional
from PIL import Image
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="SmolVLM Caption Backend",
    description="Backend API for SmolVLM image captioning service", 
    version="1.0.0"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure with your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
GPU_WORKER_URL = os.getenv("GPU_WORKER_URL", "http://localhost:8000")
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB

# Response models
class CaptionResponse(BaseModel):
    success: bool
    caption: Optional[str] = None
    error: Optional[str] = None
    processing_time: Optional[float] = None

class HealthResponse(BaseModel):
    status: str
    backend_version: str
    gpu_worker_status: str
    gpu_worker_url: str

# Utility functions
def validate_image(image_data: bytes) -> bool:
    """Validate uploaded image"""
    try:
        if len(image_data) > MAX_IMAGE_SIZE:
            return False
        
        # Try to open with PIL
        image = Image.open(io.BytesIO(image_data))
        
        # Check format
        if image.format not in ['JPEG', 'JPG', 'PNG', 'WEBP']:
            return False
            
        # Check dimensions
        width, height = image.size
        if width < 32 or height < 32 or width > 4096 or height > 4096:
            return False
            
        return True
    except Exception:
        return False

async def check_gpu_worker_health() -> dict:
    """Check if GPU worker is healthy"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{GPU_WORKER_URL}/health", timeout=5) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {"status": "unhealthy", "error": f"HTTP {response.status}"}
    except Exception as e:
        return {"status": "unreachable", "error": str(e)}

async def call_gpu_worker(image_data: bytes, prompt: str = "Describe this image in detail.") -> dict:
    """Send image to GPU worker for processing"""
    try:
        # Prepare multipart form data
        data = aiohttp.FormData()
        data.add_field('file', io.BytesIO(image_data), filename='image.jpg', content_type='image/jpeg')
        data.add_field('prompt', prompt)
        
        # Send request to GPU worker
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{GPU_WORKER_URL}/caption", data=data, timeout=30) as response:
                
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "error": f"GPU Worker error ({response.status}): {error_text}"
                    }
                    
    except asyncio.TimeoutError:
        return {"success": False, "error": "GPU worker timeout"}
    except Exception as e:
        return {"success": False, "error": f"GPU worker connection failed: {str(e)}"}

# API Endpoints

@app.get("/", response_model=dict)
async def root():
    """Root endpoint"""
    return {
        "message": "SmolVLM Caption Backend API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "caption": "/caption"
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    logger.info("🔍 Health check requested")
    
    # Check GPU worker status
    gpu_status = await check_gpu_worker_health()
    
    return HealthResponse(
        status="healthy",
        backend_version="1.0.0", 
        gpu_worker_status=gpu_status.get("status", "unknown"),
        gpu_worker_url=GPU_WORKER_URL
    )

@app.post("/caption", response_model=CaptionResponse)
async def generate_caption(
    file: UploadFile = File(...),
    prompt: str = "Describe this image in detail."
):
    """
    Generate caption for uploaded image
    
    Args:
        file: Image file (JPEG, PNG, WEBP)
        prompt: Optional custom prompt for captioning
        
    Returns:
        CaptionResponse with generated caption
    """
    start_time = asyncio.get_event_loop().time()
    
    try:
        logger.info(f"📸 Caption request: {file.filename}, prompt: '{prompt}'")
        
        # Read image data
        image_data = await file.read()
        
        # Validate image
        if not validate_image(image_data):
            raise HTTPException(
                status_code=400,
                detail="Invalid image. Must be JPEG/PNG/WEBP, under 10MB, 32x32 to 4096x4096 pixels"
            )
        
        # Send to GPU worker
        result = await call_gpu_worker(image_data, prompt)
        
        processing_time = asyncio.get_event_loop().time() - start_time
        
        if result.get("success"):
            logger.info(f"✅ Caption generated in {processing_time:.2f}s: {result.get('caption', '')[:50]}...")
            return CaptionResponse(
                success=True,
                caption=result.get("caption"),
                processing_time=processing_time
            )
        else:
            logger.error(f"❌ Caption failed: {result.get('error')}")
            return CaptionResponse(
                success=False,
                error=result.get("error", "Unknown error"),
                processing_time=processing_time
            )
            
    except HTTPException:
        raise
    except Exception as e:
        processing_time = asyncio.get_event_loop().time() - start_time
        logger.error(f"❌ Caption error: {e}")
        return CaptionResponse(
            success=False,
            error=f"Server error: {str(e)}",
            processing_time=processing_time
        )

@app.post("/caption-base64", response_model=CaptionResponse)
async def generate_caption_base64(request: dict):
    """
    Generate caption for base64 encoded image (for webcam capture)
    
    Args:
        request: {"image": "base64_string", "prompt": "optional_prompt"}
        
    Returns:
        CaptionResponse with generated caption
    """
    start_time = asyncio.get_event_loop().time()
    
    try:
        image_b64 = request.get("image", "")
        prompt = request.get("prompt", "Describe this image in detail.")
        
        logger.info(f"📸 Base64 caption request, prompt: '{prompt}'")
        
        # Decode base64 image
        if image_b64.startswith("data:image"):
            # Remove data URL prefix
            image_b64 = image_b64.split(",")[1]
        
        image_data = base64.b64decode(image_b64)
        
        # Validate image
        if not validate_image(image_data):
            raise HTTPException(
                status_code=400,
                detail="Invalid image data"
            )
        
        # Send to GPU worker
        result = await call_gpu_worker(image_data, prompt)
        
        processing_time = asyncio.get_event_loop().time() - start_time
        
        if result.get("success"):
            logger.info(f"✅ Base64 caption generated in {processing_time:.2f}s")
            return CaptionResponse(
                success=True,
                caption=result.get("caption"),
                processing_time=processing_time
            )
        else:
            logger.error(f"❌ Base64 caption failed: {result.get('error')}")
            return CaptionResponse(
                success=False,
                error=result.get("error", "Unknown error"),
                processing_time=processing_time
            )
            
    except Exception as e:
        processing_time = asyncio.get_event_loop().time() - start_time
        logger.error(f"❌ Base64 caption error: {e}")
        return CaptionResponse(
            success=False,
            error=f"Server error: {str(e)}",
            processing_time=processing_time
        )

if __name__ == "__main__":
    import uvicorn
    
    # Configuration
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5000))
    
    logger.info(f"🚀 Starting SmolVLM Backend on {host}:{port}")
    logger.info(f"🔗 GPU Worker URL: {GPU_WORKER_URL}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )