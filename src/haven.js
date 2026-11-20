// A minimal Haven client that signs in as an ordinary account, the same way
// the web app does: password login for a JWT, then a Socket.IO connection
// that joins every channel the account can read.
import { EventEmitter } from 'node:events';
import { io } from 'socket.io-client';

const EULA_VERSION = '2.0';
// Haven drops an ordinary account's messages past 10 per 10 seconds, so
// posts wait their turn instead: at most SEND_MAX per SEND_WINDOW, with a
// little slack for messages that reach the server late.
const SEND_MAX = 9;
const SEND_WINDOW = 10_250;

// How long an uploaded image is posted again before uploading it afresh
// (in case the server cleaned old uploads out).
const UPLOAD_REUSE = 24 * 3_600_000;

// A failure whose reason is fine to show in chat.
const refusal = (reason) => Object.assign(new Error(reason), { reason });

export class HavenClient extends EventEmitter {
  constructor({ url, username, password }) {
    super();
    this.url = url.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.token = null;
    this.user = null;
    this.socket = null;
    // Display name (lowercased) and id → { id, name, avatar, isGuest }, filled
    // from messages and member lists. isGuest is only known once the person
    // has been seen in a member list (messages don't carry it).
    this.members = new Map();
    // Server channels Havoc answers in (no DMs), code → { id, name }, and
    // which of them are forums.
    this.serverChannels = new Map();
    this.forumChannels = new Set();
    // Images posted with sendImageOnce: key → { url, at }.
    this.uploaded = new Map();
    // Posts waiting to go out, and when the recent ones went.
    this.outbox = [];
    this.sentAt = [];
    this.outboxTimer = null;
  }

  async login() {
    const res = await fetch(`${this.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
        eulaVersion: EULA_VERSION,
        ageVerified: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Login failed (${res.status}): ${body.error || 'no details'}`);
    if (body.requiresTOTP) throw new Error('This account has two-factor auth on. Turn it off for the bot account.');
    this.token = body.token;
    this.user = body.user;
  }

  async connect() {
    await this.login();
    this.socket = io(this.url, {
      auth: { token: this.token },
      // Default transports (long-polling, then a websocket upgrade if the
      // server allows it), same as Haven's web app. Some servers sit behind a
      // proxy that doesn't pass websockets through, and polling still works there.
      reconnectionDelayMax: 30_000,
    });

    this.socket.on('connect', () => {
      // Listing channels also joins their live rooms, so new messages
      // from all of them arrive on this socket.
      this.socket.emit('get-channels');
      this.emit('ready', this.user);
    });

    this.socket.on('connect_error', async (err) => {
      // The token expired or the password changed: sign in again and let
      // Socket.IO's own reconnect pick up the new token.
      if (/token|session expired|authentication required/i.test(err.message)) {
        try {
          await this.login();
          this.socket.auth.token = this.token;
        } catch (e) {
          this.emit('error', e);
        }
      }
      this.emit('warn', `connect error: ${err.message}`);
    });

    this.socket.on('disconnect', (reason) => this.emit('warn', `disconnected: ${reason}`));
    this.socket.on('error-msg', (msg) => this.emit('warn', `server: ${msg}`));

    // A channel created or joined later shows up as a fresh list; asking
    // again joins its room too.
    this.socket.on('channels-list', (channels) => {
      const server = (channels || []).filter((c) => !c.is_dm && !c.is_group && !c.is_self_dm);
      this.serverChannels = new Map(server.map((c) => [c.code, { id: c.id, name: c.name }]));
      this.forumChannels = new Set(server.filter((c) => c.is_forum).map((c) => c.code));
      this.emit('channels', channels);
    });

    // Who is online in a channel. Haven leaves isGuest out when it is false.
    this.socket.on('online-users', ({ channelCode, users }) => {
      for (const u of users || []) this.remember(u.id, u.username, u.avatar, !!u.isGuest);
      this.emit('members', channelCode);
    });

    // Everyone in a channel, offline too (what @mention autocomplete uses),
    // findable by display name or login name. No avatars in this list.
    this.socket.on('channel-members', ({ channelCode, members }) => {
      for (const m of members || []) {
        this.remember(m.id, m.username);
        const entry = this.members.get(m.id);
        if (m.loginName && entry) {
          entry.login = m.loginName;
          this.members.set(m.loginName.toLowerCase(), entry);
        }
      }
      this.emit('channel-members', channelCode);
    });

    this.socket.on('user-profile', (p) => {
      if (p?.id == null) return;
      this.remember(p.id, p.displayName, p.avatar ?? null);
      this.emit('profile', p.id);
    });

    // In a forum every top-level message starts a topic, so a command posted
    // as a new topic is answered inside that topic, not with topics of its own.
    this.socket.on('new-message', ({ channelCode, message }) => {
      if (!message) return;
      const threadId = this.forumChannels.has(channelCode) ? message.id : null;
      this.incoming(channelCode, message, threadId);
    });

    this.socket.on('message-edited', (e) => this.emit('edited', e?.messageId));
    this.socket.on('status-updated', (s) => this.emit('status', s));

    // Replies inside a forum topic, or in a thread on an ordinary message.
    this.socket.on('new-thread-message', ({ channelCode, parentId, message }) => {
      if (!message || !parentId) return;
      this.incoming(channelCode, message, parentId);
    });
  }

