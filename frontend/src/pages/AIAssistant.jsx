import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, Send, Loader2, Bot, User, Sparkles, 
  AlertCircle, Info, RefreshCw, Trash2, Brain, ChevronDown, ChevronRight,
  BarChart3, Table2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import api, { API_BASE_URL } from '../services/api';
import { trackPageView } from '../services/tracking';

// Chart colors
const CHART_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

// Simple markdown-like formatter (no external dependencies)
function formatMessage(text) {
  if (!text) return null;
  
  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/);
  
  return paragraphs.map((para, i) => {
    const lines = para.split('\n');
    
    // Check if paragraph contains bullet list (lines starting with - or *)
    const bulletLines = lines.filter(line => /^\s*[-*]\s+/.test(line));
    
    if (bulletLines.length > 0) {
      // Mixed content: header lines + bullets
      const headerLines = lines.filter(line => !/^\s*[-*]\s+/.test(line) && line.trim());
      const header = headerLines.join(' ').trim();
      
      return (
        <div key={i} className="mb-2">
          {header && <p className="mb-1">{formatInline(header)}</p>}
          <ul className="list-disc pl-4">
            {bulletLines.map((item, j) => (
              <li key={j} className="mb-1">{formatInline(item.replace(/^\s*[-*]\s+/, ''))}</li>
            ))}
          </ul>
        </div>
      );
    }
    
    // Handle numbered lists (1. 2. 3.)
    const numberedLines = lines.filter(line => /^\s*\d+\.\s+/.test(line));
    if (numberedLines.length > 0) {
      const headerLines = lines.filter(line => !/^\s*\d+\.\s+/.test(line) && line.trim());
      const header = headerLines.join(' ').trim();
      
      return (
        <div key={i} className="mb-2">
          {header && <p className="mb-1">{formatInline(header)}</p>}
          <ol className="list-decimal pl-4">
            {numberedLines.map((item, j) => (
              <li key={j} className="mb-1">{formatInline(item.replace(/^\s*\d+\.\s+/, ''))}</li>
            ))}
          </ol>
        </div>
      );
    }
    
    // Handle horizontal rules
    if (para.trim() === '---' || para.trim() === '***') {
      return <hr key={i} className="border-slate-600 my-3" />;
    }
    
    // Regular paragraph - join lines with spaces for soft wraps
    const joinedText = lines.map(l => l.trim()).filter(l => l).join(' ');
    return <p key={i} className="mb-2 last:mb-0">{formatInline(joinedText)}</p>;
  });
}

