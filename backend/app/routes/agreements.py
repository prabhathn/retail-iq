"""
Agreements routes for document management with AI parsing and Q&A.
Uses Snowflake stages for document storage and Snowflake tables for metadata/parsed content.
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import os
import uuid
import logging
import tempfile
import time
import io

from ..database import snowflake_cursor, get_db
from ..models import User
from ..auth import get_current_user, decode_token
from ..utils import get_user_role_name
from sqlalchemy.orm import Session

router = APIRouter(prefix="/agreements", tags=["Agreements"])

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Snowflake stage and table names
DOCUMENTS_STAGE = "USER_DOCUMENTS_STAGE"
DOCUMENTS_TABLE = "USER_DOCUMENTS"

# Model for document Q&A. Cortex retires models over time (mistral-large was
# removed in July 2026), so keep this overridable without a code change.
QA_MODEL = os.getenv("CORTEX_COMPLETE_MODEL", "claude-sonnet-4-5")


# ============== Pydantic Models ==============

class DocumentUploadResponse(BaseModel):
    id: str
    file_name: str
    file_type: str
    parse_status: str
    message: str


class DocumentResponse(BaseModel):
    id: str
    file_name: str
    file_type: Optional[str]
    file_size_bytes: Optional[int]
    document_type: Optional[str]
    description: Optional[str]
    parsed_content: Optional[str]
    parse_status: str
    parse_error: Optional[str]
    page_count: Optional[int]
    created_at: Optional[str]
    parsed_at: Optional[str]


class AskQuestionRequest(BaseModel):
    question: str


class AskQuestionResponse(BaseModel):
    question: str
    answer: str
    document_id: str


# ============== Helper Functions ==============

def ensure_table_exists(role_name: str = None):
    """Create the Snowflake table for documents if it doesn't exist."""
    logger.info("[AGREEMENTS] Ensuring documents table exists...")
    start_time = time.time()
    
    try:
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS {DOCUMENTS_TABLE} (
                    id VARCHAR(50) PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    file_name VARCHAR(500) NOT NULL,
                    file_type VARCHAR(20),
                    file_size_bytes INTEGER,
                    stage_path VARCHAR(1000),
                    document_type VARCHAR(100),
                    description TEXT,
                    parsed_content TEXT,
                    parse_status VARCHAR(50) DEFAULT 'pending',
                    parse_error TEXT,
                    page_count INTEGER,
                    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
                    parsed_at TIMESTAMP_NTZ
                )
            """)
            conn.commit()
            elapsed = time.time() - start_time
            logger.info(f"[AGREEMENTS] Table ensured in {elapsed:.2f}s")
            return True
    except Exception as e:
        logger.error(f"[AGREEMENTS] Error creating table: {e}")
        return False


def ensure_stage_exists(role_name: str = None):
    """Create the Snowflake stage if it doesn't exist (with server-side encryption)."""
    logger.info("[AGREEMENTS] Ensuring documents stage exists...")
    start_time = time.time()
    
    try:
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            cursor.execute(f"""
                CREATE STAGE IF NOT EXISTS {DOCUMENTS_STAGE}
                ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
                COMMENT = 'User document storage for Agreements with SSE for Cortex AI'
            """)
            conn.commit()
            elapsed = time.time() - start_time
            logger.info(f"[AGREEMENTS] Stage ensured in {elapsed:.2f}s")
            return True
    except Exception as e:
        logger.error(f"[AGREEMENTS] Error creating stage: {e}")
        return False


