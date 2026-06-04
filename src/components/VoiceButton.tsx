"use client";

import { useVoiceInput } from "@/hooks/useVoiceInput";

interface VoiceButtonProps {
  onResult: (text: string) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function VoiceButton({ onResult, className = "", size = "md" }: VoiceButtonProps) {
  const { isRecording, toggleRecording } = useVoiceInput({ onResult });

  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-12 h-12 text-lg",
  };

  return (
    <button
      onClick={toggleRecording}
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center transition-all ${
        isRecording
          ? "bg-red-500 text-white animate-pulse shadow-lg"
          : "bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600"
      } ${className}`}
      title={isRecording ? "点击停止" : "点击说话"}
    >
      {isRecording ? "⏹" : "🎤"}
    </button>
  );
}
