// Optional platform gate, independent of Pronto authentication/authorization.
export function deploymentAccessHeaders(origin: string): Record<string,string> {
  const token=process.env.PRONTO_VERCEL_PROTECTION_BYPASS;
  const pinned=process.env.PRONTO_VERCEL_PROTECTION_ORIGIN;
  if(!token && !pinned) return {};
  let target:URL,expected:URL;
  try {target=new URL(origin);expected=new URL(pinned??"");}
  catch {throw new Error("Vercel protection access requires a pinned HTTPS origin and private token.");}
  if(!token || target.protocol!=="https:" || expected.protocol!=="https:" || expected.pathname!=="/" ||
    expected.username || expected.password || expected.search || expected.hash || target.origin!==expected.origin)
    throw new Error("Refusing to send deployment protection credentials to an unpinned origin.");
  return {"x-vercel-protection-bypass":token};
}
