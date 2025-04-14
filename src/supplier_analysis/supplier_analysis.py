from crewai import Agent, Task, Crew
from crewai.tools import BaseTool
from duckduckgo_search import DDGS
import os
import logging
import tomli
import pandas as pd
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import re
import sys
import io

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_api_key():
    try:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        config_path = os.path.join(project_root, "pyproject.toml")
        
        with open(config_path, "rb") as f:
            config = tomli.load(f)
            # TOML verwendet eine verschachtelte Struktur
            if "tool" in config and "crewai" in config["tool"] and "llm" in config["tool"]["crewai"]:
                return config["tool"]["crewai"]["llm"]["api_key"]
    except Exception as e:
        logger.error(f"Error loading API key from config: {str(e)}")
        return None

class SupplierSearchTool(BaseTool):
    name: str = "search_suppliers"
    description: str = "Search for alternative suppliers on the internet. Input should be a search query describing the type of supplier you're looking for."

    def _run(self, query: str) -> str:
        try:
            with DDGS() as ddgs:
                results = []
                for r in ddgs.text(query, max_results=5):
                    if isinstance(r, dict):
                        title = r.get('title', '')
                        href = r.get('href', '')
                        body = r.get('body', '')
                        if title and href and body:
                            results.append(f"Company: {title}\nWebsite: {href}\nDescription: {body}\n")
                
                # If price information is needed, perform a more specific search
                if "price" in query.lower() or "cost" in query.lower() or "pricing" in query.lower():
                    price_results = []
                    # Search specifically for pricing information
                    price_query = query + " price cost buy purchase"
                    for r in ddgs.text(price_query, max_results=3):
                        if isinstance(r, dict):
                            title = r.get('title', '')
                            href = r.get('href', '')
                            body = r.get('body', '')
                            price_info = "Price information not explicitly found in search results."
                            
                            # Try to extract price information from the body
                            price_patterns = [
                                r'\$\s*(\d+(?:\.\d{1,2})?)', 
                                r'(\d+(?:\.\d{1,2})?)\s*USD',
                                r'price[:\s]+\$?\s*(\d+(?:\.\d{1,2})?)',
                                r'cost[:\s]+\$?\s*(\d+(?:\.\d{1,2})?)'
                            ]
                            
                            for pattern in price_patterns:
                                matches = re.findall(pattern, body, re.IGNORECASE)
                                if matches:
                                    price_info = f"Possible price found: ${matches[0]}"
                                    break
                            
                            price_results.append(f"Company: {title}\nWebsite: {href}\nPrice Info: {price_info}\nDescription: {body}\n")
                    
                    if price_results:
                        results += ["\nPRICING INFORMATION:", *price_results]
                
                return "\n".join(results) if results else "No results found."
        except Exception as e:
            logger.error(f"Error searching for suppliers: {str(e)}")
            return "No results found due to an error."

