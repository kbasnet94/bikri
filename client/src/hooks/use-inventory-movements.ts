import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { api, buildUrl } from "@shared/routes";
import type { InventoryMovementResponse, CreateInventoryMovementRequest } from "@shared/schema";

export function useInventoryMovements(productId: number) {
  return useQuery<InventoryMovementResponse[]>({
    queryKey: ['/api/products', productId, 'inventory-movements'],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.inventoryMovements.listByProduct.path, { productId }), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch inventory movements');
      return res.json();
    },
    enabled: !!productId,
  });
}

export function useInventoryMovementsByDateRange(startDate: string, endDate: string, enabled = true) {
  return useQuery<InventoryMovementResponse[]>({
    queryKey: ['/api/inventory-movements', startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`${api.inventoryMovements.listByDateRange.path}?startDate=${startDate}&endDate=${endDate}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch inventory movements');
      return res.json();
    },
    enabled: enabled && !!startDate && !!endDate,
  });
}

export function useStockAtDate(productId: number, date: string, enabled = true) {
  return useQuery<{ productId: number; date: string; stockQuantity: number }>({
    queryKey: ['/api/products', productId, 'stock-at-date', date],
    queryFn: async () => {
      const res = await fetch(`${buildUrl(api.inventoryMovements.getStockAtDate.path, { productId })}?date=${date}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch stock at date');
      return res.json();
    },
    enabled: enabled && !!productId && !!date,
  });
}

export function useCreateInventoryMovement() {
  return useMutation({
    mutationFn: async (data: CreateInventoryMovementRequest) => {
      const res = await apiRequest("POST", api.inventoryMovements.create.path, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products', variables.productId, 'inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
    },
  });
}
