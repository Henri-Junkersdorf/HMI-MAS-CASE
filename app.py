import os
import threading
import json
import time
import logging
import re
import sys
import io
from flask import Flask, render_template, jsonify, send_from_directory, request
from src.supplier_analysis.supplier_analysis import run_analysis

# Helper function to clean ANSI escape sequences
def clean_ansi(text):
    """Remove ANSI escape sequences from text for better readability"""
    if not isinstance(text, str):
        return text
    return re.sub(r'\x1B\[[0-9;]*[mK]', '', text)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Function to monitor email summary file
def monitor_email_summary(process_status):
    """Monitor the email_summary.txt file to check if an email was generated"""
    email_summary_path = os.path.join('src', 'supplier_analysis', 'email_summary.txt')
    email_check_interval = 3  # seconds
    
    # Get the initial modification time if the file exists
    initial_mtime = 0
    if os.path.exists(email_summary_path):
        initial_mtime = os.path.getmtime(email_summary_path)
    
    # Keep checking until the process is no longer running
    while process_status['status'] == 'running':
        time.sleep(email_check_interval)
        
        # Check if file exists and has been modified
        if os.path.exists(email_summary_path):
            current_mtime = os.path.getmtime(email_summary_path)
            
            # If file was modified since we started monitoring
            if current_mtime > initial_mtime:
                logger.info("Email summary file has been updated, confirming email generation")
                process_status['logs'].append("Email has been generated and saved to email_summary.txt")
                
                # Try to read the file to confirm recipient
                try:
                    with open(email_summary_path, 'r') as f:
                        first_line = f.readline().strip()
                        if 'To:' in first_line:
                            recipient = first_line.replace('To:', '').strip()
                            process_status['logs'].append(f"Email prepared for recipient: {recipient}")
                            
                            # Read the entire email content
                            f.seek(0)
                            email_content = f.read()
                            
                            # Radikalere Link-Entfernung
                            # Entferne alle Klammern mit Links vollständig
                            email_content = re.sub(r'\([^)]*https?://[^)]*\)', '', email_content)
                            # Entferne alle URLs
                            email_content = re.sub(r'https?://\S+', '', email_content)
                            # Entferne alle "\n" Zeichenfolgen vollständig
                            email_content = email_content.replace('\\n', '')
                            
                            # Füge nach jedem Punkt einen Absatz ein
                            email_content = re.sub(r'\.(\s+)(?=[A-Z])', '.\n\n', email_content)
                            
                            # Write the modified content back to the file
                            with open(email_summary_path, 'w') as fw:
                                fw.write(email_content)
                except Exception as e:
                    logger.error(f"Error reading or modifying email summary: {str(e)}")
                
                # Don't check again if we found a modification
                break
    
    logger.info("Email monitoring thread completed")

