"""
Cortex Agent API Routes
Proxy requests to Snowflake's Cortex Agent REST API with proper authentication and scope
Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run
Authentication: https://docs.snowflake.com/en/developer-guide/snowflake-rest-api/authentication#using-a-programmatic-access-token-pat
"""
import os
import json
import httpx
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

from ..database import get_db
from ..models import User
from ..auth import get_current_user
from ..utils import get_user_role_name

router = APIRouter(prefix="/cortex-agent", tags=["cortex-agent"])

# Snowflake connection details from environment
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USER", "")
# The password is a Programmatic Access Token (PAT)
SNOWFLAKE_PAT = os.getenv("SNOWFLAKE_PASSWORD", "")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE", "RETAILIQ_ANALYTICS")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE", "RETAILIQ_WH")

# Cortex Agent configuration
# The agent object is pre-created in Snowflake with semantic model configured
CORTEX_AGENT_NAME = os.getenv("CORTEX_AGENT_NAME", "RETAILIQ_AGENT")
CORTEX_AGENT_MODEL = os.getenv("CORTEX_AGENT_MODEL", "claude-3-5-sonnet")


class Message(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    thread_id: Optional[int] = None
    parent_message_id: Optional[int] = 0


def get_snowflake_api_url() -> str:
    """
    Get the Snowflake REST API base URL.
    Note: Underscores in account identifiers must be replaced with hyphens in the URL.
    Example: myorg-my_account -> myorg-my-account
    """
    # Replace underscores with hyphens for the hostname
    account_for_url = SNOWFLAKE_ACCOUNT.replace("_", "-")
    return f"https://{account_for_url}.snowflakecomputing.com"


def get_auth_headers(role_name: str = None) -> dict:
    """
    Get authentication headers using Programmatic Access Token (PAT).
    Reference: https://docs.snowflake.com/en/developer-guide/snowflake-rest-api/authentication#using-a-programmatic-access-token-pat
    
    Args:
        role_name: The Snowflake role to use for this request (e.g., RETAILIQ_ROLE_ADMIN)
    """
    headers = {
        "Authorization": f"Bearer {SNOWFLAKE_PAT}",
        "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    
    # Add role header if specified - this controls data access via Row Access Policies
    if role_name:
        headers["X-Snowflake-Role"] = role_name
    
    return headers


def build_cortex_request(messages: List[Message], role_name: str) -> dict:
    """
    Build the request body for Cortex Agent API.
    Uses simplified format to let Snowflake auto-discover configured tools/semantic models.
    Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run#request-body
    """
    # Convert messages to Cortex format
    cortex_messages = []
    for msg in messages:
        cortex_messages.append({
            "role": msg.role,
            "content": [{"type": "text", "text": msg.content}]
        })
    
    # Simple request - let Snowflake handle tool orchestration automatically
    # The semantic model and tools are configured on the Snowflake side
    return {
        "messages": cortex_messages
    }


def parse_sse_response(raw_text: str) -> dict:
    """
    Parse Server-Sent Events (SSE) response from Cortex Agent.
    Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run#streaming-responses
    
    Events include:
    - response.status: Status updates (planning, executing, etc.)
    - response.thinking.delta: Thinking/reasoning chunks
    - response.text.delta: Actual response text chunks
    - response.tool_use: Tool usage information
    - response.tool_result: Tool execution results
    - response.table: Table data
    - response.chart: Chart data
    - error: Error information
    """
    response_text = ""
    thinking_text = ""
    tables = []
    charts = []
    tool_results = []
    status_messages = []
    errors = []
    sql_query = None
    
    current_event = None
    
    for line in raw_text.split('\n'):
        line = line.strip()
        
        if line.startswith('event:'):
            current_event = line[6:].strip()
        elif line.startswith('data:') and current_event:
            data_str = line[5:].strip()
            if not data_str:
                continue
                
            try:
                data = json.loads(data_str)
                
                if current_event == 'response.text.delta':
                    # Accumulate response text
                    response_text += data.get('text', '')
                
                elif current_event == 'response.thinking.delta':
                    # Accumulate thinking text (optional, for debugging)
                    thinking_text += data.get('text', '')
                
                elif current_event == 'response.status':
                    # Track status updates
                    status_messages.append(data.get('message', ''))
                
                elif current_event == 'response.tool_result':
                    # Capture tool results
                    tool_results.append(data)
                
                elif current_event == 'response.tool_result.analyst.delta':
                    # Capture SQL from analyst tool
                    if 'sql' in data:
                        sql_query = data.get('sql', '')
                
                elif current_event == 'response.table':
                    # Capture table data
                    tables.append(data)
                
                elif current_event == 'response.chart':
                    # Capture chart data
                    charts.append(data)
                
                elif current_event == 'error':
                    # Capture errors
                    errors.append(data)
                    
            except json.JSONDecodeError:
                # Some data lines might not be valid JSON
                pass
    
    return {
        'response_text': response_text,
        'thinking_text': thinking_text,
        'tables': tables,
        'charts': charts,
        'tool_results': tool_results,
        'status_messages': status_messages,
        'errors': errors,
        'sql_query': sql_query
    }


@router.post("/chat")
async def chat_with_agent(
    request: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Send a message to the Cortex Agent and get a response.
    Uses Snowflake REST API with PAT authentication.
    Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run
    """
    try:
        role_name = get_user_role_name(current_user)
        last_message = request.messages[-1].content if request.messages else ""
        
        # Log the request
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT: User '{current_user.email}' (scope: {role_name})")
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Query: {last_message[:100]}...")
        
        # Build the Cortex Agent API request
        cortex_request = build_cortex_request(request.messages, role_name)
        
        # Check if PAT is configured
        if not SNOWFLAKE_PAT or not SNOWFLAKE_ACCOUNT:
            return {
                "success": False,
                "response": "⚠️ **Configuration Required**\n\nSnowflake credentials are not configured. Please set SNOWFLAKE_ACCOUNT and SNOWFLAKE_PASSWORD (PAT) in your environment.",
                "role": role_name,
                "timestamp": datetime.now().isoformat()
            }
        
        # Cortex Agent API endpoint - call the specific agent object
        # Format: /api/v2/databases/{database}/schemas/{schema}/agents/{name}:run
        api_url = f"{get_snowflake_api_url()}/api/v2/databases/{SNOWFLAKE_DATABASE}/schemas/{SNOWFLAKE_SCHEMA}/agents/{CORTEX_AGENT_NAME}:run"
        headers = get_auth_headers(role_name)  # Pass role for X-Snowflake-Role header
        
        # Detailed logging
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT: === REQUEST ===")
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT: URL: {api_url}")
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Role: {role_name}")
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Headers: {json.dumps({k: v[:20] + '...' if k == 'Authorization' else v for k, v in headers.items()}, indent=2)}")
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Body: {json.dumps(cortex_request, indent=2)}")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                api_url,
                headers=headers,
                json=cortex_request
            )
            
            # Log raw response
            raw_text = response.text
            print(f"[{datetime.now().isoformat()}] CORTEX AGENT: === RESPONSE ===")
            print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Status: {response.status_code}")
            print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Headers: {dict(response.headers)}")
            print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Body (first 1000 chars): {raw_text[:1000]}")
            
            if response.status_code == 200:
                # Parse the response - handle empty response
                if not raw_text.strip():
                    return {
                        "success": False,
                        "response": "**Empty Response**\n\nThe API returned an empty response. This may indicate an issue with the request format.",
                        "role": role_name,
                        "timestamp": datetime.now().isoformat()
                    }
                
                # Parse SSE (Server-Sent Events) response
                # Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run#streaming-responses
                parsed = parse_sse_response(raw_text)
                
                print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Parsed response - text length: {len(parsed['response_text'])}, thinking length: {len(parsed['thinking_text'])}, tables: {len(parsed['tables'])}, errors: {len(parsed['errors'])}")
                
                # Check for errors first
                if parsed['errors']:
                    error_messages = [e.get('message', str(e)) for e in parsed['errors']]
                    return {
                        "success": False,
                        "response": f"**Agent Error**\n\n" + "\n".join(error_messages),
                        "role": role_name,
                        "timestamp": datetime.now().isoformat()
                    }
                
                # Build the response
                response_text = parsed['response_text']
                
                # If no response text but we have tool results, try to extract from there
                if not response_text and parsed['tool_results']:
                    for result in parsed['tool_results']:
                        if 'content' in result:
                            for content_item in result['content']:
                                if content_item.get('type') == 'text':
                                    response_text += content_item.get('text', '')
                
                # Add extra info if available
                extra_info = {}
                if parsed['sql_query']:
                    extra_info['sql_query'] = parsed['sql_query']
                if parsed['tables']:
                    extra_info['tables'] = parsed['tables']
                if parsed['thinking_text']:
                    extra_info['thinking'] = parsed['thinking_text']
                
                return {
                    "success": True,
                    "response": response_text if response_text else "The agent processed your request but didn't return a text response.",
                    "role": role_name,
                    "timestamp": datetime.now().isoformat(),
                    **extra_info
                }
            
            elif response.status_code == 401:
                return {
                    "success": False,
                    "response": "🔐 **Authentication Failed**\n\nThe Programmatic Access Token (PAT) is invalid or expired. Please check your SNOWFLAKE_PASSWORD environment variable.",
                    "role": role_name,
                    "timestamp": datetime.now().isoformat(),
                    "error_details": response.text
                }
            
            elif response.status_code == 404:
                # Cortex Agent endpoint may not be available
                return {
                    "success": False,
                    "response": f"""⚠️ **Cortex Agent Not Available**

The Cortex Agent API endpoint was not found. This could mean:

1. **Cortex Agent is not enabled** for your Snowflake account
2. **The endpoint URL is different** for your account region

**Your Account:** {SNOWFLAKE_ACCOUNT}
**Endpoint Tried:** {api_url}

Please verify:
- Cortex Agent feature is enabled in your Snowflake account
- Your account identifier format is correct (e.g., `org-account`)

**Alternative:** You can still use Cortex functions directly in SQL:
```sql
SELECT SNOWFLAKE.CORTEX.COMPLETE('claude-3-5-sonnet', 'Your question here');
```
""",
                    "role": role_name,
                    "timestamp": datetime.now().isoformat()
                }
            
            else:
                error_detail = response.text[:500] if response.text else "No error details"
                print(f"[{datetime.now().isoformat()}] CORTEX AGENT: API Error: {error_detail}")
                
                return {
                    "success": False,
                    "response": f"**API Error ({response.status_code})**\n\n{error_detail}",
                    "role": role_name,
                    "timestamp": datetime.now().isoformat()
                }
        
    except httpx.TimeoutException:
        return {
            "success": False,
            "response": "⏳ **Request Timeout**\n\nThe Cortex Agent took too long to respond. Please try a simpler question.",
            "role": role_name,
            "timestamp": datetime.now().isoformat()
        }
    except httpx.RequestError as e:
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT: Network error: {str(e)}")
        return {
            "success": False,
            "response": f"**Network Error**\n\nCould not connect to Snowflake API: {str(e)}",
            "role": role_name,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] CORTEX AGENT ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@router.post("/chat/stream")
async def chat_with_agent_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Stream responses from the Cortex Agent.
    Uses Server-Sent Events (SSE) format with PAT authentication.
    """
    role_name = get_user_role_name(current_user)
    
    async def generate_stream():
        try:
            last_message = request.messages[-1].content if request.messages else ""
            
            # Check configuration
            if not SNOWFLAKE_PAT or not SNOWFLAKE_ACCOUNT:
                yield f"data: {json.dumps({'type': 'error', 'content': 'Snowflake credentials not configured'})}\n\n"
                return
            
            # Build request
            cortex_request = build_cortex_request(request.messages, role_name)
            api_url = f"{get_snowflake_api_url()}/api/v2/databases/{SNOWFLAKE_DATABASE}/schemas/{SNOWFLAKE_SCHEMA}/agents/{CORTEX_AGENT_NAME}:run"
            headers = get_auth_headers(role_name)  # Pass role for X-Snowflake-Role header
            
            print(f"[{datetime.now().isoformat()}] CORTEX AGENT STREAM: Calling API with role {role_name}...")
            
            async with httpx.AsyncClient(timeout=120.0) as client:
                # Make the request with streaming
                async with client.stream("POST", api_url, headers=headers, json=cortex_request) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        yield f"data: {json.dumps({'type': 'error', 'content': f'API Error {response.status_code}: {error_text.decode()[:200]}'})}\n\n"
                        return
                    
                    # Stream the response chunks - parse SSE format from Cortex Agent
                    # Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run#streaming-responses
                    current_event = None
                    
                    async for chunk in response.aiter_text():
                        if chunk.strip():
                            for line in chunk.split('\n'):
                                line = line.strip()
                                
                                if line.startswith('event:'):
                                    current_event = line[6:].strip()
                                elif line.startswith('data:') and current_event:
                                    data_str = line[5:].strip()
                                    if not data_str:
                                        continue
                                    
                                    try:
                                        data = json.loads(data_str)
                                        
                                        if current_event == 'response.text.delta':
                                            # Forward text deltas to the client
                                            text = data.get('text', '')
                                            if text:
                                                yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
                                        
                                        elif current_event == 'response.status':
                                            # Forward status updates
                                            status_msg = data.get('message', data.get('status', ''))
                                            if status_msg:
                                                yield f"data: {json.dumps({'type': 'status', 'content': status_msg})}\n\n"
                                        
                                        elif current_event == 'response.thinking.delta':
                                            # Forward thinking deltas for display in collapsible UI
                                            thinking_text = data.get('text', '')
                                            if thinking_text:
                                                yield f"data: {json.dumps({'type': 'thinking', 'content': thinking_text})}\n\n"
                                        
                                        elif current_event == 'response.chart':
                                            # Forward chart data for visualization
                                            yield f"data: {json.dumps({'type': 'chart', 'content': data})}\n\n"
                                        
                                        elif current_event == 'response.table':
                                            # Forward table data for display
                                            yield f"data: {json.dumps({'type': 'table', 'content': data})}\n\n"
                                        
                                        elif current_event == 'error':
                                            # Forward errors
                                            error_msg = data.get('message', str(data))
                                            yield f"data: {json.dumps({'type': 'error', 'content': error_msg})}\n\n"
                                        
                                    except json.JSONDecodeError:
                                        pass  # Skip non-JSON data lines
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
        except httpx.TimeoutException:
            yield f"data: {json.dumps({'type': 'error', 'content': 'Request timeout - please try a simpler question'})}\n\n"
        except Exception as e:
            print(f"[{datetime.now().isoformat()}] CORTEX AGENT STREAM ERROR: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.get("/status")
async def get_agent_status(current_user: User = Depends(get_current_user)):
    """Check if the Cortex Agent is configured and available."""
    is_configured = bool(SNOWFLAKE_PAT and SNOWFLAKE_ACCOUNT)
    agent_fqn = f"{SNOWFLAKE_DATABASE}.{SNOWFLAKE_SCHEMA}.{CORTEX_AGENT_NAME}"
    api_url = f"{get_snowflake_api_url()}/api/v2/databases/{SNOWFLAKE_DATABASE}/schemas/{SNOWFLAKE_SCHEMA}/agents/{CORTEX_AGENT_NAME}:run"
    
    return {
        "status": "configured" if is_configured else "not_configured",
        "agent": agent_fqn,
        "model": CORTEX_AGENT_MODEL,
        "database": SNOWFLAKE_DATABASE,
        "schema": SNOWFLAKE_SCHEMA,
        "warehouse": SNOWFLAKE_WAREHOUSE,
        "account": SNOWFLAKE_ACCOUNT[:20] + "..." if SNOWFLAKE_ACCOUNT else None,
        "user_role": get_user_role_name(current_user),
        "auth_type": "PAT",
        "api_url": api_url if is_configured else None,
        "features": {
            "text_to_sql": True,  # Tools configured on Snowflake side
            "streaming": True,
            "scope_filtering": True
        },
        "note": f"Using Cortex Agent: {agent_fqn}"
    }

