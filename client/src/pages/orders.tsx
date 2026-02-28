import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrders, usePaginatedOrders, useOrderCounts, useOrderTabTotals, useCreateOrder, useUpdateOrderStatus, useEditOrder, useDeleteOrder, useUpdatePaymentStatus, useNextVatBillNumber } from "@/hooks/use-orders";
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers";
import { Label } from "@/components/ui/label";
import { useProducts } from "@/hooks/use-products";
import { useCurrency } from "@/hooks/use-currency";
import { useAuth } from "@/hooks/use-auth";
import { useCustomerTypes } from "@/hooks/use-customer-types";
import { useCategories } from "@/hooks/use-categories";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Papa from "papaparse";
import { api } from "@shared/routes";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, ShoppingCart, Trash2, CheckCircle, XCircle, Clock, Package, Truck, ChevronDown, ChevronLeft, ChevronRight, FileText, Pencil, Search, DollarSign, ShoppingBag, X, Receipt, Upload, AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const ORDER_STATUSES = [
  { value: "new", label: "New" },
  { value: "in-process", label: "In-process" },
  { value: "ready", label: "Ready for Dispatch" },
  { value: "completed", label: "Complete" },
  { value: "cancelled", label: "Canceled" },
] as const;

type OrderStatus = typeof ORDER_STATUSES[number]["value"];

function normalizeStatus(status: string): string {
  if (status === "pending") return "new";
  return status;
}

function normalizeUploadStatus(status: string): string {
  const s = status.toLowerCase().trim();
  if (s === 'complete' || s === 'completed') return 'completed';
  if (s === 'new') return 'new';
  if (s === 'ready' || s === 'ready for dispatch') return 'ready';
  if (s === 'in progress' || s === 'in-process' || s === 'in process') return 'in-process';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'new';
}

function getStatusBadgeStyle(status: string) {
  switch (status) {
    case 'new':
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
    case 'in-process':
      return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800";
    case 'ready':
      return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800";
    case 'completed':
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case 'cancelled':
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800";
  }
}

function getStatusLabel(status: string) {
  const found = ORDER_STATUSES.find(s => s.value === status);
  return found ? found.label : status;
}

