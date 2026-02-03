import { useState } from "react";
import { useCustomers, useCreateCustomer, useCreateLedgerEntry, useCustomerLedger } from "@/hooks/use-customers";
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
import { Plus, Search, Eye, Wallet, Calendar, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCustomerSchema, insertLedgerEntrySchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  const { data: customers, isLoading } = useCustomers(search);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Customers</h1>
          <p className="text-muted-foreground">Manage client relationships and credit.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="shadow-lg shadow-primary/25">
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
        </Button>
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
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">${(customer.creditLimit / 100).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      "font-mono font-bold px-2 py-1 rounded-lg text-xs",
                      customer.currentBalance > 0 
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    )}>
                      ${(customer.currentBalance / 100).toLocaleString()}
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
      
      {selectedCustomer && (
        <CustomerDetailsDialog 
          customer={selectedCustomer} 
          open={!!selectedCustomer} 
          onOpenChange={(open) => !open && setSelectedCustomer(null)} 
        />
      )}
    </div>
  );
}

function CreateCustomerDialog({ open, onOpenChange }: any) {
  const { toast } = useToast();
  const createCustomer = useCreateCustomer();
  
  const form = useForm({
    resolver: zodResolver(insertCustomerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      creditLimit: 0,
    },
  });

  const onSubmit = async (values: any) => {
    try {
      await createCustomer.mutateAsync(values);
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
              name="creditLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Credit Limit (cents)</FormLabel>
                  <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
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
      await createLedgerEntry.mutateAsync(values);
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
                  ${(customer.currentBalance / 100).toLocaleString()}
                </span>
                <span className="text-xs ml-2 bg-muted px-2 py-0.5 rounded-full">Limit: ${(customer.creditLimit / 100).toLocaleString()}</span>
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
                            <FormLabel>Amount (cents)</FormLabel>
                            <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
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
                        {entry.type === 'credit' ? "-" : "+"}${ (entry.amount / 100).toFixed(2) }
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
