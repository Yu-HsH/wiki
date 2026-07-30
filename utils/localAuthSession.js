export function isLocalGuestUser(user) {
  return Boolean(
    user?.isGuest === true &&
    user?.mode === "local" &&
    typeof user?.id === "string" &&
    user.id.startsWith("guest-")
  );
}

export function resolveAuthUserWithGuestFallback(
  authenticatedUser,
  localUser
) {
  if (authenticatedUser) return authenticatedUser;
  return isLocalGuestUser(localUser) ? localUser : null;
}
