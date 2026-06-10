import React, { useState } from 'react';
import logo from '../assets/logo.jpg';
import { Key, User, ShieldAlert } from 'lucide-react';
import { authAPI } from '../services/api';

export const Login = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await authAPI.login(username, password);
      onLoginSuccess();
    } catch (err) {
      setError('Invalid username or password. Try admin/admin123 or developer/dev123.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    localStorage.setItem('dev_bypass', 'true');
    onLoginSuccess();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative z-10 space-y-8 animate-fade-in text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-1.5 rounded-2xl shadow-lg shadow-blue-500/10 flex items-center justify-center border border-slate-800">
            <img src={logo} alt="Smart Bug Predictor" className="h-14 w-auto object-contain rounded-xl" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tight">Access Control</h2>
            <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">MLOps Control Console</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-semibold text-red-400 flex items-start gap-2">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Username</label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin or developer"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold transition-all duration-200"
                />
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="admin123 or dev123"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold transition-all duration-200"
                />
                <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all duration-200 cursor-pointer disabled:bg-slate-700 disabled:shadow-none"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="border-t border-slate-800/80 pt-6 flex flex-col items-center gap-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alternative Access</span>
          <button
            onClick={handleDemoLogin}
            className="text-xs font-bold text-blue-500 hover:text-blue-400 border border-blue-500/20 px-4 py-2 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 transition-all duration-200 cursor-pointer"
          >
            Bypass & Login as Guest
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
