import { Users } from 'lucide-react';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';

export const OnlineUsersIndicator = () => {
  const onlineCount = useOnlineUsers();

  // Só mostra se houver mais de 1 pessoa (além do próprio usuário)
  if (onlineCount <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-fade-in">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        <Users className="h-4 w-4" />
      </div>
      <span>
        {onlineCount} {onlineCount === 2 ? 'pessoa' : 'pessoas'} usando agora
      </span>
    </div>
  );
};
