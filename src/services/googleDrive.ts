import RNFS from 'react-native-fs';
import {GoogleSignin, User} from '@react-native-google-signin/google-signin';

/**
 * Google Drive backup for scanned documents.
 *
 * Auth: uses the `drive.file` scope only — the app can only see/modify
 * files *it* created in Drive, never the user's other files. That keeps it
 * in Google's "non-sensitive scope" bucket, so no third-party security
 * assessment is required to ship this. The OAuth client is the "Android"
 * type registered in Cloud Console by package name + SHA-1 signing
 * fingerprint, so there's no client secret or webClientId to configure here
 * (see `GoogleSignin.configure` below).
 *
 * Upload: Drive's simple "uploadType=media" endpoint would need the file's
 * raw bytes as a fetch body, which RN can't easily produce without a
 * multipart-capable HTTP client (this project only has `react-native-fs`,
 * no axios/rn-fetch-blob). Instead this uses Drive's *resumable* upload
 * flow: (1) a plain JSON POST/PATCH ("initiate") that returns a one-time
 * session URL, then (2) a single raw-binary PUT of the file to that session
 * URL. Step 2 is done with `RNFS.uploadFiles({binaryStreamOnly: true})`,
 * which streams the file's bytes straight from disk as the request body
 * with no multipart wrapping — exactly what the resumable session's PUT
 * step expects, and it works entirely from a local file path.
 */

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER_NAME = 'Lavati Scanner';

let configured = false;

/** Must be called once before any other function here. Cheap/idempotent. */
export function configureGoogleDrive(): void {
  if (configured) {
    return;
  }
  GoogleSignin.configure({
    scopes: [DRIVE_SCOPE],
  });
  configured = true;
}

export function isGoogleDriveSignedIn(): boolean {
  configureGoogleDrive();
  return GoogleSignin.hasPreviousSignIn();
}

export function getSignedInGoogleUser(): User | null {
  configureGoogleDrive();
  return GoogleSignin.getCurrentUser();
}

export async function signInToGoogleDrive(): Promise<User | null> {
  configureGoogleDrive();
  await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
  const result = await GoogleSignin.signIn();
  return result.type === 'success' ? result.data : null;
}

export async function signOutOfGoogleDrive(): Promise<void> {
  configureGoogleDrive();
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // Already revoked / no network - still proceed to clear the local session.
  }
  await GoogleSignin.signOut();
}

/** A valid (freshly-refreshed) access token for Drive API calls, or throws
 * if the user isn't signed in. Refreshing via `signInSilently` first avoids
 * handing back a token that already expired since the last sign-in. */
async function getFreshAccessToken(): Promise<string> {
  configureGoogleDrive();
  if (!GoogleSignin.hasPreviousSignIn()) {
    throw new Error('Not signed in to Google Drive');
  }
  await GoogleSignin.signInSilently();
  const {accessToken} = await GoogleSignin.getTokens();
  return accessToken;
}

async function driveApiFetch(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Drive API error ${response.status} on ${path}: ${body.slice(0, 300)}`,
    );
  }
  return response;
}

/** Finds this app's dedicated Drive folder, creating it the first time.
 * Everything this app backs up lives inside it - never in Drive root or
 * anywhere else in the user's Drive. */
export async function ensureAppFolderId(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${APP_FOLDER_NAME}' and trashed=false and 'root' in parents`,
  );
  const searchRes = await driveApiFetch(
    `/files?q=${query}&spaces=drive&fields=files(id,name)`,
    accessToken,
  );
  const searchJson = await searchRes.json();
  const existing = searchJson?.files?.[0]?.id;
  if (existing) {
    return existing;
  }

  const createRes = await driveApiFetch('/files?fields=id', accessToken, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    }),
  });
  const createJson = await createRes.json();
  return createJson.id as string;
}

/** Starts a Drive resumable-upload session and returns the one-time session
 * URL to PUT the file's bytes to. `existingFileId` updates that file's
 * content in place; omitting it creates a new file in `folderId`. */
async function startResumableSession(
  accessToken: string,
  fileName: string,
  mimeType: string,
  folderId: string,
  existingFileId?: string | null,
): Promise<string> {
  const url = existingFileId
    ? `${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=resumable`
    : `${DRIVE_UPLOAD_API}/files?uploadType=resumable`;
  const metadata = existingFileId
    ? {name: fileName}
    : {name: fileName, mimeType, parents: [folderId]};

  const response = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
    },
    body: JSON.stringify(metadata),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Drive upload session error ${response.status}: ${body.slice(0, 300)}`,
    );
  }
  const sessionUrl = response.headers.get('Location');
  if (!sessionUrl) {
    throw new Error('Drive did not return an upload session URL');
  }
  return sessionUrl;
}

/** Uploads (or, with `existingFileId`, overwrites the content of) a local
 * file to the app's Drive folder. Returns the resulting Drive file ID. */
export async function uploadFileToDrive(
  localFilePath: string,
  fileName: string,
  mimeType: string,
  existingFileId?: string | null,
): Promise<string> {
  const accessToken = await getFreshAccessToken();
  const folderId = await ensureAppFolderId(accessToken);
  const sessionUrl = await startResumableSession(
    accessToken,
    fileName,
    mimeType,
    folderId,
    existingFileId,
  );

  const stat = await RNFS.stat(localFilePath);
  const uploadResult = await RNFS.uploadFiles({
    toUrl: sessionUrl,
    method: 'PUT',
    binaryStreamOnly: true,
    files: [
      {
        name: 'file',
        filename: fileName,
        filepath: localFilePath,
        filetype: mimeType,
      },
    ],
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(stat.size),
    },
  }).promise;

  if (uploadResult.statusCode < 200 || uploadResult.statusCode >= 300) {
    throw new Error(
      `Drive upload failed with status ${uploadResult.statusCode}: ${uploadResult.body?.slice(0, 300)}`,
    );
  }

  const resultJson = JSON.parse(uploadResult.body || '{}');
  const fileId = resultJson.id || existingFileId;
  if (!fileId) {
    throw new Error('Drive upload succeeded but returned no file ID');
  }
  return fileId;
}

/** Deletes a file from the app's Drive folder - used to keep Drive in sync
 * when a document is deleted locally. A 404 (already gone) is treated the
 * same as success by callers that just want it gone. */
export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const accessToken = await getFreshAccessToken();
  await driveApiFetch(`/files/${fileId}`, accessToken, {method: 'DELETE'});
}
