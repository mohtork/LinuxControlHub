// Import appropriate drivers based on environment
import * as schema from "@shared/schema";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Check if database URL is provided
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create a connection string safe for logging (without credentials)
const safeConnectionString = process.env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, "//USER:PASSWORD@");
console.log("Connecting to database:", safeConnectionString);

// Determine if we're in Docker environment
const isDockerEnv = process.env.DOCKER_ENV === 'true';
const isNeonDatabase = safeConnectionString.includes('neon');

// Create different client instances based on environment
let db: PostgresJsDatabase<typeof schema>;
let pool: any;

// Regular PostgreSQL client for Docker environment
try {
  const queryClient = postgres(process.env.DATABASE_URL, {
    max: 10, // Max connections in pool
    idle_timeout: 20, // Idle connection timeout in seconds
    connect_timeout: 10, // Connection timeout in seconds
  });

  db = drizzle(queryClient, { schema });
  pool = queryClient;
  
  console.log("Database connection established using postgres-js");
} catch (error) {
  console.error("Failed to connect to database:", error);
  throw error;
}

export { pool, db };
