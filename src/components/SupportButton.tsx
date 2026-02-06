import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SupportButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    window.open('https://hbmassessores.athenas.me', '_blank');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Tooltip/Popup */}
      <div
        className={cn(
          "bg-card border shadow-xl rounded-2xl p-4 max-w-[280px] transition-all duration-300 transform origin-bottom-right",
          isOpen 
            ? "opacity-100 scale-100 translate-y-0" 
            : "opacity-0 scale-95 translate-y-2 pointer-events-none"
        )}
      >
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-sm text-foreground pr-4">
          <span className="font-semibold">Faltou o layout do seu banco?</span>
          <br />
          <span className="text-muted-foreground">
            Ou está faltando dados no extrato? Mande uma mensagem para Kevym ou Alisson no Athenas Messenger!
          </span>
        </p>
        <button
          onClick={handleClick}
          className="mt-3 w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
        >
          Abrir Chat
        </button>
      </div>

      {/* Label acima do botão */}
      {!isOpen && (
        <div className="bg-card border shadow-md rounded-full px-3 py-1.5 text-xs font-medium text-foreground animate-fade-in">
          Precisa de ajuda?
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300",
          "hover:scale-110 active:scale-95",
          "animate-bounce-slow"
        )}
        aria-label="Suporte via Athenas Messenger"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </div>
  );
};
