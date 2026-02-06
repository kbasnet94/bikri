import { useState, useRef } from "react";
import { useCustomers, useCreateCustomer, useCreateLedgerEntry, useCustomerLedger } from "@/hooks/use-customers";
import { useCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Eye, Wallet, Calendar, DollarSign, FileText, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCustomerSchema, insertLedgerEntrySchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import Papa from "papaparse";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isBulkLedgerOpen, setIsBulkLedgerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const { formatCurrency, formatCurrencyShort } = useCurrency();

  const { data: customers, isLoading } = useCustomers(search);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Customers</h1>
          <p className="text-muted-foreground">Manage client relationships and credit.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setIsBulkLedgerOpen(true)} data-testid="button-bulk-ledger">
            <Upload className="w-4 h-4 mr-2" />
            Upload Ledger
          </Button>
          <Button variant="outline" onClick={() => setIsBulkUploadOpen(true)} data-testid="button-bulk-customers">
            <Upload className="w-4 h-4 mr-2" />
            Upload Customers
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} className="shadow-lg shadow-primary/25">
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search by name, email, or phone..." 
          className="pl-9 bg-card border-border/60"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Credit Limit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : customers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No customers found.</TableCell>
              </TableRow>
            ) : (
              customers?.map((customer) => (
                <TableRow key={customer.id} className="group hover:bg-muted/5">
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{customer.name}</span>
                      <span className="text-xs text-muted-foreground">{customer.address}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span>{customer.email}</span>
                      <span className="text-muted-foreground">{customer.phone}</span>
                      {customer.panVatNumber && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-pan-vat-${customer.id}`}>PAN/VAT: {customer.panVatNumber}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrencyShort(customer.creditLimit)}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      "font-mono font-bold px-2 py-1 rounded-lg text-xs",
                      customer.currentBalance > 0 
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    )}>
                      {formatCurrencyShort(customer.currentBalance)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedCustomer(customer)}>
                      <Eye className="w-4 h-4 mr-2" />
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateCustomerDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <BulkCustomerUploadDialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen} />
      <BulkLedgerUploadDialog open={isBulkLedgerOpen} onOpenChange={setIsBulkLedgerOpen} customers={customers || []} />
      
      {selectedCustomer && (
        <CustomerDetailsDialog 
          customer={selectedCustomer} 
          open={!!selectedCustomer} 
          onOpenChange={(open: boolean) => !open && setSelectedCustomer(null)} 
        />
      )}
    </div>
  );
}

function CreateCustomerDialog({ open, onOpenChange }: any) {
  const { toast } = useToast();
  const createCustomer = useCreateCustomer();
  const { symbol } = useCurrency();
  
  const form = useForm({
    resolver: zodResolver(insertCustomerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      panVatNumber: "",
      creditLimit: 0,
    },
  });

  const onSubmit = async (values: any) => {
    try {
      const creditLimitInCents = Math.round(values.creditLimit * 100);
      await createCustomer.mutateAsync({ ...values, creditLimit: creditLimitInCents });
      toast({ title: "Customer created successfully" });
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input placeholder="john@example.com" {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="(555) 123-4567" {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Input placeholder="123 Main St..." {...field} value={field.value || ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="panVatNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PAN/VAT Number</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter PAN/VAT number" 
                      inputMode="numeric"
                      {...field} 
                      value={field.value || ''} 
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        field.onChange(val);
                      }}
                      data-testid="input-pan-vat-number"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="creditLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Credit Limit ({symbol})</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={createCustomer.isPending}>
              {createCustomer.isPending ? "Creating..." : "Create Customer"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailsDialog({ customer, open, onOpenChange }: any) {
  const { data: ledger } = useCustomerLedger(customer.id);
  const createLedgerEntry = useCreateLedgerEntry();
  const { toast } = useToast();
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const { formatCurrency, formatCurrencyShort, symbol } = useCurrency();

  const entryForm = useForm({
    resolver: zodResolver(insertLedgerEntrySchema),
    defaultValues: {
      customerId: customer.id,
      type: "credit",
      amount: 0,
      description: "",
    }
  });

  const onEntrySubmit = async (values: any) => {
    try {
      const amountInCents = Math.round(values.amount * 100);
      await createLedgerEntry.mutateAsync({ ...values, amount: amountInCents });
      toast({ title: "Entry added successfully" });
      setIsAddingEntry(false);
      entryForm.reset({ customerId: customer.id, type: "credit", amount: 0, description: "" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="p-6 border-b bg-muted/10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-display font-bold">{customer.name}</h2>
              <p className="text-muted-foreground flex items-center gap-2 mt-1">
                <Wallet className="w-4 h-4" />
                Balance: <span className={customer.currentBalance > 0 ? "text-red-500 font-bold" : "text-green-500 font-bold"}>
                  {formatCurrencyShort(customer.currentBalance)}
                </span>
                <span className="text-xs ml-2 bg-muted px-2 py-0.5 rounded-full">Limit: {formatCurrencyShort(customer.creditLimit)}</span>
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="ledger" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 space-x-6">
              <TabsTrigger 
                value="ledger" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2"
              >
                Ledger History
              </TabsTrigger>
              <TabsTrigger 
                value="info" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2"
              >
                Customer Info
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ledger" className="flex-1 overflow-auto p-6 space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Transaction History</h3>
              <Button size="sm" onClick={() => setIsAddingEntry(!isAddingEntry)} variant={isAddingEntry ? "secondary" : "default"}>
                {isAddingEntry ? "Cancel" : "Add Transaction"}
              </Button>
            </div>

            {isAddingEntry && (
              <Card className="bg-muted/30 border-dashed mb-6 animate-in slide-in-from-top-4 fade-in">
                <div className="p-4">
                  <Form {...entryForm}>
                    <form onSubmit={entryForm.handleSubmit(onEntrySubmit)} className="flex flex-col sm:flex-row gap-4 items-end">
                      <FormField
                        control={entryForm.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem className="flex-1 w-full">
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="credit">Credit (Payment/Deposit)</SelectItem>
                                <SelectItem value="debit">Debit (Charge/Fee)</SelectItem>
                                <SelectItem value="adjustment">Adjustment</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={entryForm.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem className="flex-1 w-full">
                            <FormLabel>Amount ({symbol})</FormLabel>
                            <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={entryForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem className="flex-[2] w-full">
                            <FormLabel>Description</FormLabel>
                            <FormControl><Input placeholder="Check #1234" {...field} value={field.value || ''} /></FormControl>
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={createLedgerEntry.isPending}>Save</Button>
                    </form>
                  </Form>
                </div>
              </Card>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No transactions found.</TableCell></TableRow>
                ) : (
                  ledger?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{format(new Date(entry.entryDate!), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="capitalize text-xs font-medium text-muted-foreground">{entry.type}</TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-medium",
                        entry.type === 'credit' ? "text-green-600" : "text-foreground"
                      )}>
                        {entry.type === 'credit' ? "-" : "+"}{formatCurrency(entry.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="info" className="p-6">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="font-medium text-muted-foreground mb-2">Contact Details</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-muted-foreground" /> {customer.email || 'N/A'}</div>
                  <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> {customer.phone || 'N/A'}</div>
                  <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /> PAN/VAT: {customer.panVatNumber || 'N/A'}</div>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-muted-foreground mb-2">Address</h4>
                <p>{customer.address || 'No address on file.'}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function BulkCustomerUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { symbol } = useCurrency();

  const expectedHeaders = ['name', 'email', 'phone', 'address', 'panVatNumber', 'creditLimit'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsedRows(results.data as any[]);
      },
      error: () => {
        toast({ title: "Failed to parse CSV", variant: "destructive" });
      }
    });
  };

  const handleUpload = async () => {
    if (parsedRows.length === 0) return;
    setIsUploading(true);
    try {
      const res = await fetch('/api/bulk/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        const errorCount = data.errors?.length || 0;
        const firstErrors = (data.errors || []).slice(0, 5).map((e: any) => `Row ${e.row}: ${e.message}`).join('\n');
        toast({ title: `${errorCount} row(s) have errors`, description: firstErrors, variant: "destructive" });
        return;
      }
      let msg = `${data.created} customer(s) created successfully.`;
      if (data.duplicatePhones?.length > 0) {
        msg += ` ${data.duplicatePhones.length} duplicate phone number(s) found (still uploaded).`;
      }
      toast({ title: msg });
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
      resetAndClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const resetAndClose = () => {
    setParsedRows([]);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    onOpenChange(false);
  };

  const previewRows = parsedRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Customers</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium">CSV Headers:</p>
            <code className="text-xs bg-muted px-2 py-1 rounded block" data-testid="text-csv-headers">
              {expectedHeaders.join(', ')}
            </code>
            <p className="text-muted-foreground text-xs mt-1">
              <strong>name</strong> is required. <strong>creditLimit</strong> is in currency units (e.g. 1500 = {symbol}1,500). 
              <strong> panVatNumber</strong> must be numeric only. <strong>phone</strong> is used for duplicate detection.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              data-testid="input-csv-customers"
            />
          </div>

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{fileName} - {parsedRows.length} row(s) parsed</p>
                <p className="text-xs text-muted-foreground">Showing first {Math.min(5, parsedRows.length)} rows</p>
              </div>
              <div className="border rounded-lg overflow-auto max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {expectedHeaders.map(h => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i} data-testid={`preview-row-${i}`}>
                        {expectedHeaders.map(h => (
                          <TableCell key={h} className="text-xs py-1">{row[h] || '-'}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.length > 5 && (
                <p className="text-xs text-muted-foreground">...and {parsedRows.length - 5} more row(s)</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetAndClose} data-testid="button-cancel-bulk">Cancel</Button>
            <Button
              onClick={handleUpload}
              disabled={parsedRows.length === 0 || isUploading}
              data-testid="button-submit-bulk-customers"
            >
              {isUploading ? "Uploading..." : `Upload ${parsedRows.length} Customer(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkLedgerUploadDialog({ open, onOpenChange, customers }: { open: boolean; onOpenChange: (open: boolean) => void; customers: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { symbol } = useCurrency();

  const expectedHeaders = ['customerRefID', 'type', 'amount', 'description', 'entryDate'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsedRows(results.data as any[]);
      },
      error: () => {
        toast({ title: "Failed to parse CSV", variant: "destructive" });
      }
    });
  };

  const handleUpload = async () => {
    if (parsedRows.length === 0) return;
    setIsUploading(true);
    try {
      const res = await fetch('/api/bulk/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        const errorCount = data.errors?.length || 0;
        const firstErrors = (data.errors || []).slice(0, 5).map((e: any) => `Row ${e.row}: ${e.message}`).join('\n');
        toast({ title: `${errorCount} row(s) have errors`, description: firstErrors, variant: "destructive" });
        return;
      }
      toast({ title: `${data.created} ledger entry/entries created successfully.` });
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.ledger.list.path] });
      resetAndClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const resetAndClose = () => {
    setParsedRows([]);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    onOpenChange(false);
  };

  const previewRows = parsedRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Ledger Entries</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium">CSV Headers:</p>
            <code className="text-xs bg-muted px-2 py-1 rounded block" data-testid="text-ledger-csv-headers">
              {expectedHeaders.join(', ')}
            </code>
            <p className="text-muted-foreground text-xs mt-1">
              <strong>customerRefID</strong> = the customer's database ID (visible in the Customers table below).
              <strong> amount</strong> is in currency units (e.g. 500 = {symbol}500).
              <strong> entryDate</strong> format: YYYY-MM-DD.
            </p>
          </div>

          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Only <strong>credit</strong> (payment/deposit) and <strong>adjustment</strong> entries can be uploaded. 
              Purchase entries are automatically created when orders are placed.
            </p>
          </div>

          {customers.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">View Customer IDs for reference</summary>
              <div className="mt-2 max-h-32 overflow-auto border rounded p-2 space-y-1">
                {customers.map((c: any) => (
                  <div key={c.id} className="flex gap-2">
                    <span className="font-mono font-bold">{c.id}</span>
                    <span>{c.name}</span>
                    {c.phone && <span className="text-muted-foreground">({c.phone})</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="flex items-center gap-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              data-testid="input-csv-ledger"
            />
          </div>

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{fileName} - {parsedRows.length} row(s) parsed</p>
                <p className="text-xs text-muted-foreground">Showing first {Math.min(5, parsedRows.length)} rows</p>
              </div>
              <div className="border rounded-lg overflow-auto max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {expectedHeaders.map(h => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i} data-testid={`ledger-preview-row-${i}`}>
                        {expectedHeaders.map(h => (
                          <TableCell key={h} className="text-xs py-1">{row[h] || '-'}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.length > 5 && (
                <p className="text-xs text-muted-foreground">...and {parsedRows.length - 5} more row(s)</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetAndClose} data-testid="button-cancel-bulk-ledger">Cancel</Button>
            <Button
              onClick={handleUpload}
              disabled={parsedRows.length === 0 || isUploading}
              data-testid="button-submit-bulk-ledger"
            >
              {isUploading ? "Uploading..." : `Upload ${parsedRows.length} Entry/Entries`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
