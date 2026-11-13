export function catReviewerEmailForNumber(value: unknown): string {
  const number = typeof value === "number" ? String(value) : value;
  if (typeof number !== "string" || !/^[1-5]$/.test(number)) {
    throw new Error("专家登录号须为1–5");
  }
  // Supabase Auth requires an email, but reviewers do not need a mailbox.
  // .invalid is reserved and cannot accidentally deliver account mail.
  return `cat-reviewer-${number}@vibeclassroom.invalid`;
}

export function catReviewerCodeForNumber(value: unknown): string {
  catReviewerEmailForNumber(value);
  return `R0${value}`;
}
