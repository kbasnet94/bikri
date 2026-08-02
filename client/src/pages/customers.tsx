import { useState, useRef, useEffect, useMemo } from "react";
import { useCustomersWithAging, useAgingTotals, useCustomer, useCreateCustomer, useCreateLedgerEntry, useCustomerLedger, useUpdateCustomerType, useBulkUpdateCustomerType, useUpdateCustomerDiscount, useUpdateCustomerBillingAddress } from "@/hooks/use-customers";
import { usualDiscountLabel } from "@/lib/usual-discount";
import { useCurrency } from "@/hooks/use-currency";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase";
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
import { Plus, Search, Eye, Wallet, Calendar, DollarSign, FileText, Upload, AlertCircle, CheckCircle2, Download, Clock, CalendarClock, AlertTriangle } from "lucide-react";
import {
  getCurrentFiscalYear,
  getFiscalYearDates,
  getFiscalYearLabel,
  getFiscalYearsWithData,
} from "@/lib/fiscal-year";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCustomerSchema, insertLedgerEntrySchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomerTypes } from "@/hooks/use-customer-types";
import { Badge } from "@/components/ui/badge";
import { api } from "@shared/routes";
import Papa from "papaparse";
import { ledgerBalanceDelta, isBalanceReducing } from '@/lib/ledger-math';
import { CustomerLocationsSection } from "@/components/customer-locations";
import { findUntypedRows } from "@/lib/csv-customer-types";

