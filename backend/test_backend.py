"""
Quick Test Backend - Connects Frontend to GPU Worker
"""

import os
import io
import base64
import asyncio
import aiohttp
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import uvicorn

# Configuration
GPU_WORKER_URL = "http://localhost:8000"  # Your GPU worker

# FastAPI app
app = FastAPI(title="Test Backend", version="1.0.0")

# CORS - Allow your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://real-time-webcam-vision-language-captioning.vercel.app", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CaptionRequest(BaseModel):
    image: str  # base64 encoded image
    prompt: str = "Describe this image in detail."

class CaptionResponse(BaseModel):
    success: bool
    caption: str = ""
    processing_time: float = 0.0
    error: str = ""

@app.get("/")
async def root():
    return {
        "message": "Test Backend for SmolVLM",
        "gpu_worker": GPU_WORKER_URL,
        "status": "ready"
    }

@app.get("/health")
async def health():
    """Check if GPU worker is healthy"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{GPU_WORKER_URL}/health") as response:
                if response.status == 200:
                    gpu_health = await response.json()
                    return {
                        "backend": "healthy",
                        "gpu_worker": gpu_health,
                        "connection": "success"
                    }
                else:
                    return {
                        "backend": "healthy", 
                        "gpu_worker": "unhealthy",
                        "connection": "failed"
                    }
    except Exception as e:
        return {
            "backend": "healthy",
            "gpu_worker": "unreachable", 
            "error": str(e)
        }

@app.post("/caption", response_model=CaptionResponse)
async def generate_caption(file: UploadFile = File(...)):
    """Generate caption for uploaded image"""
    try:
        # Read image
        image_data = await file.read()
        print(f"🔍 Received image: {len(image_data)} bytes, content_type: {file.content_type}")
        
        # Validate image locally first
        try:
            test_image = Image.open(io.BytesIO(image_data))
            print(f"🖼️ Image valid: {test_image.size}, format: {test_image.format}")
            test_image.verify()  # Verify it's a valid image
        except Exception as e:
            print(f"❌ Image validation failed: {e}")
            return CaptionResponse(
                success=False,
                error=f"Invalid image format: {str(e)}"
            )
        
        # Forward to GPU worker with proper timeout
        timeout = aiohttp.ClientTimeout(total=120)  # 2 minute timeout
        data = aiohttp.FormData()
        data.add_field(
            'file', 
            io.BytesIO(image_data), 
            filename=file.filename or 'image.jpg',
            content_type='image/jpeg'  # Explicitly set content type
        )
        data.add_field('prompt', 'Describe this image in detail.')
        
        print(f"🚀 Sending to GPU worker...")
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(f"{GPU_WORKER_URL}/caption", data=data) as response:
                print(f"📨 GPU worker response: {response.status}")
                
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ Caption received: {result.get('caption', '')[:100]}...")
                    
                    return CaptionResponse(
                        success=result.get("success", True),  # Default to True if not specified
                        caption=result.get("caption", ""),
                        processing_time=result.get("processing_time", 0.0),
                        error=""
                    )
                else:
                    error_text = await response.text()
                    print(f"❌ GPU worker error: {error_text}")
                    return CaptionResponse(
                        success=False,
                        error=f"GPU worker error ({response.status}): {error_text}"
                    )
                    
    except Exception as e:
        return CaptionResponse(
            success=False,
            error=f"Backend error: {str(e)}"
        )

@app.post("/caption-webcam", response_model=CaptionResponse)
async def caption_webcam(request: CaptionRequest):
    """Caption from base64 webcam image"""
    try:
        # Decode base64 image
        image_b64 = request.image
        if image_b64.startswith("data:image"):
            image_b64 = image_b64.split(",")[1]
        
        image_data = base64.b64decode(image_b64)
        
        # Forward to GPU worker
        data = aiohttp.FormData()
        data.add_field('file', io.BytesIO(image_data), filename='webcam.jpg')
        data.add_field('prompt', request.prompt)
        
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{GPU_WORKER_URL}/caption", data=data) as response:
                if response.status == 200:
                    result = await response.json()
                    return CaptionResponse(
                        success=result.get("success", False),
                        caption=result.get("caption", ""),
                        processing_time=result.get("processing_time", 0.0)
                    )
                else:
                    error_text = await response.text()
                    return CaptionResponse(
                        success=False,
                        error=f"GPU worker error: {error_text}"
                    )
                    
    except Exception as e:
        return CaptionResponse(
            success=False,
            error=f"Backend error: {str(e)}"
        )

if __name__ == "__main__":
    print("🚀 Starting Test Backend...")
    print(f"🔗 GPU Worker: {GPU_WORKER_URL}")
    print("📡 Backend will run on: http://localhost:5000")
    print("🌐 Frontend should connect to: http://localhost:5000")
    
    uvicorn.run(
        "test_backend:app", 
        host="0.0.0.0", 
        port=5000, 
        reload=True,
        log_level="info"
    )