// Haven's end-to-end encryption for DMs and group DMs, done the way Haven's
// own app does it (public/js/e2e.js and e2e-group.js in Haven), so people's
// apps can read what Havoc sends there and Havoc can read what they send.
//   1:1 DMs  ECDH P-256 with the other person's public key, HKDF-SHA256,
//            AES-256-GCM: {"v":2,"iv","ct"}
//   groups   one AES key per membership (an "epoch"), wrapped for each member
//            with that 1:1 key; every message is signed (ECDSA P-256) and
//            carries the hash of the one before it: {"v":3,"e","prev","iv","ct","sig"}
// Havoc's private keys stay in its own database, never on the Haven server,
// so an account with no password (a bot account) works the same; only the
// public halves are published. Like Haven's app, it keeps the first keys it
// sees for each person; Haven's app asks its user before using a changed
// one, a bot has nobody to ask, so a change is accepted and written to the
// key log (?keys), along with the keys Havoc makes itself.
import { createHash } from 'node:crypto';

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const dec = new TextDecoder();

// Haven's fixed labels. Changing any of them breaks every conversation.
const DM_SALT = 'haven-e2e-dm-v1';
const DM_INFO = 'aes-gcm-key';
const WRAP_INFO = 'haven-group-key-wrap';
const MESSAGE_CONTEXT = 'havenmsg:v1';
const ROSTER_CONTEXT = 'havenroster:v1';
const EPOCH_CONTEXT = 'havenepoch:v1';
const EPOCH_KEY_CONTEXT = 'havenepochkey:v1';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' };
const AES = { name: 'AES-GCM', length: 256 };

// After a signature fails, someone's signing keys are asked for again (they
// may have reset them), but at most this often.
const SIGNER_RECHECK = 30_000;

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const unb64 = (text) => new Uint8Array(Buffer.from(text, 'base64'));
const sha256 = async (bytes) => b64(new Uint8Array(await subtle.digest('SHA-256', bytes)));
// Only the fields that define a public key, so copies compare and hash alike.
const point = (jwk) => ({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
const sameKey = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
// A key as it's pinned ("x.y"), and its fingerprint for the key log: SHA-256
// of that, in groups of four.
const pinOf = (jwk) => `${jwk.x}.${jwk.y}`;
const fingerprint = (pin) => `\`${createHash('sha256').update(pin).digest('hex').match(/.{4}/g).join(' ')}\``;
// Who Havoc's own keys are for: anyone can encrypt to Havoc with them.
const EVERYONE = 'everyone on this server';
// Signed values, length-prefixed so no combination reads as another.
const framed = (parts) => enc.encode(parts.map((p) => `${String(p).length}:${p}`).join('|'));

async function encrypt(key, bytes, label) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, ...(label && { additionalData: enc.encode(label) }) }, key, bytes);
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

async function decrypt(key, { iv, ct }, label) {
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), ...(label && { additionalData: enc.encode(label) }) }, key, unb64(ct)));
}

