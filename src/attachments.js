// Haven writes each attachment into the message text on its own line:
//   /uploads/abc.png                        a picture
//   spoiler-img:/uploads/abc.png            a spoilered picture
//   [file:name.zip](/uploads/abc.zip|2 MB)  any other file
const ATTACHMENT_RE = /^(?:spoiler-img:)?(\/uploads\/\S+)$|^\[file:[^\]]*\]\((\/uploads\/[^|)]+)(?:\|[^)]*)?\)$/;

// A message's attachment paths, and the rest of its text on one line.
export function attachmentsOf(content) {
  const paths = [];
  const text = [];
  for (const line of String(content || '').split('\n')) {
    const m = ATTACHMENT_RE.exec(line.trim());
    if (m) paths.push(m[1] || m[2]);
    else text.push(line);
  }
  return { paths, text: text.join(' ') };
}
