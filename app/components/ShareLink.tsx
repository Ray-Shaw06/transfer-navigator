'use client';

import { useState } from 'react';

// The plan is entirely in the address bar, so sharing it is copying the URL.
// The button exists because nobody thinks to check whether a tool encodes its
// state in the link, and a plan worth showing a counselor is the whole point.
export function ShareLink() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused. The address bar still holds the plan,
      // so say that rather than claiming a copy that did not happen.
      setCopied(false);
      window.prompt('Copy this link to share your plan', window.location.href);
    }
  };

  return (
    <button type="button" className="linkish" onClick={copy}>
      {copied ? 'Link copied' : 'Copy link to this plan'}
    </button>
  );
}
