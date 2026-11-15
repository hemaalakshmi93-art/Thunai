// Google Cloud Firestore store. One document per care circle, updated in a transaction
// so two family members saving at the same moment never overwrite each other.
import { Firestore } from '@google-cloud/firestore';

export class FirestoreStore {
  constructor(projectId) {
    this.db = new Firestore({ ignoreUndefinedProperties: true, ...(projectId ? { projectId } : {}) });
    this.col = this.db.collection('circles');
  }

  async get(id) {
    const snap = await this.col.doc(id).get();
    return snap.exists ? snap.data() : null;
  }

  async create(circle) {
    await this.col.doc(circle.id).create(circle);
    return circle;
  }

  update(id, mutate) {
    const ref = this.col.doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const circle = snap.data();
      const result = await mutate(circle);
      tx.set(ref, circle);
      return result === undefined ? circle : result;
    });
  }

  async list() {
    const snaps = await this.col.select().get();
    return snaps.docs.map((d) => d.id);
  }
}