export default function Customers() {
  const { user } = useAuth();
  const canEditLedger = canAccess(user?.roles ?? [], "ledger-edit");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isBulkLedgerOpen, setIsBulkLedgerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const { formatCurrency, formatCurrencyShort, formatAmountWhole } = useCurrency();

  const [typeFilter, setTypeFilter] = useState<string>("all"); // 'all' | 'none' | String(typeId)

  const { data: customers, isLoading } = useCustomersWithAging(search, typeFilter !== 'all');
  const { data: agingTotals } = useAgingTotals();

  const { data: customerTypes } = useCustomerTypes();
  const updateCustomerType = useUpdateCustomerType();
  const { toast } = useToast();

  const handleQuickSetType = async (customerId: number, typeId: number) => {
    try {
      await updateCustomerType.mutateAsync({ customerId, customerTypeId: typeId });
      toast({ title: "Customer type updated" });
    } catch (error: any) {
      toast({ title: "Failed to update type", description: error.message, variant: "destructive" });
    }
  };

  const bulkUpdateCustomerType = useBulkUpdateCustomerType();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTypeId, setBulkTypeId] = useState<string>("");

  const filteredCustomers = (customers || []).filter(c => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'none') return !c.customer_type_id;
    return c.customer_type_id === parseInt(typeFilter);
  });

  const changeTypeFilter = (v: string) => {
    setTypeFilter(v);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filteredCustomers.length > 0 && filteredCustomers.every(c => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredCustomers.map(c => c.id)));
  };

  const handleBulkAssign = async () => {
    if (!bulkTypeId || selectedIds.size === 0) return;
    // Only apply to rows still visible under the current filter/search —
    // selection can go stale when quick-set or search removes rows.
    const visibleSelected = filteredCustomers
      .filter(c => selectedIds.has(c.id))
      .map(c => c.id);
    if (visibleSelected.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    try {
      await bulkUpdateCustomerType.mutateAsync({
        customerIds: visibleSelected,
        customerTypeId: parseInt(bulkTypeId),
      });
      toast({ title: `${visibleSelected.length} customer(s) updated` });
      setSelectedIds(new Set());
      setBulkTypeId("");
    } catch (error: any) {
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Customers</h1>
          <p className="text-muted-foreground">Manage client relationships and credit.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEditLedger && (
            <Button variant="outline" onClick={() => setIsBulkLedgerOpen(true)} data-testid="button-bulk-ledger">
              <Upload className="w-4 h-4 mr-2" />
              Upload Ledger
            </Button>
          )}
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

      {/* A/R KPI Cards — business-wide totals from the customer_aging view,
          independent of the search/type filter below */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-xl font-bold" data-testid="kpi-total-outstanding">{formatCurrency(agingTotals?.total_unpaid ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">0–30 days</p>
              <p className="text-xl font-bold" data-testid="kpi-bucket-0-30">{formatCurrency(agingTotals?.bucket_0_30 ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <CalendarClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">31–60 days</p>
              <p className="text-xl font-bold" data-testid="kpi-bucket-31-60">{formatCurrency(agingTotals?.bucket_31_60 ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">61–90 days</p>
              <p className="text-xl font-bold" data-testid="kpi-bucket-61-90">{formatCurrency(agingTotals?.bucket_61_90 ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">90+ days</p>
              <p className="text-xl font-bold" data-testid="kpi-bucket-90-plus">{formatCurrency(agingTotals?.bucket_90_plus ?? 0)}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            className="pl-9 bg-card border-border/60"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(customerTypes || []).length > 0 && (
          <Select value={typeFilter} onValueChange={changeTypeFilter}>
            <SelectTrigger className="w-44 bg-card" data-testid="select-type-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="none">Uncategorized</SelectItem>
              {customerTypes!.map(t => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {typeFilter !== 'all' && (
          <Button
            variant={selectMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
            data-testid="button-select-mode"
          >
            {selectMode ? "Done" : "Select"}
          </Button>
        )}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3" data-testid="bulk-action-bar">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Select value={bulkTypeId} onValueChange={setBulkTypeId}>
            <SelectTrigger className="w-44 h-9 bg-card" data-testid="select-bulk-type">
              <SelectValue placeholder="Assign type..." />
            </SelectTrigger>
            <SelectContent>
              {(customerTypes || []).map(t => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleBulkAssign}
            disabled={!bulkTypeId || bulkUpdateCustomerType.isPending}
            data-testid="button-bulk-assign"
          >
            {bulkUpdateCustomerType.isPending ? "Applying..." : `Apply to ${selectedIds.size} customer(s)`}
          </Button>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {selectMode && (
                <TableHead className="w-10">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} data-testid="checkbox-select-all" />
                </TableHead>
              )}
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right whitespace-nowrap">0–30 d</TableHead>
              <TableHead className="text-right whitespace-nowrap">31–60 d</TableHead>
              <TableHead className="text-right whitespace-nowrap">61–90 d</TableHead>
              <TableHead className="text-right whitespace-nowrap">90+ d</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={selectMode ? 10 : 9} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={selectMode ? 10 : 9} className="h-24 text-center text-muted-foreground">No customers found.</TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="group hover:bg-muted/5">
                  {selectMode && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(customer.id)}
                        onCheckedChange={() => toggleSelected(customer.id)}
                        data-testid={`checkbox-customer-${customer.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span>{customer.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{customer.address}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span>{customer.email}</span>
                      <span className="text-muted-foreground">{customer.phone}</span>
                      {customer.pan_vat_number && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-pan-vat-${customer.id}`}>PAN/VAT: {customer.pan_vat_number}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(customerTypes || []).length > 0 ? (
                      <Select
                        value={customer.customer_type_id ? String(customer.customer_type_id) : ""}
                        onValueChange={(v) => handleQuickSetType(customer.id, parseInt(v))}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-7 w-36 text-xs",
                            !customer.customer_type_id && "text-muted-foreground italic"
                          )}
                          data-testid={`select-type-${customer.id}`}
                        >
                          <SelectValue placeholder="Uncategorized" />
                        </SelectTrigger>
                        <SelectContent>
                          {customerTypes!.map(t => (
                            <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        {customer.customer_type?.name || "Uncategorized"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      "font-mono font-bold px-2 py-1 rounded-lg text-xs",
                      customer.current_balance > 0
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    )}>
                      {formatAmountWhole(customer.current_balance)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {customer.aging.bucket_0_30 > 0 ? formatAmountWhole(customer.aging.bucket_0_30) : "—"}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-mono text-xs",
                    customer.aging.bucket_31_60 > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                  )}>
                    {customer.aging.bucket_31_60 > 0 ? formatAmountWhole(customer.aging.bucket_31_60) : "—"}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-mono text-xs",
                    customer.aging.bucket_61_90 > 0 ? "text-orange-700 dark:text-orange-400" : "text-muted-foreground"
                  )}>
                    {customer.aging.bucket_61_90 > 0 ? formatAmountWhole(customer.aging.bucket_61_90) : "—"}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-mono text-xs font-semibold",
                    customer.aging.bucket_90_plus > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"
                  )}>
                    {customer.aging.bucket_90_plus > 0 ? formatAmountWhole(customer.aging.bucket_90_plus) : "—"}
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
  const { data: customerTypes } = useCustomerTypes();
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [typeError, setTypeError] = useState(false);
  const [usualDiscount, setUsualDiscount] = useState<string>("");
  const [billingAddress, setBillingAddress] = useState<string>("");
  const { user } = useAuth();
  const canEditLedger = canAccess(user?.roles ?? [], "ledger-edit");

  const customerFormSchema = insertCustomerSchema.extend({
    phone: z.string().optional().refine(
      (val) => !val || /^\d{10}$/.test(val),
      { message: "Phone number must be exactly 10 digits" }
    ),
  });

  const form = useForm({
    resolver: zodResolver(customerFormSchema),
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
    if ((customerTypes || []).length > 0 && (!selectedTypeId || selectedTypeId === 'none')) {
      setTypeError(true);
      return;
    }
    try {
      const creditLimitInCents = Math.round(values.creditLimit * 100);
      const defaultDiscountPct = usualDiscount === '' || usualDiscount == null ? null : parseFloat(usualDiscount);
      if (defaultDiscountPct != null && (isNaN(defaultDiscountPct) || defaultDiscountPct < 0 || defaultDiscountPct >= 100)) {
        toast({ title: "Discount must be between 0 and 99.99", variant: "destructive" });
        return;
      }
      await createCustomer.mutateAsync({
        ...values,
        billingAddress: billingAddress.trim() || undefined,
        creditLimit: creditLimitInCents,
        customerTypeId: selectedTypeId && selectedTypeId !== 'none' ? parseInt(selectedTypeId) : null,
        defaultDiscountPct,
      });
      toast({ title: "Customer created successfully" });
      onOpenChange(false);
      form.reset();
      setSelectedTypeId("");
      setTypeError(false);
      setUsualDiscount("");
      setBillingAddress("");
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
            {(customerTypes || []).length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Customer Type *</label>
                <Select
                  value={selectedTypeId}
                  onValueChange={(v) => { setSelectedTypeId(v); setTypeError(false); }}
                >
                  <SelectTrigger data-testid="select-customer-type" className={typeError ? "border-destructive" : undefined}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes!.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeError && (
                  <p className="text-sm font-medium text-destructive" data-testid="error-customer-type">
                    Customer type is required
                  </p>
                )}
              </div>
            )}
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
                    <FormControl>
                      <Input 
                        placeholder="98XXXXXXXX" 
                        maxLength={10}
                        {...field} 
                        value={field.value || ''} 
                        onChange={(e) => field.onChange(e.target.value.replace(/[^0-9]/g, ''))}
                      />
                    </FormControl>
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
            <FormItem>
              <FormLabel>Billing Address (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Registered address for VAT bills / invoices"
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  data-testid="input-billing-address"
                />
              </FormControl>
            </FormItem>
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
            <div className="grid grid-cols-2 gap-4">
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
              <FormItem>
                <FormLabel>Usual Discount % (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="99.99"
                    placeholder="e.g. 5"
                    value={usualDiscount}
                    onChange={(e) => setUsualDiscount(e.target.value)}
                    data-testid="input-usual-discount"
                    disabled={!canEditLedger}
                  />
                </FormControl>
              </FormItem>
            </div>
            <Button type="submit" className="w-full" disabled={createCustomer.isPending}>
              {createCustomer.isPending ? "Creating..." : "Create Customer"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailsDialog({ customer: customerProp, open, onOpenChange }: any) {
  const { data: freshCustomer } = useCustomer(customerProp.id);
  const customer = freshCustomer || customerProp;
  const { data: ledger } = useCustomerLedger(customer.id);
  const createLedgerEntry = useCreateLedgerEntry();
  const { toast } = useToast();
  const { data: customerTypes } = useCustomerTypes();
  const updateCustomerType = useUpdateCustomerType();
  const updateCustomerDiscount = useUpdateCustomerDiscount();

  const handleSetType = async (typeId: number) => {
    try {
      await updateCustomerType.mutateAsync({ customerId: customer.id, customerTypeId: typeId });
      toast({ title: "Customer type updated" });
    } catch (error: any) {
      toast({ title: "Failed to update type", description: error.message, variant: "destructive" });
    }
  };
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(String(getCurrentFiscalYear()));
  const { formatCurrency, formatCurrencyShort, symbol } = useCurrency();
  const { user } = useAuth();
  const canEditLedger = canAccess(user?.roles ?? [], "ledger-edit");
  const ledgerEndRef = useRef<HTMLDivElement>(null);

  const updateBillingAddress = useUpdateCustomerBillingAddress();
  const [billingInput, setBillingInput] = useState<string>(customer.billing_address ?? "");
  useEffect(() => {
    setBillingInput(customer.billing_address ?? "");
  }, [customer.billing_address]);

  const handleSaveBilling = async () => {
    try {
      await updateBillingAddress.mutateAsync({ customerId: customer.id, billingAddress: billingInput.trim() || null });
      toast({ title: "Billing address updated" });
    } catch (error: any) {
      toast({ title: "Failed to update billing address", description: error.message, variant: "destructive" });
    }
  };

  const [discountInput, setDiscountInput] = useState<string>(
    customer.default_discount_pct == null ? "" : String(customer.default_discount_pct)
  );
  useEffect(() => {
    setDiscountInput(customer.default_discount_pct == null ? "" : String(customer.default_discount_pct));
  }, [customer.default_discount_pct]);

  const handleSaveDiscount = async () => {
    const pct = discountInput === '' ? null : parseFloat(discountInput);
    if (pct != null && (isNaN(pct) || pct < 0 || pct >= 100)) {
      toast({ title: "Discount must be between 0 and 99.99", variant: "destructive" });
      return;
    }
    try {
      await updateCustomerDiscount.mutateAsync({ customerId: customer.id, pct });
      toast({ title: "Usual discount updated" });
    } catch (error: any) {
      toast({ title: "Failed to update discount", description: error.message, variant: "destructive" });
    }
  };

  // Build fiscal year list from actual ledger entry dates (only years with data + current)
  // Parse date strings safely to local dates to avoid UTC timezone issues
  const availableFiscalYears = getFiscalYearsWithData(
    (ledger || []).map(e => {
      const ds = e.entry_date!;
      if (ds.length === 10 && ds[4] === '-') {
        const [y, m, d] = ds.split('-').map(Number);
        return new Date(y, m - 1, d);
      }
      return new Date(ds);
    })
  );

  // Filter ledger by fiscal year and compute opening balance
  const isAllTime = selectedFiscalYear === 'all';
  const fyDates = !isAllTime ? getFiscalYearDates(Number(selectedFiscalYear)) : null;

  // Normalize a date string to a local-midnight Date for safe comparison.
  // Handles both "yyyy-MM-dd" (date-only) and full ISO timestamps.
  const toLocalDate = (dateStr: string): Date => {
    // If it's a date-only string (yyyy-MM-dd), parse parts directly to avoid UTC interpretation
    if (dateStr.length === 10 && dateStr[4] === '-') {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    // For full ISO timestamps, just create the Date (JS handles timezone)
    const d = new Date(dateStr);
    // Normalize to local midnight for date-only comparison
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const filteredLedger = ledger?.filter(entry => {
    if (isAllTime || !fyDates) return true;
    const entryDate = toLocalDate(entry.entry_date!);
    const startDate = new Date(fyDates.start.getFullYear(), fyDates.start.getMonth(), fyDates.start.getDate());
    const endDate = new Date(fyDates.end.getFullYear(), fyDates.end.getMonth(), fyDates.end.getDate());
    return entryDate >= startDate && entryDate <= endDate;
  }) || [];

  // Opening balance = sum of all entries before fiscal year start
  // Debits/purchases increase balance (money owed), credits decrease it
  const openingBalance = (!isAllTime && fyDates && ledger) 
    ? ledger.reduce((sum, entry) => {
        const entryDate = toLocalDate(entry.entry_date!);
        const startDate = new Date(fyDates.start.getFullYear(), fyDates.start.getMonth(), fyDates.start.getDate());
        if (entryDate < startDate) {
          return sum + ledgerBalanceDelta(entry.type, entry.amount);
        }
        return sum;
      }, 0)
    : null;

  // Auto-scroll to the bottom of the ledger so the latest entries are visible
  useEffect(() => {
    // Small delay to let the DOM render the table rows first
    const timer = setTimeout(() => {
      if (ledgerEndRef.current) {
        ledgerEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [filteredLedger.length, selectedFiscalYear, open]);

  const entryForm = useForm({
    resolver: zodResolver(insertLedgerEntrySchema),
    defaultValues: {
      customerId: customer.id,
      type: "credit",
      amount: 0,
      description: "",
    }
  });

  const [entryDate, setEntryDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const onEntrySubmit = async (values: any) => {
    try {
      const amountInCents = Math.round(values.amount * 100);
      await createLedgerEntry.mutateAsync({ ...values, amount: amountInCents, entryDate: new Date(entryDate).toISOString() });
      toast({ title: "Entry added successfully" });
      setIsAddingEntry(false);
      entryForm.reset({ customerId: customer.id, type: "credit", amount: 0, description: "" });
      setEntryDate(format(new Date(), "yyyy-MM-dd"));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const downloadLedgerXLSX = async (exportMode: 'fiscal' | 'all' = 'fiscal') => {
    // Exports follow the app's balance convention: entries tied to cancelled
    // orders are excluded (spec 2026-08-02). The in-app dialog still shows them.
    const { data: cancelledRows, error: cancelledErr } = await supabase
      .from('orders')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('status', 'cancelled');
    if (cancelledErr) {
      toast({ title: "Export failed", description: cancelledErr.message, variant: "destructive" });
      return;
    }
    const cancelledIds = new Set((cancelledRows || []).map((o) => o.id));
    const notCancelled = (e: { order_id: number | null }) =>
      e.order_id === null || !cancelledIds.has(e.order_id);

    const entriesToExport = (exportMode === 'all' ? (ledger || []) : filteredLedger).filter(notCancelled);

    const exportOpeningBalance = (exportMode === 'fiscal' && openingBalance !== null && fyDates && ledger)
      ? ledger.reduce((sum, entry) => {
          if (!notCancelled(entry)) return sum;
          const entryDate = toLocalDate(entry.entry_date!);
          const startDate = new Date(fyDates.start.getFullYear(), fyDates.start.getMonth(), fyDates.start.getDate());
          return entryDate < startDate ? sum + ledgerBalanceDelta(entry.type, entry.amount) : sum;
        }, 0)
      : null;

    if (entriesToExport.length === 0 && (exportMode === 'all' || exportOpeningBalance === null || exportOpeningBalance === 0)) {
      toast({ title: "No data to export", description: "This customer has no transactions yet.", variant: "destructive" });
      return;
    }

    // Accounting format (whole numbers, negatives in parentheses) and short date — matches the formatted ledger template.
    const ACCT_FMT = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';
    const DATE_FMT = 'mm-dd-yy';
    // ExcelJS serializes Date objects as UTC; a Nepal-local-midnight date (UTC+5:45)
    // would shift back a calendar day. Pin to UTC-midnight of the intended day.
    const toExcelDate = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const fyLabel = (exportMode === 'fiscal' && !isAllTime) ? getFiscalYearLabel(Number(selectedFiscalYear)) : null;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.columns = [{ width: 11.14 }, { width: 48.29 }, { width: 18.86 }, { width: 11.57 }, { width: 11.71 }];

    // Title block
    ws.getCell('A1').value = user?.businessName || 'Ledger Report';
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A3').value = 'LEDGER REPORT - SUMMARY';
    ws.getCell('A3').font = { bold: true, size: 8.5 };
    ws.getCell('A5').value = `${customer.name} Ledger - As of ${format(new Date(), 'MMM dd, yyyy')}`;
    ws.getCell('A5').font = { bold: true, size: 8.5 };

    // Column headers (row 7)
    ['Date', 'Description', 'dr_amount', 'cr_amount', 'Balance'].forEach((h, i) => {
      const cell = ws.getRow(7).getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 11 };
    });

    let r = 8;
    let firstDataRow = 0;
    const writeRow = (dateVal: Date | null, desc: string, dr: number | null, cr: number | null) => {
      if (firstDataRow === 0) firstDataRow = r;
      const row = ws.getRow(r);
      if (dateVal) { row.getCell(1).value = dateVal; row.getCell(1).numFmt = DATE_FMT; }
      row.getCell(2).value = desc;
      if (dr !== null) row.getCell(3).value = dr;
      if (cr !== null) row.getCell(4).value = cr;
      row.getCell(3).numFmt = ACCT_FMT;
      row.getCell(4).numFmt = ACCT_FMT;
      const bal = row.getCell(5);
      // Live running balance: opening row seeds it, every later row builds on the one above.
      bal.value = { formula: r === firstDataRow ? `C${r}-D${r}` : `E${r - 1}+C${r}-D${r}` };
      bal.numFmt = ACCT_FMT;
      r++;
    };

    // Opening balance row (fiscal-year exports only)
    if (exportMode === 'fiscal' && exportOpeningBalance !== null && fyDates) {
      const ob = exportOpeningBalance / 100;
      writeRow(toExcelDate(fyDates.start), `Opening Balance (FY ${fyLabel})`, exportOpeningBalance > 0 ? ob : null, exportOpeningBalance < 0 ? Math.abs(ob) : null);
    }

    // Ledger entries: credits/payments reduce balance (cr), everything else increases it (dr).
    entriesToExport.forEach((entry) => {
      const amt = entry.amount / 100;
      const isCredit = isBalanceReducing(entry.type);
      writeRow(toExcelDate(toLocalDate(entry.entry_date!)), entry.description || '-', isCredit ? null : amt, isCredit ? amt : null);
    });

    // Closing balance — bold, references the last running-balance cell, one blank row below.
    const lastDataRow = r - 1;
    if (firstDataRow > 0 && lastDataRow >= firstDataRow) {
      const closeRow = ws.getRow(r + 1);
      closeRow.getCell(2).value = 'Closing Balance';
      closeRow.getCell(2).font = { bold: true, size: 11 };
      const cb = closeRow.getCell(5);
      cb.value = { formula: `E${lastDataRow}` };
      cb.numFmt = ACCT_FMT;
      cb.font = { bold: true, size: 11 };
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fySuffix = fyLabel ? ` ${fyLabel.replace('/', '-')}` : ' all-time';
    const safeName = customer.name.replace(/[\\/:*?"<>|]/g, '').trim();
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeName} Ledger${fySuffix} ${format(new Date(), 'yyyyMMdd')}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Ledger downloaded successfully" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="p-6 border-b bg-muted/10">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-display font-bold">{customer.name}</h2>
                {(customerTypes || []).length > 0 ? (
                  <Select
                    value={customer.customer_type_id ? String(customer.customer_type_id) : ""}
                    onValueChange={(v) => handleSetType(parseInt(v))}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-7 w-36 text-xs",
                        !customer.customer_type_id && "text-muted-foreground italic"
                      )}
                      data-testid="select-detail-customer-type"
                    >
                      <SelectValue placeholder="Uncategorized" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerTypes!.map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : customer.customer_type ? (
                  <Badge variant="secondary" className="text-xs">{customer.customer_type.name}</Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground flex items-center gap-2 mt-1">
                <Wallet className="w-4 h-4" />
                Balance: <span className={customer.current_balance > 0 ? "text-red-500 font-bold" : "text-green-500 font-bold"}>
                  {formatCurrencyShort(customer.current_balance)}
                </span>
                <span className="text-xs ml-2 bg-muted px-2 py-0.5 rounded-full">Limit: {formatCurrencyShort(customer.credit_limit)}</span>
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
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Transaction History</h3>
                <Button
                  size="sm"
                  onClick={() => setIsAddingEntry(!isAddingEntry)}
                  variant={isAddingEntry ? "secondary" : "default"}
                  disabled={!canEditLedger}
                >
                  {isAddingEntry ? "Cancel" : "Add Transaction"}
                </Button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Select value={selectedFiscalYear} onValueChange={setSelectedFiscalYear}>
                    <SelectTrigger className="w-[160px] h-8" data-testid="select-fiscal-year">
                      <SelectValue placeholder="Fiscal Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      {availableFiscalYears.map(fy => (
                        <SelectItem key={fy.bsYear} value={String(fy.bsYear)}>
                          FY {fy.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 ml-auto">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => downloadLedgerXLSX('fiscal')}
                    disabled={filteredLedger.length === 0 && (openingBalance === null || openingBalance === 0)}
                    data-testid="button-download-ledger-fy"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {isAllTime ? 'Download Ledger (All Time)' : `Download Ledger FY ${getFiscalYearLabel(Number(selectedFiscalYear))}`}
                  </Button>
                  {!isAllTime && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => downloadLedgerXLSX('all')}
                      disabled={!ledger || ledger.length === 0}
                      data-testid="button-download-ledger-all"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      All Time
                    </Button>
                  )}
                </div>
              </div>
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
                        render={({ field }) => {
                          const entryType = entryForm.watch("type");
                          return (
                            <FormItem className="flex-1 w-full">
                              <FormLabel>Amount ({symbol})</FormLabel>
                              <FormControl><Input type="number" step="0.01" min={entryType === "adjustment" ? undefined : "0"} placeholder="0.00" {...field} value={field.value ?? ''} onChange={e => { const val = e.target.value; if (val === '' || val === '-') { field.onChange(val as any); return; } field.onChange(parseFloat(val) || 0); }} onBlur={() => { if (field.value === '' || field.value === '-') field.onChange(0); }} /></FormControl>
                            </FormItem>
                          );
                        }}
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
                      <div className="space-y-2 w-full sm:w-auto">
                        <FormLabel>Date</FormLabel>
                        <Input 
                          type="date" 
                          value={entryDate} 
                          onChange={(e) => setEntryDate(e.target.value)} 
                          className="w-[140px]"
                        />
                      </div>
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
                {filteredLedger.length === 0 && openingBalance === null ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No transactions found.</TableCell></TableRow>
                ) : (
                  <>
                    {openingBalance !== null && (
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell className="font-mono text-xs">{fyDates ? format(fyDates.start, 'MMM dd, yyyy') : '-'}</TableCell>
                        <TableCell>Opening Balance</TableCell>
                        <TableCell className="text-xs text-muted-foreground">—</TableCell>
                        <TableCell className={cn(
                          "text-right font-mono font-medium",
                          openingBalance < 0 ? "text-green-600" : openingBalance > 0 ? "text-red-500" : "text-foreground"
                        )}>
                          {openingBalance === 0 ? formatCurrency(0) : openingBalance > 0 ? `+${formatCurrency(openingBalance)}` : `-${formatCurrency(Math.abs(openingBalance))}`}
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredLedger.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">{format(new Date(entry.entry_date!), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>{entry.description || "-"}</TableCell>
                        <TableCell className="capitalize text-xs font-medium text-muted-foreground">{entry.type}</TableCell>
                        <TableCell className={cn(
                          "text-right font-mono font-medium",
                          isBalanceReducing(entry.type) ? "text-green-600" : "text-foreground"
                        )}>
                          {isBalanceReducing(entry.type) ? "-" : "+"}{formatCurrency(entry.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
            <div ref={ledgerEndRef} />
          </TabsContent>

          <TabsContent value="info" className="p-6">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="font-medium text-muted-foreground mb-2">Contact Details</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-muted-foreground" /> {customer.email || 'N/A'}</div>
                  <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> {customer.phone || 'N/A'}</div>
                  <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /> PAN/VAT: {customer.pan_vat_number || 'N/A'}</div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    {canEditLedger ? (
                      <div className="flex items-center gap-2">
                        <span>Usual discount:</span>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="99.99"
                          className="w-20 h-7 text-xs"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          data-testid="input-detail-usual-discount"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={handleSaveDiscount}
                          disabled={updateCustomerDiscount.isPending}
                          data-testid="button-save-usual-discount"
                        >
                          {updateCustomerDiscount.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    ) : (
                      <span data-testid="text-usual-discount">{usualDiscountLabel(customer.default_discount_pct) ?? '—'}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-muted-foreground mb-2">Address</h4>
                  <p>{customer.address || 'No address on file.'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-muted-foreground mb-2">Billing Address</h4>
                  {canEditLedger ? (
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 text-sm"
                        placeholder="Registered address for VAT bills"
                        value={billingInput}
                        onChange={(e) => setBillingInput(e.target.value)}
                        data-testid="input-detail-billing-address"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={handleSaveBilling}
                        disabled={updateBillingAddress.isPending}
                        data-testid="button-save-billing-address"
                      >
                        {updateBillingAddress.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <p>{customer.billing_address || '—'}</p>
                  )}
                </div>
                <CustomerLocationsSection customerId={customer.id} customer={customer} />
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
  const { user } = useAuth();
  const { data: customerTypes } = useCustomerTypes();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { symbol } = useCurrency();

  const expectedHeaders = ['name', 'email', 'phone', 'address', 'panVatNumber', 'creditLimit', 'customerType'];

  const previewRows = parsedRows.slice(0, 5);

  const untypedRowIndexes = useMemo(
    () => findUntypedRows(parsedRows, (customerTypes || []).map(t => t.name)),
    [parsedRows, customerTypes]
  );
  const untypedSet = new Set(untypedRowIndexes);

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
    if (parsedRows.length === 0 || !user?.businessId) return;
    setIsUploading(true);

    const errors: string[] = [];
    let created = 0;
    const duplicatePhones: string[] = [];
    const seenPhones = new Set<string>();

    try {
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const name = row.name?.trim();
        const email = row.email?.trim() || null;
        const phone = row.phone?.trim() || null;
        const address = row.address?.trim() || null;
        const panVatNumber = row.panVatNumber?.trim() || null;
        const creditLimit = Math.round(parseFloat(row.creditLimit || '0') * 100);
        const customerTypeName = row.customerType?.trim() || null;

        // Match customer type name to ID
        let customerTypeId: number | null = null;
        if (customerTypeName && customerTypes) {
          const match = customerTypes.find(t => t.name.toLowerCase() === customerTypeName.toLowerCase());
          if (match) {
            customerTypeId = match.id;
          }
          // If no match found, silently skip (don't block the row)
        }

        // Validate: name is required
        if (!name) {
          errors.push(`Row ${i + 1}: missing name`);
          continue;
        }

        // Validate: phone must be exactly 10 digits if provided
        if (phone && !/^\d{10}$/.test(phone)) {
          errors.push(`Row ${i + 1}: phone must be exactly 10 digits`);
          continue;
        }

        // Track duplicate phones within this upload batch
        if (phone) {
          if (seenPhones.has(phone)) {
            duplicatePhones.push(phone);
          }
          seenPhones.add(phone);
        }

        try {
          const { error: insertError } = await supabase
            .from('customers')
            .insert({
              name,
              email,
              phone,
              address,
              pan_vat_number: panVatNumber,
              credit_limit: creditLimit,
              current_balance: 0,
              business_id: user.businessId,
              customer_type_id: customerTypeId,
            });

          if (insertError) {
            errors.push(`Row ${i + 1} ("${name}"): ${insertError.message}`);
            continue;
          }

          created++;
        } catch (err: any) {
          errors.push(`Row ${i + 1} ("${name}"): ${err.message}`);
        }
      }

      // Report results
      if (created > 0) {
        let msg = `${created} customer(s) created successfully.`;
        if (duplicatePhones.length > 0) {
          msg += ` ${duplicatePhones.length} duplicate phone number(s) found (still uploaded).`;
        }
        toast({ title: msg });
      }
      if (errors.length > 0) {
        toast({
          title: `${errors.length} error(s)`,
          description: errors.slice(0, 5).join('\n'),
          variant: "destructive",
        });
      }

      queryClient.invalidateQueries({ queryKey: ['customers'] });

      if (created > 0 && errors.length === 0) {
        resetAndClose();
      }
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
              <strong> panVatNumber</strong> must be numeric only. <strong>phone</strong> must be exactly 10 digits and is used for duplicate detection.
              <strong> customerType</strong> must match an existing type name; blank or unmatched values import as Uncategorized.
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
              {untypedRowIndexes.length > 0 && (
                <div
                  className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300"
                  data-testid="warning-untyped-rows"
                >
                  {untypedRowIndexes.length} of {parsedRows.length} row(s) have a blank or unmatched
                  customer type and will be imported as Uncategorized.
                </div>
              )}
              <div className="border rounded-lg overflow-auto max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {expectedHeaders.map(h => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow
                        key={i}
                        data-testid={`preview-row-${i}`}
                        className={cn(untypedSet.has(i) && "bg-amber-50 dark:bg-amber-900/10")}
                      >
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
  const { user } = useAuth();
  const canEditLedger = canAccess(user?.roles ?? [], "ledger-edit");
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
    if (parsedRows.length === 0 || !user?.businessId || !canEditLedger) return;
    setIsUploading(true);

    const errors: string[] = [];
    let created = 0;
    const validTypes = ['credit', 'adjustment'];

    try {
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const customerId = parseInt(row.customerRefID);
        const type = row.type?.trim().toLowerCase();
        const amount = Math.round(parseFloat(row.amount || '0') * 100);
        const description = row.description?.trim() || null;
        const entryDate = row.entryDate?.trim() || new Date().toISOString();

        // Validate: customerRefID required
        if (isNaN(customerId)) {
          errors.push(`Row ${i + 1}: invalid or missing customerRefID`);
          continue;
        }

        // Validate: type must be credit or adjustment
        if (!validTypes.includes(type)) {
          errors.push(`Row ${i + 1}: type must be "credit" or "adjustment" (got "${row.type?.trim()}")`);
          continue;
        }

        // Validate: amount required and positive
        if (!amount || amount <= 0) {
          errors.push(`Row ${i + 1}: invalid or missing amount`);
          continue;
        }

        try {
          // 1. Create ledger entry
          const { error: ledgerError } = await supabase
            .from('ledger_entries')
            .insert({
              customer_id: customerId,
              type,
              amount,
              description,
              entry_date: entryDate,
              business_id: user.businessId,
            });

          if (ledgerError) {
            errors.push(`Row ${i + 1}: ${ledgerError.message}`);
            continue;
          }

          // 2. Update customer balance
          // Credit entries decrease balance (payment received), other entries increase balance
          const balanceChange = type === 'credit' ? -amount : amount;

          const { data: customer } = await supabase
            .from('customers')
            .select('current_balance')
            .eq('id', customerId)
            .single();

          if (customer) {
            await supabase
              .from('customers')
              .update({ current_balance: customer.current_balance + balanceChange })
              .eq('id', customerId);
          }

          created++;
        } catch (err: any) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }

      // Report results
      if (created > 0) {
        toast({ title: `${created} ledger entry/entries created successfully.` });
      }
      if (errors.length > 0) {
        toast({
          title: `${errors.length} error(s)`,
          description: errors.slice(0, 5).join('\n'),
          variant: "destructive",
        });
      }

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });

      if (created > 0 && errors.length === 0) {
        resetAndClose();
      }
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
              <strong> type</strong>: "credit" (payment/deposit) or "adjustment".
              <strong> amount</strong> is in currency units (e.g. 500 = {symbol}500).
              <strong> entryDate</strong> format: YYYY-MM-DD.
            </p>
          </div>

          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Only <strong>credit</strong> (payment/deposit) and <strong>adjustment</strong> entries can be uploaded. 
              Purchase entries are automatically created when orders are placed.
              Credit entries will decrease customer balance. Adjustment entries will increase it.
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
              disabled={!canEditLedger}
              data-testid="input-csv-ledger"
            />
          </div>
          {!canEditLedger && (
            <p className="text-xs text-muted-foreground">You don't have permission to import ledger entries.</p>
          )}

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
              disabled={parsedRows.length === 0 || isUploading || !canEditLedger}
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
