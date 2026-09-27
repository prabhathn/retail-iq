/**
 * AutomationBuilder Component
 * 
 * A visual builder for creating automations using the condition/action framework.
 * Displays conditions and actions as readable logic statements that can be edited.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Trash2, ChevronDown, AlertCircle, Sparkles,
  Package, Users, Building, Megaphone, Tag, Cloud, Bell
} from 'lucide-react';
import { 
  AUTOMATION_OBJECTS, 
  OPERATORS, 
  getMetricsForObject, 
  getActionsForObject,
  getOperatorsForMetricType,
  generateId 
} from '../config/automationSchema';

// Icon mapping
const OBJECT_ICONS = {
  product: Package,
  shopper: Users,
  store: Building,
  campaign: Megaphone,
  promotion: Tag,
  context: Cloud,
  notification: Bell,
};

// ============== Condition Row Component ==============
function ConditionRow({ condition, index, onUpdate, onRemove, isOnly }) {
  const objectDef = AUTOMATION_OBJECTS[condition.object];
  const metrics = getMetricsForObject(condition.object);
  const metricDef = metrics[condition.metric];
  const applicableOperators = metricDef ? getOperatorsForMetricType(metricDef.type) : OPERATORS;
  
  const Icon = OBJECT_ICONS[condition.object] || Package;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-4 bg-slate-800/50 rounded-xl border border-white/10"
    >
      <div className="flex items-start gap-3">
        {/* Condition Number */}
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-400 text-sm font-medium">{index + 1}</span>
        </div>
        
        {/* Condition Content */}
        <div className="flex-1 space-y-3">
          {/* Object + Metric Row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
              <Icon className="w-4 h-4 text-slate-400" />
              <select
                value={condition.object}
                onChange={(e) => onUpdate(index, { 
                  ...condition, 
                  object: e.target.value, 
                  metric: Object.keys(getMetricsForObject(e.target.value))[0] || ''
                })}
                className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
              >
                {Object.entries(AUTOMATION_OBJECTS)
                  .filter(([_, obj]) => Object.keys(obj.metrics).length > 0)
                  .map(([key, obj]) => (
                    <option key={key} value={key} className="bg-slate-800">{obj.label}</option>
                  ))
                }
              </select>
            </div>
            
            <select
              value={condition.metric}
              onChange={(e) => onUpdate(index, { ...condition, metric: e.target.value })}
              className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-white text-sm focus:outline-none cursor-pointer"
            >
              {Object.entries(metrics).map(([key, metric]) => (
                <option key={key} value={key} className="bg-slate-800">{metric.label}</option>
              ))}
            </select>
            
            <select
              value={condition.operator}
              onChange={(e) => onUpdate(index, { ...condition, operator: e.target.value })}
              className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-white text-sm focus:outline-none cursor-pointer"
            >
              {Object.entries(applicableOperators).map(([key, op]) => (
                <option key={key} value={key} className="bg-slate-800">{op.label}</option>
              ))}
            </select>
            
            {/* Value Input */}
            {metricDef?.type === 'select' ? (
              <select
                value={condition.value || ''}
                onChange={(e) => onUpdate(index, { ...condition, value: e.target.value })}
                className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-white text-sm focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-800">Select...</option>
                {metricDef.options?.map((opt) => (
                  <option key={opt} value={opt} className="bg-slate-800">{opt}</option>
                ))}
              </select>
            ) : metricDef?.type === 'boolean' ? (
              <select
                value={condition.value?.toString() || 'true'}
                onChange={(e) => onUpdate(index, { ...condition, value: e.target.value === 'true' })}
                className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-white text-sm focus:outline-none cursor-pointer"
              >
                <option value="true" className="bg-slate-800">Yes</option>
                <option value="false" className="bg-slate-800">No</option>
              </select>
            ) : metricDef?.type === 'percentage' ? (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={condition.value || 50}
                  onChange={(e) => onUpdate(index, { 
                    ...condition, 
                    value: parseInt(e.target.value), 
                    value_type: 'percentage' 
                  })}
                  className="w-24 accent-blue-500"
                />
                <span className="text-white text-sm w-12">{condition.value || 50}%</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={condition.value || ''}
                  onChange={(e) => onUpdate(index, { ...condition, value: parseFloat(e.target.value) || 0 })}
                  placeholder="Value"
                  className="w-20 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50"
                />
                {metricDef?.unit && (
                  <span className="text-slate-400 text-sm">{metricDef.unit}</span>
                )}
              </div>
            )}
          </div>
          
          {/* Time Window (for metrics that support it) */}
          {metricDef?.supportsTimeWindow && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">over the last</span>
              <input
                type="number"
                value={condition.time_window_days || 30}
                onChange={(e) => onUpdate(index, { ...condition, time_window_days: parseInt(e.target.value) || 30 })}
                className="w-16 px-2 py-1 bg-white/5 rounded border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50"
              />
              <span className="text-slate-400">days</span>
            </div>
          )}
          
          {/* Reference Metric (for within_of operator) */}
          {condition.operator === 'within_of' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">compared to</span>
              <select
                value={condition.reference_metric || ''}
                onChange={(e) => onUpdate(index, { ...condition, reference_metric: e.target.value })}
                className="px-2 py-1 bg-white/5 rounded border border-white/10 text-white text-sm focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-800">Select metric...</option>
                {Object.entries(metrics)
                  .filter(([key]) => key !== condition.metric)
                  .map(([key, metric]) => (
                    <option key={key} value={key} className="bg-slate-800">{metric.label}</option>
                  ))
                }
              </select>
            </div>
          )}
        </div>
        
        {/* Remove Button */}
        {!isOnly && (
          <button
            onClick={() => onRemove(index)}
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ============== Action Row Component ==============
function ActionRow({ action, index, onUpdate, onRemove, isOnly }) {
  const objectDef = AUTOMATION_OBJECTS[action.object];
  const actions = getActionsForObject(action.object);
  const actionDef = actions[action.action];
  
  const Icon = OBJECT_ICONS[action.object] || Tag;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-4 bg-slate-800/50 rounded-xl border border-white/10"
    >
      <div className="flex items-start gap-3">
        {/* Action Number */}
        <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-green-400 text-sm font-medium">{index + 1}</span>
        </div>
        
        {/* Action Content */}
        <div className="flex-1 space-y-3">
          {/* Object + Action Row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
              <Icon className="w-4 h-4 text-slate-400" />
              <select
                value={action.object}
                onChange={(e) => {
                  const newActions = getActionsForObject(e.target.value);
                  onUpdate(index, { 
                    ...action, 
                    object: e.target.value, 
                    action: Object.keys(newActions)[0] || '',
                    parameters: {}
                  });
                }}
                className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
              >
                {Object.entries(AUTOMATION_OBJECTS)
                  .filter(([_, obj]) => Object.keys(obj.actions).length > 0)
                  .map(([key, obj]) => (
                    <option key={key} value={key} className="bg-slate-800">{obj.label}</option>
                  ))
                }
              </select>
            </div>
            
            <select
              value={action.action}
              onChange={(e) => onUpdate(index, { ...action, action: e.target.value, parameters: {} })}
              className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-white text-sm focus:outline-none cursor-pointer"
            >
              {Object.entries(actions).map(([key, act]) => (
                <option key={key} value={key} className="bg-slate-800">{act.label}</option>
              ))}
            </select>
          </div>
          
          {/* Action Parameters */}
          {actionDef?.params && actionDef.params.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pl-2 border-l-2 border-green-500/30">
              {actionDef.params.map((param) => (
                <div key={param.key} className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">{param.label}:</span>
                  
                  {param.type === 'select' ? (
                    <select
                      value={action.parameters?.[param.key] || ''}
                      onChange={(e) => onUpdate(index, { 
                        ...action, 
                        parameters: { ...action.parameters, [param.key]: e.target.value }
                      })}
                      className="px-2 py-1 bg-white/5 rounded border border-white/10 text-white text-sm focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-slate-800">Select...</option>
                      {param.options?.map((opt) => (
                        <option key={opt} value={opt} className="bg-slate-800">{opt}</option>
                      ))}
                    </select>
                  ) : param.type === 'boolean' ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={action.parameters?.[param.key] || false}
                        onChange={(e) => onUpdate(index, { 
                          ...action, 
                          parameters: { ...action.parameters, [param.key]: e.target.checked }
                        })}
                        className="rounded bg-white/10 border-white/20 text-green-500 focus:ring-green-500/50"
                      />
                      <span className="text-white text-sm">Yes</span>
                    </label>
                  ) : param.type === 'textarea' ? (
                    <textarea
                      value={action.parameters?.[param.key] || ''}
                      onChange={(e) => onUpdate(index, { 
                        ...action, 
                        parameters: { ...action.parameters, [param.key]: e.target.value }
                      })}
                      placeholder={param.label}
                      rows={2}
                      className="w-48 px-2 py-1 bg-white/5 rounded border border-white/10 text-white text-sm focus:outline-none focus:border-green-500/50 resize-none"
                    />
                  ) : param.type === 'number' ? (
                    <input
                      type="number"
                      value={action.parameters?.[param.key] || ''}
                      onChange={(e) => onUpdate(index, { 
                        ...action, 
                        parameters: { ...action.parameters, [param.key]: parseFloat(e.target.value) || 0 }
                      })}
                      min={param.min}
                      max={param.max}
                      className="w-20 px-2 py-1 bg-white/5 rounded border border-white/10 text-white text-sm focus:outline-none focus:border-green-500/50"
                    />
                  ) : (
                    <input
                      type="text"
                      value={action.parameters?.[param.key] || ''}
                      onChange={(e) => onUpdate(index, { 
                        ...action, 
                        parameters: { ...action.parameters, [param.key]: e.target.value }
                      })}
                      placeholder={param.label}
                      className="w-32 px-2 py-1 bg-white/5 rounded border border-white/10 text-white text-sm focus:outline-none focus:border-green-500/50"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Remove Button */}
        {!isOnly && (
          <button
            onClick={() => onRemove(index)}
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ============== Main AutomationBuilder Component ==============
export default function AutomationBuilder({ 
  automation, 
  onChange,
  errors = {}
}) {
  const { name, description, conditions, condition_logic, actions, scope } = automation;
  
  // Add a new condition
  const addCondition = () => {
    const newCondition = {
      id: generateId('cond'),
      object: 'product',
      metric: 'days_on_hand',
      operator: 'greater_than',
      value: 50,
      value_type: 'percentage',
    };
    onChange({ 
      ...automation, 
      conditions: [...conditions, newCondition] 
    });
  };
  
  // Update a condition
  const updateCondition = (index, updated) => {
    const newConditions = [...conditions];
    newConditions[index] = updated;
    onChange({ ...automation, conditions: newConditions });
  };
  
  // Remove a condition
  const removeCondition = (index) => {
    if (conditions.length > 1) {
      onChange({ 
        ...automation, 
        conditions: conditions.filter((_, i) => i !== index) 
      });
    }
  };
  
  // Add a new action
  const addAction = () => {
    const newAction = {
      id: generateId('act'),
      object: 'promotion',
      action: 'create',
      parameters: {},
    };
    onChange({ 
      ...automation, 
      actions: [...actions, newAction] 
    });
  };
  
  // Update an action
  const updateAction = (index, updated) => {
    const newActions = [...actions];
    newActions[index] = updated;
    onChange({ ...automation, actions: newActions });
  };
  
  // Remove an action
  const removeAction = (index) => {
    if (actions.length > 1) {
      onChange({ 
        ...automation, 
        actions: actions.filter((_, i) => i !== index) 
      });
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Name & Description */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Automation Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onChange({ ...automation, name: e.target.value })}
            placeholder="e.g., High Inventory Clearance"
            className={`w-full px-4 py-2.5 bg-white/5 border rounded-lg text-white placeholder-slate-500 focus:outline-none transition-colors ${
              errors.name ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-blue-500/50'
            }`}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-400">{errors.name}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Description
              <span className="text-xs text-slate-500 font-normal">(AI & human readable)</span>
            </div>
          </label>
          <textarea
            value={description}
            onChange={(e) => onChange({ ...automation, description: e.target.value })}
            placeholder="Describe what this automation does in plain English. This helps both humans understand the intent and enables AI agents to work with it..."
            rows={3}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            This description will be used by AI to understand and potentially generate the automation logic.
          </p>
        </div>
      </div>
      
      {/* Conditions Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">
            When (Conditions)
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Logic:</span>
            <select
              value={condition_logic}
              onChange={(e) => onChange({ ...automation, condition_logic: e.target.value })}
              className="px-2 py-1 bg-white/5 rounded border border-white/10 text-white text-xs focus:outline-none cursor-pointer"
            >
              <option value="AND" className="bg-slate-800">AND (all must match)</option>
              <option value="OR" className="bg-slate-800">OR (any must match)</option>
            </select>
          </div>
        </div>
        
        <AnimatePresence>
          {conditions.map((condition, index) => (
            <ConditionRow
              key={condition.id}
              condition={condition}
              index={index}
              onUpdate={updateCondition}
              onRemove={removeCondition}
              isOnly={conditions.length === 1}
            />
          ))}
        </AnimatePresence>
        
        <button
          onClick={addCondition}
          className="flex items-center gap-2 px-3 py-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Condition
        </button>
        
        {errors.conditions && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {errors.conditions}
          </div>
        )}
      </div>
      
      {/* Actions Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider">
          Then (Actions)
        </h3>
        
        <AnimatePresence>
          {actions.map((action, index) => (
            <ActionRow
              key={action.id}
              action={action}
              index={index}
              onUpdate={updateAction}
              onRemove={removeAction}
              isOnly={actions.length === 1}
            />
          ))}
        </AnimatePresence>
        
        <button
          onClick={addAction}
          className="flex items-center gap-2 px-3 py-2 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Action
        </button>
        
        {errors.actions && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {errors.actions}
          </div>
        )}
      </div>
    </div>
  );
}
