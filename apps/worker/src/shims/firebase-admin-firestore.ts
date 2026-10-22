// Worker stand-in for 'firebase-admin/firestore', backed by the REST client.
export {
  CollectionReference,
  DocumentReference,
  DocumentSnapshot,
  FieldValue,
  Query,
  QuerySnapshot,
  Timestamp,
  Transaction,
  WriteBatch,
  QueryDocumentSnapshot,
  type DocumentData,
} from '../firestore/client';
import { db } from '../firestore/client';

export function getFirestore() {
  return db;
}
