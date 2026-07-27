import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller identity using anon key + their JWT
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: authError?.message || "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client with service role key for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { email, password, fullName, businessId, roles } = await req.json();
    const VALID = ["admin", "operations", "sales", "accounts"];
    if (!email || !password || !businessId || !Array.isArray(roles) || roles.length === 0
        || !roles.every((r: string) => VALID.includes(r))) {
      return new Response(JSON.stringify({ error: "email, password, businessId and valid roles[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Caller must be an admin member of this business.
    const { data: callerRow } = await supabaseAdmin
      .from("business_users").select("roles, active")
      .eq("user_id", caller.id).eq("business_id", businessId).single();
    if (!callerRow || !(callerRow.roles ?? []).includes("admin")) {
      return new Response(JSON.stringify({ error: "Only admins can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (callerRow.active !== true) {
      return new Response(JSON.stringify({ error: "Account is inactive" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create the auth user directly with a temp password (no email round-trip).
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { must_change_password: true, full_name: fullName ?? null },
    });
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: linkError } = await supabaseAdmin.from("business_users").insert({
      business_id: businessId, user_id: created.user.id,
      role: "member", roles, full_name: fullName ?? null, active: true,
    });
    if (linkError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id); // roll back orphan auth user
      return new Response(JSON.stringify({ error: linkError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ userId: created.user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