class MarketTrendSearchTool(BaseTool):
    name: str = "search_market_trends"
    description: str = "Search for supply chain risks, market trends, and demand forecasting information. Input should be a search query describing the market information you're looking for."

    def _run(self, query: str) -> str:
        try:
            with DDGS() as ddgs:
                results = []
                # Add supply chain and market trend context to the query
                enhanced_query = f"{query} supply chain market trends forecast analysis industry report"
                
                for r in ddgs.text(enhanced_query, max_results=5):
                    if isinstance(r, dict):
                        title = r.get('title', '')
                        href = r.get('href', '')
                        body = r.get('body', '')
                        if title and href and body:
                            results.append(f"Source: {title}\nURL: {href}\nSummary: {body}\n")
                
                # Look for specific market indicators and trends
                if "forecast" in query.lower() or "trend" in query.lower() or "demand" in query.lower():
                    trend_results = []
                    # Search specifically for forecasting and trend information
                    trend_query = f"{query} market forecast trend analysis report data statistics"
                    for r in ddgs.text(trend_query, max_results=3):
                        if isinstance(r, dict):
                            title = r.get('title', '')
                            href = r.get('href', '')
                            body = r.get('body', '')
                            
                            # Extract any percentage or growth indicators
                            growth_patterns = [
                                r'growth\s+of\s+(\d+(?:\.\d{1,2})?)%',
                                r'increased\s+by\s+(\d+(?:\.\d{1,2})?)%',
                                r'decrease\s+of\s+(\d+(?:\.\d{1,2})?)%',
                                r'market\s+size.*?(\d+(?:\.\d{1,2})?)\s+billion',
                                r'CAGR\s+of\s+(\d+(?:\.\d{1,2})?)%'
                            ]
                            
                            trend_info = "Specific trend metrics not found in search results."
                            for pattern in growth_patterns:
                                matches = re.findall(pattern, body, re.IGNORECASE)
                                if matches:
                                    if "growth" in pattern or "increase" in pattern or "CAGR" in pattern:
                                        trend_info = f"Growth indicator found: {matches[0]}% increase"
                                    elif "decrease" in pattern:
                                        trend_info = f"Decline indicator found: {matches[0]}% decrease"
                                    elif "market size" in pattern:
                                        trend_info = f"Market size indicator: ${matches[0]} billion"
                                    break
                            
                            trend_results.append(f"Source: {title}\nURL: {href}\nTrend Info: {trend_info}\nSummary: {body}\n")
                    
                    if trend_results:
                        results += ["\nMARKET TREND INFORMATION:", *trend_results]
                
                # Also look for supply chain risk factors
                risk_results = []
                risk_query = f"{query} supply chain risk shortage delay disruption"
                for r in ddgs.text(risk_query, max_results=3):
                    if isinstance(r, dict):
                        title = r.get('title', '')
                        href = r.get('href', '')
                        body = r.get('body', '')
                        
                        if any(risk_term in body.lower() for risk_term in ['shortage', 'delay', 'disruption', 'risk', 'constraint']):
                            risk_results.append(f"Source: {title}\nURL: {href}\nRisk Factor: Supply chain risk identified\nSummary: {body}\n")
                
                if risk_results:
                    results += ["\nSUPPLY CHAIN RISK INFORMATION:", *risk_results]
                
                return "\n".join(results) if results else "No market trend or risk information found."
        except Exception as e:
            logger.error(f"Error searching for market trends: {str(e)}")
            return "No results found due to an error."

