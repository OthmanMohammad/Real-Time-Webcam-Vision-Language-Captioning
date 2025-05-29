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

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CaptionGenerator:
    """
    Manages the SmolVLM model for generating image captions.
    Loads model once and reuses for all inference requests.
    """
    
    def __init__(self, model_name="HuggingFaceTB/SmolVLM-256M-Instruct"):
        """
        Initialize the caption generator with SmolVLM model.
        
        Args:
            model_name: HuggingFace model ID to use
        """
        self.model_name = model_name
        self.device = "cpu"  # Using CPU for free deployment
        self.processor = None
        self.model = None
        
        # Set cache directory for model downloads
        os.environ['TRANSFORMERS_CACHE'] = os.path.join(os.getcwd(), '.cache')
        
    def load_model(self):
        """
        Load the model and processor from HuggingFace.
        This is called once when the server starts.
        """
        try:
            logger.info(f"Loading model: {self.model_name}")
            logger.info("This may take 5-10 minutes on first run to download the model...")
            start_time = time.time()
            
            # Load processor (handles image preprocessing and tokenization)
            self.processor = AutoProcessor.from_pretrained(
                self.model_name,
                trust_remote_code=True  # Required for SmolVLM
            )
            
            # Load model with CPU optimizations
            self.model = AutoModelForVision2Seq.from_pretrained(
                self.model_name,
                torch_dtype=torch.float32,  # Using float32 for CPU
                trust_remote_code=True
            ).to(self.device)
            
            # Set to evaluation mode (disables dropout, etc.)
            self.model.eval()
            
            load_time = time.time() - start_time
            logger.info(f"✅ Model loaded successfully in {load_time:.2f} seconds")
            
            # Test the model with a dummy image
            self._test_model()
            
        except Exception as e:
            logger.error(f"❌ Error loading model: {str(e)}")
            raise
    
    def _test_model(self):
        """Run a quick test to ensure model is working"""
        try:
            logger.info("Testing model with dummy image...")
            # Create a simple test image
            test_img = Image.new('RGB', (224, 224), color='blue')
            caption = self.generate_caption(test_img)
            logger.info(f"Test caption: {caption}")
        except Exception as e:
            logger.error(f"Model test failed: {str(e)}")
    
    def generate_caption(self, image: Image.Image, max_length: int = 50) -> str:
        """
        Generate a caption for the given image.
        
        Args:
            image: PIL Image object
            max_length: Maximum number of tokens to generate
            
        Returns:
            Generated caption text
        """
        try:
            start_time = time.time()
            
            # Create a conversational prompt for the model
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": "Describe this image in one sentence."}
                    ]
                }
            ]
            
            # Apply chat template (formats the prompt for the model)
            prompt = self.processor.apply_chat_template(
                messages,
                add_generation_prompt=True
            )
            
            # Process inputs (resize image, create tensors)
            inputs = self.processor(
                images=[image],
                text=prompt,
                return_tensors="pt"
            ).to(self.device)
            
            # Generate caption
            with torch.no_grad():  # Disable gradient calculation for inference
                output_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=max_length,
                    do_sample=False,  # Deterministic generation
                    temperature=1.0
                )
            
            # Decode the output tokens to text
            caption = self.processor.batch_decode(
                output_ids,
                skip_special_tokens=True
            )[0]
            
            # Clean up the caption (remove prompt and formatting)
            if prompt in caption:
                caption = caption.replace(prompt, "").strip()
            
            # Remove "assistant" prefix if present
            if caption.startswith("assistant"):
                caption = caption[9:].strip()
            
            # Remove any remaining special tokens or formatting
            caption = caption.replace("<|im_end|>", "").strip()
            
            inference_time = time.time() - start_time
            logger.info(f"Caption generated in {inference_time:.2f} seconds: {caption}")
            
            return caption
            
        except Exception as e:
            logger.error(f"Error generating caption: {str(e)}")
            return "Error generating caption. Please try again."

# Global instance (singleton pattern)
caption_generator = CaptionGenerator()

def get_caption_generator():
    """Get the global caption generator instance"""
    return caption_generator