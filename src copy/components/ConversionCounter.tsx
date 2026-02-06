import { useEffect, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Conversion {
  id: string;
  bank_id: string;
  bank_name: string;
  created_at: string;
}

export function ConversionCounter() {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchConversions = async () => {
    // Buscar total de conversões
    const { count } = await supabase
      .from("conversions")
      .select("*", { count: "exact", head: true });
    
    if (count !== null) {
      setTotalCount(count);
    }

    // Buscar últimas 50 para o popover
    const { data, error } = await supabase
      .from("conversions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setConversions(data);
    }
  };

  useEffect(() => {
    fetchConversions();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("conversions_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversions",
        },
        () => {
          fetchConversions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (totalCount === 0) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex justify-center w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-3 hover:text-foreground transition-colors cursor-pointer">
          <FileCheck2 className="h-4 w-4 text-primary" />
          <span>
            <span className="font-semibold text-foreground">{totalCount.toLocaleString("pt-BR")}</span>
            {" "}PDF{totalCount !== 1 ? "s" : ""} convertido{totalCount !== 1 ? "s" : ""}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="center">
        <div className="p-3 border-b">
          <h4 className="font-semibold text-sm">Conversões recentes</h4>
        </div>
        <ScrollArea className="h-64">
          <div className="p-2 space-y-1">
            {conversions.map((conversion) => (
              <div
                key={conversion.id}
                className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50"
              >
                <span className="font-medium">{conversion.bank_name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(conversion.created_at)}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
      </Popover>
    </div>
  );
}
