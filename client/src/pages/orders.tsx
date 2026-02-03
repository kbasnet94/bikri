import { useState } from "react";
import { useOrders, useCreateOrder, useUpdateOrderStatus } from "@/hooks/use-orders";
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers";
import { Label } from "@/components/ui/label";
import { useProducts } from "@/hooks/use-products";
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
import { Plus, ShoppingCart, Trash2, CheckCircle, XCircle, Clock, Package, Truck } from "lucide-react";
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
  const { data: orders, isLoading } = useOrders();
  const updateStatus = useUpdateOrderStatus();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

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
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading orders...</TableCell></TableRow>
                  ) : filteredOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No {status.label.toLowerCase()} orders.</TableCell></TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id} className="group" data-testid={`order-row-${order.id}`}>
                        <TableCell className="font-mono text-xs text-muted-foreground">#{order.id}</TableCell>
                        <TableCell className="font-medium">{order.customer?.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{format(new Date(order.createdAt!), 'MMM dd, yyyy')}</TableCell>
                        <TableCell className="font-mono font-medium">{formatCurrency(order.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("capitalize", getStatusBadgeStyle(normalizeStatus(order.status)))}>
                            {getStatusLabel(normalizeStatus(order.status))}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <OrderActions order={order} onStatusUpdate={handleStatusUpdate} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <CreateOrderDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

function OrderActions({ order, onStatusUpdate }: { order: any; onStatusUpdate: (id: number, status: string) => void }) {
  const normalizedStatus = normalizeStatus(order.status);
  const nextStatusMap: Record<string, string> = {
    'new': 'in-process',
    'in-process': 'ready',
    'ready': 'completed',
  };

  const nextStatus = nextStatusMap[normalizedStatus];
  const canCancel = normalizedStatus !== 'completed' && normalizedStatus !== 'cancelled';

  return (
    <div className="flex justify-end gap-2">
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

function ProductRow({ 
  product, 
  isInCart, 
  cartQuantity, 
  cartDiscount,
  formatCurrency, 
  onAdd, 
  onRemove 
}: { 
  product: any; 
  isInCart: boolean;
  cartQuantity: number;
  cartDiscount: number;
  formatCurrency: (cents: number) => string;
  onAdd: (quantity: number, discount: number) => void;
  onRemove: () => void;
}) {
  const [quantity, setQuantity] = useState(cartQuantity);
  const [discount, setDiscount] = useState(cartDiscount);
  
  const effectivePrice = Math.max(0, product.price - discount);
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
                className="w-16 h-8 text-center"
                min={1}
                max={product.stockQuantity}
                data-testid={`input-quantity-${product.id}`}
              />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground mb-1">Discount</span>
              <Input 
                type="number" 
                value={discount / 100} 
                onChange={(e) => setDiscount(Math.max(0, (parseFloat(e.target.value) || 0) * 100))} 
                className="w-20 h-8 text-center"
                min={0}
                step={0.01}
                placeholder="0.00"
                data-testid={`input-discount-${product.id}`}
              />
            </div>
          </div>
          
          <div className="text-right min-w-[80px]">
            <div className="font-mono font-medium text-sm">{formatCurrency(lineTotal)}</div>
            {discount > 0 && (
              <div className="text-[10px] text-green-600">-{formatCurrency(discount * quantity)}</div>
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
              onClick={() => onAdd(quantity, discount)} 
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
  const [cart, setCart] = useState<{ productId: number; quantity: number; discount: number; product: any }[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  
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
      });
      setCustomerId(newCustomer.id.toString());
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      toast({ title: "Customer created successfully!" });
    } catch (error: any) {
      toast({ title: "Failed to create customer", description: error.message, variant: "destructive" });
    }
  };

  const addToCart = (product: any, quantity: number, discount: number) => {
    if (quantity < 1) return;
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      setCart(cart.map(item => item.productId === product.id ? { ...item, quantity, discount } : item));
    } else {
      setCart([...cart, { productId: product.id, quantity, discount, product }]);
    }
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty < 1) return;
    setCart(cart.map(item => item.productId === productId ? { ...item, quantity: qty } : item));
  };

  const updateDiscount = (productId: number, discount: number) => {
    if (discount < 0) return;
    setCart(cart.map(item => item.productId === productId ? { ...item, discount } : item));
  };

  const totalAmount = cart.reduce((sum, item) => {
    const effectivePrice = Math.max(0, item.product.price - item.discount);
    return sum + (effectivePrice * item.quantity);
  }, 0);

  const handleSubmit = async () => {
    if (!customerId || cart.length === 0) return;
    
    try {
      await createOrder.mutateAsync({
        customerId: parseInt(customerId),
        items: cart.map(item => ({ 
          productId: item.productId, 
          quantity: item.quantity,
          discount: item.discount > 0 ? item.discount : undefined
        }))
      });
      toast({ title: "Order created successfully!" });
      onOpenChange(false);
      // Reset state
      setStep(1);
      setCustomerId("");
      setCart([]);
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
                      cartDiscount={cartItem?.discount || 0}
                      formatCurrency={formatCurrency}
                      onAdd={(qty, discount) => addToCart(p, qty, discount)}
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
                  const effectivePrice = Math.max(0, item.product.price - item.discount);
                  const lineTotal = effectivePrice * item.quantity;
                  return (
                    <div key={item.productId} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{item.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.product.price)} each
                          {item.discount > 0 && (
                            <span className="text-green-600 ml-2">(-{formatCurrency(item.discount)} discount)</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-muted-foreground">Qty</span>
                          <Input 
                            type="number" 
                            value={item.quantity} 
                            onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 1)} 
                            className="w-16 h-8 text-center"
                            min={1}
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-muted-foreground">Discount</span>
                          <Input 
                            type="number" 
                            value={item.discount / 100} 
                            onChange={(e) => updateDiscount(item.productId, Math.max(0, (parseFloat(e.target.value) || 0) * 100))} 
                            className="w-20 h-8 text-center"
                            min={0}
                            step={0.01}
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

              <div className="border-t pt-4">
                {cart.some(item => item.discount > 0) && (
                  <div className="flex justify-between items-center text-sm text-green-600 mb-2">
                    <div>Total Discounts</div>
                    <div className="font-mono">-{formatCurrency(cart.reduce((sum, item) => sum + (item.discount * item.quantity), 0))}</div>
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
            <Button onClick={handleSubmit} disabled={cart.length === 0 || createOrder.isPending}>
              {createOrder.isPending ? "Creating..." : "Confirm Order"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