export default function Orders() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkOrderOpen, setIsBulkOrderOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("new");
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const updateStatus = useUpdateOrderStatus();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when tab or filters change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedOrders(new Set());
  }, [activeTab, debouncedSearch, paymentFilter, dateFrom, dateTo]);

  // Server-side paginated orders for the active tab
  const { data: paginatedData, isLoading } = usePaginatedOrders({
    status: activeTab,
    page: currentPage,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    paymentFilter: paymentFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  // Server-side counts for all status tabs
  const { data: orderCounts } = useOrderCounts({
    search: debouncedSearch || undefined,
    paymentFilter: paymentFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  // Server-side totals (revenue + units) for the active tab across ALL pages
  const { data: tabTotals } = useOrderTabTotals({
    status: activeTab,
    search: debouncedSearch || undefined,
    paymentFilter: paymentFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const orders = paginatedData?.orders || [];
  const totalOrders = paginatedData?.total || 0;
  const totalPages = Math.ceil(totalOrders / PAGE_SIZE);

  const toggleSelect = (orderId: number) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = (orderIds: number[]) => {
    setSelectedOrders(prev => {
      const allSelected = orderIds.every(id => prev.has(id));
      if (allSelected) {
        return new Set();
      } else {
        return new Set(orderIds);
      }
    });
  };

  const toggleExpanded = (orderId: number) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({ title: `Order moved to ${getStatusLabel(status)}` });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    const ids = Array.from(selectedOrders);
    let successCount = 0;
    let failCount = 0;
    
    for (const id of ids) {
      try {
        await updateStatus.mutateAsync({ id, status });
        successCount++;
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast({ title: `${successCount} order(s) moved to ${getStatusLabel(status)}` });
    }
    if (failCount > 0) {
      toast({ title: `${failCount} order(s) failed to update`, variant: "destructive" });
    }
    setSelectedOrders(new Set());
  };

  const clearFilters = () => {
    setSearchQuery("");
    setPaymentFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = searchQuery || paymentFilter !== "all" || dateFrom || dateTo;

  const getOrderCount = (status: string) => orderCounts?.[status] ?? 0;

  // KPI calculations — totals from server across ALL pages
  const kpiData = {
    totalOrders: totalOrders,
    totalRevenue: tabTotals?.totalRevenue ?? 0,
    totalUnits: tabTotals?.totalUnits ?? 0,
  };

  const tabOrderIds = orders.map(o => o.id);
  const allSelected = tabOrderIds.length > 0 && tabOrderIds.every(id => selectedOrders.has(id));
  const someSelected = tabOrderIds.some(id => selectedOrders.has(id));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Orders</h1>
          <p className="text-muted-foreground">Track and fulfill customer orders.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setIsBulkOrderOpen(true)} data-testid="button-bulk-orders">
            <Upload className="w-4 h-4 mr-2" />
            Upload Orders
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} className="shadow-lg shadow-primary/25" data-testid="button-new-order">
            <Plus className="w-4 h-4 mr-2" />
            New Order
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="text-xl font-bold" data-testid="kpi-total-orders">{kpiData.totalOrders.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-bold" data-testid="kpi-total-revenue">{formatCurrency(kpiData.totalRevenue)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Units</p>
              <p className="text-xl font-bold" data-testid="kpi-total-units">{kpiData.totalUnits.toLocaleString()}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by customer name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-orders"
          />
        </div>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-payment-filter">
            <SelectValue placeholder="Payment Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="COD">COD</SelectItem>
            <SelectItem value="Bank Transfer/QR">Bank Transfer/QR</SelectItem>
            <SelectItem value="Credit">Credit</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2 items-center">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px]"
            placeholder="From"
            data-testid="input-date-from"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px]"
            placeholder="To"
            data-testid="input-date-to"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setSelectedOrders(new Set()); }} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto p-1">
          {ORDER_STATUSES.map((status) => (
            <TabsTrigger 
              key={status.value} 
              value={status.value}
              className="flex flex-col gap-1 py-2 px-3 data-[state=active]:shadow-sm"
              data-testid={`tab-${status.value}`}
            >
              <span className="text-xs sm:text-sm font-medium">{status.label}</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                ({getOrderCount(status.value).toLocaleString()})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {ORDER_STATUSES.map((status) => (
          <TabsContent key={status.value} value={status.value} className="mt-4">
            <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={() => toggleSelectAll(tabOrderIds)}
                        aria-label="Select all orders on this page"
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>VAT Bill #</TableHead>
                    <TableHead className="text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="h-24 text-center">Loading orders...</TableCell></TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No {status.label.toLowerCase()} orders.</TableCell></TableRow>
                  ) : (
                    orders.map((order) => {
                      const isExpanded = expandedOrders.has(order.id);
                      const isSelected = selectedOrders.has(order.id);
                      const canEdit = order.status !== 'completed' && order.status !== 'cancelled';
                      return (
                        <React.Fragment key={order.id}>
                          <TableRow 
                            className={cn("group cursor-pointer hover:bg-muted/30", isSelected && "bg-primary/5")}
                            data-testid={`order-row-${order.id}`}
                            onClick={() => toggleExpanded(order.id)}
                          >
                            <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(order.id)}
                                aria-label={`Select order ${order.id}`}
                                data-testid={`checkbox-order-${order.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                #{order.id}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{order.customer?.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{order.customer?.address || '-'}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{format(new Date(order.order_date!), 'MMM dd, yyyy')}</TableCell>
                            <TableCell className="font-mono font-medium">{formatCurrency(order.total_amount)}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <PaymentStatusCell order={order} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {order.vat_bill_number || '-'}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              {canEdit && (
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-8 w-8" 
                                  onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                                  data-testid={`button-edit-order-${order.id}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${order.id}-details`} className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={9} className="p-4">
                                <OrderDetails order={order} formatCurrency={formatCurrency} />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
                  <p className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalOrders)} of {totalOrders.toLocaleString()} orders
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm font-medium px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Bulk Action Bar - fixed at bottom of viewport */}
            {selectedOrders.size > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
                <div className="flex items-center justify-between gap-4 px-6 py-3 bg-primary/5 dark:bg-primary/10 border-2 border-primary/30 rounded-xl shadow-2xl backdrop-blur-sm">
                  <span className="text-sm font-medium whitespace-nowrap">
                    {selectedOrders.size} order{selectedOrders.size > 1 ? 's' : ''} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(val) => handleBulkStatusUpdate(val)} disabled={updateStatus.isPending}>
                      <SelectTrigger className="w-[160px] h-9" data-testid="select-bulk-move">
                        <SelectValue placeholder="Move to..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.filter(s => s.value !== status.value && s.value !== 'cancelled').map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {status.value !== 'completed' && status.value !== 'cancelled' && (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => setShowCancelConfirm(true)}
                        disabled={updateStatus.isPending}
                        data-testid="button-bulk-cancel"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Cancel order(s)
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSelectedOrders(new Set())}
                      data-testid="button-clear-selection"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Cancel confirmation dialog */}
            <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel {selectedOrders.size} order{selectedOrders.size > 1 ? 's' : ''}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reverse inventory, create a credit ledger entry, and update the customer balance for each order. This action cannot be easily undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>No, keep orders</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      handleBulkStatusUpdate('cancelled');
                      setShowCancelConfirm(false);
                    }}
                  >
                    Yes, cancel orders
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>
        ))}
      </Tabs>

      <CreateOrderDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <BulkOrderUploadDialog open={isBulkOrderOpen} onOpenChange={setIsBulkOrderOpen} />
      <EditOrderDialog order={editingOrder} open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)} />
    </div>
  );
}

function PaymentStatusCell({ order }: { order: any }) {
  const updatePaymentStatus = useUpdatePaymentStatus();
  const { toast } = useToast();
  const paymentStatus = order.payment_status || "Credit";
  const isCredit = paymentStatus === "Credit";

  const getPaymentBadgeStyle = (status: string) => {
    switch (status) {
      case "COD": return "bg-green-500/10 text-green-600 border-green-500/30";
      case "Bank Transfer/QR": return "bg-blue-500/10 text-blue-600 border-blue-500/30";
      case "Credit": return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      default: return "";
    }
  };

  const getPaymentLabel = (status: string) => {
    switch (status) {
      case "COD": return "COD";
      case "Bank Transfer/QR": return "Bank/QR";
      case "Credit": return "Credit";
      default: return status;
    }
  };

  const handleChange = async (newStatus: string) => {
    try {
      await updatePaymentStatus.mutateAsync({ id: order.id, paymentStatus: newStatus });
      toast({ title: "Payment status updated" });
    } catch (error: any) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    }
  };

  if (isCredit) {
    return (
      <Badge variant="outline" className={cn("text-xs", getPaymentBadgeStyle(paymentStatus))}>
        {getPaymentLabel(paymentStatus)}
      </Badge>
    );
  }

  return (
    <Select value={paymentStatus} onValueChange={handleChange} disabled={updatePaymentStatus.isPending}>
      <SelectTrigger className="h-7 w-[90px] text-xs" data-testid={`select-payment-${order.id}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="COD">COD</SelectItem>
        <SelectItem value="Bank Transfer/QR">Bank/QR</SelectItem>
      </SelectContent>
    </Select>
  );
}

// OrderActions component removed - replaced by bulk checkbox selection and floating action bar

function VatCalculationsDialog({ order, formatCurrency, open, onOpenChange }: { order: any; formatCurrency: (cents: number) => string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const items = order.items || [];

  const vatRows = items.map((item: any) => {
    const effectivePrice = item.unit_price - (item.discount || 0);
    const rateCents = effectivePrice / 1.13;
    const amountCents = rateCents * item.quantity;
    return {
      name: item.product?.name || `Product #${item.product_id}`,
      quantity: item.quantity,
      rate: Math.round(rateCents),
      amount: Math.round(amountCents),
    };
  });

  const total = vatRows.reduce((sum: number, r: any) => sum + r.amount, 0);
  const taxableAmount = total;
  const grandTotal = Math.round(total * 1.13);
  const vatAmount = grandTotal - total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            VAT Calculations
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm p-3 bg-muted/30 rounded-lg">
            <div className="text-muted-foreground">Customer Name</div>
            <div className="font-medium" data-testid="vat-customer-name">{order.customer?.name || '-'}</div>
            <div className="text-muted-foreground">Address</div>
            <div data-testid="vat-customer-address">{order.customer?.address || '-'}</div>
            <div className="text-muted-foreground">Phone</div>
            <div data-testid="vat-customer-phone">{order.customer?.phone || '-'}</div>
            <div className="text-muted-foreground">PAN/VAT Number</div>
            <div data-testid="vat-customer-pan">{order.customer?.pan_vat_number || '-'}</div>
            <div className="text-muted-foreground">VAT Bill Number</div>
            <div data-testid="vat-bill-number">{order.vat_bill_number || '-'}</div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Product Name</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vatRows.map((row: any, i: number) => (
                <TableRow key={i} data-testid={`vat-row-${i}`}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-right font-mono">{row.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(row.rate)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(row.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="border-t pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono font-medium" data-testid="vat-total">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxable Amount</span>
              <span className="font-mono font-medium" data-testid="vat-taxable">{formatCurrency(taxableAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT at 13%</span>
              <span className="font-mono font-medium" data-testid="vat-amount">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-semibold">Grand Total</span>
              <span className="font-mono font-bold text-base" data-testid="vat-grand-total">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetails({ order, formatCurrency }: { order: any; formatCurrency: (cents: number) => string }) {
  const items = order.items || [];
  const [showVatCalc, setShowVatCalc] = useState(false);
  
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">Order Items</div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No items in this order.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item: any) => {
            const hasDiscount = item.discount > 0;
            const effectivePrice = item.unit_price - item.discount;
            const lineTotal = effectivePrice * item.quantity;
            const variantName = item.variant?.name;
            const imageUrl = item.variant?.image_url || item.product?.image_url;
            const displayName = variantName
              ? `${item.product?.name || `Product #${item.product_id}`} — ${variantName}`
              : (item.product?.name || `Product #${item.product_id}`);
            
            return (
              <div key={item.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {imageUrl && (
                    <img src={imageUrl} alt={displayName} className="w-10 h-10 rounded object-cover border flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(item.unit_price)} each
                      {hasDiscount && (
                        <span className="text-green-600 ml-2">
                          (-{formatCurrency(item.discount)} / {item.unit_price > 0 ? Math.round((item.discount / item.unit_price) * 100) : 0}% discount)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Qty:</span> {item.quantity}
                  </div>
                  <div className="font-mono font-medium w-24 text-right">
                    {formatCurrency(lineTotal)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {order.note && (
        <div className="mt-4 p-3 bg-background rounded-lg border">
          <div className="flex items-center gap-2 text-sm font-medium mb-1">
            <FileText className="w-4 h-4" />
            Order Note
          </div>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">{order.note}</div>
        </div>
      )}
      
      <div className="flex justify-between items-end pt-2 border-t">
        <button
          type="button"
          className="text-sm text-primary underline underline-offset-2 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setShowVatCalc(true); }}
          data-testid={`link-vat-calculations-${order.id}`}
        >
          Show VAT Calculations
        </button>
        <div className="text-right space-y-0.5">
          {order.delivery_fee > 0 && (
            <div className="text-xs text-muted-foreground">
              Delivery Fee: <span className="font-mono">{formatCurrency(order.delivery_fee)}</span>
            </div>
          )}
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-lg font-bold font-mono">{formatCurrency(order.total_amount)}</div>
        </div>
      </div>

      <VatCalculationsDialog 
        order={order} 
        formatCurrency={formatCurrency} 
        open={showVatCalc} 
        onOpenChange={setShowVatCalc} 
      />
    </div>
  );
}

function EditOrderDialog({ order, open, onOpenChange }: { order: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { formatCurrency, symbol } = useCurrency();
  const { toast } = useToast();
  const editOrder = useEditOrder();
  const deleteOrder = useDeleteOrder();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [note, setNote] = useState(order?.note || "");
  const [orderDate, setOrderDate] = useState(() => order?.order_date ? format(new Date(order.order_date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<{ id: number; productName: string; imageUrl: string | null; unitPrice: number; quantity: number; discountPercent: number }[]>([]);
  
  useEffect(() => {
    if (order?.items) {
      setItems(order.items.map((item: any) => {
        const variantName = item.variant?.name;
        const imageUrl = item.variant?.image_url || item.product?.image_url || null;
        const displayName = variantName
          ? `${item.product?.name || `Product #${item.product_id}`} — ${variantName}`
          : (item.product?.name || `Product #${item.product_id}`);
        return {
          id: item.id,
          productName: displayName,
          imageUrl,
          unitPrice: item.unit_price,
          quantity: item.quantity,
          discountPercent: item.unit_price > 0 ? Math.round((item.discount / item.unit_price) * 100) : 0,
        };
      }));
      setNote(order.note || "");
      setOrderDate(order.order_date ? format(new Date(order.order_date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
    }
  }, [order]);
  
  const updateItem = (itemId: number, field: 'quantity' | 'discountPercent', value: number) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };
  
  const calculateTotal = () => {
    return items.reduce((total, item) => {
      const discountAmount = Math.round(item.unitPrice * item.discountPercent / 100);
      const effectivePrice = item.unitPrice - discountAmount;
      return total + (effectivePrice * item.quantity);
    }, 0);
  };
  
  const handleSave = async () => {
    try {
      await editOrder.mutateAsync({
        id: order.id,
        data: {
          note: note || undefined,
          orderDate: orderDate,
          items: items.map(item => ({
            id: item.id,
            quantity: item.quantity,
            discountPercent: item.discountPercent,
          })),
        },
      });
      toast({ title: "Order updated successfully" });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };
  
  if (!order) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Order #{order.id}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm font-medium">Order Items</div>
          <div className="space-y-3">
            {items.map((item) => {
              const discountAmount = Math.round(item.unitPrice * item.discountPercent / 100);
              const effectivePrice = item.unitPrice - discountAmount;
              const lineTotal = effectivePrice * item.quantity;
              
              return (
                <div key={item.id} className="p-3 bg-muted/30 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt={item.productName} className="w-9 h-9 rounded object-cover border" />
                      )}
                      <div className="font-medium">{item.productName}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatCurrency(item.unitPrice)} each
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <Input 
                        type="number" 
                        min="1" 
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        data-testid={`input-edit-qty-${item.id}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Discount %</Label>
                      <Input 
                        type="number" 
                        min="0" 
                        max="100"
                        value={item.discountPercent}
                        onChange={(e) => updateItem(item.id, 'discountPercent', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        data-testid={`input-edit-discount-${item.id}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Line Total</Label>
                      <div className="h-9 flex items-center font-mono font-medium">
                        {formatCurrency(lineTotal)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div>
            <Label>Order Note</Label>
            <Textarea 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add special instructions or notes..."
              rows={3}
              data-testid="input-edit-order-note"
            />
          </div>

          <div>
            <Label>Order Date</Label>
            <Input 
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full"
              data-testid="input-edit-order-date"
            />
          </div>
          
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-lg font-bold">
              New Total: <span className="font-mono">{formatCurrency(calculateTotal())}</span>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex !justify-between">
          <Button 
            variant="destructive" 
            onClick={() => setShowDeleteConfirm(true)} 
            disabled={deleteOrder.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {deleteOrder.isPending ? "Deleting..." : "Delete Order"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={editOrder.isPending} data-testid="button-save-order-edit">
              {editOrder.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order #{order?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this order. All inventory, ledger, and balance changes will be reversed, and the VAT bill number will be freed for reuse. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteOrder.mutateAsync(order.id);
                  toast({ title: "Order deleted successfully" });
                  setShowDeleteConfirm(false);
                  onOpenChange(false);
                } catch (error: any) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                }
              }}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function ProductRow({ 
  product, 
  variant,
  isInCart, 
  cartQuantity, 
  cartDiscountPercent,
  formatCurrency, 
  onAdd, 
  onRemove 
}: { 
  product: any; 
  variant?: any;
  isInCart: boolean;
  cartQuantity: number;
  cartDiscountPercent: number;
  formatCurrency: (cents: number) => string;
  onAdd: (quantity: number, discountPercent: number) => void;
  onRemove: () => void;
}) {
  const [quantity, setQuantity] = useState<number | ''>(cartQuantity);
  const [discountPercent, setDiscountPercent] = useState<number | ''>(cartDiscountPercent);

  const price = variant ? variant.price : product.price;
  const stock = variant ? variant.stock_quantity : (product.stock_quantity ?? product.stockQuantity ?? 0);
  const displayName = variant ? `${product.name} — ${variant.name}` : product.name;
  const rowKey = variant ? `${product.id}-${variant.id}` : product.id;
  
  const numQty = quantity === '' ? 1 : quantity;
  const numDisc = discountPercent === '' ? 0 : discountPercent;
  const discountAmount = Math.round(price * numDisc / 100);
  const effectivePrice = Math.max(0, price - discountAmount);
  const lineTotal = effectivePrice * numQty;
  
  const imageUrl = variant?.image_url || product.image_url || null;

  return (
    <div className={cn(
      "p-4 border rounded-lg transition-all",
      isInCart ? "border-primary bg-primary/5" : "hover:bg-muted/5"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {imageUrl ? (
            <img src={imageUrl} alt={displayName} className="w-10 h-10 rounded object-cover border flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0 border">
              <Package className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">{displayName}</div>
            <div className="text-xs text-muted-foreground">
              <span className={stock <= 0 ? "text-red-500 font-medium" : ""}>Stock: {stock}</span> | Base price: {formatCurrency(price)}
              {variant && <span className="ml-1">| SKU: {variant.sku}</span>}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground mb-1">Qty</span>
              <Input 
                type="number" 
                value={quantity} 
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') { setQuantity(''); return; }
                  setQuantity(Math.max(1, parseInt(val) || 1));
                }}
                onBlur={() => { if (quantity === '' || quantity < 1) setQuantity(1); }}
                className="w-16 h-8 text-center no-spinners"
                min={1}
                max={stock}
                data-testid={`input-quantity-${rowKey}`}
              />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground mb-1">Disc %</span>
              <Input 
                type="number" 
                value={discountPercent} 
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') { setDiscountPercent(''); return; }
                  setDiscountPercent(Math.min(100, Math.max(0, parseFloat(val) || 0)));
                }}
                onBlur={() => { if (discountPercent === '') setDiscountPercent(0); }}
                className="w-16 h-8 text-center no-spinners"
                min={0}
                max={100}
                step={1}
                placeholder="0"
                data-testid={`input-discount-${rowKey}`}
              />
            </div>
          </div>
          
          <div className="text-right min-w-[80px]">
            <div className="font-mono font-medium text-sm">{formatCurrency(lineTotal)}</div>
            {numDisc > 0 && (
              <div className="text-[10px] text-green-600">-{numDisc}%</div>
            )}
          </div>
          
          {isInCart ? (
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={onRemove}
              data-testid={`button-remove-product-${rowKey}`}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remove
            </Button>
          ) : (
            <Button 
              size="sm" 
              onClick={() => onAdd(numQty, numDisc)} 
              disabled={stock === 0}
              data-testid={`button-add-product-${rowKey}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateOrderDialog({ open, onOpenChange }: any) {
  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState<string>("");
  const [cart, setCart] = useState<{ productId: number; variantId?: number; quantity: number; discountPercent: number; product: any; variant?: any }[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerPanVat, setNewCustomerPanVat] = useState("");
  const [newCustomerTypeId, setNewCustomerTypeId] = useState<string>("");
  const [orderNote, setOrderNote] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"COD" | "Bank Transfer/QR" | "Credit" | "">("");
  const [orderDate, setOrderDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [includeVat, setIncludeVat] = useState(false);
  const [vatBillNumber, setVatBillNumber] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();
  const { data: customerTypes } = useCustomerTypes();
  const { data: categories } = useCategories();
  const createOrder = useCreateOrder();
  const createCustomer = useCreateCustomer();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  const { data: nextVatNumber } = useNextVatBillNumber();

  useEffect(() => {
    if (includeVat && nextVatNumber) {
      setVatBillNumber(String(nextVatNumber));
    }
  }, [includeVat, nextVatNumber]);
  
  const filteredCustomers = customers?.filter(c => {
    if (!customerSearch) return true;
    const search = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(search) || 
           (c.phone && c.phone.toLowerCase().includes(search));
  }) || [];

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast({ title: "Customer name is required", variant: "destructive" });
      return;
    }
    if (newCustomerPhone.trim() && !/^\d{10}$/.test(newCustomerPhone.trim())) {
      toast({ title: "Phone number must be exactly 10 digits", variant: "destructive" });
      return;
    }
    try {
      const newCustomer = await createCustomer.mutateAsync({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        email: newCustomerEmail.trim() || null,
        address: newCustomerAddress.trim() || null,
        panVatNumber: newCustomerPanVat.trim() || null,
        customerTypeId: newCustomerTypeId && newCustomerTypeId !== 'none' ? parseInt(newCustomerTypeId) : null,
      });
      setCustomerId(newCustomer.id.toString());
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      setNewCustomerAddress("");
      setNewCustomerPanVat("");
      setNewCustomerTypeId("");
      toast({ title: "Customer created successfully!" });
    } catch (error: any) {
      toast({ title: "Failed to create customer", description: error.message, variant: "destructive" });
    }
  };

  const addToCart = (product: any, quantity: number, discountPercent: number, variant?: any) => {
    if (quantity < 1) return;
    // For variant products, use a combined key
    const cartKey = variant ? `${product.id}-${variant.id}` : `${product.id}`;
    const existing = cart.find(item => {
      const itemKey = item.variantId ? `${item.productId}-${item.variantId}` : `${item.productId}`;
      return itemKey === cartKey;
    });
    if (existing) {
      setCart(cart.map(item => {
        const itemKey = item.variantId ? `${item.productId}-${item.variantId}` : `${item.productId}`;
        return itemKey === cartKey ? { ...item, quantity, discountPercent } : item;
      }));
    } else {
      setCart([...cart, {
        productId: product.id,
        variantId: variant?.id,
        quantity,
        discountPercent,
        product,
        variant,
      }]);
    }
  };

  const removeFromCart = (productId: number, variantId?: number) => {
    setCart(cart.filter(item => !(item.productId === productId && item.variantId === variantId)));
  };

  const updateQuantity = (productId: number, qty: number, variantId?: number) => {
    if (qty < 1) return;
    setCart(cart.map(item => (item.productId === productId && item.variantId === variantId) ? { ...item, quantity: qty } : item));
  };

  const updateDiscountPercent = (productId: number, discountPercent: number, variantId?: number) => {
    if (discountPercent < 0 || discountPercent > 100) return;
    setCart(cart.map(item => (item.productId === productId && item.variantId === variantId) ? { ...item, discountPercent } : item));
  };

  const getItemPrice = (item: typeof cart[0]) => {
    if (item.variant) return item.variant.price;
    return item.product.price;
  };

  const getItemStock = (item: typeof cart[0]) => {
    if (item.variant) return item.variant.stock_quantity;
    return item.product.stock_quantity;
  };

  const subtotal = cart.reduce((sum, item) => {
    const price = getItemPrice(item);
    const discountAmount = Math.round(price * item.discountPercent / 100);
    const effectivePrice = Math.max(0, price - discountAmount);
    return sum + (effectivePrice * item.quantity);
  }, 0);

  const deliveryFeeInCents = Math.round(deliveryFee * 100);
  const totalAmount = subtotal + deliveryFeeInCents;

  const hasStockIssue = cart.some(item => item.quantity > getItemStock(item));

  const handleSubmit = async () => {
    if (!customerId || cart.length === 0) return;
    if (!paymentStatus) {
      toast({ title: "Please select a payment status", variant: "destructive" });
      return;
    }
    if (includeVat && !vatBillNumber.trim()) {
      toast({ title: "Please enter a VAT bill number", variant: "destructive" });
      return;
    }
    
    try {
      console.log('[CreateOrder] Submitting order...', {
        customerId: parseInt(customerId),
        itemsCount: cart.length,
        paymentStatus,
        totalAmount: totalAmount,
      });
      
      const newOrder = await createOrder.mutateAsync({
        customerId: parseInt(customerId),
        items: cart.map(item => ({ 
          productId: item.productId, 
          variantId: item.variantId,
          quantity: item.quantity,
          discountPercent: item.discountPercent > 0 ? item.discountPercent : undefined
        })),
        note: orderNote.trim() || undefined,
        paymentStatus: paymentStatus as "COD" | "Bank Transfer/QR" | "Credit",
        orderDate: orderDate,
        vatBillNumber: includeVat && vatBillNumber.trim() ? vatBillNumber.trim() : undefined,
        deliveryFee: deliveryFeeInCents > 0 ? deliveryFeeInCents : undefined,
      });
      
      console.log('[CreateOrder] Order created successfully:', newOrder);
      toast({ title: "Order created successfully!", description: `Order #${newOrder.id} has been created.` });
      
      // Reset state
      setStep(1);
      setCustomerId("");
      setCart([]);
      setOrderNote("");
      setPaymentStatus("");
      setOrderDate(format(new Date(), "yyyy-MM-dd"));
      setIncludeVat(false);
      setVatBillNumber("");
      setDeliveryFee(0);
      
      // Close dialog
      onOpenChange(false);
    } catch (error: any) {
      console.error('[CreateOrder] Error creating order:', error);
      toast({ title: "Failed to create order", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-0 overflow-hidden">
        <div className="p-6 border-b">
          <DialogHeader>
            <DialogTitle>Create New Order</DialogTitle>
            <div className="flex gap-2 mt-4">
              <div className={cn("h-1 flex-1 rounded-full transition-all", step >= 1 ? "bg-primary" : "bg-muted")} />
              <div className={cn("h-1 flex-1 rounded-full transition-all", step >= 2 ? "bg-primary" : "bg-muted")} />
              <div className={cn("h-1 flex-1 rounded-full transition-all", step >= 3 ? "bg-primary" : "bg-muted")} />
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-semibold text-lg">Select Customer</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                  data-testid="button-add-new-customer"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {showNewCustomerForm ? "Cancel" : "New Customer"}
                </Button>
              </div>
              
              {showNewCustomerForm && (
                <Card className="p-4 border-dashed border-2 border-primary/30 bg-primary/5">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Add New Customer</h4>
                    <div className="grid gap-3">
                      <div>
                        <Label htmlFor="new-customer-name" className="text-xs">Name *</Label>
                        <Input 
                          id="new-customer-name"
                          placeholder="Customer name" 
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                          data-testid="input-new-customer-name"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="new-customer-phone" className="text-xs">Phone</Label>
                          <Input 
                            id="new-customer-phone"
                            placeholder="98XXXXXXXX" 
                            maxLength={10}
                            value={newCustomerPhone}
                            onChange={(e) => setNewCustomerPhone(e.target.value.replace(/[^0-9]/g, ''))}
                            data-testid="input-new-customer-phone"
                          />
                        </div>
                        <div>
                          <Label htmlFor="new-customer-email" className="text-xs">Email</Label>
                          <Input 
                            id="new-customer-email"
                            placeholder="Email address" 
                            value={newCustomerEmail}
                            onChange={(e) => setNewCustomerEmail(e.target.value)}
                            data-testid="input-new-customer-email"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="new-customer-address" className="text-xs">Address</Label>
                        <Input 
                          id="new-customer-address"
                          placeholder="Customer address" 
                          value={newCustomerAddress}
                          onChange={(e) => setNewCustomerAddress(e.target.value)}
                          data-testid="input-new-customer-address"
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-customer-pan-vat" className="text-xs">PAN/VAT Number</Label>
                        <Input 
                          id="new-customer-pan-vat"
                          placeholder="Enter PAN/VAT number" 
                          inputMode="numeric"
                          value={newCustomerPanVat}
                          onChange={(e) => setNewCustomerPanVat(e.target.value.replace(/[^0-9]/g, ''))}
                          data-testid="input-new-customer-pan-vat"
                        />
                      </div>
                    </div>
                    {(customerTypes || []).length > 0 && (
                      <div>
                        <Label className="text-xs">Customer Type</Label>
                        <Select value={newCustomerTypeId} onValueChange={setNewCustomerTypeId}>
                          <SelectTrigger className="h-9" data-testid="select-new-customer-type">
                            <SelectValue placeholder="Select type (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {customerTypes!.map(t => (
                              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button 
                      size="sm" 
                      onClick={handleCreateCustomer}
                      disabled={createCustomer.isPending}
                      data-testid="button-save-new-customer"
                    >
                      {createCustomer.isPending ? "Creating..." : "Create & Select"}
                    </Button>
                  </div>
                </Card>
              )}
              
              <Input 
                placeholder="Search by name or phone..." 
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="max-w-sm"
                data-testid="input-customer-search"
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="col-span-2 text-center py-8 text-muted-foreground">
                    No customers found. Click "New Customer" to add one.
                  </div>
                ) : (
                  filteredCustomers.map(c => (
                    <div 
                      key={c.id} 
                      className={cn(
                        "p-4 rounded-xl border cursor-pointer transition-all hover:border-primary",
                        customerId === c.id.toString() ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                      )}
                      onClick={() => setCustomerId(c.id.toString())}
                      data-testid={`customer-card-${c.id}`}
                    >
                      <div className="font-medium">{c.name}</div>
                      {c.phone && <div className="text-sm text-muted-foreground">{c.phone}</div>}
                      {c.email && <div className="text-sm text-muted-foreground">{c.email}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Add Products</h3>
                <div className="text-sm text-muted-foreground">{cart.length} items in cart</div>
              </div>
              
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map(cat => (
                    <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-1 gap-3">
                {(() => {
                  const filtered = products?.filter(p => {
                    if (selectedCategory === 'all') return true;
                    return String(p.category_id) === selectedCategory;
                  }) || [];

                  type PRow = { product: any; variant?: any; stock: number };
                  const rows: PRow[] = [];
                  for (const p of filtered) {
                    if (p.has_variants && p.variants && p.variants.length > 0) {
                      for (const v of p.variants) {
                        rows.push({ product: p, variant: v, stock: v.stock_quantity ?? 0 });
                      }
                    } else {
                      rows.push({ product: p, stock: p.stock_quantity ?? p.stockQuantity ?? 0 });
                    }
                  }
                  rows.sort((a, b) => {
                    const aOut = a.stock <= 0 ? 1 : 0;
                    const bOut = b.stock <= 0 ? 1 : 0;
                    return aOut - bOut;
                  });

                  return rows.map(row => {
                    if (row.variant) {
                      const cartItem = cart.find(item => item.productId === row.product.id && item.variantId === row.variant.id);
                      return (
                        <ProductRow 
                          key={`${row.product.id}-${row.variant.id}`} 
                          product={row.product} 
                          variant={row.variant}
                          isInCart={!!cartItem}
                          cartQuantity={cartItem?.quantity || 1}
                          cartDiscountPercent={cartItem?.discountPercent || 0}
                          formatCurrency={formatCurrency}
                          onAdd={(qty, discountPercent) => addToCart(row.product, qty, discountPercent, row.variant)}
                          onRemove={() => removeFromCart(row.product.id, row.variant.id)}
                        />
                      );
                    } else {
                      const cartItem = cart.find(item => item.productId === row.product.id && !item.variantId);
                      return (
                        <ProductRow 
                          key={row.product.id} 
                          product={row.product} 
                          isInCart={!!cartItem}
                          cartQuantity={cartItem?.quantity || 1}
                          cartDiscountPercent={cartItem?.discountPercent || 0}
                          formatCurrency={formatCurrency}
                          onAdd={(qty, discountPercent) => addToCart(row.product, qty, discountPercent)}
                          onRemove={() => removeFromCart(row.product.id)}
                        />
                      );
                    }
                  });
                })()}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Review Order</h3>
              
              <div className="space-y-3">
                {cart.map(item => {
                  const price = getItemPrice(item);
                  const stock = getItemStock(item);
                  const discountAmount = Math.round(price * item.discountPercent / 100);
                  const effectivePrice = Math.max(0, price - discountAmount);
                  const lineTotal = effectivePrice * item.quantity;
                  const exceedsStock = item.quantity > stock;
                  const cartKey = item.variantId ? `${item.productId}-${item.variantId}` : `${item.productId}`;
                  const displayName = item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name;
                  const reviewImageUrl = item.variant?.image_url || item.product?.image_url || null;
                  return (
                    <div key={cartKey} className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      exceedsStock ? "bg-red-500/10 border border-red-500/30" : "bg-muted/20"
                    )}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {reviewImageUrl && (
                          <img src={reviewImageUrl} alt={displayName} className="w-9 h-9 rounded object-cover border flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{displayName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(price)} each
                            {item.discountPercent > 0 && (
                              <span className="text-green-600 ml-2">(-{item.discountPercent}% = {formatCurrency(discountAmount)} off)</span>
                            )}
                          </div>
                          {exceedsStock && (
                            <div className="text-xs text-red-500 mt-1">
                              Only {stock} in stock
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-muted-foreground">Qty</span>
                          <Input 
                            type="number" 
                            value={item.quantity} 
                            onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 1, item.variantId)} 
                            className="w-16 h-8 text-center no-spinners"
                            min={1}
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-muted-foreground">Disc %</span>
                          <Input 
                            type="number" 
                            value={item.discountPercent} 
                            onChange={(e) => updateDiscountPercent(item.productId, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)), item.variantId)} 
                            className="w-16 h-8 text-center no-spinners"
                            min={0}
                            max={100}
                            step={1}
                          />
                        </div>
                        <div className="font-mono font-medium w-20 text-right">
                          {formatCurrency(lineTotal)}
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => removeFromCart(item.productId, item.variantId)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="order-note" className="text-sm">Order Note (optional)</Label>
                <Textarea 
                  id="order-note"
                  placeholder="Add any special instructions or notes for this order..."
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  className="resize-none"
                  rows={3}
                  data-testid="input-order-note"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-status" className="text-sm">Payment Status</Label>
                <Select value={paymentStatus} onValueChange={(val: "COD" | "Bank Transfer/QR" | "Credit") => setPaymentStatus(val)}>
                  <SelectTrigger id="payment-status" data-testid="select-payment-status">
                    <SelectValue placeholder="Select payment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COD">COD (Cash on Delivery)</SelectItem>
                    <SelectItem value="Bank Transfer/QR">Bank Transfer / QR Payment</SelectItem>
                    <SelectItem value="Credit">Credit (Pay Later)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {!paymentStatus 
                    ? "Select how this order will be paid."
                    : paymentStatus === "Credit" 
                      ? "Customer will pay later. You can add payment in the ledger later."
                      : "Payment will be recorded automatically in the customer's ledger."}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="include-vat"
                    checked={includeVat}
                    onCheckedChange={(checked) => {
                      setIncludeVat(!!checked);
                      if (!checked) setVatBillNumber("");
                    }}
                    data-testid="checkbox-include-vat"
                  />
                  <Label htmlFor="include-vat" className="text-sm cursor-pointer">Include VAT</Label>
                </div>
                {includeVat && (
                  <div className="space-y-2 pl-6">
                    <Label htmlFor="vat-bill-number" className="text-sm">VAT Bill Number</Label>
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-muted-foreground" />
                      <Input
                        id="vat-bill-number"
                        value={vatBillNumber}
                        onChange={(e) => setVatBillNumber(e.target.value)}
                        placeholder="VAT bill number"
                        className="flex-1"
                        data-testid="input-vat-bill-number"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Auto-suggested based on last bill number. You can edit it if needed.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="order-date" className="text-sm">Order Date</Label>
                  <Input 
                    id="order-date"
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full"
                    data-testid="input-order-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-fee" className="text-sm">Delivery Fee</Label>
                  <Input 
                    id="delivery-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={deliveryFee || ''}
                    onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                    className="w-full"
                    data-testid="input-delivery-fee"
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-1">
                {cart.some(item => item.discountPercent > 0) && (
                  <div className="flex justify-between items-center text-sm text-green-600">
                    <div>Total Discounts</div>
                    <div className="font-mono">-{formatCurrency(cart.reduce((sum, item) => {
                      const price = getItemPrice(item);
                      const discountAmount = Math.round(price * item.discountPercent / 100);
                      return sum + (discountAmount * item.quantity);
                    }, 0))}</div>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <div className="text-muted-foreground">Subtotal</div>
                  <div className="font-mono">{formatCurrency(subtotal)}</div>
                </div>
                {deliveryFeeInCents > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <div className="text-muted-foreground">Delivery Fee</div>
                    <div className="font-mono">{formatCurrency(deliveryFeeInCents)}</div>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1 border-t">
                  <div className="font-medium">Total Amount</div>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(totalAmount)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-muted/10 flex justify-between">
          <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
            Back
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !customerId}>
              Next
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={cart.length === 0 || createOrder.isPending || hasStockIssue}>
              {createOrder.isPending ? "Creating..." : hasStockIssue ? "Fix Stock Issues" : "Confirm Order"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkOrderUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orderFileRef = useRef<HTMLInputElement>(null);
  const itemFileRef = useRef<HTMLInputElement>(null);
  const [orderRows, setOrderRows] = useState<any[]>([]);
  const [itemRows, setItemRows] = useState<any[]>([]);
  const [orderFileName, setOrderFileName] = useState("");
  const [itemFileName, setItemFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();
  const { symbol } = useCurrency();

  const orderHeaders = ['orderRef', 'customerRefID', 'status', 'paymentStatus', 'note', 'vatBillNumber', 'orderDate', 'deliveryFee'];
  const itemHeaders = ['orderRef', 'productSKU', 'quantity', 'unitPrice', 'discountPercent', 'variantName'];

  const handleOrderFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOrderFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => setOrderRows(results.data as any[]),
      error: () => toast({ title: "Failed to parse orders CSV", variant: "destructive" }),
    });
  };

  const handleItemFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setItemFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => setItemRows(results.data as any[]),
      error: () => toast({ title: "Failed to parse order items CSV", variant: "destructive" }),
    });
  };

  const handleUpload = async () => {
    if (orderRows.length === 0 || itemRows.length === 0 || !user?.businessId) return;
    setIsUploading(true);

    const errors: string[] = [];
    let created = 0;

    try {
      // Build product lookup by SKU (including variant SKUs)
      const productBySku: Record<string, any> = {};
      const variantBySku: Record<string, any> = {};
      (products || []).forEach((p: any) => {
        if (p.sku) productBySku[p.sku.trim().toLowerCase()] = p;
        // Also index variant SKUs
        if (p.has_variants && p.variants) {
          for (const v of p.variants) {
            if (v.sku) variantBySku[v.sku.trim().toLowerCase()] = { product: p, variant: v };
          }
        }
      });

      for (let i = 0; i < orderRows.length; i++) {
        const row = orderRows[i];
        const orderRef = row.orderRef?.trim();
        const customerId = parseInt(row.customerRefID);
        const status = normalizeUploadStatus(row.status?.trim() || 'new');
        const paymentStatus = row.paymentStatus?.trim() || 'Credit';
        const note = row.note?.trim() || null;
        const vatBillNumber = row.vatBillNumber?.trim() || null;
        const orderDate = row.orderDate?.trim() || new Date().toISOString();
        const deliveryFee = Math.round(parseFloat(row.deliveryFee || '0') * 100);

        if (!orderRef) { errors.push(`Order row ${i + 1}: missing orderRef`); continue; }
        if (isNaN(customerId)) { errors.push(`Order row ${i + 1}: invalid customerRefID`); continue; }

        // Find matching items for this order
        const matchingItems = itemRows.filter(ir => ir.orderRef?.trim() === orderRef);
        if (matchingItems.length === 0) { errors.push(`Order "${orderRef}": no items found`); continue; }

        // Resolve products/variants and calculate total
        let totalAmount = 0;
        const orderItemsData: { product_id: number; variant_id: number | null; quantity: number; unit_price: number; discount: number }[] = [];
        const stockUpdates: { productId: number; variantId: number | null; quantity: number; currentStock: number }[] = [];
        let itemError = false;

        for (const item of matchingItems) {
          const sku = item.productSKU?.trim().toLowerCase();
          const variantName = item.variantName?.trim();
          let product: any = null;
          let variant: any = null;

          if (sku) {
            // First check if SKU matches a variant directly
            if (variantBySku[sku]) {
              product = variantBySku[sku].product;
              variant = variantBySku[sku].variant;
            } else if (productBySku[sku]) {
              product = productBySku[sku];
              // If product has variants and variantName is provided, find the variant
              if (product.has_variants && product.variants && variantName) {
                variant = product.variants.find((v: any) => v.name.toLowerCase() === variantName.toLowerCase());
                if (!variant) {
                  errors.push(`Order "${orderRef}": variant "${variantName}" not found for product SKU "${item.productSKU}"`);
                  itemError = true; break;
                }
              }
            }
          }

          if (!product) { errors.push(`Order "${orderRef}": product SKU "${item.productSKU}" not found`); itemError = true; break; }

          const quantity = parseInt(item.quantity) || 0;
          const unitPriceCents = Math.round(parseFloat(item.unitPrice || '0') * 100);
          const discountPercent = parseFloat(item.discountPercent || '0');
          const discountAmount = Math.floor(unitPriceCents * (discountPercent / 100));
          const effectivePrice = unitPriceCents - discountAmount;

          if (quantity <= 0) { errors.push(`Order "${orderRef}": invalid quantity for SKU "${item.productSKU}"`); itemError = true; break; }

          totalAmount += effectivePrice * quantity;
          orderItemsData.push({
            product_id: product.id,
            variant_id: variant ? variant.id : null,
            quantity,
            unit_price: unitPriceCents,
            discount: discountAmount,
          });
          stockUpdates.push({
            productId: product.id,
            variantId: variant ? variant.id : null,
            quantity,
            currentStock: variant ? variant.stock_quantity : product.stock_quantity,
          });
        }

        if (itemError) continue;

        // Add delivery fee to total
        totalAmount += deliveryFee;

        try {
          // 1. Create order
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
              business_id: user.businessId,
              customer_id: customerId,
              status,
              payment_status: paymentStatus,
              total_amount: totalAmount,
              delivery_fee: deliveryFee,
              note,
              vat_bill_number: vatBillNumber,
              order_date: orderDate,
            })
            .select()
            .single();

          if (orderError) { errors.push(`Order "${orderRef}": ${orderError.message}`); continue; }

          // 2. Create order items
          const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItemsData.map(item => ({ ...item, order_id: order.id })));

          if (itemsError) { errors.push(`Order "${orderRef}" items: ${itemsError.message}`); continue; }

          // 3. Update stock & create inventory movements
          // Read live stock from DB for each item to avoid stale-cache overwrites
          for (const su of stockUpdates) {
            let currentStock: number;

            if (su.variantId) {
              const { data: liveVariant } = await supabase
                .from('product_variants')
                .select('stock_quantity')
                .eq('id', su.variantId)
                .single();
              currentStock = liveVariant?.stock_quantity ?? 0;
            } else {
              const { data: liveProduct } = await supabase
                .from('products')
                .select('stock_quantity')
                .eq('id', su.productId)
                .single();
              currentStock = liveProduct?.stock_quantity ?? 0;
            }

            const newStock = currentStock - su.quantity;

            if (su.variantId) {
              await supabase
                .from('product_variants')
                .update({ stock_quantity: newStock })
                .eq('id', su.variantId);
            } else {
              await supabase
                .from('products')
                .update({ stock_quantity: newStock })
                .eq('id', su.productId);
            }

            await supabase
              .from('inventory_movements')
              .insert({
                business_id: user.businessId,
                product_id: su.productId,
                variant_id: su.variantId || null,
                movement_type: 'sale',
                quantity_change: -su.quantity,
                balance_after: newStock,
                order_id: order.id,
                notes: `Sale from order #${order.id}`,
                movement_date: orderDate,
              });
          }

          // 4. Create purchase ledger entry (debit)
          let ledgerDesc = `Order #${order.id} - ${paymentStatus}`;
          if (vatBillNumber) ledgerDesc += ` | VAT #${vatBillNumber}`;
          if (deliveryFee > 0) ledgerDesc += ` (incl. delivery fee ${(deliveryFee / 100).toFixed(2)})`;

          await supabase
            .from('ledger_entries')
            .insert({
              business_id: user.businessId,
              customer_id: customerId,
              order_id: order.id,
              type: 'purchase',
              amount: totalAmount,
              description: ledgerDesc,
              entry_date: orderDate,
            });

          // 5. For COD and Bank Transfer: auto-create payment ledger entry (deposit)
          if (paymentStatus === 'COD' || paymentStatus === 'Bank Transfer/QR') {
            await supabase
              .from('ledger_entries')
              .insert({
                business_id: user.businessId,
                customer_id: customerId,
                order_id: order.id,
                type: 'payment',
                amount: totalAmount,
                description: `Payment received - Order #${order.id} (${paymentStatus})`,
                entry_date: orderDate,
              });
          }

          // 6. Update customer balance (only for Credit orders)
          if (paymentStatus === 'Credit') {
            const { data: customer } = await supabase
              .from('customers')
              .select('current_balance')
              .eq('id', customerId)
              .single();

            if (customer) {
              await supabase
                .from('customers')
                .update({ current_balance: customer.current_balance + totalAmount })
                .eq('id', customerId);
            }
          }

          created++;
        } catch (err: any) {
          errors.push(`Order "${orderRef}": ${err.message}`);
        }
      }

      // Report results
      if (created > 0) {
        toast({ title: `${created} order(s) created successfully. Inventory and ledger updated.` });
      }
      if (errors.length > 0) {
        toast({
          title: `${errors.length} error(s)`,
          description: errors.slice(0, 5).join('\n'),
          variant: "destructive",
        });
      }

      // Invalidate all relevant caches
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['vat'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });

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
    setOrderRows([]);
    setItemRows([]);
    setOrderFileName("");
    setItemFileName("");
    if (orderFileRef.current) orderFileRef.current.value = "";
    if (itemFileRef.current) itemFileRef.current.value = "";
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Orders</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium">Orders CSV Headers:</p>
                <code className="text-xs bg-muted px-2 py-1 rounded block" data-testid="text-orders-csv-headers">
                  {orderHeaders.join(', ')}
                </code>
                <p className="text-muted-foreground text-xs mt-1">
                  <strong>orderRef</strong> is a temporary ID to link items (e.g. "ORD-1").
                  <strong> customerRefID</strong> = customer's database ID.
                  <strong> status</strong>: new, in-process, ready, completed.
                  <strong> paymentStatus</strong>: COD, Bank Transfer/QR, Credit.
                  <strong> orderDate</strong>: YYYY-MM-DD.
                  <strong> vatBillNumber</strong>: numeric only.
                  <strong> deliveryFee</strong>: in currency units (e.g. 100 = {symbol}100). Optional, defaults to 0.
                </p>
              </div>
              <Input
                ref={orderFileRef}
                type="file"
                accept=".csv"
                onChange={handleOrderFile}
                data-testid="input-csv-orders"
              />
              {orderRows.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{orderFileName} - {orderRows.length} order(s)</p>
                  <div className="border rounded-lg overflow-auto max-h-36">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {orderHeaders.map(h => <TableHead key={h} className="text-xs whitespace-nowrap py-1 px-2">{h}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderRows.slice(0, 5).map((row, i) => (
                          <TableRow key={i} data-testid={`orders-preview-row-${i}`}>
                            {orderHeaders.map(h => (
                              <TableCell key={h} className="text-xs py-1 px-2">{row[h] || '-'}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {orderRows.length > 5 && <p className="text-xs text-muted-foreground">...and {orderRows.length - 5} more</p>}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium">Order Items CSV Headers:</p>
                <code className="text-xs bg-muted px-2 py-1 rounded block" data-testid="text-items-csv-headers">
                  {itemHeaders.join(', ')}
                </code>
                <p className="text-muted-foreground text-xs mt-1">
                  <strong>orderRef</strong> must match an orderRef from the Orders CSV.
                  <strong> productSKU</strong> = product or variant SKU code. If a variant SKU is used, the variant is resolved automatically.
                  <strong> unitPrice</strong> in currency units (e.g. 1950 = {symbol}1,950).
                  <strong> discountPercent</strong>: 0-100 (e.g. 50 = 50% off).
                  <strong> variantName</strong>: optional — use if product has variants and you're matching by product SKU (e.g. "Small", "Large").
                </p>
              </div>
              <Input
                ref={itemFileRef}
                type="file"
                accept=".csv"
                onChange={handleItemFile}
                data-testid="input-csv-order-items"
              />
              {itemRows.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{itemFileName} - {itemRows.length} item(s)</p>
                  <div className="border rounded-lg overflow-auto max-h-36">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {itemHeaders.map(h => <TableHead key={h} className="text-xs whitespace-nowrap py-1 px-2">{h}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemRows.slice(0, 5).map((row, i) => (
                          <TableRow key={i} data-testid={`items-preview-row-${i}`}>
                            {itemHeaders.map(h => (
                              <TableCell key={h} className="text-xs py-1 px-2">{row[h] || '-'}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {itemRows.length > 5 && <p className="text-xs text-muted-foreground">...and {itemRows.length - 5} more</p>}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Uploading orders will automatically update inventory (stock decreases) and create ledger entries.
              <strong>Credit</strong> orders will increase customer balances (no payment recorded).
              <strong>COD</strong> and <strong>Bank Transfer/QR</strong> orders will auto-record a payment entry (balance unchanged).
            </p>
          </div>

          {(customers || []).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">View Customer IDs for reference</summary>
              <div className="mt-2 max-h-32 overflow-auto border rounded p-2 space-y-1">
                {(customers || []).map((c: any) => (
                  <div key={c.id} className="flex gap-2">
                    <span className="font-mono font-bold">{c.id}</span>
                    <span>{c.name}</span>
                    {c.phone && <span className="text-muted-foreground">({c.phone})</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetAndClose} data-testid="button-cancel-bulk-orders">Cancel</Button>
            <Button
              onClick={handleUpload}
              disabled={orderRows.length === 0 || itemRows.length === 0 || isUploading}
              data-testid="button-submit-bulk-orders"
            >
              {isUploading ? "Uploading..." : `Upload ${orderRows.length} Order(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
