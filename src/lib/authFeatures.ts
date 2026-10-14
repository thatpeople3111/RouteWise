/** UI availability only; does not disable existing provider identities or sessions. */
export const AUTH_FEATURES = {
  google: true,
  // Preserved until Apple Developer and Supabase provider configuration/testing is complete.
  apple: false,
  emailPassword: true,
};
