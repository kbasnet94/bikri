import { useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, Pencil, Trash2, Filter, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type InsertProduct, type ProductResponse } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";

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
                    <span className={product.stockQuantity < 10 ? "text-red-500 font-bold" : ""}>
                      {product.stockQuantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => setEditingProduct(product)}>
                        <Pencil className="w-4 h-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
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
