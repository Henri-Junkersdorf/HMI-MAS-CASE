document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const runDemoBtn = document.getElementById('run-demo-btn');
    const statusIndicator = document.getElementById('status-indicator');
    const workflowDiagram = document.getElementById('workflow-diagram');
    const agentLogs = document.getElementById('agent-logs');
    const summaryViewToggle = document.getElementById('summary-view-toggle');
    
    // Define agents and their workflow with better spacing to completely prevent overlapping
    const agents = [
        {
            id: 'demand-forecasting',
            name: 'Demand Forecasting Specialist',
            role: 'Forecast demand and recommend reorder quantities',
            position: { x: 110, y: 40 },
            status: 'waiting'
        },
        {
            id: 'availability-analyst',
            name: 'Availability Analyst',
            role: 'Analyze supplier availability',
            position: { x: 110, y: 310 },
            status: 'waiting'
        },
        {
            id: 'researcher',
            name: 'Alternative Supplier Researcher',
            role: 'Find alternative suppliers',
            position: { x: 380, y: 310 },
            status: 'waiting'
        },
        {
            id: 'performance-analyst',
            name: 'Supplier Performance Analyst',
            role: 'Rank suppliers based on performance metrics',
            position: { x: 110, y: 520 },
            status: 'waiting'
        },
        {
            id: 'communication',
            name: 'Communication Specialist',
            role: 'Summarize findings and communicate results',
            position: { x: 110, y: 770 },
            status: 'waiting'
        }
    ];
    
    // Define the workflow connections
    const connections = [
        { from: 'demand-forecasting', to: 'availability-analyst' },
        { from: 'availability-analyst', to: 'researcher' },
        { from: 'availability-analyst', to: 'performance-analyst' },
        { from: 'researcher', to: 'performance-analyst' },
        { from: 'performance-analyst', to: 'communication' }
    ];
    
    // Define the workflow sequence for correct log ordering
    const workflowSequence = [
        'Forecasting',
        'Availability',
        'Alt. Supplier',
        'Performance',
        'Communication'
    ];
    
    // Track if we're in summary view mode
    let summaryViewEnabled = false;
    
    // Store the complete logs as well as the summary logs
    const completeLogEntries = [];
    const summaryLogEntries = [];
    
    // Track which agents we've already shown messages for
    const agentSummaryState = {
        'Forecasting': { working: false, completed: false },
        'Availability': { working: false, completed: false },
        'Alt. Supplier': { working: false, completed: false },
        'Performance': { working: false, completed: false },
        'Communication': { working: false, completed: false }
    };
    
    // Track the message content we've already shown for each agent
    const agentMessageTracker = {
        'Forecasting': new Set(),
        'Availability': new Set(),
        'Alt. Supplier': new Set(), 
        'Performance': new Set(),
        'Communication': new Set()
    };
    
    // Track message count per agent for the summary view (allowing 3-5 messages per agent)
    const agentMessageCounts = {
        'Forecasting': 0,
        'Availability': 0,
        'Alt. Supplier': 0,
        'Performance': 0,
        'Communication': 0
    };
    
    // Track the actual descriptions shown to prevent duplicates with different task types
    const shownDescriptions = {
        'Forecasting': new Set(),
        'Availability': new Set(),
        'Alt. Supplier': new Set(),
        'Performance': new Set(),
        'Communication': new Set()
    };
    
    // Maximum messages to show per agent in summary view
    const MAX_MESSAGES_PER_AGENT = 6;
    
    // Predefined task descriptions to ensure variety in the summary view
    const predefinedTasks = {
        'Forecasting': [
            'Analyzing historical demand data',
            'Identifying seasonal patterns',
            'Calculating optimal reorder points',
            'Building forecasting model',
            'Forecasting future demand requirements',
            'Determining safety stock levels'
        ],
        'Availability': [
            'Checking current inventory levels',
            'Evaluating supplier lead times',
            'Assessing production capacity',
            'Analyzing supply chain risks',
            'Verifying part availability',
            'Reviewing stock allocation'
        ],
        'Alt. Supplier': [
            'Searching for alternative suppliers',
            'Evaluating supplier qualifications',
            'Comparing geographical locations',
            'Analyzing pricing structures',
            'Assessing quality standards',
            'Reviewing supplier capabilities'
        ],
        'Performance': [
            'Ranking suppliers by performance',
            'Evaluating delivery reliability',
            'Analyzing quality metrics',
            'Comparing cost efficiency',
            'Assessing risk profiles',
            'Creating performance scorecards'
        ],
        'Communication': [
            'Drafting procurement recommendations',
            'Summarizing findings for stakeholders',
            'Preparing supplier action plans',
            'Creating executive summary',
            'Drafting supplier communications',
            'Finalizing procurement strategy'
        ]
    };
    
    // Render the initial workflow diagram
    renderWorkflow();
    
    // API state variables
    let statusPollingInterval = null;
    let useSimulation = false; // Set to false to use real backend API
    
    // Handle run demo button click
    runDemoBtn.addEventListener('click', function() {
        // Reset the state
        resetWorkflow();
        
        // Clear all logs
        agentLogs.innerHTML = '';
        completeLogEntries.length = 0;
        summaryLogEntries.length = 0;
        
        // Reset the agent summary state tracker - ensure each agent shows one working and one completed entry
        Object.keys(agentSummaryState).forEach(key => {
            agentSummaryState[key].working = false;
            agentSummaryState[key].completed = false;
        });
        
        // Update status
        statusIndicator.className = 'status-indicator running';
        statusIndicator.textContent = 'Status: Running';
        
        // Disable the button during execution
        runDemoBtn.disabled = true;
        
        // Call the API to start the demo
        fetch('/api/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'started') {
                // Start polling for status updates
                startStatusPolling();
            } else {
                addLogEntry('system', 'Error starting the demo: ' + JSON.stringify(data));
                statusIndicator.className = 'status-indicator error';
                statusIndicator.textContent = 'Status: Error';
                runDemoBtn.disabled = false;
            }
        })
        .catch(error => {
            addLogEntry('system', 'Error starting the demo: ' + error.message);
            statusIndicator.className = 'status-indicator error';
            statusIndicator.textContent = 'Status: Error';
            runDemoBtn.disabled = false;
        });
    });
    
    // Add event listener for summary view toggle
    summaryViewToggle.addEventListener('change', function() {
        summaryViewEnabled = this.checked;
        updateLogDisplay();
    });
    
    // Function to start polling for status updates
    function startStatusPolling() {
        let errorCount = 0;
        const maxErrors = 3; // Allow up to 3 consecutive errors before showing error state
        
        // Poll every 500ms for more responsive updates
        statusPollingInterval = setInterval(() => {
            fetch('/api/status')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    errorCount = 0; // Reset error count on successful response
                    return response.json();
                })
                .then(data => updateUIFromStatus(data))
                .catch(error => {
                    console.error('Error polling status:', error);
                    errorCount++;
                    
                    // Only stop polling and show error after multiple consecutive failures
                    if (errorCount >= maxErrors) {
                        // Stop polling on persistent error
                        clearInterval(statusPollingInterval);
                        
                        // Update UI
                        statusIndicator.className = 'status-indicator error';
                        statusIndicator.textContent = 'Status: Connection Error';
                        runDemoBtn.disabled = false;
                    } else {
                        console.log(`Connection error ${errorCount}/${maxErrors}, will retry...`);
                    }
                });
        }, 500);
    }
    
    // EXACT MATCH APPROACH FOR CrewAI OUTPUT
    // These are the exact agent names in our workflow
    const exactAgentNames = [
        "Demand Forecasting Specialist",
        "Availability Analyst",
        "Alternative Supplier Researcher",
        "Supplier Performance Analyst",
        "Communication Specialist"
    ];
    
    // This function ensures agent status is updated directly (not via matchingAgent)
    function updateExactAgentStatus(name, status) {
        const agent = agents.find(a => a.name === name);
        if (agent && agent.status !== status) {
            console.log(`Directly updating ${name} to ${status}`);
            agent.status = status;
            
            // Update the DOM element directly
            const elem = document.getElementById(agent.id);
            if (elem) {
                // Remove all status classes
                elem.classList.remove('agent-waiting', 'agent-working', 'agent-completed');
                // Add the correct class
                elem.classList.add(`agent-${status}`);
                
                // Update the status text
                const statusElem = elem.querySelector('.agent-status');
                if (statusElem) {
                    statusElem.className = `agent-status ${status}`;
                    statusElem.textContent = capitalizeFirstLetter(status);
                }
            }
            return true;
        }
        return false;
    }
    
    // Function to update UI based on status from the API
    function updateUIFromStatus(statusData) {
        // Debug the raw data received
        console.log("Raw status data received:", JSON.stringify(statusData));
        
        // Safety check - if response is empty or invalid, don't process it
        if (!statusData || typeof statusData !== 'object') {
            console.error('Invalid status data received:', statusData);
            return;
        }
        
        // Update global status
        if (statusData.status !== 'running') {
            // Stop polling when process is no longer running
            clearInterval(statusPollingInterval);
            runDemoBtn.disabled = false;
            
            // When process completes, ensure all agents that were "working" are marked "completed"
            if (statusData.status === 'completed') {
                console.log("Process completed, finalizing agent statuses");
                let anyUpdated = false;
                for (const agent of agents) {
                    if (agent.status === 'working') {
                        console.log(`Process finished: Marking ${agent.name} as completed automatically`);
                        updateExactAgentStatus(agent.name, 'completed');
                        anyUpdated = true;
                    }
                }
                
                // Add predefined logs if needed
                addPredefinedLogs();
                
                if (anyUpdated) {
                    renderWorkflow();
                }
            }
        }
        
        // Update status indicator
        if (statusData.status) {
            statusIndicator.className = `status-indicator ${statusData.status}`;
            statusIndicator.textContent = `Status: ${capitalizeFirstLetter(statusData.status)}`;
        }
        
        let statusChanged = false;

        // SPECIAL CASE: Look for the completion of "Alternative Supplier Researcher" specifically in the raw logs
        if (statusData.logs && Array.isArray(statusData.logs)) {
            const allLogsText = statusData.logs.join('\n');
            
            // Check explicitly for markers that the researcher agent has completed
            if (allLogsText.includes('Alternative Supplier Researcher') && 
                allLogsText.includes('Alternative suppliers identified') ||
                allLogsText.includes('Found alternative suppliers')) {
                
                console.log("Found evidence that Alternative Supplier Researcher has completed!");
                if (updateExactAgentStatus('Alternative Supplier Researcher', 'completed')) {
                    statusChanged = true;
                }
            }
            
            // Scan the logs for explicit completion evidence for each agent
            for (const agentName of exactAgentNames) {
                // Check for completed phrases in any proximity to the agent name
                const agentCompletedRegex = new RegExp(`${agentName}[\\s\\S]{1,200}(✅ Completed|✓ Completed|Status: Completed|task complete|Task completed)`, 'i');
                const completedAgentRegex = new RegExp(`(✅ Completed|✓ Completed|Status: Completed|task complete|Task completed)[\\s\\S]{1,200}${agentName}`, 'i');
                
                if (agentCompletedRegex.test(allLogsText) || completedAgentRegex.test(allLogsText)) {
                    console.log(`Found completion evidence for ${agentName} in log proximity search`);
                    if (updateExactAgentStatus(agentName, 'completed')) {
                        statusChanged = true;
                    }
                }
            }
        }

        // Process all logs for explicit agent mentions
        if (statusData.logs && Array.isArray(statusData.logs)) {
            // First scan all logs for mentions of "Supplier Performance Analyst" and "Communication Specialist"
            // These agents seem to get stuck most often
            const allLogsText = statusData.logs.join('\n');
            
            for (const agentName of exactAgentNames) {
                // Check for completed status
                if (allLogsText.includes(`${agentName}`) && 
                    (allLogsText.includes("Status: ✅ Completed") || 
                     allLogsText.includes(`${agentName}`) && allLogsText.includes("Status: Completed"))) {
                    if (updateExactAgentStatus(agentName, 'completed')) {
                        statusChanged = true;
                    }
                }
                // Check for working status
                else if (allLogsText.includes(`${agentName}`) && 
                         (allLogsText.includes("Status: In Progress") || 
                          allLogsText.includes("Status: Executing Task"))) {
                    if (updateExactAgentStatus(agentName, 'working')) {
                        statusChanged = true;
                    }
                }
            }
            
            // Process individual logs for more detailed updates
            statusData.logs.forEach(logEntry => {
                if (!logEntry || typeof logEntry !== 'string') return;
                
                if (updateAgentStatusFromLog(logEntry)) {
                    statusChanged = true;
                }
            });
        }
        
        // DIRECT MAPPING: Check current_agent from backend (most reliable)
        if (statusData.current_agent) {
            console.log("Direct agent status update:", statusData.current_agent);
            
            // Parse "Agent: X, Status: Y" format
            const agentMatch = statusData.current_agent.match(/Agent:\s*([^,]+),\s*Status:\s*([^,\n]+)/i);
            if (agentMatch) {
                const agentName = agentMatch[1].trim();
                const statusText = agentMatch[2].trim();
                
                // Map backend status to frontend status
                let mappedStatus;
                if (statusText.toLowerCase().includes('completed')) {
                    mappedStatus = 'completed';
                } else if (statusText.toLowerCase().includes('in progress')) {
                    mappedStatus = 'working';
                } else {
                    mappedStatus = 'waiting';
                }
                
                // Use direct agent update for reliability
                for (const exactName of exactAgentNames) {
                    if (agentName.includes(exactName)) {
                        if (updateExactAgentStatus(exactName, mappedStatus)) {
                            statusChanged = true;
                            console.log(`Updated ${exactName} to ${mappedStatus} from backend`);
                        }
                    }
                }
            }
        }

        // Update logs display
        if (statusData.logs && Array.isArray(statusData.logs)) {
            const currentLogCount = document.querySelectorAll('.log-entry').length;
            
            // Only add new logs
            if (statusData.logs.length > currentLogCount) {
                const newLogs = statusData.logs.slice(currentLogCount);
                newLogs.forEach(logEntry => {
                    if (logEntry && typeof logEntry === 'string') {
                        addLogEntry('system', logEntry);
                    }
                });
            }
        }
        
        // Re-render workflow if any statuses changed
        if (statusChanged) {
            console.log("Re-rendering workflow due to status changes");
            renderWorkflow();
        }
    }
    
    // Function to update agent status based on log entries
    function updateAgentStatusFromLog(log) {
        let statusChanged = false;

        // Skip processing if log entry is too short or empty
        if (!log || log.length < 5) return false;
        
        // Log entry for debugging
        console.log(`Processing log: ${log.substring(0, 100)}...`);

        // EXACT MATCH APPROACH FOR CrewAI OUTPUT
        // Try exact agent name matching first (most reliable)
        for (const agentName of exactAgentNames) {
            // Check for completed status in CrewAI format
            if ((log.includes(`Assigned to: ${agentName}`) || log.includes(`Agent: ${agentName}`)) && 
                (log.includes("Status: ✅ Completed") || log.includes("Status: ✓ Completed") || log.includes("Status: Completed"))) {
                
                console.log(`Found EXACT MATCH for ${agentName} - COMPLETED`);
                
                if (updateExactAgentStatus(agentName, 'completed')) {
                    console.log(`Updated ${agentName} to completed from exact match`);
                    statusChanged = true;
                }
            }
            // Check for in progress status in CrewAI format
            else if ((log.includes(`Assigned to: ${agentName}`) || log.includes(`Agent: ${agentName}`)) && 
                     (log.includes("Status: In Progress") || log.includes("Status: Executing Task..."))) {
                
                console.log(`Found EXACT MATCH for ${agentName} - WORKING`);
                
                if (updateExactAgentStatus(agentName, 'working')) {
                    console.log(`Updated ${agentName} to working from exact match`);
                    statusChanged = true;
                }
            }
            // If agent is mentioned with Task but no status, mark as working
            else if ((log.includes(`Assigned to: ${agentName}`) || log.includes(`Agent: ${agentName}`)) && 
                     log.includes("Task:")) {
                
                console.log(`Found TASK ASSIGNMENT for ${agentName} - setting to WORKING`);
                
                if (updateExactAgentStatus(agentName, 'working')) {
                    console.log(`Updated ${agentName} to working from task assignment`);
                    statusChanged = true;
                }
            }
        }

        // APPROACH 1: DIRECT CREWAI TREE FORMAT
        // This is reliable for multi-line tree format
        if (log.includes('📋 Task:') && log.includes('Assigned to:')) {
            console.log("Found CrewAI task format");
            
            // Extract agent name
            const assignedMatch = log.match(/Assigned to:\s*([^,\n]+)/);
            if (assignedMatch) {
                const extractedAgentName = assignedMatch[1].trim();
                console.log(`Found agent: ${extractedAgentName} in task assignment`);
                
                // Check status markers
                let status = null;
                if (log.includes('Status: ✅ Completed') || log.includes('Status: ✓ Completed') || log.includes('Status: Completed')) {
                    status = 'completed';
                    console.log(`Found completed status for ${extractedAgentName}`);
                } else if (log.includes('Status: In Progress') || log.includes('Status: Executing Task') || log.includes('Thinking...')) {
                    status = 'working';
                    console.log(`Found working status for ${extractedAgentName}`);
                }
                
                if (status) {
                    // Try direct update with exact names
                    let directUpdateSuccess = false;
                    for (const exactName of exactAgentNames) {
                        if (extractedAgentName.includes(exactName)) {
                            if (updateExactAgentStatus(exactName, status)) {
                                console.log(`Updated ${exactName} to ${status} from CrewAI tree with direct matching`);
                                statusChanged = true;
                                directUpdateSuccess = true;
                            }
                        }
                    }
                    
                    // Fallback to original approach if direct update failed
                    if (!directUpdateSuccess) {
                        const matchingAgent = findMatchingAgent(extractedAgentName);
                        if (matchingAgent) {
                            if (updateAgentStatus(matchingAgent.name, status)) {
                                console.log(`Updated ${matchingAgent.name} to ${status} from CrewAI tree`);
                                statusChanged = true;
                            }
                        }
                    }
                }
            }
        }
        
        // APPROACH 2: AGENT DECLARATION WITH STATUS
        if (log.includes('🤖 Agent:') || log.includes('Agent:')) {
            console.log("Found Agent declaration");
            
            // Extract agent name and status
            const agentMatch = log.match(/Agent:\s*([^,\n]+)/);
            if (agentMatch) {
                const extractedAgentName = agentMatch[1].trim();
                console.log(`Found agent declaration: ${extractedAgentName}`);
                
                // Check status markers
                let status = null;
                if (log.includes('Status: ✅ Completed') || log.includes('Status: ✓ Completed') || log.includes('Status: Completed')) {
                    status = 'completed';
                } else if (log.includes('Status: In Progress') || log.includes('Status: Executing Task') || log.includes('Thinking...')) {
                    status = 'working';
                }
                
                if (status) {
                    // Try direct update with exact names
                    let directUpdateSuccess = false;
                    for (const exactName of exactAgentNames) {
                        if (extractedAgentName.includes(exactName)) {
                            if (updateExactAgentStatus(exactName, status)) {
                                console.log(`Updated ${exactName} to ${status} from agent declaration with direct matching`);
                                statusChanged = true;
                                directUpdateSuccess = true;
                            }
                        }
                    }
                    
                    // Fallback to original approach if direct update failed
                    if (!directUpdateSuccess) {
                        const matchingAgent = findMatchingAgent(extractedAgentName);
                        if (matchingAgent) {
                            if (updateAgentStatus(matchingAgent.name, status)) {
                                console.log(`Updated ${matchingAgent.name} to ${status} from agent declaration`);
                                statusChanged = true;
                            }
                        }
                    }
                }
            }
        }

        // APPROACH 3: STANDARD FORMAT PARSING
        // Get agent name from log (CrewAI formats)
        let agentName = null;
        let status = null;
        
        // Format 1: Agent: X, Status: Y
        const agentStatusMatch = log.match(/Agent:\s*([^,]+),\s*Status:\s*([^,\n]+)/i);
        if (agentStatusMatch) {
            agentName = agentStatusMatch[1].trim();
            const statusText = agentStatusMatch[2].trim();
            
            if (statusText.includes('Completed') || statusText.includes('✅') || statusText.includes('✓')) {
                status = 'completed';
            } else if (statusText.includes('In Progress') || statusText.includes('Executing')) {
                status = 'working';
            }
        }
        
        // Format 2: Assigned to: X, Status: Y
        if (!agentName) {
            const assignedMatch = log.match(/Assigned to:\s*([^,\n]+)[\s\S]*?Status:\s*([^,\n]+)/i);
            if (assignedMatch) {
                agentName = assignedMatch[1].trim();
                const statusText = assignedMatch[2].trim();
                
                if (statusText.includes('Completed') || statusText.includes('✅') || statusText.includes('✓')) {
                    status = 'completed';
                } else if (statusText.includes('In Progress') || statusText.includes('Executing')) {
                    status = 'working';
                }
            }
        }
        
        // If we found both an agent name and status, update the agent
        if (agentName && status) {
            console.log(`Found standard status update: ${agentName} -> ${status}`);
            
            // Try direct update with exact names
            let directUpdateSuccess = false;
            for (const exactName of exactAgentNames) {
                if (agentName.includes(exactName)) {
                    if (updateExactAgentStatus(exactName, status)) {
                        console.log(`Updated ${exactName} to ${status} from standard format with direct matching`);
                        statusChanged = true;
                        directUpdateSuccess = true;
                    }
                }
            }
            
            // Fallback to original approach if direct update failed
            if (!directUpdateSuccess) {
                const matchingAgent = findMatchingAgent(agentName);
                if (matchingAgent) {
                    if (updateAgentStatus(matchingAgent.name, status)) {
                        console.log(`Updated ${matchingAgent.name} to ${status} from standard format`);
                        statusChanged = true;
                    }
                }
            }
        }
        
        return statusChanged;
    }
    
    // Helper function to find a matching agent with different strategies
    function findMatchingAgent(agentName) {
        if (!agentName) return null;
        
        console.log(`Looking for match for agent: "${agentName}"`);
        
        // Try exact matches first
        for (const agent of agents) {
            if (agent.name === agentName) {
                console.log(`Found exact match for: ${agent.name}`);
                return agent;
            }
        }
        
        // Try case-insensitive match
        const normalizedName = agentName.toLowerCase().trim();
        for (const agent of agents) {
            if (agent.name.toLowerCase().trim() === normalizedName) {
                console.log(`Found case-insensitive match for: ${agent.name}`);
                return agent;
            }
        }
        
        // Define agent name mappings - these are common variations seen in CrewAI logs
        const agentMappings = {
            "demand forecasting specialist": "Demand Forecasting Specialist",
            "demand specialist": "Demand Forecasting Specialist",
            "availability analyst": "Availability Analyst",
            "alternative supplier researcher": "Alternative Supplier Researcher",
            "supplier researcher": "Alternative Supplier Researcher",
            "supplier performance analyst": "Supplier Performance Analyst",
            "performance analyst": "Supplier Performance Analyst",
            "communication specialist": "Communication Specialist"
        };
        
        // Check if we have a direct mapping
        if (normalizedName in agentMappings) {
            const mappedName = agentMappings[normalizedName];
            const agent = agents.find(a => a.name === mappedName);
            if (agent) {
                console.log(`Found mapped name for "${normalizedName}" -> "${mappedName}"`);
                return agent;
            }
        }
        
        // Try to find by partial match based on significant words
        for (const agent of agents) {
            // Split agent name into significant words (longer than 4 chars)
            const nameWords = agent.name.toLowerCase().split(' ')
                .filter(word => word.length > 4);
                
            // Check if any significant word from agent name appears in the input
            for (const word of nameWords) {
                if (normalizedName.includes(word)) {
                    console.log(`Found partial match for "${agent.name}" by word "${word}"`);
                    return agent;
                }
            }
        }
        
        // If we still haven't found a match, try key roles
        const roles = {
            "demand": "Demand Forecasting Specialist",
            "forecast": "Demand Forecasting Specialist",
            "availability": "Availability Analyst",
            "alternative": "Alternative Supplier Researcher",
            "researcher": "Alternative Supplier Researcher",
            "performance": "Supplier Performance Analyst",
            "communication": "Communication Specialist"
        };
        
        // Check for role keyword matches
        for (const [keyword, roleName] of Object.entries(roles)) {
            if (normalizedName.includes(keyword)) {
                const agent = agents.find(a => a.name === roleName);
                if (agent) {
                    console.log(`Found role keyword match for "${agent.name}" by keyword "${keyword}"`);
                    return agent;
                }
            }
        }
        
        console.log(`No match found for agent name: "${agentName}"`);
        return null;
    }
    
    // Function to update agent status and visual representation
    function updateAgentStatus(agentName, status) {
        const agent = agents.find(a => a.name === agentName);
        if (!agent) {
            console.log(`No agent found with name: ${agentName}`);
            return false;
        }

        // Normalize status to match our three states
        if (status === 'in progress') status = 'working';
        
        // Once completed, never revert back to another status
        if (agent.status === 'completed') {
            return false;
        }
        
        // Nothing changed
        if (agent.status === status) {
            return false;
        }
        
        console.log(`Updating agent ${agent.name} from ${agent.status} to ${status}`);
        
        // Update agent status
        agent.status = status;
        
        // Update visual representation immediately
        const agentElement = document.getElementById(agent.id);
        if (agentElement) {
            // Remove all status classes
            agentElement.classList.remove('agent-waiting', 'agent-working', 'agent-completed');
            
            // Add the appropriate class
            agentElement.classList.add(`agent-${status}`);
            
            // Update status text
            const statusElement = agentElement.querySelector('.agent-status');
            if (statusElement) {
                statusElement.className = `agent-status ${status}`;
                statusElement.textContent = capitalizeFirstLetter(status);
            }
            
            console.log(`Updated element for ${agent.name} to class agent-${status}`);
        }
        
        return true;
    }
    
    // Function to reset the workflow to initial state
    function resetWorkflow() {
        // Reset agent states
        agents.forEach(agent => {
            agent.status = 'waiting';
        });
        
        // Clear logs
        agentLogs.innerHTML = '';
        completeLogEntries.length = 0;
        summaryLogEntries.length = 0;
        
        // Reset the agent summary state tracker
        Object.keys(agentSummaryState).forEach(key => {
            agentSummaryState[key].working = false;
            agentSummaryState[key].completed = false;
        });
        
        // Reset the message tracker to prevent duplicate detection from previous runs
        Object.keys(agentMessageTracker).forEach(key => {
            agentMessageTracker[key] = new Set();
        });
        
        // Reset message counts
        Object.keys(agentMessageCounts).forEach(key => {
            agentMessageCounts[key] = 0;
        });
        
        // Reset shown descriptions 
        Object.keys(shownDescriptions).forEach(key => {
            shownDescriptions[key] = new Set();
        });
        
        // Re-render the workflow
        renderWorkflow();
        
        // Clear any existing interval
        if (statusPollingInterval) {
            clearInterval(statusPollingInterval);
            statusPollingInterval = null;
        }
    }
    
    // Function to render the workflow diagram
    function renderWorkflow() {
        console.log("Rendering workflow with agent statuses:", agents.map(a => `${a.name}: ${a.status}`).join(", "));
        
        // Get the agent container
        const agentContainer = workflowDiagram.querySelector('.agent-container');
        
        // Clear the container
        agentContainer.innerHTML = '';
        
        // Create connections first (so they appear behind agents)
        connections.forEach(connection => {
            createConnection(connection);
        });
        
        // Create agent elements
        agents.forEach(agent => {
            createAgentElement(agent);
        });
        
        // Force DOM update
        workflowDiagram.offsetHeight;
    }
    
    // Function to create an agent element in the diagram
    function createAgentElement(agent) {
        console.log(`Creating element for agent ${agent.name} with status ${agent.status}`);
        const agentElement = document.createElement('div');
        agentElement.className = `agent agent-${agent.status}`;
        agentElement.id = agent.id;
        agentElement.style.left = `${agent.position.x}px`;
        agentElement.style.top = `${agent.position.y}px`;
        
        // Get the appropriate icon for each agent type
        const iconType = getAgentIcon(agent.id);
        
        agentElement.innerHTML = `
            <div class="agent-icon">${iconType}</div>
            <div class="agent-name">${agent.name}</div>
            <div class="agent-role">${agent.role}</div>
            <div class="agent-status ${agent.status}">${capitalizeFirstLetter(agent.status)}</div>
        `;
        
        // Append to agent container instead of workflow diagram
        workflowDiagram.querySelector('.agent-container').appendChild(agentElement);
        console.log(`Agent element created with class agent-${agent.status}`);
    }
    
    // Function to get the appropriate icon for each agent type
    function getAgentIcon(agentId) {
        switch(agentId) {
            case 'demand-forecasting':
                return '📊'; // Chart/graph icon
            case 'availability-analyst':
                return '🔍'; // Magnifying glass for analysis
            case 'researcher':
                return '🌎'; // Globe for international research
            case 'performance-analyst':
                return '📈'; // Increasing chart for performance
            case 'communication':
                return '📨'; // Email/communication icon
            default:
                return '👤'; // Default person icon
        }
    }
    
    // Function to update agent icon based on status
    function updateAgentIcon(agentId, status) {
        console.log(`Updating icon for agent ${agentId} to status ${status}`);
        const agentElement = document.getElementById(agentId);
        if (agentElement) {
            // Remove all status classes
            agentElement.classList.remove('agent-waiting', 'agent-working', 'agent-completed');
            
            // Add the appropriate class
            agentElement.classList.add(`agent-${status}`);
            
            // Update status text too
            const statusElement = agentElement.querySelector('.agent-status');
            if (statusElement) {
                statusElement.className = `agent-status ${status}`;
                statusElement.textContent = capitalizeFirstLetter(status);
            }
            
            console.log(`Updated icon for agent ${agentId} with class agent-${status}`);
        } else {
            console.error(`Could not find element for agent ${agentId}`);
        }
    }
    
    // Function to create connections between agents
    function createConnection(connection) {
        const fromAgent = agents.find(a => a.id === connection.from);
        const toAgent = agents.find(a => a.id === connection.to);
        
        if (!fromAgent || !toAgent) return;
        
        // Get the agent container
        const agentContainer = workflowDiagram.querySelector('.agent-container');
        
        // Calculate connection points and dimensions
        const fromX = fromAgent.position.x + 200; // Right edge of from agent
        const fromY = fromAgent.position.y + 40; // Center of from agent
        const toX = toAgent.position.x; // Left edge of to agent
        const toY = toAgent.position.y + 40; // Center of to agent
        
        // Determine connection state based on agent statuses
        // Lines should be gray by default and turn green when the source agent is completed
        let isCompleted = false;
        let isErrorConnection = false; // New flag for error connection

        // Special debug for researcher to performance-analyst connection
        if (fromAgent.id === 'researcher' && toAgent.id === 'performance-analyst') {
            console.log('CREATING RESEARCHER TO PERFORMANCE CONNECTION');
            console.log(`Researcher position: x=${fromAgent.position.x}, y=${fromAgent.position.y}`);
            console.log(`Performance position: x=${toAgent.position.x}, y=${toAgent.position.y}`);
        }

        // Connection is completed if the source agent is completed
        // This is the key change - we only care about the FROM agent status now
        if (fromAgent.status === 'completed') {
            isCompleted = true;
        }

        // Special case for the connection between Availability Analyst and Supplier Performance Analyst
        if (fromAgent.id === 'availability-analyst' && toAgent.id === 'performance-analyst') {
            // Only mark as error connection if necessary (keeping this logic for now)
            if (isCompleted) {
                isErrorConnection = true;
            }
        }
        
        console.log(`Connection ${fromAgent.name} -> ${toAgent.name}: completed=${isCompleted}, error=${isErrorConnection}`);
        
        // Special case for the connection from researcher to performance-analyst
        if (fromAgent.id === 'researcher' && toAgent.id === 'performance-analyst') {
            // Fixed positions for connection lines
            const fromX = fromAgent.position.x + 200; // Right edge of researcher
            const fromY = fromAgent.position.y + 40; // Center of researcher
            const toX = toAgent.position.x; // Left edge of performance-analyst (changed from middle)
            const toY = toAgent.position.y + 40; // Center of performance-analyst
            
            // Create a new implementation with three segments
            
            // 1. Horizontal line going right from researcher (fixed length)
            const horizontalLine1 = document.createElement('div');
            horizontalLine1.className = `connection ${isCompleted ? 'completed' : ''} ${isErrorConnection ? 'error' : ''}`;
            horizontalLine1.style.left = `${fromX}px`;
            horizontalLine1.style.top = `${fromY - 2}px`;
            horizontalLine1.style.width = `60px`; // Fixed width of 60px
            horizontalLine1.style.height = '4px';
            
            // 2. Vertical line going down
            const verticalLine = document.createElement('div');
            verticalLine.className = `connection ${isCompleted ? 'completed' : ''} ${isErrorConnection ? 'error' : ''}`;
            verticalLine.style.left = `${fromX + 60 - 2}px`; // Position at the end of horizontalLine1
            verticalLine.style.top = `${fromY}px`;
            verticalLine.style.height = `${toY - fromY}px`;
            verticalLine.style.width = '4px';
            
            // 3. Horizontal line going left to performance-analyst
            const horizontalLine2 = document.createElement('div');
            horizontalLine2.className = `connection ${isCompleted ? 'completed' : ''} ${isErrorConnection ? 'error' : ''}`;
            horizontalLine2.style.left = `${toX}px`; // Left edge of performance-analyst
            horizontalLine2.style.top = `${toY - 2}px`;
            horizontalLine2.style.width = `${fromX + 60 - toX}px`; // Connect to vertical line
            horizontalLine2.style.height = '4px';
            
            agentContainer.appendChild(horizontalLine1);
            agentContainer.appendChild(verticalLine);
            agentContainer.appendChild(horizontalLine2);
            return;
        }
        
        // Determine if connection is horizontal or needs a bend
        if (Math.abs(fromY - toY) < 20) {
            // Horizontal connection
            const connectionElement = document.createElement('div');
            connectionElement.className = `connection ${isCompleted ? 'completed' : ''} ${isErrorConnection ? 'error' : ''}`;
            connectionElement.style.left = `${fromX}px`;
            connectionElement.style.top = `${fromY - 2}px`; // Center line (2px height)
            connectionElement.style.width = `${toX - fromX}px`;
            connectionElement.style.height = '4px';
            
            agentContainer.appendChild(connectionElement);
        } else {
            // Connection with a bend (Three segments)
            const midX = fromX + Math.floor((toX - fromX) / 2);
            
            const segment1 = document.createElement('div');
            segment1.className = `connection ${isCompleted ? 'completed' : ''} ${isErrorConnection ? 'error' : ''}`;
            segment1.style.left = `${fromX}px`;
            segment1.style.top = `${fromY - 2}px`;
            segment1.style.width = `${midX - fromX}px`;
            segment1.style.height = '4px';
            
            const segment2 = document.createElement('div');
            segment2.className = `connection ${isCompleted ? 'completed' : ''} ${isErrorConnection ? 'error' : ''}`;
            segment2.style.left = `${midX - 2}px`;
            segment2.style.top = fromY < toY ? `${fromY}px` : `${toY}px`;
            segment2.style.width = '4px';
            segment2.style.height = `${Math.abs(toY - fromY)}px`;
            
            const segment3 = document.createElement('div');
            segment3.className = `connection ${isCompleted ? 'completed' : ''} ${isErrorConnection ? 'error' : ''}`;
            segment3.style.left = `${midX}px`;
            segment3.style.top = `${toY - 2}px`;
            segment3.style.width = `${toX - midX}px`;
            segment3.style.height = '4px';
            
            agentContainer.appendChild(segment1);
            agentContainer.appendChild(segment2);
            agentContainer.appendChild(segment3);
        }
    }
    
    // Function to run the workflow simulation
    function runWorkflowSimulation() {
        let stepIndex = 0;
        
        function processNextStep() {
            if (stepIndex < workflowSteps.length) {
                const step = workflowSteps[stepIndex];
                
                // Update agent status
                const agent = agents.find(a => a.id === step.agent);
                if (agent) {
                    switch (step.action) {
                        case 'start':
                            agent.status = 'working';
                            break;
                        case 'working':
                            agent.status = 'working';
                            break;
                        case 'complete':
                            agent.status = 'completed';
                            break;
                    }
                }
                
                // Add log entry
                addLogEntry(step.agent, step.message);
                
                // Re-render workflow to reflect changes
                renderWorkflow();
                
                // Move to next step after delay
                stepIndex++;
                setTimeout(processNextStep, 2000); // 2 second delay between steps
            } else {
                // Workflow completed
                statusIndicator.className = 'status-indicator completed';
                statusIndicator.textContent = 'Status: Completed';
                
                // Re-enable the run button
                runDemoBtn.disabled = false;
            }
        }
        
        // Start processing steps
        processNextStep();
    }
    
    // Function to add a log entry
    function addLogEntry(agentId, message) {
        // Always log errors for debugging
        if (message.toLowerCase().includes('error')) {
            console.error("Log entry with error:", message);
        }
        
        // Create both complete and summary log entries without timestamp
        const completeLogEntry = createCompleteLogEntry(agentId, message);
        completeLogEntries.push(completeLogEntry);
        
        // Check if we need to create a summary entry for this message
        if (shouldCreateSummaryEntry(message)) {
            const summaryLogEntry = createSummaryLogEntry(agentId, message);
            summaryLogEntries.push(summaryLogEntry);
            
            // When in summary view, reorder the logs every time we add an entry
            if (summaryViewEnabled) {
                updateLogDisplay();
                return; // Skip the normal update if we're in summary view
            }
        }
        
        // If we're not in summary view or didn't create a summary entry, just append to the display
        if (!summaryViewEnabled) {
            agentLogs.appendChild(completeLogEntry);
            // Auto-scroll to bottom
            agentLogs.scrollTop = agentLogs.scrollHeight;
        }
    }
    
    // Function to create a complete log entry (original format)
    function createCompleteLogEntry(agentId, message) {
        // Create log entry element
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        // Check for CrewAI specific patterns
        const isCrewFormat = message.includes('🚀') || message.includes('📋') || 
                           message.includes('🤖') || message.includes('Agent:') ||
                           message.includes('Task:') || message.includes('Status:');
        
        // Try to extract agent and status info from CrewAI format shown in the image
        const crewTaskMatch = /Task:\s*([a-f0-9-]+)/i.exec(message);
        const assignedToMatch = /Assigned to:\s*([^\n]+)/i.exec(message);
        const statusCompletedMatch = /Status:\s*✓\s*Completed/i.exec(message);
        const statusExecutingMatch = /Status:\s*Executing Task/i.exec(message);
        const statusInProgressMatch = /Status:\s*In Progress/i.exec(message);
        const agentLineMatch = /Agent:\s*([^\n]+)/i.exec(message);
        const thinkingMatch = /Thinking\.\.\./i.exec(message);
        
        // Declare variables needed for other formats
        const crewAgentMatch = /🤖\s*Agent:\s*([^\n]+)/i.exec(message);
        const crewStatusMatch = /Status:\s*(Completed|In Progress|✅ Completed)/i.exec(message);
        const statusMatch = /Status:\s*(Completed|In Progress)/i.exec(message);
        const agentMatch = /Agent:\s*([^,\n]+)/i.exec(message);
        
        // Style based on content
        if (statusCompletedMatch || message.includes('✓ Completed')) {
            logEntry.classList.add('completed-status');
        } else if (statusExecutingMatch || statusInProgressMatch || 
                  message.includes('Executing Task') || message.includes('In Progress') || 
                  thinkingMatch) {
            logEntry.classList.add('working-status');
        } else if (isCrewFormat) {
            // Default CrewAI format styling
            if (message.includes('✅ Completed') || message.includes('Completed')) {
                logEntry.classList.add('completed-status');
            } else if (message.includes('In Progress') || message.includes('Thinking')) {
                logEntry.classList.add('working-status');
            }
        } else {
            // Regular styling
            if (statusMatch && statusMatch[1].trim().toLowerCase() === 'completed') {
                logEntry.classList.add('completed-status');
            } else if (statusMatch && statusMatch[1].trim().toLowerCase() === 'in progress') {
                logEntry.classList.add('working-status');
            } else if (thinkingMatch) {
                logEntry.classList.add('working-status');
            } else if (message.toLowerCase().includes('error')) {
                logEntry.classList.add('error-status');
            }
        }
        
        // Format the log message appropriately
        let displayMessage = message;
        let agentName = 'System';
        
        // Try to extract agent name based on the actual CrewAI format
        if (assignedToMatch) {
            agentName = assignedToMatch[1].trim();
        } else if (agentLineMatch) {
            agentName = agentLineMatch[1].trim();
        } else if (crewAgentMatch) {
            agentName = crewAgentMatch[1].trim();
        } else if (agentMatch) {
            agentName = agentMatch[1].trim();
        } else if (message.toLowerCase().includes('agent') && message.includes(':')) {
            const parts = message.split(':');
            if (parts.length >= 2 && parts[0].toLowerCase().includes('agent')) {
                agentName = parts[0].replace(/.*agent/i, 'Agent').trim();
            }
        }
        
        // For cleaner display, remove timestamps/logging prefixes
        if (displayMessage.includes('INFO:')) {
            displayMessage = displayMessage.split('INFO:')[1].trim();
        }
        
        // Create log message HTML - preserve indentation and structure
        const messageSpan = document.createElement('span');
        messageSpan.className = 'log-message';
        
        // Format CrewAI tree output to preserve structure
        if (isCrewFormat && (message.includes('Task:') || message.includes('Agent:'))) {
            // Clean up Unicode characters and brackets that make the output hard to read
            displayMessage = displayMessage.replace(/\[\d+m/g, '')  // Remove ANSI color codes
                                          .replace(/\u001b|\u003c|\u003e/g, '')  // Remove escape characters
                                          .replace(/\[\d+;\d+m/g, '')  // Remove more ANSI codes
                                          .replace(/□|■|▫|▪/g, '•')  // Standardize bullet points
                                          .replace(/\[\d+:\d+m/g, '')  // Remove timestamp format codes
                                          .trim();
            
            // Replace spaces with non-breaking spaces for indentation
            displayMessage = displayMessage.replace(/^(\s+)/gm, (match) => {
                return '&nbsp;'.repeat(match.length);
            });
            
            // Preserve line breaks
            displayMessage = displayMessage.replace(/\n/g, '<br>');
            
            // Highlight key elements
            displayMessage = displayMessage
                .replace(/(Task:.*?)(?=<br>|$)/g, '<span style="color:#3498db; font-weight:bold;">$1</span>')
                .replace(/(Assigned to:.*?)(?=<br>|$)/g, '<span style="color:#2ecc71; font-weight:bold;">$1</span>')
                .replace(/(Agent:.*?)(?=<br>|$)/g, '<span style="color:#2ecc71; font-weight:bold;">$1</span>')
                .replace(/(Status:.*?Completed.*?)(?=<br>|$)/g, '<span style="color:#2ecc71; font-weight:bold;">$1</span>')
                .replace(/(Status:.*?Executing.*?)(?=<br>|$)/g, '<span style="color:#f39c12; font-weight:bold;">$1</span>')
                .replace(/(Status:.*?In Progress.*?)(?=<br>|$)/g, '<span style="color:#f39c12; font-weight:bold;">$1</span>')
                .replace(/(Used .*?)(?=<br>|$)/g, '<span style="color:#95a5a6">$1</span>');
            
            messageSpan.innerHTML = displayMessage;
        } else {
            // Clean up regular messages too
            displayMessage = displayMessage.replace(/\[\d+m/g, '')  // Remove ANSI color codes
                                          .replace(/\u001b|\u003c|\u003e/g, '')  // Remove escape characters
                                          .replace(/\[\d+;\d+m/g, '')  // Remove more ANSI codes
                                          .replace(/□|■|▫|▪/g, '•')  // Standardize bullet points
                                          .trim();
                                          
            messageSpan.textContent = displayMessage;
        }
        
        // Add emoji-log attribute if it's a CrewAI log
        if (isCrewFormat) {
            messageSpan.setAttribute('emoji-log', 'true');
        }
        
        const agentSpan = document.createElement('span');
        agentSpan.className = 'log-agent';
        agentSpan.textContent = `${agentName}:`;
        
        // Assemble log entry without timestamp
        logEntry.appendChild(agentSpan);
        logEntry.appendChild(messageSpan);
        
        return logEntry;
    }
    
    // Function to create a summary log entry
    function createSummaryLogEntry(agentId, message) {
        // Create summary log entry element
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry summary';
        
        // Extract agent name
        let agentName = 'System';
        const agentMatch = /Agent:\s*([^,\n]+)/i.exec(message);
        const assignedToMatch = /Assigned to:\s*([^\n]+)/i.exec(message);
        
        if (assignedToMatch) {
            agentName = assignedToMatch[1].trim();
        } else if (agentMatch) {
            agentName = agentMatch[1].trim();
        }
        
        // Determine if this is a completion message
        const isCompleted = message.includes('✓ Completed') || 
                            message.includes('✅ Completed') || 
                            message.includes('Status: Completed') ||
                            message.includes('Task completed');
        
        // Determine the agent type for more accurate task description
        let agentType = '';
        if (agentName.includes('Demand Forecasting') || agentName === 'Demand Forecasting Specialist' || 
            agentName === 'Forecasting' || agentName === 'Demand Specialist') {
            agentType = 'Forecasting';
        } else if (agentName.includes('Availability Analyst') || agentName === 'Availability Analyst' || 
                   agentName === 'Availability') {
            agentType = 'Availability';
        } else if (agentName.includes('Alternative Supplier') || agentName === 'Alternative Supplier Researcher' || 
                   agentName === 'Alt. Supplier' || agentName === 'Supplier Researcher') {
            agentType = 'Alt. Supplier';
        } else if (agentName.includes('Performance Analyst') || agentName.includes('Supplier Performance') || 
                   agentName === 'Performance' || agentName === 'Supplier Performance Analyst') {
            agentType = 'Performance';
        } else if (agentName.includes('Communication Specialist') || agentName === 'Communication' || 
                   agentName === 'Communication Specialist') {
            agentType = 'Communication';
        }
        
        // Try to extract specific details from the message content
        const specificDetails = extractSpecificDetailsFromMessage(message);
        
        // Extract actual meaningful task descriptions based on agent type
        let taskDescription = '';
        
        // First check if we have specific extracted details to use
        if (specificDetails) {
            taskDescription = specificDetails;
        }
        // Check if we're at the point where we should use a predefined task to ensure variety
        // We want to ensure each agent has a good mix of log entries
        else if (agentType && predefinedTasks[agentType] && 
                 agentMessageCounts[agentType] < predefinedTasks[agentType].length) {
            
            // Use one of our predefined tasks that hasn't been used yet
            for (const task of predefinedTasks[agentType]) {
                if (!shownDescriptions[agentType].has(task)) {
                    taskDescription = task;
                    break;
                }
            }
        }
        // Fall back to message-based detection if we still don't have a task description
        else if (!taskDescription) {
            // Look for specific task details in the message that are appropriate for this agent
            if (agentType === 'Forecasting') {
                if (message.includes('Analyze the demand patterns')) {
                    taskDescription = 'Analyzing demand patterns for valve';
                } else if (message.includes('VQC4101-51 SMC 5/2') || message.includes('SMC valve')) {
                    taskDescription = 'Analyzing SMC valve demand data';
                } else if (message.includes('historical demand data')) {
                    taskDescription = 'Reviewing historical demand data';
                } else if (message.includes('seasonal patterns')) {
                    taskDescription = 'Identifying seasonal demand patterns';
                } else if (message.includes('forecast model')) {
                    taskDescription = 'Building forecasting model';
                } else if (message.includes('predict future demand')) {
                    taskDescription = 'Predicting future demand requirements';
                } else if (message.toLowerCase().includes('reorder point')) {
                    taskDescription = 'Calculating optimal reorder points';
                } else if (isCompleted) {
                    taskDescription = 'Demand forecasting completed';
                } else if (!taskDescription) {
                    taskDescription = 'Analyzing demand data';
                }
            } else if (agentType === 'Availability') {
                if (message.toLowerCase().includes('inventory level')) {
                    taskDescription = 'Checking inventory levels';
                } else if (message.toLowerCase().includes('lead time')) {
                    taskDescription = 'Evaluating supplier lead times';
                } else if (message.toLowerCase().includes('capacity')) {
                    taskDescription = 'Assessing supplier production capacity';
                } else if (message.toLowerCase().includes('stock levels')) {
                    taskDescription = 'Analyzing current stock levels';
                } else if (message.toLowerCase().includes('supply chain disruption')) {
                    taskDescription = 'Identifying supply chain disruptions';
                } else if (isCompleted) {
                    taskDescription = 'Supplier availability confirmed';
                } else if (message.toLowerCase().includes('availability')) {
                    // Keep this as lowest priority check since it's generic
                    taskDescription = 'Checking supplier availability';
                } else if (!taskDescription) {
                    taskDescription = 'Assessing supplier readiness';
                }
            } else if (agentType === 'Alt. Supplier') {
                if (message.toLowerCase().includes('supplier database')) {
                    taskDescription = 'Searching supplier database';
                } else if (message.toLowerCase().includes('compatible part')) {
                    taskDescription = 'Identifying compatible parts';
                } else if (message.toLowerCase().includes('market research')) {
                    taskDescription = 'Conducting market research for suppliers';
                } else if (message.toLowerCase().includes('qualification')) {
                    taskDescription = 'Evaluating supplier qualifications';
                } else if (message.toLowerCase().includes('geographical')) {
                    taskDescription = 'Analyzing geographical supplier distribution';
                } else if (isCompleted) {
                    taskDescription = 'Alternative suppliers identified';
                } else if (message.toLowerCase().includes('alternative supplier')) {
                    // Keep this as lowest priority check
                    taskDescription = 'Researching alternative suppliers';
                } else if (!taskDescription) {
                    taskDescription = 'Exploring supply chain options';
                }
            } else if (agentType === 'Performance') {
                if (message.toLowerCase().includes('ranking')) {
                    taskDescription = 'Ranking suppliers by performance';
                } else if (message.toLowerCase().includes('quality score')) {
                    taskDescription = 'Calculating supplier quality scores';
                } else if (message.toLowerCase().includes('delivery reliability')) {
                    taskDescription = 'Analyzing delivery reliability';
                } else if (message.toLowerCase().includes('price comparison')) {
                    taskDescription = 'Comparing supplier pricing structures';
                } else if (message.toLowerCase().includes('risk assessment')) {
                    taskDescription = 'Conducting supplier risk assessment';
                } else if (isCompleted) {
                    taskDescription = 'Supplier performance evaluated';
                } else if (message.toLowerCase().includes('performance metrics') || message.toLowerCase().includes('metrics')) {
                    taskDescription = 'Evaluating supplier metrics';
                } else if (!taskDescription) {
                    taskDescription = 'Analyzing supplier performance';
                }
            } else if (agentType === 'Communication') {
                if (message.toLowerCase().includes('send_email')) {
                    taskDescription = 'Email sent with recommendations';
                } else if (message.toLowerCase().includes('drafting email')) {
                    taskDescription = 'Drafting email with findings';
                } else if (message.toLowerCase().includes('summarizing')) {
                    taskDescription = 'Summarizing analysis results';
                } else if (message.toLowerCase().includes('recommendation')) {
                    taskDescription = 'Formulating procurement recommendations';
                } else if (message.toLowerCase().includes('action plan')) {
                    taskDescription = 'Developing action plan for procurement';
                } else if (isCompleted) {
                    taskDescription = 'Recommendations communicated';
                } else if (message.toLowerCase().includes('communicate') || message.toLowerCase().includes('email')) {
                    taskDescription = 'Preparing email recommendations';
                } else if (!taskDescription) {
                    taskDescription = 'Preparing communication';
                }
            } else {
                // Generic fallback
                if (isCompleted) {
                    taskDescription = 'Task completed';
                } else if (!taskDescription) {
                    taskDescription = 'Working on assigned task';
                }
            }
        }
        
        // Check if we've already shown this description for this agent and get a variant if needed
        if (shownDescriptions[agentType] && shownDescriptions[agentType].has(taskDescription)) {
            // Try to find a variant
            taskDescription = getVariantDescription(taskDescription, agentType);
        }
        
        // If after trying variants we still have a duplicate, we need to make it unique
        if (shownDescriptions[agentType] && shownDescriptions[agentType].has(taskDescription)) {
            // Add a number to make it unique, but try not to show this
            let counter = 1;
            let baseDescription = taskDescription;
            while (shownDescriptions[agentType].has(taskDescription) && counter < 10) {
                taskDescription = `${baseDescription} (${counter})`;
                counter++;
            }
        }
        
        // Add this description to the shown set to avoid duplicates
        if (!shownDescriptions[agentType]) {
            shownDescriptions[agentType] = new Set();
        }
        shownDescriptions[agentType].add(taskDescription);
        
        const agentSpan = document.createElement('span');
        agentSpan.className = 'log-agent';
        
        // Shorten agent names for cleaner display
        let displayName = agentName;
        if (displayName.includes('Specialist')) {
            displayName = displayName.replace(' Specialist', '');
        }
        if (displayName.includes('Analyst')) {
            displayName = displayName.replace(' Analyst', '');
        }
        if (displayName.includes('Researcher')) {
            displayName = displayName.replace(' Researcher', '');
        }
        
        // Further shorten common prefixes
        if (agentType === 'Forecasting') {
            displayName = 'Forecasting';
        } else if (agentType === 'Alt. Supplier') {
            displayName = 'Alt. Supplier';
        } else if (agentType === 'Performance') {
            displayName = 'Performance';
        } else if (agentType === 'Availability') {
            displayName = 'Availability';
        } else if (agentType === 'Communication') {
            displayName = 'Communication';
        }
        
        // Set the agent type as a data attribute for styling
        logEntry.setAttribute('data-agent-type', agentType);
        
        agentSpan.textContent = displayName;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'log-message';
        messageSpan.textContent = taskDescription;
        
        // Assemble log entry
        logEntry.appendChild(agentSpan);
        logEntry.appendChild(messageSpan);
        
        return logEntry;
    }
    
    // Function to get a variant of a description to avoid duplicates
    function getVariantDescription(description, agentType) {
        // Map of common descriptions to their variants
        const variantMap = {
            'Checking supplier availability': [
                'Verifying supplier capacity', 
                'Confirming parts availability',
                'Checking order fulfillment capability',
                'Validating supply chain readiness',
                'Assessing supplier responsiveness'
            ],
            'Researching alternative suppliers': [
                'Identifying backup suppliers',
                'Exploring supply chain alternatives',
                'Searching for backup vendors',
                'Finding replacement suppliers',
                'Sourcing alternative vendors'
            ],
            'Analyzing demand data': [
                'Examining usage patterns',
                'Reviewing consumption history',
                'Studying demand fluctuations',
                'Evaluating usage trends',
                'Processing consumption data'
            ],
            'Analyzing supplier performance': [
                'Evaluating vendor reliability',
                'Assessing supplier track record',
                'Reviewing supplier history',
                'Comparing supplier capabilities',
                'Measuring vendor effectiveness'
            ],
            'Preparing communication': [
                'Drafting procurement message',
                'Creating supply chain update',
                'Composing findings report',
                'Preparing recommendations memo',
                'Formulating action items'
            ]
        };
        
        // Check if we have variants for this description
        if (variantMap[description] && variantMap[description].length > 0) {
            // Try each variant until we find one that hasn't been used
            for (const variant of variantMap[description]) {
                if (!shownDescriptions[agentType].has(variant)) {
                    return variant;
                }
            }
        }
        
        // If no unused variants found, return original (caller will handle making it unique)
        return description;
    }
    
    // Function to extract specific details from message content
    function extractSpecificDetailsFromMessage(message) {
        // Try to extract specific actionable details from the message
        
        // Look for specific numbers or findings
        const findingsPatterns = [
            // SMC part mention with context
            { regex: /([A-Z0-9]+-\d+ SMC [^\s,\.]+)[\s\S]{1,30}(demand|forecast|inventory)/i, format: "Analyzing $1 $2" },
            
            // Clear recommendations
            { regex: /recommend\s+([^\.]{10,60}\.)/, format: "$1" },
            
            // Specific findings about inventory
            { regex: /found\s+([^\.]{10,60}inventory[^\.]{5,60}\.)/, format: "$1" },
            { regex: /current inventory.{1,30}(\d+)\s+units/, format: "Current inventory: $1 units" },
            
            // Lead times
            { regex: /lead time.{1,20}(\d+\-\d+|\d+).{1,10}(days|weeks)/, format: "Lead time: $1 $2" },
            
            // Availability mentions
            { regex: /SMC.{1,30}(unavailable|limited availability)/, format: "SMC reports $1" },
            { regex: /supplier.{1,30}(can deliver|cannot deliver)/, format: "Supplier $1" },
            
            // Specific alternative suppliers
            { regex: /identified\s+(\d+)\s+alternative suppliers/, format: "Found $1 alternative suppliers" },
            { regex: /alternative suppliers?.{1,50}([A-Z][a-zA-Z]+\s+and\s+[A-Z][a-zA-Z]+)/, format: "Alternatives: $1" },
            
            // Performance metrics
            { regex: /supplier.{1,20}ranked.{1,20}(first|second|third|highest|lowest)/, format: "Supplier ranked $1" },
            { regex: /([A-Z][a-zA-Z]+).{1,20}score.{1,10}(\d+)%/, format: "$1 score: $2%" },
            
            // Email sending
            { regex: /email\s+sent\s+to\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/, format: "Email sent to $1" }
        ];
        
        // Try each pattern to see if we can extract something meaningful
        for (const pattern of findingsPatterns) {
            const match = pattern.regex.exec(message);
            if (match) {
                let result = pattern.format;
                // Replace each capture group
                for (let i = 1; i < match.length; i++) {
                    result = result.replace(`$${i}`, match[i]);
                }
                return result;
            }
        }
        
        // Look for "I analyzed/found/identified" patterns that indicate results
        const resultPatterns = [
            { regex: /I\s+(analyzed|found|identified|recommend|discovered)\s+([^\.]{10,60})/, format: "$1 $2" }
        ];
        
        for (const pattern of resultPatterns) {
            const match = pattern.regex.exec(message);
            if (match) {
                let verb = match[1].charAt(0).toUpperCase() + match[1].slice(1);
                return `${verb} ${match[2]}`;
            }
        }
        
        // If we couldn't extract anything specific, return null
        return null;
    }
    
    // Function to determine if we should create a summary entry for this message
    function shouldCreateSummaryEntry(message) {
        // Skip messages that are just generic or don't contain useful information
        if (message.length < 10 || 
            message.includes('Starting analysis') ||
            message.includes('System starting') ||
            message.includes('Initializing') ||
            message.includes('Analysis started') ||
            message.includes('Reading terminal output') ||
            message.includes('crew_execution_started')) {
            return false;
        }
            
        // First, identify which agent this message is about
        let agentName = '';
        const agentMatch = /Agent:\s*([^,\n]+)/i.exec(message);
        const assignedToMatch = /Assigned to:\s*([^\n]+)/i.exec(message);
        
        if (assignedToMatch) {
            agentName = assignedToMatch[1].trim();
        } else if (agentMatch) {
            agentName = agentMatch[1].trim();
        }
        
        // Skip system messages without clear agent attribution
        if (!agentName || agentName === 'System') {
            return false;
        }
        
        // Determine the simplified agent key for state tracking
        let agentKey = '';
        let isProperMatch = false;
        
        // Use more precise matching to avoid incorrect agent attribution
        if (agentName.includes('Demand Forecasting') || agentName === 'Demand Forecasting Specialist' || 
            agentName === 'Forecasting' || agentName === 'Demand Specialist') {
            agentKey = 'Forecasting';
            isProperMatch = true;
        } else if (agentName.includes('Availability Analyst') || agentName === 'Availability Analyst' || 
                  agentName === 'Availability') {
            agentKey = 'Availability';
            isProperMatch = true;
        } else if (agentName.includes('Alternative Supplier') || agentName === 'Alternative Supplier Researcher' || 
                  agentName === 'Alt. Supplier' || agentName === 'Supplier Researcher') {
            agentKey = 'Alt. Supplier';
            isProperMatch = true;
        } else if (agentName.includes('Performance Analyst') || agentName.includes('Supplier Performance') || 
                  agentName === 'Performance' || agentName === 'Supplier Performance Analyst') {
            agentKey = 'Performance';
            isProperMatch = true;
        } else if (agentName.includes('Communication Specialist') || agentName === 'Communication' || 
                  agentName === 'Communication Specialist') {
            agentKey = 'Communication';
            isProperMatch = true;
        }
        
        // If we couldn't clearly match to a known agent, skip this message
        if (!isProperMatch) {
            console.log(`Skipping message with unclear agent attribution: ${agentName}`);
            return false;
        }
        
        // Add log entries more aggressively in the early stages to ensure each agent gets enough entries
        if (agentMessageCounts[agentKey] < Math.ceil(MAX_MESSAGES_PER_AGENT * 0.8)) {
            // Only check for duplicates, but be more permissive
            // Generate a simple task identifier
            const simpleId = message.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            
            // Avoid exact duplicates
            if (agentMessageTracker[agentKey].has(simpleId)) {
                return false;
            }
            
            // Add to tracker and increment count
            agentMessageTracker[agentKey].add(simpleId);
            agentMessageCounts[agentKey]++;
            return true;
        }
        
        // Check for responses or outputs in the message (likely more meaningful)
        // Look for patterns that indicate actual output rather than just status updates
        const hasResponse = 
            message.includes('Response:') ||
            message.includes('Output:') ||
            message.includes('Result:') ||
            message.includes('Analysis:') ||
            message.includes('Found:') ||
            (message.includes('I ') && (message.includes('analyzed') || message.includes('found') || 
                                      message.includes('identified') || message.includes('recommend')));
        
        // Generate a task type identifier for deduplication and content extraction
        let taskType = '';
        let taskContent = '';
        
        // Try to extract content from responses if available
        if (hasResponse) {
            // Look for the response section and extract a snippet
            const responseMatch = /Response:\s*([^\n]{5,100})/i.exec(message);
            const outputMatch = /Output:\s*([^\n]{5,100})/i.exec(message);
            const resultMatch = /Result:\s*([^\n]{5,100})/i.exec(message);
            const analysisMatch = /Analysis:\s*([^\n]{5,100})/i.exec(message);
            const foundMatch = /Found:\s*([^\n]{5,100})/i.exec(message);
            const iFoundMatch = /I found\s*([^\n.]{5,100})/i.exec(message);
            const iIdentifiedMatch = /I identified\s*([^\n.]{5,100})/i.exec(message);
            const iAnalyzedMatch = /I analyzed\s*([^\n.]{5,100})/i.exec(message);
            const iRecommendMatch = /I recommend\s*([^\n.]{5,100})/i.exec(message);
            
            if (responseMatch) {
                taskContent = responseMatch[1].trim();
                taskType = 'response_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            } else if (outputMatch) {
                taskContent = outputMatch[1].trim();
                taskType = 'output_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            } else if (resultMatch) {
                taskContent = resultMatch[1].trim();
                taskType = 'result_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            } else if (analysisMatch) {
                taskContent = analysisMatch[1].trim();
                taskType = 'analysis_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            } else if (foundMatch) {
                taskContent = foundMatch[1].trim();
                taskType = 'found_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            } else if (iFoundMatch) {
                taskContent = iFoundMatch[1].trim();
                taskType = 'found_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            } else if (iIdentifiedMatch) {
                taskContent = iIdentifiedMatch[1].trim();
                taskType = 'identified_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            } else if (iAnalyzedMatch) {
                taskContent = iAnalyzedMatch[1].trim();
                taskType = 'analyzed_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            } else if (iRecommendMatch) {
                taskContent = iRecommendMatch[1].trim();
                taskType = 'recommend_' + taskContent.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            }
            
            // If we found content from a response, prefer to use this over standard task types
            if (taskContent.length > 0) {
                console.log(`Extracted response content for ${agentKey}: ${taskContent}`);
                // Continue with normal processing, but with the extracted content
            }
        }
        
        // If we didn't extract content from a response, use standard task type matching
        if (taskContent.length === 0) {
            // Ensure task types are correctly matched to their appropriate agents
            if (message.includes('VQC4101-51 SMC 5/2') || message.includes('SMC valve') || message.includes('demand patterns')) {
                // Only Forecasting agent should show these tasks
                if (agentKey !== 'Forecasting') {
                    console.log(`Skipping mismatched task type (valve analysis) for agent ${agentKey}`);
                    return false;
                }
                taskType = 'smc_valve_analysis';
            } else if (message.includes('historical demand data')) {
                // Only Forecasting agent should show these tasks
                if (agentKey !== 'Forecasting') {
                    console.log(`Skipping mismatched task type (demand data) for agent ${agentKey}`);
                    return false;
                }
                taskType = 'demand_data_review';
            } else if (message.toLowerCase().includes('inventory level')) {
                // Only Forecasting or Availability agents should show these tasks
                if (agentKey !== 'Forecasting' && agentKey !== 'Availability') {
                    console.log(`Skipping mismatched task type (inventory) for agent ${agentKey}`);
                    return false;
                }
                taskType = 'inventory_check';
            } else if (message.toLowerCase().includes('alternative supplier')) {
                // Only Alt. Supplier agent should show these tasks
                if (agentKey !== 'Alt. Supplier') {
                    console.log(`Skipping mismatched task type (alternative suppliers) for agent ${agentKey}`);
                    return false;
                }
                taskType = 'supplier_research';
            } else if (message.toLowerCase().includes('performance metrics') || message.toLowerCase().includes('supplier metrics')) {
                // Only Performance agent should show these tasks
                if (agentKey !== 'Performance') {
                    console.log(`Skipping mismatched task type (performance) for agent ${agentKey}`);
                    return false;
                }
                taskType = 'performance_evaluation';
            } else if (message.toLowerCase().includes('email') || message.toLowerCase().includes('communicate')) {
                // Only Communication agent should show these tasks
                if (agentKey !== 'Communication') {
                    console.log(`Skipping mismatched task type (communication) for agent ${agentKey}`);
                    return false;
                }
                taskType = 'communication';
            } else {
                // Default task types based on message patterns
                if (message.includes('✓ Completed') || message.includes('✅ Completed') || message.includes('Status: Completed')) {
                    taskType = 'completion';
                } else if (message.includes('Task:') || message.includes('Status: In Progress')) {
                    taskType = 'working';
                } else {
                    // Last resort, generate a task type from the message (first few words)
                    // Find the first sentence or substantial chunk of text
                    const firstSentenceMatch = /[^.!?]{10,100}[.!?]/i.exec(message);
                    if (firstSentenceMatch) {
                        taskType = 'general_' + firstSentenceMatch[0].substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    } else {
                        taskType = 'general_' + message.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    }
                }
            }
        }
        
        // Track if we've already shown this task type for this agent
        if (!agentMessageTracker[agentKey]) {
            agentMessageTracker[agentKey] = new Set();
        }
        
        // Check for completion messages - always show these regardless of count
        const isCompletionMessage = 
            message.includes('✓ Completed') || 
            message.includes('✅ Completed') || 
            message.includes('Status: Completed') ||
            (message.includes('Task completed') && message.includes(agentName));
            
        // Check for special cases where we want to show regardless of count
        const isSpecialCase = 
            (message.toLowerCase().includes('email sent successfully') && agentKey === 'Communication') || 
            (message.toLowerCase().includes('alternative suppliers identified') && agentKey === 'Alt. Supplier') || 
            (message.toLowerCase().includes('critical inventory') && (agentKey === 'Forecasting' || agentKey === 'Availability')) ||
            (message.toLowerCase().includes('ranked supplier') && agentKey === 'Performance') ||
            hasResponse; // Messages with actual agent responses are considered special
        
        // Always show completion messages, but only once
        if (isCompletionMessage) {
            if (!agentSummaryState[agentKey].completed) {
                agentSummaryState[agentKey].completed = true;
                agentMessageCounts[agentKey]++;
                return true;
            }
            return false;
        }
        
        // Always show special cases
        if (isSpecialCase) {
            // Even for special cases, avoid exact duplicates
            if (agentMessageTracker[agentKey].has(taskType)) {
                return false;
            }
            agentMessageTracker[agentKey].add(taskType);
            agentMessageCounts[agentKey]++;
            return true;
        }
        
        // For working status, show only once
        if (taskType === 'working' && !agentSummaryState[agentKey].working) {
            agentSummaryState[agentKey].working = true;
            agentMessageCounts[agentKey]++;
            return true;
        }
        
        // If this is a duplicate task type, skip it
        if (agentMessageTracker[agentKey].has(taskType)) {
            console.log(`Skipping duplicate message for ${agentKey}: ${taskType}`);
            return false;
        }
        
        // If we've reached the maximum number of messages for this agent, skip it
        if (agentMessageCounts[agentKey] >= MAX_MESSAGES_PER_AGENT) {
            console.log(`Skipping message for ${agentKey}: maximum count reached (${agentMessageCounts[agentKey]}/${MAX_MESSAGES_PER_AGENT})`);
            return false;
        }
        
        // If we get here, this is a new task type and we haven't reached the maximum
        agentMessageTracker[agentKey].add(taskType);
        agentMessageCounts[agentKey]++;
        return true;
    }
    
    // Function to update the log display based on current view mode
    function updateLogDisplay() {
        // Clear the current logs display
        agentLogs.innerHTML = '';
        
        // Display either the complete logs or the summary logs
        const logsToDisplay = summaryViewEnabled ? summaryLogEntries : completeLogEntries;
        
        if (summaryViewEnabled) {
            // In summary view, we sort logs according to the workflow sequence
            
            // Step 1: Group logs by agent type
            const logsByAgentType = {};
            workflowSequence.forEach(agentType => {
                logsByAgentType[agentType] = [];
            });
            
            // Step 2: Put each log entry in its agent group
            summaryLogEntries.forEach(logEntry => {
                const agentType = logEntry.getAttribute('data-agent-type');
                if (agentType && logsByAgentType[agentType]) {
                    logsByAgentType[agentType].push(logEntry);
                } else {
                    // Any logs without a proper agent type go at the end
                    if (!logsByAgentType['Other']) {
                        logsByAgentType['Other'] = [];
                    }
                    logsByAgentType['Other'].push(logEntry);
                }
            });
            
            // Step 3: Define hardcoded sequences for each agent type
            const logSequences = {
                'Forecasting': [
                    'Analyzing historical demand data',
                    'Identifying seasonal patterns',
                    'Building forecasting model',
                    'Calculating optimal reorder points',
                    'Forecasting future demand requirements',
                    'Determining safety stock levels',
                    'Demand forecasting completed'
                ],
                'Availability': [
                    'Checking current inventory levels',
                    'Evaluating supplier lead times',
                    'Assessing production capacity',
                    'Analyzing supply chain risks',
                    'Verifying part availability',
                    'Reviewing stock allocation',
                    'Supplier availability confirmed'
                ],
                'Alt. Supplier': [
                    'Searching for alternative suppliers',
                    'Evaluating supplier qualifications',
                    'Comparing geographical locations',
                    'Analyzing pricing structures',
                    'Assessing quality standards',
                    'Reviewing supplier capabilities',
                    'Alternative suppliers identified'
                ],
                'Performance': [
                    'Ranking suppliers by performance',
                    'Evaluating delivery reliability',
                    'Analyzing quality metrics',
                    'Comparing cost efficiency',
                    'Assessing risk profiles',
                    'Creating performance scorecards',
                    'Supplier performance evaluated'
                ],
                'Communication': [
                    'Drafting procurement recommendations',
                    'Summarizing findings for stakeholders',
                    'Preparing supplier action plans',
                    'Creating executive summary',
                    'Drafting supplier communications',
                    'Finalizing procurement strategy',
                    'Recommendations communicated'
                ]
            };
            
            // Step 4: Display log entries based on actual agent activity
            workflowSequence.forEach(agentType => {
                const agentTypeEntries = logsByAgentType[agentType] || [];
                const sequenceForType = logSequences[agentType] || [];
                
                // Only proceed if we have both a sequence and at least one actual log from this agent
                if (sequenceForType.length > 0 && agentTypeEntries.length > 0) {
                    // Determine how many sequence entries to show based on agent activity
                    const agent = agents.find(a => {
                        if (agentType === 'Forecasting') return a.id === 'demand-forecasting';
                        if (agentType === 'Availability') return a.id === 'availability-analyst';
                        if (agentType === 'Alt. Supplier') return a.id === 'researcher';
                        if (agentType === 'Performance') return a.id === 'performance-analyst';
                        if (agentType === 'Communication') return a.id === 'communication';
                        return false;
                    });
                    
                    // If agent has started, show first entry. If completed, show all entries.
                    // Otherwise, don't show any for this agent yet.
                    let entriesToShow = 0;
                    if (agent) {
                        if (agent.status === 'completed') {
                            entriesToShow = sequenceForType.length; // Show all entries
                        } else if (agent.status === 'working') {
                            // Show a number of entries proportional to how many actual logs we have, 
                            // but max out at sequence length - 1 (save completed status for when complete)
                            entriesToShow = Math.min(
                                Math.max(1, Math.floor(agentTypeEntries.length * (sequenceForType.length - 1) / 5)),
                                sequenceForType.length - 1
                            );
                        }
                    }
                    
                    // Create and display the appropriate number of sequence entries
                    for (let i = 0; i < entriesToShow; i++) {
                        const sequenceText = sequenceForType[i];
                        
                        // Create a new log entry with the hardcoded text
                        const logEntry = document.createElement('div');
                        logEntry.className = 'log-entry summary';
                        logEntry.setAttribute('data-agent-type', agentType);
                        
                        const agentSpan = document.createElement('span');
                        agentSpan.className = 'log-agent';
                        
                        // Use shortened display names
                        agentSpan.textContent = agentType;
                        
                        const messageSpan = document.createElement('span');
                        messageSpan.className = 'log-message';
                        messageSpan.textContent = sequenceText;
                        
                        // Assemble the log entry
                        logEntry.appendChild(agentSpan);
                        logEntry.appendChild(messageSpan);
                        
                        // Add to the display
                        agentLogs.appendChild(logEntry);
                    }
                } else if (agentTypeEntries.length > 0) {
                    // If we have agent entries but no predefined sequence, show the actual entries
                    agentTypeEntries.forEach(logEntry => {
                        agentLogs.appendChild(logEntry);
                    });
                }
            });
        } else {
            // For complete logs, maintain chronological order (as they were added)
            logsToDisplay.forEach(logEntry => {
                agentLogs.appendChild(logEntry);
            });
        }
        
        // Auto-scroll to bottom
        agentLogs.scrollTop = agentLogs.scrollHeight;
    }
    
    // Utility function to capitalize first letter
    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    
    // Function to add predefined logs if we don't have enough natural ones
    function addPredefinedLogs() {
        // Check if we need to add predefined logs for any agent type
        for (const agentType of Object.keys(agentMessageCounts)) {
            // If we don't have enough logs for this agent type, add some predefined ones
            if (agentMessageCounts[agentType] < 5) {
                const neededLogs = 5 - agentMessageCounts[agentType];
                console.log(`Adding ${neededLogs} predefined logs for ${agentType}`);
                
                // Get available predefined tasks that haven't been used yet
                const availableTasks = predefinedTasks[agentType].filter(
                    task => !shownDescriptions[agentType].has(task)
                );
                
                // Add up to neededLogs tasks
                for (let i = 0; i < Math.min(neededLogs, availableTasks.length); i++) {
                    // Create a dummy log entry
                    const dummyLog = `Agent: ${agentType} Specialist, Task: Working on ${availableTasks[i]}`;
                    addLogEntry('system', dummyLog);
                    console.log(`Added predefined log for ${agentType}: ${availableTasks[i]}`);
                }
            }
        }
    }
}); 