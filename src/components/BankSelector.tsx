import { useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface BankSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

const BANKS = [
  { value: "itau", label: "Itaú", hasLayout: true },
  { value: "itau2", label: "Itaú 2", hasLayout: true },
  { value: "bradesco", label: "Bradesco", hasLayout: true },
  { value: "santander", label: "Santander", hasLayout: true },
  { value: "santander2", label: "Santander 2", hasLayout: true },
  { value: "santander3", label: "Santander 3", hasLayout: true },
  { value: "bb", label: "Banco do Brasil", hasLayout: true },
  { value: "bb2", label: "Banco do Brasil 2", hasLayout: true },
  { value: "caixa", label: "Caixa Econômica", hasLayout: false },
  { value: "sicoob", label: "Sicoob", hasLayout: true },
  { value: "sicoob2", label: "Sicoob 2", hasLayout: true },
  { value: "sicoob3", label: "Sicoob 3", hasLayout: true },
  { value: "sicredi", label: "Sicredi", hasLayout: true },
  { value: "sicredi2", label: "Sicredi 2", hasLayout: true },
  { value: "safra", label: "Safra", hasLayout: true },
  { value: "safra2", label: "Safra 2", hasLayout: true },
  { value: "xp", label: "XP Investimentos", hasLayout: true },
  { value: "pagseguro", label: "PagSeguro", hasLayout: true },
  { value: "stone", label: "Stone", hasLayout: true },
  { value: "sisprime2", label: "Sisprime", hasLayout: true },
  { value: "cora", label: "Cora", hasLayout: true },
  { value: "nubank", label: "Nubank", hasLayout: true },
  { value: "btg", label: "BTG Pactual", hasLayout: true },
  { value: "inter", label: "Banco Inter", hasLayout: false },
];

export const BankSelector = ({ value, onValueChange }: BankSelectorProps) => {
  const [open, setOpen] = useState(false);

  const selectedBank = BANKS.find((bank) => bank.value === value);

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-foreground mb-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Selecione o banco
        </div>
      </label>
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span>Layout disponível</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          <span>Em desenvolvimento</span>
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-12 justify-between bg-card border-2 hover:border-primary transition-all"
          >
            {selectedBank ? selectedBank.label : "Escolha seu banco..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover z-50" align="start">
          <Command>
            <CommandInput placeholder="Buscar banco..." />
            <CommandList>
              <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
              <CommandGroup>
                {BANKS.map((bank) => (
                  <CommandItem
                    key={bank.value}
                    value={bank.label}
                    onSelect={() => {
                      onValueChange(bank.value);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === bank.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {bank.label}
                    </div>
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        bank.hasLayout ? "bg-green-500" : "bg-gray-400"
                      )}
                      title={bank.hasLayout ? "Layout disponível" : "Layout em desenvolvimento"}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