def parse_document_with_ai(stage_path: str, role_name: str = None) -> dict:
    """
    Run AI_PARSE_DOCUMENT on a file in the stage.
    Returns dict with parsed content and metadata.
    """
    logger.info(f"[AGREEMENTS] Starting AI_PARSE_DOCUMENT for: {stage_path}")
    start_time = time.time()
    
    try:
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            query = f"""
                SELECT AI_PARSE_DOCUMENT(
                    TO_FILE('@{DOCUMENTS_STAGE}', '{stage_path}'),
                    {{'mode': 'LAYOUT'}}
                ) AS parsed_result
            """
            logger.debug(f"[AGREEMENTS] Executing parse query: {query[:200]}...")
            
            cursor.execute(query)
            logger.debug("[AGREEMENTS] Query executed, fetching result...")
            
            result = cursor.fetchone()
            elapsed = time.time() - start_time
            logger.info(f"[AGREEMENTS] AI_PARSE_DOCUMENT completed in {elapsed:.2f}s")
            
            if result and result[0]:
                import json
                parsed = json.loads(result[0])
                
                content = parsed.get('content', '')
                metadata = parsed.get('metadata', {})
                page_count = metadata.get('page_count', 1)
                
                logger.info(f"[AGREEMENTS] Parsed successfully: {len(content)} chars, {page_count} pages")
                
                return {
                    'success': True,
                    'content': content,
                    'page_count': page_count,
                    'error': None
                }
            else:
                logger.warning("[AGREEMENTS] No result returned from AI_PARSE_DOCUMENT")
                return {
                    'success': False,
                    'content': None,
                    'page_count': None,
                    'error': 'No result returned from AI_PARSE_DOCUMENT'
                }
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[AGREEMENTS] AI_PARSE_DOCUMENT failed after {elapsed:.2f}s: {e}")
        return {
            'success': False,
            'content': None,
            'page_count': None,
            'error': str(e)
        }


def parse_document_background(doc_id: str, stage_path: str, role_name: str = None):
    """Background task to parse document after upload."""
    logger.info(f"[AGREEMENTS] Background parse starting for doc_id={doc_id}")
    
    try:
        parse_result = parse_document_with_ai(stage_path, role_name)
        
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            if parse_result['success']:
                # Escape single quotes in content
                safe_content = parse_result['content'].replace("'", "''") if parse_result['content'] else ''
                
                cursor.execute(f"""
                    UPDATE {DOCUMENTS_TABLE}
                    SET parsed_content = '{safe_content}',
                        page_count = {parse_result['page_count'] or 'NULL'},
                        parse_status = 'completed',
                        parsed_at = CURRENT_TIMESTAMP()
                    WHERE id = '{doc_id}'
                """)
                logger.info(f"[AGREEMENTS] Document {doc_id} parsed successfully")
            else:
                safe_error = parse_result['error'].replace("'", "''") if parse_result['error'] else 'Unknown error'
                cursor.execute(f"""
                    UPDATE {DOCUMENTS_TABLE}
                    SET parse_status = 'error',
                        parse_error = '{safe_error}'
                    WHERE id = '{doc_id}'
                """)
                logger.error(f"[AGREEMENTS] Document {doc_id} parse failed: {parse_result['error']}")
            
            conn.commit()
            
    except Exception as e:
        logger.error(f"[AGREEMENTS] Background parse error for {doc_id}: {e}")
        try:
            with snowflake_cursor(role_name=role_name) as (cursor, conn):
                safe_error = str(e).replace("'", "''")
                cursor.execute(f"""
                    UPDATE {DOCUMENTS_TABLE}
                    SET parse_status = 'error',
                        parse_error = '{safe_error}'
                    WHERE id = '{doc_id}'
                """)
                conn.commit()
        except Exception as e2:
            logger.error(f"[AGREEMENTS] Failed to update error status: {e2}")


def extract_answer_with_ai(parsed_content: str, question: str, role_name: str = None) -> str:
    """Use AI to answer a question based on document content."""
    logger.info(f"[AGREEMENTS] Starting AI question answering...")
    start_time = time.time()
    
    try:
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            prompt = (
                f"Based on the following document, answer this question: {question}\n\n"
                f"Document:\n{parsed_content[:50000]}"
            )

            # Use COMPLETE for Q&A (simpler and more reliable than AI_EXTRACT).
            # Bound parameters: the question is user input.
            query = "SELECT SNOWFLAKE.CORTEX.COMPLETE(%s, %s) AS answer"

            logger.debug(f"[AGREEMENTS] Executing Q&A query...")
            cursor.execute(query, (QA_MODEL, prompt))
            result = cursor.fetchone()
            
            elapsed = time.time() - start_time
            logger.info(f"[AGREEMENTS] Q&A completed in {elapsed:.2f}s")
            
            if result and result[0]:
                return result[0]
            return "Unable to find an answer in the document."
            
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[AGREEMENTS] Q&A failed after {elapsed:.2f}s: {e}")
        return f"Error processing question: {str(e)}"


