import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { z } from "zod";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: "auto" as any,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const setPasswordSchema = z.object({
  password: z.string().min(6),
});

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existing = await authStorage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const user = await authStorage.createUser(
        data.email,
        data.password,
        data.firstName,
        data.lastName
      );

      // Set session
      (req.session as any).userId = user.id;
      
      res.status(201).json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      const user = await authStorage.verifyPassword(data.email, data.password);
      if (!user) {
        // Check if user exists but has no password (SSO user)
        const existingUser = await authStorage.getUserByEmail(data.email);
        if (existingUser && !existingUser.password) {
          return res.status(400).json({ 
            message: "This account was created with SSO. Please set a password first.",
            needsPasswordSetup: true,
            userId: existingUser.id
          });
        }
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Set session
      (req.session as any).userId = user.id;
      
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Set password (for SSO users migrating to email/password)
  app.post("/api/auth/set-password", async (req, res) => {
    try {
      const { userId, email, password } = req.body;
      
      // Validate password
      setPasswordSchema.parse({ password });
      
      let user;
      if (userId) {
        user = await authStorage.getUser(userId);
      } else if (email) {
        user = await authStorage.getUserByEmail(email);
      }
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await authStorage.setPassword(user.id, password);
      
      // Log them in
      (req.session as any).userId = user.id;
      
      res.json({ message: "Password set successfully" });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      console.error("Set password error:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Also support GET logout for convenience
  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const user = await authStorage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Attach user to request for downstream handlers
    (req as any).user = user;
    next();
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(500).json({ message: "Authentication error" });
  }
};
