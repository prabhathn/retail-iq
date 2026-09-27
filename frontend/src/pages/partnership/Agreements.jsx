import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Upload, Loader2, Search, Eye, Trash2, X, 
  MessageSquare, Send, RefreshCw, FileQuestion, CheckCircle,
  AlertCircle, File, ChevronLeft, Clock, HelpCircle, FileType, Type
} from 'lucide-react';
import api, { API_BASE_URL, extractErrorMessage } from '../../services/api';
import { trackPageView } from '../../services/tracking';

// Document type options
const DOCUMENT_TYPES = [
  { value: 'agreement', label: 'Agreement' },
  { value: 'contract', label: 'Contract' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'sow', label: 'Statement of Work' },
  { value: 'nda', label: 'NDA' },
  { value: 'other', label: 'Other' },
];

// Parse status styles
const STATUS_STYLES = {
  pending: { bg: 'bg-amber-500/20', text: 'text-amber-300', icon: Clock },
  processing: { bg: 'bg-blue-500/20', text: 'text-blue-300', icon: Loader2 },
  completed: { bg: 'bg-green-500/20', text: 'text-green-300', icon: CheckCircle },
  error: { bg: 'bg-red-500/20', text: 'text-red-300', icon: AlertCircle },
};

export default function Agreements() {
  // View state
  const [view, setView] = useState('list'); // 'list' | 'upload' | 'viewer'
  const [selectedDocument, setSelectedDocument] = useState(null);
  
  // Documents list
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadType, setUploadType] = useState('agreement');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  
  // Q&A state
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState([]);
  
  // Document viewer state
  const [contentView, setContentView] = useState('pdf'); // 'pdf' | 'text'
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Load documents on mount
  useEffect(() => {
    trackPageView('/partnership/agreements', 'Agreements');
    loadDocuments();
  }, []);

  // Poll for status updates when documents are processing
  useEffect(() => {
    const hasProcessing = documents.some(doc => doc.parse_status === 'processing');
    
    if (hasProcessing) {
      const interval = setInterval(() => {
        console.log('[AGREEMENTS] Polling for processing documents...');
        loadDocuments();
      }, 3000); // Poll every 3 seconds
      
      return () => clearInterval(interval);
    }
  }, [documents]);

  // Poll for selected document updates when it's processing
  useEffect(() => {
    if (selectedDocument?.parse_status === 'processing') {
      const interval = setInterval(async () => {
        console.log('[AGREEMENTS] Polling for selected document status...');
        try {
          const response = await api.get(`/agreements/documents/${selectedDocument.id}`);
          setSelectedDocument(response.data.document);
        } catch (error) {
          console.error('Failed to refresh document:', error);
        }
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [selectedDocument?.id, selectedDocument?.parse_status]);

  // Fetch and cache PDF blob when document is selected
  useEffect(() => {
    if (!selectedDocument?.id) {
      setPdfBlobUrl(null);
      return;
    }

    const fetchPdf = async () => {
      setPdfLoading(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `${API_BASE_URL}/agreements/documents/${selectedDocument.id}/download`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setPdfBlobUrl(url);
        } else {
          console.error('Failed to fetch PDF:', response.status);
        }
      } catch (error) {
        console.error('Failed to fetch PDF:', error);
      } finally {
        setPdfLoading(false);
      }
    };

    fetchPdf();

    // Cleanup blob URL when document changes or component unmounts
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [selectedDocument?.id]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/agreements/documents');
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFile(file);
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    
    try {
      setUploading(true);
      setUploadError(null);
      
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('document_type', uploadType);
      formData.append('description', uploadDescription);
      
      await api.post('/agreements/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Reset form and refresh list
      setUploadFile(null);
      setUploadType('agreement');
      setUploadDescription('');
      setView('list');
      loadDocuments();
      
    } catch (error) {
      setUploadError(extractErrorMessage(error, 'Failed to upload document'));
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (doc) => {
    try {
      // Reset PDF cache for new document
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
        setPdfBlobUrl(null);
      }
      
      const response = await api.get(`/agreements/documents/${doc.id}`);
      setSelectedDocument(response.data.document);
      setQaHistory([]);
      setQuestion('');
      setContentView('pdf'); // Reset to PDF view
      setView('viewer');
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      await api.delete(`/agreements/documents/${docId}`);
      loadDocuments();
      if (selectedDocument?.id === docId) {
        setView('list');
        setSelectedDocument(null);
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const handleAskQuestion = async () => {
    if (!question.trim() || !selectedDocument) return;
    
    const currentQuestion = question;
    setQuestion('');
    setAsking(true);
    
    // Add question to history immediately
    setQaHistory(prev => [...prev, { type: 'question', text: currentQuestion }]);
    
    try {
      const response = await api.post(`/agreements/documents/${selectedDocument.id}/ask`, {
        question: currentQuestion
      });
      
      // Add answer to history
      setQaHistory(prev => [...prev, { type: 'answer', text: response.data.answer }]);
      
    } catch (error) {
      setQaHistory(prev => [...prev, { 
        type: 'error', 
        text: extractErrorMessage(error, 'Failed to get answer') 
      }]);
    } finally {
      setAsking(false);
    }
  };

  const handleReparse = async (docId) => {
    try {
      await api.post(`/agreements/documents/${docId}/reparse`);
      loadDocuments();
      if (selectedDocument?.id === docId) {
        const response = await api.get(`/agreements/documents/${docId}`);
        setSelectedDocument(response.data.document);
      }
    } catch (error) {
      console.error('Failed to reparse document:', error);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // Filter documents by search
  const filteredDocuments = documents.filter(doc => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      doc.file_name?.toLowerCase().includes(query) ||
      doc.document_type?.toLowerCase().includes(query) ||
      doc.description?.toLowerCase().includes(query)
    );
  });

  // ============== UPLOAD VIEW ==============
  if (view === 'upload') {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setView('list')}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Upload Document</h1>
            <p className="text-slate-400 text-sm">Upload an agreement document for AI analysis</p>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-6">
          {/* File Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              uploadFile 
                ? 'border-emerald-500/50 bg-emerald-500/10' 
                : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.pptx,.ppt"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploadFile ? (
              <div className="flex flex-col items-center gap-3">
                <File className="w-12 h-12 text-emerald-400" />
                <div>
                  <p className="text-white font-medium">{uploadFile.name}</p>
                  <p className="text-slate-400 text-sm">{formatFileSize(uploadFile.size)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploadFile(null);
                  }}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-12 h-12 text-slate-500" />
                <div>
                  <p className="text-white font-medium">Click to select a file</p>
                  <p className="text-slate-400 text-sm">PDF, DOCX, TXT, PPTX (max 10MB)</p>
                </div>
              </div>
            )}
          </div>

          {/* Document Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Document Type</label>
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {DOCUMENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Description (optional)</label>
            <textarea
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="Brief description of this document..."
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Error */}
          {uploadError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-300">{uploadError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/50">
            <button
              onClick={() => setView('list')}
              className="px-4 py-2 text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!uploadFile || uploading}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading & Parsing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Document
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============== DOCUMENT VIEWER ==============
  if (view === 'viewer' && selectedDocument) {
    const statusStyle = STATUS_STYLES[selectedDocument.parse_status] || STATUS_STYLES.pending;
    const StatusIcon = statusStyle.icon;
    
    return (
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('list')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                {selectedDocument.file_name}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={`px-2 py-0.5 rounded text-xs ${statusStyle.bg} ${statusStyle.text}`}>
                  {selectedDocument.parse_status}
                </span>
                {selectedDocument.page_count && (
                  <span className="text-slate-400 text-sm">{selectedDocument.page_count} pages</span>
                )}
                <span className="text-slate-500 text-sm">
                  Uploaded {formatDate(selectedDocument.created_at)}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {selectedDocument.parse_status === 'error' && (
              <button
                onClick={() => handleReparse(selectedDocument.id)}
                className="flex items-center gap-2 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-lg text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Parse
              </button>
            )}
            <button
              onClick={() => handleDeleteDocument(selectedDocument.id)}
              className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded-lg text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Document Content - PDF or Text View */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-900/30 flex items-center justify-between">
              <h2 className="font-medium text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Document Content
              </h2>
              {/* View Toggle */}
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setContentView('pdf')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    contentView === 'pdf' 
                      ? 'bg-emerald-600 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileType className="w-3.5 h-3.5" />
                  Original
                </button>
                <button
                  onClick={() => setContentView('text')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    contentView === 'text' 
                      ? 'bg-emerald-600 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  Extracted
                </button>
              </div>
            </div>
            <div className="h-[600px] overflow-hidden">
              {contentView === 'pdf' ? (
                // PDF Viewer
                pdfLoading ? (
                  <div className="flex items-center justify-center h-full bg-slate-900">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">Loading document...</p>
                    </div>
                  </div>
                ) : pdfBlobUrl ? (
                  <iframe
                    src={pdfBlobUrl}
                    className="w-full h-full border-0 bg-slate-900"
                    title={selectedDocument.file_name}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-slate-900">
                    <div className="text-center">
                      <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">Could not load document preview</p>
                    </div>
                  </div>
                )
              ) : (
                // Extracted Text View
                <div className="p-4 h-full overflow-y-auto">
                  {selectedDocument.parse_status === 'completed' && selectedDocument.parsed_content ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-slate-300 text-sm font-sans leading-relaxed">
                        {selectedDocument.parsed_content}
                      </pre>
                    </div>
                  ) : selectedDocument.parse_status === 'error' ? (
                    <div className="text-center py-12">
                      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                      <p className="text-red-300 font-medium">Parsing Failed</p>
                      <p className="text-slate-400 text-sm mt-1">{selectedDocument.parse_error}</p>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Loader2 className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
                      <p className="text-slate-300">Parsing document...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Ask a Question */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-900/30">
              <h2 className="font-medium text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-violet-400" />
                Ask a Question
              </h2>
            </div>
            
            {/* Q&A History */}
            <div className="flex-1 p-4 max-h-[450px] overflow-y-auto space-y-4">
              {qaHistory.length === 0 ? (
                <div className="text-center py-12">
                  <HelpCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Ask a question about this document</p>
                  <p className="text-slate-500 text-sm mt-1">
                    AI will analyze the content and provide an answer
                  </p>
                </div>
              ) : (
                qaHistory.map((item, idx) => (
                  <div key={idx} className={`flex ${item.type === 'question' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-2.5 rounded-xl ${
                      item.type === 'question' 
                        ? 'bg-violet-600/30 text-violet-100' 
                        : item.type === 'error'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-slate-700/50 text-slate-200'
                    }`}>
                      {item.type === 'question' && (
                        <div className="text-xs text-violet-300 mb-1">You asked:</div>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{item.text}</p>
                    </div>
                  </div>
                ))
              )}
              {asking && (
                <div className="flex justify-start">
                  <div className="bg-slate-700/50 px-4 py-3 rounded-xl flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                    <span className="text-slate-300 text-sm">Analyzing document...</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Question Input */}
            <div className="p-4 border-t border-slate-700/50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAskQuestion()}
                  placeholder="Ask a question about this document..."
                  disabled={selectedDocument.parse_status !== 'completed' || asking}
                  className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
                />
                <button
                  onClick={handleAskQuestion}
                  disabled={!question.trim() || selectedDocument.parse_status !== 'completed' || asking}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-slate-500"></span>
                This implementation uses Cortex COMPLETE, not a full Cortex Agent
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============== LIST VIEW ==============
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-emerald-400" />
            Agreements
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload and analyze partnership agreements with AI
          </p>
        </div>
        <button
          onClick={() => setView('upload')}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* Search */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Documents</h3>
            <p className="text-slate-400 max-w-md mx-auto">
              {documents.length === 0 
                ? "Upload your first agreement document to get started with AI-powered analysis."
                : "No documents match your search criteria."}
            </p>
            {documents.length === 0 && (
              <button
                onClick={() => setView('upload')}
                className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium mx-auto"
              >
                <Upload className="w-4 h-4" />
                Upload Document
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {filteredDocuments.map((doc) => {
              const statusStyle = STATUS_STYLES[doc.parse_status] || STATUS_STYLES.pending;
              const StatusIcon = statusStyle.icon;
              
              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between px-4 py-4 hover:bg-slate-700/20"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`p-2.5 rounded-lg ${statusStyle.bg}`}>
                      <StatusIcon className={`w-5 h-5 ${statusStyle.text} ${doc.parse_status === 'processing' ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{doc.file_name}</p>
                      <div className="flex items-center gap-3 mt-1 text-sm">
                        <span className="text-slate-400 capitalize">{doc.document_type}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500">{formatFileSize(doc.file_size_bytes)}</span>
                        {doc.page_count && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-500">{doc.page_count} pages</span>
                          </>
                        )}
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500">{formatDate(doc.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewDocument(doc)}
                      className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"
                      title="View Document"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-2 rounded-lg hover:bg-red-600/20 text-slate-400 hover:text-red-300"
                      title="Delete Document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