# ============== Endpoints ==============

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_type: str = Form(default="agreement"),
    description: str = Form(default=""),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a document to Snowflake stage and queue it for AI parsing.
    Parsing happens in background to avoid timeout.
    """
    logger.info(f"[AGREEMENTS] Upload started: user={current_user.id}, file={file.filename}")
    start_time = time.time()
    
    # Validate file type
    allowed_extensions = ['.pdf', '.docx', '.doc', '.txt', '.pptx', '.ppt']
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        logger.warning(f"[AGREEMENTS] Rejected file type: {file_ext}")
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    role_name = get_user_role_name(current_user)
    logger.debug(f"[AGREEMENTS] Using role: {role_name}")
    
    try:
        # Ensure infrastructure exists
        ensure_stage_exists(role_name)
        ensure_table_exists(role_name)
        
        # Read file content
        logger.debug("[AGREEMENTS] Reading file content...")
        file_content = await file.read()
        file_size = len(file_content)
        logger.info(f"[AGREEMENTS] File read: {file_size} bytes")
        
        # Generate unique document ID
        doc_id = uuid.uuid4().hex
        
        # Write to temp file for Snowflake PUT
        logger.debug("[AGREEMENTS] Writing to temp file...")
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            tmp.write(file_content)
            tmp_path = tmp.name
        
        logger.info(f"[AGREEMENTS] Temp file created: {tmp_path}")
        
        try:
            with snowflake_cursor(role_name=role_name) as (cursor, conn):
                user_folder = f"user_{current_user.id}"
                
                # PUT the file to stage
                put_command = f"PUT 'file://{tmp_path}' '@{DOCUMENTS_STAGE}/{user_folder}/' AUTO_COMPRESS=FALSE OVERWRITE=TRUE"
                logger.info(f"[AGREEMENTS] Executing PUT command...")
                logger.debug(f"[AGREEMENTS] PUT: {put_command}")
                
                cursor.execute(put_command)
                conn.commit()
                
                staged_filename = os.path.basename(tmp_path)
                actual_stage_path = f"{user_folder}/{staged_filename}"
                logger.info(f"[AGREEMENTS] File staged at: {actual_stage_path}")
                
                # Insert document record
                safe_filename = file.filename.replace("'", "''")
                safe_desc = description.replace("'", "''")
                
                insert_query = f"""
                    INSERT INTO {DOCUMENTS_TABLE} 
                    (id, user_id, file_name, file_type, file_size_bytes, stage_path, document_type, description, parse_status)
                    VALUES ('{doc_id}', {current_user.id}, '{safe_filename}', '{file_ext.replace('.', '')}', 
                            {file_size}, '{actual_stage_path}', '{document_type}', '{safe_desc}', 'processing')
                """
                logger.debug(f"[AGREEMENTS] Inserting record...")
                cursor.execute(insert_query)
                conn.commit()
                logger.info(f"[AGREEMENTS] Document record created: {doc_id}")
                
        finally:
            # Clean up temp file
            os.unlink(tmp_path)
            logger.debug("[AGREEMENTS] Temp file cleaned up")
        
        # Queue background parsing
        logger.info(f"[AGREEMENTS] Queuing background parse for {doc_id}")
        background_tasks.add_task(parse_document_background, doc_id, actual_stage_path, role_name)
        
        elapsed = time.time() - start_time
        logger.info(f"[AGREEMENTS] Upload completed in {elapsed:.2f}s (parsing in background)")
        
        return DocumentUploadResponse(
            id=doc_id,
            file_name=file.filename,
            file_type=file_ext.replace('.', ''),
            parse_status="processing",
            message="Document uploaded. Parsing in progress..."
        )
        
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[AGREEMENTS] Upload failed after {elapsed:.2f}s: {e}")
        raise HTTPException(status_code=500, detail=f"Error uploading document: {str(e)}")


@router.get("/documents")
async def list_documents(
    current_user: User = Depends(get_current_user)
):
    """Get list of all documents uploaded by the current user."""
    logger.info(f"[AGREEMENTS] Listing documents for user={current_user.id}")
    start_time = time.time()
    
    role_name = get_user_role_name(current_user)
    
    try:
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            query = f"""
                SELECT id, file_name, file_type, file_size_bytes, document_type, 
                       description, parse_status, page_count, created_at, parsed_at
                FROM {DOCUMENTS_TABLE}
                WHERE user_id = {current_user.id}
                ORDER BY created_at DESC
            """
            cursor.execute(query)
            rows = cursor.fetchall()
            
            documents = []
            for row in rows:
                documents.append({
                    "id": row[0],
                    "file_name": row[1],
                    "file_type": row[2],
                    "file_size_bytes": row[3],
                    "document_type": row[4],
                    "description": row[5],
                    "parse_status": row[6],
                    "page_count": row[7],
                    "created_at": row[8].isoformat() if row[8] else None,
                    "parsed_at": row[9].isoformat() if row[9] else None,
                })
            
            elapsed = time.time() - start_time
            logger.info(f"[AGREEMENTS] Listed {len(documents)} documents in {elapsed:.2f}s")
            
            return {"documents": documents}
            
    except Exception as e:
        logger.error(f"[AGREEMENTS] List documents failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing documents: {str(e)}")


@router.get("/documents/{document_id}")
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific document with its parsed content."""
    logger.info(f"[AGREEMENTS] Getting document: {document_id}")
    
    role_name = get_user_role_name(current_user)
    
    try:
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            query = f"""
                SELECT id, file_name, file_type, file_size_bytes, document_type, 
                       description, parsed_content, parse_status, parse_error,
                       page_count, created_at, parsed_at
                FROM {DOCUMENTS_TABLE}
                WHERE id = '{document_id}' AND user_id = {current_user.id}
            """
            cursor.execute(query)
            row = cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")
            
            document = {
                "id": row[0],
                "file_name": row[1],
                "file_type": row[2],
                "file_size_bytes": row[3],
                "document_type": row[4],
                "description": row[5],
                "parsed_content": row[6],
                "parse_status": row[7],
                "parse_error": row[8],
                "page_count": row[9],
                "created_at": row[10].isoformat() if row[10] else None,
                "parsed_at": row[11].isoformat() if row[11] else None,
            }
            
            logger.info(f"[AGREEMENTS] Retrieved document: {document_id}")
            return {"document": document}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AGREEMENTS] Get document failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting document: {str(e)}")


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Download/stream the original document file for viewing.

    Auth uses the standard Authorization header. The frontend fetches the file
    as a blob, so the token never has to appear in a URL (and in access logs).
    """
    logger.info(f"[AGREEMENTS] Download requested for document: {document_id}")

    role_name = get_user_role_name(current_user)
    
    try:
        # Get document metadata
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            cursor.execute(f"""
                SELECT stage_path, file_name, file_type
                FROM {DOCUMENTS_TABLE}
                WHERE id = '{document_id}' AND user_id = {current_user.id}
            """)
            row = cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")
            
            stage_path, file_name, file_type = row[0], row[1], row[2]
            
            # Create a temp directory to download the file
            with tempfile.TemporaryDirectory() as tmp_dir:
                # GET the file from stage
                get_command = f"GET '@{DOCUMENTS_STAGE}/{stage_path}' 'file://{tmp_dir}/'"
                logger.debug(f"[AGREEMENTS] Executing: {get_command}")
                cursor.execute(get_command)
                
                # Find the downloaded file
                downloaded_files = os.listdir(tmp_dir)
                if not downloaded_files:
                    raise HTTPException(status_code=404, detail="File not found in stage")
                
                downloaded_path = os.path.join(tmp_dir, downloaded_files[0])
                logger.info(f"[AGREEMENTS] Downloaded file to: {downloaded_path}")
                
                # Read file content
                with open(downloaded_path, 'rb') as f:
                    file_content = f.read()
                
                # Determine content type
                content_types = {
                    'pdf': 'application/pdf',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'doc': 'application/msword',
                    'txt': 'text/plain',
                    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'ppt': 'application/vnd.ms-powerpoint',
                }
                content_type = content_types.get(file_type, 'application/octet-stream')
                
                logger.info(f"[AGREEMENTS] Streaming {len(file_content)} bytes as {content_type}")
                
                return StreamingResponse(
                    io.BytesIO(file_content),
                    media_type=content_type,
                    headers={
                        "Content-Disposition": f"inline; filename=\"{file_name}\"",
                        "Content-Length": str(len(file_content)),
                    }
                )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AGREEMENTS] Download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error downloading document: {str(e)}")


@router.post("/documents/{document_id}/ask")
async def ask_document_question(
    document_id: str,
    request: AskQuestionRequest,
    current_user: User = Depends(get_current_user)
):
    """Ask a question about a document using AI."""
    logger.info(f"[AGREEMENTS] Q&A for document: {document_id}, question: {request.question[:50]}...")
    
    role_name = get_user_role_name(current_user)
    
    try:
        # Get the document's parsed content
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            query = f"""
                SELECT parsed_content, parse_status
                FROM {DOCUMENTS_TABLE}
                WHERE id = '{document_id}' AND user_id = {current_user.id}
            """
            cursor.execute(query)
            row = cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")
            
            parsed_content, parse_status = row[0], row[1]
            
            if parse_status != "completed" or not parsed_content:
                raise HTTPException(
                    status_code=400,
                    detail="Document has not been parsed yet or parsing failed"
                )
        
        # Get answer using AI
        answer = extract_answer_with_ai(parsed_content, request.question, role_name)
        
        return AskQuestionResponse(
            question=request.question,
            answer=answer,
            document_id=document_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AGREEMENTS] Q&A failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a document from storage and database."""
    logger.info(f"[AGREEMENTS] Deleting document: {document_id}")
    
    role_name = get_user_role_name(current_user)
    
    try:
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            # Get stage path first
            cursor.execute(f"""
                SELECT stage_path FROM {DOCUMENTS_TABLE}
                WHERE id = '{document_id}' AND user_id = {current_user.id}
            """)
            row = cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")
            
            stage_path = row[0]
            
            # Delete from stage
            try:
                cursor.execute(f"REMOVE '@{DOCUMENTS_STAGE}/{stage_path}'")
                logger.debug(f"[AGREEMENTS] Removed from stage: {stage_path}")
            except Exception as e:
                logger.warning(f"[AGREEMENTS] Could not remove from stage: {e}")
            
            # Delete from table
            cursor.execute(f"""
                DELETE FROM {DOCUMENTS_TABLE}
                WHERE id = '{document_id}' AND user_id = {current_user.id}
            """)
            conn.commit()
            
            logger.info(f"[AGREEMENTS] Document deleted: {document_id}")
            return {"message": "Document deleted successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AGREEMENTS] Delete failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting document: {str(e)}")


@router.post("/documents/{document_id}/reparse")
async def reparse_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Re-parse a document that previously failed or needs updating."""
    logger.info(f"[AGREEMENTS] Reparse requested for: {document_id}")
    
    role_name = get_user_role_name(current_user)
    
    try:
        with snowflake_cursor(role_name=role_name) as (cursor, conn):
            # Get stage path
            cursor.execute(f"""
                SELECT stage_path FROM {DOCUMENTS_TABLE}
                WHERE id = '{document_id}' AND user_id = {current_user.id}
            """)
            row = cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")
            
            stage_path = row[0]
            
            # Update status
            cursor.execute(f"""
                UPDATE {DOCUMENTS_TABLE}
                SET parse_status = 'processing', parse_error = NULL
                WHERE id = '{document_id}'
            """)
            conn.commit()
        
        # Queue background parsing
        background_tasks.add_task(parse_document_background, document_id, stage_path, role_name)
        
        return {
            "id": document_id,
            "parse_status": "processing",
            "message": "Document queued for reparsing"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AGREEMENTS] Reparse failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error reparsing document: {str(e)}")
