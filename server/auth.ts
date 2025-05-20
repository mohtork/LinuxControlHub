import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, rolePermissions } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
    
    interface Request {
      hasPermission(permission: string): boolean;
    }
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
  
  // Determine if we should use secure cookies
  // Only use secure cookies in production when not explicitly disabled
  const useSecureCookies = process.env.NODE_ENV === 'production' && 
                          process.env.DISABLE_SECURE_COOKIES !== 'true';
                          
  console.log(`Session configuration: NODE_ENV=${process.env.NODE_ENV}, secure cookies=${useSecureCookies}`);
  
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: useSecureCookies,
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Create initial admin if it doesn't exist
  const initializeAdmin = async () => {
    try {
      const users = await storage.getAllUsers();
      
      // Only create initial admin if no users exist
      if (users.length === 0) {
        // Default admin credentials - should be changed after first login
        const defaultAdmin = {
          username: 'admin',
          password: await hashPassword('adminadmin'),
          email: 'admin@example.com',
          role: 'admin' as const  // Type assertion to fix the role type
        };
        
        console.log('Creating initial admin account with username: admin and password: adminadmin');
        await storage.createUser(defaultAdmin);
      }
    } catch (error) {
      console.error('Error creating initial admin:', error);
    }
  };
  
  // Run this immediately when auth is set up
  initializeAdmin();

  app.post("/api/register", async (req, res, next) => {
    try {
      // Only allow admins to register new users (except for the first user)
      const users = await storage.getAllUsers();
      if (users.length > 0 && (!req.isAuthenticated() || req.user?.role !== 'admin')) {
        return res.status(403).json({ message: "Only administrators can register new users" });
      }
      
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Only admins can create users with admin/operator roles
      let role = 'viewer'; // Default to viewer role
      if (req.user?.role === 'admin') {
        role = req.body.role || 'viewer';
      }

      const user = await storage.createUser({
        ...req.body,
        role,
        password: await hashPassword(req.body.password),
      });

      // Create a safe user object without the password
      const { password, ...safeUser } = user;

      // If this is self-registration (first user), login automatically
      if (!req.isAuthenticated()) {
        req.login(user, (err) => {
          if (err) return next(err);
          res.status(201).json(safeUser);
        });
      } else {
        // Admin creating another user
        res.status(201).json(safeUser);
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Create a safe user object without the password
        const { password, ...safeUser } = user as any;
        
        res.status(200).json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.sendStatus(401);
    
    // Create a safe user object without the password
    const { password, ...safeUser } = req.user as any;
    
    res.json(safeUser);
  });
  
  // Middleware to check role permissions
  app.use((req, res, next) => {
    req.hasPermission = (permission: string): boolean => {
      if (!req.isAuthenticated() || !req.user) return false;
      
      const userRole = req.user.role;
      return rolePermissions[userRole as keyof typeof rolePermissions].includes(permission);
    };
    
    next();
  });
}

// Role check middleware
export function requirePermission(permission: string) {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    if (!req.hasPermission(permission)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    next();
  };
}