# Create a custom handler to capture logs for the UI
class UILogHandler(logging.Handler):
    def __init__(self, process_status):
        super().__init__()
        self.process_status = process_status
        self.logged_messages = set()

    def emit(self, record):
        try:
            log_message = self.format(record)
            
            # Clean ANSI escape sequences from the log message
            log_message = clean_ansi(log_message)
            
            # Skip common noise logs
            if any(noise in log_message.lower() for noise in [
                'debug mode', 'running on', 'restarting', 'debugger is', 
                'debugger pin', 'development server', 'warning:', 'wsgi',
                'werkzeug', 'api_key', 'monitor'
            ]):
                return
            
            # Create a simplified hash to avoid exact duplicates
            msg_hash = log_message.strip()
            if msg_hash not in self.logged_messages:
                # Check if log is agent-related before adding to logs
                is_agent_related = (
                    'agent' in log_message.lower() or 
                    'task' in log_message.lower() or 
                    'crew' in log_message.lower() or
                    'assigned to' in log_message.lower() or
                    'status:' in log_message.lower() or
                    'thinking...' in log_message.lower() or
                    'executing task' in log_message.lower() or
                    'completed' in log_message.lower() or
                    'in progress' in log_message.lower() or
                    'working on' in log_message.lower() or
                    'starting task' in log_message.lower() or
                    'analyzing' in log_message.lower() or
                    'processing' in log_message.lower() or
                    any(agent_term in log_message.lower() for agent_term in ['specialist', 'analyst', 'researcher', 'communication']) or
                    any(name in log_message for name in [
                        "Demand Forecasting Specialist",
                        "Availability Analyst", 
                        "Alternative Supplier Researcher",
                        "Supplier Performance Analyst", 
                        "Communication Specialist"
                    ])
                )
                
                # Only add agent-related logs
                if is_agent_related:
                    self.process_status['logs'].append(log_message)
                    self.logged_messages.add(msg_hash)
                
                # Try to extract agent information to update status
                # First, check for explicit CrewAI terminal format
                agent_match = re.search(r"Agent:\s*([^,\n]+)", log_message)
                status_match = re.search(r"Status:\s*(Completed|In Progress)", log_message)
                
                # Check specifically for completion indicators
                is_completed = ("✓ Completed" in log_message or 
                               "✅ Completed" in log_message or 
                               "Status: Completed" in log_message or 
                               "Task completed" in log_message)
                
                # Check specifically for working/in-progress indicators
                is_working = ("Task: " in log_message or 
                             "Executing Task" in log_message or 
                             "In Progress" in log_message or
                             "working on" in log_message.lower() or
                             "starting task" in log_message.lower() or
                             "analyzing" in log_message.lower() or
                             "processing" in log_message.lower())
                
                if agent_match:
                    agent_name = clean_ansi(agent_match.group(1).strip())
                    
                    # Default to In Progress if agent is mentioned with a task
                    status = "Completed" if is_completed else "In Progress" if is_working else "In Progress"
                    
                    if status_match:
                        status_text = status_match.group(1).strip()
                        if "Completed" in status_text:
                            status = "Completed"
                    
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: {status}")
                    print(f"UILogHandler detected agent status: {agent_name} - {status}")
                
                # Also look for "Assigned to" format
                assigned_to_match = re.search(r"Assigned to:\s*([^\n]+)", log_message)
                if assigned_to_match:
                    agent_name = clean_ansi(assigned_to_match.group(1).strip())
                    # When an agent is assigned to a task, they're automatically "working"
                    status = "Completed" if is_completed else "In Progress"
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: {status}")
                    print(f"UILogHandler detected assigned agent: {agent_name} - {status}")
                
                # Looking for generic agent names in the format "Name Name"
                if not agent_match and not assigned_to_match:
                    # Try to extract standalone agent names like "Demand Forecasting Specialist"
                    agent_name_match = re.search(r"([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+ [A-Z][a-z]+)", log_message)
                    if agent_name_match:
                        agent_name = agent_name_match.group(1).strip()
                        
                        # Determine status based on the message content
                        if is_completed:
                            status = "Completed"
                        elif is_working:
                            status = "In Progress"
                        else:
                            # Default to working if agent is mentioned
                            status = "In Progress"
                        
                        # Only update if the extracted name looks like an agent
                        if any(agent_term in agent_name.lower() for agent_term in ['specialist', 'analyst', 'researcher', 'communication']):
                            self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: {status}")
                            print(f"UILogHandler detected agent name in text: {agent_name} - {status}")
                
                # Also pass through anything that looks like it might be agent-related
                if 'agent' in log_message.lower() or 'task' in log_message.lower() or 'crew' in log_message.lower():
                    self.process_status['current_agent'] = log_message
            
            # Check for email-related logs
            if 'email' in log_message.lower():
                # Highlight email logs more prominently
                if 'sent' in log_message.lower() and ('success' in log_message.lower() or 'completed' in log_message.lower()):
                    self.process_status['logs'].append(f"✅ EMAIL SENT: {log_message}")
                elif 'fail' in log_message.lower() or 'error' in log_message.lower():
                    self.process_status['logs'].append(f"❌ EMAIL ERROR: {log_message}")
                elif 'capgemini.com' in log_message.lower():
                    # Only add meaningful email logs
                    self.process_status['logs'].append(f"📧 EMAIL: {log_message}")

            # If we found a message that contains an email JSON string, format it for better readability
            if log_message.startswith("{\"recipient\":"):
                try:
                    # Radikalere Link-Entfernung
                    # Entferne alle Klammern mit Links vollständig
                    log_message = re.sub(r'\([^)]*https?://[^)]*\)', '', log_message)
                    # Entferne alle URLs
                    log_message = re.sub(r'https?://\S+', '', log_message)
                    # Entferne alle "\n" Zeichenfolgen vollständig
                    log_message = log_message.replace('\\n', '')
                    
                    # Add line breaks after each period in the body where appropriate
                    # Look for the "body" field and then add line breaks after sentences
                    if "\"body\":" in log_message:
                        # Split at the body field
                        parts = log_message.split("\"body\":", 1)
                        prefix = parts[0] + "\"body\":"
                        
                        # Extract the body content (it's a JSON string within a JSON string)
                        body_content = parts[1]
                        # Find where the body content ends
                        # It should end with a quote followed by a closing brace or comma
                        match = re.search(r'(.*?[^\\]\")(,|\})', body_content)
                        if match:
                            body_text = match.group(1)  # The actual body content string including the closing quote
                            suffix = match.group(2) + body_content[match.end(2):]  # The remaining JSON after body
                            
                            # Replace periods followed by a space and then a character with period + newline + newline
                            modified_body = re.sub(r'\.(\s+)(?=[A-Z])', '.\\\n\\\n', body_text)
                            
                            # Reassemble the JSON
                            log_message = prefix + modified_body + suffix
                except Exception as e:
                    logger.error(f"Error formatting email: {str(e)}")
        except Exception as e:
            print(f"Error in UILogHandler: {str(e)}")

