import { users, businesses, type User, type UpsertUser, type Business, type UserWithBusiness } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserWithBusiness(id: string): Promise<UserWithBusiness | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(email: string, password: string, firstName?: string, lastName?: string, businessName?: string): Promise<User>;
  setPassword(userId: string, password: string): Promise<void>;
  verifyPassword(email: string, password: string): Promise<User | null>;
  // Business operations
  getBusiness(id: string): Promise<Business | undefined>;
  updateBusiness(id: string, data: { name?: string }): Promise<Business | undefined>;
  getBusinessUsers(businessId: string): Promise<User[]>;
  addUserToBusiness(businessId: string, email: string, firstName?: string, lastName?: string): Promise<User | { error: string }>;
  removeUserFromBusiness(userId: string): Promise<void>;
  updateUserRole(userId: string, role: string): Promise<User | undefined>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserWithBusiness(id: string): Promise<UserWithBusiness | undefined> {
    const [result] = await db
      .select()
      .from(users)
      .leftJoin(businesses, eq(users.businessId, businesses.id))
      .where(eq(users.id, id));
    
    if (!result) return undefined;
    return {
      ...result.users,
      business: result.businesses,
    };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createUser(email: string, password: string, firstName?: string, lastName?: string, businessName?: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create business first if name provided
    let businessId: string | undefined;
    if (businessName) {
      const [business] = await db
        .insert(businesses)
        .values({ name: businessName })
        .returning();
      businessId = business.id;
    }

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        businessId,
        role: businessId ? "owner" : "member",
      })
      .returning();
    return user;
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.password) return null;
    const valid = await bcrypt.compare(password, user.password);
    return valid ? user : null;
  }

  // Business operations
  async getBusiness(id: string): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id));
    return business;
  }

  async updateBusiness(id: string, data: { name?: string }): Promise<Business | undefined> {
    const [business] = await db
      .update(businesses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businesses.id, id))
      .returning();
    return business;
  }

  async getBusinessUsers(businessId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.businessId, businessId));
  }

  async addUserToBusiness(businessId: string, email: string, firstName?: string, lastName?: string): Promise<User | { error: string }> {
    // Check if user already exists
    const existingUser = await this.getUserByEmail(email);
    if (existingUser) {
      // If user already belongs to a different business, don't allow reassignment
      if (existingUser.businessId && existingUser.businessId !== businessId) {
        return { error: "This user already belongs to another business" };
      }
      // If user already belongs to this business, return as-is
      if (existingUser.businessId === businessId) {
        return existingUser;
      }
      // User exists but has no business - safe to add them
      const [updated] = await db
        .update(users)
        .set({ businessId, role: "member", updatedAt: new Date() })
        .where(eq(users.id, existingUser.id))
        .returning();
      return updated;
    }

    // Create new user without password (they'll need to set it via Set Password flow)
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        firstName,
        lastName,
        businessId,
        role: "member",
      })
      .returning();
    return user;
  }

  async removeUserFromBusiness(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ businessId: null, role: "member", updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserRole(userId: string, role: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
