import os
from dotenv import load_dotenv
from openai import OpenAI
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
logger.info("Environment variables loaded")

# Initialize OpenAI client
api_key = os.getenv('OPENAI_API_KEY')
if not api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

client = OpenAI(api_key=api_key)
logger.info("OpenAI client initialized")

try:
    # Make a simple API call
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello, are you there?"}]
    )
    logger.info("Successfully connected to OpenAI API")
    logger.info(f"Response: {response.choices[0].message.content}")
except Exception as e:
    logger.error(f"Error connecting to OpenAI API: {str(e)}")
    raise 