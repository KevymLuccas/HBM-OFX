import { Button } from "@/components/ui/button";
import { Loader2, FileOutput } from "lucide-react";

interface ProcessButtonProps {
  onClick: () => void;
  disabled: boolean;
  isProcessing: boolean;
}

export const ProcessButton = ({ onClick, disabled, isProcessing }: ProcessButtonProps) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || isProcessing}
      size="lg"
      className="w-full h-14 bg-gradient-hero hover:opacity-90 text-primary-foreground font-semibold text-lg shadow-lg hover:shadow-glow transition-smooth disabled:opacity-50"
    >
      {isProcessing ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Processando...
        </>
      ) : (
        <>
          <FileOutput className="mr-2 h-5 w-5" />
          Processar e Converter
        </>
      )}
    </Button>
  );
};
