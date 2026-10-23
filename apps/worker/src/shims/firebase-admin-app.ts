// Worker stand-in for 'firebase-admin/app'. The Worker configures Firestore per request (see src/index.ts).
export function initializeApp(): void {}
export function getApps(): unknown[] {
  return [{}];
}
