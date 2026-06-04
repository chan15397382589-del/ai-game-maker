"use client";

import { useState, useEffect, useCallback } from "react";

// SRL提示内容（按触发时机）
interface HintConfig {
  key: string;
  icon: string;
  text: string;
  srlPhase: string;
}

const SRL_HINTS: Record<string, HintConfig> = {
  ideation_start: {
    key: "ideation_start",
    icon: " ",
    text: "先想一想：你的游戏是什么类型的？有几个部分？想清楚再告诉小智老师~",
    srlPhase: "plan",
  },
  code_generated: {
    key: "code_generated",
    icon: "▶️",
    text: "游戏做好了！试试玩一下，看看是不是你要的效果？",
    srlPhase: "monitor",
  },
  consecutive_edits: {
    key: "consecutive_edits",
    icon: " ",
    text: "你已经改了好几次了！看看现在这个游戏和一开始比，有什么变化？",
    srlPhase: "monitor",
  },
  before_complete: {
    key: "before_complete",
    icon: "✅",
    text: "等一下！检查一下：①游戏能正常玩吗？②有没有bug？③你的想法都实现了吗？",
    srlPhase: "evaluate",
  },
  after_undo: {
    key: "after_undo",
    icon: " ",
    text: "你撤销了修改，是发现问题了吗？说说你发现了什么？",
    srlPhase: "evaluate",
  },
};

// SRL阶段对应的颜色
const PHASE_COLORS: Record<string, string> = {
  plan: "from-blue-400 to-blue-500",
  monitor: "from-amber-400 to-orange-500",
  evaluate: "from-green-400 to-emerald-500",
};

interface Props {
  hintKey: string | null;
  onDismiss: () => void;
}

export default function SRLProcessHint({ hintKey, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hintKey) {
      setVisible(true);
      // 6秒后自动消失
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }, 6000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [hintKey, onDismiss]);

  if (!hintKey || !SRL_HINTS[hintKey]) return null;

  const hint = SRL_HINTS[hintKey];
  const colorClass = PHASE_COLORS[hint.srlPhase] || "from-gray-400 to-gray-500";

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
      }`}
    >
      <div
        className={`bg-gradient-to-r ${colorClass} text-white px-5 py-3 rounded-2xl shadow-lg max-w-md flex items-center gap-3`}
      >
        <span className="text-2xl flex-shrink-0">{hint.icon}</span>
        <p className="text-sm font-medium leading-relaxed">{hint.text}</p>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 300);
          }}
          className="flex-shrink-0 text-white/70 hover:text-white text-lg leading-none ml-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// 导出触发函数（供外部调用）
export function getSrlHintKey(params: {
  isIdeation: boolean;
  isNewCode: boolean;
  consecutiveEditCount: number;
  isAboutToComplete: boolean;
  justDidUndo: boolean;
}): string | null {
  const { isIdeation, isNewCode, consecutiveEditCount, isAboutToComplete, justDidUndo } = params;

  // 优先级从高到低
  if (isAboutToComplete) return "before_complete";
  if (justDidUndo) return "after_undo";
  if (consecutiveEditCount >= 3) return "consecutive_edits";
  if (isNewCode) return "code_generated";
  if (isIdeation) return "ideation_start";

  return null;
}
