export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const appUrl = () => env("APP_URL").replace(/\/$/, "");
export const tzName = () => process.env.TZ_NAME || "UTC";
