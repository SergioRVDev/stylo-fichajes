import { ref as storageRef, uploadString, getDownloadURL, uploadBytes, deleteObject } from "firebase/storage";
import { ref as dbRef, set, get } from "firebase/database";
import { getFirebaseStorage, getFirebaseDatabase } from "./config";

export interface MonthlySignature {
  url: string;
  timestamp: number;
}

/**
 * Uploads a base64 signature image to Storage and saves its metadata to Realtime Database.
 * @param uid The user ID
 * @param yearMonth Format: "YYYY-MM"
 * @param base64Data The base64 string of the signature PNG
 */
export async function saveSignature(uid: string, yearMonth: string, base64Data: string): Promise<string> {
  const storage = getFirebaseStorage();
  const db = getFirebaseDatabase();

  // 1. Upload to Storage
  const path = `signatures/${uid}/${yearMonth}.png`;
  const fileRef = storageRef(storage, path);
  
  // Format should be a data URL, so we can use data_url string format
  await uploadString(fileRef, base64Data, 'data_url');
  
  // 2. Get download URL
  const downloadUrl = await getDownloadURL(fileRef);

  // 3. Save reference in Database
  const signatureData: MonthlySignature = {
    url: downloadUrl,
    timestamp: Date.now()
  };
  
  await set(dbRef(db, `signatures/${uid}/${yearMonth}`), signatureData);

  return downloadUrl;
}

/**
 * Gets a user's signature for a specific month if it exists.
 * @param uid The user ID
 * @param yearMonth Format: "YYYY-MM"
 */
export async function getSignature(uid: string, yearMonth: string): Promise<MonthlySignature | null> {
  const db = getFirebaseDatabase();
  const snapshot = await get(dbRef(db, `signatures/${uid}/${yearMonth}`));
  
  if (snapshot.exists()) {
    return snapshot.val() as MonthlySignature;
  }
  return null;
}

/**
 * Uploads a profile image to Storage and returns the download URL.
 * @param uid The user ID
 * @param file The image File object
 */
export async function uploadProfileImage(uid: string, file: File): Promise<string> {
  const storage = getFirebaseStorage();
  const path = `avatars/${uid}.png`;
  const fileRef = storageRef(storage, path);
  
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}

/**
 * Uploads a generated PDF report to Storage and returns the download URL.
 * @param companyId The ID of the company
 * @param filename The desired filename (e.g. report-12345.pdf)
 * @param blob The PDF Blob
 */
export async function uploadReportPDF(companyId: string, filename: string, blob: Blob): Promise<string> {
  const storage = getFirebaseStorage();
  const path = `reports/${companyId}/${filename}`;
  const fileRef = storageRef(storage, path);
  
  await uploadBytes(fileRef, blob, { contentType: 'application/pdf' });
  return await getDownloadURL(fileRef);
}

/**
 * Deletes a generated PDF report from Storage
 * @param downloadUrl The full download URL of the PDF to delete
 */
export async function deleteReportPDF(downloadUrl: string): Promise<void> {
  const storage = getFirebaseStorage();
  // Instead of parsing the path manually, we can use ref from the URL
  const fileRef = storageRef(storage, downloadUrl);
  try {
    await deleteObject(fileRef);
  } catch (err) {
    console.error("Error deleting PDF from storage:", err);
    // Ignore error if already deleted or doesn't exist
  }
}