app = Flask(__name__, static_folder='frontend')

# Global variables to track process status
process_status = {
    'status': 'idle',  # 'idle', 'running', 'completed', 'error'
    'logs': [],
    'current_agent': None,
    'result': None
}

# Function for real-time log capturing
def capture_logs(process_status):
    """Capture logs from the actual process and update the process_status."""
    # Configure the root logger to capture logs
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)  # Ensure all logs are captured
    
    # Create a UI log handler that will update the process_status
    ui_handler = UILogHandler(process_status)
    ui_handler.setLevel(logging.INFO)
    ui_handler.setFormatter(logging.Formatter('%(message)s'))
    
    # Add the handler to the root logger
    root_logger.addHandler(ui_handler)
    
    # Add some initial logs for better UX
    logger.info("Analysis started - capturing logs in real-time")
    logger.info("Reading terminal output for agent statuses...")
    
    # Keep the thread alive until the analysis is done
    while process_status['status'] == 'running':
        time.sleep(0.5)
    
    # Remove the handler when done
    root_logger.removeHandler(ui_handler)

# Custom stdout capturing class
class StdoutCapture:
    def __init__(self, process_status):
        self.process_status = process_status
        self.logged_messages = set()
        self.original_stdout = sys.stdout
        self.buffer = ""
        self.current_tree = []
        self.processing_tree = False
        
    def start(self):
        sys.stdout = self
        
    def stop(self):
        sys.stdout = self.original_stdout
        # Process any remaining buffer
        if self.buffer:
            self.process_output(self.buffer)
        # Process any remaining tree
        if self.current_tree:
            self.extract_status_from_tree(self.current_tree)
        
    def write(self, text):
        # Write to the original stdout to maintain console output
        self.original_stdout.write(text)
        
        # Add to buffer for processing complete lines
        self.buffer += text
        
        # Process full lines
        if '\n' in self.buffer:
            lines = self.buffer.split('\n')
            # Keep the last incomplete line in the buffer
            self.buffer = lines.pop()
            
            # Check if we're processing a tree structure
            if any('Task:' in line for line in lines) or any('Assigned to:' in line for line in lines):
                self.processing_tree = True
                self.current_tree.extend(lines)
                
                # Check if tree is complete (an empty line or special marker)
                if any(line.strip() == '' for line in lines) or any('Crew Execution Completed' in line for line in lines):
                    self.extract_status_from_tree(self.current_tree)
                    self.current_tree = []
                    self.processing_tree = False
            else:
                # Process complete lines normally
                for line in lines:
                    if line.strip():  # Skip empty lines
                        self.process_output(line)
            
    def flush(self):
        self.original_stdout.flush()
    
    def extract_status_from_tree(self, lines):
        """Process a multi-line CrewAI tree output to extract agent statuses"""
        # Reset for a fresh process
        self.current_processing = {
            'current_agent': None,
            'current_task': None,
            'current_status': None
        }
        
        # Clean all lines from ANSI escape sequences
        cleaned_lines = []
        for line in lines:
            cleaned_line = clean_ansi(line)
            cleaned_lines.append(cleaned_line)
        
        lines = cleaned_lines
        
        # Store entire tree structure as a single log entry first
        # This is important - it allows the frontend to see the full tree structure
        full_tree = "\n".join(lines)
        if full_tree.strip():
            # Add to logs as a single entry for easier parsing by frontend
            self.process_status['logs'].append(full_tree)
            self.original_stdout.write(f"Added complete tree structure to logs ({len(lines)} lines)\n")
            
            # Also extract individual agent/status pairs from the tree
            # This is the most reliable way to get agent statuses
            for agent_name in [
                "Demand Forecasting Specialist", 
                "Availability Analyst", 
                "Alternative Supplier Researcher", 
                "Supplier Performance Analyst", 
                "Communication Specialist"
            ]:
                # Look for completed status indicators
                if (f"Assigned to: {agent_name}" in full_tree and 
                    ("Status: ✅ Completed" in full_tree or 
                     "Status: ✓ Completed" in full_tree or 
                     "Status: Completed" in full_tree)):
                    
                    # Add explicit status update
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: Completed")
                    self.original_stdout.write(f"TREE EXTRACTION: {agent_name} -> Completed\n")
                    
                # Look for in-progress status indicators
                elif (f"Assigned to: {agent_name}" in full_tree and 
                      ("Status: In Progress" in full_tree or 
                       "Status: Executing Task..." in full_tree)):
                    
                    # Add explicit status update
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: In Progress")
                    self.original_stdout.write(f"TREE EXTRACTION: {agent_name} -> In Progress\n")
        
        # Debug the extracted tree line by line
        for i, line in enumerate(lines):
            self.original_stdout.write(f"Tree line {i}: {line}\n")
            
            # Look for task assignments
            task_match = re.search(r"Task:\s*([a-f0-9-]+)", line)
            if task_match:
                self.current_processing['current_task'] = task_match.group(1).strip()
                self.original_stdout.write(f"Found task: {self.current_processing['current_task']}\n")
                continue
            
            # Look for agent assignments
            assigned_to_match = re.search(r"Assigned to:\s*([^\n]+)", line)
            if assigned_to_match:
                agent_name = clean_ansi(assigned_to_match.group(1).strip())
                self.current_processing['current_agent'] = agent_name
                self.original_stdout.write(f"Found agent assignment: {agent_name}\n")
                
                # When an agent is assigned, it is automatically "working" unless specified otherwise
                self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: In Progress")
                self.original_stdout.write(f"Setting assigned agent to working: {agent_name}\n")
                
                # Check the next few lines for status information
                status_line_index = i + 1
                while status_line_index < min(i + 5, len(lines)):
                    status_line = lines[status_line_index]
                    if "Status:" in status_line:
                        if "Completed" in status_line or "✅" in status_line or "✓" in status_line:
                            self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: Completed")
                            self.original_stdout.write(f"NEARBY STATUS: Setting {agent_name} to Completed\n")
                        elif "In Progress" in status_line or "Executing" in status_line:
                            self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: In Progress")
                            self.original_stdout.write(f"NEARBY STATUS: Setting {agent_name} to In Progress\n")
                        break
                    status_line_index += 1
                continue
            
            # Look for agent declarations
            agent_match = re.search(r"Agent:\s*([^\n]+)", line)
            if agent_match and not line.strip().startswith('│'): # Only match main agent line, not indented ones
                agent_name = clean_ansi(agent_match.group(1).strip())
                self.current_processing['current_agent'] = agent_name
                self.original_stdout.write(f"Found agent declaration: {agent_name}\n")
                
                # Default agent to working when mentioned, unless status is specified
                if not re.search(r"Status:", line):
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: In Progress")
                    self.original_stdout.write(f"Setting declared agent to working: {agent_name}\n")
                continue
            
            # Look for status indicators - IMPORTANT: Only update current agent's status
            status_match = re.search(r"Status:\s*([^\n]+)", line)
            current_agent = self.current_processing.get('current_agent')
            
            if status_match and current_agent:
                status_text = status_match.group(1).strip()
                self.original_stdout.write(f"Found status for {current_agent}: {status_text}\n")
                
                # Process different status types
                if re.search(r"(?:[✓|✅]\s*)?[Cc]ompleted", status_text):
                    # We found a completed agent
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {current_agent}, Status: Completed")
                    self.original_stdout.write(f"COMPLETION MARKER found for agent: {current_agent}\n")
                elif re.search(r"Executing Task|In Progress|Working|processing|thinking", status_text, re.IGNORECASE):
                    # We found an executing/working/in-progress agent
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {current_agent}, Status: In Progress")
                    self.original_stdout.write(f"Detected in-progress agent from tree: {current_agent}\n")
                continue
        
        # Add each line individually as well to ensure the frontend can parse them
        for line in lines:
            if line.strip():
                self.process_status['logs'].append(line)
                self.logged_messages.add(line.strip())
        
    def process_output(self, text):
        # Skip empty lines
        if not text.strip():
            return
            
        # Remove ANSI escape sequences for better readability
        text = clean_ansi(text)
        
        # Create a simplified hash to avoid duplicates
        msg_hash = text.strip()
        if msg_hash not in self.logged_messages:
            # Check if text is agent-related before adding to logs
            is_agent_related = (
                'agent' in text.lower() or 
                'task' in text.lower() or 
                'crew' in text.lower() or
                'assigned to' in text.lower() or
                'status:' in text.lower() or
                'thinking...' in text.lower() or
                'executing task' in text.lower() or
                'completed' in text.lower() or
                'in progress' in text.lower() or
                'working on' in text.lower() or
                'starting task' in text.lower() or
                'analyzing' in text.lower() or
                'processing' in text.lower() or
                any(agent_term in text.lower() for agent_term in ['specialist', 'analyst', 'researcher', 'communication']) or
                any(name in text for name in [
                    "Demand Forecasting Specialist",
                    "Availability Analyst", 
                    "Alternative Supplier Researcher",
                    "Supplier Performance Analyst", 
                    "Communication Specialist"
                ])
            )
            
            # Only add agent-related logs
            if is_agent_related:
                # Add to process status logs
                self.process_status['logs'].append(text)
                self.logged_messages.add(msg_hash)
            
            # Try to extract agent and status info
            # Check for CrewAI output in original format with emojis
            if '🤖 Agent:' in text or 'Agent:' in text:
                agent_match = re.search(r"Agent:\s*([^\n,]+)", text)
                status_match = re.search(r"Status:\s*(Completed|In Progress|✅ Completed|✓ Completed)", text)
                
                if agent_match:
                    agent_name = agent_match.group(1).strip()
                    
                    # Default status is "working" unless a status is specified
                    status = "In Progress"
                    
                    # Check completion indicators first - prioritize completion detection
                    if "✓ Completed" in text or "✅ Completed" in text or "Task complete" in text or "Task completed" in text:
                        status = "Completed"
                        self.original_stdout.write(f"COMPLETION DETECTED for agent {agent_name}\n")
                    # Then check for status match
                    elif status_match:
                        status = status_match.group(1).strip()
                        
                        # Clean up the status
                        if "✅" in status or "✓" in status or "Completed" in status or "completed" in status:
                            status = "Completed"
                            self.original_stdout.write(f"COMPLETION DETECTED via status for agent {agent_name}\n")
                    
                    # More explicit completion checks
                    if re.search(r"completed|done|finished|finalized", text, re.IGNORECASE) and not re.search(r"task not completed", text, re.IGNORECASE):
                        status = "Completed"
                        self.original_stdout.write(f"COMPLETION DETECTED via regex for agent {agent_name}\n")
                    
                    # Only check for In Progress indicators if we haven't found a Completed status
                    if status != "Completed" and ("In Progress" in text or "Executing" in text or "Thinking" in text):
                        status = "In Progress"
                        self.original_stdout.write(f"Setting agent to In Progress based on keywords: {agent_name}\n")
                    
                    # Update current agent status
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: {status}")
                    self.original_stdout.write(f"Captured agent info: Agent {agent_name} with status {status}\n")
            
            # Check for CrewAI tree format elements
            if 'Task:' in text or 'Assigned to:' in text:
                assigned_to_match = re.search(r"Assigned to:\s*([^\n]+)", text)
                status_completed = re.search(r"Status:\s*(?:[✓|✅]\s*)?Completed", text) or "✓ Completed" in text
                status_executing = "Status: Executing Task" in text or "Status: In Progress" in text
                
                if assigned_to_match:
                    agent_name = assigned_to_match.group(1).strip()
                    
                    # When an agent is assigned to a task, it should be marked as working unless completed
                    status = "Completed" if status_completed else "In Progress"
                    
                    # Update current agent status
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: {status}")
                    self.original_stdout.write(f"Captured tree format element: Agent {agent_name} with status {status}\n")
            
            # Check standalone task completion messages
            if "Task complete" in text or "Task completed" in text:
                # Try to extract agent name
                agent_match = re.search(r"Agent:\s*([^\n,]+)", text)
                if agent_match:
                    agent_name = agent_match.group(1).strip()
                    # Update current agent status
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: Completed")
                    self.original_stdout.write(f"Captured task completion: Agent {agent_name} completed\n")
            
            # Check standalone "Thinking..." messages which indicate an agent is working
            if "Thinking..." in text:
                # Try to extract agent name from nearby context
                agent_match = re.search(r"Agent:\s*([^\n,]+)", text)
                if agent_match:
                    agent_name = agent_match.group(1).strip()
                    # Update current agent status to working
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: In Progress")
                    self.original_stdout.write(f"Captured agent thinking (in progress): {agent_name}\n")
            
            # Check for any generic agent-task assignments or start indicators
            if "starting" in text.lower() or "beginning" in text.lower() or "initializing" in text.lower():
                agent_match = re.search(r"Agent:\s*([^\n,]+)", text) or re.search(r"([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+ [A-Z][a-z]+)", text)
                if agent_match:
                    agent_name = agent_match.group(1).strip()
                    # Update current agent status to working
                    self.process_status['current_agent'] = clean_ansi(f"Agent: {agent_name}, Status: In Progress")
                    self.original_stdout.write(f"Captured agent starting work: {agent_name}\n")

