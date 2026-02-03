import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Building2, Users, UserPlus, Trash2, Shield, Loader2, Coins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BusinessUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  createdAt: string;
}

export default function Account() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [currency, setCurrency] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");

  // Common currencies for wholesale business
  const currencies = [
    { code: "USD", name: "US Dollar" },
    { code: "EUR", name: "Euro" },
    { code: "GBP", name: "British Pound" },
    { code: "INR", name: "Indian Rupee" },
    { code: "AED", name: "UAE Dirham" },
    { code: "SAR", name: "Saudi Riyal" },
    { code: "PKR", name: "Pakistani Rupee" },
    { code: "BDT", name: "Bangladeshi Taka" },
    { code: "CNY", name: "Chinese Yuan" },
    { code: "JPY", name: "Japanese Yen" },
    { code: "CAD", name: "Canadian Dollar" },
    { code: "AUD", name: "Australian Dollar" },
  ];

  const { data: businessUsers, isLoading: loadingUsers } = useQuery<BusinessUser[]>({
    queryKey: ["/api/business/users"],
    enabled: !!user?.businessId,
  });

  const updateBusinessMutation = useMutation({
    mutationFn: async (data: { name?: string; currency?: string }) => {
      const res = await apiRequest("PUT", "/api/business", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Business updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async (data: { email: string; firstName?: string; lastName?: string }) => {
      const res = await apiRequest("POST", "/api/business/users", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User added", description: "They can now log in using the Set Password option" });
      queryClient.invalidateQueries({ queryKey: ["/api/business/users"] });
      setIsAddUserOpen(false);
      setNewUserEmail("");
      setNewUserFirstName("");
      setNewUserLastName("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add user", description: error.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/business/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/business/users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/business/users/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "User removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/business/users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove user", description: error.message, variant: "destructive" });
    },
  });

  const handleUpdateBusinessName = () => {
    if (!businessName.trim()) return;
    updateBusinessMutation.mutate({ name: businessName.trim() });
  };

  const handleUpdateCurrency = (newCurrency: string) => {
    setCurrency(newCurrency);
    updateBusinessMutation.mutate({ currency: newCurrency });
  };

  const handleAddUser = () => {
    if (!newUserEmail.trim()) return;
    addUserMutation.mutate({
      email: newUserEmail.trim(),
      firstName: newUserFirstName.trim() || undefined,
      lastName: newUserLastName.trim() || undefined,
    });
  };

  const isOwner = user?.role === "owner";
  const isAdmin = user?.role === "admin";
  const canManageUsers = isOwner || isAdmin;

  if (!user?.businessId) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Account</h1>
          <p className="text-muted-foreground text-lg">Manage your business account.</p>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              No Business Account
            </CardTitle>
            <CardDescription>
              Your account is not associated with a business yet. 
              Create a new account with a business name to start managing team members.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Account</h1>
        <p className="text-muted-foreground text-lg">Manage your business and team members.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Business Details
            </CardTitle>
            <CardDescription>Update your business information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <div className="flex gap-2">
                <Input
                  id="businessName"
                  data-testid="input-business-name"
                  placeholder={user?.business?.name || "Enter business name"}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={!canManageUsers}
                />
                <Button
                  data-testid="button-update-business"
                  onClick={handleUpdateBusinessName}
                  disabled={!businessName.trim() || updateBusinessMutation.isPending || !canManageUsers}
                >
                  {updateBusinessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
                </Button>
              </div>
              {!canManageUsers && (
                <p className="text-xs text-muted-foreground">Only owners and admins can update business settings</p>
              )}
            </div>

            <div className="pt-4 border-t space-y-2">
              <Label>Current Business</Label>
              <p className="text-lg font-semibold" data-testid="text-current-business-name">{user?.business?.name}</p>
            </div>

            <div className="space-y-2">
              <Label>Your Role</Label>
              <Badge variant={isOwner ? "default" : "secondary"} data-testid="badge-user-role">
                <Shield className="h-3 w-3 mr-1" />
                {user?.role?.charAt(0).toUpperCase()}{user?.role?.slice(1)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Currency Settings
            </CardTitle>
            <CardDescription>Set your preferred currency for pricing and invoices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={currency || user?.business?.currency || "USD"}
                onValueChange={handleUpdateCurrency}
                disabled={!canManageUsers || updateBusinessMutation.isPending}
              >
                <SelectTrigger className="w-full" data-testid="select-currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code} data-testid={`select-currency-${c.code}`}>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{c.code}</span>
                        <span className="text-muted-foreground">- {c.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canManageUsers && (
                <p className="text-xs text-muted-foreground">Only owners and admins can change currency</p>
              )}
            </div>
            <div className="pt-4 border-t space-y-2">
              <Label>Current Currency</Label>
              <p className="text-lg font-semibold" data-testid="text-current-currency">
                {user?.business?.currency || "USD"} - {currencies.find(c => c.code === (user?.business?.currency || "USD"))?.name || "US Dollar"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>People with access to this business</CardDescription>
            </div>
            {canManageUsers && (
              <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-user">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        data-testid="input-new-user-email"
                        type="email"
                        placeholder="user@example.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name (optional)</Label>
                        <Input
                          id="firstName"
                          data-testid="input-new-user-firstname"
                          placeholder="John"
                          value={newUserFirstName}
                          onChange={(e) => setNewUserFirstName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name (optional)</Label>
                        <Input
                          id="lastName"
                          data-testid="input-new-user-lastname"
                          placeholder="Doe"
                          value={newUserLastName}
                          onChange={(e) => setNewUserLastName(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The user will need to set their password using the "Set Password" option on the login page.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
                    <Button
                      data-testid="button-confirm-add-user"
                      onClick={handleAddUser}
                      disabled={!newUserEmail.trim() || addUserMutation.isPending}
                    >
                      {addUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add User"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {businessUsers?.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    data-testid={`user-row-${member.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" data-testid={`text-user-name-${member.id}`}>
                        {member.firstName || member.lastName
                          ? `${member.firstName || ""} ${member.lastName || ""}`.trim()
                          : member.email}
                      </p>
                      <p className="text-sm text-muted-foreground truncate" data-testid={`text-user-email-${member.id}`}>
                        {member.email}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isOwner && member.id !== user?.id ? (
                        <Select
                          value={member.role || "member"}
                          onValueChange={(role) => updateRoleMutation.mutate({ userId: member.id, role })}
                        >
                          <SelectTrigger className="w-24" data-testid={`select-role-${member.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                          {member.role?.charAt(0).toUpperCase()}{member.role?.slice(1)}
                        </Badge>
                      )}

                      {canManageUsers && member.id !== user?.id && member.role !== "owner" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-remove-user-${member.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove {member.email} from this business? 
                                They will lose access to all business data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeUserMutation.mutate(member.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                data-testid="button-confirm-remove-user"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}

                {businessUsers?.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">No team members yet</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
