export function validatedSecretMaterial(envName: string): string {
  const material = process.env[envName];
  if (!material) {
    throw new Error(`${envName} is required to save or read encrypted credentials.`);
  }
  if (Buffer.byteLength(material, "utf8") < 32) {
    throw new Error(`${envName} must be at least 32 bytes.`);
  }
  return material;
}

