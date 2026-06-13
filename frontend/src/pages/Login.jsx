import React, { useState, useEffect } from 'react';
import logo from '../assets/logo.jpg';
import { Key, User, ShieldAlert, Chrome, UserPlus, LogIn, Settings as SettingsIcon } from 'lucide-react';
import { authAPI } from '../services/api';

export const Login = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  
  // Custom Google Client ID support
  const [googleClientId, setGoogleClientId] = useState(
    localStorage.getItem('google_client_id') || ''
  );

  const handleGoogleCredentialResponse = async (response) => {
    setLoading(true);
    setError('');
    try {
      await authAPI.googleLogin(response.credential, googleClientId);
      onLoginSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  // Initialize and Render Google Sign-in button
  useEffect(() => {
    localStorage.setItem('google_client_id', googleClientId);
    
    const initializeGoogleSignIn = () => {
      if (window.google && googleClientId) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
          });
          
          const container = document.getElementById("google-signin-btn");
          if (container) {
            container.innerHTML = ""; // Clear existing buttons if any
            window.google.accounts.id.renderButton(container, {
              theme: "filled_blue",
              size: "large",
              text: isRegister ? "signup_with" : "signin_with",
              shape: "rectangular",
              logo_alignment: "left",
              width: 380
            });
          }
        } catch (e) {
          console.error("Failed to render Google button:", e);
        }
      }
    };

    // Delay slightly to ensure script is loaded and DOM element is rendered
    const timer = setTimeout(initializeGoogleSignIn, 300);
    return () => clearTimeout(timer);
  }, [googleClientId, isRegister]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (isRegister) {
        await authAPI.register(username, password);
      } else {
        await authAPI.login(username, password);
      }
      onLoginSuccess();
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          setError(detail.map(d => d.msg || JSON.stringify(d)).join(', '));
        } else {
          setError(detail);
        }
      } else if (err.message && err.message.includes('Network Error')) {
        setError('Cannot connect to the backend server. Please run start.bat to start the backend.');
      } else {
        setError(err.message || 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMockGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const mockEmail = username.includes('@') ? username : `${username || 'developer'}@gmail.com`;
    const mockToken = `mock-google-jwt-${mockEmail}`;
    try {
      await authAPI.googleLogin(mockToken, googleClientId);
      onLoginSuccess();
    } catch (err) {
      setError('Mock Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    localStorage.setItem('dev_bypass', 'true');
    localStorage.setItem('username', 'Developer Guest');
    localStorage.setItem('role', 'developer');
    onLoginSuccess();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-blue-500/10 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative z-10 space-y-6 animate-fade-in text-white transition-all duration-300">
        
        {/* Header Section */}
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-1.5 rounded-2xl shadow-lg shadow-blue-500/10 flex items-center justify-center border border-slate-800">
            <img src={logo} alt="Smart Bug Predictor" className="h-14 w-auto object-contain rounded-xl" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tight">
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">
              {isRegister ? 'Register for MLOps Access' : 'MLOps Control Console'}
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-semibold text-red-400 flex items-start gap-2 animate-pulse">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Standard Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3.5">
            {/* Username / Email */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                {isRegister ? 'Email / Username' : 'Username'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={isRegister ? "name@company.com" : "admin or developer"}
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
                  placeholder="••••••••"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold transition-all duration-200"
                />
                <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all duration-200 cursor-pointer disabled:bg-slate-700 disabled:shadow-none flex items-center justify-center gap-2"
          >
            {isRegister ? <UserPlus size={14} /> : <LogIn size={14} />}
            {loading ? 'Processing...' : (isRegister ? 'Register & Sign In' : 'Sign In')}
          </button>
        </form>

        {/* Auth Mode Toggle */}
        <div className="text-center">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
          >
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </button>
        </div>

        {/* Google Identity Services Section */}
        <div className="border-t border-slate-800/80 pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gmail / Google Access</span>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-slate-500 hover:text-slate-400 p-1 rounded-md"
              title="Google Client Configuration"
            >
              <SettingsIcon size={14} />
            </button>
          </div>

          {/* Config fields if user wants to supply their own Client ID */}
          {showConfig && (
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2 text-xs">
              <label className="block text-[9px] font-bold text-slate-500 uppercase">Google Client ID</label>
              <input
                type="text"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                placeholder="Enter client_id.apps.googleusercontent.com"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-blue-500"
              />
              <p className="text-[9px] text-slate-500">Configure to test real authentication. Leave empty to rely on Gmail Mock validation.</p>
            </div>
          )}

          {googleClientId ? (
            /* Render Google Sign-in button */
            <div className="flex justify-center">
              <div id="google-signin-btn" className="w-full flex justify-center"></div>
            </div>
          ) : (
            /* Mock Gmail Access */
            <button
              onClick={handleMockGoogleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 hover:border-slate-600 text-white font-bold text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
            >
              <Chrome size={14} className="text-red-500" />
              Sign in with Gmail (Mock API)
            </button>
          )}
        </div>

        {/* Demo / Guest Bypass */}
        <div className="text-center pt-2">
          <button
            onClick={handleDemoLogin}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-400 uppercase tracking-wider"
          >
            Bypass & Access Console as Guest
          </button>
        </div>

      </div>
    </div>
  );
};

export default Login;
