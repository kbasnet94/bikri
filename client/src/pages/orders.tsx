import { useState } from "react";
import { useOrders, useCreateOrder, useUpdateOrderStatus } from "@/hooks/use-orders";
import { useCustomers } from "@/hooks/use-customers";
import { useProducts } from "@/hooks/use-products";
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
                        <TableCell className="font-mono font-medium">${(order.totalAmount / 100).toFixed(2)}</TableCell>
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

function CreateOrderDialog({ open, onOpenChange }: any) {
  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState<string>("");
  const [cart, setCart] = useState<{ productId: number; quantity: number; product: any }[]>([]);
  
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();
  const createOrder = useCreateOrder();
  const { toast } = useToast();

  const addToCart = (product: any) => {
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      setCart(cart.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { productId: product.id, quantity: 1, product }]);
    }
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty < 1) return;
    setCart(cart.map(item => item.productId === productId ? { ...item, quantity: qty } : item));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const handleSubmit = async () => {
    if (!customerId || cart.length === 0) return;
    
    try {
      await createOrder.mutateAsync({
        customerId: parseInt(customerId),
        items: cart.map(item => ({ productId: item.productId, quantity: item.quantity }))
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
              <h3 className="font-semibold text-lg">Select Customer</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customers?.map(c => (
                  <div 
                    key={c.id} 
                    className={cn(
                      "p-4 rounded-xl border cursor-pointer transition-all hover:border-primary",
                      customerId === c.id.toString() ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                    )}
                    onClick={() => setCustomerId(c.id.toString())}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-muted-foreground">{c.email}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Add Products</h3>
                <div className="text-sm text-muted-foreground">{cart.length} items in cart</div>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {products?.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/5">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">Stock: {p.stockQuantity}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="font-mono text-sm">${(p.price / 100).toFixed(2)}</div>
                      <Button size="sm" variant="secondary" onClick={() => addToCart(p)} disabled={p.stockQuantity === 0}>
                        Add
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Review Order</h3>
              
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.productId} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{item.product.name}</div>
                      <div className="text-xs text-muted-foreground">${(item.product.price / 100).toFixed(2)} each</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input 
                        type="number" 
                        value={item.quantity} 
                        onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value))} 
                        className="w-16 h-8 text-center"
                      />
                      <div className="font-mono font-medium w-20 text-right">
                        ${((item.product.price * item.quantity) / 100).toFixed(2)}
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => removeFromCart(item.productId)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 flex justify-between items-center">
                <div className="text-muted-foreground">Total Amount</div>
                <div className="text-2xl font-bold font-mono">${(totalAmount / 100).toFixed(2)}</div>
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
