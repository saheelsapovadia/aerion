import React from 'react';

interface LoginProps {
  message?: string;
}

const Login: React.FC<LoginProps> = ({ message }) => {
  const handleLogin = () => {
    // Redirect to backend auth endpoint
    window.location.href = 'http://localhost:3001/auth/google';
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="text-center p-8 border border-cyan-500/30 bg-black/50 rounded-lg shadow-[0_0_30px_rgba(6,182,212,0.15)] max-w-md w-full mx-4">
        <h2 className="text-3xl font-thin tracking-widest text-white mb-8 font-['Space_Grotesk'] uppercase">
          {message || 'Authentication'}
        </h2>
        <p className="text-gray-400 mb-8 font-mono text-sm leading-relaxed">
          {message ? 'Trial period expired. Please sign in to continue.' : 'Identity verification required for interface access.'}
        </p>
        
        <button
          onClick={handleLogin}
          className="group relative px-8 py-4 bg-transparent border border-cyan-500/50 hover:border-cyan-400 text-cyan-500 hover:text-cyan-400 font-mono text-sm uppercase tracking-widest transition-all duration-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] w-full"
        >
          <span className="relative z-10 flex items-center justify-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Initialize Session
          </span>
          <div className="absolute inset-0 bg-cyan-500/10 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
        </button>
      </div>
    </div>
  );
};

export default Login;