  incoming(channelCode, message, threadId) {
    this.remember(message.user_id, message.username, message.avatar);
    // Havoc's own messages are only watched for their ids (see sendForEdit).
    if (message.user_id === this.user.id) return this.emit('own-message', { channelCode, message });
    if (message.is_webhook) return;
    // Only server channels: DMs and group DMs are ignored. A channel not
    // in the list yet might be a new DM, so it is skipped and the list
    // refreshed rather than guessed at.
    if (!this.serverChannels.has(channelCode)) {
      this.socket.emit('get-channels');
      return;
    }
    this.emit('message', { channelCode, message, threadId });
  }

  // Posts in the channel, or inside a topic/thread when threadId is set.
  // Silent unless `silent: false` (a ping that should notify).
  // Resolves once it has gone out (it may wait its turn, see SEND_MAX).
  post(channelCode, fields, { replyTo, threadId, silent = true } = {}) {
    return new Promise((resolve) => {
      this.outbox.push(() => {
        if (threadId) {
          this.socket.emit('send-thread-message', { parentId: threadId, silent, ...fields, ...(replyTo && { replyTo }) });
        } else {
          this.socket.emit('send-message', { code: channelCode, silent, ...fields, ...(replyTo && { replyTo }) });
        }
        resolve();
      });
      this.flush();
    });
  }

  // Sends queued posts in order while the window has room, then waits for
  // the oldest one to leave it.
  flush() {
    if (this.outboxTimer) return;
    while (this.outbox.length) {
      const now = Date.now();
      this.sentAt = this.sentAt.filter((t) => now - t < SEND_WINDOW);
      if (this.sentAt.length >= SEND_MAX) {
        this.outboxTimer = setTimeout(() => { this.outboxTimer = null; this.flush(); }, this.sentAt[0] + SEND_WINDOW - now);
        return;
      }
      this.sentAt.push(now);
      this.outbox.shift()();
    }
  }

  // Sends a message and resolves with its id once Haven echoes it back
  // (null if it doesn't within a few seconds), so it can be edited later.
  sendForEdit(channelCode, content, opts) {
    return new Promise((resolve) => {
      let timer;
      const done = (id) => { clearTimeout(timer); this.off('own-message', onOwn); resolve(id); };
      // Matched by what it replies to as well, so two identical messages
      // (two people playing at once) never get mixed up.
      const onOwn = ({ channelCode: code, message: m }) => {
        if (code === channelCode && m.content === content && (!opts?.replyTo || m.reply_to === opts.replyTo)) done(m.id);
      };
      this.on('own-message', onOwn);
      // The wait starts once it has actually gone out, not while it's queued.
      this.send(channelCode, content, opts).then(() => { timer = setTimeout(() => done(null), 5000); });
    });
  }

  // Edits one of Havoc's messages. Resolves true once Haven confirms it,
  // false if it doesn't (e.g. the server took away editing own messages).
  edit(channelCode, messageId, content) {
    return new Promise((resolve) => {
      const done = (ok) => { clearTimeout(timer); this.off('edited', onEdited); resolve(ok); };
      const onEdited = (id) => { if (id === messageId) done(true); };
      const timer = setTimeout(() => done(false), 3000);
      this.on('edited', onEdited);
      this.socket.emit('edit-message', { channelCode, messageId, content });
    });
  }

