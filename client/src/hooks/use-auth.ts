import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/roles";

export interface AuthUser {
  id: string;
  email: string;
  businessId?: string;
  businessName?: string;
  panVatNumber?: string;
  role?: string;        // legacy, keep
  roles: Role[];        // NEW
  fullName?: string;    // NEW
  currency?: string;
}

async function fetchUser(): Promise<AuthUser | null> {
  try {
    console.log('[Auth] Fetching user...');
    
    // Safety check: ensure supabase client exists
    if (!supabase || !supabase.auth) {
      console.error('[Auth] Supabase client not initialized');
      return null;
    }

    // Call getUser with null check
    const response = await supabase.auth.getUser();
    
    console.log('[Auth] getUser response:', response);
    
    // Defensive: check response structure
    if (!response || !response.data) {
      console.error('[Auth] Invalid response from getUser:', response);
      return null;
    }

    const { data, error: authError } = response;
    const user = data.user;
    
    if (authError) {
      console.error('[Auth] Auth error:', authError);
      return null;
    }
    
    if (!user) {
      console.log('[Auth] No user logged in');
      return null;
    }

    console.log('[Auth] User found:', user.id, user.email);

    // Get business membership
    const { data: businessUser, error: businessError } = await supabase
      .from('business_users')
      .select(`
        role,
        roles,
        full_name,
        active,
        business:businesses (
          id,
          name,
          currency,
          pan_vat_number
        )
      `)
      .eq('user_id', user.id)
      .single();

    if (businessError) {
      console.log('[Auth] Business query error:', businessError.code, businessError.message);
      // Return user without business (they might not have one yet)
      return {
        id: user.id,
        email: user.email!,
        roles: [],
      };
    }

    if (!businessUser) {
      console.log('[Auth] No business membership found');
      return {
        id: user.id,
        email: user.email!,
        roles: [],
      };
    }

    if (businessUser.active === false) {
      console.log('[Auth] User deactivated, signing out');
      await supabase.auth.signOut();
      return null;
    }

    const business = businessUser.business as any;

    console.log('[Auth] Business found:', business?.name);

    return {
      id: user.id,
      email: user.email!,
      businessId: business?.id,
      businessName: business?.name,
      panVatNumber: business?.pan_vat_number || undefined,
      currency: business?.currency || 'USD',
      role: businessUser.role,
      roles: (businessUser.roles ?? []) as Role[],
      fullName: businessUser.full_name ?? undefined,
    };
  } catch (error) {
    console.error('[Auth] Exception in fetchUser:', error);
    return null;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ['auth', 'user'],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'user'], null);
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    },
  });
}

