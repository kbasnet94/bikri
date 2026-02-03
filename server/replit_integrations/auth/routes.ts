import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { z } from "zod";

const addUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const updateBusinessSchema = z.object({
  name: z.string().min(1),
});

const updateUserRoleSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});

export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user with business info
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userWithBusiness = await authStorage.getUserWithBusiness(req.user.id);
      if (!userWithBusiness) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({
        id: userWithBusiness.id,
        email: userWithBusiness.email,
        firstName: userWithBusiness.firstName,
        lastName: userWithBusiness.lastName,
        profileImageUrl: userWithBusiness.profileImageUrl,
        businessId: userWithBusiness.businessId,
        role: userWithBusiness.role,
        business: userWithBusiness.business,
        createdAt: userWithBusiness.createdAt,
        updatedAt: userWithBusiness.updatedAt,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get current user's business
  app.get("/api/business", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user.businessId) {
        return res.status(404).json({ message: "No business associated with this account" });
      }
      const business = await authStorage.getBusiness(user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
      res.json(business);
    } catch (error) {
      console.error("Error fetching business:", error);
      res.status(500).json({ message: "Failed to fetch business" });
    }
  });

  // Update business name
  app.put("/api/business", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user.businessId) {
        return res.status(404).json({ message: "No business associated with this account" });
      }
      if (user.role !== "owner" && user.role !== "admin") {
        return res.status(403).json({ message: "Only owners and admins can update business settings" });
      }

      const data = updateBusinessSchema.parse(req.body);
      const business = await authStorage.updateBusiness(user.businessId, data);
      res.json(business);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Error updating business:", error);
      res.status(500).json({ message: "Failed to update business" });
    }
  });

  // Get all users in the business
  app.get("/api/business/users", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user.businessId) {
        return res.status(404).json({ message: "No business associated with this account" });
      }
      const users = await authStorage.getBusinessUsers(user.businessId);
      // Don't expose passwords
      const safeUsers = users.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        profileImageUrl: u.profileImageUrl,
        role: u.role,
        createdAt: u.createdAt,
      }));
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching business users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Add user to business
  app.post("/api/business/users", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.user;
      if (!currentUser.businessId) {
        return res.status(404).json({ message: "No business associated with this account" });
      }
      if (currentUser.role !== "owner" && currentUser.role !== "admin") {
        return res.status(403).json({ message: "Only owners and admins can add users" });
      }

      const data = addUserSchema.parse(req.body);
      
      // Check if email is already in this business
      const existingUsers = await authStorage.getBusinessUsers(currentUser.businessId);
      if (existingUsers.some(u => u.email.toLowerCase() === data.email.toLowerCase())) {
        return res.status(400).json({ message: "User already in this business" });
      }

      const result = await authStorage.addUserToBusiness(
        currentUser.businessId,
        data.email,
        data.firstName,
        data.lastName
      );

      // Check if result is an error
      if ('error' in result) {
        return res.status(400).json({ message: result.error });
      }

      res.status(201).json({
        id: result.id,
        email: result.email,
        firstName: result.firstName,
        lastName: result.lastName,
        role: result.role,
        createdAt: result.createdAt,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Error adding user:", error);
      res.status(500).json({ message: "Failed to add user" });
    }
  });

  // Update user role
  app.patch("/api/business/users/:userId/role", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.user;
      if (!currentUser.businessId) {
        return res.status(404).json({ message: "No business associated with this account" });
      }
      if (currentUser.role !== "owner") {
        return res.status(403).json({ message: "Only owners can change user roles" });
      }

      const { userId } = req.params;
      const data = updateUserRoleSchema.parse(req.body);

      // Don't allow changing own role (prevent owner from demoting themselves)
      if (userId === currentUser.id) {
        return res.status(400).json({ message: "Cannot change your own role" });
      }

      // Verify user belongs to this business
      const targetUser = await authStorage.getUser(userId);
      if (!targetUser || targetUser.businessId !== currentUser.businessId) {
        return res.status(404).json({ message: "User not found in this business" });
      }

      const updatedUser = await authStorage.updateUserRole(userId, data.role);
      res.json({
        id: updatedUser?.id,
        email: updatedUser?.email,
        firstName: updatedUser?.firstName,
        lastName: updatedUser?.lastName,
        role: updatedUser?.role,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Remove user from business
  app.delete("/api/business/users/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.user;
      if (!currentUser.businessId) {
        return res.status(404).json({ message: "No business associated with this account" });
      }
      if (currentUser.role !== "owner" && currentUser.role !== "admin") {
        return res.status(403).json({ message: "Only owners and admins can remove users" });
      }

      const { userId } = req.params;

      // Don't allow removing self
      if (userId === currentUser.id) {
        return res.status(400).json({ message: "Cannot remove yourself from the business" });
      }

      // Verify user belongs to this business
      const targetUser = await authStorage.getUser(userId);
      if (!targetUser || targetUser.businessId !== currentUser.businessId) {
        return res.status(404).json({ message: "User not found in this business" });
      }

      // Don't allow removing the owner
      if (targetUser.role === "owner") {
        return res.status(400).json({ message: "Cannot remove the business owner" });
      }

      await authStorage.removeUserFromBusiness(userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing user:", error);
      res.status(500).json({ message: "Failed to remove user" });
    }
  });
}
