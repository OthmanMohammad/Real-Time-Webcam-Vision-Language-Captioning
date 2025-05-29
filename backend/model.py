"""
Model loading and inference logic for SmolVLM
Handles the AI vision-language model that generates captions from images
"""
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq
from PIL import Image
import logging
import time
import os
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading
import queue

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CaptionGenerator:
    """
    Optimized SmolVLM model for fast real-time captioning.
    Includes multiple performance optimizations for speed.
    """
    
    def __init__(self, model_name="HuggingFaceTB/SmolVLM-256M-Instruct"):
        """
        Initialize the caption generator with optimizations.
        
        Args:
            model_name: HuggingFace model ID to use
        """
        self.model_name = model_name
        
        # Auto-detect best device
        if torch.cuda.is_available():
            self.device = "cuda"
            logger.info("🚀 GPU detected! Using CUDA for faster inference")
        else:
            self.device = "cpu"
            logger.info("💻 Using CPU (consider enabling GPU for 10x faster inference)")
        
        self.processor = None
        self.model = None
        
        # Performance optimization settings
        self.max_image_size = 384  # Smaller than default 512 for speed
        self.max_new_tokens = 25   # Shorter captions for speed
        self.use_cache = True      # Enable KV cache for faster generation
        
        # Concurrent processing
        self.executor = ThreadPoolExecutor(max_workers=1)  # Single worker to avoid memory issues
        self.processing_queue = queue.Queue(maxsize=2)     # Small queue to prevent backlog
        self.last_caption = "Initializing AI vision..."
        self.is_processing = False
        
        # Set cache directory for model downloads
        os.environ['HF_HOME'] = os.path.join(os.getcwd(), '.cache')
        
    def load_model(self):
        """
        Load the model with maximum optimizations for speed.
        """
        try:
            logger.info(f"Loading model: {self.model_name}")
            logger.info("Applying speed optimizations...")
            start_time = time.time()
            
            # Load processor with optimizations
            self.processor = AutoProcessor.from_pretrained(
                self.model_name,
                trust_remote_code=True
            )
            
            # Load model with optimizations
            model_kwargs = {
                "trust_remote_code": True,
                "low_cpu_mem_usage": True,  # Use less memory
            }
            
            # Device-specific optimizations
            if self.device == "cuda":
                model_kwargs.update({
                    "torch_dtype": torch.float16,  # Half precision for GPU
                    "device_map": "auto",          # Automatic device placement
                })
            else:
                model_kwargs.update({
                    "torch_dtype": torch.float32,  # Float32 for CPU stability
                })
            
            self.model = AutoModelForVision2Seq.from_pretrained(
                self.model_name,
                **model_kwargs
            )
            
            if self.device == "cpu":
                self.model = self.model.to(self.device)
            
            # Set to evaluation mode
            self.model.eval()
            
            # Additional CPU optimizations
            if self.device == "cpu":
                logger.info("Applying CPU optimizations...")
                # Enable CPU optimizations
                torch.set_num_threads(4)  # Limit threads to prevent oversubscription
            
            load_time = time.time() - start_time
            logger.info(f"✅ Model loaded in {load_time:.2f} seconds")
            
            # Quick test
            self._test_model()
            
        except Exception as e:
            logger.error(f"❌ Error loading model: {str(e)}")
            raise
    
    def _test_model(self):
        """Run an optimized test"""
        try:
            logger.info("Testing optimized model...")
            test_img = Image.new('RGB', (224, 224), color='blue')
            caption = self.generate_caption_sync(test_img)  # Use sync version for test
            logger.info(f"✅ Test successful: {caption}")
        except Exception as e:
            logger.error(f"❌ Model test failed: {str(e)}")
    
    async def generate_caption_async(self, image: Image.Image) -> str:
        """
        Asynchronous caption generation for non-blocking operation.
        This allows the app to continue running while processing.
        """
        try:
            # If already processing, return last caption immediately
            if self.is_processing:
                return self.last_caption
            
            # Mark as processing
            self.is_processing = True
            
            # Run inference in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            caption = await loop.run_in_executor(
                self.executor, 
                self.generate_caption_sync, 
                image
            )
            
            # Update last caption
            self.last_caption = caption
            return caption
            
        except Exception as e:
            logger.error(f"Async caption generation failed: {str(e)}")
            return self.last_caption
        finally:
            self.is_processing = False
    
    def generate_caption_sync(self, image: Image.Image) -> str:
        """
        Optimized synchronous caption generation - FIXED TOKENIZATION.
        """
        try:
            start_time = time.time()
            
            # Optimize image preprocessing
            optimized_image = self._optimize_image(image)
            
            # Create efficient prompt - SIMPLIFIED for SmolVLM
            messages = [
                {
                    "role": "user", 
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": "Describe this image briefly."}  # Simple prompt
                    ]
                }
            ]
            
            prompt = self.processor.apply_chat_template(messages, add_generation_prompt=True)
            
            # FIXED: Process inputs WITHOUT truncation parameters that break SmolVLM
            inputs = self.processor(
                images=[optimized_image],
                text=prompt,
                return_tensors="pt"
                # Removed: padding, truncation, max_length - these break SmolVLM image processing
            ).to(self.device)
            
            # Generate with speed optimizations
            generation_kwargs = {
                "max_new_tokens": self.max_new_tokens,
                "do_sample": False,           # Deterministic for speed
                "num_beams": 1,              # No beam search for speed
                "early_stopping": True,      # Stop early when possible
                "pad_token_id": self.processor.tokenizer.eos_token_id,
                "use_cache": self.use_cache, # Enable KV cache
                "temperature": 1.0,          # Stable generation
            }
            
            with torch.no_grad():  # Disable gradients
                # Use torch.cuda.amp for mixed precision on GPU
                if self.device == "cuda":
                    with torch.cuda.amp.autocast():
                        output_ids = self.model.generate(**inputs, **generation_kwargs)
                else:
                    output_ids = self.model.generate(**inputs, **generation_kwargs)
            
            # Decode response
            full_response = self.processor.batch_decode(
                output_ids, 
                skip_special_tokens=True
            )[0]
            
            # Clean caption
            caption = self._clean_caption(full_response, prompt)
            
            inference_time = time.time() - start_time
            logger.info(f"⚡ Caption generated in {inference_time:.2f}s: {caption}")
            
            return caption
            
        except Exception as e:
            logger.error(f"Caption generation failed: {str(e)}")
            return f"Processing... ({str(e)[:50]})"
    
    def _optimize_image(self, image: Image.Image) -> Image.Image:
        """
        Optimize image for faster processing while maintaining quality.
        """
        try:
            # Convert to RGB if needed
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Resize to optimal size for speed vs quality balance
            max_size = self.max_image_size
            if image.width > max_size or image.height > max_size:
                # Use LANCZOS for good quality
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            
            return image
            
        except Exception as e:
            logger.error(f"Image optimization failed: {str(e)}")
            return image
    
    def _clean_caption(self, full_response: str, original_prompt: str) -> str:
        """
        Fast caption cleaning - optimized for speed and SmolVLM format.
        """
        try:
            # Remove the original prompt from the response
            if original_prompt in full_response:
                caption = full_response.replace(original_prompt, "").strip()
            else:
                caption = full_response
            
            # Look for the assistant's response after "Assistant:"
            if "Assistant:" in caption:
                caption = caption.split("Assistant:")[-1].strip()
            
            # Remove common patterns quickly
            caption = re.sub(r'^(User:|Assistant:)\s*', '', caption)
            caption = re.sub(r'<\|.*?\|>', '', caption)  # Remove special tokens
            caption = re.sub(r'\n+', ' ', caption)  # Replace newlines with spaces
            caption = caption.strip()
            
            # Quick fallback for empty results
            if not caption or len(caption) < 3:
                caption = "Scene detected"
            
            # Ensure proper ending
            if not caption.endswith(('.', '!', '?')):
                caption += '.'
            
            # Capitalize first letter
            if caption:
                caption = caption[0].upper() + caption[1:]
            
            # Limit length for speed (optional)
            if len(caption) > 150:
                caption = caption[:147] + "..."
            
            return caption
            
        except Exception as e:
            logger.error(f"Caption cleaning failed: {str(e)}")
            return "Scene processed."
    
    def generate_caption(self, image: Image.Image, max_length: int = None) -> str:
        """
        Main caption generation method - backwards compatible.
        """
        if max_length:
            old_max = self.max_new_tokens
            self.max_new_tokens = max_length
            try:
                return self.generate_caption_sync(image)
            finally:
                self.max_new_tokens = old_max
        else:
            return self.generate_caption_sync(image)
    
    def get_performance_info(self) -> dict:
        """
        Get current performance settings and capabilities.
        """
        return {
            "device": self.device,
            "cuda_available": torch.cuda.is_available(),
            "max_image_size": self.max_image_size,
            "max_new_tokens": self.max_new_tokens,
            "model_name": self.model_name,
            "optimizations_enabled": True,
            "concurrent_processing": True,
            "tokenization_fixed": True  # Indicates the fix is applied
        }
    
    def update_settings(self, **kwargs):
        """
        Update performance settings on the fly.
        """
        if "max_image_size" in kwargs:
            self.max_image_size = kwargs["max_image_size"]
            logger.info(f"Updated max_image_size to {self.max_image_size}")
        
        if "max_new_tokens" in kwargs:
            self.max_new_tokens = kwargs["max_new_tokens"]
            logger.info(f"Updated max_new_tokens to {self.max_new_tokens}")

# Global instance (singleton pattern)
caption_generator = CaptionGenerator()

def get_caption_generator():
    """Get the global caption generator instance"""
    return caption_generator