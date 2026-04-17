export async function renderAvatar(...args: unknown[]): Promise<{ base64DataUri: string }> {
  throw new Error("Headless rendering not available");
}
export async function renderHeadless(...args: unknown[]) {
  throw new Error("Headless rendering not available");
}
export default renderAvatar;
