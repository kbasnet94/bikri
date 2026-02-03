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
import { Plus, ShoppingCart, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function Orders() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data: orders, isLoading } = useOrders();
  const updateStatus = useUpdateOrderStatus();
  const { toast } = useToast();

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({ title: `Order marked as ${status}` });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Orders</h1>
          <p className="text-muted-foreground">Track and fulfill customer orders.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="shadow-lg shadow-primary/25">
          <Plus className="w-4 h-4 mr-2" />
          New Order
        </Button>
      </div>

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
            ) : orders?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No orders found.</TableCell></TableRow>
            ) : (
              orders?.map((order) => (
                <TableRow key={order.id} className="group">
                  <TableCell className="font-mono text-xs text-muted-foreground">#{order.id}</TableCell>
                  <TableCell className="font-medium">{order.customer?.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(order.createdAt!), 'MMM dd, yyyy')}</TableCell>
                  <TableCell className="font-mono font-medium">${(order.totalAmount / 100).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      "capitalize",
                      order.status === 'completed' ? "bg-green-100 text-green-700 border-green-200" :
                      order.status === 'pending' ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                      "bg-red-100 text-red-700 border-red-200"
                    )}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {order.status === 'pending' && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleStatusUpdate(order.id, 'completed')}>
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleStatusUpdate(order.id, 'cancelled')}>
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateOrderDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
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
