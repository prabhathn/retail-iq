import { LayoutGrid, Eye, EyeOff, Save, Loader2 } from 'lucide-react';

/**
 * Component for managing a user's module access permissions.
 */
export default function ModuleAccessPanel({
  availableModules,
  moduleAccess,
  moduleAccessDirty,
  saving,
  onToggle,
  onSave,
  onGrantAll,
  onRevokeAll
}) {
  // Group modules by section
  const groupedModules = {};
  availableModules.forEach(mod => {
    const section = mod.section || 'General';
    if (!groupedModules[section]) groupedModules[section] = [];
    groupedModules[section].push(mod);
  });

  return (
    <div className="pt-4 border-t border-white/10">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm text-slate-400 flex items-center gap-1">
          <LayoutGrid className="w-3 h-3" /> Module Access
        </label>
        <div className="flex gap-2">
          <button
            onClick={onGrantAll}
            disabled={saving}
            className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1"
            title="Grant access to all modules"
          >
            <Eye className="w-3 h-3" /> All
          </button>
          <button
            onClick={onRevokeAll}
            disabled={saving}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            title="Revoke access to all modules"
          >
            <EyeOff className="w-3 h-3" /> None
          </button>
        </div>
      </div>
      
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {Object.entries(groupedModules).map(([section, modules]) => (
          <div key={section}>
            <p className="text-xs text-slate-500 font-medium mb-1">{section}</p>
            <div className="space-y-1">
              {modules.map(mod => (
                <label
                  key={mod.key}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={moduleAccess[mod.key] || false}
                    onChange={() => onToggle(mod.key)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${moduleAccess[mod.key] ? 'text-white' : 'text-slate-500'}`}>
                    {mod.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {moduleAccessDirty && (
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full mt-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-sm font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Module Access
        </button>
      )}
    </div>
  );
}

