import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface DownloadButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export const DownloadButton = ({ onClick, disabled }: DownloadButtonProps) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size="lg"
      variant="outline"
      className="w-full h-14 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-semibold text-lg shadow-md hover:shadow-lg transition-smooth disabled:opacity-50"
    >
      <Download className="mr-2 h-5 w-5" />
      Baixar Arquivo OFX
    </Button>
  );
};
