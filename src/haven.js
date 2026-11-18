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
    // Display name (lowercased) and id → { id, name, avatar }, filled from
    // messages and member lists so commands can find someone's picture.
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

    this.socket.on('online-users', ({ channelCode, users }) => {
      for (const u of users || []) this.remember(u.id, u.username, u.avatar);
      this.emit('members', channelCode);
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

  remember(id, name, avatar) {
    if (id == null || !name) return;
    const entry = { id, name, avatar: avatar ?? this.members.get(id)?.avatar ?? null };
    this.members.set(id, entry);
    this.members.set(name.toLowerCase(), entry);
  }

  // Finds a member by display name. Anyone who has talked since Havoc
  // started is known already; otherwise the channel's member list is
  // fetched once and checked again.
  async findMember(channelCode, name) {
    const key = name.toLowerCase();
    if (this.members.has(key)) return this.members.get(key);
    await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); this.off('members', onMembers); resolve(); };
      const onMembers = (code) => { if (code === channelCode) done(); };
      const timer = setTimeout(done, 2000);
      this.on('members', onMembers);
      this.socket.emit('enter-channel', { code: channelCode });
    });
    return this.members.get(key) || null;
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
