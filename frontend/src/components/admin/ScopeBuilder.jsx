import { useState } from 'react';
import { Shield, Plus, Trash2, X, Loader2 } from 'lucide-react';

/**
 * Component for building custom data access scopes with entitlements.
 */
export default function ScopeBuilder({ 
  scopeOptions, 
  onSave, 
  onCancel, 
  saving = false 
}) {
  const [customScope, setCustomScope] = useState({
    name: '',
    description: '',
    is_admin: false,
    entitlements: [{ tenant_type: 'category', tenant_id: '' }]
  });

  const addEntitlement = () => {
    setCustomScope({
      ...customScope,
      entitlements: [...customScope.entitlements, { tenant_type: 'category', tenant_id: '' }]
    });
  };

  const removeEntitlement = (index) => {
    if (customScope.entitlements.length > 1) {
      setCustomScope({
        ...customScope,
        entitlements: customScope.entitlements.filter((_, i) => i !== index)
      });
    }
  };

  const updateEntitlement = (index, field, value) => {
    const newEntitlements = [...customScope.entitlements];
    newEntitlements[index][field] = value;
    // Clear tenant_id if switching to 'all'
    if (field === 'tenant_type' && value === 'all') {
      newEntitlements[index].tenant_id = null;
    }
    setCustomScope({ ...customScope, entitlements: newEntitlements });
  };

  const handleSave = () => {
    onSave(customScope);
  };

  return (
    <div className="space-y-4 bg-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">Create Custom Scope</h4>
        <button onClick={onCancel} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <input
        type="text"
        value={customScope.name}
        onChange={(e) => setCustomScope({ ...customScope, name: e.target.value })}
        placeholder="Scope name..."
        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
      />
      
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Access Rules:</p>
        {customScope.entitlements.map((ent, index) => (
          <div key={index} className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg">
            {index > 0 && (
              <span className="text-xs text-amber-300 font-medium">OR</span>
            )}
            <span className="text-xs text-slate-300">Can access</span>
            <select
              value={ent.tenant_type}
              onChange={(e) => updateEntitlement(index, 'tenant_type', e.target.value)}
              className="bg-slate-700 border border-white/10 rounded px-2 py-1 text-pink-300 text-xs"
            >
              <option value="all">all data</option>
              <option value="category">category</option>
              <option value="brand">brand</option>
            </select>
            
            {ent.tenant_type !== 'all' && (
              <select
                value={ent.tenant_id || ''}
                onChange={(e) => updateEntitlement(index, 'tenant_id', e.target.value)}
                className="bg-slate-700 border border-white/10 rounded px-2 py-1 text-green-300 text-xs flex-1"
              >
                <option value="">Select...</option>
                {ent.tenant_type === 'category' && scopeOptions.categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {ent.tenant_type === 'brand' && scopeOptions.brands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}
            
            {customScope.entitlements.length > 1 && (
              <button
                onClick={() => removeEntitlement(index)}
                className="text-slate-400 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        
        <button
          onClick={addEntitlement}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add another rule
        </button>
      </div>
      
      <button
        onClick={handleSave}
        disabled={saving || !customScope.name.trim()}
        className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
        Create & Assign Scope
      </button>
    </div>
  );
}