// Chart rendering component
function AgentChart({ chartData }) {
  if (!chartData) return null;
  
  // Wrap in try-catch to prevent crashes
  try {
    // Log chart data for debugging
    console.log('[AgentChart] Raw chart data:', JSON.stringify(chartData, null, 2));
  
  // Parse chart data from Cortex Agent format
  let processedData = [];
  let chartTitle = '';
  let chartType = 'bar';
  let xField = '';
  let yField = '';
  
  // Handle Cortex Agent's chart_spec format (Vega-lite spec as JSON string)
  let colorField = ''; // For multi-series grouping
  
  if (chartData.chart_spec) {
    try {
      const spec = typeof chartData.chart_spec === 'string' 
        ? JSON.parse(chartData.chart_spec) 
        : chartData.chart_spec;
      
      console.log('[AgentChart] Parsed Vega-lite spec:', spec);
      
      chartTitle = spec.title || '';
      chartType = spec.mark || 'bar';
      
      // Extract field names from encoding
      if (spec.encoding) {
        // For horizontal bar charts, x is the value and y is the category
        if (spec.encoding.x?.type === 'quantitative' && spec.encoding.y?.type !== 'quantitative') {
          xField = spec.encoding.y?.field || '';  // Category on Y axis
          yField = spec.encoding.x?.field || '';  // Value on X axis
        } else {
          xField = spec.encoding.x?.field || '';
          yField = spec.encoding.y?.field || '';
        }
        
        // Check for color/group encoding (multi-series)
        if (spec.encoding.color?.field) {
          colorField = spec.encoding.color.field;
        }
      }
      
      // Extract data values
      if (spec.data?.values) {
        processedData = spec.data.values;
      }
    } catch (e) {
      console.error('[AgentChart] Failed to parse chart_spec:', e);
    }
  }
  // Handle other formats
  else if (Array.isArray(chartData.data)) {
    processedData = chartData.data;
    chartTitle = chartData.title || '';
    xField = chartData.x_axis || '';
    yField = chartData.y_axis || '';
  } else if (chartData.columns && chartData.rows) {
    const cols = chartData.columns;
    processedData = chartData.rows.map(row => {
      const obj = {};
      cols.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  } else if (chartData.result_set) {
    const { column_names, rows } = chartData.result_set;
    processedData = rows?.map(row => {
      const obj = {};
      column_names?.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    }) || [];
  }
  
  console.log('[AgentChart] Processed data:', processedData, 'xField:', xField, 'yField:', yField);
  
  if (processedData.length === 0) {
    return (
      <div className="p-3 bg-slate-800/50 rounded-lg text-xs text-slate-400">
        <BarChart3 className="w-4 h-4 inline mr-2" />
        Chart data received but couldn't be parsed
        <details className="mt-2">
          <summary className="cursor-pointer text-violet-400">Show raw data</summary>
          <pre className="mt-2 p-2 bg-slate-900 rounded overflow-x-auto text-[10px] max-h-40 overflow-y-auto">
            {JSON.stringify(chartData, null, 2)}
          </pre>
        </details>
      </div>
    );
  }
  
  // Use extracted fields or auto-detect from data
  const keys = Object.keys(processedData[0] || {});
  const categoryField = xField || keys.find(k => typeof processedData[0][k] === 'string') || keys[0];
  const valueField = yField || keys.find(k => typeof processedData[0][k] === 'number') || keys[1];
  
  // Get unique series for multi-series charts
  const seriesValues = colorField 
    ? [...new Set(processedData.map(d => d[colorField]))]
    : [];
  
  // For multi-series line charts, pivot data: {date: x, Series1: val1, Series2: val2, ...}
  let pivotedData = processedData;
  if (colorField && seriesValues.length > 1 && chartType === 'line') {
    const grouped = {};
    processedData.forEach(d => {
      const xVal = d[categoryField];
      if (!grouped[xVal]) {
        grouped[xVal] = { [categoryField]: xVal };
      }
      grouped[xVal][d[colorField]] = d[valueField];
    });
    pivotedData = Object.values(grouped).sort((a, b) => 
      new Date(a[categoryField]) - new Date(b[categoryField])
    );
    console.log('[AgentChart] Pivoted data for multi-series:', pivotedData);
  }
  
  // Format currency values
  const formatValue = (value) => {
    if (typeof value === 'number') {
      return value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value.toFixed(2)}`;
    }
    return value;
  };
  
  // Format date for display
  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };
  
  return (
    <div className="mt-3 p-4 bg-slate-900/50 rounded-lg">
      {chartTitle && (
        <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-violet-400" />
          {chartTitle}
        </h4>
      )}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'pie' ? (
            <PieChart>
              <Pie
                data={processedData}
                dataKey={valueField}
                nameKey={categoryField}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, value }) => `${name}: ${formatValue(value)}`}
              >
                {processedData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(value) => formatValue(value)}
              />
              <Legend />
            </PieChart>
          ) : chartType === 'line' ? (
            <LineChart data={seriesValues.length > 1 ? pivotedData : processedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey={categoryField} 
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={{ stroke: '#475569' }}
                tickFormatter={formatDate}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={{ stroke: '#475569' }}
                tickFormatter={formatValue}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(value) => formatValue(value)}
                labelFormatter={formatDate}
              />
              <Legend />
              {seriesValues.length > 1 ? (
                // Multi-series: one line per series
                seriesValues.map((series, idx) => (
                  <Line 
                    key={series}
                    type="monotone" 
                    dataKey={series}
                    name={series}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ fill: CHART_COLORS[idx % CHART_COLORS.length], r: 3 }}
                  />
                ))
              ) : (
                // Single series
                <Line 
                  type="monotone" 
                  dataKey={valueField} 
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  dot={{ fill: CHART_COLORS[0] }}
                />
              )}
            </LineChart>
          ) : (
            <BarChart data={processedData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} />
              <XAxis 
                type="number"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={{ stroke: '#475569' }}
                tickFormatter={formatValue}
              />
              <YAxis 
                type="category"
                dataKey={categoryField}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={{ stroke: '#475569' }}
                width={100}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(value) => formatValue(value)}
              />
              <Bar 
                dataKey={valueField} 
                fill={CHART_COLORS[0]}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      
      {/* Debug: Always show raw data while troubleshooting */}
      <details className="mt-3 border-t border-slate-700 pt-3">
        <summary className="cursor-pointer text-xs text-violet-400 hover:text-violet-300">
          🔍 Debug: Show raw chart data
        </summary>
        <div className="mt-2 space-y-2">
          <div className="text-xs text-slate-500">
            <strong>Detected fields:</strong> category="{categoryField}", value="{valueField}"
          </div>
          <div className="text-xs text-slate-500">
            <strong>Chart type:</strong> {chartType}
          </div>
          <div className="text-xs text-slate-500">
            <strong>Data rows:</strong> {processedData.length}
          </div>
          <pre className="p-2 bg-slate-900 rounded overflow-x-auto text-[10px] max-h-60 overflow-y-auto text-slate-400">
{JSON.stringify({ 
  rawChartData: chartData,
  processedData: processedData 
}, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
  } catch (error) {
    console.error('[AgentChart] Render error:', error);
    return (
      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300">
        Chart rendering error: {error.message}
        <details className="mt-2">
          <summary className="cursor-pointer">Show raw data</summary>
          <pre className="mt-2 p-2 bg-slate-900 rounded overflow-x-auto text-[10px]">
            {JSON.stringify(chartData, null, 2)}
          </pre>
        </details>
      </div>
    );
  }
}

// Table rendering component
function AgentTable({ tableData }) {
  if (!tableData) return null;
  
  let columns = [];
  let rows = [];
  
  if (tableData.columns && tableData.rows) {
    columns = tableData.columns;
    rows = tableData.rows;
  } else if (tableData.result_set) {
    columns = tableData.result_set.column_names || [];
    rows = tableData.result_set.rows || [];
  }
  
  if (columns.length === 0) return null;
  
  return (
    <div className="mt-3 overflow-x-auto">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <Table2 className="w-3.5 h-3.5" />
        <span>Query Results ({rows.length} rows)</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            {columns.map((col, i) => (
              <th key={i} className="px-3 py-2 text-left text-slate-400 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row, i) => (
            <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
              {(Array.isArray(row) ? row : columns.map(c => row[c])).map((cell, j) => (
                <td key={j} className="px-3 py-2 text-slate-300">
                  {typeof cell === 'number' ? cell.toLocaleString() : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 10 && (
        <div className="text-xs text-slate-500 mt-2 text-center">
          Showing 10 of {rows.length} rows
        </div>
      )}
    </div>
  );
}

// Collapsible Thinking Bubble component
function ThinkingBubble({ thinking, isExpanded, onToggle, isStreaming }) {
  if (!thinking) return null;
  
  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
      >
        {isStreaming && isExpanded ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Brain className="w-3.5 h-3.5" />
        )}
        <span>Agent Reasoning</span>
        {isStreaming && isExpanded && (
          <span className="text-violet-300/60">thinking...</span>
        )}
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg text-xs text-slate-400 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
              {thinking}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3.5 bg-violet-400 ml-0.5 animate-pulse" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Format inline elements (bold, code)
function formatInline(text) {
  if (!text) return null;
  
  // Split by bold markers and code
  const parts = [];
  let remaining = text;
  let key = 0;
  
  while (remaining) {
    // Check for bold (**text**)
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Check for code (`text`)
    const codeMatch = remaining.match(/`([^`]+)`/);
    
    // Find the earliest match
    let match = null;
    let type = null;
    
    if (boldMatch && (!codeMatch || boldMatch.index < codeMatch.index)) {
      match = boldMatch;
      type = 'bold';
    } else if (codeMatch) {
      match = codeMatch;
      type = 'code';
    }
    
    if (match) {
      // Add text before match
      if (match.index > 0) {
        parts.push(remaining.substring(0, match.index));
      }
      
      // Add formatted text
      if (type === 'bold') {
        parts.push(<strong key={key++} className="font-semibold text-white">{match[1]}</strong>);
      } else {
        parts.push(
          <code key={key++} className="bg-slate-900/50 px-1 py-0.5 rounded text-violet-300 text-xs">
            {match[1]}
          </code>
        );
      }
      
      remaining = remaining.substring(match.index + match[0].length);
    } else {
      parts.push(remaining);
      break;
    }
  }
  
  return parts.length > 0 ? parts : text;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [error, setError] = useState(null);
  const [expandedThinking, setExpandedThinking] = useState({}); // Track which messages have expanded thinking
  const [streamingMessageId, setStreamingMessageId] = useState(null); // Track currently streaming message
  const [currentStatus, setCurrentStatus] = useState(null); // Track agent status during streaming
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Toggle thinking expansion for a message
  const toggleThinking = (messageId) => {
    setExpandedThinking(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  // Track page view and fetch agent status on mount
  useEffect(() => {
    trackPageView('/ai-assistant', 'AI Assistant');
    fetchAgentStatus();
    
    // Add welcome message
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `👋 **Welcome to the AI Assistant!**

I'm connected to your retail analytics data through Snowflake's Cortex Agent. I can help you:

- **Analyze sales trends** - "What were our top selling products last month?"
- **Understand shopper behavior** - "Which categories have the highest basket size?"
- **Compare performance** - "How does Store A compare to Store B?"
- **Get product insights** - "Show me the price distribution for dairy products"

Your data access is automatically filtered based on your permissions. Just ask me anything!`,
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchAgentStatus = async () => {
    try {
      const response = await api.get('/cortex-agent/status');
      setAgentStatus(response.data);
    } catch (err) {
      console.error('Failed to fetch agent status:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);
    setCurrentStatus(null);

    const messageId = (Date.now() + 1).toString();
    setStreamingMessageId(messageId);

    // Create placeholder assistant message for streaming
    const assistantMessage = {
      id: messageId,
      role: 'assistant',
      content: '',
      thinking: '',
      charts: [],
      tables: [],
      timestamp: new Date().toISOString(),
      isStreaming: true
    };
    setMessages(prev => [...prev, assistantMessage]);
    
    // Start with thinking expanded
    setExpandedThinking(prev => ({ ...prev, [messageId]: true }));

    try {
      // Build message history for context
      const messageHistory = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));
      messageHistory.push({ role: 'user', content: userMessage.content });

      // Use streaming endpoint with fetch
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/cortex-agent/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ messages: messageHistory })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let hasReceivedText = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'thinking') {
                // Append thinking text
                setMessages(prev => prev.map(m => 
                  m.id === messageId 
                    ? { ...m, thinking: (m.thinking || '') + data.content }
                    : m
                ));
              } else if (data.type === 'text') {
                // Collapse thinking when first text arrives
                if (!hasReceivedText) {
                  hasReceivedText = true;
                  setExpandedThinking(prev => ({ ...prev, [messageId]: false }));
                }
                // Append response text
                setMessages(prev => prev.map(m => 
                  m.id === messageId 
                    ? { ...m, content: (m.content || '') + data.content }
                    : m
                ));
              } else if (data.type === 'status') {
                setCurrentStatus(data.content);
              } else if (data.type === 'chart') {
                // Add chart to message
                setMessages(prev => prev.map(m => 
                  m.id === messageId 
                    ? { ...m, charts: [...(m.charts || []), data.content] }
                    : m
                ));
              } else if (data.type === 'table') {
                // Add table to message
                setMessages(prev => prev.map(m => 
                  m.id === messageId 
                    ? { ...m, tables: [...(m.tables || []), data.content] }
                    : m
                ));
              } else if (data.type === 'error') {
                setMessages(prev => prev.map(m => 
                  m.id === messageId 
                    ? { ...m, content: `❌ **Error:** ${data.content}`, isError: true }
                    : m
                ));
              } else if (data.type === 'done') {
                // Mark streaming as complete
                setMessages(prev => prev.map(m => 
                  m.id === messageId 
                    ? { ...m, isStreaming: false }
                    : m
                ));
              }
            } catch (parseErr) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err.message || 'Failed to get response from AI assistant');
      
      // Update the message with error
      setMessages(prev => prev.map(m => 
        m.id === messageId 
          ? { ...m, content: `❌ **Error:** ${err.message || 'Failed to get response. Please try again.'}`, isError: true, isStreaming: false }
          : m
      ));
    } finally {
      setLoading(false);
      setStreamingMessageId(null);
      setCurrentStatus(null);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `👋 **Chat cleared!** How can I help you with your retail analytics?`,
      timestamp: new Date().toISOString()
    }]);
    setError(null);
  };

  const suggestedQuestions = [
    "What are our top 5 selling products?",
    "Show me sales trends for the last 30 days",
    "Which store has the highest revenue?",
    "What's the average basket size by category?"
  ];

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-violet-500/20 to-purple-500/20 rounded-xl">
            <Sparkles className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              AI Assistant
              <span className="text-xs px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-full">
                Beta
              </span>
            </h1>
            <p className="text-slate-400 text-sm">
              Powered by Snowflake Cortex Agent
              {agentStatus?.user_role && (
                <span className="ml-2 text-violet-400">
                  • Role: {agentStatus.user_role}
                </span>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAgentStatus}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={clearChat}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {agentStatus?.status === 'not_configured' && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200">
            <strong>Configuration Required:</strong> Snowflake credentials (PAT) are not configured. 
            Please set SNOWFLAKE_ACCOUNT and SNOWFLAKE_PASSWORD in your environment.
          </div>
        </div>
      )}
      
      {agentStatus?.status === 'configured' && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-3 flex-shrink-0">
          <Info className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-200">
            <strong>Connected to Snowflake</strong> using PAT authentication.
            Database: {agentStatus.database}.{agentStatus.schema}
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 min-h-0">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  message.isError 
                    ? 'bg-red-500/20' 
                    : 'bg-gradient-to-br from-violet-500/20 to-purple-500/20'
                }`}>
                  <Bot className={`w-4 h-4 ${message.isError ? 'text-red-400' : 'text-violet-400'}`} />
                </div>
              )}
              
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-violet-500/20 text-white'
                  : message.isError
                    ? 'bg-red-500/10 border border-red-500/20 text-red-200'
                    : 'bg-slate-800/50 border border-slate-700/50 text-slate-200'
              }`}>
                {/* Thinking Bubble - only for assistant messages with thinking */}
                {message.role === 'assistant' && message.thinking && (
                  <ThinkingBubble
                    thinking={message.thinking}
                    isExpanded={expandedThinking[message.id] || false}
                    onToggle={() => toggleThinking(message.id)}
                    isStreaming={message.isStreaming && !message.content}
                  />
                )}
                
                <div className="text-sm leading-relaxed">
                  {formatMessage(message.content)}
                  {message.isStreaming && message.content && (
                    <span className="inline-block w-1.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />
                  )}
                </div>
                
                {/* Charts display */}
                {message.charts && message.charts.length > 0 && (
                  message.charts.map((chart, i) => (
                    <AgentChart key={i} chartData={chart} />
                  ))
                )}
                
                {/* Tables display */}
                {message.tables && message.tables.length > 0 && (
                  message.tables.map((table, i) => (
                    <AgentTable key={i} tableData={table} />
                  ))
                )}
                
                {/* SQL Query display if available */}
                {message.sqlQuery && (
                  <div className="mt-3 p-2 bg-slate-900/50 rounded-lg">
                    <div className="text-xs text-slate-500 mb-1">Generated SQL:</div>
                    <code className="text-xs text-violet-300 break-all">
                      {message.sqlQuery}
                    </code>
                  </div>
                )}
                
                <div className="text-xs text-slate-500 mt-2">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
              
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-cyan-400" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* Loading indicator - show status when streaming but no message content yet */}
        {loading && streamingMessageId && currentStatus && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-xs text-violet-400 ml-11 -mt-2 mb-2"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{currentStatus}</span>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions (show when no user messages) */}
      {messages.length <= 1 && !loading && (
        <div className="mb-4 flex-shrink-0">
          <p className="text-xs text-slate-500 mb-2">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question, i) => (
              <button
                key={i}
                onClick={() => setInput(question)}
                className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-full text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-3 flex-shrink-0">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your retail analytics..."
            disabled={loading}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl flex items-center gap-2 transition-all"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </form>
    </div>
  );
}

