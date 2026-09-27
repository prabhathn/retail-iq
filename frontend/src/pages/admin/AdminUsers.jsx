import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Shield, User, Save, Plus, Loader2, Check, Key, Building, Mail } from 'lucide-react';
import { useUserManagement } from '../../hooks/useUserManagement';
import { extractErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/formatters';
import ScopeBuilder from '../../components/admin/ScopeBuilder';
import ModuleAccessPanel from '../../components/admin/ModuleAccessPanel';

export default function AdminUsers() {
  const {
    users, scopes, scopeOptions, availableModules, total, loading,
    selectedUser, userDetail, moduleAccess, moduleAccessDirty,
    saving, saveSuccess,
    selectUser, saveUserChanges, saveModuleAccess,
    toggleModuleAccess, grantAllModules, revokeAllModules, createCustomScope
  } = useUserManagement();
  
  // Edit form state (local to component)
  const [editForm, setEditForm] = useState({
    email: '', full_name: '', company: '', role: 'analyst',
    is_active: true, password_reset_required: false, scope_id: null
  });
  const [showScopeBuilder, setShowScopeBuilder] = useState(false);

  // Populate form when user detail loads
  useEffect(() => {
    if (userDetail?.user) {
      setEditForm({
        email: userDetail.user.email || '',
        full_name: userDetail.user.full_name || '',
        company: userDetail.user.company || '',
        role: userDetail.user.role || 'analyst',
        is_active: userDetail.user.is_active ?? true,
        password_reset_required: userDetail.user.password_reset_required ?? false,
        scope_id: userDetail.user.scope_id || null
      });
      setShowScopeBuilder(false);
    }
  }, [userDetail]);

  const handleUserClick = (user) => {
    selectUser(user);
  };

  const handleSaveUser = async () => {
    try {
      await saveUserChanges(editForm);
    } catch (error) {
      alert('Failed to save: ' + (extractErrorMessage(error)));
    }
  };

  const handleCreateScope = async (scopeData) => {
    try {
      await createCustomScope(scopeData);
      setShowScopeBuilder(false);
    } catch (error) {
      alert('Failed to create scope: ' + (extractErrorMessage(error)));
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-8 h-8 text-blue-400" />
          <h1 className="text-2xl font-display font-bold text-white">Users</h1>
        </div>
        <p className="text-slate-400">{total} total users</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users Table */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-6">
          <UsersTable 
            users={users} 
            selectedUser={selectedUser} 
            onUserClick={handleUserClick}
            loading={loading}
          />
        </div>

        {/* User Detail Panel */}
        <div className="glass-card rounded-2xl p-6">
          {userDetail ? (
            <div className="space-y-6">
              <UserHeader user={userDetail.user} saveSuccess={saveSuccess} />
              
              <UserEditForm 
                editForm={editForm} 
                setEditForm={setEditForm}
              />
              
              <ScopeSection
                editForm={editForm}
                setEditForm={setEditForm}
                scopes={scopes}
                userScope={userDetail.scope}
                showScopeBuilder={showScopeBuilder}
                setShowScopeBuilder={setShowScopeBuilder}
                scopeOptions={scopeOptions}
                saving={saving}
                onCreateScope={handleCreateScope}
              />

              <ModuleAccessPanel
                availableModules={availableModules}
                moduleAccess={moduleAccess}
                moduleAccessDirty={moduleAccessDirty}
                saving={saving}
                onToggle={toggleModuleAccess}
                onSave={saveModuleAccess}
                onGrantAll={grantAllModules}
                onRevokeAll={revokeAllModules}
              />

              {!showScopeBuilder && (
                <button
                  onClick={handleSaveUser}
                  disabled={saving}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 mt-4"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Save Changes
                </button>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
}

// ============== Sub-components ==============

function UsersTable({ users, selectedUser, onUserClick, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }
  
  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No users found
      </div>
    );
  }
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left text-sm font-medium text-slate-400 pb-3">User</th>
            <th className="text-left text-sm font-medium text-slate-400 pb-3">Role</th>
            <th className="text-left text-sm font-medium text-slate-400 pb-3">Scope</th>
            <th className="text-right text-sm font-medium text-slate-400 pb-3">Last Login</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr 
              key={user.id} 
              className={`border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${
                selectedUser?.id === user.id ? 'bg-white/10' : ''
              }`}
              onClick={() => onUserClick(user)}
            >
              <td className="py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                    {user.full_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-white font-medium">{user.full_name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                </div>
              </td>
              <td className="py-3">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  user.role === 'admin' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {user.role}
                </span>
              </td>
              <td className="py-3">
                {user.scope ? (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    user.scope.is_admin ? 'bg-green-500/20 text-green-300' : 'bg-purple-500/20 text-purple-300'
                  }`}>
                    {user.scope.name}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">No scope</span>
                )}
              </td>
              <td className="py-3 text-right text-slate-400 text-sm">
                {formatDate(user.last_login, { includeTime: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserHeader({ user, saveSuccess }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
        {user.full_name?.charAt(0) || 'U'}
      </div>
      <div className="flex-1">
        <h3 className="text-white font-semibold">{user.full_name}</h3>
        <p className="text-xs text-slate-400">
          ID: {user.id} · Joined {formatDate(user.created_at, { includeTime: true })}
        </p>
      </div>
      {saveSuccess && (
        <span className="flex items-center gap-1 text-green-400 text-sm">
          <Check className="w-4 h-4" /> Saved
        </span>
      )}
    </div>
  );
}

function UserEditForm({ editForm, setEditForm }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-slate-400 flex items-center gap-1 mb-1">
          <Mail className="w-3 h-3" /> Email
        </label>
        <input
          type="email"
          value={editForm.email}
          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-sm text-slate-400 flex items-center gap-1 mb-1">
          <User className="w-3 h-3" /> Full Name
        </label>
        <input
          type="text"
          value={editForm.full_name}
          onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-sm text-slate-400 flex items-center gap-1 mb-1">
          <Building className="w-3 h-3" /> Company
        </label>
        <input
          type="text"
          value={editForm.company}
          onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-sm text-slate-400 mb-1 block">Role</label>
        <select
          value={editForm.role}
          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
        >
          <option value="analyst">Analyst</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={editForm.is_active}
            onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
            className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-300">Active</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={editForm.password_reset_required}
            onChange={(e) => setEditForm({ ...editForm, password_reset_required: e.target.checked })}
            className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-sm text-slate-300 flex items-center gap-1">
            <Key className="w-3 h-3" /> Reset PW
          </span>
        </label>
      </div>
    </div>
  );
}

function ScopeSection({ 
  editForm, setEditForm, scopes, userScope, 
  showScopeBuilder, setShowScopeBuilder, scopeOptions,
  saving, onCreateScope 
}) {
  return (
    <div className="pt-4 border-t border-white/10">
      <label className="text-sm text-slate-400 flex items-center gap-1 mb-2">
        <Shield className="w-3 h-3" /> Data Access Scope
      </label>
      
      {!showScopeBuilder ? (
        <>
          <select
            value={editForm.scope_id || ''}
            onChange={(e) => setEditForm({ ...editForm, scope_id: parseInt(e.target.value) || null })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white mb-2"
          >
            <option value="">No scope assigned</option>
            {scopes.map(scope => (
              <option key={scope.id} value={scope.id}>
                {scope.name} {scope.is_admin ? '(Full Access)' : ''}
              </option>
            ))}
          </select>
          
          {userScope && (
            <div className="bg-white/5 rounded-lg p-3 mb-3">
              <p className="text-xs text-slate-400 mb-1">Current entitlements:</p>
              <div className="flex flex-wrap gap-1">
                {userScope.entitlements.map((ent, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                    {ent.tenant_type === 'all' ? 'All Data' : `${ent.tenant_type}: ${ent.tenant_id}`}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <button
            onClick={() => setShowScopeBuilder(true)}
            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Create custom scope for this user
          </button>
        </>
      ) : (
        <ScopeBuilder
          scopeOptions={scopeOptions}
          onSave={onCreateScope}
          onCancel={() => setShowScopeBuilder(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <User className="w-12 h-12 mb-2 opacity-50" />
      <p>Select a user to edit</p>
    </div>
  );
}