  // One message by id, in a channel or inside a thread/topic of it, as
  // Haven's history sends it ({ id, user_id, content, ... }), or null when it
  // isn't there (or Havoc can't see it).
  messageById(channelCode, messageId) {
    if (!this.socket?.connected) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (message) => { clearTimeout(timer); this.socket.off('message-history', onHistory); resolve(message); };
      const onHistory = (h) => {
        if (h?.channelCode === channelCode && h.around === messageId) done(h.messages?.find((m) => m.id === messageId) ?? null);
      };
      const timer = setTimeout(() => done(null), 3000);
      this.socket.on('message-history', onHistory);
      this.socket.emit('get-messages', { code: channelCode, around: messageId, limit: 1 });
    });
  }

  // Deletes a message. Resolves true once Haven confirms it, false if it
  // doesn't (Haven only lets an ordinary account delete its own).
  deleteMessage(channelCode, messageId) {
    if (!this.socket?.connected) return Promise.resolve(false);
    return new Promise((resolve) => {
      const done = (ok) => { clearTimeout(timer); this.socket.off('message-deleted', onDeleted); resolve(ok); };
      const onDeleted = (e) => { if (e?.messageId === messageId) done(true); };
      const timer = setTimeout(() => done(false), 3000);
      this.socket.on('message-deleted', onDeleted);
      this.socket.emit('delete-message', { channelCode, messageId });
    });
  }

  // avatar: undefined = not known yet, null = has none.
  remember(id, name, avatar, isGuest) {
    if (id == null || !name) return;
    const prev = this.members.get(id);
    const entry = { id, name, login: prev?.login, avatar: avatar !== undefined ? avatar : prev?.avatar, isGuest: isGuest ?? prev?.isGuest };
    this.members.set(id, entry);
    this.members.set(name.toLowerCase(), entry);
  }

  // Sends a request and waits briefly for its answer (Haven's replies carry
  // no request id, so `matches` picks the right one).
  ask(event, data, replyEvent, matches) {
    if (!this.socket?.connected) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); this.off(replyEvent, onReply); resolve(); };
      const onReply = (value) => { if (matches(value)) done(); };
      const timer = setTimeout(done, 2000);
      this.on(replyEvent, onReply);
      this.socket.emit(event, data);
    });
  }

  anyChannel() {
    return this.serverChannels.keys().next().value;
  }

  // A server channel by code, id, or name as typed in chat ("#bot_test"
  // also finds "bot test"). Null when Havoc isn't in it.
  channel(code) {
    return this.serverChannels.get(code) ?? null;
  }

  channelById(id) {
    for (const c of this.serverChannels.values()) if (c.id === id) return c;
    return null;
  }

  channelByName(name) {
    const want = name.replace(/^#/, '').toLowerCase();
    for (const c of this.serverChannels.values()) {
      const have = c.name.toLowerCase();
      if (have === want || have === want.replace(/_/g, ' ')) return c;
    }
    return null;
  }

  // The online list (with guest flags) for a channel.
  loadOnline(code = this.anyChannel()) {
    return code ? this.ask('enter-channel', { code }, 'members', (c) => c === code) : Promise.resolve();
  }

  // Finds a member by display or login name, offline people included, with
  // their avatar. Known people answer from memory; otherwise the channel's
  // full member list (and then their profile, for the avatar) is fetched.
  async findMember(name, channelCode = this.anyChannel()) {
    const key = name.toLowerCase();
    if (!this.members.has(key) && channelCode) {
      await this.ask('get-channel-members', { code: channelCode }, 'channel-members', (c) => c === channelCode);
    }
    const member = this.members.get(key);
    if (member && member.avatar === undefined) {
      await this.ask('get-user-profile', { userId: member.id }, 'profile', (id) => id === member.id);
    }
    return this.members.get(key) ?? null;
  }

  // Someone's login name (what an @mention has to use to ping them), from
  // the channel's member list; null if they can't be found.
  async loginName(id, channelCode = this.anyChannel()) {
    if (!this.members.get(id)?.login && channelCode) {
      await this.ask('get-channel-members', { code: channelCode }, 'channel-members', (c) => c === channelCode);
    }
    return this.members.get(id)?.login ?? null;
  }

  // Display names for user ids, fetching member lists channel by channel
  // until everyone is known. Ids nobody can find map to null.
  async namesOf(ids) {
    for (const code of this.serverChannels.keys()) {
      if (ids.every((id) => this.members.has(id))) break;
      await this.ask('get-channel-members', { code }, 'channel-members', (c) => c === code);
    }
    return new Map(ids.map((id) => [id, this.members.get(id)?.name ?? null]));
  }

  // Whether an account is a guest. Ids are never reused, so once known the
  // answer never changes; unknown after a fresh online list counts as not.
  async isGuest(id, channelCode) {
    if (this.members.get(id)?.isGuest === undefined) await this.loadOnline(channelCode);
    return this.members.get(id)?.isGuest === true;
  }

  absoluteUrl(path) {
    return /^https?:\/\//i.test(path) ? path : `${this.url}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  send(channelCode, content, opts) {
    return this.post(channelCode, { content }, opts);
  }

  // Sets Havoc's profile picture here. Haven saves it on upload; set-avatar
  // then shows it to everyone online without a reconnect. Failures carry a
  // `reason` fit for chat.
  async setAvatar(buffer, filename, mime) {
    if (!this.socket?.connected) throw refusal('not connected');
    const upload = async () => {
      const form = new FormData();
      form.append('avatar', new Blob([buffer], { type: mime }), filename);
      try {
        return await fetch(`${this.url}/api/upload-avatar`, { method: 'POST', headers: { Authorization: `Bearer ${this.token}` }, body: form });
      } catch (err) {
        throw Object.assign(refusal("couldn't reach the server"), { cause: err });
      }
    };
    let res = await upload();
    // The sign-in expired: sign in again and try once more.
    if (res.status === 401) {
      await this.login();
      res = await upload();
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw Object.assign(refusal(body.error || 'the server refused it'), { cause: `HTTP ${res.status}` });
    this.socket.emit('set-avatar', { url: body.url });
  }

  // Sets the status line under Havoc's name (empty clears it), staying
  // online. Haven answers with status-updated, or not at all when it refuses
  // the text (automod), so no answer within a few seconds is a failure.
  setStatus(statusText) {
    if (!this.socket?.connected) return Promise.reject(refusal('not connected'));
    return new Promise((resolve, reject) => {
      const done = (ok) => {
        clearTimeout(timer);
        this.off('status', onStatus);
        ok ? resolve() : reject(refusal("Haven didn't accept it (its automod may have blocked the text)"));
      };
      const onStatus = (s) => { if (s?.statusText === statusText) done(true); };
      const timer = setTimeout(() => done(false), 5000);
      this.on('status', onStatus);
      this.socket.emit('set-status', { status: 'online', statusText });
    });
  }

  // Uploads an image through the same endpoint the web app uses and
  // returns its /uploads/ path.
  async upload(buffer, filename, mime) {
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: mime }), filename);
    const res = await fetch(`${this.url}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw new Error(`Upload failed (${res.status}): ${body.error || 'no details'}`);
    return body.url;
  }

  // Posts an image the way the app does: the /uploads/ path as the message.
  async sendImage(channelCode, buffer, filename, mime, opts) {
    await this.post(channelCode, { content: await this.upload(buffer, filename, mime), isImage: true }, opts);
  }

  // Posts an image that's the same every time (`key` names it): uploaded
  // here once a day at most, then the same file is posted again, so repeats
  // cost no uploads or disk. `buffer()` makes it when it's needed.
  async sendImageOnce(channelCode, key, buffer, filename, mime, opts) {
    const known = this.uploaded.get(key);
    let url = known && Date.now() - known.at < UPLOAD_REUSE ? known.url : null;
    if (!url) {
      url = await this.upload(await buffer(), filename, mime);
      this.uploaded.set(key, { url, at: Date.now() });
    }
    await this.post(channelCode, { content: url, isImage: true }, opts);
  }
}
