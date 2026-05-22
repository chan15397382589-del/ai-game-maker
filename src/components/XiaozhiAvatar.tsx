import React from 'react';

export interface XiaozhiAvatarProps {
  state?: 'idle' | 'thinking' | 'success';
}

export default function XiaozhiAvatar({ state = 'idle' }: XiaozhiAvatarProps) {
  const colors = {
    primary: "#4F46E5",
    primaryLight: "#E0E7FF",
    secondary: "#F59E0B",
    skin: "#FFE4C4",
    hair: "#1E1B4B",
    glasses: "#4338CA",
    stroke: "#334155"
  };

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full drop-shadow-md"
    >
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EEF2FF" />
          <stop offset="100%" stopColor="#C7D2FE" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colors.secondary} stopOpacity="1" />
          <stop offset="100%" stopColor={colors.secondary} stopOpacity="0" />
        </radialGradient>
        <style>
          {`
            @keyframes pulse {
              0% { r: 6px; opacity: 0.8; }
              50% { r: 12px; opacity: 0.3; }
              100% { r: 6px; opacity: 0.8; }
            }
            .antenna-glow { animation: pulse 1.5s infinite; }
            @keyframes float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-3px); }
            }
            .head-group { animation: float 3s ease-in-out infinite; transform-origin: center; }
          `}
        </style>
      </defs>

      <circle cx="100" cy="100" r="95" fill="url(#bgGradient)" />
      <circle cx="100" cy="100" r="95" fill="none" stroke="#A5B4FC" strokeWidth="2" strokeDasharray="10 5" />

      <g className="head-group">
        <line x1="100" y1="60" x2="100" y2="30" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
        {state === 'thinking' && (
          <circle cx="100" cy="30" r="12" fill="url(#glow)" className="antenna-glow" />
        )}
        <circle cx="100" cy="30" r="6" fill={state === 'thinking' ? colors.secondary : '#94A3B8'} />

        <rect x="50" y="60" width="100" height="90" rx="40" fill={colors.skin} />
        <path d="M 50 100 Q 50 150 100 150 Q 150 150 150 100" fill="#FCD34D" opacity="0.1" />

        <path
          d="M 45 80 Q 50 45 100 45 Q 150 45 155 80 Q 140 60 100 65 Q 60 60 45 80 Z"
          fill={colors.hair}
        />
        <path d="M 100 45 Q 110 30 115 35" fill="none" stroke={colors.hair} strokeWidth="4" strokeLinecap="round" />

        <rect x="40" y="90" width="15" height="30" rx="5" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="2" />
        <rect x="145" y="90" width="15" height="30" rx="5" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="2" />
        <circle cx="47.5" cy="105" r="3" fill={colors.primary} />
        <circle cx="152.5" cy="105" r="3" fill={colors.primary} />

        <rect x="60" y="85" width="35" height="25" rx="8" fill="rgba(255,255,255,0.5)" stroke={colors.glasses} strokeWidth="3" />
        <rect x="105" y="85" width="35" height="25" rx="8" fill="rgba(255,255,255,0.5)" stroke={colors.glasses} strokeWidth="3" />
        <line x1="95" y1="97.5" x2="105" y2="97.5" stroke={colors.glasses} strokeWidth="3" />

        <path d="M 65 90 L 80 90" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
        <path d="M 110 90 L 125 90" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>

        {state === 'idle' && (
          <g fill={colors.hair}>
            <circle cx="77.5" cy="97.5" r="5" />
            <circle cx="122.5" cy="97.5" r="5" />
          </g>
        )}
        {state === 'thinking' && (
          <g fill={colors.hair}>
            <circle cx="82" cy="93" r="4" />
            <circle cx="127" cy="93" r="4" />
          </g>
        )}
        {state === 'success' && (
          <g fill="none" stroke={colors.hair} strokeWidth="3" strokeLinecap="round">
            <path d="M 70 100 Q 77.5 90 85 100" />
            <path d="M 115 100 Q 122.5 90 130 100" />
          </g>
        )}

        {state === 'idle' && (
          <path d="M 90 125 Q 100 135 110 125" fill="none" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
        )}
        {state === 'thinking' && (
          <circle cx="100" cy="125" r="4" fill="none" stroke="#D97706" strokeWidth="3" />
        )}
        {state === 'success' && (
          <path d="M 85 120 Q 100 140 115 120 Z" fill="#EF4444" />
        )}

        <circle cx="65" cy="115" r="6" fill="#F87171" opacity="0.3" />
        <circle cx="135" cy="115" r="6" fill="#F87171" opacity="0.3" />

      </g>

      {state === 'success' && (
        <g fill={colors.secondary}>
          <path d="M 40 50 L 43 58 L 50 60 L 43 62 L 40 70 L 37 62 L 30 60 L 37 58 Z" />
          <path d="M 160 60 L 162 66 L 168 68 L 162 70 L 160 76 L 158 70 L 152 68 L 158 66 Z" />
          <circle cx="50" cy="40" r="3" fill="#FCD34D" />
          <circle cx="150" cy="50" r="2" fill="#FCD34D" />
        </g>
      )}

      {state === 'thinking' && (
        <g fill={colors.primary} fontWeight="bold" fontSize="24" fontFamily="sans-serif">
          <text x="35" y="65">?</text>
          <text x="145" y="55">.</text>
          <text x="155" y="50" fontSize="18">.</text>
          <text x="165" y="45" fontSize="12">.</text>
        </g>
      )}

    </svg>
  );
}
