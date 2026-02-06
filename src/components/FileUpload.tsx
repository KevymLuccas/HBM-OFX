import { Upload, FileText, X } from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
}

export const FileUpload = ({ onFileSelect, selectedFile }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf") {
        onFileSelect(file);
      }
    }
  }, [onFileSelect]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type === "application/pdf") {
        onFileSelect(file);
      }
    }
  };

  const handleRemove = () => {
    onFileSelect(null);
  };

  return (
    <div className="w-full">
      {selectedFile ? (
        <div className="bg-accent rounded-lg p-6 border-2 border-accent-foreground/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-3">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleRemove}
              className="bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg p-2 transition-smooth"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-lg p-12 transition-smooth cursor-pointer",
            "hover:border-primary hover:bg-accent/50",
            isDragging ? "border-primary bg-accent" : "border-border bg-card"
          )}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className={cn(
              "bg-gradient-hero rounded-full p-4 shadow-glow transition-smooth",
              isDragging && "scale-110"
            )}>
              <Upload className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground mb-1">
                {isDragging ? "Solte o arquivo aqui" : "Arraste o PDF aqui"}
              </p>
              <p className="text-sm text-muted-foreground">
                ou clique para selecionar o arquivo
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Apenas arquivos PDF são aceitos
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