function parse(content) {
  if (typeof content !== 'string' || !content.startsWith('{')) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const isDmEnvelope = (o) => !!o && (o.v === 1 || o.v === 2) && typeof o.iv === 'string' && typeof o.ct === 'string';
const isGroupEnvelope = (o) => !!o && o.v === 3 && Number.isInteger(o.e) && typeof o.sig === 'string' && typeof o.iv === 'string' && typeof o.ct === 'string';

// What the member who publishes an epoch signs: this key (by its hash), for
// this group and epoch, for exactly these members and their keys.
async function epochStatement({ channelId, epoch, publisherId, key, roster }) {
  const raw = new Uint8Array(await subtle.exportKey('raw', key));
  const commit = await sha256(new Uint8Array([...enc.encode(EPOCH_KEY_CONTEXT), ...raw]));
  const members = roster.map((m) => ({ id: Number(m.id), ecdh: `${m.ecdhJwk.x}.${m.ecdhJwk.y}`, sign: `${m.signJwk.x}.${m.signJwk.y}` }))
    .sort((a, b) => a.id - b.id)
    .map((m) => `${m.id}:${m.ecdh}:${m.sign}`)
    .join('|');
  const digest = await sha256(enc.encode(`${ROSTER_CONTEXT}|${members}`));
  return framed([EPOCH_CONTEXT, channelId, epoch, publisherId, commit, digest]);
}

export class Encryption {
  // `client` is the HavenClient; `store` is this server's key storage
  // (db.keyStore): Havoc's private keys, the keys pinned for people, and the
  // key log.
  constructor(client, store) {
    this.client = client;
    this.store = store;
    this.own = null;
    // User id → their public encryption key (null: they have none).
    this.publicKeys = new Map();
    // User id → every signing key they've published, and when that was asked.
    this.signers = new Map();
    // Public key ("x.y") → the AES key Havoc shares with its owner.
    this.pairKeys = new Map();
    // Group code → what Havoc knows of its keys.
    this.groups = new Map();
  }

  // Havoc's own keys, made once and kept: { ecdh, signing }, each with its
  // private key and public JWK.
  keys() {
    this.own ??= (async () => {
      let saved = this.store.load();
      if (!saved) {
        const ecdh = await subtle.generateKey(ECDH, true, ['deriveBits']);
        const signing = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
        saved = { ecdh: await subtle.exportKey('jwk', ecdh.privateKey), signing: await subtle.exportKey('jwk', signing.privateKey) };
        this.store.save(saved);
        this.store.log('Havoc made its own encryption and signing keys', [
          ['For', EVERYONE],
          ['Why', 'first start on this server (or its keys were lost from havoc.db)'],
          ['Encryption key', fingerprint(pinOf(saved.ecdh))],
          ['Signing key', fingerprint(pinOf(saved.signing))],
        ]);
      }
      return {
        ecdh: { privateKey: await subtle.importKey('jwk', saved.ecdh, ECDH, false, ['deriveBits']), publicJwk: point(saved.ecdh) },
        signing: { privateKey: await subtle.importKey('jwk', saved.signing, ECDSA, false, ['sign']), publicJwk: point(saved.signing) },
      };
    })();
    return this.own;
  }

  // On every connect: publish Havoc's public keys where the server has
  // others (or none), join any groups it was invited to, and re-check the
  // groups it knows, since events may have been missed while away.
  async start() {
    // Keys pinned before the log listed first-seen keys go in it once, by
    // name, so it holds every key Havoc has accepted. Taken first, so a key
    // pinned meanwhile isn't logged twice.
    const old = this.store.unloggedPins();
    if (old.length) this.logOldPins(old).catch((err) => this.client.emit('warn', `key log: ${err.message}`));
    const { ecdh, signing } = await this.keys();
    const r = await this.client.request('get-encrypted-key', undefined, { 'encrypted-key-result': null });
    if (!r) throw new Error("the server didn't say which keys it has");
    // A key the server had for Havoc that isn't Havoc's (made by a browser
    // signed in to its account, or before havoc.db lost its keys) is replaced.
    const replaced = (kind, old, now) => old && this.store.log(`Havoc published its ${kind} key, replacing a different one the server had`, [
      ['For', EVERYONE],
      ['Old key', fingerprint(pinOf(old))],
      ['New key', fingerprint(pinOf(now))],
    ]);
    if (!sameKey(r.data.publicKey, ecdh.publicJwk)) {
      const done = await this.client.request('publish-public-key', { jwk: ecdh.publicJwk, force: true }, { 'public-key-published': null });
      if (!done) throw new Error("the server didn't take Havoc's encryption key");
      replaced('encryption', r.data.publicKey, ecdh.publicJwk);
    }
    if (!sameKey(r.data.signingKey, signing.publicJwk)) {
      const rid = b64(crypto.getRandomValues(new Uint8Array(9)));
      const done = await this.client.request('publish-signing-key', { jwk: signing.publicJwk, force: true, rid }, { 'signing-key-published': (d) => d?.rid === rid });
      if (!done) throw new Error("the server didn't take Havoc's signing key");
      replaced('signing', r.data.signingKey, signing.publicJwk);
    }
    for (const group of this.groups.values()) group.ready = false;
    this.client.socket.emit('get-group-invites');
  }

  async logOldPins(pins) {
    if (!this.client.channelsLoaded) await new Promise((r) => this.client.once('channels', r));
    const names = await this.client.namesOf([...new Set(pins.map((p) => p.user_id))]);
    for (const p of pins) this.logAccepted(p.user_id, p.kind, names.get(p.user_id), p.key);
  }

  // Group events. Havoc joins every group it's invited to; a membership
  // change gets a new key (from whichever member gets there first), and a
  // member who reset their keys gets the current one re-shared.
  listen(socket) {
    const accept = (invite) => invite?.code && socket.emit('accept-group-dm', { code: invite.code });
    socket.on('public-key-result', (d) => {
      if (!d?.userId) return;
      this.publicKeys.set(d.userId, d.jwk ?? null);
      this.noteKey(d.userId, 'encryption', d.jwk);
    });
    socket.on('group-dm-invite', accept);
    socket.on('group-dm-invites', (d) => (d?.invites ?? []).forEach(accept));
    socket.on('group-dm-opened', (d) => this.ensure({ code: d.code, id: d.id }).catch((err) => this.warn(d.code, err)));
    const changed = async (d) => {
      const group = this.group({ code: d.code });
      group.ready = false;
      // Spread out, so the members don't all publish the new key at once.
      await new Promise((r) => setTimeout(r, Math.random() * 1500));
      await this.ensure({ code: d.code, id: group.id });
    };
    for (const event of ['group-dm-member-joined', 'group-dm-member-left']) socket.on(event, (d) => changed(d).catch((err) => this.warn(d.code, err)));
    socket.on('group-epoch-published', (d) => {
      const group = this.groups.get(d.code);
      if (!group || group.keys.has(d.epoch)) return;
      group.ready = false;
      this.loadGroupKeys(d.code, group).catch((err) => this.warn(d.code, err));
    });
    socket.on('group-rewrap-requested', (d) => this.rewrap(d).catch((err) => this.warn(d.code, err)));
  }

  warn(code, err) {
    this.client.emit('warn', `group ${code}: ${err.message}`);
  }

  // A key the server gave for someone ('encryption' or 'signing'). The first
  // one is pinned; a different one later (they reset their keys, or someone
  // swapped it) is accepted and pinned instead. Both are logged.
  noteKey(userId, kind, jwk, name) {
    if (!jwk?.x || !jwk?.y || userId === this.client.user.id) return;
    const pin = pinOf(jwk);
    const pinned = this.store.pin(userId, kind);
    if (pinned === pin) return;
    this.store.setPin(userId, kind, pin);
    this.logAccepted(userId, kind, name ?? this.client.members.get(userId)?.name, pin, pinned);
  }

  logAccepted(userId, kind, name, pin, old = null) {
    const who = name ?? `user ${userId}`;
    this.store.log(old ? `${who}'s ${kind} key changed (accepted)` : `Havoc accepted ${who}'s ${kind} key (first seen)`, [
      ['For', `${who} (id ${userId})`],
      ...(old ? [['Old key', fingerprint(old)], ['New key', fingerprint(pin)]] : [['Key', fingerprint(pin)]]),
    ]);
  }

  // Text to send in a DM or group DM ({ code, id, group, partner }):
  // { content, encrypted }. Someone without a key (their app can't
  // encrypt) gets plain text, as Haven's app sends them.
  async seal(dm, text) {
    if (dm.group) return { content: await this.groupEncrypt(dm, text), encrypted: true };
    const jwk = await this.publicKey(dm.partner);
    if (!jwk) return { content: text };
    const sealed = await encrypt(await this.pairKey(jwk), enc.encode(text));
    return { content: JSON.stringify({ v: 2, ...sealed }), encrypted: true };
  }

  // A DM or group DM message's text, or null when it can't be read (or, in
  // a group, its signature doesn't check out).
  async open(dm, message) {
    const envelope = parse(message.content);
    if (dm.group) return isGroupEnvelope(envelope) ? this.groupDecrypt(dm, envelope, message) : null;
    if (!isDmEnvelope(envelope)) return message.content;
    // Both people derive the same key, so this opens Havoc's own messages too.
    const attempt = async () => {
      const jwk = await this.publicKey(dm.partner);
      return jwk ? dec.decode(await decrypt(await this.pairKey(jwk), envelope)) : null;
    };
    try {
      return await attempt();
    } catch {
      // Their key may have changed since it was looked up.
      this.publicKeys.delete(dm.partner);
      return attempt().catch(() => null);
    }
  }

  // Someone's public encryption key, or null when the server says they have
  // none. Throws when the server doesn't answer, so nobody who has a key is
  // ever sent plain text.
  async publicKey(userId) {
    const { ecdh } = await this.keys();
    if (userId === this.client.user.id) return ecdh.publicJwk;
    if (!this.publicKeys.has(userId)) {
      const r = await this.client.request('get-public-key', { userId }, { 'public-key-result': (d) => d?.userId === userId });
      if (!r) throw new Error(`the server didn't send user ${userId}'s key`);
    }
    return this.publicKeys.get(userId) ?? null;
  }

  // The AES key Havoc shares with whoever holds this public key (Haven's
  // 1:1 DM key, also used to wrap group keys).
  async pairKey(jwk) {
    const id = `${jwk.x}.${jwk.y}`;
    if (!this.pairKeys.has(id)) {
      this.pairKeys.set(id, (async () => {
        const { ecdh } = await this.keys();
        const theirs = await subtle.importKey('jwk', point(jwk), ECDH, false, []);
        const bits = await subtle.deriveBits({ name: 'ECDH', public: theirs }, ecdh.privateKey, 256);
        const hkdf = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
        return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(DM_SALT), info: enc.encode(DM_INFO) }, hkdf, AES, false, ['encrypt', 'decrypt']);
      })());
    }
    return this.pairKeys.get(id);
  }

  async sign(bytes) {
    const { signing } = await this.keys();
    return b64(new Uint8Array(await subtle.sign(SIGNATURE, signing.privateKey, bytes)));
  }

  // True when one of the signing keys `userId` has published made `sig`.
  async signedBy(userId, sig, bytes) {
    const check = async (keys) => {
      for (const jwk of keys) {
        try {
          const key = await subtle.importKey('jwk', point(jwk), ECDSA, false, ['verify']);
          if (await subtle.verify(SIGNATURE, key, unb64(sig), bytes)) return true;
        } catch {
          // A malformed key or signature just isn't a match.
        }
      }
      return false;
    };
    if (await check(await this.signingKeys(userId))) return true;
    const known = this.signers.get(userId);
    if (!known || Date.now() - known.at < SIGNER_RECHECK) return false;
    this.signers.delete(userId);
    return check(await this.signingKeys(userId));
  }

  // Everyone's current signing key first, then the ones they had before (so
  // messages from before a key reset still check out).
  async signingKeys(userId) {
    const { signing } = await this.keys();
    if (userId === this.client.user.id) return [signing.publicJwk];
    if (!this.signers.has(userId)) {
      const r = await this.client.request('get-signing-key', { userId }, { 'signing-key-result': (d) => d?.userId === userId });
      if (!r) return [];
      this.noteKey(userId, 'signing', r.data.jwk);
      const all = [r.data.jwk, ...(r.data.keys ?? [])].filter((k) => k?.x && k?.y);
      this.signers.set(userId, { keys: all.filter((k, i) => all.findIndex((o) => sameKey(o, k)) === i), at: Date.now() });
    }
    return this.signers.get(userId).keys;
  }

  // What Havoc holds for a group: its keys by epoch, the current epoch, and
  // the hash of the latest message (the next one Havoc sends names it).
  group({ code, id }) {
    if (!this.groups.has(code)) this.groups.set(code, { id, keys: new Map(), epoch: 0, lastHash: null, lastId: 0, ready: false });
    const group = this.groups.get(code);
    group.id ??= id;
    return group;
  }

  // A group's current key, publishing a new one first when the members
  // changed and nobody has yet.
  ensure(dm) {
    const group = this.group(dm);
    if (group.ready && group.keys.has(group.epoch)) return Promise.resolve(group);
    group.busy ??= (async () => {
      await this.loadGroupKeys(dm.code, group);
      // Any member may publish a new key at any time, so Havoc does when the
      // members changed or when it can't open the current key (it was wrapped
      // for a key Havoc no longer has), rather than wait for someone else.
      if (group.needsRotation || !group.keys.has(group.epoch)) await this.rotate(dm.code, group);
      group.ready = group.keys.has(group.epoch) && !group.needsRotation;
      return group;
    })().finally(() => { group.busy = null; });
    return group.busy;
  }

  async roster(code) {
    const r = await this.client.request('get-group-roster', { code }, { 'group-roster': (d) => d?.code === code });
    if (!r) return null;
    this.groups.get(code).id ??= r.data.id;
    for (const m of r.data.members) {
      this.noteKey(m.id, 'encryption', m.publicKey, m.username);
      this.noteKey(m.id, 'signing', m.signingKey, m.username);
      // A signing key Havoc hasn't seen for them: what it holds is out of date.
      const known = this.signers.get(m.id);
      if (known && m.signingKey && !known.keys.some((k) => sameKey(k, m.signingKey))) this.signers.delete(m.id);
    }
    return r.data;
  }

  // Fetches the group keys Havoc was given that are newer than the ones it
  // holds, shared by everything waiting on them at once.
  loadGroupKeys(code, group) {
    group.loading ??= (async () => {
      const since = group.keys.size ? Math.max(...group.keys.keys()) : 0;
      const r = await this.client.request('get-group-keys', { code, sinceEpoch: since }, { 'group-keys': (d) => d?.code === code });
      if (!r) throw new Error("the server didn't send the group's keys");
      group.epoch = r.data.currentEpoch;
      group.needsRotation = !!r.data.needsRotation;
      group.fresh = true;
      const roster = await this.roster(code);
      for (const k of r.data.keys) {
        if (group.keys.has(k.epoch)) continue;
        try {
          const key = await this.openEpochKey(group, k, roster);
          if (key) group.keys.set(k.epoch, key);
        } catch (err) {
          this.warn(code, new Error(`couldn't open the key for epoch ${k.epoch}: ${err.message}`));
        }
      }
    })().finally(() => { group.loading = null; });
    return group.loading;
  }

  // One wrapped group key, accepted only when the member who published it
  // signed it for this group and epoch, for a member list with Havoc in it.
  async openEpochKey(group, k, roster) {
    const me = this.client.user.id;
    const wrapper = roster?.members.find((m) => m.id === k.wrappedBy)?.publicKey ?? await this.publicKey(k.wrappedBy);
    if (!wrapper) return null;
    const raw = await decrypt(await this.pairKey(wrapper), parse(k.wrappedKey), WRAP_INFO);
    const key = await subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    const members = Array.isArray(k.roster) ? k.roster : [];
    if (!k.sig || !members.some((m) => m.id === me) || !members.some((m) => m.id === k.publishedBy)) return null;
    const statement = await epochStatement({ channelId: group.id, epoch: k.epoch, publisherId: k.publishedBy, key, roster: members });
    return (await this.signedBy(k.publishedBy, k.sig, statement)) ? key : null;
  }

  // Publishes a new group key wrapped for exactly the current members. If
  // another member published one first, Havoc uses theirs instead.
  async rotate(code, group, attempt = 0) {
    const me = this.client.user.id;
    const { ecdh, signing } = await this.keys();
    const roster = await this.roster(code);
    if (!roster?.members.some((m) => m.id === me)) return;
    const key = await subtle.generateKey(AES, true, ['encrypt', 'decrypt']);
    const raw = new Uint8Array(await subtle.exportKey('raw', key));
    const keys = [];
    const snapshot = [];
    for (const m of roster.members) {
      const mine = m.id === me;
      const ecdhJwk = mine ? ecdh.publicJwk : m.publicKey ?? await this.publicKey(m.id);
      const signJwk = mine ? signing.publicJwk : m.signingKey;
      if (!ecdhJwk || !signJwk) return;
      keys.push({ recipientId: m.id, wrappedKey: JSON.stringify({ v: 1, ...(await encrypt(await this.pairKey(ecdhJwk), raw, WRAP_INFO)) }) });
      snapshot.push({ id: m.id, ecdhJwk: point(ecdhJwk), signJwk: point(signJwk) });
    }
    const epoch = roster.epoch + 1;
    const sig = await this.sign(await epochStatement({ channelId: group.id, epoch, publisherId: me, key, roster: snapshot }));
    const r = await this.client.request('publish-group-epoch', { code, epoch, keys, sig, roster: snapshot }, {
      'group-epoch-published': (d) => d?.code === code && d.epoch === epoch,
      'group-epoch-conflict': (d) => d?.code === code,
      'error-msg': null,
    });
    if (r?.event === 'group-epoch-published') {
      const why = !roster.epoch ? 'a new group' : group.needsRotation ? 'its members changed' : "Havoc couldn't open the group's current key";
      this.store.log(`Havoc made a new key for the group DM "${roster.name}"`, [
        ['For', roster.members.map((m) => m.username).join(', ')],
        ['Group', `${roster.name} (code ${code})`],
        ['Key number', epoch],
        ['Why', why],
      ]);
      group.keys.set(epoch, key);
      group.epoch = epoch;
      group.needsRotation = false;
      return;
    }
    await this.loadGroupKeys(code, group);
    if (group.needsRotation && attempt < 2) {
      await new Promise((res) => setTimeout(res, 300 + Math.random() * 900));
      await this.rotate(code, group, attempt + 1);
    }
  }

  // Shares the group key again with a member who reset their keys, wrapped
  // for the key the server has on record for them.
  async rewrap({ code, userId, epoch }) {
    if (!code || userId === this.client.user.id) return;
    const group = this.groups.get(code);
    if (!group) return;
    if (!group.keys.has(epoch)) await this.loadGroupKeys(code, group);
    const key = group.keys.get(epoch);
    if (!key) return;
    this.publicKeys.delete(userId);
    const jwk = await this.publicKey(userId);
    if (!jwk) return;
    const raw = new Uint8Array(await subtle.exportKey('raw', key));
    const wrappedKey = JSON.stringify({ v: 1, ...(await encrypt(await this.pairKey(jwk), raw, WRAP_INFO)) });
    this.client.socket.emit('rewrap-group-key', { code, recipientId: userId, epoch, wrappedKey, recipientPublicKey: JSON.stringify(jwk) });
  }

  async groupEncrypt(dm, text) {
    const group = await this.ensure(dm);
    const key = group.keys.get(group.epoch);
    if (!key) throw new Error("Havoc doesn't have the group's key yet");
    const { iv, ct } = await encrypt(key, enc.encode(text));
    const prev = group.lastHash;
    const sig = await this.sign(framed([MESSAGE_CONTEXT, group.id, group.epoch, this.client.user.id, prev ?? '', iv, ct]));
    const content = JSON.stringify({ v: 3, e: group.epoch, prev: prev ?? null, iv, ct, sig });
    group.lastHash = await sha256(enc.encode(content));
    return content;
  }

  async groupDecrypt(dm, envelope, message) {
    const group = this.group(dm);
    if (!group.keys.has(envelope.e) && (!group.fresh || envelope.e > group.epoch)) await this.loadGroupKeys(dm.code, group);
    const key = group.keys.get(envelope.e);
    if (!key) {
      // Sent under the current key and Havoc can't open it: it publishes a
      // new one, so the members' next messages are readable.
      if (envelope.e >= group.epoch) this.ensure(dm).catch((err) => this.warn(dm.code, err));
      return null;
    }
    const signed = framed([MESSAGE_CONTEXT, group.id, envelope.e, message.user_id, envelope.prev ?? '', envelope.iv, envelope.ct]);
    if (!(await this.signedBy(message.user_id, envelope.sig, signed))) return null;
    const text = await decrypt(key, envelope).then((bytes) => dec.decode(bytes), () => null);
    if (text === null) return null;
    if ((message.id ?? 0) >= group.lastId) {
      group.lastId = message.id ?? 0;
      group.lastHash = await sha256(enc.encode(message.content));
    }
    return text;
  }
}
