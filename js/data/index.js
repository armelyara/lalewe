import { CONFIG } from '../config.js';

// Data layer contract (both adapters implement it). Errors carry an i18n key
// as message (e.g. 'err.balance').
//   auth.onChange(cb) -> unsubscribe        auth.startPhoneSignIn(phone) -> { confirm(code) }
//   auth.signOut()                          auth.getProfile() / auth.ensureProfile()
//   auth.saveProfile(data)                  auth.becomeCourier(data) / auth.setOnline(bool)
//   orders.create(input) -> order           orders.watch(id, cb) -> unsubscribe
//   orders.watchMine(cb)                    orders.watchAvailable(cb) / orders.watchJobs(cb)
//   orders.accept(id) / pickUp(id) / deliver(id, code) / cancel(id)
//   orders.getDeliveryCode(id)              (merchant only)
//   wallet.watch(cb) -> unsubscribe         wallet.topUp(amount, method)
export async function createData() {
  if (CONFIG.dataMode === 'firebase') {
    const { createFirebaseAdapter } = await import('./firebase.js');
    return createFirebaseAdapter();
  }
  const { createMockAdapter } = await import('./mock.js');
  return createMockAdapter();
}
