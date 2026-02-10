import { useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/hooks/use-categories";
import { useInventoryMovements, useCreateInventoryMovement, useStockAtDate } from "@/hooks/use-inventory-movements";
import { useCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, Filter, X, Package, History, ArrowUpCircle, ArrowDownCircle, RefreshCw, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type InsertProduct, type ProductResponse, INVENTORY_MOVEMENT_TYPES, type InventoryMovementType } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { format } from "date-fns";

// Create a schema that coerces strings to numbers for form inputs
// Price is entered as decimal (e.g., 12.99) and converted to cents for storage
const formSchema = insertProductSchema.extend({
  price: z.coerce.number().min(0, "Price must be positive"),
  stockQuantity: z.coerce.number().min(0, "Stock cannot be negative"),
  categoryId: z.coerce.number().optional().nullable(),
});

// Helper to convert cents to decimal for display
const centsToDecimal = (cents: number) => cents / 100;
// Helper to convert decimal to cents for storage
const decimalToCents = (decimal: number) => Math.round(decimal * 100);

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductResponse | null>(null);
  const [recordStockProduct, setRecordStockProduct] = useState<ProductResponse | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductResponse | null>(null);
  const { formatCurrency } = useCurrency();

  const { data: products, isLoading } = useProducts({ 
    search, 
    categoryId: selectedCategory === "all" ? undefined : parseInt(selectedCategory) 
  });
  const { data: categories } = useCategories();
  
  const deleteProduct = useDeleteProduct();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      try {
        await deleteProduct.mutateAsync(id);
        toast({ title: "Product deleted" });
      } catch (error) {
        toast({ title: "Error deleting product", variant: "destructive" });
      }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Inventory</h1>
          <p className="text-muted-foreground">Manage your products and stock levels.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="shadow-lg shadow-primary/25">
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-xl shadow-sm border border-border/50">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search products..." 
            className="pl-9 bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <SelectValue placeholder="Category" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Product Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">Loading inventory...</TableCell>
              </TableRow>
            ) : products?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No products found.</TableCell>
              </TableRow>
            ) : (
              products?.map((product) => (
                <TableRow key={product.id} className="group">
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                  <TableCell>
                    {product.category?.name ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {product.category.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">Uncategorized</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                  <TableCell className="text-right">
                    <span className={product.stock_quantity < 10 ? "text-red-500 font-bold" : ""}>
                      {product.stock_quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setRecordStockProduct(product)}
                        title="Record Stock"
                        data-testid={`button-record-stock-${product.id}`}
                      >
                        <Package className="w-4 h-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setHistoryProduct(product)}
                        title="View History"
                        data-testid={`button-view-history-${product.id}`}
                      >
                        <History className="w-4 h-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditingProduct(product)} data-testid={`button-edit-product-${product.id}`}>
                        <Pencil className="w-4 h-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)} data-testid={`button-delete-product-${product.id}`}>
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ProductDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
        mode="create" 
        categories={categories || []}
      />
      
      {editingProduct && (
        <ProductDialog 
          open={!!editingProduct} 
          onOpenChange={(open: boolean) => !open && setEditingProduct(null)} 
          mode="edit" 
          defaultValues={editingProduct}
          categories={categories || []}
        />
      )}

      {recordStockProduct && (
        <RecordStockDialog
          open={!!recordStockProduct}
          onOpenChange={(open: boolean) => !open && setRecordStockProduct(null)}
          product={recordStockProduct}
        />
      )}

      {historyProduct && (
        <InventoryHistoryDialog
          open={!!historyProduct}
          onOpenChange={(open: boolean) => !open && setHistoryProduct(null)}
          product={historyProduct}
        />
      )}
    </div>
  );
}

function ProductDialog({ open, onOpenChange, mode, defaultValues, categories }: any) {
  const { toast } = useToast();
  const { symbol } = useCurrency();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  
  // Convert price from cents to decimal for editing
  const formDefaults = defaultValues 
    ? { ...defaultValues, price: centsToDecimal(defaultValues.price || 0) }
    : {
        name: "",
        sku: "",
        description: "",
        price: 0,
        stockQuantity: 0,
        categoryId: null,
      };
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults,
  });

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const newCat = await createCategory.mutateAsync({ name: newCategoryName.trim() });
      form.setValue("categoryId", newCat.id);
      setNewCategoryName("");
      setShowNewCategory(false);
      toast({ title: "Category created" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteCategory = async (catId: number) => {
    if (!confirm("Delete this category? Products using it will become uncategorized.")) return;
    try {
      await deleteCategory.mutateAsync(catId);
      if (form.getValues("categoryId") === catId) {
        form.setValue("categoryId", null);
      }
      toast({ title: "Category deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      // Convert price from decimal to cents for storage
      const dataToSubmit = { ...values, price: decimalToCents(values.price) };
      
      if (mode === "create") {
        await createProduct.mutateAsync(dataToSubmit as InsertProduct);
        toast({ title: "Product created successfully" });
      } else {
        await updateProduct.mutateAsync({ id: defaultValues.id, ...dataToSubmit } as any);
        toast({ title: "Product updated successfully" });
      }
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add New Product" : "Edit Product"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input placeholder="Product Name" {...field} data-testid="input-product-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl><Input placeholder="SKU-123" {...field} data-testid="input-product-sku" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center justify-between">
                      <span>Category</span>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-auto p-0 text-xs text-primary hover:text-primary/80"
                        onClick={() => setShowCategoryManager(!showCategoryManager)}
                        data-testid="button-manage-categories"
                      >
                        {showCategoryManager ? "Hide" : "Manage"}
                      </Button>
                    </FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val ? Number(val) : null)} 
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {showCategoryManager && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                <div className="text-sm font-medium">Manage Categories</div>
                
                {!showNewCategory ? (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowNewCategory(true)}
                    data-testid="button-add-category"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Category
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Category name" 
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1"
                      data-testid="input-new-category-name"
                    />
                    <Button 
                      type="button" 
                      size="sm" 
                      onClick={handleCreateCategory}
                      disabled={createCategory.isPending}
                      data-testid="button-save-category"
                    >
                      {createCategory.isPending ? "..." : "Save"}
                    </Button>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon"
                      onClick={() => { setShowNewCategory(false); setNewCategoryName(""); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                
                {categories.length > 0 && (
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {categories.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50">
                        <span className="text-sm">{c.name}</span>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteCategory(c.id)}
                          disabled={deleteCategory.isPending}
                          data-testid={`button-delete-category-${c.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ({symbol})</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-product-price" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stockQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock</FormLabel>
                    <FormControl><Input type="number" {...field} data-testid="input-product-stock" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input placeholder="Optional description..." {...field} value={field.value || ''} data-testid="input-product-description" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={createProduct.isPending || updateProduct.isPending} data-testid="button-save-product">
              {createProduct.isPending || updateProduct.isPending ? "Saving..." : "Save Product"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Schema for recording stock movements
const recordStockSchema = z.object({
  movementType: z.enum(INVENTORY_MOVEMENT_TYPES),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  adjustmentDirection: z.enum(["increase", "decrease"]).default("increase"),
  notes: z.string().optional(),
  movementDate: z.string().optional(),
});

function RecordStockDialog({ open, onOpenChange, product }: { open: boolean; onOpenChange: (open: boolean) => void; product: ProductResponse }) {
  const { toast } = useToast();
  const createMovement = useCreateInventoryMovement();
  
  const form = useForm<z.infer<typeof recordStockSchema>>({
    resolver: zodResolver(recordStockSchema),
    defaultValues: {
      movementType: "purchase",
      quantity: 1,
      adjustmentDirection: "increase",
      notes: "",
      movementDate: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const movementType = form.watch("movementType");

  const onSubmit = async (values: z.infer<typeof recordStockSchema>) => {
    try {
      // Determine sign based on movement type
      let quantityChange = values.quantity;
      if (values.movementType === "sale") {
        // Sales are always negative
        quantityChange = -values.quantity;
      } else if (values.movementType === "adjustment") {
        // Adjustments can be increase or decrease based on direction selector
        quantityChange = values.adjustmentDirection === "decrease" ? -values.quantity : values.quantity;
      }
      // Purchase and return are always positive (add stock)

      await createMovement.mutateAsync({
        productId: product.id,
        movementType: values.movementType,
        quantityChange,
        notes: values.notes,
        movementDate: values.movementDate,
      });
      
      toast({ title: "Stock recorded successfully" });
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getMovementLabel = (type: InventoryMovementType) => {
    switch (type) {
      case "purchase": return "Stock Purchase (Add)";
      case "sale": return "Manual Sale (Remove)";
      case "adjustment": return "Adjustment";
      case "return": return "Customer Return (Add)";
    }
  };

  const getMovementIcon = (type: InventoryMovementType) => {
    switch (type) {
      case "purchase": return <ArrowUpCircle className="w-4 h-4 text-green-500" />;
      case "sale": return <ArrowDownCircle className="w-4 h-4 text-red-500" />;
      case "adjustment": return <RefreshCw className="w-4 h-4 text-blue-500" />;
      case "return": return <ArrowUpCircle className="w-4 h-4 text-green-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Record Stock for {product.name}
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-4">
          Current stock: <span className="font-semibold text-foreground">{product.stock_quantity}</span> units
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="movementType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Movement Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-movement-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INVENTORY_MOVEMENT_TYPES.map(type => (
                        <SelectItem key={type} value={type}>
                          <div className="flex items-center gap-2">
                            {getMovementIcon(type)}
                            {getMovementLabel(type)}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {movementType === "adjustment" && (
              <FormField
                control={form.control}
                name="adjustmentDirection"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjustment Direction</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-adjustment-direction">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="increase">
                          <div className="flex items-center gap-2">
                            <ArrowUpCircle className="w-4 h-4 text-green-500" />
                            Increase Stock
                          </div>
                        </SelectItem>
                        <SelectItem value="decrease">
                          <div className="flex items-center gap-2">
                            <ArrowDownCircle className="w-4 h-4 text-red-500" />
                            Decrease Stock
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={1}
                        {...field} 
                        data-testid="input-movement-quantity" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="movementDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-movement-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., Supplier invoice #12345" {...field} data-testid="input-movement-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={createMovement.isPending} data-testid="button-save-movement">
              {createMovement.isPending ? "Saving..." : "Record Stock Movement"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function InventoryHistoryDialog({ open, onOpenChange, product }: { open: boolean; onOpenChange: (open: boolean) => void; product: ProductResponse }) {
  const [checkDate, setCheckDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data: movements, isLoading } = useInventoryMovements(product.id);
  const { data: stockAtDate, isLoading: loadingStockAtDate } = useStockAtDate(product.id, checkDate, !!checkDate);

  const getMovementIcon = (type: string, change: number) => {
    if (change > 0) return <ArrowUpCircle className="w-4 h-4 text-green-500" />;
    if (change < 0) return <ArrowDownCircle className="w-4 h-4 text-red-500" />;
    return <RefreshCw className="w-4 h-4 text-muted-foreground" />;
  };

  const formatMovementType = (type: string) => {
    switch (type) {
      case "purchase": return "Purchase";
      case "sale": return "Sale";
      case "adjustment": return "Adjustment";
      case "return": return "Return";
      default: return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Inventory History: {product.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="bg-muted/50 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Current Stock</div>
              <div className="text-2xl font-bold">{product.stock_quantity}</div>
            </div>
            <div className="flex-1 flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Stock on Date</label>
                <Input 
                  type="date" 
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  data-testid="input-check-date"
                />
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Was</div>
                <div className="text-xl font-semibold">
                  {loadingStockAtDate ? "..." : stockAtDate?.stockQuantity ?? 0}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-16 text-center">Loading...</TableCell>
                </TableRow>
              ) : movements?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                    No inventory movements recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                movements?.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">
                      {m.movement_date ? format(new Date(m.movement_date), "MMM dd, yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getMovementIcon(m.movement_type, m.quantity_change)}
                        <span className="text-sm">{formatMovementType(m.movement_type)}</span>
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-right font-mono", m.quantity_change > 0 ? "text-green-600" : "text-red-600")}>
                      {m.quantity_change > 0 ? "+" : ""}{m.quantity_change}
                    </TableCell>
                    <TableCell className="text-right font-mono">{m.balance_after}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {m.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
