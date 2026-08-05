import React, { memo } from "react";

interface MessageSkeletonProps {
  count?: number;
}

const MessageSkeleton = memo(function MessageSkeleton({ count = 3 }: MessageSkeletonProps) {
  return (
    <div className="space-y-3 px-3 pt-2">
      {Array.from({ length: count }).map((_, i) => {
        const isUser = i % 2 === 0;
        return (
          <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"} animate-pulse`}>
            <div
              className={`rounded-2xl ${isUser ? "rounded-br-md bg-primary/20" : "rounded-bl-md bg-secondary"}`}
              style={{ width: isUser ? `${40 + (i * 10) % 30}%` : `${55 + (i * 7) % 25}%` }}
            >
              <div className="px-4 py-3 space-y-2">
                <div className="h-3 rounded-full bg-muted-foreground/10 w-full" />
                {!isUser && <div className="h-3 rounded-full bg-muted-foreground/10 w-4/5" />}
                {!isUser && i === 1 && <div className="h-3 rounded-full bg-muted-foreground/10 w-3/5" />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default MessageSkeleton;
