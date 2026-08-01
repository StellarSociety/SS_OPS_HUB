export type SendAppEmailAttachment = {
  filename: string;
  /** Base64-encoded file contents. */
  content: string;
  content_type?: string;
  /**
   * Content-ID for inline images (omit angle brackets).
   * Reference in HTML as `cid:<content_id>`.
   */
  content_id?: string;
};

export type SendAppEmailParams = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  attachments?: SendAppEmailAttachment[];
  /** Overrides the configured from address when set. */
  fromOverride?: string;
};

export type SendAppEmailResult = {
  provider: string;
  imapAppended: boolean;
};
