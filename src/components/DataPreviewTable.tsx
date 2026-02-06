import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrendingDown, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

export interface Transaction {
  date: string;
  description: string;
  value: number;
  balance: number;
  type: "credit" | "debit";
}

interface DataPreviewTableProps {
  transactions: Transaction[];
}

type SortField = "date" | "value" | "balance" | "description";
type SortOrder = "asc" | "desc";

export const DataPreviewTable = ({ transactions }: DataPreviewTableProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    
    // Handle different date formats
    // Format: YYYY-MM-DD
    if (dateString.includes("-") && dateString.split("-").length === 3) {
      const [y, m, d] = dateString.split("-");
      if (y && m && d) {
        return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
      }
    }
    
    // Format: DD/MM or DD/MM/YYYY - already in display format
    if (dateString.includes("/")) {
      return dateString;
    }
    
    return dateString;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1 text-primary" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1 text-primary" />
    );
  };

  const filteredAndSortedTransactions = useMemo(() => {
    let filtered = transactions.filter(
      (transaction) =>
        transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.date.includes(searchTerm) ||
        transaction.value.toString().includes(searchTerm)
    );

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "date":
          comparison = a.date.localeCompare(b.date);
          break;
        case "value":
          comparison = a.value - b.value;
          break;
        case "balance":
          comparison = a.balance - b.balance;
          break;
        case "description":
          comparison = a.description.localeCompare(b.description);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [transactions, searchTerm, sortField, sortOrder]);

  if (transactions.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden shadow-lg bg-gradient-card">
      <div className="p-6 border-b bg-gradient-accent space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Dados Extraídos ({filteredAndSortedTransactions.length} de {transactions.length} transações)
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Revise as informações antes de gerar o arquivo OFX
          </p>
        </div>
        
        {/* Search Field */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por descrição, data ou valor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-background border-2 focus:border-primary"
          />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("date")}
                  className="flex items-center hover:bg-accent font-semibold"
                >
                  Data
                  {getSortIcon("date")}
                </Button>
              </TableHead>
              <TableHead className="font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("description")}
                  className="flex items-center hover:bg-accent font-semibold"
                >
                  Descrição
                  {getSortIcon("description")}
                </Button>
              </TableHead>
              <TableHead className="text-right font-semibold">Tipo</TableHead>
              <TableHead className="text-right font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("value")}
                  className="flex items-center ml-auto hover:bg-accent font-semibold"
                >
                  Valor
                  {getSortIcon("value")}
                </Button>
              </TableHead>
              <TableHead className="text-right font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("balance")}
                  className="flex items-center ml-auto hover:bg-accent font-semibold"
                >
                  Saldo
                  {getSortIcon("balance")}
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedTransactions.map((transaction, index) => (
              <TableRow
                key={index}
                className="hover:bg-accent/30 transition-smooth"
              >
                <TableCell className="font-medium">
                  {formatDate(transaction.date)}
                </TableCell>
                <TableCell className="max-w-xs">
                  {transaction.description}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {transaction.type === "credit" ? (
                      <>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-green-600 font-medium">Crédito</span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        <span className="text-red-600 font-medium">Débito</span>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span
                    className={
                      transaction.type === "credit"
                        ? "text-green-600 font-semibold"
                        : "text-red-600 font-semibold"
                    }
                  >
                    {formatCurrency(transaction.value)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatCurrency(transaction.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};