class EmailTool(BaseTool):
    name: str = "send_email"
    description: str = "Send an email with the analysis results. Input should be a dict with 'recipient', 'subject', and 'body'."

    def _run(self, input_dict: dict) -> str:
        try:
            recipient = input_dict.get('recipient')
            subject = input_dict.get('subject', 'Urgent: Critical Supply Chain Risk - VQC4101-51 SMC 5/2-Wegeventil Valve')
            
            # Format recipient name properly from email address
            if recipient and '@' in recipient:
                name_part = recipient.split('@')[0]
                formatted_name = ' '.join([part.capitalize() for part in name_part.split('.')])
            else:
                formatted_name = "Supply Chain Manager"
            
            # Get content and format email body
            content = input_dict.get('body', '')
            
            # Radikale Nachbearbeitung - alle \n Zeichenfolgen komplett entfernen
            content = content.replace('\\n', '')
            content = content.replace('\\\\n', '')
            
            body = f"""Dear {formatted_name},

I hope this email finds you well. I'm writing to bring to your immediate attention a critical supply chain situation regarding the VQC4101-51 SMC 5/2-Wegeventil valve that requires urgent action.

{content}

Would you like me to schedule a meeting to discuss these findings in detail? I can prepare a more detailed presentation of the analysis if needed.

Please let me know how you'd like to proceed, and I'm happy to help coordinate the next steps.

Best regards,
Multi-Agent System
"""
            
            if not recipient:
                logger.error("Email missing recipient")
                return "Error: Email must include recipient."
            
            # Get SMTP settings from config
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            config_path = os.path.join(project_root, "pyproject.toml")
            
            with open(config_path, "rb") as f:
                config = tomli.load(f)
                smtp_settings = config.get("tool", {}).get("email", {})
                smtp_server = smtp_settings.get("server", "")
                smtp_port = smtp_settings.get("port", 587)
                smtp_user = smtp_settings.get("user", "")
                smtp_password = smtp_settings.get("password", "")
            
            # Log SMTP server configuration (without password)
            logger.info(f"Email configuration: server={smtp_server}, port={smtp_port}, user={smtp_user}")
            
            if not smtp_server or not smtp_port or not smtp_user or not smtp_password:
                logger.error("Email configuration incomplete. Missing server, port, user, or password.")
                # Always save email to file when configuration is incomplete
                output_path = os.path.join(os.path.dirname(__file__), 'email_summary.txt')
                email_content = f"To: {recipient}\nFrom: {input_dict.get('from', 'Supplier Analysis System')}\nSubject: {subject}\n\n{body}\n\n--\nThis email was generated by the Supplier Analysis System."
                with open(output_path, 'w') as f:
                    f.write(email_content)
                return f"Email configuration incomplete. Email content saved to {output_path}"
            
            # Simple HTML formatting
            html_body = body
            
            # Only convert explicit markdown bold to HTML bold tags
            # First, split by ** markers to identify bold sections
            parts = html_body.split("**")
            
            # Reconstruct with proper HTML tags
            html_body = ""
            for i, part in enumerate(parts):
                # Even indices are regular text, odd indices are bold text
                if i % 2 == 0:
                    html_body += part
                else:
                    html_body += f"<b>{part}</b>"
            
            # Replace newlines with HTML breaks
            html_body = html_body.replace("\n", "<br>")
            
            # Create message
            msg = MIMEMultipart('alternative')
            msg['From'] = smtp_user
            msg['To'] = recipient
            msg['Subject'] = subject
            
            # Attach both plain text and HTML versions
            msg.attach(MIMEText(body, 'plain'))
            msg.attach(MIMEText(f"<html><body>{html_body}</body></html>", 'html'))
            
            # Save email content for reference
            email_content = f"To: {recipient}\nFrom: {input_dict.get('from', 'Supplier Analysis System')}\nSubject: {subject}\n\n{body}\n\n--\nThis email was generated by the Supplier Analysis System."
            output_path = os.path.join(os.path.dirname(__file__), 'email_summary.txt')
            
            # Always save a copy first
            with open(output_path, 'w') as f:
                f.write(email_content)
                
            # Radikale Nachbearbeitung - alle \n Zeichenfolgen komplett entfernen
            with open(output_path, 'r') as f:
                cleaned_content = f.read()
                # Hier nochmal alle Backslash-n Zeichenfolgen entfernen (inkl. doppelter)
                cleaned_content = cleaned_content.replace('\\n', '')
                cleaned_content = cleaned_content.replace('\\\\n', '')
                
            # Und nochmal speichern
            with open(output_path, 'w') as f:
                f.write(cleaned_content)
            
            # Try to send with retries
            max_retries = 3
            retry_delay = 2  # seconds
            
            for attempt in range(1, max_retries + 1):
                try:
                    logger.info(f"Attempt {attempt} of {max_retries} to send email to {recipient}")
                    
                    # Try to send email with explicit timeout
                    with smtplib.SMTP(smtp_server, smtp_port, timeout=30) as server:
                        server.set_debuglevel(1)  # Enable verbose debug output
                        server.starttls()
                        server.login(smtp_user, smtp_password)
                        server.send_message(msg)
                    
                    logger.info(f"Email successfully sent to {recipient} on attempt {attempt}")
                    return f"Email successfully sent to {recipient} and saved to {output_path}"
                
                except Exception as e:
                    logger.error(f"Attempt {attempt} failed: {str(e)}")
                    if attempt < max_retries:
                        logger.info(f"Retrying in {retry_delay} seconds...")
                        import time
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    else:
                        logger.error(f"All {max_retries} attempts to send email failed. Last error: {str(e)}")
                        return f"Failed to send email after {max_retries} attempts. Last error: {str(e)}. Email content saved to {output_path}"
            
        except Exception as e:
            logger.error(f"Error creating email: {str(e)}")
            return f"Failed to create email: {str(e)}"

