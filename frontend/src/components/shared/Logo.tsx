export function Logo() {
  return (
    <div className="flex items-center gap-2.5 transition-transform duration-300 ease-out">
      <div className="relative">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8 text-foreground transition-transform duration-300 ease-out group-hover:scale-105 group-hover:rotate-3"
        >
          {/* 外层立方体 - 代表缓存存储 */}
          <path d="M16 2L4 9V23L16 30L28 23V9L16 2Z" fill="currentColor" opacity="0.15"/>
          <path d="M16 2L4 9V23L16 30L28 23V9L16 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          {/* 内层立方体线条 */}
          <path d="M16 17V30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M16 17L4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M16 17L28 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          {/* 中心节点 - 代表 AI 模型 */}
          <circle cx="16" cy="17" r="3" fill="currentColor"/>
          {/* 连接线 - 代表神经网络 */}
          <line x1="16" y1="14" x2="16" y2="8" stroke="currentColor" strokeWidth="1"/>
          <line x1="18.5" y1="18.5" x2="23" y2="21" stroke="currentColor" strokeWidth="1"/>
          <line x1="13.5" y1="18.5" x2="9" y2="21" stroke="currentColor" strokeWidth="1"/>
          {/* 小节点 */}
          <circle cx="16" cy="8" r="1.5" fill="currentColor" opacity="0.6"/>
          <circle cx="23" cy="21" r="1.5" fill="currentColor" opacity="0.6"/>
          <circle cx="9" cy="21" r="1.5" fill="currentColor" opacity="0.6"/>
        </svg>
        <div className="absolute inset-0 bg-primary/10 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      <span className="text-xl font-bold tracking-tight text-foreground">
        MiniHF
      </span>
    </div>
  )
}
