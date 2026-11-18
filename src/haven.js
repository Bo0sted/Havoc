// A minimal Haven client that signs in as an ordinary account, the same way
// the web app does: password login for a JWT, then a Socket.IO connection
// that joins every channel the account can read.
import { EventEmitter } from 'node:events';
import { io } from 'socket.io-client';

const EULA_VERSION = '2.0';

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
    // Codes of the server channels Havoc answers in (no DMs), and which of
    // them are forums.
    this.serverChannels = new Set();
    this.forumChannels = new Set();
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
      this.serverChannels = new Set(server.map((c) => c.code));
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
        if (m.loginName) this.members.set(m.loginName.toLowerCase(), this.members.get(m.id));
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

    // Replies inside a forum topic, or in a thread on an ordinary message.
    this.socket.on('new-thread-message', ({ channelCode, parentId, message }) => {
      if (!message || !parentId) return;
      this.incoming(channelCode, message, parentId);
    });
  }

  incoming(channelCode, message, threadId) {
    this.remember(message.user_id, message.username, message.avatar);
    if (message.user_id === this.user.id || message.is_webhook) return;
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
  post(channelCode, fields, { replyTo, threadId } = {}) {
    if (threadId) {
      this.socket.emit('send-thread-message', { parentId: threadId, silent: true, ...fields, ...(replyTo && { replyTo }) });
    } else {
      this.socket.emit('send-message', { code: channelCode, silent: true, ...fields, ...(replyTo && { replyTo }) });
    }
  }

  // avatar: undefined = not known yet, null = has none.
  remember(id, name, avatar, isGuest) {
    if (id == null || !name) return;
    const prev = this.members.get(id);
    const entry = { id, name, avatar: avatar !== undefined ? avatar : prev?.avatar, isGuest: isGuest ?? prev?.isGuest };
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
    return this.serverChannels.values().next().value;
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
    this.post(channelCode, { content }, opts);
  }

  // Uploads an image through the same endpoint the web app uses, then posts
  // it the way the app does: the /uploads/ path as the message.
  async sendImage(channelCode, buffer, filename, mime, opts) {
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: mime }), filename);
    const res = await fetch(`${this.url}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw new Error(`Upload failed (${res.status}): ${body.error || 'no details'}`);
    this.post(channelCode, { content: body.url, isImage: true }, opts);
  }
}
