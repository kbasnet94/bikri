import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrders, useCreateOrder, useUpdateOrderStatus, useEditOrder, useUpdatePaymentStatus } from "@/hooks/use-orders";
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers";
import { Label } from "@/components/ui/label";
import { useProducts } from "@/hooks/use-products";
import { useCurrency } from "@/hooks/use-currency";
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
import { Plus, ShoppingCart, Trash2, CheckCircle, XCircle, Clock, Package, Truck, ChevronDown, ChevronRight, FileText, Pencil, Search, DollarSign, ShoppingBag, X, Receipt, Upload, AlertCircle } from "lucide-react";
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
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { data: orders, isLoading } = useOrders();
  const updateStatus = useUpdateOrderStatus();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

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

  const clearFilters = () => {
    setSearchQuery("");
    setPaymentFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = searchQuery || paymentFilter !== "all" || dateFrom || dateTo;

  // Apply all filters: tab status, search, payment filter, date range
  const filteredOrders = (orders || []).filter(order => {
    // Tab filter (status)
    if (normalizeStatus(order.status) !== activeTab) return false;
    
    // Search filter (name or phone)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const customerName = order.customer?.name?.toLowerCase() || "";
      const customerPhone = order.customer?.phone?.toLowerCase() || "";
      if (!customerName.includes(query) && !customerPhone.includes(query)) return false;
    }
    
    // Payment status filter
    if (paymentFilter !== "all") {
      const orderPayment = order.paymentStatus || "Credit";
      if (orderPayment !== paymentFilter) return false;
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      const orderDate = new Date(order.orderDate || order.createdAt!);
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (orderDate < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (orderDate > toDate) return false;
      }
    }
    
    return true;
  });

  // KPI calculations based on filtered orders
  const kpiData = {
    totalOrders: filteredOrders.length,
    totalRevenue: filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    totalUnits: filteredOrders.reduce((sum, o) => {
      const orderItems = o.items || [];
      return sum + orderItems.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 0), 0);
    }, 0),
  };

  const getOrderCount = (status: string) => {
    // Apply search, payment, and date filters but not tab filter
    return (orders || []).filter(o => {
      if (normalizeStatus(o.status) !== status) return false;
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const customerName = o.customer?.name?.toLowerCase() || "";
        const customerPhone = o.customer?.phone?.toLowerCase() || "";
        if (!customerName.includes(query) && !customerPhone.includes(query)) return false;
      }
      
      if (paymentFilter !== "all") {
        const orderPayment = o.paymentStatus || "Credit";
        if (orderPayment !== paymentFilter) return false;
      }
      
      if (dateFrom || dateTo) {
        const orderDate = new Date(o.orderDate || o.createdAt!);
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (orderDate < fromDate) return false;
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (orderDate > toDate) return false;
        }
      }
      
      return true;
    }).length;
  };

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
              <p className="text-xl font-bold" data-testid="kpi-total-orders">{kpiData.totalOrders}</p>
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
              <p className="text-xl font-bold" data-testid="kpi-total-units">{kpiData.totalUnits}</p>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                ({getOrderCount(status.value)})
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
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>VAT Bill #</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center">Loading orders...</TableCell></TableRow>
                  ) : filteredOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No {status.label.toLowerCase()} orders.</TableCell></TableRow>
                  ) : (
                    filteredOrders.map((order) => {
                      const isExpanded = expandedOrders.has(order.id);
                      return (
                        <React.Fragment key={order.id}>
                          <TableRow 
                            key={order.id} 
                            className="group cursor-pointer hover:bg-muted/30" 
                            data-testid={`order-row-${order.id}`}
                            onClick={() => toggleExpanded(order.id)}
                          >
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                #{order.id}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{order.customer?.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{order.customer?.address || '-'}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{format(new Date(order.orderDate!), 'MMM dd, yyyy')}</TableCell>
                            <TableCell className="font-mono font-medium">{formatCurrency(order.totalAmount)}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <PaymentStatusCell order={order} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {order.vatBillNumber || '-'}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <OrderActions order={order} onStatusUpdate={handleStatusUpdate} onEdit={setEditingOrder} />
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${order.id}-details`} className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={8} className="p-4">
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
            </div>
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
  const paymentStatus = order.paymentStatus || "Credit";
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

function OrderActions({ order, onStatusUpdate, onEdit }: { order: any; onStatusUpdate: (id: number, status: string) => void; onEdit: (order: any) => void }) {
  const normalizedStatus = normalizeStatus(order.status);
  const nextStatusMap: Record<string, string> = {
    'new': 'in-process',
    'in-process': 'ready',
    'ready': 'completed',
  };

  const nextStatus = nextStatusMap[normalizedStatus];
  const canCancel = normalizedStatus !== 'completed' && normalizedStatus !== 'cancelled';
  const canEdit = normalizedStatus !== 'completed' && normalizedStatus !== 'cancelled';

  return (
    <div className="flex justify-end gap-2">
      {canEdit && (
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8" 
          onClick={(e) => { e.stopPropagation(); onEdit(order); }}
          data-testid={`button-edit-order-${order.id}`}
        >
          <Pencil className="w-4 h-4" />
        </Button>
      )}
      {nextStatus && (
        <Select onValueChange={(value) => onStatusUpdate(order.id, value)}>
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue placeholder="Move to..." />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.filter(s => s.value !== normalizedStatus && s.value !== 'cancelled').map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {canCancel && (
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" 
          onClick={() => onStatusUpdate(order.id, 'cancelled')}
          data-testid={`button-cancel-order-${order.id}`}
        >
          <XCircle className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

function VatCalculationsDialog({ order, formatCurrency, open, onOpenChange }: { order: any; formatCurrency: (cents: number) => string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const items = order.items || [];

  const vatRows = items.map((item: any) => {
    const effectivePrice = item.unitPrice - (item.discount || 0);
    const rateCents = effectivePrice / 1.13;
    const amountCents = rateCents * item.quantity;
    return {
      name: item.product?.name || `Product #${item.productId}`,
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
            <div data-testid="vat-customer-pan">{order.customer?.panVatNumber || '-'}</div>
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
            const effectivePrice = item.unitPrice - item.discount;
            const lineTotal = effectivePrice * item.quantity;
            
            return (
              <div key={item.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                <div className="flex-1">
                  <div className="font-medium">{item.product?.name || `Product #${item.productId}`}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(item.unitPrice)} each
                    {hasDiscount && (
                      <span className="text-green-600 ml-2">
                        (-{formatCurrency(item.discount)} discount)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
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
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-lg font-bold font-mono">{formatCurrency(order.totalAmount)}</div>
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
  
  const [note, setNote] = useState(order?.note || "");
  const [orderDate, setOrderDate] = useState(() => order?.orderDate ? format(new Date(order.orderDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<{ id: number; productName: string; unitPrice: number; quantity: number; discountPercent: number }[]>([]);
  
  useEffect(() => {
    if (order?.items) {
      setItems(order.items.map((item: any) => ({
        id: item.id,
        productName: item.product?.name || `Product #${item.productId}`,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        discountPercent: item.unitPrice > 0 ? Math.round((item.discount / item.unitPrice) * 100) : 0,
      })));
      setNote(order.note || "");
      setOrderDate(order.orderDate ? format(new Date(order.orderDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
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
                    <div className="font-medium">{item.productName}</div>
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
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={editOrder.isPending} data-testid="button-save-order-edit">
            {editOrder.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductRow({ 
  product, 
  isInCart, 
  cartQuantity, 
  cartDiscountPercent,
  formatCurrency, 
  onAdd, 
  onRemove 
}: { 
  product: any; 
  isInCart: boolean;
  cartQuantity: number;
  cartDiscountPercent: number;
  formatCurrency: (cents: number) => string;
  onAdd: (quantity: number, discountPercent: number) => void;
  onRemove: () => void;
}) {
  const [quantity, setQuantity] = useState(cartQuantity);
  const [discountPercent, setDiscountPercent] = useState(cartDiscountPercent);
  
  const discountAmount = Math.round(product.price * discountPercent / 100);
  const effectivePrice = Math.max(0, product.price - discountAmount);
  const lineTotal = effectivePrice * quantity;
  
  return (
    <div className={cn(
      "p-4 border rounded-lg transition-all",
      isInCart ? "border-primary bg-primary/5" : "hover:bg-muted/5"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-medium">{product.name}</div>
          <div className="text-xs text-muted-foreground">
            Stock: {product.stockQuantity} | Base price: {formatCurrency(product.price)}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground mb-1">Qty</span>
              <Input 
                type="number" 
                value={quantity} 
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} 
                className="w-16 h-8 text-center no-spinners"
                min={1}
                max={product.stockQuantity}
                data-testid={`input-quantity-${product.id}`}
              />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground mb-1">Disc %</span>
              <Input 
                type="number" 
                value={discountPercent} 
                onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} 
                className="w-16 h-8 text-center no-spinners"
                min={0}
                max={100}
                step={1}
                placeholder="0"
                data-testid={`input-discount-${product.id}`}
              />
            </div>
          </div>
          
          <div className="text-right min-w-[80px]">
            <div className="font-mono font-medium text-sm">{formatCurrency(lineTotal)}</div>
            {discountPercent > 0 && (
              <div className="text-[10px] text-green-600">-{discountPercent}%</div>
            )}
          </div>
          
          {isInCart ? (
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={onRemove}
              data-testid={`button-remove-product-${product.id}`}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remove
            </Button>
          ) : (
            <Button 
              size="sm" 
              onClick={() => onAdd(quantity, discountPercent)} 
              disabled={product.stockQuantity === 0}
              data-testid={`button-add-product-${product.id}`}
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
  const [cart, setCart] = useState<{ productId: number; quantity: number; discountPercent: number; product: any }[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerPanVat, setNewCustomerPanVat] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"COD" | "Bank Transfer/QR" | "Credit" | "">("");
  const [orderDate, setOrderDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [includeVat, setIncludeVat] = useState(false);
  const [vatBillNumber, setVatBillNumber] = useState("");
  
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();
  const createOrder = useCreateOrder();
  const createCustomer = useCreateCustomer();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  const { data: nextVatData } = useQuery<{ nextBillNumber: string }>({
    queryKey: ['/api/vat/next-bill-number'],
    queryFn: async () => {
      const res = await fetch('/api/vat/next-bill-number', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch next VAT bill number');
      return res.json();
    },
    enabled: open && includeVat,
  });

  useEffect(() => {
    if (includeVat && nextVatData?.nextBillNumber && !vatBillNumber) {
      setVatBillNumber(nextVatData.nextBillNumber);
    }
  }, [includeVat, nextVatData]);
  
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
    try {
      const newCustomer = await createCustomer.mutateAsync({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        email: newCustomerEmail.trim() || null,
        address: newCustomerAddress.trim() || null,
        panVatNumber: newCustomerPanVat.trim() || null,
      });
      setCustomerId(newCustomer.id.toString());
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      setNewCustomerAddress("");
      setNewCustomerPanVat("");
      toast({ title: "Customer created successfully!" });
    } catch (error: any) {
      toast({ title: "Failed to create customer", description: error.message, variant: "destructive" });
    }
  };

  const addToCart = (product: any, quantity: number, discountPercent: number) => {
    if (quantity < 1) return;
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      setCart(cart.map(item => item.productId === product.id ? { ...item, quantity, discountPercent } : item));
    } else {
      setCart([...cart, { productId: product.id, quantity, discountPercent, product }]);
    }
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty < 1) return;
    setCart(cart.map(item => item.productId === productId ? { ...item, quantity: qty } : item));
  };

  const updateDiscountPercent = (productId: number, discountPercent: number) => {
    if (discountPercent < 0 || discountPercent > 100) return;
    setCart(cart.map(item => item.productId === productId ? { ...item, discountPercent } : item));
  };

  const totalAmount = cart.reduce((sum, item) => {
    const discountAmount = Math.round(item.product.price * item.discountPercent / 100);
    const effectivePrice = Math.max(0, item.product.price - discountAmount);
    return sum + (effectivePrice * item.quantity);
  }, 0);

  const hasStockIssue = cart.some(item => item.quantity > item.product.stockQuantity);

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
      await createOrder.mutateAsync({
        customerId: parseInt(customerId),
        items: cart.map(item => ({ 
          productId: item.productId, 
          quantity: item.quantity,
          discountPercent: item.discountPercent > 0 ? item.discountPercent : undefined
        })),
        note: orderNote.trim() || undefined,
        paymentStatus: paymentStatus as "COD" | "Bank Transfer/QR" | "Credit",
        orderDate: orderDate,
        vatBillNumber: includeVat && vatBillNumber.trim() ? vatBillNumber.trim() : undefined,
      });
      toast({ title: "Order created successfully!" });
      onOpenChange(false);
      // Reset state
      setStep(1);
      setCustomerId("");
      setCart([]);
      setOrderNote("");
      setPaymentStatus("");
      setOrderDate(format(new Date(), "yyyy-MM-dd"));
      setIncludeVat(false);
      setVatBillNumber("");
    } catch (error: any) {
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
                            placeholder="Phone number" 
                            value={newCustomerPhone}
                            onChange={(e) => setNewCustomerPhone(e.target.value)}
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
              
              <div className="grid grid-cols-1 gap-3">
                {products?.map(p => {
                  const cartItem = cart.find(item => item.productId === p.id);
                  const isInCart = !!cartItem;
                  return (
                    <ProductRow 
                      key={p.id} 
                      product={p} 
                      isInCart={isInCart}
                      cartQuantity={cartItem?.quantity || 1}
                      cartDiscountPercent={cartItem?.discountPercent || 0}
                      formatCurrency={formatCurrency}
                      onAdd={(qty, discountPercent) => addToCart(p, qty, discountPercent)}
                      onRemove={() => removeFromCart(p.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Review Order</h3>
              
              <div className="space-y-3">
                {cart.map(item => {
                  const discountAmount = Math.round(item.product.price * item.discountPercent / 100);
                  const effectivePrice = Math.max(0, item.product.price - discountAmount);
                  const lineTotal = effectivePrice * item.quantity;
                  const exceedsStock = item.quantity > item.product.stockQuantity;
                  return (
                    <div key={item.productId} className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      exceedsStock ? "bg-red-500/10 border border-red-500/30" : "bg-muted/20"
                    )}>
                      <div className="flex-1">
                        <div className="font-medium">{item.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.product.price)} each
                          {item.discountPercent > 0 && (
                            <span className="text-green-600 ml-2">(-{item.discountPercent}% = {formatCurrency(discountAmount)} off)</span>
                          )}
                        </div>
                        {exceedsStock && (
                          <div className="text-xs text-red-500 mt-1">
                            Only {item.product.stockQuantity} in stock
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-muted-foreground">Qty</span>
                          <Input 
                            type="number" 
                            value={item.quantity} 
                            onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 1)} 
                            className="w-16 h-8 text-center no-spinners"
                            min={1}
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-muted-foreground">Disc %</span>
                          <Input 
                            type="number" 
                            value={item.discountPercent} 
                            onChange={(e) => updateDiscountPercent(item.productId, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} 
                            className="w-16 h-8 text-center no-spinners"
                            min={0}
                            max={100}
                            step={1}
                          />
                        </div>
                        <div className="font-mono font-medium w-20 text-right">
                          {formatCurrency(lineTotal)}
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => removeFromCart(item.productId)}>
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

              <div className="border-t pt-4">
                {cart.some(item => item.discountPercent > 0) && (
                  <div className="flex justify-between items-center text-sm text-green-600 mb-2">
                    <div>Total Discounts</div>
                    <div className="font-mono">-{formatCurrency(cart.reduce((sum, item) => {
                      const discountAmount = Math.round(item.product.price * item.discountPercent / 100);
                      return sum + (discountAmount * item.quantity);
                    }, 0))}</div>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <div className="text-muted-foreground">Total Amount</div>
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
  const orderFileRef = useRef<HTMLInputElement>(null);
  const itemFileRef = useRef<HTMLInputElement>(null);
  const [orderRows, setOrderRows] = useState<any[]>([]);
  const [itemRows, setItemRows] = useState<any[]>([]);
  const [orderFileName, setOrderFileName] = useState("");
  const [itemFileName, setItemFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { data: customers } = useCustomers();
  const { symbol } = useCurrency();

  const orderHeaders = ['orderRef', 'customerRefID', 'status', 'paymentStatus', 'note', 'vatBillNumber', 'orderDate'];
  const itemHeaders = ['orderRef', 'productSKU', 'quantity', 'unitPrice', 'discountPercent'];

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
    if (orderRows.length === 0 || itemRows.length === 0) return;
    setIsUploading(true);
    try {
      const res = await fetch('/api/bulk/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: orderRows, items: itemRows }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        const errorCount = data.errors?.length || 0;
        const firstErrors = (data.errors || []).slice(0, 5).map((e: any) => 
          `${e.file ? `[${e.file}] ` : ''}${e.row > 0 ? `Row ${e.row}: ` : ''}${e.message}`
        ).join('\n');
        toast({ title: `${errorCount} error(s) found`, description: firstErrors, variant: "destructive" });
        return;
      }
      toast({ title: `${data.created} order(s) created successfully. Inventory and ledger updated.` });
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
      resetAndClose();
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
                  <strong> productSKU</strong> = product's SKU code.
                  <strong> unitPrice</strong> in currency units (e.g. 1950 = {symbol}1,950).
                  <strong> discountPercent</strong>: 0-100 (e.g. 50 = 50% off).
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
              Credit orders will increase customer balances. COD/Bank Transfer orders will auto-record payments.
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
