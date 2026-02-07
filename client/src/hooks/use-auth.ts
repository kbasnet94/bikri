import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AuthUser {
  id: string;
  email: string;
  businessId?: string;
  businessName?: string;
  role?: string;
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
        business:businesses (
          id,
          name,
          currency
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
      };
    }

    if (!businessUser) {
      console.log('[Auth] No business membership found');
      return {
        id: user.id,
        email: user.email!,
      };
    }

    const business = businessUser.business as any;

    console.log('[Auth] Business found:', business?.name);

    return {
      id: user.id,
      email: user.email!,
      businessId: business?.id,
      businessName: business?.name,
      currency: business?.currency || 'USD',
      role: businessUser.role,
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

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      email,
      password,
      businessName,
    }: {
      email: string;
      password: string;
      businessName?: string;
    }) => {
      // Step 1: Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      // Step 2: Immediately sign in to establish active session
      // This is critical for RLS policies that check auth.uid()
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      if (!signInData.session) throw new Error('Failed to establish session');

      console.log('[Register] Session established, user ID:', signInData.user.id);

      // Step 3: Create business if provided (now with active session)
      if (businessName) {
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .insert({
            name: businessName,
            owner_id: signInData.user.id,
          })
          .select()
          .single();

        if (businessError) {
          console.error('[Register] Business creation failed:', businessError);
          throw businessError;
        }

        console.log('[Register] Business created:', business.id);

        // Step 4: Link user to business as owner
        const { error: linkError } = await supabase
          .from('business_users')
          .insert({
            business_id: business.id,
            user_id: signInData.user.id,
            role: 'owner',
          });

        if (linkError) {
          console.error('[Register] Business link failed:', linkError);
          throw linkError;
        }

        console.log('[Register] User linked to business');
      }

      return signInData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    },
  });
}
