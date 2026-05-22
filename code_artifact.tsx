import React, { useState, useEffect } from 'react';

export default function App() {
  const [state, setState] = useState('idle'); // 'idle' | 'thinking' | 'success'

  // 自动循环演示状态（仅供演示体验，实际项目中可通过 props 传入 state）
  useEffect(() => {
    const states = ['idle', 'thinking', 'success'];
    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % states.length;
      setState(states[currentIndex]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-indigo-100 flex flex-col items-center max-w-md w-full">
        
        <h2 className="text-2xl font-bold text-gray-800 mb-2">小智老师</h2>
        <p className="text-gray-500 text-sm mb-8">AI 游戏创作课堂 - 首席教学官</p>

        {/* 核心头像组件 */}
        <div className="relative w-48 h-48 mb-8 transition-transform duration-300 hover:scale-105">
          <XiaozhiAvatar state={state} />
        </div>

        {/* 状态控制面板（供开发者调试） */}
        <div className="w-full bg-gray-50 p-4 rounded-xl border border-gray-100">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-3 text-center">
            表情状态演示 (AI 交互状态)
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setState('idle')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                state === 'idle' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-indigo-50'
              }`}
            >
              默认 (待命)
            </button>
            <button
              onClick={() => setState('thinking')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                state === 'thinking' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-amber-50'
              }`}
            >
              思考 (生成代码)
            </button>
            <button
              onClick={() => setState('success')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                state === 'success' ? 'bg-green-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-green-50'
              }`}
            >
              开心 (生成成功)
            </button>
          </div>
        </div>

        <div className="mt-8 text-center bg-blue-50 text-blue-800 text-sm p-4 rounded-xl">
          <p>💡 <b>使用建议：</b>您可以将此 SVG 直接放入聊天界面的头像框 <code>.chat-bubble-ai</code> 旁边，根据 <code>isCoding</code> 状态切换表情。</p>
        </div>

      </div>
    </div>
  );
}

/**
 * 小智老师纯 SVG 头像组件
 * @param {Object} props
 * @param {'idle' | 'thinking' | 'success'} props.state - 头像当前的情感状态
 */
function XiaozhiAvatar({ state = 'idle' }) {
  // 定义项目主题色
  const colors = {
    primary: "#4F46E5", // Indigo-600
    primaryLight: "#E0E7FF", // Indigo-100
    secondary: "#F59E0B", // Amber-500
    skin: "#FFE4C4", 
    hair: "#1E1B4B", // Indigo-900
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
        {/* 背景渐变 */}
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EEF2FF" />
          <stop offset="100%" stopColor="#C7D2FE" />
        </linearGradient>

        {/* 思考状态的天线发光效果 */}
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colors.secondary} stopOpacity="1" />
          <stop offset="100%" stopColor={colors.secondary} stopOpacity="0" />
        </radialGradient>

        {/* 思考状态的动画 */}
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

      {/* 底部圆形背景 */}
      <circle cx="100" cy="100" r="95" fill="url(#bgGradient)" />
      
      {/* 边缘装饰圈 */}
      <circle cx="100" cy="100" r="95" fill="none" stroke="#A5B4FC" strokeWidth="2" strokeDasharray="10 5" />

      {/* 整体头部组 (带有悬浮动画) */}
      <g className="head-group">
        {/* === 天线部分 === */}
        <line x1="100" y1="60" x2="100" y2="30" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
        {/* 天线发光 (仅思考状态显示) */}
        {state === 'thinking' && (
          <circle cx="100" cy="30" r="12" fill="url(#glow)" className="antenna-glow" />
        )}
        <circle cx="100" cy="30" r="6" fill={state === 'thinking' ? colors.secondary : '#94A3B8'} />

        {/* === 脸部底座 === */}
        <rect x="50" y="60" width="100" height="90" rx="40" fill={colors.skin} />
        <path d="M 50 100 Q 50 150 100 150 Q 150 150 150 100" fill="#FCD34D" opacity="0.1" />

        {/* === 头发 === */}
        <path 
          d="M 45 80 Q 50 45 100 45 Q 150 45 155 80 Q 140 60 100 65 Q 60 60 45 80 Z" 
          fill={colors.hair} 
        />
        {/* 头顶一撮呆毛 */}
        <path d="M 100 45 Q 110 30 115 35" fill="none" stroke={colors.hair} strokeWidth="4" strokeLinecap="round" />

        {/* === 科技感护耳/耳机 === */}
        <rect x="40" y="90" width="15" height="30" rx="5" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="2" />
        <rect x="145" y="90" width="15" height="30" rx="5" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="2" />
        <circle cx="47.5" cy="105" r="3" fill={colors.primary} />
        <circle cx="152.5" cy="105" r="3" fill={colors.primary} />

        {/* === 眼睛与眼镜 === */}
        {/* 眼镜框 */}
        <rect x="60" y="85" width="35" height="25" rx="8" fill="rgba(255,255,255,0.5)" stroke={colors.glasses} strokeWidth="3" />
        <rect x="105" y="85" width="35" height="25" rx="8" fill="rgba(255,255,255,0.5)" stroke={colors.glasses} strokeWidth="3" />
        <line x1="95" y1="97.5" x2="105" y2="97.5" stroke={colors.glasses} strokeWidth="3" />
        
        {/* 镜片高光 */}
        <path d="M 65 90 L 80 90" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
        <path d="M 110 90 L 125 90" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>

        {/* 动态眼睛表情 */}
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

        {/* === 嘴巴表情 === */}
        {state === 'idle' && (
          <path d="M 90 125 Q 100 135 110 125" fill="none" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
        )}
        
        {state === 'thinking' && (
          <circle cx="100" cy="125" r="4" fill="none" stroke="#D97706" strokeWidth="3" />
        )}

        {state === 'success' && (
          <path d="M 85 120 Q 100 140 115 120 Z" fill="#EF4444" />
        )}

        {/* 脸颊红晕 */}
        <circle cx="65" cy="115" r="6" fill="#F87171" opacity="0.3" />
        <circle cx="135" cy="115" r="6" fill="#F87171" opacity="0.3" />

      </g>

      {/* 开心状态的星星特效 */}
      {state === 'success' && (
        <g fill={colors.secondary}>
          <path d="M 40 50 L 43 58 L 50 60 L 43 62 L 40 70 L 37 62 L 30 60 L 37 58 Z" />
          <path d="M 160 60 L 162 66 L 168 68 L 162 70 L 160 76 L 158 70 L 152 68 L 158 66 Z" />
          <circle cx="50" cy="40" r="3" fill="#FCD34D" />
          <circle cx="150" cy="50" r="2" fill="#FCD34D" />
        </g>
      )}

      {/* 思考状态的标点符号 */}
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