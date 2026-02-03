import React, { useState, useEffect } from "react";
import { useOrders, useCreateOrder, useUpdateOrderStatus, useEditOrder, useUpdatePaymentStatus } from "@/hooks/use-orders";
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers";
import { Label } from "@/components/ui/label";
import { useProducts } from "@/hooks/use-products";
import { useCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, ShoppingCart, Trash2, CheckCircle, XCircle, Clock, Package, Truck, ChevronDown, ChevronRight, FileText, Pencil } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<string>("new");
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [editingOrder, setEditingOrder] = useState<any>(null);
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

  const filteredOrders = orders?.filter(order => normalizeStatus(order.status) === activeTab) || [];

  const getOrderCount = (status: string) => {
    return orders?.filter(o => normalizeStatus(o.status) === status).length || 0;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Orders</h1>
          <p className="text-muted-foreground">Track and fulfill customer orders.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="shadow-lg shadow-primary/25" data-testid="button-new-order">
          <Plus className="w-4 h-4 mr-2" />
          New Order
        </Button>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
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
                            <TableCell className="text-muted-foreground text-sm">{format(new Date(order.createdAt!), 'MMM dd, yyyy')}</TableCell>
                            <TableCell className="font-mono font-medium">{formatCurrency(order.totalAmount)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("capitalize", getStatusBadgeStyle(normalizeStatus(order.status)))}>
                                {getStatusLabel(normalizeStatus(order.status))}
                              </Badge>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <PaymentStatusCell order={order} />
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

function OrderDetails({ order, formatCurrency }: { order: any; formatCurrency: (cents: number) => string }) {
  const items = order.items || [];
  
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
      
      <div className="flex justify-end pt-2 border-t">
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-lg font-bold font-mono">{formatCurrency(order.totalAmount)}</div>
        </div>
      </div>
    </div>
  );
}

function EditOrderDialog({ order, open, onOpenChange }: { order: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { formatCurrency, symbol } = useCurrency();
  const { toast } = useToast();
  const editOrder = useEditOrder();
  
  const [note, setNote] = useState(order?.note || "");
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
  const [orderNote, setOrderNote] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"COD" | "Bank Transfer/QR" | "Credit">("Credit");
  
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();
  const createOrder = useCreateOrder();
  const createCustomer = useCreateCustomer();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  
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
      });
      setCustomerId(newCustomer.id.toString());
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      setNewCustomerAddress("");
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
    
    try {
      await createOrder.mutateAsync({
        customerId: parseInt(customerId),
        items: cart.map(item => ({ 
          productId: item.productId, 
          quantity: item.quantity,
          discountPercent: item.discountPercent > 0 ? item.discountPercent : undefined
        })),
        note: orderNote.trim() || undefined,
        paymentStatus: paymentStatus
      });
      toast({ title: "Order created successfully!" });
      onOpenChange(false);
      // Reset state
      setStep(1);
      setCustomerId("");
      setCart([]);
      setOrderNote("");
      setPaymentStatus("Credit");
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
                  {paymentStatus === "Credit" 
                    ? "Customer will pay later. You can add payment in the ledger later."
                    : "Payment will be recorded automatically in the customer's ledger."}
                </p>
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