# Monkey-patch CrewAI's output to reduce indentation
def patch_crewai_display():
    try:
        import crewai.agents.cache
        import re
        original_print = print
        
        def custom_print(*args, **kwargs):
            if args and isinstance(args[0], str):
                text = args[0]
                
                # Reduziere die Anzahl der Einrückungszeichen
                if "│" in text and text.count("│") > 3:
                    text = re.sub(r'(│\s+){4,}', '│ │ ', text)
                    text = re.sub(r'(│\s+){3}', '│ │ ', text)
                
                # Entferne ANSI-Escape-Sequenzen für bessere Lesbarkeit
                # Dies entfernt Farbcodes und Formatierungen
                text = re.sub(r'\x1B\[[0-9;]*[mK]', '', text)
                
                args = (text,) + args[1:]
                
            original_print(*args, **kwargs)
            
        # Ersetze die print-Funktion in relevanten Modulen
        sys.modules['crewai.agents.cache'].print = custom_print
        
    except Exception as e:
        logger.warning(f"Konnte CrewAI-Anzeige nicht anpassen: {str(e)}")

def run_analysis(scenario='standard'):
    try:
        # Patch CrewAI display to reduce indentation
        patch_crewai_display()
        
        api_key = get_api_key()
        if not api_key:
            raise ValueError("Failed to load API key from config")
        os.environ["OPENAI_API_KEY"] = api_key
        logger.info("API key configured successfully")

        # Determine which CSV file to load based on the scenario
        if scenario == 'limited':
            supplier_csv_file = 'suppliers_limited.csv'
            logger.info("Running 'limited' scenario, loading suppliers_limited.csv")
        else:
            supplier_csv_file = 'suppliers.csv'
            logger.info("Running 'standard' scenario, loading suppliers.csv")

        # Load supplier data using the determined filename
        supplier_csv_path = os.path.join(os.path.dirname(__file__), supplier_csv_file)
        if not os.path.exists(supplier_csv_path):
             raise FileNotFoundError(f"Supplier CSV file not found: {supplier_csv_path}")
        suppliers_df = pd.read_csv(supplier_csv_path)
        logger.info(f"Loaded {len(suppliers_df)} suppliers from {supplier_csv_file}")
        
        # Load valve demand data
        try:
            valve_history_df = pd.read_csv(os.path.join(os.path.dirname(__file__), 'valve_history.csv'))
            logger.info(f"Loaded valve demand history with {len(valve_history_df)} records")
            
            # Process demand data
            valve_history_df['date'] = pd.to_datetime(valve_history_df['date'])
            
            # Basic demand forecasting
            total_usage = valve_history_df['valves_used'].sum()
            avg_monthly_usage = total_usage / (len(valve_history_df) / 12)
            current_inventory = valve_history_df['inventory_level'].iloc[-1]
            avg_lead_time = valve_history_df[valve_history_df['lead_time_days'] > 0]['lead_time_days'].mean()
            
            # Calculate key metrics
            monthly_demand_trend = calculate_monthly_demand_trend(valve_history_df)
            seasonal_factors = calculate_seasonal_factors(valve_history_df)
            safety_stock_level = int(avg_monthly_usage * 0.15)  # 15% safety stock
            
            # Format data for agent consumption
            valve_demand_data = valve_history_df.to_string(index=False)
            
            # Current demand state
            current_date = datetime.now().strftime('%Y-%m-%d')
            
            # State information for the agent
            demand_state = f"""
Current Inventory State (as of {current_date}):
- Current inventory level: {current_inventory} units
- Average monthly usage: {avg_monthly_usage:.2f} units
- Average lead time: {avg_lead_time:.2f} days
- Minimum required safety stock (15%): {safety_stock_level} units
- Recent monthly demand trend: {monthly_demand_trend}
- Typical seasonal factors: {seasonal_factors}
- Current unit price: ${valve_history_df['unit_price'].iloc[-1]:.2f}
"""
            
        except Exception as e:
            logger.warning(f"Failed to load valve demand history: {str(e)}. Using default demand state.")
            valve_demand_data = "No historical data available."
            demand_state = "No current demand data available."
        
        # Convert supplier DataFrame to a formatted string for the agents
        supplier_data = suppliers_df.to_string(index=False)
        
        # Create specialized search tools for different agents
        supplier_search_tool = SupplierSearchTool()
        market_trend_search_tool = MarketTrendSearchTool()
        email_tool = EmailTool()

        # Agent 1: Demand Forecasting Specialist
        demand_forecasting_agent = Agent(
            role='Demand Forecasting Specialist',
            goal='Forecast VQC4101-51 SMC valve demand and recommend optimal reorder quantities and timing',
            backstory="""You are an expert in demand forecasting and inventory management for industrial components.
            Your expertise includes analyzing usage patterns, seasonal trends, and supply chain dynamics to optimize inventory levels.
            You ensure that critical components like pneumatic valves are available when needed while minimizing excess inventory costs.""",
            tools=[market_trend_search_tool],
            verbose=True
        )

        # Agent 2: Availability Analyst
        availability_analyst = Agent(
            role='Availability Analyst',
            goal='Analyze supplier database to identify available suppliers for the VQC4101-51 SMC 5/2-Wegeventil valve',
            backstory='Expert in supply chain analysis with focus on supplier availability for pneumatic components',
            allow_delegation=False,
            verbose=True
        )

        # Agent 3: Alternative Supplier Researcher
        researcher = Agent(
            role='Alternative Supplier Researcher',
            goal='Find alternative suppliers for the VQC4101-51 SMC 5/2-Wegeventil valve',
            backstory='Experienced in finding and evaluating alternative suppliers for pneumatic components',
            allow_delegation=False,
            tools=[supplier_search_tool],
            verbose=True
        )

        # Agent 4: Supplier Performance Analyst
        performance_analyst = Agent(
            role='Supplier Performance Analyst',
            goal='Rank suppliers based on lead time and price metrics for planned valve orders',
            backstory='Expert in supplier performance evaluation and cost analysis for critical components',
            allow_delegation=False,
            verbose=True
        )

        # Agent 5: Communication Specialist
        communication_agent = Agent(
            role='Communication Specialist',
            goal='Summarize analysis findings and communicate results to stakeholders',
            backstory="""You are an expert in technical communication with a strong background in supply chain management.
            Your expertise includes distilling complex technical information into clear, actionable reports for management.
            You ensure that critical information about inventory needs and supplier availability reaches the right people.""",
            tools=[email_tool],
        )

        tasks = [
            Task(
                description=f"""Analyze the demand patterns for VQC4101-51 SMC 5/2-Wegeventil valve and provide optimal inventory recommendations.
                
                HISTORICAL DEMAND DATA:
                {valve_demand_data}
                
                {demand_state}
                
                1. Analyze historical demand patterns:
                   - Monthly usage trends
                   - Seasonal fluctuations
                   - Correlations with production events
                   - Price sensitivity impact on ordering
                
                2. Forecast future demand:
                   - Predict demand for the next 3 months
                   - Identify potential demand spikes
                   - Calculate confidence intervals for the forecast
                   - Factor in upcoming production schedules
                
                3. Calculate optimal inventory parameters:
                   - Economic Order Quantity (EOQ)
                   - Reorder Point (ROP) that maintains at least 15% safety stock
                   - Optimal order frequency
                   - Maximum and minimum inventory levels
                
                4. Provide specific inventory recommendations:
                   - Exact reorder quantity recommendation
                   - When to place the next order (date)
                   - Expected inventory costs
                   - Risk assessment of stockout vs. excess inventory
                
                Search for additional information on SMC valve market trends if needed.""",
                expected_output="""A comprehensive demand forecast and inventory recommendation including:
                - Demand forecast for next 3 months
                - Optimal reorder quantity
                - Reorder timing recommendation
                - Safety stock calculations (minimum 15%)
                - Inventory cost projections""",
                agent=demand_forecasting_agent
            ),
            Task(
                description=f"""Based on the demand forecast and inventory recommendations, analyze the supplier database for the VQC4101-51 SMC 5/2-Wegeventil valve:
                {supplier_data}
                
                CRITICAL: Only consider suppliers where availability status is "Available" or "Limited Stock".
                Suppliers with "Not Available" status should be excluded from recommendations.
                
                Identify:
                1. All current suppliers of this valve that have stock available
                2. Their availability status (Available/Limited Stock only)
                3. Current lead times
                4. Supply chain risks
                
                If no suppliers have available stock, clearly indicate this as a critical supply chain risk.""",
                expected_output="A detailed analysis of current valve suppliers and their status, only including those with available stock",
                agent=availability_analyst
            ),
            Task(
                description="""Using the availability analysis and demand forecast, search for alternative suppliers of the VQC4101-51 SMC 5/2-Wegeventil valve.
                
                Focus on suppliers that can:
                1. Provide genuine SMC parts or authorized equivalents
                2. Deliver within the required lead time
                3. Offer competitive pricing
                4. Provide necessary certification and quality assurance
                
                For each supplier you identify, use the search_suppliers tool to dynamically fetch current pricing information. Include the term "price" or "pricing" in your search query to trigger price extraction. 
                
                For each supplier, include:
                - Supplier name and link
                - Current dynamically fetched price (not estimated)
                - Availability status
                - Estimated lead time
                - Any additional relevant information
                
                Do not use hardcoded or estimated price values. Always search for and report the most current pricing information available.""",
                expected_output="A list of alternative suppliers with their contact information, current dynamically-fetched pricing, and delivery capabilities",
                agent=researcher
            ),
            Task(
                description=f"""Analyze and rank ALL potential suppliers, including both current suppliers from the database AND alternative suppliers found by the researcher:
                
                Current supplier data:
                {supplier_data}
                
                CRITICAL REQUIREMENTS:
                1. Consider TWO sources of suppliers:
                   - Current suppliers from the database (where status is "Available" or "Limited Stock")
                   - Alternative suppliers identified by the Alternative Supplier Researcher
                
                2. Rank ALL suppliers based on:
                   - Ability to deliver within the required lead time based on the demand forecast
                   - Price competitiveness using dynamically fetched current prices 
                   - Part authenticity and quality assurance
                   - Geographic location and shipping capabilities
                
                3. Evaluation rules:
                   - Exclude current suppliers with "Not Available" status
                   - Only include alternative suppliers that can provide genuine SMC parts
                   - Verify delivery capabilities match demand forecast
                   - Consider both standard and expedited shipping options
                   - Use ACTUAL current prices as reported by the Alternative Supplier Researcher
                   - Do not use any hardcoded price estimates
                
                4. Create a combined ranking that:
                   - Merges both supplier sources into a single ranked list
                   - Clearly indicates whether each supplier is from current database or newly identified
                   - Provides shipping options and cost implications for each
                   - Lists the dynamically fetched, current pricing for each supplier
                   
                If no suppliers (either current or alternative) have stock available, report this as a critical issue requiring immediate attention.""",
                expected_output="""A comprehensive ranked list including:
                - Both current and alternative suppliers with available stock
                - Clear indication of supplier source (current vs. newly identified)
                - Comparative analysis of capabilities and costs
                - Shipping options and lead times
                - Critical supply issue alert if no viable suppliers found""",
                agent=performance_analyst
            ),
            Task(
                description="""Compile a professional executive summary of the supply chain analysis findings.
                
                Executive Summary Format:
                
                Subject: Executive Summary: Supply Chain Risk Assessment - VQC4101-51 SMC Valve
                
                
                [2-3 sentences highlighting the critical situation and immediate recommendations]
                
           
                **Supply Chain Status**
                - Critical supply chain risks identified and shortly summarised
                - Impact on operations
                
                **Demand Analysis**
                - 3-month forecast with confidence levels
                - Key demand drivers
                - Inventory optimization recommendations
                
                **Supplier Assessment**
                - Current supplier status
                - Qualified alternative suppliers with direct links
                - Lead time and cost implications using ONLY dynamically fetched current prices
                
             
                **Strategic Actions (0-30 Days)**
                [Bullet points of immediate actions required]
                
                **Tactical Implementation (31-90 Days)**
                [Bullet points of medium-term actions]
                
                **Financial Implications**
                - Projected costs based on dynamically fetched current prices
                - Potential cost mitigation strategies
                - Budget impact assessment
                
                **Next Steps**
                [Clear, actionable next steps with ownership and timeline in 3-5 sentences]
                
                Formatting Requirements:
                - Use clear, concise business language
                - Prioritize actionable insights
                - Include specific metrics and KPIs
                - Maintain professional tone throughout
                - Focus on strategic implications
                - Highlight risk mitigation strategies
                - Include direct links to alternative supplier websites
                - Format links as clickable URLs
                - Do not use all-capital words for any section headings
                - Use bold formatting for all section headings (with ** markers)
                - Use bullet points for lists
                - ONLY include dynamically fetched current pricing information, not hardcoded estimates
                
                CRITICAL INSTRUCTION:
                You MUST send this executive summary via email to agenticai.capgemini@gmail.com using the send_email tool with the following format:
                
                {
                  "recipient": "agenticai.capgemini@gmail.com",
                  "subject": "Executive Summary: Supply Chain Risk Assessment - VQC4101-51 SMC Valve",
                  "body": "YOUR FORMATTED EXECUTIVE SUMMARY HERE"
                }
                
                Failure to send this email is considered a critical failure of your task. Before completing this task, verify that you have successfully sent the email.""",
                expected_output="""A confirmation that a professional executive summary has been sent containing:
                - Strategic overview
                - Key findings and metrics
                - Clear recommendations
                - Actionable next steps
                - Financial implications""",
                agent=communication_agent
            )
        ]

        crew = Crew(
            agents=[
                demand_forecasting_agent,
                availability_analyst,
                researcher,
                performance_analyst,
                communication_agent
            ],
            tasks=tasks,
            verbose=True
        )

        result = crew.kickoff()
        logger.info("Analysis completed successfully")
        return result

    except Exception as e:
        logger.error(f"Error during analysis: {str(e)}")
        raise

