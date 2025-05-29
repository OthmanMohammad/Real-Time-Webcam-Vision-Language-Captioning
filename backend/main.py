"""
FastAPI application for real-time webcam captioning
Main server that handles HTTP requests and serves the frontend
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from io import BytesIO
import logging
import os
import sys
import base64

# Add parent directory to path to import from frontend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import our model handler
from model import get_caption_generator

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Webcam Caption API",
    description="Real-time image captioning using SmolVLM",
    version="1.0.0"
)

# Add CORS middleware - allows browser to make requests to our API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get caption generator instance
caption_gen = get_caption_generator()

@app.on_event("startup")
async def startup_event():
    """
    Load the model when the server starts.
    This happens once and the model stays in memory.
    """
    logger.info("🚀 Starting up... Loading AI model...")
    try:
        caption_gen.load_model()
        logger.info("✅ Server ready! Model loaded successfully!")
    except Exception as e:
        logger.error(f"❌ Failed to load model: {str(e)}")
        raise

@app.get("/")
async def root():
    """Serve the frontend HTML file"""
    frontend_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "index.html"
    )
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path)
    else:
        return HTMLResponse(
            "<h1>Frontend not found</h1>"
            "<p>Please ensure frontend/index.html exists.</p>"
        )

# Mount static files for CSS and JS
frontend_dir = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend"
)

if os.path.exists(frontend_dir):
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_dir, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_dir, "js")), name="js")

@app.get("/health")
async def health_check():
    """
    Health check endpoint to verify server status.
    Useful for monitoring and deployment checks.
    """
    return {
        "status": "healthy",
        "model_loaded": caption_gen.model is not None,
        "service": "webcam-caption-api"
    }

@app.post("/caption")
async def generate_caption(image: UploadFile = File(...)):
    """
    Generate caption for uploaded image.
    
    This endpoint receives an image file and returns a text description.
    
    Args:
        image: Uploaded image file (JPEG, PNG, etc.)
        
    Returns:
        JSON response with caption and status
    """
    try:
        # Validate file type
        if not image.content_type or not image.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="File must be an image (JPEG, PNG, etc.)"
            )
        
        # Read image data
        contents = await image.read()
        
        # Validate file size (max 10MB)
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="Image too large. Maximum size is 10MB."
            )
        
        # Open image with PIL
        try:
            pil_image = Image.open(BytesIO(contents)).convert("RGB")
        except Exception as e:
            logger.error(f"Invalid image file: {str(e)}")
            raise HTTPException(
                status_code=400,
                detail="Invalid image file. Please upload a valid image."
            )
        
        # Resize image if too large (to speed up processing)
        max_size = 512
        if pil_image.width > max_size or pil_image.height > max_size:
            pil_image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            logger.info(f"Resized image from {pil_image.width}x{pil_image.height}")
        
        # Generate caption using our AI model
        caption = caption_gen.generate_caption(pil_image)
        
        return {
            "caption": caption,
            "status": "success",
            "image_size": f"{pil_image.width}x{pil_image.height}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing image: {str(e)}"
        )

@app.post("/caption-base64")
async def generate_caption_base64(data: dict):
    """
    Alternative endpoint that accepts base64 encoded images.
    Useful for webcam data that's already in base64 format.
    
    Args:
        data: JSON with 'image' field containing base64 data
        
    Returns:
        JSON response with caption and status
    """
    try:
        # Get base64 data
        image_data = data.get("image", "")
        if not image_data:
            raise HTTPException(
                status_code=400,
                detail="No image data provided"
            )
        
        # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        if "," in image_data:
            image_data = image_data.split(",")[1]
        
        # Decode base64
        try:
            image_bytes = base64.b64decode(image_data)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail="Invalid base64 image data"
            )
        
        # Open image
        pil_image = Image.open(BytesIO(image_bytes)).convert("RGB")
        
        # Resize if needed
        max_size = 512
        if pil_image.width > max_size or pil_image.height > max_size:
            pil_image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        
        # Generate caption
        caption = caption_gen.generate_caption(pil_image)
        
        return {
            "caption": caption,
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing base64 image: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing image: {str(e)}"
        )

# Entry point for running directly
if __name__ == "__main__":
    import uvicorn
    
    logger.info("Starting server...")
    logger.info("Visit http://localhost:8000 to use the app")
    logger.info("API docs available at http://localhost:8000/docs")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes
        log_level="info"
    )