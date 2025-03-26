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

- API keys for OpenAI
- Email configuration for sending reports
- Agent roles and goals
- LLM provider settings

## License

MIT 