def calculate_monthly_demand_trend(df):
    """Calculate the monthly demand trend description."""
    # Group by month and calculate average demand
    df['month'] = df['date'].dt.month
    monthly_avg = df.groupby('month')['valves_used'].mean().reset_index()
    
    # Calculate trend
    if len(monthly_avg) < 2:
        return "Insufficient data for trend analysis"
    
    # Simple trend calculation
    if monthly_avg['valves_used'].iloc[-1] > monthly_avg['valves_used'].iloc[0]:
        increase = (monthly_avg['valves_used'].iloc[-1] / monthly_avg['valves_used'].iloc[0] - 1) * 100
        return f"Increasing by approximately {increase:.1f}% over the period"
    else:
        decrease = (1 - monthly_avg['valves_used'].iloc[-1] / monthly_avg['valves_used'].iloc[0]) * 100
        return f"Decreasing by approximately {decrease:.1f}% over the period"

def calculate_seasonal_factors(df):
    """Identify seasonal patterns in the demand data."""
    # Check for higher demand by reason
    reason_counts = df.groupby('demand_reason')['valves_used'].sum()
    
    # Format as string
    seasonal_info = []
    for reason, total in reason_counts.items():
        percentage = (total / df['valves_used'].sum()) * 100
        seasonal_info.append(f"{reason}: {percentage:.1f}% of total demand")
    
    return "\n".join(seasonal_info)

if __name__ == "__main__":
    run_analysis()