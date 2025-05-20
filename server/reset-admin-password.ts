import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

async function resetAdminPassword() {
  try {
    // New password will be 'adminadmin'
    const hashedPassword = await hashPassword('adminadmin');
    
    // Update the admin user's password
    const result = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.username, 'admin'))
      .returning({ id: users.id, username: users.username });
    
    if (result.length > 0) {
      console.log(`Password reset successful for user: ${result[0].username}`);
      console.log('New password: adminadmin');
    } else {
      console.log('Admin user not found');
    }
  } catch (error) {
    console.error('Error resetting admin password:', error);
  } finally {
    process.exit(0);
  }
}

resetAdminPassword();
