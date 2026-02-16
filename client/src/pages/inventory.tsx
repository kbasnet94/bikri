import React, { useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import type { Product } from "@/hooks/use-products";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/hooks/use-categories";
import { useInventoryMovements, useCreateInventoryMovement, useStockAtDate } from "@/hooks/use-inventory-movements";
import { useProductVariants, useCreateProductVariant, useUpdateProductVariant, useDeleteProductVariant } from "@/hooks/use-product-variants";
import type { ProductVariant } from "@/hooks/use-product-variants";
import { useCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { Plus, Search, Pencil, Trash2, Filter, X, Package, History, ArrowUpCircle, ArrowDownCircle, RefreshCw, Calendar, ChevronDown, ChevronRight, ImagePlus } from "lucide-react";
import { uploadProductImage } from "@/lib/upload-image";
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
  const [recordStockProduct, setRecordStockProduct] = useState<Product | null>(null);
  const [recordStockVariant, setRecordStockVariant] = useState<ProductVariant | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyVariant, setHistoryVariant] = useState<ProductVariant | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const { formatCurrency } = useCurrency();

  const toggleExpand = (productId: number) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

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
              products?.map((product) => {
                const isExpanded = expandedProducts.has(product.id);
                const hasVariants = product.has_variants && product.variants && product.variants.length > 0;
                const totalVariantStock = hasVariants
                  ? product.variants!.reduce((sum, v) => sum + v.stock_quantity, 0)
                  : product.stock_quantity;
                const priceDisplay = hasVariants
                  ? (() => {
                      const prices = product.variants!.map(v => v.price);
                      const min = Math.min(...prices);
                      const max = Math.max(...prices);
                      return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
                    })()
                  : formatCurrency(product.price);

                return (
                  <React.Fragment key={product.id}>
                    <TableRow className="group">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {hasVariants && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 p-0"
                              onClick={() => toggleExpand(product.id)}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-4 h-4" />
                                : <ChevronRight className="w-4 h-4" />}
                            </Button>
                          )}
                          {product.image_url && (
                            <img src={product.image_url} alt={product.name} className="w-8 h-8 rounded object-cover border" />
                          )}
                          <span>{product.name}</span>
                          {hasVariants && (
                            <span className="text-xs text-muted-foreground">
                              ({product.variants!.length} variants)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {hasVariants ? "—" : product.sku}
                      </TableCell>
                      <TableCell>
                        {product.category?.name ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            {product.category.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Uncategorized</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{priceDisplay}</TableCell>
                      <TableCell className="text-right">
                        <span className={totalVariantStock < 10 ? "text-red-500 font-bold" : ""}>
                          {totalVariantStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!hasVariants && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => { setRecordStockProduct(product); setRecordStockVariant(null); }}
                              title="Record Stock"
                              data-testid={`button-record-stock-${product.id}`}
                            >
                              <Package className="w-4 h-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => { setHistoryProduct(product); setHistoryVariant(null); }}
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
                    {/* Variant sub-rows */}
                    {hasVariants && isExpanded && product.variants!.map((variant) => (
                      <TableRow key={`v-${variant.id}`} className="bg-muted/20">
                        <TableCell className="pl-12 font-medium text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {variant.image_url && (
                              <img src={variant.image_url} alt={variant.name} className="w-7 h-7 rounded object-cover border" />
                            )}
                            <span>↳ {variant.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{variant.sku}</TableCell>
                        <TableCell />
                        <TableCell className="text-right">{formatCurrency(variant.price)}</TableCell>
                        <TableCell className="text-right">
                          <span className={variant.stock_quantity < 10 ? "text-red-500 font-bold" : ""}>
                            {variant.stock_quantity}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setRecordStockProduct(product); setRecordStockVariant(variant); }}
                              title="Record Stock"
                            >
                              <Package className="w-4 h-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setHistoryProduct(product); setHistoryVariant(variant); }}
                              title="View History"
                            >
                              <History className="w-4 h-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })
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
          onOpenChange={(open: boolean) => { if (!open) { setRecordStockProduct(null); setRecordStockVariant(null); } }}
          product={recordStockProduct}
          variant={recordStockVariant}
        />
      )}

      {historyProduct && (
        <InventoryHistoryDialog
          open={!!historyProduct}
          onOpenChange={(open: boolean) => { if (!open) { setHistoryProduct(null); setHistoryVariant(null); } }}
          product={historyProduct}
          variant={historyVariant}
        />
      )}
    </div>
  );
}

interface VariantFormRow {
  name: string;
  sku: string;
  price: string; // stored as string for input control, converted on submit
  stockQuantity: string;
  imageUrl: string | null; // existing URL from DB
  imageFile: File | null;  // new file to upload
}

function ProductDialog({ open, onOpenChange, mode, defaultValues, categories }: any) {
  const { toast } = useToast();
  const { symbol } = useCurrency();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const createVariant = useCreateProductVariant();
  const updateVariant = useUpdateProductVariant();
  const deleteVariant = useDeleteProductVariant();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [hasVariants, setHasVariants] = useState(defaultValues?.has_variants || false);

  // For edit mode, track existing variant IDs so we know which to update vs create
  const [variantRows, setVariantRows] = useState<(VariantFormRow & { existingId?: number })[]>(
    defaultValues?.has_variants && defaultValues?.variants?.length > 0
      ? defaultValues.variants.map((v: any) => ({
          existingId: v.id,
          name: v.name,
          sku: v.sku,
          price: centsToDecimal(v.price).toString(),
          stockQuantity: v.stock_quantity.toString(),
          imageUrl: v.image_url || null,
          imageFile: null,
        }))
      : [{ name: "", sku: "", price: "0", stockQuantity: "0", imageUrl: null, imageFile: null }]
  );
  const [deletedVariantIds, setDeletedVariantIds] = useState<number[]>([]);
  // Product-level image
  const [productImageUrl, setProductImageUrl] = useState<string | null>(defaultValues?.image_url || null);
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const addVariantRow = () => {
    setVariantRows([...variantRows, { name: "", sku: "", price: "0", stockQuantity: "0", imageUrl: null, imageFile: null }]);
  };

  const removeVariantRow = (index: number) => {
    if (variantRows.length <= 1) return;
    const removed = variantRows[index];
    if (removed.existingId) {
      setDeletedVariantIds(prev => [...prev, removed.existingId!]);
    }
    setVariantRows(variantRows.filter((_, i) => i !== index));
  };

  const updateVariantRow = (index: number, field: keyof VariantFormRow, value: string) => {
    const updated = [...variantRows];
    updated[index] = { ...updated[index], [field]: value };
    setVariantRows(updated);
  };

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
    // Validate variant rows early (before uploading images)
    if (hasVariants) {
      for (const row of variantRows) {
        if (!row.name.trim()) { toast({ title: "Variant name is required", variant: "destructive" }); return; }
        if (!row.sku.trim()) { toast({ title: "Variant SKU is required", variant: "destructive" }); return; }
      }
    }

    setIsUploading(true);
    try {
      // Convert price from decimal to cents for storage
      const dataToSubmit = { ...values, price: decimalToCents(values.price) };

      // Upload product image if a new file was selected (only for non-variant products)
      let finalProductImageUrl = hasVariants ? null : productImageUrl;
      if (!hasVariants && productImageFile) {
        finalProductImageUrl = await uploadProductImage(productImageFile);
      }

      // Upload all variant images in parallel
      let variantsWithUrls: { name: string; sku: string; price: number; stockQuantity: number; imageUrl: string | null }[] = [];
      if (hasVariants) {
        variantsWithUrls = await Promise.all(
          variantRows.map(async (r) => {
            let imgUrl: string | null = r.imageUrl;
            if (r.imageFile) {
              imgUrl = await uploadProductImage(r.imageFile);
            }
            return {
              name: r.name,
              sku: r.sku,
              price: decimalToCents(parseFloat(r.price) || 0),
              stockQuantity: parseInt(r.stockQuantity) || 0,
              imageUrl: imgUrl,
            };
          })
        );
      }
      
      if (mode === "create") {
        if (hasVariants) {
          await createProduct.mutateAsync({
            ...dataToSubmit,
            imageUrl: undefined, // no product-level image for variant products
            hasVariants: true,
            variants: variantsWithUrls,
          } as any);
        } else {
          await createProduct.mutateAsync({ ...dataToSubmit, imageUrl: finalProductImageUrl || undefined } as InsertProduct);
        }
        toast({ title: "Product created successfully" });
      } else {
        // Edit mode — update the product itself
        await updateProduct.mutateAsync({ id: defaultValues.id, ...dataToSubmit, imageUrl: finalProductImageUrl } as any);

        // If this product has variants, handle variant changes
        if (hasVariants) {
          // Delete removed variants
          for (const varId of deletedVariantIds) {
            await deleteVariant.mutateAsync({ id: varId, productId: defaultValues.id });
          }

          // Update existing variants & create new ones
          for (let i = 0; i < variantRows.length; i++) {
            const row = variantRows[i];
            const imgUrl = variantsWithUrls[i]?.imageUrl ?? row.imageUrl;

            if (row.existingId) {
              await updateVariant.mutateAsync({
                id: row.existingId,
                name: row.name.trim(),
                sku: row.sku.trim(),
                price: decimalToCents(parseFloat(row.price) || 0),
                imageUrl: imgUrl,
              });
            } else {
              await createVariant.mutateAsync({
                productId: defaultValues.id,
                name: row.name.trim(),
                sku: row.sku.trim(),
                price: decimalToCents(parseFloat(row.price) || 0),
                stockQuantity: parseInt(row.stockQuantity) || 0,
                imageUrl: imgUrl,
              });
            }
          }
        }
        toast({ title: "Product updated successfully" });
      }
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
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

            {/* Product image upload */}
            {!hasVariants && (
              <div className="space-y-2">
                <Label className="text-sm">Product Image</Label>
                <div className="flex items-center gap-3">
                  {(productImageFile || productImageUrl) ? (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border bg-muted">
                      <img
                        src={productImageFile ? URL.createObjectURL(productImageFile) : productImageUrl!}
                        alt="Product"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute top-0 right-0 bg-destructive text-white rounded-bl p-0.5"
                        onClick={() => { setProductImageFile(null); setProductImageUrl(null); }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                      <ImagePlus className="w-5 h-5 text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setProductImageFile(f);
                        }}
                      />
                    </label>
                  )}
                  <span className="text-xs text-muted-foreground">Click to upload an image</span>
                </div>
              </div>
            )}
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
            
            {/* Variant toggle (only in create mode) */}
            {mode === "create" && (
              <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/20">
                <div>
                  <Label htmlFor="has-variants" className="font-medium">This product has variants</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    e.g. sizes, colors — each variant has its own SKU, price, and stock
                  </p>
                </div>
                <Switch id="has-variants" checked={hasVariants} onCheckedChange={setHasVariants} />
              </div>
            )}

            {/* Price/Stock for non-variant products */}
            {!hasVariants && (
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
            )}

            {/* Variant rows — shown in both create and edit mode */}
            {hasVariants && (
              <div className="border rounded-lg p-3 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Variants</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addVariantRow}>
                    <Plus className="w-3 h-3 mr-1" /> Add Variant
                  </Button>
                </div>
                {variantRows.map((row, idx) => (
                  <div key={row.existingId ?? `new-${idx}`} className="flex gap-2 items-end">
                    {/* Variant image thumbnail */}
                    <div className="flex-shrink-0">
                      {idx === 0 && <Label className="text-xs block mb-1">&nbsp;</Label>}
                      {(row.imageFile || row.imageUrl) ? (
                        <div className="relative w-9 h-9 rounded overflow-hidden border bg-muted">
                          <img
                            src={row.imageFile ? URL.createObjectURL(row.imageFile) : row.imageUrl!}
                            alt={row.name || 'Variant'}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute top-0 right-0 bg-destructive text-white rounded-bl p-0.5"
                            onClick={() => {
                              const updated = [...variantRows];
                              updated[idx] = { ...updated[idx], imageFile: null, imageUrl: null };
                              setVariantRows(updated);
                            }}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="w-9 h-9 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                          <ImagePlus className="w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                const updated = [...variantRows];
                                updated[idx] = { ...updated[idx], imageFile: f };
                                setVariantRows(updated);
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {idx === 0 && <Label className="text-xs">Name</Label>}
                      <Input
                        placeholder="e.g. Small"
                        value={row.name}
                        onChange={(e) => updateVariantRow(idx, 'name', e.target.value)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      {idx === 0 && <Label className="text-xs">SKU</Label>}
                      <Input
                        placeholder="SKU"
                        value={row.sku}
                        onChange={(e) => updateVariantRow(idx, 'sku', e.target.value)}
                      />
                    </div>
                    <div className="w-24">
                      {idx === 0 && <Label className="text-xs">Price ({symbol})</Label>}
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={row.price}
                        onChange={(e) => updateVariantRow(idx, 'price', e.target.value)}
                      />
                    </div>
                    {mode === "create" && (
                      <div className="w-20">
                        {idx === 0 && <Label className="text-xs">Stock</Label>}
                        <Input
                          type="number"
                          placeholder="0"
                          value={row.stockQuantity}
                          onChange={(e) => updateVariantRow(idx, 'stockQuantity', e.target.value)}
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={() => removeVariantRow(idx)}
                      disabled={variantRows.length <= 1}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                {mode === "edit" && (
                  <p className="text-xs text-muted-foreground">Stock is managed via the Record Stock button on each variant row.</p>
                )}
              </div>
            )}
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
            <Button type="submit" className="w-full" disabled={isUploading || createProduct.isPending || updateProduct.isPending} data-testid="button-save-product">
              {isUploading ? "Uploading images..." : createProduct.isPending || updateProduct.isPending ? "Saving..." : "Save Product"}
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

function RecordStockDialog({ open, onOpenChange, product, variant }: { open: boolean; onOpenChange: (open: boolean) => void; product: Product; variant?: ProductVariant | null }) {
  const { toast } = useToast();
  const createMovement = useCreateInventoryMovement();
  const currentStock = variant ? variant.stock_quantity : product.stock_quantity;
  const displayName = variant ? `${product.name} — ${variant.name}` : product.name;
  
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
        quantityChange = -values.quantity;
      } else if (values.movementType === "adjustment") {
        quantityChange = values.adjustmentDirection === "decrease" ? -values.quantity : values.quantity;
      }

      await createMovement.mutateAsync({
        productId: product.id,
        variantId: variant?.id || null,
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
            Record Stock for {displayName}
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-4">
          Current stock: <span className="font-semibold text-foreground">{currentStock}</span> units
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

function InventoryHistoryDialog({ open, onOpenChange, product, variant }: { open: boolean; onOpenChange: (open: boolean) => void; product: Product; variant?: ProductVariant | null }) {
  const [checkDate, setCheckDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data: movements, isLoading } = useInventoryMovements(product.id, variant?.id);
  const { data: stockAtDate, isLoading: loadingStockAtDate } = useStockAtDate(product.id, checkDate, !!checkDate);
  const displayName = variant ? `${product.name} — ${variant.name}` : product.name;
  const currentStock = variant ? variant.stock_quantity : product.stock_quantity;

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
            Inventory History: {displayName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="bg-muted/50 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Current Stock</div>
              <div className="text-2xl font-bold">{currentStock}</div>
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
                        <span className="text-sm">
                          {formatMovementType(m.movement_type)}
                          {m.variant && <span className="text-muted-foreground ml-1">({m.variant.name})</span>}
                        </span>
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
