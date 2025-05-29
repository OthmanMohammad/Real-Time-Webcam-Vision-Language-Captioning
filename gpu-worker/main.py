#!/usr/bin/env python3
"""
SmolVLM GPU Worker - Fixed & Optimized
Uses SmolVLM-500M for fast real-time image captioning
"""

import os
import io
import time
import logging
import asyncio
from contextlib import asynccontextmanager
from typing import Optional
import torch
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import Idefics3ForConditionalGeneration, AutoProcessor
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global variables
model = None
processor = None
device = None
model_ready = False

# Response models
class CaptionResponse(BaseModel):
    success: bool
    caption: Optional[str] = None
    processing_time: Optional[float] = None
    error: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    model_name: str
    gpu_memory_gb: Optional[float] = None

# Model configuration - Using smaller, faster model
MODEL_NAME = "HuggingFaceTB/SmolVLM-500M-Instruct"  # Much faster than 2.2B
MAX_NEW_TOKENS = 100
TEMPERATURE = 0.7

async def load_model():
    """Load SmolVLM model with proper error handling"""
    global model, processor, device, model_ready
    
    try:
        logger.info(f"🔥 Loading {MODEL_NAME}...")
        start_time = time.time()
        
        # Setup device
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {device}")
        
        if device.type == "cpu":
            logger.warning("⚠️ No GPU detected! Using CPU (will be slower)")
        
        # Load processor first
        logger.info("📥 Loading processor...")
        processor = AutoProcessor.from_pretrained(MODEL_NAME, trust_remote_code=True)
        
        # Load model with appropriate settings
        logger.info("📥 Loading model...")
        model = Idefics3ForConditionalGeneration.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.float16 if device.type == "cuda" else torch.float32,
            device_map="auto" if device.type == "cuda" else None,
            trust_remote_code=True
        )
        
        if device.type == "cpu":
            model = model.to(device)
        
        model.eval()
        
        load_time = time.time() - start_time
        logger.info(f"✅ Model loaded successfully in {load_time:.2f}s")
        
        # Test the model
        if await test_model():
            model_ready = True
            logger.info("🎉 GPU Worker ready for image captioning!")
            return True
        else:
            logger.error("❌ Model test failed")
            return False
            
    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}")
        return False

async def test_model():
    """Test model with a simple image"""
    try:
        logger.info("🧪 Testing model...")
        
        # Create test image
        test_image = Image.new('RGB', (224, 224), color='red')
        
        # Test caption generation
        caption = await generate_caption_internal(test_image, "What color is this image?")
        
        logger.info(f"✅ Model test successful: {caption}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Model test failed: {e}")
        return False

async def generate_caption_internal(image: Image.Image, prompt: str = "Describe this image.") -> str:
    """Internal caption generation function"""
    try:
        # Prepare the conversation format that SmolVLM expects
        messages = [
            {
                "role": "user", 
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": prompt}
                ]
            }
        ]
        
        # Apply chat template
        text_prompt = processor.apply_chat_template(messages, add_generation_prompt=True)
        
        # Process image and text
        inputs = processor(text=text_prompt, images=[image], return_tensors="pt")
        inputs = inputs.to(device)
        
        # Generate response
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                temperature=TEMPERATURE,
                do_sample=True,
                pad_token_id=processor.tokenizer.eos_token_id
            )
        
        # Decode response
        generated_text = processor.batch_decode(
            generated_ids[:, inputs['input_ids'].shape[1]:], 
            skip_special_tokens=True
        )[0]
        
        # Clean up the response
        caption = generated_text.strip()
        if not caption:
            caption = "I can see an image but cannot describe it clearly."
            
        return caption
        
    except Exception as e:
        logger.error(f"❌ Caption generation failed: {e}")
        raise e

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan"""
    # Startup
    logger.info("🚀 Starting SmolVLM GPU Worker...")
    
    if not await load_model():
        raise Exception("Failed to load model")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down GPU Worker...")

# Create FastAPI app
app = FastAPI(
    title="SmolVLM GPU Worker",
    description="Fast GPU worker for SmolVLM-500M image captioning",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_model=dict)
async def root():
    """Root endpoint"""
    return {
        "service": "SmolVLM GPU Worker",
        "version": "2.0.0",
        "model": MODEL_NAME,
        "status": "ready" if model_ready else "loading"
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    gpu_memory = None
    if torch.cuda.is_available():
        gpu_memory = round(torch.cuda.memory_allocated() / 1e9, 2)
    
    return HealthResponse(
        status="healthy" if model_ready else "loading",
        model_loaded=model_ready,
        device=str(device) if device else "unknown",
        model_name=MODEL_NAME,
        gpu_memory_gb=gpu_memory
    )

@app.post("/caption", response_model=CaptionResponse)
async def generate_caption(
    file: UploadFile = File(...),
    prompt: str = "Describe this image in detail."
):
    """Generate caption for uploaded image"""
    if not model_ready:
        raise HTTPException(status_code=503, detail="Model not ready")
    
    start_time = time.time()
    
    try:
        # Read image data first
        image_data = await file.read()
        
        # Validate by trying to open with PIL (more reliable than content-type)
        try:
            image = Image.open(io.BytesIO(image_data)).convert('RGB')
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")
        
        # Additional size validation
        if len(image_data) < 100:  # Too small to be a real image
            raise HTTPException(status_code=400, detail="Image data too small")
        
        if len(image_data) > 10 * 1024 * 1024:  # Larger than 10MB
            raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
        
        logger.info(f"📸 Processing image: {image.size}, prompt: '{prompt[:50]}...'")
        
        # Generate caption
        caption = await generate_caption_internal(image, prompt)
        
        processing_time = time.time() - start_time
        
        logger.info(f"✅ Caption generated in {processing_time:.2f}s: {caption[:100]}...")
        
        response = CaptionResponse(
            success=True,
            caption=caption,
            processing_time=round(processing_time, 3)
        )
        
        # Log the response for debugging
        logger.info(f"📤 Returning response: success={response.success}, caption_length={len(caption)}")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"❌ Caption generation failed: {e}")
        
        response = CaptionResponse(
            success=False,
            error=str(e),
            processing_time=round(processing_time, 3)
        )
        
        logger.info(f"📤 Returning error response: {response.error}")
        return response

@app.get("/test")
async def test_endpoint():
    """Test endpoint with dummy image"""
    if not model_ready:
        return {"error": "Model not ready"}
    
    try:
        # Create test image
        test_image = Image.new('RGB', (100, 100), color='blue')
        
        # Generate caption
        caption = await generate_caption_internal(test_image, "What do you see?")
        
        return {
            "success": True,
            "test_caption": caption,
            "model": MODEL_NAME
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    logger.info(f"🚀 Starting SmolVLM GPU Worker with {MODEL_NAME}")
    
    # Get configuration
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )