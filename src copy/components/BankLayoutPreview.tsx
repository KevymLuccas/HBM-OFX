import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileImage, ImageIcon } from "lucide-react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";

// Import fallback layout images
import bradescoLayout from "@/assets/layouts/bradesco-layout.png";
import itauLayout from "@/assets/layouts/itau-layout.png";
import sicoobLayout from "@/assets/layouts/sicoob-layout.png";
import santanderLayout from "@/assets/layouts/santander-layout.png";
import safraLayout from "@/assets/layouts/safra-layout.png";
import xpLayout from "@/assets/layouts/xp-layout.png";
import sicrediLayout from "@/assets/layouts/sicredi-layout.png";
import bbLayout from "@/assets/layouts/bb-layout.png";
import pagseguroLayout from "@/assets/layouts/pagseguro-layout.png";
import stoneLayout from "@/assets/layouts/stone-layout.png";

const fallbackImages: Record<string, string> = {
  bradesco: bradescoLayout,
  itau: itauLayout,
  sicoob: sicoobLayout,
  sicoob2: sicoobLayout,
  santander: santanderLayout,
  santander2: santanderLayout,
  santander3: santanderLayout,
  safra: safraLayout,
  safra2: safraLayout,
  xp: xpLayout,
  sicredi: sicrediLayout,
  bb: bbLayout,
  pagseguro: pagseguroLayout,
  stone: stoneLayout,
};

const bankNames: Record<string, string> = {
  sicoob: "Sicoob",
  sicoob2: "Sicoob v2",
  sicredi: "Sicredi",
  itau: "Itaú",
  bradesco: "Bradesco",
  safra: "Safra",
  safra2: "Safra 2",
  santander: "Santander",
  santander2: "Santander 2",
  santander3: "Santander 3",
  xp: "XP Investimentos",
  bb: "Banco do Brasil",
  pagseguro: "PagSeguro",
  stone: "Stone",
  btg: "BTG Pactual",
};

interface BankLayoutPreviewProps {
  bankId: string;
  pdfFile?: File | null;
}

export function BankLayoutPreview({ bankId, pdfFile }: BankLayoutPreviewProps) {
  const [savedScreenshot, setSavedScreenshot] = useState<string | null>(null);
  const [pdfScreenshot, setPdfScreenshot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fallbackImage = fallbackImages[bankId];
  const bankName = bankNames[bankId] || bankId;

  // Load saved screenshot from storage on mount
  useEffect(() => {
    const loadSavedScreenshot = async () => {
      try {
        const { data } = supabase.storage.from("bank-layouts").getPublicUrl(`${bankId}.png`);

        if (data?.publicUrl) {
          // Check if the file actually exists by trying to fetch it
          const response = await fetch(data.publicUrl, { method: "HEAD" });
          if (response.ok) {
            setSavedScreenshot(data.publicUrl + `?t=${Date.now()}`);
          }
        }
      } catch (error) {
        console.log("No saved screenshot found for", bankId);
      }
    };

    loadSavedScreenshot();
  }, [bankId]);

  // Generate and save screenshot from PDF when file is provided
  useEffect(() => {
    if (!pdfFile) {
      setPdfScreenshot(null);
      return;
    }

    const generateAndSaveScreenshot = async () => {
      setIsLoading(true);
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Could not get canvas context");
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise;

        // Convert to blob for upload
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), "image/png");
        });

        // Upload to Supabase storage (overwrite existing)
        const { error } = await supabase.storage.from("bank-layouts").upload(`${bankId}.png`, blob, {
          upsert: true,
          contentType: "image/png",
        });

        if (error) {
          console.error("Error uploading screenshot:", error);
        } else {
          // Get the public URL
          const { data } = supabase.storage.from("bank-layouts").getPublicUrl(`${bankId}.png`);

          if (data?.publicUrl) {
            setSavedScreenshot(data.publicUrl + `?t=${Date.now()}`);
          }
        }

        const screenshot = canvas.toDataURL("image/png");
        setPdfScreenshot(screenshot);
      } catch (error) {
        console.error("Error generating PDF screenshot:", error);
        setPdfScreenshot(null);
      } finally {
        setIsLoading(false);
      }
    };

    generateAndSaveScreenshot();
  }, [pdfFile, bankId]);

  if (!fallbackImage && !pdfScreenshot && !savedScreenshot) {
    return null;
  }

  // Priority: current PDF screenshot > saved screenshot > fallback
  const displayImage = pdfScreenshot || savedScreenshot || fallbackImage;
  const isRealPdf = !!(pdfScreenshot || savedScreenshot);

  return (
    <Card className="overflow-hidden max-w-xs">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          {isRealPdf ? (
            <FileImage className="h-3 w-3 text-teal-600" />
          ) : (
            <ImageIcon className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="text-xs font-medium text-muted-foreground">Layout {bankName}</span>
        </div>
        <div className="rounded overflow-hidden border shadow-sm relative">
          {isLoading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          )}
          <img src={displayImage} alt={`Layout ${bankName}`} className="w-full h-auto object-contain max-h-40" />
        </div>
      </CardContent>
    </Card>
  );
}
