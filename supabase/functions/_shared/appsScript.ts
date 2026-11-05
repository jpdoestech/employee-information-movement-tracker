import { google } from "./google.ts";

// Only the secret-authenticated worker receives this short-lived owner token.
export async function appsScriptIdentity(token: unknown, connection: any) {
  if (typeof token !== "string" || !token || token.length > 4096)
    throw new Error("Apps Script authorization is required");
  const account = await google(
    "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)",
    token,
  );
  const owner = account.user;
  if (!owner?.permissionId || !owner.emailAddress)
    throw new Error("Google account identity is unavailable");
  if (connection?.owner_permission_id) {
    if (connection.owner_permission_id !== owner.permissionId)
      throw new Error("Use the original Google account");
  } else if (connection?.folder_id) {
    const folder = await google(
      `https://www.googleapis.com/drive/v3/files/${connection.folder_id}?fields=owners(permissionId)`,
      token,
    );
    if (!folder.owners?.some((o: any) => o.permissionId === owner.permissionId))
      throw new Error("Use the original folder owner");
  }
  return {
    owner_permission_id: owner.permissionId,
    owner_email: owner.emailAddress,
    verified_folder_id: connection?.folder_id,
  };
}
