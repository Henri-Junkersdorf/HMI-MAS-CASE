# Inventory Multi-Agent System

A visualization interface for a multi-agent system that analyzes inventory and supplier data for critical components.

## Overview

This project uses CrewAI to create a multi-agent system that performs supply chain and inventory analysis. The frontend visualizes the workflow of the agents as they work together to analyze data and make recommendations.

## Features

- Dynamic visualization of agent workflow
- Real-time status updates during analysis
- Log capture and display
- Run demo button to execute the analysis
- Visualization of agent interactions and dependencies

## Project Structure

- `frontend/`: Contains HTML, CSS, and JavaScript for the visualization interface
- `src/supplier_analysis/`: Contains the implementation of the agent-based analysis
- `app.py`: Flask server that serves the frontend and provides API endpoints

## Setup and Installation

1. **Clone the repository**

2. **Create and activate a virtual environment**
   ```
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   source .venv/bin/activate  # Linux/Mac
   ```

3. **Install dependencies**
   ```
   pip install -e .
   ```

4. **Configure API keys and sensitive information**
   
   Create a `.env` file in the project root with the following information:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   EMAIL_PASSWORD=your_email_password_here
   ```
   
   **IMPORTANT**: The `.env` file is already included in `.gitignore` to prevent accidentally committing sensitive information. Never add API keys or passwords directly to the `pyproject.toml` or any other files that might be committed to the repository.

## Running the Application

1. **Start the Flask server**
   ```
   python app.py
   ```

2. **Access the frontend**
   Open a web browser and navigate to http://localhost:5000

3. **Run the demo**
   Click the "Run Demo" button on the interface to start the agent workflow.

## Agent Workflow

The system consists of 5 specialized agents:

1. **Demand Forecasting Specialist**: Analyzes historical demand data and forecasts future needs
2. **Availability Analyst**: Checks current suppliers for availability
3. **Alternative Supplier Researcher**: Searches for alternative suppliers
4. **Supplier Performance Analyst**: Ranks suppliers based on performance metrics
5. **Communication Specialist**: Summarizes findings and sends recommendations

## Configuration

The configuration for the CrewAI agents is stored in `pyproject.toml`. You can modify the following:

- Agent roles and goals
- LLM provider settings (model, temperature)
- Enabled tools

API keys and other sensitive information should be stored in the `.env` file, not in `pyproject.toml`.

## Working with the Case

This case demonstrates a multi-agent system for inventory and supplier analysis. To work with this case:

1. Make sure your OpenAI API key is set up correctly in the `.env` file
2. Understand the agent workflow and how the different agents interact
3. Examine `src/supplier_analysis/supplier_analysis.py` to understand the implementation details
4. The frontend visualization helps you see the workflow in action
5. You can modify agent roles, goals, and the LLM configuration in `pyproject.toml`

## Security Practices

- Never store API keys or passwords in code files or configuration files that might be committed to version control
- Always use environment variables or a `.env` file (which is included in `.gitignore`)
- Regularly rotate API keys and passwords
- Use the minimum necessary permissions for API keys

## License

MIT

Addition from Dominik:
Draft:
pip install flask
pip install crewai
pip install python-dotenv
pip install duckduckgo-search
pip install tomli 
pip install pandas
row 20-32 in supplier_analysis.py can be commented out