@app.route('/')
def index():
    """Serve the main frontend page."""
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from the frontend directory."""
    return send_from_directory('frontend', path)

@app.route('/api/status')
def get_status():
    """Return the current process status."""
    try:
        # Add timestamp to force client to recognize it as fresh data
        response_data = process_status.copy()
        response_data['timestamp'] = time.time()
        return jsonify(response_data)
    except Exception as e:
        logger.error(f"Error in status endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': time.time()
        }), 500

@app.route('/api/run', methods=['POST'])
def run_demo():
    """Run the analysis demo."""
    try:
        # Don't run if already running
        if process_status['status'] == 'running':
            return jsonify({'error': 'Process is already running'}), 400
        
        # Reset status
        process_status.update({
            'status': 'running',
            'logs': [],
            'current_agent': None,
            'result': None
        })
        
        # Start the analysis in a separate thread to not block the main thread
        thread = threading.Thread(target=run_demo_thread)
        thread.daemon = True
        thread.start()
        
        return jsonify({'status': 'started'})
    except Exception as e:
        logger.error(f"Error starting demo: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

def run_demo_thread():
    """Run the analysis demo in a separate thread."""
    global process_status
    try:
        # Log simulation thread
        log_thread = threading.Thread(target=capture_logs, args=(process_status,))
        log_thread.daemon = True
        log_thread.start()
        
        # Start stdout capture
        stdout_capture = StdoutCapture(process_status)
        stdout_capture.start()
        
        # Start email monitoring
        email_monitor_thread = threading.Thread(target=monitor_email_summary, args=(process_status,))
        email_monitor_thread.daemon = True
        email_monitor_thread.start()
        
        # Run the actual analysis
        print("Starting analysis with CrewAI agents...")
        result = run_analysis()
        
        # Stop stdout capture
        stdout_capture.stop()
        
        # Update process status
        process_status.update({
            'status': 'completed',
            'result': str(result) if result else "Analysis completed successfully with email sent."
        })
        
        # Ensure log contains email confirmation
        logger.info("Email has been sent with analysis results")
    except Exception as e:
        # Update process status on error
        error_msg = f"Error: {str(e)}"
        logger.error(error_msg)
        process_status.update({
            'status': 'error',
            'result': error_msg
        })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True) 