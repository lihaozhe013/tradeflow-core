const argon2 = require('argon2');

async function generateHash() {
  const password = 'admin123'; // Test password
  try {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
    console.log('Password:', password);
    console.log('Hash:', hash);
  } catch (error) {
    console.error('Error generating hash:', error);
  }
}

generateHash();
