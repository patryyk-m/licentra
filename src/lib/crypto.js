import bcrypt from 'bcryptjs';

// Hash using bcrypt

export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Verify password against hash
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

